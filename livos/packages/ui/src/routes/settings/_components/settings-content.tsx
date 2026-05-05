import {Loader2} from 'lucide-react'
import {AnimatePresence, motion} from 'motion/react'
import React, {Suspense, useEffect, useRef, useState} from 'react'
import {FaRegSave} from 'react-icons/fa'
import {
	RiExpandRightFill,
	RiKeyLine,
	RiUserLine,
} from 'react-icons/ri'
import {
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
	TbBrandTelegram,
	TbBrandDiscord,
	TbBrandWhatsapp,
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
	TbLogout,
	TbChartBar,
	TbMail,
	TbWebhook,
	TbMicrophone,
	TbLogin,
	TbUsers,
	TbBrain,
	TbServer2,
	TbCalendarTime,
	TbStethoscope,
	TbRobot,
} from 'react-icons/tb'
import {IconType} from 'react-icons'

import {Card} from '@/components/ui/card'
import {IconButton} from '@/components/ui/icon-button'
import {IconButtonLink} from '@/components/ui/icon-button-link'
import {usePassword} from '@/hooks/use-password'
import {useUserName} from '@/hooks/use-user-name'
import {useBackups} from '@/features/backups/hooks/use-backups'
import {useApps} from '@/providers/apps'
import {animatedWallpapers, animatedWallpaperIds, type AnimatedWallpaperId} from '@/components/animated-wallpapers'
import {useWallpaper} from '@/providers/wallpaper'
import {LanguageDropdownContent, LanguageDropdownTrigger} from '@/routes/settings/_components/language-dropdown'
import {Button} from '@/shadcn-components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogPortal,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {AnimatedInputError, Input, PasswordInput} from '@/shadcn-components/ui/input'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/shadcn-components/ui/tabs'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/shadcn-components/ui/select'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/shadcn-components/ui/dropdown-menu'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'
import {cn} from '@/shadcn-lib/utils'
import {useIsMobile} from '@/hooks/use-is-mobile'

import {ChangePasswordWarning, ContactSupportLink} from './shared'
import {SettingsInfoCard} from './settings-info-card'
import {SettingsToggleRow} from './settings-toggle-row'
import {SecurityToggleRow} from './security-toggle-row'
import {SoftwareUpdateListRow} from './software-update-list-row'
import {PastDeploysTable} from './past-deploys-table'
import {MenuItemBadge} from './menu-item-badge'

// Lazy-loaded DM Pairing content
const DmPairingContentLazy = React.lazy(() =>
	import('@/routes/settings/dm-pairing').then((m) => ({default: m.DmPairingContent})),
)
const UsageDashboardLazy = React.lazy(() =>
	import('@/routes/settings/usage-dashboard').then((m) => ({default: m.UsageDashboard})),
)
const GmailContentLazy = React.lazy(() =>
	import('@/routes/settings/gmail').then((m) => ({default: m.GmailContent})),
)
const WebhooksContentLazy = React.lazy(() =>
	import('@/routes/settings/webhooks').then((m) => ({default: m.WebhooksContent})),
)
const VoiceContentLazy = React.lazy(() =>
	import('@/routes/settings/voice').then((m) => ({default: m.VoiceContent})),
)
const UsersSectionLazy = React.lazy(() =>
	import('@/routes/settings/users').then((m) => ({default: m.UsersSection})),
)
const AdminDevicesSectionLazy = React.lazy(() =>
	import('./admin-devices-section').then((m) => ({default: m.AdminDevicesSection})),
)
const MemorySectionLazy = React.lazy(() =>
	import('@/routes/settings/memory').then((m) => ({default: m.MemorySection})),
)
const AiConfigLazy = React.lazy(() => import('@/routes/settings/ai-config'))
// Phase 76 / Plan 06 (MARKET-07) — Liv Agent thin settings page (D-12).
const LivAgentLazy = React.lazy(() => import('@/routes/settings/liv-agent'))

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SettingsSection =
	| 'home'
	| 'account'
	| 'users'
	| 'admin-devices'
	| 'wallpaper'
	| '2fa'
	| 'ai-config'
	| 'liv-agent'
	| 'integrations'
	| 'gmail'
	| 'dm-pairing'
	| 'usage'
	| 'webhooks'
	| 'voice'
	| 'my-domains'
	| 'backups'
	| 'migration'
	| 'language'
	| 'troubleshoot'
	| 'advanced'
	| 'memory'
	| 'scheduler'
	| 'software-update'
	// v29.4 Phase 47 Plan 05 — AI Diagnostics admin section.
	| 'diagnostics'

interface MenuItem {
	id: SettingsSection
	icon: IconType
	label: string
	description: string
	adminOnly?: boolean
}

