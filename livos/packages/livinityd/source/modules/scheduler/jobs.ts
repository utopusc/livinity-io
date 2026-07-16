// Phase 20 — Built-in scheduled job handlers
//
// Each handler implements the BuiltInJobHandler signature: takes the fresh
// ScheduledJob row + a logger, returns a JobRunResult. Handlers MUST NOT throw
// for per-target errors — they should aggregate per-target failures into the
// output JSON and only throw for catastrophic, job-wide failures.

import path from 'node:path'

import {execa} from 'execa'
import systemInformation from 'systeminformation'

import getDirectorySize from '../utilities/get-directory-size.js'
import {listUserQuotas, getPool} from '../database/index.js'
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
import {getBuiltinApp} from '../apps/builtin-apps.js'
import * as snapraidCli from '../storage-pool/snapraid-cli.js'
import {checkFreezeGate} from '../storage-pool/pool.js'
import type {PoolStore, StoragePoolState, PoolStatusSummary} from '../storage-pool/pool.js'
import type {StatusResult} from '../storage-pool/snapraid-log.js'
import type Livinityd from '../../index.js'
import type {BuiltInJobHandler, JobType, JobRunStatus} from './types.js'

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
// app-auto-update — Phase 326 APPS-02 (true auto-update).
// For every installed app whose per-app autoUpdatePolicy is 'auto', compare the
// INSTALLED manifest version to the shipped builtin manifest version (the
// reliable server-side "available version" signal — the app-store registry
// route returns [], so builtin-manifest bumps are the update trigger). Update
// only when the available version DIFFERS and is NOT the admin's ignoredVersion
// pin. Each app is wrapped in its OWN try/catch so one failing update never
// fails the tick (T-326-18); autoUpdatePolicy defaults to 'manual' so NOTHING
// auto-updates until an admin opts an app in (T-326-17). Follows the
// disk-critical-watch never-throw contract (guard→skipped, try/catch→failure).
// =========================================================================
export const appAutoUpdateHandler: BuiltInJobHandler = async (job, ctx) => {
	// Guard: no daemon ref (isolated unit test / Scheduler built without
	// livinityd) → skip cleanly, never throw.
	if (!ctx.livinityd) {
		ctx.logger.log(`[scheduler/app-auto-update] no daemon reference — skipping job ${job.name}`)
		return {status: 'skipped', error: 'daemon reference unavailable'}
	}
	try {
		ctx.logger.log(`[scheduler/app-auto-update] running job ${job.name}`)
		const updated: string[] = []
		for (const app of ctx.livinityd.apps.instances) {
			try {
				const policy = await app.store.get('autoUpdatePolicy')
				// Opt-in only: 'manual' (the default) and undefined are left untouched.
				if (policy !== 'auto') continue
				const installed = (await app.readManifest()).version
				const available = getBuiltinApp(app.id)?.version
				const ignored = await app.store.get('ignoredVersion')
				// Skip when up-to-date OR when the available version is the admin's pin.
				if (available && available !== installed && available !== ignored) {
					await app.update()
					updated.push(app.id)
				}
			} catch (err) {
				// Per-app isolation: one app's failure must not fail the whole tick.
				ctx.logger.error(
					`[scheduler/app-auto-update] ${app.id}: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
		}
		ctx.logger.log(`[scheduler/app-auto-update] auto-updated ${updated.length} app(s)`)
		return {status: 'success', output: {updated}}
	} catch (err) {
		// NOTE: 'failure', NOT 'error' — JobRunResult.status has no 'error' member.
		return {status: 'failure', error: err instanceof Error ? err.message : String(err)}
	}
}

// =========================================================================
// ups-watch — Phase 326 HW-01 (the ALERT half of criterion-4).
// STATUS/ALERT-only UPS poll. Reads `upsc ups@localhost` (a localhost-only NUT
// socket), parses the `ups.status` line (OL / OB / LB tokens). On OB (running
// on battery — mains lost) raises the 'ups-power-loss' external alert; on OL
// (mains restored) raises 'ups-power-restored' and clears the loss alert. A box
// with NO UPS / NUT not configured is NORMAL → {status:'success', unavailable},
// NEVER a failure. This ≥1-min poll NEVER decides shutdown — upsmon (POLLFREQ
// 5s, Plan 326-03) owns the shutdown decision. Reaches the daemon EXCLUSIVELY
// through ctx.livinityd; every add/clear is fire-and-forget (.catch()); NEVER
// throws out of the scheduler tick.
// =========================================================================
const UPS_POLL_TIMEOUT_MS = 10_000

// Parse a `key: value` line from `upsc` output; null when the field is absent.
function parseUpsField(stdout: string, key: string): string | null {
	const line = stdout.split('\n').find((l) => l.startsWith(`${key}:`))
	if (!line) return null
	return line.slice(line.indexOf(':') + 1).trim()
}

export const upsWatchHandler: BuiltInJobHandler = async (job, ctx) => {
	// Guard: no daemon ref → skip cleanly, never throw.
	if (!ctx.livinityd) {
		ctx.logger.log(`[scheduler/ups-watch] no daemon reference — skipping job ${job.name}`)
		return {status: 'skipped', error: 'daemon reference unavailable'}
	}
	try {
		ctx.logger.log(`[scheduler/ups-watch] running job ${job.name}`)
		// reject:false so an absent UPS / unconfigured NUT degrades to 'unavailable'
		// instead of throwing (a box with no UPS is the normal case, NOT a failure).
		const {stdout, exitCode} = await execa('upsc', ['ups@localhost'], {
			timeout: UPS_POLL_TIMEOUT_MS,
			reject: false,
		})
		const statusLine = stdout.split('\n').find((line) => line.startsWith('ups.status:'))
		if (exitCode !== 0 || !statusLine) {
			// No UPS configured / upsc unavailable → NORMAL, no notification.
			return {status: 'success', output: {status: 'unavailable'}}
		}
		const charge = parseUpsField(stdout, 'battery.charge')
		const runtime = parseUpsField(stdout, 'battery.runtime')
		const onBattery = /\bOB\b/.test(statusLine)
		// 326-review (WR-01): only announce "power restored" on the OB->OL
		// TRANSITION (D-16: raise restored "on return to OL"), not on every healthy
		// tick. Without this guard the else-branch fired 'ups-power-restored' on the
		// normal steady-state OL poll (every minute), leaving a persistent bell item +
		// a 6h-refloored external alert on boxes whose mains never dropped. The active
		// 'ups-power-loss' notification is our persisted prior-state marker.
		const wasOnBattery = (await ctx.livinityd.notifications.get().catch(() => [] as string[])).includes(
			'ups-power-loss',
		)
		if (onBattery) {
			// Fire-and-forget: a dispatch failure must not fail the tick.
			await ctx.livinityd.notifications.add('ups-power-loss', {severity: 'critical', external: true}).catch(() => {})
		} else if (wasOnBattery) {
			// OB→OL transition — mains restored: announce restore + clear the loss alert.
			await ctx.livinityd.notifications.add('ups-power-restored', {severity: 'info', external: true}).catch(() => {})
			await ctx.livinityd.notifications.clear('ups-power-loss').catch(() => {})
		}
		return {status: 'success', output: {status: onBattery ? 'OB' : 'OL', charge, runtime}}
	} catch (err) {
		// NOTE: 'failure', NOT 'error' — JobRunResult.status has no 'error' member.
		return {status: 'failure', error: err instanceof Error ? err.message : String(err)}
	}
}

// =========================================================================
// user-quota-scan — Phase 325 STOR-02.
// App-layer soft per-user quota accounting. Walks each user's data subtree with
// `du` (serialized, one user at a time so the scan can never saturate disk I/O —
// T-325-02), caches the per-user byte map into the shared FileStore
// (`storageQuota`) so the setUserQuota/listAllUsers routes + the files-module
// write pre-check can read used-vs-quota WITHOUT re-walking the tree, and fires a
// single 'quota-exceeded' warning bell when ANY user crosses the soft ratio of
// their quota (clears it when nobody is over). Reaches the daemon EXCLUSIVELY
// through ctx.livinityd and NEVER throws out of the tick.
//
// Residual gap (D-05): enforcement is APPROXIMATE — the cached usage is only as
// fresh as the last tick, and non-files-module writes (docker app writes, SMB)
// grow the tree between ticks. Kernel/project quotas are DEFERRED.
// =========================================================================

// Soft-warn threshold: at/above this fraction of a user's quota we raise the
// 'quota-exceeded' bell (the hard block itself lives in the files write path).
export const QUOTA_SOFT_RATIO = 0.9

// Pure, exported so the threshold logic is unit-testable without disk I/O.
// Returns the usernames whose cached usage is at/over the soft ratio of their
// quota. quota null/<=0 = unlimited → never breaches.
export function usersOverSoftQuota(
	usage: Record<string, number>,
	quotas: Record<string, number | null>,
	softRatio: number = QUOTA_SOFT_RATIO,
): string[] {
	const over: string[] = []
	for (const [username, used] of Object.entries(usage)) {
		const quota = quotas[username]
		if (quota == null || quota <= 0) continue // unlimited
		if (used >= quota * softRatio) over.push(username)
	}
	return over
}

export const userQuotaScanHandler: BuiltInJobHandler = async (job, ctx) => {
	// Guard: no daemon ref (isolated unit test / Scheduler built without
	// livinityd) → skip cleanly, never throw.
	if (!ctx.livinityd) {
		ctx.logger.log(`[scheduler/user-quota-scan] no daemon reference — skipping job ${job.name}`)
		return {status: 'skipped', error: 'daemon reference unavailable'}
	}
	try {
		ctx.logger.log(`[scheduler/user-quota-scan] running job ${job.name}`)
		const users = await listUserQuotas()
		const usage: Record<string, number> = {}
		const quotas: Record<string, number | null> = {}
		// Serialized (NOT Promise.all) — one du at a time bounds the I/O the scan
		// can generate on a small box (T-325-02).
		for (const u of users) {
			quotas[u.username] = u.quotaBytes
			const userDir = path.join(ctx.livinityd.dataDirectory, 'users', u.username)
			try {
				usage[u.username] = await getDirectorySize(userDir)
			} catch {
				// A missing/racing dir must not fail the whole tick — record 0 and
				// move on (per-target degrade; the job overall still returns success).
				usage[u.username] = 0
			}
		}
		// Cache onto the shared store so routes + the files write pre-check can read
		// used-vs-quota without re-walking. Dedicated top-level key (dot-prop-safe).
		await ctx.livinityd.store.set('storageQuota', {usedBytes: usage, lastScanAt: Date.now()})
		const over = usersOverSoftQuota(usage, quotas)
		if (over.length > 0) {
			// Fire-and-forget: a notification failure must not fail the tick.
			// external:false — a soft over-quota warning is an in-app bell, not an
			// ops page-out (unlike disk-critical / ups-power-loss).
			await ctx.livinityd.notifications.add('quota-exceeded', {severity: 'warning', external: false}).catch(() => {})
		} else {
			// Clear-on-recovery (mirrors disk-critical-watch).
			await ctx.livinityd.notifications.clear('quota-exceeded').catch(() => {})
		}
		return {status: 'success', output: {perUser: usage, over}}
	} catch (err) {
		// NOTE: 'failure', NOT 'error' — JobRunResult.status has no 'error' member.
		return {status: 'failure', error: err instanceof Error ? err.message : String(err)}
	}
}

// =========================================================================
// custom-command — Phase 329 APPS-04 (D-12..15).
//
// A user-defined scheduled command. Runs via execa with the shell option OFF
// AS THE LIVINITYD PROCESS USER — NEVER root, NEVER a privileged wrapper, NEVER
// a shell. The command + args are parsed/validated at SAVE time (upsertJob
// zod → customCommandConfigSchema) and stored as a binary + argv[] literal, so
// there is NO shell-metacharacter surface here (T-329-01). A mandatory bounded
// timeout (300s default / 3600s max, zod-capped) kills the hung child; stored
// output is truncated to the LAST 16 KB (T-329-02). Each run is appended to the
// job_runs history table and retention-pruned in-tick (keep 20/job + 30-day cap,
// D-14). A failure raises a SINGLE coalesced notification key per job, cleared
// on the next success (D-15). Same never-throw contract as userQuotaScanHandler.
// =========================================================================

const OUTPUT_TAIL_BYTES = 16 * 1024

/**
 * Truncate to the LAST 16 KB (byte-accurate). A verbose or looping child cannot
 * bloat the job_runs row or the in-app bell (T-329-02). A partial leading
 * multibyte char left by the byte-slice is rendered/dropped cleanly by toString.
 */
export function tail16k(s: string): string {
	if (typeof s !== 'string' || s.length === 0) return ''
	const buf = Buffer.from(s, 'utf8')
	if (buf.length <= OUTPUT_TAIL_BYTES) return s
	return buf.subarray(buf.length - OUTPUT_TAIL_BYTES).toString('utf8')
}

interface JobRunRecord {
	jobId: string | null
	jobName: string
	startedAt: Date
	finishedAt: Date
	status: JobRunStatus
	output: string | null
	error: string | null
}

/**
 * Append one job_runs history row. Fail-open (mirrors history.ts): no pool →
 * no-op, never throws — a scheduler tick must survive PG being briefly down.
 * All values are parameterized ($1..$7); no caller string reaches the SQL text.
 */
export async function recordJobRun(run: JobRunRecord): Promise<void> {
	const pool = getPool()
	if (!pool) return
	await pool.query(
		`INSERT INTO job_runs (job_id, job_name, started_at, finished_at, status, output, error)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		[run.jobId, run.jobName, run.startedAt, run.finishedAt, run.status, run.output, run.error],
	)
}

/**
 * Retention prune (D-14): drop rows older than 30 days AND keep only the newest
 * 20 rows per job_name. Runs inside the scheduler tick (metrics-rollup retention
 * idiom, history.ts:pruneOldRows). The 30-day interval is a fixed literal (no
 * caller surface); job_name is parameterized. Fail-open — never throws.
 */
export async function pruneJobRuns(jobName: string): Promise<void> {
	const pool = getPool()
	if (!pool) return
	// 30-day cap (global — bounded, cheap).
	await pool.query(`DELETE FROM job_runs WHERE started_at < NOW() - INTERVAL '30 days'`)
	// Keep only the newest 20 rows for THIS job_name.
	await pool.query(
		`DELETE FROM job_runs
		 WHERE job_name = $1
		   AND id NOT IN (
		     SELECT id FROM job_runs WHERE job_name = $1
		     ORDER BY started_at DESC
		     LIMIT 20
		   )`,
		[jobName],
	)
}

export const customCommandHandler: BuiltInJobHandler = async (job, ctx) => {
	// Guard: no daemon ref (isolated unit test / non-daemon caller) → skip cleanly.
	if (!ctx.livinityd) {
		ctx.logger.log(`[scheduler/custom-command] no daemon reference — skipping job ${job.name}`)
		return {status: 'skipped', error: 'daemon reference unavailable'}
	}

	const alertKey = `custom-command:${job.name}` // single coalesced key per job (D-15)
	const startedAt = new Date()
	const cfg = (job.config ?? {}) as {
		command?: unknown
		args?: unknown
		timeoutSec?: unknown
		workingDir?: unknown
	}
	const command = typeof cfg.command === 'string' ? cfg.command : ''
	const args = Array.isArray(cfg.args) ? cfg.args.filter((a): a is string => typeof a === 'string') : []
	// Mandatory bounded timeout, defended a second time here (the zod at upsert is
	// the primary cap): default 300s, hard-clamped to 3600s (D-13).
	const timeoutSec =
		typeof cfg.timeoutSec === 'number' && Number.isFinite(cfg.timeoutSec) && cfg.timeoutSec > 0
			? Math.min(Math.floor(cfg.timeoutSec), 3600)
			: 300
	const workingDir = typeof cfg.workingDir === 'string' && cfg.workingDir.length > 0 ? cfg.workingDir : undefined

	// Defensive: the zod at upsert already requires a non-empty command, but a
	// hand-edited PG row could be malformed — degrade to a recorded failure
	// rather than throwing an unhandled exception into the tick.
	if (!command) {
		const error = 'custom-command job has no command configured'
		await recordJobRun({jobId: job.id, jobName: job.name, startedAt, finishedAt: new Date(), status: 'failure', output: null, error}).catch(() => {})
		await pruneJobRuns(job.name).catch(() => {})
		await ctx.livinityd.notifications.add(alertKey, {severity: 'warning', external: false}).catch(() => {})
		return {status: 'failure', error}
	}

	try {
		ctx.logger.log(`[scheduler/custom-command] running job ${job.name}: ${command} (${args.length} arg(s), ${timeoutSec}s)`)
		// D-12: shell option OFF (no shell metacharacter surface), NON-root (the
		// livinityd process user — no privileged wrapper), `all:true` merges
		// stdout+stderr into one stored stream, `timeout` kills the child tree past the cap.
		const result = await execa(command, args, {
			shell: false,
			timeout: timeoutSec * 1000,
			all: true,
			cwd: workingDir,
		})
		const output = tail16k(result.all ?? result.stdout ?? '')
		await recordJobRun({jobId: job.id, jobName: job.name, startedAt, finishedAt: new Date(), status: 'success', output, error: null}).catch(() => {})
		await pruneJobRuns(job.name).catch(() => {})
		// Clear-on-recovery: a prior failure alert is silenced once the job succeeds.
		await ctx.livinityd.notifications.clear(alertKey).catch(() => {})
		return {status: 'success', output}
	} catch (err) {
		// Non-zero exit, ETIMEDOUT (timeout kill), spawn ENOENT — ALL land here and
		// are NEVER re-thrown (never-throw contract). execa attaches `.all` (merged
		// stdout+stderr) on the error; fall back to the message string.
		const raw =
			err && typeof err === 'object' && 'all' in err && typeof (err as {all?: unknown}).all === 'string' && (err as {all: string}).all.length > 0
				? (err as {all: string}).all
				: err instanceof Error
					? err.message
					: String(err)
		const error = tail16k(raw)
		await recordJobRun({jobId: job.id, jobName: job.name, startedAt, finishedAt: new Date(), status: 'failure', output: null, error}).catch(() => {})
		await pruneJobRuns(job.name).catch(() => {})
		// Failure alert — single coalesced key per job. external:false = in-app bell
		// (a user cron failing is not an ops page-out, unlike disk-critical/ups).
		await ctx.livinityd.notifications.add(alertKey, {severity: 'warning', external: false}).catch(() => {})
		return {status: 'failure', error}
	}
}

// =========================================================================
// pool-sync — Phase 318 POOL-03 (D-07/D-08/D-09).
//
// Nightly background parity maintenance for the storage pool. Flow:
//   diff → D-08 freeze gate (checkFreezeGate) → [blocked → pool-sync-frozen,
//   NO sync] → sync → status → persist storagePool.lastStatusSummary (the W-2
//   protected-file-count source for the NEXT gate) → per-member degradation
//   alerts through the notifications bridge ONLY (D-09).
//
// SAFETY (T-318-13): the freeze gate runs before EVERY auto-sync (Trap 11). If
// more than the threshold of files were removed since the last sync, the sync is
// BLOCKED and pool-sync-frozen is raised — an explicit admin override (318-06)
// is the ONLY way to commit a mass deletion to parity.
//
// Clones the diskCriticalWatchHandler never-throw skeleton (T-318-14): skip-if-
// no-daemon guard; try/catch that NEVER throws; catch returns {status:'failure'}
// (Trap 7 — JobRunResult has NO 'error' member). All snapraid-cli + store seams
// are import-mocked in the unit tests — ZERO live snapraid.
// =========================================================================

// Weekly scrub coverage: 8% per run → full-array coverage in ≈3 months (13
// weeks), the snapraid-aio-script community default (318-RESEARCH). Operator can
// re-tune once ratified against real array performance in 318-HUMAN-UAT.
export const POOL_SCRUB_PERCENT = 8

// Build the injectable PoolStore adapter over the dedicated top-level
// `storagePool` StoreSchema key (D-15), mirroring the 318-05 consumer contract.
function poolStoreFor(livinityd: Livinityd): PoolStore {
	return {
		getPoolState: () => livinityd.store.get('storagePool'),
		setPoolState: async (s) => {
			await livinityd.store.set('storagePool', s)
		},
	}
}

// The snapraid.conf data label for a `/mnt/diskN` mountpoint (`dN`, matching
// renderSnapraidConf's `data dN /mnt/diskN`). A member whose label is absent from
// the latest `snapraid status` disk set is treated as a missing/unreadable branch.
function dataLabelFor(mountpoint: string): string | null {
	const match = /\/mnt\/disk(\d+)$/.exec(mountpoint)
	return match ? `d${match[1]}` : null
}

// Per-member degradation alerts through the notifications bridge ONLY (D-09).
// A data member whose branch label is missing from the latest `status` disk set
// is degraded → raise pool-degraded:<deviceId>; a present branch clears it. Any
// missing branch also raises the system-wide pool-branch-missing (cleared when
// every branch is present). Fire-and-forget (.catch) — an alert dispatch failure
// must never fail the tick (T-318-14). The exact live degradation signal is
// ratified against a real pulled-disk/SMART-fail in 318-HUMAN-UAT.
async function evaluatePoolHealth(
	livinityd: Livinityd,
	state: StoragePoolState,
	status: StatusResult,
): Promise<{degraded: string[]; branchMissing: boolean}> {
	const seen = new Set(Object.keys(status.diskUsePercent ?? {}))
	// WR-05: no per-disk usage tags = NO SIGNAL, not "every branch missing". A
	// fresh/never-synced protected pool (and an `unsynced` status read) reports no
	// `summary:disk_use_percent:*` tags, and a transient/garbled status parse also
	// returns an empty map (parseStatus never throws). Flagging every data member
	// degraded in those cases produced a false all-disks-degraded alert storm on a
	// healthy new pool. Only evaluate degradation against a genuinely-synced status
	// that actually reports at least one branch's usage; otherwise emit no signal.
	// (A REAL single-branch-missing degradation still reports the surviving branches'
	// tags, so `seen` is non-empty and the normal per-member check below runs.)
	if (seen.size === 0 || status.exit === 'unsynced') {
		return {degraded: [], branchMissing: false}
	}
	const degraded: string[] = []
	for (const member of state.members) {
		if (member.role !== 'data') continue
		const label = dataLabelFor(member.mountpoint)
		const id = `pool-degraded:${member.deviceId}`
		// A member whose branch label snapraid no longer reports is degraded/missing.
		if (label && !seen.has(label)) {
			degraded.push(member.deviceId)
			await livinityd.notifications.add(id, {severity: 'warning', external: true}).catch(() => {})
		} else {
			await livinityd.notifications.clear(id).catch(() => {})
		}
	}
	const branchMissing = degraded.length > 0
	if (branchMissing) {
		await livinityd.notifications.add('pool-branch-missing', {severity: 'warning', external: true}).catch(() => {})
	} else {
		await livinityd.notifications.clear('pool-branch-missing').catch(() => {})
	}
	return {degraded, branchMissing}
}

// Persist storagePool.lastStatusSummary from a fresh `snapraid status` parse.
// WR-01: `snapraid status`'s diskUsePercent carries NO absolute file count, so we
// DELIBERATELY leave protectedFileCount UNDEFINED here — deriving it from the
// data-branch count (typically 2) made the freeze-gate percentage leg trip on a
// single deletion (removed/2 > 20% ⇒ any removed ≥ 1 froze the sync). With it
// absent, checkFreezeGate skips the percentage leg and relies on the absolute-count
// leg only, until a genuine protected-file total is parsed (e.g. a `Files:` line
// from status, or a persisted diff running total). The scrub age is carried
// straight through for the UI badge.
function statusSummaryFrom(status: StatusResult): PoolStatusSummary {
	const summary: PoolStatusSummary = {at: Date.now()}
	if (status.scrubOldestDays != null) summary.scrubOldestDays = status.scrubOldestDays
	return summary
}

export const poolSyncHandler: BuiltInJobHandler = async (job, ctx) => {
	// Guard: no daemon ref (isolated unit test / Scheduler built without
	// livinityd) → skip cleanly, never throw.
	if (!ctx.livinityd) {
		ctx.logger.log(`[scheduler/pool-sync] no daemon reference — skipping job ${job.name}`)
		return {status: 'skipped', error: 'daemon reference unavailable'}
	}
	const startedAt = new Date()
	try {
		ctx.logger.log(`[scheduler/pool-sync] running job ${job.name}`)
		const store = poolStoreFor(ctx.livinityd)
		const state = await store.getPoolState()
		// No pool configured yet → nothing to sync (skip cleanly, no alert noise).
		if (!state?.members?.length) {
			return {status: 'skipped', error: 'no storage pool configured'}
		}
		// Combine-only pools have no parity → a sync is a no-op; skip cleanly.
		if (state.protectionLevel !== 'protected') {
			return {status: 'skipped', error: 'pool is combine-only (no parity to sync)'}
		}

		// (1) diff — the mass-deletion count that feeds the D-08 freeze gate.
		const diff = await snapraidCli.diff()

		// (1a) IN-01 — FAIL CLOSED on an inconclusive diff. `parseDiff` defaults to
		// `removed:0, exit:null` on any log with no `summary:*` tag (a wrapper non-zero
		// exit, truncated/garbled output). Committing a sync on an assumed-zero deletion
		// count would silently bypass the D-08 mass-deletion protection — this IS the
		// safety gate. A null exit means "we could not read the diff", so we BLOCK the
		// auto-sync and raise the same frozen notification rather than proceeding.
		if (diff.exit === null) {
			await ctx.livinityd.notifications
				.add('pool-sync-frozen', {severity: 'warning', external: true})
				.catch(() => {})
			const output = {frozen: true, inconclusive: true, reason: 'diff produced no parseable summary — sync blocked (fail-closed)'}
			await recordJobRun({jobId: job.id, jobName: job.name, startedAt, finishedAt: new Date(), status: 'skipped', output: JSON.stringify(output), error: null}).catch(() => {})
			await pruneJobRuns(job.name).catch(() => {})
			return {status: 'skipped', output}
		}

		// (2) freeze gate BEFORE the sync (Trap 11 / T-318-13). protectedFileCount =
		// the last persisted status summary (W-2); absent → absolute-count leg only.
		const protectedFileCount = state.lastStatusSummary?.protectedFileCount ?? null
		const gate = checkFreezeGate({removed: diff.counts.removed}, protectedFileCount, state.safetyFreezeThreshold)
		if (gate.blocked) {
			// BLOCK the sync + raise pool-sync-frozen (an admin override in 318-06 is
			// the ONLY path that commits the deletion). Fire-and-forget dispatch.
			await ctx.livinityd.notifications.add('pool-sync-frozen', {severity: 'warning', external: true}).catch(() => {})
			const output = {frozen: true, removed: diff.counts.removed, reason: gate.reason}
			await recordJobRun({jobId: job.id, jobName: job.name, startedAt, finishedAt: new Date(), status: 'success', output: JSON.stringify(output), error: null}).catch(() => {})
			await pruneJobRuns(job.name).catch(() => {})
			return {status: 'success', output}
		}
		// Not frozen → clear any stale freeze alert (recovery).
		await ctx.livinityd.notifications.clear('pool-sync-frozen').catch(() => {})

		// (3) sync — bring parity current.
		const sync = await snapraidCli.sync()

		// (4) status → persist lastStatusSummary (the W-2 source for the NEXT gate).
		const status = await snapraidCli.status()
		const lastStatusSummary = statusSummaryFrom(status)
		await store.setPoolState({
			...state,
			lastSync: {at: Date.now(), added: diff.counts.added, removed: diff.counts.removed, updated: diff.counts.updated},
			lastStatusSummary,
		})

		// (5) degradation alerts through the notifications bridge ONLY (D-09).
		const health = await evaluatePoolHealth(ctx.livinityd, state, status)

		const output = {added: diff.counts.added, removed: diff.counts.removed, updated: diff.counts.updated, syncExit: sync.exit, degraded: health.degraded, branchMissing: health.branchMissing}
		await recordJobRun({jobId: job.id, jobName: job.name, startedAt, finishedAt: new Date(), status: 'success', output: JSON.stringify(output), error: null}).catch(() => {})
		await pruneJobRuns(job.name).catch(() => {})
		return {status: 'success', output}
	} catch (err) {
		// NOTE: 'failure', NOT 'error' — JobRunResult.status has no 'error' member.
		const error = err instanceof Error ? err.message : String(err)
		await recordJobRun({jobId: job.id, jobName: job.name, startedAt, finishedAt: new Date(), status: 'failure', output: null, error}).catch(() => {})
		await pruneJobRuns(job.name).catch(() => {})
		return {status: 'failure', error}
	}
}

// =========================================================================
// pool-scrub — Phase 318 POOL-03 (D-07/D-09).
//
// Weekly parity verification: `snapraid scrub -p <percent>` reads back a rolling
// slice of already-synced data and compares it to parity, catching silent bit-rot
// before a real disk failure needs it. Records the run in job_runs, refreshes
// storagePool.lastStatusSummary, and raises/clears the same D-09 degradation
// alerts as pool-sync. Same never-throw skeleton (Trap 7). Scrub does NOT run the
// freeze gate — it never deletes or re-writes parity, it only verifies.
// =========================================================================
export const poolScrubHandler: BuiltInJobHandler = async (job, ctx) => {
	if (!ctx.livinityd) {
		ctx.logger.log(`[scheduler/pool-scrub] no daemon reference — skipping job ${job.name}`)
		return {status: 'skipped', error: 'daemon reference unavailable'}
	}
	const startedAt = new Date()
	try {
		ctx.logger.log(`[scheduler/pool-scrub] running job ${job.name}`)
		const store = poolStoreFor(ctx.livinityd)
		const state = await store.getPoolState()
		if (!state?.members?.length) {
			return {status: 'skipped', error: 'no storage pool configured'}
		}
		// Combine-only pools have no parity → nothing to scrub; skip cleanly.
		if (state.protectionLevel !== 'protected') {
			return {status: 'skipped', error: 'pool is combine-only (no parity to scrub)'}
		}

		// (1) scrub a rolling percentage slice (config-tunable; default 8% ≈ 3-month coverage).
		const cfg = (job.config ?? {}) as {percent?: unknown}
		const percent =
			typeof cfg.percent === 'number' && Number.isInteger(cfg.percent) && cfg.percent >= 0 && cfg.percent <= 100
				? cfg.percent
				: POOL_SCRUB_PERCENT
		const scrub = await snapraidCli.scrub({percent})

		// (2) status → refresh lastStatusSummary (scrub age badge + W-2 count).
		const status = await snapraidCli.status()
		await store.setPoolState({
			...state,
			lastScrub: {at: Date.now()},
			lastStatusSummary: statusSummaryFrom(status),
		})

		// (3) degradation alerts through the notifications bridge ONLY (D-09).
		const health = await evaluatePoolHealth(ctx.livinityd, state, status)

		const output = {percent, scrubExit: scrub.exit, errorData: scrub.errorData, degraded: health.degraded, branchMissing: health.branchMissing}
		await recordJobRun({jobId: job.id, jobName: job.name, startedAt, finishedAt: new Date(), status: 'success', output: JSON.stringify(output), error: null}).catch(() => {})
		await pruneJobRuns(job.name).catch(() => {})
		return {status: 'success', output}
	} catch (err) {
		// NOTE: 'failure', NOT 'error' — JobRunResult.status has no 'error' member.
		const error = err instanceof Error ? err.message : String(err)
		await recordJobRun({jobId: job.id, jobName: job.name, startedAt, finishedAt: new Date(), status: 'failure', output: null, error}).catch(() => {})
		await pruneJobRuns(job.name).catch(() => {})
		return {status: 'failure', error}
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
	'app-auto-update': appAutoUpdateHandler,
	'ups-watch': upsWatchHandler,
	'user-quota-scan': userQuotaScanHandler,
	'custom-command': customCommandHandler, // Phase 329 APPS-04 (user-created only — never auto-seeded)
	'pool-sync': poolSyncHandler, // Phase 318 POOL-03 — nightly diff→freeze-gate→sync
	'pool-scrub': poolScrubHandler, // Phase 318 POOL-03 — weekly scrub -p parity verification
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
	// Phase 326 APPS-02 — true auto-update. Daily 4am off-peak. enabled=true is SAFE
	// because autoUpdatePolicy defaults to 'manual', so this handler updates NOTHING
	// until an admin explicitly opts an app into 'auto' (T-326-17); the ignoredVersion
	// pin is honored and each app runs in its own try/catch (T-326-18).
	{name: 'app-auto-update', schedule: '0 4 * * *', type: 'app-auto-update', enabled: true},
	// Phase 326 HW-01 — UPS status watch, every minute. enabled=true: a box with no
	// UPS returns 'unavailable' (no-op, no LLM spend), and mains-loss must alert even
	// with no Settings tab open. This poll is STATUS/ALERT-only — upsmon (POLLFREQ 5s)
	// owns the actual shutdown decision, never this ≥1-min tick.
	{name: 'ups-watch', schedule: '* * * * *', type: 'ups-watch', enabled: true},
	// Phase 325 STOR-02 — app-layer per-user du accounting, every 30 min. enabled=true:
	// a du walk is cheap (no LLM spend) and a user approaching their quota must be warned
	// even with no Settings tab open. Serialized per-user under nice/ionice on the box.
	// Between-ticks enforcement is APPROXIMATE — D-05 residual gap (documented in-handler):
	// the hard block is best-effort against the last-scan cache; kernel quotas DEFERRED.
	{name: 'user-quota-scan', schedule: '*/30 * * * *', type: 'user-quota-scan', enabled: true},
	// Phase 318 POOL-03 — nightly pool parity sync at 02:00. enabled=true (D-07): a
	// no-op when no pool exists (skips cleanly), no LLM spend, and unsynced parity
	// after a day of writes must be brought current even with no Settings tab open.
	// The D-08 freeze gate runs BEFORE every sync, so a mass deletion is blocked +
	// alerted rather than silently committed to parity (same enabled-safe rationale
	// as disk-critical-watch — the safety-critical work must fire unattended).
	{name: 'pool-sync', schedule: '0 2 * * *', type: 'pool-sync', enabled: true},
	// Phase 318 POOL-03 — weekly parity scrub Sunday 03:00 (one hour after the
	// nightly sync so they never overlap). enabled=true (D-07): a no-op on a
	// combine-only / absent pool, cheap rolling 8% slice (≈3-month full coverage),
	// and silent bit-rot must be caught before a real disk failure needs parity.
	{name: 'pool-scrub', schedule: '0 3 * * 0', type: 'pool-scrub', enabled: true},
]
