/**
 * Phase 165-02 — chat-config-router.test.ts
 *
 * Source-text invariant suite (vitest). Locks the router's shape:
 *   - 4 procedures all adminProcedure-gated
 *   - setBackend zod-validates backend enum (vault | legacy)
 *   - setModel zod-validates model enum (3 dated literals)
 *   - setBackend writes liv:config:chat_backend AND mutates ai.chatBackend
 *   - setModel writes liv:config:default_chat_model AND mutates ai.defaultChatModel
 */

import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const SRC = readFileSync(
	resolve(__dirname, 'chat-config-router.ts'),
	'utf8',
)
const COMMON_SRC = readFileSync(resolve(__dirname, 'common.ts'), 'utf8')
const INDEX_SRC = readFileSync(resolve(__dirname, 'index.ts'), 'utf8')

describe('chat-config router — Phase 165-02 source-text invariants', () => {
	// C1 — 4 procedure names ──────────────────────────────────────────
	it('C1: source contains all 4 procedure names (getBackend, setBackend, getModel, setModel)', () => {
		expect(SRC).toMatch(/getBackend:\s*adminProcedure/)
		expect(SRC).toMatch(/setBackend:\s*adminProcedure/)
		expect(SRC).toMatch(/getModel:\s*adminProcedure/)
		expect(SRC).toMatch(/setModel:\s*adminProcedure/)
	})

	// C2 — adminProcedure (>=4) ───────────────────────────────────────
	it('C2: every procedure uses adminProcedure (>=4 occurrences)', () => {
		const matches = SRC.match(/adminProcedure/g) ?? []
		expect(matches.length).toBeGreaterThanOrEqual(4)
	})

	// C3 — setBackend zod enum ────────────────────────────────────────
	it('C3: setBackend input zod-validates backend: z.enum([\'vault\', \'legacy\'])', () => {
		expect(SRC).toMatch(
			/setBackend[\s\S]{0,400}?z\.enum\(\s*\[\s*['"]vault['"]\s*,\s*['"]legacy['"]/,
		)
	})

	// C4 — setBackend writes Redis + in-memory ai.chatBackend ──────────
	it('C4: setBackend writes liv:config:chat_backend AND sets ai.chatBackend', () => {
		expect(SRC).toMatch(/liv:config:chat_backend/)
		expect(SRC).toMatch(/ai\.chatBackend\s*=/)
	})

	// C5 — setModel writes Redis + in-memory ai.defaultChatModel ───────
	it('C5: setModel writes liv:config:default_chat_model AND sets ai.defaultChatModel', () => {
		expect(SRC).toMatch(/liv:config:default_chat_model/)
		expect(SRC).toMatch(/ai\.defaultChatModel\s*=/)
	})

	// C6 — model enum ─────────────────────────────────────────────────
	it('C6: source contains the 3 model literals (claude-opus-4-7, claude-sonnet-4-6, claude-haiku-4-5-20251001)', () => {
		expect(SRC).toMatch(/claude-opus-4-7/)
		expect(SRC).toMatch(/claude-sonnet-4-6/)
		expect(SRC).toMatch(/claude-haiku-4-5-20251001/)
	})
})

describe('chat-config router — common.ts httpOnlyPaths registration', () => {
	it('H1: common.ts contains 4 chatConfig.* path strings', () => {
		expect(COMMON_SRC).toMatch(/'chatConfig\.getBackend'/)
		expect(COMMON_SRC).toMatch(/'chatConfig\.setBackend'/)
		expect(COMMON_SRC).toMatch(/'chatConfig\.getModel'/)
		expect(COMMON_SRC).toMatch(/'chatConfig\.setModel'/)
	})
})

describe('chat-config router — createAppRouter slot', () => {
	it('I2: index.ts contains `chatConfig: chatConfigRouter` slot', () => {
		expect(INDEX_SRC).toMatch(/chatConfig:\s*chatConfigRouter/)
	})
	it('I3b: chatConfigRouter imported at top of index.ts', () => {
		expect(INDEX_SRC).toMatch(
			/import\s+chatConfigRouter\s+from\s+['"]\.\/chat-config-router\.js['"]/,
		)
	})
})
