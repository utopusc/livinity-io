import {ReactNode, useMemo, useRef} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {TbArrowLeft} from 'react-icons/tb'

import {AppIcon} from '@/components/app-icon'
import {InstallButtonConnected} from '@/components/install-button-connected'
import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {ErrorBoundaryComponentFallback} from '@/components/ui/error-boundary-component-fallback'
import {Loading} from '@/components/ui/loading'
import {AppContent} from '@/modules/app-store/app-page/app-content'
import {getRecommendationsFor} from '@/modules/app-store/app-page/get-recommendations'
import {appPageWrapperClass} from '@/modules/app-store/app-page/shared'
import {useApps} from '@/providers/apps'
import {useAvailableApp, useAvailableApps} from '@/providers/available-apps'
import {useWindowRouter} from '@/providers/window-router'
import {Badge} from '@/shadcn-components/ui/badge'
import {RegistryApp} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

type AppPageWindowProps = {
	appId: string
}

export default function AppPageWindow({appId}: AppPageWindowProps) {
	const {app, isLoading} = useAvailableApp(appId)
	const {apps, isLoading: isLoadingApps} = useAvailableApps()
	const {userAppsKeyed, isLoading: isLoadingUserApps} = useApps()

	const installButtonRef = useRef<{triggerInstall: (highlightDependency?: string) => void}>(null)

	const recommendedApps = useMemo(() => {
		if (!apps || !app) return []
		return getRecommendationsFor(apps, app.id)
	}, [apps, app])

	if (isLoading || isLoadingApps || isLoadingUserApps) return <Loading />

	if (!app) {
		return (
			<div className='flex h-full items-center justify-center'>
				<p className='text-white/50'>App not found: {appId}</p>
			</div>
		)
	}

	const userApp = userAppsKeyed?.[app.id]

	const showDependencies = (dependencyId?: string) => {
		if (!app) return
		if (installButtonRef.current) {
			installButtonRef.current.triggerInstall(dependencyId)
		}
	}

	return (
		<div className={appPageWrapperClass}>
			<TopHeaderWindow
				app={app}
				childrenRight={
					<div className='flex items-center gap-5'>
						<ErrorBoundary FallbackComponent={ErrorBoundaryComponentFallback}>
							<InstallButtonConnected ref={installButtonRef} app={app} />
						</ErrorBoundary>
					</div>
				}
			/>
			<ErrorBoundary FallbackComponent={ErrorBoundaryCardFallback}>
				<AppContent app={app} userApp={userApp} recommendedApps={recommendedApps} showDependencies={showDependencies} />
			</ErrorBoundary>
		</div>
	)
}

// Window-compatible TopHeader (without SheetStickyHeader dependency)
function TopHeaderWindow({app, childrenRight}: {app: RegistryApp; childrenRight: ReactNode}) {
	const {goBack} = useWindowRouter()

	return (
		<div className='space-y-5'>
			<button onClick={goBack} className='flex items-center gap-2 text-white/60 hover:text-white transition-colors'>
				<TbArrowLeft className='h-5 w-5' />
				<span className='text-13'>Back</span>
			</button>

			<div data-testid='app-top' className='flex flex-col items-stretch gap-5 md:flex-row'>
				<div className='flex min-w-0 flex-1 items-center gap-2.5 md:gap-5'>
					<AppIcon src={app.icon} size={100} className='rounded-12 lg:rounded-20' />
					<div className='flex min-w-0 flex-col items-start gap-1.5 py-1 md:gap-2'>
						<h1 className='flex flex-wrap items-center gap-2 text-16 font-semibold leading-inter-trimmed md:text-24'>
							{app.name} {app.optimizedForLivinityHome && <Badge>{t('app.optimized-for-livinity-home')}</Badge>}
						</h1>
						<p className='line-clamp-2 w-full text-12 leading-tight opacity-50 md:line-clamp-1 md:text-16'>
							{app.tagline}
						</p>
						<div className='flex-1' />
						<div className='text-12 delay-100 animate-in fade-in slide-in-from-right-2 fill-mode-both md:text-13'>
							{app.developer}
						</div>
					</div>
				</div>
				{childrenRight}
			</div>
		</div>
	)
}
