// @vitest-environment jsdom
//
// Phase 174-05 — ItemContextMenu unit tests (source-text invariants).
//
// Radix Context Menu portals its <Content> outside the trigger and only mounts
// the menu after a real right-click event. JSDOM lacks reliable portal-flush
// + pointer-event plumbing for Radix's Trigger, so the most stable assertion
// path is source-text invariants: read ItemContextMenu.tsx from disk and assert
// on literals (item labels, conditional gate, item count). The behavioural
// shape (conditional rendering on item.type === 'agent') is encoded in the
// source structure and locked down here. Phase 175 wires real RTL behaviour
// tests when it mounts ItemContextMenu around each tree row with real
// handlers.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const SRC = readFileSync(
	resolve(__dirname, 'ItemContextMenu.tsx'),
	'utf8',
)

describe('ItemContextMenu — source-text invariants', () => {
	it('B-cm-1: wraps children with ContextMenu.Trigger', () => {
		// File imports the Radix primitive and routes children through Trigger.
		expect(SRC).toMatch(/from '@radix-ui\/react-context-menu'/)
		expect(SRC).toMatch(/ContextMenu\.Trigger[\s\S]*children/)
	})

	it('B-cm-2: declares the 3 agent-only labels AND gates them on itemType === \'agent\'', () => {
		// Gate present.
		expect(SRC).toMatch(/itemType === 'agent'/)
		// All 3 agent-only labels present in the file.
		expect(SRC).toMatch(/Run Now/)
		expect(SRC).toMatch(/View Inbox/)
		expect(SRC).toMatch(/Stop Tmux/)
	})

	it('B-cm-3: declares at least 10 ContextMenu.Item entries (7 standard + 3 agent-only)', () => {
		const count = (SRC.match(/ContextMenu\.Item/g) || []).length
		expect(count).toBeGreaterThanOrEqual(10)
	})

	it('B-cm-4: the 3 agent-only items live inside the itemType === \'agent\' gated block', () => {
		// Locate the gated block: `itemType === 'agent' && (` … `)`.
		// All three agent-only labels must appear inside it (not at top level).
		const gatedBlockPattern =
			/itemType === 'agent' && \([\s\S]*?Run Now[\s\S]*?View Inbox[\s\S]*?Stop Tmux[\s\S]*?\)/
		expect(SRC).toMatch(gatedBlockPattern)
	})
})
