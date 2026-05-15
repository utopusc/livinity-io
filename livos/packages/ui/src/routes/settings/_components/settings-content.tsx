import {Loader2} from 'lucide-react'
import {AnimatePresence, motion} from 'motion/react'
import React, {Suspense, useEffect, useRef, useState} from 'react'
import {FaRegSave} from 'react-icons/fa'
import {
	RiExpandRightFill,
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
	TbBrandChrome,
	TbPlayerPlay,
	TbPlayerPause,
} from 'react-icons/tb'
import {IconType} from 'react-icons'

import {Card} from '@/components/ui/card'
import {useCpuForUi} from '@/hooks/use-cpu'
import {useMemoryForUi} from '@/hooks/use-memory'
import {useDiskForUi} from '@/hooks/use-disk'
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

// v36 LivOS Design Port — Section-Head + FieldCard pattern (Phases 124, 125).
import {SettingsPageHeader} from '@/components/settings-page-header'
import {FieldCard, FieldRow} from '@/components/field-card'
import {useTheme} from '@/hooks/use-theme'
import type {Theme} from '@/providers/theme-provider'
import {TbSun, TbMoon, TbDeviceDesktop} from 'react-icons/tb'

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
// Phase 102-07 — Chrome Master Login (D-102-MASTER-LOGIN-UI).
const ChromeMasterLazy = React.lazy(() => import('@/routes/settings/chrome-master'))

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
	| 'chrome-master'
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
	// v36 sidebar consolidation 2026-05-15 — six thin entries (dm-pairing, webhooks,
	// migration, diagnostics, software-update, advanced) are now sub-tabs inside
	// their owner sections (Integrations / Backups / Troubleshoot) instead of
	// top-level menu items. The original switch cases below are kept callable so
	// programmatic navigation still works (e.g. dock-window route loaders), but
	// MENU_ITEMS no longer lists them.

	// Per-user settings (visible to all users)
	{id: 'account', icon: TbUser, label: 'Account', description: 'Name and password'},
	{id: 'wallpaper', icon: TbPhoto, label: 'Theme', description: 'Wallpaper & accent color'},
	{id: 'language', icon: TbLanguage, label: 'Language', description: 'Interface language'},
	{id: '2fa', icon: TbShield, label: '2FA', description: 'Two-factor authentication'},
	{id: 'integrations', icon: TbPlug, label: 'Integrations', description: 'Channels, DM security & webhooks'},
	{id: 'gmail', icon: TbMail, label: 'Gmail', description: 'Email integration & OAuth'},
	{id: 'voice', icon: TbMicrophone, label: 'Voice', description: 'Push-to-talk voice mode'},
	{id: 'usage', icon: TbChartBar, label: 'Usage', description: 'Token usage & cost tracking'},
	{id: 'memory', icon: TbBrain, label: 'Memory', description: 'AI memory & conversations'},
	// Phase 76 / Plan 06 (MARKET-07) — Liv Agent thin settings entry (per-user surface, NOT admin-only).
	{id: 'liv-agent', icon: TbRobot, label: 'Liv Agent', description: 'Marketplace, my agents, onboarding tour'},
	// Admin-only settings (server management)
	{id: 'users', icon: TbUsers, label: 'Users', description: 'Manage users & invites', adminOnly: true},
	{id: 'admin-devices', icon: TbServer2, label: 'Devices', description: 'All devices across all users', adminOnly: true},
	{id: 'ai-config', icon: TbKey, label: 'AI Configuration', description: 'AI providers & model', adminOnly: true},
	// Phase 102-07 — master Chrome profile for WebApp browser inheritance.
	{id: 'chrome-master', icon: TbBrandChrome, label: 'Chrome Profile', description: 'Master Chrome login for WebApps', adminOnly: true},
	{id: 'my-domains', icon: TbWorld, label: 'My Domains', description: 'Domains synced from livinity.io', adminOnly: true},
	{id: 'scheduler', icon: TbCalendarTime, label: 'Scheduler', description: 'Scheduled backup & maintenance jobs', adminOnly: true},
	{id: 'backups', icon: TbDatabase, label: 'Backups', description: 'Backup, restore & migration', adminOnly: true},
	{id: 'troubleshoot', icon: TbTool, label: 'Troubleshoot', description: 'Logs, diagnostics, updates & advanced', adminOnly: true},
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

				{/* Right Side — v36 LivOS Design Port: live system dashboard
				    replaces the static "Pick a section" placeholder. Per user
				    direction 2026-05-15 ("istatistikler vs yazsin sanki ayarlara
				    giriyormus gibi"). CPU / Memory / Storage live stats use the
				    existing hooks (use-cpu / use-memory / use-disk). */}
				<div className='flex flex-col gap-5'>
					<SettingsHomeDashboard />
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
				{/* v36 LivOS Design Port — duplicate-header fix 2026-05-15.
				    The previous outer h1 header rendered the section label TWICE
				    whenever the sub-page also rendered its own <SettingsPageHeader/>
				    (per Phase 124 migration of ai-config / integrations / dm-pairing
				    / local-access / domain-setup / chrome-master / liv-agent).
				    Compact mono breadcrumb keeps the back button + context label
				    without competing with the inner heading. */}
				{!isMobile && (
					<div className='flex items-center gap-3 pb-4 mb-6 border-b border-line'>
						<button
							onClick={onBack}
							className='flex h-7 w-7 items-center justify-center rounded-full border border-line-strong text-[color:var(--fg-mute)] transition-colors hover:bg-[color:var(--bg-2)] hover:text-[color:var(--fg)]'
							aria-label='Back to settings'
						>
							<TbArrowLeft className='h-3.5 w-3.5' />
						</button>
						<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-mute)]'>
							Settings · {menuItem?.label}
						</span>
					</div>
				)}

				{/* Content based on section — animated transition */}
				<AnimatePresence mode='wait'>
					<motion.div
						key={section}
						initial={{opacity: 0, y: 8}}
						animate={{opacity: 1, y: 0}}
						exit={{opacity: 0, y: -8}}
						transition={{duration: 0.22, ease: [0.2, 0.7, 0.2, 1]}}
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
		case 'chrome-master':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><ChromeMasterLazy /></Suspense>
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
	// v36 LivOS Design Port — pull the current name so the FieldRow can render
	// the live value next to the "Change" trailing button.
	const userQ = trpcReact.user.get.useQuery()
	const userName = userQ.data?.name

	return (
		<div className='flex flex-col gap-8'>
			<SettingsPageHeader
				eyebrow='01 · Account'
				title='Your'
				titleAccent='account.'
				sub='Update the display name shown across LivOS and rotate the password used to sign in to this device.'
			/>

			<FieldCard>
				<FieldRow
					label='Name'
					value={
						userName
							? <span className='truncate'>{userName}</span>
							: <span className='text-[color:var(--fg-faint)]'>—</span>
					}
					trailing={
						<Button
							variant='v36-ghost'
							size='v36-pill-sm'
							onClick={() => setShowChangeName(true)}
						>
							Change
						</Button>
					}
				/>
				<FieldRow
					label='Password'
					value={<span className='font-mono tracking-[0.2em] text-[color:var(--fg-mute)]'>••••••••</span>}
					trailing={
						<Button
							variant='v36-ghost'
							size='v36-pill-sm'
							onClick={() => setShowChangePassword(true)}
						>
							Change
						</Button>
					}
				/>
			</FieldCard>

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

// v36 LivOS Design Port — Theme section (2026-05-15).
// Foundation for a light/dark wallpaper split: registry entries carry a
// `theme: 'light' | 'dark' | 'auto'` tag and the picker groups them under
// three rails. Today there is one entry ('fluid', auto). The empty light/dark
// rails show a "coming soon" placeholder so the foundation is visible without
// pretending to ship more than one wallpaper.
//
// Animation/filter sliders (speed / hueRotate / brightness / saturation) were
// dropped along with the 11 WebGL wallpapers — fluid particles already feel
// photo-like and the controls were tuned for shader output. The persisted
// `wallpaperSettings` values stay in place harmlessly (default no-op).
function WallpaperSection() {
	const {wallpaper, setWallpaperId} = useWallpaper()
	// Preview-only pause state — independent of the global wallpaperSettings.
	// Defaults paused so opening the Theme page doesn't immediately start
	// a 2000-particle rAF loop; user clicks ▶ to bring it alive.
	const [previewPaused, setPreviewPaused] = useState(true)

	const previewId = (wallpaper.id || animatedWallpaperIds[0]) as AnimatedWallpaperId
	const PreviewComponent = animatedWallpapers[previewId]?.component

	return (
		<div className='flex flex-col gap-8'>
			<SettingsPageHeader
				eyebrow='02 · Theme'
				title='Tune your'
				titleAccent='theme.'
				sub='Pick the LivOS appearance mode and the wallpaper. The mode applies instantly across every surface (desktop, dock, windows, settings, login).'
			/>

			<ThemeModeSelector />

			{/* Wallpaper preview with a play/pause toggle. Defaults paused so the
			    page stays calm on open; tap ▶ to see the wallpaper alive without
			    affecting the actual desktop / login backdrops. */}
			<div className='flex flex-col gap-3'>
				<div className='flex items-baseline justify-between gap-2'>
					<div className='flex items-baseline gap-2'>
						<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
							Wallpaper
						</span>
						<span className='text-[11px] text-[color:var(--fg-faint)]'>
							· {animatedWallpapers[previewId]?.name}
						</span>
					</div>
					<button
						type='button'
						onClick={() => setPreviewPaused((p) => !p)}
						aria-label={previewPaused ? 'Play preview' : 'Pause preview'}
						className='flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12px] font-medium text-[color:var(--fg-mute)] transition-colors hover:bg-[color:var(--bg-2)] hover:text-[color:var(--fg)]'
					>
						{previewPaused ? <TbPlayerPlay className='h-3.5 w-3.5' /> : <TbPlayerPause className='h-3.5 w-3.5' />}
						{previewPaused ? 'Play' : 'Pause'}
					</button>
				</div>
				<div className='relative aspect-video overflow-hidden rounded-[var(--r-lg)] border border-line'>
					{PreviewComponent && (
						<PreviewComponent
							key={previewId}
							paused={previewPaused}
							className='absolute inset-0 h-full w-full'
						/>
					)}
				</div>
			</div>

			<WallpaperGroup
				ids={animatedWallpaperIds}
				selectedId={wallpaper.id}
				onSelect={setWallpaperId}
			/>
		</div>
	)
}

// v36 LivOS Design Port — Light / Dark / System segmented control (2026-05-15).
// Replaces the missing user-facing theme toggle in the settings shell. Uses the
// existing ThemeProvider (`useTheme`) so the choice persists in localStorage and
// fires applyTheme() to flip html.dark + body.dark immediately. 'iridescent' is
// not exposed here — it's a Phase 120 design-tokens variant that's only
// surfaced from the design-tokens story / experimental routes.
const THEME_OPTIONS: ReadonlyArray<{value: Exclude<Theme, 'iridescent'>; label: string; icon: typeof TbSun}> = [
	{value: 'light', label: 'Light', icon: TbSun},
	{value: 'dark', label: 'Dark', icon: TbMoon},
	{value: 'system', label: 'System', icon: TbDeviceDesktop},
]

function ThemeModeSelector() {
	const {theme, resolvedTheme, setTheme} = useTheme()
	return (
		<div className='flex flex-col gap-3'>
			<div className='flex items-baseline gap-2'>
				<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
					Mode
				</span>
				<span className='text-[11px] text-[color:var(--fg-faint)]'>
					· Currently {resolvedTheme}
				</span>
			</div>
			<div
				role='radiogroup'
				aria-label='Theme mode'
				className='inline-flex w-fit gap-1 rounded-[var(--r-md)] border border-line bg-[color:var(--bg-2)] p-1'
			>
				{THEME_OPTIONS.map(({value, label, icon: Icon}) => {
					const isActive = theme === value
					return (
						<button
							key={value}
							type='button'
							role='radio'
							aria-checked={isActive}
							onClick={() => setTheme(value)}
							className={cn(
								'flex items-center gap-2 rounded-[calc(var(--r-md)-4px)] px-3.5 py-1.5 text-[13px] font-medium transition-colors',
								// Phase 130-01: now that body.dark defines the v36 neutrals
								// (--fg, --fg-mute, --bg, --bg-2 etc.), the inactive label
								// can use the arbitrary form which flips with the theme.
								// Active state keeps the explicit zinc/white pair because
								// it intentionally INVERTS against the wrapper.
								isActive
									? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
									: 'text-[color:var(--fg-mute)] hover:bg-[color:var(--bg)] hover:text-[color:var(--fg)]',
							)}
						>
							<Icon className='h-3.5 w-3.5' />
							{label}
						</button>
					)
				})}
			</div>
		</div>
	)
}

function WallpaperGroup({
	ids,
	selectedId,
	onSelect,
}: {
	ids: AnimatedWallpaperId[]
	selectedId: string | undefined
	onSelect: (id: AnimatedWallpaperId) => void
}) {
	if (ids.length === 0) return null
	return (
		<section className='flex flex-col gap-3'>
			<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
				Available
			</span>
			<div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
				{ids.map((id) => (
					<WallpaperTile
						key={id}
						id={id}
						active={id === selectedId}
						onSelect={() => onSelect(id)}
					/>
				))}
			</div>
		</section>
	)
}

function WallpaperTile({
	id,
	active,
	onSelect,
}: {
	id: AnimatedWallpaperId
	active: boolean
	onSelect: () => void
}) {
	const entry = animatedWallpapers[id]
	const Preview = entry.component
	return (
		<button
			onClick={onSelect}
			className={cn(
				'group relative aspect-video overflow-hidden rounded-[var(--r-md)] border transition-all',
				active
					? 'border-[color:var(--fg)] shadow-[var(--shadow-pop)]'
					: 'border-line hover:border-line-strong',
			)}
		>
			<div className='absolute inset-0'>
				<Preview paused className='absolute inset-0 h-full w-full' />
			</div>
			<span className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent px-2 pb-1 pt-4 text-left text-[11px] font-medium text-white/90'>
				{entry.name}
			</span>
			{active && (
				<div className='absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--fg)] text-[color:var(--bg)]'>
					<TbCheck className='h-3 w-3' />
				</div>
			)}
		</button>
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
						<div className='flex items-center gap-2 text-body-sm text-accent-green'>
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
							<p className='text-caption text-accent-red'>{logoutMutation.error.message}</p>
						)}
					</div>
				) : loginSession ? (
					<div className='space-y-3'>
						<div className='flex items-center gap-2 text-body-sm text-accent-blue'>
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
						<div className='flex items-center gap-2 text-body-sm text-accent-amber'>
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
							<p className='text-caption text-accent-red'>{loginMutation.error.message}</p>
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

// v36 sidebar consolidation 2026-05-15 — Integrations is the consolidated home
// for everything chat-channel-shaped. Three top-level tabs:
//   Channels (Telegram / Discord / WhatsApp)
//   DM Security
//   Webhooks
function IntegrationsSection() {
	const [activeTab, setActiveTab] = useState<'channels' | 'dm-security' | 'webhooks'>('channels')

	return (
		<div>
			<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'channels' | 'dm-security' | 'webhooks')}>
				<TabsList className='grid w-full grid-cols-3 mb-4'>
					<TabsTrigger value='channels' className='flex items-center gap-1.5'>
						<TbPlug className='h-4 w-4' />
						Channels
					</TabsTrigger>
					<TabsTrigger value='dm-security' className='flex items-center gap-1.5'>
						<TbShield className='h-4 w-4' />
						DM Security
					</TabsTrigger>
					<TabsTrigger value='webhooks' className='flex items-center gap-1.5'>
						<TbWebhook className='h-4 w-4' />
						Webhooks
					</TabsTrigger>
				</TabsList>

				<TabsContent value='channels'><ChannelsPanel /></TabsContent>
				<TabsContent value='dm-security'><DmPairingSection /></TabsContent>
				<TabsContent value='webhooks'><WebhooksSection /></TabsContent>
			</Tabs>
		</div>
	)
}

