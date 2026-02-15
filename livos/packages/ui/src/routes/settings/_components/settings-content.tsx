import {Loader2} from 'lucide-react'
import React, {Suspense, useEffect, useState} from 'react'
import {FaRegSave} from 'react-icons/fa'
import {
	RiExpandRightFill,
	RiKeyLine,
	RiLogoutCircleRLine,
	RiRestartLine,
	RiShutDownLine,
	RiUserLine,
} from 'react-icons/ri'
import {
	TbBrain,
	TbHistory,
	TbPlug,
	TbSettings,
	TbSettingsMinus,
	TbTool,
	TbWorld,
	TbPhoto,
	TbShield,
	TbLanguage,
	TbRefresh as TbUpdate,
	TbArrowLeft,
	TbChevronRight,
	TbCheck,
	TbRefresh,
	TbHeartbeat,
	TbClock,
	TbMessageCircle,
	TbBrandTelegram,
	TbBrandDiscord,
	TbPlugConnected,
	TbPlugConnectedX,
	TbExternalLink,
	TbEye,
	TbEyeOff,
	TbKey,
	TbDatabase,
	TbUser,
	TbLoader2,
	TbAlertCircle,
	TbCircleCheck,
} from 'react-icons/tb'
import {IconType} from 'react-icons'

import {Card} from '@/components/ui/card'
import {IconButton} from '@/components/ui/icon-button'
import {IconButtonLink} from '@/components/ui/icon-button-link'
import {useBackups} from '@/features/backups/hooks/use-backups'
import {useApps} from '@/providers/apps'
import {DesktopPreviewFrame} from '@/modules/desktop/desktop-preview'
import {DesktopPreviewConnected} from '@/modules/desktop/desktop-preview-basic'
import {useWallpaper, wallpapers, getWallpaperThumbUrl} from '@/providers/wallpaper'
import {LanguageDropdownContent, LanguageDropdownTrigger} from '@/routes/settings/_components/language-dropdown'
import {SettingsSummary} from '@/routes/settings/_components/settings-summary'
import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/shadcn-components/ui/tabs'
import {RadioGroup, RadioGroupItem} from '@/shadcn-components/ui/radio-group'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/shadcn-components/ui/select'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/shadcn-components/ui/dropdown-menu'
import {trpcReact} from '@/trpc/trpc'
import {useLinkToDialog} from '@/utils/dialog'
import {t} from '@/utils/i18n'
import {firstNameFromFullName} from '@/utils/misc'
import {cn} from '@/shadcn-lib/utils'

import {ContactSupportLink} from './shared'
import {SettingsInfoCard} from './settings-info-card'
import {SettingsToggleRow} from './settings-toggle-row'
import {SoftwareUpdateListRow} from './software-update-list-row'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SettingsSection =
	| 'home'
	| 'account'
	| 'wallpaper'
	| '2fa'
	| 'ai-config'
	| 'nexus-config'
	| 'integrations'
	| 'domain'
	| 'backups'
	| 'migration'
	| 'language'
	| 'troubleshoot'
	| 'advanced'
	| 'software-update'

interface MenuItem {
	id: SettingsSection
	icon: IconType
	label: string
	description: string
}

