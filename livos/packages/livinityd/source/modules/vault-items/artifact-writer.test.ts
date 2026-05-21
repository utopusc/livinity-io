/**
 * Phase 188-02 — ArtifactWriter vitest spec (8 assertions D-02-1..D-02-8).
 *
 * Tests the post-create on-disk artifact scaffolding:
 *   D-02-1: Agent create → .agent/ directory exists
 *   D-02-2: Agent create → .agent/config.json = {setup_done:false, mcps:[], tools:[], schedule:null}
 *   D-02-3: Agent create → .agent/sessions/ directory exists
 *   D-02-4: Agent create → claude.md starts with "Agent: My Agent"
 *   D-02-5: Project create → .project/config.json exists with created_at ISO string
 *   D-02-6: Chat create → NO .agent/ directory, NO .project/ directory
 *   D-02-7: Agent create with icon:'Bot' → settings.json contains {"icon":"Bot"}
 *   D-02-8: Repeated writeArtifacts for same dir is idempotent (no EEXIST crash)
 *
 * Per-test isolated tmpdir under os.tmpdir(); cleanup in afterEach.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {promises as fs, existsSync} from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {randomUUID} from 'node:crypto'

import {writeArtifacts} from './artifact-writer.js'

describe('ArtifactWriter — Phase 188-02 on-disk artifacts', () => {
	let itemDir: string

	beforeEach(async () => {
		itemDir = path.join(os.tmpdir(), `livos-artifact-${randomUUID()}`)
		await fs.mkdir(itemDir, {recursive: true})
		// Pre-create settings.json (as ItemStore.create does)
		await fs.writeFile(path.join(itemDir, 'settings.json'), JSON.stringify({}), 'utf-8')
	})

	afterEach(async () => {
		await fs.rm(itemDir, {recursive: true, force: true}).catch(() => {})
	})

	it('D-02-1: agent create → .agent/ dir exists', async () => {
		await writeArtifacts({itemDir, type: 'agent', name: 'My Agent'})
		expect(existsSync(path.join(itemDir, '.agent'))).toBe(true)
	})

	it('D-02-2: agent create → .agent/config.json = {setup_done:false, mcps:[], tools:[], schedule:null}', async () => {
		await writeArtifacts({itemDir, type: 'agent', name: 'My Agent'})
		const raw = await fs.readFile(path.join(itemDir, '.agent', 'config.json'), 'utf-8')
		const config = JSON.parse(raw)
		expect(config).toEqual({setup_done: false, mcps: [], tools: [], schedule: null})
	})

	it('D-02-3: agent create → .agent/sessions/ directory exists', async () => {
		await writeArtifacts({itemDir, type: 'agent', name: 'My Agent'})
		expect(existsSync(path.join(itemDir, '.agent', 'sessions'))).toBe(true)
	})

	it('D-02-4: agent create → claude.md starts with "Agent: My Agent"', async () => {
		await writeArtifacts({itemDir, type: 'agent', name: 'My Agent'})
		const raw = await fs.readFile(path.join(itemDir, 'claude.md'), 'utf-8')
		expect(raw.startsWith('Agent: My Agent')).toBe(true)
	})

	it('D-02-5: project create → .project/config.json exists with created_at ISO string', async () => {
		const before = new Date().toISOString()
		await writeArtifacts({itemDir, type: 'project', name: 'My Proj'})
		expect(existsSync(path.join(itemDir, '.project', 'config.json'))).toBe(true)
		const raw = await fs.readFile(path.join(itemDir, '.project', 'config.json'), 'utf-8')
		const config = JSON.parse(raw)
		expect(typeof config.created_at).toBe('string')
		// Should be a valid ISO date string
		const ts = new Date(config.created_at).getTime()
		expect(ts).toBeGreaterThanOrEqual(new Date(before).getTime())
	})

	it('D-02-6: chat create → NO .agent/ directory, NO .project/ directory', async () => {
		await writeArtifacts({itemDir, type: 'chat', name: 'Chat 1'})
		expect(existsSync(path.join(itemDir, '.agent'))).toBe(false)
		expect(existsSync(path.join(itemDir, '.project'))).toBe(false)
	})

	it('D-02-7: agent create with icon:Bot → settings.json contains {"icon":"Bot"}', async () => {
		await writeArtifacts({itemDir, type: 'agent', name: 'My Agent', icon: 'Bot'})
		const raw = await fs.readFile(path.join(itemDir, 'settings.json'), 'utf-8')
		const settings = JSON.parse(raw)
		expect(settings.icon).toBe('Bot')
	})

	it('D-02-8: repeated writeArtifacts for same dir is idempotent (no EEXIST crash)', async () => {
		await writeArtifacts({itemDir, type: 'agent', name: 'X'})
		// Second call must not throw
		await expect(writeArtifacts({itemDir, type: 'agent', name: 'X'})).resolves.not.toThrow()
		// Content should still be correct
		const raw = await fs.readFile(path.join(itemDir, '.agent', 'config.json'), 'utf-8')
		const config = JSON.parse(raw)
		expect(config.setup_done).toBe(false)
	})
})
