import {useRef} from 'react'
import {Link} from 'react-router-dom'

import {AppIcon} from '@/components/app-icon'
import {Spotlight} from '@/components/motion-primitives/spotlight'
import {Tilt} from '@/components/motion-primitives/tilt'
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
			<Tilt rotationFactor={5} springOptions={{stiffness: 300, damping: 20}}>
				{/* Main card container */}
				<div
					className={cn(
						'relative flex h-[200px] w-[300px] flex-col overflow-hidden rounded-2xl md:h-[240px] md:w-[380px]',
						'border border-neutral-200/80',
						'transition-all duration-300 ease-out',
						'group-hover:border-neutral-300',
						'group-hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)]',
					)}
					style={{
						background: `linear-gradient(145deg, ${gradientStart}15 0%, ${gradientEnd}08 60%, rgba(255,255,255,0.95) 100%)`,
					}}
				>
					<Spotlight className='from-white/40 via-white/20 to-transparent' size={250} springOptions={{stiffness: 200, damping: 20}} />
					{/* Floating icon */}
					<div className='absolute left-7 top-7 z-10'>
						<AppIcon
							ref={iconRef}
							src={app.icon}
							crossOrigin='anonymous'
							size={64}
							className={cn(
								'rounded-[16px]',
								'shadow-[0_4px_12px_rgba(0,0,0,0.12)]',
								'ring-1 ring-neutral-200/80',
								'transition-all duration-300',
								'group-hover:scale-110 group-hover:shadow-[0_6px_20px_rgba(0,0,0,0.15)]',
							)}
						/>
					</div>

					{/* Content */}
					<div className='relative mt-auto p-6'>
						<h3 className='truncate text-xl font-bold tracking-tight text-neutral-900 md:text-2xl'>
							{app.name}
						</h3>
						<p className='mt-1 line-clamp-2 text-body-sm leading-snug text-neutral-500 md:text-body'>
							{app.tagline}
						</p>
					</div>

					{/* Shine effect */}
					<div className='absolute inset-0 bg-gradient-to-br from-white/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100' />
				</div>
			</Tilt>
		</Link>
	)
}

// Compact horizontal list for quick browsing
export function AppsCompactRow({apps, title}: {apps: RegistryApp[]; title?: string}) {
	return (
		<section>
			{title && (
				<h4 className='mb-4 text-body-sm font-semibold uppercase tracking-wider text-neutral-400'>{title}</h4>
			)}
			<div className='livinity-hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4'>
				{apps.map((app, i) => (
					<Link
						key={app.id}
						to={`/app-store/${app.id}`}
						className={cn(
							'group flex flex-shrink-0 items-center gap-3 rounded-xl p-3',
							'bg-transparent border border-transparent',
							'transition-all duration-200',
							'hover:bg-white hover:border-neutral-200/80 hover:shadow-sm',
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
							<h4 className='truncate text-body-sm font-semibold text-neutral-900'>{app.name}</h4>
							<p className='truncate text-caption text-neutral-500'>{app.tagline}</p>
						</div>
					</Link>
				))}
			</div>
		</section>
	)
}
