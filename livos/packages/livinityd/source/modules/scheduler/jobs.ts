// Phase 20 — Built-in scheduled job handlers
//
// Each handler implements the BuiltInJobHandler signature: takes the fresh
// ScheduledJob row + a logger, returns a JobRunResult. Handlers MUST NOT throw
// for per-target errors — they should aggregate per-target failures into the
// output JSON and only throw for catastrophic, job-wide failures.

import {execa} from 'execa'
import systemInformation from 'systeminformation'

import {listContainers, pruneImages, isProtectedContainer} from '../docker/docker.js'
import {listGitStacks, updateGitStackSyncSha, controlStack} from '../docker/stacks.js'
import {syncRepo, copyComposeToStackDir} from '../docker/git-deploy.js'
import {aiResourceWatchHandler} from '../docker/ai-resource-watch.js'
import {getSystemDiskUsage} from '../system/system.js'
import {listDrives, runSelfTest} from '../monitoring/smart.js'
import {insertSmartAlert, findRecentSmartAlert} from '../monitoring/smart-alerts.js'
import {getDiskIO, getNetworkStats} from '../monitoring/monitoring.js'
import {insertResourceSample, aggregateRollups, pruneOldRows} from '../monitoring/history.js'
import {volumeBackupHandler} from './backup.js'
import {securityAdvisorScanHandler} from '../security-advisor/scheduler-job.js'
import type {BuiltInJobHandler, JobType} from './types.js'

// =========================================================================
// image-prune — wraps existing pruneImages() from docker.ts
// =========================================================================
export const imagePruneHandler: BuiltInJobHandler = async (job, ctx) => {
	ctx.logger.log(`[scheduler/image-prune] running job ${job.name}`)
	const result = await pruneImages()
	ctx.logger.log(
		`[scheduler/image-prune] reclaimed ${result.spaceReclaimed} bytes, deleted ${result.deletedCount} image(s)`,
	)
	return {
		status: 'success',
		output: {spaceReclaimed: result.spaceReclaimed, deletedCount: result.deletedCount},
	}
}

// =========================================================================
// container-update-check — for every non-protected container, compare the
// local image digest to the registry's digest for the same tag.
//
// Strategy: shell out to `docker buildx imagetools inspect <ref>` (preferred —
// works for any OCI registry without hand-rolling auth) and fall back to
// `docker manifest inspect <ref>` if buildx isn't available. Per-container
// failures degrade gracefully: the container's row gets `updateAvailable=null`
// and the error string, the job overall still returns 'success'.
// =========================================================================

interface UpdateCheckEntry {
	containerName: string
	image: string
	currentDigest: string | null
	latestDigest: string | null
	updateAvailable: boolean | null
	pinned?: boolean
	error?: string
}

const REGISTRY_TIMEOUT_MS = 15_000

async function getLocalImageDigest(imageRef: string): Promise<string | null> {
	try {
		const {stdout} = await execa(
			'docker',
			['image', 'inspect', '--format={{json .RepoDigests}}', imageRef],
			{timeout: REGISTRY_TIMEOUT_MS, reject: false},
		)
		const digests = JSON.parse(stdout || '[]') as string[]
		if (!Array.isArray(digests) || digests.length === 0) return null
		// "repo@sha256:abc..." -> "sha256:abc..."
		const first = digests[0]
		const idx = first.indexOf('@')
		return idx >= 0 ? first.slice(idx + 1) : first
	} catch {
		return null
	}
}

async function getRemoteImageDigest(imageRef: string): Promise<string | null> {
	// Prefer buildx imagetools inspect (manifest digest, supports multi-arch indexes)
	try {
		const buildx = await execa(
			'docker',
			['buildx', 'imagetools', 'inspect', imageRef, '--format', '{{json .Manifest}}'],
			{timeout: REGISTRY_TIMEOUT_MS, reject: false},
		)
		if (buildx.exitCode === 0 && buildx.stdout) {
			const manifest = JSON.parse(buildx.stdout) as {digest?: string}
			if (manifest?.digest) return manifest.digest
		}
	} catch {
		// fall through to manifest inspect
	}

	// Fallback: docker manifest inspect (Docker 23+ stable)
	try {
		const mi = await execa(
			'docker',
			['manifest', 'inspect', '--verbose', imageRef],
			{timeout: REGISTRY_TIMEOUT_MS, reject: false},
		)
		if (mi.exitCode === 0 && mi.stdout) {
			// --verbose returns array or single object with .Descriptor.digest
			const parsed = JSON.parse(mi.stdout)
			const first = Array.isArray(parsed) ? parsed[0] : parsed
			if (first?.Descriptor?.digest) return first.Descriptor.digest
			if (first?.digest) return first.digest
		}
	} catch {
		// give up
	}
	return null
}

