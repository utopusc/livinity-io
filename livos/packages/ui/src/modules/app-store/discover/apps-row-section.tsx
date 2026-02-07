import {useRef} from 'react'
import {Link} from 'react-router-dom'

import {AppIcon} from '@/components/app-icon'
import {useColorThief} from '@/hooks/use-color-thief'
import {SectionTitle, slideInFromBottomClass} from '@/modules/app-store/shared'
import {preloadFirstFewGalleryImages} from '@/modules/app-store/utils'
import {cn} from '@/shadcn-lib/utils'
import {RegistryApp} from '@/trpc/trpc'

export const AppsRowSection = ({
	overline,
	title,
	apps,
	description,
}: {
	overline?: string
	title: string
	apps: RegistryApp[]
	description?: string
}) => {
	return (
		<section className={cn(slideInFromBottomClass)}>
			<SectionTitle overline={overline} title={title} description={description} />
			<div className='livinity-hide-scrollbar -mx-[70px] flex flex-row gap-4 overflow-x-auto px-[70px] pb-4 md:gap-6'>
				{apps.map((app, i) => (
					<AppCard key={app.id} app={app} index={i} />
				))}
			</div>
		</section>
	)
}

function AppCard({app, index}: {app: RegistryApp; index: number}) {
	const iconRef = useRef<HTMLImageElement>(null)
	const colors = useColorThief(iconRef)

	// Generate a nice gradient from the icon colors or use default
	const gradientStart = colors?.[0] || '#6366f1'
	const gradientEnd = colors?.[1] || '#8b5cf6'

	return (
		<Link
			to={`/app-store/${app.id}`}
			onMouseEnter={() => preloadFirstFewGalleryImages(app)}
			className={cn(
				'group relative flex-shrink-0',
				'animate-in fade-in slide-in-from-right-8 fill-mode-both',
			)}
			style={{animationDelay: `${index * 80}ms`}}
		>
			{/* Main card container */}
			<div
				className={cn(
					'relative flex h-[180px] w-[280px] flex-col overflow-hidden rounded-2xl md:h-[220px] md:w-[360px]',
					'border border-border-default',
					'transition-all duration-500 ease-out',
					'group-hover:border-border-emphasis',
					'group-hover:shadow-elevation-lg',
					'group-hover:scale-[1.02]',
				)}
				style={{
					background: `linear-gradient(135deg, ${gradientStart}20 0%, ${gradientEnd}10 50%, transparent 100%)`,
				}}
			>
				{/* Floating icon */}
				<div className='absolute left-6 top-6 z-10'>
					<AppIcon
						ref={iconRef}
						src={app.icon}
						crossOrigin='anonymous'
						size={64}
						className={cn(
							'rounded-2xl',
							'shadow-elevation-md',
							'ring-2 ring-border-emphasis',
							'transition-all duration-500',
							'group-hover:scale-110 group-hover:shadow-elevation-lg',
						)}
					/>
				</div>

				{/* Content */}
				<div className='relative mt-auto p-6'>
					<h3 className='truncate text-xl font-bold tracking-tight text-text-primary md:text-2xl'>
						{app.name}
					</h3>
					<p className='mt-1 line-clamp-2 text-body-sm leading-snug text-text-secondary md:text-body-lg'>
						{app.tagline}
					</p>
				</div>

				{/* Shine effect */}
				<div className='absolute inset-0 bg-gradient-to-br from-surface-2 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100' />
			</div>
		</Link>
	)
}

// Compact horizontal list for quick browsing
export function AppsCompactRow({apps, title}: {apps: RegistryApp[]; title?: string}) {
	return (
		<section>
			{title && (
				<h4 className='mb-4 text-body-sm font-semibold uppercase tracking-wider text-text-tertiary'>{title}</h4>
			)}
			<div className='livinity-hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4'>
				{apps.map((app, i) => (
					<Link
						key={app.id}
						to={`/app-store/${app.id}`}
						className={cn(
							'group flex flex-shrink-0 items-center gap-3 rounded-xl p-3',
							'bg-surface-base border border-transparent',
							'transition-all duration-200',
							'hover:bg-surface-2 hover:border-border-default',
							'animate-in fade-in slide-in-from-right-4',
						)}
						style={{animationDelay: `${i * 50}ms`}}
					>
						<AppIcon
							src={app.icon}
							size={40}
							className='rounded-xl shadow-lg transition-transform duration-200 group-hover:scale-105'
						/>
						<div className='min-w-0'>
							<h4 className='truncate text-body-sm font-semibold text-text-primary'>{app.name}</h4>
							<p className='truncate text-caption text-text-tertiary'>{app.tagline}</p>
						</div>
					</Link>
				))}
			</div>
		</section>
	)
}
