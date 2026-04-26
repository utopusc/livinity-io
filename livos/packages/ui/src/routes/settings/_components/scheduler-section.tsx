// Phase 20 — Settings > Scheduler section.
//
// Renders:
//   (a) Job list table — Name, Type, Schedule, Enabled, Last Run, Status,
//       Next Run, Actions (Run Now / Edit / Delete)
//   (b) "Add Backup" dialog — volume picker, destination type + conditional
//       fields, schedule input, Test Destination button, Save action
//   (c) Built-in jobs are visually flagged with a "Built-in" badge — Edit
//       allows toggling enabled and changing schedule (no destination form,
//       no Delete)
//
// Talks to scheduler.* tRPC routes (registered in trpc/index.ts; mutations
// route via HTTP per common.ts httpOnlyPaths).

import {useEffect, useMemo, useState} from 'react'
import {
	TbDatabase,
	TbEdit,
	TbLoader2,
	TbPlayerPlay,
	TbPlus,
	TbServerCog,
	TbTrash,
} from 'react-icons/tb'
import {toast} from 'sonner'

import {Button} from '@/shadcn-components/ui/button'
import {Checkbox} from '@/shadcn-components/ui/checkbox'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {Label} from '@/shadcn-components/ui/label'
import {RadioGroup, RadioGroupItem} from '@/shadcn-components/ui/radio-group'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/shadcn-components/ui/select'
import {Switch} from '@/shadcn-components/ui/switch'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'

// ---------------------------------------------------------------------------
// Types — mirror server-side BackupDestination configs (without secrets)
// ---------------------------------------------------------------------------

type DestinationType = 's3' | 'sftp' | 'local'
type SftpAuthMethod = 'password' | 'privateKey'

interface S3Form {
	type: 's3'
	endpoint: string
	region: string
	bucket: string
	prefix: string
	accessKeyId: string
	forcePathStyle: boolean
	secretAccessKey: string
}

interface SftpForm {
	type: 'sftp'
	host: string
	port: number
	username: string
	remotePath: string
	authMethod: SftpAuthMethod
	password: string
	privateKey: string
	passphrase: string
}

interface LocalForm {
	type: 'local'
	path: string
}

type DestinationForm = S3Form | SftpForm | LocalForm

