import {motion} from 'framer-motion'
import React, {forwardRef, useCallback, useEffect, useRef, useState} from 'react'

import {CONTENT_TOP_MIN, DOCK_H, OriginRect, Position, Size, useWindowManager, WINDOW_MARGIN, WindowId} from '@/providers/window-manager'
import {emitWindowDragDrop, getDisplaysButtonRect, setWindowDragState} from '@/providers/window-drag-state'
import {isShortcutKind} from '@/modules/shortcuts/shortcut-window-route'
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
	// Phase 260.2 — the window's appId (DISPLAY_:N / NATIVE_:id / WEBAPP_:id /
	// LIVINITY_*). Used to detect VNC/stream windows so X closes the port
	// (closeDisplay) and the − minimize (dock keep-alive) is stream-only.
	appId?: string
	// Phase 157 round 8 — when this window is a WebApp surface, the
	// webapp id is passed through so the chrome row can render the
	// inline Chat / Teach action buttons (right of the X) and shrink
	// the drag bar when the user opens the chat input.
	webappId?: string
	// Phase 159 — when this window is a NativeApp stream window, the
	// native-app config id is passed through so the chrome row can
	// render the Chat icon + inline chat-input bar (Teach + Skills
	// omitted — RESEARCH A5). Mutually exclusive with `webappId`.
	nativeAppId?: string
}

