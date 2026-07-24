import {$} from 'execa'
import fs from 'node:fs/promises'
import semver from 'semver'
import stripAnsi from 'strip-ansi'

import type {ProgressStatus} from '../apps/schema.js'
import Livinityd from '../../index.js'

type UpdateStatus = ProgressStatus

const GITHUB_TAGS_URL = 'https://api.github.com/repos/utopusc/livinity-io/tags?per_page=20'
// Phase 266 — release-based detection. /releases/latest returns the newest
// NON-prerelease published Release, or 404 when none exist yet (graceful).
const GITHUB_RELEASES_LATEST_URL =
	'https://api.github.com/repos/utopusc/livinity-io/releases/latest'
// Phase 311 UPDSAFE-01 — beta channel: the FULL releases list (prereleases
// included) so a beta box can resolve the newest PUBLISHED prerelease, which
// /releases/latest excludes by GitHub contract. Selection is semver-max via
// pickMaxReleaseTag (never API order) — see fetchBetaRelease.
const GITHUB_RELEASES_LIST_URL =
	'https://api.github.com/repos/utopusc/livinity-io/releases?per_page=100'
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
// Phase 311 UPDSAFE-01 — per-channel cache. A single shared slot would thrash
// the other channel's value on every toggle and double the GitHub 60 req/hr
// unauth budget. `data: null` is still a VALID cached value (404 / no releases).
type ReleaseCacheSlot = {at: number; data: ReleaseData | null}
const releasesCache = new Map<'stable' | 'beta', ReleaseCacheSlot>()

// Phase 311 UPDSAFE-01 — pure, never-throwing selector for the beta channel.
// Picks the semver-MAX tag from a list of release tags, coercing LivOS's
// non-strict tags (e.g. "v44.1", which lacks a patch segment) via the SAME
// `semver.valid || semver.coerce` idiom used at apps.ts:593. Tags that cannot
// be coerced are dropped (never throws); the ORIGINAL tag string of the
// greatest version is returned (NOT the first list entry / API order), or null
// when no tag coerces. This is the explicit anti-first-index guard RESEARCH.md
// mandates over the raw GitHub response ordering.
//
// Phase 311 CR-01 FIX: honor semver PRERELEASE precedence so a promoted final
// release outranks its own beta (v44.2 > v44.2-beta.1), regardless of API/list
// order. Raw `semver.coerce` STRIPS the prerelease suffix — so "v44.2-beta.1"
// and "v44.2" both coerce to "44.2.0" and tie, and the winner then depends on
// array order (a silent bug: the shell's `sort -V` and this selector could
// disagree on the promotion case). We instead normalize each tag to a full
// semver that KEEPS its prerelease (see normalizeReleaseTag) so `semver.gt`
// applies true prerelease precedence and the result is order-independent. This
// makes the TS selector AGREE with update.sh's (tilde-mapped) `sort -V` on the
// same input — proven by update.beta-selector.test.sh + the cross-selector
// cases in update.beta.unit.test.ts.
function normalizeReleaseTag(tag: string): string | null {
	// SemVer migration (v1.0.0, 2026-07-23): only STRICT 3-part semver tags
	// (vMAJOR.MINOR.PATCH[-prerelease]) participate in beta-channel selection.
	// The legacy patch-less tags ("v45.30", "v45.31-beta.11") used to be
	// coerced in here — but coercion makes every legacy tag (45.x) outrank the
	// entire v1.x line forever, so a post-migration beta cut (v1.1.1-beta.1)
	// could NEVER be selected and a beta-channel box would re-deploy the stale
	// legacy prerelease. Dropping non-strict tags retires the legacy line from
	// selection without deleting its releases. semver.valid() accepts the
	// leading "v" and preserves any -prerelease for true precedence.
	return semver.valid(tag)
}

export function pickMaxReleaseTag(tags: string[]): string | null {
	let bestTag: string | null = null
	let bestVersion: string | null = null
	for (const tag of tags) {
		const normalized = normalizeReleaseTag(tag)
		if (!normalized) continue
		if (bestVersion === null || semver.gt(normalized, bestVersion)) {
			bestVersion = normalized
			bestTag = tag
		}
	}
	return bestTag
}

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

// Phase 305 R3 — the on-box vendored AionUi symlink + the installer that carries
// the pinned version, used to detect a box whose CORE update succeeded but whose
// FAIL-SOFT install-liv-assistant self-heal left AionUi STALE. The self-heal
// (update.sh step 4.6) warns+continues on a download/SHA/timeout hiccup, so
// update.sh still records .deployed-release → the tag-vs-tag `available` goes false
// → AionUi sits stale → Liv permission Modes / config-options keep 404ing. We surface
// this as the DIAGNOSTIC `aionuiStale` flag on checkUpdate (see getLatestRelease).
const LIV_ASSISTANT_CURRENT_LINK = '/opt/liv-assistant/current'
const LIV_ASSISTANT_INSTALLER_PATH = '/opt/livos/scripts/install-liv-assistant.sh'

