/**
 * Phase 46 Plan 03 — fail2ban admin tRPC router.
 *
 * Five procedures (3 queries + 2 mutations), all gated by `adminProcedure`:
 *   - listJails        (q)  4-state service detection (FR-F2B-01)
 *   - getJailStatus    (q)  per-jail counters + banned IP list
 *   - listEvents       (q)  audit-log surface (FR-F2B-04)
 *   - unbanIp          (m)  action-targeted unban + optional whitelist (B-01 / FR-F2B-02)
 *   - banIp            (m)  manual ban with self-ban gate (B-02 / B-19 / FR-F2B-03)
 *
 * Defense-in-depth (per pitfall B-03 + threat T-46-12):
 *   - ipSchema is an IPv4 dotted-quad regex — CIDR rejected at Zod layer.
 *   - jailSchema rejects non-`[a-zA-Z0-9_.-]+` strings (T-46-17 layer 1).
 *   - client.ts re-validates BOTH before every execFile spawn (layer 2 / 3).
 *
 * Self-ban detection (per pitfall B-02 + threat T-46-11):
 *   - Computes the admin's "active source IPs" = HTTP X-Forwarded-For ∪
 *     active SSH sessions (from active-sessions.ts).
 *   - If the ban-target IP matches one of those AND
 *     `confirmation !== 'LOCK ME OUT'`, throw TRPCError CONFLICT 'self_ban'.
 *   - `cellularBypass: true` opts out (per pitfall B-19 + threat T-46-15) —
 *     admin attests they're on cellular CGNAT and the source IP comparison
 *     would be a false-positive.
 *
 * Audit (per FR-F2B-04 + threat T-46-16):
 *   - Every mutation calls `recordFail2banEvent({...})` AFTER its action,
 *     including failure paths (success: false, error: msg).
 *   - events.ts is fire-and-forget — never throws to caller.
 *
 * Error mapping (per PATTERNS.md error table):
 *   binary-missing   → INTERNAL_SERVER_ERROR 'fail2ban_missing'
 *   service-down     → INTERNAL_SERVER_ERROR 'service_inactive'
 *   jail-not-found   → NOT_FOUND             'jail_not_found'
 *   ip-invalid       → BAD_REQUEST           (preserves err.message)
 *   timeout/transient→ INTERNAL_SERVER_ERROR 'transient_error'
 */

import {z} from 'zod'
import {TRPCError} from '@trpc/server'

import {adminProcedure, router} from '../server/trpc/trpc.js'
import {
	listJails as listJailsImpl,
	getJailStatus as getJailStatusImpl,
	unbanIp as unbanIpImpl,
	banIp as banIpImpl,
	addIgnoreIp as addIgnoreIpImpl,
	listEvents as listEventsImpl,
} from './index.js'
import {Fail2banClientError, realFail2banClient} from './client.js'
import {realActiveSessionsProvider} from './active-sessions.js'
import {recordFail2banEvent} from './events.js'

// ─── Zod schemas ─────────────────────────────────────────────────────────────

/**
 * IPv4 dotted-quad ONLY. CIDR rejected entirely for v29.4 (per pitfall B-03 /
 * threat T-46-12). If CIDR support is wanted in a later phase, the regex is
 * the boundary to relax (and only with a /8-/32 cap to prevent /0 footgun).
 */
const ipSchema = z
	.string()
	.trim()
	.refine(
		(s) =>
			/^(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/.test(s),
		'must be IPv4 dotted-quad (no CIDR allowed in v29.4 — pitfall B-03)',
	)

const jailSchema = z
	.string()
	.trim()
	.regex(/^[a-zA-Z0-9_.-]+$/, 'jail name must match [a-zA-Z0-9_.-]+')

// ─── Error mapping helper ────────────────────────────────────────────────────

function mapClientErrorToTrpc(err: unknown): never {
	if (err instanceof Fail2banClientError) {
		switch (err.kind) {
			case 'binary-missing':
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'fail2ban_missing',
				})
			case 'service-down':
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'service_inactive',
				})
			case 'jail-not-found':
				throw new TRPCError({code: 'NOT_FOUND', message: 'jail_not_found'})
			case 'ip-invalid':
				throw new TRPCError({code: 'BAD_REQUEST', message: err.message})
			case 'timeout':
			case 'transient':
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'transient_error',
				})
			case 'parse-failed':
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'parse_failed',
				})
		}
	}
	// Unknown → re-throw verbatim for tRPC default INTERNAL_SERVER_ERROR mapping
	throw err
}