export const containerUpdateCheckHandler: BuiltInJobHandler = async (job, ctx) => {
	ctx.logger.log(`[scheduler/container-update-check] running job ${job.name}`)
	const containers = await listContainers()
	const targets = containers.filter((c) => !isProtectedContainer(c.name))

	const results: UpdateCheckEntry[] = []
	for (const c of targets) {
		const image = c.image
		// Skip digest-pinned refs (sha256:...) and <none> tags — comparison is meaningless
		if (!image || image.startsWith('sha256:') || image.includes('<none>')) {
			results.push({
				containerName: c.name,
				image: image || '<unknown>',
				currentDigest: null,
				latestDigest: null,
				updateAvailable: null,
				pinned: true,
			})
			continue
		}

		try {
			const [currentDigest, latestDigest] = await Promise.all([
				getLocalImageDigest(image),
				getRemoteImageDigest(image),
			])
			const updateAvailable =
				currentDigest != null && latestDigest != null ? currentDigest !== latestDigest : null
			results.push({
				containerName: c.name,
				image,
				currentDigest,
				latestDigest,
				updateAvailable,
			})
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			ctx.logger.error(`[scheduler/container-update-check] ${c.name}: ${msg}`)
			results.push({
				containerName: c.name,
				image,
				currentDigest: null,
				latestDigest: null,
				updateAvailable: null,
				error: msg,
			})
		}
	}

	const updates = results.filter((r) => r.updateAvailable === true).length
	ctx.logger.log(
		`[scheduler/container-update-check] checked ${results.length} container(s); ${updates} update(s) available`,
	)
	return {
		status: 'success',
		output: {checked: results.length, updates, results},
	}
}

// =========================================================================
// git-stack-sync — Phase 21 GIT-05.
// Iterates every git-backed stack in PG, runs syncRepo, redeploys on HEAD
// change. Per-stack failures are isolated (logged + recorded) so one bad
// repo can't fail the whole hourly run. Catastrophic (DB down) failures
// bubble up as status='failure'.
// =========================================================================

interface GitSyncEntry {
	name: string
	oldSha: string | null
	newSha: string | null
	action: 'redeployed' | 'no-op' | 'failed'
	error?: string
}

export const gitStackSyncHandler: BuiltInJobHandler = async (job, ctx) => {
	ctx.logger.log(`[scheduler/git-stack-sync] running job ${job.name}`)

	let stacks: Awaited<ReturnType<typeof listGitStacks>>
	try {
		stacks = await listGitStacks()
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		ctx.logger.error(`[scheduler/git-stack-sync] DB error listing stacks: ${msg}`)
		return {status: 'failure', error: `listGitStacks failed: ${msg}`}
	}

	if (stacks.length === 0) {
		ctx.logger.log(`[scheduler/git-stack-sync] no git-backed stacks; nothing to do`)
		return {status: 'success', output: {checked: 0, redeployed: 0, results: []}}
	}

	const results: GitSyncEntry[] = []
	for (const stack of stacks) {
		try {
			const sync = await syncRepo(
				stack.name,
				{
					url: stack.gitUrl,
					branch: stack.gitBranch,
					credentialId: stack.gitCredentialId,
					composePath: stack.composePath,
				},
				stack.lastSyncedSha,
			)
			if (!sync.changed) {
				results.push({
					name: stack.name,
					oldSha: sync.oldSha,
					newSha: sync.newSha,
					action: 'no-op',
				})
				await updateGitStackSyncSha(stack.name, sync.newSha)
				continue
			}
			await copyComposeToStackDir(stack.name, stack.composePath)
			await controlStack(stack.name, 'pull-and-up')
			await updateGitStackSyncSha(stack.name, sync.newSha)
			results.push({
				name: stack.name,
				oldSha: sync.oldSha,
				newSha: sync.newSha,
				action: 'redeployed',
			})
			ctx.logger.log(
				`[scheduler/git-stack-sync] ${stack.name}: redeployed ${sync.oldSha?.slice(0, 8) || 'init'} -> ${sync.newSha.slice(0, 8)}`,
			)
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			ctx.logger.error(`[scheduler/git-stack-sync] ${stack.name}: ${msg}`)
			results.push({
				name: stack.name,
				oldSha: stack.lastSyncedSha,
				newSha: null,
				action: 'failed',
				error: msg,
			})
		}
	}

	const redeployed = results.filter((r) => r.action === 'redeployed').length
	ctx.logger.log(
		`[scheduler/git-stack-sync] checked ${stacks.length} stack(s); ${redeployed} redeployed`,
	)
	return {
		status: 'success',
		output: {checked: stacks.length, redeployed, results},
	}
}

