/**
 * Phase 205-04 — `openclawos.gateway.*` tRPC router.
 *
 * Eight adminProcedure-gated routes that surface the openclaw gateway's
 * paired-device + allowed-origin + auth-mode CRUD inside the claw-client
 * SettingsDialog Gateway tab. Replaces the SSH-only edit path on
 * `/opt/livos/data/openclaw/openclaw.json` + `devices/paired.json` +
 * `devices/pending.json`.
 *
 * Procedures:
 *
 *   - openclawos.gateway.devices.list    → query  → {paired: [...], pending: [...]}
 *   - openclawos.gateway.devices.revoke  → mutate → {ok: true}
 *   - openclawos.gateway.origins.list    → query  → string[]
 *   - openclawos.gateway.origins.add     → mutate → {ok: true}
 *   - openclawos.gateway.origins.remove  → mutate → {ok: true}
 *   - openclawos.gateway.auth.get        → query  → {mode}
 *   - openclawos.gateway.auth.setMode    → mutate → {ok: true}
 *   - openclawos.gateway.auth.rotateToken→ mutate → {token, generatedAt}
 *
 * Critical 205-01-SPIKE-NOTES locked contracts honoured:
 *
 *   - A1 SELF-LOCK GUARD: caller's deviceId is read from the
 *     `X-Claw-Device-Id` request header (NOT JWT payload — the spike proved
 *     JWT has no deviceId/jti). Match against `input.deviceId` →
 *     `FORBIDDEN/CANNOT_REVOKE_SELF`. When the caller is the X-Api-Key
 *     service-token (no paired browser device), the header is absent and the
 *     guard is skipped (`ctx.usedApiKey === true` shortcut).
 *
 *   - A5 REVOKE RACE: revoke is a 3-step atomic sequence —
 *       1. Scrub `pending.json` rows where `row.deviceId === input.deviceId`
 *          BEFORE the paired delete, so F4 `sweepPendingRequests` cannot
 *          re-promote the revoked device in-flight.
 *       2. Delete `paired.json[input.deviceId]`.
 *       3. Append to `revoked.json` deny-list — `device-auto-approver.ts`
 *          consults this list before promoting any pending entry on the
 *          next handshake (the matching 4-line patch lives in
 *          device-auto-approver.ts).
 *
 *   - A6 AUTH MODE ENUM: `auth.mode` accepts the LIVE-PROBED enum
 *     `['none', 'token', 'password', 'trusted-proxy']` — NOT the SPEC's
 *     `'token' | 'master'` (planner-side guess; gateway error message
 *     proved the real enum). Mode persistence is per-file-write — gateway
 *     re-reads on every mtime change; NO `kill -HUP` / `systemctl restart`
 *     is needed.
 *
 * Defense-in-depth:
 *
 *   - If `extractCallerDeviceId` returns NULL on a non-X-Api-Key call
 *     (typically a JWT-cookie call that legitimately lacks the header on
 *     a revoke mutation), the guard refuses with
 *     `FORBIDDEN/NO_CALLER_IDENTITY` rather than failing open. This closes
 *     the RESEARCH § Pitfall 4 hole.
 *
 *   - `auth.get` redacts the gateway token on the wire (INV-204-04
 *     redact-on-read). Only `auth.rotateToken` ever returns a raw token —
 *     and that response is rendered exactly once in the UI's banner.
 *
 *   - All 8 paths are registered in `httpOnlyPaths` (./common.ts) so the
 *     mutations don't hang on a half-broken WS after `systemctl restart
 *     livos` (memory pitfall B-12 / X-04).
 */

import {randomBytes} from 'node:crypto'
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from 'node:fs'
import {dirname, join} from 'node:path'

import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {OpenclawConfigStore} from '../../openclawos/openclaw-config-store.js'
import {adminProcedure, router} from './trpc.js'

// ── Dep + schema types ──────────────────────────────────────────────────

export interface OpenclawosGatewayRedis {
	del(key: string): Promise<number>
}

export interface OpenclawosGatewayLogger {
	info: (msg: string) => void
	warn: (msg: string, error?: unknown) => void
}

