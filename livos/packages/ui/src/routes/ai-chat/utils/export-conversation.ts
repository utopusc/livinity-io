/**
 * Conversation export utilities — pure helpers + thin file-saver wrappers.
 *
 * Pure functions (`buildMarkdown`, `buildJSON`, `safeFilename`) are testable
 * without DOM. The `exportTo*` wrappers call `saveAs` from `file-saver` to
 * trigger a browser download.
 *
 * Markdown shape mirrors CONTEXT D-21 verbatim (header + role sections +
 * reasoning blockquote + tool-call <details>). PDF is intentionally NOT
 * supported — that path needs a new dep and is deferred.
 *
 * Plan: 75-04 (Phase 75 — Reasoning Cards + Lightweight Memory, MEM-08).
 */

import {saveAs} from 'file-saver'

export type ConversationToolCall = {
	name: string
	input: unknown
	output?: unknown
	isError?: boolean
}

export type ConversationMessage = {
	id?: string
	role: 'user' | 'assistant' | 'system' | 'tool'
	content: string
	reasoning?: string | null
	toolCalls?: ConversationToolCall[]
	ts?: number
}

export type ConversationData = {
	id: string
	title: string
	createdAt: number | string | Date
	messages: ConversationMessage[]
}

const ROLE_LABELS: Record<ConversationMessage['role'], string> = {
	user: 'User',
	assistant: 'Assistant',
	system: 'System',
	tool: 'Tool',
}

/**
 * Sanitize a conversation title for use as a filename.
 *
 * - Replaces any character outside `[A-Za-z0-9_\-. ]` with `_`.
 * - Trims surrounding whitespace.
 * - Falls back to `'conversation'` if the result is empty.
 * - Truncates to 64 characters.
 *
 * Note: this is a *replace*, not a strip — `'!!!'` becomes `'___'`, which is
 * non-empty and therefore returned as-is.
 */
export function safeFilename(title: string): string {
	const cleaned = title.replace(/[^\w\-. ]/g, '_').trim()
	if (cleaned.length === 0) return 'conversation'
	return cleaned.slice(0, 64)
}

/**
 * Render a conversation as Markdown.
 *
 * Output shape (CONTEXT D-21):
 *
 *   # ${title}
 *   *Exported ${ISO} · ${count} messages*
 *
 *   ---
 *
 *   ## ${RoleLabel}
 *
 *   > **Reasoning:**
 *   > line 1
 *   > line 2
 *
 *   ${content}
 *
 *   <details><summary>Tool: ${name}</summary>
 *
 *   ```json
 *   ${input}
 *   ```
 *
 *   Result:
 *
 *   ```
 *   ${output}
 *   ```
 *
 *   </details>
 */
export function buildMarkdown(conv: ConversationData): string {
	const date = new Date(conv.createdAt as Date | string | number).toISOString()
	const lines: string[] = []
	lines.push(`# ${conv.title}`)
	lines.push(`*Exported ${date} · ${conv.messages.length} messages*`)
	lines.push('')
	lines.push('---')
	lines.push('')
	for (const m of conv.messages) {
		lines.push(`## ${ROLE_LABELS[m.role]}`)
		lines.push('')
		if (m.reasoning && m.reasoning.trim().length > 0) {
			lines.push('> **Reasoning:**')
			for (const ln of m.reasoning.split('\n')) {
				lines.push(`> ${ln}`)
			}
			lines.push('')
		}
		lines.push(m.content)
		lines.push('')
		if (m.toolCalls && m.toolCalls.length > 0) {
			for (const tc of m.toolCalls) {
				lines.push(`<details><summary>Tool: ${tc.name}</summary>`)
				lines.push('')
				lines.push('```json')
				lines.push(JSON.stringify(tc.input ?? {}, null, 2))
				lines.push('```')
				if (tc.output !== undefined) {
					lines.push('')
					lines.push('Result:')
					lines.push('')
					lines.push('```')
					lines.push(typeof tc.output === 'string' ? tc.output : JSON.stringify(tc.output, null, 2))
					lines.push('```')
				}
				lines.push('')
				lines.push('</details>')
				lines.push('')
			}
		}
	}
	return lines.join('\n')
}

/**
 * Render a conversation as pretty-printed JSON (2-space indent).
 */
export function buildJSON(conv: ConversationData): string {
	return JSON.stringify(conv, null, 2)
}

/**
 * Trigger a browser download of the conversation as Markdown.
 */
export function exportToMarkdown(conv: ConversationData): void {
	const md = buildMarkdown(conv)
	const blob = new Blob([md], {type: 'text/markdown;charset=utf-8'})
	saveAs(blob, `${safeFilename(conv.title)}.md`)
}

/**
 * Trigger a browser download of the conversation as JSON.
 */
export function exportToJSON(conv: ConversationData): void {
	const json = buildJSON(conv)
	const blob = new Blob([json], {type: 'application/json;charset=utf-8'})
	saveAs(blob, `${safeFilename(conv.title)}.json`)
}
