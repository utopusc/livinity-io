import 'inter-ui/inter.css'
import './index.css'
import './utils/i18n'

import i18next from 'i18next'
import React, {Suspense} from 'react'
import ReactDOM from 'react-dom/client'
import {ErrorBoundary} from 'react-error-boundary'

import {IframeChecker} from '@/components/iframe-checker'
import {LivosVersionBanner} from '@/components/livos-version-banner'
import {BareCoverMessage, CoverMessageTarget} from '@/components/ui/cover-message'
import {Toaster} from '@/components/ui/toast'
import {TooltipProvider} from '@/shadcn-components/ui/tooltip'
import {t} from '@/utils/i18n'
import {monkeyPatchConsoleLog} from '@/utils/logs'

monkeyPatchConsoleLog()

// Disable default browser context menu
document.addEventListener(
	'contextmenu',
	(event) => {
		event.preventDefault()
		return false
	},
	{passive: false},
)

export function init(element: React.ReactNode) {
	i18next.on('initialized', () => {
		ReactDOM.createRoot(document.getElementById('root')!).render(
			<React.StrictMode>
				<IframeChecker>
					<Suspense>
						<ErrorBoundary fallback={<BareCoverMessage>{t('something-went-wrong')}</BareCoverMessage>}>
							<TooltipProvider>
								{element}
								<Toaster />
								{/* Phase 218 T7 — refresh banner on UI bundle mismatch. */}
								<LivosVersionBanner />
								{/* Phase 292 announcement host moved to main.tsx INSIDE TrpcProvider +
								    ThemeProvider — it calls trpcReact…useQuery and useTheme, which
								    throw without their providers (here it was a sibling of {element},
								    outside every provider → bricked v44.66/67). */}
								{/* Put `CoverMessageTarget` after `Toaster` because we don't want toasts to show up on these pages */}
								<CoverMessageTarget />
							</TooltipProvider>
						</ErrorBoundary>
					</Suspense>
				</IframeChecker>
			</React.StrictMode>,
		)
	})
}
