// Geist Variable fonts — imported before index.css so Tailwind font-family cascade resolves correctly
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'

import {ErrorBoundary} from 'react-error-boundary'
import {RouterProvider} from 'react-router-dom'

import {AnnouncementHost} from '@/components/announcement-host'
import {init} from '@/init'
import {initTokenRenewal} from '@/modules/auth/shared'
import {ConfirmationProvider} from '@/providers/confirmation'
import {GlobalSystemStateProvider} from '@/providers/global-system-state/index'
// Phase 334 STEPUP-01 — app-level sudo-mode re-auth dialog (password/TOTP/passkey).
import {StepUpProvider} from '@/providers/step-up'

import {AuthBootstrap} from './providers/auth-bootstrap'
import {GlobalFilesProvider} from './providers/global-files'
import {KeyboardShortcutsProvider} from './providers/keyboard-shortcuts-provider'
import {RemoteLanguageInjector} from './providers/language'
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
				<StepUpProvider>
					<GlobalSystemStateProvider>
						<GlobalFilesProvider>
							<RouterProvider router={router} />
						</GlobalFilesProvider>
					</GlobalSystemStateProvider>
				</StepUpProvider>
			</ConfirmationProvider>
		</WallpaperProviderConnected>
		<Prefetcher />
		{/* Phase 292 fleet announcement pop-up host — MUST live INSIDE TrpcProvider
		    (it calls trpcReact…useQuery) and ThemeProvider. Mounting it as an
		    init.tsx sibling (outside the providers) crashed it ("Unable to find
		    tRPC Context" / "useTheme must be used within a ThemeProvider").
		    Its own ErrorBoundary keeps any announcement error from bricking the desktop. */}
		<ErrorBoundary fallback={null}>
			<AnnouncementHost />
		</ErrorBoundary>
	</TrpcProvider>
	</KeyboardShortcutsProvider>
	</ThemeProvider>,
)
