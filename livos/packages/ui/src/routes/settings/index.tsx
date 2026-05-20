import React, {Suspense, useState} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {Route, Routes} from 'react-router-dom'
import {keys} from 'remeda'
import {arrayIncludes} from 'ts-extras'

import {CoverMessage, CoverMessageParagraph} from '@/components/ui/cover-message'
import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {Loading} from '@/components/ui/loading'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {useQueryParams} from '@/hooks/use-query-params'
import {TwoFactorDialog} from '@/routes/settings/2fa'
import AdvancedSettingsDrawerOrDialog from '@/routes/settings/advanced'
import {SoftwareUpdateConfirmDialog} from '@/routes/settings/software-update-confirm'
import {Button} from '@/shadcn-components/ui/button'
import {SheetHeader, SheetTitle} from '@/shadcn-components/ui/sheet'
import {t} from '@/utils/i18n'
import {IS_ANDROID} from '@/utils/misc'

// import {SettingsContent} from './_components/settings-content'
const SettingsContent = React.lazy(() =>
	import('./_components/settings-content').then((m) => ({default: m.SettingsContent})),
)
const SettingsContentMobile = React.lazy(() =>
	import('./_components/settings-content-mobile').then((m) => ({default: m.SettingsContentMobile})),
)

const AppStorePreferencesDialog = React.lazy(() => import('@/routes/settings/app-store-preferences'))
const ChangeNameDialog = React.lazy(() => import('@/routes/settings/change-name'))
const ChangePasswordDialog = React.lazy(() => import('@/routes/settings/change-password'))
const RestartDialog = React.lazy(() => import('@/routes/settings/restart'))
const ShutdownDialog = React.lazy(() => import('@/routes/settings/shutdown'))
const TroubleshootDialog = React.lazy(() => import('@/routes/settings/troubleshoot/index'))
const TerminalDialog = React.lazy(() => import('@/routes/settings/terminal/index'))
const DeviceInfoDialog = React.lazy(() => import('@/routes/settings/device-info'))
const BackupsRestoreDialog = React.lazy(() => import('@/features/backups/index'))

// New settings pages (no popup dialogs)
const AiConfigPage = React.lazy(() => import('@/routes/settings/ai-config'))
const IntegrationsPage = React.lazy(() => import('@/routes/settings/integrations'))
const DomainSetupPage = React.lazy(() => import('@/routes/settings/domain-setup'))
const DmPairingPage = React.lazy(() => import('@/routes/settings/dm-pairing'))
// Phase 76 / Plan 06 (MARKET-07) — Liv Agent thin settings page (D-12 — re-uses /subagents + links to /agent-marketplace).
const LivAgentSettings = React.lazy(() => import('@/routes/settings/liv-agent'))
// Phase 102-07 — Chrome Master Login settings page (D-102-MASTER-LOGIN-UI).
const ChromeMasterPage = React.lazy(() => import('@/routes/settings/chrome-master'))
// Phase 104 plan 104-05 — Local Access enrollment wizard (AC-104-9, AC-104-10).
const LocalAccessPage = React.lazy(() => import('@/routes/settings/local-access'))
// Phase 182-03 — AI Chat settings (CC PTY config, 7 form fields).
const AiChatSettingsPage = React.lazy(() => import('@/routes/settings/ai-chat-settings'))
// Phase 182-04 — MCP Servers settings page (presentational + REST /api/mcp/*).
const McpServersPage = React.lazy(() => import('@/routes/settings/mcp-servers'))

// SettingsHome launcher removed 2026-05-15: user rejected — "/settings burasi
// neden var mk ben istemiyorum". LivOS is window-based — no URL launcher
// page at /settings root.

// drawers
const StartMigrationDrawerOrDialog = React.lazy(() =>
	import('@/routes/settings/mobile/start-migration-drawer-or-dialog').then((m) => ({
		default: m.StartMigrationDrawerOrDialog,
	})),
)
const AccountDrawer = React.lazy(() =>
	import('@/routes/settings/mobile/account').then((m) => ({default: m.AccountDrawer})),
)
const WallpaperDrawer = React.lazy(() =>
	import('@/routes/settings/mobile/wallpaper').then((m) => ({default: m.WallpaperDrawer})),
)
const LanguageDrawer = React.lazy(() =>
	import('@/routes/settings/mobile/language').then((m) => ({default: m.LanguageDrawer})),
)
const TorDrawer = React.lazy(() => import('@/routes/settings/mobile/tor').then((m) => ({default: m.TorDrawer})))
const AppStorePreferencesDrawer = React.lazy(() =>
	import('@/routes/settings/mobile/app-store-preferences').then((m) => ({
		default: m.AppStorePreferencesDrawer,
	})),
)
const DeviceInfoDrawer = React.lazy(() =>
	import('@/routes/settings/mobile/device-info').then((m) => ({default: m.DeviceInfoDrawer})),
)
const BackupsMobileDrawer = React.lazy(() =>
	import('@/routes/settings/mobile/backups-mobile-drawer').then((m) => ({default: m.BackupsMobileDrawer})),
)
const SoftwareUpdateDrawer = React.lazy(() =>
	import('@/routes/settings/mobile/software-update').then((m) => ({default: m.SoftwareUpdateDrawer})),
)

