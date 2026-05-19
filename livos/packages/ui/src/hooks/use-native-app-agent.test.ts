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
