import assert from 'node:assert/strict'
import {
	resolveModelAlias,
	translateOpenAIChatToSdkArgs,
	buildSyncOpenAIResponse,
} from './openai-translator.js'
import {_resetAliasCacheForTest} from './alias-resolver.js'
import {DEFAULT_ALIASES} from './seed-default-aliases.js'
import type {AgentResult} from '@liv/core'

// Phase 61 Plan 03 — `resolveModelAlias` is now async + Redis-backed (re-exported
// from openai-translator.js for backward-compat with existing imports). The
// canonical exhaustive resolver coverage lives in __tests__/alias-resolver.test.ts;
// the block below is a slim smoke test that the re-export shim works AND that
// the post-Plan-03 default-alias semantics still hit the same Claude family.
function makeFakeRedisWithDefaults(): {get(k: string): Promise<string | null>} {
	const store = new Map<string, string>()
	for (const [alias, target] of Object.entries(DEFAULT_ALIASES)) {
		store.set(`livinity:broker:alias:${alias}`, target)
	}
	return {async get(k: string) { return store.has(k) ? store.get(k)! : null }}
}

function ok(label: string) {
	console.log(`  PASS ${label}`)
}

function makeResult(overrides: Partial<AgentResult> = {}): AgentResult {
	return {
		success: true,
		answer: 'ok',
		turns: 1,
		totalInputTokens: 10,
		totalOutputTokens: 20,
		toolCalls: [],
		stoppedReason: 'complete',
		...overrides,
	}
}

