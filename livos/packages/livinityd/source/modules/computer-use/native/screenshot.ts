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
 * 2026-05-05 P79-04: Switched from `@nut-tree-fork/nut-js` (libnut native
 * binding) to `scrot` subprocess. Live test on Mini PC showed nut-js
 * returning blank/white frames inside the bytebot stdio child context,
 * even with correct DISPLAY/XAUTHORITY env. scrot reliably captures the
 * real X11 framebuffer with the same env. Cost: ~30-50ms subprocess fork
 * vs nut-js's in-process. Acceptable for screenshot tool latency.
 *
 * Width/height parsed from PNG IHDR chunk header (bytes 16-23, big-endian
 * uint32 each) — avoids extra subprocess for xrandr.
 *
 * Returns: {base64, width, height, mimeType: 'image/png'}
 *
 * Throws clear errors when scrot is missing or DISPLAY unreachable.
 */
export async function captureScreenshot(): Promise<ScreenshotResult> {
	const filename = randomUUID()
	const dir = tmpdir()
	const tempPath = join(dir, `${filename}.png`)

	try {
		// `-z` (silent), `-o` (overwrite). Honours DISPLAY/XAUTHORITY env.
		await execFileAsync('scrot', ['-z', '-o', tempPath], {
			env: process.env,
			timeout: 10_000,
		})
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err)
		throw new Error(
			`scrot screenshot failed (DISPLAY=${process.env.DISPLAY ?? '<unset>'}): ${message}`,
		)
	}

	try {
		const buffer = await readFile(tempPath)
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
	} finally {
		// Best-effort cleanup. Swallow ENOENT; rethrow real errors.
		try {
			await unlink(tempPath)
		} catch (err: unknown) {
			if (
				err &&
				typeof err === 'object' &&
				'code' in err &&
				(err as {code: unknown}).code === 'ENOENT'
			) {
				// fine — file already gone
			} else {
				throw err
			}
		}
	}
}
