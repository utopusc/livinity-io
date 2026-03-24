import {useState, useCallback} from 'react'
import {motion} from 'framer-motion'
import {
	IconDeviceDesktop,
	IconBrandApple,
	IconBrandUbuntu,
	IconPencil,
	IconTrash,
	IconRefresh,
	IconDevices2,
	IconHistory,
	IconCheck,
	IconX,
	IconChevronDown,
	IconChevronRight,
} from '@tabler/icons-react'

import {trpcReact} from '@/trpc/trpc'
import {Badge} from '@/shadcn-components/ui/badge'
import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Label} from '@/shadcn-components/ui/label'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from '@/shadcn-components/ui/dialog'
import {cn} from '@/shadcn-lib/utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(timestamp: number): string {
	const seconds = Math.floor((Date.now() - timestamp) / 1000)
	if (seconds < 60) return 'just now'
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours}h ago`
	const days = Math.floor(hours / 24)
	return `${days}d ago`
}

const PLATFORM_META: Record<string, {icon: typeof IconDeviceDesktop; label: string}> = {
	win32: {icon: IconDeviceDesktop, label: 'Windows'},
	darwin: {icon: IconBrandApple, label: 'macOS'},
	linux: {icon: IconBrandUbuntu, label: 'Linux'},
}

// ---------------------------------------------------------------------------
// Device card
// ---------------------------------------------------------------------------

interface DeviceData {
	deviceId: string
	deviceName: string
	platform: string
	tools: string[]
	connectedAt: number
	online: boolean
}

function DeviceCard({
	device,
	onRename,
	onRemove,
	onActivity,
}: {
	device: DeviceData
	onRename: (device: DeviceData) => void
	onRemove: (device: DeviceData) => void
	onActivity: (device: DeviceData) => void
}) {
	const meta = PLATFORM_META[device.platform] ?? PLATFORM_META.linux
	const PlatformIcon = meta.icon

	return (
		<motion.div
			initial={{opacity: 0, y: 20}}
			animate={{opacity: 1, y: 0}}
			className={cn(
				'relative rounded-xl border border-border-subtle bg-surface-1 p-5 transition-shadow hover:shadow-lg',
				!device.online && 'opacity-60',
			)}
		>
			{/* Top row: OS icon + status dot */}
			<div className='flex items-start justify-between'>
				<PlatformIcon size={28} className='text-text-secondary' />
				{device.online ? (
					<motion.div
						className='h-3 w-3 rounded-full bg-green-500'
						animate={{scale: [1, 1.5, 1], opacity: [1, 0.5, 1]}}
						transition={{duration: 2, repeat: Infinity}}
					/>
				) : (
					<div className='h-3 w-3 rounded-full bg-neutral-400' />
				)}
			</div>

			{/* Device name */}
			<h3 className='mt-3 truncate text-base font-semibold text-text-primary'>{device.deviceName}</h3>

			{/* Platform label */}
			<p className='mt-0.5 text-sm text-text-secondary'>{meta.label}</p>

			{/* Last seen */}
			<p className='mt-1 text-xs text-text-tertiary'>
				{device.online ? `Connected ${formatRelativeTime(device.connectedAt)}` : `Last seen ${formatRelativeTime(device.connectedAt)}`}
			</p>

			{/* Tools badge */}
			<div className='mt-3'>
				<Badge variant='default'>{device.tools.length} tools</Badge>
			</div>

			{/* Actions */}
			<div className='mt-4 flex items-center gap-2'>
				<button
					onClick={() => onActivity(device)}
					className='rounded-md p-1.5 text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary'
					aria-label='View activity'
				>
					<IconHistory size={16} />
				</button>
				<button
					onClick={() => onRename(device)}
					className='rounded-md p-1.5 text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary'
					aria-label='Rename device'
				>
					<IconPencil size={16} />
				</button>
				<button
					onClick={() => onRemove(device)}
					className='rounded-md p-1.5 text-text-secondary transition-colors hover:bg-destructive/10 hover:text-destructive2'
					aria-label='Remove device'
				>
					<IconTrash size={16} />
				</button>
			</div>
		</motion.div>
	)
}

// ---------------------------------------------------------------------------
// Rename dialog
// ---------------------------------------------------------------------------

function RenameDialog({
	device,
	open,
	onOpenChange,
}: {
	device: DeviceData | null
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const [name, setName] = useState('')
	const utils = trpcReact.useUtils()
	const renameMutation = trpcReact.devices.rename.useMutation({
		onSuccess: () => {
			utils.devices.list.invalidate()
			onOpenChange(false)
		},
	})

	// Sync input when device changes
	const handleOpen = useCallback(
		(isOpen: boolean) => {
			if (isOpen && device) {
				setName(device.deviceName)
			}
			onOpenChange(isOpen)
		},
		[device, onOpenChange],
	)

	return (
		<Dialog open={open} onOpenChange={handleOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Rename Device</DialogTitle>
					<DialogDescription>Enter a new name for this device.</DialogDescription>
				</DialogHeader>
				<div className='py-4'>
					<Label htmlFor='device-name'>Device name</Label>
					<Input
						id='device-name'
						value={name}
						onChange={(e) => setName(e.target.value)}
						className='mt-1.5'
						autoFocus
						onKeyDown={(e) => {
							if (e.key === 'Enter' && device && name.trim()) {
								renameMutation.mutate({deviceId: device.deviceId, name: name.trim()})
							}
						}}
					/>
				</div>
				<DialogFooter>
					<Button variant='default' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant='primary'
						disabled={!name.trim() || renameMutation.isPending}
						onClick={() => {
							if (device && name.trim()) {
								renameMutation.mutate({deviceId: device.deviceId, name: name.trim()})
							}
						}}
					>
						{renameMutation.isPending ? 'Saving...' : 'Save'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// ---------------------------------------------------------------------------
// Remove dialog
// ---------------------------------------------------------------------------

function RemoveDialog({
	device,
	open,
	onOpenChange,
}: {
	device: DeviceData | null
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const [confirmText, setConfirmText] = useState('')
	const utils = trpcReact.useUtils()
	const removeMutation = trpcReact.devices.remove.useMutation({
		onSuccess: () => {
			utils.devices.list.invalidate()
			onOpenChange(false)
		},
	})

	const canRemove = device && confirmText === device.deviceName

	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen) => {
				if (!isOpen) setConfirmText('')
				onOpenChange(isOpen)
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Remove Device</DialogTitle>
					<DialogDescription>This will disconnect the device and revoke its access token.</DialogDescription>
				</DialogHeader>
				<div className='py-4'>
					<Label htmlFor='confirm-name'>
						Type <span className='font-semibold'>{device?.deviceName}</span> to confirm
					</Label>
					<Input
						id='confirm-name'
						value={confirmText}
						onChange={(e) => setConfirmText(e.target.value)}
						placeholder={device?.deviceName}
						className='mt-1.5'
						autoFocus
						onKeyDown={(e) => {
							if (e.key === 'Enter' && canRemove) {
								removeMutation.mutate({deviceId: device.deviceId, confirmName: confirmText})
							}
						}}
					/>
				</div>
				<DialogFooter>
					<Button variant='default' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant='destructive'
						disabled={!canRemove || removeMutation.isPending}
						onClick={() => {
							if (device && canRemove) {
								removeMutation.mutate({deviceId: device.deviceId, confirmName: confirmText})
							}
						}}
					>
						{removeMutation.isPending ? 'Removing...' : 'Remove'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// ---------------------------------------------------------------------------
// Activity dialog
// ---------------------------------------------------------------------------

function formatAuditTime(timestamp: string): string {
	const date = new Date(timestamp)
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
	if (seconds < 60) return 'just now'
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours}h ago`
	return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
}

