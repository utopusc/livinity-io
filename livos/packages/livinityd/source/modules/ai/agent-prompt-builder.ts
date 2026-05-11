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
 *
 * @deprecated since Phase 102 — superseded by `buildActiveDisplaySnippet`
 * (Phase 102-06). Per-WebApp Luse children now scope by X11 display (`:N`)
 * not window-id; the LLM prompt accordingly reports "Active Display Context"
 * with `LUSE_TARGET_DISPLAY=:N`. Kept temporarily for callers that still
 * pass `activeWid` (pre-102 broker payloads); remove once all WS envelope
 * sites are migrated.
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

/**
 * Phase 102-06 (Pillar C — Active Display Context) — display-scoped variant
 * of `buildActiveWindowSnippet`.
 *
 * Per-WebApp Luse MCP children now run on dedicated Xvfb displays (D-102-PER-
 * APP-XVFB / D-102-LUSE-DISPLAY-SCOPING). The LLM prompt context must reflect
 * this: instead of "Window ID: 0x123abc + LUSE_TARGET_WINDOW_ID for tool
 * calls", the agent is told "Active X11 display: :10 (1280x720)" with
 * `LUSE_TARGET_DISPLAY=:10` already injected into the child env — meaning
 * every tool call's screenshot/click/key implicitly targets :10 with no
 * coordinate offset and no scaling (1:1 native).
 */

export interface ActiveDisplayContext {
	activeDisplay: string
	appMeta: ActiveAppMeta
}

/**
 * Phase 102-06 — regex guard for `activeDisplay` interpolation.
 *
 * Threat T-102-06b (prompt injection via display string): `activeDisplay`
 * comes from the WS envelope client-side and is interpolated verbatim into
 * the LLM system prompt. A wider regex than `^:\d{1,3}$` would allow an
 * attacker to inject newlines or shell-meta that escape the snippet
 * structure. We accept up to 3 digits to leave headroom for future Xvfb
 * server allocations beyond :99 (the strict descriptor regex in
 * luse-mcp-config.ts pins :1..:99; the prompt regex is intentionally a
 * superset since the prompt is descriptive — the env validation is the
 * authoritative gate).
 */
const DISPLAY_RE_PROMPT = /^:\d{1,3}$/

/**
 * Build the `## Active Display Context` markdown snippet for the agent's
 * system prompt.
 *
 * Returns the empty string if `activeDisplay` does not match the prompt
 * regex (graceful skip — caller appends nothing rather than emitting a
 * half-formed snippet that the LLM might parse as instruction).
 *
 * Wire format (must match D-103-04-AGENT-INSTRUCTION; supersedes the earlier
 * D-102-LUSE-DISPLAY-SCOPING descriptive form):
 *
 * ```
 * ## Active Display Context
 * You are operating in the context of the LivOS app: <title> (<kind>).
 * Active X11 display: <activeDisplay> (resolution 1280x720)
 * URL/Binary: <url ?? binary ?? '(unknown)'>
 * IMPORTANT: Every Luse tool call (...) MUST pass display: "<activeDisplay>" as a tool argument ...
 * ```
 *
 * ## Phase 103-04 — Prescriptive instruction flip
 *
 * Phase 103-03 added an optional `display?: ":N"` arg to 13 X11-touching Luse
 * tools (`luse-tools.ts` + `mcp/tools.ts withScopedDisplay`). The agent must
 * be told to pass that arg on EVERY tool call — descriptive "implicitly
 * scoped via LUSE_TARGET_DISPLAY" wording would not surface the new contract.
 *
 * Belt-and-suspenders: agent-runner-factory still seeds `LUSE_TARGET_DISPLAY`
 * per-turn, so an agent that omits the arg still resolves to the right
 * display via the env fallback (`parseDisplayArg → options.defaultDisplay`).
 * The env name is intentionally NOT mentioned in the prompt — the agent
 * doesn't need to know about runtime fallbacks; the instruction is
 * unambiguous: pass the arg.
 */
export function buildActiveDisplaySnippet(input: ActiveDisplayContext): string {
	if (
		typeof input.activeDisplay !== 'string' ||
		!DISPLAY_RE_PROMPT.test(input.activeDisplay)
	) {
		return ''
	}
	const safe = sanitizeActiveAppMeta(input.appMeta)
	const target = safe.url ?? safe.binary ?? '(unknown)'
	return [
		'## Active Display Context',
		`You are operating in the context of the LivOS app: ${safe.title} (${safe.kind}).`,
		`Active X11 display: ${input.activeDisplay} (resolution 1280x720)`,
		`URL/Binary: ${target}`,
		`IMPORTANT: Every Luse tool call (computer_screenshot, computer_click_mouse, computer_type_text, computer_press_keys, computer_scroll, list_windows, etc.) MUST pass display: "${input.activeDisplay}" as a tool argument so the operation is scoped to this WebApp's dedicated X server. If you omit the display argument, the tool falls back to the host display (:1) and you will NOT see or interact with this WebApp. Coordinate space is 1280x720 native — no offset, no scaling.`,
	].join('\n')
}
