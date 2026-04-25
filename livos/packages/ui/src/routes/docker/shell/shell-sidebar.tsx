// Phase 29 Plan 29-01 — ShellSidebar (DOC-15).
//
// Left 240px column inside the Shell section. Lists running containers in the
// SELECTED environment (via useContainers, env-aware through
// useSelectedEnvironmentId). Each row click fires onSelect(name) which the
// parent uses to addTab() — no checkboxes, just click-to-open-shell.
//
// Mirrors LogsSidebar layout (Plan 28-01) for visual symmetry: same width,
// same color circle, same dark header. The differences:
//   - No checkboxes (rows are buttons that fire onSelect).
//   - No connection-state dots (each session lives in its own ExecTabPane;
//     this sidebar doesn't track per-tab WS state).
//   - Footer hint instead of select-all/clear actions.

import {IconBox, IconRefresh} from '@tabler/icons-react'

import {useContainers} from '@/hooks/use-containers'
import {cn} from '@/shadcn-lib/utils'

import {colorForContainer} from '../logs/log-color'

interface ShellSidebarProps {
	onSelect: (containerName: string) => void
}

export function ShellSidebar({onSelect}: ShellSidebarProps) {
	const {containers, isLoading, isError, isFetching, refetch} = useContainers()

	const runningContainers = containers.filter((c) => c.state === 'running')

	return (
		<aside
			aria-label='shell container picker'
			className='flex w-60 shrink-0 flex-col border-r border-border-default bg-surface-base'
		>
			{/* Header */}
			<div className='flex h-12 items-center justify-between border-b border-border-default px-3'>
				<div className='flex items-center gap-2 text-sm font-semibold text-text-primary'>
					<IconBox size={16} className='text-text-tertiary' />
					<span>Containers</span>
					<span className='text-xs font-normal text-text-tertiary'>
						({runningContainers.length})
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
					<div className='p-4 text-xs text-text-tertiary'>No running containers in this environment.</div>
				) : (
					<ul className='py-1'>
						{runningContainers.map((c) => (
							<li key={c.name}>
								<button
									type='button'
									onClick={() => onSelect(c.name)}
									className={cn(
										'flex h-7 w-full cursor-pointer items-center gap-2 px-3 text-xs transition-colors',
										'hover:bg-surface-1',
									)}
								>
									<span
										aria-hidden
										className='inline-block size-2 shrink-0 rounded-full'
										style={{backgroundColor: colorForContainer(c.name)}}
									/>
									<span className='min-w-0 flex-1 truncate text-left font-mono text-text-primary'>{c.name}</span>
								</button>
							</li>
						))}
					</ul>
				)}
			</div>

			{/* Footer hint */}
			<div className='border-t border-border-default px-3 py-2 text-[11px] text-text-tertiary'>
				Click a container to open a shell.
			</div>
		</aside>
	)
}
