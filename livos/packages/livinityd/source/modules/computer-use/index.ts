// Phase 71 — Computer Use Tasks repository (CU-FOUND-06)
export * from './task-repository.js'

// Phase 71-04 — ComputerUseContainerManager lifecycle owner (CU-FOUND-06).
// Single entry point for the upstream bytebot container ensure/stop + 30-min idle reaper.
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

// Phase 71-05 — computerUse tRPC router (D-19, CU-FOUND-04).
// Mounted under `appRouter.computerUse` in server/trpc/index.ts; the 3
// procedures (getStatus / startStandaloneSession / stopSession) are also
// listed in httpOnlyPaths so the React client routes through HTTP.
export {computerUseRouter} from './routes.js'
export type {ComputerUseRouter} from './routes.js'

// Phase 72-01 — Luse tool schemas (CU-LOOP-01) — renamed P100-10-02 from
// Bytebot per D-100-10-B. Verbatim Apache 2.0 copy from upstream bytebot
// project's agent.tools.ts. See luse-tools.ts header for source URL +
// snapshot date + license attribution.
export {
	LUSE_TOOLS,
	LUSE_TOOL_NAMES,
	isLuseToolName,
} from './luse-tools.js'
export type {AnthropicTool, LuseToolName} from './luse-tools.js'

// Phase 72-02 — Luse system prompt (CU-LOOP-03) — renamed P100-10-02 from
// Bytebot per D-100-10-B. Verbatim Apache 2.0 copy from upstream bytebot
// project's agent.constants.ts with 3 narrow D-12 edits (You are Liv /
// 1280x960 / NEEDS_HELP+COMPLETED retained). See luse-system-prompt.ts
// header for source URL + snapshot date + diff.
export {
	LUSE_SYSTEM_PROMPT,
	injectComputerUseSystemPrompt,
} from './luse-system-prompt.js'

// Phase 72-native (Wave 1) — native X11 primitives barrel. Re-exports
// captureScreenshot + 11 input primitives + window/file fns from
// `./native/index.js` so consumers (computer-use Wave-2 MCP server,
// future plans) can import from this top-level barrel.
//
// `mcp/server.ts` is NOT re-exported here — it is an entry-point script
// (spawned via `tsx mcp/server.ts`), not a library.
export * from './native/index.js'

// Phase 72-native-06 — Boot-time Luse computer-use MCP server registration
// (renamed P100-10-02 from bytebot per D-100-10-B). Called from livinityd
// lifecycle when LUSE_MCP_ENABLED=true; writes the stdio server config to
// liv:mcp:config so the running liv-core daemon's McpClientManager spawns
// it and discovers `mcp_luse_*` tools (D-NATIVE-10).
export {registerLuseMcpServer, DEFAULT_LUSE_MCP_SERVER_PATH} from './luse-mcp-config.js'
export type {
	McpConfigManagerLike,
	McpServerConfigInput,
	McpServerConfigStored,
	LuseMcpConfigLogger,
} from './luse-mcp-config.js'