// Short in-memory memo so the off-pin probe doesn't re-read the (~55KB) installer
// on every checkUpdate — that query is polled hourly + on every mount/focus and by
// several consumers, while the symlink/pin only change on a deploy. Mirrors the
// tagsCache/releasesCache TTL pattern above. 30s is ample to absorb a page-load
// burst while staying fresh enough that a just-healed box clears within seconds.
const AIONUI_OFF_PIN_CACHE_TTL_MS = 30 * 1000
let aionuiOffPinCache: {at: number; value: boolean} | null = null

// True iff liv-assistant IS installed (the `current` symlink exists) but points at
// a version OTHER than the one pinned in install-liv-assistant.sh. Returns false
// (not stale) when liv-assistant is not installed, the installer/pin can't be read,
// or it's already on pin. NEVER throws and defaults to false on ANY uncertainty —
// getLatestRelease is polled hourly + on every window focus, so this must degrade
// to "not stale" rather than break update detection or false-alarm.
export async function isAionuiOffPin(): Promise<boolean> {
	if (aionuiOffPinCache && Date.now() - aionuiOffPinCache.at < AIONUI_OFF_PIN_CACHE_TTL_MS) {
		return aionuiOffPinCache.value
	}
	const value = await computeAionuiOffPin()
	aionuiOffPinCache = {at: Date.now(), value}
	return value
}

async function computeAionuiOffPin(): Promise<boolean> {
	try {
		// The version the `current` symlink points at. readlink the link TEXT (not the
		// resolved path) so a half-extracted tree still reads off-pin — matches
		// update.sh's _liv_symlink_on_pin. Any error (ENOENT = not installed, EINVAL =
		// not a symlink) → not "stale" (the fresh-install path handles those).
		let linkTarget: string
		try {
			linkTarget = await fs.readlink(LIV_ASSISTANT_CURRENT_LINK)
		} catch {
			return false
		}
		// The pinned version, read from the installer shipped with THIS release, so the
		// check never drifts from the pin (single source of truth — the update.sh
		// self-heal greps AIONUI_VERSION from the very same file).
		let pin = ''
		try {
			const installer = await fs.readFile(LIV_ASSISTANT_INSTALLER_PATH, 'utf8')
			pin = installer.match(/AIONUI_VERSION="([^"]+)"/)?.[1] ?? ''
		} catch {
			return false
		}
		if (!pin) return false
		// On-pin iff the link text contains `aionui-web-<pin>/`
		// (e.g. /opt/liv-assistant/aionui-web-2.1.24/aionui-web).
		return !linkTarget.includes(`aionui-web-${pin}/`)
	} catch {
		return false
	}
}

// Phase 266 — fetch the latest published GitHub Release. NEVER throws: a 404
// (no releases yet) returns null and is cached as null; rate-limit/5xx/network
// serve the last good value (which may itself be null) so the UI degrades to a
// quiet "On latest" instead of an error toast. Mirrors the commits/tags cache.
async function fetchLatestRelease(livinityd: Livinityd): Promise<ReleaseData | null> {
	const cached = releasesCache.get('stable')
	if (cached && Date.now() - cached.at < RELEASES_CACHE_TTL_MS) {
		return cached.data
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
			releasesCache.set('stable', {at: Date.now(), data: null})
			return null
		}
		if (response.ok) {
			const data = (await response.json()) as ReleaseData
			releasesCache.set('stable', {at: Date.now(), data})
			return data
		}
		// Rate-limit / 5xx → serve stale (incl. a previously-cached null).
		const stale = releasesCache.get('stable')
		if (stale) {
			livinityd.logger.log(
				`GitHub releases API ${response.status} on checkUpdate; serving cached value`,
			)
			return stale.data
		}
		return null
	} catch (err) {
		// Network/DNS failure → stale or null. Never propagate.
		const stale = releasesCache.get('stable')
		if (stale) return stale.data
		livinityd.logger.log(`GitHub releases API unreachable on checkUpdate: ${String(err)}`)
		return null
	}
}

