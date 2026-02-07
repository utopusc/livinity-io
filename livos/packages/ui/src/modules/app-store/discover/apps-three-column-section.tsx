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
				'border border-border-subtle',
				'bg-surface-1',
				'p-6 md:p-10',
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
						<p className='text-caption font-semibold uppercase tracking-wider text-brand'>
							{overline}
						</p>
					)}
					<h3 className='mt-2 text-2xl font-bold tracking-tight text-text-primary md:text-3xl'>
						{title}
					</h3>
					<p className='mt-3 text-body-sm leading-relaxed text-text-secondary md:text-body-lg'>
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
					'border border-border-default',
					'transition-all duration-500',
					'group-hover:border-border-emphasis',
					'group-hover:shadow-elevation-lg',
					'group-hover:scale-105',
				)}
				style={{
					background: `
						linear-gradient(180deg, ${gradientStart}60 0%, ${gradientEnd}40 50%, rgba(0,0,0,0.4) 100%)
					`,
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
							'shadow-elevation-lg',
							'ring-2 ring-border-emphasis',
							'transition-all duration-500',
							'group-hover:scale-110 group-hover:shadow-elevation-xl',
						)}
					/>
				</div>

				{/* Content */}
				<div className='relative bg-black/30 p-4 backdrop-blur-sm'>
					<h4 className='truncate text-body-lg font-bold text-text-primary'>{app.name}</h4>
					<p className='mt-0.5 truncate text-caption text-text-tertiary'>{app.developer}</p>
					<button
						className={cn(
							'mt-3 w-full rounded-lg py-2 text-body-sm font-semibold',
							'bg-surface-2 text-text-primary',
							'transition-colors duration-200',
							'group-hover:bg-white group-hover:text-black',
						)}
					>
						{t('app.view')}
					</button>
				</div>

				{/* Shine effect */}
				<div className='absolute inset-0 bg-gradient-to-br from-surface-2 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100' />
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
				'border border-border-subtle',
				gradient || 'bg-surface-1',
			)}
		>
			<div className='relative'>
				<div className='mb-6'>
					<h3 className='text-2xl font-bold tracking-tight text-text-primary md:text-3xl'>{title}</h3>
					<p className='mt-2 max-w-xl text-body-sm text-text-secondary md:text-body-lg'>{description}</p>
				</div>

				<div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
					{apps.slice(0, 3).map((app, i) => (
						<Link
							key={app.id}
							to={`/app-store/${app.id}`}
							className={cn(
								'group flex items-center gap-4 rounded-xl p-4',
								'bg-surface-base border border-transparent',
								'transition-all duration-300',
								'hover:bg-surface-2 hover:border-border-default',
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
								<h4 className='truncate font-semibold text-text-primary'>{app.name}</h4>
								<p className='truncate text-body-sm text-text-tertiary'>{app.developer}</p>
							</div>
							<span className='rounded-full bg-surface-2 px-3 py-1 text-caption font-medium text-text-secondary transition-colors group-hover:bg-white group-hover:text-black'>
								View
							</span>
						</Link>
					))}
				</div>

				{categorySlug && (
					<Link
						to={`/app-store/category/${categorySlug}`}
						className='mt-6 inline-flex items-center gap-2 text-body-sm font-medium text-text-secondary transition-colors hover:text-white'
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
