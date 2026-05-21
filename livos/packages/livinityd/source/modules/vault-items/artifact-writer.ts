// Phase 188-02 — ArtifactWriter: post-create on-disk scaffolding for Agent and Project types.
//
// Called by vault-items-router.ts after ItemStore.create() to write type-specific
// additional artifacts WITHOUT modifying the sacred item-store.ts.
//
// For Agent type:
//   <itemDir>/.agent/config.json   = {setup_done:false, mcps:[], tools:[], schedule:null}
//   <itemDir>/.agent/sessions/     = empty directory
//   <itemDir>/claude.md            = "Agent: <name>\n" (agent-specific context)
//
// For Project type:
//   <itemDir>/.project/config.json = {created_at: <iso8601>}
//
// For Chat type: no-op (no additional artifacts).
//
// Icon (if provided) is written to settings.json — overwriting the {} stub
// that ItemStore.create() leaves behind.
//
// All writes use atomic .tmp + rename pattern for crash safety.
// All mkdir calls use {recursive:true} for idempotency.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f preserved — this file
// does NOT modify item-store.ts.

import {promises as fs} from 'node:fs'
import * as path from 'node:path'

export interface WriteArtifactsInput {
	/** Absolute path to the item's directory (e.g. <vaultRoot>/items/<id>) */
	itemDir: string
	/** Item type discriminator */
	type: 'project' | 'agent' | 'chat'
	/** Item name (used in claude.md header) */
	name: string
	/** Optional lucide icon name; if provided, written to settings.json */
	icon?: string
}

/**
 * Atomic JSON write — writes to .tmp then renames. POSIX-atomic on same FS.
 */
async function atomicWriteJson(file: string, value: unknown): Promise<void> {
	await fs.mkdir(path.dirname(file), {recursive: true})
	const tmp = file + '.tmp'
	await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf-8')
	await fs.rename(tmp, file)
}

/**
 * Atomic text write — writes to .tmp then renames.
 */
async function atomicWriteText(file: string, body: string): Promise<void> {
	await fs.mkdir(path.dirname(file), {recursive: true})
	const tmp = file + '.tmp'
	await fs.writeFile(tmp, body, 'utf-8')
	await fs.rename(tmp, file)
}

/**
 * Write post-create on-disk artifacts for an Item.
 * Called after ItemStore.create() completes successfully.
 * Idempotent: safe to call multiple times for the same itemDir.
 */
export async function writeArtifacts(input: WriteArtifactsInput): Promise<void> {
	const {itemDir, type, name, icon} = input

	// Write icon to settings.json if provided.
	if (icon !== undefined) {
		await atomicWriteJson(path.join(itemDir, 'settings.json'), {icon})
	}

	switch (type) {
		case 'agent': {
			// .agent/ directory + config.json + sessions/
			const agentDir = path.join(itemDir, '.agent')
			await fs.mkdir(agentDir, {recursive: true})
			await fs.mkdir(path.join(agentDir, 'sessions'), {recursive: true})
			await atomicWriteJson(path.join(agentDir, 'config.json'), {
				setup_done: false,
				mcps: [],
				tools: [],
				schedule: null,
			})
			// claude.md: agent-specific context file (lowercase, distinct from CLAUDE.md stub)
			await atomicWriteText(path.join(itemDir, 'claude.md'), `Agent: ${name}\n`)
			break
		}
		case 'project': {
			// .project/ directory + config.json
			const projectDir = path.join(itemDir, '.project')
			await fs.mkdir(projectDir, {recursive: true})
			await atomicWriteJson(path.join(projectDir, 'config.json'), {
				created_at: new Date().toISOString(),
			})
			break
		}
		case 'chat': {
			// No additional artifacts for chat type.
			break
		}
	}
}
