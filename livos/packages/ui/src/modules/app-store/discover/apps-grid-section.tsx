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
				'transition-all duration-200 ease-out',
				'hover:bg-white hover:border-neutral-200/80 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]',
				'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
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
						'rounded-[14px]',
						'shadow-[0_1px_4px_rgba(0,0,0,0.08)]',
						'ring-1 ring-neutral-200/60',
						'transition-all duration-200',
						'group-hover:scale-105 group-hover:shadow-[0_2px_8px_rgba(0,0,0,0.1)]',
					)}
				/>
			</div>

			<div className='flex min-w-0 flex-1 flex-col gap-1'>
				<h3 className='truncate text-body font-semibold tracking-tight text-neutral-900'>
					{app.name}
				</h3>
				<p className='line-clamp-2 text-body-sm leading-snug text-neutral-500 group-hover:text-neutral-600'>
					{app.tagline}
				</p>
			</div>

			{/* Arrow indicator on hover */}
			<div className='absolute right-4 top-1/2 -translate-y-1/2 opacity-0 transition-all duration-300 group-hover:opacity-100'>
				<svg
					className='h-5 w-5 text-neutral-400'
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
				'bg-gradient-to-br from-neutral-50 to-white',
				'border border-neutral-200/80',
				'transition-all duration-500',
				'hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]',
				gradient,
			)}
			unstable_viewTransition
			onMouseEnter={() => preloadFirstFewGalleryImages(app)}
		>
			{/* Background glow */}
			<div className='absolute -right-10 -top-10 h-32 w-32 rounded-full bg-neutral-100/60 blur-3xl transition-all duration-500 group-hover:bg-neutral-200/40' />

			<div className='relative flex items-start gap-4'>
				<AppIcon
					src={app.icon}
					size={72}
					className='rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200/80 transition-transform duration-300 group-hover:scale-105'
				/>
				<div className='flex-1'>
					<h3 className='text-xl font-bold tracking-tight text-neutral-900'>{app.name}</h3>
					<p className='mt-1 text-body-sm text-neutral-500'>{app.tagline}</p>
				</div>
			</div>

			{app.description && (
				<p className='mt-4 line-clamp-2 text-body-sm text-neutral-500'>{app.description}</p>
			)}
		</Link>
	)
}
