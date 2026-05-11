// Phase 97-07 — `webapp_replay_skill` AgentPress tool.
//
// Exposes the rendered skill-context block (P97-04) as a tool the agent can
// call mid-run for re-priming. The wrapper (P97-06 `LivAgentRunner.start`
// with `autoMode.skillPromptBlock`) auto-invokes the equivalent prompt
// injection at run start; this tool covers the secondary case where the
// agent wants to re-read the skill (e.g. after a long detour) or where the
// user changes the active skill mid-run.
//
// Tool schema (Anthropic / Kimi format, matching luse-tools.ts shape):
//   name: webapp_replay_skill
//   input:
//     skillId: uuid (required)
//     freeFormGoal: string (optional)
//   result: text content carrying the rendered <previously-learned-skill>
//           block from skill-context-builder. The agent reads it on the
//           next turn.
//
// Authorization: skill row is loaded via P96-02 `getWebAppSkill(pool, userId,
// skillId)`; user_id mismatch returns NOT_FOUND, never the row.
//
// Registration scope (per CONTEXT.md and 97-PLAN.md):
//   - Per-WebApp MCP instances ONLY. Host-display single-instance does NOT
//     get this tool — it has no WebApp scope, so a skillId would be
//     ambiguous.
//   - Wired into the per-instance MCP server's tools.ts dispatch so the
//     spawned child registers it via the same JSON-Schema → Zod path
//     luse-tools.ts uses.

import type pg from 'pg'

import {getWebAppSkill, type WebAppSkillRow} from '../webapps/skills-repository.js'
import {buildSkillContext, type SkillContextResult} from '../webapps/skill-context-builder.js'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 101-08 — v3 SelfClaude action-driven Teach replay branch.
//
// CONTEXT D-101-TEACH-V3 + RESEARCH.md Pattern 3:
//   v3 action_log shape:
//     {version: 3, webappId, name?, startedAt, endedAt, events: ActionStep[]}
//   ActionStep ∈ ClickStep | KeyStep | TypeStep | NoteStep
//
// Render strategy (mirrors buildSkillContext for v1/v2 — same XML wrapper +
// numbered actions block — but adds an explicit `<note>` line per `note`
// step so the agent reads the user's stated INTENT for that step verbatim).
// The instruction text on `note` steps is the drift-recovery surface for
// Phase 102 vision-based recovery; preserving it in the prompt block is
// the whole point of the v3 rewrite (per CONTEXT step 7).
//
// Notes are INFORMATIONAL — they describe intent, not tool dispatches. The
// renderer marks them as such so the agent doesn't try to "execute" a note.
//
// Strict version check: only `version === 3` enters this branch. Unknown
// versions (4+) fall through to the legacy path with NO v3-marker text in
// the output (test T-101-08-V3-06).
// ─────────────────────────────────────────────────────────────────────────────

const V3_NOTE =
	'Adapt these to current screen state. Validate each click with computer_screenshot before dispatching. The <note> lines record the user\'s stated INTENT for the preceding action — read them carefully and use the intent to recover if pixel drift is detected.'

const V3_MAX_RECENT_EVENTS = 50

type V3ClickStep = {type: 'click'; button: 1 | 2 | 3; x: number; y: number; ts: number}
type V3KeyStep = {type: 'key'; key: string; ts: number}
type V3TypeStep = {type: 'type'; text: string; ts: number}
type V3NoteStep = {type: 'note'; text: string; ts: number}
type V3ActionStep = V3ClickStep | V3KeyStep | V3TypeStep | V3NoteStep

type V3ActionLog = {
	version: 3
	webappId: string
	name?: string
	startedAt: number
	endedAt: number
	events: V3ActionStep[]
}

function escV3(s: string): string {
	if (typeof s !== 'string') return ''
	// Strip control chars + escape XML predefined entities. Cap at 512 per
	// note step (matches the recorder's pushNote() cap).
	// eslint-disable-next-line no-control-regex
	return s
		.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.slice(0, 512)
}

function safeBtn3(b: unknown): string {
	if (b === 1) return 'left'
	if (b === 2) return 'middle'
	if (b === 3) return 'right'
	return 'left'
}

