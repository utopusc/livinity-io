import {AnimatePresence, HTMLMotionProps, motion, MotionValue, SpringOptions, useSpring, useTransform, Variants} from 'framer-motion'
import {useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {Link, LinkProps} from 'react-router-dom'
import type {SVGProps} from 'react'
import {
	TbHome2,
	TbApps,
	TbRobot,
	TbCalendarTime,
	TbBrandChrome,
	TbMail,
} from 'react-icons/tb'

import {NotificationBadge} from '@/components/ui/notification-badge'
import {useTheme} from '@/hooks/use-theme'
import {cn} from '@/shadcn-lib/utils'

// Phase 157 round 6 — custom dock glyphs ported from claude-design
// dock-icons.html. Replaces Tabler React variants for the 8 system
// apps in the dock so the rendered shapes match the design exactly
// (folder w/ tab, gear w/ circle, 4-bar chart, rounded-square+plus,
// chat bubble, stacked racks, phone outline, prompt caret). Recent /
// user apps + uncovered system apps still fall back to Tabler.
import {
	IconAnalytics,
	IconAppStore,
	IconDevices,
	IconFiles,
	IconLiv,
	IconServer,
	IconSettings,
	IconTerminal,
} from './dock-glyphs'

type DockGlyph = (props: SVGProps<SVGSVGElement>) => JSX.Element

// Phase 101-07 Task 3 — Dock composes both WebApps and native apps. The
// actual data-driven rendering of NativeAppIcon happens in the dock host
// (desktop-content.tsx alongside WebAppIcon — see lines ~259-271 there),
// but the discriminated render contract is owned here: any dock surface
// that wants to render a native app passes <NativeAppIcon id name iconUrl>.
// Re-export so dock composers have a single import surface for the
// dock-item discriminator family (DockItem for system apps, WebAppIcon
// for WebApps, NativeAppIcon for native apps).
export {NativeAppIcon} from '../dock/native-app-icon'

// Map app IDs to their display names
const DOCK_LABELS: Record<string, string> = {
	'LIVINITY_home': 'Home',
	'LIVINITY_files': 'Files',
	'LIVINITY_app-store': 'App Store',
	'LIVINITY_settings': 'Settings',
	'LIVINITY_live-usage': 'Live Usage',
	'LIVINITY_ai-chat': 'AI Chat',
	'LIVINITY_docker': 'Docker',
	'LIVINITY_server-control': 'Server Management',
	'LIVINITY_my-devices': 'Devices',
	'LIVINITY_subagents': 'Agents',
	'LIVINITY_schedules': 'Schedules',
	'LIVINITY_terminal': 'Terminal',
	'LIVINITY_chrome': 'Chrome',
	'LIVINITY_gmail': 'Gmail',
}

// Map app IDs to their dock glyph. Custom SVG glyphs for the 8 apps in
// the design (Files, Settings, Live Usage, App Store, AI Chat, Server,
// Devices, Terminal); Tabler fallbacks for the rest (Home, Docker,
// Agents, Schedules, Chrome, Gmail) so they render until those get
// their own claude-design treatment.
const DOCK_ICONS: Record<string, DockGlyph> = {
	'LIVINITY_home': TbHome2 as unknown as DockGlyph,
	'LIVINITY_files': IconFiles,
	'LIVINITY_app-store': IconAppStore,
	'LIVINITY_settings': IconSettings,
	'LIVINITY_live-usage': IconAnalytics,
	'LIVINITY_ai-chat': IconLiv,
	'LIVINITY_docker': IconServer,
	'LIVINITY_server-control': IconServer,
	'LIVINITY_my-devices': IconDevices,
	'LIVINITY_subagents': TbRobot as unknown as DockGlyph,
	'LIVINITY_schedules': TbCalendarTime as unknown as DockGlyph,
	'LIVINITY_terminal': IconTerminal,
	'LIVINITY_chrome': TbBrandChrome as unknown as DockGlyph,
	'LIVINITY_gmail': TbMail as unknown as DockGlyph,
	'LIVINITY_app-store-tabler': TbApps as unknown as DockGlyph,
}

// Phase 157 round 6 — Dock icon visual refresh per claude-design
// dock-icons.html. Frosted squircle tile + Tabler-style 1.5px glyphs +
// subtle per-app accent halo revealed only on hover. Liv (AI Chat) is
// the single inverted tile — dark gradient, white glyph — so the brand
// surface remains identifiable without painting every icon a different
// colour (which the v36 monochrome-pass had been rejected for).
const DOCK_TINTS: Record<string, string> = {
	'LIVINITY_files': 'rgba(255, 138, 101, 0.35)',
	'LIVINITY_settings': 'rgba(110, 110, 115, 0.25)',
	'LIVINITY_live-usage': 'rgba(91, 141, 239, 0.30)',
	'LIVINITY_app-store': 'rgba(77, 219, 195, 0.30)',
	'LIVINITY_ai-chat': 'rgba(255, 138, 101, 0.40)',
	'LIVINITY_server-control': 'rgba(255, 186, 110, 0.30)',
	'LIVINITY_my-devices': 'rgba(195, 156, 255, 0.30)',
	'LIVINITY_terminal': 'rgba(74, 222, 128, 0.30)',
}

// Apps rendered as an INVERTED tile (dark surface + white glyph).
// Empty by default — Liv (LIVINITY_ai-chat) was the inverted brand
// signature in the claude-design mock but the user prefers the chat
// glyph rendered on the standard frosted-white tile alongside the
// others. Add an app id here if a future surface wants the inverted
// treatment.
const DOCK_INVERTED = new Set<string>()

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

	// Phase 157 round 6 — per-tile tint (hover halo) + inverted-tile flag.
	const tintColor = appId ? DOCK_TINTS[appId] : undefined
	const isInverted = appId ? DOCK_INVERTED.has(appId) : false
	// resolvedTheme is 'light' | 'dark' (system pref already resolved).
	// Dark-mode flips every tile to the dark gradient; Liv stays the
	// deepest dark (handled below via isInverted-prefers-darker).
	const {resolvedTheme} = useTheme()
	const isDark = resolvedTheme === 'dark'
	const useDarkTile = isInverted || isDark

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
			{/* icon glow — bg-image branch keeps the legacy soft glow; the
			    new monochrome squircle tiles ship their own shadow stack so
			    we suppress this halo for the Icon branch to avoid double
			    glow stacking. */}
			{!Icon && (
				<div
					className='absolute hidden h-full w-full rounded-radius-lg bg-surface-3 opacity-50 md:block'
					style={{
						filter: 'blur(16px)',
						transform: 'translateY(4px)',
					}}
				/>
			)}
			{/* icon — Phase 157 round 6 squircle tile per claude-design
			    dock-icons.html. Squircle radius = size × 0.28 (iOS Tahoe).
			    Light tile is a subtle white → bg-2 gradient with a top
			    sheen and a hairline border + inset/outer shadows for
			    depth. Inverted tile (Liv) is the same shape with a
			    dark-grey → near-black gradient and white glyph — the
			    single brand signature among an otherwise restrained
			    monochrome set. Hover reveals a tinted radial halo in the
			    lower-right corner using the per-app --tint variable. */}
			<motion.div
				ref={iconRef}
				className={cn(
					'relative origin-top-left overflow-hidden isolate transform-gpu has-[:focus-visible]:brightness-125 flex items-center justify-center',
					className,
				)}
				whileHover={{translateY: -6, transition: {duration: 0.18, ease: [0.2, 0.7, 0.2, 1]}}}
				style={{
					width: iconSize,
					height: iconSize,
					scale: transform,
					borderRadius: iconSize * 0.28,
					// Tile background — Liv always uses the deepest dark; in
					// dark theme, every tile flips to the dark gradient. Light
					// theme keeps the frosted-white default.
					background: Icon
						? isInverted
							? 'linear-gradient(180deg, #2a2a2f 0%, #0a0a0c 100%)'
							: useDarkTile
								? 'linear-gradient(180deg, rgba(40,40,46,0.95) 0%, rgba(24,24,28,0.92) 100%)'
								: 'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(245,245,247,0.86) 100%)'
						: undefined,
					border: Icon
						? useDarkTile
							? '1px solid rgba(255,255,255,0.10)'
							: '1px solid rgba(0,0,0,0.08)'
						: undefined,
					boxShadow: Icon
						? useDarkTile
							? 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3), 0 4px 10px -4px rgba(0,0,0,0.5)'
							: 'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.04), 0 4px 10px -4px rgba(0,0,0,0.10)'
						: undefined,
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
				{/* Top sheen overlay (Icon branch only — keeps the tile
				    feeling glassy in light mode and faintly luminous on
				    dark tiles / Liv). */}
				{Icon && (
					<div
						className='pointer-events-none absolute inset-0 z-[1]'
						style={{
							background: useDarkTile
								? 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 40%)'
								: 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 40%)',
							borderRadius: 'inherit',
						}}
					/>
				)}
				{/* Hover halo — radial tint in the lower-right corner.
				    Per-app colour comes from DOCK_TINTS; opacity drives
				    in on hover. */}
				{Icon && tintColor && (
					<div
						className='pointer-events-none absolute z-0 transition-opacity duration-300'
						style={{
							inset: '30% -20% -20% 30%',
							background: `radial-gradient(circle, ${tintColor}, transparent 60%)`,
							opacity: isHovered ? 0.6 : 0,
						}}
					/>
				)}

				{/* Render React Icon if available, otherwise fallback to bg image */}
				{Icon ? (
					// Each custom glyph bakes its own strokeWidth; Tabler
					// fallbacks (Home / Agents / Schedules / Chrome / Gmail
					// / Docker) inherit their library default. Color flips
					// via `currentColor` against the parent text colour.
					<Icon
						className={cn(
							'relative z-[2] h-[58%] w-[58%]',
							useDarkTile ? 'text-white' : 'text-[#1d1d1f]',
						)}
					/>
				) : bg ? (
					<div
						className='h-full w-full bg-cover bg-center'
						style={{backgroundImage: `url(${bg})`, borderRadius: 'inherit'}}
					/>
				) : (
					<div
						className='h-full w-full bg-gradient-to-br from-surface-2 to-surface-3'
						style={{borderRadius: 'inherit'}}
					/>
				)}

				{onOpenWindow ? (
					<button
						type='button'
						className='absolute inset-0 z-[3] outline-none'
						style={{borderRadius: 'inherit'}}
						onClick={(e) => {
							e.preventDefault()
							e.stopPropagation()
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
						className='absolute inset-0 z-[3] outline-none'
						style={{borderRadius: 'inherit'}}
						unstable_viewTransition
					/>
				)}
				{!!notificationCount && <NotificationBadge count={notificationCount} />}
			</motion.div>
			{open && <OpenDot inverted={useDarkTile} />}
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

// Phase 157 round 6 — Running indicator. Design swap from a 10px pill to
// a 4px dot per dock-icons.html (`.app-slot.running::after`). Inverted
// tiles (Liv) keep a white dot so it reads against the dark squircle
// shadow; standard tiles use the primary text colour so it tracks the
// theme.
function OpenDot({inverted = false}: {inverted?: boolean}) {
	return (
		<motion.div
			className={cn(
				'absolute -bottom-[6px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full',
				inverted ? 'bg-white' : 'bg-text-primary',
			)}
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
