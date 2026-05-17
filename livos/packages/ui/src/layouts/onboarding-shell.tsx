import {Suspense} from 'react'
import {Outlet} from 'react-router-dom'

import '@/styles/onboarding-tokens.css'
import '@/styles/onboarding-flow.css'

/**
 * Phase 135 — Livinity DS-aligned shell for /onboarding/* routes.
 *
 * Replaces the legacy GradientLayout (gradient glassmorphism) for these
 * routes only. Sets data-flow="onboarding" on the root so the scoped tokens
 * defined in styles/onboarding-tokens.css apply only inside this subtree.
 * Other LivOS surfaces (dock, app store, desktop) keep their brand color
 * identity per memory feedback_v36_monochrome_dock_rejected.
 */
export function OnboardingShell() {
	return (
		<div data-flow='onboarding' style={{position: 'relative', minHeight: '100dvh'}}>
			<Suspense>
				<Outlet />
			</Suspense>
		</div>
	)
}

export default OnboardingShell
