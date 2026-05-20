// Phase 177-03 — InboxReader: filesystem walker for per-agent inbox entries.
//
// Reads `<vaultRoot>/items/<agentId>/inbox/*.md` frontmatter files written
// by Phase 177-02 AgentRunner. No separate storage — the filesystem IS the
// index (D-V38-S canonical reference).
//
// Security:
//   - assertUnderItemsDir() validates every resolved path against
//     `<vaultRoot>/items/` prefix before any read or write (T-177-03-01).
//   - markRead() only rewrites the `read:` field — no other frontmatter
//     field is mutated (T-177-03-02).
//
// No new npm deps — js-yaml already pulled in by autonomous-scheduler (Phase 165).

import {promises as fs} from 'node:fs'
import * as path from 'node:path'
import yaml from 'js-yaml'

// ── Public types ─────────────────────────────────────────────────────────────

export interface InboxReaderOptions {
	vaultRoot: string
}

export interface InboxEntryMeta {
	id: string // "<agentId>/<runId>" — stable cross-router key
	agentId: string
	runId: string // filename stem (without .md)
	runAt: string // ISO from frontmatter
	triggeredBy: 'cron' | 'manual'
	durationMs: number
	status: 'success' | 'failed'
	read: boolean // frontmatter `read:` field, default false if absent
	filePath: string // absolute path — used internally by markRead/get
}

// ── InboxReader class ────────────────────────────────────────────────────────

export class InboxReader {
	private readonly vaultRoot: string

	constructor(opts: InboxReaderOptions) {
		this.vaultRoot = opts.vaultRoot
	}

	/**
	 * List inbox entries for a specific agent, sorted newest-first.
	 */
	async listByAgent(agentId: string, opts?: {unread?: boolean}): Promise<InboxEntryMeta[]> {
		const inboxDir = path.join(this.vaultRoot, 'items', agentId, 'inbox')
		const files = await safeReadMdFiles(inboxDir)
		const entries: InboxEntryMeta[] = []
		for (const file of files) {
			const filePath = path.join(inboxDir, file)
			try {
				this.assertUnderItemsDir(filePath)
			} catch {
				continue // traversal guard
			}
			const meta = await this.parseEntryMeta(filePath, agentId)
			if (!meta) continue
			if (opts?.unread && meta.read) continue
			entries.push(meta)
		}
		return sortNewestFirst(entries)
	}

	/**
	 * List inbox entries from ALL agents by walking items/<agentId>/inbox/ for each agent,
	 * merged and sorted newest-first.
	 */
	async listGlobal(opts?: {unread?: boolean; limit?: number}): Promise<InboxEntryMeta[]> {
		const itemsDir = path.join(this.vaultRoot, 'items')
		let agentDirs: string[]
		try {
			const dirents = await fs.readdir(itemsDir, {withFileTypes: true})
			agentDirs = dirents.filter((d) => d.isDirectory()).map((d) => d.name)
		} catch {
			return []
		}

		const all: InboxEntryMeta[] = []
		for (const agentId of agentDirs) {
			const entries = await this.listByAgent(agentId, opts)
			all.push(...entries)
		}

		const sorted = sortNewestFirst(all)
		return opts?.limit ? sorted.slice(0, opts.limit) : sorted
	}

	/**
	 * Set `read: true` in the frontmatter of the given inbox file.
	 * Only the `read:` field is rewritten — all other fields are preserved.
	 */
	async markRead(filePath: string): Promise<void> {
		this.assertUnderItemsDir(filePath)
		const raw = await fs.readFile(filePath, 'utf-8')
		const rewritten = rewriteReadField(raw, true)
		await fs.writeFile(filePath, rewritten, 'utf-8')
	}

	/**
	 * Get the full body (text below frontmatter) and metadata for a single entry.
	 */
	async getEntry(filePath: string): Promise<{meta: InboxEntryMeta; body: string}> {
		this.assertUnderItemsDir(filePath)
		const raw = await fs.readFile(filePath, 'utf-8')
		const {frontmatter, body} = splitFrontmatter(raw)
		// Extract agentId and runId from the file path
		const segments = path.normalize(filePath).split(path.sep)
		const inboxIdx = segments.lastIndexOf('inbox')
		const agentId = inboxIdx >= 2 ? segments[inboxIdx - 1] : 'unknown'
		const runId = path.basename(filePath, '.md')
		const meta = buildMeta(frontmatter, agentId, runId, filePath)
		return {meta, body}
	}

