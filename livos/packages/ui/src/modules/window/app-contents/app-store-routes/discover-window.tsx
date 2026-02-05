import {ErrorBoundary} from 'react-error-boundary'

import {ButtonLink} from '@/components/ui/button-link'
import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {Loading} from '@/components/ui/loading'
import {WindowAwareLink} from '@/components/window-aware-link'
import {AppsGallerySection} from '@/modules/app-store/gallery-section'
import {cardFaintClass} from '@/modules/app-store/shared'
import {getCategoryLabel} from '@/modules/app-store/utils'
import {useWindowRouter} from '@/providers/window-router'
import {useAvailableApps} from '@/providers/available-apps'
import {cn} from '@/shadcn-lib/utils'
import {RegistryApp} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

import {useDiscoverQuery} from '@/routes/app-store/use-discover-query'
import {AppsGridSectionWindow} from './shared-components'
import {AppsRowSectionWindow} from './shared-components'
import {AppsThreeColumnSectionWindow} from './shared-components'

const getAppById = (appId: string, apps: RegistryApp[]): RegistryApp | undefined => {
	const app = apps.find((app) => app.id === appId)
	if (!app) return undefined
	return app
}

function DiscoverUnavailable() {
	return (
		<div className={cn(cardFaintClass, 'flex h-40 flex-col items-center justify-center p-8 text-center')}>
			<p className='text-15 font-medium text-white/80'>{t('app-store.discover.temporarily-unavailable-title')}</p>
			<p className='mt-2 text-12 text-white/50'>{t('app-store.discover.temporarily-unavailable-description')}</p>
		</div>
	)
}

export default function DiscoverWindow() {
	return (
		<ErrorBoundary FallbackComponent={ErrorBoundaryCardFallback}>
			<DiscoverContent />
		</ErrorBoundary>
	)
}

function DiscoverContent() {
	const availableApps = useAvailableApps()
	const discoverQ = useDiscoverQuery()
	const {navigate} = useWindowRouter()

	if (availableApps.isLoading || discoverQ.isLoading) {
		return <Loading />
	}

	const {apps} = availableApps

	if (discoverQ.isError || !discoverQ.data) {
		return <DiscoverUnavailable />
	}

	const {banners, sections} = discoverQ.data
	return (
		<>
			<AppsGallerySection banners={banners} />
			{sections.map((section) => {
				if (section.type === 'grid') {
					return (
						<AppsGridSectionWindow
							key={section.heading + section.subheading}
							title={section.heading}
							overline={section.subheading}
							apps={section.apps.map((appId) => getAppById(appId, apps)).filter((app) => app !== undefined)}
						/>
					)
				}

				if (section.type === 'horizontal') {
					return (
						<AppsRowSectionWindow
							key={section.heading + section.subheading}
							overline={section.subheading}
							title={section.heading}
							apps={section.apps.map((appId) => getAppById(appId, apps)).filter((app) => app !== undefined)}
						/>
					)
				}

				if (section.type === 'three-column') {
					const sectionApps = section.apps.map((appId) => getAppById(appId, apps)).filter((app) => app !== undefined)
					if (sectionApps.length === 0) return null
					return (
						<AppsThreeColumnSectionWindow
							key={section.heading + section.subheading}
							apps={sectionApps}
							overline={section.subheading}
							title={section.heading}
							textLocation={section.textLocation}
							description={section.description || ''}
						>
							{section.category && (
								<button
									className='inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90'
									onClick={() => navigate(`/category/${section.category}`)}
								>
									{t('app-store.browse-category-apps', {
										category: getCategoryLabel(section.category),
									})}
								</button>
							)}
						</AppsThreeColumnSectionWindow>
					)
				}
			})}
		</>
	)
}