// Phase 311 UPDSAFE-01 — beta channel resolver. Fetches the FULL releases list
// (prereleases included), filters out drafts defensively, and returns the
// ReleaseData of the semver-MAX tag via pickMaxReleaseTag. Mirrors
// fetchLatestRelease's never-throw / stale-on-error cache discipline EXACTLY
// (this query is polled hourly + on every window focus) but keyed to the 'beta'
// cache slot. On 404 / rate-limit / network failure it serves the beta slot
// (which may itself be null) so the box degrades to a quiet "On latest", never
// an error toast.
async function fetchBetaRelease(livinityd: Livinityd): Promise<ReleaseData | null> {
	const cached = releasesCache.get('beta')
	if (cached && Date.now() - cached.at < RELEASES_CACHE_TTL_MS) {
		return cached.data
	}
	try {
		const response = await fetch(GITHUB_RELEASES_LIST_URL, {
			headers: {
				'User-Agent': `LivOS-${livinityd.version}`,
				Accept: 'application/vnd.github+json',
			},
		})
		if (response.status === 404) {
			releasesCache.set('beta', {at: Date.now(), data: null})
			return null
		}
		if (response.ok) {
			// The list endpoint returns drafts for authenticated requests; unauth
			// requests exclude them, but filter defensively regardless.
			const list = (await response.json()) as Array<ReleaseData & {draft?: boolean}>
			const published = Array.isArray(list) ? list.filter((r) => !r.draft) : []
			const winnerTag = pickMaxReleaseTag(published.map((r) => r.tag_name))
			const data = winnerTag ? (published.find((r) => r.tag_name === winnerTag) ?? null) : null
			releasesCache.set('beta', {at: Date.now(), data})
			return data
		}
		const stale = releasesCache.get('beta')
		if (stale) {
			livinityd.logger.log(
				`GitHub releases (beta) API ${response.status} on checkUpdate; serving cached value`,
			)
			return stale.data
		}
		return null
	} catch (err) {
		const stale = releasesCache.get('beta')
		if (stale) return stale.data
		livinityd.logger.log(`GitHub releases (beta) API unreachable on checkUpdate: ${String(err)}`)
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

	// Phase 311 UPDSAFE-01 — channel-aware resolution. Read the SAME store key
	// setReleaseChannel persists (routes.ts:142); default 'stable'. Beta resolves
	// the semver-max PUBLISHED release (prereleases included) via the list
	// endpoint; stable is byte-unchanged (/releases/latest, which by GitHub
	// contract already excludes prereleases). Return-to-stable is naturally
	// correct with NO special-casing: the tag-vs-tag `available` compare below
	// fires on ANY differing tag — including a stable tag numerically BEHIND the
	// beta the box currently runs — so switching back cleanly offers the latest
	// stable release.
	const channel = (await livinityd.store.get('settings.releaseChannel')) || 'stable'
	const release =
		channel === 'beta' ? await fetchBetaRelease(livinityd) : await fetchLatestRelease(livinityd)

	// Phase 305 R3 — is the box's vendored AionUi off the pinned version? (fail-soft
	// self-heal left it stale). Surfaced as a DIAGNOSTIC flag on both return paths
	// below; intentionally NOT used to drive `available` (see the main return).
	const aionuiStale = await isAionuiOffPin()

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
			// Phase 305 R3 — diagnostic only (see the main return below); never forces
			// `available`, so a release-less repo keeps its quiet "On latest" behaviour.
			aionuiStale,
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
		// Phase 305 R3 — DIAGNOSTIC ONLY (deliberately NOT OR'd into `available`).
		// True when the box's vendored AionUi symlink is off the pinned version (a
		// fail-soft install-liv-assistant self-heal left it stale → config-options
		// 404 → Liv permission Modes keep prompting). We do NOT force `available`
		// here: `available` drives release-update surfaces (the desktop card, Settings
		// list-row, mobile view, sidebar badge, notification count) whose "vX available"
		// copy + per-release SHA dismissal are wrong for a persistent local fault —
		// forcing it mislabels the running version and creates an un-silenceable nag
		// (review wf_b5556ae0). Recovery is cutting a new release (re-runs the
		// idempotent self-heal via the normal tag-compare path) or re-running the
		// installer; a dedicated "repair Liv AI" prompt consuming this flag is a
		// tracked follow-up. Exposed now so the stuck state is OBSERVABLE
		// (GET system.checkUpdate → aionuiStale:true).
		aionuiStale,
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
		// Phase 310 ALERT-02 — NEW detection hook: a failed update may leave the
		// box partially updated. Fire-and-forget external-dispatch (critical);
		// never let a notification/dispatch failure alter the update control flow.
		// INFO-01: leading `void` matches the codebase convention for intentionally
		// unawaited (fire-and-forget) promises and satisfies no-floating-promises.
		void livinityd.notifications
			.add('update-failed', {severity: 'critical', external: true})
			.catch(() => {})
		return false
	}

	setUpdateStatus({running: false, progress: 100, description: 'Updated', error: false})
	return true
}

