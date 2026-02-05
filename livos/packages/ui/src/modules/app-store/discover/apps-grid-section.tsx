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
				'bg-gradient-to-br from-white/[0.02] to-transparent',
				'transition-all duration-300 ease-out',
				'hover:border-white/[0.1] hover:bg-white/[0.06]',
				'hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)]',
				'focus:outline-none focus:ring-2 focus:ring-purple-500/40',
				'animate-in fade-in slide-in-from-bottom-4',
			)}
			style={style}
			unstable_viewTransition
			onMouseEnter={() => preloadFirstFewGalleryImages(app)}
		>
			{/* Subtle glow on hover */}
			<div className='absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-500/0 via-transparent to-cyan-500/0 opacity-0 transition-opacity duration-300 group-hover:opacity-5' />

			<div className='relative'>
				<AppIcon
					src={app.icon}
					size={56}
					className={cn(
						'rounded-xl',
						'shadow-[0_4px_12px_rgba(0,0,0,0.25)]',
						'ring-1 ring-white/10',
						'transition-all duration-300',
						'group-hover:scale-105 group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)]',
					)}
				/>
				{/* Icon glow */}
				<div className='absolute -inset-2 -z-10 rounded-2xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-40' />
			</div>

			<div className='flex min-w-0 flex-1 flex-col gap-1'>
				<h3 className='truncate text-[15px] font-semibold tracking-tight text-white transition-colors group-hover:text-white'>
					{app.name}
				</h3>
				<p className='line-clamp-2 text-[13px] leading-snug text-white/40 transition-colors group-hover:text-white/55'>
					{app.tagline}
				</p>
			</div>

			{/* Arrow indicator on hover */}
			<div className='absolute right-4 top-1/2 -translate-y-1/2 opacity-0 transition-all duration-300 group-hover:opacity-100'>
				<svg
					className='h-5 w-5 text-white/40'
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
				'border border-white/[0.1]',
				'transition-all duration-500',
				'hover:border-white/[0.2] hover:shadow-[0_20px_50px_rgba(0,0,0,0.4)]',
				gradient || 'bg-gradient-to-br from-purple-600/20 via-blue-600/10 to-cyan-600/5',
			)}
			unstable_viewTransition
			onMouseEnter={() => preloadFirstFewGalleryImages(app)}
		>
			{/* Background glow */}
			<div className='absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/5 blur-3xl transition-all duration-500 group-hover:bg-white/10' />

			<div className='relative flex items-start gap-4'>
				<AppIcon
					src={app.icon}
					size={72}
					className='rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.3)] ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-105'
				/>
				<div className='flex-1'>
					<h3 className='text-xl font-bold tracking-tight text-white'>{app.name}</h3>
					<p className='mt-1 text-sm text-white/60'>{app.tagline}</p>
				</div>
			</div>

			{app.description && (
				<p className='mt-4 line-clamp-2 text-sm text-white/40'>{app.description}</p>
			)}
		</Link>
	)
}
