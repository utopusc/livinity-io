/**
 * Barrel export for the devices module. Plan 12-02 callsites should import
 * authorize helpers from '../devices' (not '../devices/authorize'), so that
 * Phase 15 can swap audit-stub -> PostgreSQL without touching callers.
 *
 * Existing deep imports (DeviceBridge from ./device-bridge, router from
 * ./routes) remain valid — this barrel does not replace them, it adds a
 * second supported entry point for the new Phase 12 helpers.
 */

export {authorizeDeviceAccess} from './authorize.js'
export type {AuthResult, AuthFailReason} from './authorize.js'

export {
	recordAuthFailure,
	AUTH_FAILURES_REDIS_KEY,
	AUTH_FAILURES_MAX_ENTRIES,
} from './audit-stub.js'
export type {AuthFailureEntry} from './audit-stub.js'

export {DeviceBridge} from './device-bridge.js'
