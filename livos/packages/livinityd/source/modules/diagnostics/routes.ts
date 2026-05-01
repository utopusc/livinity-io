/**
 * Phase 47 Plan 05 — AI Diagnostics tRPC routers.
 *
 * Per G-07 namespacing decision: routes split across two namespaces
 * (`capabilities` + `apps`) to mirror the Phase 45/46 separate-namespace
 * convention. The internal "diagnostics" module name is NOT exposed as a
 * tRPC namespace — it's only the on-disk module location.
 *
 * Routes shipped:
 *   capabilities.diagnoseRegistry        — adminProcedure  query    (FR-TOOL-01)
 *   capabilities.flushAndResync          — adminProcedure  mutation (FR-TOOL-02) [httpOnlyPaths]
 *   capabilities.modelIdentityDiagnose   — adminProcedure  query    (FR-MODEL-01)
 *   apps.healthProbe                     — privateProcedure mutation (FR-PROBE-01) [httpOnlyPaths]
 *
 * G-04 BLOCKER mitigation (anti-port-scanner):
 *   - `apps.healthProbe` is `privateProcedure`, NOT admin (per success
 *     criterion 8). userId ALWAYS sourced from `ctx.currentUser.id`,
 *     never from input. Defense-in-depth `if (!ctx.currentUser)` gate
 *     before calling `probeAppHealth`.
 *
 * B-12 / X-04 mitigation (httpOnlyPaths):
 *   - `capabilities.flushAndResync` and `apps.healthProbe` are mutations
 *     that must survive WS reconnect. Listed in
 *     `server/trpc/common.ts` httpOnlyPaths (Task 3).
 *
 * Sensitive-env redaction (defense-in-depth — Plan 47-03 already filters
 * by name prefix; this layer also redacts values for any env name matching
 * `*_KEY` / `*_TOKEN` / `*_SECRET` / `*PASS*` / `*API*`).
 */

import {z} from 'zod'
import {TRPCError} from '@trpc/server'

import {adminProcedure, privateProcedure, router} from '../server/trpc/trpc.js'
import * as diagModule from './index.js'

// ── Zod schemas ──────────────────────────────────────────────────────────────

const flushScopeSchema = z.object({scope: z.enum(['builtins', 'all']).default('builtins')})
const appIdSchema = z.object({appId: z.string().min(1).max(120)})

// ── Sensitive-env redaction (T-47-05-02) ────────────────────────────────────

const SENSITIVE_RE = /(_KEY|_TOKEN|_SECRET|PASS|API)/i

function redactEnvs(envs: Record<string, string>[]): Record<string, string>[] {
	return envs.map((e) => {
		const out: Record<string, string> = {}
		for (const k in e) {
			out[k] = SENSITIVE_RE.test(k) ? '<redacted>' : e[k]
		}
		return out
	})
}

// ── capabilities.* router ────────────────────────────────────────────────────

export const capabilitiesRouter = router({
	// FR-TOOL-01: 5-category diagnostic snapshot (adminProcedure query).
	diagnoseRegistry: adminProcedure.query(async () => {
		try {
			return await diagModule.diagnoseRegistry()
		} catch (err: any) {
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: err?.message || 'diagnose_failed',
			})
		}
	}),

	// FR-TOOL-02: atomic-swap registry rebuild (adminProcedure mutation).
	// MUST be in httpOnlyPaths (B-12) — can take 5-10s. ctx.currentUser.id
	// flows into audit row.
	flushAndResync: adminProcedure
		.input(flushScopeSchema)
		.mutation(async ({input, ctx}) => {
			try {
				return await diagModule.flushAndResync({
					scope: input.scope,
					actorUserId: ctx.currentUser?.id,
				})
			} catch (err: any) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err?.message || 'flush_failed',
				})
			}
		}),

	// FR-MODEL-01: 6-step model identity diagnostic (adminProcedure query).
	// Defense-in-depth: redact sensitive env values before returning to client.
	// Plan 47-03 already filters by name; this is the second layer (T-47-05-02).
	modelIdentityDiagnose: adminProcedure.query(async () => {
		try {
			const r = await diagModule.diagnoseModelIdentity()
			if (r.steps.step3_environSnapshot !== 'NONE') {
				const snap = r.steps.step3_environSnapshot as {pids: number[]; envs: Record<string, string>[]}
				snap.envs = redactEnvs(snap.envs)
			}
			return r
		} catch (err: any) {
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: err?.message || 'diagnose_failed',
			})
		}
	}),
})

// ── apps.* extension router ──────────────────────────────────────────────────
//
// Phase 47 ships this as a small router that the registration step
// (server/trpc/index.ts) merges into the existing `apps` namespace via
// `t.mergeRouters` (mergeRouters is the tRPC v10 merge primitive).

export const appsHealthRouter = router({
	// FR-PROBE-01: per-user reachability probe (privateProcedure mutation).
	// G-04 BLOCKER: userId comes from ctx ONLY, NEVER from input.
	healthProbe: privateProcedure
		.input(appIdSchema)
		.mutation(async ({ctx, input}) => {
			if (!ctx.currentUser) {
				throw new TRPCError({code: 'UNAUTHORIZED', message: 'authentication required'})
			}
			// userId comes from ctx ALWAYS — never from input. (G-04 BLOCKER)
			return diagModule.probeAppHealth({appId: input.appId, userId: ctx.currentUser.id})
		}),
})

// Default export: an object with both routers, consumed by server/trpc/index.ts.
export default {capabilitiesRouter, appsHealthRouter}
