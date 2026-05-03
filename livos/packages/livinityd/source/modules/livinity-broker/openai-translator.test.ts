import assert from 'node:assert/strict'
import {
	resolveModelAlias,
	translateOpenAIChatToSdkArgs,
	buildSyncOpenAIResponse,
} from './openai-translator.js'
import type {AgentResult} from '@nexus/core'

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
	// --- resolveModelAlias ---
	{
		for (const m of ['gpt-4', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-5']) {
			const r = resolveModelAlias(m)
			assert.equal(r.actualModel, 'claude-sonnet-4-6', `${m} → claude-sonnet-4-6`)
			assert.equal(r.warn, false, `${m} → no warn`)
		}
		ok('Test 1: gpt-* → claude-sonnet-4-6, no warn')
	}
	{
		for (const m of ['claude-sonnet-4-6', 'claude-sonnet-3-5']) {
			const r = resolveModelAlias(m)
			assert.equal(r.actualModel, 'claude-sonnet-4-6')
			assert.equal(r.warn, false)
		}
		ok('Test 2: claude-sonnet* → claude-sonnet-4-6')
	}
	{
		// Phase 42.2: claude-opus* → latest 4-7 (was 4-6)
		for (const m of ['claude-opus', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-opus-x']) {
			const r = resolveModelAlias(m)
			assert.equal(r.actualModel, 'claude-opus-4-7', `${m} → claude-opus-4-7`)
			assert.equal(r.warn, false)
		}
		ok('Test 3: claude-opus* → claude-opus-4-7 (Phase 42.2)')
	}
	{
		for (const m of ['claude-haiku', 'claude-haiku-4-5']) {
			const r = resolveModelAlias(m)
			assert.equal(r.actualModel, 'claude-haiku-4-5')
			assert.equal(r.warn, false)
		}
		ok('Test 4: claude-haiku* → claude-haiku-4-5')
	}
	{
		// Phase 42.2: friendly short aliases
		assert.equal(resolveModelAlias('opus').actualModel, 'claude-opus-4-7')
		assert.equal(resolveModelAlias('sonnet').actualModel, 'claude-sonnet-4-6')
		assert.equal(resolveModelAlias('haiku').actualModel, 'claude-haiku-4-5')
		assert.equal(resolveModelAlias('opus').warn, false)
		assert.equal(resolveModelAlias('sonnet').warn, false)
		assert.equal(resolveModelAlias('haiku').warn, false)
		ok('Test 4b: friendly aliases opus/sonnet/haiku → latest of each tier (Phase 42.2)')
	}
	{
		// Phase 42.2: legacy claude-3-* family → modern equivalent
		assert.equal(resolveModelAlias('claude-3-5-sonnet').actualModel, 'claude-sonnet-4-6')
		assert.equal(resolveModelAlias('claude-3-opus-20240229').actualModel, 'claude-opus-4-7')
		assert.equal(resolveModelAlias('claude-3-haiku-20240307').actualModel, 'claude-haiku-4-5')
		ok('Test 4c: legacy claude-3-* → modern 4.X equivalent (Phase 42.2)')
	}
	{
		const r = resolveModelAlias('foobar-llm-9000')
		assert.equal(r.actualModel, 'claude-sonnet-4-6')
		assert.equal(r.warn, true, 'unknown model → warn=true')
		ok('Test 5: unknown → claude-sonnet-4-6 + warn=true')
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
