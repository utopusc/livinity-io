// Phase 27-02 (DOC-12) — verbatim port of legacy
// routes/settings/_components/scheduler-section.tsx (lines 87-148, 299-384,
// deleted Phase 27-02). Sub-components extracted to a sibling file for
// SchedulerSection clarity.
//
// Phase 329-08 APPS-04 (D-14): a `custom-command` job additionally surfaces its
// recent run history from the job_runs-backed `scheduler.listJobRuns` route —
// per run: started/finished, status, and the truncated output/error
// (collapsible). Built-in + volume-backup rendering is unchanged.

import {useState} from 'react'
import {TbChevronDown, TbChevronRight, TbLoader2, TbPlayerPlay, TbTrash} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Switch} from '@/shadcn-components/ui/switch'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

// ---------------------------------------------------------------------------
// Types — mirror server-side BackupDestination configs (without secrets)
// ---------------------------------------------------------------------------

export interface JobRow {
	id: string
	name: string
	schedule: string
	type:
		| 'image-prune'
		| 'container-update-check'
		| 'git-stack-sync'
		| 'volume-backup'
		| 'custom-command'
	config: Record<string, unknown>
	enabled: boolean
	lastRun: string | Date | null
	lastRunStatus: 'success' | 'failure' | 'skipped' | 'running' | null
	lastRunError: string | null
	lastRunOutput: unknown
	nextRun: string | Date | null
	createdAt: string | Date
	updatedAt: string | Date
}

export const TYPE_LABELS: Record<JobRow['type'], string> = {
	'image-prune': 'Image Prune',
	'container-update-check': 'Update Check',
	'git-stack-sync': 'Git Stack Sync',
	'volume-backup': 'Volume Backup',
	'custom-command': 'Custom Command',
}

const STATUS_STYLES: Record<string, {bg: string; text: string; label: string}> = {
	success: {bg: 'bg-emerald-500/15', text: 'text-emerald-500', label: 'Success'},
	failure: {bg: 'bg-accent-red/15', text: 'text-accent-red', label: 'Failed'},
	running: {bg: 'bg-yellow-500/15', text: 'text-yellow-500', label: 'Running'},
	skipped: {bg: 'bg-neutral-500/15', text: 'text-neutral-400', label: 'Skipped'},
}

export function StatusBadge({status}: {status: JobRow['lastRunStatus']}) {
	if (!status) return <span className='text-xs text-text-tertiary'>Never run</span>
	const s = STATUS_STYLES[status] ?? {
		bg: 'bg-neutral-500/15',
		text: 'text-neutral-400',
		label: status,
	}
	return (
		<span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', s.bg, s.text)}>
			{s.label}
		</span>
	)
}

export function relTime(d: string | Date | null): string {
	if (!d) return '—'
	const ts = typeof d === 'string' ? new Date(d).getTime() : d.getTime()
	if (!ts || isNaN(ts)) return '—'
	const sec = Math.round((Date.now() - ts) / 1000)
	if (sec < 0) {
		// future (next-run)
		const a = -sec
		if (a < 60) return `in ${a}s`
		if (a < 3600) return `in ${Math.round(a / 60)}m`
		if (a < 86400) return `in ${Math.round(a / 3600)}h`
		return `in ${Math.round(a / 86400)}d`
	}
	if (sec < 60) return `${sec}s ago`
	if (sec < 3600) return `${Math.round(sec / 60)}m ago`
	if (sec < 86400) return `${Math.round(sec / 3600)}h ago`
	return `${Math.round(sec / 86400)}d ago`
}

// ---------------------------------------------------------------------------
// Custom-command run history (D-14) — collapsible list of the last runs from the
// job_runs table via scheduler.listJobRuns. Each run: status, started (rel),
// duration, and a collapsible truncated output/error block. Only fetched while
// the section is expanded (enabled: expanded) so idle cards make no query.
// ---------------------------------------------------------------------------

function statusLabel(status: string): string {
	switch (status) {
		case 'success':
			return t('custom-job.status-success')
		case 'failure':
			return t('custom-job.status-failure')
		case 'skipped':
			return t('custom-job.status-skipped')
		case 'running':
			return t('custom-job.status-running')
		default:
			return status
	}
}

