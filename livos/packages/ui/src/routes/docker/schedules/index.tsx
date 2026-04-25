// Phase 27-02 (DOC-12) — port of legacy
// routes/settings/_components/scheduler-section.tsx (lines 185-293, deleted
// Phase 27-02). NEW: useSelectedVolume() seam — when arriving from Volumes
// section's "Schedule backup" link, AddBackupDialog auto-opens with volume
// pre-filled (Phase 26-02 contract).
//
// Renders:
//   (a) Job list — Name, Type, Schedule, Last Run, Next Run, Status, per-row
//       Run Now / toggle / Delete (Delete only on user-defined volume-backup jobs)
//   (b) "Add Backup" dialog — volume picker, destination type + conditional
//       fields, schedule input, Test Destination button, Save action
//   (c) Built-in jobs are visually flagged with a "Built-in" badge
//
// Talks to scheduler.* tRPC routes (registered in trpc/index.ts; mutations
// route via HTTP per common.ts httpOnlyPaths).

import {useEffect, useState} from 'react'
import {TbLoader2, TbPlus, TbServerCog} from 'react-icons/tb'
import {toast} from 'sonner'

import {Button} from '@/shadcn-components/ui/button'
import {trpcReact} from '@/trpc/trpc'

import {useDockerResource, useSelectedVolume} from '../resource-store'
import {AddBackupDialog} from './add-backup-dialog'
import {JobCard, type JobRow} from './job-card'

export function SchedulerSection() {
	const utils = trpcReact.useUtils()
	const jobsQ = trpcReact.scheduler.listJobs.useQuery(undefined, {
		refetchInterval: 10_000, // surface last-run updates while user is on the page
	})
	const jobs = (jobsQ.data ?? []) as JobRow[]

	// Phase 26-02 seam — when VolumeSection's "Schedule backup" icon flips
	// section to 'schedules' AND writes the volume name into useSelectedVolume,
	// we open AddBackupDialog with that volume pre-filled, then CLEAR the slot
	// (consume-and-clear semantics — re-navigating to Schedules without a
	// fresh click should not re-open the dialog).
	const selectedVolume = useSelectedVolume()
	const setSelectedVolume = useDockerResource((s) => s.setSelectedVolume)
	const [showAddDialog, setShowAddDialog] = useState(false)
	const [pendingVolumeName, setPendingVolumeName] = useState<string | null>(null)

	useEffect(() => {
		if (selectedVolume && !showAddDialog) {
			setPendingVolumeName(selectedVolume)
			setShowAddDialog(true)
			setSelectedVolume(null) // consume the slot — Phase 26-02 contract
		}
	}, [selectedVolume, showAddDialog, setSelectedVolume])

	const runNowMut = trpcReact.scheduler.runNow.useMutation({
		onSuccess: () => {
			utils.scheduler.listJobs.invalidate()
			toast.success('Job triggered')
		},
		onError: (err) => toast.error(err.message),
	})

	const deleteMut = trpcReact.scheduler.deleteJob.useMutation({
		onSuccess: () => {
			utils.scheduler.listJobs.invalidate()
			toast.success('Job deleted')
		},
		onError: (err) => toast.error(err.message),
	})

	const upsertMut = trpcReact.scheduler.upsertJob.useMutation({
		onSuccess: () => {
			utils.scheduler.listJobs.invalidate()
		},
		onError: (err) => toast.error(err.message),
	})

	const handleToggleEnabled = (job: JobRow) => {
		upsertMut.mutate(
			{
				id: job.id,
				name: job.name,
				schedule: job.schedule,
				type: job.type,
				config: job.config,
				enabled: !job.enabled,
			},
			{
				onSuccess: () => toast.success(`${job.name} ${!job.enabled ? 'enabled' : 'disabled'}`),
			},
		)
	}

	const handleDelete = (job: JobRow) => {
		if (!confirm(`Delete job "${job.name}"? This cannot be undone.`)) return
		deleteMut.mutate({id: job.id})
	}

	return (
		<div className='flex h-full flex-col overflow-y-auto p-4 sm:p-6'>
			<div className='space-y-4'>
				<div className='flex flex-wrap items-center justify-between gap-2'>
					<p className='text-body-sm text-text-secondary'>
						Maintenance and backup tasks run on a cron schedule. Built-in jobs handle image
						pruning and update checks; you can add volume backup jobs to S3, SFTP, or local
						destinations.
					</p>
					<Button
						variant='primary'
						size='sm'
						className='h-11'
						onClick={() => setShowAddDialog(true)}
					>
						<TbPlus className='h-4 w-4' />
						Add Backup
					</Button>
				</div>

				{/* Job list */}
				{jobsQ.isLoading ? (
					<div className='flex items-center justify-center py-12'>
						<TbLoader2 className='h-5 w-5 animate-spin text-text-tertiary' />
					</div>
				) : jobs.length === 0 ? (
					<div className='rounded-radius-md border border-border-default bg-surface-base p-6 text-center'>
						<TbServerCog className='mx-auto h-8 w-8 text-text-tertiary' />
						<p className='mt-2 text-body-sm text-text-secondary'>No scheduled jobs</p>
					</div>
				) : (
					<div className='space-y-2'>
						{jobs.map((job) => (
							<JobCard
								key={job.id}
								job={job}
								onRunNow={() => runNowMut.mutate({id: job.id})}
								onToggle={() => handleToggleEnabled(job)}
								onDelete={() => handleDelete(job)}
								isRunning={runNowMut.isPending}
							/>
						))}
					</div>
				)}

				{/* Add Backup dialog */}
				<AddBackupDialog
					open={showAddDialog}
					onOpenChange={(open) => {
						setShowAddDialog(open)
						// When the dialog closes, clear the consumed volume slot so the
						// next "Add Backup" click starts blank.
						if (!open) setPendingVolumeName(null)
					}}
					onSaved={() => {
						setShowAddDialog(false)
						setPendingVolumeName(null)
						utils.scheduler.listJobs.invalidate()
					}}
					initialVolumeName={pendingVolumeName ?? undefined}
				/>
			</div>
		</div>
	)
}
