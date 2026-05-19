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

// ─── Phase 160-02 — LivOS context overlay prepended to Bytebot verbatim ──
//
// Background: `livos/packages/livinityd/source/modules/computer-use/luse-
// system-prompt.ts` is a byte-for-byte verbatim copy of upstream Bytebot's
// system prompt (D-09 / D-12 invariant — upstream sync compatibility). Four
// of its statements are FACTUALLY WRONG inside LivOS:
//   1. App whitelist (Firefox/Thunderbird/VS Code/1Password) — none of those
//      are installed by default on LivOS Mini PC.
//   2. Hardcoded display size (1280 x 960) — actual LivOS displays are
//      1920x1080 (master `:1`) and 1280x720 (per-WebApp Xvfb `:10+`).
//   3. UI conventions ("ONLY ACCESS THE APPLICATIONS VIA THEIR DESKTOP
//      ICONS") — LivOS is a React shell with a dock + Windows Manager,
//      not a traditional Linux desktop with double-clickable icons.
//   4. `computer_application` enum (firefox/thunderbird/1password/vscode/
//      terminal/directory/desktop) — LivOS apps (n8n, LibreOffice, Docker,
//      native registered apps) are NOT in that enum.
//
// We CANNOT patch the verbatim string (D-09 contract — upstream sync). We
// also CANNOT mutate it at runtime (same reason). The fix is to PREPEND an
// "LivOS context" overlay block BEFORE the verbatim prompt, plus a
// "conflict rule" sentence telling the agent that the overlay wins where
// the two disagree. Plan 160-04 will later thread a runtime
// `actualDisplaySize` value from `xdpyinfo` into `LuseOverlayOpts`; for now
// the field is a placeholder.
//
// The luse-system-prompt.ts bytes MUST remain UNCHANGED — verify via
// `git diff -- luse-system-prompt.ts` returns EMPTY after this plan ships.

export interface LuseOverlayOpts {
	/** Runtime list of currently-installed LivOS apps (WebApp + Native).
	 *  Plan 160-03 wires this via `apps.list` + `apps.native.list` queries.
	 *  Until then, callers pass an empty array (or omit) and the overlay
	 *  renders a "(no apps currently installed)" placeholder. */
	availableApps?: ReadonlyArray<{id: string; name: string; kind: 'webapp' | 'native'}>
	/** Runtime display size from `xdpyinfo` for the agent's target display.
	 *  Plan 160-04 wires this dynamically (reads `LUSE_TARGET_DISPLAY` then
	 *  shells out to xdpyinfo). When undefined, the overlay renders a hint
	 *  telling the agent to ground coordinates from screenshots. */
	actualDisplaySize?: {width: number; height: number}
	/** WebApp URL-pattern user slug. Defaults to `<user>` placeholder. */
	userSlug?: string
	/** Root domain for the WebApp URL pattern. Default `livinity.io`. */
	domainRoot?: string
}

/**
 * Build the LivOS context block that prepends to the verbatim Bytebot
 * system prompt. PURE function — no IO, no globals. The caller composes
 * the final system prompt via `buildLuseSystemPromptWithOverlay()` (below)
 * or by hand: `buildLuseOverlay(opts) + LUSE_SYSTEM_PROMPT`.
 *
 * Shape contract (locked by source-text invariants in
 * `agent-prompt-builder.test.ts` — Phase 160-02 describe block):
 *   - Starts with the literal banner `[LIVOS CONTEXT — PREPENDED TO
 *     BYTEBOT VERBATIM PROMPT BELOW]`
 *   - Contains the literal `DISPLAY:` field
 *   - Contains the literal `AVAILABLE APPS RIGHT NOW`
 *   - Contains the literal `APP LAUNCHER:` instruction
 *   - Contains the dash-pattern domain rule (`<app>-<user>.<domain>`) AND
 *     the explicit "DASH between app" + "NEVER n8n.${userSlug}" callouts
 *   - Contains the literal conflict rule `THIS CONTEXT WINS`
 *   - Ends with the `[BYTEBOT VERBATIM PROMPT FOLLOWS]` handoff marker
 *
 * The 5 source-text invariants (Phase 160-02 Task 2) and the 2 D-09
 * verbatim-guard invariants together protect against drift on either
 * side of the overlay/verbatim seam.
 */
export function buildLuseOverlay(opts: LuseOverlayOpts = {}): string {
	const apps = opts.availableApps ?? []
	const size = opts.actualDisplaySize
	const sizeStr = size
		? `${size.width} x ${size.height} pixels`
		: 'unknown — ground coordinates from screenshots'
	const userSlug = opts.userSlug ?? '<user>'
	const domainRoot = opts.domainRoot ?? 'livinity.io'
	const appList =
		apps.length > 0
			? apps.map((a) => `  - ${a.name} (id=${a.id}, kind=${a.kind})`).join('\n')
			: '  (no apps currently installed)'

	return `[LIVOS CONTEXT — PREPENDED TO BYTEBOT VERBATIM PROMPT BELOW]

You are operating LivOS, NOT a generic Linux desktop. LivOS is a self-hosted
React-based shell on top of livinityd — there is NO traditional Linux desktop
with double-clickable icons.

DISPLAY: ${sizeStr}

AVAILABLE APPS RIGHT NOW (use computer_application with these names, NOT
Bytebot defaults like firefox/thunderbird/vscode):
${appList}

APP LAUNCHER: invoke \`computer_application\` with one of the names listed
above. The Bytebot verbatim prompt below lists "firefox / thunderbird /
1password / vscode / terminal / desktop / directory" — those are upstream
defaults and most are NOT installed on LivOS. Prefer the LivOS apps listed
above. If the agent insists on classic Linux apps, the handler will still
try (and probably fail with "application not installed").

WEBAPP URL PATTERN: \`<app>-${userSlug}.${domainRoot}\` — note the DASH between app
and user slug, NOT a dot. Example: n8n-${userSlug}.${domainRoot} (correct),
NEVER n8n.${userSlug}.${domainRoot} (wrong).

CONFLICT RULE: where the verbatim Bytebot prompt below conflicts with this
LivOS context (e.g. coordinate space hardcoded 1280x960, "ONLY ACCESS
APPLICATIONS VIA DESKTOP ICONS"), THIS CONTEXT WINS. The verbatim prompt
is kept for upstream sync compatibility, not because every line applies.

─────────────────────────
[BYTEBOT VERBATIM PROMPT FOLLOWS]
`
}

