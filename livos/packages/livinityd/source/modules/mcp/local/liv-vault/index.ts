#!/usr/bin/env tsx
/**
 * liv-vault MCP server — Phase 219 T3.
 *
 * Local stdio MCP server for note CRUD under the canonical agent-state root
 * `~bruce/livinity/<agent>/notes/`. The "vault" name is historical; the
 * filesystem layout aligns with the feedback_v38_3_drop_vault_concept rule:
 * one dir under livinity/ per agent slug, no separate vault/ subtree.
 *
 * Tools:
 *   - vault_list_notes    → list note filenames for a given agent
 *   - vault_read_note     → read a note's markdown body
 *   - vault_write_note    → create/overwrite a note (destructive)
 *   - vault_delete_note   → delete a note (destructive)
 *
 * Notes live at `~bruce/livinity/<agent>/notes/<slug>.md` where:
 *   - `agent` matches `^[a-z0-9][a-z0-9_-]{0,63}$`
 *   - `slug`  matches `^[a-z0-9][a-z0-9_.-]{0,127}$` (no `..`)
 *
 * Both rules are enforced server-side; an illegal name returns an error
 * instead of silently coercing or escaping outside the agent dir.
 */
import {existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join, resolve} from 'node:path'

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {z} from 'zod'

const AgentSlug = z
	.string()
	.regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, 'agent slug must be lowercase alphanumeric (+ _-), 1-64 chars')

const NoteSlug = z
	.string()
	.regex(/^[a-z0-9][a-z0-9_.-]{0,127}$/, 'note slug must be lowercase alphanumeric (+ ._-), 1-128 chars')
	.refine((s) => !s.includes('..'), 'note slug may not contain ".." path traversal')

const VAULT_ROOT = process.env.LIV_VAULT_ROOT ?? join(homedir(), 'livinity')

function ensureAgentDir(agent: string): string {
	const dir = resolve(VAULT_ROOT, agent, 'notes')
	if (!dir.startsWith(resolve(VAULT_ROOT) + (process.platform === 'win32' ? '\\' : '/'))) {
		throw new Error(`agent dir resolved outside vault root: ${dir}`)
	}
	if (!existsSync(dir)) {
		mkdirSync(dir, {recursive: true, mode: 0o700})
	}
	return dir
}

function notePath(agent: string, slug: string): string {
	return join(ensureAgentDir(agent), `${slug}.md`)
}

async function main(): Promise<void> {
	const server = new McpServer({name: 'liv-vault', version: '1.0.0'})

	server.tool(
		'vault_list_notes',
		'List note filenames for a given agent. Returns [{slug, bytes, modified_at}].',
		{agent: AgentSlug.describe('Agent slug (the dir under ~bruce/livinity/).')},
		async ({agent}) => {
			try {
				const dir = ensureAgentDir(agent)
				const entries = readdirSync(dir)
					.filter((f) => f.endsWith('.md'))
					.map((f) => {
						const st = statSync(join(dir, f))
						return {slug: f.replace(/\.md$/, ''), bytes: st.size, modified_at: st.mtime.toISOString()}
					})
				// Wrap array in a record — MCP clients (gemini-cli) reject a bare
				// top-level JSON array with "expected record, received array".
				return {content: [{type: 'text', text: JSON.stringify({entries, count: entries.length}, null, 2)}]}
			} catch (err) {
				return {
					content: [{type: 'text', text: `list_notes failed: ${(err as Error).message}`}],
					isError: true,
				}
			}
		},
	)

	server.tool(
		'vault_read_note',
		'Read a note’s markdown body. Returns the raw text; non-existent slugs return an isError result.',
		{agent: AgentSlug, slug: NoteSlug.describe('Note slug (without `.md` extension).')},
		async ({agent, slug}) => {
			try {
				const p = notePath(agent, slug)
				if (!existsSync(p)) {
					return {content: [{type: 'text', text: `note not found: ${agent}/${slug}.md`}], isError: true}
				}
				const body = readFileSync(p, 'utf8')
				return {content: [{type: 'text', text: body}]}
			} catch (err) {
				return {
					content: [{type: 'text', text: `read_note failed: ${(err as Error).message}`}],
					isError: true,
				}
			}
		},
	)

	server.tool(
		'vault_write_note',
		'DESTRUCTIVE: create or overwrite a note. Routes through the LivOS approval gate.',
		{
			agent: AgentSlug,
			slug: NoteSlug.describe('Note slug (without `.md` extension).'),
			body: z.string().max(1_000_000).describe('Markdown body; max 1 MB.'),
		},
		async ({agent, slug, body}) => {
			try {
				const p = notePath(agent, slug)
				writeFileSync(p, body, {mode: 0o600})
				return {content: [{type: 'text', text: `Wrote ${agent}/${slug}.md (${body.length} bytes)`}]}
			} catch (err) {
				return {
					content: [{type: 'text', text: `write_note failed: ${(err as Error).message}`}],
					isError: true,
				}
			}
		},
	)

	server.tool(
		'vault_delete_note',
		'DESTRUCTIVE: delete a note. Routes through the LivOS approval gate.',
		{agent: AgentSlug, slug: NoteSlug},
		async ({agent, slug}) => {
			try {
				const p = notePath(agent, slug)
				if (!existsSync(p)) {
					return {content: [{type: 'text', text: `note not found: ${agent}/${slug}.md`}], isError: true}
				}
				unlinkSync(p)
				return {content: [{type: 'text', text: `Deleted ${agent}/${slug}.md`}]}
			} catch (err) {
				return {
					content: [{type: 'text', text: `delete_note failed: ${(err as Error).message}`}],
					isError: true,
				}
			}
		},
	)

	const transport = new StdioServerTransport()
	await server.connect(transport)
	process.stderr.write(`[liv-vault] connected via stdio transport (4 tools, vault_root=${VAULT_ROOT})\n`)
}

main().catch((err) => {
	process.stderr.write(`[liv-vault] fatal: ${(err as Error).stack ?? String(err)}\n`)
	process.exit(1)
})
