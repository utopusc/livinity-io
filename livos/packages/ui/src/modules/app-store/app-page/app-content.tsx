import {JSONTree} from 'react-json-tree'
import {isEmpty} from 'remeda'

import {DebugOnly} from '@/components/ui/debug-only'
import {AboutSection} from '@/modules/app-store/app-page/about-section'
import {DependenciesSection} from '@/modules/app-store/app-page/dependencies'
import {InfoSection} from '@/modules/app-store/app-page/info-section'
import {PublicAccessSection} from '@/modules/app-store/app-page/public-access-section'
import {RecommendationsSection} from '@/modules/app-store/app-page/recommendations-section'
import {ReleaseNotesSection} from '@/modules/app-store/app-page/release-notes-section'
import {Badge} from '@/shadcn-components/ui/badge'
import {cn} from '@/shadcn-lib/utils'
import {RegistryApp, UserApp} from '@/trpc/trpc'

// v29.4 Phase 47 Plan 05 — AppHealthCard dual-mount (FR-PROBE-01).
import {AppHealthCard} from '@/routes/settings/diagnostics/app-health-card'

import {SettingsSection} from './settings-section'

export function AppContent({
	app,
	userApp,
	recommendedApps = [],
	showDependencies,
}: {
	app: RegistryApp
	/** When the user initiates an install, we now have a user app, even before install */
	userApp?: UserApp
	recommendedApps?: RegistryApp[]
	showDependencies?: (dependencyId?: string) => void
}) {
	const hasDependencies = app.dependencies && app.dependencies.length > 0

	return (
		<>
			{/* Desktop */}
			<div className={cn('hidden flex-row gap-5 lg:flex')}>
				<div className='flex flex-1 flex-col gap-5'>
					{/* Phase 43 (D-43-12): subscription-powered marketplace badge */}
					{app.requiresAiProvider && (
						<Badge variant='outline' className='self-start'>
							Uses your Claude subscription
						</Badge>
					)}
					<AboutSection app={app} />
					<ReleaseNotesSection app={app} />
				</div>
				{/* Since contents can be arbitrarily wide, we wanna limit */}
				<div className='flex flex-col gap-5 md:max-w-sm'>
					{userApp && <SettingsSection userApp={userApp} />}
					{/* v29.4 Phase 47 Plan 05 — App Health probe inline on detail page (FR-PROBE-01) */}
					{userApp && <AppHealthCard appId={app.id} appName={app.name} />}
					{/* Public Access Section - show for installed apps */}
					{userApp && (
						<PublicAccessSection appId={app.id} appName={app.name} appPort={app.port || 0} />
					)}
					<InfoSection app={app} />
					{hasDependencies && <DependenciesSection app={app} showDependencies={showDependencies} />}
					{!isEmpty(recommendedApps) && <RecommendationsSection apps={recommendedApps} />}
				</div>
			</div>
			{/* Mobile */}
			<div className='space-y-5 lg:hidden'>
				{/* Phase 43 (D-43-12): subscription-powered marketplace badge */}
				{app.requiresAiProvider && (
					<Badge variant='outline' className='self-start'>
						Uses your Claude subscription
					</Badge>
				)}
				{userApp && <SettingsSection userApp={userApp} />}
				{/* v29.4 Phase 47 Plan 05 — App Health probe inline on detail page (mobile, FR-PROBE-01) */}
				{userApp && <AppHealthCard appId={app.id} appName={app.name} />}
				{/* Public Access Section - show for installed apps */}
				{userApp && (
					<PublicAccessSection appId={app.id} appName={app.name} appPort={app.port || 0} />
				)}
				<AboutSection app={app} />
				<InfoSection app={app} />
				{hasDependencies && <DependenciesSection app={app} showDependencies={showDependencies} />}
				<ReleaseNotesSection app={app} />
				{!isEmpty(recommendedApps) && <RecommendationsSection apps={recommendedApps} />}
			</div>
			<DebugOnly>
				<JSONTree data={app} />
			</DebugOnly>
		</>
	)
}