// Phase 160-02 — assembly helper. Locked import + concatenation pattern
// per the plan acceptance criterion test invariant:
//   expect(SRC).toMatch(/buildLuseOverlay\([^)]*\) \+ LUSE_SYSTEM_PROMPT/)
//
// Import path uses the existing `.js` extension convention (ts-with-esm-
// imports) — same as the broker's `agent-runner-factory.ts:1` import of
// `@liv/core`. The verbatim string is consumed by VALUE (concatenation),
// never mutated.
import {LUSE_SYSTEM_PROMPT} from '../computer-use/luse-system-prompt.js'

// Phase 160-04 — runtime display-size resolver. The overlay's optional
// `actualDisplaySize` field (LuseOverlayOpts) was a placeholder in 160-02;
// 160-04 fills it from `xdpyinfo` against `LUSE_TARGET_DISPLAY` (per-WebApp
// Xvfb env, set by `luse-mcp-config.ts:buildLuseConfig`) or `DISPLAY` (host
// master fallback). The helper returns null on any failure → overlay falls
// back to "unknown — ground from screenshots" wording (160-02 behavior
// preserved).
import {readActualDisplaySize} from '../computer-use/native/display-size.js'

/**
 * Compose the final Luse system prompt by prepending the LivOS context
 * overlay onto the verbatim Bytebot prompt.
 *
 * Callers (broker / liv-core api.ts / MCP-server local construction) use
 * this helper instead of bare `LUSE_SYSTEM_PROMPT` so the LivOS facts
 * (apps list, display size, URL pattern, conflict rule) are visible to
 * the agent at the top of its context window, where instruction-following
 * attention is strongest.
 *
 * @param overlayOpts - dynamic LivOS context (apps list, display size,
 *                      user/domain). All fields optional; placeholders
 *                      render when omitted.
 * @returns `buildLuseOverlay(overlayOpts) + LUSE_SYSTEM_PROMPT`
 */
export function buildLuseSystemPromptWithOverlay(
	overlayOpts: LuseOverlayOpts = {},
): string {
	// The literal expression on this line is matched by the Phase 160-02
	// source-text invariant `/buildLuseOverlay\([^)]*\) \+ LUSE_SYSTEM_PROMPT/`
	// — do not refactor to intermediate variables without updating the test.
	const luseSystemPromptWithOverlay =
		buildLuseOverlay(overlayOpts) + LUSE_SYSTEM_PROMPT
	return luseSystemPromptWithOverlay
}

/**
 * Phase 160-04 — async variant of `buildLuseSystemPromptWithOverlay` that
 * resolves the runtime display size from `xdpyinfo` BEFORE composing the
 * overlay. Reads the env vars in this order of preference:
 *
 *   1. `LUSE_TARGET_DISPLAY` — set per-WebApp by `luse-mcp-config.ts:
 *      buildLuseConfig` to point at the spawned Xvfb (`:10+`).
 *   2. `DISPLAY` — the host process's master X server (typically `:1` on
 *      Mini PC).
 *   3. `:0` — last-ditch fallback for dev environments. xdpyinfo will fail
 *      cleanly if :0 isn't running, returning null → overlay degrades to
 *      "unknown" wording.
 *
 * If `overlayOpts.actualDisplaySize` is ALREADY supplied by the caller, the
 * env read + xdpyinfo call is SKIPPED — the explicit opt wins. This lets
 * tests inject a canned size without monkey-patching the helper, and lets
 * Plan 160-03 or future callers pre-resolve the size if they already have
 * it cached.
 *
 * Returns `buildLuseOverlay(opts) + LUSE_SYSTEM_PROMPT` — same composition
 * pattern as the sync variant, just with one more await for the xdpyinfo
 * round-trip. Total latency: ~5-50 ms on a healthy display, hard-capped at
 * 2000 ms by the helper's safety timeout.
 *
 * Why a separate async function (not converting the sync one):
 *   - The sync variant has no live callers yet (Phase 160-02 ships scaffold
 *     only), but the public API contract is sync — preserving it costs
 *     nothing and keeps the door open for callers that already have the
 *     size pre-resolved.
 *   - The async variant is the one Plan 160-04 wires into the agent runner
 *     construction path (where awaiting one extra promise is free — agent
 *     setup is already async-throughout).
 */
export async function buildLuseSystemPromptWithOverlayResolved(
	overlayOpts: LuseOverlayOpts = {},
): Promise<string> {
	let actualDisplaySize = overlayOpts.actualDisplaySize
	if (!actualDisplaySize) {
		const targetDisplay =
			process.env.LUSE_TARGET_DISPLAY ?? process.env.DISPLAY ?? ':0'
		const resolved = await readActualDisplaySize(targetDisplay)
		if (resolved) actualDisplaySize = resolved
	}
	return buildLuseSystemPromptWithOverlay({...overlayOpts, actualDisplaySize})
}
