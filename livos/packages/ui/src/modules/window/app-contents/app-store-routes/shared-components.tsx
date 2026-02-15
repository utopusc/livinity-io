import {ReactNode, useRef} from 'react'

import {AppIcon} from '@/components/app-icon'
import {WindowAwareLink} from '@/components/window-aware-link'
import {useColorThief} from '@/hooks/use-color-thief'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {
	appsGridClass,
	sectionOverlineClass,
	SectionTitle,
	sectionTitleClass,
	cardFaintClass,
} from '@/modules/app-store/shared'
import {preloadFirstFewGalleryImages} from '@/modules/app-store/utils'
import {cn} from '@/shadcn-lib/utils'
import {RegistryApp} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

// ─── App Card — used in search results & fallback grids ─────────
export function AppWithDescriptionWindow({app, to}: {app: RegistryApp; to?: string}) {
	return (
		<WindowAwareLink
			to={to ? to : `/${app.id}`}
			className={cn(
				'group flex w-full items-start gap-3 rounded-xl p-3',
				'transition-all duration-200 ease-out',
				'hover:bg-surface-2',
				'outline-none focus-visible:ring-2 focus-visible:ring-brand/20',
			)}
			onMouseEnter={() => preloadFirstFewGalleryImages(app)}
		>
			<AppIcon
				src={app.icon}
				size={48}
				className={cn(
					'rounded-xl md:w-[52px]',
					'shadow-sm',
					'transition-transform duration-200',
					'group-hover:scale-105',
				)}
			/>
			<div className='flex min-w-0 flex-1 flex-col gap-0.5'>
				<h3 className='truncate text-body-sm font-semibold tracking-tight text-text-primary md:text-body'>
					{app.name}
				</h3>
				<p className='line-clamp-2 w-full min-w-0 text-caption leading-snug text-text-tertiary md:text-body-sm'>
					{app.tagline}
				</p>
			</div>
		</WindowAwareLink>
	)
}

// ─── Featured Grid Card — horizontal with color accent bar ──────
function FeaturedGridCard({app}: {app: RegistryApp}) {
	const iconRef = useRef<HTMLImageElement>(null)
	const colors = useColorThief(iconRef)
	const accent = colors?.[0] || 'rgba(99,102,241,0.5)'

	return (
		<WindowAwareLink
			to={`/${app.id}`}
			className={cn(
				'group flex items-center gap-4 overflow-hidden rounded-2xl',
				'bg-surface-2/50',
				'border border-border-subtle',
				'p-4',
				'transition-all duration-300',
				'hover:border-border-default hover:shadow-elevation-md',
				'hover:-translate-y-0.5',
			)}
			onMouseEnter={() => preloadFirstFewGalleryImages(app)}
		>
			<div
				className='w-1 self-stretch rounded-full flex-shrink-0 transition-all duration-300 group-hover:w-1.5'
				style={{background: accent}}
			/>
			<AppIcon
				ref={iconRef}
				src={app.icon}
				crossOrigin='anonymous'
				size={52}
				className={cn(
					'flex-shrink-0 rounded-xl',
					'shadow-sm',
					'transition-transform duration-300',
					'group-hover:scale-110',
					'md:w-[56px] md:h-[56px]',
				)}
			/>
			<div className='flex min-w-0 flex-1 flex-col gap-0.5'>
				<h3 className='truncate text-body font-bold tracking-tight text-text-primary'>
					{app.name}
				</h3>
				<p className='line-clamp-2 text-body-sm leading-snug text-text-secondary'>
					{app.tagline}
				</p>
			</div>
		</WindowAwareLink>
	)
}

// ─── Compact Card — vertical icon + name ────────────────────────
function CompactAppCard({app}: {app: RegistryApp}) {
	return (
		<WindowAwareLink
			to={`/${app.id}`}
			className={cn(
				'group flex flex-col items-center gap-2 rounded-xl p-3',
				'transition-all duration-200',
				'hover:bg-surface-2',
			)}
			onMouseEnter={() => preloadFirstFewGalleryImages(app)}
		>
			<AppIcon
				src={app.icon}
				size={44}
				className={cn(
					'rounded-[12px]',
					'shadow-sm',
					'transition-all duration-200',
					'group-hover:scale-110 group-hover:shadow-elevation-sm',
				)}
			/>
			<span className='max-w-full truncate text-center text-caption font-medium text-text-primary'>
				{app.name}
			</span>
		</WindowAwareLink>
	)
}

