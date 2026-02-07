import {ReactNode} from 'react'

import {AppIcon} from '@/components/app-icon'
import {SheetHeader, SheetTitle} from '@/shadcn-components/ui/sheet'
import {cn} from '@/shadcn-lib/utils'
import {tw} from '@/utils/tw'

// ─── Animations ─────────────────────────────────────────────────
export const slideInFromBottomClass = tw`animate-in fade-in slide-in-from-bottom-8 duration-300`
export const fadeInClass = tw`animate-in fade-in duration-500`
export const scaleInClass = tw`animate-in zoom-in-95 duration-300`

// ─── Card Styles ────────────────────────────────────────────────
const cardBaseClass = tw`rounded-2xl px-4 py-4 md:px-8 md:py-8`

// Clean card with semantic surface
export const cardClass = cn(
	cardBaseClass,
	tw`relative overflow-hidden`,
	tw`bg-surface-1`,
	tw`border border-border-subtle`,
	tw`shadow-elevation-sm`,
)

// Subtle card for secondary sections
export const cardFaintClass = cn(
	cardBaseClass,
	tw`bg-surface-base hover:bg-surface-1 transition-colors duration-300`,
	tw`border border-border-subtle`,
)

// Featured card with brand accent
export const cardFeaturedClass = cn(
	cardBaseClass,
	tw`relative overflow-hidden`,
	tw`bg-surface-2`,
	tw`border border-border-default`,
	tw`shadow-elevation-md`,
)