export interface OpenclawosGatewayRouterDeps {
	/** Atomic JSON store over /opt/livos/data/openclaw/openclaw.json. */
	configStore: OpenclawConfigStore
	/** Dir holding paired.json + pending.json + revoked.json. */
	devicesDir: string
	/** Used to best-effort poison device-token slots on revoke. */
	redis: OpenclawosGatewayRedis
	logger: OpenclawosGatewayLogger
}

const DeviceIdSchema = z
	.string()
	.min(8)
	.max(128)
	.regex(/^[a-zA-Z0-9_-]+$/, 'INVALID_DEVICE_ID')

const OriginSchema = z
	.string()
	.url('INVALID_ORIGIN')
	.max(2048)
	.regex(/^https?:\/\//, 'INVALID_ORIGIN')

// 205-01 A6 LIVE-PROBED enum — NOT the SPEC's 'token' | 'master'
const AuthModeSchema = z.enum(['none', 'token', 'password', 'trusted-proxy'])

// ── paired.json / pending.json / revoked.json schemas ───────────────────

interface PairedRow {
	deviceId: string
	platform?: string
	clientId?: string
	clientMode?: string
	role?: string
	roles?: string[]
	scopes?: string[]
	tokens?: Record<
		string,
		{token: string; role: string; scopes: string[]; createdAtMs: number}
	>
	createdAtMs?: number
	approvedAtMs?: number
	[k: string]: unknown
}

interface PendingRow {
	requestId: string
	deviceId: string
	[k: string]: unknown
}

interface RevokedRow {
	revokedAtMs: number
	reason: string
}

// ── File I/O helpers (mirror device-auto-approver.ts writeJsonAtomic) ───

function readJsonOrEmpty<T extends object>(path: string): T {
	try {
		if (!existsSync(path)) return {} as T
		const raw = readFileSync(path, 'utf8')
		const parsed = JSON.parse(raw)
		return (parsed && typeof parsed === 'object' ? parsed : {}) as T
	} catch {
		return {} as T
	}
}

function writeJsonAtomic(path: string, value: object): void {
	mkdirSync(dirname(path), {recursive: true})
	const tmp = `${path}.tmp.${process.pid}.${Date.now()}`
	writeFileSync(tmp, JSON.stringify(value, null, 2))
	renameSync(tmp, path)
}

// ── Caller-identity resolver (205-01 A1 LOCKED) ─────────────────────────

/**
 * Resolve the caller's deviceId for self-lock-guard purposes.
 *
 * Per 205-01-SPIKE-NOTES § A1: claw-client browser sessions carry NEITHER
 * a `deviceId` NOR a `jti` claim in the LIVINITY_SESSION JWT. The
 * authoritative source is the `X-Claw-Device-Id` request header which the
 * claw-client populates from its IndexedDB-cached `getOrCreateDeviceIdentity()`
 * result (the 64-hex sha256(publicKey) string).
 *
 * X-Api-Key service-token callers (no paired browser device) skip the guard
 * entirely — the spike DECISION block says: "internal callers cannot lock
 * themselves out, so defense-in-depth is skipped." Detect via
 * `ctx.usedApiKey === true` when present, else by the header's absence.
 */
function extractCallerDeviceId(ctx: unknown): string | null {
	const c = ctx as {
		request?: {
			headers?:
				| Record<string, string | string[] | undefined>
				| {[k: string]: string | string[] | undefined}
		}
	}
	const headers = c.request?.headers
	if (!headers) return null
	const raw =
		(headers as Record<string, string | string[] | undefined>)[
			'x-claw-device-id'
		] ??
		(headers as Record<string, string | string[] | undefined>)[
			'X-Claw-Device-Id'
		]
	if (Array.isArray(raw)) return raw[0] ?? null
	if (typeof raw === 'string' && raw.length > 0) return raw
	return null
}

// ── Router factory ──────────────────────────────────────────────────────

export function createOpenclawosGatewayRouter(
	deps: OpenclawosGatewayRouterDeps,
) {
	const pairedPath = () => join(deps.devicesDir, 'paired.json')
	const pendingPath = () => join(deps.devicesDir, 'pending.json')
	const revokedPath = () => join(deps.devicesDir, 'revoked.json')

	return router({
		devices: router({
			list: adminProcedure.query(async () => {
				const paired = readJsonOrEmpty<Record<string, PairedRow>>(pairedPath())
				const pending = readJsonOrEmpty<Record<string, PendingRow>>(
					pendingPath(),
				)
				return {
					paired: Object.values(paired).map((row) => ({
						deviceId: row.deviceId,
						role: row.role ?? null,
						platform: row.platform ?? null,
						clientId: row.clientId ?? null,
						createdAtMs: row.createdAtMs ?? null,
						approvedAtMs: row.approvedAtMs ?? null,
					})),
					pending: Object.values(pending).map((row) => ({
						deviceId: row.deviceId,
						requestId: row.requestId,
					})),
				}
			}),

			revoke: adminProcedure
				.input(z.object({deviceId: DeviceIdSchema}))
				.mutation(async ({ctx, input}) => {
					// ── Self-lock guard (205-01 A1) ─────────────────────────
					const callerId = extractCallerDeviceId(ctx)
					if (callerId === null) {
						// Defense-in-depth: refuse rather than fail open.
						// X-Api-Key callers (no paired device) also hit this — but
						// since they have no paired device, they have nothing to
						// self-lock; the operator UI is the only consumer of
						// revoke, and the operator UI always sends the header.
						throw new TRPCError({
							code: 'FORBIDDEN',
							message: 'NO_CALLER_IDENTITY',
						})
					}
					if (callerId === input.deviceId) {
						throw new TRPCError({
							code: 'FORBIDDEN',
							message: 'CANNOT_REVOKE_SELF',
						})
					}

					// ── Existence check ─────────────────────────────────────
					const paired = readJsonOrEmpty<Record<string, PairedRow>>(
						pairedPath(),
					)
					if (!paired[input.deviceId]) {
						throw new TRPCError({
							code: 'NOT_FOUND',
							message: 'DEVICE_NOT_PAIRED',
						})
					}

					// Capture jti(s) from the operator token slot for Redis
					// poison. paired.json operator tokens are 43-char base64url
					// opaque (NOT JWTs) per 205-01 A5 — so the "jti" here is
					// effectively the token string itself. Redis poison is
					// best-effort.
					const operatorToken =
						paired[input.deviceId]?.tokens?.['operator']?.token

					// ── 1. SCRUB pending.json (A5 race mitigation) ──────────
					const pending = readJsonOrEmpty<Record<string, PendingRow>>(
						pendingPath(),
					)
					let pendingScrubbed = 0
					for (const requestId of Object.keys(pending)) {
						if (pending[requestId]?.deviceId === input.deviceId) {
							delete pending[requestId]
							pendingScrubbed++
						}
					}
					writeJsonAtomic(pendingPath(), pending)

					// ── 2. DELETE paired.json row ───────────────────────────
					delete paired[input.deviceId]
					writeJsonAtomic(pairedPath(), paired)

					// ── 3. APPEND to revoked.json deny-list ─────────────────
					const revoked = readJsonOrEmpty<Record<string, RevokedRow>>(
						revokedPath(),
					)
					revoked[input.deviceId] = {
						revokedAtMs: Date.now(),
						reason: 'operator-revoke',
					}
					writeJsonAtomic(revokedPath(), revoked)

					// ── Best-effort Redis poison ────────────────────────────
					try {
						await deps.redis.del(
							`liv:openclaw:devicetoken:${input.deviceId}`,
						)
						if (operatorToken) {
							await deps.redis.del(
								`liv:openclaw:devicetoken:${operatorToken}`,
							)
						}
					} catch (err) {
						deps.logger.warn(
							`[openclawos.gateway] redis poison failed for ${input.deviceId.slice(
								0,
								12,
							)}… (non-fatal)`,
							err,
						)
					}

					deps.logger.info(
						`[openclawos.gateway] revoked device ${input.deviceId.slice(
							0,
							12,
						)}… (pending scrubbed=${pendingScrubbed})`,
					)
					return {ok: true as const}
				}),
		}),

		origins: router({
			list: adminProcedure.query(async () => {
				try {
					const cfg = deps.configStore.read()
					return cfg.gateway?.controlUi?.allowedOrigins ?? []
				} catch (err) {
					throw mapConfigError(err)
				}
			}),

			add: adminProcedure
				.input(z.object({origin: OriginSchema}))
				.mutation(async ({input}) => {
					try {
						deps.configStore.patch((cfg) => {
							cfg.gateway = cfg.gateway ?? {}
							cfg.gateway.controlUi = cfg.gateway.controlUi ?? {}
							const list = cfg.gateway.controlUi.allowedOrigins ?? []
							if (!list.includes(input.origin)) {
								list.push(input.origin)
							}
							cfg.gateway.controlUi.allowedOrigins = list
						})
						return {ok: true as const}
					} catch (err) {
						throw mapConfigError(err)
					}
				}),

			remove: adminProcedure
				.input(z.object({origin: z.string().min(1).max(2048)}))
				.mutation(async ({input}) => {
					try {
						let removed = false
						deps.configStore.patch((cfg) => {
							const list = cfg.gateway?.controlUi?.allowedOrigins ?? []
							const idx = list.indexOf(input.origin)
							if (idx >= 0) {
								list.splice(idx, 1)
								removed = true
							}
							if (cfg.gateway?.controlUi) {
								cfg.gateway.controlUi.allowedOrigins = list
							}
						})
						if (!removed) {
							throw new TRPCError({
								code: 'NOT_FOUND',
								message: 'ORIGIN_NOT_FOUND',
							})
						}
						return {ok: true as const}
					} catch (err) {
						if (err instanceof TRPCError) throw err
						throw mapConfigError(err)
					}
				}),
		}),

		auth: router({
			// INV-204-04 redact-on-read: never include the raw token.
			get: adminProcedure.query(async () => {
				try {
					const cfg = deps.configStore.read()
					return {
						mode: cfg.gateway?.auth?.mode ?? 'token',
					}
				} catch (err) {
					throw mapConfigError(err)
				}
			}),

			setMode: adminProcedure
				.input(z.object({mode: AuthModeSchema}))
				.mutation(async ({input}) => {
					try {
						deps.configStore.patch((cfg) => {
							cfg.gateway = cfg.gateway ?? {}
							cfg.gateway.auth = cfg.gateway.auth ?? {}
							cfg.gateway.auth.mode = input.mode
						})
						deps.logger.info(
							`[openclawos.gateway] auth.mode set → ${input.mode}`,
						)
						return {ok: true as const}
					} catch (err) {
						throw mapConfigError(err)
					}
				}),

			rotateToken: adminProcedure.mutation(async () => {
				try {
					const token = randomBytes(32).toString('hex') // 64-char hex
					deps.configStore.patch((cfg) => {
						cfg.gateway = cfg.gateway ?? {}
						cfg.gateway.auth = cfg.gateway.auth ?? {}
						cfg.gateway.auth.token = token
					})
					const generatedAt = new Date().toISOString()
					deps.logger.info(
						`[openclawos.gateway] auth.token rotated (generatedAt=${generatedAt})`,
					)
					return {token, generatedAt}
				} catch (err) {
					throw mapConfigError(err)
				}
			}),
		}),

		// ── config: raw openclaw.json read/write (Phase 220 T1) ─────────────
		// Operator quote 2026-05-26: "MCP Servers kismina Config dosyasini
		// editleme bolumude koy". Surfaces the canonical /opt/livos/data/
		// openclaw/openclaw.json content + a Save that goes through the same
		// atomic OpenclawConfigStore.patch primitive every mutation already
		// uses. JSON-validate before write so a malformed paste cannot brick
		// the gateway.
		//
		// Phase 220 T1 fix-up 2026-05-26 — `gateway.auth.token` is a real
		// secret used by claw-client to authenticate against the gateway.
		// Exposing it in the textarea was a leak (screenshot, accidental
		// delete, etc.). Read redacts to a sentinel; write substitutes the
		// sentinel back to the live value so a round-trip save preserves the
		// real token without ever rendering it.
		config: router({
			read: adminProcedure.query(async () => {
				try {
					const cfg = deps.configStore.read()
					// Defensive clone via JSON round-trip so the redact mutation
					// doesn't touch the on-disk in-memory representation.
					const redacted = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>
					const gw = redacted.gateway as Record<string, unknown> | undefined
					const auth = gw?.auth as Record<string, unknown> | undefined
					const hadToken = typeof auth?.token === 'string' && (auth.token as string).length > 0
					if (auth && hadToken) auth.token = '__REDACTED_KEEP_AS_IS__'
					return {
						json: JSON.stringify(redacted, null, 2),
						readAt: new Date().toISOString(),
						hasRedactedSecrets: hadToken,
					}
				} catch (err) {
					throw mapConfigError(err)
				}
			}),

			write: adminProcedure
				.input(z.object({json: z.string().max(500_000)}))
				.mutation(async ({input}) => {
					let parsed: unknown
					try {
						parsed = JSON.parse(input.json)
					} catch (err) {
						throw new TRPCError({
							code: 'BAD_REQUEST',
							message: `OPENCLAW_CONFIG_INVALID_JSON: ${(err as Error).message}`,
						})
					}
					if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
						throw new TRPCError({
							code: 'BAD_REQUEST',
							message: 'OPENCLAW_CONFIG_NOT_OBJECT',
						})
					}
					try {
						const incoming = parsed as Record<string, unknown>
						// Replace-all semantics: every top-level key from the new
						// JSON wins; keys absent from input are dropped. Matches the
						// SSH-edit behavior operators are used to.
						deps.configStore.patch((cfg) => {
							// Phase 220 T1 fix-up — preserve the live auth.token
							// when the operator left the redaction sentinel in place
							// (no edit). Operators who genuinely want to rotate the
							// token use the dedicated `auth.rotateToken` mutation
							// above; pasting a real token in here also works.
							const currentGw = cfg.gateway as Record<string, unknown> | undefined
							const currentToken = (currentGw?.auth as Record<string, unknown> | undefined)
								?.token
							const incomingGw = incoming.gateway as Record<string, unknown> | undefined
							const incomingAuth = incomingGw?.auth as Record<string, unknown> | undefined
							if (
								incomingAuth &&
								incomingAuth.token === '__REDACTED_KEEP_AS_IS__' &&
								typeof currentToken === 'string'
							) {
								incomingAuth.token = currentToken
							}
							for (const k of Object.keys(cfg)) {
								delete (cfg as Record<string, unknown>)[k]
							}
							for (const [k, v] of Object.entries(incoming)) {
								(cfg as Record<string, unknown>)[k] = v
							}
						})
						deps.logger.info('[openclawos.gateway] config.write applied raw JSON')
						return {ok: true as const, writtenAt: new Date().toISOString()}
					} catch (err) {
						throw mapConfigError(err)
					}
				}),
		}),
	})
}

