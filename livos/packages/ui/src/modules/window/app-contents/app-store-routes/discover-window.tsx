import {useRef} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

import {AppIcon} from '@/components/app-icon'
import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {Loading} from '@/components/ui/loading'
import {WindowAwareLink} from '@/components/window-aware-link'
import {useColorThief} from '@/hooks/use-color-thief'
import {AppsGallerySection} from '@/modules/app-store/gallery-section'
import {cardFaintClass} from '@/modules/app-store/shared'
import {getCategoryLabel} from '@/modules/app-store/utils'
import {preloadFirstFewGalleryImages} from '@/modules/app-store/utils'
import {useAvailableApps} from '@/providers/available-apps'
import {useWindowRouter} from '@/providers/window-router'
import {useDiscoverQuery} from '@/routes/app-store/use-discover-query'
import {cn} from '@/shadcn-lib/utils'
import {RegistryApp} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

import {AppsGridSectionWindow, AppsRowSectionWindow, AppsThreeColumnSectionWindow} from './shared-components'

const getAppById = (appId: string, apps: RegistryApp[]): RegistryApp | undefined => {
	const app = apps.find((app) => app.id === appId)
	if (!app) return undefined
	return app
}

function DiscoverUnavailable() {
	return (
		<div className={cn(cardFaintClass, 'flex h-40 flex-col items-center justify-center p-8 text-center')}>
			<p className='text-body font-medium text-text-primary'>{t('app-store.discover.temporarily-unavailable-title')}</p>
			<p className='mt-2 text-caption text-text-secondary'>{t('app-store.discover.temporarily-unavailable-description')}</p>
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
				if (section.type === 'featured-hero') {
					const heroApps = section.apps
						.map((appId) => getAppById(appId, apps))
						.filter((app): app is RegistryApp => app !== undefined)
					if (heroApps.length === 0) return null
					return <FeaturedHeroRow key={section.heading} apps={heroApps} badge={section.subheading} />
				}

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
									className='inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-body-sm font-semibold text-black transition-colors hover:bg-white/90'
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

// ─── Featured Hero Row — two cards side by side ─────────────────
const GRADIENTS = [
	{from: 'from-blue-600/25', via: 'via-indigo-600/15', to: 'to-purple-600/5', orb1: 'bg-blue-500/20', orb2: 'bg-indigo-500/15', accent: 'text-blue-200', badge: 'bg-blue-500/30 text-blue-100 ring-blue-400/30', dot: 'bg-blue-300', glow: 'bg-blue-400/30'},
	{from: 'from-orange-600/25', via: 'via-amber-600/15', to: 'to-yellow-600/5', orb1: 'bg-orange-500/20', orb2: 'bg-amber-500/15', accent: 'text-orange-200', badge: 'bg-orange-500/30 text-orange-100 ring-orange-400/30', dot: 'bg-orange-300', glow: 'bg-orange-400/30'},
]

function FeaturedHeroRow({apps, badge}: {apps: RegistryApp[]; badge?: string}) {
	return (
		<div className='grid grid-cols-1 gap-4 md:grid-cols-2 animate-in fade-in slide-in-from-bottom-8 duration-500'>
			{apps.map((app, i) => (
				<FeaturedHeroCard key={app.id} app={app} badge={i === 0 ? badge : undefined} gradient={GRADIENTS[i % GRADIENTS.length]} />
			))}
		</div>
	)
}

function FeaturedHeroCard({
	app,
	badge,
	gradient,
}: {
	app: RegistryApp
	badge?: string
	gradient: typeof GRADIENTS[number]
}) {
	return (
		<WindowAwareLink
			to={`/${app.id}`}
			className={cn(
				'group relative block w-full overflow-hidden rounded-2xl',
				'border border-border-default',
				'transition-all duration-500',
				'hover:border-border-emphasis hover:shadow-elevation-lg',
			)}
		>
			<div className={cn('absolute inset-0 bg-gradient-to-br', gradient.from, gradient.via, gradient.to)} />
			<div className={cn('absolute -right-16 -top-16 h-40 w-40 rounded-full blur-3xl transition-transform duration-700 group-hover:scale-125', gradient.orb1)} />
			<div className={cn('absolute -bottom-16 -left-16 h-40 w-40 rounded-full blur-3xl transition-transform duration-700 group-hover:scale-125', gradient.orb2)} />
			<div className='absolute inset-0 bg-gradient-to-r from-black/50 via-black/20 to-transparent' />

			<div className='relative flex items-center gap-5 p-5 md:p-6'>
				<div className='relative shrink-0'>
					<div className={cn('absolute inset-0 rounded-2xl blur-xl transition-all duration-500 group-hover:blur-2xl', gradient.glow)} />
					<AppIcon
						src={app.icon}
						size={64}
						className='relative z-10 rounded-2xl shadow-xl transition-transform duration-500 group-hover:scale-110'
					/>
				</div>

				<div className='flex flex-1 flex-col justify-center min-w-0'>
					{badge && (
						<span className={cn('mb-2 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-sm ring-1', gradient.badge)}>
							<span className={cn('h-1.5 w-1.5 animate-pulse rounded-full', gradient.dot)} />
							{badge}
						</span>
					)}
					<h3 className='truncate text-xl font-bold tracking-tight text-white md:text-2xl'>{app.name}</h3>
					<p className='mt-1 line-clamp-2 text-body-sm text-white/70'>{app.tagline}</p>
				</div>

				<svg className={cn('h-5 w-5 shrink-0 transition-all duration-300 group-hover:translate-x-1', gradient.accent)} fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2.5}>
					<path strokeLinecap='round' strokeLinejoin='round' d='M9 5l7 7-7 7' />
				</svg>
			</div>

			<div className='absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/8 to-transparent transition-transform duration-1000 group-hover:translate-x-full' />
		</WindowAwareLink>
	)
}