interface JobRow {
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

const TYPE_LABELS: Record<JobRow['type'], string> = {
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

function StatusBadge({status}: {status: JobRow['lastRunStatus']}) {
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

function relTime(d: string | Date | null): string {
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
// Form factory — fresh empty state for each destination type
// ---------------------------------------------------------------------------

function emptyDestination(type: DestinationType): DestinationForm {
	if (type === 's3')
		return {
			type: 's3',
			endpoint: '',
			region: 'us-east-1',
			bucket: '',
			prefix: '',
			accessKeyId: '',
			forcePathStyle: false,
			secretAccessKey: '',
		}
	if (type === 'sftp')
		return {
			type: 'sftp',
			host: '',
			port: 22,
			username: '',
			remotePath: '/backups',
			authMethod: 'password',
			password: '',
			privateKey: '',
			passphrase: '',
		}
	return {type: 'local', path: '/opt/livos/data/backups'}
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------

export function SchedulerSection() {
	const utils = trpcReact.useUtils()
	const jobsQ = trpcReact.scheduler.listJobs.useQuery(undefined, {
		refetchInterval: 10_000, // surface last-run updates while user is on the page
	})
	const jobs = (jobsQ.data ?? []) as JobRow[]

	const [showAddDialog, setShowAddDialog] = useState(false)

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
				onOpenChange={setShowAddDialog}
				onSaved={() => {
					setShowAddDialog(false)
					utils.scheduler.listJobs.invalidate()
				}}
			/>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Job row card
// ---------------------------------------------------------------------------

function JobCard({
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

// ---------------------------------------------------------------------------
// Add Backup dialog (volume picker + destination form + Test + Save)
// ---------------------------------------------------------------------------

function AddBackupDialog({
	open,
	onOpenChange,
	onSaved,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onSaved: () => void
}) {
	const [name, setName] = useState('')
	const [volumeName, setVolumeName] = useState('')
	const [schedule, setSchedule] = useState('0 3 * * *')
	const [destType, setDestType] = useState<DestinationType>('local')
	const [dest, setDest] = useState<DestinationForm>(() => emptyDestination('local'))

	const volumesQ = trpcReact.docker.listVolumes.useQuery(undefined, {enabled: open})
	const volumes = (volumesQ.data ?? []) as Array<{name: string}>

	// Reset form when dialog opens/closes so reopening is clean
	useEffect(() => {
		if (!open) {
			setName('')
			setVolumeName('')
			setSchedule('0 3 * * *')
			setDestType('local')
			setDest(emptyDestination('local'))
		}
	}, [open])

	// Switching dest type resets only the destination block
	const onChangeDestType = (next: DestinationType) => {
		setDestType(next)
		setDest(emptyDestination(next))
	}

	const testMut = trpcReact.scheduler.testBackupDestination.useMutation({
		onSuccess: (data) => {
			toast.success(`Connected (${data.latencyMs}ms, ${data.bytesUploaded} bytes)`)
		},
		onError: (err) => toast.error(err.message),
	})

	const upsertMut = trpcReact.scheduler.upsertJob.useMutation({
		onSuccess: () => {
			toast.success('Backup job created')
			onSaved()
		},
		onError: (err) => toast.error(err.message),
	})

	const buildPayload = useMemo(() => {
		return () => {
			// Strip secrets out of the destination config (creds go into a separate field)
			let destConfig: Record<string, unknown>
			let creds: Record<string, string> = {}
			if (dest.type === 's3') {
				destConfig = {
					type: 's3',
					...(dest.endpoint ? {endpoint: dest.endpoint} : {}),
					region: dest.region,
					bucket: dest.bucket,
					...(dest.prefix ? {prefix: dest.prefix} : {}),
					accessKeyId: dest.accessKeyId,
					...(dest.forcePathStyle ? {forcePathStyle: true} : {}),
				}
				if (dest.secretAccessKey) creds.secretAccessKey = dest.secretAccessKey
			} else if (dest.type === 'sftp') {
				destConfig = {
					type: 'sftp',
					host: dest.host,
					port: dest.port,
					username: dest.username,
					remotePath: dest.remotePath,
					authMethod: dest.authMethod,
				}
				if (dest.authMethod === 'password') {
					if (dest.password) creds.password = dest.password
				} else {
					if (dest.privateKey) creds.privateKey = dest.privateKey
					if (dest.passphrase) creds.passphrase = dest.passphrase
				}
			} else {
				destConfig = {type: 'local', path: dest.path}
			}
			return {destConfig, creds}
		}
	}, [dest])

	const onTestDestination = () => {
		const {destConfig, creds} = buildPayload()
		testMut.mutate({destination: destConfig as any, creds})
	}

	const onSave = () => {
		if (!name.trim()) return toast.error('Name is required')
		if (!volumeName) return toast.error('Pick a volume')
		if (!schedule.trim()) return toast.error('Schedule is required')
		const {destConfig, creds} = buildPayload()
		upsertMut.mutate({
			name: name.trim(),
			schedule: schedule.trim(),
			type: 'volume-backup',
			config: {volumeName, destination: destConfig},
			enabled: true,
			creds,
		})
	}

	const isSaving = upsertMut.isPending
	const isTesting = testMut.isPending

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
				<DialogHeader>
					<DialogTitle>Add Volume Backup</DialogTitle>
				</DialogHeader>

				<div className='space-y-4 py-2'>
					{/* Name */}
					<div className='space-y-1.5'>
						<Label htmlFor='sched-name'>Name</Label>
						<Input
							id='sched-name'
							placeholder='my-backup'
							value={name}
							onValueChange={setName}
						/>
					</div>

					{/* Volume picker */}
					<div className='space-y-1.5'>
						<Label>Volume</Label>
						<Select value={volumeName} onValueChange={setVolumeName}>
							<SelectTrigger>
								<SelectValue placeholder={volumesQ.isLoading ? 'Loading…' : 'Select a volume'} />
							</SelectTrigger>
							<SelectContent>
								{volumes.length === 0 ? (
									<div className='px-2 py-1.5 text-caption text-text-tertiary'>
										No volumes found
									</div>
								) : (
									volumes.map((v) => (
										<SelectItem key={v.name} value={v.name}>
											{v.name}
										</SelectItem>
									))
								)}
							</SelectContent>
						</Select>
					</div>

					{/* Schedule */}
					<div className='space-y-1.5'>
						<Label htmlFor='sched-cron'>Schedule (cron)</Label>
						<Input
							id='sched-cron'
							placeholder='0 3 * * *'
							value={schedule}
							onValueChange={setSchedule}
						/>
						<div className='text-caption-sm text-text-tertiary'>
							Examples: <code className='font-mono'>0 3 * * *</code> (daily 3am),{' '}
							<code className='font-mono'>0 3 * * 0</code> (weekly Sun 3am),{' '}
							<code className='font-mono'>*/5 * * * *</code> (every 5 min, testing)
						</div>
					</div>

					{/* Destination type */}
					<div className='space-y-1.5'>
						<Label>Destination</Label>
						<Select value={destType} onValueChange={(v) => onChangeDestType(v as DestinationType)}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='local'>Local directory</SelectItem>
								<SelectItem value='s3'>S3-compatible</SelectItem>
								<SelectItem value='sftp'>SFTP</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Conditional destination fields */}
					{dest.type === 'local' && (
						<div className='space-y-1.5'>
							<Label htmlFor='dest-local-path'>Host path</Label>
							<Input
								id='dest-local-path'
								placeholder='/opt/livos/data/backups'
								value={dest.path}
								onValueChange={(v) => setDest({...dest, path: v})}
							/>
						</div>
					)}

					{dest.type === 's3' && (
						<div className='space-y-3 rounded-radius-sm border border-border-default p-3'>
							<div className='space-y-1.5'>
								<Label htmlFor='s3-endpoint'>Endpoint (optional)</Label>
								<Input
									id='s3-endpoint'
									placeholder='https://s3.us-east-1.amazonaws.com'
									value={dest.endpoint}
									onValueChange={(v) => setDest({...dest, endpoint: v})}
								/>
							</div>
							<div className='grid grid-cols-2 gap-3'>
								<div className='space-y-1.5'>
									<Label htmlFor='s3-region'>Region</Label>
									<Input
										id='s3-region'
										placeholder='us-east-1'
										value={dest.region}
										onValueChange={(v) => setDest({...dest, region: v})}
									/>
								</div>
								<div className='space-y-1.5'>
									<Label htmlFor='s3-bucket'>Bucket</Label>
									<Input
										id='s3-bucket'
										placeholder='my-bucket'
										value={dest.bucket}
										onValueChange={(v) => setDest({...dest, bucket: v})}
									/>
								</div>
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='s3-prefix'>Prefix (optional)</Label>
								<Input
									id='s3-prefix'
									placeholder='livinity-backups/'
									value={dest.prefix}
									onValueChange={(v) => setDest({...dest, prefix: v})}
								/>
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='s3-key'>Access Key ID</Label>
								<Input
									id='s3-key'
									placeholder='AKIA…'
									value={dest.accessKeyId}
									onValueChange={(v) => setDest({...dest, accessKeyId: v})}
								/>
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='s3-secret'>Secret Access Key</Label>
								<Input
									id='s3-secret'
									type='password'
									placeholder='••••••••'
									value={dest.secretAccessKey}
									onValueChange={(v) => setDest({...dest, secretAccessKey: v})}
								/>
								<div className='text-caption-sm text-text-tertiary'>
									Encrypted at rest in Redis. Never written to disk or PG.
								</div>
							</div>
							<div className='flex items-center gap-2'>
								<Checkbox
									id='s3-pathstyle'
									checked={dest.forcePathStyle}
									onCheckedChange={(checked) =>
										setDest({...dest, forcePathStyle: checked === true})
									}
								/>
								<Label htmlFor='s3-pathstyle' className='text-caption text-text-secondary'>
									Force path-style addressing (MinIO)
								</Label>
							</div>
						</div>
					)}

					{dest.type === 'sftp' && (
						<div className='space-y-3 rounded-radius-sm border border-border-default p-3'>
							<div className='grid grid-cols-[1fr_100px] gap-3'>
								<div className='space-y-1.5'>
									<Label htmlFor='sftp-host'>Host</Label>
									<Input
										id='sftp-host'
										placeholder='backup.example.com'
										value={dest.host}
										onValueChange={(v) => setDest({...dest, host: v})}
									/>
								</div>
								<div className='space-y-1.5'>
									<Label htmlFor='sftp-port'>Port</Label>
									<Input
										id='sftp-port'
										type='number'
										value={String(dest.port)}
										onValueChange={(v) =>
											setDest({...dest, port: parseInt(v, 10) || 22})
										}
									/>
								</div>
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='sftp-user'>Username</Label>
								<Input
									id='sftp-user'
									placeholder='backup-user'
									value={dest.username}
									onValueChange={(v) => setDest({...dest, username: v})}
								/>
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='sftp-path'>Remote path</Label>
								<Input
									id='sftp-path'
									placeholder='/backups'
									value={dest.remotePath}
									onValueChange={(v) => setDest({...dest, remotePath: v})}
								/>
							</div>
							<div className='space-y-1.5'>
								<Label>Authentication</Label>
								<RadioGroup
									value={dest.authMethod}
									onValueChange={(v) =>
										setDest({...dest, authMethod: v as SftpAuthMethod})
									}
									className='grid-cols-2'
								>
									<div className='flex items-center gap-2'>
										<RadioGroupItem id='sftp-auth-pw' value='password' />
										<Label htmlFor='sftp-auth-pw' className='text-caption'>
											Password
										</Label>
									</div>
									<div className='flex items-center gap-2'>
										<RadioGroupItem id='sftp-auth-pk' value='privateKey' />
										<Label htmlFor='sftp-auth-pk' className='text-caption'>
											Private Key
										</Label>
									</div>
								</RadioGroup>
							</div>
							{dest.authMethod === 'password' ? (
								<div className='space-y-1.5'>
									<Label htmlFor='sftp-password'>Password</Label>
									<Input
										id='sftp-password'
										type='password'
										placeholder='••••••••'
										value={dest.password}
										onValueChange={(v) => setDest({...dest, password: v})}
									/>
								</div>
							) : (
								<>
									<div className='space-y-1.5'>
										<Label htmlFor='sftp-pk'>Private Key (PEM)</Label>
										<textarea
											id='sftp-pk'
											rows={4}
											placeholder='-----BEGIN OPENSSH PRIVATE KEY-----…'
											value={dest.privateKey}
											onChange={(e) => setDest({...dest, privateKey: e.target.value})}
											className='w-full rounded-radius-sm border border-border-default bg-surface-base p-2 font-mono text-caption text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand/30'
										/>
									</div>
									<div className='space-y-1.5'>
										<Label htmlFor='sftp-passphrase'>Passphrase (optional)</Label>
										<Input
											id='sftp-passphrase'
											type='password'
											placeholder='••••••••'
											value={dest.passphrase}
											onValueChange={(v) => setDest({...dest, passphrase: v})}
										/>
									</div>
								</>
							)}
							<div className='text-caption-sm text-text-tertiary'>
								Credentials encrypted at rest in Redis. Never written to disk or PG.
							</div>
						</div>
					)}
				</div>

				<DialogFooter className='gap-2'>
					<Button
						variant='secondary'
						onClick={onTestDestination}
						disabled={isTesting || isSaving}
					>
						{isTesting && <TbLoader2 className='mr-2 h-4 w-4 animate-spin' />}
						Test Destination
					</Button>
					<Button variant='primary' onClick={onSave} disabled={isSaving}>
						{isSaving && <TbLoader2 className='mr-2 h-4 w-4 animate-spin' />}
						Save
					</Button>
					<Button variant='secondary' onClick={() => onOpenChange(false)} disabled={isSaving}>
						Cancel
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