const MENU_ITEMS: MenuItem[] = [
	{id: 'account', icon: TbUser, label: 'Account', description: 'Name and password'},
	{id: 'wallpaper', icon: TbPhoto, label: 'Theme', description: 'Wallpaper & accent color'},
	{id: '2fa', icon: TbShield, label: '2FA', description: 'Two-factor authentication'},
	{id: 'ai-config', icon: TbKey, label: 'AI Configuration', description: 'API keys & provider'},
	{id: 'nexus-config', icon: TbBrain, label: 'Nexus AI Settings', description: 'Agent behavior & response style'},
	{id: 'integrations', icon: TbPlug, label: 'Integrations', description: 'Telegram & Discord'},
	{id: 'domain', icon: TbWorld, label: 'Domain & HTTPS', description: 'Custom domain & SSL'},
	{id: 'backups', icon: TbDatabase, label: 'Backups', description: 'Backup & restore'},
	{id: 'migration', icon: RiExpandRightFill, label: 'Migration Assistant', description: 'Transfer from Raspberry Pi'},
	{id: 'language', icon: TbLanguage, label: 'Language', description: 'Interface language'},
	{id: 'troubleshoot', icon: TbTool, label: 'Troubleshoot', description: 'Debug & diagnostics'},
	{id: 'advanced', icon: TbSettingsMinus, label: 'Advanced', description: 'Terminal, DNS, Beta'},
	{id: 'software-update', icon: TbUpdate, label: 'Software Update', description: 'Check for updates'},
]

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsContent() {
	const [activeSection, setActiveSection] = useState<SettingsSection>('home')
	const linkToDialog = useLinkToDialog()

	const [userQ] = trpcReact.useQueries((t) => [t.user.get()])

	// If a section is selected, show master-detail view
	if (activeSection !== 'home') {
		return (
			<div className='animate-in fade-in'>
				<SettingsDetailView
					section={activeSection}
					onBack={() => setActiveSection('home')}
					onNavigate={(section) => setActiveSection(section)}
				/>
			</div>
		)
	}

	// Home view with sidebar menu
	return (
		<div className='animate-in fade-in'>
			<div className='grid w-full gap-x-[30px] gap-y-[20px] lg:grid-cols-[280px_auto]'>
				{/* Left Sidebar - Menu */}
				<div className='flex flex-col gap-3'>
					{/* Desktop Preview */}
					<div className='flex items-center justify-center'>
						<DesktopPreviewFrame>
							<DesktopPreviewConnected />
						</DesktopPreviewFrame>
					</div>

					{/* Menu Items */}
					<Card className='!p-2'>
						<div className='space-y-0.5'>
							{MENU_ITEMS.map((item) => (
								<button
									key={item.id}
									onClick={() => setActiveSection(item.id)}
									className='flex w-full items-center gap-3 rounded-radius-sm px-3 py-2.5 text-left transition-colors hover:bg-surface-2'
								>
									<div className='flex h-8 w-8 items-center justify-center rounded-radius-sm bg-surface-2'>
										<item.icon className='h-4 w-4 text-text-secondary' />
									</div>
									<div className='flex-1 min-w-0'>
										<div className='text-body-sm font-medium truncate'>{item.label}</div>
										<div className='text-caption-sm text-text-tertiary truncate'>{item.description}</div>
									</div>
									<TbChevronRight className='h-4 w-4 text-text-tertiary' />
								</button>
							))}
						</div>
					</Card>

					<ContactSupportLink className='max-lg:hidden' />
				</div>

				{/* Right Side - Header Card */}
				<div className='flex flex-col gap-5'>
					<Card className='flex flex-wrap items-center justify-between gap-5'>
						<div>
							<h2 className='text-heading-lg font-bold leading-none -tracking-4'>
								{userQ.data?.name && `${firstNameFromFullName(userQ.data?.name)}'s`}{' '}
								<span className='text-text-tertiary'>{t('livinity')}</span>
							</h2>
							<div className='pt-5' />
							<SettingsSummary />
						</div>
						<div className='flex w-full flex-col items-stretch gap-2.5 md:w-auto md:flex-row'>
							<IconButtonLink to={linkToDialog('logout')} size='xl' icon={RiLogoutCircleRLine}>
								{t('logout')}
							</IconButtonLink>
							<IconButtonLink to={linkToDialog('restart')} size='xl' icon={RiRestartLine}>
								{t('restart')}
							</IconButtonLink>
							<IconButtonLink to={linkToDialog('shutdown')} size='xl' text='destructive' icon={RiShutDownLine}>
								{t('shut-down')}
							</IconButtonLink>
						</div>
					</Card>

					{/* Quick Info */}
					<Card>
						<div className='text-center py-8'>
							<div className='text-body-lg font-medium text-text-secondary'>Select a setting from the menu</div>
							<div className='text-body-sm text-text-tertiary mt-1'>Configure your Livinity device</div>
						</div>
					</Card>
				</div>

				<ContactSupportLink className='lg:hidden' />
			</div>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail View
// ─────────────────────────────────────────────────────────────────────────────

function SettingsDetailView({
	section,
	onBack,
	onNavigate,
}: {
	section: SettingsSection
	onBack: () => void
	onNavigate: (section: SettingsSection) => void
}) {
	const menuItem = MENU_ITEMS.find((m) => m.id === section)

	return (
		<div className='grid w-full gap-x-[30px] gap-y-[20px] lg:grid-cols-[280px_auto]'>
			{/* Left Sidebar - Menu with active highlight */}
			<div className='flex flex-col gap-3'>
				<Card className='!p-2'>
					<div className='space-y-0.5'>
						{MENU_ITEMS.map((item) => (
							<button
								key={item.id}
								onClick={() => onNavigate(item.id)}
								className={cn(
									'flex w-full items-center gap-3 rounded-radius-sm px-3 py-2.5 text-left transition-colors hover:bg-surface-2',
									item.id === section && 'bg-surface-3'
								)}
							>
								<div className={cn(
									'flex h-8 w-8 items-center justify-center rounded-radius-sm',
									item.id === section ? 'bg-surface-3' : 'bg-surface-2'
								)}>
									<item.icon className={cn(
										'h-4 w-4',
										item.id === section ? 'text-text-primary' : 'text-text-secondary'
									)} />
								</div>
								<div className='flex-1 min-w-0'>
									<div className='text-body-sm font-medium truncate'>{item.label}</div>
								</div>
								{item.id === section && <TbChevronRight className='h-4 w-4 text-text-secondary' />}
							</button>
						))}
					</div>
				</Card>
			</div>

			{/* Right Side - Content */}
			<Card className='min-h-[500px]'>
				{/* Header with back button */}
				<div className='flex items-center gap-4 border-b border-border-default pb-4 mb-6'>
					<button
						onClick={onBack}
						className='flex h-10 w-10 items-center justify-center rounded-radius-md bg-surface-base text-text-secondary transition-colors hover:bg-surface-1 hover:text-text-primary'
					>
						<TbArrowLeft className='h-5 w-5' />
					</button>
					<div>
						<h1 className='text-heading font-semibold -tracking-2'>{menuItem?.label}</h1>
						<p className='text-body-sm text-text-secondary'>{menuItem?.description}</p>
					</div>
				</div>

				{/* Content based on section */}
				<SectionContent section={section} onBack={onBack} />
			</Card>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Section Content Router
// ─────────────────────────────────────────────────────────────────────────────

function SectionContent({section, onBack}: {section: SettingsSection; onBack: () => void}) {
	switch (section) {
		case 'account':
			return <AccountSection />
		case 'wallpaper':
			return <WallpaperSection />
		case '2fa':
			return <TwoFaSection />
		case 'ai-config':
			return <AiConfigSection />
		case 'nexus-config':
			return <NexusConfigSection />
		case 'integrations':
			return <IntegrationsSection />
		case 'domain':
			return <DomainSection />
		case 'backups':
			return <BackupsSection />
		case 'migration':
			return <MigrationSection />
		case 'language':
			return <LanguageSection />
		case 'troubleshoot':
			return <TroubleshootSection />
		case 'advanced':
			return <AdvancedSection />
		case 'software-update':
			return <SoftwareUpdateSection />
		default:
			return null
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual Sections
// ─────────────────────────────────────────────────────────────────────────────

function AccountSection() {
	return (
		<div className='space-y-4'>
			<p className='text-body-sm text-text-secondary'>{t('account-description')}</p>
			<div className='flex flex-wrap gap-3'>
				<IconButtonLink to='/settings/account/change-name' icon={RiUserLine}>
					{t('change-name')}
				</IconButtonLink>
				<IconButtonLink to='/settings/account/change-password' icon={RiKeyLine}>
					{t('change-password')}
				</IconButtonLink>
			</div>
		</div>
	)
}

function WallpaperSection() {
	const {wallpaper, setWallpaperId} = useWallpaper()

	return (
		<div className='grid grid-cols-2 gap-4 md:grid-cols-3'>
			{wallpapers.map((w) => (
				<button
					key={w.id}
					onClick={() => setWallpaperId(w.id)}
					className={cn(
						'relative aspect-video overflow-hidden rounded-radius-md bg-surface-base bg-cover bg-center transition-all hover:ring-2 hover:ring-white/40 hover:scale-[1.02]',
						wallpaper.id === w.id && 'ring-3 ring-white'
					)}
					style={{backgroundImage: `url(${getWallpaperThumbUrl(w)})`}}
				>
					{wallpaper.id === w.id && (
						<div className='absolute inset-0 flex items-center justify-center bg-black/40'>
							<TbCheck className='h-8 w-8 text-white' />
						</div>
					)}
				</button>
			))}
		</div>
	)
}

// Lazy-loaded 2FA inline content
const TwoFactorEnableInline = React.lazy(() =>
	import('@/routes/settings/2fa-enable').then((m) => ({default: m.TwoFactorEnableInline})),
)
const TwoFactorDisableInline = React.lazy(() =>
	import('@/routes/settings/2fa-disable').then((m) => ({default: m.TwoFactorDisableInline})),
)

function TwoFaSection() {
	const is2faEnabledQ = trpcReact.user.is2faEnabled.useQuery()
	const [showSetup, setShowSetup] = useState(false)

	// Show inline 2FA setup/disable
	if (showSetup) {
		return (
			<div className='space-y-4'>
				<button
					onClick={() => setShowSetup(false)}
					className='flex items-center gap-2 text-body-sm text-text-secondary hover:text-text-primary'
				>
					<TbArrowLeft className='h-4 w-4' />
					Back to 2FA
				</button>
				<Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}>
					{is2faEnabledQ.data ? (
						<TwoFactorDisableInline onComplete={() => setShowSetup(false)} />
					) : (
						<TwoFactorEnableInline onComplete={() => setShowSetup(false)} />
					)}
				</Suspense>
			</div>
		)
	}

	return (
		<div className='space-y-4'>
			<p className='text-body-sm text-text-secondary'>{t('2fa-description')}</p>
			<div className='flex items-center justify-between rounded-radius-md border border-border-default bg-surface-base p-4'>
				<div>
					<div className='text-body font-medium'>Two-Factor Authentication</div>
					<div className='text-caption text-text-secondary'>
						{is2faEnabledQ.data ? 'Enabled - Your account is protected' : 'Disabled - Enable for extra security'}
					</div>
				</div>
				<IconButton onClick={() => setShowSetup(true)} icon={TbShield}>
					{is2faEnabledQ.data ? 'Manage' : 'Enable'}
				</IconButton>
			</div>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Configuration Section
// ─────────────────────────────────────────────────────────────────────────────

function AiConfigSection() {
	const [anthropicKey, setAnthropicKey] = useState('')
	const [geminiKey, setGeminiKey] = useState('')
	const [anthropicSaved, setAnthropicSaved] = useState(false)
	const [geminiSaved, setGeminiSaved] = useState(false)
	const [anthropicValidating, setAnthropicValidating] = useState(false)
	const [geminiValidating, setGeminiValidating] = useState(false)
	const [anthropicError, setAnthropicError] = useState('')
	const [geminiError, setGeminiError] = useState('')

	const configQ = trpcReact.ai.getConfig.useQuery()
	const cliStatusQ = trpcReact.ai.getClaudeCliStatus.useQuery()
	const utils = trpcReact.useUtils()

	const validateKeyMutation = trpcReact.ai.validateKey.useMutation()

	const setConfigMutation = trpcReact.ai.setConfig.useMutation({
		onSuccess: () => {
			utils.ai.getConfig.invalidate()
		},
	})

	// Auth method state
	const serverAuthMethod = cliStatusQ.data?.authMethod ?? 'api-key'
	const [authMethod, setAuthMethod] = useState<'api-key' | 'sdk-subscription'>('api-key')

	useEffect(() => {
		if (serverAuthMethod) setAuthMethod(serverAuthMethod)
	}, [serverAuthMethod])

	const cliAuthenticated = cliStatusQ.data?.authenticated ?? false

	// Poll CLI status every 5s when subscription mode selected but not authenticated
	useEffect(() => {
		if (authMethod !== 'sdk-subscription' || cliAuthenticated) return
		const interval = setInterval(() => { cliStatusQ.refetch() }, 5000)
		return () => clearInterval(interval)
	}, [authMethod, cliAuthenticated])

	const setAuthMethodMutation = trpcReact.ai.setClaudeAuthMethod.useMutation({
		onSuccess: () => { utils.ai.getClaudeCliStatus.invalidate() },
	})

	const startLoginMutation = trpcReact.ai.startClaudeLogin.useMutation({
		onSuccess: (data) => {
			if (data.url) window.open(data.url, '_blank', 'noopener,noreferrer')
			if (data.alreadyAuthenticated) utils.ai.getClaudeCliStatus.invalidate()
		},
	})

	const handleAuthMethodChange = (value: string) => {
		const method = value as 'api-key' | 'sdk-subscription'
		setAuthMethod(method)
		setAuthMethodMutation.mutate({method})
	}

	const cliInstalled = cliStatusQ.data?.installed ?? false
	const cliUser = cliStatusQ.data?.user

	const handleSaveAnthropicKey = async () => {
		if (!anthropicKey.trim()) return
		setAnthropicError('')
		setAnthropicValidating(true)

		try {
			const result = await validateKeyMutation.mutateAsync({
				provider: 'claude',
				apiKey: anthropicKey.trim(),
			})

			if (!result.valid) {
				setAnthropicError(result.error || 'Invalid API key')
				setAnthropicValidating(false)
				return
			}

			await setConfigMutation.mutateAsync({anthropicApiKey: anthropicKey.trim()})
			setAnthropicSaved(true)
			setAnthropicKey('')
			setAnthropicValidating(false)
			setTimeout(() => setAnthropicSaved(false), 2000)
		} catch {
			setAnthropicError('Failed to validate key')
			setAnthropicValidating(false)
		}
	}

	const handleSaveGeminiKey = async () => {
		if (!geminiKey.trim()) return
		setGeminiError('')
		setGeminiValidating(true)

		try {
			const result = await validateKeyMutation.mutateAsync({
				provider: 'gemini',
				apiKey: geminiKey.trim(),
			})

			if (!result.valid) {
				setGeminiError(result.error || 'Invalid API key')
				setGeminiValidating(false)
				return
			}

			await setConfigMutation.mutateAsync({geminiApiKey: geminiKey.trim()})
			setGeminiSaved(true)
			setGeminiKey('')
			setGeminiValidating(false)
			setTimeout(() => setGeminiSaved(false), 2000)
		} catch {
			setGeminiError('Failed to validate key')
			setGeminiValidating(false)
		}
	}

	return (
		<div className='max-w-lg space-y-8'>
			{/* ── Claude Provider ─────────────────── */}
			<div className='space-y-4'>
				<h3 className='text-body font-medium text-text-primary'>Claude Provider</h3>

				<RadioGroup value={authMethod} onValueChange={handleAuthMethodChange} className='gap-0'>
					{/* SDK Subscription Option */}
					<label
						className={cn(
							'flex cursor-pointer gap-3 rounded-t-radius-md border p-4 transition-colors',
							authMethod === 'sdk-subscription'
								? 'border-brand/50 bg-brand/5'
								: 'border-border-default bg-surface-base hover:bg-surface-1',
						)}
					>
						<RadioGroupItem value='sdk-subscription' className='mt-0.5 shrink-0' />
						<div className='flex-1 space-y-2'>
							<div className='flex items-center gap-2'>
								<span className='text-body font-medium'>Claude Subscription</span>
								<span className='rounded-full bg-brand/20 px-2 py-0.5 text-caption-sm text-brand'>Recommended</span>
							</div>
							<p className='text-body-sm text-text-secondary'>
								Use your Claude Pro/Max subscription. No API key needed.
							</p>

							{authMethod === 'sdk-subscription' && (
								<div className='mt-3 space-y-3'>
									{cliStatusQ.isLoading ? (
										<div className='flex items-center gap-2 text-body-sm text-text-secondary'>
											<TbLoader2 className='h-4 w-4 animate-spin' />
											Checking CLI status...
										</div>
									) : cliAuthenticated ? (
										<div className='flex items-center gap-2 text-body-sm text-green-400'>
											<TbCircleCheck className='h-4 w-4' />
											Authenticated{cliUser ? ` as ${cliUser}` : ''}
										</div>
									) : cliInstalled ? (
										<>
											<div className='flex items-center gap-2 text-body-sm text-amber-400'>
												<TbAlertCircle className='h-4 w-4' />
												CLI installed but not authenticated
											</div>
											<Button
												variant='primary'
												size='sm'
												onClick={() => startLoginMutation.mutate()}
												disabled={startLoginMutation.isPending}
											>
												{startLoginMutation.isPending ? (
													<><TbLoader2 className='h-4 w-4 animate-spin' /> Starting login...</>
												) : (
													<><TbExternalLink className='h-4 w-4' /> Authenticate with Claude</>
												)}
											</Button>
											{startLoginMutation.isError && (
												<p className='text-caption text-red-400'>{startLoginMutation.error.message}</p>
											)}
											{startLoginMutation.isSuccess && startLoginMutation.data.url && (
												<p className='text-caption text-text-secondary'>
													Auth page opened in a new tab. Complete login there, then this page will update automatically.
												</p>
											)}
										</>
									) : (
										<>
											<div className='flex items-center gap-2 text-body-sm text-red-400'>
												<TbAlertCircle className='h-4 w-4' />
												Claude CLI not installed
											</div>
											<div className='rounded-radius-sm bg-surface-2 p-3'>
												<p className='text-caption text-text-secondary'>Run on the server first:</p>
												<code className='mt-1 block font-mono text-caption text-text-primary'>
													npm install -g @anthropic-ai/claude-code
												</code>
											</div>
											<Button
												variant='primary'
												size='sm'
												onClick={() => startLoginMutation.mutate()}
												disabled={startLoginMutation.isPending}
											>
												{startLoginMutation.isPending ? (
													<><TbLoader2 className='h-4 w-4 animate-spin' /> Checking...</>
												) : (
													<><TbExternalLink className='h-4 w-4' /> Authenticate with Claude</>
												)}
											</Button>
											{startLoginMutation.isError && (
												<p className='text-caption text-red-400'>{startLoginMutation.error.message}</p>
											)}
										</>
									)}
								</div>
							)}
						</div>
					</label>

					{/* API Key Option */}
					<label
						className={cn(
							'flex cursor-pointer gap-3 rounded-b-radius-md border border-t-0 p-4 transition-colors',
							authMethod === 'api-key'
								? 'border-brand/50 bg-brand/5'
								: 'border-border-default bg-surface-base hover:bg-surface-1',
						)}
					>
						<RadioGroupItem value='api-key' className='mt-0.5 shrink-0' />
						<div className='flex-1 space-y-2'>
							<span className='text-body font-medium'>API Key</span>
							<p className='text-body-sm text-text-secondary'>
								Enter your Anthropic API key directly.
							</p>

							{authMethod === 'api-key' && (
								<div className='mt-3 space-y-3'>
									{configQ.data?.hasAnthropicKey && (
										<div className='flex items-center gap-2 text-body-sm text-green-400'>
											<TbCircleCheck className='h-4 w-4' />
											Current: {configQ.data.anthropicApiKey}
										</div>
									)}
									<Input
										placeholder='sk-ant-...'
										value={anthropicKey}
										onValueChange={(v) => { setAnthropicKey(v); setAnthropicError('') }}
										onKeyDown={(e) => e.key === 'Enter' && handleSaveAnthropicKey()}
										className='font-mono'
									/>
									{anthropicError && (
										<p className='text-caption-sm text-red-400'>{anthropicError}</p>
									)}
									<a
										href='https://console.anthropic.com/settings/keys'
										target='_blank'
										rel='noopener noreferrer'
										className='flex items-center gap-1.5 text-caption text-blue-400 hover:text-blue-300'
									>
										<TbExternalLink className='h-3.5 w-3.5' />
										Get API key from Anthropic Console
									</a>
									<Button
										variant='primary'
										size='sm'
										onClick={handleSaveAnthropicKey}
										disabled={!anthropicKey.trim() || anthropicValidating}
									>
										{anthropicSaved ? (
											<><TbCheck className='h-4 w-4' /> Saved</>
										) : anthropicValidating ? (
											'Validating...'
										) : (
											'Save API Key'
										)}
									</Button>
								</div>
							)}
						</div>
					</label>
				</RadioGroup>
			</div>

			<div className='border-t border-border-subtle' />

			{/* ── Gemini (Fallback) ─────────────────── */}
			<div className='space-y-4'>
				<h3 className='text-body font-medium text-text-primary'>Gemini (Fallback)</h3>

				<div className='rounded-radius-md border border-border-default bg-surface-base p-4 space-y-3'>
					{configQ.data?.hasGeminiKey && (
						<div className='flex items-center gap-2 text-body-sm text-green-400'>
							<TbCircleCheck className='h-4 w-4' />
							Current: {configQ.data.geminiApiKey}
						</div>
					)}
					<Input
						placeholder='AIzaSy...'
						value={geminiKey}
						onValueChange={(v) => { setGeminiKey(v); setGeminiError('') }}
						onKeyDown={(e) => e.key === 'Enter' && handleSaveGeminiKey()}
						className='font-mono'
					/>
					{geminiError && (
						<p className='text-caption-sm text-red-400'>{geminiError}</p>
					)}
					<a
						href='https://aistudio.google.com/app/apikey'
						target='_blank'
						rel='noopener noreferrer'
						className='flex items-center gap-1.5 text-caption text-blue-400 hover:text-blue-300'
					>
						<TbExternalLink className='h-3.5 w-3.5' />
						Get API key from Google AI Studio
					</a>
					<Button
						variant='primary'
						size='sm'
						onClick={handleSaveGeminiKey}
						disabled={!geminiKey.trim() || geminiValidating}
					>
						{geminiSaved ? (
							<><TbCheck className='h-4 w-4' /> Saved</>
						) : geminiValidating ? (
							'Validating...'
						) : (
							'Save API Key'
						)}
					</Button>
				</div>
			</div>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Nexus Config Section (Full Implementation)
// ─────────────────────────────────────────────────────────────────────────────

interface NexusConfig {
	retry?: {enabled?: boolean; attempts?: number; minDelayMs?: number; maxDelayMs?: number; jitter?: number}
	agent?: {maxTurns?: number; maxTokens?: number; timeoutMs?: number; tier?: 'flash' | 'sonnet' | 'opus'; maxDepth?: number; streamEnabled?: boolean}
	subagents?: {maxConcurrent?: number; maxTurns?: number; maxTokens?: number; timeoutMs?: number}
	session?: {idleMinutes?: number; maxHistoryMessages?: number}
	logging?: {level?: 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace'; redactSensitive?: boolean}
	heartbeat?: {enabled?: boolean; intervalMinutes?: number; target?: 'telegram' | 'discord' | 'all' | 'none'}
	response?: {style?: 'detailed' | 'concise' | 'direct'; showSteps?: boolean; showReasoning?: boolean; language?: string; maxLength?: number}
}

function NexusConfigSection() {
	const [config, setConfig] = useState<NexusConfig>({})
	const [saved, setSaved] = useState(false)
	const [activeTab, setActiveTab] = useState('response')

	const configQ = trpcReact.ai.getNexusConfig.useQuery()
	const utils = trpcReact.useUtils()

	const updateConfigMutation = trpcReact.ai.updateNexusConfig.useMutation({
		onSuccess: () => {
			setSaved(true)
			utils.ai.getNexusConfig.invalidate()
			setTimeout(() => setSaved(false), 2000)
		},
	})

	const resetConfigMutation = trpcReact.ai.resetNexusConfig.useMutation({
		onSuccess: () => {
			utils.ai.getNexusConfig.invalidate()
		},
	})

	useEffect(() => {
		if (configQ.data?.config) {
			setConfig(configQ.data.config)
		}
	}, [configQ.data])

	const handleSave = () => {
		updateConfigMutation.mutate(config)
	}

	const handleReset = () => {
		if (confirm('Reset all settings to defaults?')) {
			resetConfigMutation.mutate()
		}
	}

	const updateConfig = (path: string, value: any) => {
		setConfig((prev) => {
			const newConfig = {...prev}
			const parts = path.split('.')
			let current: any = newConfig
			for (let i = 0; i < parts.length - 1; i++) {
				if (!current[parts[i]]) current[parts[i]] = {}
				current = current[parts[i]]
			}
			current[parts[parts.length - 1]] = value
			return newConfig
		})
	}

	return (
		<div className='max-w-full overflow-hidden'>
			<Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
				<TabsList className='mb-3 grid w-full grid-cols-6 gap-0.5 p-0.5 rounded-radius-sm'>
					<TabsTrigger value='response' className='flex items-center justify-center p-1.5 rounded-6' title='Response'>
						<TbMessageCircle className='h-4 w-4' />
					</TabsTrigger>
					<TabsTrigger value='agent' className='flex items-center justify-center p-1.5 rounded-6' title='Agent'>
						<TbBrain className='h-4 w-4' />
					</TabsTrigger>
					<TabsTrigger value='retry' className='flex items-center justify-center p-1.5 rounded-6' title='Retry'>
						<TbRefresh className='h-4 w-4' />
					</TabsTrigger>
					<TabsTrigger value='heartbeat' className='flex items-center justify-center p-1.5 rounded-6' title='Heartbeat'>
						<TbHeartbeat className='h-4 w-4' />
					</TabsTrigger>
					<TabsTrigger value='session' className='flex items-center justify-center p-1.5 rounded-6' title='Session'>
						<TbClock className='h-4 w-4' />
					</TabsTrigger>
					<TabsTrigger value='advanced' className='flex items-center justify-center p-1.5 rounded-6' title='Advanced'>
						<TbTool className='h-4 w-4' />
					</TabsTrigger>
				</TabsList>

				{/* Response Tab */}
				<TabsContent value='response' className='space-y-4'>
					<div className='flex flex-col gap-2'>
						<label className='text-caption text-text-secondary'>Response Style</label>
						<Select value={config.response?.style || 'detailed'} onValueChange={(v) => updateConfig('response.style', v)}>
							<SelectTrigger><SelectValue placeholder='Select style' /></SelectTrigger>
							<SelectContent>
								<SelectItem value='detailed'>Detailed - Step-by-step with explanations</SelectItem>
								<SelectItem value='concise'>Concise - Brief but informative</SelectItem>
								<SelectItem value='direct'>Direct - Just the result, no explanation</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<SettingsToggleRow
						title='Show Steps'
						description='Show step-by-step breakdown'
						checked={config.response?.showSteps ?? true}
						onCheckedChange={(v) => updateConfig('response.showSteps', v)}
					/>

					<SettingsToggleRow
						title='Show Reasoning'
						description='Include thought process'
						checked={config.response?.showReasoning ?? true}
						onCheckedChange={(v) => updateConfig('response.showReasoning', v)}
					/>

					<div className='flex flex-col gap-2'>
						<label className='text-caption text-text-secondary'>Response Language</label>
						<Select value={config.response?.language || 'auto'} onValueChange={(v) => updateConfig('response.language', v)}>
							<SelectTrigger><SelectValue placeholder='Select language' /></SelectTrigger>
							<SelectContent>
								<SelectItem value='auto'>Auto-detect</SelectItem>
								<SelectItem value='en'>English</SelectItem>
								<SelectItem value='tr'>Turkish</SelectItem>
								<SelectItem value='de'>German</SelectItem>
								<SelectItem value='fr'>French</SelectItem>
								<SelectItem value='es'>Spanish</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</TabsContent>

				{/* Agent Tab */}
				<TabsContent value='agent' className='space-y-3'>
					<div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
						<div className='flex flex-col gap-2'>
							<label className='text-caption text-text-secondary'>Max Turns</label>
							<Input type='number' min={1} max={100} value={config.agent?.maxTurns || 30} onValueChange={(v) => updateConfig('agent.maxTurns', parseInt(v) || 30)} />
						</div>
						<div className='flex flex-col gap-2'>
							<label className='text-caption text-text-secondary'>Max Tokens (K)</label>
							<Input type='number' min={10} max={1000} value={Math.round((config.agent?.maxTokens || 200000) / 1000)} onValueChange={(v) => updateConfig('agent.maxTokens', (parseInt(v) || 200) * 1000)} />
						</div>
						<div className='flex flex-col gap-2'>
							<label className='text-caption text-text-secondary'>Timeout (minutes)</label>
							<Input type='number' min={1} max={60} value={Math.round((config.agent?.timeoutMs || 600000) / 60000)} onValueChange={(v) => updateConfig('agent.timeoutMs', (parseInt(v) || 10) * 60000)} />
						</div>
						<div className='flex flex-col gap-2'>
							<label className='text-caption text-text-secondary'>Max Depth</label>
							<Input type='number' min={1} max={10} value={config.agent?.maxDepth || 3} onValueChange={(v) => updateConfig('agent.maxDepth', parseInt(v) || 3)} />
						</div>
					</div>
					<SettingsToggleRow
						title='Stream Responses'
						description='Show responses as they generate'
						checked={config.agent?.streamEnabled ?? true}
						onCheckedChange={(v) => updateConfig('agent.streamEnabled', v)}
					/>
				</TabsContent>

				{/* Retry Tab */}
				<TabsContent value='retry' className='space-y-3'>
					<SettingsToggleRow
						title='Enable Retry'
						description='Automatically retry failed API calls'
						checked={config.retry?.enabled ?? true}
						onCheckedChange={(v) => updateConfig('retry.enabled', v)}
						className='p-3'
					/>
					<div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
						<div className='flex flex-col gap-2'>
							<label className='text-caption text-text-secondary'>Max Attempts</label>
							<Input type='number' min={1} max={10} value={config.retry?.attempts || 3} onValueChange={(v) => updateConfig('retry.attempts', parseInt(v) || 3)} disabled={!config.retry?.enabled} />
						</div>
						<div className='flex flex-col gap-2'>
							<label className='text-caption text-text-secondary'>Min Delay (ms)</label>
							<Input type='number' min={100} max={10000} value={config.retry?.minDelayMs || 500} onValueChange={(v) => updateConfig('retry.minDelayMs', parseInt(v) || 500)} disabled={!config.retry?.enabled} />
						</div>
					</div>
				</TabsContent>

				{/* Heartbeat Tab */}
				<TabsContent value='heartbeat' className='space-y-3'>
					<SettingsToggleRow
						title='Enable Heartbeat'
						description='Periodically check HEARTBEAT.md for tasks'
						checked={config.heartbeat?.enabled ?? false}
						onCheckedChange={(v) => updateConfig('heartbeat.enabled', v)}
						className='p-3'
					/>
					<div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
						<div className='flex flex-col gap-2'>
							<label className='text-caption text-text-secondary'>Interval (minutes)</label>
							<Input type='number' min={5} max={1440} value={config.heartbeat?.intervalMinutes || 30} onValueChange={(v) => updateConfig('heartbeat.intervalMinutes', parseInt(v) || 30)} disabled={!config.heartbeat?.enabled} />
						</div>
						<div className='flex flex-col gap-2'>
							<label className='text-caption text-text-secondary'>Delivery Target</label>
							<Select value={config.heartbeat?.target || 'telegram'} onValueChange={(v) => updateConfig('heartbeat.target', v)} disabled={!config.heartbeat?.enabled}>
								<SelectTrigger><SelectValue placeholder='Select target' /></SelectTrigger>
								<SelectContent>
									<SelectItem value='telegram'>Telegram</SelectItem>
									<SelectItem value='discord'>Discord</SelectItem>
									<SelectItem value='all'>All Channels</SelectItem>
									<SelectItem value='none'>Log Only</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
				</TabsContent>

				{/* Session Tab */}
				<TabsContent value='session' className='space-y-3'>
					<div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
						<div className='flex flex-col gap-2'>
							<label className='text-caption text-text-secondary'>Idle Timeout (minutes)</label>
							<Input type='number' min={5} max={1440} value={config.session?.idleMinutes || 60} onValueChange={(v) => updateConfig('session.idleMinutes', parseInt(v) || 60)} />
						</div>
						<div className='flex flex-col gap-2'>
							<label className='text-caption text-text-secondary'>Max History Messages</label>
							<Input type='number' min={10} max={500} value={config.session?.maxHistoryMessages || 100} onValueChange={(v) => updateConfig('session.maxHistoryMessages', parseInt(v) || 100)} />
						</div>
					</div>
				</TabsContent>

				{/* Advanced Tab */}
				<TabsContent value='advanced' className='space-y-4'>
					<div className='flex flex-col gap-2'>
						<label className='text-caption text-text-secondary'>Log Level</label>
						<Select value={config.logging?.level || 'info'} onValueChange={(v) => updateConfig('logging.level', v)}>
							<SelectTrigger><SelectValue placeholder='Select log level' /></SelectTrigger>
							<SelectContent>
								<SelectItem value='silent'>Silent</SelectItem>
								<SelectItem value='error'>Error</SelectItem>
								<SelectItem value='warn'>Warn</SelectItem>
								<SelectItem value='info'>Info</SelectItem>
								<SelectItem value='debug'>Debug</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<SettingsToggleRow
						title='Redact Sensitive Data'
						description='Hide API keys in logs'
						checked={config.logging?.redactSensitive ?? true}
						onCheckedChange={(v) => updateConfig('logging.redactSensitive', v)}
					/>
					<div className='rounded-radius-md border border-orange-500/30 bg-orange-500/10 p-4'>
						<div className='text-body font-medium text-orange-400'>Danger Zone</div>
						<Button variant='destructive' size='sm' className='mt-3' onClick={handleReset}>Reset to Defaults</Button>
					</div>
				</TabsContent>
			</Tabs>

			{/* Save Button */}
			<div className='mt-4 flex justify-end border-t border-border-default pt-3'>
				<Button variant='primary' size='sm' onClick={handleSave} disabled={updateConfigMutation.isPending}>
					{saved ? <><TbCheck className='h-4 w-4' /> Saved</> : updateConfigMutation.isPending ? 'Saving...' : 'Save Changes'}
				</Button>
			</div>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Integrations Section
// ─────────────────────────────────────────────────────────────────────────────

interface ChannelStatus {
	enabled: boolean
	connected: boolean
	error?: string
	lastConnect?: string
	botName?: string
}

function IntegrationsSection() {
	const [activeTab, setActiveTab] = useState<'telegram' | 'discord'>('telegram')

	return (
		<div>
			<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'telegram' | 'discord')}>
				<TabsList className='grid w-full grid-cols-2 mb-4'>
					<TabsTrigger value='telegram' className='flex items-center gap-1.5'>
						<TbBrandTelegram className='h-4 w-4 text-sky-400' />
						Telegram
					</TabsTrigger>
					<TabsTrigger value='discord' className='flex items-center gap-1.5'>
						<TbBrandDiscord className='h-4 w-4 text-indigo-400' />
						Discord
					</TabsTrigger>
				</TabsList>

				<TabsContent value='telegram'><TelegramPanel /></TabsContent>
				<TabsContent value='discord'><DiscordPanel /></TabsContent>
			</Tabs>
		</div>
	)
}

function TelegramPanel() {
	const [token, setToken] = useState('')
	const [showToken, setShowToken] = useState(false)

	const configQ = trpcReact.ai.getIntegrationConfig.useQuery({channel: 'telegram'})
	const statusQ = trpcReact.ai.getIntegrationStatus.useQuery({channel: 'telegram'})
	const saveMutation = trpcReact.ai.saveIntegrationConfig.useMutation()
	const utils = trpcReact.useUtils()

	useEffect(() => {
		if (configQ.data?.token) setToken(configQ.data.token)
	}, [configQ.data])

	const status = statusQ.data as ChannelStatus | undefined

	const handleSave = async () => {
		await saveMutation.mutateAsync({channel: 'telegram', config: {token, enabled: true}})
		utils.ai.getIntegrationConfig.invalidate()
		utils.ai.getIntegrationStatus.invalidate()
	}

	return (
		<div className='space-y-4'>
			{/* Status */}
			<div className='rounded-radius-md border border-sky-500/30 bg-sky-500/10 p-4'>
				<div className='flex items-center gap-3'>
					<div className='flex h-10 w-10 items-center justify-center rounded-radius-sm bg-surface-2'>
						<TbBrandTelegram className='h-6 w-6 text-sky-400' />
					</div>
					<div className='flex-1'>
						<div className='text-body-lg font-semibold'>Telegram</div>
						<div className='text-caption text-text-secondary'>Connect via BotFather token</div>
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
				{status?.botName && <div className='mt-2 text-caption text-text-secondary'>Bot: @{status.botName}</div>}
			</div>

			{/* Token Input */}
			<div className='space-y-2'>
				<label className='text-caption text-text-secondary'>Bot Token</label>
				<div className='relative'>
					<Input
						type={showToken ? 'text' : 'password'}
						value={token}
						onChange={(e) => setToken(e.target.value)}
						placeholder='123456789:ABCdef...'
						className='pr-10'
					/>
					<button onClick={() => setShowToken(!showToken)} className='absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary'>
						{showToken ? <TbEyeOff className='h-4 w-4' /> : <TbEye className='h-4 w-4' />}
					</button>
				</div>
				<p className='text-caption-sm text-text-tertiary'>Create a bot with @BotFather and paste the token here</p>
			</div>

			<div className='flex gap-2'>
				<Button variant='primary' className='flex-1' onClick={handleSave} disabled={!token || saveMutation.isPending}>
					{saveMutation.isPending ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
					Save & Connect
				</Button>
				{status?.enabled && (
					<Button variant='destructive' onClick={() => saveMutation.mutateAsync({channel: 'telegram', config: {enabled: false}}).then(() => {
						utils.ai.getIntegrationConfig.invalidate()
						utils.ai.getIntegrationStatus.invalidate()
					})}>
						Disable
					</Button>
				)}
			</div>
		</div>
	)
}

function DiscordPanel() {
	const [token, setToken] = useState('')
	const [showToken, setShowToken] = useState(false)

	const configQ = trpcReact.ai.getIntegrationConfig.useQuery({channel: 'discord'})
	const statusQ = trpcReact.ai.getIntegrationStatus.useQuery({channel: 'discord'})
	const saveMutation = trpcReact.ai.saveIntegrationConfig.useMutation()
	const utils = trpcReact.useUtils()

	useEffect(() => {
		if (configQ.data?.token) setToken(configQ.data.token)
	}, [configQ.data])

	const status = statusQ.data as ChannelStatus | undefined

	const handleSave = async () => {
		await saveMutation.mutateAsync({channel: 'discord', config: {token, enabled: true}})
		utils.ai.getIntegrationConfig.invalidate()
		utils.ai.getIntegrationStatus.invalidate()
	}

	return (
		<div className='space-y-4'>
			{/* Status */}
			<div className='rounded-radius-md border border-indigo-500/30 bg-indigo-500/10 p-4'>
				<div className='flex items-center gap-3'>
					<div className='flex h-10 w-10 items-center justify-center rounded-radius-sm bg-surface-2'>
						<TbBrandDiscord className='h-6 w-6 text-indigo-400' />
					</div>
					<div className='flex-1'>
						<div className='text-body-lg font-semibold'>Discord</div>
						<div className='text-caption text-text-secondary'>Connect your Discord bot</div>
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
				{status?.botName && <div className='mt-2 text-caption text-text-secondary'>Bot: {status.botName}</div>}
			</div>

			{/* Token Input */}
			<div className='space-y-2'>
				<label className='text-caption text-text-secondary'>Bot Token</label>
				<div className='relative'>
					<Input
						type={showToken ? 'text' : 'password'}
						value={token}
						onChange={(e) => setToken(e.target.value)}
						placeholder='Enter bot token...'
						className='pr-10'
					/>
					<button onClick={() => setShowToken(!showToken)} className='absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary'>
						{showToken ? <TbEyeOff className='h-4 w-4' /> : <TbEye className='h-4 w-4' />}
					</button>
				</div>
				<p className='text-caption-sm text-text-tertiary'>Get your bot token from the Discord Developer Portal</p>
			</div>

			<div className='flex gap-2'>
				<Button variant='primary' className='flex-1' onClick={handleSave} disabled={!token || saveMutation.isPending}>
					{saveMutation.isPending ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
					Save & Connect
				</Button>
				{status?.enabled && (
					<Button variant='destructive' onClick={() => saveMutation.mutateAsync({channel: 'discord', config: {enabled: false}}).then(() => {
						utils.ai.getIntegrationConfig.invalidate()
						utils.ai.getIntegrationStatus.invalidate()
					})}>
						Disable
					</Button>
				)}
			</div>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Other Sections (Simplified)
// ─────────────────────────────────────────────────────────────────────────────

// Lazy-loaded domain setup content
const DomainSetupInner = React.lazy(() =>
	import('@/routes/settings/domain-setup').then((m) => ({default: m.DomainSetupDialogContent})),
)

function DomainSection() {
	return (
		<Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}>
			<DomainSetupInner onClose={() => {}} />
		</Suspense>
	)
}

// Lazy-loaded backup setup/restore content
const BackupSetupWizard = React.lazy(() =>
	import('@/features/backups/components/setup-wizard').then((m) => ({default: m.BackupsSetupWizard})),
)
const BackupRestoreWizard = React.lazy(() =>
	import('@/features/backups/components/restore-wizard').then((m) => ({default: m.BackupsRestoreWizard})),
)

function BackupsSection() {
	const {repositories: backupRepositories, isLoadingRepositories: isLoadingBackups} = useBackups()
	const [activeTab, setActiveTab] = useState<'status' | 'restore'>('status')
	const [showSetupWizard, setShowSetupWizard] = useState(false)
	const [showRestoreWizard, setShowRestoreWizard] = useState(false)

	if (isLoadingBackups) {
		return (
			<div className='flex items-center justify-center py-12'>
				<Loader2 className='size-6 animate-spin text-text-tertiary' />
			</div>
		)
	}

	const hasBackups = (backupRepositories?.length ?? 0) > 0

	// Show Setup Wizard inline
	if (showSetupWizard) {
		return (
			<div className='space-y-4'>
				<button
					onClick={() => setShowSetupWizard(false)}
					className='flex items-center gap-2 text-body-sm text-text-secondary hover:text-text-primary'
				>
					<TbArrowLeft className='h-4 w-4' />
					Back to Backups
				</button>
				<Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}>
					<BackupSetupWizard />
				</Suspense>
			</div>
		)
	}

	// Show Restore Wizard inline
	if (showRestoreWizard) {
		return (
			<div className='space-y-4'>
				<button
					onClick={() => setShowRestoreWizard(false)}
					className='flex items-center gap-2 text-body-sm text-text-secondary hover:text-text-primary'
				>
					<TbArrowLeft className='h-4 w-4' />
					Back to Backups
				</button>
				<Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}>
					<BackupRestoreWizard />
				</Suspense>
			</div>
		)
	}

	return (
		<div className='space-y-4'>
			{/* Tab Navigation */}
			<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'status' | 'restore')}>
				<TabsList className='grid w-full grid-cols-2'>
					<TabsTrigger value='status' className='flex items-center gap-2'>
						<TbDatabase className='h-4 w-4' />
						{hasBackups ? 'Status' : 'Setup'}
					</TabsTrigger>
					<TabsTrigger value='restore' className='flex items-center gap-2'>
						<TbHistory className='h-4 w-4' />
						Restore
					</TabsTrigger>
				</TabsList>

				<TabsContent value='status' className='space-y-4 pt-4'>
					{hasBackups ? (
						<>
							{/* Backup Status */}
							<div className='rounded-radius-md border border-green-500/30 bg-green-500/10 p-4'>
								<div className='flex items-center gap-3'>
									<div className='flex h-10 w-10 items-center justify-center rounded-radius-sm bg-green-500/20'>
										<TbCheck className='h-5 w-5 text-green-400' />
									</div>
									<div className='flex-1'>
										<div className='text-body font-medium text-green-400'>Backups Configured</div>
										<div className='text-caption text-text-secondary'>
											{backupRepositories?.length} backup location{(backupRepositories?.length ?? 0) > 1 ? 's' : ''} configured
										</div>
									</div>
								</div>
							</div>

							{/* Repository List */}
							<div className='space-y-2'>
								{backupRepositories?.map((repo, idx) => (
									<div key={idx} className='rounded-radius-sm border border-border-default bg-surface-base p-3'>
										<div className='flex items-center gap-3'>
											<TbDatabase className='h-5 w-5 text-text-secondary' />
											<div className='flex-1 min-w-0'>
												<div className='text-body-sm font-medium truncate'>{repo.path || 'Backup Location'}</div>
											</div>
										</div>
									</div>
								))}
							</div>

							<IconButton onClick={() => setShowSetupWizard(true)} icon={TbSettings}>
								{t('backups-configure')}
							</IconButton>
						</>
					) : (
						<>
							<SettingsInfoCard
								icon={TbDatabase}
								title='No Backups Configured'
								description='Set up automatic backups to protect your data'
							/>

							<IconButton onClick={() => setShowSetupWizard(true)} icon={FaRegSave}>
								{t('backups-setup')}
							</IconButton>
						</>
					)}
				</TabsContent>

				<TabsContent value='restore' className='space-y-4 pt-4'>
					<p className='text-body-sm text-text-secondary'>Restore files and data from a previous backup.</p>
					<IconButton onClick={() => setShowRestoreWizard(true)} icon={TbHistory}>
						{t('backups-restore')}
					</IconButton>
				</TabsContent>
			</Tabs>
		</div>
	)
}

function MigrationSection() {
	const isLivinityHomeQ = trpcReact.migration.isLivinityHome.useQuery()

	if (isLivinityHomeQ.isLoading) {
		return (
			<div className='flex items-center justify-center py-8'>
				<Loader2 className='size-5 animate-spin text-text-tertiary' />
			</div>
		)
	}

	// Not a Livinity Home device - show unsupported message
	if (!isLivinityHomeQ.data) {
		return (
			<div className='space-y-4'>
				<SettingsInfoCard
					icon={RiExpandRightFill}
					title='Migration Not Available'
					description='This feature is only available on Livinity Home devices'
				/>
			</div>
		)
	}

	// Livinity Home device - show migration assistant
	return (
		<div className='space-y-4'>
			<p className='text-body-sm text-text-secondary'>{t('migration-assistant-description')}</p>

			{/* Migration Steps */}
			<div className='space-y-3'>
				<div className='rounded-radius-md border border-border-default bg-surface-base p-4'>
					<div className='flex items-start gap-3'>
						<div className='flex h-8 w-8 items-center justify-center rounded-radius-sm bg-blue-500/20 text-blue-400'>
							1
						</div>
						<div>
							<div className='text-body font-medium'>Shut down Raspberry Pi</div>
							<div className='text-caption text-text-secondary'>Power off your existing device</div>
						</div>
					</div>
				</div>
				<div className='rounded-radius-md border border-border-default bg-surface-base p-4'>
					<div className='flex items-start gap-3'>
						<div className='flex h-8 w-8 items-center justify-center rounded-radius-sm bg-blue-500/20 text-blue-400'>
							2
						</div>
						<div>
							<div className='text-body font-medium'>Connect disk to Livinity Home</div>
							<div className='text-caption text-text-secondary'>Attach the storage device via USB</div>
						</div>
					</div>
				</div>
				<div className='rounded-radius-md border border-border-default bg-surface-base p-4'>
					<div className='flex items-start gap-3'>
						<div className='flex h-8 w-8 items-center justify-center rounded-radius-sm bg-blue-500/20 text-blue-400'>
							3
						</div>
						<div>
							<div className='text-body font-medium'>Start migration</div>
							<div className='text-caption text-text-secondary'>Click the button below when ready</div>
						</div>
					</div>
				</div>
			</div>

			<IconButtonLink to='/settings/migration-assistant' icon={RiExpandRightFill}>
				{t('migrate')}
			</IconButtonLink>
		</div>
	)
}

function LanguageSection() {
	const [languageOpen, setLanguageOpen] = useState(false)

	return (
		<div className='space-y-4'>
			<p className='text-body-sm text-text-secondary'>{t('language-description')}</p>
			<DropdownMenu open={languageOpen} onOpenChange={setLanguageOpen}>
				<DropdownMenuTrigger asChild>
					<div className='cursor-pointer'>
						<LanguageDropdownTrigger />
					</div>
				</DropdownMenuTrigger>
				<LanguageDropdownContent />
			</DropdownMenu>
		</div>
	)
}

function TroubleshootSection() {
	const [showFullLogs, setShowFullLogs] = useState(false)
	const [logType, setLogType] = useState<'system' | 'app'>('system')
	const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
	const {userApps, isLoading: isLoadingApps} = useApps()

	// Separate queries for system and app logs
	const systemLogsQ = trpcReact.system.logs.useQuery(
		{type: 'system'},
		{enabled: logType === 'system'}
	)
	const appLogsQ = trpcReact.apps.logs.useQuery(
		{appId: selectedAppId || ''},
		{enabled: logType === 'app' && !!selectedAppId}
	)

	// Use the appropriate query based on log type
	const logsQ = logType === 'system' ? systemLogsQ : appLogsQ

	return (
		<div className='space-y-4'>
			<p className='text-body-sm text-text-secondary'>{t('troubleshoot-description')}</p>

			{/* Log Type Tabs */}
			<Tabs value={logType} onValueChange={(v) => { setLogType(v as 'system' | 'app'); if (v === 'system') setSelectedAppId(null) }}>
				<TabsList className='grid w-full grid-cols-2'>
					<TabsTrigger value='system' className='flex items-center gap-2'>
						<TbTool className='h-4 w-4' />
						System Logs
					</TabsTrigger>
					<TabsTrigger value='app' className='flex items-center gap-2'>
						<TbSettings className='h-4 w-4' />
						App Logs
					</TabsTrigger>
				</TabsList>

				<TabsContent value='system' className='space-y-4 pt-4'>
					{/* System Logs Preview */}
					<div className='space-y-2'>
						<div className='flex items-center justify-between'>
							<h3 className='text-body-sm font-medium text-text-secondary'>Recent System Logs</h3>
							<button
								onClick={() => setShowFullLogs(true)}
								className='text-caption text-blue-400 hover:text-blue-300'
							>
								View Full Logs
							</button>
						</div>
						<div className='max-h-[200px] overflow-auto rounded-radius-sm bg-black p-3'>
							<pre className='whitespace-pre-wrap font-mono text-caption-sm text-text-secondary'>
								{logsQ.isLoading ? 'Loading...' : logsQ.isError ? logsQ.error.message : (logsQ.data?.slice(-2000) || 'No logs available')}
							</pre>
						</div>
					</div>
				</TabsContent>

				<TabsContent value='app' className='space-y-4 pt-4'>
					{/* App Selector */}
					<div className='space-y-2'>
						<label className='text-caption text-text-secondary'>Select an app to view its logs</label>
						<Select value={selectedAppId || ''} onValueChange={(v) => setSelectedAppId(v || null)}>
							<SelectTrigger>
								<SelectValue placeholder='Select an app...' />
							</SelectTrigger>
							<SelectContent>
								{isLoadingApps ? (
									<SelectItem value='' disabled>Loading apps...</SelectItem>
								) : userApps?.length ? (
									userApps.map((app) => (
										<SelectItem key={app.id} value={app.id}>
											{app.name}
										</SelectItem>
									))
								) : (
									<SelectItem value='' disabled>No apps installed</SelectItem>
								)}
							</SelectContent>
						</Select>
					</div>

					{/* App Logs Preview */}
					{selectedAppId && (
						<div className='space-y-2'>
							<div className='flex items-center justify-between'>
								<h3 className='text-body-sm font-medium text-text-secondary'>App Logs</h3>
								<button
									onClick={() => setShowFullLogs(true)}
									className='text-caption text-blue-400 hover:text-blue-300'
								>
									View Full Logs
								</button>
							</div>
							<div className='max-h-[200px] overflow-auto rounded-radius-sm bg-black p-3'>
								<pre className='whitespace-pre-wrap font-mono text-caption-sm text-text-secondary'>
									{logsQ.isLoading ? 'Loading...' : logsQ.isError ? logsQ.error.message : (logsQ.data?.slice(-2000) || 'No logs available')}
								</pre>
							</div>
						</div>
					)}

					{!selectedAppId && (
						<div className='rounded-radius-md border border-border-default bg-surface-base p-6 text-center'>
							<TbSettings className='mx-auto h-8 w-8 text-text-tertiary' />
							<p className='mt-2 text-body-sm text-text-secondary'>Select an app above to view its logs</p>
						</div>
					)}
				</TabsContent>
			</Tabs>

			{/* Download Logs */}
			<div className='pt-2'>
				<Button
					variant='secondary'
					size='sm'
					onClick={() => window.location.href = '/logs'}
				>
					Download All Logs
				</Button>
			</div>

			{/* Full Logs Dialog */}
			{showFullLogs && (
				<div className='fixed inset-0 z-[9999] flex items-center justify-center bg-black/80' onClick={() => setShowFullLogs(false)}>
					<div className='max-h-[80vh] w-[90vw] max-w-4xl overflow-hidden rounded-20 border border-border-default bg-neutral-900' onClick={(e) => e.stopPropagation()}>
						<div className='flex items-center justify-between border-b border-border-default px-6 py-4'>
							<h2 className='text-18 font-semibold'>{logType === 'system' ? 'System Logs' : 'App Logs'}</h2>
							<button
								onClick={() => setShowFullLogs(false)}
								className='rounded-radius-sm p-2 text-text-secondary hover:bg-surface-2 hover:text-text-primary'
							>
								<TbArrowLeft className='h-5 w-5' />
							</button>
						</div>
						<div className='max-h-[60vh] overflow-auto p-4'>
							<pre className='whitespace-pre-wrap font-mono text-caption text-text-secondary'>
								{logsQ.data || 'No logs available'}
							</pre>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

function AdvancedSection() {
	// Beta channel
	const releaseChannelQ = trpcReact.system.getReleaseChannel.useQuery()
	const releaseChannelMut = trpcReact.system.setReleaseChannel.useMutation({
		onSuccess: () => releaseChannelQ.refetch(),
	})
	const isBetaChannel = releaseChannelQ.data === 'beta'
	const isBetaLoading = releaseChannelMut.isPending || releaseChannelQ.isLoading

	// External DNS
	const externalDnsQ = trpcReact.system.isExternalDns.useQuery()
	const externalDnsMut = trpcReact.system.setExternalDns.useMutation({
		onSuccess: () => externalDnsQ.refetch(),
	})
	const isExternalDns = externalDnsQ.data === true
	const isExternalDnsLoading = externalDnsMut.isPending || externalDnsQ.isLoading

	return (
		<div className='space-y-4'>
			{/* Beta Program */}
			<SettingsToggleRow
				title={t('beta-program')}
				description={t('beta-program-description')}
				checked={isBetaChannel}
				onCheckedChange={(checked) => releaseChannelMut.mutate({channel: checked ? 'beta' : 'stable'})}
				disabled={isBetaLoading}
			/>

			{/* External DNS */}
			<SettingsToggleRow
				title={t('external-dns')}
				description={t('external-dns-description')}
				checked={isExternalDns}
				onCheckedChange={(checked) => externalDnsMut.mutate(checked)}
				disabled={isExternalDnsLoading}
			/>

			{/* Factory Reset */}
			<div className='flex items-center justify-between rounded-radius-md border border-red-500/20 bg-red-500/5 p-4'>
				<div>
					<div className='text-body font-medium text-red-400'>{t('factory-reset')}</div>
					<div className='text-caption text-text-secondary'>{t('factory-reset-description')}</div>
				</div>
				<IconButtonLink to='/factory-reset' text='destructive'>
					{t('reset')}
				</IconButtonLink>
			</div>
		</div>
	)
}

function SoftwareUpdateSection() {
	return (
		<div className='space-y-4'>
			<p className='text-body-sm text-text-secondary'>Check for LivOS updates.</p>
			<SoftwareUpdateListRow isActive={false} />
		</div>
	)
}
