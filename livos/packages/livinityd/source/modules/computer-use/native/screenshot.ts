/**
 * Native screenshot capture — port of Bytebot's bytebotd screen-capture strategy.
 *
 * Upstream reference (Apache 2.0):
 *   https://github.com/bytebot-ai/bytebot
 *   File: packages/bytebotd/src/nut/nut.service.ts
 *   Snapshot date: 2026-05-05
 *   API surface ported: screen.capture / screen.width / screen.height /
 *                       FileType.PNG from @nut-tree-fork/nut-js
 *
 * Strategy: capture PNG to temp file via nut-js, read into Buffer, base64-encode,
 * unlink the temp file. Returned shape carries width/height so MCP tool handlers
 * (Plan 72-native-05) can include resolution metadata when bridging the
 * `computer_screenshot` tool defined in `bytebot-tools.ts` (72-01).
 *
 * Apache 2.0 NOTICE: full license text mirrored at
 * `.planning/licenses/bytebot-LICENSE.txt` (file already present from
 * 72-01 / 72-02 attribution work).
 *
 * Architecture decisions (per .planning/phases/72-computer-use-agent-loop/72-CONTEXT.md):
 *   D-NATIVE-01 — Native X11 port (no Docker / no bytebotd daemon).
 *   D-NATIVE-05 — Function shape: returns {base64, width, height, mimeType}.
 *   D-NATIVE-12 — Sole new npm dep is @nut-tree-fork/nut-js@^4.2.6.
 *   D-NATIVE-14 — Platform guard: clear error if nut-js native binding fails
 *                 to load (e.g. running on Windows dev env without X server).
 *
 * Pure async function — no NestJS, no class wrapping, no DI. Bytebot upstream
 * uses a NestJS service; the IMPLEMENTATION STRATEGY (the nut-js calls) is
 * what we port, not the framework wrapping. See plan `<scope_guard>`.
 */
import {randomUUID} from 'node:crypto'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {readFile, unlink} from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

export interface ScreenshotResult {
	base64: string
	width: number
	height: number
	mimeType: 'image/png'
}

/**
 * Capture a PNG screenshot of the host X server.
 *
 * 2026-05-07 P79-05: Two-strategy chain — `maim` primary, `scrot` fallback.
 *
 * Diagnosis: live testing on Mini PC's GNOME Shell (Ubuntu 24.04, X11,
 * Mutter compositor) showed `scrot` returning 100% pure-black 6 KB PNGs
 * across both bruce and root contexts. `gnome-screenshot` couldn't reach
 * the Shell D-Bus interface (session was online but inactive) and its
 * X11 fallback path returned the same black frame. `ffmpeg -f x11grab`
 * (same XGetImage backend) also returned black. `ffmpeg -f kmsgrab`
 * failed with DRM_PRIME mapping errors on the Intel iGPU.
 *
 * The tool that worked: **`maim`** (5.7.4) — uses XCB directly with a
 * different XGetImage path than scrot's imlib2-based one. Returned a
 * proper 489 KB / >10000 unique-color PNG of the actual desktop. We make
 * it the primary strategy and keep scrot as a fallback for non-composited
 * environments or systems where maim is unavailable.
 *
 * 2026-05-05 P79-04: Switched from `@nut-tree-fork/nut-js` (libnut native
 * binding) to `scrot` subprocess. nut-js returned blank/white frames
 * inside the bytebot stdio child context even with correct
 * DISPLAY/XAUTHORITY env.
 *
 * Width/height parsed from PNG IHDR chunk header (bytes 16-23, big-endian
 * uint32 each) — avoids extra subprocess for xrandr.
 *
 * Returns: {base64, width, height, mimeType: 'image/png'}
 *
 * Throws clear errors when both strategies fail.
 */
export async function captureScreenshot(): Promise<ScreenshotResult> {
	const filename = randomUUID()
	const dir = tmpdir()
	const tempPath = join(dir, `${filename}.png`)

	let primaryError: string | null = null

	// Strategy 1: maim. XCB-based capture; works on composited GNOME Shell
	// (X11) where scrot's imlib2-based XGetImage returns black.
	try {
		await execFileAsync('maim', [tempPath], {
			env: process.env,
			timeout: 10_000,
		})
		const buffer = await readFile(tempPath)
		// Sanity guard: a real 1920×1080 desktop PNG is typically > 30 KB; an
		// all-black PNG of the same dimensions compresses to ~6 KB via RLE.
		// If maim somehow produced a uniform-pixel image, fall through to
		// scrot rather than returning a useless black frame.
		if (buffer.byteLength >= 10_000) {
			await safeUnlink(tempPath)
			return parsePngResult(buffer)
		}
		primaryError = `maim produced suspiciously small file (${buffer.byteLength} bytes — likely uniform pixels)`
	} catch (err: unknown) {
		primaryError = err instanceof Error ? err.message : String(err)
	}
	await safeUnlink(tempPath)

	// Strategy 2: scrot fallback. `-z` (silent), `-o` (overwrite). Honours
	// DISPLAY/XAUTHORITY env. Kept for environments where maim isn't
	// installed (older systems, minimal containers).
	try {
		await execFileAsync('scrot', ['-z', '-o', tempPath], {
			env: process.env,
			timeout: 10_000,
		})
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err)
		throw new Error(
			`Both screenshot strategies failed (DISPLAY=${process.env.DISPLAY ?? '<unset>'}). ` +
				`maim: ${primaryError}; scrot: ${message}`,
		)
	}

	try {
		const buffer = await readFile(tempPath)
		return parsePngResult(buffer)
	} finally {
		await safeUnlink(tempPath)
	}
}

/** Parse PNG IHDR width/height and wrap as ScreenshotResult. */
function parsePngResult(buffer: Buffer): ScreenshotResult {
	// PNG IHDR chunk: header = 8 bytes signature + 4 length + 4 type ('IHDR') + 4 width + 4 height
	// Bytes 16-19 = width (BE u32), bytes 20-23 = height (BE u32).
	const width = buffer.readUInt32BE(16)
	const height = buffer.readUInt32BE(20)
	return {
		base64: buffer.toString('base64'),
		width,
		height,
		mimeType: 'image/png',
	}
}

/** Best-effort temp-file cleanup. Swallows all errors — cleanup must never
 *  break the screenshot return value. */
async function safeUnlink(path: string): Promise<void> {
	try {
		await unlink(path)
	} catch {
		// Ignore. ENOENT is normal (strategy 1 may have already cleaned up,
		// or never created the file). Other errors here would just leak a
		// temp file — not worth crashing the screenshot path.
	}
}
