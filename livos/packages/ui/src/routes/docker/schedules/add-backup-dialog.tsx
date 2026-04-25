// Phase 27-02 (DOC-12) — ported from routes/settings/_components/scheduler-section.tsx AddBackupDialog (lines 390-792).
// NEW: initialVolumeName prop pre-fills the volume picker when SchedulerSection
// opens it via the Phase 26-02 useSelectedVolume() seam.

import {useEffect, useMemo, useState} from 'react'
import {TbLoader2} from 'react-icons/tb'
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
// Add Backup dialog (volume picker + destination form + Test + Save)
// ---------------------------------------------------------------------------

export function AddBackupDialog({
	open,
	onOpenChange,
	onSaved,
	initialVolumeName,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onSaved: () => void
	initialVolumeName?: string
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

	// Phase 26-02 contract — pre-fill volume picker when dialog opens with an
	// initialVolumeName (from VolumeSection's "Schedule backup" link via the
	// useSelectedVolume() store slot). Runs AFTER the reset effect above so it
	// wins when both fire on open.
	useEffect(() => {
		if (open && initialVolumeName) setVolumeName(initialVolumeName)
	}, [open, initialVolumeName])

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
