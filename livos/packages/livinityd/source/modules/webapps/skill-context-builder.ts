// Phase 97-04 — Skill context builder.
//
// Renders a `webapp_skills` row (P96-02 schema) into an XML system-prompt
// addition the Auto-mode wrapper injects so the agent reads the recorded
// action log on its first turn and adapts the steps to current screen
// state.
//
// Output shape (v33-DRAFT §5 P97; gray-area Q1 default — XML, flat numbered
// list, fixed `<note>` copy):
//
//   [<goal>...</goal>]
//   <previously-learned-skill name="...">
//     <actions>
//       1. click button 'left' at (X, Y)
//       2. key Enter
//       3. ...
//       <truncated count="N" total="M"/>   (only when truncation applied)
//     </actions>
//     <note>Adapt these to current screen state. Validate each step with computer_screenshot before clicking.</note>
//   </previously-learned-skill>
//
// Truncation: keep the most recent 50 events (gray-area Q7 default). When
// truncation applies, emit a `<truncated count="N" total="M"/>` self-closing
// marker so the agent knows N earlier steps were dropped.
//
// Injection guard: every text fragment from the action log goes through
// `escapeXmlText` before rendering. This drops embedded angle brackets,
// ampersands, and closing-tag bait (e.g. `</actions>`) that a malicious
// recorder hook could otherwise smuggle into the system prompt.

import type {WebAppSkillRow} from './skills-repository.js'

const MAX_RECENT_EVENTS = 50
const NOTE =
	'Adapt these to current screen state. Validate each step with computer_screenshot before clicking.'

export type SkillContextInput = {
	skill: WebAppSkillRow
	freeFormGoal?: string
}

export type SkillContextResult = {
	promptBlock: string
	truncated: boolean
	retainedCount: number
	totalCount: number
}

// Canonical action-log shape (lifted from skills-router.ts coordsSchema /
// actionEventSchema). Repeated here as a structural type so this module
// doesn't import zod runtime — the upstream router already validated rows
// before persisting.
type Coords = {x: number; y: number}
type ClickEvent = {type: 'click'; button: 'left' | 'middle' | 'right'; coords: Coords; ts: number}
type KeyEvent = {type: 'key'; key: string; modifiers?: string[]; ts: number}
type WheelEvent = {type: 'wheel'; dx: number; dy: number; ts: number}
type ScrollEvent = {type: 'scroll'; coords: Coords; dx: number; dy: number; ts: number}
type WaitEvent = {type: 'wait'; durationMs: number; ts: number}
type ActionEvent = ClickEvent | KeyEvent | WheelEvent | ScrollEvent | WaitEvent

type ActionLog = {
	version?: number
	events?: ActionEvent[]
}

/**
 * Render a skill row into the system-prompt addition block.
 */
export function buildSkillContext(input: SkillContextInput): SkillContextResult {
	const {skill, freeFormGoal} = input
	const log = (skill.actionLog ?? {}) as ActionLog
	const events = Array.isArray(log.events) ? log.events : []
	const totalCount = events.length

	let retained = events
	let truncated = false
	if (events.length > MAX_RECENT_EVENTS) {
		retained = events.slice(-MAX_RECENT_EVENTS)
		truncated = true
	}

	const skillNameAttr = escapeXmlAttr(skill.skillName ?? '')

	const lines: string[] = []
	if (freeFormGoal && freeFormGoal.trim().length > 0) {
		lines.push(`<goal>${escapeXmlText(freeFormGoal.trim())}</goal>`)
	}
	lines.push(`<previously-learned-skill name="${skillNameAttr}">`)
	lines.push('  <actions>')
	retained.forEach((ev, idx) => {
		lines.push(`    ${idx + 1}. ${escapeXmlText(formatEvent(ev))}`)
	})
	if (truncated) {
		const droppedCount = totalCount - retained.length
		lines.push(`    <truncated count="${droppedCount}" total="${totalCount}"/>`)
	}
	lines.push('  </actions>')
	lines.push(`  <note>${escapeXmlText(NOTE)}</note>`)
	lines.push('</previously-learned-skill>')

	return {
		promptBlock: lines.join('\n'),
		truncated,
		retainedCount: retained.length,
		totalCount,
	}
}

/**
 * Compact human-readable summary of one action event. Format chosen for
 * agent legibility — coordinates as `(X, Y)`, modifiers prefixed, types
 * spelled out.
 */
function formatEvent(ev: ActionEvent): string {
	switch (ev.type) {
		case 'click': {
			const c = ev.coords ?? {x: 0, y: 0}
			return `click button '${safeBtn(ev.button)}' at (${num(c.x)}, ${num(c.y)})`
		}
		case 'key': {
			const mods =
				Array.isArray(ev.modifiers) && ev.modifiers.length > 0
					? ev.modifiers.map(safeKey).join('+') + '+'
					: ''
			return `key ${mods}${safeKey(ev.key)}`
		}
		case 'wheel':
			return `wheel dx=${num(ev.dx)} dy=${num(ev.dy)}`
		case 'scroll': {
			const c = ev.coords ?? {x: 0, y: 0}
			return `scroll at (${num(c.x)}, ${num(c.y)}) dx=${num(ev.dx)} dy=${num(ev.dy)}`
		}
		case 'wait':
			return `wait ${num(ev.durationMs)}ms`
		default:
			// Unknown shape — surface as a minimal opaque marker. Defensive guard
			// against future schema additions; v33-DRAFT routes future event
			// types through this builder explicitly.
			return `unknown-event`
	}
}

function num(v: unknown): string {
	if (typeof v !== 'number' || Number.isNaN(v)) return '0'
	if (Number.isInteger(v)) return String(v)
	return v.toFixed(2)
}

function safeBtn(b: unknown): string {
	if (b === 'left' || b === 'right' || b === 'middle') return b
	return 'left'
}

function safeKey(k: unknown): string {
	if (typeof k !== 'string') return ''
	// Strip control chars + braces that would confuse the XML escaper. Cap
	// at 32 chars per token so a malicious recorder can't blow the prompt
	// budget with one giant key field.
	return k.replace(/[\x00-\x1f<>&"']/g, '').slice(0, 32)
}

/**
 * Escape XML text content. The four standard predefined entities, plus
 * raw control character stripping (a recorder hook smuggling 0x1B etc.
 * shouldn't reach the prompt).
 */
export function escapeXmlText(s: string): string {
	if (typeof s !== 'string') return ''
	return s
		.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '') // strip control chars
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
}

/**
 * Escape an XML attribute value. Same as text plus quotes, since attribute
 * values are double-quote delimited.
 */
export function escapeXmlAttr(s: string): string {
	return escapeXmlText(s)
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;')
}
