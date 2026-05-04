// Phase 70-05 unit tests — pure-helper coverage for the agent-status + typing-dots
// components. Targets:
//
//   - getStatusGlowColor (CONTEXT D-36): all 6 phase mappings + unknown-phase
//     defensive default.
//   - getNextDot (CONTEXT D-39): 4-step cycle + unknown-input defensive default.
//
// We test pure helpers (not React render) because:
//   1. D-07 (D-NO-NEW-DEPS) — @testing-library/react is not in this package's
//      devDeps and we cannot add it. Established precedent in P67-04 SUMMARY.
//   2. The locked product behavior lives in the helpers, not the JSX shell.

import {describe, expect, it} from 'vitest'

import {getStatusGlowColor} from './liv-agent-status'
import {getNextDot} from './liv-typing-dots'

describe('getStatusGlowColor (D-36)', () => {
	it('returns cyan for thinking', () => {
		expect(getStatusGlowColor('thinking')).toBe('cyan')
	})

	it('returns cyan for listening', () => {
		expect(getStatusGlowColor('listening')).toBe('cyan')
	})

	it('returns amber for executing', () => {
		expect(getStatusGlowColor('executing')).toBe('amber')
	})

	it('returns rose for error', () => {
		expect(getStatusGlowColor('error')).toBe('rose')
	})

	it('returns null for idle', () => {
		expect(getStatusGlowColor('idle')).toBe(null)
	})

	it('returns null for responding', () => {
		expect(getStatusGlowColor('responding')).toBe(null)
	})

	it('returns null for unknown phase (defensive default)', () => {
		expect(getStatusGlowColor('unknown-phase')).toBe(null)
		expect(getStatusGlowColor('')).toBe(null)
		expect(getStatusGlowColor('THINKING')).toBe(null) // case-sensitive
	})
})

describe('getNextDot (D-39)', () => {
	it('cycles "" → "." → ".." → "..." → ""', () => {
		expect(getNextDot('')).toBe('.')
		expect(getNextDot('.')).toBe('..')
		expect(getNextDot('..')).toBe('...')
		expect(getNextDot('...')).toBe('')
	})

	it('returns "" for unknown input (defensive)', () => {
		expect(getNextDot('????')).toBe('')
		expect(getNextDot('....')).toBe('')
		expect(getNextDot('foo')).toBe('')
	})

	it('full 4-step cycle returns to start', () => {
		let dot = ''
		for (let i = 0; i < 4; i++) dot = getNextDot(dot)
		expect(dot).toBe('')
	})
})
