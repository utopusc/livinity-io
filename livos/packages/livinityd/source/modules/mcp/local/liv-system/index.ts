#!/usr/bin/env tsx
/**
 * liv-system MCP server — Phase 219 T3.
 *
 * Local stdio MCP server exposing host system metrics to the LivOS chat
 * agent. Read-only surface — no mutating tools, no destructive operations.
 *
 * Tools:
 *   - system_cpu      → core count, model, load average, per-core %
 *   - system_memory   → total/free/used bytes + percent
 *   - system_disk     → df-style breakdown for / (and an optional path)
 *   - system_uptime   → seconds since boot + ISO timestamp
 *
 * Spawn (registered as a system MCP — see SYSTEM_MCP_NAMES in
 * mcp-config-router.ts):
 *   tsx /opt/livos/packages/livinityd/source/modules/mcp/local/liv-system/index.ts
 *
 * Logs go to stderr exclusively. stdout is reserved for the MCP JSON-RPC wire.
 */
import {execSync} from 'node:child_process'
import * as os from 'node:os'

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {z} from 'zod'

function diskUsage(path: string): {
	path: string
	bytes_total: number
	bytes_used: number
	bytes_free: number
	percent_used: number
} {
	const safePath = path.replace(/[^a-zA-Z0-9/_.-]/g, '')
	const out = execSync(`df -B1 --output=size,used,avail "${safePath}" | tail -n 1`, {
		encoding: 'utf8',
		timeout: 5_000,
	})
	const parts = out.trim().split(/\s+/).map(Number)
	const [total = 0, used = 0, avail = 0] = parts
	const percent = total > 0 ? Math.round((used / total) * 1000) / 10 : 0
	return {path: safePath, bytes_total: total, bytes_used: used, bytes_free: avail, percent_used: percent}
}

async function main(): Promise<void> {
	const server = new McpServer({name: 'liv-system', version: '1.0.0'})

	server.tool(
		'system_cpu',
		'Return CPU core count, model, and 1/5/15-minute load averages for the LivOS host.',
		{},
		async () => {
			const cpus = os.cpus()
			const load = os.loadavg()
			const payload = {
				cores: cpus.length,
				model: cpus[0]?.model ?? 'unknown',
				load_1min: Math.round(load[0]! * 100) / 100,
				load_5min: Math.round(load[1]! * 100) / 100,
				load_15min: Math.round(load[2]! * 100) / 100,
				per_core_pct: cpus.map((c) => {
					const total = c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq
					const idle = c.times.idle
					return total > 0 ? Math.round(((total - idle) / total) * 1000) / 10 : 0
				}),
			}
			return {content: [{type: 'text', text: JSON.stringify(payload, null, 2)}]}
		},
	)

	server.tool(
		'system_memory',
		'Return total / free / used memory bytes + percent for the LivOS host.',
		{},
		async () => {
			const total = os.totalmem()
			const free = os.freemem()
			const used = total - free
			const percent = total > 0 ? Math.round((used / total) * 1000) / 10 : 0
			const payload = {bytes_total: total, bytes_used: used, bytes_free: free, percent_used: percent}
			return {content: [{type: 'text', text: JSON.stringify(payload, null, 2)}]}
		},
	)

	server.tool(
		'system_disk',
		'Return disk usage (df -B1) for a given path (default `/`). Output is total/used/free bytes + percent.',
		{path: z.string().default('/').describe('Filesystem path to inspect — defaults to `/`.')},
		async ({path}) => {
			try {
				const payload = diskUsage(path)
				return {content: [{type: 'text', text: JSON.stringify(payload, null, 2)}]}
			} catch (err) {
				return {
					content: [
						{type: 'text', text: `df failed for ${path}: ${err instanceof Error ? err.message : String(err)}`},
					],
					isError: true,
				}
			}
		},
	)

	server.tool(
		'system_uptime',
		'Return seconds-since-boot + an ISO boot-timestamp for the LivOS host.',
		{},
		async () => {
			const seconds = os.uptime()
			const bootAt = new Date(Date.now() - seconds * 1000).toISOString()
			const payload = {uptime_seconds: Math.floor(seconds), boot_at: bootAt}
			return {content: [{type: 'text', text: JSON.stringify(payload, null, 2)}]}
		},
	)

	const transport = new StdioServerTransport()
	await server.connect(transport)
	process.stderr.write('[liv-system] connected via stdio transport (4 tools)\n')
}

main().catch((err) => {
	process.stderr.write(`[liv-system] fatal: ${(err as Error).stack ?? String(err)}\n`)
	process.exit(1)
})
