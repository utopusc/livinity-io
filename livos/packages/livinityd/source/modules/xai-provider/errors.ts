/**
 * Phase 195 Plan 05 Task 1 — typed xai-provider errors.
 *
 * Each error carries a discriminating literal `.code` so callers (LangGraph
 * in Phase 196 / new lean broker in Phase 197) can pattern-match without
 * parsing message strings. Mirrors the xai-credentials/credentials-service.ts
 * pattern from Plan 195-02.
 *
 * Threat refs:
 *   - T-195-05-01 (info disclosure): error messages NEVER include the bearer
 *     token. Only request metadata (status code, model name, endpoint).
 *   - T-195-05-03 (DoS via retry loop): XaiUnauthorizedError carries
 *     `attempts: 2` so callers can verify retry budget was honored.
 */

export class XaiNotConnectedError extends Error {
	readonly code = 'XAI_NOT_CONNECTED' as const
	constructor(message: string = 'No xAI credentials — run onboarding (Settings > Connect AI)') {
		super(message)
		this.name = 'XaiNotConnectedError'
	}
}

export class XaiUnauthorizedError extends Error {
	readonly code = 'XAI_UNAUTHORIZED' as const
	constructor(
		message: string,
		readonly attempts: number,
	) {
		super(message)
		this.name = 'XaiUnauthorizedError'
	}
}

export class XaiVoiceNotSupportedError extends Error {
	readonly code = 'XAI_VOICE_NOT_SUPPORTED' as const
	constructor(readonly endpoint: 'audio.speech' | 'audio.transcriptions') {
		super(
			`xAI voice endpoint ${endpoint} not available on current tier ` +
				`(verified 2026-05-22: speech=403, transcriptions=404). ` +
				`See https://docs.x.ai/`,
		)
		this.name = 'XaiVoiceNotSupportedError'
	}
}

export class XaiRateLimitedError extends Error {
	readonly code = 'XAI_RATE_LIMITED' as const
	constructor(
		message: string,
		readonly retryAfterMs?: number,
	) {
		super(message)
		this.name = 'XaiRateLimitedError'
	}
}

export class XaiModelNotFoundError extends Error {
	readonly code = 'XAI_MODEL_NOT_FOUND' as const
	constructor(readonly model: string) {
		super(`xAI model not found: ${model}`)
		this.name = 'XaiModelNotFoundError'
	}
}

export class XaiNetworkError extends Error {
	readonly code = 'XAI_NETWORK_ERROR' as const
	constructor(
		message: string,
		readonly cause?: unknown,
	) {
		super(message)
		this.name = 'XaiNetworkError'
	}
}
