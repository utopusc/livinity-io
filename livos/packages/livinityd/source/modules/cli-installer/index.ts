// Phase 239-01 Task 1 — cli-installer module barrel.
//
// Public surface used by `cli-installer-router.ts` (Task 2) and Phase 240.
// SUPPORTED_CLIS + SUPPORTED_CLIS_SET are exported here so downstream
// consumers can import the D-239-07 whitelist contract without pulling in
// the spawn implementation.

export * from './types.js'
export {
	SUPPORTED_CLIS,
	SUPPORTED_CLIS_SET,
	CLI_BIN_NAMES,
	CLI_VERSION_ARGS,
	resolveInstallScript,
} from './install-scripts.js'
export {
	INSTALL_TIMEOUT_MS,
	installCli,
	type InstallCliDeps,
	type InstallCliInput,
} from './installer.js'
export {detectCli, type DetectCliDeps, type DetectCliInput} from './detector.js'
// Phase 240-01 Task 1 — authCli + AuthResult + drift-lock constants.
export {
	AUTH_TIMEOUT_MS,
	CLI_AUTH_COMMANDS,
	authCli,
	type AuthCliDeps,
	type AuthCliInput,
	type AuthResult,
	type AuditLogRow,
	type AuditLogFn,
} from './auth.js'
