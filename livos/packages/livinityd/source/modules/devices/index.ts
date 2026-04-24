/**
 * Devices module barrel.
 *
 * Phase 12 (AUTHZ-01/02): authorizeDeviceAccess + recordAuthFailure helpers.
 * Phase 15 (AUDIT-01/02): recordDeviceEvent is the primary PG-backed audit
 *   sink. Callers should import recordDeviceEvent for new audit callsites;
 *   recordAuthFailure remains exported as a legacy/fallback path (audit-pg.ts
 *   uses it internally when PG is unavailable — see audit-pg.ts line ~85).
 *
 * Plan 15-02 will migrate the three Phase 12 callsites (DeviceBridge.executeOnDevice,
 * routes.ts#ensureOwnership, /internal/device-tool-execute) from recordAuthFailure
 * to recordDeviceEvent. Do not remove recordAuthFailure from this barrel until
 * Phase 15 is fully shipped.
 */

export {authorizeDeviceAccess} from './authorize.js'
export type {AuthResult, AuthFailReason} from './authorize.js'

// Phase 15 primary audit export
export {recordDeviceEvent, computeParamsDigest} from './audit-pg.js'
export type {DeviceAuditEvent} from './audit-pg.js'

// Phase 12 legacy/fallback export — still used internally by audit-pg.ts on PG outage
export {recordAuthFailure, AUTH_FAILURES_REDIS_KEY, AUTH_FAILURES_MAX_ENTRIES} from './audit-stub.js'
export type {AuthFailureEntry} from './audit-stub.js'

export {DeviceBridge} from './device-bridge.js'
