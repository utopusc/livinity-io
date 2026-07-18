/**
 * Phase 339 STORD-01 — assertWithinFolderQuota gate-semantics tests.
 *
 * assertWithinFolderQuota reads `this.#livinityd.store`/`.notifications` (a private
 * field that cannot be reached via the Files.prototype.<m>.call(stub) pattern the
 * sibling files.*.test.ts suites use — a plain stub has no private brand). So, exactly
 * like assertWithinQuota (which is itself only ever exercised through the PURE
 * usersOverSoftQuota, never directly), the DECISION that governs the gate is extracted
 * into pure functions and verified here:
 *
 *   assertWithinFolderQuota = read store (fail-open) → nearestAncestorFolderQuota →
 *                             decideFolderQuota → {block ? throw '[folder-quota-exceeded]'
 *                                                        : warn ? add target-qualified bell}
 *
 * decideFolderQuota + nearestAncestorFolderQuota ARE that logic; the method is thin glue.
 */

import {describe, expect, test} from 'vitest'

import {nearestAncestorFolderQuota, decideFolderQuota, type FolderQuotaEntry} from './folder-quota-scan.js'

// Compose the two pure fns exactly as the method does.
function gate(entries: FolderQuotaEntry[], virtualPath: string, addBytes: number) {
	const entry = nearestAncestorFolderQuota(entries, virtualPath)
	return {entry, ...decideFolderQuota(entry, addBytes)}
}

describe('assertWithinFolderQuota — gate semantics (via its pure decision core)', () => {
	test('nearest-ancestor entry governs the write', () => {
		const entries: FolderQuotaEntry[] = [
			{virtualPath: '/Home', limitBytes: 1000, hardBlock: true, usageBytes: 0},
			{virtualPath: '/Home/Downloads', limitBytes: 100, hardBlock: true, usageBytes: 90},
		]
		// A write under /Home/Downloads is governed by the DEEPER entry (limit 100), not /Home.
		expect(gate(entries, '/Home/Downloads/x', 20).entry?.virtualPath).toBe('/Home/Downloads')
		expect(gate(entries, '/Home/Downloads/x', 20).block).toBe(true) // 90+20 > 100 && hardBlock
	})

	test('hardBlock:true + projected over 100% → block (method throws before writing)', () => {
		const entries: FolderQuotaEntry[] = [{virtualPath: '/Home', limitBytes: 100, hardBlock: true, usageBytes: 95}]
		expect(gate(entries, '/Home/a', 10).block).toBe(true)
	})

	test('hardBlock:false + projected over 100% → NEVER blocks (warn-only, the default)', () => {
		const entries: FolderQuotaEntry[] = [{virtualPath: '/Home', limitBytes: 100, hardBlock: false, usageBytes: 95}]
		const g = gate(entries, '/Home/a', 10)
		expect(g.block).toBe(false)
		expect(g.warn).toBe(true) // still fires the soft bell
	})

	test('projected at/over the soft ratio → warns with the target-qualified id (never bare quota-exceeded)', () => {
		const entries: FolderQuotaEntry[] = [{virtualPath: '/Home/Docs', limitBytes: 100, hardBlock: false, usageBytes: 80}]
		const g = gate(entries, '/Home/Docs/a', 10) // 90 >= 90
		expect(g.warn).toBe(true)
		expect(g.block).toBe(false)
		// The method keys the bell on the GOVERNING entry's path.
		expect('folder-quota-exceeded:' + g.entry?.virtualPath).toBe('folder-quota-exceeded:/Home/Docs')
	})

	test('under the soft ratio → neither block nor warn', () => {
		const entries: FolderQuotaEntry[] = [{virtualPath: '/Home', limitBytes: 100, hardBlock: true, usageBytes: 10}]
		expect(gate(entries, '/Home/a', 10)).toMatchObject({block: false, warn: false})
	})

	test('limit <= 0 = unlimited → no-op even when hardBlock is true', () => {
		const entries: FolderQuotaEntry[] = [{virtualPath: '/Home', limitBytes: 0, hardBlock: true, usageBytes: 9999}]
		expect(gate(entries, '/Home/a', 9999)).toMatchObject({block: false, warn: false})
	})

	test('no ancestor entry → no-op (undefined entry)', () => {
		const entries: FolderQuotaEntry[] = [{virtualPath: '/Apps', limitBytes: 1, hardBlock: true, usageBytes: 999}]
		const g = gate(entries, '/Home/a', 999)
		expect(g.entry).toBeUndefined()
		expect(g).toMatchObject({block: false, warn: false})
	})

	test('growth delta is clamped at 0 (a shrink never trips the gate)', () => {
		const entries: FolderQuotaEntry[] = [{virtualPath: '/Home', limitBytes: 100, hardBlock: true, usageBytes: 80}]
		expect(gate(entries, '/Home/a', -50)).toMatchObject({block: false, warn: false})
	})
})
