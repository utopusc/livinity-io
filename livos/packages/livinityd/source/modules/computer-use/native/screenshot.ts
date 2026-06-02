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
 * `computer_screenshot` tool defined in `luse-tools.ts` (72-01).
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
	mimeType: 'image/png' | 'image/jpeg'
}

/**
 * 208-11 (computer-use perf): env-driven JPEG + downscale to slash agent
 * context cost. PNG 1920x1080 from maim is ~150-200KB base64; JPEG q60 at
 * 1280px wide is ~25-40KB (5-8× reduction) — still legible by Claude vision.
 *
 *   LUSE_SCREENSHOT_FORMAT  png | jpeg   (default: jpeg)
 *   LUSE_SCREENSHOT_QUALITY 1-100         (default: 60 — sharp jpeg quality)
 *   LUSE_SCREENSHOT_MAX_DIM N pixels      (default: 1280 — max width OR height)
 *
 * Set LUSE_SCREENSHOT_FORMAT=png + LUSE_SCREENSHOT_MAX_DIM=0 to disable
 * (preserves the pre-208-11 raw maim output for OCR-heavy flows).
 */
const SCREENSHOT_FORMAT: 'png' | 'jpeg' =
	process.env.LUSE_SCREENSHOT_FORMAT === 'png' ? 'png' : 'jpeg'
const SCREENSHOT_QUALITY: number = (() => {
	const n = parseInt(process.env.LUSE_SCREENSHOT_QUALITY ?? '60', 10)
	return Number.isFinite(n) && n >= 1 && n <= 100 ? n : 60
})()
// 208-11b — default to 0 (no downscale). Downscaling shifts the coordinate
// frame the agent sees (1280×720 view) vs the X11 frame the click handler
// targets (1920×1080), and clicks land at scaled-down coords if we don't
// rescale x/y by (rawWidth / SCREENSHOT_MAX_DIM) at the click site.
// Coord-rescale is a follow-up plan; until then keep MAX_DIM=0 by default
// so JPEG q60 alone delivers ~3× size cut without coord drift.
const SCREENSHOT_MAX_DIM: number = (() => {
	const n = parseInt(process.env.LUSE_SCREENSHOT_MAX_DIM ?? '0', 10)
	return Number.isFinite(n) && n >= 0 ? n : 0
})()

/**
 * Optional capture options.
 *
 * 2026-05-08 P97-01 — `windowId` enables per-WebApp window-scoped captures.
 *
 * When `windowId` is set we route through `maim -i <wid> <path>`, which uses
 * XCB to capture the geometry of the X11 window with that id rather than the
 * whole root display. xdotool / wmctrl can be used to discover wids; this
 * function is the consumer side, not the discovery side.
 *
 * Failure mode (P79 verified): `maim -i <wid>` on Mutter-composited windows
 * can return uniform-pixel (all black) frames if the window is occluded /
 * unmapped / minimized when the snapshot fires. Empirically rare on the Mini
 * PC's GNOME Shell when the target window is mapped + visible, but possible.
 * On size sanity-check failure we fall back to a host-display capture and
 * surface the windowId in the error/log context so the caller can diagnose.
 */
export interface CaptureScreenshotOptions {
	/**
	 * X11 window id to scope the capture to. When undefined, captures the full
	 * host display (existing pre-P97 behavior — the default branch).
	 */
	windowId?: number
	/**
	 * 2026-06-02 P255-02 — NEW: subprocess-scoped DISPLAY, no global
	 * process.env mutation. When set, the DISPLAY env var is threaded into the
	 * maim/scrot subprocess `env` ONLY (not `process.env`), so the ~2s
	 * displays-popover thumbnail polls stay concurrency-safe — two concurrent
	 * captures of different displays cannot cross-contaminate via a shared
	 * global (threat_model T-255-04, Pitfall 1). Validated `:N`/`:N.M` at the
	 * tRPC zod boundary before reaching here. When undefined, the existing
	 * `env: process.env` behavior is preserved byte-for-byte.
	 */
	display?: string
}