const MENU_ITEMS: MenuItem[] = [
	// Per-user settings (visible to all users)
	{id: 'account', icon: TbUser, label: 'Account', description: 'Name and password'},
	{id: 'wallpaper', icon: TbPhoto, label: 'Theme', description: 'Wallpaper & accent color'},
	{id: 'language', icon: TbLanguage, label: 'Language', description: 'Interface language'},
	{id: '2fa', icon: TbShield, label: '2FA', description: 'Two-factor authentication'},
	{id: 'integrations', icon: TbPlug, label: 'Integrations', description: 'Telegram & Discord'},
	{id: 'gmail', icon: TbMail, label: 'Gmail', description: 'Email integration & OAuth'},
	{id: 'dm-pairing', icon: TbShield, label: 'DM Security', description: 'DM pairing & allowlist'},
	{id: 'webhooks', icon: TbWebhook, label: 'Webhooks', description: 'Webhook endpoints & secrets'},
	{id: 'voice', icon: TbMicrophone, label: 'Voice', description: 'Push-to-talk voice mode'},
	{id: 'usage', icon: TbChartBar, label: 'Usage', description: 'Token usage & cost tracking'},
	{id: 'memory', icon: TbBrain, label: 'Memory', description: 'AI memory & conversations'},
	// Phase 76 / Plan 06 (MARKET-07) — Liv Agent thin settings entry (per-user surface, NOT admin-only).
	{id: 'liv-agent', icon: TbRobot, label: 'Liv Agent', description: 'Marketplace, my agents, onboarding tour'},
	// Admin-only settings (server management)
	{id: 'users', icon: TbUsers, label: 'Users', description: 'Manage users & invites', adminOnly: true},
	{id: 'admin-devices', icon: TbServer2, label: 'Devices', description: 'All devices across all users', adminOnly: true},
	{id: 'ai-config', icon: TbKey, label: 'AI Configuration', description: 'AI providers & model', adminOnly: true},
	{id: 'my-domains', icon: TbWorld, label: 'My Domains', description: 'Domains synced from livinity.io', adminOnly: true},
	{id: 'scheduler', icon: TbCalendarTime, label: 'Scheduler', description: 'Scheduled backup & maintenance jobs', adminOnly: true},
	{id: 'backups', icon: TbDatabase, label: 'Backups', description: 'Backup & restore', adminOnly: true},
	{id: 'migration', icon: RiExpandRightFill, label: 'Migration Assistant', description: 'Transfer from Raspberry Pi', adminOnly: true},
	{id: 'troubleshoot', icon: TbTool, label: 'Troubleshoot', description: 'Debug & diagnostics', adminOnly: true},
	{id: 'advanced', icon: TbSettingsMinus, label: 'Advanced', description: 'Terminal, DNS, Beta', adminOnly: true},
	{id: 'software-update', icon: TbUpdate, label: 'Software Update', description: 'Check for updates', adminOnly: true},
	// v29.4 Phase 47 Plan 05 — AI Diagnostics (FR-TOOL/MODEL/PROBE).
	{id: 'diagnostics', icon: TbStethoscope, label: 'Diagnostics', description: 'Capability registry, model identity, app health', adminOnly: true},
]

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

function useVisibleMenuItems(): MenuItem[] {
	const userQ = trpcReact.user.get.useQuery()
	const role = userQ.data?.role
	// In legacy single-user mode (no role set), treat as admin
	const isAdmin = !role || role === 'admin'
	return MENU_ITEMS.filter((item) => !item.adminOnly || isAdmin)
}

