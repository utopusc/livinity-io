// Phase 246-04 Task 1 — terminal-session-storage drift-lock tests.
//
// 3 cases:
//   1. Prefix constant matches CONTEXT-locked string (`livos.v44.terminal.session.`)
//   2. readAllTabSessions filters by prefix and strips it from returned keys
//   3. writeTabSession + removeTabSession round-trip through the storage stub
import {describe, expect, it} from 'vitest'

import {
	readAllTabSessions,
	removeTabSession,
	TERMINAL_SESSION_STORAGE_PREFIX,
	writeTabSession,
} from './terminal-session-storage'

function makeFakeStorage(initial: Record<string, string> = {}): Storage {
	let store: Record<string, string> = {...initial}
	const fake: Storage = {
		get length() {
			return Object.keys(store).length
		},
		key: (i: number) => Object.keys(store)[i] ?? null,
		getItem: (k: string) => (k in store ? store[k] : null),
		setItem: (k: string, v: string) => {
			store[k] = v
		},
		removeItem: (k: string) => {
			delete store[k]
		},
		clear: () => {
			store = {}
		},
	}
	return fake
}

describe('terminal-session-storage', () => {
	it('TERMINAL_SESSION_STORAGE_PREFIX is the exact CONTEXT-locked string', () => {
		expect(TERMINAL_SESSION_STORAGE_PREFIX).toBe('livos.v44.terminal.session.')
	})

	it('readAllTabSessions returns only entries matching the prefix, stripping it', () => {
		const storage = makeFakeStorage({
			'livos.v44.terminal.session.tab1': 'sess-A',
			'livos.v44.terminal.session.tab2': 'sess-B',
			'unrelated.key': 'X',
			'livos.v43.something': 'Y',
		})
		const result = readAllTabSessions(storage)
		expect(result).toEqual({tab1: 'sess-A', tab2: 'sess-B'})
		expect(result).not.toHaveProperty('unrelated.key')
		expect(result).not.toHaveProperty('livos.v43.something')
	})

	it('writeTabSession + removeTabSession round-trip', () => {
		const storage = makeFakeStorage()
		writeTabSession('tab1', 'sess-A', storage)
		expect(storage.getItem('livos.v44.terminal.session.tab1')).toBe('sess-A')
		removeTabSession('tab1', storage)
		expect(storage.getItem('livos.v44.terminal.session.tab1')).toBeNull()
	})
})
