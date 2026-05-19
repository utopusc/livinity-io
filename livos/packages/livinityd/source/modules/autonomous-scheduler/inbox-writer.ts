// Phase 164-03 — Inbox writeback for autonomous agent results.
//
// After each autonomous run, scheduler.ts (Phase 164-02) calls
// writeInboxEntry() to materialise the agent result as an Obsidian-compatible
// markdown file at:
//
//   <vaultPath>/inbox/<YYYY-MM-DD>_<HH-MM>_<agent>.md
//
// Content shape (locked — downstream parsers depend on this):
//
//   ---
//   agent: <name>
//   status: success|error|budget_exceeded|skipped
//   started: <ISO 8601 UTC, including ms>
//   duration_ms: <int>
//   cost_usd: <number with EXACTLY 4 decimal places>
//   turns: <int>
//   model: <model id>
//   ---
//
//   # <agent> — <YYYY-MM-DD>
//
//   <body verbatim>
//
//   ## Backlinks
//
//   - [[<agentSourceRelPath>]] — agent definition
//   - [[<caller-supplied-target>]]
//   ...
//
// Filename collision policy:
//   Within the same minute prefix the writer sequences
//   `<prefix>.md` → `<prefix>_2.md` → `<prefix>_3.md` → … up to `_99`.
//   The first hit is UNSUFFIXED (no `_1`).
//
// Idempotency policy:
//   Before claiming a `_<seq>` slot the writer SHA-256s each existing
//   same-prefix file. If any existing file's content hash matches the
//   would-be content, the call is a no-op returning
//   `{written: false, reason: 'duplicate', path}`. Defends against
//   scheduler retry storms without rewriting unchanged files.
//
// Pure file-IO. No Redis, no SDK, no network. Uses only node built-ins
// (D-NO-NEW-DEPS): node:crypto, node:fs/promises, node:path.

import {createHash} from 'node:crypto'
import {mkdir, readFile, writeFile, chmod, access} from 'node:fs/promises'
import path from 'node:path'

// ─── Public types ────────────────────────────────────────────────────────

export type AutonomousRunStatus =
	| 'success'
	| 'error'
	| 'budget_exceeded'
	| 'skipped'

export interface InboxEntryInput {
	vaultPath: string
	agent: string
	status: AutonomousRunStatus
	startedAt: Date
	durationMs: number
	costUsd: number
	turns: number
	model: string
	body: string
	// Obsidian wikilink target for the agent definition file, e.g.
	// 'livos-agents/nightly-backup-audit'. Rendered as
	// `[[livos-agents/nightly-backup-audit]]` in the ## Backlinks section.
	agentSourceRelPath: string
	// Optional extra wikilink targets (no `[[ ]]` needed — the writer
	// wraps them).
	backlinks?: string[]
}

export type WriteInboxResult =
	| {written: true; path: string}
	| {written: false; reason: 'duplicate'; path: string}
	| {written: false; reason: 'error'; err: string}

// ─── Internal helpers (pure) ─────────────────────────────────────────────

const COLLISION_CAP = 99

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n)
}

function filenameMinutePrefix(d: Date, agent: string): string {
	// UTC for filesystem determinism. Frontmatter ALSO uses UTC ISO 8601.
	// Seconds + milliseconds are deliberately dropped from the filename.
	const yyyy = d.getUTCFullYear()
	const mm = pad2(d.getUTCMonth() + 1)
	const dd = pad2(d.getUTCDate())
	const hh = pad2(d.getUTCHours())
	const min = pad2(d.getUTCMinutes())
	return `${yyyy}-${mm}-${dd}_${hh}-${min}_${agent}`
}

function buildFrontmatter(input: InboxEntryInput): string {
	// Field order is part of the contract — downstream parsers (and the
	// vitest suite Test 12) assert on this exact sequence.
	return [
		'---',
		`agent: ${input.agent}`,
		`status: ${input.status}`,
		`started: ${input.startedAt.toISOString()}`,
		`duration_ms: ${Math.round(input.durationMs)}`,
		`cost_usd: ${input.costUsd.toFixed(4)}`,
		`turns: ${Math.round(input.turns)}`,
		`model: ${input.model}`,
		'---',
		'',
	].join('\n')
}