	// ── Internal ──────────────────────────────────────────────────────────────

	private assertUnderItemsDir(filePath: string): void {
		const base = path.resolve(this.vaultRoot, 'items') + path.sep
		const resolved = path.resolve(filePath)
		if (!resolved.startsWith(base)) {
			throw new Error(`path traversal: ${filePath} is outside ${base}`)
		}
	}

	private async parseEntryMeta(
		filePath: string,
		agentId: string,
	): Promise<InboxEntryMeta | null> {
		try {
			const raw = await fs.readFile(filePath, 'utf-8')
			const {frontmatter} = splitFrontmatter(raw)
			const runId = path.basename(filePath, '.md')
			return buildMeta(frontmatter, agentId, runId, filePath)
		} catch {
			return null
		}
	}
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function safeReadMdFiles(dir: string): Promise<string[]> {
	try {
		const entries = await fs.readdir(dir)
		return entries.filter((e) => e.endsWith('.md'))
	} catch {
		return []
	}
}

function sortNewestFirst(entries: InboxEntryMeta[]): InboxEntryMeta[] {
	return [...entries].sort(
		(a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime(),
	)
}

/**
 * Split a YAML-frontmatter Markdown file into frontmatter object + body string.
 */
function splitFrontmatter(raw: string): {
	frontmatter: Record<string, unknown>
	body: string
} {
	const lines = raw.split('\n')
	if (lines[0]?.trim() !== '---') return {frontmatter: {}, body: raw}
	const closingIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
	if (closingIdx === -1) return {frontmatter: {}, body: raw}
	const yamlBlock = lines.slice(1, closingIdx).join('\n')
	const bodyLines = lines.slice(closingIdx + 1)
	// Strip a single leading blank line after the closing ---
	if (bodyLines[0]?.trim() === '') bodyLines.shift()
	const body = bodyLines.join('\n')
	try {
		const parsed = yaml.load(yamlBlock)
		const frontmatter =
			typeof parsed === 'object' && parsed !== null
				? (parsed as Record<string, unknown>)
				: {}
		return {frontmatter, body}
	} catch {
		return {frontmatter: {}, body: raw}
	}
}

/**
 * Rewrite only the `read:` field in the YAML frontmatter block.
 * If the field already exists it is updated; if absent it is inserted.
 */
function rewriteReadField(raw: string, value: boolean): string {
	const lines = raw.split('\n')
	if (lines[0]?.trim() !== '---') return raw
	const closingIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
	if (closingIdx === -1) return raw

	const yamlLines = lines.slice(1, closingIdx)
	const readLineIdx = yamlLines.findIndex((l) => /^read:\s/.test(l))
	if (readLineIdx !== -1) {
		yamlLines[readLineIdx] = `read: ${value}`
	} else {
		yamlLines.push(`read: ${value}`)
	}
	return ['---', ...yamlLines, '---', ...lines.slice(closingIdx + 1)].join('\n')
}

function buildMeta(
	fm: Record<string, unknown>,
	agentId: string,
	runId: string,
	filePath: string,
): InboxEntryMeta {
	// runAt may be stored as a quoted string or as a Date (js-yaml schema)
	let runAt = ''
	if (typeof fm.runAt === 'string') {
		runAt = fm.runAt
	} else if (fm.runAt instanceof Date) {
		runAt = fm.runAt.toISOString()
	}

	return {
		id: `${agentId}/${runId}`,
		agentId,
		runId,
		runAt,
		triggeredBy:
			fm.triggeredBy === 'cron' || fm.triggeredBy === 'manual' ? fm.triggeredBy : 'manual',
		durationMs: typeof fm.durationMs === 'number' ? fm.durationMs : 0,
		status: fm.status === 'failed' ? 'failed' : 'success',
		read: fm.read === true,
		filePath,
	}
}
