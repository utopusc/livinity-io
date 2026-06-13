import {$} from 'execa'
import fs from 'node:fs/promises'
import stripAnsi from 'strip-ansi'

import type {ProgressStatus} from '../apps/schema.js'
import Livinityd from '../../index.js'

type UpdateStatus = ProgressStatus

const GITHUB_TAGS_URL = 'https://api.github.com/repos/utopusc/livinity-io/tags?per_page=20'
// Phase 266 — release-based detection. /releases/latest returns the newest
// NON-prerelease published Release, or 404 when none exist yet (graceful).
const GITHUB_RELEASES_LATEST_URL =
	'https://api.github.com/repos/utopusc/livinity-io/releases/latest'
const DEPLOYED_SHA_PATH = '/opt/livos/.deployed-sha'
// Phase 266 — update.sh records the deployed RELEASE TAG here (next to
// .deployed-sha) so detection can compare tags, not just commit SHAs.
const DEPLOYED_RELEASE_PATH = '/opt/livos/.deployed-release'

// Phase 30 hot-patch round 9: in-memory cache to dampen GitHub rate-limit
// pressure (60 req/hr unauth per IP). Without these caches the UI page-load
// burst of {checkUpdate query + version query + windowFocus refetch + manual
// "Check for updates" click} can issue 4-6 requests in seconds and exhaust
// the quota. With caches, repeated calls reuse the same response until TTL.
const TAGS_CACHE_TTL_MS = 60 * 60 * 1000   // 1 hour — tags rarely change
const RELEASES_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes — releases change rarely

let tagsCache: {at: number; data: Array<{name: string; commit: {sha: string}}>} | null = null

// Phase 266 — shape captured from /releases/latest. `data: null` is a VALID
// cached value meaning "GitHub returned 404 — no releases published yet" (the
// graceful-fallback state, NOT an error) so we don't re-hammer the API.
type ReleaseData = {
	tag_name: string
	name: string | null
	body: string | null
	html_url: string
	published_at: string | null
	target_commitish: string
}
let releasesCache: {at: number; data: ReleaseData | null} | null = null

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

// Phase 266 — the release tag update.sh last deployed (e.g. "v44.0"). Null on
// pre-266 boxes (file never written) → detection falls back to a SHA compare.
export async function readDeployedRelease(): Promise<string | null> {
	try {
		const v = (await fs.readFile(DEPLOYED_RELEASE_PATH, 'utf8')).trim()
		return v || null
	} catch (err: any) {
		if (err.code === 'ENOENT') return null
		throw err
	}
}

// Phase 266 — fetch the latest published GitHub Release. NEVER throws: a 404
// (no releases yet) returns null and is cached as null; rate-limit/5xx/network
// serve the last good value (which may itself be null) so the UI degrades to a
// quiet "On latest" instead of an error toast. Mirrors the commits/tags cache.
async function fetchLatestRelease(livinityd: Livinityd): Promise<ReleaseData | null> {
	if (releasesCache && Date.now() - releasesCache.at < RELEASES_CACHE_TTL_MS) {
		return releasesCache.data
	}
	try {
		const response = await fetch(GITHUB_RELEASES_LATEST_URL, {
			headers: {
				'User-Agent': `LivOS-${livinityd.version}`,
				Accept: 'application/vnd.github+json',
			},
		})
		if (response.status === 404) {
			// No releases published yet — the graceful-fallback state, not an error.
			releasesCache = {at: Date.now(), data: null}
			return null
		}
		if (response.ok) {
			const data = (await response.json()) as ReleaseData
			releasesCache = {at: Date.now(), data}
			return data
		}
		// Rate-limit / 5xx → serve stale (incl. a previously-cached null).
		if (releasesCache) {
			livinityd.logger.log(
				`GitHub releases API ${response.status} on checkUpdate; serving cached value`,
			)
			return releasesCache.data
		}
		return null
	} catch (err) {
		// Network/DNS failure → stale or null. Never propagate.
		if (releasesCache) return releasesCache.data
		livinityd.logger.log(`GitHub releases API unreachable on checkUpdate: ${String(err)}`)
		return null
	}
}

