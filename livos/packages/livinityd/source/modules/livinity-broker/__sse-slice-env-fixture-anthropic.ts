// Phase 74 Plan 01 (F2) — child-process fixture for env-override test (F2-6).
// Anthropic adapter variant. Run with LIV_BROKER_SLICE_DELAY_MS=0 in env.
import {createSseAdapter} from './sse-adapter.js'

class FakeResponse {
	writes: string[] = []
	writableEnded = false
	socket = {setNoDelay: () => {}}
	write(s: string) {
		this.writes.push(s)
		return true
	}
	flush() {}
	end() {
		this.writableEnded = true
	}
	setHeader() {}
	flushHeaders() {}
	asResponse(): any {
		return this
	}
}

const fake = new FakeResponse()
const adapter = createSseAdapter({model: 'm', res: fake.asResponse()})
await adapter.onAgentEvent({type: 'thinking', turn: 1} as any)
const text = 'a'.repeat(200)
const t0 = Date.now()
await adapter.onAgentEvent({type: 'chunk', turn: 1, data: text} as any)
const elapsed = Date.now() - t0
console.log(`ELAPSED=${elapsed}`)