async function runTests() {
	// --- resolveModelAlias (Phase 61 Plan 03 — re-exported async shim) ---
	// Reset the resolver's in-memory TTL cache between blocks so each block
	// starts from a clean slate (otherwise a stale entry from a prior block
	// could mask a regression in the new lookup path).
	{
		_resetAliasCacheForTest()
		const redis = makeFakeRedisWithDefaults()
		// All gpt-* names that ARE in DEFAULT_ALIASES resolve via Redis hit.
		// Plan-author override per RESEARCH.md A2: gpt-4 / gpt-4o → Sonnet
		// (NOT Opus per CONTEXT.md), preserving existing v29.3 behaviour.
		for (const m of ['gpt-4', 'gpt-4o', 'gpt-3.5-turbo']) {
			const r = await resolveModelAlias(redis, m)
			assert.equal(r.warn, false, `${m} → no warn (seeded)`)
			assert.ok(
				r.actualModel.startsWith('claude-'),
				`${m} → resolves to a real Claude model (got ${r.actualModel})`,
			)
		}
		ok('Test 1: seeded gpt-* aliases resolve via Redis without warn')
	}
	{
		_resetAliasCacheForTest()
		const redis = makeFakeRedisWithDefaults()
		// claude-* prefix passthrough — verbatim, no warn (resolver step 3).
		// This is the new "trust the caller knows the model ID" semantic.
		for (const m of ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001']) {
			const r = await resolveModelAlias(redis, m)
			assert.equal(r.actualModel, m, `${m} → verbatim passthrough`)
			assert.equal(r.warn, false)
		}
		ok('Test 2: claude-* prefix passes through verbatim, no warn')
	}
	{
		_resetAliasCacheForTest()
		const redis = makeFakeRedisWithDefaults()
		// Friendly short aliases hit Redis (seeded with DEFAULT_ALIASES).
		assert.equal((await resolveModelAlias(redis, 'opus')).actualModel, 'claude-opus-4-7')
		assert.equal((await resolveModelAlias(redis, 'sonnet')).actualModel, 'claude-sonnet-4-6')
		assert.equal(
			(await resolveModelAlias(redis, 'haiku')).actualModel,
			'claude-haiku-4-5-20251001',
		)
		ok('Test 3: friendly aliases opus/sonnet/haiku → seeded Claude family ID')
	}
	{
		_resetAliasCacheForTest()
		const redis = makeFakeRedisWithDefaults()
		// Legacy claude-3-* aliases — seeded in DEFAULT_ALIASES.
		assert.equal(
			(await resolveModelAlias(redis, 'claude-3-opus')).actualModel,
			'claude-opus-4-7',
		)
		assert.equal(
			(await resolveModelAlias(redis, 'claude-3-sonnet')).actualModel,
			'claude-sonnet-4-6',
		)
		assert.equal(
			(await resolveModelAlias(redis, 'claude-3-haiku')).actualModel,
			'claude-haiku-4-5-20251001',
		)
		ok('Test 4: legacy claude-3-* aliases resolve via Redis seed')
	}
	{
		_resetAliasCacheForTest()
		const redis = makeFakeRedisWithDefaults()
		// Unknown alias → warn + falls through to default (Sonnet).
		const r = await resolveModelAlias(redis, 'foobar-llm-9000')
		assert.equal(r.actualModel, 'claude-sonnet-4-6')
		assert.equal(r.warn, true, 'unknown model → warn=true')
		ok('Test 5: unknown → default fallback (claude-sonnet-4-6) + warn=true')
	}

	// --- translateOpenAIChatToSdkArgs ---
	{
		const r = translateOpenAIChatToSdkArgs({
			model: 'gpt-4',
			messages: [{role: 'user', content: 'hi'}],
		})
		assert.equal(r.task, 'hi')
		assert.equal(r.contextPrefix, undefined)
		// Phase 43.8: empty-string passthrough (was undefined). See
		// translate-request.test.ts comment for full rationale.
		assert.equal(r.systemPromptOverride, '')
		ok('Test 6: single user msg → task only')
	}
	{
		const r = translateOpenAIChatToSdkArgs({
			model: 'gpt-4',
			messages: [
				{role: 'user', content: 'first'},
				{role: 'assistant', content: 'reply'},
				{role: 'user', content: 'second'},
			],
		})
		assert.equal(r.task, 'second')
		assert.match(r.contextPrefix || '', /Previous conversation:\nUser: first\n\nAssistant: reply/)
		ok('Test 7: multi-turn → task=latest, contextPrefix=prior')
	}
	{
		const r = translateOpenAIChatToSdkArgs({
			model: 'gpt-4',
			messages: [
				{role: 'system', content: 'you are helpful'},
				{role: 'user', content: 'hi'},
			],
		})
		assert.equal(r.systemPromptOverride, 'you are helpful')
		ok('Test 8: system message → systemPromptOverride')
	}
	{
		const r = translateOpenAIChatToSdkArgs({
			model: 'gpt-4',
			messages: [
				{role: 'system', content: 'first'},
				{role: 'system', content: 'second'},
				{role: 'user', content: 'hi'},
			],
		})
		assert.equal(r.systemPromptOverride, 'first\nsecond')
		ok('Test 9: multiple system messages → \\n-joined')
	}
	{
		const r = translateOpenAIChatToSdkArgs({
			model: 'gpt-4',
			messages: [
				{role: 'user', content: [{type: 'text', text: 'a'}, {type: 'text', text: 'b'}]},
			],
		})
		assert.equal(r.task, 'a\nb')
		ok('Test 10: text-block array → \\n-joined')
	}
	{
		assert.throws(
			() =>
				translateOpenAIChatToSdkArgs({
					model: 'gpt-4',
					messages: [{role: 'assistant', content: 'no user'}],
				}),
			/no user message/,
		)
		ok('Test 11: no user message → throws')
	}
	{
		assert.throws(
			() => translateOpenAIChatToSdkArgs({model: 'gpt-4', messages: []}),
			/non-empty array/,
		)
		ok('Test 12: empty messages → throws')
	}
	{
		const r = translateOpenAIChatToSdkArgs({
			model: 'gpt-4',
			messages: [
				{role: 'user', content: 'hi'},
				{role: 'tool', content: 'tool result'},
				{role: 'function', content: 'fn result'},
				{role: 'user', content: 'follow-up'},
			] as any,
		})
		assert.equal(r.task, 'follow-up', 'tool/function roles skipped, latest USER becomes task')
		ok('Test 13: tool/function roles skipped without crash')
	}

	// --- buildSyncOpenAIResponse ---
	{
		const r = buildSyncOpenAIResponse({
			requestedModel: 'gpt-4',
			bufferedText: 'Hello',
			result: makeResult({stoppedReason: 'complete', totalInputTokens: 5, totalOutputTokens: 7}),
		})
		assert.match(r.id, /^chatcmpl-/)
		assert.equal(r.object, 'chat.completion')
		assert.equal(typeof r.created, 'number')
		assert.ok(r.created > 1700000000, 'created looks like unix seconds')
		assert.equal(r.model, 'gpt-4', 'echoes caller-requested model, not actualModel')
		assert.equal(r.choices[0]?.message.content, 'Hello')
		assert.equal(r.choices[0]?.finish_reason, 'stop')
		assert.equal(r.usage.prompt_tokens, 5)
		assert.equal(r.usage.completion_tokens, 7)
		assert.equal(r.usage.total_tokens, 12)
		ok('Test 14: sync response shape (id, object, model echo, finish=stop)')
	}
	{
		const r1 = buildSyncOpenAIResponse({
			requestedModel: 'gpt-4',
			bufferedText: '',
			result: makeResult({stoppedReason: 'max_turns'}),
		})
		assert.equal(r1.choices[0]?.finish_reason, 'length')
		const r2 = buildSyncOpenAIResponse({
			requestedModel: 'gpt-4',
			bufferedText: '',
			result: makeResult({stoppedReason: 'max_tokens'}),
		})
		assert.equal(r2.choices[0]?.finish_reason, 'length')
		ok('Test 15: max_turns AND max_tokens → finish_reason=length')
	}
	{
		const r = buildSyncOpenAIResponse({
			requestedModel: 'gpt-4',
			bufferedText: '',
			result: makeResult({totalInputTokens: 100, totalOutputTokens: 250}),
		})
		assert.equal(r.usage.total_tokens, 350)
		ok('Test 16: usage.total_tokens = prompt + completion')
	}

	console.log('\nAll openai-translator.test.ts tests passed (16/16)')
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})

