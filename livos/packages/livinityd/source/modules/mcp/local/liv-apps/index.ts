#!/usr/bin/env tsx
/**
 * liv-apps MCP server — Phase 219 T3.
 *
 * Local stdio MCP server exposing LivOS app instances to the chat agent.
 * Read-only — installs/uninstalls remain operator-controlled via the App
 * Store UI; this MCP only surfaces "what's installed and where does it live".
 *
 * Tools:
 *   - apps_list                   → all installed app instances (slug, subdomain, port, status)
 *   - apps_get_subdomain          → resolve `<slug>` → `<subdomain>-<user>.<root>` URL
 *   - apps_get_port               → resolve `<slug>` → exposed container port
 *
 * Calls livinityd's tRPC over LIVINITYD_API_URL with LIV_API_KEY (matches the
 * luse-mcp env-thread pattern from Phase 161-03). When env-thread is
 * incomplete the tools fail-closed with an operator-readable error.
 */
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {z} from 'zod'

interface AppRow {
	slug?: string
	subdomain?: string
	port?: number
	status?: string
	name?: string
	[k: string]: unknown
}

async function fetchAppList(apiUrl: string, apiKey: string): Promise<AppRow[]> {
	const res = await fetch(`${apiUrl}/trpc/apps.list?input=`, {
		headers: {'X-Api-Key': apiKey},
		signal: AbortSignal.timeout(5_000),
	})
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} from apps.list`)
	}
	const data = (await res.json()) as {result?: {data?: AppRow[]}}
	return data.result?.data ?? []
}

async function main(): Promise<void> {
	const apiUrl = process.env.LIVINITYD_API_URL
	const apiKey = process.env.LIV_API_KEY
	const envReady = typeof apiUrl === 'string' && apiUrl.length > 0 && typeof apiKey === 'string' && apiKey.length > 0

	if (!envReady) {
		process.stderr.write(
			'[liv-apps] warning: LIVINITYD_API_URL / LIV_API_KEY env-thread incomplete; tools will fail-closed\n',
		)
	}

	const server = new McpServer({name: 'liv-apps', version: '1.0.0'})

	const requireEnv = (): {apiUrl: string; apiKey: string} | null => {
		if (!envReady) return null
		return {apiUrl: apiUrl as string, apiKey: apiKey as string}
	}

	server.tool(
		'apps_list',
		'List all installed LivOS app instances. Each entry has slug, subdomain, port, status. Calls livinityd tRPC `apps.list`.',
		{},
		async () => {
			const env = requireEnv()
			if (!env) {
				return {
					content: [{type: 'text', text: 'env-thread incomplete (LIVINITYD_API_URL / LIV_API_KEY missing)'}],
					isError: true,
				}
			}
			try {
				const rows = await fetchAppList(env.apiUrl, env.apiKey)
				// Wrap array in a record — MCP clients (gemini-cli) reject a bare
				// top-level JSON array with "expected record, received array".
				return {content: [{type: 'text', text: JSON.stringify({apps: rows, count: rows.length}, null, 2)}]}
			} catch (err) {
				return {
					content: [{type: 'text', text: `apps.list failed: ${(err as Error).message}`}],
					isError: true,
				}
			}
		},
	)

	server.tool(
		'apps_get_subdomain',
		'Resolve a LivOS app slug to its public subdomain URL. Returns null if the app is not installed.',
		{slug: z.string().min(1).describe('App slug (e.g. `filebrowser`, `n8n`).')},
		async ({slug}) => {
			const env = requireEnv()
			if (!env) {
				return {
					content: [{type: 'text', text: 'env-thread incomplete (LIVINITYD_API_URL / LIV_API_KEY missing)'}],
					isError: true,
				}
			}
			try {
				const rows = await fetchAppList(env.apiUrl, env.apiKey)
				const row = rows.find((r) => r.slug === slug)
				const payload = {slug, subdomain: row?.subdomain ?? null, found: Boolean(row)}
				return {content: [{type: 'text', text: JSON.stringify(payload, null, 2)}]}
			} catch (err) {
				return {
					content: [{type: 'text', text: `apps.list failed: ${(err as Error).message}`}],
					isError: true,
				}
			}
		},
	)

	server.tool(
		'apps_get_port',
		'Resolve a LivOS app slug to its exposed container port. Returns null if the app is not installed.',
		{slug: z.string().min(1).describe('App slug.')},
		async ({slug}) => {
			const env = requireEnv()
			if (!env) {
				return {
					content: [{type: 'text', text: 'env-thread incomplete'}],
					isError: true,
				}
			}
			try {
				const rows = await fetchAppList(env.apiUrl, env.apiKey)
				const row = rows.find((r) => r.slug === slug)
				const payload = {slug, port: row?.port ?? null, found: Boolean(row)}
				return {content: [{type: 'text', text: JSON.stringify(payload, null, 2)}]}
			} catch (err) {
				return {
					content: [{type: 'text', text: `apps.list failed: ${(err as Error).message}`}],
					isError: true,
				}
			}
		},
	)

	const transport = new StdioServerTransport()
	await server.connect(transport)
	process.stderr.write(`[liv-apps] connected via stdio transport (3 tools, env-ready=${envReady})\n`)
}

main().catch((err) => {
	process.stderr.write(`[liv-apps] fatal: ${(err as Error).stack ?? String(err)}\n`)
	process.exit(1)
})
