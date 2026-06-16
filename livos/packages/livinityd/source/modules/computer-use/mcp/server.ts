#!/usr/bin/env tsx
/**
 * Luse MCP server (renamed P100-10-02 from Bytebot MCP server per D-100-10-B) —
 * stdio JSON-RPC entry point.
 *
 * Phase 72-native-05 — Wave-2 deliverable. Spawned as a child process by
 * livinityd's existing McpClientManager (config wiring lands in 72-native-06).
 *
 * Apache 2.0 attribution
 * ─────────────────────────
 * The 17 tool schemas this server exposes (LUSE_TOOLS) and the action
 * dispatch strategy are derived from upstream bytebot project (Apache 2.0):
 *   https://github.com/bytebot-ai/bytebot
 *
 * Apache 2.0 NOTICE: full license text mirrored at
 * `.planning/licenses/bytebot-LICENSE.txt`.
 *
 * Architecture decisions (per 72-CONTEXT.md):
 *   D-NATIVE-03 — stdio MCP server (NO HTTP listener).
 *   D-NATIVE-04 — Tool handlers dispatch to native primitives.
 *   D-NATIVE-10 — Server name `luse` matches `mcp_luse_*` categorize patch.
 *
 * Spawn:
 *   tsx /opt/livos/packages/livinityd/source/modules/computer-use/mcp/server.ts
 *
 * Wire (JSON-RPC 2.0 over stdin/stdout). Logs go to stderr exclusively —
 * stdout is reserved for the MCP wire and any stray stdout writes will
 * corrupt the protocol stream.
 *
 * Phase 100-10-04 (D-100-10-C, G-100-10-E) — Redis client lifecycle:
 *
 * This MCP server runs in its OWN Node.js process spawned by livinityd's
 * McpClientManager via the per-WebApp descriptor in `luse-mcp-config.ts`.
 * It DOES NOT share the parent livinityd's ioredis client; instead, it
 * constructs its OWN fresh `new Redis(luseRedisUrl, ...)` from the
 * `LUSE_REDIS_URL` env var threaded through by the descriptor's env
 * block. That fresh client is passed into `registerLuseTools({redis})`
 * so the `mcp__luse__create_stream` handler can read the privilege-gate
 * flag `liv:config:luse_can_create_streams` at call-time.
 */
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
// ioredis exports Redis as a named export (NOT default) per project memory.
import {Redis} from 'ioredis'
// Phase 250-hotfix — read livinityd's env file as a last-resort Redis fallback
// (see resolveLuseRedisUrl below).
import {existsSync, readFileSync} from 'node:fs'

import {createDisplayManager, createDisplayTtlGc} from '../displays/index.js'
import {defaultLivosAppResolver, type LivosAppMatch} from '../native/window.js'
import {registerLuseTools, resolveLuseUserId, LIVOS_ROOT} from './tools.js'
// Phase 255-03 — MCP create() allocator floor (60). Keeps create()-allocated
// :N disjoint from webapp registerExisting :N in [10,60) (Pitfall 2).
import {MCP_CREATE_ALLOCATOR_START} from '../../streaming/index.js'

/**
 * Phase 102-06 — display-target resolution with precedence:
 *   1. LUSE_TARGET_DISPLAY (canonical Phase 102 env — must satisfy
 *      /^:[1-9][0-9]?$/ or it's dropped with a stderr warning).
 *   2. LUSE_DISPLAY (legacy alias from Phase 100-10-03).
 *   3. DISPLAY (system default).
 *
 * Returns the chosen display string, or `undefined` if none of the env vars
 * are set. Pure function — testable without booting the MCP server.
 *
 * Exported so `mcp/server.test.ts` can cover env precedence without booting
 * a stdio MCP server (the McpServer instance lifecycle is hard to unit test
 * cleanly; the env-read is the only Phase-102 behavior change).
 */
export interface ResolveDisplayDeps {
	env?: NodeJS.ProcessEnv
	writeWarn?: (message: string) => void
}

