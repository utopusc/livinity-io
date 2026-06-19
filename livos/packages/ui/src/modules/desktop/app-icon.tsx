import {motion} from 'framer-motion'
import {useEffect, useRef, useState} from 'react'
import {FaRegPlayCircle} from 'react-icons/fa'
import {FaRegCirclePause} from 'react-icons/fa6'
import {Link, useNavigate} from 'react-router-dom'
import {arrayIncludes} from 'ts-extras'

import {LauncherIcon} from '@/components/launcher-icon'
import {useAppInstall} from '@/hooks/use-app-install'
import {useAppOpenReady} from '@/hooks/use-app-open-ready'
import {useLaunchApp} from '@/hooks/use-launch-app'
import {LIVINITY_APP_STORE_ID} from '@/modules/app-store/constants'
import {getAppStoreAppFromInstalledApp} from '@/modules/app-store/utils'
import {systemAppsKeyed, useUserApp} from '@/providers/apps'
import {useWindowManagerOptional} from '@/providers/window-manager'
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger} from '@/shadcn-components/ui/context-menu'
import {contextMenuClasses} from '@/shadcn-components/ui/shared/menu'
import {cn} from '@/shadcn-lib/utils'
import {AppStateOrLoading, progressBarStates, progressStates} from '@/trpc/trpc'
import {useLinkToDialog} from '@/utils/dialog'
import {t} from '@/utils/i18n'
import {appToUrl, assertUnreachable} from '@/utils/misc'

import {useCurrentUser} from '@/hooks/use-current-user'

import {ShareAppDialog} from './share-app-dialog'
import {UninstallConfirmationDialog} from './uninstall-confirmation-dialog'
import {UninstallTheseFirstDialog} from './uninstall-these-first-dialog'
import {useDockPins} from './use-dock-pins'

export const APP_ICON_PLACEHOLDER_SRC = '/figma-exports/app-icon-placeholder.svg'

export function AppIcon({
	label,
	src,
	onClick,
	state = 'ready',
	progress,
}: {
	label: string
	src: string
	onClick?: () => void
	state?: AppStateOrLoading
	progress?: number
}) {
	const inProgress = arrayIncludes(progressStates, state)
	const isStopped = state === 'stopped'

	const appIcon = (
		<motion.button
			onClick={onClick}
			className={cn(
				'group flex h-[var(--app-h)] w-[var(--app-w)] flex-col items-center gap-2.5 py-3 focus:outline-none',
			)}
			layout
			initial={{
				opacity: 1,
				scale: 0.8,
			}}
			animate={{
				opacity: 1,
				scale: 1,
			}}
			exit={{
				opacity: 0,
				scale: 0.5,
			}}
			transition={{
				type: 'spring',
				stiffness: 500,
				damping: 30,
			}}
		>
			{/* Icon-tile Phase 2 (2026-06-11, operator-picked C2 "Frameless
			    Frost" in /icon-lab): the legacy translucent bg-neutral-100/60
			    backdrop-blur chrome is replaced by LauncherIcon — full-bleed
			    icons cover the tile (appear exactly as themselves), transparent
			    logos sit at 80% on a frameless frosted squircle. Hover/progress
			    /stopped chrome unchanged. */}
			<div
				className={cn(
					'relative aspect-square w-12 shrink-0 overflow-hidden rounded-xl shadow-sm transition-all duration-300 group-hover:scale-105 group-hover:shadow-[0_0_16px_rgba(255,255,255,0.5)] group-hover:ring-2 group-hover:ring-white/60 group-focus-visible:ring-2 group-focus-visible:ring-white/60 group-active:scale-95 group-data-[state=open]:ring-2 group-data-[state=open]:ring-white/60 md:w-16 md:rounded-2xl',
				)}
			>
				<LauncherIcon src={src} imgClassName={cn((inProgress || isStopped) && 'brightness-50')} />
				{inProgress && (
					<div className='absolute inset-0 flex items-center justify-center'>
						<div className='relative h-1.5 w-[75%] overflow-hidden rounded-full bg-white/30'>
							{arrayIncludes(progressBarStates, state) ? (
								<div
									className='absolute inset-0 w-0 rounded-full bg-text-primary transition-[width] delay-200 duration-700 animate-in slide-in-from-left-full fill-mode-both'
									style={{width: `${progress}%`}}
								/>
							) : (
								<div className='absolute inset-0 w-[30%] animate-sliding-loader rounded-full bg-text-primary' />
							)}
						</div>
					</div>
				)}
				{isStopped && (
					<div className='absolute inset-0 flex items-center justify-center'>
						<FaRegCirclePause className='h-6 w-6 text-text-primary group-hover:hidden md:h-8 md:w-8' />
						<FaRegPlayCircle className='hidden h-6 w-6 text-text-primary group-hover:block md:h-8 md:w-8' />
					</div>
				)}
			</div>
			{/* v36 light-mode pass 2026-05-15: keep the label text white but
			    layer drop-shadows for a darker halo so the label stays legible
			    against bright wallpapers as well as dark ones. */}
			<div
				className='max-w-full text-[11px] font-medium leading-normal text-white md:text-[12px]'
				style={{
					filter:
						'drop-shadow(0 0 3px rgba(0,0,0,0.85)) drop-shadow(0 1px 2px rgba(0,0,0,0.95))',
				}}
			>
				<div className='truncate'>
					<AppLabel state={state} label={label} />
				</div>
			</div>
		</motion.button>
	)

	return appIcon
}

