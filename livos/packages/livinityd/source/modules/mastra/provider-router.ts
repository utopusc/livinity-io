/**
 * Phase 197-01 — Provider Router.
 *
 * Reads `liv:config:active_provider` from Redis and returns a Mastra
 * language-model handle bound to the resolved provider. For provider='xai'
 * (the only branch wired in Plan 197-01), every model call carries a FRESH
 * OAuth access token pulled via deps.xaiCreds.getToken() through the
 * @ai-sdk/xai fetch middleware — fresh-OAuth-per-request only.
 *
 * Threat mitigations honoured:
 *   T-197-01-01 (I): the wrapped fetch never logs init.headers / init.body /
 *     token values. On transport error, error message is scrubbed of any
 *     literal `Bearer ` substring before re-throw.
 *   T-197-01-02 (S): NO static-env-key path anywhere in this file (the
 *     env-var alternative is explicitly forbidden by the threat model).
 *   T-197-01-03 (T): Redis value validated against ALLOWED_PROVIDERS allow-list;
 *     unknown strings fall through to the safe 'xai' default branch.
 */

import {createXai} from '@ai-sdk/xai'

import type {XaiCredentialsService} from '../xai-credentials/credentials-service.js'
import {ProviderNotConfiguredError} from './errors.js'

const ALLOWED_PROVIDERS = ['xai', 'claude', 'openai'] as const
type ProviderId = (typeof ALLOWED_PROVIDERS)[number]

/**
 * Phase 199-02 — Locked Grok 4 model id allow-list (D-199-06).
 *
 * Backs the static catalogue surfaced by `mastra.agent.listAvailableModels`
 * (Plan 199-02 tRPC procedure) AND the per-request dynamic-model dispatch
 * via `resolveAgentModel(modelId)` (Plan 199-03). Any model id outside
 * this tuple is rejected by `coerceModel()` and falls through to
 * `XAI_DEFAULT_MODEL_ID` (D-199-24 — soft validation, never 400s).
 *
 * Source-of-truth lives in this file — the UI registry at
 * livos/packages/ui/src/features/liv-ai/models.ts (NEW Plan 199-04) hydrates
 * from `mastra.agent.listAvailableModels.query` at mount; the literal there
 * is a fallback for offline render + a regression-lock test asserts equality
 * (T-199-08 / Plan 199-04 acceptance).
 */
export const ALLOWED_XAI_MODELS = [
	'grok-4.20-0309-non-reasoning',
	'grok-4.20-0309-reasoning',
	'grok-4.3',
] as const
export type AllowedXaiModel = (typeof ALLOWED_XAI_MODELS)[number]

/**
 * Default model id resolved when provider='xai'. P199 UAT discovered that
 * `grok-4.20-0309-fast` (D-199-07 original) does NOT exist for the operator's
 * xAI subscription — live `GET https://api.x.ai/v1/models` returned the 4 ids
 * in ALLOWED_XAI_MODELS above + 3 image/video models we don't expose. Default
 * rotated to `grok-4.20-0309-non-reasoning` (the cheapest/fastest of the chat
 * models confirmed available on this account).
 */
const XAI_DEFAULT_MODEL_ID: AllowedXaiModel = 'grok-4.20-0309-non-reasoning'

/**
 * Phase 199-02 — narrow arbitrary unknown input to `AllowedXaiModel`.
 *
 * Untyped client input (chat-route body `config.modelName`) cannot escape
 * the allow-list — invalid / null / undefined / non-string inputs all fall
 * through to `XAI_DEFAULT_MODEL_ID` per D-199-24 (soft validation; never
 * 400s the request). Mitigates T-199-02-02 (Tampering — coerceModel input).
 *
 * Implementation uses `Array.includes` against a `readonly string[]` cast —
 * no `eval`, no string-construction; pure structural narrowing.
 */
export function coerceModel(raw: unknown): AllowedXaiModel {
	if (typeof raw !== 'string') return XAI_DEFAULT_MODEL_ID
	return (ALLOWED_XAI_MODELS as readonly string[]).includes(raw)
		? (raw as AllowedXaiModel)
		: XAI_DEFAULT_MODEL_ID
}

const REDIS_ACTIVE_PROVIDER_KEY = 'liv:config:active_provider'

export interface ProviderRouterDeps {
	xaiCreds: Pick<XaiCredentialsService, 'getToken'>
	redis: {get(key: string): Promise<string | null>}
}

export interface ProviderRouter {
	/**
	 * Phase 199-02 — Extended signature: optional `modelId` accepts the
	 * per-request override from `chat-route` body `config.modelName`
	 * (Plan 199-03). Backward-compat: zero-arg call (the Phase 197-01
	 * shape) coerces undefined → XAI_DEFAULT_MODEL_ID and continues to
	 * work exactly as before — liv-ai.ts pre-Plan-199-03 callers do not
	 * need to change synchronously.
	 */
	resolveAgentModel(modelId?: string): Promise<unknown>
}

/**
 * Strip any `Bearer <token>` segment from an arbitrary error message before
 * re-surfacing it. Defense-in-depth for T-197-01-01 — keeps the token out
 * of every downstream log channel.
 */
function scrubBearer(message: string): string {
	return message.replace(/Bearer\s+[A-Za-z0-9._\-]+/g, 'Bearer [redacted]')
}

/**
 * Build the fetch middleware that injects a fresh OAuth Bearer per request.
 * Exported separately so unit tests can call it without invoking the full
 * @ai-sdk/xai provider chain.
 */
export function createTokenFetch(
	deps: Pick<ProviderRouterDeps, 'xaiCreds'>,
): (url: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
	return async (url, init) => {
		const headers = new Headers(init?.headers)
		const token = await deps.xaiCreds.getToken()
		headers.set('Authorization', `Bearer ${token}`)
		try {
			return await globalThis.fetch(url, {...init, headers})
		} catch (err) {
			const inner = err instanceof Error ? err.message : String(err)
			throw new Error(`xAI fetch failed: ${scrubBearer(inner)}`)
		}
	}
}

function coerceProvider(raw: string | null | undefined): ProviderId {
	if (typeof raw !== 'string') return 'xai'
	const candidate = raw as ProviderId
	return ALLOWED_PROVIDERS.includes(candidate) ? candidate : 'xai'
}

export function createProviderRouter(deps: ProviderRouterDeps): ProviderRouter {
	return {
		async resolveAgentModel(modelId?: string): Promise<unknown> {
			const raw = await deps.redis.get(REDIS_ACTIVE_PROVIDER_KEY)
			const provider = coerceProvider(raw)
			if (provider !== 'xai') {
				throw new ProviderNotConfiguredError(provider)
			}
			// Phase 199-02 — coerce per-request modelId through the allow-list.
			// undefined / null / non-string / unknown id → XAI_DEFAULT_MODEL_ID
			// (D-199-24 soft validation; T-199-02-02 tampering mitigation).
			const resolvedId = coerceModel(modelId)
			// apiKey: 'placeholder' satisfies @ai-sdk/xai's type contract; the
			// fetch middleware overrides Authorization on every request with a
			// fresh token from XaiCredentialsService. T-197-01-02: no static
			// env-key read here — fresh OAuth via middleware is the only path.
			const provider_ = createXai({
				apiKey: 'placeholder',
				fetch: createTokenFetch({xaiCreds: deps.xaiCreds}),
			})
			return provider_(resolvedId)
		},
	}
}

export {ALLOWED_PROVIDERS, XAI_DEFAULT_MODEL_ID, REDIS_ACTIVE_PROVIDER_KEY}
