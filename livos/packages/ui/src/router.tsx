import React, {Suspense} from 'react'
import {createBrowserRouter, Outlet} from 'react-router-dom'

import {AppleSpotlight} from '@/components/apple-spotlight'
import {InstallPromptBanner} from '@/components/install-prompt-banner'
import {UpdateNotification} from '@/components/update-notification'
import {CmdkProvider, useCmdkOpen} from '@/components/cmdk'
import {AiQuickProvider, AiQuickDialog} from '@/components/ai-quick'
import {ErrorBoundaryComponentFallback} from '@/components/ui/error-boundary-component-fallback'
import {filesRoutes} from '@/features/files/routes'
import {DesktopContextMenu} from '@/modules/desktop/desktop-context-menu'
import {MobileAppProvider} from '@/modules/mobile/mobile-app-context'
import {MobileAppRenderer} from '@/modules/mobile/mobile-app-renderer'
import {MobileTabBar} from '@/modules/mobile/mobile-tab-bar'
import {WindowsContainer} from '@/modules/window'

import {ErrorBoundaryPageFallback} from './components/ui/error-boundary-page-fallback'
import {BareLayout, GradientLayout} from './layouts/bare/bare'
import OnboardingShell from './layouts/onboarding-shell'
import {Desktop} from './layouts/desktop'
import {SheetLayout} from './layouts/sheet'
import {EnsureLoggedIn, EnsureLoggedOut} from './modules/auth/ensure-logged-in'
import {EnsureUserDoesntExist, EnsureUserExists} from './modules/auth/ensure-user-exists'
import {Dock, DockBottomPositioner} from './modules/desktop/dock'
import {TopBar} from './modules/desktop/top-bar'
import {FloatingIslandContainer} from './modules/floating-island/container'
import {AppsProvider} from './providers/apps'
import {AvailableAppsProvider} from './providers/available-apps'
import {Wallpaper} from './providers/wallpaper'
import {WindowManagerProvider} from './providers/window-manager'
import {NotFound} from './routes/not-found'
import {Notifications} from './routes/notifications'
import {Settings} from './routes/settings'

// v34 — Native local-mode App Store imports REMOVED (route entries also removed below).
// const AppStoreDiscover = React.lazy(() => import('./routes/app-store/discover'))
// const AppStoreCategoryPage = React.lazy(() => import('./routes/app-store/category-page'))
// const AppStoreAppPage = React.lazy(() => import('./routes/app-store/app-page'))
// const CommunityAppStore = React.lazy(() => import('./routes/community-app-store'))
// Phase 76 / Plan 76-04 — Agent Marketplace route. Sibling to /app-store
// inside the SheetLayout. Lazy-loaded to keep the initial bundle lean
// and to mirror the existing app-store / community-app-store pattern.
// NOTE: /agent-marketplace route kept for deep-links; /agents /marketplace routes REMOVED (v32-redo-stage1a)
const AgentMarketplace = React.lazy(() => import('./routes/agent-marketplace'))
const MultiUserLogin = React.lazy(() => import('./routes/login/index'))
// Phase 135 — Livinity Onboarding (reference-aligned). 6 steps: Welcome,
// Account (password or 2FA), Wallpaper, Personalize, Connect AI, All set.
// The V1 wizard (setup-wizard.tsx, 1402 LOC) was deleted in 135-K.
const SetupWizardV2 = React.lazy(() => import('./routes/onboarding/setup-wizard-v2'))
const OnboardingRestore = React.lazy(() => import('./routes/onboarding/restore'))
const FactoryReset = React.lazy(() => import('./routes/factory-reset'))
const FactoryResetRecoveryHelp = React.lazy(() => import('./routes/help/factory-reset-recovery'))
const InviteAcceptPage = React.lazy(() => import('./routes/invite'))
// Phase 66 / Plan 05 — Liv Design System v1 playground.
// Single visual reference for every primitive shipped by Plans 66-01..66-04.
// Hidden from main nav (D-21); reachable only via direct URL.
const LivDesignSystemPlayground = React.lazy(() => import('./routes/playground/liv-design-system'))
// v32-redo-stage1a: /playground/v32-theme, /playground/v32-tool-views, /ai-chat-v2,
// /marketplace, /agents, /agents/:id routes REMOVED. Source dirs deleted.
// /agent-marketplace kept for deep-links.

function SpotlightConnected() {
	const {open, setOpen} = useCmdkOpen()
	return <AppleSpotlight isOpen={open} onClose={() => setOpen(false)} />
}

// NOTE: AI pages (ai-chat, server-control, subagents, schedules) are window-only.
// They are NOT registered as routes - they open exclusively as draggable windows from the dock.