export function resolveDisplay(deps: ResolveDisplayDeps = {}): string | undefined {
	const env = deps.env ?? process.env
	const writeWarn = deps.writeWarn ?? ((msg) => process.stderr.write(msg))
	const DISPLAY_RE = /^:[1-9][0-9]?$/
	const rawTargetDisplay = env.LUSE_TARGET_DISPLAY
	if (typeof rawTargetDisplay === 'string' && rawTargetDisplay.length > 0) {
		if (DISPLAY_RE.test(rawTargetDisplay)) {
			return rawTargetDisplay
		}
		writeWarn(
			`[luse-mcp] warning: LUSE_TARGET_DISPLAY=${JSON.stringify(rawTargetDisplay)} does not match /^:[1-9][0-9]?$/; falling through to LUSE_DISPLAY/DISPLAY
`,
		)
	}
	return env.LUSE_DISPLAY ?? env.DISPLAY
}

/**
 * Phase 250-hotfix — resolve the Redis URL for this luse MCP child.
 *
 * Precedence:
 *   1. LUSE_REDIS_URL — canonical, threaded by the descriptor / wrapper.
 *   2. REDIS_URL — generic env, in case a spawner forwards that name.
 *   3. The `REDIS_URL=` line in livinityd's env file (/opt/livos/.env) —
 *      last-resort fallback for spawn paths that drop the env block entirely.
 *
 * Why (3) exists: some AionUi / Claude-Code internal ACP spawn paths start the
 * luse server via a DIRECT `node tsx server.ts` (NOT the env-bearing wrapper),
 * so LUSE_REDIS_URL never reaches the process. That left `redis === null`,
 * which fails-closed `displayManager` (computer_create_display etc.) AND
 * create_stream — even though Redis was reachable the whole time. Reading the
 * co-located, mode-600 env file keeps the password authoritative (never
 * hardcoded) and makes every luse boot wire Redis regardless of which spawner
 * started it. Pure + DI'd so server.test.ts can cover precedence without I/O.
 */
export interface ResolveRedisUrlDeps {
	env?: NodeJS.ProcessEnv
	readEnvFile?: (path: string) => string | undefined
	envFilePaths?: string[]
}

export function resolveLuseRedisUrl(deps: ResolveRedisUrlDeps = {}): string | undefined {
	const env = deps.env ?? process.env
	if (typeof env.LUSE_REDIS_URL === 'string' && env.LUSE_REDIS_URL.length > 0) {
		return env.LUSE_REDIS_URL
	}
	if (typeof env.REDIS_URL === 'string' && env.REDIS_URL.length > 0) {
		return env.REDIS_URL
	}
	const readEnvFile =
		deps.readEnvFile ??
		((p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : undefined))
	// Phase 252-06 (R14) — derive from the single LIVOS_ROOT source (tools.ts)
	// instead of re-hardcoding /opt/livos, so a moved-root box resolves Redis.
	const paths = deps.envFilePaths ?? [`${LIVOS_ROOT}/.env`, `${LIVOS_ROOT}/livos/.env`]
	for (const p of paths) {
		let contents: string | undefined
		try {
			contents = readEnvFile(p)
		} catch {
			contents = undefined
		}
		if (!contents) continue
		const m = contents.match(/^REDIS_URL=(.+)$/m)
		if (m && m[1].trim().length > 0) {
			return m[1].trim()
		}
	}
	return undefined
}

