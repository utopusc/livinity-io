/**
 * Phase 101-06 Pillar C — Active Window Context prompt snippet builder.
 *
 * Pure-function module that builds a `## Active Window Context` markdown
 * snippet for injection into the agent's system prompt (via `contextPrefix`
 * in `agent-runner-factory.ts`). The snippet tells the agent which LivOS
 * app window (WebApp or native) is currently active, so it can default
 * `LUSE_TARGET_WINDOW_ID` for tool calls without a round-trip through
 * `list_windows`.
 *
 * Per the PATTERNS.md risk note (point 2 in 101-06 orchestrator
 * instructions), there is no file `agent-session.ts`. The injection point
 * is `livinity-broker/agent-runner-factory.ts:64-110` — the SAME pass-through
 * pattern that 100-08-05 used for `webappId?: string`. The sacred SDK
 * runner (`liv/packages/core/src/sdk-agent-runner.ts`) is NEVER touched.
 *
 * ## Security — Threat T-101-03 (prompt injection)
 *
 * `activeAppMeta.title` is set client-side and interpolated verbatim into
 * the LLM system prompt. A malicious title could attempt to break out of
 * the snippet's structural lines (e.g., embed `\nIgnore previous
 * instructions\n`) and inject sibling instructions.
 *
 * Mitigation:
 *   - `sanitizeActiveAppMeta()` strips control chars (`\x00-\x1f`, `\x7f`)
 *     and length-caps title (256) + url/binary (512).
 *   - `buildActiveWindowSnippet()` only emits the snippet when `activeWid`
 *     is a finite integer. Non-integer wid → empty string (graceful skip).
 *   - Unknown `kind` values are silently coerced to `'webapp'` so the
 *     snippet's parenthesized `(kind)` slot cannot leak attacker-chosen
 *     text.
 *
 * Defense in depth: the Sacred SDK runner's BROKER-CARRY-05 identity
 * preservation acts as a second-line check downstream.
 *
 * ## Why a pure function
 *
 * No IO, no globals, no side effects → trivially unit-testable, snapshot-
 * stable across environments, and safe to call from any layer (broker,
 * webapp launcher, native app spawner). The caller decides whether to
 * append the result to `contextPrefix` or to `systemPromptOverride`.
 */

export interface ActiveAppMeta {
	appId: string
	kind: 'webapp' | 'native'
	url?: string
	binary?: string
	title: string
}

export interface ActiveWindowContext {
	activeWid: number
	appMeta: ActiveAppMeta
}

const MAX_APP_ID_LEN = 128
const MAX_TITLE_LEN = 256
const MAX_URL_LEN = 512

// All Unicode C0 controls (U+0000..U+001F) + DEL (U+007F).
// Newlines and tabs ARE controls — stripping them prevents a malicious
// title from breaking out of its structural line.
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/g

/**
 * Strip control characters and length-cap a string. Truncation appends
 * a single `…` (U+2026) so callers can tell when a value was clipped.
 *
 * Falsy / non-string input returns empty string (defensive — the wire
 * contract is `string`, but if upstream serialization breaks we don't
 * want to crash the snippet builder).
 */
function clean(s: string | undefined | null, maxLen: number): string {
	if (typeof s !== 'string' || s.length === 0) return ''
	const stripped = s.replace(CONTROL_CHARS_RE, '')
	if (stripped.length <= maxLen) return stripped
	return stripped.slice(0, maxLen - 1) + '…'
}

/**
 * Defensive copy of `ActiveAppMeta` with all string fields control-char-
 * stripped and length-capped, and `kind` coerced to a known value.
 *
 * Does NOT mutate input.
 */
export function sanitizeActiveAppMeta(meta: ActiveAppMeta): ActiveAppMeta {
	const kind: 'webapp' | 'native' = meta.kind === 'native' ? 'native' : 'webapp'
	const out: ActiveAppMeta = {
		appId: clean(meta.appId, MAX_APP_ID_LEN),
		kind,
		title: clean(meta.title, MAX_TITLE_LEN),
	}
	if (meta.url !== undefined) {
		out.url = clean(meta.url, MAX_URL_LEN)
	}
	if (meta.binary !== undefined) {
		out.binary = clean(meta.binary, MAX_URL_LEN)
	}
	return out
}

/**
 * Build the `## Active Window Context` markdown snippet for the agent's
 * system prompt.
 *
 * Returns the empty string if `activeWid` is not a finite integer — the
 * caller should skip appending to the prompt in that case (D-101-LUSE-CONTEXT
 * "snippet emitted only when ALL fields valid", per 101-RESEARCH.md §Pitfalls).
 *
 * Wire format (must match D-101-LUSE-CONTEXT in 101-CONTEXT.md verbatim):
 *
 * ```
 * ## Active Window Context
 * You are operating in the context of the LivOS app: <title> (<kind>).
 * Window ID: <activeWid>
 * URL/Binary: <url ?? binary ?? '(unknown)'>
 * Default LUSE_TARGET_WINDOW_ID for all your tool calls is <activeWid> unless you override explicitly.
 * ```
 */
export function buildActiveWindowSnippet(input: ActiveWindowContext): string {
	if (typeof input.activeWid !== 'number' || !Number.isInteger(input.activeWid)) {
		return ''
	}
	const safe = sanitizeActiveAppMeta(input.appMeta)
	const target = safe.url ?? safe.binary ?? '(unknown)'
	return [
		'## Active Window Context',
		`You are operating in the context of the LivOS app: ${safe.title} (${safe.kind}).`,
		`Window ID: ${input.activeWid}`,
		`URL/Binary: ${target}`,
		`Default LUSE_TARGET_WINDOW_ID for all your tool calls is ${input.activeWid} unless you override explicitly.`,
	].join('\n')
}