// NOTE: consider extracting certain providers into react-router loaders
export const router = createBrowserRouter([
	// desktop
	{
		path: '/',
		element: (
			<EnsureLoggedIn>
				<Wallpaper />
				{/* Get any notifications from livinityd and render them as alert dialogs */}
				<Notifications />
				<AvailableAppsProvider>
					<AppsProvider>
						<WindowManagerProvider>
							{/* TopBar reads `windowManager.windows` to render pinned
							    chips and dispatches `pinWindowToTopBar` on drop, so it
							    MUST be inside WindowManagerProvider. 130-09 moved the
							    pinned-state ownership to WindowManager but TopBar was
							    still mounted outside this provider, which silently
							    no-op'd every pin (useWindowManagerOptional returned
							    null). Fixed Phase 131-01. */}
							<TopBar />
							<MobileAppProvider>
								<CmdkProvider>
								<AiQuickProvider>
									<DesktopContextMenu>
										<Desktop />
									</DesktopContextMenu>
									<SpotlightConnected />
									<AiQuickDialog />
								</AiQuickProvider>
								</CmdkProvider>
								<Suspense>
									<Outlet />
								</Suspense>
								<WindowsContainer />
								<MobileAppRenderer />
								<FloatingIslandContainer />
								<DockBottomPositioner>
									<Dock />
								</DockBottomPositioner>
								<MobileTabBar />
								<InstallPromptBanner />
								<UpdateNotification />
							</MobileAppProvider>
						</WindowManagerProvider>
					</AppsProvider>
				</AvailableAppsProvider>
			</EnsureLoggedIn>
		),
		ErrorBoundary: ErrorBoundaryPageFallback,
		children: [
			// Phase 66 / Plan 05 — Liv Design System v1 playground.
			// Gated behind EnsureLoggedIn (parent <element>); NOT admin-only per D-21.
			// Hidden from main nav; only reachable via direct URL.
			{
				path: 'playground/liv-design-system',
				element: <LivDesignSystemPlayground />,
				ErrorBoundary: ErrorBoundaryComponentFallback,
			},
			// v32-redo-stage1a: /playground/v32-theme, /playground/v32-tool-views,
			// /ai-chat-v2, /agents, /agents/:id routes removed.
			// Source dirs (routes/ai-chat/v32/, routes/agents/, routes/marketplace/,
			// routes/playground/v32-*.tsx, components/mcp/) deleted.
			{
				Component: SheetLayout,
				children: [
					...filesRoutes,
					// v36 LivOS Design Port — /settings/* route REMOVED from
					// SheetLayout 2026-05-15 per user direction "ben hic bir
					// sekilde livos un /yoneldnirme yapmasini istemyiorum". The
					// bottom-sheet wrapper was the "empty layout" appearing
					// when /settings was typed directly. Settings is now
					// window-only — clicking Settings in the dock opens it via
					// window-manager → app-contents/settings-content.tsx, which
					// has its own internal section navigation (no URL changes).
					// Typing /settings in the URL now falls through to NotFound.
					// v34 — Native local-mode App Store routes REMOVED per user direction
					// (post-Phase 108 UAT 2026-05-13). The native /app-store/* catalog
					// (Discover / Category / AppPage) is no longer reachable. Use the
					// platform iframe (livinity.io/store) via the App Store window only.
					// Community App Store also removed (same rationale).
					// Spotlight + cmdk navigate() calls to /app-store/{appId} will be
					// dead-ends until cleaned up in a follow-up phase.
					// v36 — /agent-marketplace SheetLayout entry REMOVED 2026-05-15 per
					// user "buna benzer yerleride kaldir". Component import preserved
					// for future v37 window-manager conversion; deep links now 404.
					// /files PRESERVED — OwnCloud daily driver depends on URL deep-linking.
					// v32-redo-stage1a: /marketplace route removed (source dir deleted)
				],
			},
		],
	},

	// bare (login, factory reset)
	{
		path: '/',
		Component: BareLayout,
		ErrorBoundary: ErrorBoundaryPageFallback,
		children: [
			{
				path: 'login',
				element: (
					<EnsureUserExists>
						<EnsureLoggedOut>
							<MultiUserLogin />
						</EnsureLoggedOut>
					</EnsureUserExists>
				),
			},
			{
				path: 'factory-reset/*',
				element: <FactoryReset />,
			},
			{
				// Phase 38 Plan 04 — D-RT-02 manual SSH recovery instructions.
				// Linked from FactoryResetErrorPage's "Manual SSH recovery
				// instructions" button.
				path: 'help/factory-reset-recovery',
				element: <FactoryResetRecoveryHelp />,
			},
		],
	},

	// onboarding + invite (gradient glassmorphism background)
	{
		path: '/',
		Component: GradientLayout,
		ErrorBoundary: ErrorBoundaryPageFallback,
		children: [
			{
				path: 'invite/:token',
				element: <InviteAcceptPage />,
			},
		],
	},

	// onboarding — Phase 135: Livinity DS shell (replaces GradientLayout for this subtree only)
	{
		path: '/onboarding',
		Component: OnboardingShell,
		ErrorBoundary: ErrorBoundaryPageFallback,
		children: [
			{
				index: true,
				element: <SetupWizardV2 />,
			},
			{
				path: 'restore',
				element: (
					<EnsureUserDoesntExist>
						<OnboardingRestore />
					</EnsureUserDoesntExist>
				),
			},
		],
	},
	{
		path: '*',
		Component: NotFound,
	},
])