export function AppLabel({state, label = ''}: {state: AppStateOrLoading; label?: string}) {
	switch (state) {
		case 'not-installed':
			return t('app.installing')
		case 'installing':
			return label
		case 'ready':
			return label
		case 'running':
			return label
		case 'starting':
			return t('app.starting') + '...'
		case 'restarting':
			return t('app.restarting') + '...'
		case 'stopping':
			return t('app.stopping') + '...'
		case 'uninstalling':
			return t('app.uninstalling') + '...'
		case 'updating':
			return t('app.updating') + '...'
		case 'loading':
			return label
		case 'stopped':
			return label
		case 'unknown':
			return t('app.offline')
	}
	return assertUnreachable(state)
}

export function AppIconConnected({appId}: {appId: string}) {
	const navigate = useNavigate()
	const userApp = useUserApp(appId)
	const appInstall = useAppInstall(appId)
	const [openDepsDialog, setOpenDepsDialog] = useState(false)
	const [toUninstallFirstIds, setToUninstallFirstIds] = useState<string[]>([])
	const [showUninstallDialog, setShowUninstallDialog] = useState(false)
	const [showShareDialog, setShowShareDialog] = useState(false)
	const launchApp = useLaunchApp()
	const linkToDialog = useLinkToDialog()
	const {isAdmin} = useCurrentUser()
	// Dock+Launchpad Phase 4 — pin/unpin this app from the desktop context menu.
	const {isPinned, pin, unpin} = useDockPins()
	const pinnedInDock = isPinned('app', appId)

	// Phase 287 verify-live gate. This is a DERIVED presentational concept — it is
	// NEVER a new AppState union member (the AppLabel switch below ends in
	// assertUnreachable; widening the union would force a switch change and risk
	// the tsc=305 baseline). When the backend reports the app up (ready/running)
	// but the operator's OWN resolver has not yet confirmed the per-app host
	// resolves, openReady.phase is 'provisioning'/'rechecking' and we render a
	// "Hazırlanıyor…" overlay + suppress the launch so no DNS query is formed for
	// an unconfirmed host.
	const openReady = useAppOpenReady(appId)
	const isOpenReady = openReady.phase === 'ready'
	// Honest already-poisoned handling: if we stay un-ready past this budget, the
	// operator's resolver likely negative-cached before propagation (UNFIXABLE
	// server-side). After the budget we surface the non-blocking flushdns hint +
	// an "Open anyway" escape. Never spin forever.
	const STUCK_BUDGET_MS = 20000
	const [stuck, setStuck] = useState(false)
	const [showProvisioning, setShowProvisioning] = useState(false)
	const stuckTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	useEffect(() => {
		if (isOpenReady) {
			// Resolved — clear any pending stuck timer + reset the escape UI.
			if (stuckTimer.current) clearTimeout(stuckTimer.current)
			setStuck(false)
			return
		}
		// Still provisioning/rechecking — arm (once) the budget timer so the
		// Open-anyway escape becomes reachable and the operator is never trapped.
		if (!stuckTimer.current) {
			stuckTimer.current = setTimeout(() => setStuck(true), STUCK_BUDGET_MS)
		}
		return () => {
			if (stuckTimer.current) {
				clearTimeout(stuckTimer.current)
				stuckTimer.current = undefined
			}
		}
	}, [isOpenReady])

	const uninstall = async () => {
		const res = await appInstall.uninstall()
		if (res?.uninstallTheseFirst) {
			setToUninstallFirstIds(res.uninstallTheseFirst)
			setOpenDepsDialog(true)
		} else {
			setShowUninstallDialog(false)
		}
	}

	const uninstallPrecheck = async () => {
		const apps = await appInstall.getAppsToUninstallFirst()
		if (apps.length > 0) {
			setToUninstallFirstIds(apps)
			setOpenDepsDialog(true)
		} else {
			setShowUninstallDialog(true)
		}
	}

	if (!userApp || !userApp.app) return <AppIcon label='' src='' />

	const state = appInstall.state

	// Start is disabled if the app is not stopped or unknown
	const startDisabled = !arrayIncludes(['stopped', 'unknown'], state)
	// Stop is disabled if the app is not running or ready
	const stopDisabled = !arrayIncludes(['running', 'ready'], state)
	// Restart is disabled if the app is not running or ready or unknown
	const restartDisabled = !arrayIncludes(['running', 'ready', 'unknown'], state)
	// Troubleshoot is disabled if the app is not running or ready or unknown
	const troubleshootDisabled = !arrayIncludes(['running', 'ready', 'unknown'], state)
	// Uninstall is never disabled just so the user can always retry uninstalling if the app
	// ever gets stuck in an uninstalling state.
	const uninstallDisabled = false

	const handleAppClick = async () => {
		// Launch the app if it's up — 'running' (Docker-derived) and 'ready'
		// (in-memory lifecycle) both mean "app is up and openable" (cf.
		// use-app-store-bridge.ts which gates open on `running || ready`).
		if (state === 'ready' || state === 'running') {
			// Phase 287 gate: even when the backend says the app is up, do NOT
			// launch until the operator's OWN resolver has confirmed the per-app
			// host resolves. Surface the "Hazırlanıyor…" overlay (+ Open-anyway
			// escape after the budget) instead of opening — clicking must never
			// form a DNS query for an unconfirmed host. (useLaunchApp itself also
			// withholds the window.open; this just shows the visible state.)
			if (!isOpenReady) {
				setShowProvisioning(true)
				return
			}
			return launchApp(appId)
		}
		// Start the app if it's stopped
		if (state === 'stopped') {
			return appInstall.start()
		}
		// Try restarting the app if it's 'unknown'
		if (state === 'unknown') {
			return appInstall.restart()
		}
	}

	// The one sanctioned bypass (T-287-13 accept): a deliberate, user-initiated
	// window.open on the SAME per-app URL the gate would have opened. It does NOT
	// mint a token or skip the app login — Caddy forward_auth still gates the app.
	const openAnyway = () => {
		try {
			window.open(appToUrl(userApp.app), '_blank')?.focus()
		} catch {
			// no-op: appToUrl only computes a string; nothing to clean up
		}
		setShowProvisioning(false)
	}

	// Show the provisioning overlay when the operator clicked an up-but-not-ready
	// app, OR proactively whenever a ready/running app is still rechecking, so the
	// state is visible without requiring a click.
	const appIsUp = state === 'ready' || state === 'running'
	const provisioningVisible = appIsUp && !isOpenReady && (showProvisioning || openReady.phase === 'rechecking')

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger className='group relative'>
					<AppIcon
						label={userApp.app.name}
						src={userApp.app.icon}
						onClick={handleAppClick}
						state={state}
						progress={appInstall.progress}
					/>
					{/* Phase 287 — PRESENTATIONAL provisioning overlay. Derived from
					    useAppOpenReady (NOT a new AppState member, NOT an AppLabel
					    case — the switch still ends in assertUnreachable). Shows
					    "Hazırlanıyor…" + a spinner while the operator's resolver is
					    still being confirmed; after the budget it surfaces the honest
					    flushdns hint + an "Open anyway" escape so the user is never
					    trapped (T-287-15). */}
					{provisioningVisible && (
						<div className='pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-start pt-3'>
							<div className='relative aspect-square w-12 shrink-0 rounded-xl bg-black/55 md:w-16 md:rounded-2xl'>
								<div className='absolute inset-0 flex items-center justify-center'>
									<div className='h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white md:h-6 md:w-6' />
								</div>
							</div>
							<div
								className='pointer-events-auto mt-1.5 max-w-[var(--app-w)] rounded-md bg-black/70 px-1.5 py-0.5 text-center text-[10px] font-medium leading-tight text-white'
								onClick={(e) => e.stopPropagation()}
							>
								<div className='truncate'>{t('app.provisioning')}</div>
								{stuck && (
									<div className='mt-1 space-y-1'>
										<div className='whitespace-normal text-[9px] font-normal leading-snug text-white/80'>
											{t('open.flushdns-hint')}
										</div>
										<button
											type='button'
											onClick={openAnyway}
											className='w-full rounded bg-white/20 px-1.5 py-0.5 text-[9px] font-medium text-white hover:bg-white/30'
										>
											{t('open.open-anyway')}
										</button>
									</div>
								)}
							</div>
						</div>
					)}
				</ContextMenuTrigger>
				<ContextMenuContent>
					{userApp.app.credentials &&
						(userApp.app.credentials.defaultUsername || userApp.app.credentials.defaultPassword) && (
							<ContextMenuItem asChild>
								<Link to={linkToDialog('default-credentials', {for: appId})}>
									{t('desktop.app.context.show-default-credentials')}
								</Link>
							</ContextMenuItem>
						)}

					{/* App settings (dependencies + public access) */}
						<ContextMenuItem asChild>
							<Link to={linkToDialog('app-settings', {for: appId})}>{t('desktop.app.context.settings')}</Link>
						</ContextMenuItem>

					{/* Dock+Launchpad Phase 4 — Keep in Dock / Remove from Dock */}
					<ContextMenuItem
						onSelect={() => (pinnedInDock ? unpin('app', appId) : pin({kind: 'app', id: appId}))}
					>
						{pinnedInDock ? 'Remove from Dock' : 'Keep in Dock'}
					</ContextMenuItem>

					{/* Share (admin only) */}
					{isAdmin && (
						<ContextMenuItem onSelect={() => setShowShareDialog(true)}>
							Share
						</ContextMenuItem>
					)}

					{/* Start / Stop */}
					{state !== 'stopped' ? (
						<ContextMenuItem disabled={stopDisabled} onSelect={stopDisabled ? undefined : appInstall.stop}>
							{t('stop')}
						</ContextMenuItem>
					) : (
						<ContextMenuItem onSelect={appInstall.start} disabled={startDisabled}>
							{t('start')}
						</ContextMenuItem>
					)}

					{/* Restart */}
					<ContextMenuItem disabled={restartDisabled} onSelect={restartDisabled ? undefined : appInstall.restart}>
						{t('restart')}
					</ContextMenuItem>

					{/* Troubleshoot */}
					<ContextMenuItem
						disabled={troubleshootDisabled}
						onSelect={() => navigate(`/settings/troubleshoot/app/${appId}`)}
					>
						{t('troubleshoot')}
					</ContextMenuItem>

					{/* Go to app store page */}
					<ContextMenuItemLinkToAppStore appId={appId} />

					{/* Uninstall */}
					<ContextMenuItem
						className={contextMenuClasses.item.rootDestructive}
						disabled={uninstallDisabled}
						onSelect={uninstallDisabled ? undefined : uninstallPrecheck}
					>
						{t('desktop.app.context.uninstall')}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			{/* Dialogs */}
			{toUninstallFirstIds.length > 0 && (
				<UninstallTheseFirstDialog
					appId={appId}
					toUninstallFirstIds={toUninstallFirstIds}
					open={openDepsDialog}
					onOpenChange={setOpenDepsDialog}
				/>
			)}
			{showUninstallDialog && (
				<UninstallConfirmationDialog
					appId={appId}
					open={showUninstallDialog}
					onOpenChange={setShowUninstallDialog}
					onConfirm={uninstall}
				/>
			)}
			{showShareDialog && (
				<ShareAppDialog
					appId={appId}
					open={showShareDialog}
					onOpenChange={setShowShareDialog}
				/>
			)}
		</>
	)
}

function ContextMenuItemLinkToAppStore({appId}: {appId: string}) {
	const navigate = useNavigate()
	const windowManager = useWindowManagerOptional()
	return (
		<ContextMenuItem asChild>
			<button
				// `w-full` because it doesn't fill the context menu otherwise
				className='w-full'
				onClick={async () => {
					const appStoreApp = await getAppStoreAppFromInstalledApp(appId)
					const registryId = appStoreApp?.registryId ?? LIVINITY_APP_STORE_ID
					if (registryId !== LIVINITY_APP_STORE_ID) {
						navigate(`/community-app-store/${registryId}/${appId}`)
					} else {
						// Phase 107 (2026-05-13): native /app-store/<id> route removed
						// in Phase 108 revert — open App Store iframe window instead.
						const appStoreEntry = systemAppsKeyed['LIVINITY_app-store']
						if (appStoreEntry) {
							windowManager?.openWindow('LIVINITY_app-store', '/app-store', 'App Store', appStoreEntry.icon)
						}
					}
				}}
			>
				{t('desktop.app.context.go-to-store-page')}
			</button>
		</ContextMenuItem>
	)
}
