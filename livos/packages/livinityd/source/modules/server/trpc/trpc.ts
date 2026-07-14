import {ZodError} from 'zod'
import {initTRPC} from '@trpc/server'

import {type Context} from './context.js'
import {isAuthenticated, isAuthenticatedIfUserExists, requireRole, requireRoleIfUserExists} from './is-authenticated.js'
import {websocketLogger} from './websocket-logger.js'
import {auditAdminAction} from '../../security-audit/audit-middleware.js'

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
// Backups-v2 P0 (D10): admin once any user exists, open pre-first-user — for
// the onboarding-restore procedures that must work on a fresh box but were
// previously callable by ANY authenticated user afterwards.
export const adminProcedureWhenNoUserExists = publicProcedureWhenNoUserExists.use(requireRoleIfUserExists('admin'))