// =========================================================================
// disk-critical-watch — Phase 310 ALERT-02.
// Server-side low-disk detection (the UI's isDiskLow/isDiskFull thresholds
// only run in the browser, so nothing fires when no one has Settings open).
// Reaches the daemon EXCLUSIVELY through ctx.livinityd (the optional ref
// Plan 02 threaded into the scheduler handler ctx via runJob). Fires the
// 'disk-critical' external alert when free space crosses a byte threshold,
// clears it on recovery, and NEVER throws out of the scheduler tick.
// =========================================================================

// Pure, exported so the threshold logic is unit-testable without disk I/O.
// 100MB / 1GB are the EXACT byte constants ported from ui/src/utils/system.ts
// (isDiskFull / isDiskLow) — one product-wide definition of "disk full/low".
export function diskSeverityFor(available: number): 'critical' | 'warning' | null {
	if (available < 100_000_000) return 'critical' // < 100MB remaining → disk full
	if (available < 1_000_000_000) return 'warning' // < 1GB remaining → disk low
	return null
}

export const diskCriticalWatchHandler: BuiltInJobHandler = async (job, ctx) => {
	// Guard: no daemon ref (isolated unit test / Scheduler built without
	// livinityd) → skip cleanly, never throw.
	if (!ctx.livinityd) {
		ctx.logger.log(`[scheduler/disk-critical-watch] no daemon reference — skipping job ${job.name}`)
		return {status: 'skipped', error: 'daemon reference unavailable'}
	}
	try {
		ctx.logger.log(`[scheduler/disk-critical-watch] running job ${job.name}`)
		const {available} = await getSystemDiskUsage(ctx.livinityd)
		const severity = diskSeverityFor(available)
		if (severity) {
			// Fire-and-forget: a notification/dispatch failure must not fail the tick.
			await ctx.livinityd.notifications.add('disk-critical', {severity, external: true}).catch(() => {})
		} else {
			// Clear-on-recovery (mirrors backups.ts syncEngineNotification()).
			await ctx.livinityd.notifications.clear('disk-critical').catch(() => {})
		}
		return {status: 'success', output: {available, severity}}
	} catch (err) {
		// NOTE: 'failure', NOT 'error' — JobRunResult.status has no 'error' member.
		return {status: 'failure', error: err instanceof Error ? err.message : String(err)}
	}
}

