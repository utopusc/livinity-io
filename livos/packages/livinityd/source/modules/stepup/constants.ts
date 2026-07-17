/**
 * Phase 334 (STEPUP-01, D-334-1) — shared step-up grant constants.
 *
 * Dependency-free LEAF module on purpose: the mint side (stepup/routes.ts,
 * which imports server/trpc/trpc.js) and the verify side
 * (server/trpc/step-up-guard.ts, which trpc.ts itself consumes) both need the
 * cookie name — a shared leaf is the only placement that cannot create an
 * import cycle.
 */

/** httpOnly cookie carrying the 5-min step-up grant JWT (D-334-1). */
export const STEPUP_COOKIE_NAME = 'LIVINITY_STEPUP'

/** Cookie maxAge — MUST mirror STEPUP_GRANT_TTL_SECONDS in modules/jwt.ts. */
export const STEPUP_GRANT_MAX_AGE_MS = 5 * 60 * 1000
