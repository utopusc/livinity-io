// Geist Variable fonts — imported before index.css so Tailwind font-family cascade resolves correctly
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'

import {RouterProvider} from 'react-router-dom'

import {init} from '@/init'
import {initTokenRenewal} from '@/modules/auth/shared'
import {ConfirmationProvider} from '@/providers/confirmation'
import {GlobalSystemStateProvider} from '@/providers/global-system-state/index'

import {AuthBootstrap} from './providers/auth-bootstrap'
import {GlobalFilesProvider} from './providers/global-files'
import {KeyboardShortcutsProvider} from './providers/keyboard-shortcuts-provider'
import {RemoteLanguageInjector} from './providers/language'
import {OnboardingPersonalizationSync} from './providers/onboarding-sync'
import {Prefetcher} from './providers/prefetch'
import {ThemeProvider} from './providers/theme-provider'
import {RemoteWallpaperInjector, WallpaperProviderConnected} from './providers/wallpaper'
import {router} from './router'
import {TrpcProvider} from './trpc/trpc-provider'

initTokenRenewal()

init(
	<ThemeProvider defaultTheme="system">
	<KeyboardShortcutsProvider>
	<TrpcProvider>
		<AuthBootstrap />
		<RemoteLanguageInjector />
		{/* Wallpaper inside trpc because it requires backend call */}
		<WallpaperProviderConnected>
			<RemoteWallpaperInjector />
			<ConfirmationProvider>
				<GlobalSystemStateProvider>
					<GlobalFilesProvider>
						<RouterProvider router={router} />
					</GlobalFilesProvider>
				</GlobalSystemStateProvider>
			</ConfirmationProvider>
		</WallpaperProviderConnected>
		<OnboardingPersonalizationSync />
		<Prefetcher />
	</TrpcProvider>
	</KeyboardShortcutsProvider>
	</ThemeProvider>,
)
