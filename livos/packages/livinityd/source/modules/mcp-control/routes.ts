// Phase 346-04 (MCP-01, D-346-4 / D-346-6 / D-346-9) — the `mcpControl.*`
// adminProcedure router: the ADMIN control surface for the native MCP
// control-plane server.
//
// ─────────────────────────────────────────────────────────────────────────────
// ZERO imports from the broker/subscription path (D-346-2). Fenced by
// __tests__/broker-zero-import.test.ts. Imports ONLY @trpc/server, zod, the
// shared tRPC builders (../server/trpc/trpc.js), and the local liv_mcp_* DAO
// (./keys-database.js). The broker/subscription path (feedback_subscription_only,
// sacred) is never reached, extended, or referenced.
// ─────────────────────────────────────────────────────────────────────────────
//
// DISTINCT from the consumer-side `mcp.config.*` router (mcp-config-router.ts,
// Redis hash liv:mcp:config — that installs EXTERNAL MCP servers into the chat
// agent). This router is a TOP-LEVEL sibling namespace `mcpControl.*` (D-346-9),
// NOT merged into `mcp.*`, and drives the loopback control-plane transport.
//
// Five adminProcedure routes (every one role-gated + audited by adminProcedure):
//   - mcpControl.getStatus  (query)     → {enabled, listening, host, path}
//   - mcpControl.setEnabled (mutation)  → persist mcpServer.enabled + start/stop
//   - mcpControl.mintKey    (mutation)  → mint liv_mcp_*; plaintext returned ONCE
//   - mcpControl.listKeys   (query)     → key metadata (NEVER hash/plaintext)
//   - mcpControl.revokeKey  (mutation)  → soft-revoke; idempotent → NOT_FOUND
//
// D-346-4 boundary: mintKey/listKeys/revokeKey manage the keys that authenticate
// the TRANSPORT only. NO route here maps a liv_mcp_* key to an admin session —
// the key never becomes a login credential; it is a bounded transport token.
//
// D-346-7 audit: adminProcedure composes auditAdminAction, so setEnabled /
// mintKey / revokeKey each append a device_audit_log row automatically (queries
// are audit-exempt). The MCP-key attribution (ctx.mcpKeyId) threaded in Plan 02
// is orthogonal — that attributes the TOOL calls made THROUGH the transport;
// these admin routes are human-admin actions attributed to ctx.currentUser.

import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {adminProcedure, router} from '../server/trpc/trpc.js'
import {
	createMcpControlKey,
	listMcpControlKeys,
	revokeMcpControlKey,
} from './keys-database.js'

/**
 * Loopback host + route path surfaced by getStatus so the admin UI can render
 * the exact `http://127.0.0.1:<port>/mcp-control` reachable URL. Mirrors the
 * authoritative constants in server.ts (kept as local literals here so this
 * router module stays free of the MCP-SDK/express import graph that server.ts
 * pulls in — the values are structural constants, not runtime state).
 */
export const MCP_CONTROL_STATUS_HOST = '127.0.0.1' as const
export const MCP_CONTROL_STATUS_PATH = '/mcp-control' as const

/** name zod — trim, non-empty, ≤64 chars (mirrors the mcp-config NameSchema). */
const NameSchema = z
	.string()
	.trim()
	.min(1, 'name required')
	.max(64, 'name too long (max 64 chars)')

const SetEnabledInput = z.object({enabled: z.boolean()})
const MintKeyInput = z.object({name: NameSchema})
const RevokeKeyInput = z.object({id: z.string().trim().min(1, 'id required').max(128)})

/**
 * The minimal FileStore surface this router needs. Structurally satisfied by the
 * real `FileStore<StoreSchema>` (boot passes `this.store`) AND by the in-memory
 * fake in routes.test.ts. Only the `mcpServer` key is ever read/written here.
 */
export interface McpControlRouterStore {
	get(property: 'mcpServer'): Promise<{enabled: boolean} | undefined>
	getWriteLock(
		job: (methods: {
			set(property: 'mcpServer', value: {enabled: boolean}): Promise<boolean>
		}) => Promise<void>,
	): Promise<void>
}

/** The server-handle surface this router reads (isListening for getStatus). */
export interface McpControlRouterServer {
	isListening(): boolean
}

export interface McpControlRouterDeps {
	store: McpControlRouterStore
	server: McpControlRouterServer
	/**
	 * Boot-wired DI seam. setEnabled calls this AFTER persisting the flag so the
	 * boot layer can start()/stop() the loopback listener AND update the
	 * synchronous isEnabled() cache the server reads — without a restart.
	 */
	onEnabledChanged: (enabled: boolean) => void | Promise<void>
	logger: {
		info: (msg: string) => void
		warn: (msg: string, err?: unknown) => void
	}
}