function buildTitle(input: InboxEntryInput): string {
	const dateStr = input.startedAt.toISOString().slice(0, 10)
	return `# ${input.agent} — ${dateStr}`
}

function buildBacklinks(input: InboxEntryInput): string {
	const lines = [
		'## Backlinks',
		'',
		`- [[${input.agentSourceRelPath}]] — agent definition`,
	]
	for (const target of input.backlinks ?? []) {
		lines.push(`- [[${target}]]`)
	}
	return lines.join('\n')
}

function buildContent(input: InboxEntryInput): string {
	const body = input.body.trim().length > 0 ? input.body : '_(no body)_'
	return [
		buildFrontmatter(input),
		buildTitle(input),
		'',
		body,
		'',
		buildBacklinks(input),
		'',
	].join('\n')
}

async function pathExists(p: string): Promise<boolean> {
	try {
		await access(p)
		return true
	} catch {
		return false
	}
}

async function sha256OfFile(p: string): Promise<string> {
	const buf = await readFile(p)
	return createHash('sha256').update(buf).digest('hex')
}

function sha256OfString(s: string): string {
	return createHash('sha256').update(s, 'utf8').digest('hex')
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Materialise an autonomous agent run as a markdown file under
 * `<vaultPath>/inbox/`. See module docblock for the locked content shape
 * and the filename/collision/idempotency policy.
 *
 * Non-fatal: never throws. All recoverable errors collapse to
 * `{written: false, reason: 'error', err}` so the scheduler caller can
 * keep going (and ideally log).
 */
export async function writeInboxEntry(
	input: InboxEntryInput,
): Promise<WriteInboxResult> {
	try {
		const inboxDir = path.join(input.vaultPath, 'inbox')
		await mkdir(inboxDir, {recursive: true, mode: 0o755})

		const content = buildContent(input)
		const expectedHash = sha256OfString(content)
		const minutePrefix = filenameMinutePrefix(input.startedAt, input.agent)

		// Walk the candidate filenames in order:
		//   <prefix>.md (i=1, unsuffixed)
		//   <prefix>_2.md (i=2)
		//   <prefix>_3.md (i=3)
		//   ...
		//   <prefix>_99.md (i=99)
		// For each EXISTING candidate, hash-compare; if the existing file
		// already holds our exact content, return duplicate (no-op).
		// First non-existent candidate wins the write slot.
		for (let i = 1; i <= COLLISION_CAP; i++) {
			const candidateName =
				i === 1 ? `${minutePrefix}.md` : `${minutePrefix}_${i}.md`
			const candidatePath = path.join(inboxDir, candidateName)

			if (!(await pathExists(candidatePath))) {
				// Free slot — write and return.
				await writeFile(candidatePath, content, {encoding: 'utf8'})
				// Explicit chmod — writeFile's `mode` only applies on
				// creation, not overwrite. Tolerate non-root.
				await chmod(candidatePath, 0o644).catch(() => {
					/* non-root or non-POSIX — best effort */
				})
				return {written: true, path: candidatePath}
			}

			// Slot is occupied — check idempotency before sequencing.
			try {
				const existingHash = await sha256OfFile(candidatePath)
				if (existingHash === expectedHash) {
					return {
						written: false,
						reason: 'duplicate',
						path: candidatePath,
					}
				}
			} catch {
				// Read failed (race with delete, perms drift, …) — fall
				// through to the next sequence slot.
			}
		}

		return {
			written: false,
			reason: 'error',
			err: `inbox collision cap (${COLLISION_CAP}) reached for prefix ${minutePrefix}`,
		}
	} catch (err) {
		return {
			written: false,
			reason: 'error',
			err: err instanceof Error ? err.message : String(err),
		}
	}
}
