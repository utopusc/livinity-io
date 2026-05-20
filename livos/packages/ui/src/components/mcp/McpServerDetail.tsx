/**
 * Phase 182-04 — McpServerDetail
 *
 * Presentational component — no tRPC / REST calls.
 * Displays details of a selected MCP server: transport, command/url,
 * tools list, connected timestamp, last error, and close button.
 */

import {
	IconX,
	IconPlug,
	IconPlugOff,
	IconTerminal2,
	IconWorld,
	IconAlertCircle,
} from '@tabler/icons-react'
import {type McpServerConfig, type McpServerStatus} from './McpServerList'

export interface McpServerDetailProps {
	server: {name: string; config: McpServerConfig; status?: McpServerStatus} | null
	onClose: () => void
	onToggleEnabled: (name: string, enabled: boolean) => void
}

export function McpServerDetail({server, onClose, onToggleEnabled}: McpServerDetailProps) {
	if (!server) {
		return (
			<div
				data-testid='mcp-detail-empty'
				className='flex flex-col items-center justify-center h-full text-text-tertiary py-16'
			>
				<IconPlug size={24} className='mb-2' />
				<p className='text-body-sm'>Select a server</p>
			</div>
		)
	}

	const {name, config, status} = server
	const isRunning = status?.running ?? false

	return (
		<div data-testid='mcp-server-detail' className='rounded-radius-lg border border-border-default bg-surface-base p-4 h-full flex flex-col'>
			{/* Header */}
			<div className='flex items-start justify-between mb-4'>
				<div>
					<h3 className='text-body font-semibold text-text-primary'>{name}</h3>
					<div className='flex items-center gap-1.5 mt-1'>
						<span className={`h-2 w-2 rounded-full ${isRunning ? 'bg-accent-green' : 'bg-text-tertiary'}`} />
						<span className='text-caption-sm text-text-tertiary'>
							{isRunning ? 'Connected' : config.enabled ? 'Connecting...' : 'Disabled'}
						</span>
						<span className='flex items-center gap-0.5 rounded px-1 py-0.5 bg-surface-2 text-[10px] text-text-tertiary'>
							{config.transport === 'stdio'
								? <><IconTerminal2 size={9} />stdio</>
								: <><IconWorld size={9} />http</>}
						</span>
					</div>
				</div>
				<button
					data-testid='mcp-detail-close'
					onClick={onClose}
					className='rounded-radius-sm p-1.5 text-text-tertiary transition-colors hover:bg-surface-1 hover:text-text-secondary'
					aria-label='Close'
				>
					<IconX size={15} />
				</button>
			</div>

			{/* Connection info */}
			<div className='space-y-2 text-caption-sm flex-1 min-h-0 overflow-y-auto'>
				{config.command && (
					<div>
						<p className='text-text-tertiary font-medium mb-0.5'>Command</p>
						<code className='font-mono text-text-secondary block bg-surface-1 rounded px-2 py-1'>
							{config.command} {config.args?.join(' ')}
						</code>
					</div>
				)}
				{config.url && (
					<div>
						<p className='text-text-tertiary font-medium mb-0.5'>URL</p>
						<code className='font-mono text-text-secondary block bg-surface-1 rounded px-2 py-1 truncate'>
							{config.url}
						</code>
					</div>
				)}
				{config.description && (
					<p className='text-text-tertiary'>{config.description}</p>
				)}
				{status?.connectedAt && (
					<div>
						<p className='text-text-tertiary font-medium mb-0.5'>Connected</p>
						<p className='text-text-secondary'>{new Date(status.connectedAt).toLocaleString()}</p>
					</div>
				)}
				{status?.tools && status.tools.length > 0 && (
					<div>
						<p className='text-text-tertiary font-medium mb-1'>Tools ({status.tools.length})</p>
						<div className='flex flex-wrap gap-1'>
							{status.tools.map((t) => (
								<span key={t} className='rounded px-1.5 py-0.5 bg-surface-2 text-text-tertiary font-mono text-[10px]'>
									{t}
								</span>
							))}
						</div>
					</div>
				)}
				{status?.lastError && (
					<div className='flex items-start gap-1.5 rounded-radius-md bg-red-500/10 px-3 py-2 text-red-400'>
						<IconAlertCircle size={13} className='mt-0.5 shrink-0' />
						<span className='font-mono text-[11px]'>{status.lastError}</span>
					</div>
				)}
			</div>

			{/* Footer actions */}
			<div className='mt-4 pt-3 border-t border-border-subtle'>
				<button
					onClick={() => onToggleEnabled(name, !config.enabled)}
					className={`flex items-center gap-1.5 rounded-radius-md px-3 py-1.5 text-caption-sm font-medium transition-colors ${
						config.enabled
							? 'bg-accent-green/10 text-accent-green hover:bg-accent-green/20'
							: 'bg-surface-1 text-text-secondary hover:bg-surface-2'
					}`}
				>
					{config.enabled ? <IconPlug size={13} /> : <IconPlugOff size={13} />}
					{config.enabled ? 'Disable' : 'Enable'}
				</button>
			</div>
		</div>
	)
}
