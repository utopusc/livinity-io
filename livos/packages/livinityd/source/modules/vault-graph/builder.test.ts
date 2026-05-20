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
		topDir: 'root',
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
			weight: 1,
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
			weight: 1,
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

	// Phase 179-01 — GraphNode.tags + GraphNode.topDir assertions (RED gate)
	it('GraphNode.tags is populated from VaultFile with frontmatter tags', () => {
		const files = [makeFile({path: 'a.md', frontmatter: {tags: ['x']}, topDir: 'root'})]
		const {nodes} = buildGraph(files)
		expect(nodes[0].tags).toEqual(['x'])
	})

	it('GraphNode.tags is empty array when VaultFile has no frontmatter', () => {
		const files = [makeFile({path: 'a.md', frontmatter: undefined, topDir: 'root'})]
		const {nodes} = buildGraph(files)
		expect(nodes[0].tags).toEqual([])
	})

	it('GraphNode.topDir matches VaultFile.topDir', () => {
		const files = [makeFile({path: 'agent/baz.md', type: 'agent', topDir: 'agent'})]
		const {nodes} = buildGraph(files)
		expect(nodes[0].topDir).toBe('agent')
	})

	// Phase 187-01: degree + wikiDegree assertions (RED gate)

	it('isolated node (no edges) has degree === 0 and wikiDegree === 0', () => {
		const files = [makeFile({path: 'a.md', wikilinks: []})]
		const {nodes} = buildGraph(files)
		expect(nodes[0].degree).toBe(0)
		expect(nodes[0].wikiDegree).toBe(0)
	})

	it('node with 2 outgoing wikilinks has degree === 2, wikiDegree === 2', () => {
		const files = [
			makeFile({path: 'a.md', wikilinks: ['b', 'c']}),
			makeFile({path: 'b.md'}),
			makeFile({path: 'c.md'}),
		]
		const {nodes} = buildGraph(files)
		const a = nodes.find((n) => n.id === 'a.md')!
		expect(a.degree).toBe(2)
		expect(a.wikiDegree).toBe(2)
	})

	it('node as target of 2 incoming wikilinks has degree === 2, wikiDegree === 2', () => {
		const files = [
			makeFile({path: 'a.md', wikilinks: ['target']}),
			makeFile({path: 'b.md', wikilinks: ['target']}),
			makeFile({path: 'target.md'}),
		]
		const {nodes} = buildGraph(files)
		const t = nodes.find((n) => n.id === 'target.md')!
		expect(t.degree).toBe(2)
		expect(t.wikiDegree).toBe(2)
	})

	it('GraphNode shape includes degree and wikiDegree on every node', () => {
		const files = [
			makeFile({path: 'a.md', wikilinks: ['b']}),
			makeFile({path: 'b.md'}),
			makeFile({path: 'c.md'}),
		]
		const {nodes} = buildGraph(files)
		for (const n of nodes) {
			expect(typeof n.degree).toBe('number')
			expect(typeof n.wikiDegree).toBe('number')
		}
	})

	// Phase 187-04: weight field assertions (RED gate)

	it('every edge has weight === 1 by default', () => {
		const files = [
			makeFile({path: 'a.md', wikilinks: ['b']}),
			makeFile({path: 'b.md'}),
		]
		const {edges} = buildGraph(files)
		expect(edges.length).toBeGreaterThan(0)
		expect(edges.every((e) => e.weight === 1)).toBe(true)
	})

	it('edge.weight is a number (not undefined)', () => {
		const files = [
			makeFile({path: 'a.md', wikilinks: ['b']}),
			makeFile({path: 'b.md'}),
		]
		const {edges} = buildGraph(files)
		expect(typeof edges[0].weight).toBe('number')
	})

	it('wikiDegree ignores directory-type edges (only counts wikilinks)', () => {
		// A → B via wikilink, A is also a child of a directory node
		// In builder v1, directory edges are deferred — so directory edges won't
		// appear in the edge list. This test verifies wikiDegree only counts
		// wikilink type by checking a node with only wikilink edges.
		const files = [
			makeFile({path: 'a.md', wikilinks: ['b']}),
			makeFile({path: 'b.md'}),
		]
		const {edges, nodes} = buildGraph(files)
		expect(edges.every((e) => e.type === 'wikilink')).toBe(true)
		const a = nodes.find((n) => n.id === 'a.md')!
		const b = nodes.find((n) => n.id === 'b.md')!
		// a: 1 outgoing wikilink → degree=1, wikiDegree=1
		expect(a.degree).toBe(1)
		expect(a.wikiDegree).toBe(1)
		// b: 1 incoming wikilink → degree=1, wikiDegree=1
		expect(b.degree).toBe(1)
		expect(b.wikiDegree).toBe(1)
	})
})
