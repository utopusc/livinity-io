// @vitest-environment jsdom
//
// Phase 178-01 — graph-palette unit tests (8 assertions).
//
// Verifies the D-V38-O OKLCH palette is correct across all 3 themes for all 7
// node types, that edge baseline uses the --line-strong CSS var, that hover
// edges append /0.6 alpha to the source-type color, and that detectTheme
// reads document.body.classList properly.

import {afterEach, describe, expect, it} from 'vitest'
import {
	detectTheme,
	getEdgeColor,
	getEdgeHoverColor,
	getNodeColor,
	getOrphanRingColor,
	PALETTE,
	type GraphNodeType,
} from './graph-palette'

afterEach(() => {
	document.body.classList.remove('dark', 'iridescent')
})

describe('graph-palette', () => {
	it('returns the D-V38-O steel-blue OKLCH for memory in light theme', () => {
		expect(getNodeColor('memory', 'light')).toBe('oklch(0.56 0.10 245)')
	})

	it('returns the D-V38-O amber OKLCH for inbox in light theme', () => {
		expect(getNodeColor('inbox', 'light')).toBe('oklch(0.70 0.14 75)')
	})

	it('lifts L by +0.10 for dark-theme memory', () => {
		expect(getNodeColor('memory', 'dark')).toBe('oklch(0.66 0.10 245)')
	})

	it('lifts L by +0.05 and bumps C by +0.02 for iridescent memory', () => {
		expect(getNodeColor('memory', 'iridescent')).toBe('oklch(0.61 0.12 245)')
	})

	it('covers all 7 node types in each of 3 themes (21 entries)', () => {
		const types: GraphNodeType[] = [
			'memory',
			'session',
			'inbox',
			'agent',
			'skill',
			'command',
			'root',
		]
		for (const theme of ['light', 'dark', 'iridescent'] as const) {
			for (const t of types) {
				expect(PALETTE[theme][t]).toMatch(/^oklch\(/)
			}
		}
	})

	it('uses var(--line-strong) for the edge baseline in every theme', () => {
		expect(getEdgeColor('light')).toBe('var(--line-strong)')
		expect(getEdgeColor('dark')).toBe('var(--line-strong)')
		expect(getEdgeColor('iridescent')).toBe('var(--line-strong)')
	})

	it('appends /0.6 alpha to source-color on edge hover', () => {
		expect(getEdgeHoverColor('memory', 'light')).toBe(
			'oklch(0.56 0.10 245 / 0.6)',
		)
		expect(getEdgeHoverColor('agent', 'dark')).toBe(
			'oklch(0.72 0.10 180 / 0.6)',
		)
	})

	it('detectTheme reads body.dark / body.iridescent classList', () => {
		expect(detectTheme()).toBe('light')
		document.body.classList.add('dark')
		expect(detectTheme()).toBe('dark')
		document.body.classList.remove('dark')
		document.body.classList.add('iridescent')
		expect(detectTheme()).toBe('iridescent')
	})

	// Phase 187-02: getOrphanRingColor assertions
	it('getOrphanRingColor returns correct OKLCH for light theme', () => {
		expect(getOrphanRingColor('light')).toBe('oklch(0.55 0.20 20)')
	})

	it('getOrphanRingColor returns correct OKLCH for dark theme (higher lightness)', () => {
		expect(getOrphanRingColor('dark')).toBe('oklch(0.65 0.20 20)')
	})

	it('getOrphanRingColor returns correct OKLCH for iridescent theme', () => {
		expect(getOrphanRingColor('iridescent')).toBe('oklch(0.60 0.20 20)')
	})
})
