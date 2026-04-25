// Phase 25 Plan 25-01 — Single-environment health card.
//
// Renders one Dockhand-style env card. Each card runs its own polling loop
// via useEnvCardData(env.id) so it displays its OWN env's metrics regardless
// of the global selectedEnvironmentId.
//
// Layout (top → bottom, per 25-CONTEXT.md `specifics`):
//   1. Header     — type icon + env.name + connection target text
//   2. Tags       — chip pills (only if env.tags.length > 0)
//   3. Health     — green / amber / red banner derived from container states
//   4. Counts     — running / paused / restarting / stopped + total
//   5. Stats grid — 2x2: Images / Stacks / Volumes / Networks
//   6. Events     — up to 8 most-recent events via takeLastEvents()
//
// Click handler writes BOTH stores in one tick:
//   - useEnvironmentStore.setEnvironment(env.id)  ← scopes the rest of the app
//   - useDockerStore.setSection('containers')     ← jumps to the container list
// Imperative .getState() avoids re-rendering this card on every store change.
//
// CPU/Memory aggregate pill is DEFERRED to Plan 25-02 (or later) — it requires
// per-container stats fanout which the polling loop doesn't yet do.

import {
	IconAlertCircle,
	IconAlertTriangle,
	IconCircleCheck,
	IconCloud,
	IconPlayerPause,
	IconPlayerPlay,
	IconPlugConnected,
	IconRobot,
	IconRotateClockwise,
	IconSquare,
	type Icon,
} from '@tabler/icons-react'

import {cn} from '@/shadcn-lib/utils'
import {useEnvironmentStore} from '@/stores/environment-store'

import {useDockerStore} from '../store'
import {formatEventTimestamp, formatEventVerb, takeLastEvents} from './format-events'
import {useEnvCardData} from './use-env-card-data'

import type {Environment} from '@/hooks/use-environments'

// ---------------------------------------------------------------------------
// Local helpers — kept above the export so the JSX body reads top-down.
// ---------------------------------------------------------------------------

function TypeIcon({type}: {type: Environment['type']}) {
	const Cmp: Icon = type === 'socket' ? IconPlugConnected : type === 'tcp-tls' ? IconCloud : IconRobot
	return <Cmp size={20} className='shrink-0 text-zinc-700 dark:text-zinc-300' />
}

function connectionText(env: Environment): string {
	if (env.type === 'socket') return env.socketPath ?? '/var/run/docker.sock'
	if (env.type === 'tcp-tls') return `${env.tcpHost ?? '?'}:${env.tcpPort ?? '?'}`
	// agent
	const id = env.agentId ?? ''
	return id ? `agent-${id.slice(0, 8)}` : 'agent (unbound)'
}

type HealthState = 'unreachable' | 'all-healthy' | 'unhealthy' | 'empty'

interface CountSummary {
	running: number
	paused: number
	restarting: number
	stopped: number
	total: number
}

function summarizeContainers(containers: ReadonlyArray<{state: string}> | undefined): CountSummary {
	const summary: CountSummary = {running: 0, paused: 0, restarting: 0, stopped: 0, total: 0}
	if (!containers) return summary
	summary.total = containers.length
	for (const c of containers) {
		if (c.state === 'running') summary.running++
		else if (c.state === 'paused') summary.paused++
		else if (c.state === 'restarting') summary.restarting++
		else if (c.state === 'exited' || c.state === 'dead' || c.state === 'created') summary.stopped++
	}
	return summary
}

function deriveHealth(isError: boolean, summary: CountSummary): HealthState {
	if (isError) return 'unreachable'
	if (summary.total === 0) return 'empty'
	const unhealthy = summary.paused + summary.restarting
	// 'stopped' (exited/dead/created) is intentionally NOT counted as unhealthy
	// for the banner — operators routinely keep stopped containers around. The
	// banner flags only 'in trouble' states (paused/restarting).
	if (unhealthy === 0) return 'all-healthy'
	return 'unhealthy'
}

function HealthBanner({state, summary}: {state: HealthState; summary: CountSummary}) {
	if (state === 'unreachable') {
		return (
			<div className='flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'>
				<IconAlertCircle size={14} className='shrink-0' />
				<span>Unreachable</span>
			</div>
		)
	}
	if (state === 'empty') {
		return (
			<div className='flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400'>
				<span>No containers</span>
			</div>
		)
	}
	if (state === 'all-healthy') {
		return (
			<div className='flex items-center gap-2 rounded-md border border-green-300 bg-green-50 px-2.5 py-1.5 text-xs text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300'>
				<IconCircleCheck size={14} className='shrink-0' />
				<span>All {summary.running} healthy</span>
			</div>
		)
	}
	const unhealthy = summary.paused + summary.restarting
	return (
		<div className='flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'>
			<IconAlertTriangle size={14} className='shrink-0' />
			<span>
				{unhealthy} unhealthy {unhealthy === 1 ? 'container' : 'containers'}
			</span>
		</div>
	)
}

