// Phase 20 — Built-in scheduled job handlers
//
// Each handler implements the BuiltInJobHandler signature: takes the fresh
// ScheduledJob row + a logger, returns a JobRunResult. Handlers MUST NOT throw
// for per-target errors — they should aggregate per-target failures into the
// output JSON and only throw for catastrophic, job-wide failures.

import {execa} from 'execa'

import {listContainers, pruneImages, isProtectedContainer} from '../docker/docker.js'
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
// git-stack-sync — placeholder until Phase 21 ships GitOps stacks.
// Returns 'skipped' so the run is recorded but no work happens.
// =========================================================================
export const gitStackSyncHandler: BuiltInJobHandler = async (job, ctx) => {
	ctx.logger.log(
		`[scheduler/git-stack-sync] placeholder — Phase 21 will iterate git-backed stacks and run git pull + redeploy if HEAD changed (job: ${job.name})`,
	)
	return {status: 'skipped', output: {reason: 'pending-phase-21'}}
}

// =========================================================================
// Registry: jobType -> handler mapping.
// volume-backup is intentionally a stub here — Plan 20-02 wires the real one.
// =========================================================================
export const BUILT_IN_HANDLERS: Record<JobType, BuiltInJobHandler> = {
	'image-prune': imagePruneHandler,
	'container-update-check': containerUpdateCheckHandler,
	'git-stack-sync': gitStackSyncHandler,
	'volume-backup': async () => {
		throw new Error('volume-backup handler not registered — Plan 20-02 wires it')
	},
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
	{name: 'git-stack-sync', schedule: '0 * * * *', type: 'git-stack-sync', enabled: false},
]
