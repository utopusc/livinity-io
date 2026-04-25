// Phase 28 Plan 28-01 — LogsSidebar (DOC-13).
//
// Left mini-sidebar inside the Logs section. Lists running containers in
// the SELECTED environment (via useContainers, which is already env-scoped
// through useSelectedEnvironmentId). Each row: checkbox + 8px deterministic
// color circle + container name + connection-state dot.
//
// Layout: 240px wide on lg+. On md and below it stays 240px (the parent
// scroll container provides horizontal overflow). Phase 29 polish can add
// a collapse toggle if vertical density becomes a concern; for v1 the row
// height is already compact (h-7 ≈ 28px).
//
// State source: useContainers() owns the running-container list + 5s polling.
// We do NOT mutate the container list here — checkboxes ONLY toggle the
// `selectedNames` set in the parent (LogsSection), which feeds the
// useMultiplexedLogs hook.

import {IconBox, IconRefresh} from '@tabler/icons-react'

import {useContainers} from '@/hooks/use-containers'
import {Checkbox} from '@/shadcn-components/ui/checkbox'
import {cn} from '@/shadcn-lib/utils'

import {colorForContainer} from './log-color'
import type {ConnectionState} from './use-multiplexed-logs'

interface LogsSidebarProps {
	selectedNames: string[]
	onToggle: (name: string) => void
	onSelectAll: () => void
	onClearAll: () => void
	states: Record<string, ConnectionState>
}

const STATE_DOT_CLASS: Record<ConnectionState, string> = {
	idle: 'bg-zinc-400',
	connecting: 'bg-amber-400 animate-pulse',
	open: 'bg-emerald-500',
	closed: 'bg-zinc-500',
	error: 'bg-red-500',
}

export function LogsSidebar({
	selectedNames,
	onToggle,
	onSelectAll,
	onClearAll,
	states,
}: LogsSidebarProps) {
	const {containers, isLoading, isError, isFetching, refetch} = useContainers()

	const runningContainers = containers.filter((c) => c.state === 'running')
	const selected = new Set(selectedNames)

	return (
		<aside
			aria-label='container picker'
			className='flex w-60 shrink-0 flex-col border-r border-border-default bg-surface-base'
		>
			{/* Header */}
			<div className='flex h-12 items-center justify-between border-b border-border-default px-3'>
				<div className='flex items-center gap-2 text-sm font-semibold text-text-primary'>
					<IconBox size={16} className='text-text-tertiary' />
					<span>Containers</span>
					<span className='text-xs font-normal text-text-tertiary'>
						({selectedNames.length}/{runningContainers.length})
					</span>
				</div>
				<button
					onClick={() => refetch()}
					disabled={isFetching}
					className='rounded p-1 text-text-tertiary transition-colors hover:bg-surface-1 disabled:opacity-50'
					aria-label='Refresh container list'
				>
					<IconRefresh size={14} className={isFetching ? 'animate-spin' : ''} />
				</button>
			</div>

			{/* Body */}
			<div className='min-h-0 flex-1 overflow-y-auto'>
				{isLoading ? (
					<div className='p-4 text-xs text-text-tertiary'>Loading containers…</div>
				) : isError ? (
					<div className='p-4 text-xs text-red-500'>Failed to load containers.</div>
				) : runningContainers.length === 0 ? (
					<div className='p-4 text-xs text-text-tertiary'>No running containers in this env.</div>
				) : (
					<ul className='py-1'>
						{runningContainers.map((c) => {
							const isChecked = selected.has(c.name)
							const dotClass = states[c.name]
								? STATE_DOT_CLASS[states[c.name]]
								: STATE_DOT_CLASS.idle
							return (
								<li key={c.name}>
									<label
										className={cn(
											'flex h-7 cursor-pointer items-center gap-2 px-3 text-xs transition-colors',
											'hover:bg-surface-1',
											isChecked && 'bg-brand/5',
										)}
									>
										<Checkbox
											checked={isChecked}
											onCheckedChange={() => onToggle(c.name)}
											aria-label={`Stream logs for ${c.name}`}
											className='h-4 w-4'
										/>
										<span
											aria-hidden
											className='inline-block size-2 shrink-0 rounded-full'
											style={{backgroundColor: colorForContainer(c.name)}}
										/>
										<span className='min-w-0 flex-1 truncate font-mono text-text-primary'>{c.name}</span>
										<span
											aria-label={`connection: ${states[c.name] ?? 'idle'}`}
											title={states[c.name] ?? 'idle'}
											className={cn('inline-block size-1.5 shrink-0 rounded-full', dotClass)}
										/>
									</label>
								</li>
							)
						})}
					</ul>
				)}
			</div>

			{/* Footer */}
			<div className='flex items-center justify-between gap-1 border-t border-border-default p-2 text-xs'>
				<button
					onClick={onSelectAll}
					disabled={runningContainers.length === 0}
					className='flex-1 rounded px-2 py-1 text-text-secondary transition-colors hover:bg-surface-1 disabled:opacity-50'
				>
					Select all
				</button>
				<button
					onClick={onClearAll}
					disabled={selectedNames.length === 0}
					className='flex-1 rounded px-2 py-1 text-text-secondary transition-colors hover:bg-surface-1 disabled:opacity-50'
				>
					Clear
				</button>
			</div>
		</aside>
	)
}