function RunHistory({jobName}: {jobName: string}) {
	const [expanded, setExpanded] = useState(false)
	const [openRun, setOpenRun] = useState<string | null>(null)
	const runsQ = trpcReact.scheduler.listJobRuns.useQuery(
		{jobName},
		{enabled: expanded, refetchInterval: expanded ? 15_000 : false},
	)
	const runs = runsQ.data ?? []

	return (
		<div className='mt-3 border-t border-border-default pt-2'>
			<button
				type='button'
				className='flex items-center gap-1 text-caption text-text-secondary hover:text-text-primary'
				onClick={() => setExpanded((v) => !v)}
			>
				{expanded ? (
					<TbChevronDown className='h-3.5 w-3.5' />
				) : (
					<TbChevronRight className='h-3.5 w-3.5' />
				)}
				{expanded ? t('custom-job.hide-history') : t('custom-job.show-history')}
			</button>

			{expanded && (
				<div className='mt-2 space-y-1.5'>
					{runsQ.isLoading ? (
						<div className='flex items-center gap-2 text-caption text-text-tertiary'>
							<TbLoader2 className='h-3.5 w-3.5 animate-spin' />
							{t('custom-job.history-loading')}
						</div>
					) : runs.length === 0 ? (
						<div className='text-caption text-text-tertiary'>{t('custom-job.history-empty')}</div>
					) : (
						runs.map((run) => {
							const detail = run.error ?? run.output
							const isOpen = openRun === run.id
							return (
								<div
									key={run.id}
									className='rounded-radius-sm border border-border-default bg-surface-2/40 p-2'
								>
									<div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
										<StatusBadge status={run.status as JobRow['lastRunStatus']} />
										<span className='text-caption text-text-tertiary'>
											{relTime(run.startedAt)}
										</span>
										{detail && (
											<button
												type='button'
												className='ml-auto text-caption text-text-secondary hover:text-text-primary'
												onClick={() => setOpenRun(isOpen ? null : run.id)}
											>
												{isOpen
													? t('custom-job.hide-output')
													: run.error
														? t('custom-job.show-error')
														: t('custom-job.show-output')}
											</button>
										)}
									</div>
									{isOpen && detail && (
										<pre
											className={cn(
												'mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-surface-base p-2 font-mono text-[11px]',
												run.error ? 'text-accent-red' : 'text-text-secondary',
											)}
										>
											{detail}
										</pre>
									)}
								</div>
							)
						})
					)}
				</div>
			)}
		</div>
	)
}

// ---------------------------------------------------------------------------
// Job row card
// ---------------------------------------------------------------------------

export function JobCard({
	job,
	onRunNow,
	onToggle,
	onDelete,
	isRunning,
}: {
	job: JobRow
	onRunNow: () => void
	onToggle: () => void
	onDelete: () => void
	isRunning: boolean
}) {
	// A volume-backup OR a custom-command job is user-defined (deletable, not a
	// "Built-in" seed). Everything else is a built-in maintenance job.
	const isUserDefined = job.type === 'volume-backup' || job.type === 'custom-command'
	const isBuiltIn = !isUserDefined
	const isCustom = job.type === 'custom-command'
	const typeLabel = isCustom ? t('custom-job.type-label') : TYPE_LABELS[job.type]
	return (
		<div className='rounded-radius-md border border-border-default bg-surface-base p-4'>
			<div className='flex flex-wrap items-start gap-4'>
				<div className='min-w-0 flex-1'>
					<div className='flex flex-wrap items-center gap-2'>
						<span className='text-body-sm font-medium text-text-primary'>{job.name}</span>
						<span className='rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-tertiary'>
							{typeLabel}
						</span>
						{isBuiltIn && (
							<span className='rounded-full bg-accent-blue/15 px-2 py-0.5 text-xs text-accent-blue'>
								Built-in
							</span>
						)}
					</div>
					<div className='mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-text-tertiary'>
						<span>
							<span className='text-text-secondary'>Schedule</span>:{' '}
							<code className='rounded bg-surface-2 px-1 font-mono text-[11px]'>{job.schedule}</code>
						</span>
						<span>
							<span className='text-text-secondary'>Last run</span>: {relTime(job.lastRun)}
						</span>
						<span>
							<span className='text-text-secondary'>Next</span>: {relTime(job.nextRun)}
						</span>
						<StatusBadge status={job.lastRunStatus} />
					</div>
					{job.lastRunError && (
						<div className='mt-1 truncate text-caption-sm text-accent-red' title={job.lastRunError}>
							{job.lastRunError}
						</div>
					)}
				</div>

				{/* Actions */}
				<div className='flex shrink-0 items-center gap-2'>
					<div className='flex items-center gap-2 pr-2'>
						<Switch checked={job.enabled} onCheckedChange={onToggle} />
						<span className='text-caption text-text-tertiary'>
							{job.enabled ? 'On' : 'Off'}
						</span>
					</div>
					<Button
						variant='secondary'
						size='sm'
						className='h-9'
						onClick={onRunNow}
						disabled={isRunning}
					>
						{isRunning ? (
							<TbLoader2 className='h-4 w-4 animate-spin' />
						) : (
							<TbPlayerPlay className='h-4 w-4' />
						)}
						Run Now
					</Button>
					{isUserDefined && (
						<Button
							variant='destructive'
							size='sm'
							className='h-9'
							onClick={onDelete}
						>
							<TbTrash className='h-4 w-4' />
						</Button>
					)}
				</div>
			</div>

			{/* Custom-command run history (D-14) */}
			{isCustom && <RunHistory jobName={job.name} />}
		</div>
	)
}
