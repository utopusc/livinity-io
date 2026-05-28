// Phase 239-01 Task 1 — SUPPORTED_CLIS + script-path resolver + bin-name map.
//
// This file is the single source of truth that Phase 240 imports unchanged
// (D-239-10 stable contract). The whitelist is THE RCE boundary (D-239-07):
// `cliInstaller.install({name: 'foo'})` must be rejected before any
// subprocess fires, and the only valid path is one of the 5 names below.

import path from 'node:path'

import type {CliName} from './types.js'

/**
 * D-239-07 RCE BOUNDARY — exactly 5 names in fixed order. Phase 240 depends
 * on this contract (D-239-10). Mutating the order or removing/renaming
 * names without bumping Phase 240's import is a contract break.
 */
export const SUPPORTED_CLIS: readonly CliName[] = [
	'claude-code',
	'opencode',
	'gemini',
	'openclaw',
	'aion-cli',
] as const

/** Set form for O(1) lookups; constructed eagerly so the contract assertion
 * (`SUPPORTED_CLIS_SET.size === 5`) holds at module-load time. */
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

/** Per-CLI binary name on PATH — used by detector for `command -v <bin>`. */
export const CLI_BIN_NAMES: Readonly<Record<CliName, string>> = {
	'claude-code': 'claude',
	opencode: 'opencode',
	gemini: 'gemini',
	openclaw: 'openclaw',
	'aion-cli': 'aion',
}

/** Per-CLI version probe args — used by detector for `<bin> <args...>`. */
export const CLI_VERSION_ARGS: Readonly<Record<CliName, string[]>> = {
	'claude-code': ['--version'],
	opencode: ['--version'],
	gemini: ['--version'],
	openclaw: ['--version'],
	'aion-cli': ['--version'],
}
