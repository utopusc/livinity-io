#!/usr/bin/env tsx
/**
 * liv-docker MCP server — Phase 219 T3.
 *
 * Local stdio MCP server exposing the host Docker daemon to the LivOS chat
 * agent. Read-by-default; the single mutating tool (`docker_restart_container`)
 * is marked destructive so it routes through livinityd's approval gate
 * (matches `mcp__luse__*` destructive tooling pattern).
 *
 * Tools:
 *   - docker_list_containers     → parsed `docker ps --format json`
 *   - docker_container_logs      → `docker logs --tail N <id|name>`
 *   - docker_restart_container   → `docker restart <id|name>` (destructive)
 *
 * Spawn:
 *   tsx /opt/livos/packages/livinityd/source/modules/mcp/local/liv-docker/index.ts
 *
 * Stderr-only logging.
 */
import {execSync} from 'node:child_process'

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {z} from 'zod'

const ContainerRef = z
	.string()
	.regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/, 'container ref must be alphanumeric + ._-, max 128 chars')

function dockerExec(cmd: string): string {
	return execSync(cmd, {encoding: 'utf8', timeout: 15_000, maxBuffer: 4 * 1024 * 1024})
}

async function main(): Promise<void> {
	const server = new McpServer({name: 'liv-docker', version: '1.0.0'})

	server.tool(
		'docker_list_containers',
		'List running Docker containers on the LivOS host. Returns parsed `docker ps --format json` (one object per container: ID, Image, Names, Status, Ports).',
		{all: z.boolean().default(false).describe('Include stopped containers when true (docker ps -a).')},
		async ({all}) => {
			try {
				const out = dockerExec(`docker ps ${all ? '-a' : ''} --format '{{json .}}'`)
				const rows = out
					.split('\n')
					.filter((l) => l.trim().length > 0)
					.map((l) => {
						try {
							return JSON.parse(l) as Record<string, unknown>
						} catch {
							return {raw: l}
						}
					})
				return {content: [{type: 'text', text: JSON.stringify(rows, null, 2)}]}
			} catch (err) {
				return {
					content: [{type: 'text', text: `docker ps failed: ${(err as Error).message}`}],
					isError: true,
				}
			}
		},
	)

	server.tool(
		'docker_container_logs',
		'Tail the last N log lines for a Docker container (default 100, max 1000).',
		{
			container: ContainerRef.describe('Container ID or name.'),
			tail: z.number().int().min(1).max(1000).default(100),
		},
		async ({container, tail}) => {
			try {
				const out = dockerExec(`docker logs --tail ${tail} "${container}" 2>&1`)
				return {content: [{type: 'text', text: out.slice(-32_000)}]}
			} catch (err) {
				return {
					content: [{type: 'text', text: `docker logs failed: ${(err as Error).message}`}],
					isError: true,
				}
			}
		},
	)

	server.tool(
		'docker_restart_container',
		'DESTRUCTIVE: restart a Docker container. Routes through the LivOS approval gate (D-LIV-DOCKER-DESTRUCTIVE).',
		{container: ContainerRef.describe('Container ID or name to restart.')},
		async ({container}) => {
			try {
				const out = dockerExec(`docker restart "${container}"`)
				return {content: [{type: 'text', text: `Restarted: ${out.trim()}`}]}
			} catch (err) {
				return {
					content: [{type: 'text', text: `docker restart failed: ${(err as Error).message}`}],
					isError: true,
				}
			}
		},
	)

	const transport = new StdioServerTransport()
	await server.connect(transport)
	process.stderr.write('[liv-docker] connected via stdio transport (3 tools)\n')
}

main().catch((err) => {
	process.stderr.write(`[liv-docker] fatal: ${(err as Error).stack ?? String(err)}\n`)
	process.exit(1)
})
