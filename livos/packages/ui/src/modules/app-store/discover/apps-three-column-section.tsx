import {useRef} from 'react'
import {Link} from 'react-router-dom'

import {AppIcon} from '@/components/app-icon'
import {FadeScroller} from '@/components/fade-scroller'
import {useColorThief} from '@/hooks/use-color-thief'
import {slideInFromBottomClass} from '@/modules/app-store/shared'
import {preloadFirstFewGalleryImages} from '@/modules/app-store/utils'
import {cn} from '@/shadcn-lib/utils'
import {RegistryApp} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

export type AppsThreeColumnSectionProps = {
	apps: RegistryApp[]
	overline?: string
	title: string
	description: string
	textLocation?: 'left' | 'right'
	children: React.ReactNode
}

export const AppsThreeColumnSection: React.FC<AppsThreeColumnSectionProps> = ({
	apps,
	overline,
	title,
	description,
	textLocation = 'left',
	children,
}) => {
	return (
		<section
			className={cn(
				slideInFromBottomClass,
				'relative overflow-hidden rounded-3xl',
				'border border-white/[0.08]',
				'bg-gradient-to-br from-white/[0.06] via-white/[0.02] to-transparent',
				'p-6 md:p-10',
			)}
		>
			{/* Background decoration */}
			<div className='absolute -right-20 -top-20 h-60 w-60 rounded-full bg-purple-500/10 blur-3xl' />
			<div className='absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-cyan-500/10 blur-3xl' />

			<div className='relative flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-12'>
				{/* Text content */}
				<div
					className={cn(
						'flex flex-col lg:w-[320px] lg:flex-shrink-0',
						textLocation === 'right' && 'lg:order-2',
					)}
				>
					{overline && (
						<p className='text-xs font-semibold uppercase tracking-wider text-purple-400/80'>
							{overline}
						</p>
					)}
					<h3 className='mt-2 text-2xl font-bold tracking-tight text-white md:text-3xl'>
						{title}
					</h3>
					<p className='mt-3 text-sm leading-relaxed text-white/50 md:text-base'>
						{description}
					</p>
					<div className='mt-6'>{children}</div>
				</div>

				{/* Apps showcase */}
				<FadeScroller
					direction='x'
					className='livinity-hide-scrollbar flex flex-1 gap-4 overflow-x-auto pb-2'
				>
					{apps.slice(0, 3).map((app, i) => (
						<FeaturedAppCard key={app?.id || i} app={app} index={i} />
					))}
				</FadeScroller>
			</div>
		</section>
	)
}

function FeaturedAppCard({app, index}: {app: RegistryApp | undefined; index: number}) {
	const iconRef = useRef<HTMLImageElement>(null)
	const colors = useColorThief(iconRef)

	if (!app) return null

	const gradientStart = colors?.[0] || '#6366f1'
	const gradientEnd = colors?.[1] || '#8b5cf6'

	return (
		<Link
			to={`/app-store/${app.id}`}
			className={cn(
				'group relative flex-shrink-0',
				'animate-in fade-in slide-in-from-right-8 fill-mode-both',
			)}
			style={{animationDelay: `${index * 100}ms`}}
			unstable_viewTransition
			onMouseEnter={() => preloadFirstFewGalleryImages(app)}
		>
			<div
				className={cn(
					'relative flex h-[280px] w-[180px] flex-col overflow-hidden rounded-2xl',
					'border border-white/[0.1]',
					'transition-all duration-500',
					'group-hover:border-white/[0.2]',
					'group-hover:shadow-[0_20px_60px_rgba(0,0,0,0.5)]',
					'group-hover:scale-105',
				)}
				style={{
					background: `
						linear-gradient(180deg, ${gradientStart}60 0%, ${gradientEnd}40 50%, rgba(0,0,0,0.4) 100%)
					`,
				}}
			>
				{/* Glow effect */}
				<div
					className='absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100'
					style={{
						background: `radial-gradient(circle at 50% 30%, ${gradientStart}40, transparent 70%)`,
					}}
				/>

				{/* Icon */}
				<div className='flex flex-1 items-center justify-center p-6'>
					<AppIcon
						ref={iconRef}
						src={app.icon}
						crossOrigin='anonymous'
						size={100}
						className={cn(
							'rounded-2xl',
							'shadow-[0_12px_40px_rgba(0,0,0,0.4)]',
							'ring-2 ring-white/20',
							'transition-all duration-500',
							'group-hover:scale-110 group-hover:shadow-[0_16px_50px_rgba(0,0,0,0.5)]',
						)}
					/>
				</div>

				{/* Content */}
				<div className='relative bg-black/30 p-4 backdrop-blur-sm'>
					<h4 className='truncate text-base font-bold text-white'>{app.name}</h4>
					<p className='mt-0.5 truncate text-xs text-white/50'>{app.developer}</p>
					<button
						className={cn(
							'mt-3 w-full rounded-lg py-2 text-sm font-semibold',
							'bg-white/10 text-white',
							'transition-colors duration-200',
							'group-hover:bg-white group-hover:text-black',
						)}
					>
						{t('app.view')}
					</button>
				</div>

				{/* Shine effect */}
				<div className='absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100' />
			</div>
		</Link>
	)
}

// Alternative: Horizontal featured section
export function FeaturedCategorySection({
	title,
	description,
	apps,
	categorySlug,
	gradient,
}: {
	title: string
	description: string
	apps: RegistryApp[]
	categorySlug?: string
	gradient?: string
}) {
	return (
		<section
			className={cn(
				slideInFromBottomClass,
				'relative overflow-hidden rounded-3xl p-6 md:p-8',
				'border border-white/[0.08]',
				gradient || 'bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-pink-500/5',
			)}
		>
			{/* Background orbs */}
			<div className='absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5 blur-3xl' />
			<div className='absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-white/5 blur-3xl' />

			<div className='relative'>
				<div className='mb-6'>
					<h3 className='text-2xl font-bold tracking-tight text-white md:text-3xl'>{title}</h3>
					<p className='mt-2 max-w-xl text-sm text-white/50 md:text-base'>{description}</p>
				</div>

				<div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
					{apps.slice(0, 3).map((app, i) => (
						<Link
							key={app.id}
							to={`/app-store/${app.id}`}
							className={cn(
								'group flex items-center gap-4 rounded-xl p-4',
								'bg-white/[0.05] border border-transparent',
								'transition-all duration-300',
								'hover:bg-white/[0.1] hover:border-white/[0.1]',
								'animate-in fade-in slide-in-from-bottom-4',
							)}
							style={{animationDelay: `${i * 80}ms`}}
						>
							<AppIcon
								src={app.icon}
								size={48}
								className='rounded-xl shadow-lg transition-transform duration-300 group-hover:scale-105'
							/>
							<div className='flex-1 min-w-0'>
								<h4 className='truncate font-semibold text-white'>{app.name}</h4>
								<p className='truncate text-sm text-white/40'>{app.developer}</p>
							</div>
							<span className='rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/60 transition-colors group-hover:bg-white group-hover:text-black'>
								View
							</span>
						</Link>
					))}
				</div>

				{categorySlug && (
					<Link
						to={`/app-store/category/${categorySlug}`}
						className='mt-6 inline-flex items-center gap-2 text-sm font-medium text-white/60 transition-colors hover:text-white'
					>
						Browse all apps
						<svg className='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
							<path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 5l7 7-7 7' />
						</svg>
					</Link>
				)}
			</div>
		</section>
	)
}
