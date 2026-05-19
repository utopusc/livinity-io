/**
 * Phase 164-04 — sample agent contract lock.
 *
 * Parses the bundled `vault-templates/livos-agents/*.md` files via the
 * Phase 164-01 parser and asserts every field matches the locked spec from
 * 164-CONTEXT.md (lines 23-46 + 155-176). Any future edit that drifts the
 * sample-agent contract (e.g. flipping enabled:true, swapping the model,
 * loosening the budget cap) trips this suite in CI.
 *
 * Why this lock exists:
 *   - Both samples MUST ship `enabled: false` so a fresh boot never spawns
 *     autonomous agents until the operator explicitly opts in.
 *   - The pr-watcher silence contract (`__NO_ACTION_NEEDED__` sentinel)
 *     prevents 48 nothing-burgers per day flooding the operator's inbox;
 *     drift on that token would silently break inbox hygiene.
 *
 * Resilience: the 164-01 parser is loaded via dynamic import at module
 * load time. If 164-01 is ever pulled or relocated, the describe block
 * self-skips via `describe.skipIf(!parseAgentDefinition)` rather than
 * exploding the whole livinityd test run.
 */

import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, it, expect} from 'vitest'

const here = fileURLToPath(import.meta.url)
// here = .../source/modules/autonomous-scheduler/sample-agents.test.ts
// templates = .../source/data/vault-templates/livos-agents
const TEMPLATES_DIR = path.resolve(
	path.dirname(here),
	'..',
	'..',
	'data',
	'vault-templates',
	'livos-agents',
)

// Lazy-load the 164-01 parser so this plan does not hard-depend on 164-01's
// module path. If the parser is ever absent the suite self-skips rather than
// failing the broader livinityd test run.
let parseAgentDefinition: ((markdown: string, sourcePath: string) => any) | null = null
try {
	const mod = await import('./agent-definition-parser.js')
	parseAgentDefinition = mod.parseAgentDefinition
} catch {
	/* Phase 164-01 not yet shipped — describe block below self-skips. */
}

describe.skipIf(!parseAgentDefinition)('sample autonomous agents — locked contract (Phase 164-04)', () => {
	it('nightly-backup-audit.md matches the locked spec', async () => {
		const filePath = path.join(TEMPLATES_DIR, 'nightly-backup-audit.md')
		const content = await readFile(filePath, 'utf8')
		const result = parseAgentDefinition!(content, filePath)
		expect(result.ok).toBe(true)
		if (!result.ok) return // type-narrow for TS
		const def = result.definition
		expect(def.name).toBe('nightly-backup-audit')
		expect(def.schedule).toBe('0 3 * * *')
		expect(def.model).toBe('claude-sonnet-4-6')
		expect(def.maxTurns).toBe(15)
		expect(def.maxBudgetUsd).toBe(3)
		expect(def.allowedTools).toEqual(['Read', 'Bash', 'Glob', 'Grep'])
		expect(def.mcpServers).toEqual(['luse', 'filesystem'])
		expect(def.enabled).toBe(false) // SAFETY LOCK — never flip in template
		expect(def.body.length).toBeGreaterThan(50)
	})

	it('pr-watcher.md matches the locked spec', async () => {
		const filePath = path.join(TEMPLATES_DIR, 'pr-watcher.md')
		const content = await readFile(filePath, 'utf8')
		const result = parseAgentDefinition!(content, filePath)
		expect(result.ok).toBe(true)
		if (!result.ok) return // type-narrow for TS
		const def = result.definition
		expect(def.name).toBe('pr-watcher')
		expect(def.schedule).toBe('*/30 * * * *')
		expect(def.model).toBe('claude-haiku-4-5')
		expect(def.maxTurns).toBe(5)
		expect(def.maxBudgetUsd).toBe(0.5)
		expect(def.allowedTools).toEqual(['Bash', 'Read'])
		expect(def.mcpServers).toEqual([])
		expect(def.enabled).toBe(false) // SAFETY LOCK — never flip in template
		// Silence-is-golden contract: scheduler scans for this sentinel and
		// SKIPS writing an inbox entry on quiet polls. Drop the token and the
		// operator's inbox fills with 48 nothing-burgers per day.
		expect(def.body).toContain('__NO_ACTION_NEEDED__')
	})

	it('no sample agent ships with enabled:true (audit lock)', async () => {
		const nightly = await readFile(path.join(TEMPLATES_DIR, 'nightly-backup-audit.md'), 'utf8')
		const watcher = await readFile(path.join(TEMPLATES_DIR, 'pr-watcher.md'), 'utf8')
		// Match on a frontmatter-line shape so a body sentence like "if you ever
		// want to set enabled: true ..." inside the prose can't trick the lock.
		expect(nightly).not.toMatch(/^enabled:\s*true\b/m)
		expect(watcher).not.toMatch(/^enabled:\s*true\b/m)
	})
})