// ─── Grid Section — Bento Layout (featured + compact) ───────────
export function AppsGridSectionWindow({
	overline,
	title,
	apps,
}: {
	overline: string
	title: ReactNode
	apps?: RegistryApp[]
}) {
	const isMobile = useIsMobile()
	const appsToShow = isMobile ? (apps ?? []).slice(0, 6) : apps ?? []
	const featured = appsToShow.slice(0, 2)
	const rest = appsToShow.slice(2)

	return (
		<section
			className={cn(
				'rounded-2xl p-4 md:p-6',
				'bg-surface-1',
				'border border-border-subtle',
				'animate-in fade-in slide-in-from-bottom-6 duration-500',
			)}
		>
			<SectionTitle overline={overline} title={title} />

			{/* Featured — two large horizontal accent cards */}
			<div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
				{featured.map((app) => (
					<FeaturedGridCard key={app.id} app={app} />
				))}
			</div>

			{/* Rest — compact vertical icon grid */}
			{rest.length > 0 && (
				<div className='mt-4 grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-6'>
					{rest.map((app) => (
						<CompactAppCard key={app.id} app={app} />
					))}
				</div>
			)}
		</section>
	)
}

export function AppsGridFaintSectionWindow({title, apps}: {title?: string; apps?: RegistryApp[]}) {
	return (
		<div className={cn(cardFaintClass, 'animate-in fade-in slide-in-from-bottom-6 duration-500')}>
			{title && <h3 className={cn(sectionTitleClass, 'p-2.5')}>{title}</h3>}
			<div className={appsGridClass}>
				{apps?.map((app) => <AppWithDescriptionWindow key={app.id} app={app} />)}
			</div>
		</div>
	)
}

// ─── Row Section — Wide Panoramic Landscape Cards ───────────────
export function AppsRowSectionWindow({
	overline,
	title,
	apps,
}: {
	overline: string
	title: string
	apps: RegistryApp[]
}) {
	return (
		<section className='animate-in fade-in slide-in-from-bottom-6 duration-500'>
			<SectionTitle overline={overline} title={title} />
			<div className='livinity-hide-scrollbar -mx-[70px] mt-3 flex flex-row gap-4 overflow-x-auto px-[70px] pb-2 md:gap-5'>
				{apps.map((app, i) => (
					<PanoramicCard key={app.id} app={app} index={i} />
				))}
			</div>
		</section>
	)
}

function PanoramicCard({app, index}: {app: RegistryApp; index: number}) {
	const iconRef = useRef<HTMLImageElement>(null)
	const colors = useColorThief(iconRef)

	const c1 = colors?.[0] || 'rgba(80,80,120,0.8)'
	const c2 = colors?.[1] || 'rgba(50,50,80,0.8)'

	return (
		<WindowAwareLink
			to={`/${app.id}`}
			onMouseEnter={() => preloadFirstFewGalleryImages(app)}
			className={cn(
				'group relative flex-shrink-0',
				'animate-in fade-in slide-in-from-right-8 fill-mode-both',
			)}
			style={{animationDelay: `${index * 80}ms`}}
		>
			<div
				className={cn(
					'relative flex h-[110px] w-[270px] items-center gap-4 overflow-hidden rounded-2xl',
					'md:h-[120px] md:w-[310px]',
					'border border-border-subtle',
					'transition-all duration-400 ease-out',
					'group-hover:border-border-default',
					'group-hover:shadow-elevation-lg',
					'group-hover:scale-[1.03]',
				)}
				style={{
					background: `linear-gradient(135deg, ${c1}, ${c2})`,
				}}
			>
				{/* Decorative blobs — asymmetric shapes */}
				<div className='absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/[0.06]' />
				<div className='absolute -bottom-6 right-1/4 h-20 w-20 rounded-full bg-white/[0.04]' />

				{/* Icon — left-aligned, vertically centered */}
				<div className='relative z-10 pl-5'>
					<AppIcon
						ref={iconRef}
						src={app.icon}
						crossOrigin='anonymous'
						size={48}
						className={cn(
							'flex-shrink-0 rounded-xl',
							'shadow-elevation-md',
							'transition-transform duration-400',
							'group-hover:scale-110',
							'md:w-[56px] md:h-[56px]',
						)}
					/>
				</div>

				{/* Text — right side */}
				<div className='relative z-10 flex min-w-0 flex-1 flex-col pr-5'>
					<h3 className='truncate text-body font-bold tracking-tight text-white md:text-lg'>
						{app.name}
					</h3>
					<p className='mt-0.5 line-clamp-2 text-caption text-white/65 md:text-body-sm'>
						{app.tagline}
					</p>
				</div>
			</div>
		</WindowAwareLink>
	)
}

