// Phase 97-07 — `webapp_replay_skill` AgentPress tool.
//
// Exposes the rendered skill-context block (P97-04) as a tool the agent can
// call mid-run for re-priming. The wrapper (P97-06 `LivAgentRunner.start`
// with `autoMode.skillPromptBlock`) auto-invokes the equivalent prompt
// injection at run start; this tool covers the secondary case where the
// agent wants to re-read the skill (e.g. after a long detour) or where the
// user changes the active skill mid-run.
//
// Tool schema (Anthropic / Kimi format, matching bytebot-tools.ts shape):
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
//     bytebot-tools.ts uses.

import type pg from 'pg'

import {getWebAppSkill} from '../webapps/skills-repository.js'
import {buildSkillContext, type SkillContextResult} from '../webapps/skill-context-builder.js'

/** AgentPress / Anthropic tool result shape — matches bytebot-tools.ts. */
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
 * per-instance BYTEBOT_TOOLS array.
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

	const skill = await getWebAppSkill(deps.pool, deps.userId, input.skillId)
	if (!skill) {
		return errorResult(`Skill ${input.skillId} not found (or belongs to a different user)`)
	}

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