// ─── Grid Layouts ───────────────────────────────────────────────
export const appsGridClass = tw`grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
export const appsGridCompactClass = tw`grid gap-3 sm:grid-cols-2 lg:grid-cols-3`

// ─── Typography ─────────────────────────────────────────────────
export const sectionOverlineClass = tw`text-caption font-semibold uppercase tracking-wider text-brand mb-2`
export const sectionTitleClass = tw`text-2xl md:text-4xl font-bold text-text-primary`
export const sectionDescriptionClass = tw`text-body md:text-body-lg text-text-secondary mt-2 max-w-2xl`

// ─── Section Title Component ────────────────────────────────────
export function SectionTitle({
	overline,
	title,
	description,
	action,
}: {
	overline?: string
	title: ReactNode
	description?: string
	action?: ReactNode
}) {
	return (
		<div className='mb-6 flex flex-col gap-1 md:flex-row md:items-end md:justify-between'>
			<div>
				{overline && <p className={sectionOverlineClass}>{overline}</p>}
				<h3 className={sectionTitleClass}>{title}</h3>
				{description && <p className={sectionDescriptionClass}>{description}</p>}
			</div>
			{action && <div className='mt-4 md:mt-0'>{action}</div>}
		</div>
	)
}

// ─── App Store Layout Wrapper ───────────────────────────────────
export function AppStoreSheetInner({
	children,
	beforeHeaderChildren,
	titleRightChildren,
	title,
}: {
	children: ReactNode
	beforeHeaderChildren?: ReactNode
	titleRightChildren?: ReactNode
	title: string
}) {
	return (
		<div className='flex flex-col gap-6 md:gap-10'>
			{beforeHeaderChildren}
			<SheetHeader className='gap-5'>
				<div className='flex flex-col gap-x-5 gap-y-4 px-2 md:flex-row md:items-center md:px-0'>
					<SheetTitle className='flex-1 whitespace-nowrap text-3xl font-bold leading-none tracking-tight text-text-primary'>
						{title}
					</SheetTitle>
					{titleRightChildren}
				</div>
			</SheetHeader>
			<div className='space-y-8 md:space-y-12'>{children}</div>
		</div>
	)
}

// ─── App Card Components ────────────────────────────────────────
export function AppWithName({
	icon,
	appName,
	childrenRight,
	className,
}: {
	icon: string
	appName: ReactNode
	childrenRight?: ReactNode
	className?: string
}) {
	return (
		<div className={cn('flex w-full items-center gap-3', className)}>
			<AppIcon src={icon} size={40} className='rounded-xl shadow-lg' />
			<h3 className='flex-1 truncate text-body-sm font-semibold leading-tight tracking-tight'>{appName}</h3>
			{childrenRight}
		</div>
	)
}

// ─── Premium App Card ───────────────────────────────────────────
export function PremiumAppCard({
	icon,
	name,
	tagline,
	category,
	onClick,
}: {
	icon: string
	name: string
	tagline: string
	category?: string
	onClick?: () => void
}) {
	return (
		<button
			onClick={onClick}
			className={cn(
				'group relative flex flex-col items-start gap-4 p-5 text-left',
				'rounded-2xl border border-border-subtle',
				'bg-surface-1',
				'hover:bg-surface-2 hover:border-border-default hover:shadow-elevation-md',
				'transition-all duration-300 ease-out',
				'focus:outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20',
			)}
		>
			<div className='relative flex w-full items-start gap-4'>
				<AppIcon
					src={icon}
					size={56}
					className='rounded-xl shadow-elevation-sm ring-1 ring-border-default transition-transform duration-300 group-hover:scale-105'
				/>
				<div className='min-w-0 flex-1'>
					<h4 className='truncate text-body-lg font-semibold tracking-tight text-text-primary'>{name}</h4>
					<p className='mt-1 line-clamp-2 text-body-sm leading-snug text-text-tertiary'>{tagline}</p>
				</div>
			</div>

			{category && (
				<span className='rounded-full bg-surface-2 px-3 py-1 text-caption font-medium text-text-secondary'>
					{category}
				</span>
			)}
		</button>
	)
}

// ─── Featured App Spotlight ─────────────────────────────────────
export function FeaturedAppSpotlight({
	icon,
	name,
	tagline,
	description,
	gradient,
	onClick,
}: {
	icon: string
	name: string
	tagline: string
	description?: string
	gradient?: string
	onClick?: () => void
}) {
	return (
		<button
			onClick={onClick}
			className={cn(
				'group relative w-full overflow-hidden rounded-3xl p-6 md:p-8 text-left',
				'border border-border-default',
				'transition-all duration-500 ease-out',
				'hover:border-border-emphasis hover:shadow-elevation-lg',
				'focus:outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20',
				gradient || 'bg-surface-2',
			)}
		>
			{/* Subtle hover overlay */}
			<div className='absolute inset-0 bg-surface-base opacity-0 transition-opacity duration-500 group-hover:opacity-100' />

			<div className='relative flex flex-col gap-4 md:flex-row md:items-center md:gap-6'>
				<AppIcon
					src={icon}
					size={80}
					className='rounded-2xl shadow-elevation-md ring-2 ring-border-default transition-transform duration-500 group-hover:scale-110'
				/>
				<div className='flex-1'>
					<p className='text-caption font-semibold uppercase tracking-wider text-brand'>Featured</p>
					<h3 className='mt-1 text-2xl font-bold tracking-tight text-text-primary md:text-3xl'>{name}</h3>
					<p className='mt-2 text-body-lg text-text-primary'>{tagline}</p>
					{description && <p className='mt-3 text-body-sm text-text-secondary'>{description}</p>}
				</div>
				<div className='flex items-center gap-2 text-body-sm font-medium text-text-secondary transition-colors group-hover:text-text-primary'>
					<span>View App</span>
					<svg className='h-4 w-4 transition-transform group-hover:translate-x-1' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
						<path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 5l7 7-7 7' />
					</svg>
				</div>
			</div>
		</button>
	)
}

// ─── Category Pill ──────────────────────────────────────────────
export function CategoryPill({
	label,
	isActive,
	onClick,
	icon,
}: {
	label: string
	isActive?: boolean
	onClick?: () => void
	icon?: ReactNode
}) {
	return (
		<button
			onClick={onClick}
			className={cn(
				'flex items-center gap-2 rounded-full px-4 py-2 text-body-sm font-medium',
				'transition-all duration-200',
				'focus:outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20',
				isActive
					? 'bg-white text-black shadow-lg'
					: 'bg-surface-2 text-text-primary hover:bg-surface-3 hover:text-white',
			)}
		>
			{icon}
			{label}
		</button>
	)
}

// ─── Stats Badge ────────────────────────────────────────────────
export function StatsBadge({label, value, icon}: {label: string; value: string | number; icon?: ReactNode}) {
	return (
		<div className='flex items-center gap-3 rounded-xl bg-surface-1 px-4 py-3'>
			{icon && <div className='text-brand'>{icon}</div>}
			<div>
				<p className='text-lg font-bold text-text-primary'>{value}</p>
				<p className='text-caption text-text-tertiary'>{label}</p>
			</div>
		</div>
	)
}
