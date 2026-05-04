// Phase 74 Plan 01 (F2) — child-process fixture for env-override test (F2-6).
// Run with LIV_BROKER_SLICE_DELAY_MS=0 in env to verify cadence-skip behaviour.
// Prints `ELAPSED=<ms>` then exits.
import {createOpenAISseAdapter} from './openai-sse-adapter.js'

let buf = ''
const res: any = {
	writableEnded: false,
	write(chunk: string) {
		buf += chunk
		return true
	},
	flush() {},
}

const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
const text = 'a'.repeat(200)
const t0 = Date.now()
await adapter.onAgentEvent({type: 'chunk', data: text} as any)
const elapsed = Date.now() - t0
console.log(`ELAPSED=${elapsed}`)
// Reference buf to keep tsc happy without an unused-variable error
if (buf.length === -1) console.log('unreachable')
