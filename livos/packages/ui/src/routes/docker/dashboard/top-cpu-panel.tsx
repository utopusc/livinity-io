// Phase 25 Plan 25-02 — Top-CPU panel (DOC-05).
//
// Renders the top-10 cross-env containers by CPU% with three quick-action
// chips per row: Logs / Shell / Restart. Sits BELOW the EnvCardGrid in the
// Dashboard layout.
//
// Quick-action behaviour:
//   - Logs   → setEnvironment(envId) + setSection('logs')
//   - Shell  → setEnvironment(envId) + setSection('shell')
//   - Restart → trpc.docker.manageContainer({operation:'restart', name, envId})
//
// Logs/Shell DO NOT deep-link to a specific container — that's Phase 28
// (DOC-13) and Phase 29 (DOC-15) territory. The chips set the env scope and
// switch sections; the user finds the container via the section's own UI. Per
// Plan 25-02 constraints, this is intentional.
//
// Restart on a protected container (livos_redis, livos_postgres, caddy, …) is
// proactively DISABLED on the chip with an explanatory tooltip — backend will
// reject with [protected-container] anyway (Plan 22-01 SEC-02), but disabling
// the chip avoids the toast round-trip.

import {IconFileText, IconRefresh, IconTerminal, type Icon} from '@tabler/icons-react'
import {toast} from 'sonner'

import {cn} from '@/shadcn-lib/utils'
import {useEnvironmentStore} from '@/stores/environment-store'
import {trpcReact} from '@/trpc/trpc'

import {useDockerStore} from '../store'
import {type TopCpuEntry} from './sort-top-cpu'
import {useTopCpu} from './use-top-cpu'

// ---------------------------------------------------------------------------
// Sub-components — kept above the export so the JSX body reads top-down.
// ---------------------------------------------------------------------------

function ActionChip({
	onClick,
	icon: IconCmp,
	label,
	disabled,
	title,
}: {
	onClick: () => void
	icon: Icon
	label: string
	disabled?: boolean
	title?: string
}) {
	return (
		<button
			type='button'
			onClick={onClick}
			disabled={disabled}
			title={title}
			className={cn(
				'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium transition',
				disabled
					? 'cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600'
					: 'border-zinc-300 bg-white text-zinc-700 hover:border-blue-400 hover:text-blue-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-blue-600 dark:hover:text-blue-300',
			)}
		>
			<IconCmp size={12} className='shrink-0' />
			{label}
		</button>
	)
}

function TopCpuSkeleton() {
	return (
		<ul className='divide-y divide-zinc-200 dark:divide-zinc-800'>
			{Array.from({length: 5}).map((_, i) => (
				<li key={i} className='flex items-center gap-3 py-2'>
					<div className='h-4 w-12 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800' />
					<div className='flex-1'>
						<div className='h-4 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800' />
						<div className='mt-1 h-3 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800' />
					</div>
					<div className='h-4 w-12 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800' />
				</li>
			))}
		</ul>
	)
}

// ---------------------------------------------------------------------------
// TopCpuPanel — main export.
// ---------------------------------------------------------------------------

export function TopCpuPanel() {
	const {entries, isLoading} = useTopCpu()

	const restart = trpcReact.docker.manageContainer.useMutation({
		onSuccess: (data) => {
			toast.success(data.message ?? 'Container restarted')
		},
		onError: (err) => {
			toast.error(err.message)
		},
	})

	function jumpTo(envId: string, section: 'logs' | 'shell') {
		// Imperative store writes — same pattern as EnvCard click handler.
		useEnvironmentStore.getState().setEnvironment(envId)
		useDockerStore.getState().setSection(section)
	}

	function onRestart(entry: TopCpuEntry) {
		if (entry.isProtected) return
		restart.mutate({
			name: entry.containerName,
			operation: 'restart',
			environmentId: entry.envId,
		})
	}

	return (
		<section className='m-4 mt-2 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950'>
			<header className='mb-3 flex items-center justify-between'>
				<h2 className='text-sm font-semibold text-zinc-700 dark:text-zinc-200'>Top containers by CPU</h2>
				<span className='text-xs text-zinc-500 dark:text-zinc-500'>Updated every 5s</span>
			</header>

			{isLoading && entries.length === 0 ? (
				<TopCpuSkeleton />
			) : entries.length === 0 ? (
				<div className='py-8 text-center text-sm text-zinc-500 dark:text-zinc-500'>
					No running containers across any environment
				</div>
			) : (
				<ul className='divide-y divide-zinc-200 dark:divide-zinc-800'>
					{entries.map((e) => (
						<li
							key={`${e.envId}:${e.containerId}`}
							className='flex items-center gap-3 py-2'
						>
							<span className='shrink-0 rounded bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'>
								{e.envName}
							</span>
							<div className='min-w-0 flex-1'>
								<div className='truncate text-sm font-medium text-zinc-800 dark:text-zinc-100'>
									{e.containerName}
								</div>
								<div className='truncate text-xs text-zinc-500 dark:text-zinc-500'>{e.image}</div>
							</div>
							<span className='shrink-0 font-mono text-sm tabular-nums text-zinc-700 dark:text-zinc-300'>
								{e.cpuPercent.toFixed(1)}%
							</span>
							<div className='flex shrink-0 gap-1'>
								<ActionChip
									onClick={() => jumpTo(e.envId, 'logs')}
									icon={IconFileText}
									label='Logs'
								/>
								<ActionChip
									onClick={() => jumpTo(e.envId, 'shell')}
									icon={IconTerminal}
									label='Shell'
								/>
								<ActionChip
									onClick={() => onRestart(e)}
									icon={IconRefresh}
									label='Restart'
									disabled={e.isProtected || restart.isPending}
									title={e.isProtected ? 'Protected container' : undefined}
								/>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	)
}
