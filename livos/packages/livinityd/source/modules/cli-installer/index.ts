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
// Phase 267-01 Task 1 — per-CLI auth-method classification matrix (the UI
// branch contract) + the device-code transcript parser.
export {
	CLI_AUTH_METHODS,
	DEVICE_CODE_RE,
	type AuthBranch,
	type AuthMethod,
} from './auth-methods.js'
// Phase 267-01 Task 2 — no-spawn per-CLI API-key writer (0600, whitelist-guarded).
export {
	writeApiKey,
	type WriteApiKeyInput,
	type WriteApiKeyDeps,
	type WriteApiKeyResult,
} from './api-key-writer.js'
// Phase 267-03 Task 1 — debounced, best-effort liv-assistant restart so AionUi
// re-PATH-scans and a freshly-authed CLI flips Failed→ready (no terminal).
export {
	scheduleAgentRefresh,
	agentRefreshStatusKey,
	DEFAULT_AGENT_REFRESH_DEBOUNCE_MS,
	type ScheduleAgentRefreshDeps,
	type AgentRefreshExecFn,
} from './agent-refresh.js'
