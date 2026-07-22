/**
 * Phase 93-03 — encoder-args unit tests.
 *
 * Coverage:
 *   1. desktop mode + libx264 (no VAAPI) — full flag set
 *   2. desktop mode + h264_vaapi
 *   3. window-crop + libx264 — uses -grab_x / -grab_y (NOT +X,Y)
 *   4. window-crop + h264_vaapi
 *   5. zeroLatency=false → omits nobuffer/probesize/tune
 *   6. fragment duration override is honoured
 *   7. cursor visible (D-93-05) — `-draw_mouse 1` always present
 *   8. snapshot of one full argv to lock the wire format
 *   9. pipewire-fd mode → gst-launch argv contains pipewiresrc + path=N + fdsink
 */

import {describe, it, expect} from 'vitest'
import {buildFfmpegArgs, buildGstWindowArgs} from './encoder-args.js'
import type {VaapiProbeResult} from './vaapi-probe.js'

const NO_VAAPI: VaapiProbeResult = {vaapi: false, profiles: []}
const HAS_VAAPI: VaapiProbeResult = {
	vaapi: true,
	profiles: ['VAProfileH264High'],
}

describe('encoder-args.buildFfmpegArgs', () => {
	it('Test 1: desktop + libx264 produces full MSE-tuned argv', () => {
		const argv = buildFfmpegArgs({
			mode: 'desktop',
			display: ':0.0',
			width: 1920,
			height: 1080,
			caps: NO_VAAPI,
		})
		expect(argv).toContain('-f')
		expect(argv).toContain('x11grab')
		expect(argv).toContain('-framerate')
		expect(argv).toContain('30')
		expect(argv).toContain('-draw_mouse')
		expect(argv).toContain('1')
		expect(argv).toContain('-video_size')
		expect(argv).toContain('1920x1080')
		expect(argv).toContain('-i')
		expect(argv).toContain(':0.0')
		// MSE tuning
		expect(argv).toContain('-fflags')
		expect(argv).toContain('nobuffer')
		expect(argv).toContain('-probesize')
		expect(argv).toContain('32')
		expect(argv).toContain('-analyzeduration')
		expect(argv).toContain('0')
		expect(argv).toContain('-tune')
		expect(argv).toContain('zerolatency')
		// libx264
		expect(argv).toContain('-c:v')
		expect(argv).toContain('libx264')
		expect(argv).toContain('-preset')
		expect(argv).toContain('ultrafast')
		// fMP4
		expect(argv).toContain('-movflags')
		expect(argv).toContain('+frag_keyframe+empty_moov+default_base_moof+separate_moof')
		expect(argv[argv.length - 1]).toBe('pipe:1')
	})

	it('Test 2: desktop + VAAPI swaps libx264 for h264_vaapi', () => {
		const argv = buildFfmpegArgs({
			mode: 'desktop',
			display: ':0.0',
			width: 1920,
			height: 1080,
			caps: HAS_VAAPI,
		})
		expect(argv).toContain('h264_vaapi')
		expect(argv).toContain('-vaapi_device')
		expect(argv).toContain('/dev/dri/renderD128')
		expect(argv).toContain('-vf')
		expect(argv).toContain('hwupload,scale_vaapi=format=nv12')
		expect(argv).not.toContain('libx264')
		// h264_vaapi has no -preset (uses -qp)
		expect(argv).not.toContain('ultrafast')
	})

	it('Test 3: window-crop + libx264 uses -grab_x / -grab_y (NOT +X,Y)', () => {
		const argv = buildFfmpegArgs({
			mode: 'window-crop',
			display: ':0.0',
			geometry: {x: 100, y: 200, w: 800, h: 600},
			caps: NO_VAAPI,
		})
		expect(argv).toContain('-grab_x')
		expect(argv).toContain('100')
		expect(argv).toContain('-grab_y')
		expect(argv).toContain('200')
		expect(argv).toContain('-video_size')
		expect(argv).toContain('800x600')
		// Must NOT contain the broken `:0.0+X,Y` shorthand
		expect(argv.join(' ')).not.toContain('+100,200')
		expect(argv.join(' ')).not.toContain('+X,Y')
	})

	it('Test 4: window-crop + VAAPI', () => {
		const argv = buildFfmpegArgs({
			mode: 'window-crop',
			display: ':0.0',
			geometry: {x: 50, y: 75, w: 1024, h: 768},
			caps: HAS_VAAPI,
		})
		expect(argv).toContain('h264_vaapi')
		expect(argv).toContain('-grab_x')
		expect(argv).toContain('50')
		expect(argv).toContain('1024x768')
	})

	it('Test 5: zeroLatency=false omits the low-latency tuning flags', () => {
		const argv = buildFfmpegArgs({
			mode: 'desktop',
			display: ':0.0',
			width: 1920,
			height: 1080,
			caps: NO_VAAPI,
			zeroLatency: false,
		})
		expect(argv).not.toContain('nobuffer')
		expect(argv).not.toContain('-probesize')
		expect(argv).not.toContain('-analyzeduration')
		// libx264 also drops -tune zerolatency when zeroLatency is off
		expect(argv).not.toContain('zerolatency')
	})

	it('Test 6: fragmentDurationMs override flows through to -frag_duration (microseconds)', () => {
		const argv = buildFfmpegArgs({
			mode: 'desktop',
			display: ':0.0',
			width: 1920,
			height: 1080,
			caps: NO_VAAPI,
			fragmentDurationMs: 500,
		})
		expect(argv).toContain('-frag_duration')
		// 500 ms → 500_000 µs
		expect(argv).toContain('500000')
	})

	it('Test 7: -draw_mouse 1 is always present (D-93-05)', () => {
		const argv1 = buildFfmpegArgs({
			mode: 'desktop',
			display: ':0.0',
			width: 1280,
			height: 720,
			caps: NO_VAAPI,
		})
		const argv2 = buildFfmpegArgs({
			mode: 'window-crop',
			display: ':0.0',
			geometry: {x: 0, y: 0, w: 100, h: 100},
			caps: HAS_VAAPI,
		})
		expect(argv1).toContain('-draw_mouse')
		expect(argv2).toContain('-draw_mouse')
	})

	// ── Phase 364 (VMENC-01): the additive 'vm-rawvideo' input branch ──────────────────
	it('Test V1: vm-rawvideo + VAAPI feeds pipe:0 rawvideo/bgra into the SHARED VAAPI+fMP4 tail', () => {
		const argv = buildFfmpegArgs({
			mode: 'vm-rawvideo',
			width: 1280,
			height: 720,
			caps: HAS_VAAPI,
		})
		// Source clause: rawvideo/bgra over stdin, NOT x11grab.
		expect(argv).toContain('-f')
		expect(argv).toContain('rawvideo')
		expect(argv).toContain('-pix_fmt')
		expect(argv).toContain('bgra')
		expect(argv).toContain('-video_size')
		expect(argv).toContain('1280x720')
		expect(argv).toContain('-i')
		expect(argv).toContain('pipe:0')
		// The x11grab source + its cursor flag are ABSENT (the VNC framebuffer has the cursor).
		expect(argv).not.toContain('x11grab')
		expect(argv).not.toContain('-draw_mouse')
		// The SHARED VAAPI encoder clause is reused verbatim.
		expect(argv).toContain('h264_vaapi')
		expect(argv).toContain('-vaapi_device')
		expect(argv).toContain('/dev/dri/renderD128')
		expect(argv).toContain('hwupload,scale_vaapi=format=nv12')
		// The SHARED fMP4 muxer tail is reused verbatim, sinking to pipe:1.
		expect(argv).toContain('-movflags')
		expect(argv).toContain('+frag_keyframe+empty_moov+default_base_moof+separate_moof')
		expect(argv[argv.length - 1]).toBe('pipe:1')
	})

	it('Test V2: vm-rawvideo WITHOUT VAAPI reuses the libx264 fallback branch verbatim', () => {
		const argv = buildFfmpegArgs({
			mode: 'vm-rawvideo',
			width: 1920,
			height: 1080,
			caps: NO_VAAPI,
		})
		expect(argv).toContain('rawvideo')
		expect(argv).toContain('pipe:0')
		// The reused libx264 branch (same as desktop/window-crop).
		expect(argv).toContain('-c:v')
		expect(argv).toContain('libx264')
		expect(argv).toContain('-preset')
		expect(argv).toContain('ultrafast')
		expect(argv).not.toContain('h264_vaapi')
	})

	it('Test V3: vm-rawvideo NEVER throws (contrast: vnc-window still throws)', () => {
		expect(() =>
			buildFfmpegArgs({mode: 'vm-rawvideo', width: 800, height: 600, caps: HAS_VAAPI}),
		).not.toThrow()
		// vnc-window remains refused — it never reaches ffmpeg (stream-manager vnc branch).
		expect(() =>
			buildFfmpegArgs({mode: 'vnc-window'} as unknown as Parameters<typeof buildFfmpegArgs>[0]),
		).toThrow(/vnc-window/)
	})

	it('Test 8: snapshot — desktop + libx264 wire format is locked', () => {
		const argv = buildFfmpegArgs({
			mode: 'desktop',
			display: ':0.0',
			width: 1920,
			height: 1080,
			framerate: 30,
			caps: NO_VAAPI,
			fragmentDurationMs: 200,
		})
		// Lock the exact ordering. Drift means D-93-02 changed → re-review
		// the latency tuning before bumping the snapshot.
		expect(argv).toEqual([
			'-f',
			'x11grab',
			'-framerate',
			'30',
			'-draw_mouse',
			'1',
			'-video_size',
			'1920x1080',
			'-i',
			':0.0',
			'-fflags',
			'nobuffer',
			'-probesize',
			'32',
			'-analyzeduration',
			'0',
			'-c:v',
			'libx264',
			'-preset',
			'ultrafast',
			'-tune',
			'zerolatency',
			'-f',
			'mp4',
			'-movflags',
			'+frag_keyframe+empty_moov+default_base_moof+separate_moof',
			'-frag_duration',
			'200000',
			'-reset_timestamps',
			'1',
			'pipe:1',
		])
	})
})

describe('encoder-args.buildGstWindowArgs', () => {
	it('Test 9: pipewire-fd argv contains pipewiresrc, path=<nodeId>, mp4mux, fdsink', () => {
		const argv = buildGstWindowArgs({
			mode: 'pipewire-fd',
			pwNodeId: 42,
			fd: 7,
		})
		expect(argv).toContain('fdsrc')
		expect(argv).toContain('fd=7')
		expect(argv).toContain('pipewiresrc')
		expect(argv).toContain('path=42')
		expect(argv).toContain('videoconvert')
		expect(argv).toContain('x264enc')
		expect(argv).toContain('tune=zerolatency')
		expect(argv).toContain('mp4mux')
		expect(argv).toContain('fragment-duration=200')
		expect(argv).toContain('streamable=true')
		expect(argv).toContain('fdsink')
		expect(argv).toContain('fd=1')
	})

	it('Test 10: framerate override flows through to gst caps filter', () => {
		const argv = buildGstWindowArgs({
			mode: 'pipewire-fd',
			pwNodeId: 1,
			fd: 3,
			framerate: 60,
		})
		expect(argv).toContain('video/x-raw,framerate=60/1')
	})
})
