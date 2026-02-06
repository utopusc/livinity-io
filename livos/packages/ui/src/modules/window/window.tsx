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
	const {closeWindow, focusWindow, updateWindowPosition} = useWindowManager()
	const [isDragging, setIsDragging] = useState(false)
	const [dragOffset, setDragOffset] = useState({x: 0, y: 0})
	const dragStartPos = useRef({x: 0, y: 0})
	const initialPosition = useRef({x: 0, y: 0})

	const handleDragStart = useCallback((e: React.MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDragging(true)
		dragStartPos.current = {x: e.clientX, y: e.clientY}
		initialPosition.current = {x: position.x, y: position.y}
		focusWindow(id)
	}, [focusWindow, id, position.x, position.y])

	const handleMouseMove = useCallback((e: MouseEvent) => {
		if (!isDragging) return

		const deltaX = e.clientX - dragStartPos.current.x
		const deltaY = e.clientY - dragStartPos.current.y
		setDragOffset({x: deltaX, y: deltaY})
	}, [isDragging])

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

	// Global mouse events for smooth dragging
	useEffect(() => {
		if (isDragging) {
			document.addEventListener('mousemove', handleMouseMove)
			document.addEventListener('mouseup', handleMouseUp)
			document.body.style.cursor = 'grabbing'
			document.body.style.userSelect = 'none'
		}

		return () => {
			document.removeEventListener('mousemove', handleMouseMove)
			document.removeEventListener('mouseup', handleMouseUp)
			document.body.style.cursor = ''
			document.body.style.userSelect = ''
		}
	}, [isDragging, handleMouseMove, handleMouseUp])

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