export function SettingsContent() {
	const [activeSection, setActiveSection] = useState<SettingsSection>('home')
	const visibleItems = useVisibleMenuItems()
	const isMobile = useIsMobile()

	// Mobile: drill-down detail view (no sidebar)
	if (isMobile && activeSection !== 'home') {
		const menuItem = visibleItems.find((m) => m.id === activeSection)
		return (
			<div className='animate-in fade-in'>
				{/* Mobile detail header */}
				<div className='flex items-center gap-3 px-1 pb-4'>
					<button
						onClick={() => setActiveSection('home')}
						className='flex h-11 w-11 items-center justify-center rounded-radius-md bg-surface-base text-text-secondary transition-colors hover:bg-surface-1 hover:text-text-primary'
					>
						<TbArrowLeft className='h-5 w-5' />
					</button>
					<div className='min-w-0'>
						<h1 className='text-heading font-semibold -tracking-2 truncate'>{menuItem?.label}</h1>
						<p className='text-body-sm text-text-secondary truncate'>{menuItem?.description}</p>
					</div>
				</div>
				{/* Section content with overflow protection */}
				<div className='overflow-x-hidden'>
					<AnimatePresence mode='wait'>
						<motion.div
							key={activeSection}
							initial={{opacity: 0, x: 20}}
							animate={{opacity: 1, x: 0}}
							exit={{opacity: 0, x: -20}}
							transition={{duration: 0.2, ease: 'easeOut'}}
						>
							<SectionContent section={activeSection} onBack={() => setActiveSection('home')} />
						</motion.div>
					</AnimatePresence>
				</div>
			</div>
		)
	}

	// Mobile: home view - menu list only (no right-side placeholder)
	if (isMobile) {
		return (
			<div className='animate-in fade-in'>
				<Card className='!p-2'>
					<div className='space-y-0.5'>
						{visibleItems.map((item, i) => (
							<motion.button
								key={item.id}
								onClick={() => setActiveSection(item.id)}
								className='relative flex w-full items-center gap-3 rounded-radius-sm px-3 py-3 text-left transition-colors hover:bg-surface-2'
								initial={{opacity: 0, x: -10}}
								animate={{opacity: 1, x: 0}}
								transition={{delay: i * 0.02, duration: 0.25, ease: 'easeOut'}}
							>
								<div className='flex h-9 w-9 items-center justify-center rounded-radius-sm bg-surface-2'>
									<item.icon className='h-4.5 w-4.5 text-text-secondary' />
								</div>
								<div className='flex-1 min-w-0'>
									<div className='text-body-sm font-medium truncate'>{item.label}</div>
									<div className='text-caption-sm text-text-tertiary truncate'>{item.description}</div>
								</div>
								<TbChevronRight className='h-4 w-4 shrink-0 text-text-tertiary' />
								<MenuItemBadge itemId={item.id} activeSection={activeSection} />
							</motion.button>
						))}
					</div>
				</Card>
				<div className='mt-3'>
					<ContactSupportLink />
				</div>
			</div>
		)
	}

	// If a section is selected, show master-detail view (desktop)
	if (activeSection !== 'home') {
		return (
			<div className='animate-in fade-in'>
				<SettingsDetailView
					section={activeSection}
					onBack={() => setActiveSection('home')}
					onNavigate={(section) => setActiveSection(section)}
					visibleItems={visibleItems}
				/>
			</div>
		)
	}

	// Desktop: home view with sidebar menu + placeholder card
	return (
		<div className='animate-in fade-in'>
			<div className='grid w-full gap-x-[30px] gap-y-[20px] lg:grid-cols-[280px_auto]'>
				{/* Left Sidebar - Menu */}
				<div className='flex flex-col gap-3'>
					{/* Menu Items */}
					<Card className='!p-2'>
						<div className='space-y-0.5'>
							{visibleItems.map((item, i) => (
								<motion.button
									key={item.id}
									onClick={() => setActiveSection(item.id)}
									className='relative flex w-full items-center gap-3 rounded-radius-sm px-3 py-2.5 text-left transition-colors hover:bg-surface-2'
									initial={{opacity: 0, x: -10}}
									animate={{opacity: 1, x: 0}}
									transition={{delay: i * 0.02, duration: 0.25, ease: 'easeOut'}}
								>
									<div className='flex h-8 w-8 items-center justify-center rounded-radius-sm bg-surface-2'>
										<item.icon className='h-4 w-4 text-text-secondary' />
									</div>
									<div className='flex-1 min-w-0'>
										<div className='text-body-sm font-medium truncate'>{item.label}</div>
										<div className='text-caption-sm text-text-tertiary truncate'>{item.description}</div>
									</div>
									<TbChevronRight className='h-4 w-4 text-text-tertiary' />
									<MenuItemBadge itemId={item.id} activeSection={activeSection} />
								</motion.button>
							))}
						</div>
					</Card>

					<ContactSupportLink />
				</div>

				{/* Right Side */}
				<div className='flex flex-col gap-5'>
					{/* Quick Info */}
					<Card>
						<div className='text-center py-8'>
							<div className='text-body-lg font-medium text-text-secondary'>Select a setting from the menu</div>
							<div className='text-body-sm text-text-tertiary mt-1'>Configure your Livinity device</div>
						</div>
					</Card>
				</div>
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
	visibleItems,
}: {
	section: SettingsSection
	onBack: () => void
	onNavigate: (section: SettingsSection) => void
	visibleItems: MenuItem[]
}) {
	const menuItem = visibleItems.find((m) => m.id === section)
	const isMobile = useIsMobile()

	return (
		<div className={cn(
			'w-full',
			!isMobile && 'grid gap-x-[30px] gap-y-[20px] lg:grid-cols-[280px_auto]'
		)}>
			{/* Left Sidebar - hidden on mobile (mobile uses SettingsContent's own back header) */}
			{!isMobile && (
				<div className='flex flex-col gap-3'>
					<Card className='!p-2'>
						<div className='space-y-0.5'>
							{visibleItems.map((item) => (
								<button
									key={item.id}
									onClick={() => onNavigate(item.id)}
									className='relative flex w-full items-center gap-3 rounded-radius-sm px-3 py-2.5 text-left transition-colors hover:bg-surface-2'
								>
									{item.id === section && (
										<motion.div
											layoutId='settings-sidebar-active'
											className='absolute inset-0 rounded-radius-sm bg-surface-3'
											transition={{type: 'spring', bounce: 0.15, duration: 0.4}}
										/>
									)}
									<div className={cn(
										'relative z-10 flex h-8 w-8 items-center justify-center rounded-radius-sm',
										item.id === section ? 'bg-surface-3' : 'bg-surface-2'
									)}>
										<item.icon className={cn(
											'h-4 w-4',
											item.id === section ? 'text-text-primary' : 'text-text-secondary'
										)} />
									</div>
									<div className='relative z-10 flex-1 min-w-0'>
										<div className='text-body-sm font-medium truncate'>{item.label}</div>
									</div>
									{item.id === section && <TbChevronRight className='relative z-10 h-4 w-4 text-text-secondary' />}
									<MenuItemBadge itemId={item.id} activeSection={section} />
								</button>
							))}
						</div>
					</Card>
				</div>
			)}

			{/* Right Side - Content */}
			<Card className={cn('min-h-[500px]', isMobile && 'min-h-0')}>
				{/* Header with back button - hidden on mobile (SettingsContent handles it) */}
				{!isMobile && (
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
				)}

				{/* Content based on section — animated transition */}
				<AnimatePresence mode='wait'>
					<motion.div
						key={section}
						initial={{opacity: 0, y: 8}}
						animate={{opacity: 1, y: 0}}
						exit={{opacity: 0, y: -8}}
						transition={{duration: 0.2, ease: 'easeOut'}}
					>
						<SectionContent section={section} onBack={onBack} />
					</motion.div>
				</AnimatePresence>
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
		case 'users':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><UsersSectionLazy /></Suspense>
		case 'admin-devices':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><AdminDevicesSectionLazy /></Suspense>
		case 'wallpaper':
			return <WallpaperSection />
		case '2fa':
			return <TwoFaSection />
		case 'ai-config':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><AiConfigLazy /></Suspense>
		case 'liv-agent':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><LivAgentLazy /></Suspense>
		case 'integrations':
			return <IntegrationsSection />
		case 'gmail':
			return <GmailSection />
		case 'dm-pairing':
			return <DmPairingSection />
		case 'usage':
			return <UsageSection />
		case 'webhooks':
			return <WebhooksSection />
		case 'voice':
			return <VoiceSection />
		case 'my-domains':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><MyDomainsSectionLazy /></Suspense>
		case 'scheduler':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><SchedulerSectionLazy /></Suspense>
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
		case 'memory':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><MemorySectionLazy /></Suspense>
		case 'software-update':
			return <SoftwareUpdateSection />
		case 'diagnostics':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><DiagnosticsSectionLazy /></Suspense>
		default:
			return null
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual Sections
// ─────────────────────────────────────────────────────────────────────────────

function AccountSection() {
	const [showChangeName, setShowChangeName] = useState(false)
	const [showChangePassword, setShowChangePassword] = useState(false)

	return (
		<div className='space-y-4'>
			<p className='text-body-sm text-text-secondary'>{t('account-description')}</p>
			<div className='flex flex-wrap gap-3'>
				<IconButton onClick={() => setShowChangeName(true)} icon={RiUserLine}>
					{t('change-name')}
				</IconButton>
				<IconButton onClick={() => setShowChangePassword(true)} icon={RiKeyLine}>
					{t('change-password')}
				</IconButton>
			</div>
			<InlineChangeNameDialog open={showChangeName} onOpenChange={setShowChangeName} />
			<InlineChangePasswordDialog open={showChangePassword} onOpenChange={setShowChangePassword} />
		</div>
	)
}

function InlineChangeNameDialog({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}) {
	const {name, setName, handleSubmit, formError, isLoading} = useUserName({
		onSuccess: () => onOpenChange(false),
	})

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogPortal>
				<DialogContent asChild>
					<form onSubmit={handleSubmit}>
						<fieldset disabled={isLoading} className='flex flex-col gap-5'>
							<DialogHeader>
								<DialogTitle>{t('change-name')}</DialogTitle>
							</DialogHeader>
							<Input placeholder={t('change-name.input-placeholder')} value={name} onValueChange={setName} />
							<div className='-my-2.5'>
								<AnimatedInputError>{formError}</AnimatedInputError>
							</div>
							<DialogFooter>
								<Button type='submit' size='dialog' variant='primary'>
									{t('confirm')}
								</Button>
								<Button type='button' size='dialog' onClick={() => onOpenChange(false)}>
									{t('cancel')}
								</Button>
							</DialogFooter>
						</fieldset>
					</form>
				</DialogContent>
			</DialogPortal>
		</Dialog>
	)
}

function InlineChangePasswordDialog({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}) {
	const {
		password,
		setPassword,
		newPassword,
		setNewPassword,
		newPasswordRepeat,
		setNewPasswordRepeat,
		handleSubmit,
		fieldErrors,
		formError,
		isLoading,
	} = usePassword({
		onSuccess: () => onOpenChange(false),
	})

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogPortal>
				<DialogContent asChild>
					<form onSubmit={handleSubmit}>
						<fieldset disabled={isLoading} className='flex flex-col gap-5'>
							<DialogHeader>
								<DialogTitle>{t('change-password')}</DialogTitle>
							</DialogHeader>
							<ChangePasswordWarning />
							<PasswordInput
								label={t('change-password.current-password')}
								value={password}
								onValueChange={setPassword}
								error={fieldErrors.oldPassword}
							/>
							<PasswordInput
								label={t('change-password.new-password')}
								value={newPassword}
								onValueChange={setNewPassword}
								error={fieldErrors.newPassword}
							/>
							<PasswordInput
								label={t('change-password.repeat-password')}
								value={newPasswordRepeat}
								onValueChange={setNewPasswordRepeat}
							/>
							<div className='-my-2.5'>
								<AnimatedInputError>{formError}</AnimatedInputError>
							</div>
							<DialogFooter>
								<Button type='submit' size='dialog' variant='primary'>
									{t('confirm')}
								</Button>
								<Button type='button' size='dialog' onClick={() => onOpenChange(false)}>
									{t('cancel')}
								</Button>
							</DialogFooter>
						</fieldset>
					</form>
				</DialogContent>
			</DialogPortal>
		</Dialog>
	)
}

