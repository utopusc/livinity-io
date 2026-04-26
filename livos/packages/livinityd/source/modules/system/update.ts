import {$} from 'execa'
import fs from 'node:fs/promises'
import stripAnsi from 'strip-ansi'

import type {ProgressStatus} from '../apps/schema.js'
import Livinityd from '../../index.js'

type UpdateStatus = ProgressStatus

const GITHUB_COMMITS_URL = 'https://api.github.com/repos/utopusc/livinity-io/commits/master'
const GITHUB_TAGS_URL = 'https://api.github.com/repos/utopusc/livinity-io/tags?per_page=20'
const DEPLOYED_SHA_PATH = '/opt/livos/.deployed-sha'

// Phase 30 hot-patch round 9: in-memory cache to dampen GitHub rate-limit
// pressure (60 req/hr unauth per IP). Without these caches the UI page-load
// burst of {checkUpdate query + version query + windowFocus refetch + manual
// "Check for updates" click} can issue 4-6 requests in seconds and exhaust
// the quota. With caches, repeated calls reuse the same response until TTL.
const COMMITS_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes — checkUpdate hot path
const TAGS_CACHE_TTL_MS = 60 * 60 * 1000   // 1 hour — tags rarely change

let commitsCache: {at: number; data: any} | null = null
let tagsCache: {at: number; data: Array<{name: string; commit: {sha: string}}>} | null = null

// Phase 30 hot-patch round 5: resolve a human-friendly version label.
// Strategy: pull the most recent tags from GitHub, find the tag whose commit SHA
// matches the latest master commit. If none match exactly, find the most recent
// tag whose commit is an ancestor (best-effort) and append "+shortSha". If the
// tags API fails or returns nothing, fall back to the bare shortSha.
// Round 8: read the locally-deployed SHA so the UI's "current version" pill
// can be derived from the same source-of-truth as the "latest version" check.
// Returns null when the file doesn't exist yet (first boot, pre-update.sh-ever).
export async function readDeployedSha(): Promise<string | null> {
	try {
		return (await fs.readFile(DEPLOYED_SHA_PATH, 'utf8')).trim()
	} catch (err: any) {
		if (err.code === 'ENOENT') return null
		throw err
	}
}

export async function resolveVersionLabel(
	latestSha: string,
	livinityd: Livinityd,
): Promise<string> {
	try {
		// Round 9: serve from in-memory cache when fresh — tags only change
		// when a new release is published, so 1-hour TTL is generous.
		let tags: Array<{name: string; commit: {sha: string}}> | null = null
		if (tagsCache && Date.now() - tagsCache.at < TAGS_CACHE_TTL_MS) {
			tags = tagsCache.data
		} else {
			const response = await fetch(GITHUB_TAGS_URL, {
				headers: {
					'User-Agent': `LivOS-${livinityd.version}`,
					Accept: 'application/vnd.github+json',
				},
			})
			if (response.ok) {
				tags = (await response.json()) as Array<{name: string; commit: {sha: string}}>
				tagsCache = {at: Date.now(), data: tags}
			} else if (tagsCache) {
				// Round 9: rate-limit / network failure → reuse last good response
				// rather than degrading to bare shortSha. Better stale than blank.
				tags = tagsCache.data
			}
		}
		if (!tags) return latestSha.slice(0, 7)

		const exact = tags.find((t) => t.commit.sha === latestSha)
		if (exact) return exact.name.startsWith('v') ? exact.name : `v${exact.name}`
		const newest = tags[0]
		if (newest) {
			const tagLabel = newest.name.startsWith('v') ? newest.name : `v${newest.name}`
			return `${tagLabel}+${latestSha.slice(0, 7)}`
		}
		return latestSha.slice(0, 7)
	} catch {
		return latestSha.slice(0, 7)
	}
}

// Phase 30 UPD-02: progress-percent map for the update.sh `━━━ Section ━━━` markers.
// Sections are emitted by /opt/livos/update.sh as it walks the deploy steps.
const SECTION_PROGRESS: Record<string, number> = {
	'Pulling latest code': 10,
	'Updating LivOS source files': 20,
	'Updating Nexus source files': 30,
	'Installing dependencies': 50,
	'Building packages': 65,
	'Updating gallery cache': 85,
	'Fixing permissions': 90,
	'Restarting services': 95,
	Cleanup: 98,
}

let updateStatus: UpdateStatus
resetUpdateStatus()

function resetUpdateStatus() {
	updateStatus = {running: false, progress: 0, description: '', error: false}
}

function setUpdateStatus(properties: Partial<UpdateStatus>) {
	updateStatus = {...updateStatus, ...properties}
}