function ChannelsPanel() {
	const [activeChannel, setActiveChannel] = useState<'telegram' | 'discord' | 'whatsapp'>('telegram')

	return (
		<Tabs value={activeChannel} onValueChange={(v) => setActiveChannel(v as 'telegram' | 'discord' | 'whatsapp')}>
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
					<TbBrandWhatsapp className='h-4 w-4 text-accent-green' />
					WhatsApp
				</TabsTrigger>
			</TabsList>

			<TabsContent value='telegram'><TelegramPanel /></TabsContent>
			<TabsContent value='discord'><DiscordPanel /></TabsContent>
			<TabsContent value='whatsapp'><WhatsAppPanel /></TabsContent>
		</Tabs>
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
						<div className='flex items-center gap-2 text-caption text-accent-green'>
							<TbPlugConnected className='h-4 w-4' /> Connected
						</div>
					) : (
						<div className='flex items-center gap-2 text-caption text-accent-red'>
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
						<div className='flex items-center gap-2 text-caption text-accent-green'>
							<TbPlugConnected className='h-4 w-4' /> Connected
						</div>
					) : (
						<div className='flex items-center gap-2 text-caption text-accent-red'>
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
			<div className='rounded-radius-md border border-accent-green/30 bg-accent-green/10 p-4'>
				<div className='flex items-center gap-3'>
					<div className='flex h-10 w-10 items-center justify-center rounded-radius-sm bg-surface-2'>
						<TbBrandWhatsapp className='h-6 w-6 text-accent-green' />
					</div>
					<div className='flex-1'>
						<div className='text-body-lg font-semibold'>WhatsApp</div>
						<div className='text-caption text-text-secondary'>Scan QR code to connect</div>
					</div>
					{isConnected ? (
						<div className='flex items-center gap-2 text-caption text-accent-green'>
							<TbPlugConnected className='h-4 w-4' /> Connected
						</div>
					) : (
						<div className='flex items-center gap-2 text-caption text-accent-red'>
							<TbPlugConnectedX className='h-4 w-4' /> Disconnected
						</div>
					)}
				</div>
				{status?.botName && (
					<div className='mt-2 text-caption text-text-secondary'>Phone: {status.botName}</div>
				)}
				{status?.error && !isConnected && !isConnecting && (
					<div className='mt-2 text-caption text-accent-red'>{status.error}</div>
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

// v36 sidebar consolidation 2026-05-15 — Backups now owns the Migration
// Assistant. Third tab "Migration" hosts the 3-step transfer wizard
// previously reached from its own top-level menu entry.
function BackupsSection() {
	const {repositories: backupRepositories, isLoadingRepositories: isLoadingBackups} = useBackups()
	const [activeTab, setActiveTab] = useState<'status' | 'restore' | 'migration'>('status')
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
			<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'status' | 'restore' | 'migration')}>
				<TabsList className='grid w-full grid-cols-3'>
					<TabsTrigger value='status' className='flex items-center gap-2'>
						<TbDatabase className='h-4 w-4' />
						{hasBackups ? 'Status' : 'Setup'}
					</TabsTrigger>
					<TabsTrigger value='restore' className='flex items-center gap-2'>
						<TbHistory className='h-4 w-4' />
						Restore
					</TabsTrigger>
					<TabsTrigger value='migration' className='flex items-center gap-2'>
						<RiExpandRightFill className='h-4 w-4' />
						Migration
					</TabsTrigger>
				</TabsList>

				<TabsContent value='status' className='space-y-4 pt-4'>
					{hasBackups ? (
						<>
							{/* Backup Status */}
							<div className='rounded-radius-md border border-accent-green/30 bg-accent-green/10 p-4'>
								<div className='flex items-center gap-3'>
									<div className='flex h-10 w-10 items-center justify-center rounded-radius-sm bg-accent-green/20'>
										<TbCheck className='h-5 w-5 text-accent-green' />
									</div>
									<div className='flex-1'>
										<div className='text-body font-medium text-accent-green'>Backups Configured</div>
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

				<TabsContent value='migration' className='space-y-4 pt-4'>
					<MigrationSection />
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
						<div className='flex h-8 w-8 items-center justify-center rounded-radius-sm bg-accent-blue/20 text-accent-blue'>
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
						<div className='flex h-8 w-8 items-center justify-center rounded-radius-sm bg-accent-blue/20 text-accent-blue'>
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
						<div className='flex h-8 w-8 items-center justify-center rounded-radius-sm bg-accent-blue/20 text-accent-blue'>
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

// v36 sidebar consolidation 2026-05-15 — Troubleshoot is the consolidated
// home for everything debugging-shaped. Four top-level tabs:
//   Logs (system + app, the existing TroubleshootSection content)
//   Diagnostics (AI capability registry / model identity / app health)
//   Software Update (LivOS update check + past deploys)
//   Advanced (beta channel, external DNS, security toggle, factory reset)
function TroubleshootSection() {
	const [activeTab, setActiveTab] = useState<'logs' | 'diagnostics' | 'software-update' | 'advanced'>('logs')

	return (
		<div>
			<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'logs' | 'diagnostics' | 'software-update' | 'advanced')}>
				<TabsList className='grid w-full grid-cols-4 mb-4'>
					<TabsTrigger value='logs' className='flex items-center gap-1.5'>
						<TbTool className='h-4 w-4' />
						Logs
					</TabsTrigger>
					<TabsTrigger value='diagnostics' className='flex items-center gap-1.5'>
						<TbStethoscope className='h-4 w-4' />
						Diagnostics
					</TabsTrigger>
					<TabsTrigger value='software-update' className='flex items-center gap-1.5'>
						<TbUpdate className='h-4 w-4' />
						Updates
					</TabsTrigger>
					<TabsTrigger value='advanced' className='flex items-center gap-1.5'>
						<TbSettingsMinus className='h-4 w-4' />
						Advanced
					</TabsTrigger>
				</TabsList>

				<TabsContent value='logs'><LogsPanel /></TabsContent>
				<TabsContent value='diagnostics'>
					<Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}>
						<DiagnosticsSectionLazy />
					</Suspense>
				</TabsContent>
				<TabsContent value='software-update'><SoftwareUpdateSection /></TabsContent>
				<TabsContent value='advanced'><AdvancedSection /></TabsContent>
			</Tabs>
		</div>
	)
}

function LogsPanel() {
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
								className='text-caption text-accent-blue hover:text-accent-blue'
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
									className='text-caption text-accent-blue hover:text-accent-blue'
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
			<div className='flex items-center justify-between rounded-radius-md border border-accent-red/20 bg-accent-red/5 p-4'>
				<div>
					<div className='text-body font-medium text-accent-red'>{t('factory-reset')}</div>
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

// ─────────────────────────────────────────────────────────────────────────────
// v36 LivOS Design Port — Settings home dashboard
// Replaces the legacy "Pick a section" placeholder with live system stats.
// Per user direction 2026-05-15 ("istatistikler vs yazsin sanki ayarlara
// giriyormus gibi"). CPU / Memory / Storage data via the existing hooks.
// ─────────────────────────────────────────────────────────────────────────────

function SettingsHomeDashboard() {
	const cpu = useCpuForUi({poll: true})
	const mem = useMemoryForUi({poll: true})
	const disk = useDiskForUi({poll: true})

	return (
		<div className='flex flex-col gap-5'>
			<div className='pt-2 pb-5 border-b border-line'>
				<span className='font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--fg-faint)] flex items-center gap-2 mb-3'>
					<span className='inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--fg)]' aria-hidden='true' />
					Overview
				</span>
				<h2 className='text-[clamp(26px,3vw,36px)] font-medium leading-[1.1] tracking-[-0.03em] text-[color:var(--fg)] text-balance'>
					Tune <em className='font-serif italic font-normal text-[color:var(--fg-mute)]'>LivOS.</em>
				</h2>
				<p className='mt-2 text-[13.5px] leading-[1.5] text-[color:var(--fg-mute)] max-w-[48ch]'>
					A live snapshot of your computer. Pick a section on the left to drill in.
				</p>
			</div>

			<div className='grid grid-cols-3 gap-2.5'>
				<DashStat label='CPU' value={cpu.value} sub={cpu.secondaryValue} fill={cpu.progress} />
				<DashStat label='Memory' value={mem.value} sub={mem.secondaryValue} fill={mem.progress} />
				<DashStat label='Storage' value={disk.value} sub={disk.secondaryValue} fill={disk.progress} />
			</div>
		</div>
	)
}

function DashStat({label, value, sub, fill}: {label: string; value: React.ReactNode; sub: React.ReactNode; fill: number}) {
	const pct = Math.max(0, Math.min(1, Number.isFinite(fill) ? fill : 0)) * 100
	return (
		<div className='rounded-[12px] border border-line bg-[color:var(--bg)] p-4'>
			<div className='font-mono text-[10.5px] uppercase tracking-[0.14em] text-[color:var(--fg-mute)]'>{label}</div>
			<div className='text-[20px] font-semibold tracking-[-0.02em] mt-1 text-[color:var(--fg)] leading-none'>{value}</div>
			<div className='text-[11.5px] text-[color:var(--fg-faint)] mt-1.5 truncate'>{sub}</div>
			<div className='h-1 rounded-[2px] bg-[color:var(--bg-2)] mt-3 overflow-hidden'>
				<div className='h-full bg-[color:var(--fg)] rounded-[2px] transition-[width] duration-300 ease-out' style={{width: `${pct}%`}} />
			</div>
		</div>
	)
}
