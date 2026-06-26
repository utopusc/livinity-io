// Phase 305 — stream idle (viewerless) reaper.
//
// Self-rescheduling setTimeout (NOT setInterval), mirroring
// apps/native-app-idle-reaper.ts. Every `intervalMs` it stops any 'alive'
// stream that has been CONTINUOUSLY viewerless for longer than `graceMs`,
// freeing its concurrent-stream cap slot.
//
// WHY: x11vnc is spawned with `-forever -shared` (vnc-bridge.ts), so when a
// browser WebSocket disconnects without the clean React close path — a tab
// crash, force-close, navigate-away, or network drop — the capture process
// keeps running and its StreamManager session stays `status === 'alive'`
// forever. The vnc WS bridge only destroyed the TCP socket; nothing freed the
// slot. Five such orphaned-alive streams → "stream cap exceeded (limit 5)" on
// the next webapp/native spawn (the reported AppFlowy failure). The Phase 159
// native-app reaper is native-only + age-based (30min) and does not cover this.
//
// RECONNECT-SAFE: reaping is gated on `lastViewerLeftAt` having stayed non-null
// past the grace window — not on the disconnect event itself. A reconnect
// (noVNC auto-reconnect, brief network blip) calls `attachViewer`, which nulls
// `lastViewerLeftAt`, so transient drops are never reaped. `stopStream` for a
// vnc session only SIGTERMs the x11vnc CAPTURE process; it never touches the
// underlying X display (host `:0`/`:1` stays up — that destructive path lives in
// `displays.close`, not here). Per-streamId, so reaping one user's orphaned
// host-display view never tears down a peer's still-viewed stream.
//
// Env-tunable: STREAM_VIEWERLESS_GRACE_MS (default 60_000 = 60s).
// Walk interval: 30s (hardcoded — light enough not to matter).

import type {StreamManager} from './stream-manager.js'

const DEFAULT_REAP_INTERVAL_MS = 30_000
const DEFAULT_GRACE_MS = Number(process.env.STREAM_VIEWERLESS_GRACE_MS) || 60_000

export interface StreamReaperLogger {
	info(msg: string): void
	warn(msg: string, error?: unknown): void
	error(msg: string, error?: unknown): void
}

export interface StartStreamIdleReaperOptions {
	streamManager: StreamManager
	logger?: StreamReaperLogger
	/** Override the default 60s viewerless grace (env var). Useful in tests. */
	graceMs?: number
	/** Override the default 30s walk interval. Useful in tests. */
	intervalMs?: number
}

/**
 * Start the stream idle reaper. Returns a `stop()` function that halts the
 * self-rescheduling timer. Fire-and-forget: a failed `stopStream` for one
 * stream never stops the tick from processing the rest, and a failed tick
 * never blocks the next schedule.
 */
export function startStreamIdleReaper(opts: StartStreamIdleReaperOptions): () => void {
	const graceMs = opts.graceMs ?? DEFAULT_GRACE_MS
	const intervalMs = opts.intervalMs ?? DEFAULT_REAP_INTERVAL_MS
	let stopped = false
	let timer: NodeJS.Timeout | null = null

	const tick = async (): Promise<void> => {
		const ids = opts.streamManager.listIdleStreamIds(graceMs)
		for (const streamId of ids) {
			try {
				await opts.streamManager.stopStream(streamId)
				opts.logger?.info(
					`[stream-reaper] reaped viewerless stream ${streamId} (idle > ${Math.round(graceMs / 1000)}s) — freed a cap slot`,
				)
			} catch (err) {
				opts.logger?.warn(`[stream-reaper] reap failed for ${streamId}`, err)
			}
		}
	}

	const schedule = (): void => {
		if (stopped) return
		timer = setTimeout(() => {
			void tick().finally(() => schedule())
		}, intervalMs)
	}

	schedule()
	opts.logger?.info(`[stream-reaper] armed (interval=${intervalMs}ms grace=${graceMs}ms)`)

	return () => {
		stopped = true
		if (timer) {
			clearTimeout(timer)
			timer = null
		}
		opts.logger?.info('[stream-reaper] stopped')
	}
}
