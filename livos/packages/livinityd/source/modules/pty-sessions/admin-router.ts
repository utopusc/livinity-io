/**
 * Phase 246-03 — pty-sessions admin tRPC sub-router.
 *
 * Two adminProcedure-gated routes consumed by the v44 "Active terminals"
 * admin UI (deferred to Phase 246-05):
 *
 *   - listSessions () -> SessionSummary[]
 *       Returns the SessionManager's serializable session list (pty stripped).
 *
 *   - killSession ({id: string}) -> {killed: boolean}
 *       Terminates the PtySession by sessionId. Returns false if the id is
 *       unknown to the manager. The map is updated synchronously by
 *       SessionManager.kill() so subsequent listSessions() reflect the
 *       removal immediately.
 *
 * adminProcedure enforces role==='admin' via the v7.0 RBAC primitive
 * (`requireRole('admin')` middleware in server/trpc/is-authenticated.ts).
 * In legacy single-user mode (no DB), requireRole short-circuits to admin —
 * the same behavior every other admin sub-router relies on (chromeMaster,
 * fail2ban admin, devices admin, etc.).
 *
 * Mounted at `ptySessions.*` in the root tRPC composition (server/trpc/index.ts
 * createAppRouter()). Both procedure paths are added to httpOnlyPaths in
 * server/trpc/common.ts — mutations would otherwise hang on a half-broken
 * WS after `systemctl restart livos` (memory pitfall B-12 / X-04).
 *
 * D-V44-SACRED: this module does NOT touch sdk-agent-runner.ts.
 */

import {z} from 'zod'

import {adminProcedure, router} from '../server/trpc/trpc.js'
import type {SessionManager} from './session-manager.js'

export interface PtySessionsAdminRouterDeps {
	sessionManager: SessionManager
}

export function createPtySessionsAdminRouter(deps: PtySessionsAdminRouterDeps) {
	return router({
		listSessions: adminProcedure.query(() => deps.sessionManager.list()),
		killSession: adminProcedure
			.input(z.object({id: z.string()}))
			.mutation(({input}) => ({killed: deps.sessionManager.kill(input.id)})),
	})
}

export type PtySessionsAdminRouter = ReturnType<typeof createPtySessionsAdminRouter>
