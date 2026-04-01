import React, {Suspense} from 'react'
import {createBrowserRouter, Outlet} from 'react-router-dom'

import {AppleSpotlight} from '@/components/apple-spotlight'
import {InstallPromptBanner} from '@/components/install-prompt-banner'
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
import {Desktop} from './layouts/desktop'
import {SheetLayout} from './layouts/sheet'
import {EnsureLoggedIn, EnsureLoggedOut} from './modules/auth/ensure-logged-in'
import {EnsureUserDoesntExist, EnsureUserExists} from './modules/auth/ensure-user-exists'
import {Dock, DockBottomPositioner} from './modules/desktop/dock'
import {FloatingIslandContainer} from './modules/floating-island/container'
import {AppsProvider} from './providers/apps'
import {AvailableAppsProvider} from './providers/available-apps'
import {Wallpaper} from './providers/wallpaper'
import {WindowManagerProvider} from './providers/window-manager'
import {NotFound} from './routes/not-found'
import {Notifications} from './routes/notifications'
import {Settings} from './routes/settings'

const AppStoreDiscover = React.lazy(() => import('./routes/app-store/discover'))
const AppStoreCategoryPage = React.lazy(() => import('./routes/app-store/category-page'))
const AppStoreAppPage = React.lazy(() => import('./routes/app-store/app-page'))
const CommunityAppStore = React.lazy(() => import('./routes/community-app-store'))
const MultiUserLogin = React.lazy(() => import('./routes/login/index'))
const SetupWizard = React.lazy(() => import('./routes/onboarding/setup-wizard'))
const OnboardingRestore = React.lazy(() => import('./routes/onboarding/restore'))
const FactoryReset = React.lazy(() => import('./routes/factory-reset'))
const InviteAcceptPage = React.lazy(() => import('./routes/invite'))

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
							</MobileAppProvider>
						</WindowManagerProvider>
					</AppsProvider>
				</AvailableAppsProvider>
			</EnsureLoggedIn>
		),
		ErrorBoundary: ErrorBoundaryPageFallback,
		children: [
			{
				Component: SheetLayout,
				children: [
					...filesRoutes,
					{
						path: 'settings/*',
						Component: Settings,
						children: [
							{
								path: ':settingsDialog',
								Component: Settings,
							},
						],
					},
					{
						path: 'app-store',
						Component: AppStoreDiscover,
						ErrorBoundary: ErrorBoundaryComponentFallback,
					},
					{
						path: 'app-store/category/:category',
						Component: AppStoreCategoryPage,
						ErrorBoundary: ErrorBoundaryComponentFallback,
					},
					{
						path: 'app-store/:appId',
						Component: AppStoreAppPage,
						ErrorBoundary: ErrorBoundaryComponentFallback,
					},
					{
						path: 'community-app-store',
						Component: CommunityAppStore,
						ErrorBoundary: ErrorBoundaryComponentFallback,
					},
					{
						path: 'community-app-store/:appStoreId/:appId',
						Component: CommunityAppStore,
						ErrorBoundary: ErrorBoundaryComponentFallback,
					},
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

	// onboarding (gradient glassmorphism background)
	{
		path: '/onboarding',
		Component: GradientLayout,
		ErrorBoundary: ErrorBoundaryPageFallback,
		children: [
			{
				index: true,
				element: <SetupWizard />,
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