export function createMcpControlRouter(deps: McpControlRouterDeps) {
	return router({
		// ── getStatus ───────────────────────────────────────────────────────────
		// Read the persisted enable flag + the live listener state. `listening`
		// lets the admin UI (and threat T-346-18) VERIFY a disable actually tore
		// the listener down, independent of the stored flag.
		getStatus: adminProcedure.query(async () => {
			const cfg = await deps.store.get('mcpServer')
			return {
				enabled: cfg?.enabled === true,
				listening: deps.server.isListening(),
				host: MCP_CONTROL_STATUS_HOST,
				path: MCP_CONTROL_STATUS_PATH,
			}
		}),

		// ── setEnabled ──────────────────────────────────────────────────────────
		// Persist mcpServer.enabled (default-off store key), THEN drive the
		// listener lifecycle via onEnabledChanged (start when true / stop when
		// false). Persist-first so a boot after this survives with the operator's
		// choice (T-346-19). adminProcedure audits this mutation.
		setEnabled: adminProcedure.input(SetEnabledInput).mutation(async ({input}) => {
			await deps.store.getWriteLock(async ({set}) => {
				await set('mcpServer', {enabled: input.enabled})
			})
			await deps.onEnabledChanged(input.enabled)
			deps.logger.info(
				`[mcp-control] control server ${input.enabled ? 'ENABLED' : 'disabled'} by admin`,
			)
			return {ok: true as const, enabled: input.enabled}
		}),

		// ── mintKey ─────────────────────────────────────────────────────────────
		// Mint a fresh liv_mcp_* transport key. The cleartext is returned EXACTLY
		// here and NEVER again (only SHA-256(plaintext) persists — T-346-17). The
		// plaintext is never logged. createdBy = the minting admin's id (nullable
		// on a legacy single-user box with no admin userId).
		mintKey: adminProcedure.input(MintKeyInput).mutation(async ({input, ctx}) => {
			const {row, plaintext} = await createMcpControlKey({
				name: input.name,
				createdBy: ctx.currentUser?.id ?? null,
			})
			// Log the PREFIX + name only — never the plaintext.
			deps.logger.info(
				`[mcp-control] minted MCP key '${row.keyPrefix}…' (${row.name}) by ${ctx.currentUser?.username ?? 'unknown'}`,
			)
			return {
				id: row.id,
				keyPrefix: row.keyPrefix,
				name: row.name,
				createdAt: row.createdAt,
				// ⚠ The ONLY place the cleartext is ever returned. listKeys never has it.
				plaintext,
			}
		}),

		// ── listKeys ────────────────────────────────────────────────────────────
		// Metadata for every MCP key (incl. revoked history). Shaped EXPLICITLY so
		// no key_hash / plaintext can ever leak — the DAO already excludes
		// key_hash, and there is no plaintext column, but the explicit projection
		// is the belt-and-suspenders guard against a future DAO field (T-346-17).
		listKeys: adminProcedure.query(async () => {
			const rows = await listMcpControlKeys()
			return rows.map((r) => ({
				id: r.id,
				keyPrefix: r.keyPrefix,
				name: r.name,
				createdBy: r.createdBy,
				createdAt: r.createdAt,
				lastUsedAt: r.lastUsedAt,
				revokedAt: r.revokedAt,
			}))
		}),

		// ── revokeKey ───────────────────────────────────────────────────────────
		// Soft-revoke by id. rowCount 0 → NOT_FOUND (unknown id OR already revoked
		// — the two collapse; a second revoke of the same id therefore also
		// returns NOT_FOUND, the idempotency contract from the DAO). Audited.
		revokeKey: adminProcedure.input(RevokeKeyInput).mutation(async ({input}) => {
			const {rowCount} = await revokeMcpControlKey({id: input.id})
			if (rowCount === 0) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: `MCP_KEY_NOT_FOUND: No active MCP control key with id '${input.id}'.`,
				})
			}
			deps.logger.info(`[mcp-control] revoked MCP key id=${input.id}`)
			return {ok: true as const, id: input.id}
		}),
	})
}

/**
 * Empty-injection stub — mirrors the mcpConfigRouter / xaiAuth / mastra pattern.
 * Boot wire-up at livinityd/source/index.ts swaps this for a real
 * createMcpControlRouter({store, server, onEnabledChanged, logger}) build via
 * setProductionAppRouter. Until then every route throws PRECONDITION_FAILED so
 * the appRouter type stays stable without exposing an unwired control surface.
 */
const notInjected = (): never => {
	throw new TRPCError({
		code: 'PRECONDITION_FAILED',
		message:
			'mcp-control router not yet injected — livinityd boot did not wire the store/server handle',
	})
}

export const mcpControlRouter = router({
	getStatus: adminProcedure.query(() => notInjected()),
	setEnabled: adminProcedure.input(SetEnabledInput).mutation(() => notInjected()),
	mintKey: adminProcedure.input(MintKeyInput).mutation(() => notInjected()),
	listKeys: adminProcedure.query(() => notInjected()),
	revokeKey: adminProcedure.input(RevokeKeyInput).mutation(() => notInjected()),
})

export type McpControlRouter = ReturnType<typeof createMcpControlRouter>