// Phase 311 UPDSAFE-04 — operator-triggered manual rollback to the last-good
// snapshot. Mirrors performUpdate's detached-spawn + `sudo -n` shell-out shape
// EXACTLY, but targets /opt/livos/livos-manual-rollback.sh (heredoc-installed
// on-box by update.sh in Phase 311-02) instead of update.sh. The script restores
// CODE + node_modules + systemd units and restarts services — it NEVER reverts the
// Postgres schema (see the operator-locked warning in RollbackConfirmModal).
//
// Exit-code contract (311-02, extended by 348): 0 = restored + serving on :8080;
// 1 = restored but :8080 did not come back; 2 = no last-good snapshot / --with-db
// without a DB dump (refused, nothing partially restored); 3 = lock held (a
// concurrent update/rollback); 4 = code restored + serving but the opt-in DB
// restore ABORTED (single-transaction: DB left untouched). execa throws on any
// non-zero exit, so 1/2/3/4 land in the catch and are mapped to an
// operator-legible message on updateStatus.error — the mutation's onError toast
// is the feedback path. We deliberately do NOT fire a NEW external notification
// here (avoids dragging in notifications.tsx/i18n; the operator triggered this
// and is watching the modal) and do NOT reuse the existing update-failure
// notification key (that would misattribute a manual rollback to a
// forward-update failure in the alert-coalescing surface).

// Phase 348 (ABUPD-02) — pure arg builder for the manual-rollback invocation.
// The ONLY argument the script accepts is the literal `--with-db` opt-in flag
// (it exits 2 on anything unknown); nothing user-influenced ever reaches argv.
export function buildManualRollbackArgs(withDb: boolean): string[] {
	return withDb ? ['--with-db'] : []
}

// Phase 348 — pure exit-code → operator-legible message mapper (unit-tested;
// keep in lockstep with the script's exit contract documented above).
export function rollbackErrorMessage(exitCode: number | undefined, fallback: string): string {
	switch (exitCode) {
		case 1:
			return 'Rollback restored the previous version but LivOS did not come back on :8080. Check the box before retrying.'
		case 2:
			return 'No last-good snapshot (or no database snapshot for a database restore) exists to roll back to on this box.'
		case 3:
			return 'An update or rollback is already in progress. Wait for it to finish and retry.'
		case 4:
			// Covers both an aborted single-transaction restore AND a
			// Postgres-not-accessible skip — either way the DB was untouched.
			// NOTE (348 review INFO-1): with --with-db the script stops
			// livos.service mid-run, so this process usually dies before the
			// exit lands here — the authoritative record is the rollback.json
			// reason in Past Deploys; this mapping covers the early-exit paths.
			return 'Code was rolled back and LivOS is serving again, but the requested database restore did not complete — the database was left untouched (still on the post-update state). See Past Deploys for detail.'
		default:
			return fallback
	}
}

export async function performRollback(livinityd: Livinityd, options?: {withDb?: boolean}): Promise<boolean> {
	setUpdateStatus({running: true, progress: 5, description: 'Rolling back...', error: false})

	try {
		// Detached spawn + `sudo -n` for the SAME reasons performUpdate uses them:
		// the script runs `systemctl restart livos.service`, which would otherwise
		// kill this process (livinityd) mid-run; setsid() via detached puts it in its
		// own process group so livinityd's restart doesn't propagate, and bruce's
		// NOPASSWD sudoers entry makes the privileged invocation non-interactive.
		const rollbackArgs = buildManualRollbackArgs(options?.withDb === true)
		const proc = $({cwd: '/opt/livos', detached: true})`sudo -n bash /opt/livos/livos-manual-rollback.sh ${rollbackArgs}`

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
		// Map the 311-02 (+348) exit-code contract to an operator-legible message.
		const exitCode = (error as {exitCode?: number}).exitCode
		const errMessage = rollbackErrorMessage(exitCode, (error as Error).message ?? 'Rollback failed')
		if (!updateStatus.error) setUpdateStatus({error: errMessage})
		// Reset state but preserve the error so the UI toast can surface it.
		const errorStatus = updateStatus.error
		resetUpdateStatus()
		setUpdateStatus({error: errorStatus})
		livinityd.logger.error('livos-manual-rollback.sh failed', error)
		return false
	}

	setUpdateStatus({running: false, progress: 100, description: 'Rolled back', error: false})
	return true
}
