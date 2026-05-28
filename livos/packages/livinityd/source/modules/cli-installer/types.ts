// Phase 239-01 Task 1 — shared types for the cli-installer module.
//
// All 5 CLI names (D-239-07 RCE boundary) live in install-scripts.ts so
// Phase 240 can import the const without dragging in the spawn impl.

/** The 5 supported CLIs (D-239-07; Phase 240 contract). */
export type CliName = 'claude-code' | 'opencode' | 'gemini' | 'openclaw' | 'aion-cli'

/** Return shape of `installCli(...)`. */
export interface InstallResult {
	ok: boolean
	/** Combined stdout + stderr (capped at last 32KB; TIMEOUT-prefixed when applicable). */
	output: string
	/** Process exit code; -1 on timeout / spawn failure. */
	exitCode: number
	/** Wall-clock ms from spawn start to exit/timeout. */
	durationMs: number
}

/** Return shape of `detectCli(...)`. */
export interface DetectResult {
	detected: boolean
	version?: string
	path?: string
}

/**
 * Logger contract — structurally compatible with the livinityd boot logger
 * (mirror SeedLogger from mcp-registrar/types.ts).
 */
export interface InstallerLogger {
	info: (msg: string) => void
	warn: (msg: string, err?: unknown) => void
	error: (msg: string, err?: unknown) => void
}
