/**
 * Phase 182-04 — McpServerList
 *
 * Presentational component — no tRPC / REST calls.
 * Displays a searchable list of installed MCP servers with status dots,
 * enable/disable toggles, and remove buttons.
 */

import {useState} from 'react'
import {
	IconCircleFilled,
	IconLoader2,
	IconPlugOff,
	IconPlug,
	IconTrash,
	IconSearch,
	IconTerminal2,
	IconWorld,
} from '@tabler/icons-react'
import {cn} from '@/shadcn-lib/utils'

export type McpServerConfig = {
	name: string
	transport: 'stdio' | 'streamableHttp'
	command?: string
	args?: string[]
	env?: Record<string, string>
	url?: string
	headers?: Record<string, string>
	enabled: boolean
	description?: string
	installedFrom?: string
	installedAt: number
}

export type McpServerStatus = {
	running: boolean
	tools: string[]
	connectedAt?: number
	lastError?: string
}

export interface McpServerListProps {
	servers: Array<{name: string; config: McpServerConfig; status?: McpServerStatus}>
	selectedName: string | null
	onSelect: (name: string) => void
	onToggleEnabled: (name: string, enabled: boolean) => void
	onRemove: (name: string) => void
	isLoading?: boolean
}

export function McpServerList({
	servers,
	selectedName,
	onSelect,
	onToggleEnabled,
	onRemove,
	isLoading,
}: McpServerListProps) {
	const [search, setSearch] = useState('')

	if (isLoading) {
		return (
			<div className='flex items-center justify-center py-8' data-testid='mcp-server-list-loading'>
				<IconLoader2 size={18} className='animate-spin text-text-tertiary' />
			</div>
		)
	}

	const filtered = servers.filter((s) =>
		search ? s.name.toLowerCase().includes(search.toLowerCase()) : true,
	)

	return (
		<div data-testid='mcp-server-list' className='flex flex-col gap-1'>
			{/* Search */}
			<div className='relative mb-1'>
				<IconSearch size={13} className='absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary' />
				<input
					type='text'
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder='Search servers...'
					className='w-full rounded-radius-md border border-border-subtle bg-surface-base py-1.5 pl-8 pr-3 text-caption text-text-primary placeholder-text-tertiary outline-none transition-colors focus:border-brand'
				/>
			</div>

			{filtered.length === 0 && (
				<div className='flex flex-col items-center gap-1 py-6 text-text-tertiary'>
					<IconPlugOff size={18} />
					<span className='text-caption-sm'>No servers</span>
				</div>
			)}

			{filtered.map((s) => {
				const isRunning = s.status?.running ?? false
				const isSelected = selectedName === s.name
				return (
					<button
						key={s.name}
						data-testid={`mcp-server-row-${s.name}`}
						onClick={() => onSelect(s.name)}
						className={cn(
							'relative flex w-full items-center gap-2.5 rounded-radius-md px-3 py-2 text-left transition-colors',
							isSelected ? 'bg-surface-2' : 'hover:bg-surface-1',
						)}
					>
						{/* Status dot */}
						<IconCircleFilled
							size={7}
							className={isRunning ? 'text-accent-green shrink-0' : 'text-text-tertiary shrink-0'}
						/>

						{/* Name + transport */}
						<div className='min-w-0 flex-1'>
							<div className='flex items-center gap-1.5'>
								<span className='truncate text-caption font-medium text-text-primary'>{s.name}</span>
								<span className='flex items-center gap-0.5 rounded px-1 py-0.5 bg-surface-2 text-[10px] text-text-tertiary'>
									{s.config.transport === 'stdio'
										? <><IconTerminal2 size={9} />stdio</>
										: <><IconWorld size={9} />http</>}
								</span>
							</div>
						</div>

						{/* Actions */}
						<div className='flex items-center gap-0.5'>
							<button
								data-testid={`mcp-toggle-${s.name}`}
								onClick={(e) => {
									e.stopPropagation()
									onToggleEnabled(s.name, !s.config.enabled)
								}}
								className={cn(
									'rounded p-1 transition-colors',
									s.config.enabled
										? 'text-accent-green/70 hover:bg-accent-green/10'
										: 'text-text-tertiary hover:bg-surface-2',
								)}
								title={s.config.enabled ? 'Disable' : 'Enable'}
							>
								{s.config.enabled ? <IconPlug size={13} /> : <IconPlugOff size={13} />}
							</button>
							<button
								data-testid={`mcp-remove-${s.name}`}
								onClick={(e) => {
									e.stopPropagation()
									if (confirm(`Remove server "${s.name}"?`)) onRemove(s.name)
								}}
								className='rounded p-1 text-text-tertiary transition-colors hover:bg-red-500/10 hover:text-red-400'
								title='Remove'
							>
								<IconTrash size={13} />
							</button>
						</div>
					</button>
				)
			})}
		</div>
	)
}