// Phase 266 — resolve a release tag (e.g. "v44.0") to its commit SHA via the
// (cached) tags list. Used only when a box has no .deployed-release recorded
// yet (pre-266) so we can compare the release's commit against .deployed-sha
// and avoid a one-time false "update available" on a box already on that code.
async function resolveTagSha(tagName: string, livinityd: Livinityd): Promise<string | null> {
	let tags: Array<{name: string; commit: {sha: string}}> | null =
		tagsCache && Date.now() - tagsCache.at < TAGS_CACHE_TTL_MS ? tagsCache.data : null
	if (!tags) {
		try {
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
				tags = tagsCache.data
			}
		} catch {
			if (tagsCache) tags = tagsCache.data
		}
	}
	if (!tags) return null
	const match = tags.find((t) => t.name === tagName)
	return match ? match.commit.sha : null
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
	// Phase 266 — RELEASE-based detection. Compare the latest PUBLISHED GitHub
	// Release tag against the release this box last deployed (.deployed-release),
	// with a commit-SHA fallback for pre-266 boxes that never recorded one.
	// Read the deployed release tag + commit SHA.
	const deployedRelease = await readDeployedRelease() // tag (e.g. "v44.0") or null
	let deployedSha = ''
	try {
		deployedSha = (await fs.readFile(DEPLOYED_SHA_PATH, 'utf8')).trim()
	} catch (err: any) {
		if (err.code !== 'ENOENT') throw err
	}

	const release = await fetchLatestRelease(livinityd)

	// No release published yet (404) OR the API is down on a cold cache.
	// Graceful fallback: advertise NO update + show a sensible current-version
	// label (deployed release tag if known, else resolved from the commit). This
	// preserves the old behaviour for a release-less repo: quiet "On latest",
	// NO throw, NO error toast.
	if (!release) {
		const fallbackLabel =
			deployedRelease ||
			(deployedSha ? await resolveVersionLabel(deployedSha, livinityd) : '')
		return {
			available: false,
			sha: deployedSha,
			shortSha: deployedSha ? deployedSha.slice(0, 7) : '',
			version: fallbackLabel,
			message: '',
			author: '',
			committedAt: '',
			notes: '',
			publishedAt: '',
			releaseUrl: '',
		}
	}

	// Resolve the release tag's commit SHA (cheap — reuses the tags cache). Used
	// both for the pre-266 SHA compare AND as the returned `sha` so the
	// UpdateNotification card's `shasDiffer` guard (current vs latest sha) keeps
	// working: the LATEST release tag is always the newest tag, so it resolves.
	const releaseSha = await resolveTagSha(release.tag_name, livinityd)

	// A release exists — is THIS box behind it?
	let available: boolean
	if (deployedRelease) {
		// Steady state: a tag-vs-tag compare. "update available" only fires when
		// the operator cuts a NEW release (not on every master commit).
		available = release.tag_name !== deployedRelease
	} else {
		// Pre-266 box (no .deployed-release yet): compare the release tag's commit
		// to the deployed commit so a box already ON the release's code doesn't
		// flash a false "update available". If the tag SHA can't be resolved,
		// default to available so the operator at least sees the first release.
		available = releaseSha ? releaseSha !== deployedSha : true
	}

	return {
		available,
		// The RELEASE's commit (NOT the deployed one) so UpdateNotification's
		// shasDiffer guard shows the card when behind + hides it when current.
		sha: releaseSha || deployedSha,
		shortSha: (releaseSha || deployedSha).slice(0, 7),
		version: release.tag_name,
		message: release.name || release.tag_name,
		author: '',
		committedAt: release.published_at || '',
		// Phase 266 — release notes/changelog + link, consumed by 266-02 UI.
		notes: release.body || '',
		publishedAt: release.published_at || '',
		releaseUrl: release.html_url,
	}
}

export async function performUpdate(livinityd: Livinityd): Promise<boolean> {
	setUpdateStatus({running: true, progress: 5, description: 'Starting update...', error: false})

	try {
		// HOTFIX 2026-04-27: detached spawn so update.sh survives livinityd's
		// own restart. Without this, when update.sh runs `systemctl restart livos`
		// near the end, systemd kills livinityd → update.sh dies as a child →
		// `.deployed-sha` never gets updated AND Phase 33's EXIT trap never fires
		// (no success.json/failed.json written, log file stuck as `-pending.log`).
		// `detached: true` puts update.sh in its own process group via setsid(),
		// so signals to livinityd don't propagate to it. Stdout/stderr pipes
		// continue working until livinityd dies; tee in update.sh keeps writing
		// to the .pending log file regardless.
		//
		// HOTFIX 2026-05-26: update.sh has a "Must run as root" preflight check.
		// livinityd runs as `bruce` (non-root), so direct invocation fails with
		// exit code 1 before any work happens. Wrap with `sudo -n` — bruce has
		// NOPASSWD:ALL in /etc/sudoers.d/99-bruce (Phase 105 / 106-02 invariant),
		// so this is non-interactive and reliable.
		const proc = $({cwd: '/opt/livos', detached: true})`sudo -n bash /opt/livos/update.sh`

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
