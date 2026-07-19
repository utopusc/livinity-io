// Phase 346-02 (MCP-01, D-346-3 / D-346-4 / D-346-8) — the FROZEN procedure
// allowlist: the single chokepoint between an MCP control agent and tRPC.
//
// ─────────────────────────────────────────────────────────────────────────────
// ZERO imports from the broker/subscription path (D-346-2). This module lives in
// the mcp-control/ tree fenced by __tests__/broker-zero-import.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
//
// D-346-4 — the liv_mcp_* key translates to a ctx that is admin-equivalent ONLY
// for a curated safe set of procedures. `assertAllowlistedProcedure(path)` is
// the "refused at the MCP layer BEFORE it reaches tRPC" mechanism: every /trpc
// call the MCP tool handlers make in Plan 03 routes through it, so an
// agent-supplied string can NEVER become an arbitrary procedure name (there is
// no proxy/passthrough tool).
//
// D-346-3 — the safe surface is EXACTLY 10 tools / 10 procedures:
//   INSPECT (read, 6): apps_list, app_state, system_cpu, system_memory,
//                      system_disk, scheduler_list
//   ACT (safe lifecycle, 3): app_start, app_stop, app_restart
//   app_logs (1, flagged: logs may carry secrets — same exposure as the human
//             admin UI's apps.logs behind assertAppLifecycleAccess).
// Note system_cpu / system_memory / system_disk are THREE distinct tools, not
// one (plan-check BLOCKER 2).
//
// ⚠ SECURITY: adding a procedure to this allowlist is a DELIBERATE security
// decision. The destructive/step-up tier (apps.uninstall global-branch,
// user.deleteUser, system.luksFormat, appMigration.importBundle) is INTENTIONALLY
// excluded (D-346-8) — AND additionally fails closed because the loopback MCP
// ctx carries no step-up cookie and cannot mint a step-up grant (334 WARN-2).
// Do NOT add an exemption path.

/**
 * The 10 tRPC procedure paths an MCP control key may reach. Frozen readonly
 * tuple — Object.isFrozen(MCP_ALLOWLISTED_PROCEDURES) is asserted by the test so
 * the surface cannot be mutated (pushed/extended) at runtime.
 */
export const MCP_ALLOWLISTED_PROCEDURES = Object.freeze([
	// INSPECT (read)
	'apps.list',
	'apps.state',
	'system.cpuUsage',
	'system.memoryUsage',
	'system.diskUsage',
	'scheduler.listJobs',
	// ACT (safe lifecycle)
	'apps.start',
	'apps.stop',
	'apps.restart',
	// flagged read (logs may carry secrets — same guard as the human admin UI)
	'apps.logs',
] as const)

export type McpAllowlistedProcedure = (typeof MCP_ALLOWLISTED_PROCEDURES)[number]

/**
 * Set view of the frozen tuple for O(1) membership checks in the hot path.
 * Built from the frozen source so the two can never drift.
 */
export const MCP_PROCEDURE_ALLOWLIST: ReadonlySet<string> = new Set(
	MCP_ALLOWLISTED_PROCEDURES,
)

/**
 * Stable MCP tool name → tRPC procedure path. Each of the 10 tools maps 1:1 to a
 * procedure that MUST itself be a member of MCP_PROCEDURE_ALLOWLIST (asserted by
 * the consistency test). Frozen so the mapping cannot be mutated at runtime.
 */
export const TOOL_PROCEDURE_MAP = Object.freeze({
	apps_list: 'apps.list',
	app_state: 'apps.state',
	app_start: 'apps.start',
	app_stop: 'apps.stop',
	app_restart: 'apps.restart',
	app_logs: 'apps.logs',
	system_cpu: 'system.cpuUsage',
	system_memory: 'system.memoryUsage',
	system_disk: 'system.diskUsage',
	scheduler_list: 'scheduler.listJobs',
} as const)

export type McpToolName = keyof typeof TOOL_PROCEDURE_MAP

/** Prefix of the Error thrown when a non-allowlisted procedure is requested. */
export const MCP_PROCEDURE_NOT_ALLOWLISTED = 'MCP_PROCEDURE_NOT_ALLOWLISTED'

/**
 * Fail-closed guard (D-346-4). Throws if `path` is not on the frozen allowlist.
 * This is the ONLY sanctioned way an MCP tool handler resolves a procedure path
 * before making its loopback /trpc call (Plan 03) — never an agent-supplied
 * string reaching tRPC unchecked.
 */
export function assertAllowlistedProcedure(path: string): void {
	if (!MCP_PROCEDURE_ALLOWLIST.has(path)) {
		throw new Error(`${MCP_PROCEDURE_NOT_ALLOWLISTED}: ${path}`)
	}
}
