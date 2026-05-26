/**
 * Phase 219 T6 — Skill schema + parser.
 *
 * Skills are markdown files with YAML frontmatter (Claude Code's
 * `~/.claude/skills/` model). Each lives at:
 *
 *   ~bruce/livinity/<agent>/skills/<skill-slug>/SKILL.md
 *
 * Frontmatter contract:
 *
 *   ---
 *   name: <slug>                    # required
 *   description: <one-liner>        # required — used by the agent to decide relevance
 *   tools: [tool-a, tool-b]         # optional — MCP tool names the skill needs
 *   ---
 *   <markdown body>
 *
 * The body below the closing `---` is the skill's actual instructions. The
 * agent loader (T6 follow-up) prepends the body to its working context when
 * the operator's message matches keywords from `description`.
 *
 * INV-219-SKILL-PORTABLE — same shape as Claude Code skills + OpenClaw
 * ClawHub format (per RESEARCH-skills-market.md). Operators can paste
 * upstream skills into LivOS without translation.
 */
import {z} from 'zod'

export const SkillFrontmatterSchema = z.object({
	name: z
		.string()
		.trim()
		.regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, 'name must be lowercase alphanumeric (+ _-), 1-64 chars'),
	description: z.string().trim().min(1, 'description required').max(500, 'description too long (max 500)'),
	tools: z.array(z.string().trim().min(1).max(128)).max(64).optional(),
})

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>

export interface ParsedSkill {
	frontmatter: SkillFrontmatter
	body: string
	/** Absolute filesystem path of the SKILL.md the loader read. */
	path: string
}

/**
 * Minimal YAML-frontmatter parser. We avoid pulling in `gray-matter` (and its
 * `js-yaml` dep) because skills frontmatter is intentionally a tiny subset:
 *
 *   - leading `---\n`, content lines `key: value` or `key: [a, b, c]`, closing `---`
 *   - string values may be quoted (single or double) — outer quotes stripped
 *   - list values are JSON-ish: `[a, b]` or `["a", "b"]`
 *
 * Returns null when the document doesn't open with `---` (signaling "no
 * frontmatter found — reject").
 */
export function parseFrontmatter(raw: string): {frontmatter: Record<string, unknown>; body: string} | null {
	const stripped = raw.replace(/^﻿/, '') // strip BOM if present
	if (!stripped.startsWith('---')) return null
	const afterOpen = stripped.indexOf('\n', 3)
	if (afterOpen < 0) return null
	const closeIdx = stripped.indexOf('\n---', afterOpen)
	if (closeIdx < 0) return null
	const yaml = stripped.slice(afterOpen + 1, closeIdx)
	const bodyStart = stripped.indexOf('\n', closeIdx + 4)
	const body = bodyStart < 0 ? '' : stripped.slice(bodyStart + 1)

	const frontmatter: Record<string, unknown> = {}
	for (const line of yaml.split('\n')) {
		const trimmed = line.trim()
		if (trimmed.length === 0 || trimmed.startsWith('#')) continue
		const colon = trimmed.indexOf(':')
		if (colon < 0) continue
		const key = trimmed.slice(0, colon).trim()
		let value: unknown = trimmed.slice(colon + 1).trim()
		if (typeof value === 'string') {
			if (value.startsWith('[') && value.endsWith(']')) {
				try {
					// JSON.parse handles `["a", "b"]`; for `[a, b]` we coerce by wrapping bare tokens in quotes.
					const inner = value.slice(1, -1).trim()
					if (inner.length === 0) {
						value = []
					} else {
						const tokens = inner.split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, ''))
						value = tokens
					}
				} catch {
					value = []
				}
			} else if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1)
			}
		}
		frontmatter[key] = value
	}
	return {frontmatter, body}
}

/**
 * Parse + validate a SKILL.md document. Returns the validated frontmatter +
 * body, or throws a Zod error / "no frontmatter" error so the loader can
 * log + skip.
 */
export function parseSkill(raw: string, path: string): ParsedSkill {
	const matter = parseFrontmatter(raw)
	if (!matter) {
		throw new Error(`SKILL_NO_FRONTMATTER: ${path} does not start with a --- block`)
	}
	const validated = SkillFrontmatterSchema.parse(matter.frontmatter)
	return {frontmatter: validated, body: matter.body, path}
}
