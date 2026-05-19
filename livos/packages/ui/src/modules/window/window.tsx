import {motion} from 'framer-motion'
import React, {forwardRef, useCallback, useEffect, useRef, useState} from 'react'

import {OriginRect, Position, Size, useWindowManager, WindowId} from '@/providers/window-manager'
import {emitWindowDragDrop, setWindowDragState} from '@/providers/window-drag-state'
import {tw} from '@/utils/tw'

import {WindowChrome} from './window-chrome'

type WindowProps = {
	id: WindowId
	title: string
	icon: string
	position: Position
	size: Size
	zIndex: number
	children: React.ReactNode
	originRect?: OriginRect
	isPinnedToTopBar?: boolean
	// Phase 157 round 8 — when this window is a WebApp surface, the
	// webapp id is passed through so the chrome row can render the
	// inline Chat / Teach action buttons (right of the X) and shrink
	// the drag bar when the user opens the chat input.
	webappId?: string
}

export const Window = forwardRef<HTMLDivElement, WindowProps>(function Window(
	{id, title, icon, position, size, zIndex, children, originRect, isPinnedToTopBar = false, webappId},
	ref,
) {
	const {closeWindow, focusWindow, updateWindowPosition, updateWindowSize} = useWindowManager()
	const [isDragging, setIsDragging] = useState(false)
	const [dragOffset, setDragOffset] = useState({x: 0, y: 0})
	const dragStartPos = useRef({x: 0, y: 0})
	const initialPosition = useRef({x: 0, y: 0})
	const [isResizing, setIsResizing] = useState(false)
	const [resizeDirection, setResizeDirection] = useState<string>('')
	const resizeStartPos = useRef({x: 0, y: 0})
	const resizeStartSize = useRef({width: 0, height: 0})
	const resizeStartPosition = useRef({x: 0, y: 0})

	const handleDragStart = useCallback((e: React.MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDragging(true)
		dragStartPos.current = {x: e.clientX, y: e.clientY}
		initialPosition.current = {x: position.x, y: position.y}
		focusWindow(id)
		// Phase 130-08 — broadcast the drag so the TopBar drop-zone can
		// auto-expand. setWindowDragState is import-lazy at the bottom of
		// the file to avoid a static cycle (TopBar → useWindowDragState →
		// this signal); both ends sync through the same module instance.
		setWindowDragState({isDragging: true, windowId: id})
	}, [focusWindow, id, position.x, position.y])

	const handleResizeStart = useCallback((e: React.MouseEvent, direction: string) => {
		e.preventDefault()
		e.stopPropagation()
		setIsResizing(true)
		setResizeDirection(direction)
		resizeStartPos.current = {x: e.clientX, y: e.clientY}
		resizeStartSize.current = {width: size.width, height: size.height}
		resizeStartPosition.current = {x: position.x, y: position.y}
		focusWindow(id)
	}, [focusWindow, id, size.width, size.height, position.x, position.y])

	const handleMouseMove = useCallback((e: MouseEvent) => {
		if (!isDragging) return

		const deltaX = e.clientX - dragStartPos.current.x
		const deltaY = e.clientY - dragStartPos.current.y
		setDragOffset({x: deltaX, y: deltaY})
	}, [isDragging])

	const handleResizeMove = useCallback((e: MouseEvent) => {
		if (!isResizing) return

		const deltaX = e.clientX - resizeStartPos.current.x
		const deltaY = e.clientY - resizeStartPos.current.y

		let newWidth = resizeStartSize.current.width
		let newHeight = resizeStartSize.current.height
		let newX = resizeStartPosition.current.x
		let newY = resizeStartPosition.current.y

		// Apply delta based on resize direction
		if (resizeDirection.includes('e')) newWidth += deltaX
		if (resizeDirection.includes('w')) { newWidth -= deltaX; newX += deltaX }
		if (resizeDirection.includes('s')) newHeight += deltaY
		if (resizeDirection.includes('n')) { newHeight -= deltaY; newY += deltaY }

		// Enforce minimum size (400x400 matches getResponsiveSize minimum)
		newWidth = Math.max(400, newWidth)
		newHeight = Math.max(400, newHeight)

		updateWindowSize(id, {width: newWidth, height: newHeight})
		// Update position for north/west resizing (window origin moves)
		if (resizeDirection.includes('n') || resizeDirection.includes('w')) {
			updateWindowPosition(id, {x: newX, y: newY})
		}
	}, [isResizing, resizeDirection, id, updateWindowSize, updateWindowPosition])

	const handleMouseUp = useCallback((e?: MouseEvent) => {
		if (!isDragging) return

		const newX = initialPosition.current.x + dragOffset.x
		const newY = initialPosition.current.y + dragOffset.y

		// Keep window on screen
		const clampedX = Math.max(0, Math.min(newX, window.innerWidth - 100))
		const clampedY = Math.max(50, Math.min(newY, window.innerHeight - 100))

		updateWindowPosition(id, {x: clampedX, y: clampedY})
		setIsDragging(false)
		setDragOffset({x: 0, y: 0})
		// Phase 130-08 — clear the drag signal. If the mouseup landed inside
		// a registered drop-zone (currently only the TopBar shelf), notify
		// the drop-zone subscribers BEFORE clearing the drag state so they
		// can read the windowId before it's reset.
		if (e) emitWindowDragDrop({clientX: e.clientX, clientY: e.clientY, windowId: id})
		setWindowDragState({isDragging: false})
	}, [isDragging, dragOffset.x, dragOffset.y, id, updateWindowPosition])

	const handleResizeUp = useCallback(() => {
		if (!isResizing) return
		setIsResizing(false)
		setResizeDirection('')
	}, [isResizing])

	// Global mouse events for smooth dragging and resizing
	useEffect(() => {
		if (isDragging) {
			document.addEventListener('mousemove', handleMouseMove)
			document.addEventListener('mouseup', handleMouseUp)
			document.body.style.cursor = 'grabbing'
			document.body.style.userSelect = 'none'
		} else if (isResizing) {
			document.addEventListener('mousemove', handleResizeMove)
			document.addEventListener('mouseup', handleResizeUp)
			const cursorMap: Record<string, string> = {
				n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
				ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
			}
			document.body.style.cursor = cursorMap[resizeDirection] || 'se-resize'
			document.body.style.userSelect = 'none'
		}

		return () => {
			document.removeEventListener('mousemove', handleMouseMove)
			document.removeEventListener('mouseup', handleMouseUp)
			document.removeEventListener('mousemove', handleResizeMove)
			document.removeEventListener('mouseup', handleResizeUp)
			document.body.style.cursor = ''
			document.body.style.userSelect = ''
		}
	}, [isDragging, isResizing, handleMouseMove, handleMouseUp, handleResizeMove, handleResizeUp, resizeDirection])

	const handleFocus = () => {
		focusWindow(id)
	}

	const handleClose = () => {
		closeWindow(id)
	}

	const currentX = position.x + dragOffset.x
	const currentY = position.y + dragOffset.y

	// Morph animation: if we have an originRect (dock icon position), morph from it
	const hasMorphOrigin = !!originRect
	const morphInitial = hasMorphOrigin
		? {
				left: originRect!.x,
				top: originRect!.y,
				width: originRect!.width,
				height: originRect!.height,
				opacity: 0.6,
				borderRadius: '16px',
			}
		: {opacity: 0, scale: 0.95}

	const morphExit = hasMorphOrigin
		? {
				left: originRect!.x + originRect!.width / 2 - size.width * 0.15,
				top: originRect!.y + originRect!.height / 2 - size.height * 0.15,
				scale: 0.3,
				opacity: 0,
				borderRadius: '20px',
			}
		: {opacity: 0, scale: 0.95}

	const morphTransition = hasMorphOrigin
		? {type: 'spring' as const, stiffness: 280, damping: 26, mass: 0.8}
		: {type: 'spring' as const, stiffness: 500, damping: 35}

	// Phase 130-09 — pinned-to-topbar animation target.
	// When the window is pinned, both the title pill and the content panel
	// morph to a small "minimized chip" at the top of the viewport
	// (approximating the TopBar drop-zone position) with scale + opacity
	// fading out. On unpin, the same morph runs in reverse and the
	// window grows back to its actual position/size.
	const pinTargetX = typeof window !== 'undefined' ? window.innerWidth / 2 : 600
	const pinTargetY = 28 // matches the TopBar drop-zone vertical center
	const pinAnimateContent = isPinnedToTopBar
		? {
			opacity: 0,
			scale: 0.1,
			left: pinTargetX,
			top: pinTargetY,
			width: 140,
			height: 32,
			borderRadius: '999px',
			pointerEvents: 'none' as const,
		}
		: {
			opacity: isDragging ? 0.95 : 1,
			scale: 1,
			left: currentX,
			top: currentY,
			width: size.width,
			height: size.height,
			borderRadius: '20px',
			pointerEvents: 'auto' as const,
		}
	const pinAnimateChrome = isPinnedToTopBar
		? {opacity: 0, scale: 0.2, y: 0}
		: {opacity: isDragging ? 0.9 : 1, y: 0, scale: 1}
	const pinTransition = isPinnedToTopBar
		? {type: 'spring' as const, stiffness: 220, damping: 26, mass: 0.7}
		: undefined

	return (
		<>
			{/* Phase 157 round 7 — floating chrome spans the full window
			    width above the window (left-aligned). The pinned-to-topbar
			    variant still collapses to the small centered chip the
			    TopBar drop-zone expects. */}
			<motion.div
				className='fixed select-none'
				style={{
					left: isPinnedToTopBar ? pinTargetX : currentX,
					top: isPinnedToTopBar ? pinTargetY : currentY - 42,
					transform: isPinnedToTopBar ? 'translateX(-50%)' : undefined,
					zIndex: zIndex + 1,
					pointerEvents: isPinnedToTopBar ? 'none' : 'auto',
				}}
				onMouseDown={isPinnedToTopBar ? undefined : handleDragStart}
				initial={{opacity: 0, y: -10, scale: 0.9}}
				animate={pinAnimateChrome}
				exit={{opacity: 0, y: -10, scale: 0.9}}
				transition={pinTransition ?? {type: 'spring', stiffness: 500, damping: 35, delay: hasMorphOrigin ? 0.15 : 0}}
			>
				<WindowChrome
					title={title}
					icon={icon}
					onClose={handleClose}
					windowWidth={size.width}
					webappId={webappId}
				/>
			</motion.div>

			{/* Window content */}
			<motion.div
				ref={ref}
				className={windowClass}
				style={{
					width: size.width,
					height: size.height,
					left: currentX,
					top: currentY,
					zIndex,
					boxShadow: isDragging
						? '0 35px 60px -15px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.06)'
						: undefined,
				}}
				initial={morphInitial}
				animate={pinAnimateContent}
				exit={morphExit}
				transition={pinTransition ?? (isDragging || isResizing ? {type: 'tween', duration: 0} : morphTransition)}
				onPointerDown={isPinnedToTopBar ? undefined : handleFocus}
			>
				<div className={windowContentClass}>{children}</div>
				{/* Resize handles */}
				{/* Edge handles */}
				<div className='absolute inset-x-2 top-0 h-1 cursor-ns-resize' onMouseDown={(e) => handleResizeStart(e, 'n')} />
				<div className='absolute inset-x-2 bottom-0 h-1 cursor-ns-resize' onMouseDown={(e) => handleResizeStart(e, 's')} />
				<div className='absolute inset-y-2 left-0 w-1 cursor-ew-resize' onMouseDown={(e) => handleResizeStart(e, 'w')} />
				<div className='absolute inset-y-2 right-0 w-1 cursor-ew-resize' onMouseDown={(e) => handleResizeStart(e, 'e')} />
				{/* Corner handles */}
				<div className='absolute left-0 top-0 h-3 w-3 cursor-nwse-resize' onMouseDown={(e) => handleResizeStart(e, 'nw')} />
				<div className='absolute right-0 top-0 h-3 w-3 cursor-nesw-resize' onMouseDown={(e) => handleResizeStart(e, 'ne')} />
				<div className='absolute bottom-0 left-0 h-3 w-3 cursor-nesw-resize' onMouseDown={(e) => handleResizeStart(e, 'sw')} />
				<div className='absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize' onMouseDown={(e) => handleResizeStart(e, 'se')} />
			</motion.div>
		</>
	)
})

// 2026-05-15 — dark-mode window chrome. Frosted-glass shell flips to a deep
// slate-glass: `dark:bg-zinc-900/95` keeps the same 95% opacity so dragging
// reads identically, `dark:border-white/10` gives the hairline back, and the
// shadow is replaced with a heavier ambient drop tuned for dark backdrops.
const windowClass = tw`
	fixed
	flex
	flex-col
	rounded-[20px]
	bg-card-bg/95
	dark:bg-zinc-900/95
	backdrop-blur-xl
	overflow-hidden
	shadow-[0_8px_30px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)]
	dark:shadow-[0_8px_30px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)]
	border
	border-dash-line
	dark:border-white/10
`

const windowContentClass = tw`
	flex-1
	overflow-hidden
	relative
`
