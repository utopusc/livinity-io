/**
 * HighlightedText — Phase 75-06 / CONTEXT D-27.
 *
 * Renders a postgres `ts_headline`-style snippet that contains literal
 * `<mark>...</mark>` tags into JSX, **NEVER** using `dangerously-set-inner-html`.
 *
 * Threat surface: ts_headline output is server-supplied but originates from
 * user-authored message content. If postgres ever emitted unexpected HTML in
 * a `<mark>` payload, dangerously-set-inner-html would create an XSS pivot.
 * This component splits the input on the literal `<mark>` / `</mark>` tag
 * markers and emits the surrounding plain text as React text nodes — React's
 * default text-node escaping is what neutralises any embedded markup.
 *
 * Defensive parsing:
 *   - No closing `</mark>` after an `<mark>` ⇒ remainder treated as plain
 *     text (T-75-06-03 mitigation: half-open mark cannot leak HTML through
 *     React's renderer either, but explicit fallback keeps the helper
 *     symmetric).
 *   - Empty input returns no nodes.
 *   - HTML special chars in surrounding text are preserved verbatim in the
 *     parsed segments — React text-node escaping handles render-time safety.
 */
import {Fragment, type ReactNode} from 'react'

export interface HighlightedTextProps {
	/** Snippet from postgres ts_headline, with literal <mark>...</mark> tags. */
	html: string
	/** Optional Tailwind className to apply to the <mark> elements. */
	markClassName?: string
}

export type ParsedSegment =
	| {type: 'text'; content: string}
	| {type: 'mark'; content: string}

const MARK_OPEN = '<mark>'
const MARK_CLOSE = '</mark>'

/**
 * Pure helper — parses a ts_headline string into an alternating sequence of
 * text + mark segments. Exported so unit tests can assert parser semantics
 * without rendering. Defensive: unbalanced `<mark>` falls back to plain text.
 */
export function parseMarks(html: string): ParsedSegment[] {
	if (!html) return []

	const out: ParsedSegment[] = []
	let i = 0
	while (i < html.length) {
		const open = html.indexOf(MARK_OPEN, i)
		if (open === -1) {
			out.push({type: 'text', content: html.slice(i)})
			break
		}
		const close = html.indexOf(MARK_CLOSE, open + MARK_OPEN.length)
		if (close === -1) {
			// Unbalanced — emit the remainder (including the dangling <mark>) as text.
			out.push({type: 'text', content: html.slice(i)})
			break
		}
		if (open > i) {
			out.push({type: 'text', content: html.slice(i, open)})
		}
		const inner = html.slice(open + MARK_OPEN.length, close)
		out.push({type: 'mark', content: inner})
		i = close + MARK_CLOSE.length
	}
	return out
}

const DEFAULT_MARK_CLASS = 'bg-amber-400/30 text-amber-100 rounded px-0.5'

export function HighlightedText({
	html,
	markClassName = DEFAULT_MARK_CLASS,
}: HighlightedTextProps) {
	const segments = parseMarks(html)
	const nodes: ReactNode[] = []
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i]
		if (seg.type === 'mark') {
			nodes.push(
				<mark key={i} className={markClassName}>
					{seg.content}
				</mark>,
			)
		} else {
			nodes.push(<Fragment key={i}>{seg.content}</Fragment>)
		}
	}
	return <>{nodes}</>
}
