// Phase 96-06 — SkillReplayScrubber.
//
// Read-only horizontal timeline overlay. One tile per logged
// ActionEvent showing a thumbnail + a human-readable label. Mounted as
// an overlay above the VNC stream by WebAppStreamWindow when the user
// clicks a sidebar row. Click outside / Close button → onClose.
//
// Design choices (PLAN 96-06 + CONTEXT §gray-area #6):
//   - Thumbnail source: GET /api/webapp-skills/<sessionId>/<ts>.thumb.jpg
//     — direct HTTP route on livinityd, auth via LIVINITY_SESSION cookie,
//     ownership check inside the handler. Lower friction than a tRPC
//     procedure (no base64 round-trip, native browser <img> caching).
//   - Lazy-load via IntersectionObserver: a 5-minute skill with 300
//     frames must NOT fetch all 300 thumbs upfront. Tiles set src on
//     viewport entry only.
//   - Tile size 200×140 (PLAN). Thumbs are encoded 320×200 q=70 by
//     skills-storage so the browser can cleanly down-scale.
//   - Strictly read-only — NO play/pause, NO scroll-driven replay. P97
//     owns the autonomous playback path.

import {useEffect, useMemo, useRef, useState} from 'react'
import {X} from 'lucide-react'

import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'

import type {
	ActionEvent,
	ActionLog,
} from '@/hooks/use-teach-recorder'

export interface SkillReplayScrubberProps {
	skillId: string
	onClose: () => void
	className?: string
}

// Maps an ActionEvent to a short human-readable label. Mirrors the
// schema's discriminated union — adding a new event type elsewhere will
// surface as a TS error here.
function labelForEvent(e: ActionEvent): string {
	switch (e.type) {
		case 'click':
			return `${e.button === 'left' ? 'click' : `${e.button}-click`} @ ${e.coords.x},${e.coords.y}`
		case 'key':
			return `key '${e.key}'${e.modifiers.length ? ` (${e.modifiers.join('+')})` : ''}`
		case 'wheel':
			return `wheel ${e.dx ? `dx${e.dx > 0 ? '+' : ''}${e.dx}` : ''}${e.dy ? ` dy${e.dy > 0 ? '+' : ''}${e.dy}` : ''}`
		case 'scroll':
			return `scroll @ ${e.coords.x},${e.coords.y}`
		case 'wait':
			return `wait ${(e.durationMs / 1000).toFixed(1)}s`
	}
}

function frameUrlFor(screenshotRef: string, variant: 'full' | 'thumb' = 'thumb'): string | null {
	// screenshotRef is `<userId>/<sessionId>/<ts>.jpg`. We re-target the
	// HTTP route which expects `<sessionId>/<filename>` (userId is sourced
	// from the auth token).
	const parts = screenshotRef.split('/')
	if (parts.length !== 3) return null
	const sessionId = parts[1]
	const file = parts[2] // e.g. 12345.jpg
	const m = file.match(/^([0-9]+)\.jpg$/)
	if (!m) return null
	const ts = m[1]
	const filename = variant === 'thumb' ? `${ts}.thumb.jpg` : `${ts}.jpg`
	return `/api/webapp-skills/${sessionId}/${filename}`
}

interface ScrubberTileProps {
	event: ActionEvent
	index: number
}

function ScrubberTile({event, index}: ScrubberTileProps) {
	const ref = useRef<HTMLDivElement>(null)
	const [visible, setVisible] = useState(index < 20) // first 20 eager-load
	const [errored, setErrored] = useState(false)

	useEffect(() => {
		if (visible) return
		const el = ref.current
		if (!el) return
		if (typeof IntersectionObserver === 'undefined') {
			setVisible(true)
			return
		}
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting) {
						setVisible(true)
						io.disconnect()
						break
					}
				}
			},
			{rootMargin: '200px'},
		)
		io.observe(el)
		return () => io.disconnect()
	}, [visible])

	const url = frameUrlFor(event.screenshotRef, 'thumb')

	return (
		<div
			ref={ref}
			className='flex w-[200px] shrink-0 flex-col gap-1 rounded-radius-sm border border-border-default bg-surface-1 p-2'
			data-testid='scrubber-tile'
		>
			<div className='text-caption-xs text-text-tertiary'>{(event.ts / 1000).toFixed(2)}s</div>
			<div className='relative h-[140px] overflow-hidden rounded-radius-xs bg-black'>
				{visible && url && !errored ? (
					<img
						src={url}
						alt={labelForEvent(event)}
						className='h-full w-full object-cover'
						loading='lazy'
						onError={() => setErrored(true)}
					/>
				) : (
					<div className='flex h-full w-full items-center justify-center text-caption-xs text-text-tertiary'>
						{errored ? 'no image' : '…'}
					</div>
				)}
			</div>
			<div className='truncate text-caption-xs text-text-primary'>{labelForEvent(event)}</div>
		</div>
	)
}

export function SkillReplayScrubber({skillId, onClose, className}: SkillReplayScrubberProps) {
	const skillQuery = trpcReact.webapp.skills.get.useQuery(
		{skillId},
		{enabled: !!skillId, staleTime: 60_000},
	)

	const log = skillQuery.data?.actionLog as ActionLog | undefined

	const meta = useMemo(() => {
		if (!log) return null
		const totalSec = ((log.endedAt ?? 0) - (log.startedAt ?? 0)) / 1000
		return {
			eventCount: log.events.length,
			totalSec,
			droppedCount: log.meta?.droppedCount ?? 0,
		}
	}, [log])

	return (
		<div
			className={cn(
				'absolute inset-0 z-20 flex flex-col bg-black/85 backdrop-blur-sm',
				className,
			)}
			data-testid='skill-replay-scrubber'
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose()
			}}
		>
			<div className='flex h-10 items-center justify-between gap-3 border-b border-white/10 px-3 text-white'>
				<div className='flex items-baseline gap-3'>
					<span className='text-caption-sm font-medium'>
						{skillQuery.data?.skillName ?? 'Loading…'}
					</span>
					{meta ? (
						<span className='text-caption-xs text-white/70'>
							{meta.eventCount} events · {meta.totalSec.toFixed(1)}s
						</span>
					) : null}
				</div>
				<button
					type='button'
					onClick={onClose}
					className='inline-flex h-7 w-7 items-center justify-center rounded-radius-xs text-white/80 hover:bg-white/10'
					title='Close'
				>
					<X className='h-4 w-4' />
				</button>
			</div>
			<div className='flex-1 overflow-x-auto overflow-y-hidden px-3 py-3'>
				{skillQuery.isLoading ? (
					<div className='flex h-full items-center justify-center text-caption-sm text-white/70'>
						Loading skill…
					</div>
				) : skillQuery.isError ? (
					<div className='flex h-full items-center justify-center text-caption-sm text-accent-red'>
						Failed to load skill.
					</div>
				) : !log ? (
					<div className='flex h-full items-center justify-center text-caption-sm text-white/70'>
						No data.
					</div>
				) : log.events.length === 0 ? (
					<div className='flex h-full items-center justify-center text-caption-sm text-white/70'>
						This skill has no events.
					</div>
				) : (
					<div className='flex h-full flex-row items-stretch gap-2'>
						{log.events.map((e, i) => (
							<ScrubberTile key={i} event={e} index={i} />
						))}
					</div>
				)}
			</div>
			{meta && meta.droppedCount > 0 ? (
				<div className='border-t border-white/10 px-3 py-1 text-caption-xs text-white/70'>
					{meta.droppedCount} events dropped during recording.
				</div>
			) : null}
		</div>
	)
}
