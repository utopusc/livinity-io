import {HTMLMotionProps, motion, MotionValue, SpringOptions, useSpring, useTransform, Variants} from 'framer-motion'
import {useEffect, useRef, useState} from 'react'
import {IconType} from 'react-icons'
import {Link, LinkProps} from 'react-router-dom'
import {
	TbHome2,
	TbFolder,
	TbApps,
	TbSettings,
	TbChartBar,
	TbMessageCircle,
	TbServer,
	TbRobot,
	TbCalendarTime,
	TbTerminal2,
} from 'react-icons/tb'

import {NotificationBadge} from '@/components/ui/notification-badge'
import {cn} from '@/shadcn-lib/utils'

// Map app IDs to their React Icons
const DOCK_ICONS: Record<string, IconType> = {
	'LIVINITY_home': TbHome2,
	'LIVINITY_files': TbFolder,
	'LIVINITY_app-store': TbApps,
	'LIVINITY_settings': TbSettings,
	'LIVINITY_live-usage': TbChartBar,
	'LIVINITY_ai-chat': TbMessageCircle,
	'LIVINITY_server-control': TbServer,
	'LIVINITY_subagents': TbRobot,
	'LIVINITY_schedules': TbCalendarTime,
	'LIVINITY_terminal': TbTerminal2,
}

type HTMLDivProps = HTMLMotionProps<'div'>
type DockItemProps = {
	notificationCount?: number
	appId?: string
	bg?: string
	open?: boolean
	mouseX: MotionValue<number>
	to?: LinkProps['to']
	iconSize: number
	iconSizeZoomed: number
	className?: string
	style?: React.CSSProperties
	onClick?: (e: React.MouseEvent) => void
	/** Called when item is clicked. If provided, navigation is always prevented and window opens instead. */
	onOpenWindow?: () => boolean
} & HTMLDivProps

const BOUNCE_DURATION = 0.4

export function DockItem({
	appId,
	bg,
	mouseX,
	notificationCount,
	open,
	className,
	style,
	to,
	onClick,
	onOpenWindow,
	iconSize,
	iconSizeZoomed,
	...props
}: DockItemProps) {
	const [clickedOpen, setClickedOpen] = useState(false)
	const ref = useRef<HTMLDivElement>(null)

	// Get the icon component for this app
	const Icon = appId ? DOCK_ICONS[appId] : null

	useEffect(() => {
		if (!open) setClickedOpen(false)
	}, [open])

	const distance = useTransform(mouseX, (val) => {
		const bounds = ref.current?.getBoundingClientRect() ?? {x: 0, width: 0}

		return val - bounds.x - bounds.width / 2
	})

	const springOptions: SpringOptions = {
		mass: 0.1,
		stiffness: 150,
		damping: 14,
	}

	const widthSync = useTransform(distance, [-150, 0, 150], [iconSize, iconSizeZoomed, iconSize])
	const width = useSpring(widthSync, springOptions)

	const scaleSync = useTransform(distance, [-150, 0, 150], [1, iconSizeZoomed / iconSize, 1])
	const transform = useSpring(scaleSync, springOptions)

	// Config from:
	// https://github.com/ysj151215/big-sur-dock/blob/04a7244beb0d35d22d1bb18ad91b4c0021bf5ec4/components/dock/DockItem.tsx
	const variants: Variants = {
		open: {
			transition: {
				default: {
					duration: 0.2,
				},
				translateY: {
					duration: BOUNCE_DURATION,
					ease: 'easeInOut',
					times: [0, 0.5, 1],
				},
			},
			translateY: [0, -20, 0],
		},
		closed: {},
	}
	const variant = open && clickedOpen ? 'open' : 'closed'

	return (
		<motion.div ref={ref} className='relative aspect-square' style={{width}}>
			{/* icon glow */}
			<div
				className='absolute hidden h-full w-full rounded-radius-lg bg-surface-3 opacity-50 md:block'
				style={{
					filter: 'blur(16px)',
					transform: 'translateY(4px)',
				}}
			/>
			{/* icon */}
			<motion.div
				className={cn(
					'relative origin-top-left rounded-radius-lg bg-surface-2 transform-gpu backdrop-blur-md border border-border-emphasis transition-[filter] has-[:focus-visible]:brightness-125 flex items-center justify-center',
					className,
				)}
				style={{
					width: iconSize,
					height: iconSize,
					scale: transform,
					...style,
				}}
				onClick={(e) => {
					setClickedOpen(true)
					onClick?.(e)
				}}
				{...props}
				variants={variants}
				animate={variant}
			>
				{/* Render React Icon if available, otherwise fallback to bg image */}
				{Icon ? (
					<Icon className='h-[60%] w-[60%] text-text-primary drop-shadow-md' />
				) : bg ? (
					<div
						className='h-full w-full bg-cover bg-center rounded-xl'
						style={{backgroundImage: `url(${bg})`}}
					/>
				) : (
					<div className='h-full w-full rounded-xl bg-gradient-to-br from-white/20 to-black/20' />
				)}

				{onOpenWindow ? (
					<button
						className='absolute inset-0 outline-none rounded-xl'
						onClick={() => {
							onOpenWindow()
						}}
					/>
				) : (
					<Link
						to={to || '/'}
						className='absolute inset-0 outline-none rounded-xl'
						unstable_viewTransition
					/>
				)}
				{!!notificationCount && <NotificationBadge count={notificationCount} />}
			</motion.div>
			{open && <OpenPill />}
		</motion.div>
	)
}

function OpenPill() {
	return (
		<motion.div
			className='absolute -bottom-[7px] left-1/2 h-[2px] w-[10px] -translate-x-1/2 rounded-full bg-white'
			initial={{
				opacity: 0,
			}}
			animate={{
				opacity: 1,
				transition: {
					delay: BOUNCE_DURATION,
				},
			}}
		/>
	)
}
