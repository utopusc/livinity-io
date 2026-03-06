import {useRef} from 'react'
import {Link} from 'react-router-dom'

import {AppIcon} from '@/components/app-icon'
import {FadeScroller} from '@/components/fade-scroller'
import {Tilt} from '@/components/motion-primitives/tilt'
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
				'border border-neutral-200/80',
				'bg-gradient-to-br from-white to-neutral-50/80',
				'p-8 md:p-12',
			)}
		>
			<div className='relative flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-12'>
				{/* Text content */}
				<div
					className={cn(
						'flex flex-col lg:w-[320px] lg:flex-shrink-0',
						textLocation === 'right' && 'lg:order-2',
					)}
				>
					{overline && (
						<p className='text-[11px] font-bold uppercase tracking-[0.08em] text-brand'>
							{overline}
						</p>
					)}
					<h3 className='mt-2 text-2xl font-bold tracking-tight text-neutral-900 md:text-3xl'>
						{title}
					</h3>
					<p className='mt-3 text-body-sm leading-relaxed text-neutral-500 md:text-body'>
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
			<Tilt rotationFactor={8} springOptions={{stiffness: 300, damping: 20}}>
				<div
					className={cn(
						'relative flex h-[280px] w-[180px] flex-col overflow-hidden rounded-2xl',
						'border border-neutral-200/80',
						'transition-all duration-500',
						'group-hover:border-neutral-300',
						'group-hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)]',
					)}
					style={{
						background: `linear-gradient(180deg, ${gradientStart}25 0%, ${gradientEnd}15 50%, rgba(255,255,255,0.98) 100%)`,
					}}
				>
					{/* Icon */}
					<div className='flex flex-1 items-center justify-center p-6'>
						<AppIcon
							ref={iconRef}
							src={app.icon}
							crossOrigin='anonymous'
							size={100}
							className={cn(
								'rounded-2xl',
								'shadow-[0_4px_16px_rgba(0,0,0,0.12)]',
								'ring-1 ring-neutral-200/80',
								'transition-all duration-500',
								'group-hover:scale-110 group-hover:shadow-[0_6px_24px_rgba(0,0,0,0.15)]',
							)}
						/>
					</div>

					{/* Content */}
					<div className='relative bg-white/90 p-4 backdrop-blur-sm border-t border-neutral-100'>
						<h4 className='truncate text-body-lg font-bold text-neutral-900'>{app.name}</h4>
						<p className='mt-0.5 truncate text-caption text-neutral-500'>{app.developer}</p>
						<button
							className={cn(
								'mt-3 w-full rounded-lg py-2 text-body-sm font-semibold',
								'bg-neutral-100 text-neutral-700',
								'transition-colors duration-200',
								'group-hover:bg-neutral-200 group-hover:text-neutral-900',
							)}
						>
							{t('app.view')}
						</button>
					</div>

					{/* Shine effect */}
					<div className='absolute inset-0 bg-gradient-to-br from-white/50 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100' />
				</div>
			</Tilt>
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
				'border border-neutral-200/80',
				gradient || 'bg-gradient-to-br from-white to-neutral-50',
			)}
		>
			<div className='relative'>
				<div className='mb-6'>
					<h3 className='text-2xl font-bold tracking-tight text-neutral-900 md:text-3xl'>{title}</h3>
					<p className='mt-2 max-w-xl text-body-sm text-neutral-500 md:text-body'>{description}</p>
				</div>

				<div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
					{apps.slice(0, 3).map((app, i) => (
						<Link
							key={app.id}
							to={`/app-store/${app.id}`}
							className={cn(
								'group flex items-center gap-4 rounded-xl p-4',
								'bg-transparent border border-transparent',
								'transition-all duration-300',
								'hover:bg-neutral-50 hover:border-neutral-200/60',
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
								<h4 className='truncate font-semibold text-neutral-900'>{app.name}</h4>
								<p className='truncate text-body-sm text-neutral-500'>{app.developer}</p>
							</div>
							<span className='rounded-full bg-neutral-100 px-3 py-1 text-caption font-medium text-neutral-600 transition-colors group-hover:bg-neutral-200 group-hover:text-neutral-900'>
								View
							</span>
						</Link>
					))}
				</div>

				{categorySlug && (
					<Link
						to={`/app-store/category/${categorySlug}`}
						className='mt-6 inline-flex items-center gap-2 text-body-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900'
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
