// @vitest-environment jsdom
//
// Phase 159 — use-native-app-agent source-text invariants (Workstream A).
//
// Locks the parity contract with useWebAppAgent + the divergences
// (apps.native.list, no session persistence, native: conversation prefix).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const HOOK_PATH = resolve(__dirname, 'use-native-app-agent.ts')
const SRC = readFileSync(HOOK_PATH, 'utf8')

describe('use-native-app-agent — Phase 159 parity contract', () => {
	it('re-exports UseStreamAppAgentResult as alias of UseWebAppAgentResult', () => {
		expect(SRC).toMatch(/export type UseStreamAppAgentResult\s*=\s*UseWebAppAgentResult/)
	})

	it('exports useNativeAppAgent with the expected signature', () => {
		expect(SRC).toMatch(/export function useNativeAppAgent\(nativeAppId:\s*string\)/)
	})

	it('imports useAgentSocket + ActiveAppMetaPayload from use-agent-socket', () => {
		expect(SRC).toMatch(/import\s*\{[\s\S]*?useAgentSocket[\s\S]*?ActiveAppMetaPayload[\s\S]*?\}\s*from\s*['"]@\/hooks\/use-agent-socket['"]/)
	})

	it('imports UseWebAppAgentResult + WebAppSessionStatus from use-webapp-agent', () => {
		expect(SRC).toMatch(/import\s+type\s*\{\s*UseWebAppAgentResult,\s*WebAppSessionStatus\s*\}\s*from\s*['"]@\/hooks\/use-webapp-agent['"]/)
	})

	it('uses apps.native.list (NOT webapp.list)', () => {
		expect(SRC).toMatch(/trpcReact\.apps\.native\.list\.useQuery/)
		expect(SRC).not.toMatch(/trpcReact\.webapp\.list\.useQuery/)
	})

	it('does NOT call webapp.window.list (native has no wid)', () => {
		expect(SRC).not.toMatch(/webapp\.window\.list/)
	})

	it('does NOT call webapp.agent.session.{get,upsert} (deferred per RESEARCH A4)', () => {
		expect(SRC).not.toMatch(/webapp\.agent\.session\.(get|upsert)/)
		expect(SRC).not.toMatch(/apps\.native\.agent\.session/)
	})

	it('passes activeAppMeta with kind: native (NOT webapp)', () => {
		expect(SRC).toMatch(/kind:\s*['"]native['"]/)
	})

	it('mints conversation IDs with native: prefix', () => {
		expect(SRC).toMatch(/`native:\$\{nativeAppId\}:\$\{rand\}`/)
	})

	it('UUID guard mirrors useWebAppAgent guard', () => {
		expect(SRC).toMatch(/\/\^\[0-9a-f-\]\{36\}\$\/i\.test\(nativeAppId\)/)
	})

	it('returns object with all UseWebAppAgentResult fields', () => {
		// Spot-check the load-bearing properties.
		for (const field of [
			'messages',
			'isStreaming',
			'agentStatus',
			'conversationId',
			'sessionStatus',
			'sendMessage',
			'stopStreaming',
			'startNewSession',
		]) {
			expect(SRC).toMatch(new RegExp(`${field}[:,]`))
		}
	})

	it('keeps the sacred-SHA marker comment present', () => {
		expect(SRC).toMatch(/sdk-agent-runner\.ts/)
	})
})

// ============================================================================
// Phase 161-04 — Computer-use detection signal lock-in
// ============================================================================
//
// These invariants protect the conversationId prefix-emit + verbatim
// pass-through that AgentSessionManager.isComputerUseSession() relies on
// (Plan 161-01). Any future refactor that mutates the convId before
// forwarding to useAgentSocket.sendMessage breaks Haiku routing + LivOS
// overlay + LivOS launcher dispatch silently — these tests fire red on
// regression.
//
// Verification-only per D-161-E. The native: prefix is already emitted
// unconditionally at use-native-app-agent.ts:33-39 + 86-91; this block
// locks the contract so future refactors can't break the upstream
// detection chain.

describe('Phase 161-04 — native: prefix downstream invariants', () => {
	it('passes the native: prefix verbatim through agent.sendMessage (no mutation between mint and send)', () => {
		// Defensive: if a future refactor adds prefix-stripping or normalization
		// (e.g., `convId = convId.replace(/^native:/, '')`) before
		// useAgentSocket.sendMessage(), this fires red — the SDK-path Haiku
		// routing detection (Plan 161-01) breaks silently otherwise.
		expect(SRC).toMatch(/agent\.sendMessage\([^,]+,\s*undefined,\s*convId\b/)
	})

	it('binds convId from local state with lazy mint via makeFreshConversationId(nativeAppId)', () => {
		// The actual implementation uses `let convId = conversationId` + a
		// lazy mint when conversationId is null:
		//   let convId = conversationId
		//   if (!convId) {
		//     convId = makeFreshConversationId(nativeAppId)
		//     ...
		//   }
		// Both lines are required for the verbatim pass-through guarantee.
		expect(SRC).toMatch(/let\s+convId\s*=\s*conversationId/)
		expect(SRC).toMatch(/convId\s*=\s*makeFreshConversationId\(nativeAppId\)/)
	})

	it('does not mutate convId between mint and send (no .replace / .slice / suspicious reassignment)', () => {
		// Source-text guard: ensure no `convId.replace(`, `convId.slice(`
		// appears anywhere. The defensive reassignment regex below uses a
		// negative-lookahead to exclude the LEGITIMATE lazy mint
		// `convId = makeFreshConversationId(...)` while still firing red on
		// any OTHER reassignment (e.g., `convId = convId.replace(...)`,
		// `convId = stripPrefix(convId)`, etc.).
		//
		// 161-04 PLAN landmine note specified `/^\s*convId\s*=\s*[^m]/gm`,
		// but that pattern false-positives on the legitimate mint when there
		// is a single space after `=` (backtracking lets `\s*` consume 0
		// chars, then ` ` (space) matches `[^m]`). The negative lookahead
		// below preserves the INTENT of the landmine (allow lazy mint,
		// reject mutation) without the backtracking false-positive.
		// Documented as a Phase 161-04 Rule-1 deviation in SUMMARY.
		expect(SRC).not.toMatch(/convId\.replace\s*\(/)
		expect(SRC).not.toMatch(/convId\.slice\s*\(/)
		// Two-step: (1) collect every `convId = <rhs>` reassignment line,
		// (2) reject any rhs that is NOT the legitimate lazy mint
		// `makeFreshConversationId(...)`. This avoids the backtracking
		// false-positive that any single-regex form has (where `\s*` can
		// shrink to 0 chars and let `\S` or `[^m]` accept a leading space).
		const allReassigns = SRC.match(/^\s*convId\s*=\s*([^\n]+)$/gm) ?? []
		const illegitimate = allReassigns.filter((line) => {
			const rhs = line.replace(/^\s*convId\s*=\s*/, '').trim()
			// Allow only `makeFreshConversationId(<anything>)` as the RHS.
			return !/^makeFreshConversationId\s*\(/.test(rhs)
		})
		expect(illegitimate).toEqual([])
	})

	it('Phase 161-04 marker present (so grep finds the regression-test lock)', () => {
		// Self-referential: the test file itself contains the Phase 161-04
		// marker. Intentional — `grep -r "Phase 161-04" livos/packages/ui/`
		// locates the regression suite when investigating future bugs.
		const TEST_PATH = resolve(__dirname, 'use-native-app-agent.test.ts')
		const TEST_SRC = readFileSync(TEST_PATH, 'utf8')
		expect(TEST_SRC).toMatch(/Phase 161-04/)
	})
})
