import {useState, useEffect} from 'react'
import {Loader2} from 'lucide-react'
import {
	TbCheck,
	TbShieldLock,
	TbUserCheck,
	TbUserX,
	TbTrash,
	TbBrandTelegram,
	TbBrandDiscord,
	TbRefresh,
} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/shadcn-components/ui/select'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/shadcn-components/ui/tabs'
import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'

import {SettingsPageLayout} from './_components/settings-page-layout'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PairingRequest {
	channel: string
	userId: string
	userName: string
	code: string
	createdAt: number
	channelChatId: string
}

type DmPolicy = 'pairing' | 'allowlist' | 'open' | 'disabled'

const POLICY_LABELS: Record<DmPolicy, {label: string; description: string}> = {
	pairing: {label: 'Pairing (Recommended)', description: 'Unknown users get an activation code for admin approval'},
	allowlist: {label: 'Allowlist Only', description: 'Only pre-approved users can interact'},
	open: {label: 'Open', description: 'Anyone can interact (no security checks)'},
	disabled: {label: 'Disabled', description: 'Bot ignores all DMs on this channel'},
}

const CHANNELS = [
	{id: 'telegram', name: 'Telegram', icon: TbBrandTelegram, color: 'text-sky-400'},
	{id: 'discord', name: 'Discord', icon: TbBrandDiscord, color: 'text-indigo-400'},
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Standalone Page (route-based)
// ─────────────────────────────────────────────────────────────────────────────

export default function DmPairingPage() {
	return (
		<SettingsPageLayout title='DM Security' description='Control who can interact with your bot via direct messages'>
			<DmPairingContent />
		</SettingsPageLayout>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Content (used by both standalone page and settings inline section)
// ─────────────────────────────────────────────────────────────────────────────

export function DmPairingContent() {
	const [activeTab, setActiveTab] = useState<'pending' | 'allowlist' | 'policy'>('pending')

	return (
		<div className='space-y-4'>
			{/* Info Banner */}
			<div className='rounded-radius-md border border-amber-500/30 bg-amber-500/10 p-4'>
				<div className='flex items-start gap-3'>
					<TbShieldLock className='mt-0.5 h-5 w-5 text-amber-400 shrink-0' />
					<div>
						<div className='text-body font-medium text-amber-400'>DM Pairing Security</div>
						<div className='mt-1 text-caption text-text-secondary'>
							When someone sends a DM to your bot, they receive a 6-digit activation code.
							You must approve or deny the request before they can interact with the AI.
						</div>
					</div>
				</div>
			</div>

			<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
				<TabsList className='grid w-full grid-cols-3'>
					<TabsTrigger value='pending' className='flex items-center gap-1.5'>
						<TbUserCheck className='h-4 w-4' />
						Pending
					</TabsTrigger>
					<TabsTrigger value='allowlist' className='flex items-center gap-1.5'>
						<TbCheck className='h-4 w-4' />
						Allowlist
					</TabsTrigger>
					<TabsTrigger value='policy' className='flex items-center gap-1.5'>
						<TbShieldLock className='h-4 w-4' />
						Policy
					</TabsTrigger>
				</TabsList>

				<TabsContent value='pending' className='mt-4'>
					<PendingRequestsPanel />
				</TabsContent>
				<TabsContent value='allowlist' className='mt-4'>
					<AllowlistPanel />
				</TabsContent>
				<TabsContent value='policy' className='mt-4'>
					<PolicyPanel />
				</TabsContent>
			</Tabs>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending Requests Panel
// ─────────────────────────────────────────────────────────────────────────────

function PendingRequestsPanel() {
	const pendingQ = trpcReact.ai.getDmPairingPending.useQuery(undefined, {
		refetchInterval: 10_000, // Auto-refresh every 10s
	})
	const approveMutation = trpcReact.ai.approveDmPairing.useMutation()
	const denyMutation = trpcReact.ai.denyDmPairing.useMutation()
	const utils = trpcReact.useUtils()

	const handleApprove = async (channel: string, userId: string) => {
		await approveMutation.mutateAsync({channel, userId})
		utils.ai.getDmPairingPending.invalidate()
		utils.ai.getDmPairingAllowlist.invalidate()
	}

	const handleDeny = async (channel: string, userId: string) => {
		await denyMutation.mutateAsync({channel, userId})
		utils.ai.getDmPairingPending.invalidate()
	}

	const pending = (pendingQ.data?.pending || []) as PairingRequest[]

	return (
		<div className='space-y-3'>
			<div className='flex items-center justify-between'>
				<h3 className='text-body font-medium'>Pending Requests</h3>
				<Button
					variant='default'
					size='sm'
					onClick={() => pendingQ.refetch()}
					disabled={pendingQ.isLoading}
				>
					<TbRefresh className={cn('h-4 w-4', pendingQ.isLoading && 'animate-spin')} />
				</Button>
			</div>

			{pendingQ.isLoading ? (
				<div className='flex items-center justify-center py-8'>
					<Loader2 className='h-6 w-6 animate-spin text-text-secondary' />
				</div>
			) : pending.length === 0 ? (
				<div className='rounded-radius-md border border-border-default bg-surface-base p-8 text-center'>
					<TbUserCheck className='mx-auto h-8 w-8 text-text-tertiary' />
					<p className='mt-2 text-body-sm text-text-secondary'>No pending requests</p>
					<p className='text-caption text-text-tertiary'>
						When someone messages your bot, their request will appear here
					</p>
				</div>
			) : (
				<div className='space-y-2'>
					{pending.map((req) => {
						const channelInfo = CHANNELS.find((c) => c.id === req.channel)
						const ChannelIcon = channelInfo?.icon || TbShieldLock
						const timeAgo = formatTimeAgo(req.createdAt)

						return (
							<div
								key={`${req.channel}-${req.userId}`}
								className='rounded-radius-md border border-border-default bg-surface-base p-4'
							>
								<div className='flex items-start justify-between gap-3'>
									<div className='flex items-start gap-3'>
										<div className='flex h-10 w-10 items-center justify-center rounded-radius-sm bg-surface-2'>
											<ChannelIcon className={cn('h-5 w-5', channelInfo?.color || 'text-text-secondary')} />
										</div>
										<div>
											<div className='text-body font-medium'>{req.userName}</div>
											<div className='text-caption text-text-secondary'>
												{channelInfo?.name || req.channel} &middot; Code: <span className='font-mono font-medium text-amber-400'>{req.code}</span>
											</div>
											<div className='text-caption-sm text-text-tertiary'>
												User ID: {req.userId} &middot; {timeAgo}
											</div>
										</div>
									</div>

									<div className='flex gap-1.5 shrink-0'>
										<Button
											variant='primary'
											size='sm'
											onClick={() => handleApprove(req.channel, req.userId)}
											disabled={approveMutation.isPending || denyMutation.isPending}
										>
											{approveMutation.isPending ? (
												<Loader2 className='h-3.5 w-3.5 animate-spin' />
											) : (
												<TbUserCheck className='h-3.5 w-3.5' />
											)}
											Approve
										</Button>
										<Button
											variant='destructive'
											size='sm'
											onClick={() => handleDeny(req.channel, req.userId)}
											disabled={approveMutation.isPending || denyMutation.isPending}
										>
											{denyMutation.isPending ? (
												<Loader2 className='h-3.5 w-3.5 animate-spin' />
											) : (
												<TbUserX className='h-3.5 w-3.5' />
											)}
											Deny
										</Button>
									</div>
								</div>
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Allowlist Panel
// ─────────────────────────────────────────────────────────────────────────────

function AllowlistPanel() {
	const [selectedChannel, setSelectedChannel] = useState<string>('telegram')
	const allowlistQ = trpcReact.ai.getDmPairingAllowlist.useQuery(
		{channel: selectedChannel},
		{refetchInterval: 10_000},
	)
	const removeMutation = trpcReact.ai.removeDmPairingAllowlist.useMutation()
	const utils = trpcReact.useUtils()

	const handleRemove = async (userId: string) => {
		await removeMutation.mutateAsync({channel: selectedChannel, userId})
		utils.ai.getDmPairingAllowlist.invalidate()
	}

	const users = allowlistQ.data?.users || []

	return (
		<div className='space-y-3'>
			<div className='flex items-center justify-between'>
				<h3 className='text-body font-medium'>Approved Users</h3>
				<div className='flex items-center gap-2'>
					<Select value={selectedChannel} onValueChange={setSelectedChannel}>
						<SelectTrigger className='w-[140px]'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CHANNELS.map((ch) => (
								<SelectItem key={ch.id} value={ch.id}>
									<span className='flex items-center gap-1.5'>
										<ch.icon className={cn('h-3.5 w-3.5', ch.color)} />
										{ch.name}
									</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						variant='default'
						size='sm'
						onClick={() => allowlistQ.refetch()}
						disabled={allowlistQ.isLoading}
					>
						<TbRefresh className={cn('h-4 w-4', allowlistQ.isLoading && 'animate-spin')} />
					</Button>
				</div>
			</div>

			{allowlistQ.isLoading ? (
				<div className='flex items-center justify-center py-8'>
					<Loader2 className='h-6 w-6 animate-spin text-text-secondary' />
				</div>
			) : users.length === 0 ? (
				<div className='rounded-radius-md border border-border-default bg-surface-base p-8 text-center'>
					<TbCheck className='mx-auto h-8 w-8 text-text-tertiary' />
					<p className='mt-2 text-body-sm text-text-secondary'>No approved users</p>
					<p className='text-caption text-text-tertiary'>
						Approve pending requests to add users here
					</p>
				</div>
			) : (
				<div className='space-y-1'>
					{users.map((userId) => (
						<div
							key={userId}
							className='flex items-center justify-between rounded-radius-sm border border-border-default bg-surface-base px-4 py-3'
						>
							<div className='flex items-center gap-3'>
								<div className='flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20'>
									<TbCheck className='h-4 w-4 text-green-400' />
								</div>
								<div>
									<div className='text-body-sm font-mono'>{userId}</div>
								</div>
							</div>
							<Button
								variant='default'
								size='sm'
								onClick={() => handleRemove(userId)}
								disabled={removeMutation.isPending}
							>
								{removeMutation.isPending ? (
									<Loader2 className='h-3.5 w-3.5 animate-spin' />
								) : (
									<TbTrash className='h-3.5 w-3.5 text-red-400' />
								)}
							</Button>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Policy Panel
// ─────────────────────────────────────────────────────────────────────────────

function PolicyPanel() {
	return (
		<div className='space-y-4'>
			<h3 className='text-body font-medium'>DM Policy per Channel</h3>
			<p className='text-caption text-text-secondary'>
				Control how each messaging channel handles direct messages from unknown users.
			</p>

			{CHANNELS.map((ch) => (
				<ChannelPolicyRow key={ch.id} channel={ch} />
			))}
		</div>
	)
}

function ChannelPolicyRow({channel}: {channel: (typeof CHANNELS)[number]}) {
	const policyQ = trpcReact.ai.getDmPairingPolicy.useQuery({channel: channel.id})
	const setPolicyMutation = trpcReact.ai.setDmPairingPolicy.useMutation()
	const utils = trpcReact.useUtils()
	const [saved, setSaved] = useState(false)

	const currentPolicy = (policyQ.data?.policy || 'pairing') as DmPolicy

	const handleChange = async (value: string) => {
		await setPolicyMutation.mutateAsync({channel: channel.id, policy: value as DmPolicy})
		utils.ai.getDmPairingPolicy.invalidate({channel: channel.id})
		setSaved(true)
		setTimeout(() => setSaved(false), 2000)
	}

	return (
		<div className='rounded-radius-md border border-border-default bg-surface-base p-4'>
			<div className='flex items-center justify-between gap-4'>
				<div className='flex items-center gap-3'>
					<div className='flex h-10 w-10 items-center justify-center rounded-radius-sm bg-surface-2'>
						<channel.icon className={cn('h-5 w-5', channel.color)} />
					</div>
					<div>
						<div className='text-body font-medium'>{channel.name}</div>
						<div className='text-caption text-text-secondary'>
							{POLICY_LABELS[currentPolicy]?.description || 'Loading...'}
						</div>
					</div>
				</div>

				<div className='flex items-center gap-2 shrink-0'>
					{saved && <TbCheck className='h-4 w-4 text-green-400' />}
					<Select
						value={currentPolicy}
						onValueChange={handleChange}
						disabled={policyQ.isLoading || setPolicyMutation.isPending}
					>
						<SelectTrigger className='w-[180px]'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(Object.keys(POLICY_LABELS) as DmPolicy[]).map((p) => (
								<SelectItem key={p} value={p}>
									{POLICY_LABELS[p].label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatTimeAgo(timestamp: number): string {
	const seconds = Math.floor((Date.now() - timestamp) / 1000)
	if (seconds < 60) return 'just now'
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours}h ago`
	return `${Math.floor(hours / 24)}d ago`
}