const ACCENT_COLORS = [
	{label: 'Default', hsl: null},
	{label: 'Blue', hsl: '217 91% 60%'},
	{label: 'Purple', hsl: '262 83% 58%'},
	{label: 'Pink', hsl: '330 81% 60%'},
	{label: 'Red', hsl: '0 84% 60%'},
	{label: 'Orange', hsl: '25 95% 53%'},
	{label: 'Yellow', hsl: '45 93% 47%'},
	{label: 'Green', hsl: '142 71% 45%'},
	{label: 'Teal', hsl: '173 80% 40%'},
	{label: 'Cyan', hsl: '189 94% 43%'},
] as const

function WallpaperSection() {
	const {wallpaper, setWallpaperId, settings, updateSettings} = useWallpaper()
	const [hoveredId, setHoveredId] = useState<AnimatedWallpaperId | null>(null)
	const accentColorQ = trpcReact.user.accentColor.useQuery(undefined, {retry: false})
	const utils = trpcReact.useUtils()
	const accentMut = trpcReact.user.set.useMutation({
		onSuccess: () => {
			utils.user.accentColor.invalidate()
			utils.user.get.invalidate()
		},
	})

	const previewId = (hoveredId || wallpaper.id || animatedWallpaperIds[0]) as AnimatedWallpaperId
	const PreviewComponent = animatedWallpapers[previewId]?.component

	const hasFilter = settings.hueRotate !== 0 || settings.brightness !== 1 || settings.saturation !== 1
	const filterStyle = hasFilter
		? {filter: `hue-rotate(${settings.hueRotate}deg) brightness(${settings.brightness}) saturate(${settings.saturation})`}
		: undefined

	return (
		<div className='flex flex-col gap-4'>
			{/* Live preview */}
			<div className='relative aspect-video overflow-hidden rounded-radius-md border border-border-default'>
				<div className='absolute inset-0' style={filterStyle}>
					{PreviewComponent && (
						<PreviewComponent
							key={previewId}
							paused={settings.paused}
							speed={settings.speed}
							className='h-full w-full'
						/>
					)}
				</div>
				<div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-3 pb-2 pt-6'>
					<span className='text-sm font-medium text-white/90'>{animatedWallpapers[previewId]?.name}</span>
				</div>
			</div>

			{/* Wallpaper selection grid */}
			<div className='grid grid-cols-4 gap-2 sm:grid-cols-6'>
				{animatedWallpaperIds.map((id) => (
					<button
						key={id}
						onMouseEnter={() => setHoveredId(id)}
						onMouseLeave={() => setHoveredId(null)}
						onClick={() => setWallpaperId(id)}
						className={cn(
							'relative aspect-square overflow-hidden rounded-lg transition-all',
							wallpaper.id === id
								? 'ring-2 ring-brand scale-105'
								: hoveredId === id
									? 'ring-1 ring-brand/40 scale-[1.03]'
									: 'hover:ring-1 hover:ring-white/20'
						)}
						style={{backgroundColor: `hsl(${animatedWallpapers[id].brandColorHsl})`}}
					>
						<span className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/40 to-transparent pt-3 pb-0.5 text-center text-[9px] font-medium text-white/80'>
							{animatedWallpapers[id].name}
						</span>
						{wallpaper.id === id && (
							<div className='absolute top-1 right-1'>
								<TbCheck className='h-3 w-3 text-white drop-shadow-md' />
							</div>
						)}
					</button>
				))}
			</div>

			{/* Animation settings */}
			<div className='flex flex-col gap-4 rounded-radius-md border border-border-default bg-surface-base p-4'>
				<div className='flex items-center justify-between'>
					<span className='text-sm font-medium text-text-primary'>Animation</span>
					<button
						onClick={() => updateSettings({paused: !settings.paused})}
						className={cn(
							'rounded-full px-3 py-1 text-xs font-medium transition-colors',
							settings.paused
								? 'bg-brand/20 text-brand hover:bg-brand/30'
								: 'bg-surface-2 text-text-secondary hover:bg-surface-2/80'
						)}
					>
						{settings.paused ? 'Resume' : 'Pause'}
					</button>
				</div>

				<WallpaperSlider
					label='Speed'
					value={settings.speed}
					min={0.25}
					max={3}
					step={0.25}
					displayValue={`${settings.speed}x`}
					onChange={(speed) => updateSettings({speed})}
				/>

				<WallpaperSlider
					label='Color'
					value={settings.hueRotate}
					min={0}
					max={360}
					step={10}
					displayValue={`${settings.hueRotate}°`}
					onChange={(hueRotate) => updateSettings({hueRotate})}
				/>

				<WallpaperSlider
					label='Brightness'
					value={settings.brightness}
					min={0.5}
					max={1.5}
					step={0.1}
					displayValue={`${Math.round(settings.brightness * 100)}%`}
					onChange={(brightness) => updateSettings({brightness})}
				/>

				<WallpaperSlider
					label='Saturation'
					value={settings.saturation}
					min={0}
					max={2}
					step={0.1}
					displayValue={`${Math.round(settings.saturation * 100)}%`}
					onChange={(saturation) => updateSettings({saturation})}
				/>

				{(settings.speed !== 1 || settings.hueRotate !== 0 || settings.brightness !== 1 || settings.saturation !== 1) && (
					<button
						onClick={() => updateSettings({speed: 1, hueRotate: 0, brightness: 1, saturation: 1})}
						className='self-start text-xs font-medium text-text-tertiary hover:text-text-secondary transition-colors'
					>
						Reset to defaults
					</button>
				)}
			</div>

			{/* Accent color picker */}
			<div className='flex flex-col gap-3 rounded-radius-md border border-border-default bg-surface-base p-4'>
				<span className='text-sm font-medium text-text-primary'>Accent Color</span>
				<div className='flex flex-wrap gap-2'>
					{ACCENT_COLORS.map((color) => {
						const isActive = color.hsl === null
							? !accentColorQ.data
							: accentColorQ.data === color.hsl
						return (
							<button
								key={color.label}
								title={color.label}
								onClick={() => accentMut.mutate({accentColor: color.hsl})}
								className={cn(
									'relative h-8 w-8 rounded-full transition-all',
									isActive ? 'ring-2 ring-white ring-offset-2 ring-offset-black/50 scale-110' : 'hover:scale-105',
								)}
								style={{
									backgroundColor: color.hsl ? `hsl(${color.hsl})` : `hsl(${wallpaper.brandColorHsl || '0 0% 50%'})`,
								}}
							>
								{isActive && (
									<TbCheck className='absolute inset-0 m-auto h-4 w-4 text-white drop-shadow-md' />
								)}
							</button>
						)
					})}
				</div>
				{accentColorQ.data && (
					<p className='text-xs text-text-tertiary'>
						Custom accent color overrides the wallpaper theme color.
					</p>
				)}
			</div>
		</div>
	)
}

