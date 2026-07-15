import {Loader2} from 'lucide-react'
import {AnimatePresence, motion} from 'motion/react'
import React, {Suspense, useEffect, useRef, useState} from 'react'
import {FaRegSave} from 'react-icons/fa'
import {
	RiErrorWarningFill,
	RiExpandRightFill,
} from 'react-icons/ri'
import {
	TbHistory,
	TbPlug,
	TbSettings,
	TbTool,
	TbPhoto,
	TbShield,
	TbLanguage,
	TbArrowLeft,
	TbChevronRight,
	TbCheck,
	TbBell,
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
	TbChartLine,
	TbMail,
	TbWebhook,
	TbMicrophone,
	TbLogin,
	TbUsers,
	TbUsersGroup,
	TbBrain,
	TbStethoscope,
	TbBrandChrome,
	TbPlayerPlay,
	TbPlayerPause,
	TbDownload,
	TbPower,
	TbClock,
	TbDeviceSdCard,
	TbShieldLock,
	TbShieldCheck,
	TbMessages,
	TbWorld,
	TbNetwork,
	TbLock,
	TbArrowBackUp,
	TbRouter,
	TbBolt,
} from 'react-icons/tb'
import {IconType} from 'react-icons'

import {V42MigrationBanner} from '@/components/banners/v42-migration-banner'
import {Card} from '@/components/ui/card'
import {useCpuForUi} from '@/hooks/use-cpu'
import {useMemoryForUi} from '@/hooks/use-memory'
import {useDiskForUi} from '@/hooks/use-disk'
import {useV42MigrationActive} from '@/hooks/use-v42-migration-active'
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
import {RollbackConfirmModal} from '@/components/rollback-confirm-modal'
import {useRollback} from '@/providers/global-system-state/rollback'
import {CopyableField} from '@/components/ui/copyable-field'
import {PinInput} from '@/components/ui/pin-input'
import {t} from '@/utils/i18n'
import {cn} from '@/shadcn-lib/utils'
import {useIsMobile} from '@/hooks/use-is-mobile'

import {ChangePasswordWarning, ContactSupportLink} from './shared'
import {SettingsInfoCard} from './settings-info-card'
import {SettingsToggleRow} from './settings-toggle-row'
import {SoftwareUpdateListRow} from './software-update-list-row'
import {GpuInstallSection} from './gpu-install-section'
import {OsPatchingSection} from './os-patching-section'
import {NetworkSection} from './network-section'
// Phase 329-10 (NET-04) — managed raw TCP/UDP openings, WSL2-hidden.
import {NetExposeSection} from './net-expose-section'
import {VpnSection} from './vpn-section'
import {UpsStatusSection} from './ups-status-section'
import {PastDeploysTable} from './past-deploys-table'
import {MenuItemBadge} from './menu-item-badge'

// v36 LivOS Design Port — Section-Head + FieldCard pattern (Phases 124, 125).
import {SettingsPageHeader} from '@/components/settings-page-header'
import {FieldCard, FieldRow} from '@/components/field-card'
import {useTheme} from '@/hooks/use-theme'
import type {Theme} from '@/providers/theme-provider'
import {TbSun, TbMoon, TbDeviceDesktop} from 'react-icons/tb'

