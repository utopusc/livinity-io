import {ReactNode} from 'react'
import {Link} from 'react-router-dom'

import {AppIcon} from '@/components/app-icon'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {
	appsGridClass,
	cardClass,
	cardFaintClass,
	SectionTitle,
	sectionTitleClass,
	slideInFromBottomClass,
} from '@/modules/app-store/shared'
import {preloadFirstFewGalleryImages} from '@/modules/app-store/utils'
import {cn} from '@/shadcn-lib/utils'
import {RegistryApp} from '@/trpc/trpc'

export function AppsGridSection({
	overline,
	title,
	apps,
	showAll = false,
}: {
	overline?: string
	title: ReactNode
	apps?: RegistryApp[]
	showAll?: boolean
}) {
	const isMobile = useIsMobile()
	const appsToShow = showAll ? (apps ?? []) : isMobile ? (apps ?? []).slice(0, 6) : (apps ?? []).slice(0, 8)

	return (
		<section className={cn(slideInFromBottomClass)}>
			<SectionTitle overline={overline} title={title} />
			<div className={appsGridClass}>
				{appsToShow.map((app, index) => (
					<AppWithDescription
						key={app.id}
						app={app}
						style={{animationDelay: `${index * 50}ms`}}
					/>
				))}
			</div>
		</section>
	)
}

export function AppsGridFaintSection({title, apps}: {title?: string; apps?: RegistryApp[]}) {
	return (
		<div className={cn(cardFaintClass, slideInFromBottomClass)}>
			{title && <h3 className={cn(sectionTitleClass, 'mb-6 px-2')}>{title}</h3>}
			<div className={appsGridClass}>
				{apps?.map((app, index) => (
					<AppWithDescription key={app.id} app={app} style={{animationDelay: `${index * 50}ms`}} />
				))}
			</div>
		</div>
	)
}

export function AppWithDescription({
	app,
	to,
	style,
}: {
	app: RegistryApp
	to?: string
	style?: React.CSSProperties
}) {
	return (
		<Link
			to={to ? to : `/app-store/${app.id}`}
			className={cn(
				'group relative flex w-full items-start gap-4 rounded-2xl p-4',
				'border border-transparent',
				'bg-transparent',
				'transition-all duration-300 ease-out',
				'hover:border-border-default hover:bg-surface-1',
				'hover:shadow-elevation-sm',
				'focus:outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20',
				'animate-in fade-in slide-in-from-bottom-4',
			)}
			style={style}
			unstable_viewTransition
			onMouseEnter={() => preloadFirstFewGalleryImages(app)}
		>
			<div className='relative'>
				<AppIcon
					src={app.icon}
					size={56}
					className={cn(
						'rounded-xl',
						'shadow-elevation-sm',
						'ring-1 ring-border-default',
						'transition-all duration-300',
						'group-hover:scale-105 group-hover:shadow-elevation-md',
					)}
				/>
			</div>

			<div className='flex min-w-0 flex-1 flex-col gap-1'>
				<h3 className='truncate text-body font-semibold tracking-tight text-text-primary transition-colors group-hover:text-white'>
					{app.name}
				</h3>
				<p className='line-clamp-2 text-body-sm leading-snug text-text-tertiary transition-colors group-hover:text-text-secondary'>
					{app.tagline}
				</p>
			</div>

			{/* Arrow indicator on hover */}
			<div className='absolute right-4 top-1/2 -translate-y-1/2 opacity-0 transition-all duration-300 group-hover:opacity-100'>
				<svg
					className='h-5 w-5 text-text-tertiary'
					fill='none'
					viewBox='0 0 24 24'
					stroke='currentColor'
				>
					<path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 5l7 7-7 7' />
				</svg>
			</div>
		</Link>
	)
}

// Featured app card with larger display
export function FeaturedAppCard({app, gradient}: {app: RegistryApp; gradient?: string}) {
	return (
		<Link
			to={`/app-store/${app.id}`}
			className={cn(
				'group relative flex flex-col overflow-hidden rounded-3xl p-6',
				'border border-border-default',
				'transition-all duration-500',
				'hover:border-border-emphasis hover:shadow-elevation-lg',
				gradient || 'bg-surface-2',
			)}
			unstable_viewTransition
			onMouseEnter={() => preloadFirstFewGalleryImages(app)}
		>
			{/* Background glow */}
			<div className='absolute -right-10 -top-10 h-32 w-32 rounded-full bg-surface-1 blur-3xl transition-all duration-500 group-hover:bg-surface-2' />

			<div className='relative flex items-start gap-4'>
				<AppIcon
					src={app.icon}
					size={72}
					className='rounded-2xl shadow-elevation-md ring-1 ring-border-emphasis transition-transform duration-300 group-hover:scale-105'
				/>
				<div className='flex-1'>
					<h3 className='text-xl font-bold tracking-tight text-text-primary'>{app.name}</h3>
					<p className='mt-1 text-body-sm text-text-secondary'>{app.tagline}</p>
				</div>
			</div>

			{app.description && (
				<p className='mt-4 line-clamp-2 text-body-sm text-text-tertiary'>{app.description}</p>
			)}
		</Link>
	)
}
