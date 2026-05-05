/**
 * StrReplaceToolView — Phase 69-02 (VIEWS-05).
 *
 * Spec: .planning/phases/69-per-tool-views-suite/69-CONTEXT.md D-23
 *       + .planning/v31-DRAFT.md lines 444-449.
 *
 * Renders `str-replace` style tool calls as a colorized inline diff:
 *   - Header: fileEdit icon + path code + `+N / -N` stats span (only
 *     when the call carries a non-empty `old_str`/`new_str` pair).
 *   - Body: `colorizeDiff` output. Diff text is built by interleaving
 *     `old_str` lines (prefixed `-`) with `new_str` lines (prefixed `+`)
 *     joined by `\n`. Falls back to `toolResult.output` (when string)
 *     if neither `old_str` nor `new_str` is present.
 *   - Pending state: when no diff input AND no `toolResult` is present
 *     the body renders 'Pending...'.
 *
 * Path extraction mirrors FileOperationToolView's lookup chain:
 *   `path` → `file_path` → `filePath` → `target_file`. First non-empty
 *   string wins. Falls back to `'<no path>'`.
 *
 * D-NO-NEW-DEPS: this file uses ONLY `colorizeDiff` from the in-tree
 * utils.tsx — NOT Shiki/Prism. Per CONTEXT D-12, syntax highlighting
 * (full diff colorization beyond `+/-` line accents) is deferred to
 * P75-07 once the Shiki dep ships in P75-05.
 *
 * Threat model: 69-02 threat register T-69-02-01 / T-69-02-02 / T-69-02-04.
 *   - T-69-02-01 regex DoS via crafted ToolResult string is mitigated
 *     in utils.tsx; this file does no regex parsing of its own.
 *   - T-69-02-02 XSS: path + diff text rendered via React text-children
 *     (colorizeDiff returns elements with text-only children). React
 *     auto-escapes; no dangerouslySetInnerHTML.
 *   - T-69-02-04 DoS via large diff: max-h-[50vh] overflow-auto on the
 *     `<pre>` caps visible height.
 */

import {LivIcons} from '@/icons/liv-icons'

import type {ToolViewProps} from './types'
import {colorizeDiff} from './utils'

// ─────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Canonical path field names accepted from `assistantCall.input` for
 * str-replace tools. Mirrors FileOperationToolView's PATH_FIELDS minus
 * `filename` (str-replace tools never use that variant per CONTEXT D-23).
 */
const PATH_FIELDS = ['path', 'file_path', 'filePath', 'target_file'] as const

/**
 * Extract a path from the tool input. Returns `'<no path>'` when none
 * of the canonical fields are present or are non-empty strings.
 */
function extractPath(input: Record<string, unknown>): string {
	for (const k of PATH_FIELDS) {
		const v = input[k]
		if (typeof v === 'string' && v.length > 0) return v
	}
	return '<no path>'
}

/**
 * Build a unified-diff-style text from `old_str` and `new_str` by
 * prefixing each old line with `-` and each new line with `+`. Joined
 * by `\n` so colorizeDiff can split-and-color line-by-line.
 *
 * Note: this is intentionally NOT a true LCS-based unified diff. Suna's
 * str-replace contract surfaces the full old vs full new payload —
 * users see "this block was replaced by this block" rather than minimal
 * line edits. A proper LCS diff is P75-07 polish (paired with Shiki).
 */
function buildDiffText(oldStr: string, newStr: string): string {
	const oldLines = oldStr.split('\n').map((l) => `-${l}`)
	const newLines = newStr.split('\n').map((l) => `+${l}`)
	return [...oldLines, ...newLines].join('\n')
}

/**
 * Count the +N/-N stats. We count ONLY non-empty lines so that a
 * trailing newline in `old_str`/`new_str` doesn't inflate the badge.
 * The header's stats span uses these to render `+N / -N`.
 */
function countDiff(oldStr: string, newStr: string): {plus: number; minus: number} {
	return {
		plus: newStr.split('\n').filter((l) => l.length > 0).length,
		minus: oldStr.split('\n').filter((l) => l.length > 0).length,
	}
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────

export function StrReplaceToolView({snapshot}: ToolViewProps) {
	const Icon = LivIcons.fileEdit
	const path = extractPath(snapshot.assistantCall.input)
	const oldStr =
		typeof snapshot.assistantCall.input.old_str === 'string'
			? snapshot.assistantCall.input.old_str
			: ''
	const newStr =
		typeof snapshot.assistantCall.input.new_str === 'string'
			? snapshot.assistantCall.input.new_str
			: ''
	const hasDiff = oldStr.length > 0 || newStr.length > 0
	const stats = countDiff(oldStr, newStr)
	const diffText = hasDiff ? buildDiffText(oldStr, newStr) : ''
	const fallback =
		snapshot.toolResult && typeof snapshot.toolResult.output === 'string'
			? snapshot.toolResult.output
			: ''

	return (
		<div
			className='flex flex-col gap-3 p-3'
			data-testid='liv-str-replace-tool-view'
		>
			<header className='flex items-center gap-2'>
				<Icon size={16} className='text-[color:var(--liv-text-secondary)]' />
				<code className='font-mono text-13 truncate flex-1'>{path}</code>
				{hasDiff ? (
					<span className='text-12 text-[color:var(--liv-text-secondary)]'>
						<span className='text-[color:var(--liv-accent-emerald)]'>+{stats.plus}</span>
						{' / '}
						<span className='text-[color:var(--liv-accent-rose)]'>-{stats.minus}</span>
					</span>
				) : null}
			</header>
			<pre className='font-mono text-12 whitespace-pre-wrap max-h-[50vh] overflow-auto rounded bg-[color:var(--liv-bg-deep)] p-3 border border-[color:var(--liv-border-subtle)]'>
				{hasDiff ? colorizeDiff(diffText) : fallback || 'Pending...'}
			</pre>
		</div>
	)
}
