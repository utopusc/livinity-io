import {ReactNode, useRef} from 'react'

import {AppIcon} from '@/components/app-icon'
import {FadeScroller} from '@/components/fade-scroller'
import {WindowAwareLink} from '@/components/window-aware-link'
import {useColorThief} from '@/hooks/use-color-thief'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {
	appsGridClass,
	cardClass,
	cardFaintClass,
	sectionOverlineClass,
	SectionTitle,
	sectionTitleClass,
} from '@/modules/app-store/shared'
import {preloadFirstFewGalleryImages} from '@/modules/app-store/utils'
import {Button} from '@/shadcn-components/ui/button'
import {cn} from '@/shadcn-lib/utils'
import {RegistryApp} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

// App with description - used in grid sections
export function AppWithDescriptionWindow({app, to}: {app: RegistryApp; to?: string}) {
	return (
		<WindowAwareLink
			to={to ? to : `/${app.id}`}
			className='group flex w-full items-start gap-2.5 rounded-radius-xl p-2.5 outline-none hover:bg-surface-base focus:bg-surface-base'
			onMouseEnter={() => preloadFirstFewGalleryImages(app)}
		>
			<AppIcon src={app.icon} size={48} className='rounded-radius-md md:w-[55px]' />
			<div className='flex min-w-0 flex-1 flex-col'>
				<h3 className='truncate text-body-sm font-bold -tracking-3 md:text-body'>{app.name}</h3>
				<p className='line-clamp-2 w-full min-w-0 text-caption leading-tight text-text-tertiary md:text-body-sm'>{app.tagline}</p>
			</div>
		</WindowAwareLink>
	)
}

// Grid section
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
	return (
		<div className={cardClass}>
			<SectionTitle overline={overline} title={title} />
			<div className={appsGridClass}>
				{appsToShow.map((app) => (
					<AppWithDescriptionWindow key={app.id} app={app} />
				))}
			</div>
		</div>
	)
}

export function AppsGridFaintSectionWindow({title, apps}: {title?: string; apps?: RegistryApp[]}) {
	return (
		<div className={cardFaintClass}>
			{title && <h3 className={cn(sectionTitleClass, 'p-2.5')}>{title}</h3>}
			<div className={appsGridClass}>
				{apps?.map((app) => <AppWithDescriptionWindow key={app.id} app={app} />)}
			</div>
		</div>
	)
}

// Row section
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
		<div>
			<SectionTitle overline={overline} title={title} />
			<div className='livinity-hide-scrollbar -mx-[70px] mt-3 flex flex-row gap-3 overflow-x-auto px-[70px] md:gap-[40px]'>
				{apps.map((app, i) => (
					<AppRowItemWindow key={app.id} app={app} index={i} />
				))}
			</div>
		</div>
	)
}

function AppRowItemWindow({app, index}: {app: RegistryApp; index: number}) {
	const iconRef = useRef<HTMLImageElement>(null)
	const colors = useColorThief(iconRef)

	return (
		<WindowAwareLink
			to={`/${app.id}`}
			onMouseEnter={() => preloadFirstFewGalleryImages(app)}
			className='duration-200 animate-in fade-in slide-in-from-right-10 fill-mode-both'
			style={{animationDelay: `${index * 0.1}s`}}
		>
			<AppIcon
				ref={iconRef}
				src={app.icon}
				crossOrigin='anonymous'
				className='relative z-10 -mb-[30px] ml-[27px] w-[60px] rounded-radius-md md:mb-[-50px] md:w-[100px] md:rounded-radius-xl'
				style={{
					filter: 'drop-shadow(0px 18px 24px rgba(0, 0, 0, 0.12))',
				}}
			/>
			<div
				className='relative flex h-[150px] w-[267px] flex-col justify-start overflow-hidden rounded-radius-xl p-[27px] md:h-[188px] md:w-[345px]'
				style={{
					background: `radial-gradient(circle farthest-side at 30% 10%, rgba(255,255,255,0.13), transparent), linear-gradient(123deg, ${
						colors ? colors[0] : 'rgba(36,36,36,0.6)'
					}, ${colors ? colors[1] : 'rgba(24,24,24,0.6)'})`,
				}}
			>
				<h3 className='mt-3 truncate text-24 font-semibold -tracking-3 md:mt-8 md:text-[28px]'>{app.name}</h3>
				<p className='line-clamp-2 text-caption -tracking-4 text-text-primary md:text-body-lg'>{app.tagline}</p>
			</div>
		</WindowAwareLink>
	)
}

// Three column section
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
		<div
			className={cn(
				cardClass,
				'flex flex-wrap justify-center gap-x-16 gap-y-8 overflow-hidden p-4 text-center xl:flex-nowrap xl:text-left',
			)}
		>
			<div
				className={cn(
					'flex w-full flex-col items-center justify-center md:w-auto xl:items-start',
					textLocation === 'right' && 'xl:order-2',
				)}
			>
				<p className={sectionOverlineClass}>{overline}</p>
				<h3 className={sectionTitleClass}>{title}</h3>
				<p className='max-w-md text-body text-text-secondary'>{description}</p>
				<div className='pt-5' />
				{children}
			</div>
			<FadeScroller direction='x' className='livinity-hide-scrollbar flex gap-5 overflow-x-auto md:w-auto md:shrink-0'>
				<ColorAppWindow app={apps[0]} />
				<ColorAppWindow app={apps[1]} />
				<ColorAppWindow app={apps[2]} />
			</FadeScroller>
		</div>
	)
}

function ColorAppWindow({app, className}: {app: RegistryApp | undefined; className?: string}) {
	const iconRef = useRef<HTMLImageElement>(null)
	const colors = useColorThief(iconRef)

	if (!app) return null

	return (
		<div className={cn('relative', colors)}>
			<WindowAwareLink
				to={`/${app.id}`}
				className={cn('flex h-[268px] w-40 flex-col justify-stretch rounded-radius-xl bg-surface-2 px-3 py-4', className)}
				style={{
					backgroundImage: colors
						? `linear-gradient(to bottom, ${colors.join(', ')})`
						: 'linear-gradient(to bottom, rgba(36,36,36,0.6), rgba(24,24,24,0.6))',
				}}
				onMouseEnter={() => preloadFirstFewGalleryImages(app)}
			>
				<AppIcon
					ref={iconRef}
					src={app.icon}
					crossOrigin='anonymous'
					size={128}
					className='shrink-0 self-center rounded-radius-xl'
					style={{
						filter: `drop-shadow(0px 8px 12.000000953674316px rgba(31, 33, 36, 0.32))`,
					}}
				/>
				<div className='flex-1' />
				<h3 className='font-16 truncate font-bold'>{app.name}</h3>
				<p className='truncate text-body-sm -tracking-3 text-text-tertiary'>{app.developer}</p>
				<Button size='sm' variant='secondary' className='mt-2'>
					{t('app.view')}
				</Button>
			</WindowAwareLink>
		</div>
	)
}
