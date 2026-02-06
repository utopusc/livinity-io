import {motion} from 'framer-motion'
import React, {forwardRef, useCallback, useEffect, useRef, useState} from 'react'

import {Position, Size, useWindowManager, WindowId} from '@/providers/window-manager'
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
}

export const Window = forwardRef<HTMLDivElement, WindowProps>(function Window(
	{id, title, icon, position, size, zIndex, children},
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

	const handleMouseUp = useCallback(() => {
		if (!isDragging) return

		const newX = initialPosition.current.x + dragOffset.x
		const newY = initialPosition.current.y + dragOffset.y

		// Keep window on screen
		const clampedX = Math.max(0, Math.min(newX, window.innerWidth - 100))
		const clampedY = Math.max(50, Math.min(newY, window.innerHeight - 100))

		updateWindowPosition(id, {x: clampedX, y: clampedY})
		setIsDragging(false)
		setDragOffset({x: 0, y: 0})
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

	return (
		<>
			{/* Floating title bar - draggable */}
			<motion.div
				className='fixed select-none'
				style={{
					left: currentX + size.width / 2,
					top: currentY - 16,
					transform: 'translateX(-50%)',
					zIndex: zIndex + 1,
				}}
				onMouseDown={handleDragStart}
				initial={{opacity: 0, y: -10, scale: 0.9}}
				animate={{opacity: isDragging ? 0.9 : 1, y: 0, scale: 1}}
				exit={{opacity: 0, y: -10, scale: 0.9}}
				transition={{type: 'spring', stiffness: 500, damping: 35}}
			>
				<WindowChrome title={title} icon={icon} onClose={handleClose} />
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
						? '0 35px 60px -15px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)'
						: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
				}}
				initial={{opacity: 0, scale: 0.95, y: 20}}
				animate={{opacity: isDragging ? 0.95 : 1, scale: 1, y: 0}}
				exit={{opacity: 0, scale: 0.95, y: 20}}
				transition={{
					type: 'spring',
					stiffness: 500,
					damping: 35,
				}}
				onPointerDown={handleFocus}
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

const windowClass = tw`
	fixed
	flex
	flex-col
	rounded-radius-xl
	bg-black/90
	backdrop-blur-xl
	overflow-hidden
	border
	border-border-default
`

const windowContentClass = tw`
	flex-1
	overflow-hidden
	relative
`
