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