// ─── Self-ban detection (banIp procedure) ────────────────────────────────────

/**
 * Compute the set of IP addresses currently belonging to the admin. Used by
 * banIp to prevent a self-DoS lockout unless the admin types 'LOCK ME OUT'
 * (per pitfall B-02 / threat T-46-11).
 *
 * Sources:
 *   1. HTTP X-Forwarded-For (first hop) — only available when the request
 *      transport is Express (HTTP). On WS transport, ctx.request is undefined.
 *      With v29.4 Phase 46 httpOnlyPaths additions, fail2ban.banIp ALWAYS
 *      arrives on HTTP, so this path is the primary signal.
 *   2. Active SSH session source IPs from `who -u` (active-sessions.ts).
 *      Best-effort — degrades to [] on error (e.g., `who` missing).
 */
async function getAdminActiveIps(ctx: {
	request?: {headers?: Record<string, unknown>} | undefined
}): Promise<Set<string>> {
	const headers = ctx.request?.headers ?? {}
	const fwdRaw = headers['x-forwarded-for']
	let httpIp: string | null = null
	if (typeof fwdRaw === 'string') {
		httpIp = fwdRaw.split(',')[0]?.trim() || null
	} else if (Array.isArray(fwdRaw) && fwdRaw.length > 0) {
		const first = fwdRaw[0]
		if (typeof first === 'string') httpIp = first.split(',')[0]?.trim() || null
	}

	const sshSessions = await realActiveSessionsProvider
		.listActiveSshSessions()
		.catch(() => [] as Array<{sourceIp: string | null}>)

	const ips = new Set<string>()
	if (httpIp) ips.add(httpIp)
	for (const s of sshSessions) {
		if (s.sourceIp) ips.add(s.sourceIp)
	}
	return ips
}

// ─── Router ──────────────────────────────────────────────────────────────────

export type ListJailsResult = {
	state: 'binary-missing' | 'service-inactive' | 'no-jails' | 'running'
	jails: string[]
	transient: boolean
}