// =========================================================================
// smart-health-scan — Phase 313 SMART-02/03.
// Daily per-drive SMART evaluation. Reaches the daemon EXCLUSIVELY through
// ctx.livinityd (same seam as disk-critical-watch). Failing/unavailable/
// permission-denied conditions route ONLY through the Phase-310 bridge
// (notifications.add/clear) — never a second dispatch path. A deduped audit
// row is persisted per NEW condition (findRecentSmartAlert 6h window) so a
// daily scan does not spam smart_alerts. NEVER throws out of the tick.
// =========================================================================
export const smartHealthScanHandler: BuiltInJobHandler = async (job, ctx) => {
	if (!ctx.livinityd) {
		ctx.logger.log(`[scheduler/smart-health-scan] no daemon reference — skipping job ${job.name}`)
		return {status: 'skipped', error: 'daemon reference unavailable'}
	}
	try {
		ctx.logger.log(`[scheduler/smart-health-scan] running job ${job.name}`)
		const drives = await listDrives()
		let failing = 0
		let anyPermissionDenied = false

		for (const d of drives) {
			const failId = `smart-failing:${d.deviceId}`
			const unavailId = `smart-unavailable:${d.deviceId}`

			if (d.healthStatus === 'failing') {
				failing++
				// Fire-and-forget: a dispatch failure must not fail the tick.
				await ctx.livinityd.notifications
					.add(failId, {severity: d.severity ?? 'warning', external: true})
					.catch(() => {})
				await ctx.livinityd.notifications.clear(unavailId).catch(() => {})
				// Dedupe persist: one row per NEW failing condition (6h window).
				const kind = d.detectionMethod === 'nvme' ? 'nvme-critical' : 'sata-attribute'
				if (!(await findRecentSmartAlert(d.deviceId, kind, 360))) {
					await insertSmartAlert({
						deviceId: d.deviceId,
						severity: d.severity ?? 'warning',
						kind,
						message: d.reasons.join('; ') || 'SMART failure',
						payload: {reasons: d.reasons},
					}).catch(() => null)
				}
			} else if (d.healthStatus === 'unavailable' && d.detectionMethod === 'permission-denied') {
				// Install/config defect on an INTERNAL drive — surface distinctly so a
				// broken sudoers grant is never a silent no-op (RESEARCH Pitfall 1 / T-313-14).
				anyPermissionDenied = true
				await ctx.livinityd.notifications
					.add('smart-permission-denied', {severity: 'warning', external: true})
					.catch(() => {})
				await ctx.livinityd.notifications.clear(failId).catch(() => {})
				await ctx.livinityd.notifications.clear(unavailId).catch(() => {})
			} else if (d.healthStatus === 'unavailable') {
				// SMART-05 (Scope A / D-5): a drive with no SMART capability (detectionMethod
				// 'unsupported' — WSL/virtual disks AND USB enclosures that swallow SAT) is a
				// PERMANENT, non-actionable state. Keep the honest 'unavailable' UI badge
				// (listDrives is untouched) but do NOT raise an external notification or an
				// audit row — a persistent NAG is noise. permission-denied (fixable) and
				// failing still alert above. Still clear stale alerts so a box that already
				// NAGged (or a drive that recovered failing→unsupported) un-sticks next scan.
				await ctx.livinityd.notifications.clear(failId).catch(() => {})
				await ctx.livinityd.notifications.clear(unavailId).catch(() => {})
			} else {
				// healthy — clear both per-drive alerts on recovery.
				await ctx.livinityd.notifications.clear(failId).catch(() => {})
				await ctx.livinityd.notifications.clear(unavailId).catch(() => {})
			}
		}

		// If NO internal drive is permission-denied this scan, clear the system-level
		// notice so a fixed sudoers grant un-sticks the alert (WARNING-4 / T-313-14).
		if (!anyPermissionDenied) {
			await ctx.livinityd.notifications.clear('smart-permission-denied').catch(() => {})
		}

		return {status: 'success', output: {scanned: drives.length, failing}}
	} catch (err) {
		// NOTE: 'failure', NOT 'error' — JobRunResult.status has no 'error' member.
		return {status: 'failure', error: err instanceof Error ? err.message : String(err)}
	}
}

// =========================================================================
// smart-self-test-short — Phase 313 SMART-02.
// Weekly short self-test trigger. DoS-guarded: skips any unreadable drive and
// any drive already mid-test (selfTestInProgress) — a self-test is I/O heavy
// and must never be re-triggered on top of a running one (T-313-04). The
// smartctl -t short call is firmware-resident and returns immediately; the
// RESULT is read back by the next smart-health-scan, not here. NEVER throws.
// =========================================================================
export const smartSelfTestShortHandler: BuiltInJobHandler = async (job, ctx) => {
	if (!ctx.livinityd) {
		ctx.logger.log(`[scheduler/smart-self-test-short] no daemon reference — skipping job ${job.name}`)
		return {status: 'skipped', error: 'daemon reference unavailable'}
	}
	try {
		ctx.logger.log(`[scheduler/smart-self-test-short] running job ${job.name}`)
		const drives = await listDrives()
		let triggered = 0
		for (const d of drives) {
			// Can't self-test an unreadable drive (unsupported / permission-denied).
			if (!['ata', 'nvme', 'sat'].includes(d.detectionMethod)) continue
			// NOT-WHILE-RUNNING guard (DoS mitigation).
			if (d.selfTestInProgress) continue
			// Fire-and-forget: the test runs asynchronously in drive firmware.
			await runSelfTest(d.deviceId, 'short').catch(() => {})
			triggered++
		}
		return {status: 'success', output: {triggered}}
	} catch (err) {
		// NOTE: 'failure', NOT 'error' — JobRunResult.status has no 'error' member.
		return {status: 'failure', error: err instanceof Error ? err.message : String(err)}
	}
}

