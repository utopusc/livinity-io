import {useState, useEffect} from 'react'
import {
	TbBrandDiscord,
	TbBrandTelegram,
	TbPlugConnected,
	TbPlugConnectedX,
	TbRefresh,
	TbExternalLink,
	TbEye,
	TbEyeOff,
} from 'react-icons/tb'
import {Loader2} from 'lucide-react'

import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/shadcn-components/ui/tabs'
import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'

import {SettingsPageLayout} from './_components/settings-page-layout'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ChannelStatus {
	enabled: boolean
	connected: boolean
	error?: string
	lastConnect?: string
	lastMessage?: string
	botName?: string
	botId?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel Definitions
// ─────────────────────────────────────────────────────────────────────────────

const CHANNELS = [
	{
		id: 'telegram',
		name: 'Telegram',
		icon: TbBrandTelegram,
		color: 'text-sky-400',
		bgColor: 'bg-sky-500/10',
		borderColor: 'border-sky-500/30',
		description: 'Connect via BotFather token',
		docsUrl: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
	},
	{
		id: 'discord',
		name: 'Discord',
		icon: TbBrandDiscord,
		color: 'text-indigo-400',
		bgColor: 'bg-indigo-500/10',
		borderColor: 'border-indigo-500/30',
		description: 'Connect your Discord bot',
		docsUrl: 'https://discord.com/developers/docs/intro',
	},
] as const

type ChannelId = (typeof CHANNELS)[number]['id']

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
	const [activeTab, setActiveTab] = useState<ChannelId>('telegram')

	return (
		<SettingsPageLayout title='Integrations' description='Connect messaging platforms to interact with Nexus AI from anywhere'>
			<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ChannelId)}>
				<TabsList className='grid w-full grid-cols-2'>
					{CHANNELS.map((channel) => (
						<TabsTrigger
							key={channel.id}
							value={channel.id}
							className='flex items-center gap-1.5'
						>
							<channel.icon className={cn('h-4 w-4', channel.color)} />
							<span>{channel.name}</span>
						</TabsTrigger>
					))}
				</TabsList>

				<div className='mt-4'>
					<TabsContent value='telegram' className='mt-0'>
						<TelegramPanel />
					</TabsContent>
					<TabsContent value='discord' className='mt-0'>
						<DiscordPanel />
					</TabsContent>
				</div>
			</Tabs>
		</SettingsPageLayout>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Telegram Panel
// ─────────────────────────────────────────────────────────────────────────────

