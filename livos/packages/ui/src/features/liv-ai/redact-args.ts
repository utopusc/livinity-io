/**
 * Phase 197-06 T-197-06-03 — Scrub credential-looking fields from tool args
 * before rendering in the approval modal. Defense-in-depth — Plan 197-04's
 * agent prompt already discourages leaking secrets to tools, but the operator
 * may still paste a token into chat and the agent may relay it to a tool.
 */

const SENSITIVE_KEY_RE = /token|key|secret|password|authorization/i

export function redactArgsForDisplay(args: unknown): unknown {
	if (typeof args !== 'object' || args === null) return args
	if (Array.isArray(args)) {
		return args.map((v) => redactArgsForDisplay(v))
	}
	const out: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
		if (SENSITIVE_KEY_RE.test(k)) {
			out[k] = '***'
		} else if (typeof v === 'object' && v !== null) {
			out[k] = redactArgsForDisplay(v)
		} else {
			out[k] = v
		}
	}
	return out
}
