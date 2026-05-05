/** McpToolView — Phase 69-04 (VIEWS-09).
 *  Spec: 69-CONTEXT.md D-27 + v31-DRAFT lines 465-468.
 *  P69 scope: server-name badge + tool name + JSON args + JSON result.
 *  NO mcp-content-renderer rich rendering (deferred — 69-CONTEXT D-27).
 *
 *  Server-name extraction supports BOTH Suna naming conventions:
 *    - `mcp_<server>_<tool>` — e.g. `mcp_brave_search` → server `brave`
 *    - `mcp-<server>-<tool>` — e.g. `mcp-anthropic-search` → server `anthropic`
 *  Falls back to `'MCP'` when the toolName cannot be parsed.
 *
 *  Hard rule: ToolViewProps imported from sibling `./types` (P68-02 file).
 *  Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` UNTOUCHED.
 */

import {LivIcons} from '@/icons/liv-icons'
import {Badge} from '@/shadcn-components/ui/badge'

import type {ToolViewProps} from './types'

/** Parse `mcp_<server>_<tool>` or `mcp-<server>-<tool>` → server name.
 *  Falls back to `'MCP'` if unparseable. Exported for unit tests. */
export function extractServerName(toolName: string): string {
	if (toolName.startsWith('mcp_')) {
		const parts = toolName.split('_')
		return parts.length >= 3 ? parts[1]! : 'MCP'
	}
	if (toolName.startsWith('mcp-')) {
		const parts = toolName.split('-')
		return parts.length >= 3 ? parts[1]! : 'MCP'
	}
	return 'MCP'
}

export function McpToolView({snapshot}: ToolViewProps): JSX.Element {
	const Icon = LivIcons.mcp
	const serverName = extractServerName(snapshot.toolName)
	const argsJson = JSON.stringify(snapshot.assistantCall.input, null, 2)
	const resultJson = snapshot.toolResult
		? JSON.stringify(snapshot.toolResult.output, null, 2)
		: null

	return (
		<div className='flex flex-col gap-3 p-3' data-testid='liv-mcp-tool-view'>
			<header className='flex items-center gap-2'>
				<Icon className='size-4 text-[color:var(--liv-text-secondary)]' aria-hidden />
				<Badge>{serverName}</Badge>
				<code className='truncate font-mono text-13'>{snapshot.toolName}</code>
			</header>
			<section className='flex flex-col gap-1'>
				<div className='text-12 text-[color:var(--liv-text-secondary)]'>Args</div>
				<pre className='max-h-[30vh] overflow-auto rounded border border-[color:var(--liv-border-subtle)] bg-[color:var(--liv-bg-deep)] p-3 font-mono text-12 whitespace-pre-wrap'>
					{argsJson}
				</pre>
			</section>
			<section className='flex flex-col gap-1'>
				<div className='text-12 text-[color:var(--liv-text-secondary)]'>Result</div>
				<pre
					className={
						'max-h-[40vh] overflow-auto rounded border border-[color:var(--liv-border-subtle)] bg-[color:var(--liv-bg-deep)] p-3 font-mono text-12 whitespace-pre-wrap' +
						(snapshot.status === 'error' ? ' text-[color:var(--liv-accent-rose)]' : '')
					}
				>
					{resultJson ?? 'Pending...'}
				</pre>
			</section>
		</div>
	)
}
