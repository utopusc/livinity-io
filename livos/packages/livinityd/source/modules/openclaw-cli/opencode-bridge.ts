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

// ─── Phase 207 R6 — periodic auto-refresh ───────────────────────────────────

/**
 * Phase 207 R6 — periodic refresh interval, in milliseconds.
 *
 * 30 minutes is well below the xAI OAuth access-token lifetime (typically
 * ~24h), and well below any reasonable expiry on the other opencode-bridged
 * providers (OpenAI Codex / Anthropic / GitHub Copilot all rotate slower
 * than the 24h ceiling). The cost of a refresh is one auth.json read + one
 * auth-profiles.json atomic write — both are local-filesystem cheap.
 */
export const BRIDGE_REFRESH_INTERVAL_MS = 30 * 60 * 1000

export interface PeriodicBridgeRefresherDeps {
	logger: {
		info: (msg: string) => void
		warn: (msg: string, err?: unknown) => void
	}
	/** Test seam — override the interval (default 30 min). */
	intervalMs?: number
	/** Test seam — override the bridge implementation. */
	bridge?: (opts?: BridgeOpts) => Promise<BridgeResult>
	/** Optional path overrides forwarded into bridge calls. */
	bridgeOpts?: BridgeOpts
}

export interface PeriodicBridgeRefresherHandle {
	/** Stop the timer. Idempotent. */
	stop(): void
	/** Trigger an immediate refresh (returns when the bridge call settles). */
	tick(): Promise<void>
}

/**
 * Phase 207 R6 — fire-and-forget periodic re-bridge so xAI / OpenAI Codex
 * / Anthropic OAuth access tokens that opencode rotates in the background
 * propagate into openclaw's auth-profiles.json without operator action.
 *
 * Pre-Phase 207 the bridge ran ONCE at the end of the xAI OAuth flow and
 * wrote a snapshot. After ~24h the snapshot went stale and chat started
 * failing with 401s until the operator re-clicked "Connect via xAI" in
 * Settings → Providers. Operator UAT 2026-05-24 surfaced this; SPEC R6
 * scopes the auto-refresh.
 *
 * Failure handling: any caught error is logged at WARN level — the bridge
 * is best-effort, never throws back to the caller, and the timer keeps
 * firing on the next tick. unref() on the timer so livinityd's process
 * shutdown isn't blocked by a pending interval.
 */
export function startPeriodicBridgeRefresh(
	deps: PeriodicBridgeRefresherDeps,
): PeriodicBridgeRefresherHandle {
	const intervalMs = deps.intervalMs ?? BRIDGE_REFRESH_INTERVAL_MS
	const bridge = deps.bridge ?? bridgeFromOpencode
	const opts = deps.bridgeOpts

	const tick = async (): Promise<void> => {
		try {
			const result = await bridge(opts)
			if (result.bridged.length > 0) {
				deps.logger.info(
					`Phase 207 R6 — bridge auto-refresh OK; rotated ${result.bridged.length} provider(s): ${result.bridged.join(', ')}`,
				)
			}
			if (result.skipped.length > 0) {
				deps.logger.warn(
					`Phase 207 R6 — bridge auto-refresh skipped ${result.skipped.length} entry(ies): ${result.skipped
						.map((s) => `${s.provider}=${s.reason}`)
						.join(', ')}`,
				)
			}
		} catch (err) {
			deps.logger.warn(
				'Phase 207 R6 — bridge auto-refresh failed (will retry on next tick)',
				err,
			)
		}
	}

	deps.logger.info(
		`Phase 207 R6 — periodic bridge refresher armed (intervalMs=${intervalMs})`,
	)
	const handle = setInterval(() => {
		void tick()
	}, intervalMs)
	if (typeof handle.unref === 'function') handle.unref()

	let stopped = false
	return {
		stop(): void {
			if (stopped) return
			stopped = true
			clearInterval(handle)
		},
		async tick(): Promise<void> {
			await tick()
		},
	}
}
