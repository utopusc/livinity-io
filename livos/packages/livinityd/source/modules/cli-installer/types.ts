// Phase 239-01 Task 1 — shared types for the cli-installer module.
//
// All 20 CLI names (D-239-07 RCE boundary) live in install-scripts.ts so
// Phase 240 can import the const without dragging in the spawn impl.
// Phase 253-04 expanded from 5 → 20 (15 Local Agents CLIs across Waves A/B/C).

/**
 * The 20 supported CLIs (D-239-07; Phase 240 contract; Phase 253 expansion).
 * First 5 are the original Phase 239 set; the next 15 are the canonical-order
 * Local Agents additions (Wave A npm-global, Wave B curl-installer, Wave C
 * install-only/authHidden).
 */
export type CliName =
	| 'claude-code'
	| 'opencode'
	| 'gemini'
	| 'openclaw'
	| 'aion-cli'
	// Wave A (npm-global)
	| 'codex'
	| 'qwen-code'
	| 'augment'
	| 'github-copilot'
	| 'codebuddy'
	| 'qoder-cli'
	// Wave B (curl-installer)
	| 'goose'
	| 'factory-droid'
	| 'cursor-agent'
	// Wave C (install-only / authHidden)
	| 'kimi-cli'
	| 'mistral-vibe'
	| 'hermes-agent'
	| 'nanobot'
	| 'snow-cli'
	| 'kiro'

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