// ===== Phase 57 Wave 3: vitest blocks for the new passthrough translation helpers =====
// These exist alongside the legacy node-script style runTests() above so both
// invocation styles (node script + vitest) report the same suite. The vitest
// blocks below cover translateToolsToAnthropic + translateToolUseToOpenAI which
// are NEW exports for passthrough mode.

import {describe, it, expect} from 'vitest'
import {translateToolsToAnthropic, translateToolUseToOpenAI} from './openai-translator.js'

describe('translateToolsToAnthropic (Phase 57 passthrough)', () => {
	it('translates no-params tool', () => {
		const result = translateToolsToAnthropic([
			{
				type: 'function',
				function: {name: 'ping', description: 'Pings', parameters: {type: 'object', properties: {}}},
			},
		])
		expect(result).toEqual([
			{name: 'ping', description: 'Pings', input_schema: {type: 'object', properties: {}}},
		])
	})

	it('translates simple-params tool', () => {
		const result = translateToolsToAnthropic([
			{
				type: 'function',
				function: {
					name: 'calculator',
					description: 'Adds two numbers',
					parameters: {
						type: 'object',
						properties: {a: {type: 'number'}, b: {type: 'number'}},
						required: ['a', 'b'],
					},
				},
			},
		])
		expect(result[0]?.name).toBe('calculator')
		expect(result[0]?.input_schema).toMatchObject({type: 'object', required: ['a', 'b']})
	})

	it('translates enum-params tool', () => {
		const result = translateToolsToAnthropic([
			{
				type: 'function',
				function: {
					name: 'set_color',
					parameters: {
						type: 'object',
						properties: {color: {type: 'string', enum: ['red', 'green', 'blue']}},
					},
				},
			},
		])
		expect((result[0]?.input_schema as any).properties.color.enum).toEqual([
			'red',
			'green',
			'blue',
		])
	})

	it('translates nested-object-params tool', () => {
		const result = translateToolsToAnthropic([
			{
				type: 'function',
				function: {
					name: 'create_user',
					parameters: {
						type: 'object',
						properties: {
							user: {
								type: 'object',
								properties: {name: {type: 'string'}, age: {type: 'integer'}},
							},
						},
					},
				},
			},
		])
		expect((result[0]?.input_schema as any).properties.user.type).toBe('object')
		expect((result[0]?.input_schema as any).properties.user.properties.age.type).toBe('integer')
	})

	it('translates array-params tool', () => {
		const result = translateToolsToAnthropic([
			{
				type: 'function',
				function: {
					name: 'sum_list',
					parameters: {type: 'object', properties: {numbers: {type: 'array', items: {type: 'number'}}}},
				},
			},
		])
		expect((result[0]?.input_schema as any).properties.numbers.type).toBe('array')
		expect((result[0]?.input_schema as any).properties.numbers.items.type).toBe('number')
	})

	it('throws on unsupported tool type', () => {
		expect(() =>
			translateToolsToAnthropic([{type: 'web_search', function: {name: 'x'}} as any]),
		).toThrow('unsupported tool type')
	})

	it('throws when function.name is missing', () => {
		expect(() => translateToolsToAnthropic([{type: 'function', function: {} as any}])).toThrow(
			'tool.function.name is required',
		)
	})
})

describe('translateToolUseToOpenAI (Phase 57 passthrough)', () => {
	it('translates text-only response to content with no tool_calls', () => {
		const result = translateToolUseToOpenAI([{type: 'text', text: 'Hello world'}])
		expect(result).toEqual({role: 'assistant', content: 'Hello world'})
	})

	it('aggregates multi-text blocks into single content string', () => {
		const result = translateToolUseToOpenAI([
			{type: 'text', text: 'Hello '},
			{type: 'text', text: 'world'},
		])
		expect(result.content).toBe('Hello world')
	})

	it('translates tool_use block to tool_calls with JSON-stringified arguments', () => {
		const result = translateToolUseToOpenAI([
			{type: 'tool_use', id: 'toolu_123', name: 'calculator', input: {a: 2, b: 3}},
		])
		expect(result.content).toBeNull()
		expect(result.tool_calls).toHaveLength(1)
		expect(result.tool_calls![0]).toEqual({
			id: 'toolu_123',
			type: 'function',
			function: {name: 'calculator', arguments: '{"a":2,"b":3}'},
		})
	})

	it('translates mixed text + tool_use response', () => {
		const result = translateToolUseToOpenAI([
			{type: 'text', text: 'Calling calculator: '},
			{type: 'tool_use', id: 'toolu_xyz', name: 'calculator', input: {a: 1, b: 2}},
		])
		expect(result.content).toBe('Calling calculator: ')
		expect(result.tool_calls).toHaveLength(1)
	})
})