export function getUpdateStatus() {
	return updateStatus
}

export async function getLatestRelease(livinityd: Livinityd) {
	// 1. Read locally deployed SHA. ENOENT on first run is expected (update.sh
	// hasn't recorded it yet) — treat as empty so the UI advertises an update.
	let localSha = ''
	try {
		localSha = (await fs.readFile(DEPLOYED_SHA_PATH, 'utf8')).trim()
	} catch (err: any) {
		if (err.code !== 'ENOENT') throw err
	}

	// 2. Fetch latest commit on master. Round 9: in-memory cache (5 min TTL)
	// dampens GitHub rate-limit pressure when the UI bursts requests on
	// page load + window focus + manual check.
	type CommitData = {
		sha: string
		commit: {message: string; author: {name: string; email: string; date: string}}
	}
	let data: CommitData | null = null
	if (commitsCache && Date.now() - commitsCache.at < COMMITS_CACHE_TTL_MS) {
		data = commitsCache.data
	} else {
		const response = await fetch(GITHUB_COMMITS_URL, {
			headers: {
				'User-Agent': `LivOS-${livinityd.version}`,
				Accept: 'application/vnd.github+json',
			},
		})
		if (response.ok) {
			data = (await response.json()) as CommitData
			commitsCache = {at: Date.now(), data}
		} else if (commitsCache) {
			// Round 9: rate-limit / 5xx → serve stale cache rather than fail
			data = commitsCache.data
			livinityd.logger.log(
				`GitHub API returned ${response.status} on checkUpdate; serving cached response`,
			)
		} else {
			// Round 10: cold-start cache miss + GitHub fail → graceful fallback.
			// Return empty/safe defaults instead of throwing. The UI will compute
			// available=false (no SHA to compare), avoiding the "Failed to check
			// for updates" toast spam during rate-limit windows. Cache populates
			// on the next successful call once GitHub quota resets.
			livinityd.logger.log(
				`GitHub API ${response.status} on cold checkUpdate; returning empty stub (will retry on next call)`,
			)
			data = {
				sha: '',
				commit: {
					message: '',
					author: {name: '', email: '', date: new Date().toISOString()},
				},
			}
		}
	}
	if (!data) {
		// Should be unreachable now, but keep the safety net.
		data = {
			sha: '',
			commit: {message: '', author: {name: '', email: '', date: new Date().toISOString()}},
		}
	}

	// Round 5: human-friendly version label (e.g. "v28.0.1" or "v28.0.1+30bacc28").
	// Round 10: skip resolveVersionLabel entirely if data.sha is empty (cold-start
	// fallback) to avoid burning a tags-API call when commits API already failed.
	const version = data.sha ? await resolveVersionLabel(data.sha, livinityd) : ''

	return {
		// Round 10: empty SHA (cold-start fallback) → available=false so the UI
		// quietly shows "On latest" instead of misfiring an update prompt.
		available: data.sha !== '' && data.sha !== localSha,
		sha: data.sha,
		shortSha: data.sha.slice(0, 7),
		version,
		message: data.commit.message,
		author: data.commit.author.name,
		committedAt: data.commit.author.date,
	}
}

export async function performUpdate(livinityd: Livinityd): Promise<boolean> {
	setUpdateStatus({running: true, progress: 5, description: 'Starting update...', error: false})

	try {
		const proc = $({cwd: '/opt/livos'})`bash /opt/livos/update.sh`

		const handleOutput = (chunk: Buffer) => {
			const text = stripAnsi(chunk.toString())
			for (const line of text.split('\n')) {
				const sectionMatch = line.match(/━━━\s+(.+?)\s+━━━/)
				if (sectionMatch && SECTION_PROGRESS[sectionMatch[1]] !== undefined) {
					setUpdateStatus({
						progress: SECTION_PROGRESS[sectionMatch[1]],
						description: sectionMatch[1],
					})
				}
			}
		}

		proc.stdout?.on('data', handleOutput)
		proc.stderr?.on('data', handleOutput)
		await proc
	} catch (error) {
		const errMessage = (error as Error).message ?? 'Update failed'
		if (!updateStatus.error) setUpdateStatus({error: errMessage})
		// Reset state but preserve the error so the UI can differentiate a
		// fresh failure from a successful update that's about to restart services.
		const errorStatus = updateStatus.error
		resetUpdateStatus()
		setUpdateStatus({error: errorStatus})
		livinityd.logger.error('update.sh failed', error)
		return false
	}

	setUpdateStatus({running: false, progress: 100, description: 'Updated', error: false})
	return true
}
