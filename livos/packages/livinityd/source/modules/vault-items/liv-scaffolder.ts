// Phase 176-01 — Liv root-agent system prompt scaffolder.
//
// Drops ~/liv/settings/liv-rootagent.md into the user's vault on first boot.
// Never overwrites an existing file — uses fs.copyFile with COPYFILE_EXCL so
// user edits survive across restarts (mirrors Phase 162-01 vault-scaffolder.ts
// idempotency contract; that file is sacred and NOT imported here).
//
// Security:
// - Source path is a static import.meta.url constant — no user input involved
//   (T-176-01-02 accept disposition).
// - COPYFILE_EXCL prevents overwrite of user-edited dest file (T-176-01-01).
// - Non-fatal: any error returns a discriminator, never throws (T-176-01-03).
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
// + Phase 162-01 vault-scaffolder.ts — UNCHANGED.
// This file is NEW (additive only).

import {promises as fs, constants as fsConstants} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

// ── Internal helpers ──────────────────────────────────────────────────────────

type Logger = {
	log(m: string): void
	error(m: string, e?: unknown): void
}

const NOOP_LOGGER: Logger = {
	log: () => {},
	error: () => {},
}

// ── Phase 176-01: ensureLivRootAgent ──────────────────────────────────────────

export type LivRootAgentResult =
	| {status: 'created'}
	| {status: 'exists'}
	| {status: 'failed-non-fatal'; reason: string}

/**
 * Idempotent scaffolder for Liv's system prompt.
 *
 * Copies the bundled template to `<vaultRoot>/settings/liv-rootagent.md`
 * using COPYFILE_EXCL — if the file already exists the copy is skipped and
 * status:'exists' is returned. Non-fatal: errors return a discriminator
 * instead of throwing so livinityd boot continues normally.
 */
export async function ensureLivRootAgent(opts: {
	vaultRoot: string
	logger?: Logger
}): Promise<LivRootAgentResult> {
	const log = opts.logger ?? NOOP_LOGGER

	// Resolve the bundled template path relative to this file's location.
	// The compiled JS lives at source/modules/vault-items/liv-scaffolder.js,
	// so ../../data/vault-templates/settings/liv-rootagent.md resolves correctly
	// both in the source tree and after tsx transformation.
	const here = fileURLToPath(import.meta.url)
	const templateSrc = path.resolve(
		path.dirname(here),
		'..',
		'..',
		'data',
		'vault-templates',
		'settings',
		'liv-rootagent.md',
	)

	const settingsDir = path.resolve(opts.vaultRoot, 'settings')
	const dest = path.join(settingsDir, 'liv-rootagent.md')

	try {
		// Ensure the settings/ sub-directory exists (the vault itself is
		// assumed to exist — Phase 162-01 runs first).
		await fs.mkdir(settingsDir, {recursive: true})
	} catch (e: unknown) {
		const reason = e instanceof Error ? e.message : String(e)
		log.error(`[liv-scaffolder] mkdir failed for ${settingsDir}`, e)
		return {status: 'failed-non-fatal', reason}
	}

	try {
		await fs.copyFile(templateSrc, dest, fsConstants.COPYFILE_EXCL)
		log.log(`[liv-scaffolder] created ${dest}`)
		return {status: 'created'}
	} catch (e: unknown) {
		const code = (e as NodeJS.ErrnoException).code
		if (code === 'EEXIST') {
			// Dest already exists — user edits preserved.
			return {status: 'exists'}
		}
		const reason = e instanceof Error ? e.message : String(e)
		log.error(`[liv-scaffolder] failed to copy template to ${dest}`, e)
		return {status: 'failed-non-fatal', reason}
	}
}

// ── Phase 176-03: ensureLivSkills ────────────────────────────────────────────
// (Added below by plan 176-03 task 2 — see that plan for the full docblock.)

const SKILL_FILES = [
	'luse-driver.md',
	'livos-operator.md',
	'appstore.md',
	'window-manager.md',
] as const

export type LivSkillsResult =
	| {status: 'created'; created: string[]; skipped: string[]}
	| {status: 'exists'; created: string[]; skipped: string[]}
	| {status: 'partial'; created: string[]; skipped: string[]}
	| {status: 'failed-non-fatal'; reason: string; created?: string[]; skipped?: string[]}

/**
 * Phase 176-03 — Ensure 4 LivOS-native subagent files exist at
 * <vaultRoot>/.claude/agents/. Uses COPYFILE_EXCL for idempotency — existing
 * user-edited files are preserved. Non-fatal: errors return status discriminator.
 */
export async function ensureLivSkills(opts: {
	vaultRoot: string
	logger?: Logger
}): Promise<LivSkillsResult> {
	const log = opts.logger ?? NOOP_LOGGER
	const here = fileURLToPath(import.meta.url)
	const templatesDir = path.resolve(
		path.dirname(here),
		'..',
		'..',
		'data',
		'vault-templates',
		'skills',
	)
	const agentsDir = path.resolve(opts.vaultRoot, '.claude', 'agents')

	try {
		await fs.mkdir(agentsDir, {recursive: true})
	} catch (e: unknown) {
		const reason = e instanceof Error ? e.message : String(e)
		log.error(`[liv-scaffolder] mkdir failed for ${agentsDir}`, e)
		return {status: 'failed-non-fatal', reason}
	}

	const created: string[] = []
	const skipped: string[] = []

	for (const filename of SKILL_FILES) {
		const src = path.join(templatesDir, filename)
		const dest = path.join(agentsDir, filename)
		try {
			await fs.copyFile(src, dest, fsConstants.COPYFILE_EXCL)
			created.push(filename)
			log.log(`[liv-scaffolder] created skill ${filename}`)
		} catch (e: unknown) {
			if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
				skipped.push(filename)
			} else {
				log.error(`[liv-scaffolder] failed to copy ${filename}`, e)
				// partial — continue with remaining files
			}
		}
	}

	const status =
		created.length === 0
			? ('exists' as const)
			: skipped.length === 0
				? ('created' as const)
				: ('partial' as const)

	return {status, created, skipped}
}
