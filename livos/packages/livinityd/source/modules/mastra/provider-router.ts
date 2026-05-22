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
 * Default model id resolved when provider='xai'. Pinned literal per
 * CONTEXT.md `<decisions>` block — bump as a deliberate plan change.
 */
const XAI_DEFAULT_MODEL_ID = 'grok-4.20-0309-non-reasoning'

const REDIS_ACTIVE_PROVIDER_KEY = 'liv:config:active_provider'

export interface ProviderRouterDeps {
	xaiCreds: Pick<XaiCredentialsService, 'getToken'>
	redis: {get(key: string): Promise<string | null>}
}

export interface ProviderRouter {
	resolveAgentModel(): Promise<unknown>
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
		async resolveAgentModel(): Promise<unknown> {
			const raw = await deps.redis.get(REDIS_ACTIVE_PROVIDER_KEY)
			const provider = coerceProvider(raw)
			if (provider !== 'xai') {
				throw new ProviderNotConfiguredError(provider)
			}
			// apiKey: 'placeholder' satisfies @ai-sdk/xai's type contract; the
			// fetch middleware overrides Authorization on every request with a
			// fresh token from XaiCredentialsService. T-197-01-02: no static
			// env-key read here — fresh OAuth via middleware is the only path.
			const provider_ = createXai({
				apiKey: 'placeholder',
				fetch: createTokenFetch({xaiCreds: deps.xaiCreds}),
			})
			return provider_(XAI_DEFAULT_MODEL_ID)
		},
	}
}

export {ALLOWED_PROVIDERS, XAI_DEFAULT_MODEL_ID, REDIS_ACTIVE_PROVIDER_KEY}