// ─── Three Column Section — Fan Showcase ────────────────────────
export type AppsThreeColumnSectionWindowProps = {
	apps: RegistryApp[]
	overline: string
	title: string
	description: string
	textLocation?: 'left' | 'right'
	children: React.ReactNode
}

export function AppsThreeColumnSectionWindow({
	apps,
	overline,
	title,
	description,
	textLocation = 'left',
	children,
}: AppsThreeColumnSectionWindowProps) {
	return (
		<section
			className={cn(
				'overflow-hidden rounded-2xl',
				'bg-surface-1',
				'border border-border-subtle',
				'p-5 md:p-8',
				'animate-in fade-in slide-in-from-bottom-6 duration-500',
			)}
		>
			<div className='flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-12'>
				{/* Text side */}
				<div
					className={cn(
						'flex flex-col lg:w-[280px] lg:flex-shrink-0',
						textLocation === 'right' && 'lg:order-2',
					)}
				>
					<p className={sectionOverlineClass}>{overline}</p>
					<h3 className='mt-1 text-2xl font-bold tracking-tight text-text-primary md:text-3xl'>{title}</h3>
					<p className='mt-3 text-body-sm leading-relaxed text-text-secondary md:text-body'>{description}</p>
					<div className='mt-6'>{children}</div>
				</div>

				{/* Fan showcase cards — center elevated, sides tilted */}
				<div className='flex flex-1 items-end justify-center gap-3 py-8 md:gap-4'>
					{apps.slice(0, 3).map((app, i) => (
						<ShowcaseCard key={app?.id || i} app={app} index={i} />
					))}
				</div>
			</div>
		</section>
	)
}

const SHOWCASE_CONFIGS = [
	{rotate: -5, translateY: 0, width: 'w-[150px]', height: 'h-[235px]', iconSize: 80},
	{rotate: 0, translateY: -16, width: 'w-[170px]', height: 'h-[270px]', iconSize: 100},
	{rotate: 5, translateY: 0, width: 'w-[150px]', height: 'h-[235px]', iconSize: 80},
]

function ShowcaseCard({app, index}: {app: RegistryApp | undefined; index: number}) {
	const iconRef = useRef<HTMLImageElement>(null)
	const colors = useColorThief(iconRef)

	if (!app) return null

	const c1 = colors?.[0] || 'rgba(80,80,120,0.9)'
	const c2 = colors?.[1] || 'rgba(50,50,80,0.9)'
	const config = SHOWCASE_CONFIGS[index] || SHOWCASE_CONFIGS[0]

	return (
		<WindowAwareLink
			to={`/${app.id}`}
			className={cn(
				'group relative flex-shrink-0',
				'transition-all duration-500 ease-out',
				'hover:z-10',
			)}
			style={{
				transform: `rotate(${config.rotate}deg) translateY(${config.translateY}px)`,
			}}
			onMouseEnter={() => preloadFirstFewGalleryImages(app)}
		>
			<div
				className={cn(
					'relative flex flex-col overflow-hidden rounded-2xl',
					config.width,
					config.height,
					'border border-border-subtle',
					'transition-all duration-400',
					'group-hover:border-border-default',
					'group-hover:shadow-elevation-lg',
					'group-hover:scale-110',
				)}
				style={{
					background: `radial-gradient(circle at 50% 30%, rgba(255,255,255,0.12), transparent 70%), linear-gradient(180deg, ${c1}, ${c2})`,
				}}
			>
				{/* Icon centered */}
				<div className='flex flex-1 items-center justify-center p-4'>
					<AppIcon
						ref={iconRef}
						src={app.icon}
						crossOrigin='anonymous'
						size={config.iconSize}
						className={cn(
							'rounded-2xl',
							'shadow-elevation-md',
							'transition-transform duration-400',
							'group-hover:scale-110',
						)}
					/>
				</div>

				{/* Info at bottom */}
				<div className='px-3 pb-3'>
					<h4 className='truncate text-body-sm font-bold text-white'>{app.name}</h4>
					<p className='truncate text-caption text-white/55'>{app.developer}</p>
					<div className='mt-1.5 flex items-center justify-center rounded-lg bg-white/10 py-1.5 text-caption font-medium text-white/90 backdrop-blur-sm transition-colors group-hover:bg-white/20'>
						{t('app.view')}
					</div>
				</div>
			</div>
		</WindowAwareLink>
	)
}