async function main(): Promise<void> {
	// @deprecated since Phase 102-06 — `LUSE_TARGET_WINDOW_ID` is no longer
	// set by the per-WebApp descriptor (see luse-mcp-config.ts: the descriptor
	// branch now emits `LUSE_TARGET_DISPLAY` instead). This env read remains
	// as a legacy fallback ONLY for the host-display Luse instance (which is
	// spawned without a descriptor and which never had LUSE_TARGET_WINDOW_ID
	// set by livinityd anyway — operators can still set it manually for
	// host-level wid-scoping during ad-hoc debugging). When unset, host-display
	// behavior is preserved.
	const targetWindowEnv = process.env.LUSE_TARGET_WINDOW_ID
	let defaultWindowId: number | undefined
	if (typeof targetWindowEnv === 'string' && targetWindowEnv.length > 0) {
		const parsed = Number(targetWindowEnv)
		if (Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0) {
			defaultWindowId = parsed
		} else {
			process.stderr.write(
				`[luse-mcp] warning: LUSE_TARGET_WINDOW_ID=${JSON.stringify(targetWindowEnv)} is not a positive integer; ignoring (host-display default)\n`,
			)
		}
	}

	// Phase 102-06 — see resolveDisplay() above for precedence:
	//   LUSE_TARGET_DISPLAY (canonical, regex-validated) → LUSE_DISPLAY → DISPLAY.
	const defaultDisplay = resolveDisplay()

	// P100-10-04 — construct a FRESH ioredis client from LUSE_REDIS_URL.
	// The parent livinityd process owns its own ioredis instance; this MCP
	// child is a separate Node.js process and cannot share it. The
	// `mcp__luse__create_stream` handler reads the Redis flag
	// `liv:config:luse_can_create_streams` via this local client (G-100-10-E).
	// When `LUSE_REDIS_URL` is absent or the empty string, we DO NOT construct
	// a client — the handler treats `redis === null` as "deny" (fail-closed,
	// same semantics as a thrown Redis error).
	// Phase 250-hotfix — resolve via env → /opt/livos/.env fallback (see
	// resolveLuseRedisUrl). `fromEnv` tracks whether the canonical env var was
	// present so we can log when the fallback rescued an env-less spawn.
	const luseRedisUrl = resolveLuseRedisUrl()
	const luseRedisUrlFromEnv =
		typeof process.env.LUSE_REDIS_URL === 'string' && process.env.LUSE_REDIS_URL.length > 0
	let redis: Redis | null = null
	if (typeof luseRedisUrl === 'string' && luseRedisUrl.length > 0) {
		try {
			redis = new Redis(luseRedisUrl, {
				lazyConnect: true,
				maxRetriesPerRequest: 1,
			})
			if (!luseRedisUrlFromEnv) {
				process.stderr.write(
					'[luse-mcp] note: LUSE_REDIS_URL absent at boot; recovered Redis URL via fallback (REDIS_URL / /opt/livos/.env) so displayManager + create_stream stay wired\n',
				)
			}
		} catch (err) {
			process.stderr.write(
				`[luse-mcp] warning: failed to construct Redis client from resolved URL: ${(err as Error).message}; create_stream + displayManager will fail-closed\n`,
			)
			redis = null
		}
	} else {
		process.stderr.write(
			'[luse-mcp] warning: no Redis URL resolvable (LUSE_REDIS_URL / REDIS_URL / /opt/livos/.env all empty); mcp__luse__create_stream + displayManager fail-closed (privilege gate denies)\n',
		)
	}

	// Phase 248-02 — display lifecycle manager. Reuses the SAME fresh redis
	// client constructed above (one connection per MCP child, NOT shared with
	// parent livinityd). When redis is null, displayManager is omitted and the
	// 4 new tool handlers (computer_create_display / computer_list_displays /
	// computer_kill_display / computer_launch_app_in_display) return
	// "Error: displayManager not wired" — same fail-closed pattern as
	// streamManager from P100-10-04.
	//
	// The redis client surface used by createDisplayManager is the 6-method
	// DisplayRedisClient subset (hset/hgetall/rpush/lrange/del/scan). ioredis's
	// Redis class implements all 6 with compatible signatures, so the cast is
	// type-safe at the wire level even though TS's structural subtype check
	// requires a `never` cast for the hset overload variance.
	const displayManager =
		redis !== null
			? createDisplayManager({
					redis: redis as never,
					// Phase 255-03 — disjoint range floor. computer_create_display
					// hands out [60, ..) so it can never collide with a webapp's
					// registerExisting :N in [10,60) within one boot (Pitfall 2).
					allocatorStart: MCP_CREATE_ALLOCATOR_START,
					logger: {
						info: (msg) => process.stderr.write(`[luse-mcp] displays: ${msg}\n`),
					},
				})
			: undefined

	// Phase 248-03 — TTL GC for idle displays. 1h sweep / 4h idle threshold.
	// Owner-impersonates so it can kill any stale display the user-facing
	// owner-scope check would otherwise block. Only constructed when
	// displayManager is wired — null branch leaks no interval handle.
	const displayTtlGc = displayManager
		? createDisplayTtlGc({
				displayManager,
				logger: {
					info: (msg, ctx) =>
						process.stderr.write(
							`[luse-mcp] display-ttl-gc: ${msg}${
								ctx ? ' ' + JSON.stringify(ctx) : ''
							}\n`,
						),
				},
			})
		: undefined

	// Phase 161-03 — Construct livosAppResolver via env-thread + HTTP fetch.
	// Mirrors ws-agent.ts:160-172 IntentRouter getCapabilities idiom.
	//
	// When all 4 env vars are set, the resolver fetches the user's WebApp +
	// NativeApp lists from livinityd's tRPC and feeds them to
	// defaultLivosAppResolver (Phase 160-03) which synthesizes the DASH-pattern
	// URL `${proto}://${sub}-${userSlug}.${domainRoot}/` on match.
	//
	// When ANY env var is missing → resolver stays undefined → registerLuseTools
	// without livosAppResolver = pre-Phase-160-03 APP_MAP fall-through (fail-open).
	//
	// Stderr discipline (D-161-D / L3): all new log lines use the
	// `[luse-mcp] resolver: ...` prefix so they DO NOT collide with the
	// `[luse-mcp] open_livos_app ...` IPC channel that parent livinityd
	// consumes (see mcp/tools.ts:756).
	const livinitydApiUrl = process.env.LIVINITYD_API_URL
	const livApiKey = process.env.LIV_API_KEY
	const luseUserSlug = process.env.LUSE_USER_SLUG
	const luseDomainRoot = process.env.LUSE_DOMAIN_ROOT

	let livosAppResolver: ((name: string) => Promise<LivosAppMatch | null>) | undefined
	// Phase 274 — actually OPEN a resolved LivOS app by calling livinityd's spawn
	// procs over the SAME authed HTTP channel the resolver uses. Wired only when
	// the env-thread is complete (needs LIVINITYD_API_URL + LIV_API_KEY).
	let openLivosApp:
		| ((match: LivosAppMatch, display?: string) => Promise<{ok: boolean; error?: string}>)
		| undefined
	if (livinitydApiUrl && livApiKey && luseUserSlug && luseDomainRoot) {
		const fetchAppList = async (proc: string): Promise<any[]> => {
			try {
				const res = await fetch(`${livinitydApiUrl}/trpc/${proc}?input=`, {
					headers: {'X-Api-Key': livApiKey},
					signal: AbortSignal.timeout(5000),
				})
				if (!res.ok) {
					throw new Error(`HTTP ${res.status}`)
				}
				const data = (await res.json()) as {result?: {data?: any[]}}
				return data.result?.data ?? []
			} catch (err: any) {
				process.stderr.write(
					`[luse-mcp] resolver: ${proc} fetch failed: ${err?.message ?? String(err)}; returning []\n`,
				)
				return []
			}
		}

		livosAppResolver = (name: string) =>
			defaultLivosAppResolver(name, {
				listWebApps: () => fetchAppList('webapp.list'),
				listNativeApps: () => fetchAppList('apps.native.list'),
				userSlug: luseUserSlug,
				domainRoot: luseDomainRoot,
			})

		// Phase 274 — open a matched app by POSTing to livinityd's existing spawn
		// mutations (webapp.window.spawn / apps.native.spawn). Non-batched tRPC,
		// no transformer (mirrors fetchAppList's `?input=` + `data.result.data`).
		openLivosApp = async (match: LivosAppMatch, _display?: string) => {
			try {
				const proc = match.kind === 'webapp' ? 'webapp.window.spawn' : 'apps.native.spawn'
				const input =
					match.kind === 'webapp'
						? {webappId: match.appId, url: match.route}
						: {id: match.appId}
				const res = await fetch(`${livinitydApiUrl}/trpc/${proc}`, {
					method: 'POST',
					headers: {'X-Api-Key': livApiKey, 'Content-Type': 'application/json'},
					body: JSON.stringify(input),
					signal: AbortSignal.timeout(20000),
				})
				const text = await res.text()
				if (!res.ok) {
					let msg = `HTTP ${res.status}`
					try {
						const j = JSON.parse(text) as {error?: {message?: string; json?: {message?: string}}}
						msg = j.error?.json?.message ?? j.error?.message ?? msg
					} catch {
						/* keep HTTP status */
					}
					process.stderr.write(`[luse-mcp] openLivosApp ${proc} failed: ${msg}\n`)
					return {ok: false, error: msg}
				}
				process.stderr.write(`[luse-mcp] openLivosApp: opened ${match.kind} ${match.appId} (${match.title})\n`)
				return {ok: true}
			} catch (err: any) {
				const msg = err?.message ?? String(err)
				process.stderr.write(`[luse-mcp] openLivosApp error: ${msg}\n`)
				return {ok: false, error: msg}
			}
		}

		process.stderr.write(
			`[luse-mcp] resolver: constructed (LIVINITYD_API_URL=${livinitydApiUrl}, userSlug=${luseUserSlug}, domainRoot=${luseDomainRoot})\n`,
		)
	} else {
		process.stderr.write(
			`[luse-mcp] resolver: env-thread incomplete (LIVINITYD_API_URL=${livinitydApiUrl ? 'set' : 'MISSING'}, LIV_API_KEY=${livApiKey ? 'set' : 'MISSING'}, LUSE_USER_SLUG=${luseUserSlug ? 'set' : 'MISSING'}, LUSE_DOMAIN_ROOT=${luseDomainRoot ? 'set' : 'MISSING'}); falling back to APP_MAP\n`,
		)
	}

	const server = new McpServer({name: 'luse', version: '1.0.0'})
	// Note: `streamManager` is NOT wired into this MCP child (the StreamManager
	// instance lives in the parent livinityd process and cross-process IPC is
	// out of scope for this plan). Without `streamManager`, the stream-management
	// tool handlers are not registered in this child — the schemas remain
	// visible in LUSE_TOOLS for agent enumeration. Test injection passes a
	// mock streamManager directly to `registerLuseTools`.
	registerLuseTools(server as never, {
		defaultWindowId,
		defaultDisplay,
		redis,
		// Phase 252-06 (R13) — single source: was '?? admin' here vs '?? bruce'
		// in tools.ts. Unified on the shared resolver (default 'bruce').
		userId: resolveLuseUserId(),
		// Phase 161-03 — undefined falls through to APP_MAP (pre-Phase-160-03 behavior)
		livosAppResolver,
		// Phase 274 — actually open a matched LivOS app (spawn + surface). undefined
		// when the env-thread is incomplete → legacy stderr-emit-only behavior.
		openLivosApp,
		// Phase 248-02 — display-lifecycle backend (undefined when redis is null,
		// in which case the 4 display tools fail-closed).
		displayManager,
	})

	const transport = new StdioServerTransport()
	await server.connect(transport)

	// Phase 248-03 — start the TTL GC sweep after the MCP transport is live
	// so vitest / dev restarts that never make it past `server.connect` don't
	// leak the 1h interval handle. `beforeExit` handler clears it on graceful
	// shutdown; `displayTtlGc?.stop()` is null-safe so the handler is fine
	// when displayManager is null (TTL GC was never constructed).
	if (displayTtlGc) {
		displayTtlGc.start()
		process.on('beforeExit', () => displayTtlGc.stop())
	}

	// Log to STDERR so the MCP stdout wire stays clean.
	process.stderr.write(
		`[luse-mcp] connected via stdio transport${
			defaultWindowId !== undefined ? ` (windowId=${defaultWindowId})` : ''
		}${defaultDisplay !== undefined ? ` (display=${defaultDisplay})` : ''}${
			redis !== null ? ' (redis=connected)' : ' (redis=null, create_stream gated off)'
		} (displayManager=${displayManager !== undefined ? 'wired' : 'null'}) (displayTtlGc=${
			displayTtlGc !== undefined ? 'started' : 'null'
		})\n`,
	)
}

main().catch((err) => {
	process.stderr.write(`[luse-mcp] fatal error: ${(err as Error).stack ?? String(err)}\n`)
	process.exit(1)
})
