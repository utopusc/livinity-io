/**
 * Phase 61 Plan 02 (FR-BROKER-D2-01): OpenAI provider stub.
 *
 * Interface-only — every method throws `NotImplementedError('openai')`.
 * v30 broker dispatch is hardcoded to `getProvider('anthropic')`; this
 * stub exists so the registry surface is complete (FR-BROKER-D2-02) and
 * future engineers can drop in a concrete OpenAI body without touching
 * the BrokerProvider contract.
 *
 * Defense-in-depth: a future routing bug that accidentally dispatches
 * to this provider surfaces a loud, named error to the client instead
 * of silent corruption. The grep-guard test
 * `__tests__/router-no-stub-dispatch.test.ts` blocks merges that wire
 * `getProvider('openai')` into router.ts / openai-router.ts /
 * passthrough-handler.ts.
 */
import {
	type BrokerProvider,
	type ProviderRequestOpts,
	type ProviderRequestParams,
	type ProviderResponse,
	type ProviderStreamResult,
	type UsageRecord,
	NotImplementedError,
} from './interface.js'

export class OpenAIProvider implements BrokerProvider {
	readonly name = 'openai'

	async request(
		_params: ProviderRequestParams,
		_opts: ProviderRequestOpts,
	): Promise<ProviderResponse> {
		throw new NotImplementedError('openai')
	}

	async streamRequest(
		_params: ProviderRequestParams,
		_opts: ProviderRequestOpts,
	): Promise<ProviderStreamResult> {
		throw new NotImplementedError('openai')
	}

	translateUsage(_response: ProviderResponse): UsageRecord {
		throw new NotImplementedError('openai')
	}
}
