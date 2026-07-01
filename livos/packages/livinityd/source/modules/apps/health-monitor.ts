import {$} from 'execa'

import type App from './app.js'
import {classifyInspect} from './health-poll.js'

// Reliability C1 — continuous app-health monitor (the T5 meta-fix).
//
// LivOS computed container health once (at install/start) and discarded it;
// nothing ever reconciled a stable in-memory state against the real Docker
// state, so a container that died after install kept reporting 'ready'
// forever ("running but 502"), and an A3 'unhealthy' verdict could never
// self-correct. Every reliable comparator runs a loop (Cloudron 10s /
// Coolify 1-min / Runtipi ~2-min); this is the LivOS equivalent, scoped
// deliberately narrowly:
//
// - ONLY apps currently in a stable 'ready' or 'unhealthy' state are judged.
//   Transient states (installing/starting/restarting/uninstalling/…) are the
//   Phase 260-01 wedge class — a background writer racing an in-flight
//   lifecycle op must never clobber them. 'stopped' is intentional (operator
//   action) — an exited container there is CORRECT, not unhealthy.
// - unhealthy → ready flips IMMEDIATELY on a ready verdict (recovery; this is
//   what makes the A3 install gate safe for slow-boot apps).
// - ready → unhealthy flips only after UNHEALTHY_THRESHOLD consecutive bad
//   samples (flap suppression — a single hiccup or a compose recreation blip
//   must not flap the tile).
// - 'pending' verdicts (starting/restarting) are neutral: they neither count
//   against an app nor clear an existing bad streak (a crash-looper cycles
//   restarting→running→exited; clearing on 'restarting' would mask it).
// - Sequential inspects + a re-entrancy guard: bounded CPU on the Mini-PC
//   (one `docker inspect` pair per app per tick, no parallel fan-out).
// - Compare-and-set writes: the state is re-checked at write time so a
//   lifecycle op that started mid-tick wins over the monitor's sample.

const DEFAULT_INTERVAL_MS = 60_000
const UNHEALTHY_THRESHOLD = 3 // consecutive bad samples ≈ 3 minutes at 60s

export interface HealthMonitorLogger {
	log: (message: string) => void
	error: (message: string, error?: unknown) => void
}

export function startAppHealthMonitor({
	getApps,
	logger,
	intervalMs = DEFAULT_INTERVAL_MS,
}: {
	getApps: () => App[]
	logger: HealthMonitorLogger
	intervalMs?: number
}): () => void {
	const consecutiveBad = new Map<string, number>()
	let running = false
	let stopped = false

	async function tick() {
		if (running || stopped) return
		running = true
		try {
			for (const app of getApps()) {
				if (stopped) break
				const stateAtSample = app.state
				// Judge only the two stable states this monitor owns.
				if (stateAtSample !== 'ready' && stateAtSample !== 'unhealthy') {
					consecutiveBad.delete(app.id)
					continue
				}
				let verdict
				try {
					const containerName = await app.getMainContainerName()
					if (!containerName) continue
					const {stdout: status} = await $`docker inspect -f {{.State.Status}} ${containerName}`
					const {stdout: health} = await $`docker inspect -f {{.State.Health.Status}} ${containerName}`
					verdict = classifyInspect({status: status.trim(), health: health.trim()})
				} catch {
					// Inspect flake (docker hiccup, container being recreated) — skip
					// this sample entirely; never judge on missing evidence.
					continue
				}
				if (verdict === 'ready') {
					consecutiveBad.delete(app.id)
					// Compare-and-set: only recover if no lifecycle op raced us.
					if (stateAtSample === 'unhealthy' && app.state === 'unhealthy') {
						app.state = 'ready'
						logger.log(`[health-monitor] ${app.id} recovered — unhealthy → ready`)
					}
				} else if (verdict === 'unhealthy' || verdict === 'failed') {
					const bad = (consecutiveBad.get(app.id) ?? 0) + 1
					consecutiveBad.set(app.id, bad)
					if (bad >= UNHEALTHY_THRESHOLD && stateAtSample === 'ready' && app.state === 'ready') {
						app.state = 'unhealthy'
						logger.log(
							`[health-monitor] ${app.id} marked unhealthy after ${bad} consecutive bad samples (last verdict=${verdict})`,
						)
					}
				}
				// 'pending' — neutral by design (see header comment).
			}
		} catch (error) {
			logger.error('[health-monitor] tick failed', error)
		} finally {
			running = false
		}
	}

	const timer = setInterval(() => void tick(), intervalMs)
	// Never keep the process alive just for the monitor.
	timer.unref?.()
	logger.log(`[health-monitor] started (interval ${intervalMs}ms, threshold ${UNHEALTHY_THRESHOLD} bad samples)`)

	return () => {
		stopped = true
		clearInterval(timer)
		logger.log('[health-monitor] stopped')
	}
}