// DM Pairing / Usage / Gmail / Webhooks / Voice sections removed with AI Chat teardown.
const UsersSectionLazy = React.lazy(() =>
	import('@/routes/settings/users').then((m) => ({default: m.UsersSection})),
)
// Phase 322-02 (IDENT-01) — Settings > Groups admin destination (beside Users).
const GroupsSectionLazy = React.lazy(() =>
	import('@/routes/settings/groups').then((m) => ({default: m.GroupsSection})),
)
// AI-chat-specific settings (memory / ai-config / liv-agent / autonomous-agents /
// ai-chat-settings) removed with the AI Chat teardown.
// Phase 102-07 — Chrome Master Login (D-102-MASTER-LOGIN-UI).
const ChromeMasterLazy = React.lazy(() => import('@/routes/settings/chrome-master'))
// Phase 182-04 — MCP Servers management panel.
const McpServersLazy = React.lazy(() => import('@/routes/settings/mcp-servers'))
// Settings overhaul 2026-06-09 — Power / Date & Time / Storage & Drives / Security & Sessions.
const PowerSectionLazy = React.lazy(() => import('./power-section').then((m) => ({default: m.PowerSection})))
const DateTimeSectionLazy = React.lazy(() => import('./date-time-section').then((m) => ({default: m.DateTimeSection})))
const StorageDrivesSectionLazy = React.lazy(() => import('./storage-section').then((m) => ({default: m.StorageDrivesSection})))
const SecuritySessionsSectionLazy = React.lazy(() => import('./security-sessions-section').then((m) => ({default: m.SecuritySessionsSection})))
// Phase 302 R3 — Settings → Domains (subdomain list + per-user DNS counter).
const DomainsSectionLazy = React.lazy(() => import('./domains-section').then((m) => ({default: m.DomainsSection})))
// Phase 310-04 (ALERT-01) — Settings → Alert Channels (admin-only external alert config).
const AlertChannelsSectionLazy = React.lazy(() => import('./alert-channels-section').then((m) => ({default: m.AlertChannelsSection})))
// Phase 320 (MON-01/MON-02) — Settings → Monitoring (resource history + editable thresholds).
const MonitoringSectionLazy = React.lazy(() => import('./monitoring-section').then((m) => ({default: m.MonitoringSection})))
// Phase 328-05 (SEC-02) — Settings → Security Advisor (Trivy image CVE counts + weak-config findings + remediation).
const SecurityAdvisorSectionLazy = React.lazy(() => import('./security-advisor-section').then((m) => ({default: m.SecurityAdvisorSection})))
// Phase 246-05 — Settings → System section (hosts the v44 "Active terminals"
// admin panel). The panel self-gates via useTerminalPanelEnabled, so when the
// v43 feature flag is OFF the section renders nothing — the surface vanishes
// alongside the dock entry. Appended at the bottom of TroubleshootSection
// (system-group) without removing anything (v36 additive rule).
const SystemSectionLazy = React.lazy(() =>
	import('@/modules/settings/system-section').then((m) => ({default: m.SystemSection})),
)

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SettingsSection =
	| 'home'
	| 'account'
	| 'users'
	| 'groups'
	| 'wallpaper'
	| '2fa'
	| 'chrome-master'
	| 'power'
	| 'date-time'
	| 'storage'
	| 'security-sessions'
	| 'mcp-servers'
	| 'backups'
	| 'migration'
	| 'language'
	| 'troubleshoot'
	| 'advanced'
	| 'software-update'
	| 'domains'
	// Phase 325-08 (NET-01) — host networking (hostname / static IP / DNS), WSL2-hidden.
	| 'network'
	// Phase 329-10 (NET-04) — managed raw TCP/UDP openings, WSL2-hidden.
	| 'net-expose'
	// Phase 325-10 (NET-02) — first-class VPN (guided Tailscale login + MagicDNS fix).
	| 'vpn'
	// Phase 310-04 — external alert channels (Telegram/Discord/Slack/webhook/ntfy).
	| 'alert-channels'
	// Phase 320 — resource-history monitoring + editable alert thresholds.
	| 'monitoring'
	// Phase 328-05 (SEC-02) — security advisor (Trivy image CVEs + weak-config scan results).
	| 'security-advisor'
	// v29.4 Phase 47 Plan 05 — AI Diagnostics admin section.
	| 'diagnostics'

// Phase 182-02 — Group-header sidebar (D-V38-M): 4 visual groups + footer cluster.
type SettingsGroup = 'personal' | 'workspace' | 'system'

interface MenuItem {
	id: SettingsSection
	icon: IconType
	label: string
	description: string
	adminOnly?: boolean
	/** Phase 182-02: which group header this item belongs to */
	group: SettingsGroup
	/** Phase 182-02: true = render in footer cluster below separator, not in main list */
	footer?: boolean
}