/**
 * Capture a PNG screenshot of the host X server, or of a specific X11 window
 * when `options.windowId` is provided.
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
export async function captureScreenshot(options?: CaptureScreenshotOptions): Promise<ScreenshotResult> {
	const filename = randomUUID()
	const dir = tmpdir()
	const tempPath = join(dir, `${filename}.png`)
	const windowId = options?.windowId

	// P255-02 — subprocess-scoped DISPLAY override. When options.display is set
	// we hand maim/scrot a SHALLOW COPY of process.env with DISPLAY overridden;
	// process.env itself is never mutated, so concurrent ~2s thumbnail polls of
	// different displays cannot race on a shared global (T-255-04, Pitfall 1).
	// When absent, we pass the live process.env reference exactly as before.
	const subprocessEnv: NodeJS.ProcessEnv = options?.display
		? {...process.env, DISPLAY: options.display}
		: process.env

	let primaryError: string | null = null

	// Build maim argv. Window-scoped path: `maim -i 0x<hex> <path>`. Default
	// (host-display) path: `maim <path>` — unchanged pre-P97 behavior.
	//
	// 2026-05-10 P100-09-01: hex form (`0x<hex>`) is the canonical X11 wid
	// representation across the LivOS codebase (see streaming/vnc-bridge.ts:61
	// `widHex = '0x' + opts.wid.toString(16)`, xdotool wid args throughout
	// input.ts, all _NET_WM_* property reads). Empirical fix for the
	// 100-08 deploy live-test bug where Luse's computer_screenshot tool
	// returned full Xvfb :1 (1920x1080) despite LUSE_TARGET_WINDOW_ID
	// being correctly set: `maim -i <decimal>` silently degraded to root
	// capture on Ubuntu 24.04 maim 5.7.4 (decimal-vs-hex parsing
	// inconsistency). Hex form parses unambiguously.
	const widHex = typeof windowId === 'number' ? '0x' + windowId.toString(16) : null
	const maimArgs = widHex !== null ? ['-i', widHex, tempPath] : [tempPath]

	// Strategy 1: maim. XCB-based capture; works on composited GNOME Shell
	// (X11) where scrot's imlib2-based XGetImage returns black.
	try {
		await execFileAsync('maim', maimArgs, {
			env: subprocessEnv,
			timeout: 10_000,
		})
		const buffer = await readFile(tempPath)
		// Sanity guard: a real 1920×1080 desktop PNG is typically > 30 KB; an
		// all-black PNG of the same dimensions compresses to ~6 KB via RLE.
		// If maim somehow produced a uniform-pixel image, fall through to
		// scrot rather than returning a useless black frame.
		//
		// P97-01: per-window captures are smaller (e.g. a 1024x768 Chrome
		// window). Use a smaller threshold when windowId is set so legitimate
		// small-window captures aren't flagged as black. 2 KB still excludes
		// the 6 KB all-black case for tiny windows because uniform pixels
		// compress almost identically regardless of dimensions, but a real
		// rendered window has enough entropy to easily exceed 2 KB.
		const blackThreshold = typeof windowId === 'number' ? 2_000 : 10_000
		if (buffer.byteLength >= blackThreshold) {
			await safeUnlink(tempPath)
			return parsePngResult(buffer)
		}
		primaryError = `maim produced suspiciously small file (${buffer.byteLength} bytes — likely uniform pixels${
			widHex !== null ? `; windowId=${widHex} may be occluded/minimized` : ''
		})`
	} catch (err: unknown) {
		const baseMessage = err instanceof Error ? err.message : String(err)
		primaryError =
			widHex !== null ? `${baseMessage} (windowId=${widHex})` : baseMessage
	}
	await safeUnlink(tempPath)

	// Strategy 2: scrot fallback. `-z` (silent), `-o` (overwrite). Honours
	// DISPLAY/XAUTHORITY env. Kept for environments where maim isn't
	// installed (older systems, minimal containers).
	//
	// P97-01: scrot has no documented per-window capture flag matching
	// `maim -i <wid>` semantics. When the windowed maim path fails we
	// degrade to host-display capture rather than no capture; the caller
	// gets the wider context plus a windowId-tagged error message.
	try {
		await execFileAsync('scrot', ['-z', '-o', tempPath], {
			env: subprocessEnv,
			timeout: 10_000,
		})
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err)
		const wContext = widHex !== null ? ` windowId=${widHex}.` : ''
		throw new Error(
			`Both screenshot strategies failed (DISPLAY=${process.env.DISPLAY ?? '<unset>'}).${wContext} ` +
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

/** Parse PNG IHDR width/height and wrap as ScreenshotResult.
 *  208-11: optionally downscale + transcode to JPEG via sharp. Env-gated. */
async function parsePngResult(buffer: Buffer): Promise<ScreenshotResult> {
	// PNG IHDR — bytes 16-19 width BE u32, bytes 20-23 height BE u32.
	const rawWidth = buffer.readUInt32BE(16)
	const rawHeight = buffer.readUInt32BE(20)

	// Fast path: original PNG passthrough when format=png AND no downscale.
	if (SCREENSHOT_FORMAT === 'png' && SCREENSHOT_MAX_DIM === 0) {
		return {base64: buffer.toString('base64'), width: rawWidth, height: rawHeight, mimeType: 'image/png'}
	}

	// 208-11: sharp pipeline. Optional resize, optional JPEG transcode.
	// Lazy import keeps the screenshot module loadable in test envs that
	// haven't installed sharp's native binary.
	const {default: sharp} = await import('sharp')
	let pipeline = sharp(buffer)
	const needsResize =
		SCREENSHOT_MAX_DIM > 0 && Math.max(rawWidth, rawHeight) > SCREENSHOT_MAX_DIM
	if (needsResize) {
		pipeline = pipeline.resize({
			width: rawWidth >= rawHeight ? SCREENSHOT_MAX_DIM : undefined,
			height: rawHeight > rawWidth ? SCREENSHOT_MAX_DIM : undefined,
			fit: 'inside',
			withoutEnlargement: true,
		})
	}
	if (SCREENSHOT_FORMAT === 'jpeg') {
		pipeline = pipeline.jpeg({quality: SCREENSHOT_QUALITY, progressive: false, mozjpeg: false})
	}
	const out = await pipeline.toBuffer({resolveWithObject: true})
	return {
		base64: out.data.toString('base64'),
		width: out.info.width,
		height: out.info.height,
		mimeType: SCREENSHOT_FORMAT === 'jpeg' ? 'image/jpeg' : 'image/png',
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
