// Phase 189-03 — agent_config_set MCP tool.
// Registered ONLY for an agent's own PTY context (not globally).
// Follows liv-tools.ts registration pattern exactly (Phase 176).
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
// + Phase 162/171/175/176 files UNCHANGED.
// This file is NEW (additive only).

import {z} from 'zod'
import {promises as fs} from 'node:fs'
import * as path from 'node:path'
import type {Redis} from 'ioredis'

export const AGENT_SETUP_TOOL_NAMES = ['agent_config_set'] as const

type ToolResult = {content: Array<{type: 'text'; text: string}>; isError: boolean}
type AnyHandler = (args: unknown) => Promise<ToolResult>
interface McpServerLike {
	tool(
		name: string,
		description: string,
		schema: Record<string, unknown>,
		handler: AnyHandler,
	): void
}
function ok(text: string): ToolResult {
	return {content: [{type: 'text', text}], isError: false}
}
function errResult(text: string): ToolResult {
	return {content: [{type: 'text', text}], isError: true}
}

async function atomicWriteJson(file: string, value: unknown): Promise<void> {
	await fs.mkdir(path.dirname(file), {recursive: true})
	const tmp = file + '.tmp'
	await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf-8')
	await fs.rename(tmp, file)
}

function assertUnderItemsDir(resolved: string, agentDir: string): void {
	const normalized = path.resolve(agentDir)
	if (!resolved.startsWith(normalized + path.sep) && resolved !== normalized) {
		throw new Error(`Path traversal rejected: ${resolved}`)
	}
}

const agentConfigSetSchema = z
	.object({
		mcps: z.array(z.string()).default([]),
		tasks: z.string().min(1).max(2000),
		schedule: z.string().max(200).nullable().default(null),
		tools: z.array(z.string()).nullable().default(null),
	})
	.strict()

const GUIDELINES_MARKER = '## Agent Guidelines'

export interface AgentSetupToolsOptions {
	/** Absolute path to the agent item directory (e.g. <vaultRoot>/items/<id>) */
	agentDir: string
	redis: Redis
}

export function registerAgentSetupTools(
	server: McpServerLike,
	opts: AgentSetupToolsOptions,
): void {
	const {agentDir, redis} = opts

	server.tool(
		'agent_config_set',
		'Save the agent configuration gathered during setup. Call this once after the operator confirms their choices. Sets setup_done to true.',
		agentConfigSetSchema.shape,
		async (args: unknown) => {
			const parse = agentConfigSetSchema.safeParse(args)
			if (!parse.success)
				return errResult(`Validation error: ${parse.error.message}`)
			const {mcps, tasks, schedule, tools} = parse.data
			try {
				const configPath = path.resolve(
					path.join(agentDir, '.agent', 'config.json'),
				)
				assertUnderItemsDir(configPath, agentDir)

				await atomicWriteJson(configPath, {
					setup_done: true,
					mcps,
					tasks,
					schedule,
					tools,
					configured_at: new Date().toISOString(),
				})

				// Append guidelines to claude.md (idempotent — check for marker first)
				const claudeMdPath = path.resolve(path.join(agentDir, 'claude.md'))
				assertUnderItemsDir(claudeMdPath, agentDir)
				let existing = ''
				try {
					existing = await fs.readFile(claudeMdPath, 'utf-8')
				} catch {
					/* file may not exist yet */
				}
				if (!existing.includes(GUIDELINES_MARKER)) {
					const guidelinesSection =
						`\n${GUIDELINES_MARKER}\n` +
						`- Tasks: ${tasks}\n` +
						`- MCPs: ${mcps.join(', ') || 'all'}\n` +
						`- Schedule: ${schedule ?? 'manual'}\n` +
						`- Tools: ${tools ? tools.join(', ') : 'all enabled'}\n` +
						`- Configured: ${new Date().toISOString()}\n`
					await fs.appendFile(claudeMdPath, guidelinesSection, 'utf-8')
				}

				await redis.rpush(
					'liv:audit:agent-setup-tools',
					JSON.stringify({tool: 'agent_config_set', agentDir, ts: Date.now()}),
				)
				await redis.ltrim('liv:audit:agent-setup-tools', -1000, -1)

				return ok(JSON.stringify({success: true, setup_done: true}))
			} catch (e: unknown) {
				return errResult(e instanceof Error ? e.message : String(e))
			}
		},
	)
}