// =========================================================================
// resource-metrics-collect — Phase 320 MON-01.
// 1-min collector: turns Plan 01's schema into live data. Reads ONLY the CHEAP
// system-total readers (systemInformation.currentLoad()/.mem() + already-cheap
// getDiskIO/getNetworkStats) — NEVER the per-app `docker top` CPU reader
// (D-320-4 / T-320-03: the expensive reader scales cost with installed-app
// count on every minute-tick forever). Writes one wide raw sample per tick via
// insertResourceSample(). Follows the disk-critical-watch never-throw contract:
// guard !ctx.livinityd → skipped; body in try/catch → {status:'failure'}.
// =========================================================================
export const resourceMetricsCollectHandler: BuiltInJobHandler = async (job, ctx) => {
	if (!ctx.livinityd) {
		ctx.logger.log(`[scheduler/resource-metrics-collect] no daemon reference — skipping job ${job.name}`)
		return {status: 'skipped', error: 'daemon reference unavailable'}
	}
	try {
		const [load, mem, diskIO, netStats] = await Promise.all([
			systemInformation.currentLoad(), // D-320-4: aggregate CPU, zero top/docker-top shell-outs
			systemInformation.mem(),
			getDiskIO(),
			getNetworkStats(),
		])
		const netRx = netStats.reduce((s, n) => s + (n.rxSec ?? 0), 0)
		const netTx = netStats.reduce((s, n) => s + (n.txSec ?? 0), 0)
		await insertResourceSample({
			cpuPct: load.currentLoad,
			memUsedBytes: mem.active, // A2: 'active' matches the live Memory widget's "used"
			memTotalBytes: mem.total,
			diskReadBps: diskIO.rIOSec ?? null,
			diskWriteBps: diskIO.wIOSec ?? null,
			netRxBps: netRx,
			netTxBps: netTx,
		})
		return {status: 'success'}
	} catch (err) {
		// NOTE: 'failure', NOT 'error' — JobRunResult.status has no 'error' member.
		return {status: 'failure', error: err instanceof Error ? err.message : String(err)}
	}
}

// =========================================================================
// resource-metrics-rollup — Phase 320 MON-01.
// Hourly downsampling + retention. aggregateRollups() re-aggregates raw→5m→1h
// (idempotent ON CONFLICT); pruneOldRows() enforces retention from DAY ONE
// (raw>48h, 5m>30d, 1h>365d) so persisted metrics can never bloat the shared
// livos Postgres unbounded (D-320-5 / Pitfall 12 / T-320-04 — shipped in the
// SAME wave as the collector, never deferred). Same never-throw contract.
// =========================================================================
export const resourceMetricsRollupHandler: BuiltInJobHandler = async (job, ctx) => {
	if (!ctx.livinityd) {
		ctx.logger.log(`[scheduler/resource-metrics-rollup] no daemon reference — skipping job ${job.name}`)
		return {status: 'skipped', error: 'daemon reference unavailable'}
	}
	try {
		await aggregateRollups() // raw->5m, 5m->1h (idempotent ON CONFLICT)
		await pruneOldRows() // raw>48h, 5m>30d, 1h>365d — retention from day one (D-320-5)
		return {status: 'success'}
	} catch (err) {
		// NOTE: 'failure', NOT 'error' — JobRunResult.status has no 'error' member.
		return {status: 'failure', error: err instanceof Error ? err.message : String(err)}
	}
}

