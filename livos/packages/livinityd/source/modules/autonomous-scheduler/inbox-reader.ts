// Phase 165-02 — Read-only helper for the Settings UI autonomous panel.
//
// Scans <vaultPath>/inbox/ for the newest entry matching an agent's
// filename convention and returns the locked frontmatter trio:
//   started → at
//   status   → status
//   cost_usd → costUsd
//
// Filename convention (locked by inbox-writer.ts):
//   <YYYY-MM-DD>_<HH-MM>_<agent>.md
//   collision suffix: _2, _3, ..., _99 (first hit unsuffixed)
//
// Frontmatter shape (locked by inbox-writer.ts):
//   ---
//   agent: <name>
//   status: success|error|budget_exceeded|skipped
//   started: <ISO 8601 UTC, including ms>
//   cost_usd: <number with EXACTLY 4 decimal places>
//   ...
//   ---
//
// Tolerant of missing frontmatter / missing fields — per-field nulls.
// No new npm deps — uses js-yaml already pulled in by agent-definition-parser.

import {readdir, readFile, stat} from 'node:fs/promises'
import path from 'node:path'
import yaml from 'js-yaml'

export interface LastRunInfo {
	at: string | null
	status: 'success' | 'error' | 'budget_exceeded' | 'skipped' | null
	costUsd: number | null
}

const NULL_RESULT: LastRunInfo = {at: null, status: null, costUsd: null}

export async function readLastRunForAgent(
	vaultPath: string,
	agentName: string,
): Promise<LastRunInfo> {
	const inboxDir = path.join(vaultPath, 'inbox')
	try {
		const st = await stat(inboxDir)
		if (!st.isDirectory()) return NULL_RESULT
	} catch {
		return NULL_RESULT
	}

	const entries = await readdir(inboxDir)
	// Match `<date>_<time>_<agentName>.md` AND collision-suffixed variants
	// `<date>_<time>_<agentName>_<seq>.md`.
	const suffixPattern = new RegExp(`_${escapeRegex(agentName)}(?:_\\d+)?\\.md$`)
	const matches = entries
		.filter((e) => suffixPattern.test(e))
		.sort() // lexicographic: YYYY-MM-DD prefixes sort chronologically;
	// collision suffixes (_2, _3, ...) sort after unsuffixed at same minute
	if (matches.length === 0) return NULL_RESULT

	const newest = matches[matches.length - 1]
	const raw = await readFile(path.join(inboxDir, newest), 'utf8').catch(() => '')
	if (!raw) return NULL_RESULT

	const fm = parseFrontmatter(raw)
	if (!fm) return NULL_RESULT
	// `started` is written as an ISO 8601 UTC string by inbox-writer.ts, but
	// js-yaml's default schema parses ISO 8601 timestamps as Date objects.
	// Accept both shapes; serialize Date back to ISO string.
	let at: string | null = null
	if (typeof fm.started === 'string') at = fm.started
	else if (fm.started instanceof Date && !Number.isNaN(fm.started.getTime()))
		at = fm.started.toISOString()
	return {
		at,
		status:
			fm.status === 'success' ||
			fm.status === 'error' ||
			fm.status === 'budget_exceeded' ||
			fm.status === 'skipped'
				? fm.status
				: null,
		costUsd: typeof fm.cost_usd === 'number' ? fm.cost_usd : null,
	}
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseFrontmatter(raw: string): Record<string, unknown> | null {
	const lines = raw.split('\n')
	if (lines[0]?.trim() !== '---') return null
	const closing = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
	if (closing === -1) return null
	try {
		const yamlBlock = lines.slice(1, closing).join('\n')
		const parsed = yaml.load(yamlBlock)
		return typeof parsed === 'object' && parsed !== null
			? (parsed as Record<string, unknown>)
			: null
	} catch {
		return null
	}
}
