import {ErrorBoundary} from 'react-error-boundary'
import {Link} from 'react-router-dom'

import {AppIcon} from '@/components/app-icon'
import {InView} from '@/components/motion-primitives/in-view'
import {Spotlight} from '@/components/motion-primitives/spotlight'
import {Tilt} from '@/components/motion-primitives/tilt'
import {ButtonLink} from '@/components/ui/button-link'
import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {Loading} from '@/components/ui/loading'
import {ConnectedAppStoreNav} from '@/modules/app-store/app-store-nav'
import {AppsGridSection} from '@/modules/app-store/discover/apps-grid-section'
import {AppsRowSection} from '@/modules/app-store/discover/apps-row-section'
import {AppsThreeColumnSection} from '@/modules/app-store/discover/apps-three-column-section'
import {AppsGallerySection} from '@/modules/app-store/gallery-section'
import {cardFaintClass} from '@/modules/app-store/shared'
import {getCategoryLabel} from '@/modules/app-store/utils'
import {useAvailableApps} from '@/providers/available-apps'
import {cn} from '@/shadcn-lib/utils'
import {RegistryApp} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

import {useDiscoverQuery} from './use-discover-query'

const getAppById = (appId: string, apps: RegistryApp[]): RegistryApp | undefined => {
	const app = apps.find((app) => app.id === appId)
	if (!app) return undefined
	return app
}

function DiscoverUnavailable() {
	return (
		<div className={cn(cardFaintClass, 'flex h-40 flex-col items-center justify-center p-8 text-center')}>
			<p className='text-body font-medium text-neutral-900'>{t('app-store.discover.temporarily-unavailable-title')}</p>
			<p className='mt-2 text-caption text-neutral-500'>{t('app-store.discover.temporarily-unavailable-description')}</p>
		</div>
	)
}

export default function Discover() {
	return (
		<>
			<ConnectedAppStoreNav />
			<ErrorBoundary FallbackComponent={ErrorBoundaryCardFallback}>
				<DiscoverContent />
			</ErrorBoundary>
		</>
	)
}

function DiscoverContent() {
	const availableApps = useAvailableApps()
	const discoverQ = useDiscoverQuery()

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
					return (
						<InView
							key={section.heading}
							variants={{hidden: {opacity: 0, y: 20}, visible: {opacity: 1, y: 0}}}
							transition={{duration: 0.5, ease: 'easeOut'}}
							viewOptions={{margin: '-60px'}}
							once
						>
							<FeaturedHeroRow apps={heroApps} badge={section.subheading} />
						</InView>
					)
				}

				if (section.type === 'grid') {
					return (
						<InView
							key={section.heading + section.subheading}
							variants={{hidden: {opacity: 0, y: 20}, visible: {opacity: 1, y: 0}}}
							transition={{duration: 0.5, ease: 'easeOut'}}
							viewOptions={{margin: '-60px'}}
							once
						>
							<AppsGridSection
								title={section.heading}
								overline={section.subheading}
								apps={section.apps.map((appId) => getAppById(appId, apps)).filter((app) => app !== undefined)}
							/>
						</InView>
					)
				}

				if (section.type === 'horizontal') {
					return (
						<InView
							key={section.heading + section.subheading}
							variants={{hidden: {opacity: 0, y: 20}, visible: {opacity: 1, y: 0}}}
							transition={{duration: 0.5, ease: 'easeOut'}}
							viewOptions={{margin: '-60px'}}
							once
						>
							<AppsRowSection
								overline={section.subheading}
								title={section.heading}
								apps={section.apps.map((appId) => getAppById(appId, apps)).filter((app) => app !== undefined)}
							/>
						</InView>
					)
				}

				if (section.type === 'three-column') {
					const sectionApps = section.apps.map((appId) => getAppById(appId, apps)).filter((app) => app !== undefined)
					if (sectionApps.length === 0) return null
					return (
						<InView
							key={section.heading + section.subheading}
							variants={{hidden: {opacity: 0, y: 20}, visible: {opacity: 1, y: 0}}}
							transition={{duration: 0.5, ease: 'easeOut'}}
							viewOptions={{margin: '-60px'}}
							once
						>
							<AppsThreeColumnSection
								apps={sectionApps}
								overline={section.subheading}
								title={section.heading}
								textLocation={section.textLocation}
								description={section.description || ''}
							>
								{section.category && (
									<ButtonLink variant='primary' size='dialog' to={`/app-store/category/${section.category}`}>
										{t('app-store.browse-category-apps', {
											category: getCategoryLabel(section.category),
										})}
									</ButtonLink>
								)}
							</AppsThreeColumnSection>
						</InView>
					)
				}
			})}
		</>
	)
}

// ─── Featured Hero Row — two cards side by side ─────────────────
const GRADIENTS = [
	{
		from: 'from-blue-50', via: 'via-indigo-50/80', to: 'to-violet-50/50',
		orb1: 'bg-blue-200/40', orb2: 'bg-indigo-200/30',
		accent: 'text-blue-600',
		badge: 'bg-blue-100 text-blue-700 ring-blue-200',
		dot: 'bg-blue-500', glow: 'bg-blue-200/50',
	},
	{
		from: 'from-amber-50', via: 'via-orange-50/80', to: 'to-rose-50/50',
		orb1: 'bg-amber-200/40', orb2: 'bg-orange-200/30',
		accent: 'text-amber-600',
		badge: 'bg-amber-100 text-amber-700 ring-amber-200',
		dot: 'bg-amber-500', glow: 'bg-amber-200/50',
	},
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
		<Tilt rotationFactor={4} springOptions={{stiffness: 300, damping: 20}}>
			<Link
				to={`/app-store/${app.id}`}
				className={cn(
					'group relative block w-full overflow-hidden rounded-2xl',
					'border border-neutral-200/80',
					'transition-all duration-500',
					'hover:border-neutral-300 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]',
				)}
			>
				<Spotlight className='from-white/40 via-white/20 to-transparent' size={280} springOptions={{stiffness: 200, damping: 20}} />
				<div className={cn('absolute inset-0 bg-gradient-to-br', gradient.from, gradient.via, gradient.to)} />
				<div className={cn('absolute -right-16 -top-16 h-40 w-40 rounded-full blur-3xl transition-transform duration-700 group-hover:scale-125', gradient.orb1)} />
				<div className={cn('absolute -bottom-16 -left-16 h-40 w-40 rounded-full blur-3xl transition-transform duration-700 group-hover:scale-125', gradient.orb2)} />
				<div className='absolute inset-0 bg-gradient-to-r from-white/30 via-transparent to-transparent' />

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
						<h3 className='truncate text-xl font-bold tracking-tight text-neutral-900 md:text-2xl'>{app.name}</h3>
						<p className='mt-1 line-clamp-2 text-body-sm text-neutral-600'>{app.tagline}</p>
					</div>

					<svg className={cn('h-5 w-5 shrink-0 transition-all duration-300 group-hover:translate-x-1', gradient.accent)} fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2.5}>
						<path strokeLinecap='round' strokeLinejoin='round' d='M9 5l7 7-7 7' />
					</svg>
				</div>

				<div className='absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-1000 group-hover:translate-x-full' />
			</Link>
		</Tilt>
	)
}
