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
export {
	chromeMasterRouter,
	createChromeMasterRouter,
	MASTER_BACKUP_DIR,
} from './master-login-routes.js'
export type {
	MasterLoginInjectables,
	ChromeMasterRouter,
} from './master-login-routes.js'
