import {ZodError} from 'zod'
import {initTRPC} from '@trpc/server'

import {type Context} from './context.js'
import {isAuthenticated, isAuthenticatedIfUserExists, requireRole, requireRoleIfUserExists} from './is-authenticated.js'
import {websocketLogger} from './websocket-logger.js'
import {auditAdminAction} from '../../security-audit/audit-middleware.js'
import {requireStepUpGrant} from './step-up-guard.js'
import {requireScope, requireAnyScope} from './scope-guard.js'

// `t` is exported (not just internal) so v29.4 Phase 47 Plan 05 can call
// `t.mergeRouters(appsBase, appsHealthRouter)` from server/trpc/index.ts to
// extend the existing `apps` namespace with the new `apps.healthProbe`
// procedure (FR-PROBE-01 / G-07 namespacing Option B).
export const t = initTRPC.context<Context>().create({
	// TODO: Add more context on why this is needed
	// https://trpc.io/docs/server/error-formatting#adding-custom-formatting
	errorFormatter(options) {
		const {shape, error} = options
		return {
			...shape,
			data: {
				...shape.data,
				zodError: error.code === 'BAD_REQUEST' && error.cause instanceof ZodError ? error.cause.flatten() : null,
			},
		}
	},
})
export const router = t.router
const baseProcedure = t.procedure.use(websocketLogger)
export const publicProcedure = baseProcedure
export const privateProcedure = baseProcedure.use(isAuthenticated)
// Use this procedure type sparingly, it's for exposing endpoints that usually need authentication but
// may need to be used before a user is registered when a token can't exist. We shouldn't use it for
// everything because there could be edgecases where it gets applied like if the user file is corrupted.
export const publicProcedureWhenNoUserExists = baseProcedure.use(isAuthenticatedIfUserExists)
// Admin-only procedure: requires authentication + admin role.
// Phase 328 SEC-01: auditAdminAction is composed AFTER requireRole('admin') so
// every admin MUTATION appends one device_audit_log row (queries excluded), and
// an unauthorized caller throws in the role gate before the audit fires (ASVS
// V4 — never log a FORBIDDEN attempt as a legitimate admin action).
export const adminProcedure = privateProcedure.use(requireRole('admin')).use(auditAdminAction)
// Phase 334 (STEPUP-01, D-334-2): admin + a fresh 5-min step-up grant. Step-up
// composes AFTER role + audit, so a non-admin fails on the role gate first and
// a grant-less admin attempt is still audit-recorded before STEP_UP_REQUIRED.
// Gated paths MUST also be in httpOnlyPaths (grant cookie is HTTP-only).
export const stepUpAdminProcedure = adminProcedure.use(requireStepUpGrant)
// Phase 335 (ROLE-01, D-335-2): scoped-admin procedures. A full admin passes
// every scope (requireScope admits role==='admin'), so swapping a route from
// adminProcedure to one of these NEVER changes admin behavior — it only ADDS
// the bounded scope-holder surface. auditAdminAction composes after the scope
// gate (scope-holder mutations are audited like admin actions; queries are
// audit-exempt exactly as on adminProcedure).
// (review INFO-2: a single-scope read-only-admin procedure was dead code — the
// read surface uses scopedAdminReadProcedure below, which admits EITHER scope,
// since a share-admin needs the same lists to drive the sharing UI. Removed to
// avoid future misuse. Re-add if a read-only-admin-EXCLUSIVE route ever exists.)
export const shareAdminProcedure = privateProcedure.use(requireScope('share-admin')).use(auditAdminAction)
// The shared READ surface (user/group lists) — EITHER scope may view it (the
// share-admin needs the same lists to drive the sharing UI). Attach ONLY to
// `.query(` procedures — never a mutation.
export const scopedAdminReadProcedure = privateProcedure
	.use(requireAnyScope(['read-only-admin', 'share-admin']))
	.use(auditAdminAction)
// Backups-v2 P0 (D10): admin once any user exists, open pre-first-user — for
// the onboarding-restore procedures that must work on a fresh box but were
// previously callable by ANY authenticated user afterwards.
export const adminProcedureWhenNoUserExists = publicProcedureWhenNoUserExists.use(requireRoleIfUserExists('admin'))