export const Window = forwardRef<HTMLDivElement, WindowProps>(function Window(
	{id, title, icon, position, size, zIndex, children, originRect, isPinnedToTopBar = false, appId, webappId, nativeAppId},
	ref,
) {
	const {closeWindow, closeDisplay, focusWindow, updateWindowPosition, updateWindowSize, pinWindowToTopBar} = useWindowManager()
	// Phase 260.2 — VNC/stream windows (a raw DISPLAY_ or an app streamed via
	// webapp/native) get the − minimize (dock keep-alive) + an X that closes the
	// PORT. Plain system windows (Settings/Files/dialogs) get neither.
	const isDisplayWindow = !!appId?.startsWith('DISPLAY_')
	// Phase 291 R3 — a SHORTCUT_<id> window (browser-stream shortcut: Notion etc.)
	// carries neither webappId nor nativeAppId (windows-container only derives those
	// from WEBAPP_/NATIVE_ prefixes), so without this it fell through with NO −
	// minimize button. handleMinimize → pinWindowToTopBar is appId-agnostic, so the
	// morph-to-Displays works the moment the chrome offers onMinimize.
	const isStreamWindow = isDisplayWindow || !!webappId || !!nativeAppId || (appId ? isShortcutKind(appId) : false)
	// Phase 159 — mutual exclusion. webappId and nativeAppId must never
	// both be set for the same window. Dev console-warn so accidental
	// double-threading is caught quickly without throwing in prod.
	if (process.env.NODE_ENV !== 'production' && webappId && nativeAppId) {
		// eslint-disable-next-line no-console
		console.warn('[Window] webappId AND nativeAppId both set — only one expected.', {id, webappId, nativeAppId})
	}
	const [isDragging, setIsDragging] = useState(false)
	const [dragOffset, setDragOffset] = useState({x: 0, y: 0})
	const dragStartPos = useRef({x: 0, y: 0})
	const initialPosition = useRef({x: 0, y: 0})
	const [isResizing, setIsResizing] = useState(false)
	const [resizeDirection, setResizeDirection] = useState<string>('')
	const resizeStartPos = useRef({x: 0, y: 0})
	const resizeStartSize = useRef({width: 0, height: 0})
	const resizeStartPosition = useRef({x: 0, y: 0})

	// Phase 260.1 (SC-E, locked decision #2) — the content element ref used by
	// the chrome fullscreen button. The window content motion.div is bound to
	// the forwarded `ref` (which call sites currently leave unset), so we keep
	// our OWN local handle and a callback ref that mirrors into both, ensuring
	// requestFullscreen always has a real element to target.
	const contentRef = useRef<HTMLDivElement | null>(null)
	const setContentRef = useCallback(
		(node: HTMLDivElement | null) => {
			contentRef.current = node
			if (typeof ref === 'function') ref(node)
			else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
		},
		[ref],
	)

	// Phase 260.1 (SC-E) — BROWSER fullscreen on the content element (standards
	// Fullscreen API + a webkit fallback). Works for ALL display types
	// (native / webapp / luse stream + DISPLAY_:N VNC canvas) since it targets
	// the window content element, not a backend EWMH call.
	const handleFullscreen = useCallback(() => {
		const el = contentRef.current as
			| (HTMLElement & {webkitRequestFullscreen?: () => void})
			| null
		if (!el) return
		;(el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el))?.()
	}, [])

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

		// Phase 297 (A2) — clamp the manual resize to the USABLE area, using the
		// SAME shared chrome/dock geometry as window-manager so a drag can neither
		// push the body behind the dock nor tuck the floating chrome under the top
		// navbar (the manual-resize counterpart to the open-time fit + viewport
		// re-clamp). The 400 minimum yields on a viewport too small to hold it. For
		// an edge that MOVES the origin (n/w) the opposite edge stays anchored and
		// the moving edge is capped against the navbar / left margin; for an edge
		// that grows from a fixed origin (s/e) the growing edge is capped against
		// the dock / right margin.
		const vw = window.innerWidth
		const vh = window.innerHeight
		const eastAnchor = resizeStartPosition.current.x + resizeStartSize.current.width
		const southAnchor = resizeStartPosition.current.y + resizeStartSize.current.height
		newWidth = Math.max(Math.min(400, vw - 2 * WINDOW_MARGIN), newWidth)
		newHeight = Math.max(Math.min(400, vh - CONTENT_TOP_MIN - DOCK_H), newHeight)

		if (resizeDirection.includes('w')) {
			newWidth = Math.min(newWidth, eastAnchor - WINDOW_MARGIN)
			newX = eastAnchor - newWidth
		} else if (resizeDirection.includes('e')) {
			newWidth = Math.min(newWidth, vw - WINDOW_MARGIN - newX)
		}

		if (resizeDirection.includes('n')) {
			newHeight = Math.min(newHeight, southAnchor - CONTENT_TOP_MIN)
			newY = southAnchor - newHeight
		} else if (resizeDirection.includes('s')) {
			newHeight = Math.min(newHeight, vh - DOCK_H - newY)
		}

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

		// Keep window on screen. Phase 297 — the lower y bound is CONTENT_TOP_MIN
		// (not 50) so a dragged window's floating title bar also stays below the OS
		// navbar and reachable, consistent with the open-time + resize clamps.
		const clampedX = Math.max(0, Math.min(newX, window.innerWidth - 100))
		const clampedY = Math.max(CONTENT_TOP_MIN, Math.min(newY, window.innerHeight - 100))

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

	// Phase 260.2 — X on a DISPLAY_ window closes the PORT (server-side teardown
	// via displays.close), not just the UI window. Other windows: plain close.
	const handleClose = () => {
		if (isDisplayWindow) {
			closeDisplay(id)
		} else {
			closeWindow(id)
		}
	}

	// Phase 260.2 — minimize sends the window back to the docked "windows"
	// surface (pin-to-topbar keeps the stream alive; NEVER closeWindow).
	const handleMinimize = useCallback(() => {
		pinWindowToTopBar(id)
	}, [pinWindowToTopBar, id])

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
	// morph to a small "minimized chip" with scale + opacity fading out. On
	// unpin, the same morph runs in reverse and the window grows back to its
	// actual position/size.
	//
	// Phase 260-03 (SC4) — the morph now lands ON the Displays/Monitor button
	// (slide-RIGHT into it) instead of the navbar center. The TopBar publishes
	// the button's live center coords via setDisplaysButtonRect; we read them
	// here with a graceful fallback to the old navbar-center coords so the
	// animation never breaks when the rect hasn't been published yet (e.g.
	// mobile/no-TopBar, or the very first frame before the publish effect runs).
	const displaysRect = getDisplaysButtonRect()
	const pinTargetX = displaysRect?.x ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 600)
	const pinTargetY = displaysRect?.y ?? 28 // fallback: TopBar drop-zone vertical center
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
		: {opacity: 1, y: 0, scale: 1}

	// Close animation — when the window was opened from a dock icon
	// (originRect is known), the chrome's exit converges to the same
	// dock-icon target as the window content, using a transform-based
	// translate (`x` / `y`) on top of the chrome's static `left` / `top`
	// so close button + drag bar + skills all "fall into" the dock with
	// the window instead of fading in place above empty space. The
	// transition is the same spring as `morphTransition` so chrome and
	// content land together. No-dock-origin fallback keeps the prior
	// subtle fade-up.
	const chromeExitTarget = hasMorphOrigin
		? {
				opacity: 0,
				scale: 0.3,
				x: originRect!.x + originRect!.width / 2 - size.width * 0.15 - currentX,
				y: originRect!.y + originRect!.height / 2 - size.height * 0.15 - (currentY - 42),
				transition: morphTransition,
			}
		: {opacity: 0, y: -10, scale: 0.9}
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
				exit={chromeExitTarget}
				transition={pinTransition ?? {type: 'spring', stiffness: 500, damping: 35, delay: hasMorphOrigin ? 0.15 : 0}}
			>
				<WindowChrome
					title={title}
					icon={icon}
					onClose={handleClose}
					windowWidth={size.width}
					webappId={webappId}
					nativeAppId={nativeAppId}
					// Phase 260.1 (SC-E, locked decision #2 = BROWSER fullscreen).
					// window.tsx receives webappId / nativeAppId but NOT the
					// appId, so it cannot detect a DISPLAY_:N window here to gate
					// the button to stream/display windows only. Since the locked
					// decision wants fullscreen to "work for ALL display types"
					// and the chrome already only renders the button when
					// onFullscreen is present, we pass it for every window — the
					// browser Fullscreen API on the content element is a harmless,
					// useful affordance and covers DISPLAY_/webapp/native streams.
					onFullscreen={handleFullscreen}
					// − minimize only on VNC/stream windows (operator: "sadece VNC
					// yayını yapanlarda"). Plain windows get no − button.
					onMinimize={isStreamWindow ? handleMinimize : undefined}
				/>
			</motion.div>

			{/* Window content */}
			<motion.div
				ref={setContentRef}
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

			{/* Phase 158 round 16 — iframe / video pointer-capture shield.
			    While the user is dragging the title bar or resizing from an
			    edge, the cursor often passes over an iframe or video element
			    inside the window content (webapp stream, embedded apps). In
			    those frames, mouse events get owned by the iframe's own
			    document context — the parent's `document.addEventListener(
			    'mousemove' / 'mouseup')` stops firing, so the window thinks
			    the user is still holding the edge even after release.

			    The shield is a transparent, full-viewport `position: fixed`
			    div with the very highest z-index, rendered ONLY while
			    isDragging || isResizing. It has no handlers — mouse events
			    fire on it (default pointer-events: auto) and bubble straight
			    up to `document`, where our drag listeners catch them. The
			    iframe under it never sees the events, so it never steals
			    focus from the drag loop. Cursor is set on the shield so the
			    grabbing / resize affordance stays correct everywhere the
			    cursor goes, including over the iframe. */}
			{(isDragging || isResizing) && (
				<div
					aria-hidden='true'
					style={{
						position: 'fixed',
						inset: 0,
						zIndex: 999999,
						cursor: isDragging
							? 'grabbing'
							: ({
									n: 'ns-resize',
									s: 'ns-resize',
									e: 'ew-resize',
									w: 'ew-resize',
									ne: 'nesw-resize',
									sw: 'nesw-resize',
									nw: 'nwse-resize',
									se: 'nwse-resize',
								}[resizeDirection] || 'se-resize'),
					}}
				/>
			)}
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