function AuditEntryRow({entry}: {entry: {timestamp: string; toolName: string; params: Record<string, unknown>; success: boolean; duration: number; error?: string}}) {
	const [expanded, setExpanded] = useState(false)

	return (
		<div className='border-b border-border-subtle last:border-b-0'>
			<button onClick={() => setExpanded(!expanded)} className='flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2'>
				{entry.success ? (
					<IconCheck size={16} className='shrink-0 text-green-500' />
				) : (
					<IconX size={16} className='shrink-0 text-red-500' />
				)}
				<Badge variant='default' className='shrink-0 text-xs'>
					{entry.toolName}
				</Badge>
				<span className='flex-1 truncate text-sm text-text-secondary'>{entry.duration}ms</span>
				<span className='shrink-0 text-xs text-text-tertiary'>{formatAuditTime(entry.timestamp)}</span>
				{expanded ? <IconChevronDown size={14} className='shrink-0 text-text-tertiary' /> : <IconChevronRight size={14} className='shrink-0 text-text-tertiary' />}
			</button>
			{expanded && (
				<div className='bg-surface-0 px-4 py-3'>
					<pre className='max-h-40 overflow-auto rounded bg-surface-1 p-2 text-xs text-text-secondary'>{JSON.stringify(entry.params, null, 2)}</pre>
					{entry.error && <p className='mt-2 text-xs text-red-400'>{entry.error}</p>}
				</div>
			)}
		</div>
	)
}

