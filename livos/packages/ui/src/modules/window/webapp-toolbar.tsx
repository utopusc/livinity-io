// Phase 95-07.A — WebAppToolbar.
//
// Slim 36px row above the VNC pane. Provides the navigation chord buttons
// (back/forward/refresh — driven via noVNC keyboard injection per D-95-14),
// copy-URL, browser-fullscreen-on-canvas (D-95-05), and a popout stub
// (D-95-06 — disabled with "Coming soon" tooltip; preserves layout for the
// future popout phase).
//
// All side-effecty wiring lives in the parent (webapp-stream-window.tsx).
// This component is pure presentation + callback dispatch.

import {ArrowLeft, ArrowRight, RotateCcw, Copy, Maximize2, ExternalLink} from 'lucide-react'

import {cn} from '@/shadcn-lib/utils'

export interface WebAppToolbarProps {
	/** WebApp's static URL (D-95-15 — sourced from webapp.list row, not live tab). */
	url: string
	onBack: () => void
	onForward: () => void
	onRefresh: () => void
	onCopyUrl: () => void
	onFullscreen: () => void
	/**
	 * D-95-06 — popout is stubbed in P95. When undefined, the button is
	 * rendered disabled with a "Coming soon" tooltip. Defined and provided
	 * by a future phase that ships chromeless popout windows.
	 */
	onPopout?: () => void
	className?: string
}

const buttonBase =
	'flex h-8 w-8 items-center justify-center rounded-radius-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

export function WebAppToolbar({
	url,
	onBack,
	onForward,
	onRefresh,
	onCopyUrl,
	onFullscreen,
	onPopout,
	className,
}: WebAppToolbarProps) {
	const popoutDisabled = !onPopout
	return (
		<div
			className={cn(
				'flex h-9 w-full items-center gap-1 border-b border-border-default bg-surface-base px-2',
				className,
			)}
			role='toolbar'
			aria-label='WebApp toolbar'
		>
			<button
				type='button'
				className={buttonBase}
				onClick={onBack}
				title='Back (Alt+Left)'
				aria-label='Back'
			>
				<ArrowLeft size={16} />
			</button>
			<button
				type='button'
				className={buttonBase}
				onClick={onForward}
				title='Forward (Alt+Right)'
				aria-label='Forward'
			>
				<ArrowRight size={16} />
			</button>
			<button
				type='button'
				className={buttonBase}
				onClick={onRefresh}
				title='Refresh (F5)'
				aria-label='Refresh'
			>
				<RotateCcw size={16} />
			</button>

			{/* URL display — read-only badge. Not editable in P95. */}
			<div
				className='ml-2 flex h-7 min-w-0 flex-1 items-center rounded-radius-sm bg-surface-2 px-3 text-caption-sm text-text-secondary'
				title={url}
			>
				<span className='truncate'>{url}</span>
			</div>

			<button
				type='button'
				className={buttonBase}
				onClick={onCopyUrl}
				title='Copy URL'
				aria-label='Copy URL'
			>
				<Copy size={16} />
			</button>
			<button
				type='button'
				className={buttonBase}
				onClick={onFullscreen}
				title='Fullscreen (canvas)'
				aria-label='Fullscreen'
			>
				<Maximize2 size={16} />
			</button>
			<button
				type='button'
				className={buttonBase}
				disabled={popoutDisabled}
				aria-disabled={popoutDisabled}
				onClick={onPopout}
				title={popoutDisabled ? 'Popout — coming soon' : 'Popout to a new window'}
				aria-label='Popout'
			>
				<ExternalLink size={16} />
			</button>
		</div>
	)
}

export default WebAppToolbar
