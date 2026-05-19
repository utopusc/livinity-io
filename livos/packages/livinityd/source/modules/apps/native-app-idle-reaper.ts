// Phase 159 — native-app idle reaper.
//
// Self-rescheduling setTimeout (NOT setInterval) walking the activeNative
// map every `intervalMs`. Entries whose `startedAt + idleMs` is in the
// past get `closeNativeApp()` called as a defense-in-depth backstop for
// the window-manager-mediated close handler (159-02 Workstream B1) and
// for the fire-and-forget native-routes close mutation.
//
// Pattern mirrored from account/heartbeat-sender.ts lines 218-243 — each
// tick must fully resolve (or throw) before the next is armed, so a slow
// `closeNativeApp` (multi-second SIGTERM grace) cannot pile up overlapping
// reaper passes.
//
// Env-tunable: `NATIVE_APP_IDLE_REAP_MS` (default 1_800_000 = 30min).
// Walk interval: 30s (hardcoded — light enough not to matter).
//
// Idempotent w.r.t. the user-flow close path (159-02 + 159-04). If the
// window-manager-mediated `apps.native.close` mutation already removed an
// entry from `activeNative`, this reaper sees it gone on the next walk
// and does nothing — `closeNativeApp` is itself eager-delete idempotent.
//
// Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (sdk-agent-runner.ts)
// unchanged by this module.

import type {DisplayAllocator} from '../streaming/index.js'
import type {StreamManager} from '../streaming/stream-manager.js'
import {closeNativeApp} from './native-app-binder.js'
import type {ActiveNativeApp} from './native-routes.js'

const DEFAULT_REAP_INTERVAL_MS = 30_000
const DEFAULT_IDLE_MS = Number(process.env.NATIVE_APP_IDLE_REAP_MS) || 1_800_000

export interface ReaperLogger {
	info(msg: string): void
	warn(msg: string, error?: unknown): void
	error(msg: string, error?: unknown): void
}

export interface StartNativeAppIdleReaperOptions {
	active: Map<string, ActiveNativeApp>
	displayAllocator: DisplayAllocator
	streamManager: StreamManager
	logger?: ReaperLogger
	/** Override default 30min stale threshold (env var). Useful in tests. */
	idleMs?: number
	/** Override default 30s walk interval. Useful in tests. */
	intervalMs?: number
}

/**
 * Start the native-app idle reaper. Returns a `stop()` function that halts
 * the self-rescheduling timer.
 *
 * The reaper is fire-and-forget for the caller — failures inside
 * `closeNativeApp` for one entry never stop the tick from processing
 * subsequent entries, and a failed tick never blocks the next schedule.
 */
export function startNativeAppIdleReaper(opts: StartNativeAppIdleReaperOptions): () => void {
	const idleMs = opts.idleMs ?? DEFAULT_IDLE_MS
	const intervalMs = opts.intervalMs ?? DEFAULT_REAP_INTERVAL_MS
	let stopped = false
	let timer: NodeJS.Timeout | null = null

	const tick = async (): Promise<void> => {
		const now = Date.now()
		// Snapshot the entries up-front so concurrent spawn/close mutations
		// during the iteration don't perturb the loop. Each closeNativeApp
		// is awaited individually with its own try/catch.
		const entries = Array.from(opts.active.entries())
		for (const [id, entry] of entries) {
			if (now - entry.startedAt < idleMs) continue
			try {
				await closeNativeApp({
					id,
					active: opts.active,
					displayAllocator: opts.displayAllocator,
					portAllocator: opts.streamManager.getPortAllocator(),
					streamManager: opts.streamManager,
					logger: opts.logger
						? {
								info: (m: string) => opts.logger!.info(m),
								warn: (m: string) => opts.logger!.warn(m),
								error: (m: string) => opts.logger!.error(m),
								verbose: () => {},
							}
						: undefined,
				})
				opts.logger?.info(
					`[native-reaper] reaped idle native app ${id} (idle for ${Math.round((now - entry.startedAt) / 1000)}s)`,
				)
			} catch (err) {
				opts.logger?.warn(`[native-reaper] reap failed for ${id}`, err)
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
	opts.logger?.info(`[native-reaper] armed (interval=${intervalMs}ms idle=${idleMs}ms)`)

	return () => {
		stopped = true
		if (timer) {
			clearTimeout(timer)
			timer = null
		}
		opts.logger?.info('[native-reaper] stopped')
	}
}
