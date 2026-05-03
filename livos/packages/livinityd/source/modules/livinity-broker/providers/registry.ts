/**
 * Phase 61 Plan 01 (FR-BROKER-D2-02): Provider registry.
 *
 * `providers` is a module-scope `Map<string, BrokerProvider>` keyed by
 * provider name. Plan 01 (Wave 1) seeds ONE entry — `'anthropic' → new
 * AnthropicProvider()`. Plan 02 (Wave 2) appends `'openai' / 'gemini' /
 * 'mistral'` stub entries.
 *
 * `getProvider(name)` is the lookup helper used by `passthrough-handler.ts`.
 * Phase 61 broker dispatch is hardcoded `getProvider('anthropic')` — no
 * model-prefix-based routing in v30. A grep-guard test (Plan 02) asserts
 * no production code calls `getProvider('openai'|'gemini'|'mistral')`.
 *
 * Threat T-61-01 (registry tampering): Map is a module-scope const; no
 * external mutation surface; instances are constructed once at module load.
 */
import type {BrokerProvider} from './interface.js'
import {AnthropicProvider} from './anthropic.js'

export const providers = new Map<string, BrokerProvider>([
	['anthropic', new AnthropicProvider()],
])

export function getProvider(name: string): BrokerProvider {
	const p = providers.get(name)
	if (!p) throw new Error(`Unknown provider: ${name}`)
	return p
}
