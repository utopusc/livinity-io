// Phase 239-01 Task 1 — SUPPORTED_CLIS + script-path resolver + bin-name map.
//
// This file is the single source of truth that Phase 240 imports unchanged
// (D-239-10 stable contract). The whitelist is THE RCE boundary (D-239-07):
// `cliInstaller.install({name: 'foo'})` must be rejected before any
// subprocess fires, and the only valid path is one of the 20 names below.
// Phase 253-04 expanded the tuple 5 → 20 (15 Local Agents CLIs).

import path from 'node:path'

import type {CliName} from './types.js'

/**
 * D-239-07 RCE BOUNDARY — exactly 20 names in fixed order (Phase 253-04;
 * was 5 in Phase 239). Phase 240 depends on this contract (D-239-10).
 * Mutating the order or removing/renaming names without bumping the
 * drift-lock tests + Phase 240's import is a contract break. The canonical
 * order (original 5, then Wave A, B, C) is mirrored by installer.test.ts.
 */
export const SUPPORTED_CLIS: readonly CliName[] = [
	'claude-code',
	'opencode',
	'gemini',
	'openclaw',
	'aion-cli',
	// Wave A (npm-global)
	'codex',
	'qwen-code',
	'augment',
	'github-copilot',
	'codebuddy',
	'qoder-cli',
	// Wave B (curl-installer)
	'goose',
	'factory-droid',
	'cursor-agent',
	// Wave C (install-only / authHidden)
	'kimi-cli',
	'mistral-vibe',
	'hermes-agent',
	'nanobot',
	'snow-cli',
	'kiro',
] as const

/** Set form for O(1) lookups; constructed eagerly so the contract assertion
 * (`SUPPORTED_CLIS_SET.size === 20`) holds at module-load time. */
export const SUPPORTED_CLIS_SET = new Set<CliName>(SUPPORTED_CLIS)

/**
 * Resolve `scripts/install/cli/<name>.sh` relative to repo root.
 *
 * livinityd boots from `/opt/livos/packages/livinityd/dist` on the Mini PC;
 * the scripts ship at `/opt/livos/scripts/install/cli/`. Use `LIVOS_ROOT`
 * when set (livos.service exports it); fall back to `/opt/livos` so the
 * Mini PC's canonical deploy layout works without explicit env wiring.
 */
export function resolveInstallScript(name: CliName): string {
	const root = process.env.LIVOS_ROOT ?? '/opt/livos'
	return path.join(root, 'scripts', 'install', 'cli', `${name}.sh`)
}

/** Per-CLI binary name on PATH — used by detector for `command -v <bin>`.
 * Binaries verified in Phase 253 RESEARCH (Pitfall 2). NOTE cursor-agent's
 * binary is `cursor-agent` (NOT the collision-prone bare `agent`) — BLOCKER 1,
 * identical to Plan 02's install binary + auth + detector test. */
export const CLI_BIN_NAMES: Readonly<Record<CliName, string>> = {
	'claude-code': 'claude',
	opencode: 'opencode',
	gemini: 'gemini',
	openclaw: 'openclaw',
	'aion-cli': 'aion',
	// Wave A
	codex: 'codex',
	'qwen-code': 'qwen',
	augment: 'auggie',
	'github-copilot': 'copilot',
	codebuddy: 'codebuddy',
	'qoder-cli': 'qodercli',
	// Wave B
	goose: 'goose',
	'factory-droid': 'droid',
	'cursor-agent': 'cursor-agent',
	// Wave C
	'kimi-cli': 'kimi',
	'mistral-vibe': 'vibe',
	'hermes-agent': 'hermes',
	nanobot: 'nanobot',
	'snow-cli': 'snow',
	kiro: 'kiro',
}

/** Per-CLI version probe args — used by detector for `<bin> <args...>`. */
export const CLI_VERSION_ARGS: Readonly<Record<CliName, string[]>> = {
	'claude-code': ['--version'],
	opencode: ['--version'],
	gemini: ['--version'],
	openclaw: ['--version'],
	'aion-cli': ['--version'],
	// Wave A
	codex: ['--version'],
	'qwen-code': ['--version'],
	augment: ['--version'],
	'github-copilot': ['--version'],
	codebuddy: ['--version'],
	'qoder-cli': ['--version'],
	// Wave B
	goose: ['--version'],
	'factory-droid': ['--version'],
	'cursor-agent': ['--version'],
	// Wave C
	'kimi-cli': ['--version'],
	'mistral-vibe': ['--version'],
	'hermes-agent': ['--version'],
	nanobot: ['--version'],
	'snow-cli': ['--version'],
	kiro: ['--version'],
}