const fail2banRouter = router({
	/**
	 * FR-F2B-01: 4-state service detection. Returns one of:
	 *   binary-missing   — fail2ban not installed (UI: "Run /opt/livos/install.sh")
	 *   service-inactive — fail2ban-server stopped (UI: "Start service?" button)
	 *   no-jails         — running but no jails configured (UI: yellow banner)
	 *   running          — happy path; jails populated
	 *
	 * `transient: true` is set when a non-fatal error path was hit (timeout /
	 * generic transient) so the UI can show "Fail2ban restarting…" without
	 * crashing (per pitfall B-05 / W-05).
	 */
	listJails: adminProcedure.query(async (): Promise<ListJailsResult> => {
		try {
			const jails = await listJailsImpl()
			if (jails.length === 0) {
				return {state: 'no-jails', jails: [], transient: false}
			}
			return {state: 'running', jails, transient: false}
		} catch (err) {
			if (err instanceof Fail2banClientError) {
				if (err.kind === 'binary-missing') {
					return {state: 'binary-missing', jails: [], transient: false}
				}
				if (err.kind === 'service-down') {
					return {state: 'service-inactive', jails: [], transient: false}
				}
				if (err.kind === 'timeout' || err.kind === 'transient') {
					// Surface state, don't crash the UI (pitfall B-05).
					return {state: 'running', jails: [], transient: true}
				}
			}
			throw err
		}
	}),

	/**
	 * Per-jail status snapshot. Optionally enriched with last-attempted-user
	 * for each banned IP via auth.log scan (FR-F2B-02 sub-issue #3) — the
	 * enrichment is wrapped in try/catch so an auth.log read failure never
	 * fails the query.
	 */
	getJailStatus: adminProcedure
		.input(z.object({jail: jailSchema}))
		.query(async ({input}) => {
			try {
				const status = await getJailStatusImpl(input.jail)
				// Enrich each banned IP with last-attempted-user (best-effort).
				const lastUsers: Record<string, string | null> = {}
				for (const ip of status.bannedIps) {
					try {
						lastUsers[ip] = await realFail2banClient.readAuthLogForLastUser(ip)
					} catch {
						lastUsers[ip] = null
					}
				}
				return {...status, lastAttemptedUsers: lastUsers}
			} catch (err) {
				mapClientErrorToTrpc(err)
			}
		}),

	/**
	 * FR-F2B-04: read-side audit log surface. Returns the most recent ban /
	 * unban / whitelist events, joined with users for admin_username.
	 */
	listEvents: adminProcedure
		.input(z.object({limit: z.number().int().min(1).max(200).default(50)}))
		.query(async ({input}) => {
			return listEventsImpl({limit: input.limit})
		}),

	/**
	 * FR-F2B-02: action-targeted unban (B-01) + optional ignoreip whitelist.
	 * Audit row is written with action='whitelist_ip' when addToWhitelist is
	 * true (the unban itself is a prerequisite, not a separate event).
	 */
	unbanIp: adminProcedure
		.input(
			z.object({
				jail: jailSchema,
				ip: ipSchema,
				addToWhitelist: z.boolean().default(false),
			}),
		)
		.mutation(async ({ctx, input}) => {
			const {jail, ip, addToWhitelist} = input
			const userId = ctx.currentUser?.id ?? ''
			const username = ctx.currentUser?.username ?? 'unknown'
			const action: 'unban_ip' | 'whitelist_ip' = addToWhitelist
				? 'whitelist_ip'
				: 'unban_ip'

			try {
				await unbanIpImpl(jail, ip)
				if (addToWhitelist) await addIgnoreIpImpl(jail, ip)
			} catch (err) {
				// Best-effort failure audit before re-throw.
				await recordFail2banEvent({
					action,
					jail,
					ip,
					userId,
					username,
					source: 'ui',
					success: false,
					error: err instanceof Error ? err.message : String(err),
				})
				mapClientErrorToTrpc(err)
			}

			await recordFail2banEvent({
				action,
				jail,
				ip,
				userId,
				username,
				source: 'ui',
				success: true,
			})
			return {ok: true}
		}),

	/**
	 * FR-F2B-03: manual ban with self-ban gate (B-02) + cellular bypass (B-19).
	 *
	 * Self-ban detection runs FIRST. If `cellularBypass !== true` AND the
	 * target IP matches the admin's current source IPs AND
	 * `confirmation !== 'LOCK ME OUT'`, the procedure throws TRPCError
	 * CONFLICT 'self_ban' WITHOUT calling fail2ban-client. The UI (Plan 04)
	 * surfaces the type-LOCK-ME-OUT modal in response and re-calls with the
	 * literal-string confirmation to proceed.
	 *
	 * The Zod schema rejects `0.0.0.0/0` (and any other CIDR notation) BEFORE
	 * this body runs (pitfall B-03 layer 1).
	 */
	banIp: adminProcedure
		.input(
			z.object({
				jail: jailSchema,
				ip: ipSchema,
				confirmation: z.literal('LOCK ME OUT').optional(),
				cellularBypass: z.boolean().default(false),
			}),
		)
		.mutation(async ({ctx, input}) => {
			const {jail, ip, confirmation, cellularBypass} = input
			const userId = ctx.currentUser?.id ?? ''
			const username = ctx.currentUser?.username ?? 'unknown'

			// Self-ban detection (B-02 + B-19)
			if (!cellularBypass) {
				const adminIps = await getAdminActiveIps(ctx)
				if (adminIps.has(ip) && confirmation !== 'LOCK ME OUT') {
					throw new TRPCError({
						code: 'CONFLICT',
						message: 'self_ban',
						cause: {adminIps: [...adminIps], banTargetIp: ip},
					})
				}
			}

			try {
				await banIpImpl(jail, ip)
			} catch (err) {
				await recordFail2banEvent({
					action: 'ban_ip',
					jail,
					ip,
					userId,
					username,
					source: 'ui',
					success: false,
					error: err instanceof Error ? err.message : String(err),
				})
				mapClientErrorToTrpc(err)
			}

			await recordFail2banEvent({
				action: 'ban_ip',
				jail,
				ip,
				userId,
				username,
				source: 'ui',
				success: true,
			})
			return {ok: true}
		}),
})

export default fail2banRouter
