import {useState} from 'react'
import {
	TbAlertTriangle,
	TbDeviceDesktop,
	TbLoader2,
	TbRefresh,
	TbX,
} from 'react-icons/tb'
import {toast} from 'sonner'

import {Badge} from '@/shadcn-components/ui/badge'
import {Button} from '@/shadcn-components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'

// Phase 16 ADMIN-01 + ADMIN-02 — cross-user admin device table.
// Surfaces every live DeviceBridge across every user and exposes a
// one-click Force Disconnect that tears down the bridge via the
// admin_force_disconnect tunnel verb (platform/relay closes target WS with
// code 4403 reason 'admin_disconnect'). Wired to admin-devices menu
// entry in settings-content.tsx (adminOnly: true so non-admin users
// never see it — useVisibleMenuItems filters by role).

const PLATFORM_LABEL: Record<string, string> = {
	win32: 'Windows',
	darwin: 'macOS',
	linux: 'Linux',
}

function formatRelativeTime(timestampMs: number): string {
	const seconds = Math.floor((Date.now() - timestampMs) / 1000)
	if (seconds < 60) return 'just now'
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours}h ago`
	const days = Math.floor(hours / 24)
	return `${days}d ago`
}

interface AdminDeviceRow {
	deviceId: string
	deviceName: string
	platform: string
	ownerUserId: string
	ownerUsername: string | null
	online: boolean
	connectedAt: number
}

export function AdminDevicesSection() {
	const utils = trpcReact.useUtils()
	const listQ = trpcReact.devicesAdmin.adminListAll.useQuery(undefined, {
		// Auto-refresh so force-disconnect transitions surface within ~10s
		// without a manual reload (must_haves: reflects offline within one
		// refetch cycle ≤10s).
		refetchInterval: 10_000,
	})
	const devices: AdminDeviceRow[] = listQ.data?.devices ?? []

	const [confirmTarget, setConfirmTarget] = useState<AdminDeviceRow | null>(null)

	const forceDisconnectMut = trpcReact.devicesAdmin.adminForceDisconnect.useMutation({
		onSuccess: (_data, variables) => {
			toast.success(`Bridge disconnected for device ${variables.deviceId.slice(0, 8)}…`)
			utils.devicesAdmin.adminListAll.invalidate()
			setConfirmTarget(null)
		},
		onError: (err) => {
			toast.error(err.message || 'Force disconnect failed')
		},
	})

	// Loading
	if (listQ.isLoading) {
		return (
			<div className='flex items-center justify-center py-12'>
				<TbLoader2 className='h-5 w-5 animate-spin text-text-tertiary' />
			</div>
		)
	}

	// Error
	if (listQ.isError) {
		return (
			<div className='rounded-radius-md border border-red-500/30 bg-red-500/5 p-4'>
				<div className='flex items-center gap-2 text-red-500'>
					<TbAlertTriangle className='h-5 w-5' />
					<span className='text-body-sm font-medium'>Failed to load devices</span>
				</div>
				<p className='mt-1 text-caption text-text-tertiary'>{listQ.error?.message ?? 'Unknown error'}</p>
				<Button size='sm' className='mt-3' onClick={() => listQ.refetch()}>
					Retry
				</Button>
			</div>
		)
	}

	// Empty
	if (devices.length === 0) {
		return (
			<div className='rounded-radius-md border border-border-default bg-surface-base p-6 text-center'>
				<TbDeviceDesktop className='mx-auto h-8 w-8 text-text-tertiary' />
				<div className='mt-2 text-body-sm font-medium text-text-primary'>No devices</div>
				<div className='mt-1 text-caption text-text-tertiary'>
					No devices have connected to this server yet.
				</div>
			</div>
		)
	}

	return (
		<div className='space-y-4'>
			<div className='flex items-center justify-between'>
				<p className='text-body-sm text-text-secondary'>
					All devices across all users. Use Force Disconnect to terminate a compromised bridge —
					the action is audit-logged.
				</p>
				<Button
					size='sm'
					variant='default'
					onClick={() => listQ.refetch()}
					disabled={listQ.isFetching}
				>
					<TbRefresh className={cn('mr-1.5 h-3.5 w-3.5', listQ.isFetching && 'animate-spin')} />
					Refresh
				</Button>
			</div>

			{/* Devices table */}
			<div className='overflow-hidden rounded-radius-md border border-border-default bg-surface-base'>
				<table className='w-full text-left text-body-sm'>
					<thead className='bg-surface-1 text-caption-sm text-text-tertiary'>
						<tr>
							<th className='px-3 py-2 font-medium'>User</th>
							<th className='px-3 py-2 font-medium'>Device</th>
							<th className='px-3 py-2 font-medium'>Platform</th>
							<th className='px-3 py-2 font-medium'>Status</th>
							<th className='px-3 py-2 font-medium'>Last Seen</th>
							<th className='px-3 py-2 font-medium text-right'>Action</th>
						</tr>
					</thead>
					<tbody className='divide-y divide-border-default'>
						{devices.map((d) => (
							<tr key={d.deviceId} className='hover:bg-surface-1'>
								<td className='px-3 py-2.5 font-medium text-text-primary'>
									{d.ownerUsername ?? <span className='text-text-tertiary'>unknown</span>}
								</td>
								<td className='px-3 py-2.5'>
									<div className='text-text-primary'>{d.deviceName}</div>
									<div className='text-caption-sm text-text-tertiary font-mono'>
										{d.deviceId.slice(0, 12)}…
									</div>
								</td>
								<td className='px-3 py-2.5 text-text-secondary'>
									{PLATFORM_LABEL[d.platform] ?? d.platform}
								</td>
								<td className='px-3 py-2.5'>
									{d.online ? (
										<Badge variant='default' className='bg-green-500/15 text-green-600 dark:text-green-400'>
											<span className='mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-500' />
											Online
										</Badge>
									) : (
										<Badge variant='default' className='text-text-tertiary'>
											<span className='mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-neutral-400' />
											Offline
										</Badge>
									)}
								</td>
								<td className='px-3 py-2.5 text-text-tertiary'>
									{formatRelativeTime(d.connectedAt)}
								</td>
								<td className='px-3 py-2.5 text-right'>
									{d.online ? (
										<Button
											size='sm'
											variant='destructive'
											onClick={() => setConfirmTarget(d)}
											disabled={forceDisconnectMut.isPending}
											className='bg-red-500 hover:bg-red-600 text-white'
										>
											<TbX className='mr-1.5 h-3.5 w-3.5' />
											Force Disconnect
										</Button>
									) : (
										<span className='text-text-tertiary'>—</span>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{/* Confirmation dialog — destructive action ALWAYS confirms */}
			<Dialog open={confirmTarget !== null} onOpenChange={(open) => !open && setConfirmTarget(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Force disconnect device?</DialogTitle>
					</DialogHeader>
					<div className='space-y-2 py-2 text-body-sm'>
						<p className='text-text-secondary'>
							This closes the live bridge for{' '}
							<span className='font-medium text-text-primary'>{confirmTarget?.deviceName}</span>
							{' '}owned by{' '}
							<span className='font-medium text-text-primary'>{confirmTarget?.ownerUsername ?? 'unknown'}</span>.
						</p>
						<p className='text-caption text-text-tertiary'>
							The device token and database record are preserved; the device can re-pair. This action is
							recorded in the device audit log.
						</p>
					</div>
					<DialogFooter>
						<Button
							variant='default'
							onClick={() => setConfirmTarget(null)}
							disabled={forceDisconnectMut.isPending}
						>
							Cancel
						</Button>
						<Button
							variant='destructive'
							className='bg-red-500 hover:bg-red-600 text-white'
							disabled={forceDisconnectMut.isPending}
							onClick={() => {
								if (confirmTarget) {
									forceDisconnectMut.mutate({deviceId: confirmTarget.deviceId})
								}
							}}
						>
							{forceDisconnectMut.isPending ? (
								<>
									<TbLoader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
									Disconnecting…
								</>
							) : (
								'Force Disconnect'
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