function WallpaperSlider({
	label,
	value,
	min,
	max,
	step,
	displayValue,
	onChange,
}: {
	label: string
	value: number
	min: number
	max: number
	step: number
	displayValue: string
	onChange: (value: number) => void
}) {
	return (
		<div className='flex items-center gap-3'>
			<span className='w-20 shrink-0 text-xs text-text-secondary'>{label}</span>
			<input
				type='range'
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(e) => onChange(parseFloat(e.target.value))}
				className='h-1 flex-1 cursor-pointer appearance-none rounded-full bg-surface-2 accent-brand [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand'
			/>
			<span className='w-10 shrink-0 text-right text-xs tabular-nums text-text-tertiary'>{displayValue}</span>
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
	const kimiStatusQ = trpcReact.ai.getKimiStatus.useQuery()
	const utils = trpcReact.useUtils()
	const [loginSession, setLoginSession] = useState<{
		sessionId: string
		verificationUrl: string
		userCode: string
	} | null>(null)

	const isConnected = kimiStatusQ.data?.authenticated ?? false

	const loginMutation = trpcReact.ai.kimiLogin.useMutation({
		onSuccess: (data) => {
			setLoginSession(data)
		},
	})

	const logoutMutation = trpcReact.ai.kimiLogout.useMutation({
		onSuccess: () => {
			setLoginSession(null)
			utils.ai.getKimiStatus.invalidate()
		},
	})

	// Poll login session for auth completion
	const pollQ = trpcReact.ai.kimiLoginPoll.useQuery(
		{sessionId: loginSession?.sessionId ?? ''},
		{enabled: !!loginSession, refetchInterval: 2000},
	)

	// When poll returns success or status becomes connected, clear login session
	useEffect(() => {
		if (pollQ.data?.status === 'success' || (isConnected && loginSession)) {
			setLoginSession(null)
			utils.ai.getKimiStatus.invalidate()
		}
	}, [pollQ.data?.status, isConnected, loginSession, utils.ai.getKimiStatus])

	return (
		<div className='max-w-full space-y-4'>
			<h3 className='text-body font-medium text-text-primary'>Kimi AI</h3>
			<p className='text-body-sm text-text-secondary'>
				Sign in with your Kimi account to enable AI features.
			</p>

			<div className={cn(
				'rounded-radius-md border p-4 space-y-3',
				isConnected ? 'border-brand/50 bg-brand/5' : 'border-border-default bg-surface-base'
			)}>
				{kimiStatusQ.isLoading ? (
					<div className='flex items-center gap-2 text-body-sm text-text-secondary'>
						<TbLoader2 className='h-4 w-4 animate-spin' />
						Checking status...
					</div>
				) : isConnected ? (
					<div className='space-y-3'>
						<div className='flex items-center gap-2 text-body-sm text-green-400'>
							<TbCircleCheck className='h-4 w-4' />
							Connected to Kimi
						</div>
						<Button
							variant='secondary'
							size='sm'
							onClick={() => logoutMutation.mutate()}
							disabled={logoutMutation.isPending}
						>
							{logoutMutation.isPending ? (
								<><TbLoader2 className='h-4 w-4 animate-spin' /> Signing out...</>
							) : (
								<><TbLogout className='h-4 w-4' /> Sign Out</>
							)}
						</Button>
						{logoutMutation.isError && (
							<p className='text-caption text-red-400'>{logoutMutation.error.message}</p>
						)}
					</div>
				) : loginSession ? (
					<div className='space-y-3'>
						<div className='flex items-center gap-2 text-body-sm text-blue-400'>
							<TbLoader2 className='h-4 w-4 animate-spin' />
							Waiting for authorization...
						</div>
						<p className='text-caption text-text-secondary'>
							Open the link and enter code: <span className='font-mono font-bold'>{loginSession.userCode}</span>
						</p>
						<a
							href={loginSession.verificationUrl}
							target='_blank'
							rel='noopener noreferrer'
							className='block'
						>
							<Button variant='primary' size='sm' className='w-full'>
								Open Kimi Authorization
							</Button>
						</a>
						<Button variant='secondary' size='sm' onClick={() => setLoginSession(null)} className='w-full'>
							Cancel
						</Button>
					</div>
				) : (
					<div className='space-y-3'>
						<div className='flex items-center gap-2 text-body-sm text-amber-400'>
							<TbAlertCircle className='h-4 w-4' />
							Not connected
						</div>
						<Button
							variant='primary'
							size='sm'
							onClick={() => loginMutation.mutate()}
							disabled={loginMutation.isPending}
						>
							{loginMutation.isPending ? (
								<><TbLoader2 className='h-4 w-4 animate-spin' /> Starting...</>
							) : (
								<><TbLogin className='h-4 w-4' /> Sign in with Kimi</>
							)}
						</Button>
						{loginMutation.isError && (
							<p className='text-caption text-red-400'>{loginMutation.error.message}</p>
						)}
					</div>
				)}
			</div>
		</div>
	)
}

