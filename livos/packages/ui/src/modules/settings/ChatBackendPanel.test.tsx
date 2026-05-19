// Phase 165-02 — ChatBackendPanel source-text invariants.
//
// @testing-library/react NOT installed in @livos/ui (D-NO-NEW-DEPS).
// Mirrors master-chrome-login.test.tsx pattern: source-text grep + smoke import.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const SRC_PATH = resolve(__dirname, 'ChatBackendPanel.tsx')
const SRC = readFileSync(SRC_PATH, 'utf8')

describe('ChatBackendPanel — Phase 165-02', () => {
	it('exports ChatBackendPanel as a named export', () => {
		expect(SRC).toMatch(/export\s+function\s+ChatBackendPanel\b/)
	})

	it('wires trpcReact.chatConfig.getBackend.useQuery', () => {
		expect(SRC).toMatch(/trpcReact\.chatConfig\.getBackend\.useQuery/)
	})
	it('wires trpcReact.chatConfig.setBackend.useMutation', () => {
		expect(SRC).toMatch(/trpcReact\.chatConfig\.setBackend\.useMutation/)
	})
	it('wires trpcReact.chatConfig.getModel.useQuery', () => {
		expect(SRC).toMatch(/trpcReact\.chatConfig\.getModel\.useQuery/)
	})
	it('wires trpcReact.chatConfig.setModel.useMutation', () => {
		expect(SRC).toMatch(/trpcReact\.chatConfig\.setModel\.useMutation/)
	})

	it('contains the 3 model literals', () => {
		expect(SRC).toMatch(/claude-opus-4-7/)
		expect(SRC).toMatch(/claude-sonnet-4-6/)
		expect(SRC).toMatch(/claude-haiku-4-5-20251001/)
	})

	it('contains vault + legacy radio values', () => {
		expect(SRC).toMatch(/value=['"]vault['"]/)
		expect(SRC).toMatch(/value=['"]legacy['"]/)
	})

	it('invalidates chatConfig.getBackend after setBackend mutation', () => {
		expect(SRC).toMatch(/utils\.chatConfig\.getBackend\.invalidate/)
	})

	it('Apply button label is present', () => {
		expect(SRC).toMatch(/Apply/)
	})
})
