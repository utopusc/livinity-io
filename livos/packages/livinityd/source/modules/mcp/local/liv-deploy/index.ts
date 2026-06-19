#!/usr/bin/env tsx
/**
 * liv-deploy MCP server — Phase 288 T2.
 *
 * Local stdio MCP server exposing custom-app deploy to the chat agent.
 * Unlike liv-apps (read-only), this server has a SINGLE mutating tool
 * (`deploy_app`) marked DESTRUCTIVE: so it routes through livinityd's
 * approval gate (mirrors `liv-docker`'s `docker_restart_container`). The AI
 * uses it to deploy a custom Docker image / compose to this LivOS box and
 * mint a public `{slug}-{user}.livinity.io` URL.
 *
 * Tools:
 *   - deploy_app   → POST /trpc/apps.deployCustom (DESTRUCTIVE, gated)
 *
 * Calls livinityd's tRPC over LIVINITYD_API_URL with LIV_API_KEY (matches the
 * liv-apps env-thread pattern from Phase 219 T3 / 245.1). The compose is
 * sanitized server-side by apps.deployCustom (Phase 288-01 force-sanitizer);
 * this MCP layer adds no bypass. When the env-thread is incomplete the tool
 * fails-closed with an operator-readable error.
 *
 * Spawn:
 *   tsx /opt/livos/packages/livinityd/source/modules/mcp/local/liv-deploy/index.ts
 *
 * Stderr-only logging (stdout is the MCP transport).
 */
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {z} from 'zod'

async function callDeploy(apiUrl: string, apiKey: string, input: unknown): Promise<unknown> {
	const res = await fetch(`${apiUrl}/trpc/apps.deployCustom`, {
		method: 'POST',
		headers: {'X-Api-Key': apiKey, 'Content-Type': 'application/json'},
		body: JSON.stringify(input),
		signal: AbortSignal.timeout(120_000), // image pull + build is slow (liv-apps uses 5_000 for a read)
	})
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} from apps.deployCustom`)
	}
	const data = (await res.json()) as {result?: {data?: unknown}}
	return data.result?.data ?? null
}

async function main(): Promise<void> {
	const apiUrl = process.env.LIVINITYD_API_URL
	const apiKey = process.env.LIV_API_KEY
	const envReady = typeof apiUrl === 'string' && apiUrl.length > 0 && typeof apiKey === 'string' && apiKey.length > 0

	if (!envReady) {
		process.stderr.write(
			'[liv-deploy] warning: LIVINITYD_API_URL / LIV_API_KEY env-thread incomplete; tools will fail-closed\n',
		)
	}

	const server = new McpServer({name: 'liv-deploy', version: '1.0.0'})

	const requireEnv = (): {apiUrl: string; apiKey: string} | null => {
		if (!envReady) return null
		return {apiUrl: apiUrl as string, apiKey: apiKey as string}
	}

	server.tool(
		'deploy_app',
		'DESTRUCTIVE: deploy a custom Docker app (image or full compose) to this LivOS box and get a public {slug}-{user}.livinity.io URL. Routes through the LivOS approval gate. The compose is sanitized (no privileged / host-net / docker.sock / host binds outside app-data).',
		{
			slug: z
				.string()
				.min(1)
				.regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'slug: lowercase alnum + hyphen')
				.describe('App slug; becomes {slug}-{user}.livinity.io.'),
			image: z
				.string()
				.optional()
				.describe('Docker image ref (e.g. nginx:latest) — synthesized into a one-service compose.'),
			dockerCompose: z
				.string()
				.optional()
				.describe('Full docker-compose.yml as a string (alternative to image).'),
			port: z.number().int().min(1).max(65535).describe('Container port the web UI listens on.'),
			manifest: z.object({name: z.string(), icon: z.string().optional()}).optional(),
		},
		async ({slug, image, dockerCompose, port, manifest}) => {
			const env = requireEnv()
			if (!env) {
				return {
					content: [{type: 'text', text: 'env-thread incomplete (LIVINITYD_API_URL / LIV_API_KEY missing)'}],
					isError: true,
				}
			}
			try {
				const result = await callDeploy(env.apiUrl, env.apiKey, {slug, image, dockerCompose, port, manifest})
				return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]}
			} catch (err) {
				return {
					content: [{type: 'text', text: `deploy_app failed: ${(err as Error).message}`}],
					isError: true,
				}
			}
		},
	)

	const transport = new StdioServerTransport()
	await server.connect(transport)
	process.stderr.write(`[liv-deploy] connected via stdio transport (1 tool, env-ready=${envReady})\n`)
}

main().catch((err) => {
	process.stderr.write(`[liv-deploy] fatal: ${(err as Error).stack ?? String(err)}\n`)
	process.exit(1)
})