const MENU_ITEMS: MenuItem[] = [
	// ── PERSONAL ──────────────────────────────────────────────────────
	{id: 'account',          group: 'personal', icon: TbUser,          label: 'Account',          description: 'Name and password'},
	{id: 'wallpaper',        group: 'personal', icon: TbPhoto,         label: 'Theme',             description: 'Wallpaper & accent color'},
	{id: 'language',         group: 'personal', icon: TbLanguage,      label: 'Language',          description: 'Interface language'},
	{id: '2fa',              group: 'personal', icon: TbShield,        label: '2FA',               description: 'Two-factor authentication'},
	// ── WORKSPACE ─────────────────────────────────────────────────────
	{id: 'mcp-servers',      group: 'workspace', icon: TbPlugConnected, label: 'MCP Servers',      description: 'Manage Model Context Protocol servers',   adminOnly: true},
	// ── SYSTEM ────────────────────────────────────────────────────────
	{id: 'users',            group: 'system', icon: TbUsers,           label: 'Users',             description: 'Manage users & invites',                  adminOnly: true},
	{id: 'groups',           group: 'system', icon: TbUsersGroup,      label: 'Groups',            description: 'Manage groups & membership',              adminOnly: true},
	{id: 'chrome-master',    group: 'system', icon: TbBrandChrome,     label: 'Chrome Profile',    description: 'Master Chrome login for WebApps',         adminOnly: true},
	{id: 'power',            group: 'system', icon: TbPower,           label: 'Power',             description: 'Restart or shut down this device',        adminOnly: true},
	{id: 'date-time',        group: 'system', icon: TbClock,           label: 'Date & Time',       description: 'Time zone & language',                    adminOnly: true},
	{id: 'storage',          group: 'system', icon: TbDeviceSdCard,    label: 'Storage',           description: 'USB drives, network shares & sharing',    adminOnly: true},
	{id: 'security-sessions', group: 'system', icon: TbShieldLock,     label: 'Security & Sessions', description: 'Banned IPs, access & sign-out',         adminOnly: true},
	// RE-ENABLED 2026-07-03 — hidden 2026-06-21 ("ayarlardaki backup çalışmıyor,
	// gizle") until the feature worked. It now does: Kopia repos + restore wizard,
	// plus the backup-completeness work (Postgres DB incl. Liv's memory + Liv AI
	// data folded into the snapshot, and a Settings scope selector). (On desktop
	// this tab also hosts the Migration sub-tab; mobile keeps Migration separate.)
	{id: 'backups',          group: 'system', icon: TbDatabase,        label: 'Backups',           description: 'Backup, restore & migration',             adminOnly: true},
	{id: 'domains', group: 'system', icon: TbWorld, label: 'Domains', description: 'Subdomains & DNS usage', adminOnly: true},
	{id: 'network', group: 'system', icon: TbNetwork, label: 'Network', description: 'Hostname, static IP & DNS', adminOnly: true},
	{id: 'net-expose', group: 'system', icon: TbRouter, label: 'Ports', description: 'Managed TCP/UDP openings', adminOnly: true},
	{id: 'vpn', group: 'system', icon: TbLock, label: 'VPN', description: 'Guided Tailscale VPN & MagicDNS', adminOnly: true},
	{id: 'alert-channels', group: 'system', icon: TbBell, label: 'Alert Channels', description: 'Telegram, Discord, Slack, webhook & ntfy alerts', adminOnly: true},
	{id: 'monitoring', group: 'system', icon: TbChartLine, label: 'Monitoring', description: 'Resource history & alert thresholds', adminOnly: true},
	{id: 'security-advisor', group: 'system', icon: TbShieldCheck, label: 'Security Advisor', description: 'Scan results & remediation guidance', adminOnly: true},
	{id: 'software-update',  group: 'system', icon: TbDownload,        label: 'Software Update',   description: 'Apply updates & view deploy history',     adminOnly: true},
	// ── FOOTER ────────────────────────────────────────────────────────
	{id: 'troubleshoot',     group: 'system', icon: TbTool,            label: 'Troubleshoot',      description: 'Logs & diagnostics',                      adminOnly: true, footer: true},
	{id: 'advanced',         group: 'system', icon: TbSettings,        label: 'Advanced',          description: 'Power-user controls',                     adminOnly: true, footer: true},
]

