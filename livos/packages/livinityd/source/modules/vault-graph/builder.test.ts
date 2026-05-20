/**
 * Phase 169-02 — buildGraph vitest spec (8 assertions).
 *
 * Pure transform: no fs, no network. Uses synthetic VaultFile fixtures.
 */

import {describe, it, expect} from 'vitest'

import {buildGraph} from './builder.js'
import type {VaultFile} from './walker.js'

function makeFile(overrides: Partial<VaultFile>): VaultFile {
	return {
		path: 'a.md',
		type: 'root',
		size: 100,
		mtime: 1700000000000,
		wikilinks: [],
		...overrides,
	}
}

describe('buildGraph', () => {
	it('maps each VaultFile to exactly one GraphNode (1:1)', () => {
		const files = [
			makeFile({path: 'a.md'}),
			makeFile({path: 'b.md'}),
			makeFile({path: 'c.md'}),
		]
		const {nodes} = buildGraph(files)
		expect(nodes).toHaveLength(3)
	})

	it('GraphNode.id equals source VaultFile.path', () => {
		const files = [makeFile({path: 'memory/foo.md', type: 'memory'})]
		const {nodes} = buildGraph(files)
		expect(nodes[0].id).toBe('memory/foo.md')
	})

	it('GraphNode.label is basename without .md', () => {
		const files = [makeFile({path: 'memory/foo.md', type: 'memory'})]
		const {nodes} = buildGraph(files)
		expect(nodes[0].label).toBe('foo')
	})

	it('resolves [[bar]] from memory/foo.md → memory/bar.md (memory/ candidate)', () => {
		const files = [
			makeFile({path: 'memory/foo.md', type: 'memory', wikilinks: ['bar']}),
			makeFile({path: 'memory/bar.md', type: 'memory'}),
		]
		const {edges} = buildGraph(files)
		expect(edges).toContainEqual({
			source: 'memory/foo.md',
			target: 'memory/bar.md',
			type: 'wikilink',
		})
	})

	it('drops wikilinks with no matching candidate (no orphan edges)', () => {
		const files = [
			makeFile({path: 'a.md', wikilinks: ['nonexistent-target']}),
		]
		const {edges} = buildGraph(files)
		expect(edges).toHaveLength(0)
	})

	it('checks all candidate paths in order (memory → feedback → projects → references → user → bare)', () => {
		// Place target under memory/references/ to verify deeper candidates are tried.
		const files = [
			makeFile({path: 'a.md', wikilinks: ['ref-doc']}),
			makeFile({path: 'memory/references/ref-doc.md', type: 'memory'}),
		]
		const {edges} = buildGraph(files)
		expect(edges).toContainEqual({
			source: 'a.md',
			target: 'memory/references/ref-doc.md',
			type: 'wikilink',
		})
	})

	it('produces multiple edges when a file has multiple wikilinks', () => {
		const files = [
			makeFile({path: 'a.md', wikilinks: ['b', 'c']}),
			makeFile({path: 'b.md'}),
			makeFile({path: 'c.md'}),
		]
		const {edges} = buildGraph(files)
		expect(edges).toHaveLength(2)
		expect(edges.map((e) => e.target).sort()).toEqual(['b.md', 'c.md'])
	})

	it('GraphEdge.type is always "wikilink" in v1 (directory edges deferred)', () => {
		const files = [
			makeFile({path: 'a.md', wikilinks: ['b']}),
			makeFile({path: 'b.md'}),
		]
		const {edges} = buildGraph(files)
		expect(edges.every((e) => e.type === 'wikilink')).toBe(true)
	})
})
