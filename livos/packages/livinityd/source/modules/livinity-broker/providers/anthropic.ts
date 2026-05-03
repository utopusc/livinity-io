/**
 * Phase 61 Plan 01 (FR-BROKER-D2-01): Anthropic concrete BrokerProvider.
 *
 * Wraps `@anthropic-ai/sdk` calls behind the `BrokerProvider` interface.
 * Both `request` and `streamRequest` use the SDK's `.withResponse()`
 * accessor so the upstream Web Fetch `Headers` instance is reachable for
 * Plan 04 (Wave 4) rate-limit forwarding (FR-BROKER-C3-01/02).
 *
 * Phase 57 inheritance:
 *   - `defaultHeaders: {'anthropic-version': '2023-06-01'}` matches Phase 57's
 *     `passthrough-handler.ts:makeClient` so wire behavior is byte-identical.
 *   - `authToken` (NOT `apiKey`) is the subscription Bearer pattern proven
 *     by Phase 57 Wave 1 Risk-A1 smoke gate.
 *
 * Why `as any` casts on `messages.create({...})`:
 *   The Anthropic SDK request body is a discriminated union over `stream:
 *   true | false`. `ProviderRequestParams` is intentionally loose (forwards
 *   arbitrary client-supplied fields per v30 passthrough goal). Casting to
 *   `any` at the call boundary is the deliberate trade-off — narrower types
 *   would force `ProviderRequestParams` to enumerate every Anthropic field,
 *   defeating the future-proofing.
 */
import Anthropic from '@anthropic-ai/sdk'
import type {
	BrokerProvider,
	ProviderRequestParams,
	ProviderRequestOpts,
	ProviderResponse,
	ProviderStreamEvent,
	ProviderStreamResult,
	UsageRecord,
} from './interface.js'

const ANTHROPIC_VERSION = '2023-06-01'

export class AnthropicProvider implements BrokerProvider {
	readonly name = 'anthropic'

	async request(params: ProviderRequestParams, opts: ProviderRequestOpts): Promise<ProviderResponse> {
		const client = new Anthropic({
			authToken: opts.authToken,
			defaultHeaders: {'anthropic-version': ANTHROPIC_VERSION},
		})
		const requestOpts = opts.signal ? {signal: opts.signal} : undefined
		// `.withResponse()` returns {data, response} where response.headers is
		// the Web Fetch Headers instance — Wave 4 needs this seam.
		const {data, response} = await client.messages
			.create({...params, stream: false} as any, requestOpts)
			.withResponse()
		return {raw: data, upstreamHeaders: response.headers}
	}

	async streamRequest(
		params: ProviderRequestParams,
		opts: ProviderRequestOpts,
	): Promise<ProviderStreamResult> {
		const client = new Anthropic({
			authToken: opts.authToken,
			defaultHeaders: {'anthropic-version': ANTHROPIC_VERSION},
		})
		const requestOpts = opts.signal ? {signal: opts.signal} : undefined
		// On streaming, .withResponse() resolves once headers arrive (BEFORE
		// the iterator is consumed) — Pitfall R5 mitigation. Headers are
		// available in the same call site for Wave 4's setHeader-before-flush.
		const {data, response} = await client.messages
			.create({...params, stream: true} as any, requestOpts)
			.withResponse()
		return {
			stream: data as unknown as AsyncIterable<ProviderStreamEvent>,
			upstreamHeaders: response.headers,
		}
	}

	translateUsage(resp: ProviderResponse): UsageRecord {
		const usage = ((resp.raw as {usage?: {input_tokens?: number; output_tokens?: number}})
			?.usage ?? {}) as {input_tokens?: number; output_tokens?: number}
		const promptTokens = usage.input_tokens ?? 0
		const completionTokens = usage.output_tokens ?? 0
		return {
			promptTokens,
			completionTokens,
			totalTokens: promptTokens + completionTokens,
		}
	}
}
