// @vitest-environment jsdom
//
// Phase 95-06 — useWebAppAgent unit tests.
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS — same precedent as 95-04 / 67-04 — see
// livos/packages/ui/src/lib/use-liv-agent-stream.unit.test.tsx).
//
// Per that precedent, this file ships:
//   1. **Source-text invariants** that lock the contract with the
//      session-keying tRPC paths (`webapp.agent.session.get`/`upsert`),
//      the conversationId shape (D-95-08), and the G-7 fallback choice
//      (legacy `useAgentSocket` host).
//   2. **Smoke import** of the hook module.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const HOOK_PATH = resolve(__dirname, 'use-webapp-agent.ts')
const HOOK_SRC = readFileSync(HOOK_PATH, 'utf8')

describe('useWebAppAgent — source-text invariants', () => {
	it('reads the persisted session via webapp.agent.session.get (PLAN 95-06 step 1)', () => {
		expect(HOOK_SRC).toMatch(/webapp\.agent\.session\.get\.useQuery/)
	})

	it('persists the runId via webapp.agent.session.upsert (PLAN 95-06 step 4)', () => {
		expect(HOOK_SRC).toMatch(/webapp\.agent\.session\.upsert\.useMutation/)
		// And the upsert path is actually called with {webappId, runId}.
		expect(HOOK_SRC).toMatch(/upsertMutation\.mutate\(/)
		expect(HOOK_SRC).toMatch(/runId:\s*conversationId/)
	})

	it('mints a fresh conversationId of shape webapp:<webappId>:<suffix> (D-95-08)', () => {
		expect(HOOK_SRC).toMatch(/`webapp:\$\{webappId\}:/)
	})

	it('debounces last_seen_idx upserts (PLAN 95-06 step 5 — 500ms)', () => {
		// setTimeout(..., 500) — the debounce delay literal must be present.
		expect(HOOK_SRC).toMatch(/setTimeout\([\s\S]*?,\s*500\s*\)/)
		expect(HOOK_SRC).toMatch(/lastSeenIdx:/)
	})

	it('exposes a startNewSession() that mints a new conversationId (PLAN 95-06 step 7)', () => {
		expect(HOOK_SRC).toMatch(/startNewSession/)
		expect(HOOK_SRC).toMatch(/setFreshConversationId\(makeFreshConversationId\(webappId\)\)/)
		expect(HOOK_SRC).toMatch(/agent\.clearMessages\(\)/)
	})

	it('detects "session ended" when resume runId is gone (PLAN 95-06 step 6)', () => {
		expect(HOOK_SRC).toMatch(/session-ended/)
		// The detection uses the system-role message channel from useAgentSocket.
		expect(HOOK_SRC).toMatch(/run.*not found|run.*expired|run.*gone/)
	})

	it('forwards messages/isStreaming/connectionStatus/agentStatus from the host hook', () => {
		expect(HOOK_SRC).toMatch(/messages:\s*agent\.messages/)
		expect(HOOK_SRC).toMatch(/isStreaming:\s*agent\.isStreaming/)
		expect(HOOK_SRC).toMatch(/connectionStatus:\s*agent\.connectionStatus/)
		expect(HOOK_SRC).toMatch(/agentStatus:\s*agent\.agentStatus/)
	})

	it('uses the legacy useAgentSocket host (G-7 fallback documented at top of file)', () => {
		expect(HOOK_SRC).toMatch(/from\s+['"]@\/hooks\/use-agent-socket['"]/)
		expect(HOOK_SRC).toMatch(/G-7\s+fallback/i)
	})

	it("invalidates session.get after a successful runId upsert", () => {
		expect(HOOK_SRC).toMatch(/utils\.webapp\.agent\.session\.get\.invalidate/)
	})

	it('passes the conversationId through to agent.sendMessage', () => {
		// Signature on `useAgentSocket.sendMessage`:
		//   (prompt, model?, conversationId?, attachments?)
		// Our wrapper must hand convId in the third slot.
		expect(HOOK_SRC).toMatch(/agent\.sendMessage\([^)]*convId[^)]*\)/)
	})
})

describe('useWebAppAgent — smoke import', () => {
	it('exports useWebAppAgent as a function', async () => {
		const mod = await import('./use-webapp-agent')
		expect(typeof mod.useWebAppAgent).toBe('function')
	})
})

// ─────────────────────────────────────────────────────────────────
// Phase 100-10-06 — stopStreaming alias for the chat-response Stop button.
//
// D-100-10-E spec refers to the cancel action as `stopStreaming`. The
// hook already exposes `interrupt` (which calls the real runtime cancel
// in useAgentSocket — sends `{type: 'interrupt'}` over the WS). The
// alias forwards to the SAME `agent.interrupt` reference so the chain
// `useWebAppAgent.stopStreaming → agent.interrupt → ws.send(interrupt)`
// stays a single, real cancel — NOT a no-op.
// ─────────────────────────────────────────────────────────────────

describe('Phase 100-10-06 useWebAppAgent.stopStreaming alias', () => {
	it('T-10-06-HOOK-01: UseWebAppAgentResult interface declares stopStreaming: () => void', () => {
		expect(HOOK_SRC).toMatch(/stopStreaming:\s*\(\)\s*=>\s*void/)
	})

	it('T-10-06-HOOK-02: stopStreaming implementation aliases agent.interrupt (real runtime cancel chain)', () => {
		// The return statement must forward stopStreaming to agent.interrupt
		// (which sends `{type: 'interrupt'}` over the WS — see use-agent-socket.ts).
		// Either `stopStreaming: agent.interrupt` (shorthand) or the legacy
		// pattern `stopStreaming.*=.*interrupt` is accepted by the regex.
		expect(HOOK_SRC).toMatch(/stopStreaming:\s*agent\.interrupt|stopStreaming.*=.*interrupt/)
	})
})
