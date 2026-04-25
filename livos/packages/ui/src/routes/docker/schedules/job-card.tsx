// Phase 27-02 (DOC-12) — verbatim port of legacy
// routes/settings/_components/scheduler-section.tsx (lines 87-148, 299-384,
// deleted Phase 27-02). Sub-components extracted to a sibling file for
// SchedulerSection clarity.

import {TbLoader2, TbPlayerPlay, TbTrash} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Switch} from '@/shadcn-components/ui/switch'
import {cn} from '@/shadcn-lib/utils'

// ---------------------------------------------------------------------------
// Types — mirror server-side BackupDestination configs (without secrets)
// ---------------------------------------------------------------------------

export interface JobRow {
	id: string
	name: string
	schedule: string
	type: 'image-prune' | 'container-update-check' | 'git-stack-sync' | 'volume-backup'
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
}

const STATUS_STYLES: Record<string, {bg: string; text: string; label: string}> = {
	success: {bg: 'bg-emerald-500/15', text: 'text-emerald-500', label: 'Success'},
	failure: {bg: 'bg-red-500/15', text: 'text-red-500', label: 'Failed'},
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
	const isBuiltIn = job.type !== 'volume-backup'
	return (
		<div className='rounded-radius-md border border-border-default bg-surface-base p-4'>
			<div className='flex flex-wrap items-start gap-4'>
				<div className='min-w-0 flex-1'>
					<div className='flex flex-wrap items-center gap-2'>
						<span className='text-body-sm font-medium text-text-primary'>{job.name}</span>
						<span className='rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-tertiary'>
							{TYPE_LABELS[job.type]}
						</span>
						{isBuiltIn && (
							<span className='rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-400'>
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
						<div className='mt-1 truncate text-caption-sm text-red-400' title={job.lastRunError}>
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
					{!isBuiltIn && (
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
		</div>
	)
}