/* NexusConfigSection removed (SDK-09) — Claude Agent SDK handles all settings natively */

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
	const [activeTab, setActiveTab] = useState<'telegram' | 'discord' | 'whatsapp'>('telegram')

	return (
		<div>
			<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'telegram' | 'discord' | 'whatsapp')}>
				<TabsList className='grid w-full grid-cols-3 mb-4'>
					<TabsTrigger value='telegram' className='flex items-center gap-1.5'>
						<TbBrandTelegram className='h-4 w-4 text-sky-400' />
						Telegram
					</TabsTrigger>
					<TabsTrigger value='discord' className='flex items-center gap-1.5'>
						<TbBrandDiscord className='h-4 w-4 text-indigo-400' />
						Discord
					</TabsTrigger>
					<TabsTrigger value='whatsapp' className='flex items-center gap-1.5'>
						<TbBrandWhatsapp className='h-4 w-4 text-green-400' />
						WhatsApp
					</TabsTrigger>
				</TabsList>

				<TabsContent value='telegram'><TelegramPanel /></TabsContent>
				<TabsContent value='discord'><DiscordPanel /></TabsContent>
				<TabsContent value='whatsapp'><WhatsAppPanel /></TabsContent>
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

function WhatsAppPanel() {
	const [isConnecting, setIsConnecting] = useState(false)

	const statusQ = trpcReact.ai.whatsappGetStatus.useQuery(undefined, {
		refetchInterval: isConnecting ? 3000 : 10000,
	})
	const qrQ = trpcReact.ai.whatsappGetQr.useQuery(undefined, {
		enabled: isConnecting && !statusQ.data?.connected,
		refetchInterval: 5000,
	})
	const connectMutation = trpcReact.ai.whatsappConnect.useMutation()
	const disconnectMutation = trpcReact.ai.whatsappDisconnect.useMutation()
	const utils = trpcReact.useUtils()

	// Stop connecting mode once connected
	useEffect(() => {
		if (statusQ.data?.connected) {
			setIsConnecting(false)
		}
	}, [statusQ.data?.connected])

	const handleConnect = async () => {
		setIsConnecting(true)
		try {
			await connectMutation.mutateAsync()
		} catch {
			setIsConnecting(false)
		}
	}

	const handleDisconnect = async () => {
		await disconnectMutation.mutateAsync()
		setIsConnecting(false)
		utils.ai.whatsappGetStatus.invalidate()
	}

	const status = statusQ.data as ChannelStatus | undefined
	const isConnected = status?.connected ?? false

	return (
		<div className='space-y-4'>
			{/* Status Card */}
			<div className='rounded-radius-md border border-green-500/30 bg-green-500/10 p-4'>
				<div className='flex items-center gap-3'>
					<div className='flex h-10 w-10 items-center justify-center rounded-radius-sm bg-surface-2'>
						<TbBrandWhatsapp className='h-6 w-6 text-green-400' />
					</div>
					<div className='flex-1'>
						<div className='text-body-lg font-semibold'>WhatsApp</div>
						<div className='text-caption text-text-secondary'>Scan QR code to connect</div>
					</div>
					{isConnected ? (
						<div className='flex items-center gap-2 text-caption text-green-400'>
							<TbPlugConnected className='h-4 w-4' /> Connected
						</div>
					) : (
						<div className='flex items-center gap-2 text-caption text-red-400'>
							<TbPlugConnectedX className='h-4 w-4' /> Disconnected
						</div>
					)}
				</div>
				{status?.botName && (
					<div className='mt-2 text-caption text-text-secondary'>Phone: {status.botName}</div>
				)}
				{status?.error && !isConnected && !isConnecting && (
					<div className='mt-2 text-caption text-red-400'>{status.error}</div>
				)}
			</div>

			{/* QR Code Display — shown while connecting */}
			{isConnecting && !isConnected && (
				<div className='flex flex-col items-center gap-4 rounded-radius-md border border-border-default bg-surface-1 p-6'>
					{qrQ.data?.qr ? (
						<>
							<img
								src={qrQ.data.qr}
								alt='WhatsApp QR Code'
								className='h-[256px] w-[256px] rounded-radius-sm'
							/>
							<div className='space-y-1 text-center'>
								<p className='text-body-sm font-medium text-text-primary'>Scan with your phone</p>
								<p className='text-caption text-text-secondary'>
									WhatsApp &gt; Settings &gt; Linked Devices &gt; Link a Device
								</p>
							</div>
						</>
					) : (
						<div className='flex flex-col items-center gap-2'>
							<Loader2 className='h-8 w-8 animate-spin text-text-tertiary' />
							<p className='text-caption text-text-secondary'>Starting WhatsApp... QR code will appear shortly</p>
						</div>
					)}
				</div>
			)}

			{/* Action Buttons */}
			<div className='space-y-2'>
				{!isConnected && !isConnecting && (
					<Button
						variant='primary'
						className='w-full'
						onClick={handleConnect}
						disabled={connectMutation.isPending}
					>
						{connectMutation.isPending ? (
							<Loader2 className='mr-2 h-4 w-4 animate-spin' />
						) : null}
						Connect WhatsApp
					</Button>
				)}
				{isConnecting && !isConnected && (
					<Button
						variant='secondary'
						className='w-full'
						onClick={() => setIsConnecting(false)}
					>
						Cancel
					</Button>
				)}
				{isConnected && (
					<Button
						variant='destructive'
						className='w-full'
						onClick={handleDisconnect}
						disabled={disconnectMutation.isPending}
					>
						{disconnectMutation.isPending ? (
							<Loader2 className='mr-2 h-4 w-4 animate-spin' />
						) : null}
						Disconnect
					</Button>
				)}
			</div>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// DM Pairing Section
// ─────────────────────────────────────────────────────────────────────────────

function GmailSection() {
	return (
		<Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}>
			<GmailContentLazy />
		</Suspense>
	)
}

function DmPairingSection() {
	return (
		<Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}>
			<DmPairingContentLazy />
		</Suspense>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage Section
// ─────────────────────────────────────────────────────────────────────────────

function UsageSection() {
	return (
		<Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}>
			<UsageDashboardLazy />
		</Suspense>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhooks Section
// ─────────────────────────────────────────────────────────────────────────────

function WebhooksSection() {
	return (
		<Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}>
			<WebhooksContentLazy />
		</Suspense>
	)
}

function VoiceSection() {
	return (
		<Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}>
			<VoiceContentLazy />
		</Suspense>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Other Sections (Simplified)
// ─────────────────────────────────────────────────────────────────────────────

const MyDomainsSectionLazy = React.lazy(() => import('./my-domains-section'))

const SchedulerSectionLazy = React.lazy(() =>
	import('./scheduler-section').then((m) => ({default: m.SchedulerSection})),
)

// v29.4 Phase 47 Plan 05 — AI Diagnostics lazy section.
// settings-content.tsx is at livos/packages/ui/src/routes/settings/_components/settings-content.tsx
// diagnostics-section.tsx is at livos/packages/ui/src/routes/settings/diagnostics/diagnostics-section.tsx
// Relative path = '../diagnostics/diagnostics-section'.
const DiagnosticsSectionLazy = React.lazy(() =>
	import('../diagnostics/diagnostics-section').then((m) => ({default: m.DiagnosticsSection})),
)

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
						<div className='max-h-[200px] overflow-auto rounded-radius-sm bg-neutral-100 p-3'>
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
							<div className='max-h-[200px] overflow-auto rounded-radius-sm bg-neutral-100 p-3'>
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
				<div className='fixed inset-0 z-[9999] flex items-center justify-center bg-black/20' onClick={() => setShowFullLogs(false)}>
					<div className='max-h-[80vh] w-[95vw] max-w-4xl overflow-hidden rounded-20 border border-border-default bg-surface-base' onClick={(e) => e.stopPropagation()}>
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

			{/* Security panel (FR-F2B-06) — toggle visibility of Server Management > Security sidebar entry. */}
			<SecurityToggleRow />

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
			<h3 className='mt-6 text-body font-medium'>Past Deploys</h3>
			<PastDeploysTable />
		</div>
	)
}
