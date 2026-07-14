// Phase 328 SEC-02 — scheduled Security Advisor scan (weekly Trivy + weak-config).
//
// Phase 19 (docker/vuln-scan.ts) documented a CGV-04 non-goal of "no scheduler /
// no auto-scan / no background polling". Phase 328 SEC-02 knowingly overturns
// that non-goal: this handler is the scheduled auto-scan, wired into the existing
// scheduler via the standard 4-point JobType extension (types.ts union +
// BUILT_IN_HANDLERS + DEFAULT_JOB_DEFINITIONS + this handler).
//
// The handler mirrors diskCriticalWatchHandler's never-throw contract EXACTLY:
//   guard !ctx.livinityd → {status:'skipped'} · body try/catch → {status:'failure'}
// A CVE-laden image (or a per-image scan error) must NEVER throw out of the tick.

import type Livinityd from '../../index.js'
import type {BuiltInJobHandler, SchedulerLogger} from '../scheduler/types.js'
import {listContainers} from '../docker/docker.js'
import {scanImage} from '../docker/vuln-scan.js'
import {runWeakConfigChecks, type WeakConfigFinding} from './weak-config-checks.js'

// Bounded per-tick cost (RESEARCH Pitfall 5 / T-328-05). force:false + the 7-day
// Redis cache makes repeat scans of UNCHANGED images near-free, so a weekly run
// on a steady box does almost no real Trivy work; this cap bounds the FIRST run
// (or a box that just updated many apps) so a single tick can never loop 30+
// images and saturate a small box.
const MAX_IMAGES_PER_RUN = 20

/**
 * Enumerate the local, non-protected app container images worth scanning.
 * Skips protected/system containers, empty/`<none>` images, and digest-pinned
 * `sha256:...` refs (a digest comparison against a tag is meaningless). Deduped
 * so two containers sharing an image are scanned once.
 */
export async function listLocalAppImages(): Promise<string[]> {
	const containers = await listContainers()
	const seen = new Set<string>()
	for (const c of containers) {
		if (c.isProtected) continue
		const image = c.image
		if (!image || image.includes('<none>') || image.startsWith('sha256:')) continue
		seen.add(image)
	}
	return [...seen]
}

/**
 * Run the full advisor pass: cached Trivy scan (force:false) for each local app
 * image, bounded to MAX_IMAGES_PER_RUN, plus the read-only weak-config probes.
 * Per-image scan errors are collected into the result, never thrown — so one bad
 * image can never abort the whole run.
 */
export async function runSecurityAdvisorScan(
	livinityd: Livinityd,
	logger: SchedulerLogger,
): Promise<{scanned: number; images: unknown[]; weakConfig: WeakConfigFinding[]}> {
	const refs = (await listLocalAppImages()).slice(0, MAX_IMAGES_PER_RUN)
	const images: unknown[] = []
	for (const ref of refs) {
		try {
			// force:false → returns the cached 7-day result if the digest is unchanged.
			const r = await scanImage(ref, false)
			images.push({imageRef: ref, counts: r.counts, scannedAt: r.scannedAt, cached: r.cached})
		} catch (e) {
			// Per-image failure is collected, never thrown out of the run.
			images.push({imageRef: ref, error: String(e)})
		}
	}
	const weakConfig = await runWeakConfigChecks(livinityd)
	logger.log(
		`[scheduler/security-advisor-scan] scanned ${images.length} image(s); ${weakConfig.length} weak-config finding(s)`,
	)
	return {scanned: images.length, images, weakConfig}
}

// Never-throw scheduler handler — mirrors diskCriticalWatchHandler (jobs.ts):
// guard !ctx.livinityd → 'skipped'; body wrapped in try/catch → 'failure' (NOT
// 'error' — JobRunResult.status has no 'error' member).
export const securityAdvisorScanHandler: BuiltInJobHandler = async (job, ctx) => {
	if (!ctx.livinityd) {
		ctx.logger.log(`[scheduler/security-advisor-scan] no daemon reference — skipping job ${job.name}`)
		return {status: 'skipped', error: 'daemon reference unavailable'}
	}
	try {
		ctx.logger.log(`[scheduler/security-advisor-scan] running job ${job.name}`)
		const out = await runSecurityAdvisorScan(ctx.livinityd, ctx.logger)
		return {status: 'success', output: out}
	} catch (err) {
		return {status: 'failure', error: err instanceof Error ? err.message : String(err)}
	}
}
