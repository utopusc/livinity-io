import {AnimatePresence, HTMLMotionProps, motion, MotionValue, SpringOptions, useSpring, useTransform, Variants} from 'framer-motion'
import {useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
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
	TbBrandChrome,
	TbBrandFacebook,
	TbMail,
	TbBrandYoutube,
	TbChartLine,
	TbSearch,
	TbNews,
} from 'react-icons/tb'

import {NotificationBadge} from '@/components/ui/notification-badge'
import {cn} from '@/shadcn-lib/utils'

// Map app IDs to their display names
const DOCK_LABELS: Record<string, string> = {
	'LIVINITY_home': 'Home',
	'LIVINITY_files': 'Files',
	'LIVINITY_app-store': 'App Store',
	'LIVINITY_settings': 'Settings',
	'LIVINITY_live-usage': 'Live Usage',
	'LIVINITY_ai-chat': 'AI Chat',
	'LIVINITY_server-control': 'Server',
	'LIVINITY_subagents': 'Agents',
	'LIVINITY_schedules': 'Schedules',
	'LIVINITY_terminal': 'Terminal',
	'LIVINITY_chrome': 'Chrome',
	'LIVINITY_facebook': 'Facebook',
	'LIVINITY_gmail': 'Gmail',
	'LIVINITY_youtube': 'YouTube',
	'LIVINITY_tradingview': 'TradingView',
	'LIVINITY_google': 'Google',
	'LIVINITY_yahoo': 'Yahoo',
}

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
	'LIVINITY_chrome': TbBrandChrome,
	'LIVINITY_facebook': TbBrandFacebook,
	'LIVINITY_gmail': TbMail,
	'LIVINITY_youtube': TbBrandYoutube,
	'LIVINITY_tradingview': TbChartLine,
	'LIVINITY_google': TbSearch,
	'LIVINITY_yahoo': TbNews,
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
	label?: string
	onClick?: (e: React.MouseEvent) => void
	/** Called when item is clicked. If provided, navigation is always prevented and window opens instead. Returns the dock icon's bounding rect for morph animation. */
	onOpenWindow?: (originRect: {x: number; y: number; width: number; height: number}) => boolean
} & HTMLDivProps

const BOUNCE_DURATION = 0.35

export function DockItem({
	appId,
	bg,
	mouseX,
	notificationCount,
	open,
	className,
	style,
	label: labelProp,
	to,
	onClick,
	onOpenWindow,
	iconSize,
	iconSizeZoomed,
	...props
}: DockItemProps) {
	const [clickedOpen, setClickedOpen] = useState(false)
	const [isHovered, setIsHovered] = useState(false)
	const ref = useRef<HTMLDivElement>(null)
	const iconRef = useRef<HTMLDivElement>(null)

	// Get the icon component and label for this app
	const Icon = appId ? DOCK_ICONS[appId] : null
	const label = labelProp || (appId ? DOCK_LABELS[appId] : undefined)

	useEffect(() => {
		if (!open) setClickedOpen(false)
	}, [open])

	const distance = useTransform(mouseX, (val) => {
		const bounds = ref.current?.getBoundingClientRect() ?? {x: 0, width: 0}

		return val - bounds.x - bounds.width / 2
	})

	const springOptions: SpringOptions = {
		mass: 0.08,
		stiffness: 170,
		damping: 16,
	}

	const widthSync = useTransform(distance, [-140, 0, 140], [iconSize, iconSizeZoomed, iconSize])
	const width = useSpring(widthSync, springOptions)

	const scaleSync = useTransform(distance, [-140, 0, 140], [1, iconSizeZoomed / iconSize, 1])
	const transform = useSpring(scaleSync, springOptions)

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
			translateY: [0, -16, 0],
		},
		closed: {},
	}
	const variant = open && clickedOpen ? 'open' : 'closed'

	return (
		<motion.div
			ref={ref}
			className='relative aspect-square'
			style={{width}}
			onPointerEnter={() => setIsHovered(true)}
			onPointerLeave={() => setIsHovered(false)}
		>
			{/* Tooltip — tracks the inner icon element for accurate centering */}
			<DockTooltip label={label} isVisible={isHovered} anchorRef={iconRef} />
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
				ref={iconRef}
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
					<div className='h-full w-full rounded-xl bg-gradient-to-br from-surface-2 to-surface-3' />
				)}

				{onOpenWindow ? (
					<button
						className='absolute inset-0 outline-none rounded-xl'
						onClick={() => {
							const rect = ref.current?.getBoundingClientRect()
							const originRect = rect
								? {x: rect.x, y: rect.y, width: rect.width, height: rect.height}
								: {x: window.innerWidth / 2, y: window.innerHeight - 80, width: 50, height: 50}
							onOpenWindow(originRect)
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

function DockTooltip({label, isVisible, anchorRef}: {label?: string; isVisible: boolean; anchorRef: React.RefObject<HTMLDivElement | null>}) {
	if (!label) return null

	const [pos, setPos] = useState<{x: number; y: number} | null>(null)

	useEffect(() => {
		if (!isVisible || !anchorRef.current) {
			setPos(null)
			return
		}
		let raf: number
		const update = () => {
			if (!anchorRef.current) return
			const rect = anchorRef.current.getBoundingClientRect()
			setPos({x: rect.left + rect.width / 2, y: rect.top})
			raf = requestAnimationFrame(update)
		}
		raf = requestAnimationFrame(update)
		return () => cancelAnimationFrame(raf)
	}, [isVisible, anchorRef])

	return createPortal(
		<AnimatePresence>
			{isVisible && pos && (
				<motion.div
					className='fixed z-[9999] whitespace-nowrap rounded-lg bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-neutral-800 shadow-[0_2px_12px_rgba(0,0,0,0.12)] backdrop-blur-xl border border-neutral-200/60 pointer-events-none'
					style={{left: pos.x, top: pos.y - 10, transform: 'translate(-50%, -100%)'}}
					initial={{opacity: 0}}
					animate={{opacity: 1}}
					exit={{opacity: 0}}
					transition={{duration: 0.1}}
				>
					{label}
				</motion.div>
			)}
		</AnimatePresence>,
		document.body,
	)
}

function OpenPill() {
	return (
		<motion.div
			className='absolute -bottom-[7px] left-1/2 h-[2px] w-[10px] -translate-x-1/2 rounded-full bg-text-primary'
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
