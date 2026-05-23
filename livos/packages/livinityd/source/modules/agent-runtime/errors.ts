/**
 * Phase 197-01 — Mastra-layer error classes.
 *
 * ProviderNotConfiguredError is thrown by ProviderRouter when
 * `liv:config:active_provider` resolves to a value other than 'xai'
 * (Plan 197-01 ships xai only; claude/openai branches defer to Phase 198+).
 */

export class ProviderNotConfiguredError extends Error {
	readonly code = 'PROVIDER_NOT_CONFIGURED' as const
	constructor(public readonly providerId: string) {
		super(`Provider not configured: ${providerId}`)
		this.name = 'ProviderNotConfiguredError'
	}
}
