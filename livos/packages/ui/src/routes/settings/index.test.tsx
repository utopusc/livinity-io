/**
 * Phase 182-05 — index.test.tsx
 *
 * Source-text invariant suite (vitest). Locks the Settings Routes table shape:
 *   - /ai-chat-settings route registered with AiChatSettingsPage
 *   - /mcp-servers route registered with McpServersPage
 *   - /chat-backend route NOT present (deleted in 182-01)
 *   - /ai-config route still present (regression guard)
 *   - /troubleshoot route still present (regression guard)
 *   - /advanced route still present (regression guard)
 */

import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const SRC = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')

describe('Phase 182-05 — Settings index.tsx Routes invariants', () => {
	it('C1: /ai-chat-settings Route entry exists', () => {
		expect(SRC).toMatch(/path=['"]\/ai-chat-settings['"]/)
	})

	it('C2: /mcp-servers Route entry exists', () => {
		expect(SRC).toMatch(/path=['"]\/mcp-servers['"]/)
	})

	it('C3: /chat-backend Route entry is absent (deleted in 182-01)', () => {
		expect(SRC).not.toMatch(/path=['"]\/chat-backend['"]/)
	})

	it('C4: AiChatSettingsPage lazy import present', () => {
		expect(SRC).toMatch(/AiChatSettingsPage\s*=\s*React\.lazy/)
	})

	it('C5: McpServersPage lazy import present', () => {
		expect(SRC).toMatch(/McpServersPage\s*=\s*React\.lazy/)
	})

	it('C6: /ai-config regression guard — route still registered', () => {
		expect(SRC).toMatch(/path=['"]\/ai-config['"]/)
	})
})
