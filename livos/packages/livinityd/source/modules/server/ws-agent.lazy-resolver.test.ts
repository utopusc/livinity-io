/**
 * Phase 165-02 — ws-agent lazy resolver invariants.
 *
 * Source-text invariant suite (vitest) locking the lazy
 * resolveVaultModeConfig refactor. V1-V7 are enforced as greps on
 * ws-agent.ts + server/index.ts source files.
 *
 * Runtime behavioural validation (fake-WebSocket harness) was a planned
 * V4-V7 but downgraded to source-text per the WARNING-1 fix — the refactor
 * is purely structural (where defaultSessionManager / buildSessionManager
 * are declared, where opts.resolveVaultModeConfig() is invoked, and what
 * fields the getter body reads), all of which are deterministically
 * observable from source text. Runtime probing is deferred to Phase 165-04
 * §6 §7 live probe.
 */

import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname, resolve} from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WS_AGENT = readFileSync(resolve(__dirname, 'ws-agent.ts'), 'utf8')
const SERVER_INDEX = readFileSync(resolve(__dirname, 'index.ts'), 'utf8')

/**
 * Carve out the substring of `src` that lies inside the factory's returned
 * `(ws, request) => { ... }` arrow body. Uses a simple brace-balance scan
 * starting at the first `return (ws` substring. Returns '' if not found.
 */
function carveArrowBody(src: string): string {
	const marker = 'return (ws'
	const start = src.indexOf(marker)
	if (start === -1) return ''
	// Find the `{` that opens the arrow body (after `=>`)
	const arrowIdx = src.indexOf('=>', start)
	if (arrowIdx === -1) return ''
	const braceIdx = src.indexOf('{', arrowIdx)
	if (braceIdx === -1) return ''
	let depth = 0
	let i = braceIdx
	for (; i < src.length; i++) {
		const c = src[i]
		if (c === '{') depth++
		else if (c === '}') {
			depth--
			if (depth === 0) break
		}
	}
	return src.substring(braceIdx, i + 1)
}

const ARROW_BODY = carveArrowBody(WS_AGENT)
const FACTORY_PRE_ARROW = (() => {
	const idx = WS_AGENT.indexOf('return (ws')
	return idx === -1 ? WS_AGENT : WS_AGENT.substring(0, idx)
})()

describe('ws-agent lazy resolver invariants (Phase 165-02)', () => {
	// V1 ────────────────────────────────────────────────────────────────
	it('V1: factory opts type declares resolveVaultModeConfig getter; old boot-frozen `vaultModeConfig?:` shape removed', () => {
		expect(WS_AGENT).toMatch(/resolveVaultModeConfig:\s*\(\)\s*=>/)
		// Old shape gone
		expect(WS_AGENT).not.toMatch(/vaultModeConfig\?:\s*\{/)
	})

	// V2 ────────────────────────────────────────────────────────────────
	it('V2: server/index.ts /ws/agent mount passes `resolveVaultModeConfig` getter; old `const vaultModeConfig = ai.chatBackend ...` boot-frozen local removed', () => {
		expect(SERVER_INDEX).toMatch(/resolveVaultModeConfig[:,]/)
		expect(SERVER_INDEX).not.toMatch(
			/const\s+vaultModeConfig\s*=\s*ai\.chatBackend/,
		)
		expect(SERVER_INDEX).not.toMatch(
			/const\s+vaultModeConfig\s*=\s*this\.livinityd\.ai\.chatBackend/,
		)
	})

	// V3 ────────────────────────────────────────────────────────────────
	it('V3: no remaining `opts.vaultModeConfig` references in ws-agent.ts', () => {
		const matches = WS_AGENT.match(/opts\.vaultModeConfig/g) ?? []
		expect(matches.length).toBe(0)
	})

	// V4 ────────────────────────────────────────────────────────────────
	it('V4: opts.resolveVaultModeConfig() is invoked INSIDE the per-connection arrow body', () => {
		expect(ARROW_BODY.length).toBeGreaterThan(0)
		expect(ARROW_BODY).toMatch(/opts\.resolveVaultModeConfig\(\)/)
	})

	// V5 ────────────────────────────────────────────────────────────────
	it('V5: `const defaultSessionManager` is declared INSIDE the per-connection arrow body, NOT at factory scope', () => {
		expect(ARROW_BODY).toMatch(/const\s+defaultSessionManager\b/)
		expect(FACTORY_PRE_ARROW).not.toMatch(/const\s+defaultSessionManager\b/)
	})

	// V6 ────────────────────────────────────────────────────────────────
	it('V6: buildSessionManager is declared INSIDE the per-connection arrow body, NOT at factory scope', () => {
		expect(ARROW_BODY).toMatch(/(const|function)\s+buildSessionManager\b/)
		expect(FACTORY_PRE_ARROW).not.toMatch(
			/(const|function)\s+buildSessionManager\b/,
		)
	})

	// V7 ────────────────────────────────────────────────────────────────
	it('V7: server/index.ts resolveVaultModeConfig getter body reads live ai.chatBackend (not a boot-captured snapshot)', () => {
		const start = SERVER_INDEX.indexOf('const resolveVaultModeConfig')
		expect(start).toBeGreaterThan(-1)
		// Slice generously to cover multi-line getters with comments
		const slice = SERVER_INDEX.substring(start, start + 1200)
		expect(slice).toMatch(/(?:this\.livinityd\.)?ai\.chatBackend/)
	})
})