function TelegramPanel() {
	const [token, setToken] = useState('')
	const [showToken, setShowToken] = useState(false)

	const configQ = trpcReact.ai.getIntegrationConfig.useQuery({channel: 'telegram'})
	const statusQ = trpcReact.ai.getIntegrationStatus.useQuery({channel: 'telegram'})
	const saveMutation = trpcReact.ai.saveIntegrationConfig.useMutation()
	const utils = trpcReact.useUtils()

	useEffect(() => {
		if (configQ.data?.token) {
			setToken(configQ.data.token)
		}
	}, [configQ.data])

	const channel = CHANNELS.find((c) => c.id === 'telegram')!
	const status = statusQ.data as ChannelStatus | undefined

	const handleSave = async () => {
		await saveMutation.mutateAsync({channel: 'telegram', config: {token, enabled: true}})
		utils.ai.getIntegrationConfig.invalidate()
		utils.ai.getIntegrationStatus.invalidate()
	}

	return (
		<div className='space-y-4'>
			<ChannelHeader channel={channel} />

			{/* Status */}
			<div className='rounded-radius-md border border-border-default bg-surface-base p-4'>
				<div className='flex items-center justify-between'>
					<div className='text-body font-medium'>Connection Status</div>
					<Button
						variant='default'
						size='sm'
						onClick={() => utils.ai.getIntegrationStatus.invalidate({channel: 'telegram'})}
						disabled={statusQ.isLoading}
					>
						<TbRefresh className={cn('h-4 w-4', statusQ.isLoading && 'animate-spin')} />
					</Button>
				</div>

				{statusQ.isLoading ? (
					<LoadingState />
				) : status ? (
					<div className='mt-4 space-y-3'>
						<StatusRow label='Enabled' connected={status.enabled} />
						<StatusRow label='Connected' connected={status.connected} />
						{status.botName && (
							<div className='flex items-center justify-between text-caption'>
								<span className='text-text-secondary'>Bot</span>
								<span className='text-text-secondary'>@{status.botName}</span>
							</div>
						)}
						{status.error && <ErrorBanner message={status.error} />}
					</div>
				) : (
					<EmptyState message='Not configured' />
				)}
			</div>

			{/* Configuration */}
			<div className='rounded-radius-md border border-border-default bg-surface-base p-4'>
				<div className='text-body font-medium'>Bot Token</div>
				<div className='mt-1 text-caption text-text-secondary'>
					Create a bot with{' '}
					<a
						href='https://t.me/BotFather'
						target='_blank'
						rel='noopener noreferrer'
						className='text-sky-400 hover:underline'
					>
						@BotFather
					</a>{' '}
					and paste the token here
				</div>
				<div className='mt-3 flex gap-2'>
					<div className='relative flex-1'>
						<Input
							type={showToken ? 'text' : 'password'}
							value={token}
							onChange={(e) => setToken(e.target.value)}
							placeholder='123456789:ABCdef...'
							className='pr-10'
						/>
						<button
							type='button'
							onClick={() => setShowToken(!showToken)}
							className='absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-secondary'
						>
							{showToken ? <TbEyeOff className='h-4 w-4' /> : <TbEye className='h-4 w-4' />}
						</button>
					</div>
				</div>
			</div>

			{/* Actions */}
			<div className='flex gap-2'>
				<Button
					variant='primary'
					className='flex-1'
					onClick={handleSave}
					disabled={!token || saveMutation.isPending}
				>
					{saveMutation.isPending ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
					Save & Connect
				</Button>
				{status?.enabled && (
					<Button
						variant='destructive'
						onClick={() =>
							saveMutation.mutateAsync({channel: 'telegram', config: {enabled: false}}).then(() => {
								utils.ai.getIntegrationConfig.invalidate()
								utils.ai.getIntegrationStatus.invalidate()
							})
						}
					>
						Disable
					</Button>
				)}
			</div>

			<UsageInfo
				items={[
					'Send messages directly to your bot',
					'Add the bot to groups (mention to interact)',
					'Supports inline mode for quick queries',
				]}
			/>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Discord Panel
// ─────────────────────────────────────────────────────────────────────────────

function DiscordPanel() {
	const [token, setToken] = useState('')
	const [showToken, setShowToken] = useState(false)

	const configQ = trpcReact.ai.getIntegrationConfig.useQuery({channel: 'discord'})
	const statusQ = trpcReact.ai.getIntegrationStatus.useQuery({channel: 'discord'})
	const saveMutation = trpcReact.ai.saveIntegrationConfig.useMutation()
	const testMutation = trpcReact.ai.testIntegration.useMutation()
	const utils = trpcReact.useUtils()

	useEffect(() => {
		if (configQ.data?.token) {
			setToken(configQ.data.token)
		}
	}, [configQ.data])

	const channel = CHANNELS.find((c) => c.id === 'discord')!
	const status = statusQ.data as ChannelStatus | undefined

	const handleSave = async () => {
		await saveMutation.mutateAsync({channel: 'discord', config: {token, enabled: true}})
		utils.ai.getIntegrationConfig.invalidate()
		utils.ai.getIntegrationStatus.invalidate()
	}

	const handleTest = async () => {
		await testMutation.mutateAsync({channel: 'discord'})
		utils.ai.getIntegrationStatus.invalidate()
	}

	const handleDisable = async () => {
		await saveMutation.mutateAsync({channel: 'discord', config: {enabled: false}})
		utils.ai.getIntegrationConfig.invalidate()
		utils.ai.getIntegrationStatus.invalidate()
	}

	return (
		<div className='space-y-4'>
			<ChannelHeader channel={channel} />

			{/* Status */}
			<div className='rounded-radius-md border border-border-default bg-surface-base p-4'>
				<div className='flex items-center justify-between'>
					<div className='text-body font-medium'>Connection Status</div>
					<Button
						variant='default'
						size='sm'
						onClick={() => utils.ai.getIntegrationStatus.invalidate({channel: 'discord'})}
						disabled={statusQ.isLoading}
					>
						<TbRefresh className={cn('h-4 w-4', statusQ.isLoading && 'animate-spin')} />
					</Button>
				</div>

				{statusQ.isLoading ? (
					<LoadingState />
				) : status ? (
					<div className='mt-4 space-y-3'>
						<StatusRow label='Enabled' connected={status.enabled} />
						<StatusRow label='Connected' connected={status.connected} />
						{status.botName && (
							<div className='flex items-center justify-between text-caption'>
								<span className='text-text-secondary'>Bot Name</span>
								<span className='text-text-secondary'>{status.botName}</span>
							</div>
						)}
						<TimestampRow label='Last Connect' value={status.lastConnect} />
						{status.error && <ErrorBanner message={status.error} />}
					</div>
				) : (
					<EmptyState message='Not configured' />
				)}
			</div>

			{/* Configuration */}
			<div className='rounded-radius-md border border-border-default bg-surface-base p-4'>
				<div className='text-body font-medium'>Bot Token</div>
				<div className='mt-1 text-caption text-text-secondary'>
					Get your bot token from the{' '}
					<a
						href='https://discord.com/developers/applications'
						target='_blank'
						rel='noopener noreferrer'
						className='text-indigo-400 hover:underline'
					>
						Discord Developer Portal
					</a>
				</div>
				<div className='mt-3 flex gap-2'>
					<div className='relative flex-1'>
						<Input
							type={showToken ? 'text' : 'password'}
							value={token}
							onChange={(e) => setToken(e.target.value)}
							placeholder='Enter bot token...'
							className='pr-10'
						/>
						<button
							type='button'
							onClick={() => setShowToken(!showToken)}
							className='absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-secondary'
						>
							{showToken ? <TbEyeOff className='h-4 w-4' /> : <TbEye className='h-4 w-4' />}
						</button>
					</div>
				</div>
			</div>

			{/* Actions */}
			<div className='flex gap-2'>
				<Button
					variant='primary'
					className='flex-1'
					onClick={handleSave}
					disabled={!token || saveMutation.isPending}
				>
					{saveMutation.isPending ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
					Save & Connect
				</Button>
				<Button variant='default' onClick={handleTest} disabled={!status?.enabled || testMutation.isPending}>
					{testMutation.isPending ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
					Test
				</Button>
				{status?.enabled && (
					<Button variant='destructive' onClick={handleDisable} disabled={saveMutation.isPending}>
						Disable
					</Button>
				)}
			</div>

			<UsageInfo
				items={[
					'Mention your bot in any channel to interact',
					'Use slash commands for quick actions',
					'Configure per-channel settings in Discord',
				]}
			/>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Components
// ─────────────────────────────────────────────────────────────────────────────

function ChannelHeader({channel}: {channel: (typeof CHANNELS)[number]}) {
	return (
		<div className={cn('rounded-radius-md border p-4', channel.borderColor, channel.bgColor)}>
			<div className='flex items-center gap-3'>
				<div className={cn('flex h-10 w-10 items-center justify-center rounded-radius-sm', 'bg-surface-2')}>
					<channel.icon className={cn('h-6 w-6', channel.color)} />
				</div>
				<div className='flex-1'>
					<div className='text-body-lg font-semibold'>{channel.name}</div>
					<div className='text-caption text-text-secondary'>{channel.description}</div>
				</div>
				<a
					href={channel.docsUrl}
					target='_blank'
					rel='noopener noreferrer'
					className='flex items-center gap-1 text-caption text-text-secondary hover:text-text-secondary'
				>
					Docs <TbExternalLink className='h-3.5 w-3.5' />
				</a>
			</div>
		</div>
	)
}

function StatusRow({label, connected}: {label: string; connected: boolean}) {
	return (
		<div className='flex items-center justify-between text-caption'>
			<span className='text-text-secondary'>{label}</span>
			<div className='flex items-center gap-2'>
				{connected ? (
					<>
						<TbPlugConnected className='h-4 w-4 text-green-500' />
						<span className='text-green-400'>Connected</span>
					</>
				) : (
					<>
						<TbPlugConnectedX className='h-4 w-4 text-red-500' />
						<span className='text-red-400'>Disconnected</span>
					</>
				)}
			</div>
		</div>
	)
}

function TimestampRow({label, value}: {label: string; value?: string}) {
	if (!value) return null
	return (
		<div className='flex items-center justify-between text-caption'>
			<span className='text-text-secondary'>{label}</span>
			<span className='text-text-secondary'>{new Date(value).toLocaleString()}</span>
		</div>
	)
}

function ErrorBanner({message}: {message: string}) {
	return <div className='rounded-radius-sm bg-red-500/20 p-2 text-caption text-red-400'>{message}</div>
}

function LoadingState() {
	return (
		<div className='mt-4 flex items-center justify-center py-8'>
			<Loader2 className='h-8 w-8 animate-spin text-text-secondary' />
		</div>
	)
}

function EmptyState({message}: {message: string}) {
	return <div className='mt-4 text-center text-caption text-text-secondary'>{message}</div>
}

function UsageInfo({items}: {items: string[]}) {
	return (
		<div className='rounded-radius-md border border-blue-500/30 bg-blue-500/10 p-4'>
			<div className='text-body font-medium text-blue-400'>How it works</div>
			<div className='mt-2 space-y-1 text-caption text-text-secondary'>
				{items.map((item, i) => (
					<p key={i}>• {item}</p>
				))}
			</div>
		</div>
	)
}