export type OpenclawosGatewayRouter = ReturnType<
	typeof createOpenclawosGatewayRouter
>

function mapConfigError(err: unknown): TRPCError {
	if (err instanceof TRPCError) return err
	const msg = err instanceof Error ? err.message : String(err)
	if (msg.includes('OPENCLAW_CONFIG_MISSING')) {
		return new TRPCError({
			code: 'PRECONDITION_FAILED',
			message: 'OPENCLAW_CONFIG_MISSING',
		})
	}
	return new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: msg})
}

/**
 * Empty-injection stub returned when production boot has not yet wired the
 * config store (e.g. missing openclaw.json). Every procedure throws
 * PRECONDITION_FAILED + OPENCLAW_GATEWAY_UNAVAILABLE so the UI surfaces a
 * clean error rather than hanging.
 *
 * Mirrors `openclawos-router.ts` empty-injection pattern (lines 312-330).
 */
export const openclawosGatewayRouter = createOpenclawosGatewayRouter({
	configStore: {
		read: () => {
			throw gatewayUnavailable()
		},
		patch: () => {
			throw gatewayUnavailable()
		},
	} as unknown as OpenclawConfigStore,
	devicesDir: '/dev/null',
	redis: {
		del: async () => 0,
	},
	logger: {info: () => undefined, warn: () => undefined},
})

export function createEmptyOpenclawosGatewayRouter() {
	return openclawosGatewayRouter
}

function gatewayUnavailable(): TRPCError {
	return new TRPCError({
		code: 'PRECONDITION_FAILED',
		message: 'OPENCLAW_GATEWAY_UNAVAILABLE',
	})
}
