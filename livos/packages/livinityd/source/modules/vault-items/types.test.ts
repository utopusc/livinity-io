/**
 * Phase 171-01 — vault-items/types.ts source-text + type-narrowing invariants.
 *
 * Mirrors cc-pty/types.test.ts: reads sibling types.ts from disk for
 * source-text assertions (1-6) and uses vitest expectTypeOf for the
 * compile-time narrowing assertions (7-8). 8 assertions total per the
 * plan's <behavior> block.
 */

import {describe, it, expect, expectTypeOf} from 'vitest'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

import type {Item, ProjectItem, AgentItem} from './types.js'

const here = fileURLToPath(import.meta.url)
const TYPES_PATH = path.resolve(path.dirname(here), 'types.ts')
const src = readFileSync(TYPES_PATH, 'utf-8')

// Local factories — declared in test scope only (production code lives in
// item-store / Plan 171-02). These exist for the narrowing checks below
// and intentionally lie about runtime ids (test never touches the FS).
function makeProject(name: string, cwd?: string): ProjectItem {
	return {
		id: 'test-id',
		parentId: null,
		name,
		pinned: false,
		createdAt: 0,
		updatedAt: 0,
		archivedAt: null,
		schemaVersion: 1,
		type: 'project',
		...(cwd === undefined ? {} : {cwd}),
	}
}

function makeAgent(name: string, schedule?: string): AgentItem {
	return {
		id: 'test-id',
		parentId: null,
		name,
		pinned: false,
		createdAt: 0,
		updatedAt: 0,
		archivedAt: null,
		schemaVersion: 1,
		type: 'agent',
		...(schedule === undefined ? {} : {schedule}),
	}
}

describe('vault-items/types.ts — Phase 171-01 surface', () => {
	// ── 1-4: every interface declared exactly once ──────────────────────
	it('declares BaseItem interface', () => {
		expect(src).toMatch(/export interface BaseItem\b/)
	})

	it('declares ProjectItem extends BaseItem', () => {
		expect(src).toMatch(/export interface ProjectItem extends BaseItem\b/)
	})

	it('declares AgentItem extends BaseItem', () => {
		expect(src).toMatch(/export interface AgentItem extends BaseItem\b/)
	})

	it('declares ChatItem extends BaseItem', () => {
		expect(src).toMatch(/export interface ChatItem extends BaseItem\b/)
	})

	// ── 5: Item discriminated union ────────────────────────────────────
	it('exports Item discriminated union of all three variants', () => {
		expect(src).toMatch(/export type Item\s*=\s*ProjectItem\s*\|\s*AgentItem\s*\|\s*ChatItem/)
	})

	// ── 6: schemaVersion is literal-1, not number ──────────────────────
	it('declares schemaVersion as the literal 1 (not number)', () => {
		expect(src).toMatch(/schemaVersion:\s*1\b/)
		expect(src).not.toMatch(/schemaVersion:\s*number/)
	})

	// ── 7: ProjectItem narrowing — `cwd` accessible after type guard ──
	it('narrows to ProjectItem when type === "project" (compile-time)', () => {
		const item: Item = makeProject('demo', '/tmp/repo')
		if (item.type === 'project') {
			expectTypeOf(item).toMatchTypeOf<ProjectItem>()
			expectTypeOf(item.cwd).toEqualTypeOf<string | undefined>()
			expect(item.cwd).toBe('/tmp/repo')
		} else {
			expect.fail('expected project narrowing branch')
		}
	})

	// ── 8: AgentItem narrowing — `schedule` accessible after type guard ─
	it('narrows to AgentItem when type === "agent" (compile-time)', () => {
		const item: Item = makeAgent('nightly', '0 3 * * *')
		if (item.type === 'agent') {
			expectTypeOf(item).toMatchTypeOf<AgentItem>()
			expectTypeOf(item.schedule).toEqualTypeOf<string | undefined>()
			expect(item.schedule).toBe('0 3 * * *')
		} else {
			expect.fail('expected agent narrowing branch')
		}
	})
})
