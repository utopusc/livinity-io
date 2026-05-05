// Phase 71 — Computer Use Tasks repository (CU-FOUND-06)
export * from './task-repository.js'

// Phase 71-04 — ComputerUseContainerManager lifecycle owner (CU-FOUND-06).
// Single entry point for Bytebot container ensure/stop + 30-min idle reaper.
export {
	ComputerUseContainerManager,
	IDLE_THRESHOLD_MS,
	TICK_INTERVAL_MS,
	SPAWN_BUDGET_MS,
} from './container-manager.js'
export type {
	ContainerStatus,
	EnsureContainerResult,
	DockerInspectFn,
} from './container-manager.js'

// Phase 71-05 — Desktop subdomain gateway (CU-FOUND-02 / CU-FOUND-04).
// Path filter + auth + active-task gate + reverse proxy for the
// `desktop.{user}.{mainDomain}` host. Wired into server/index.ts via
// `mountDesktopGateway` + `mountDesktopWsUpgrade`. Note: ContainerStatus
// is re-exported from container-manager (above) and matches structurally
// with the gateway's ContainerManagerLike interface.
export {
	isAllowedDesktopPath,
	pathRequiresActiveTask,
	extractWebsockifyToken,
	mountDesktopGateway,
	mountDesktopWsUpgrade,
} from './desktop-gateway.js'
export type {
	ContainerManagerLike,
	GatewayLogger,
	MountDesktopGatewayDeps,
} from './desktop-gateway.js'

// Phase 72-01 — Bytebot tool schemas (CU-LOOP-01). Verbatim Apache 2.0
// copy from upstream Bytebot agent.tools.ts. See bytebot-tools.ts header
// for source URL + snapshot date + license attribution.
export {
	BYTEBOT_TOOLS,
	BYTEBOT_TOOL_NAMES,
	isBytebotToolName,
} from './bytebot-tools.js'
export type {AnthropicTool, BytebotToolName} from './bytebot-tools.js'

// Phase 72-02 — Bytebot system prompt (CU-LOOP-03). Verbatim Apache 2.0
// copy from upstream Bytebot agent.constants.ts with 3 narrow D-12 edits
// (You are Liv / 1280x960 / NEEDS_HELP+COMPLETED retained). See
// bytebot-system-prompt.ts header for source URL + snapshot date + diff.
export {
	BYTEBOT_SYSTEM_PROMPT,
	injectComputerUseSystemPrompt,
} from './bytebot-system-prompt.js'
