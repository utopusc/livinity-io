// Phase 84 V32-MCP — ConfiguredMcpList (per-agent installed MCP rows).
//
// Renders a list of currently-configured MCP servers for an agent. Each
// row shows:
//   - Server color pill (from P83's getMCPServerColor — stable per name)
//   - Server name (mono)
//   - Source tag (Official / Smithery)
//   - Enabled tool count
//   - Remove "X" button (with inline confirmation toast)
//
// Empty state: "No MCP servers configured. Click + MCP Server to add one."

import {IconLoader2, IconPlugConnected, IconX} from '@tabler/icons-react'
import {toast} from 'sonner'

import {Button} from '@/shadcn-components/ui/button'
import {cn} from '@/shadcn-lib/utils'
import {getMCPServerColor} from '@/routes/ai-chat/v32/views/get-mcp-server-color'

import {useRemoveMcpFromAgent} from './mcp-api'
import type {ConfiguredMcp} from './types'

interface ConfiguredMcpListProps {
	configuredMcps: ConfiguredMcp[]
	agentId: string
	onChanged: () => void
	disabled?: boolean
}

export function ConfiguredMcpList({
	configuredMcps,
	agentId,
	onChanged,
	disabled,
}: ConfiguredMcpListProps) {
	const removeMutation = useRemoveMcpFromAgent()

	if (configuredMcps.length === 0) {
		return (
			<div
				className='rounded-2xl border border-dashed border-liv-border bg-liv-muted/30 px-6 py-8 text-center'
				data-testid='mcp-configured-empty'
			>
				<IconPlugConnected
					size={28}
					className='mx-auto mb-2 text-liv-muted-foreground'
					aria-hidden='true'
				/>
				<p className='text-sm font-medium text-liv-foreground'>
					No MCP servers configured
				</p>
				<p className='mt-1 text-xs text-liv-muted-foreground'>
					Click <span className='font-semibold'>+ MCP Server</span> to add one.
				</p>
			</div>
		)
	}

	const handleRemove = (serverName: string) => {
		removeMutation.mutate(
			{agentId, serverName},
			{
				onSuccess: () => {
					toast.success(`Removed ${serverName}`)
					onChanged()
				},
				onError: (err) => toast.error(`Could not remove: ${err.message}`),
			},
		)
	}

	const removingName =
		removeMutation.isPending && removeMutation.variables ? removeMutation.variables.serverName : null

	return (
		<ul
			className='divide-y divide-liv-border overflow-hidden rounded-2xl border border-liv-border bg-liv-card'
			data-testid='mcp-configured-list'
		>
			{configuredMcps.map((mcp) => {
				const color = getMCPServerColor(mcp.name)
				const isRemoving = removingName === mcp.name
				const sourceLabel = mcp.source === 'smithery' ? 'Smithery' : 'Official'

				return (
					<li
						key={mcp.name}
						className='flex items-center gap-3 px-4 py-3'
						data-testid='mcp-configured-row'
					>
						{/* Color pill (from P83 palette) */}
						<span
							className={cn(
								'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border bg-gradient-to-br',
								color.gradient,
								color.border,
							)}
							aria-hidden='true'
						>
							<IconPlugConnected size={14} className={color.text} />
						</span>

						<div className='min-w-0 flex-1'>
							<p className='truncate text-sm font-medium text-liv-foreground'>
								{mcp.name}
							</p>
							<p className='text-xs text-liv-muted-foreground'>
								<span className='inline-flex items-center gap-1'>
									<span>{sourceLabel}</span>
									<span aria-hidden>·</span>
									<span>
										{mcp.enabledTools.length}{' '}
										{mcp.enabledTools.length === 1 ? 'tool' : 'tools'}
									</span>
								</span>
							</p>
						</div>

						<Button
							variant='default'
							size='sm'
							className='h-8 w-8 p-0 text-liv-muted-foreground hover:text-liv-destructive'
							onClick={() => handleRemove(mcp.name)}
							disabled={disabled || isRemoving}
							aria-label={`Remove ${mcp.name}`}
							data-testid='mcp-configured-remove'
						>
							{isRemoving ? (
								<IconLoader2 size={14} className='animate-spin' />
							) : (
								<IconX size={14} />
							)}
						</Button>
					</li>
				)
			})}
		</ul>
	)
}
