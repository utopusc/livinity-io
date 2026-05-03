/**
 * Phase 61 Plan 02 (FR-BROKER-D2-01): Gemini provider stub.
 *
 * Interface-only — every method throws `NotImplementedError('gemini')`.
 * Companion to `openai-stub.ts` and `mistral-stub.ts` — see those files
 * for the broader rationale (registry completeness, defense-in-depth
 * against accidental routing).
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

export class GeminiProvider implements BrokerProvider {
	readonly name = 'gemini'

	async request(
		_params: ProviderRequestParams,
		_opts: ProviderRequestOpts,
	): Promise<ProviderResponse> {
		throw new NotImplementedError('gemini')
	}

	async streamRequest(
		_params: ProviderRequestParams,
		_opts: ProviderRequestOpts,
	): Promise<ProviderStreamResult> {
		throw new NotImplementedError('gemini')
	}

	translateUsage(_response: ProviderResponse): UsageRecord {
		throw new NotImplementedError('gemini')
	}
}
