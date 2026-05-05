// Phase 19 (CGV-02/03/04) — On-demand image vulnerability scanning via Trivy
//
// Runs `aquasec/trivy:latest` inside an ephemeral Docker container against
// the requested image, parses its JSON output, and caches the result in
// Redis keyed by the image SHA256 digest for 7 days.
//
// All scans are user-initiated (CGV-04: no scheduler / no auto-scan / no
// background polling). The cache key is the digest, not the tag, so two
// different tags pointing at the same digest share a cache entry.

import Dockerode from 'dockerode'
import {Redis} from 'ioredis'
import {execa} from 'execa'

import type {VulnScanResult, CveEntry, Severity} from './types.js'

// Singleton Dockerode -- mirrors docker.ts pattern
const docker = new Dockerode()

const TRIVY_IMAGE = 'aquasec/trivy:latest'
const CACHE_PREFIX = 'liv:vuln:'
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days
const TRIVY_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

// Severity rank — index = ranking (lower is more severe). Anything outside
// this list (e.g. UNKNOWN) is dropped per the CGV-02 spec which only
// surfaces the four documented levels.
const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const SEVERITY_SET = new Set<string>(SEVERITY_ORDER)

// -----------------------------------------------------------------------
// Redis singleton (same lazy pattern as stacks.ts:getStore)
// -----------------------------------------------------------------------

let _redis: Redis | null = null
function getRedis(): Redis {
	if (!_redis) {
		_redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
			maxRetriesPerRequest: null,
		})
	}
	return _redis
}

function cacheKey(digest: string): string {
	// Strip sha256: prefix to match the spec from 19-CONTEXT.md (`liv:vuln:<sha256>`)
	return CACHE_PREFIX + digest.replace(/^sha256:/, '')
}

// -----------------------------------------------------------------------
// Resolve a tag/ref to its sha256 digest via dockerode inspect
// -----------------------------------------------------------------------

async function resolveDigest(imageRef: string): Promise<string> {
	try {
		const info = await docker.getImage(imageRef).inspect()
		// info.Id is "sha256:<hex>" for locally pulled images
		return info.Id
	} catch (err: any) {
		if (err.statusCode === 404 || err.reason === 'no such image') {
			throw new Error(`[image-not-found] Image not found: ${imageRef}`)
		}
		throw err
	}
}

// -----------------------------------------------------------------------
// Ensure aquasec/trivy:latest is locally cached. Pulls on first use only.
// -----------------------------------------------------------------------

async function ensureTrivyImage(): Promise<void> {
	try {
		await docker.getImage(TRIVY_IMAGE).inspect()
		return
	} catch (err: any) {
		if (err.statusCode !== 404 && err.reason !== 'no such image') {
			throw err
		}
		// Fall through to pull
	}

	try {
		await new Promise<void>((resolve, reject) => {
			docker.pull(TRIVY_IMAGE, (err: any, stream: any) => {
				if (err) return reject(err)
				docker.modem.followProgress(stream, (followErr: any) => {
					if (followErr) return reject(followErr)
					resolve()
				})
			})
		})
	} catch (err: any) {
		throw new Error(
			`[trivy-unavailable] Could not pull ${TRIVY_IMAGE}: ${err.message || err}`,
		)
	}
}

// -----------------------------------------------------------------------
// Run Trivy and capture stdout (pure JSON thanks to --quiet + --format json)
// -----------------------------------------------------------------------

async function runTrivyAndCollectStdout(imageRef: string): Promise<string> {
	const args = [
		'run',
		'--rm',
		'-v',
		'/var/run/docker.sock:/var/run/docker.sock',
		TRIVY_IMAGE,
		'image',
		imageRef,
		'--format',
		'json',
		'--severity',
		'CRITICAL,HIGH,MEDIUM,LOW',
		'--quiet',
	]

	let result
	try {
		result = await execa('docker', args, {
			reject: false,
			timeout: TRIVY_TIMEOUT_MS,
			// Trivy DBs + JSON for many CVEs can exceed default 1MB
			maxBuffer: 64 * 1024 * 1024,
		})
	} catch (err: any) {
		if (err.timedOut) {
			throw new Error('[trivy-timeout] Scan exceeded 5 minutes')
		}
		throw new Error(`[trivy-failed] ${err.shortMessage || err.message || err}`)
	}

	if (result.timedOut) {
		throw new Error('[trivy-timeout] Scan exceeded 5 minutes')
	}

	if (result.exitCode !== 0) {
		const stderr = (result.stderr || '').toString().slice(0, 1000)
		throw new Error(`[trivy-failed] ${stderr || 'Trivy exited with non-zero code'}`)
	}

	return result.stdout.toString()
}

// -----------------------------------------------------------------------
// Parse Trivy JSON into a VulnScanResult
// -----------------------------------------------------------------------

function bestCvss(cvss: any): number | null {
	if (!cvss || typeof cvss !== 'object') return null
	const candidates = [
		cvss?.nvd?.V3Score,
		cvss?.redhat?.V3Score,
		cvss?.ghsa?.V3Score,
		cvss?.nvd?.V2Score,
		cvss?.redhat?.V2Score,
	].filter((n) => typeof n === 'number')
	if (candidates.length === 0) return null
	return Math.max(...candidates)
}

