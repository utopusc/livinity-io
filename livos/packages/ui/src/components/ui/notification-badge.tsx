// Phase 30 hot-patch round 2: switched from SlidingNumber to plain text.
// `react-use-measure` returned bounds.height=0 on initial mount which kept
// every digit invisible — user only saw the red circle, not the number.
// Plain text renders correctly on first paint; the sliding animation was
// nice-to-have, not load-bearing.
export function NotificationBadge({count}: {count: number}) {
	return (
		// min-w so it's a circle when count is below 10
		<div className='absolute -right-1 -top-1 flex h-[17px] min-w-[17px] select-none items-center justify-center rounded-full bg-red-600/80 px-1 text-caption-sm font-bold leading-none tabular-nums shadow-md shadow-red-800/50 animate-in zoom-in'>
			{count}
		</div>
	)
}
