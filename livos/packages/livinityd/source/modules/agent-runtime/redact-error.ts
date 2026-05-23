/**
 * Phase 197-05 — Mastra error redaction.
 *
 * T-197-05-02 mitigation for Mastra issue #15827 (stack-trace leakage in dev
 * builds). Returns a sanitized RedactedError with message preserved + stack
 * replaced with '[redacted]'.
 */

export interface RedactedError {
	message: string
	code?: string
	stack: '[redacted]'
}

export function redactError(err: unknown): RedactedError {
	if (err instanceof Error) {
		const code = (err as {code?: string}).code
		return {
			message: err.message,
			...(code !== undefined ? {code} : {}),
			stack: '[redacted]' as const,
		}
	}
	return {message: String(err), stack: '[redacted]' as const}
}