function parseTrivyJson(
	raw: string,
	imageRef: string,
	digest: string,
	trivyVersion: string,
): VulnScanResult {
	let json: any
	try {
		json = JSON.parse(raw)
	} catch (err) {
		throw new Error(
			`[trivy-parse] Could not parse Trivy output (first 200 chars: ${raw.slice(0, 200)})`,
		)
	}

	const counts: Record<Severity, number> = {
		CRITICAL: 0,
		HIGH: 0,
		MEDIUM: 0,
		LOW: 0,
	}
	const cves: CveEntry[] = []

	const results = Array.isArray(json.Results) ? json.Results : []
	for (const r of results) {
		const vulns = Array.isArray(r?.Vulnerabilities) ? r.Vulnerabilities : []
		for (const v of vulns) {
			const sev = (v.Severity || '').toString().toUpperCase()
			if (!SEVERITY_SET.has(sev)) continue // drop UNKNOWN, etc.

			const severity = sev as Severity
			counts[severity]++

			cves.push({
				id: v.VulnerabilityID || '',
				severity,
				packageName: v.PkgName ?? '',
				installedVersion: v.InstalledVersion ?? '',
				fixedVersion: v.FixedVersion ? String(v.FixedVersion) : null,
				cvss: bestCvss(v.CVSS),
				title: v.Title ?? v.VulnerabilityID ?? '',
				description: ((v.Description ?? '') as string).slice(0, 500),
				primaryUrl: v.PrimaryURL ?? null,
			})
		}
	}

	// Sort: severity asc by SEVERITY_ORDER index → cvss desc → id asc (stable)
	cves.sort((a, b) => {
		const sevDelta = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
		if (sevDelta !== 0) return sevDelta
		const aCvss = a.cvss ?? -1
		const bCvss = b.cvss ?? -1
		if (aCvss !== bCvss) return bCvss - aCvss
		return a.id.localeCompare(b.id)
	})

	return {
		imageRef,
		imageDigest: digest,
		scannedAt: Date.now(),
		counts,
		cves,
		trivyVersion,
		cached: false,
	}
}

// -----------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------

/**
 * Look up a previously cached scan for an image without running Trivy.
 * Returns null when the image was never scanned (or the cache expired).
 */
export async function getCachedScan(imageRef: string): Promise<VulnScanResult | null> {
	const digest = await resolveDigest(imageRef)
	const raw = await getRedis().get(cacheKey(digest))
	if (!raw) return null

	try {
		const result = JSON.parse(raw) as VulnScanResult
		result.cached = true
		// imageRef may differ if user pulled a new tag pointing at the same digest;
		// surface the *current* ref so the UI shows what was scanned.
		result.imageRef = imageRef
		return result
	} catch {
		// Corrupt cache entry — treat as miss
		return null
	}
}

/**
 * Run a Trivy scan against the supplied image reference.
 *
 * - Resolves digest once and uses it as the cache key.
 * - When `force=false` (default): returns cached result if present.
 * - When `force=true`: bypasses cache, always runs Trivy, overwrites cache.
 *
 * Throws errors with bracketed prefixes that routes.ts maps to TRPCError codes:
 *   [image-not-found] [trivy-failed] [trivy-timeout] [trivy-parse] [trivy-unavailable]
 */
export async function scanImage(imageRef: string, force?: boolean): Promise<VulnScanResult> {
	// 1. Resolve digest BEFORE doing any expensive work (also surfaces 404 cleanly)
	const digest = await resolveDigest(imageRef)
	const key = cacheKey(digest)

	// 2. Try cache (unless caller forced rescan)
	if (!force) {
		const rawCached = await getRedis().get(key)
		if (rawCached) {
			try {
				const cached = JSON.parse(rawCached) as VulnScanResult
				cached.cached = true
				cached.imageRef = imageRef
				return cached
			} catch {
				// Fall through and run a fresh scan — corrupt entry will be overwritten.
			}
		}
	}

	// 3. Make sure the scanner image is present locally
	await ensureTrivyImage()

	// 4. Run Trivy and capture stdout
	const raw = await runTrivyAndCollectStdout(imageRef)

	// 5. Pull SchemaVersion for traceability (best-effort)
	let trivyVersion = 'unknown'
	try {
		const peek = JSON.parse(raw)
		if (peek?.SchemaVersion !== undefined) trivyVersion = String(peek.SchemaVersion)
	} catch {
		// parseTrivyJson will throw the proper [trivy-parse] error below
	}

	const result = parseTrivyJson(raw, imageRef, digest, trivyVersion)

	// 6. Cache for 7 days. Store with cached: false so reads can flip the flag
	//    without mutating the persisted payload.
	try {
		await getRedis().set(
			key,
			JSON.stringify({...result, cached: false}),
			'EX',
			CACHE_TTL_SECONDS,
		)
	} catch {
		// Redis unavailable — non-fatal, return the fresh scan anyway.
	}

	return result
}
