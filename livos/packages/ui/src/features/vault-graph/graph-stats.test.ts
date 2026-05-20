// @vitest-environment node
//
// Phase 187-05 — graph-stats unit tests (7 assertions).
// computeGraphStats is a pure function — no DOM needed.

import {describe, it, expect} from 'vitest'
import {computeGraphStats} from './graph-stats'

const makeNode = (id: string, degree: number, wikiDegree: number) => ({
	id,
	label: id,
	degree,
	wikiDegree,
})

describe('computeGraphStats', () => {
	it('nodeCount matches input nodes array length', () => {
		const nodes = [makeNode('a', 2, 2), makeNode('b', 1, 1)]
		const edges = [{}, {}]
		const stats = computeGraphStats(nodes, edges)
		expect(stats.nodeCount).toBe(2)
	})

	it('edgeCount matches input edges array length', () => {
		const nodes = [makeNode('a', 1, 1)]
		const edges = [{}, {}, {}]
		const stats = computeGraphStats(nodes, edges)
		expect(stats.edgeCount).toBe(3)
	})

	it('orphanCount equals count of nodes with wikiDegree === 0', () => {
		const nodes = [
			makeNode('a', 0, 0),
			makeNode('b', 1, 1),
			makeNode('c', 0, 0),
		]
		const stats = computeGraphStats(nodes, [])
		expect(stats.orphanCount).toBe(2)
	})

	it('orphanCount is 0 when all nodes have wikiDegree > 0', () => {
		const nodes = [makeNode('a', 3, 3), makeNode('b', 2, 1)]
		const stats = computeGraphStats(nodes, [])
		expect(stats.orphanCount).toBe(0)
	})

	it('topHubs sorted descending by degree (highest degree first)', () => {
		const nodes = [
			makeNode('low', 1, 1),
			makeNode('high', 10, 8),
			makeNode('mid', 4, 3),
		]
		const stats = computeGraphStats(nodes, [])
		expect(stats.topHubs[0].id).toBe('high')
		expect(stats.topHubs[1].id).toBe('mid')
		expect(stats.topHubs[2].id).toBe('low')
	})

	it('topHubs length capped at 3 even when more nodes present', () => {
		const nodes = [
			makeNode('a', 10, 8),
			makeNode('b', 8, 6),
			makeNode('c', 6, 4),
			makeNode('d', 4, 2),
			makeNode('e', 2, 1),
		]
		const stats = computeGraphStats(nodes, [])
		expect(stats.topHubs.length).toBe(3)
	})

	it('topHubs length equals total nodes when fewer than 3 nodes', () => {
		const nodes = [makeNode('a', 5, 4), makeNode('b', 2, 1)]
		const stats = computeGraphStats(nodes, [])
		expect(stats.topHubs.length).toBe(2)
	})
})