// Phase 182-02 — Group ordering + labels for sidebar rendering. (AI Chat
// teardown 2026-05-21: 'workspace' kept for MCP Servers only; 'ai' removed.)
const GROUP_ORDER: SettingsGroup[] = ['personal', 'workspace', 'system']
const GROUP_LABELS: Record<SettingsGroup, string> = {
	personal: 'PERSONAL',
	workspace: 'WORKSPACE',
	system: 'SYSTEM',
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

// Phase 224 — Sidebar entries hidden while v42 Liv Assistant migration is
// active. Direct URLs (e.g. /settings/mcp-servers) STILL serve their routes
// for admin recovery (SC-03). Only the discovery sidebar entry is removed.
// Reversible via Redis key `liv:config:liv_v42_migration_active=false`.
// Sacred SHA `f3538e1d` UNCHANGED — this is a sidebar filter, not a route delete.
const V42_HIDDEN_MENU_IDS: ReadonlyArray<SettingsSection> = ['mcp-servers']
// NOTE: `ai-config` / `liv-agent` / `ai-chat-settings` / `autonomous-agents` /
// `integrations` / `gmail` / `dm-pairing` / `usage` / `webhooks` / `voice` /
// `memory` were already removed from MENU_ITEMS in the prior "AI Chat
// teardown" (see comment at line ~105). If any of those (or new AI-shaped
// items) get re-added before Phase 224 flips OFF, add their IDs to this
// array to suppress them while the migration is active.

function useVisibleMenuItems(): MenuItem[] {
	const userQ = trpcReact.user.get.useQuery()
	const role = userQ.data?.role
	// In legacy single-user mode (no role set), treat as admin
	const isAdmin = !role || role === 'admin'
	// Phase 224 — hide AI-shaped entries while Liv Assistant migration is active.
	const v42MigrationActive = useV42MigrationActive()
	return MENU_ITEMS
		.filter((item) => !item.adminOnly || isAdmin)
		.filter((item) => !(v42MigrationActive && V42_HIDDEN_MENU_IDS.includes(item.id)))
}

// IDENT-05 grace-period deep-link: the org-enforcement opener launches the
// Settings window with route '/settings/2fa' so an unenrolled member lands on
// the 2FA enrol screen. Only '2fa' is mapped; every other route opens 'home'
// (the dock/launchpad pass '/settings' → unchanged behaviour).
function initialSectionFromRoute(route?: string): SettingsSection {
	const seg = route?.split('?')[0].split('/').filter(Boolean).pop()
	return seg === '2fa' ? '2fa' : 'home'
}

export function SettingsContent({initialRoute}: {initialRoute?: string} = {}) {
	const [activeSection, setActiveSection] = useState<SettingsSection>(initialSectionFromRoute(initialRoute))
	const visibleItems = useVisibleMenuItems()
	// Phase 224-03 — banner pinned at the top of every SettingsContent return
	// branch (mobile-detail, mobile-home, desktop-detail-redirect, desktop-home)
	// when the Liv Assistant migration is active. Hook is already consumed inside
	// useVisibleMenuItems() — calling it again here is harmless (React Query
	// dedupes by procedure key, no extra network call).
	const v42MigrationActive = useV42MigrationActive()
	const isMobile = useIsMobile()

	// Mobile: drill-down detail view (no sidebar)
	if (isMobile && activeSection !== 'home') {
		const menuItem = visibleItems.find((m) => m.id === activeSection)
		return (
			<div className='animate-in fade-in'>
				{v42MigrationActive && <V42MigrationBanner context='settings' />}
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
				{v42MigrationActive && <V42MigrationBanner context='settings' />}
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
				{v42MigrationActive && <V42MigrationBanner context='settings' />}
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
	// Phase 182-02 — grouped menu + footer cluster
	const mainItems = visibleItems.filter((item) => !item.footer)
	const footerItems = visibleItems.filter((item) => item.footer)
	const grouped = GROUP_ORDER
		.map((g) => ({group: g, label: GROUP_LABELS[g], items: mainItems.filter((item) => item.group === g)}))
		.filter((g) => g.items.length > 0)

	return (
		<div className='animate-in fade-in'>
			{v42MigrationActive && <V42MigrationBanner context='settings' />}
			<div className='grid w-full gap-x-[30px] gap-y-[20px] lg:grid-cols-[280px_auto]'>
				{/* Left Sidebar - Menu */}
				<div className='flex flex-col gap-3'>
					{/* Grouped Menu Items with footer cluster */}
					<Card className='!p-2'>
						<div data-testid='settings-grouped-menu'>
							{grouped.map(({group, label, items}) => (
								<div key={group}>
									<div
										data-testid={`settings-group-header-${group}`}
										className='px-3 pt-4 pb-1 text-[10px] uppercase tracking-widest text-white/30 font-semibold select-none'
									>
										{label}
									</div>
									{items.map((item, i) => (
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
							))}

							{/* Footer cluster — power-user items (Advanced + Troubleshoot) */}
							{footerItems.length > 0 && (
								<div data-testid='settings-footer-cluster' className='mt-2 border-t border-white/10 pt-1'>
									{footerItems.map((item) => (
										<button
											key={item.id}
											onClick={() => setActiveSection(item.id)}
											className='relative flex w-full items-center gap-2 rounded-radius-sm px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-2'
										>
											<item.icon className='h-3.5 w-3.5 text-text-tertiary' />
											<span className='text-text-tertiary'>{item.label}</span>
											<MenuItemBadge itemId={item.id} activeSection={activeSection} />
										</button>
									))}
								</div>
							)}
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
						{/* Phase 182-02 — grouped sidebar in detail view */}
						<div>
							{GROUP_ORDER.map((g) => {
								const items = visibleItems.filter((item) => !item.footer && item.group === g)
								if (items.length === 0) return null
								return (
									<div key={g}>
										<div className='px-3 pt-3 pb-0.5 text-[10px] uppercase tracking-widest text-white/30 font-semibold select-none'>
											{GROUP_LABELS[g]}
										</div>
										{items.map((item) => (
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
								)
							})}
							{/* Footer cluster items in detail view */}
							{visibleItems.filter((item) => item.footer).length > 0 && (
								<div className='mt-1 border-t border-white/10 pt-1'>
									{visibleItems.filter((item) => item.footer).map((item) => (
										<button
											key={item.id}
											onClick={() => onNavigate(item.id)}
											className='relative flex w-full items-center gap-2 rounded-radius-sm px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-2'
										>
											{item.id === section && (
												<motion.div
													layoutId='settings-sidebar-active'
													className='absolute inset-0 rounded-radius-sm bg-surface-3'
													transition={{type: 'spring', bounce: 0.15, duration: 0.4}}
												/>
											)}
											<item.icon className={cn('relative z-10 h-3.5 w-3.5', item.id === section ? 'text-text-secondary' : 'text-text-tertiary')} />
											<span className={cn('relative z-10', item.id === section ? 'text-text-secondary' : 'text-text-tertiary')}>{item.label}</span>
											<MenuItemBadge itemId={item.id} activeSection={section} />
										</button>
									))}
								</div>
							)}
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
		case 'groups':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><GroupsSectionLazy /></Suspense>
		case 'wallpaper':
			return <WallpaperSection />
		case '2fa':
			return <TwoFaSection />
		case 'chrome-master':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><ChromeMasterLazy /></Suspense>
		case 'power':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><PowerSectionLazy /></Suspense>
		case 'date-time':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><DateTimeSectionLazy /></Suspense>
		case 'storage':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><StorageDrivesSectionLazy /></Suspense>
		case 'security-sessions':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><SecuritySessionsSectionLazy /></Suspense>
		case 'mcp-servers':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><McpServersLazy /></Suspense>
		// ai-config / liv-agent / ai-chat-settings / autonomous-agents / integrations
		// / gmail / dm-pairing / usage / webhooks / voice / memory cases removed
		// with the AI Chat teardown.
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
		case 'domains':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><DomainsSectionLazy /></Suspense>
		case 'network':
			return <NetworkSection />
		case 'net-expose':
			return <NetExposeSection />
		case 'vpn':
			return <VpnSection />
		case 'alert-channels':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><AlertChannelsSectionLazy /></Suspense>
		case 'monitoring':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><MonitoringSectionLazy /></Suspense>
		case 'security-advisor':
			return <Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}><SecurityAdvisorSectionLazy /></Suspense>
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

	// Phase 306 R2 — desktop user OS/sudo password. The card never loads the
	// plaintext; reveal + regenerate are 2FA step-up actions.
	const utils = trpcReact.useUtils()
	const desktopInfoQ = trpcReact.system.getDesktopUserInfo.useQuery(undefined, {retry: false})
	const desktopTwoFaQ = trpcReact.user.is2faEnabled.useQuery()
	const twoFaOn = desktopTwoFaQ.data === true
	const [revealedDesktopPw, setRevealedDesktopPw] = useState<string | null>(null)
	const [desktopVerifyIntent, setDesktopVerifyIntent] = useState<null | 'reveal' | 'regenerate'>(null)
	const revealDesktopPwMut = trpcReact.system.revealDesktopPassword.useMutation()
	const regenerateDesktopPwMut = trpcReact.system.regenerateDesktopPassword.useMutation()

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

			{/* Phase 306 R2 — desktop user OS/sudo password (terminal + SSH login) */}
			<SettingsPageHeader
				eyebrow='02 · System access'
				title='Desktop &'
				titleAccent='sudo password.'
				sub='The Linux account password for this device — for sudo in the terminal or SSH login. Revealing or regenerating it requires two-factor authentication.'
			/>

			<FieldCard>
				<FieldRow
					label='User'
					value={
						desktopInfoQ.data?.username
							? <span className='truncate font-mono'>{desktopInfoQ.data.username}</span>
							: <span className='text-[color:var(--fg-faint)]'>—</span>
					}
				/>
				<FieldRow
					label='Password'
					value={
						revealedDesktopPw
							? <CopyableField value={revealedDesktopPw} narrow className='max-w-[280px]' />
							: desktopInfoQ.data?.hasPassword
								? <span className='font-mono tracking-[0.2em] text-[color:var(--fg-mute)]'>••••••••••••</span>
								: <span className='text-[color:var(--fg-faint)]'>Not set yet</span>
					}
					trailing={
						<div className='flex items-center gap-2'>
							{revealedDesktopPw ? (
								<Button variant='v36-ghost' size='v36-pill-sm' onClick={() => setRevealedDesktopPw(null)}>
									Hide
								</Button>
							) : desktopInfoQ.data?.hasPassword ? (
								<Button
									variant='v36-ghost'
									size='v36-pill-sm'
									disabled={!twoFaOn}
									onClick={() => setDesktopVerifyIntent('reveal')}
								>
									Reveal
								</Button>
							) : null}
							<Button
								variant='v36-ghost'
								size='v36-pill-sm'
								disabled={!twoFaOn}
								onClick={() => setDesktopVerifyIntent('regenerate')}
							>
								Regenerate
							</Button>
						</div>
					}
				/>
			</FieldCard>
			{!twoFaOn ? (
				<p className='text-13 text-[color:var(--fg-faint)]'>
					Enable two-factor authentication in Settings → 2FA to reveal or regenerate the sudo password.
				</p>
			) : null}

			<DesktopPasswordVerifyDialog
				intent={desktopVerifyIntent}
				error={(regenerateDesktopPwMut.error || revealDesktopPwMut.error)?.message ?? null}
				onOpenChange={(open) => {
					if (!open) {
						setDesktopVerifyIntent(null)
						revealDesktopPwMut.reset()
						regenerateDesktopPwMut.reset()
					}
				}}
				onVerify={async (code) => {
					try {
						if (desktopVerifyIntent === 'regenerate') {
							const r = await regenerateDesktopPwMut.mutateAsync({totp: code})
							if (!r?.password) return false
							setRevealedDesktopPw(r.password)
							utils.system.getDesktopUserInfo.invalidate()
						} else {
							const r = await revealDesktopPwMut.mutateAsync({totp: code})
							if (!r?.password) return false
							setRevealedDesktopPw(r.password)
						}
						setTimeout(() => setDesktopVerifyIntent(null), 500)
						return true
					} catch {
						return false
					}
				}}
			/>

			<InlineChangeNameDialog open={showChangeName} onOpenChange={setShowChangeName} />
			<InlineChangePasswordDialog open={showChangePassword} onOpenChange={setShowChangePassword} />
		</div>
	)
}

// Phase 306 R2 — step-up 2FA dialog for revealing/regenerating the sudo password.
// PinInput auto-submits on fill → onVerify; on success the parent closes it.
function DesktopPasswordVerifyDialog({
	intent,
	error,
	onOpenChange,
	onVerify,
}: {
	intent: null | 'reveal' | 'regenerate'
	error: string | null
	onOpenChange: (open: boolean) => void
	onVerify: (code: string) => Promise<boolean>
}) {
	const open = intent !== null
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogPortal>
				<DialogContent className='flex flex-col items-center gap-5'>
					<DialogHeader>
						<DialogTitle>
							{intent === 'regenerate' ? 'Regenerate sudo password' : 'Reveal sudo password'}
						</DialogTitle>
					</DialogHeader>
					<p className='text-body-sm text-text-secondary text-center'>
						Enter your six-digit two-factor code to{' '}
						{intent === 'regenerate' ? 'generate a new desktop password' : 'reveal the desktop password'}.
					</p>
					{open ? <PinInput autoFocus length={6} onCodeCheck={onVerify} /> : null}
					{error ? <p className='text-13 text-red-400 text-center'>{error}</p> : null}
				</DialogContent>
			</DialogPortal>
		</Dialog>
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
	// WR-04 (anti-lockout): true while the one-time recovery codes are on screen.
	// Reported by TwoFactorEnableInline so we hide the "Back to 2FA" escape hatch —
	// the codes must not be discarded unseen before the user acknowledges them.
	const [recoveryVisible, setRecoveryVisible] = useState(false)

	const leaveSetup = () => {
		setRecoveryVisible(false)
		setShowSetup(false)
	}

	// Show inline 2FA setup/disable
	if (showSetup) {
		return (
			<div className='space-y-4'>
				{recoveryVisible ? null : (
					<button
						onClick={leaveSetup}
						className='flex items-center gap-2 text-body-sm text-text-secondary hover:text-text-primary'
					>
						<TbArrowLeft className='h-4 w-4' />
						Back to 2FA
					</button>
				)}
				<Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}>
					{is2faEnabledQ.data ? (
						<TwoFactorDisableInline onComplete={leaveSetup} />
					) : (
						<TwoFactorEnableInline onComplete={leaveSetup} onRecoveryVisibleChange={setRecoveryVisible} />
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
					{is2faEnabledQ.data ? 'Disable' : 'Enable'}
				</IconButton>
			</div>
		</div>
	)
}

// AI Configuration / Integrations / Gmail / DM Pairing / Usage /
// Webhooks / Voice sections removed with the AI Chat teardown.


// ─────────────────────────────────────────────────────────────────────────────
// Other Sections (Simplified)
// ─────────────────────────────────────────────────────────────────────────────

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

	// Backups-v2 P0: live kopia engine preflight — if the engine is missing or
	// outdated NOTHING can back up, and that must be loud, not silent.
	const engineStatusQuery = trpcReact.backups.engineStatus.useQuery(undefined, {staleTime: 30_000})
	const engineUnavailable = engineStatusQuery.data ? !engineStatusQuery.data.available : false

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
			{/* Backups-v2 P0: engine unavailable = RED, never silent */}
			{engineUnavailable && (
				<div className='rounded-radius-md border border-red-500/30 bg-red-500/10 p-4'>
					<div className='flex items-center gap-3'>
						<div className='flex h-10 w-10 items-center justify-center rounded-radius-sm bg-red-500/20'>
							<RiErrorWarningFill className='h-5 w-5 text-red-400' />
						</div>
						<div className='flex-1'>
							<div className='text-body font-medium text-red-400'>Backup engine unavailable</div>
							<div className='text-caption text-text-secondary'>
								{engineStatusQuery.data?.reason === 'outdated'
									? `The backup engine (kopia ${engineStatusQuery.data?.version}) is older than the required ${engineStatusQuery.data?.minimumVersion}. Update LivOS to fix this.`
									: 'The backup engine (kopia) is not installed on this device. Update LivOS to fix this — no backups can run until then.'}
							</div>
						</div>
					</div>
				</div>
			)}

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
// home for debugging surfaces. Phase 130-03 re-promoted software-update
// and advanced to their own top-level sidebar rows per user request, so
// Troubleshoot collapses back to two tabs:
//   Logs (system + app)
//   Diagnostics (AI capability registry / model identity / app health)
function TroubleshootSection() {
	const [activeTab, setActiveTab] = useState<'logs' | 'diagnostics'>('logs')

	return (
		<div>
			<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'logs' | 'diagnostics')}>
				<TabsList className='grid w-full grid-cols-2 mb-4'>
					<TabsTrigger value='logs' className='flex items-center gap-1.5'>
						<TbTool className='h-4 w-4' />
						Logs
					</TabsTrigger>
					<TabsTrigger value='diagnostics' className='flex items-center gap-1.5'>
						<TbStethoscope className='h-4 w-4' />
						Diagnostics
					</TabsTrigger>
				</TabsList>

				<TabsContent value='logs'><LogsPanel /></TabsContent>
				<TabsContent value='diagnostics'>
					<Suspense fallback={<div className='flex items-center justify-center py-8'><Loader2 className='size-5 animate-spin text-text-tertiary' /></div>}>
						<DiagnosticsSectionLazy />
					</Suspense>
				</TabsContent>
			</Tabs>

			{/* Phase 246-05 — Active terminals admin panel. Self-gated by the
			    v43 feature flag (livos:v43:terminal_panel). When OFF, the
			    SystemSection renders nothing — no visual delta. */}
			<div className='mt-6 border-t border-line pt-6'>
				<Suspense fallback={null}>
					<SystemSectionLazy />
				</Suspense>
			</div>
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
						<div className='max-h-[200px] overflow-auto rounded-radius-sm bg-[color:var(--surface-1)] dark:bg-zinc-900/60 p-3'>
							<pre className='whitespace-pre-wrap break-all font-mono text-caption-sm text-text-secondary'>
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
							<div className='max-h-[200px] overflow-auto rounded-radius-sm bg-[color:var(--surface-1)] dark:bg-zinc-900/60 p-3'>
								<pre className='whitespace-pre-wrap break-all font-mono text-caption-sm text-text-secondary'>
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
							<pre className='whitespace-pre-wrap break-all font-mono text-caption text-text-secondary'>
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

	// Restore open windows on reload (Phase 305 R10)
	const restoreWindowsQ = trpcReact.system.isRestoreWindows.useQuery()
	const restoreWindowsMut = trpcReact.system.setRestoreWindows.useMutation({
		onSuccess: () => restoreWindowsQ.refetch(),
	})
	const isRestoreWindows = restoreWindowsQ.data !== false // default ON (undefined/true → on)
	const isRestoreWindowsLoading = restoreWindowsMut.isPending || restoreWindowsQ.isLoading

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

			{/* Restore open windows on reload (Phase 305 R10) */}
			<SettingsToggleRow
				title='Restore open windows on reload'
				description='Reopen your pinned windows after a page refresh or a system update. Turn off to start with a clean desktop each time.'
				checked={isRestoreWindows}
				onCheckedChange={(checked) => restoreWindowsMut.mutate(checked)}
				disabled={isRestoreWindowsLoading}
			/>

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
	// Phase 311 UPDSAFE-04 — canRollback gates the rollback affordance entirely:
	// a box that never completed an update has no last-good snapshot and must not
	// be offered a button that would fail (RESEARCH A.2). Hidden while loading and
	// when data.available !== true. This section is already admin-gated at the menu
	// level (adminOnly) AND the mutation is adminProcedure — the client gate here
	// is defense-in-depth, not the authorization boundary.
	const rollbackTarget = trpcReact.system.canRollback.useQuery()
	const [rollbackOpen, setRollbackOpen] = useState(false)
	const {rollback, isPending: rollbackPending} = useRollback({
		onSuccess: () => setRollbackOpen(false),
	})
	const canRollback = rollbackTarget.data?.available === true

	return (
		<div className='space-y-4'>
			<p className='text-body-sm text-text-secondary'>Check for LivOS updates.</p>
			<SoftwareUpdateListRow isActive={false} />
			{/* Phase 330-03 (GPU-04, D-1) — guided vendor/WSL2-appropriate GPU
			    install lives here, in Software Update. Renders nothing on non-GPU
			    boxes; admin-gated. Shares one component with the app-settings
			    gpu-access dialog so the two never drift. */}
			<GpuInstallSection />
			{/* Phase 326-07 (OS-01) — unattended-upgrades (host apt security
			    updates) managed from the UI, sibling to the GPU install card
			    (D-13). Admin-gated; degrades to a note where the wrapper is
			    not yet deployed. */}
			<OsPatchingSection />
			{/* Phase 326-08 (HW-01) — NUT UPS status/config, sibling to the
			    OS-patch + GPU cards (D-13). Admin-gated; renders a "no UPS"
			    state on boxes with no UPS attached / wrapper not deployed. */}
			<UpsStatusSection />
			<div className='mt-6 flex flex-col gap-3'>
				<h3 className='text-body font-medium'>Past Deploys</h3>
				{/* Phase 130-03 — cap height so the table doesn't push the page
				    height unboundedly when deploy history grows. Internal scroll
				    keeps the column headers visible. */}
				<div className='max-h-[400px] overflow-y-auto rounded-[var(--r-md)] border border-line bg-[color:var(--bg)]'>
					<PastDeploysTable />
				</div>
			</div>

			{/* Phase 311 UPDSAFE-04 — manual rollback to last-good. Destructive
			    styling mirrors the Factory-Reset row (AdvancedSection); a plain
			    IconButton (not a link) opens the confirm modal — this is an
			    in-place mutation, not navigation. */}
			{canRollback && (
				<>
					<div className='flex items-center justify-between rounded-radius-md border border-accent-red/20 bg-accent-red/5 p-4'>
						<div>
							<div className='text-body font-medium text-accent-red'>
								{t('software-update.rollback.button')}
							</div>
							<div className='text-caption text-text-secondary'>
								{t('software-update.rollback.description')}
							</div>
						</div>
						<IconButton
							icon={TbArrowBackUp}
							text='destructive'
							onClick={() => setRollbackOpen(true)}
							data-testid='rollback-to-last-good-button'
						>
							{t('software-update.rollback.button')}
						</IconButton>
					</div>
					<RollbackConfirmModal
						open={rollbackOpen}
						onOpenChange={setRollbackOpen}
						target={rollbackTarget.data ?? null}
						rollback={rollback}
						rollbackPending={rollbackPending}
					/>
				</>
			)}
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
