/**
 * Phase 93-09 — Geometry-tracker fallback for per-window streaming.
 *
 * Used when the PipeWire portal (T93-08) is unavailable (D-93-04 path J
 * fallback). Polls `xdotool getwindowgeometry --shell <wid>` every 200ms
 * and emits a `'change'` event when the window moves or resizes by more
 * than `driftThreshold` pixels. The Window Manager (T93-10) listens and
 * respawns the ffmpeg encoder with new -grab_x / -grab_y / -video_size.
 *
 * Also emits `'window-gone'` when `isWindowAlive(wid)` returns false; the
 * tracker then auto-stops.
 *
 * GA-93-04: respawning ffmpeg on every window move costs ~300ms freeze.
 * Acceptable for the fallback (PipeWire is the primary).
 */

import {EventEmitter} from 'node:events'
import {getWindowGeometry, isWindowAlive, type Geometry} from './window-discovery.js'

const DEFAULT_POLL_INTERVAL_MS = 200
const DEFAULT_DRIFT_THRESHOLD_PX = 10

export type GeometryTrackerOpts = {
	pollIntervalMs?: number
	driftThreshold?: number
	logger?: {warn: (msg: string, ...args: unknown[]) => void; verbose?: (msg: string) => void}
}

export class GeometryTracker extends EventEmitter {
	private timer: ReturnType<typeof setInterval> | null = null
	private wid: number | null = null
	private lastGeometry: Geometry | null = null
	private readonly pollMs: number
	private readonly driftThreshold: number
	private readonly logger: GeometryTrackerOpts['logger']

	constructor(opts: GeometryTrackerOpts = {}) {
		super()
		this.pollMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
		this.driftThreshold = opts.driftThreshold ?? DEFAULT_DRIFT_THRESHOLD_PX
		this.logger = opts.logger
	}

	start(wid: number): void {
		if (this.timer) this.stop()
		this.wid = wid
		this.lastGeometry = null
		this.timer = setInterval(() => {
			this.tick().catch((err) => {
				this.logger?.warn?.('geometry-tracker: tick threw', err)
			})
		}, this.pollMs)
	}

	stop(): void {
		if (this.timer) {
			clearInterval(this.timer)
			this.timer = null
		}
		this.wid = null
		this.lastGeometry = null
	}

	getLastGeometry(): Geometry | null {
		return this.lastGeometry
	}

	private async tick(): Promise<void> {
		if (!this.wid) return
		const wid = this.wid
		const alive = await isWindowAlive(wid)
		if (!alive) {
			this.emit('window-gone', wid)
			this.stop()
			return
		}
		const geom = await getWindowGeometry(wid)
		if (!geom) return
		if (this.lastGeometry === null) {
			this.lastGeometry = geom
			this.emit('change', geom, null)
			return
		}
		const drift = maxDrift(this.lastGeometry, geom)
		if (drift > this.driftThreshold) {
			const prev = this.lastGeometry
			this.lastGeometry = geom
			this.emit('change', geom, prev)
		}
	}
}

function maxDrift(a: Geometry, b: Geometry): number {
	return Math.max(
		Math.abs(a.x - b.x),
		Math.abs(a.y - b.y),
		Math.abs(a.w - b.w),
		Math.abs(a.h - b.h),
	)
}
