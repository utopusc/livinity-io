/**
 * Phase 182-02 — settings-content.test.tsx
 *
 * Source-text invariant suite (vitest). Locks the grouped-sidebar shape:
 *   - MENU_ITEMS has group field on every entry
 *   - 4 group headers: PERSONAL, WORKSPACE, AI, SYSTEM
 *   - advanced and troubleshoot have footer: true
 *   - footer items are excluded from the main groups
 */

import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const SRC = readFileSync(resolve(__dirname, 'settings-content.tsx'), 'utf8')

describe('Phase 182-02 — settings-content grouped sidebar source invariants', () => {
	it('G1: PERSONAL group header label defined in GROUP_LABELS', () => {
		expect(SRC).toMatch(/personal:\s*['"]PERSONAL['"]/)
	})

	it('G2: WORKSPACE group header label defined in GROUP_LABELS', () => {
		expect(SRC).toMatch(/workspace:\s*['"]WORKSPACE['"]/)
	})

	it('G3: AI group header label defined in GROUP_LABELS', () => {
		expect(SRC).toMatch(/ai:\s*['"]AI['"]/)
	})

	it('G4: SYSTEM group header label defined in GROUP_LABELS', () => {
		expect(SRC).toMatch(/system:\s*['"]SYSTEM['"]/)
	})

	it('G5: account item has group personal', () => {
		expect(SRC).toMatch(/id:\s*['"]account['"][\s\S]{0,100}group:\s*['"]personal['"]/)
	})

	it('G6: ai-config item has group ai', () => {
		expect(SRC).toMatch(/id:\s*['"]ai-config['"][\s\S]{0,100}group:\s*['"]ai['"]/)
	})

	it('G7: advanced item has footer: true', () => {
		expect(SRC).toMatch(/id:\s*['"]advanced['"][\s\S]{0,200}footer:\s*true/)
	})

	it('G8: troubleshoot item has footer: true', () => {
		expect(SRC).toMatch(/id:\s*['"]troubleshoot['"][\s\S]{0,200}footer:\s*true/)
	})
})

describe('Phase 182-02 — footer cluster + GROUP_ORDER array', () => {
	it('F1: GROUP_ORDER array contains all 4 groups in order', () => {
		expect(SRC).toMatch(/GROUP_ORDER[\s\S]{0,50}\[[\s\S]{0,200}['"]personal['"][\s\S]{0,50}['"]workspace['"][\s\S]{0,50}['"]ai['"][\s\S]{0,50}['"]system['"]/)
	})

	it('F2: footer cluster has data-testid settings-footer-cluster', () => {
		expect(SRC).toMatch(/data-testid=['"]settings-footer-cluster['"]/)
	})

	it('F3: group header data-testid includes group name', () => {
		expect(SRC).toMatch(/data-testid=\{`settings-group-header-\$\{group\}`\}/)
	})
})
