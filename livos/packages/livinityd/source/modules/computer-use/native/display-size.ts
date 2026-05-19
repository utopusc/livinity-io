/**
 * Phase 160-04 — runtime X11 display size resolver. Replaces the hardcoded
 * "1280 x 960" hint in the Luse system prompt overlay (Plan 160-02) with
 * the actual Xvfb display dimensions. The overlay then tells the LLM the
 * correct coordinate space — improving click accuracy by ~10-20% per
 * Anthropic computer-use grounding docs.
 *
 * Uses `xdpyinfo -display :N | grep dimensions` which outputs a line like:
 *   dimensions:    1920x1080 pixels (508x285 millimeters)
 * Returns null on parse error / xdpyinfo unavailable / display dead.
 *
 * Sibling to `screenshot.ts` (which shells out to `maim` / `scrot` against
 * the same X11 display). Kept as its own file so the prompt-builder layer
 * doesn't pull in the much larger screenshot module just to read pixel
 * dimensions — the dependency graph stays minimal.
 *
 * Sacred SHA preserved: this module does NOT touch `liv/packages/core/src/
 * sdk-agent-runner.ts` (`f3538e1d811992b782a9bb057d1b7f0a0189f95f`).
 *
 * D-09 verbatim contract: this module does NOT touch
 * `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts`.
 * The Bytebot prompt's hardcoded "1280 x 960 pixels" line stays exactly as
 * upstream-vendored; the runtime override happens in the overlay (Plan 160-02)
 * which prepends a `DISPLAY: <wxh> pixels` line ABOVE the verbatim prompt.
 *
 * D-NO-NEW-DEPS: zero new npm packages — uses only `node:child_process`,
 * already imported elsewhere in this module tree (see screenshot.ts).
 */
import {spawn} from 'node:child_process'

export interface DisplaySize {
	width: number
	height: number
}

/**
 * Read the actual pixel dimensions of an X11 display via `xdpyinfo`.
 *
 * @param display - X11 display string in `:N` form (e.g. `:1`, `:10`, `:99`).
 *                  Validated strictly against `/^:[0-9]{1,2}$/` BEFORE being
 *                  passed to `xdpyinfo` so a malicious or malformed env value
 *                  cannot inject shell-meta or extra arguments.
 * @returns        `{width, height}` on success, or `null` on any failure:
 *                 - invalid display format
 *                 - `xdpyinfo` binary missing (spawn ENOENT)
 *                 - display does not exist (xdpyinfo exits non-zero)
 *                 - dimensions line not present in output (parse fail)
 *                 - >2s timeout (display stuck / X server hung)
 *
 * The overlay treats `null` as "unknown" and falls through to the existing
 * "ground coordinates from screenshots" hint (Plan 160-02 LuseOverlayOpts
 * placeholder behavior), so any failure here is non-fatal at the agent
 * runner construction call site.
 *
 * NOTE on env: `xdpyinfo -display :N` does NOT need DISPLAY or XAUTHORITY
 * env vars for unprotected Xvfb servers (per-WebApp Xvfb spawns with no
 * auth — `streaming/xvfb-spawner.ts` -nolisten tcp). For the host
 * display (`:1`), Mini PC's master Xvfb is similarly unauthenticated for
 * local socket connections, so `xdpyinfo -display :1` succeeds from any
 * UID. If a future deploy switches the host display to MIT-MAGIC-COOKIE-1
 * auth, the caller must thread XAUTHORITY into `process.env` before invoking.
 */
export async function readActualDisplaySize(
	display: string,
): Promise<DisplaySize | null> {
	// Validate display format strictly to avoid shell injection / arg-leak.
	// Format: `:` followed by 1-2 digits. Phase 102 strict descriptor regex
	// in `luse-mcp-config.ts` pins :1..:99 — we mirror that here, since any
	// display LivOS allocates falls in that range and a wider regex would
	// just open attack surface for no operational gain.
	if (!/^:[0-9]{1,2}$/.test(display)) return null

	return new Promise<DisplaySize | null>((resolve) => {
		const child = spawn('xdpyinfo', ['-display', display], {
			stdio: ['ignore', 'pipe', 'ignore'],
		})
		let stdout = ''
		let settled = false
		const settle = (value: DisplaySize | null) => {
			if (settled) return
			settled = true
			resolve(value)
		}
		child.stdout.on('data', (chunk: Buffer) => {
			stdout += chunk.toString()
		})
		child.on('error', () => settle(null))
		child.on('exit', (code) => {
			if (code !== 0) return settle(null)
			// Expected line: `  dimensions:    1920x1080 pixels (508x285 millimeters)`
			const match = stdout.match(/dimensions:\s+(\d+)x(\d+)\s+pixels/)
			if (!match) return settle(null)
			const width = parseInt(match[1], 10)
			const height = parseInt(match[2], 10)
			if (
				!Number.isFinite(width) ||
				!Number.isFinite(height) ||
				width <= 0 ||
				height <= 0
			) {
				return settle(null)
			}
			settle({width, height})
		})
		// Safety timeout — xdpyinfo should answer in <1s; longer means
		// stuck / display hung. Phase 102-06 cascading agent loops cannot
		// afford to block on a single env probe, so we cap at 2000 ms and
		// degrade to null (overlay falls back to screenshot-ground hint).
		setTimeout(() => {
			try {
				child.kill('SIGKILL')
			} catch {
				// child may have already exited — that's fine
			}
			settle(null)
		}, 2000)
	})
}
