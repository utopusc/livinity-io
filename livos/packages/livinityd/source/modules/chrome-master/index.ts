/**
 * Phase 102-03-03 — chrome-master module barrel.
 *
 * Re-exports the MasterProfileSeeder surface (D-102-MASTER-PROFILE-SEED) so
 * callers can `import {createProfileSeeder} from './modules/chrome-master/index.js'`
 * without coupling to the internal filename layout.
 */
export {
	createProfileSeeder,
	MasterProfileMissingError,
	ProfileSeederInputError,
	MASTER_PROFILE_DIR,
	APP_PROFILE_PREFIX,
} from './profile-seeder.js'
export type {
	ProfileSeederOpts,
	ProfileSeederHandle,
	SeedOpts,
	ProfileSeederLogger,
	ExecFileFn,
	AccessFn,
	MkdirFn,
} from './profile-seeder.js'

// Phase 102-07 - Chrome Master Login tRPC routes (D-102-MASTER-LOGIN-UI).
// chromeMasterRouter is the production-default router (real fs +
// child_process); createChromeMasterRouter is the factory tests use to
// inject mocks. MASTER_BACKUP_DIR sits next to MASTER_PROFILE_DIR for the
// T-102-07c reset-with-backup flow.
//
// MASTER_PROFILE_DIR is already re-exported above from profile-seeder.js
// (same `/opt/livos/data/chrome-master` constant); a duplicate re-export from
// master-login-routes.ts would collide on the barrel binding.
//
// Phase 103-01 — also re-export _resetMasterStateForTest for test-suite
// singleton-lock isolation (the cross-file test in master-login-routes.test.ts
// imports it directly from master-login-routes.js but barrel exposure makes
// it reachable from external integration tests).
export {
	chromeMasterRouter,
	createChromeMasterRouter,
	MASTER_BACKUP_DIR,
	_resetMasterStateForTest,
} from './master-login-routes.js'
export type {
	MasterLoginInjectables,
	ChromeMasterRouter,
} from './master-login-routes.js'
