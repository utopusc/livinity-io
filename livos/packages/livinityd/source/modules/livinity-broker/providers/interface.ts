/**
 * Phase 61 Plan 01 (FR-BROKER-D2-01): Pluggable broker provider interface.
 *
 * The `BrokerProvider` contract is the seam through which all upstream LLM
 * SDK calls dispatch. Phase 61 Plan 01 ships ONE concrete implementation
 * (`AnthropicProvider`); Plan 02 (Wave 2) appends OpenAI/Gemini/Mistral
 * stubs that compile + throw `NotImplementedError`. Plan 04 (Wave 4) reads
 * `ProviderResponse.upstreamHeaders` / `ProviderStreamResult.upstreamHeaders`
 * to forward Anthropic rate-limit headers (FR-BROKER-C3-01/02).
 *
 * Design notes:
 *   - `ProviderRequestParams` is intentionally non-strict (`[key: string]:
 *     unknown`) — v30 forwards the client request body verbatim from the
 *     already-validated Phase 57 path. A generic-typed params shape would
 *     over-constrain the future-fields passthrough this milestone targets.
 *   - `ProviderResponse.raw` is `unknown` — provider-native body (Anthropic
 *     Messages JSON for AnthropicProvider). Callers (`passthrough-handler.ts`)
 *     pass it directly to `res.json(...)`; no Phase 61 plan re-shapes it.
 *   - `ProviderStreamEvent` re-exports the Anthropic SDK's
 *     `RawMessageStreamEvent`. This keeps consumers of the provider interface
 *     dependency-pure (no need to import from `@anthropic-ai/sdk` in caller
 *     code; the type-only import below is contained to this single file).
 *   - `upstreamHeaders` is the Web Fetch `Headers` instance returned by the
 *     SDK's `.withResponse()` accessor. For streaming, Anthropic SDK v0.80+
 *     resolves `.withResponse()` once headers arrive (BEFORE the body's
 *     async iterator is exhausted), which is what Wave 4's
 *     `forwardAnthropicHeaders(...)` needs to insert headers BEFORE
 *     `res.flushHeaders()` (Pitfall 1 / Pitfall R9).
 *   - `NotImplementedError` is shipped here so Plan 02 stubs can `throw new
 *     NotImplementedError('openai')` without a separate error file.
 */
import type {RawMessageStreamEvent} from '@anthropic-ai/sdk/resources/messages.mjs'

/**
 * Inbound request shape — already alias-resolved by callers in Plan 03 (Wave
 * 3 alias-resolver). v30 keeps this loose to forward arbitrary future
 * Anthropic Messages fields verbatim.
 */
export type ProviderRequestParams = {
	model: string
	messages: Array<{role: string; content: unknown}>
	system?: string | unknown[]
	tools?: unknown[]
	max_tokens: number
	temperature?: number
	// Extension point — future Anthropic Messages fields (top_p, top_k,
	// stop_sequences, metadata, ...) flow through unchanged.
	[key: string]: unknown
}

/**
 * Per-call options the provider needs but that don't belong in the wire body.
 *   - `authToken`: per-user OAuth subscription accessToken (`sk-ant-oat01-*`).
 *     The SDK builds `Authorization: Bearer <token>` automatically when this
 *     is set on the client constructor.
 *   - `signal`: optional AbortSignal — provider forwards to SDK so client
 *     disconnects propagate upstream.
 */
export type ProviderRequestOpts = {
	authToken: string
	signal?: AbortSignal
}

/**
 * Synchronous response shape.
 *   - `raw` is the provider-native parsed body. For AnthropicProvider this is
 *     the Messages JSON; the broker's sync path passes it directly to
 *     `res.json(...)`.
 *   - `upstreamHeaders` is the Fetch `Headers` instance from the upstream
 *     HTTP response. Wave 4 reads `anthropic-ratelimit-*` + `retry-after`
 *     from this and forwards / translates to the broker response.
 */
export type ProviderResponse = {
	raw: unknown
	upstreamHeaders: Headers
}

/**
 * Anthropic SDK's RawMessageStreamEvent re-exported under a provider-neutral
 * name. Future providers (OpenAI/Gemini/Mistral) would shape their own
 * native event into this same alias if/when they ship concrete impls.
 */
export type ProviderStreamEvent = RawMessageStreamEvent

/**
 * Streaming response shape — `stream` is the AsyncIterable of provider events
 * (consumed once); `upstreamHeaders` is populated BEFORE iteration begins
 * and remains the same instance regardless of stream consumption (Wave 4
 * must read it then call `res.setHeader()` before `res.flushHeaders()` —
 * Pitfall 1).
 */
export type ProviderStreamResult = {
	stream: AsyncIterable<ProviderStreamEvent>
	upstreamHeaders: Headers
}

/**
 * Canonical usage record — provider-agnostic shape Phase 62 (E1 usage tracking)
 * persists. Each concrete provider's `translateUsage` maps native usage
 * fields into these three canonical numbers.
 */
export type UsageRecord = {
	promptTokens: number
	completionTokens: number
	totalTokens: number
}

/**
 * The pluggable contract. Plan 01 ships only `AnthropicProvider`; Plan 02
 * ships stubs (which throw `NotImplementedError` on every method).
 *
 * Phase 61 broker dispatch is hardcoded to `getProvider('anthropic')` — no
 * model-prefix-based routing in v30 (that defers to v30+). The interface
 * exists now so future drop-ins are pure additions to `registry.ts`.
 */
export interface BrokerProvider {
	readonly name: string
	request(params: ProviderRequestParams, opts: ProviderRequestOpts): Promise<ProviderResponse>
	streamRequest(
		params: ProviderRequestParams,
		opts: ProviderRequestOpts,
	): Promise<ProviderStreamResult>
	translateUsage(response: ProviderResponse): UsageRecord
}

/**
 * Thrown by stub providers (OpenAI/Gemini/Mistral in Plan 02) when their
 * methods are invoked. v30 broker should NEVER reach these (router dispatch
 * is hardcoded to 'anthropic'); the throw is defense-in-depth so a future
 * routing bug surfaces loudly instead of silently dispatching to an unwritten
 * provider.
 */
export class NotImplementedError extends Error {
	constructor(provider: string) {
		super(`Provider '${provider}' not implemented in v30`)
		this.name = 'NotImplementedError'
	}
}
