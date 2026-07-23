/**
 * Phase 93-03 — ffmpeg / gst-launch-1.0 argv builder.
 *
 * Pure functions that produce the encoder argv array given the streaming
 * mode (`desktop` | `window-crop` | `pipewire-fd`), source params (display,
 * geometry, PipeWire fd), VAAPI caps from `vaapi-probe.ts`, and tuning
 * knobs.
 *
 * Goal: one source of truth for encoder flags. The StreamManager (T93-05)
 * spawns the ChildProcess but doesn't construct argv strings inline.
 *
 * Locked decisions:
 *   D-93-02: low-latency MSE — `-fflags nobuffer -probesize 32
 *            -analyzeduration 0 -tune zerolatency` plus
 *            `-movflags +frag_keyframe+empty_moov+default_base_moof` for
 *            fragmented MP4. Default fragment 200ms.
 *            Phase 366 (VMENC-01) divergence: the `vm-rawvideo` mode drops the
 *            200 ms `-frag_duration` hold for `+frag_every_frame` (per-frame
 *            fragments), drops the probe flags (rawvideo never probes), and adds
 *            vm-scoped VAAPI knobs `-bf 0 -g 30 -async_depth 1`. The x11grab
 *            host modes keep the exact D-93-02 tail; only the input-flag
 *            PLACEMENT moved (before `-i`, where input options belong).
 *   D-93-03: VAAPI on Intel iGPU is preferred — `-c:v h264_vaapi
 *            -vaapi_device /dev/dri/renderD128 -vf hwupload,scale_vaapi=
 *            format=nv12`. Fallback `-c:v libx264 -preset ultrafast`.
 *   D-93-05: cursor visible — `-draw_mouse 1` (ffmpeg default; explicit).
 *
 * Window-crop branch uses `-grab_x N -grab_y N -video_size WxH -i :0.0`
 * (ffmpeg version on Mini PC rejects the `:0.0+X,Y` syntax — confirmed in
 * spike test E).
 */

import type {VaapiProbeResult} from './vaapi-probe.js'

export type StreamMode = 'desktop' | 'window-crop' | 'pipewire-fd' | 'vnc-window' | 'vm-rawvideo'

export type DesktopOpts = {
	mode: 'desktop'
	display: string // ":0.0"
	width: number
	height: number
	framerate?: number
}

export type WindowCropOpts = {
	mode: 'window-crop'
	display: string // ":0.0"
	geometry: {x: number; y: number; w: number; h: number}
	framerate?: number
}

export type PipewireFdOpts = {
	mode: 'pipewire-fd'
	pwNodeId: number
	fd: number // file descriptor passed to gst-launch via fdsrc fd=
	framerate?: number
}

/**
 * Phase 364 (VMENC-01): the VM-source mode. Frames arrive PRE-RENDERED as raw BGRA over
 * ffmpeg stdin (pipe:0) from the host-side RFB frame source (VmVncFrameSource) — there is
 * no x11grab/PipeWire capture. Unlike `vnc-window` (which never reaches ffmpeg), this mode
 * LEGITIMATELY flows through buildFfmpegArgs: only the input clause differs; the shared
 * low-latency tuning + VAAPI/libx264 encoder selection + fMP4 muxer tail are reused verbatim.
 */
export type VmRawvideoOpts = {
	mode: 'vm-rawvideo'
	width: number
	height: number
	framerate?: number
}

export type BuildArgsOpts = (DesktopOpts | WindowCropOpts | VmRawvideoOpts) & {
	caps: VaapiProbeResult
	zeroLatency?: boolean
	fragmentDurationMs?: number
}

const DEFAULT_FRAMERATE = 30
const DEFAULT_FRAGMENT_MS = 200
const VAAPI_DEVICE = '/dev/dri/renderD128'
/** Phase 366 (VMENC-01 latency): vm-rawvideo GOP length in frames — 1 s at 30 fps.
 *  ffmpeg's h264_vaapi default GOP is a wasteful 12; a 1 s GOP balances MSE
 *  join/recovery latency against bitrate. */
const VM_GOP_FRAMES = 30
/** Phase 366 (VMENC-01 latency): VAAPI submission-pipeline depth — "Decreasing
 *  async_depth will reduce latency" (ffmpeg h264_vaapi docs). 1 = minimal; inert
 *  if the driver lacks vaSyncBuffer. */
const VM_ASYNC_DEPTH = 1

/**
 * Build the ffmpeg argv for `desktop` and `window-crop` modes.
 * Returns the array of strings passed to `child_process.spawn('ffmpeg', argv)`.
 */
