import {useState, useRef, useEffect, useMemo} from 'react'
import {
	IconX,
	IconPlayerPause,
	IconPlayerPlay,
	IconPlayerStop,
	IconMouse,
	IconKeyboard,
	IconScreenshot,
	IconCrosshair,
	IconArrowsMove,
	IconArrowsUpDown,
} from '@tabler/icons-react'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'

type ComputerUseAction = {
	type: 'click' | 'double_click' | 'right_click' | 'type' | 'press' | 'drag' | 'scroll' | 'move' | 'screenshot'
	x?: number
	y?: number
	text?: string
	key?: string
	timestamp: number
}

interface ComputerUsePanelProps {
	conversationId: string
	screenshot: string | null
	actions: ComputerUseAction[]
	paused: boolean
	onClose: () => void
}

function describeAction(a: ComputerUseAction): string {
	switch (a.type) {
		case 'click':
			return `Click at ${a.x}, ${a.y}`
		case 'double_click':
			return `Double-click at ${a.x}, ${a.y}`
		case 'right_click':
			return `Right-click at ${a.x}, ${a.y}`
		case 'type':
			return `Typed "${(a.text || '').slice(0, 40)}"`
		case 'press':
			return `Pressed ${a.key || '?'}`
		case 'drag':
			return `Drag from ${a.x}, ${a.y}`
		case 'scroll':
			return `Scroll at ${a.x}, ${a.y}`
		case 'move':
			return `Move to ${a.x}, ${a.y}`
		case 'screenshot':
			return 'Screenshot captured'
		default:
			return a.type
	}
}

function actionIcon(type: ComputerUseAction['type']) {
	switch (type) {
		case 'click':
		case 'double_click':
		case 'right_click':
			return <IconMouse size={14} className='text-red-400' />
		case 'type':
		case 'press':
			return <IconKeyboard size={14} className='text-blue-400' />
		case 'screenshot':
			return <IconScreenshot size={14} className='text-green-400' />
		case 'drag':
		case 'move':
			return <IconArrowsMove size={14} className='text-amber-400' />
		case 'scroll':
			return <IconArrowsUpDown size={14} className='text-purple-400' />
		default:
			return <IconCrosshair size={14} className='text-text-tertiary' />
	}
}

function relativeTime(ts: number): string {
	const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000))
	if (diff < 5) return 'just now'
	if (diff < 60) return `${diff}s ago`
	return `${Math.floor(diff / 60)}m ago`
}

