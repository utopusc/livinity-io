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

import {screen, FileType} from '@nut-tree-fork/nut-js'

export interface ScreenshotResult {
	base64: string
	width: number
	height: number
	mimeType: 'image/png'
}

/**
 * Capture a PNG screenshot of the host X server (display :0 on Mini PC).
 *
 * Returns:
 *   {base64, width, height, mimeType: 'image/png'}
 *
 * Throws:
 *   - With a clear platform-specific message if nut-js native bindings fail
 *     to load (e.g. on Windows dev env without X server) — D-NATIVE-14.
 *   - The original error if reading the captured PNG fails (after attempting
 *     to clean up the temp file).
 *   - Non-ENOENT errors during temp-file unlink (ENOENT is swallowed; other
 *     errors signal real bugs we want to surface).
 */
export async function captureScreenshot(): Promise<ScreenshotResult> {
	// Capture to a UUID-named temp file in the OS temp dir.
	// UUID prevents collisions across concurrent calls (T-72N1-01 mitigation).
	// nut-js' screen.capture(filename, format, dir) writes {dir}/{filename}.png
	// and returns the absolute path of the saved file.
	const filename = randomUUID()
	const dir = tmpdir()

	let savedPath: string
	try {
		savedPath = await screen.capture(filename, FileType.PNG, dir)
	} catch (err: unknown) {
		// Most common failure on dev: native libnut binding doesn't load on the
		// host platform. Re-wrap with a clearer error so callers (the MCP bridge
		// in 72-native-05) can surface a useful message to the user.
		const message = err instanceof Error ? err.message : String(err)
		throw new Error(
			`Native screenshot unavailable on platform: ${process.platform}. ` +
				`Bytebot computer-use requires Linux + X server (Mini PC). ` +
				`Underlying error: ${message}`,
		)
	}

	// nut-js' return-path quirk: depending on version it may or may not include
	// the dir prefix. Normalise by joining if it looks like a bare filename.
	const tempPath =
		typeof savedPath === 'string' && savedPath.length > 0 ? savedPath : join(dir, `${filename}.png`)

	try {
		const buffer = await readFile(tempPath)
		const [width, height] = await Promise.all([screen.width(), screen.height()])
		return {
			base64: buffer.toString('base64'),
			width,
			height,
			mimeType: 'image/png',
		}
	} finally {
		// Best-effort cleanup. Swallow ENOENT (already gone) but rethrow anything
		// else (EPERM, EACCES, etc.) — those signal real bugs we want to see.
		try {
			await unlink(tempPath)
		} catch (err: unknown) {
			if (
				err &&
				typeof err === 'object' &&
				'code' in err &&
				(err as {code: unknown}).code === 'ENOENT'
			) {
				// fine — file already gone (concurrent reaper, OS cleanup)
			} else {
				throw err
			}
		}
	}
}