function safeKey3(k: unknown): string {
	if (typeof k !== 'string') return ''
	return k.replace(/[\x00-\x1f<>&"']/g, '').slice(0, 32)
}

function formatV3Step(s: V3ActionStep, idx: number): string {
	switch (s.type) {
		case 'click':
			return `${idx + 1}. click button '${safeBtn3(s.button)}' at (${s.x | 0}, ${s.y | 0})`
		case 'key':
			return `${idx + 1}. key ${safeKey3(s.key)}`
		case 'type':
			return `${idx + 1}. type "${escV3(s.text)}"`
		case 'note':
			// note steps are not numbered as a separate action — they
			// describe the preceding step's intent. Marker is `<note>` so
			// the agent's XML-aware parser can pick them up cleanly.
			return `   <note>${escV3(s.text)}</note>`
		default: {
			// Defensive: any unknown step shape becomes a generic marker.
			const opaque = (s as {type?: string}).type ?? 'unknown'
			return `${idx + 1}. unknown-step type=${safeKey3(opaque)}`
		}
	}
}

export type RenderSkillV3Result = {
	promptBlock: string
	totalCount: number
	retainedCount: number
	truncated: boolean
}

/**
 * Phase 101-08 — render a v3 skill log to a system-prompt block. The block
 * follows the same `<previously-learned-skill name="...">` shape as the
 * v1/v2 builder but uses the SelfClaude v3 action shape (flat x/y, numeric
 * button, explicit `note` steps for drift recovery).
 *
 * Exported for direct testing (T-101-08-V3-01). Wired into the live
 * `executeWebAppReplaySkill` dispatch below.
 */
export function renderSkillV3(
	skill: WebAppSkillRow,
	freeFormGoal?: string,
): RenderSkillV3Result {
	const log = skill.actionLog as V3ActionLog
	const events = Array.isArray(log.events) ? log.events : []
	const totalCount = events.length
	let retained = events
	let truncated = false
	if (events.length > V3_MAX_RECENT_EVENTS) {
		retained = events.slice(-V3_MAX_RECENT_EVENTS)
		truncated = true
	}

	const lines: string[] = []
	if (freeFormGoal && freeFormGoal.trim().length > 0) {
		lines.push(`<goal>${escV3(freeFormGoal.trim())}</goal>`)
	}
	lines.push(`<previously-learned-skill name="${escV3(skill.skillName ?? '')}" version="3">`)
	lines.push('  <actions>')
	retained.forEach((ev, idx) => {
		lines.push('    ' + formatV3Step(ev, idx))
	})
	if (truncated) {
		const droppedCount = totalCount - retained.length
		lines.push(`    <truncated count="${droppedCount}" total="${totalCount}"/>`)
	}
	lines.push('  </actions>')
	lines.push(`  <note>${escV3(V3_NOTE)}</note>`)
	lines.push('  <!-- Phase 101-08 / SelfClaude v3: note-steps record user intent (informational; not executed). -->')
	lines.push('</previously-learned-skill>')

	return {
		promptBlock: lines.join('\n'),
		totalCount,
		retainedCount: retained.length,
		truncated,
	}
}

/** AgentPress / Anthropic tool result shape — matches luse-tools.ts. */
export type WebAppReplaySkillResult = {
	content: Array<{type: 'text'; text: string} | {type: 'image'; data: string; mimeType: string}>
	isError: boolean
	_liv_meta?: Record<string, unknown>
}

/**
 * Tool input. Validated at the dispatch boundary (zod / JSON-Schema) before
 * reaching this function; runtime guards here are defense in depth.
 */
export type WebAppReplaySkillInput = {
	skillId: string
	freeFormGoal?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Tool schema in Anthropic / Kimi format, ready to merge into the
 * per-instance LUSE_TOOLS array.
 */
export const WEBAPP_REPLAY_SKILL_TOOL = {
	name: 'webapp_replay_skill',
	description:
		"Load a previously-recorded WebApp skill and return its rendered guidance block. " +
		"The block contains a numbered list of recorded actions plus a `<note>` reminder " +
		"to validate each step with computer_screenshot before clicking. Adapt the steps " +
		"to current screen state — they are guidance, not deterministic playback.",
	input_schema: {
		type: 'object' as const,
		properties: {
			skillId: {
				type: 'string' as const,
				description: 'UUID of the saved webapp_skills row to load.',
			},
			freeFormGoal: {
				type: 'string' as const,
				description:
					'Optional free-form goal description rendered as a sibling <goal> block ' +
					'BEFORE the skill block.',
			},
		},
		required: ['skillId'],
	},
} as const

/**
 * Phase 100-10-02 — Backwards-compat shim for legacy bytebot tool names in
 * action_log records (D-100-10-I).
 *
 * action_log records authored before the Bytebot→Luse rename (skill_version
 * <= 2) reference tools as `mcp__bytebot__<name>` (the Claude Code SDK form
 * the agent records when it calls a tool). After the rename, the registered
 * MCP server is `luse` and tool names are `mcp__luse__<name>`. On read of
 * legacy skills, lazy-translate the prefix so any downstream consumer that
 * dispatches or renders a `tool` field continues to find the tool in the
 * Luse registry.
 *
 * Behavior:
 *   - skillVersion <= 2  → translate every event whose `tool` starts with
 *                          `mcp__bytebot__` to `mcp__luse__`.
 *   - skillVersion >  2  → pass through unchanged (post-rename writes already
 *                          use `mcp__luse__`; no double-translation).
 *   - events without a `tool` field are pass-through in both branches.
 *
 * Removal target: v34 (cleanup tracked in CONTEXT.md G-100-10-F).
 *
 * @see .planning/phases/100-multi-stream-window-redesign/100-10-CONTEXT.md
 *      D-100-10-I (Backwards-compat for in-flight skills)
 */
export function translateLegacyBytebotToolNames<
	E extends {tool?: string; args?: unknown},
>(events: ReadonlyArray<E>, skillVersion: number): Array<E> {
	if (skillVersion > 2) return events.slice()
	const LEGACY_PREFIX = 'mcp__bytebot__'
	const MODERN_PREFIX = 'mcp__luse__'
	return events.map((e) => {
		if (typeof e.tool === 'string' && e.tool.startsWith(LEGACY_PREFIX)) {
			return {
				...e,
				tool: MODERN_PREFIX + e.tool.slice(LEGACY_PREFIX.length),
			}
		}
		return e
	})
}

/**
 * Phase 100-10-02 — apply translateLegacyBytebotToolNames to the events of
 * a stored skill BEFORE downstream consumers (buildSkillContext renderer or
 * any future dispatcher) read them. Returns a new skill object with the
 * translated action_log; the original input is left unmodified.
 *
 * Wire-up point for D-100-10-I — every read path that consumes action_log
 * events flows through this helper so the shim runs exactly once per read.
 */
export function applyLegacyToolNameShimToSkill(skill: WebAppSkillRow): WebAppSkillRow {
	const log = skill.actionLog as {version?: number; events?: unknown} | null | undefined
	if (!log || typeof log !== 'object') return skill
	const version = typeof log.version === 'number' ? log.version : 1
	const events = Array.isArray(log.events) ? (log.events as Array<{tool?: string; args?: unknown}>) : []
	const translated = translateLegacyBytebotToolNames(events, version)
	return {
		...skill,
		actionLog: {
			...log,
			events: translated,
		},
	}
}

/**
 * Dispatch the tool. Loads the skill row via skills-repository.ts, calls
 * skill-context-builder to render the XML block, returns it as a text
 * content item.
 *
 * Caller MUST pass `userId` (the authenticated session's user id); this
 * function never trusts a caller-supplied user identifier in isolation.
 */
export async function executeWebAppReplaySkill(
	deps: {pool: pg.Pool; userId: string},
	input: WebAppReplaySkillInput,
): Promise<WebAppReplaySkillResult> {
	// Defensive input validation — the tool's MCP boundary should already
	// have run zod, but this module is used both via MCP (via tools.ts
	// dispatch) and directly via the AgentPress register path, so we
	// repeat the lightweight checks.
	if (!input || typeof input.skillId !== 'string') {
		return errorResult('skillId is required')
	}
	if (!UUID_RE.test(input.skillId)) {
		return errorResult('skillId must be a UUID')
	}
	if (
		input.freeFormGoal !== undefined &&
		(typeof input.freeFormGoal !== 'string' || input.freeFormGoal.length > 2_000)
	) {
		return errorResult('freeFormGoal must be a string up to 2000 chars')
	}

	const rawSkill = await getWebAppSkill(deps.pool, deps.userId, input.skillId)
	if (!rawSkill) {
		return errorResult(`Skill ${input.skillId} not found (or belongs to a different user)`)
	}

	// Phase 101-08 — Branch on skill version. v3 (SelfClaude) uses a
	// dedicated renderer that highlights note-step intent text for drift
	// recovery. v1/v2 flow through the legacy buildSkillContext path with
	// the D-100-10-I lazy-translation shim applied first.
	const skillVersion =
		(rawSkill.actionLog as {version?: number} | null | undefined)?.version ?? 1

	if (skillVersion === 3) {
		try {
			const v3Result = renderSkillV3(rawSkill, input.freeFormGoal)
			return {
				content: [
					{type: 'text', text: v3Result.promptBlock},
				],
				isError: false,
				_liv_meta: {
					kind: 'webapp-replay-skill',
					skillId: rawSkill.id,
					skillName: rawSkill.skillName,
					webappId: rawSkill.webappId,
					version: 3,
					truncated: v3Result.truncated,
					retainedCount: v3Result.retainedCount,
					totalCount: v3Result.totalCount,
					eventCount: v3Result.totalCount,
				},
			}
		} catch (err) {
			return errorResult(`Failed to render v3 skill block: ${(err as Error).message}`)
		}
	}

	// Phase 100-10-02 — apply the legacy-tool-name shim BEFORE the renderer
	// (buildSkillContext) consumes the action_log events. For skill_version
	// <= 2, this translates `mcp__bytebot__*` event.tool literals to
	// `mcp__luse__*`. D-100-10-I; removal target v34.
	const skill = applyLegacyToolNameShimToSkill(rawSkill)

	let result: SkillContextResult
	try {
		result = buildSkillContext({skill, freeFormGoal: input.freeFormGoal})
	} catch (err) {
		return errorResult(`Failed to render skill block: ${(err as Error).message}`)
	}

	return {
		content: [
			{
				type: 'text',
				text: result.promptBlock,
			},
		],
		isError: false,
		_liv_meta: {
			kind: 'webapp-replay-skill',
			skillId: skill.id,
			skillName: skill.skillName,
			webappId: skill.webappId,
			truncated: result.truncated,
			retainedCount: result.retainedCount,
			totalCount: result.totalCount,
		},
	}
}

function errorResult(message: string): WebAppReplaySkillResult {
	return {
		content: [{type: 'text', text: `Error: ${message}`}],
		isError: true,
	}
}
