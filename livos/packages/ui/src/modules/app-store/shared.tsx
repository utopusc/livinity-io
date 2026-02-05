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

// Premium glass card with gradient border
export const cardClass = cn(
	cardBaseClass,
	tw`relative overflow-hidden`,
	tw`bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-transparent`,
	tw`backdrop-blur-xl`,
	tw`border border-white/[0.08]`,
	tw`shadow-[0_8px_32px_rgba(0,0,0,0.4)]`,
)

// Subtle card for secondary sections
export const cardFaintClass = cn(
	cardBaseClass,
	tw`bg-white/[0.03] hover:bg-white/[0.05] transition-colors duration-300`,
	tw`border border-white/[0.05]`,
)

// Featured card with accent glow
export const cardFeaturedClass = cn(
	cardBaseClass,
	tw`relative overflow-hidden`,
	tw`bg-gradient-to-br from-purple-500/20 via-blue-500/10 to-cyan-500/5`,
	tw`backdrop-blur-xl`,
	tw`border border-purple-500/20`,
	tw`shadow-[0_8px_32px_rgba(139,92,246,0.15)]`,
)

// ─── Grid Layouts ───────────────────────────────────────────────
export const appsGridClass = tw`grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
export const appsGridCompactClass = tw`grid gap-3 sm:grid-cols-2 lg:grid-cols-3`

// ─── Typography ─────────────────────────────────────────────────
export const sectionOverlineClass = tw`text-xs font-semibold uppercase tracking-wider text-purple-400/80 mb-2`
export const sectionTitleClass = tw`text-2xl md:text-4xl font-bold bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent`
export const sectionDescriptionClass = tw`text-sm md:text-base text-white/50 mt-2 max-w-2xl`

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
					<SheetTitle className='flex-1 whitespace-nowrap text-3xl font-bold leading-none tracking-tight'>
						<span className='bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent'>
							{title}
						</span>
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
			<h3 className='flex-1 truncate text-sm font-semibold leading-tight tracking-tight'>{appName}</h3>
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
				'rounded-2xl border border-white/[0.08]',
				'bg-gradient-to-br from-white/[0.06] to-transparent',
				'hover:from-white/[0.1] hover:to-white/[0.02]',
				'hover:border-white/[0.15] hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]',
				'transition-all duration-300 ease-out',
				'focus:outline-none focus:ring-2 focus:ring-purple-500/50',
			)}
		>
			{/* Hover glow effect */}
			<div className='absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-500/0 to-cyan-500/0 opacity-0 transition-opacity duration-300 group-hover:opacity-10' />

			<div className='relative flex w-full items-start gap-4'>
				<AppIcon
					src={icon}
					size={56}
					className='rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.3)] ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-105'
				/>
				<div className='min-w-0 flex-1'>
					<h4 className='truncate text-base font-semibold tracking-tight text-white'>{name}</h4>
					<p className='mt-1 line-clamp-2 text-sm leading-snug text-white/50'>{tagline}</p>
				</div>
			</div>

			{category && (
				<span className='rounded-full bg-white/[0.08] px-3 py-1 text-xs font-medium text-white/60'>
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
				'border border-white/[0.1]',
				'transition-all duration-500 ease-out',
				'hover:border-white/[0.2] hover:shadow-[0_20px_60px_rgba(0,0,0,0.4)]',
				'focus:outline-none focus:ring-2 focus:ring-purple-500/50',
				gradient || 'bg-gradient-to-br from-purple-600/30 via-blue-600/20 to-cyan-600/10',
			)}
		>
			{/* Animated background gradient */}
			<div className='absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100' />

			{/* Glow orb */}
			<div className='absolute -right-20 -top-20 h-40 w-40 rounded-full bg-purple-500/20 blur-3xl transition-all duration-500 group-hover:bg-purple-500/30' />

			<div className='relative flex flex-col gap-4 md:flex-row md:items-center md:gap-6'>
				<AppIcon
					src={icon}
					size={80}
					className='rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] ring-2 ring-white/10 transition-transform duration-500 group-hover:scale-110'
				/>
				<div className='flex-1'>
					<p className='text-xs font-semibold uppercase tracking-wider text-purple-300/80'>Featured</p>
					<h3 className='mt-1 text-2xl font-bold tracking-tight text-white md:text-3xl'>{name}</h3>
					<p className='mt-2 text-base text-white/70'>{tagline}</p>
					{description && <p className='mt-3 text-sm text-white/50'>{description}</p>}
				</div>
				<div className='flex items-center gap-2 text-sm font-medium text-white/60 transition-colors group-hover:text-white'>
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
				'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium',
				'transition-all duration-200',
				'focus:outline-none focus:ring-2 focus:ring-purple-500/50',
				isActive
					? 'bg-white text-black shadow-lg'
					: 'bg-white/[0.08] text-white/70 hover:bg-white/[0.12] hover:text-white',
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
		<div className='flex items-center gap-3 rounded-xl bg-white/[0.05] px-4 py-3'>
			{icon && <div className='text-purple-400'>{icon}</div>}
			<div>
				<p className='text-lg font-bold text-white'>{value}</p>
				<p className='text-xs text-white/50'>{label}</p>
			</div>
		</div>
	)
}
