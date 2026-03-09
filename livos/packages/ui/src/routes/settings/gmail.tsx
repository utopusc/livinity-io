import {Loader2} from 'lucide-react'
import {useState, useEffect, useCallback, type KeyboardEvent} from 'react'
import {
	TbMail,
	TbPlugConnected,
	TbPlugConnectedX,
	TbExternalLink,
	TbAlertCircle,
	TbCircleCheck,
	TbLoader2,
	TbKey,
	TbShieldLock,
	TbFilter,
	TbBell,
	TbClock,
	TbX,
	TbLock,
	TbMailForward,
} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {trpcReact} from '@/trpc/trpc'

// ─────────────────────────────────────────────────────────────────────────────
// Tag Input Component
// ─────────────────────────────────────────────────────────────────────────────

function TagInput({
	value,
	onChange,
	placeholder,
}: {
	value: string[]
	onChange: (tags: string[]) => void
	placeholder: string
}) {
	const [input, setInput] = useState('')

	const addTag = useCallback(() => {
		const tag = input.trim().toLowerCase()
		if (tag && !value.includes(tag)) {
			onChange([...value, tag])
		}
		setInput('')
	}, [input, value, onChange])

	const removeTag = (tag: string) => {
		onChange(value.filter((t) => t !== tag))
	}

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault()
			addTag()
		}
		if (e.key === 'Backspace' && !input && value.length > 0) {
			onChange(value.slice(0, -1))
		}
	}

	return (
		<div className='rounded-radius-sm border border-border-default bg-surface-2 px-2 py-1.5 focus-within:border-blue-500'>
			<div className='flex flex-wrap gap-1.5'>
				{value.map((tag) => (
					<span
						key={tag}
						className='flex items-center gap-1 rounded-radius-xs bg-surface-3 px-2 py-0.5 text-caption text-text-primary'
					>
						{tag}
						<button
							type='button'
							onClick={() => removeTag(tag)}
							className='text-text-tertiary hover:text-red-400'
						>
							<TbX className='h-3 w-3' />
						</button>
					</span>
				))}
				<input
					type='text'
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					onBlur={addTag}
					placeholder={value.length === 0 ? placeholder : ''}
					className='min-w-[120px] flex-1 bg-transparent py-0.5 text-body-sm text-text-primary placeholder:text-text-tertiary focus:outline-none'
				/>
			</div>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Section wrapper
// ─────────────────────────────────────────────────────────────────────────────

function SettingsSection({
	icon: Icon,
	title,
	description,
	children,
}: {
	icon: React.ComponentType<{className?: string}>
	title: string
	description: string
	children: React.ReactNode
}) {
	return (
		<div className='rounded-radius-md border border-border-default bg-surface-base p-4 space-y-3'>
			<div className='flex items-center gap-2'>
				<Icon className='h-4 w-4 text-text-secondary' />
				<div className='text-body font-medium text-text-primary'>{title}</div>
			</div>
			<p className='text-caption text-text-tertiary'>{description}</p>
			<div className='space-y-3'>{children}</div>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle row
// ─────────────────────────────────────────────────────────────────────────────

function ToggleRow({
	label,
	description,
	checked,
	onChange,
	variant = 'default',
}: {
	label: string
	description: string
	checked: boolean
	onChange: (v: boolean) => void
	variant?: 'default' | 'danger'
}) {
	return (
		<label className='flex items-start gap-3 cursor-pointer'>
			<button
				type='button'
				role='switch'
				aria-checked={checked}
				onClick={() => onChange(!checked)}
				className={`mt-0.5 relative h-5 w-9 shrink-0 rounded-full transition-colors ${
					checked
						? variant === 'danger'
							? 'bg-red-500'
							: 'bg-blue-500'
						: 'bg-surface-3'
				}`}
			>
				<span
					className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
						checked ? 'translate-x-4' : ''
					}`}
				/>
			</button>
			<div className='flex-1'>
				<div className='text-body-sm text-text-primary'>{label}</div>
				<div className='text-caption text-text-tertiary'>{description}</div>
			</div>
		</label>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Gmail Settings Content
// ─────────────────────────────────────────────────────────────────────────────

type GmailSettings = {
	processingMode: 'disabled' | 'notify_only' | 'full'
	sendProtection: boolean
	senderWhitelist: string[]
	senderBlacklist: string[]
	subjectKeywords: string[]
	importantSenders: string[]
	notifyChannel: string
	notifyChatId: string
	gmailPollIntervalSec: number
	maxEmailsPerPoll: number
}

const DEFAULT_SETTINGS: GmailSettings = {
	processingMode: 'notify_only',
	sendProtection: true,
	senderWhitelist: [],
	senderBlacklist: [],
	subjectKeywords: [],
	importantSenders: [],
	notifyChannel: 'none',
	notifyChatId: '',
	gmailPollIntervalSec: 60,
	maxEmailsPerPoll: 5,
}

export function GmailContent() {
	const [connectUrl, setConnectUrl] = useState<string | null>(null)
	const [clientId, setClientId] = useState('')
	const [clientSecret, setClientSecret] = useState('')
	const [settings, setSettings] = useState<GmailSettings>(DEFAULT_SETTINGS)
	const [dirty, setDirty] = useState(false)

	const statusQ = trpcReact.ai.getGmailStatus.useQuery(undefined, {
		refetchInterval: 10000,
	})
	const settingsQ = trpcReact.ai.getGmailSettings.useQuery(undefined, {
		enabled: !!statusQ.data?.connected,
	})
	const utils = trpcReact.useUtils()

	// Sync fetched settings into local state
	useEffect(() => {
		if (settingsQ.data) {
			setSettings({...DEFAULT_SETTINGS, ...settingsQ.data})
			setDirty(false)
		}
	}, [settingsQ.data])

	const saveCredentialsMutation = trpcReact.ai.saveGmailCredentials.useMutation({
		onSuccess: () => {
			setClientId('')
			setClientSecret('')
			utils.ai.getGmailStatus.invalidate()
		},
	})

	const startOAuthMutation = trpcReact.ai.startGmailOauth.useMutation({
		onSuccess: (data) => {
			if (data.url) {
				window.open(data.url, '_blank', 'noopener,noreferrer')
				setConnectUrl(data.url)
			}
		},
	})

	const disconnectMutation = trpcReact.ai.disconnectGmail.useMutation({
		onSuccess: () => {
			setConnectUrl(null)
			utils.ai.getGmailStatus.invalidate()
		},
	})

	const updateSettingsMutation = trpcReact.ai.updateGmailSettings.useMutation({
		onSuccess: () => {
			setDirty(false)
			utils.ai.getGmailSettings.invalidate()
		},
	})

	useEffect(() => {
		const params = new URLSearchParams(window.location.search)
		const gmailParam = params.get('gmail')
		if (gmailParam) {
			const url = new URL(window.location.href)
			url.searchParams.delete('gmail')
			url.searchParams.delete('message')
			window.history.replaceState({}, '', url.toString())
			utils.ai.getGmailStatus.invalidate()
		}
	}, [])

	const status = statusQ.data

	const handleConnect = () => {
		startOAuthMutation.mutate({publicUrl: window.location.origin})
	}

	const handleDisconnect = () => {
		if (!confirm('Disconnect Gmail? This will stop email polling and clear stored tokens.')) return
		disconnectMutation.mutate()
	}

	const updateSetting = <K extends keyof GmailSettings>(key: K, value: GmailSettings[K]) => {
		setSettings((prev) => ({...prev, [key]: value}))
		setDirty(true)
	}

	const handleSaveSettings = () => {
		updateSettingsMutation.mutate(settings)
	}

	if (statusQ.isLoading) {
		return (
			<div className='flex items-center justify-center py-12'>
				<Loader2 className='size-6 animate-spin text-text-tertiary' />
			</div>
		)
	}

	return (
		<div className='max-w-lg space-y-6'>
			{/* Header */}
			<div className='space-y-2'>
				<h3 className='text-body font-medium text-text-primary'>Gmail Integration</h3>
				<p className='text-body-sm text-text-secondary'>
					Connect your Gmail account to let the AI agent receive and process emails.
				</p>
			</div>

			{/* Status Card */}
			<div
				className={`rounded-radius-md border p-4 ${
					status?.connected
						? 'border-green-500/30 bg-green-500/10'
						: status?.configured
							? 'border-red-500/30 bg-red-500/10'
							: 'border-amber-500/30 bg-amber-500/10'
				}`}
			>
				<div className='flex items-center gap-3'>
					<div className='flex h-10 w-10 items-center justify-center rounded-radius-sm bg-surface-2'>
						<TbMail className='h-6 w-6 text-red-400' />
					</div>
					<div className='flex-1'>
						<div className='text-body-lg font-semibold'>Gmail</div>
						<div className='text-caption text-text-secondary'>
							{status?.connected
								? `Connected as ${status.email}`
								: status?.configured
									? 'Credentials configured — not connected'
									: 'Enter your Google OAuth credentials to get started'}
						</div>
					</div>
					{status?.connected ? (
						<div className='flex items-center gap-2 text-caption text-green-400'>
							<TbPlugConnected className='h-4 w-4' /> Connected
						</div>
					) : (
						<div className='flex items-center gap-2 text-caption text-red-400'>
							<TbPlugConnectedX className='h-4 w-4' /> Disconnected
						</div>
					)}
				</div>

				{status?.error && (
					<div className='mt-3 flex items-start gap-2 text-caption text-amber-400'>
						<TbAlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
						<span>{status.error}</span>
					</div>
				)}

				{status?.lastMessage && (
					<div className='mt-2 text-caption text-text-tertiary'>
						Last email check: {new Date(status.lastMessage).toLocaleString()}
					</div>
				)}
			</div>

			{/* Connection Actions */}
			{!status?.configured ? (
				<div className='rounded-radius-md border border-border-default bg-surface-base p-4 space-y-4'>
					<div className='flex items-center gap-2'>
						<TbKey className='h-4 w-4 text-text-secondary' />
						<div className='text-body font-medium'>Google OAuth Credentials</div>
					</div>
					<div className='text-body-sm text-text-secondary'>
						Create OAuth 2.0 credentials in the Google Cloud Console, then paste them here.
					</div>
					<div className='space-y-3'>
						<div className='space-y-1.5'>
							<label className='text-caption text-text-secondary'>Client ID</label>
							<input
								type='text'
								value={clientId}
								onChange={(e) => setClientId(e.target.value)}
								placeholder='123456789-abc.apps.googleusercontent.com'
								className='w-full rounded-radius-sm border border-border-default bg-surface-2 px-3 py-2 text-body-sm text-text-primary placeholder:text-text-tertiary focus:border-blue-500 focus:outline-none'
							/>
						</div>
						<div className='space-y-1.5'>
							<label className='text-caption text-text-secondary'>Client Secret</label>
							<input
								type='password'
								value={clientSecret}
								onChange={(e) => setClientSecret(e.target.value)}
								placeholder='GOCSPX-...'
								className='w-full rounded-radius-sm border border-border-default bg-surface-2 px-3 py-2 text-body-sm text-text-primary placeholder:text-text-tertiary focus:border-blue-500 focus:outline-none'
							/>
						</div>
					</div>
					<div className='flex items-center gap-3'>
						<Button
							variant='primary'
							size='sm'
							onClick={() => saveCredentialsMutation.mutate({clientId, clientSecret})}
							disabled={!clientId.trim() || !clientSecret.trim() || saveCredentialsMutation.isPending}
						>
							{saveCredentialsMutation.isPending ? (
								<><TbLoader2 className='h-4 w-4 animate-spin' /> Saving...</>
							) : (
								'Save Credentials'
							)}
						</Button>
						<a
							href='https://console.cloud.google.com/apis/credentials'
							target='_blank'
							rel='noopener noreferrer'
							className='flex items-center gap-1.5 text-caption text-blue-400 hover:text-blue-300'
						>
							<TbExternalLink className='h-3.5 w-3.5' />
							Google Cloud Console
						</a>
					</div>
					{saveCredentialsMutation.isError && (
						<p className='text-caption text-red-400'>{saveCredentialsMutation.error.message}</p>
					)}
					<div className='text-caption text-text-tertiary space-y-1'>
						<p>1. Go to Google Cloud Console &gt; APIs &amp; Services &gt; Credentials</p>
						<p>2. Create an OAuth 2.0 Client ID (Web application)</p>
						<p>3. Add your callback URL as an authorized redirect URI</p>
					</div>
				</div>
			) : status?.connected ? (
				<div className='space-y-3'>
					<div className='flex items-center gap-2 text-body-sm text-green-400'>
						<TbCircleCheck className='h-4 w-4' />
						Gmail is connected and polling for new emails
					</div>
					<Button
						variant='destructive'
						size='sm'
						onClick={handleDisconnect}
						disabled={disconnectMutation.isPending}
					>
						{disconnectMutation.isPending ? (
							<><TbLoader2 className='h-4 w-4 animate-spin' /> Disconnecting...</>
						) : (
							'Disconnect Gmail'
						)}
					</Button>
					{disconnectMutation.isError && (
						<p className='text-caption text-red-400'>{disconnectMutation.error.message}</p>
					)}
				</div>
			) : (
				<div className='space-y-3'>
					<Button
						variant='primary'
						size='sm'
						onClick={handleConnect}
						disabled={startOAuthMutation.isPending}
					>
						{startOAuthMutation.isPending ? (
							<><TbLoader2 className='h-4 w-4 animate-spin' /> Opening...</>
						) : (
							<><TbExternalLink className='h-4 w-4' /> Connect Gmail</>
						)}
					</Button>
					{startOAuthMutation.isError && (
						<p className='text-caption text-red-400'>{startOAuthMutation.error.message}</p>
					)}
					{connectUrl && (
						<div className='rounded-radius-sm bg-surface-2 p-3 space-y-2'>
							<p className='text-caption text-text-secondary'>
								A new tab should have opened with the Google consent screen.
								<br />
								After authorizing, you will be redirected back automatically.
							</p>
							<a
								href={connectUrl}
								target='_blank'
								rel='noopener noreferrer'
								className='flex items-center gap-1.5 text-caption text-blue-400 hover:text-blue-300'
							>
								<TbExternalLink className='h-3.5 w-3.5' />
								Re-open consent screen
							</a>
						</div>
					)}
				</div>
			)}

			{/* ═══════════════════════════════════════════════════════════════════ */}
			{/* Settings — only shown when connected                              */}
			{/* ═══════════════════════════════════════════════════════════════════ */}

			{status?.connected && (
				<>
					<div className='border-t border-border-default pt-6'>
						<h3 className='text-body font-medium text-text-primary mb-1'>Security & Processing</h3>
						<p className='text-caption text-text-tertiary'>
							Control how emails are handled and protect your account from unauthorized actions.
						</p>
					</div>

					{/* ── Send Protection ─────────────────────────────── */}
					<SettingsSection
						icon={TbLock}
						title='Send Protection'
						description='Controls whether the AI agent can send emails from your Gmail account.'
					>
						<div className='rounded-radius-sm border border-red-500/30 bg-red-500/5 p-3'>
							<ToggleRow
								label='Block all automatic email sending'
								description='When enabled, the AI agent can NEVER send or reply to emails automatically. You must explicitly command it to send. Highly recommended.'
								checked={settings.sendProtection}
								onChange={(v) => updateSetting('sendProtection', v)}
								variant='danger'
							/>
						</div>
						{!settings.sendProtection && (
							<div className='flex items-start gap-2 text-caption text-red-400'>
								<TbAlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
								<span>Send protection is OFF. The AI agent may send emails without your explicit approval.</span>
							</div>
						)}
					</SettingsSection>

					{/* ── Processing Mode ─────────────────────────────── */}
					<SettingsSection
						icon={TbShieldLock}
						title='Email Processing Mode'
						description='Choose how incoming emails are handled by the system.'
					>
						<div className='space-y-2'>
							{([
								{
									value: 'disabled' as const,
									label: 'Disabled',
									desc: 'Do not process any emails. Polling is paused.',
								},
								{
									value: 'notify_only' as const,
									label: 'Notify Only',
									desc: 'Send a notification to your preferred channel. No AI processing.',
								},
								{
									value: 'full' as const,
									label: 'Full Processing',
									desc: 'AI agent reads and processes matching emails.',
								},
							]).map((opt) => (
								<label
									key={opt.value}
									className={`flex items-start gap-3 rounded-radius-sm border p-3 cursor-pointer transition-colors ${
										settings.processingMode === opt.value
											? 'border-blue-500/50 bg-blue-500/5'
											: 'border-border-default hover:border-border-hover'
									}`}
								>
									<input
										type='radio'
										name='processingMode'
										value={opt.value}
										checked={settings.processingMode === opt.value}
										onChange={() => updateSetting('processingMode', opt.value)}
										className='mt-1 accent-blue-500'
									/>
									<div>
										<div className='text-body-sm font-medium text-text-primary'>{opt.label}</div>
										<div className='text-caption text-text-tertiary'>{opt.desc}</div>
									</div>
								</label>
							))}
						</div>
					</SettingsSection>

					{/* ── Notifications ────────────────────────────────── */}
					<SettingsSection
						icon={TbBell}
						title='Notifications'
						description='Where to receive notifications about important emails.'
					>
						<div className='space-y-1.5'>
							<label className='text-caption text-text-secondary'>Notification Channel</label>
							<select
								value={settings.notifyChannel}
								onChange={(e) => updateSetting('notifyChannel', e.target.value)}
								className='w-full rounded-radius-sm border border-border-default bg-surface-2 px-3 py-2 text-body-sm text-text-primary focus:border-blue-500 focus:outline-none'
							>
								<option value='none'>None</option>
								<option value='telegram'>Telegram</option>
								<option value='discord'>Discord</option>
								<option value='slack'>Slack</option>
							</select>
						</div>
						{settings.notifyChannel !== 'none' && (
							<div className='space-y-1.5'>
								<label className='text-caption text-text-secondary'>Chat ID (optional)</label>
								<input
									type='text'
									value={settings.notifyChatId}
									onChange={(e) => updateSetting('notifyChatId', e.target.value)}
									placeholder='Leave empty to use last active chat'
									className='w-full rounded-radius-sm border border-border-default bg-surface-2 px-3 py-2 text-body-sm text-text-primary placeholder:text-text-tertiary focus:border-blue-500 focus:outline-none'
								/>
								<p className='text-caption text-text-tertiary'>
									If empty, notifications go to your most recent chat on this channel.
								</p>
							</div>
						)}
					</SettingsSection>

					{/* ── Sender Filters ──────────────────────────────── */}
					<SettingsSection
						icon={TbFilter}
						title='Sender Filters'
						description='Control which senders can trigger email processing. Use full email addresses or @domain for all addresses from a domain.'
					>
						<div className='space-y-1.5'>
							<label className='text-caption text-text-secondary'>
								Sender Whitelist
								<span className='text-text-tertiary ml-1'>(only process from these)</span>
							</label>
							<TagInput
								value={settings.senderWhitelist}
								onChange={(v) => updateSetting('senderWhitelist', v)}
								placeholder='user@example.com or @company.com'
							/>
							<p className='text-caption text-text-tertiary'>
								If empty, all senders are allowed (subject to blacklist).
							</p>
						</div>

						<div className='space-y-1.5'>
							<label className='text-caption text-text-secondary'>
								Sender Blacklist
								<span className='text-text-tertiary ml-1'>(always ignore these)</span>
							</label>
							<TagInput
								value={settings.senderBlacklist}
								onChange={(v) => updateSetting('senderBlacklist', v)}
								placeholder='noreply@spam.com or @newsletter.com'
							/>
							<p className='text-caption text-text-tertiary'>
								Blacklisted senders are always ignored, even if whitelisted.
							</p>
						</div>
					</SettingsSection>

					{/* ── Important Senders ───────────────────────────── */}
					<SettingsSection
						icon={TbMailForward}
						title='Important Senders'
						description='Always send a notification for emails from these senders, regardless of other filter settings.'
					>
						<TagInput
							value={settings.importantSenders}
							onChange={(v) => updateSetting('importantSenders', v)}
							placeholder='boss@company.com or @important-client.com'
						/>
					</SettingsSection>

					{/* ── Subject Keywords ─────────────────────────────── */}
					<SettingsSection
						icon={TbFilter}
						title='Subject Keywords'
						description='Only process emails whose subject contains one of these keywords. Leave empty to process all (after sender filters).'
					>
						<TagInput
							value={settings.subjectKeywords}
							onChange={(v) => updateSetting('subjectKeywords', v)}
							placeholder='urgent, invoice, action required'
						/>
					</SettingsSection>

					{/* ── Polling & Limits ─────────────────────────────── */}
					<SettingsSection
						icon={TbClock}
						title='Polling & Limits'
						description='Control how frequently emails are checked and how many are processed per cycle.'
					>
						<div className='grid grid-cols-2 gap-3'>
							<div className='space-y-1.5'>
								<label className='text-caption text-text-secondary'>Poll interval (seconds)</label>
								<input
									type='number'
									min={30}
									max={3600}
									value={settings.gmailPollIntervalSec}
									onChange={(e) => updateSetting('gmailPollIntervalSec', Math.max(30, Math.min(3600, parseInt(e.target.value) || 60)))}
									className='w-full rounded-radius-sm border border-border-default bg-surface-2 px-3 py-2 text-body-sm text-text-primary focus:border-blue-500 focus:outline-none'
								/>
							</div>
							<div className='space-y-1.5'>
								<label className='text-caption text-text-secondary'>Max emails per poll</label>
								<input
									type='number'
									min={1}
									max={50}
									value={settings.maxEmailsPerPoll}
									onChange={(e) => updateSetting('maxEmailsPerPoll', Math.max(1, Math.min(50, parseInt(e.target.value) || 5)))}
									className='w-full rounded-radius-sm border border-border-default bg-surface-2 px-3 py-2 text-body-sm text-text-primary focus:border-blue-500 focus:outline-none'
								/>
							</div>
						</div>
					</SettingsSection>

					{/* ── Save Button ──────────────────────────────────── */}
					{dirty && (
						<div className='sticky bottom-4 flex items-center gap-3 rounded-radius-md border border-blue-500/30 bg-blue-500/10 p-3'>
							<div className='flex-1 text-body-sm text-text-primary'>
								You have unsaved changes
							</div>
							<Button
								variant='primary'
								size='sm'
								onClick={handleSaveSettings}
								disabled={updateSettingsMutation.isPending}
							>
								{updateSettingsMutation.isPending ? (
									<><TbLoader2 className='h-4 w-4 animate-spin' /> Saving...</>
								) : (
									'Save Settings'
								)}
							</Button>
						</div>
					)}

					{updateSettingsMutation.isError && (
						<p className='text-caption text-red-400'>{updateSettingsMutation.error.message}</p>
					)}
				</>
			)}
		</div>
	)
}
