/**
 * Phase 200-04 — `/` slash command adapter tests.
 *
 * Pins the contract of `buildLivAiSlashCommands(runtime)` (the pure
 * factory used by `useLivAiSlashAdapter`) and the `LIV_AI_SLASH_COMMANDS`
 * id-list constant (D-200-10, D-200-11, INV-200-06):
 *
 *   1. LIV_AI_SLASH_COMMANDS exposes exactly the 4 Phase 198-06 ids
 *      (help, clear, screenshot, search) in the locked order.
 *   2. /clear execute callback invokes runtime.threads.switchToNewThread()
 *      (D-200-11 — canonical runtime-sync path; same call the New
 *      Conversation button fix uses in Plan 200-07).
 *   3. /help text-command execute callback invokes
 *      composer.setText(transformedPrompt) + composer.send() with the
 *      Phase 198-06 SLASH_COMMANDS transform() output.
 *   4. /search no-arg execute callback invokes setText + send with the
 *      Phase 198-06 fallback "What would you like to search the web for?"
 *      prompt (defense against regression in SLASH_COMMANDS transform).
 *
 * The hook itself (useLivAiSlashAdapter) wraps
 * `unstable_useSlashCommandAdapter({commands, removeOnExecute: true})`
 * which requires AssistantRuntime context to render. To keep this unit
 * test runtime-free we exercise the SAME `buildLivAiSlashCommands`
 * factory the hook composes — a pure (runtime) → Unstable_SlashCommand[]
 * function. Pattern matches Plan 200-03's catalog-level test approach
 * (mention-adapter.test.ts); composer-level integration is Plan 200-05's
 * gate.
 */

import {beforeEach, describe, expect, it, vi} from 'vitest'

import {buildLivAiSlashCommands, LIV_AI_SLASH_COMMANDS} from './slash-adapter'

const switchToNewThread = vi.fn(() => Promise.resolve())
const setText = vi.fn()
const send = vi.fn()

const fakeRuntime = {
	threads: {switchToNewThread},
	thread: {composer: {setText, send}},
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

beforeEach(() => {
	switchToNewThread.mockClear()
	setText.mockClear()
	send.mockClear()
})

describe('LIV_AI_SLASH_COMMANDS (INV-200-06)', () => {
	it('exposes exactly the 4 Phase 198-06 ids in the locked order', () => {
		expect(LIV_AI_SLASH_COMMANDS).toEqual([
			'help',
			'clear',
			'screenshot',
			'search',
		])
	})
})

describe('buildLivAiSlashCommands (factory)', () => {
	it('returns exactly 4 Unstable_SlashCommand entries (one per Phase 198-06 trigger)', () => {
		const commands = buildLivAiSlashCommands(fakeRuntime)
		expect(commands).toHaveLength(4)
		expect(commands.map((c) => c.id)).toEqual([
			'help',
			'clear',
			'screenshot',
			'search',
		])
	})

	it('/clear execute invokes runtime.threads.switchToNewThread (D-200-11)', () => {
		const commands = buildLivAiSlashCommands(fakeRuntime)
		const clear = commands.find((c) => c.id === 'clear')
		expect(clear).toBeDefined()
		clear!.execute()
		expect(switchToNewThread).toHaveBeenCalledOnce()
		// /clear MUST NOT route through the composer — no setText/send.
		expect(setText).not.toHaveBeenCalled()
		expect(send).not.toHaveBeenCalled()
	})

	it('/help execute invokes composer.setText(transformedPrompt) + composer.send()', () => {
		const commands = buildLivAiSlashCommands(fakeRuntime)
		const help = commands.find((c) => c.id === 'help')
		expect(help).toBeDefined()
		help!.execute()
		expect(setText).toHaveBeenCalledOnce()
		const arg = setText.mock.calls[0][0] as string
		// Phase 198-06 transform output for /help — pin the canonical prompt.
		expect(arg).toMatch(/tools|what can you do/i)
		expect(send).toHaveBeenCalledOnce()
		// /help MUST NOT switch threads.
		expect(switchToNewThread).not.toHaveBeenCalled()
	})

	it('/search no-arg execute uses the Phase 198-06 fallback clarifying prompt', () => {
		const commands = buildLivAiSlashCommands(fakeRuntime)
		const search = commands.find((c) => c.id === 'search')
		expect(search).toBeDefined()
		search!.execute()
		expect(setText).toHaveBeenCalledOnce()
		const arg = setText.mock.calls[0][0] as string
		expect(arg.length).toBeGreaterThan(0)
		// Phase 198-06 fallback is "What would you like to search the web for?"
		expect(arg).toMatch(/search/i)
		expect(send).toHaveBeenCalledOnce()
	})
})
