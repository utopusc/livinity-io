import assert from 'node:assert/strict'
import {translateAnthropicMessagesToSdkArgs} from './translate-request.js'

async function runTests() {
	// Test 1: single user message
	const r1 = translateAnthropicMessagesToSdkArgs({
		model: 'x',
		messages: [{role: 'user', content: 'hello'}],
	})
	assert.equal(r1.task, 'hello')
	assert.equal(r1.contextPrefix, undefined)
	// Phase 43.8: when caller doesn't supply a system prompt, broker emits
	// '' (passthrough) so SdkAgentRunner '??' fallback skips the Nexus
	// agent default. Previous behavior (undefined) injected Nexus identity.
	assert.equal(r1.systemPromptOverride, '')
	console.log('  PASS Test 1: single user message')

	// Test 2: multi-turn (3 messages: user → assistant → user)
	const r2 = translateAnthropicMessagesToSdkArgs({
		model: 'x',
		messages: [
			{role: 'user', content: 'msg1'},
			{role: 'assistant', content: 'reply1'},
			{role: 'user', content: 'msg2'},
		],
	})
	assert.equal(r2.task, 'msg2')
	assert.match(r2.contextPrefix || '', /User: msg1[\s\S]*Assistant: reply1/)
	console.log('  PASS Test 2: multi-turn translation')

	// Test 3: system prompt as string
	const r3 = translateAnthropicMessagesToSdkArgs({
		model: 'x',
		system: 'you are helpful',
		messages: [{role: 'user', content: 'hi'}],
	})
	assert.equal(r3.systemPromptOverride, 'you are helpful')
	console.log('  PASS Test 3: system prompt as string')

	// Test 4: system prompt as content-block array (joined text)
	const r4 = translateAnthropicMessagesToSdkArgs({
		model: 'x',
		system: [
			{type: 'text', text: 'block one'},
			{type: 'text', text: 'block two'},
		],
		messages: [{role: 'user', content: 'hi'}],
	})
	assert.equal(r4.systemPromptOverride, 'block one\nblock two')
	console.log('  PASS Test 4: system prompt as content-block array')

	// Test 5: content as content-block array → text extracted
	const r5 = translateAnthropicMessagesToSdkArgs({
		model: 'x',
		messages: [
			{
				role: 'user',
				content: [
					{type: 'text', text: 'part1'},
					{type: 'text', text: 'part2'},
				],
			},
		],
	})
	assert.equal(r5.task, 'part1\npart2')
	console.log('  PASS Test 5: content as text-block array')

	// Test 6: empty messages array → throws
	assert.throws(() => translateAnthropicMessagesToSdkArgs({model: 'x', messages: []}), /non-empty array/)
	console.log('  PASS Test 6: empty messages array throws')

	// Test 7: no user message in array → throws
	assert.throws(
		() =>
			translateAnthropicMessagesToSdkArgs({
				model: 'x',
				messages: [{role: 'assistant', content: 'orphan'}],
			}),
		/no user message/,
	)
	console.log('  PASS Test 7: no user message throws')

	// Test 8: invalid content shape → throws
	assert.throws(
		() =>
			translateAnthropicMessagesToSdkArgs({
				model: 'x',
				messages: [{role: 'user', content: 42 as any}],
			}),
		/string or text-block array/,
	)
	console.log('  PASS Test 8: invalid content shape throws')

	console.log('\nAll translate-request.test.ts tests passed (8/8)')
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})