export function buildFfmpegArgs(opts: BuildArgsOpts): string[] {
	if ((opts as {mode?: string}).mode === 'vnc-window') {
		throw new Error(
			'encoder-args: vnc-window mode does not use ffmpeg — see stream-manager.ts vnc branch',
		)
	}
	const framerate = opts.framerate ?? DEFAULT_FRAMERATE
	const fragmentMs = opts.fragmentDurationMs ?? DEFAULT_FRAGMENT_MS
	const zeroLatency = opts.zeroLatency !== false // default on

	const args: string[] = []

	// ── Low-latency INPUT flags (D-93-02, placement fixed in Phase 366 / VMENC-01) ──
	// These are input-only options and MUST precede -i: ffmpeg binds options to the
	// NEXT file on the command line, so pushed after -i they became OUTPUT options —
	// fatal on modern ffmpeg ("Option probesize ... cannot be applied to output url",
	// research Pitfall 1). The probe flags are kept for the x11grab modes only; the
	// rawvideo demuxer never probes (fixed frame geometry), so the vm mode drops them.
	if (zeroLatency) {
		args.push('-fflags', 'nobuffer')
		if (opts.mode !== 'vm-rawvideo') {
			args.push('-probesize', '32')
			args.push('-analyzeduration', '0')
		}
	}

	if (opts.mode === 'vm-rawvideo') {
		// ── Source: rawvideo over stdin (Phase 364 / VMENC-01) ──
		// Frames arrive PRE-RENDERED as raw BGRA from the host RFB client (VmVncFrameSource)
		// on pipe:0 — no x11grab, and no -draw_mouse (the cursor is already baked into the
		// VNC framebuffer). BGRA matches vnc-rfb-client's 32bpp raw-decoder output byte order.
		args.push('-f', 'rawvideo')
		args.push('-pix_fmt', 'bgra')
		args.push('-video_size', `${opts.width}x${opts.height}`)
		args.push('-framerate', String(framerate))
		args.push('-i', 'pipe:0')
	} else {
		// ── Source: x11grab ──
		args.push('-f', 'x11grab')
		args.push('-framerate', String(framerate))
		args.push('-draw_mouse', '1') // D-93-05

		if (opts.mode === 'desktop') {
			args.push('-video_size', `${opts.width}x${opts.height}`)
			args.push('-i', opts.display)
		} else {
			// window-crop — explicit -grab_x / -grab_y. Spike test E proved that
			// the `:0.0+X,Y` shorthand rejects "Invalid argument" on Mini PC ffmpeg.
			args.push('-grab_x', String(opts.geometry.x))
			args.push('-grab_y', String(opts.geometry.y))
			args.push('-video_size', `${opts.geometry.w}x${opts.geometry.h}`)
			args.push('-i', opts.display)
		}
	}

	// ── Encoder selection (D-93-03) ──
	if (opts.caps.vaapi) {
		args.push('-vaapi_device', VAAPI_DEVICE)
		args.push('-vf', 'hwupload,scale_vaapi=format=nv12')
		args.push('-c:v', 'h264_vaapi')
		// h264_vaapi has no `-preset` — quality knob is `-qp` instead. Default
		// 23 (visually transparent) is fine for screen capture.
		args.push('-qp', '23')
		// Phase 366 (VMENC-01 latency): vm-scoped VAAPI low-latency knobs. Scoped so the
		// desktop/window-crop VAAPI argv stays byte-identical. No `-tune zerolatency`
		// here — that flag is libx264-private (research Pitfall 3); the h264_vaapi
		// equivalents are exactly these.
		if (opts.mode === 'vm-rawvideo') {
			args.push('-bf', '0') // no B-frame reorder delay; deterministic across drivers
			args.push('-g', String(VM_GOP_FRAMES))
			args.push('-async_depth', String(VM_ASYNC_DEPTH))
		}
	} else {
		args.push('-c:v', 'libx264')
		args.push('-preset', 'ultrafast')
		if (zeroLatency) args.push('-tune', 'zerolatency')
	}

	// ── fMP4 muxer (D-93-02; vm tail retuned in Phase 366 / VMENC-01) ──
	if (opts.mode === 'vm-rawvideo') {
		// Per-frame fragments: a frame leaves the muxer the instant it is encoded
		// instead of being held up to 200 ms by -frag_duration — the single biggest
		// 366 latency win. `fragmentDurationMs` is intentionally ignored on this
		// branch (frag_every_frame supersedes it). -flush_packets 1 pushes each
		// fragment to pipe:1 immediately; no -reset_timestamps (nothing to renumber
		// on a single continuous stdin stream).
		args.push('-f', 'mp4')
		args.push(
			'-movflags',
			'+frag_every_frame+empty_moov+default_base_moof+separate_moof',
		)
		args.push('-flush_packets', '1')
	} else {
		// Host x11grab modes keep the EXACT pre-366 tail verbatim (host-app cleanup
		// deliberately deferred — research Open Question 1).
		args.push('-f', 'mp4')
		args.push(
			'-movflags',
			'+frag_keyframe+empty_moov+default_base_moof+separate_moof',
		)
		args.push('-frag_duration', String(fragmentMs * 1000)) // microseconds
		args.push('-reset_timestamps', '1')
	}

	// stdout sink
	args.push('pipe:1')

	return args
}

/**
 * Build the gst-launch-1.0 argv for `pipewire-fd` mode (D-93-04).
 *
 * Pipeline:
 *   fdsrc fd=N ! pipewiresrc ! videoconvert ! x264enc tune=zerolatency
 *     speed-preset=ultrafast ! mp4mux fragment-duration=200 streamable=true
 *     ! fdsink fd=1
 *
 * The PipeWire node ID arrives via the dbus-next portal handshake
 * (T93-08). We expose it to gst via the `path=N` property on `pipewiresrc`.
 */
export function buildGstWindowArgs(opts: PipewireFdOpts): string[] {
	if ((opts as {mode?: string}).mode === 'vnc-window') {
		throw new Error(
			'encoder-args: vnc-window mode does not use gst — see stream-manager.ts vnc branch',
		)
	}
	const framerate = opts.framerate ?? DEFAULT_FRAMERATE
	return [
		'-q', // quiet — suppresses gstreamer's own progress chatter
		'fdsrc',
		`fd=${opts.fd}`,
		'!',
		'pipewiresrc',
		`path=${opts.pwNodeId}`,
		'do-timestamp=true',
		'!',
		'videorate',
		'!',
		`video/x-raw,framerate=${framerate}/1`,
		'!',
		'videoconvert',
		'!',
		'x264enc',
		'tune=zerolatency',
		'speed-preset=ultrafast',
		'key-int-max=30',
		'!',
		'mp4mux',
		`fragment-duration=${DEFAULT_FRAGMENT_MS}`,
		'streamable=true',
		'!',
		'fdsink',
		'fd=1',
	]
}
