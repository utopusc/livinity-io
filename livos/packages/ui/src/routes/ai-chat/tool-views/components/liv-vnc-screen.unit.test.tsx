/**
 * LivVncScreen unit tests — Phase 71-02 (CU-FOUND-03 / CU-FOUND-04).
 *
 * Pure-helper extraction pattern (P67-04 D-25, P70-01 D-23, P70-06).
 * NO @testing-library/react. NO msw. NO @liv/core import.
 *
 * Coverage matrix (must-haves from 71-02-PLAN.md):
 *   - buildWebsockifyUrl canonical URL (D-11)
 *   - URL-encoding of JWT special chars (+, /, =)
 *   - Empty / whitespace / scheme-prefixed host rejection
 *   - Source-text invariants: viewOnly={false} & 'react-vnc' import &
 *     three sentinel UI strings each appear EXACTLY ONCE
 *   - Token-leak guard: NO console.* calls referencing token / jwt /
 *     websockifyUrl (T-71-02-02 mitigation)
 */
// @vitest-environment jsdom
import {readFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, it} from 'vitest'

import {buildWebsockifyUrl} from './liv-vnc-screen'

const __dirname = dirname(fileURLToPath(import.meta.url))
const COMPONENT_PATH = resolve(__dirname, 'liv-vnc-screen.tsx')
const componentSource = readFileSync(COMPONENT_PATH, 'utf8')

// ─────────────────────────────────────────────────────────────────────
// buildWebsockifyUrl — pure helper (D-11)
// ─────────────────────────────────────────────────────────────────────

describe('buildWebsockifyUrl (D-11)', () => {
	it('builds canonical URL from host + JWT', () => {
		expect(buildWebsockifyUrl('desktop.bruce.livinity.io', 'abc.def.ghi')).toBe(
			'wss://desktop.bruce.livinity.io/websockify?token=abc.def.ghi',
		)
	})

	it('URL-encodes JWT special chars (+, /, =)', () => {
		// Real-world base64 padding looks like 'a+b/c=='; encodeURIComponent
		// replaces these with %2B / %2F / %3D so the websockify proxy gets
		// the original token back via decode at the gateway.
		expect(buildWebsockifyUrl('x.com', 'a+b/c==')).toBe(
			'wss://x.com/websockify?token=a%2Bb%2Fc%3D%3D',
		)
	})

	it('throws on empty host', () => {
		expect(() => buildWebsockifyUrl('', 'jwt')).toThrow(/non-empty/)
	})

	it('throws on whitespace inside host', () => {
		expect(() => buildWebsockifyUrl('a b.com', 'jwt')).toThrow(/whitespace/)
		expect(() => buildWebsockifyUrl('host\t', 'jwt')).toThrow(/whitespace/)
		expect(() => buildWebsockifyUrl('h\nost', 'jwt')).toThrow(/whitespace/)
	})

	it('throws on scheme-prefixed host (http / https / ws / wss)', () => {
		for (const bad of ['http://x.com', 'https://x.com', 'ws://x.com', 'wss://x.com']) {
			expect(() => buildWebsockifyUrl(bad, 'jwt')).toThrow(/scheme/)
		}
	})

	it('passes through hosts that contain colons (port suffix)', () => {
		// Port suffix is allowed (colon is not a scheme prefix); useful for
		// dev / staging where the gateway listens on a non-443 port.
		expect(buildWebsockifyUrl('host.local:8443', 'jwt')).toBe(
			'wss://host.local:8443/websockify?token=jwt',
		)
	})
})

// ─────────────────────────────────────────────────────────────────────
// liv-vnc-screen.tsx source-text invariants
// ─────────────────────────────────────────────────────────────────────

describe('liv-vnc-screen.tsx source-text invariants', () => {
	it("renders viewOnly={false} EXACTLY ONCE (D-12 lock)", () => {
		const matches = componentSource.match(/viewOnly=\{false\}/g) ?? []
		expect(matches.length).toBe(1)
	})

	it("imports from 'react-vnc' EXACTLY ONCE", () => {
		const matches = componentSource.match(/from\s+['"]react-vnc['"]/g) ?? []
		expect(matches.length).toBe(1)
	})

	it('contains all 3 user-visible sentinel strings EXACTLY ONCE each', () => {
		expect((componentSource.match(/Connecting to desktop\.\.\./g) ?? []).length).toBe(1)
		expect((componentSource.match(/Connection lost/g) ?? []).length).toBe(1)
		expect((componentSource.match(/Liv has paused — you have control/g) ?? []).length).toBe(1)
	})

	it('does NOT log JWT / token / websockifyUrl to console (T-71-02-02 token-leak guard)', () => {
		// Catches console.log/warn/error/info/debug invocations whose first
		// arg substring contains any of the secret-bearing identifiers.
		expect(componentSource).not.toMatch(/console\.\w+\([^)]*jwt/i)
		expect(componentSource).not.toMatch(/console\.\w+\([^)]*token/i)
		expect(componentSource).not.toMatch(/console\.\w+\([^)]*websockifyUrl/i)
	})

	it('exports LivVncScreenProps type (D-13 contract)', () => {
		expect(componentSource).toMatch(/export\s+type\s+LivVncScreenProps/)
	})

	it('uses scale-to-fit aspect ratio 4/3 (1280:960 reduced)', () => {
		expect(componentSource).toMatch(/aspectRatio:.*['"]4\/3['"]/)
	})

	it('uses max-h-[60vh] for chat-side panel cap', () => {
		expect(componentSource).toContain('max-h-[60vh]')
	})

	it('imports IconMaximize / IconMinimize for fullscreen toggle', () => {
		expect(componentSource).toMatch(/IconMaximize/)
		expect(componentSource).toMatch(/IconMinimize/)
	})
})