// =========================================================================
// Registry: jobType -> handler mapping.
// volume-backup wired by Plan 20-02 (alpine-tar streaming to S3/SFTP/local).
// ai-resource-watch wired by Plan 23-02 (Phase 23 AID-02 proactive alerts).
// disk-critical-watch wired by Plan 310-03 (Phase 310 ALERT-02 low-disk alert).
// =========================================================================
export const BUILT_IN_HANDLERS: Record<JobType, BuiltInJobHandler> = {
	'image-prune': imagePruneHandler,
	'container-update-check': containerUpdateCheckHandler,
	'git-stack-sync': gitStackSyncHandler,
	'volume-backup': volumeBackupHandler,
	'ai-resource-watch': aiResourceWatchHandler,
	'disk-critical-watch': diskCriticalWatchHandler,
	'smart-health-scan': smartHealthScanHandler,
	'smart-self-test-short': smartSelfTestShortHandler,
	'resource-metrics-collect': resourceMetricsCollectHandler,
	'resource-metrics-rollup': resourceMetricsRollupHandler,
	'security-advisor-scan': securityAdvisorScanHandler,
}

// =========================================================================
// Default job definitions seeded on first boot (per 20-CONTEXT decisions).
// Re-seed is a no-op via ON CONFLICT (name) DO NOTHING in store.seedDefaults.
// =========================================================================
export const DEFAULT_JOB_DEFINITIONS: Array<{
	name: string
	schedule: string
	type: JobType
	enabled: boolean
	config?: Record<string, unknown>
}> = [
	{name: 'image-prune', schedule: '0 3 * * 0', type: 'image-prune', enabled: true},
	{name: 'container-update-check', schedule: '0 6 * * *', type: 'container-update-check', enabled: true},
	{name: 'git-stack-sync', schedule: '0 * * * *', type: 'git-stack-sync', enabled: true},
	// Phase 23 AID-02 — proactive Kimi resource-pressure alerts.
	// Default enabled=false because the handler generates persistent Kimi
	// spend even when nothing is wrong (one call per 5min per stressed
	// container). Operators flip enabled=true via Settings > Scheduler
	// once Kimi projections have been validated in their environment.
	// seedDefaults() uses ON CONFLICT (name) DO NOTHING so existing PG
	// installs that already booted Plan 23-01 keep whatever they had —
	// this default only takes effect on fresh installs (same default-flip
	// pattern as Plan 21-02 git-stack-sync).
	{name: 'ai-resource-watch', schedule: '*/5 * * * *', type: 'ai-resource-watch', enabled: false},
	// Phase 310 ALERT-02 — server-side low-disk watch. Default enabled=true: a
	// byte-threshold check is free (no LLM spend, unlike ai-resource-watch), and
	// low disk is a box-operator concern that must fire even with no Settings open.
	{name: 'disk-critical-watch', schedule: '*/15 * * * *', type: 'disk-critical-watch', enabled: true},
	// Phase 313 SMART-02 — daily disk-health scan. enabled=true: a smartctl read is
	// a few seconds of I/O per drive, no LLM spend, and a failing drive must alert
	// even with no Settings tab open (same rationale as disk-critical-watch).
	{name: 'smart-health-scan', schedule: '0 5 * * *', type: 'smart-health-scan', enabled: true},
	// Phase 313 SMART-02 — weekly short self-test. enabled=true: a short test is
	// ~2min and does not saturate the drive; the handler skips any drive already
	// mid-test (not-while-running DoS guard). Long tests stay admin-triggered only.
	{name: 'smart-self-test-short', schedule: '0 6 * * 0', type: 'smart-self-test-short', enabled: true},
	// Phase 320 MON-01 — cheap system-total reads (no LLM spend, no per-app docker top); enabled by default.
	{name: 'resource-metrics-collect', schedule: '* * * * *', type: 'resource-metrics-collect', enabled: true},
	// rollup+retention runs at :05 so it always sees a full prior hour of raw data.
	{name: 'resource-metrics-rollup', schedule: '5 * * * *', type: 'resource-metrics-rollup', enabled: true},
	// Phase 328 SEC-02 — weekly Trivy + weak-config scan. enabled=true: Trivy
	// scans are cached 7 days (force:false) so repeat scans of unchanged images
	// are near-free, and a CVE-laden image must surface even with no Settings tab
	// open. Scheduled off-peak Sunday 4am — one hour after image-prune (0 3 * * 0)
	// so the two weekly maintenance jobs don't overlap — and bounded to
	// MAX_IMAGES_PER_RUN per tick to keep the cost predictable on a small box.
	{name: 'security-advisor-scan', schedule: '0 4 * * 0', type: 'security-advisor-scan', enabled: true},
]
