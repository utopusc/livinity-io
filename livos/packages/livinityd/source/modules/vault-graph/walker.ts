/**
 * Phase 169-01 — Vault filesystem walker.
 *
 * `walkVault(vaultRoot, maxFiles=2000)` traverses the vault root recursively,
 * emitting one VaultFile per `*.md` file found. Defensive directory skip on
 * `node_modules` + `.git`. Tombstone-aware: filenames starting with
 * `.deleted-` (Phase 163-01 retraction marker) are excluded.
 *
 * Hard cap at `maxFiles` (default 2000) returned alongside `{truncated:true}`
 * — the cap is enforced INSIDE the recursive walk so traversal stops the moment
 * the cap is hit, no matter how deep the subtree.
 *
 * Path classification routes the first matching prefix in TYPE_PATHS to a
 * VaultFile['type'] (memory|session|inbox|agent|skill|command); anything else
 * falls back to 'root'. The path field is forward-slash normalized so the
 * downstream graph builder's wikilink resolution is platform-agnostic.
 *
 * Threat mitigations:
 *  - T-169-01-02 DoS: maxFiles cap + node_modules/.git skip
 *  - T-169-01-04 Info disclosure: paths are emitted RELATIVE to vaultRoot
 *  - T-169-01-05 Tombstone re-surface: `.deleted-*` filtered
 */

import {readdir, readFile, stat} from 'node:fs/promises'
import path from 'node:path'

import {parseFrontmatter, extractWikilinks} from './parser.js'

export interface VaultFile {
	path: string
	type: 'memory' | 'session' | 'inbox' | 'agent' | 'skill' | 'command' | 'root'
	size: number
	mtime: number
	frontmatter?: Record<string, unknown>
	wikilinks: string[]
	topDir: string // Phase 179-01: first path segment, 'root' for top-level files
}

const TYPE_PATHS: Array<[string, VaultFile['type']]> = [
	['memory/', 'memory'],
	['sessions/', 'session'],
	['inbox/', 'inbox'],
	['.claude/agents/', 'agent'],
	['.claude/skills/', 'skill'],
	['.claude/commands/', 'command'],
]

export async function walkVault(
	vaultRoot: string,
	maxFiles = 2000,
): Promise<{files: VaultFile[]; truncated: boolean}> {
	const files: VaultFile[] = []
	let truncated = false

	async function walk(dir: string): Promise<void> {
		if (files.length >= maxFiles) {
			truncated = true
			return
		}
		const entries = await readdir(path.join(vaultRoot, dir), {
			withFileTypes: true,
		})
		for (const entry of entries) {
			if (entry.name.startsWith('.deleted-')) continue
			const relPath = dir === '.' ? entry.name : path.join(dir, entry.name)
			if (entry.isDirectory()) {
				// Defensive: skip transitively-huge dirs we never want to graph.
				if (entry.name === 'node_modules' || entry.name === '.git') continue
				await walk(relPath)
				if (files.length >= maxFiles) {
					truncated = true
					return
				}
			} else if (entry.name.endsWith('.md')) {
				if (files.length >= maxFiles) {
					truncated = true
					return
				}
				const fullPath = path.join(vaultRoot, relPath)
				const [content, st] = await Promise.all([
					readFile(fullPath, 'utf8'),
					stat(fullPath),
				])
				const {frontmatter, body} = parseFrontmatter(content)
				const wikilinks = extractWikilinks(body)
				const normalizedRel = relPath.replace(/\\/g, '/')
				files.push({
					path: normalizedRel,
					type: classifyType(normalizedRel),
					size: st.size,
					mtime: Math.floor(st.mtimeMs),
					frontmatter,
					wikilinks,
					topDir: deriveTopDir(normalizedRel), // Phase 179-01 addition
				})
			}
		}
	}

	await walk('.')
	return {files, truncated}
}

function classifyType(relPath: string): VaultFile['type'] {
	for (const [prefix, type] of TYPE_PATHS) {
		if (relPath.startsWith(prefix)) return type
	}
	return 'root'
}

// Phase 179-01: derive topDir from a vault-relative forward-slash path.
// Returns the first path segment or 'root' if no '/' present (top-level file).
function deriveTopDir(relPath: string): string {
	const slash = relPath.indexOf('/')
	return slash === -1 ? 'root' : relPath.slice(0, slash)
}
