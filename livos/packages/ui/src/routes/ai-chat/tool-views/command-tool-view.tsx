/**
 * CommandToolView — Phase 69-01 (VIEWS-03).
 *
 * Spec: .planning/phases/69-per-tool-views-suite/69-CONTEXT.md D-21
 *       + .planning/v31-DRAFT.md lines 432-436.
 *
 * Renders shell / `execute-command` / `run-command` style tool calls in
 * a terminal aesthetic:
 *   - Dark surface (`var(--liv-bg-deep)`), monospace, font-mono text-12.
 *   - Header: terminal icon + "Command" label.
 *   - Command line: `$ {command}` rendered with cyan accent token to
 *     mirror a real-shell prompt. Falls back to `<no command>` when
 *     none of `command` / `cmd` / `shell` fields are present.
 *   - Output `<pre>`: `extractStdout` accepts string OR
 *     `{stdout: string}` OR `{output: string}`. While running with no
 *     stdout yet, renders muted "Running..." text.
 *   - Exit-code badge in footer:
 *       * `exit 0` (emerald) for success.
 *       * `exit N` (rose) for non-zero.
 *       * Derived from `output.exitCode` / `output.exit_code` (number)
 *         OR `isError ? 1 : 0` fallback.
 *     Footer omitted when toolResult is undefined (running, no result).
 *
 * Suna pattern only. NO Hermes streaming caret in P69 (CONTEXT D-21
 * defers streaming-caret polish to P70 via the motion primitive
 * shipped in P66).
 *
 * Threat model: 69-01 threat register T-69-01-03 / T-69-01-05.
 *   - T-69-01-03 XSS: stdout rendered as `<pre>` text-children, React
 *     auto-escapes. ANSI escape codes appear as raw text — UX issue,
 *     not security. Optional `ansi-to-html` plugin is P70 polish.
 *   - T-69-01-05 DoS: `max-h-[40vh] overflow-auto` caps vertical
 *     extent. Real fix is P73 fetch-tier truncation.
 */

import {LivIcons} from '@/icons/liv-icons'
import {Badge} from '@/shadcn-components/ui/badge'

import type {ToolCallSnapshot, ToolViewProps} from './types'

// ─────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Extract a command string from `assistantCall.input` accepting the
 * three canonical Suna field names (CONTEXT D-21). First-present wins.
 * Returns empty string when none are present — caller chooses fallback.
 */
function extractCommand(input: Record<string, unknown>): string {
	for (const k of ['command', 'cmd', 'shell']) {
		const v = input[k]
		if (typeof v === 'string') return v
	}
	return ''
}

/**
 * Pull stdout out of `toolResult.output`. Accepts:
 *   1. plain string (legacy / minimal tool results)
 *   2. `{stdout: string}` (canonical Suna shape)
 *   3. `{output: string}` (alternate shape used by some MCP tools)
 * Returns '' for everything else.
 */
function extractStdout(output: unknown): string {
	if (typeof output === 'string') return output
	if (output && typeof output === 'object') {
		const o = output as {stdout?: unknown; output?: unknown}
		if (typeof o.stdout === 'string') return o.stdout
		if (typeof o.output === 'string') return o.output
	}
	return ''
}

/**
 * Resolve the exit code from `toolResult.output` with fallback to
 * `isError ? 1 : 0`. Suna emits `exitCode` (camelCase) or `exit_code`
 * (snake_case) depending on the tool — accept both.
 */
function extractExitCode(output: unknown, isError: boolean): number {
	if (output && typeof output === 'object') {
		const o = output as {exitCode?: unknown; exit_code?: unknown}
		if (typeof o.exitCode === 'number') return o.exitCode
		if (typeof o.exit_code === 'number') return o.exit_code
	}
	return isError ? 1 : 0
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

/**
 * Exit-code badge — emerald for success, rose for failure. Uses
 * className override on the default Badge variant per CONTEXT D-21
 * (no new badge variants in P69).
 */
function ExitCodeBadge({code}: {code: number}) {
	const cls =
		code === 0
			? 'text-[color:var(--liv-accent-emerald)]'
			: 'text-[color:var(--liv-accent-rose)]'
	return <Badge className={cls}>exit {code}</Badge>
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────

export function CommandToolView({snapshot}: ToolViewProps) {
	const Icon = LivIcons.terminal
	const command = extractCommand(snapshot.assistantCall.input)
	const stdout = snapshot.toolResult ? extractStdout(snapshot.toolResult.output) : ''
	const isRunning = snapshot.status === 'running'
	const exitCode = snapshot.toolResult
		? extractExitCode(snapshot.toolResult.output, snapshot.toolResult.isError)
		: null

	return (
		<div
			className='flex flex-col gap-2 p-3 bg-[color:var(--liv-bg-deep)] rounded border border-[color:var(--liv-border-subtle)] font-mono text-12'
			data-testid='liv-command-tool-view'
		>
			<header className='flex items-center gap-2'>
				<Icon size={14} className='text-[color:var(--liv-text-secondary)]' />
				<span className='text-13'>Command</span>
			</header>
			<div className='text-[color:var(--liv-accent-cyan)]'>$ {command || '<no command>'}</div>
			{stdout ? (
				<pre className='text-[color:var(--liv-text-secondary)] whitespace-pre-wrap max-h-[40vh] overflow-auto'>
					{stdout}
				</pre>
			) : isRunning ? (
				<div className='text-[color:var(--liv-text-secondary)]'>Running...</div>
			) : (
				<div className='text-[color:var(--liv-text-secondary)]'>(no output)</div>
			)}
			{exitCode !== null ? (
				<footer className='flex justify-end pt-2 border-t border-[color:var(--liv-border-subtle)]'>
					<ExitCodeBadge code={exitCode} />
				</footer>
			) : null}
		</div>
	)
}
