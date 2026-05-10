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

	// Phase 100-10-02 — apply the legacy-tool-name shim BEFORE the renderer
	// (buildSkillContext) consumes the action_log events. For skill_version
	// <= 2, this translates `mcp__bytebot__*` event.tool literals to
	// `mcp__luse__*`. Post-rename writes (v3+) pass through unchanged.
	// D-100-10-I; removal target v34.
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