export function ComputerUsePanel({conversationId, screenshot, actions, paused, onClose}: ComputerUsePanelProps) {
	const imgRef = useRef<HTMLImageElement>(null)
	const [imgDims, setImgDims] = useState<{naturalWidth: number; naturalHeight: number; clientWidth: number; clientHeight: number} | null>(null)
	const [, setTick] = useState(0)

	const pauseMutation = trpcReact.ai.pauseComputerUse.useMutation()
	const resumeMutation = trpcReact.ai.resumeComputerUse.useMutation()
	const stopMutation = trpcReact.ai.stopComputerUse.useMutation()

	// Re-render relative timestamps every 5 seconds
	useEffect(() => {
		const interval = setInterval(() => setTick((t) => t + 1), 5000)
		return () => clearInterval(interval)
	}, [])

	const handleImgLoad = () => {
		if (imgRef.current) {
			setImgDims({
				naturalWidth: imgRef.current.naturalWidth,
				naturalHeight: imgRef.current.naturalHeight,
				clientWidth: imgRef.current.clientWidth,
				clientHeight: imgRef.current.clientHeight,
			})
		}
	}

	// Update client dimensions on resize
	useEffect(() => {
		const handleResize = () => {
			if (imgRef.current) {
				setImgDims((prev) =>
					prev
						? {
								...prev,
								clientWidth: imgRef.current!.clientWidth,
								clientHeight: imgRef.current!.clientHeight,
							}
						: null,
				)
			}
		}
		window.addEventListener('resize', handleResize)
		return () => window.removeEventListener('resize', handleResize)
	}, [])

	// Recent actions with coordinates for overlay (last 5)
	const overlayActions = useMemo(() => {
		const withCoords = actions.filter(
			(a) => a.x !== undefined && a.y !== undefined && ['click', 'double_click', 'right_click', 'move', 'drag', 'scroll'].includes(a.type),
		)
		return withCoords.slice(-5)
	}, [actions])

	// Recent type actions for text badges (last 3)
	const typeBadges = useMemo(() => {
		return actions.filter((a) => a.type === 'type').slice(-3)
	}, [actions])

	// Last known click position for type badge positioning
	const lastClickPos = useMemo(() => {
		const clicks = actions.filter((a) => a.x !== undefined && a.y !== undefined && ['click', 'double_click', 'right_click'].includes(a.type))
		return clicks.length > 0 ? clicks[clicks.length - 1] : null
	}, [actions])

	// Timeline actions (last 10, newest first)
	const timelineActions = useMemo(() => {
		return [...actions].reverse().slice(0, 10)
	}, [actions])

	const scaleX = imgDims ? imgDims.clientWidth / imgDims.naturalWidth : 1
	const scaleY = imgDims ? imgDims.clientHeight / imgDims.naturalHeight : 1

	return (
		<div className='flex h-full flex-col border-l border-border-default bg-surface-base'>
			{/* Header */}
			<div className='flex flex-shrink-0 items-center gap-3 border-b border-border-default px-4 py-3'>
				<div className='flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-green-500/30 to-emerald-500/30'>
					<IconScreenshot size={14} className='text-green-400' />
				</div>
				<div className='min-w-0 flex-1'>
					<span className='truncate text-body-sm font-semibold text-text-primary'>Computer Use</span>
				</div>
				{paused && (
					<span className='rounded-radius-sm bg-amber-500/15 px-2 py-0.5 text-caption-sm font-medium text-amber-400'>Paused</span>
				)}
				{paused ? (
					<button
						onClick={() => resumeMutation.mutate({conversationId})}
						className='rounded-radius-sm p-1.5 text-green-400 transition-colors hover:bg-green-500/10'
						title='Resume'
					>
						<IconPlayerPlay size={16} />
					</button>
				) : (
					<button
						onClick={() => pauseMutation.mutate({conversationId})}
						className='rounded-radius-sm p-1.5 text-amber-400 transition-colors hover:bg-amber-500/10'
						title='Pause'
					>
						<IconPlayerPause size={16} />
					</button>
				)}
				<button
					onClick={() => stopMutation.mutate({conversationId})}
					className='rounded-radius-sm p-1.5 text-red-400 transition-colors hover:bg-red-500/10'
					title='Stop'
				>
					<IconPlayerStop size={16} />
				</button>
				<button
					onClick={onClose}
					className='rounded-radius-sm p-1.5 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary'
				>
					<IconX size={16} />
				</button>
			</div>

			{/* Screenshot area */}
			<div className='relative flex-1 overflow-hidden bg-black/20'>
				{!screenshot ? (
					<div className='flex h-full flex-col items-center justify-center gap-3 text-text-tertiary'>
						<IconScreenshot size={32} className='opacity-40' />
						<span className='text-body-sm'>Waiting for screenshot...</span>
					</div>
				) : (
					<>
						<img
							ref={imgRef}
							src={`data:image/jpeg;base64,${screenshot}`}
							alt='Device screen'
							className='h-auto w-full object-contain'
							onLoad={handleImgLoad}
						/>

						{/* Action overlays — click/mouse position markers */}
						{imgDims &&
							overlayActions.map((action, i) => {
								const isLatest = i === overlayActions.length - 1
								const scaledX = (action.x! * scaleX)
								const scaledY = (action.y! * scaleY)
								return (
									<div
										key={`overlay-${action.timestamp}-${i}`}
										className={cn(
											'pointer-events-none absolute rounded-full',
											isLatest ? 'h-3 w-3 bg-red-500 animate-pulse' : 'h-2 w-2 bg-red-500/50',
										)}
										style={{
											left: scaledX,
											top: scaledY,
											transform: 'translate(-50%, -50%)',
										}}
									/>
								)
							})}

						{/* Type action text badges */}
						{imgDims &&
							lastClickPos &&
							typeBadges.map((action, i) => {
								const scaledX = ((lastClickPos.x || 0) * scaleX)
								const scaledY = ((lastClickPos.y || 0) * scaleY) + 20 + i * 24
								return (
									<div
										key={`badge-${action.timestamp}-${i}`}
										className='pointer-events-none absolute max-w-32 truncate rounded-radius-sm bg-blue-500/90 px-1.5 py-0.5 text-caption-sm text-white'
										style={{
											left: scaledX,
											top: scaledY,
											transform: 'translateX(-50%)',
										}}
									>
										{(action.text || '').slice(0, 40)}
									</div>
								)
							})}
					</>
				)}
			</div>

			{/* Timeline */}
			<div className='max-h-48 overflow-y-auto border-t border-border-default'>
				{paused && (
					<div className='bg-amber-500/10 px-3 py-1.5 text-center text-caption font-medium text-amber-400'>Session Paused</div>
				)}
				{timelineActions.length === 0 ? (
					<div className='px-3 py-3 text-center text-caption text-text-tertiary'>No actions yet</div>
				) : (
					timelineActions.map((action, i) => (
						<div
							key={`timeline-${action.timestamp}-${i}`}
							className='flex items-center gap-2 px-3 py-1.5 text-caption'
						>
							{actionIcon(action.type)}
							<span className='flex-1 truncate text-text-secondary'>{describeAction(action)}</span>
							<span className='ml-auto flex-shrink-0 text-caption-sm text-text-tertiary'>{relativeTime(action.timestamp)}</span>
						</div>
					))
				)}
			</div>
		</div>
	)
}
