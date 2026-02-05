import React, {Suspense} from 'react'
import {createBrowserRouter, Outlet} from 'react-router-dom'

import {CmdkMenu, CmdkProvider} from '@/components/cmdk'
import {AiQuickProvider, AiQuickDialog} from '@/components/ai-quick'
import {ErrorBoundaryComponentFallback} from '@/components/ui/error-boundary-component-fallback'
import {filesRoutes} from '@/features/files/routes'
import {DesktopContextMenu} from '@/modules/desktop/desktop-context-menu'
import {WindowsContainer} from '@/modules/window'

import {ErrorBoundaryPageFallback} from './components/ui/error-boundary-page-fallback'
import {BareLayout} from './layouts/bare/bare'
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
const Login = React.lazy(() => import('./routes/login'))
const OnboardingStart = React.lazy(() => import('./routes/onboarding'))
const CreateAccount = React.lazy(() => import('./routes/onboarding/create-account'))
const AccountCreated = React.lazy(() => import('./routes/onboarding/account-created'))
const FactoryReset = React.lazy(() => import('./routes/factory-reset'))
const OnboardingRestore = React.lazy(() => import('./routes/onboarding/restore'))

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
							<CmdkProvider>
							<AiQuickProvider>
								<DesktopContextMenu>
									<Desktop />
								</DesktopContextMenu>
								<CmdkMenu />
															<AiQuickDialog />
							</AiQuickProvider>
							</CmdkProvider>
							<Suspense>
								<Outlet />
							</Suspense>
							<WindowsContainer />
							<FloatingIslandContainer />
							<DockBottomPositioner>
								<Dock />
							</DockBottomPositioner>
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

	// bare
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
							<Login />
						</EnsureLoggedOut>
					</EnsureUserExists>
				),
			},
			{
				path: 'onboarding',
				children: [
					{
						index: true,
						element: (
							<EnsureUserDoesntExist>
								<OnboardingStart />
							</EnsureUserDoesntExist>
						),
					},
					{
						path: 'restore',
						element: (
							<EnsureUserDoesntExist>
								<OnboardingRestore />
							</EnsureUserDoesntExist>
						),
					},
					{
						path: 'create-account',
						element: (
							<EnsureUserDoesntExist>
								<CreateAccount />
							</EnsureUserDoesntExist>
						),
					},
					{
						path: 'account-created',
						element: (
							<EnsureLoggedIn>
								<AccountCreated />
							</EnsureLoggedIn>
						),
					},
				],
			},
			{
				path: 'factory-reset/*',
				element: <FactoryReset />,
			},
		],
	},
	{
		path: '*',
		Component: NotFound,
	},
])