function ActivityDialog({
	device,
	open,
	onOpenChange,
}: {
	device: DeviceData | null
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const {data: auditLog, isLoading} = trpcReact.devices.auditLog.useQuery(
		{deviceId: device?.deviceId ?? '', offset: 0, limit: 50},
		{enabled: !!device && open, refetchInterval: 10000},
	)

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-lg'>
				<DialogHeader>
					<DialogTitle>Activity Log - {device?.deviceName}</DialogTitle>
					<DialogDescription>Recent tool executions on this device.</DialogDescription>
				</DialogHeader>
				<div className='max-h-[400px] overflow-auto rounded border border-border-subtle'>
					{isLoading ? (
						<div className='flex items-center justify-center py-8'>
							<p className='text-sm text-text-secondary'>Loading activity...</p>
						</div>
					) : !auditLog || auditLog.length === 0 ? (
						<div className='flex items-center justify-center py-8'>
							<p className='text-sm text-text-secondary'>No activity recorded yet</p>
						</div>
					) : (
						auditLog.map((entry, i) => <AuditEntryRow key={`${entry.timestamp}-${i}`} entry={entry} />)
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export default function MyDevicesPanel() {
	const {data: devices, isLoading, refetch} = trpcReact.devices.list.useQuery(undefined, {refetchInterval: 10000})

	const [renameTarget, setRenameTarget] = useState<DeviceData | null>(null)
	const [removeTarget, setRemoveTarget] = useState<DeviceData | null>(null)
	const [activityTarget, setActivityTarget] = useState<DeviceData | null>(null)

	return (
		<div className='flex h-full flex-col'>
			{/* Header */}
			<div className='shrink-0 px-6 pt-5 pb-4'>
				<div className='flex items-center justify-between'>
					<div>
						<h1 className='text-2xl font-bold text-text-primary'>My Devices</h1>
						<p className='mt-1 text-sm text-text-secondary'>Manage your connected remote PCs</p>
					</div>
					<Button variant='default' size='sm' onClick={() => refetch()} className='gap-1.5'>
						<IconRefresh size={16} />
						Refresh
					</Button>
				</div>
			</div>

			{/* Content */}
			<div className='flex-1 overflow-auto px-6 pb-6'>
				{isLoading ? (
					<div className='flex h-full items-center justify-center'>
						<p className='text-sm text-text-secondary'>Loading devices...</p>
					</div>
				) : !devices || devices.length === 0 ? (
					/* Empty state */
					<div className='flex h-full flex-col items-center justify-center gap-3'>
						<IconDevices2 size={48} className='text-text-tertiary' />
						<h2 className='text-lg font-semibold text-text-primary'>No devices connected</h2>
						<p className='max-w-sm text-center text-sm text-text-secondary'>
							Install the Livinity agent on your PC to get started.
						</p>
					</div>
				) : (
					/* Device grid */
					<div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
						{devices.map((device) => (
							<DeviceCard
								key={device.deviceId}
								device={device}
								onRename={setRenameTarget}
								onRemove={setRemoveTarget}
								onActivity={setActivityTarget}
							/>
						))}
					</div>
				)}
			</div>

			{/* Dialogs */}
			<RenameDialog device={renameTarget} open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)} />
			<RemoveDialog device={removeTarget} open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)} />
			<ActivityDialog device={activityTarget} open={!!activityTarget} onOpenChange={(open) => !open && setActivityTarget(null)} />
		</div>
	)
}