const routeToDialogDesktop = {
	'app-store-preferences': AppStorePreferencesDialog,
	restart: RestartDialog,
	shutdown: ShutdownDialog,
	// Allow drawers in desktop in case someone opens a link to a drawer
} as const satisfies Record<string, React.ComponentType>

const dialogKeys = keys.strict(routeToDialogDesktop)

export type SettingsDialogKey = keyof typeof routeToDialogDesktop

const routeToDialogMobile: Record<string, React.ComponentType> = {
	'app-store-preferences': AppStorePreferencesDrawer,
	restart: RestartDialog,
	shutdown: ShutdownDialog,
} as const satisfies Record<SettingsDialogKey, React.ComponentType>

function QueryStringDialog() {
	const isMobile = useIsMobile() && !IS_ANDROID
	const routeToDialog = isMobile ? routeToDialogMobile : routeToDialogDesktop

	const {params} = useQueryParams()
	const dialog = params.get('dialog')

	// Prevent breaking if there's a dialog that is rendered somewhere else and not in this map ("logout", for example)
	const has = dialog && arrayIncludes(dialogKeys, dialog)
	const Component = has && dialog ? routeToDialog[dialog] : () => null

	return <Component />
}

export function Settings() {
	const title = t('settings')

	const isMobile = useIsMobile() && !IS_ANDROID

	return (
		<>
			<SheetHeader className='px-2.5'>
				<SheetTitle className='leading-none'>{title}</SheetTitle>
			</SheetHeader>
			<ErrorBoundary FallbackComponent={ErrorBoundaryCardFallback}>
				{/* v36 LivOS Design Port — sidebar SettingsContent removed per
				    user request (2026-05-15: "pencere bazli devam edelim").
				    Each settings sub-route now opens directly as a window with
				    no sidebar wrapper, eliminating the duplicate-header issue.
				    Mobile still gets the SettingsContentMobile drawer. */}
				{isMobile && <SettingsContentMobile />}
				<Suspense>
					<Routes>
						<Route path='/2fa' Component={TwoFactorDialog} />
						<Route path='/device-info' Component={isMobile ? DeviceInfoDrawer : DeviceInfoDialog} />
						{!isMobile && <Route path='/account/change-name' Component={ChangeNameDialog} />}
						{!isMobile && <Route path='/account/change-password' Component={ChangePasswordDialog} />}
						{/* Fall-through `/account` to here. If going to account, always show drawer, even if on desktop */}
						{<Route path='/account/:accountTab' Component={AccountDrawer} />}
						{isMobile && <Route path='/wallpaper' Component={WallpaperDrawer} />}
						{/* Backup: mobile drawer (/backups) opens first on mobile to give same options as desktop */}
						{isMobile && <Route path='/backups' Component={BackupsMobileDrawer} />}
						<Route path='/backups/*' Component={BackupsRestoreDialog} />
						{/* Not choosing based on `isMobile` because we don't want the dialog state to get reset if you resize the browser window. But also we want the same `/settings/migration-assistant` path for the first dialog/drawer you see */}
						<Route path='/migration-assistant' Component={StartMigrationDrawerOrDialog} />
						{isMobile && <Route path='/language' Component={LanguageDrawer} />}
						<Route path='/troubleshoot/*' Component={TroubleshootDialog} />
						<Route path='/terminal/*' Component={TerminalDialog} />
						{isMobile && <Route path='/software-update' Component={SoftwareUpdateDrawer} />}
						<Route path='/software-update/confirm' Component={SoftwareUpdateConfirmDialog} />
						<Route path='/advanced/:advancedSelection?' Component={AdvancedSettingsDrawerOrDialog} />
						{/* New settings pages - embedded, no popups */}
						<Route path='/ai-config' Component={AiConfigPage} />
						<Route path='/liv-agent' Component={LivAgentSettings} />
						<Route path='/integrations' Component={IntegrationsPage} />
						<Route path='/domain-setup' Component={DomainSetupPage} />
						<Route path='/dm-pairing' Component={DmPairingPage} />
						<Route path='/chrome-master' Component={ChromeMasterPage} />
						<Route path='/local-access' Component={LocalAccessPage} />
						{/* Phase 182 — new settings panels */}
						<Route path='/ai-chat-settings' Component={AiChatSettingsPage} />
						<Route path='/mcp-servers' Component={McpServersPage} />
					</Routes>
					<QueryStringDialog />
				</Suspense>
			</ErrorBoundary>
		</>
	)
}

export function CoverTest() {
	const [showCover, setShowCover] = useState(false)

	return (
		<>
			<Button onClick={() => setShowCover(true)}>Show cover</Button>
			{showCover && (
				<CoverMessage onClick={() => setShowCover(false)}>
					<Loading>{t('shut-down.shutting-down')}</Loading>
					<CoverMessageParagraph>{t('shut-down.shutting-down-message')}</CoverMessageParagraph>
				</CoverMessage>
			)}
		</>
	)
}
