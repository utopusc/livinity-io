/**
 * FileOperationToolView — Phase 69-02 (VIEWS-04).
 *
 * Spec: .planning/phases/69-per-tool-views-suite/69-CONTEXT.md D-22
 *       + .planning/v31-DRAFT.md lines 438-443.
 *
 * Renders file-system tool calls (`read*`, `write*`/`create*`, `delete*`,
 * `list*`) in a uniform path + content layout:
 *   - Header: file icon + path code + operation badge derived from
 *     toolName via the regex ladder (CONTEXT D-22):
 *       Read     → cyan   (read-file, view-file, cat-file, …)
 *       Created  → emerald (write-file, create-file, new-file, …)
 *       Deleted  → rose    (delete-file, remove-file, rm-file, …)
 *       List     → cyan    (list-files, ls-dir, …)
 *       File Op  → muted   (unknown — fallback)
 *   - Read-only ops also surface a `{lineCount} lines · {charCount} chars`
 *     stats line below the header.
 *   - Body: `<pre>` with file content. NO syntax highlighting per
 *     CONTEXT D-09 — Shiki/Prism are explicitly forbidden until P75-05.
 *   - Pending state: when `snapshot.toolResult` is undefined the pre
 *     renders the muted text 'Pending...'.
 *   - Error state: when `snapshot.status === 'error'`, the pre adopts
 *     the rose accent (matching GenericToolView D-25).
 *
 * Path extraction tries the canonical Suna fields in order:
 *   `path` → `file_path` → `filePath` → `target_file` → `filename`.
 * First non-empty string wins. Falls back to `'<no path>'`.
 *
 * Threat model: 69-02 threat register T-69-02-02 / T-69-02-03 / T-69-02-04.
 *   - T-69-02-02 XSS: path rendered as <code>{path}</code>; React
 *     auto-escapes text children — no dangerouslySetInnerHTML.
 *   - T-69-02-03 secrets in file content: same trust level as the
 *     server-side agent run; display tier, not a fresh exposure.
 *   - T-69-02-04 DoS via large content: max-h-[50vh] overflow-auto
 *     caps visible height; full text remains in DOM. P73 reliability
 *     layer can truncate at fetch time.
 */

import {LivIcons} from '@/icons/liv-icons'
import {Badge} from '@/shadcn-components/ui/badge'

import type {ToolViewProps} from './types'

// ─────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Canonical path field names accepted from `assistantCall.input`.
 * First-present, first-non-empty-string wins. Order locked by
 * CONTEXT D-22 and frozen so the regex ladder in `getOpType` can be
 * tested independently. Tuple-typed via `as const` so adding/removing
 * a field is a deliberate edit.
 */
const PATH_FIELDS = ['path', 'file_path', 'filePath', 'target_file', 'filename'] as const

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
 * Map a toolName to the operation `{label, color}` per CONTEXT D-22.
 * The regex ladder is intentionally permissive — it accepts the broad
 * Suna naming variants (e.g. `read_file`, `view-file`, `cat-file`).
 *
 *   /^(read|view|cat)/    → 'Read'    cyan
 *   /^(write|create|new)/ → 'Created' emerald
 *   /^(delete|remove|rm)/ → 'Deleted' rose
 *   /^(list|ls)/          → 'List'    cyan
 *   default               → 'File Op' muted
 */
function getOpType(toolName: string): {label: string; color: string} {
	if (/^(read|view|cat)/.test(toolName))
		return {label: 'Read', color: 'text-[color:var(--liv-accent-cyan)]'}
	if (/^(write|create|new)/.test(toolName))
		return {label: 'Created', color: 'text-[color:var(--liv-accent-emerald)]'}
	if (/^(delete|remove|rm)/.test(toolName))
		return {label: 'Deleted', color: 'text-[color:var(--liv-accent-rose)]'}
	if (/^(list|ls)/.test(toolName))
		return {label: 'List', color: 'text-[color:var(--liv-accent-cyan)]'}
	return {label: 'File Op', color: 'text-[color:var(--liv-text-secondary)]'}
}

/**
 * Pull file content out of `toolResult.output`. Accepts:
 *   1. plain string (typical read-file result)
 *   2. `{content: string}` (alternate Suna shape)
 * Returns '' for everything else (e.g. delete-file emits a status
 * object whose content is implicit in the operation label).
 */
function extractContent(output: unknown): string {
	if (typeof output === 'string') return output
	if (output && typeof output === 'object' && 'content' in output) {
		const c = (output as {content?: unknown}).content
		if (typeof c === 'string') return c
	}
	return ''
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────

export function FileOperationToolView({snapshot}: ToolViewProps) {
	const Icon = LivIcons.file
	const path = extractPath(snapshot.assistantCall.input)
	const op = getOpType(snapshot.toolName)
	const content = snapshot.toolResult ? extractContent(snapshot.toolResult.output) : null
	const isReadOp = op.label === 'Read'
	const isError = snapshot.status === 'error'
	const lineCount = content ? content.split('\n').length : 0
	const charCount = content ? content.length : 0

	const preClass =
		'font-mono text-12 whitespace-pre-wrap max-h-[50vh] overflow-auto rounded bg-[color:var(--liv-bg-deep)] p-3 border border-[color:var(--liv-border-subtle)]' +
		(isError ? ' text-[color:var(--liv-accent-rose)]' : '')

	return (
		<div
			className='flex flex-col gap-3 p-3'
			data-testid='liv-file-operation-tool-view'
		>
			<header className='flex items-center gap-2'>
				<Icon size={16} className='text-[color:var(--liv-text-secondary)]' />
				<code className='font-mono text-13 truncate flex-1'>{path}</code>
				<Badge className={op.color}>{op.label}</Badge>
			</header>
			{isReadOp && content ? (
				<div className='text-12 text-[color:var(--liv-text-secondary)]'>
					{lineCount} lines · {charCount} chars
				</div>
			) : null}
			<pre className={preClass}>
				{snapshot.toolResult ? (content ?? '') : 'Pending...'}
			</pre>
		</div>
	)
}
