/**
 * Phase 61 Plan 02 (FR-BROKER-D2-01): Mistral provider stub.
 *
 * Interface-only — every method throws `NotImplementedError('mistral')`.
 * Companion to `openai-stub.ts` and `gemini-stub.ts` — see those files
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

export class MistralProvider implements BrokerProvider {
	readonly name = 'mistral'

	async request(
		_params: ProviderRequestParams,
		_opts: ProviderRequestOpts,
	): Promise<ProviderResponse> {
		throw new NotImplementedError('mistral')
	}

	async streamRequest(
		_params: ProviderRequestParams,
		_opts: ProviderRequestOpts,
	): Promise<ProviderStreamResult> {
		throw new NotImplementedError('mistral')
	}

	translateUsage(_response: ProviderResponse): UsageRecord {
		throw new NotImplementedError('mistral')
	}
}