function CountPill({icon: Icon, count, label}: {icon: Icon; count: number; label: string}) {
	return (
		<div
			className='flex items-center gap-1 text-xs text-zinc-700 dark:text-zinc-300'
			title={`${count} ${label}`}
		>
			<Icon size={14} className='shrink-0' />
			<span className='tabular-nums'>{count}</span>
		</div>
	)
}

function StatCell({label, value}: {label: string; value: number | undefined}) {
	return (
		<div className='flex flex-col rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/50'>
			<span className='text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-500'>{label}</span>
			<span className='font-semibold tabular-nums text-zinc-800 dark:text-zinc-100'>
				{value === undefined ? '—' : value}
			</span>
		</div>
	)
}

// ---------------------------------------------------------------------------
// EnvCard — single env health card.
// ---------------------------------------------------------------------------

export function EnvCard({env}: {env: Environment}) {
	const data = useEnvCardData(env.id)
	const summary = summarizeContainers(data.containers)
	const health = deriveHealth(data.isError, summary)
	const events = takeLastEvents(data.events ?? [], 8)

	const handleClick = () => {
		// Imperative store writes — no subscription = no re-render of this card
		// when the global section/env state changes elsewhere.
		useEnvironmentStore.getState().setEnvironment(env.id)
		useDockerStore.getState().setSection('containers')
	}

	return (
		<button
			type='button'
			onClick={handleClick}
			className={cn(
				'group flex flex-col gap-3 rounded-lg border p-4 text-left shadow-sm transition',
				'border-zinc-200 bg-white hover:border-blue-400 hover:shadow-md',
				'dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-blue-600',
			)}
		>
			{/* Header */}
			<div className='flex items-center gap-2'>
				<TypeIcon type={env.type} />
				<span className='truncate font-semibold text-zinc-900 dark:text-zinc-100'>{env.name}</span>
				<span className='ml-auto truncate text-xs text-zinc-500 dark:text-zinc-500'>{connectionText(env)}</span>
			</div>

			{/* Tags chips — only render the row if there's at least one tag */}
			{env.tags.length > 0 ? (
				<div className='flex flex-wrap gap-1'>
					{env.tags.map((tag) => (
						<span
							key={tag}
							className='rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
						>
							{tag}
						</span>
					))}
				</div>
			) : null}

			{/* Health banner */}
			<HealthBanner state={health} summary={summary} />

			{/* Container counts row */}
			<div className='flex items-center gap-3'>
				<CountPill icon={IconPlayerPlay} count={summary.running} label='running' />
				<CountPill icon={IconPlayerPause} count={summary.paused} label='paused' />
				<CountPill icon={IconRotateClockwise} count={summary.restarting} label='restarting' />
				<CountPill icon={IconSquare} count={summary.stopped} label='stopped' />
				<span className='ml-auto text-xs text-zinc-500 dark:text-zinc-500'>
					Total <span className='tabular-nums font-medium text-zinc-700 dark:text-zinc-300'>{summary.total}</span>
				</span>
			</div>

			{/* 2x2 stats grid */}
			<div className='grid grid-cols-2 gap-2'>
				<StatCell label='Images' value={data.imageCount} />
				<StatCell label='Stacks' value={data.stackCount} />
				<StatCell label='Volumes' value={data.volumeCount} />
				<StatCell label='Networks' value={data.networkCount} />
			</div>

			{/* Recent events list (last 8) */}
			<div className='flex flex-col gap-1'>
				<span className='text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-500'>
					Recent events
				</span>
				{events.length === 0 ? (
					<span className='text-xs text-zinc-400 dark:text-zinc-600'>No recent events</span>
				) : (
					<ul className='flex flex-col gap-0.5'>
						{events.map((ev, idx) => (
							<li
								key={`${ev.actorId}-${ev.action}-${ev.time}-${idx}`}
								className='flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400'
							>
								<span className='shrink-0 text-zinc-400 dark:text-zinc-600 tabular-nums'>
									{formatEventTimestamp(ev.time)}
								</span>
								<span className='truncate'>
									<span className='font-medium text-zinc-700 dark:text-zinc-300'>{ev.actor}</span>{' '}
									{formatEventVerb(ev.action)}
								</span>
							</li>
						))}
					</ul>
				)}
			</div>
		</button>
	)
}
