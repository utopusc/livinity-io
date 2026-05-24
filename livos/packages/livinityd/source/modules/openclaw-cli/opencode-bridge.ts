/**
 * Phase 206 — opencode → openclaw auth-profile bridge.
 *
 * The Phase 195 xAI OAuth flow spawns `opencode auth login -p xai -m
 * "..."` which writes the resulting OAuth token to opencode's own auth.json
 * file (default `$XDG_DATA_HOME/opencode/auth.json` or
 * `~/.local/share/opencode/auth.json`). The openclaw agent, by contrast,
 * reads from `$OPENCLAW_STATE_DIR/agents/<id>/agent/auth-profiles.json`.
 * The two stores are independent — running OAuth via the Phase 195
 * surface alone does NOT make the openclaw agent see the credentials.
 *
 * This module bridges the gap: it reads opencode's auth.json, converts
 * each entry to openclaw's auth-profile shape, and merges into the
 * openclaw auth-profiles.json store.
 *
 * Conversion rules:
 *   - opencode `{type: "oauth", access, refresh, expires}` is written to
 *     openclaw as `{type: "api_key", provider, key: <access>}`. The xAI
 *     Bearer token interchange is identical between API-key and OAuth-
 *     access modes (both go in the `Authorization: Bearer <token>`
 *     header), so the runtime calls succeed.
 *   - opencode `{type: "api", key}` is written as `{type: "api_key",
 *     provider, key}` (trivial passthrough).
 *
 * Known limitation (Phase 207 carry-over): the bridged api_key entry is a
 * SNAPSHOT of the current OAuth access token. When opencode auto-refreshes
 * the token (background TokenRefresher in xai-credentials), the openclaw
 * mirror goes stale. Operators on long-running sessions should either:
 *   (a) re-trigger the bridge before the ~24h access-token expiry, or
 *   (b) paste a permanent xAI API key (from console.x.ai) which never
 *       rotates.
 *
 * INV-204-04 — raw tokens NEVER returned in the procedure response;
 * caller surfaces only `{bridged: [provider, …]}`.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

import {
	readAuthProfiles,
	resolveAuthProfilesPath,
	writeAuthProfilesAtomic,
	type AuthProfile,
	type AuthProfilesPathOpts,
} from './auth-profiles-store.js'

// ─── opencode auth.json shape ────────────────────────────────────────────────

interface OpencodeOAuthEntry {
	type: 'oauth'
	access: string
	refresh?: string
	expires?: number
	[extra: string]: unknown
}

interface OpencodeApiKeyEntry {
	type: 'api'
	key: string
	[extra: string]: unknown
}

type OpencodeAuthEntry = OpencodeOAuthEntry | OpencodeApiKeyEntry

interface OpencodeAuthFile {
	[provider: string]: OpencodeAuthEntry
}

// ─── Path resolution ─────────────────────────────────────────────────────────

const DEFAULT_OPENCODE_HOME = path.join(os.homedir(), '.local', 'share', 'opencode')

/**
 * Resolve the path to opencode's auth.json. Mirrors opencode's own
 * XDG-aware resolution: prefer `$XDG_DATA_HOME/opencode`, fall back to
 * `~/.local/share/opencode`. The path is overridable for tests.
 *
 * On Mini PC livinityd runs as `bruce`; `os.homedir()` resolves to
 * `/home/bruce` so the default path is the same one xAI OAuth flows
 * write to (verified 2026-05-24).
 */
export function resolveOpencodeAuthPath(override?: string): string {
	if (override) return override
	const xdg = process.env.XDG_DATA_HOME
	if (xdg) return path.join(xdg, 'opencode', 'auth.json')
	return path.join(DEFAULT_OPENCODE_HOME, 'auth.json')
}

// ─── Read ────────────────────────────────────────────────────────────────────

export async function readOpencodeAuth(
	override?: string,
): Promise<OpencodeAuthFile> {
	const p = resolveOpencodeAuthPath(override)
	try {
		const raw = await fs.readFile(p, 'utf8')
		const parsed = JSON.parse(raw)
		if (parsed && typeof parsed === 'object') return parsed as OpencodeAuthFile
		return {}
	} catch (err: unknown) {
		const code = (err as NodeJS.ErrnoException).code
		if (code === 'ENOENT') return {}
		throw err
	}
}

// ─── Bridge ──────────────────────────────────────────────────────────────────

export interface BridgeOpts extends AuthProfilesPathOpts {
	/** Override opencode auth.json path (tests). */
	opencodeAuthPath?: string
	/**
	 * Provider filter — if provided, only entries for these providers are
	 * bridged. When omitted, ALL entries in opencode's auth.json are
	 * bridged. Useful for triggering a targeted xAI bridge after a
	 * successful `auth.xai.waitForCompletion`.
	 */
	providers?: string[]
}

export interface BridgeResult {
	bridged: string[]
	skipped: Array<{provider: string; reason: string}>
	profilePath: string
	opencodeAuthPath: string
}

/**
 * Merge opencode auth entries into openclaw auth-profiles.json. Existing
 * openclaw profiles for NON-bridged providers are preserved verbatim;
 * bridged providers are replaced under the `<provider>:default` profile
 * ID.
 */
export async function bridgeFromOpencode(
	opts: BridgeOpts = {},
): Promise<BridgeResult> {
	const opencodeAuthPath = resolveOpencodeAuthPath(opts.opencodeAuthPath)
	const profilePath = resolveAuthProfilesPath(opts)
	const src = await readOpencodeAuth(opts.opencodeAuthPath)
	const filter = new Set(opts.providers ?? Object.keys(src))

	const dest = await readAuthProfiles(opts)
	const bridged: string[] = []
	const skipped: BridgeResult['skipped'] = []

	for (const [provider, entry] of Object.entries(src)) {
		if (!filter.has(provider)) continue
		if (!entry || typeof entry !== 'object') {
			skipped.push({provider, reason: 'entry is not an object'})
			continue
		}
		const profileId = `${provider}:default`
		if (entry.type === 'oauth') {
			const oauth = entry as OpencodeOAuthEntry
			if (!oauth.access || typeof oauth.access !== 'string') {
				skipped.push({provider, reason: 'oauth entry missing access token'})
				continue
			}
			const profile: AuthProfile = {
				type: 'api_key',
				provider,
				key: oauth.access,
			}
			// Preserve refresh + expires as extra fields so a future refresh
			// helper can rotate the key without losing context. The api_key
			// type is what the openclaw agent dispatches on, so these extras
			// are inert at agent runtime.
			if (oauth.refresh) (profile as Record<string, unknown>).opencodeRefresh = oauth.refresh
			if (oauth.expires) (profile as Record<string, unknown>).opencodeExpiresAt = oauth.expires
			;(profile as Record<string, unknown>).bridgedFromOpencode = true
			dest.profiles[profileId] = profile
			bridged.push(provider)
		} else if (entry.type === 'api') {
			const api = entry as OpencodeApiKeyEntry
			if (!api.key || typeof api.key !== 'string') {
				skipped.push({provider, reason: 'api entry missing key'})
				continue
			}
			dest.profiles[profileId] = {
				type: 'api_key',
				provider,
				key: api.key,
				bridgedFromOpencode: true,
			} as AuthProfile
			bridged.push(provider)
		} else {
			const type = (entry as {type?: string}).type ?? 'unknown'
			skipped.push({provider, reason: `unknown opencode entry type: ${type}`})
		}
	}

	if (bridged.length > 0) {
		await writeAuthProfilesAtomic(dest, opts)
	}

	return {
		bridged,
		skipped,
		profilePath,
		opencodeAuthPath,
	}
}
