// Phase 38 Plan 01 — D-PF-02 network reachability pre-flight.
//
// Runs once on modal-open. Pure-ish (modulo the global fetch). Tests inject
// `fetchImpl` and a tight `timeoutMs` to exercise the AbortController path
// without hanging the test runner. Production callers leave both at default —
// 5s timeout against `https://livinity.io` HEAD.
//
// IMPORTANT: HEAD is intentional — we do NOT need the response body, only a
// reachability check. The fetch never sees a CORS body since HEAD has none.
// `mode: 'no-cors'` is NOT used here: the spec measures whether the fetch
// promise resolves with an `ok` flag, which `no-cors` would force to opaque.

export type PreflightFailureReason = 'timeout' | 'fetch-error' | 'http-error'

export interface PreflightResult {
	reachable: boolean
	reason?: PreflightFailureReason
	status?: number
}

export const DEFAULT_PREFLIGHT_TIMEOUT_MS = 5_000
export const PREFLIGHT_URL = 'https://livinity.io'

export interface PreflightOptions {
	/** Override the default 5000 ms abort timer (used by tests). */
	timeoutMs?: number
	/** Override the global fetch (used by tests). */
	fetchImpl?: typeof fetch
	/** Override the default URL (https://livinity.io). */
	url?: string
}

export async function preflightFetchLivinity(opts: PreflightOptions = {}): Promise<PreflightResult> {
	const timeoutMs = opts.timeoutMs ?? DEFAULT_PREFLIGHT_TIMEOUT_MS
	const fetchImpl = opts.fetchImpl ?? fetch
	const url = opts.url ?? PREFLIGHT_URL

	const ctrl = new AbortController()
	const timer = setTimeout(() => ctrl.abort(), timeoutMs)

	try {
		const res = await fetchImpl(url, {method: 'HEAD', signal: ctrl.signal})
		if (res.ok) return {reachable: true, status: res.status}
		return {reachable: false, reason: 'http-error', status: res.status}
	} catch (err: unknown) {
		const name = (err as {name?: unknown})?.name
		if (name === 'AbortError' || ctrl.signal.aborted) {
			return {reachable: false, reason: 'timeout'}
		}
		return {reachable: false, reason: 'fetch-error'}
	} finally {
		clearTimeout(timer)
	}
}
