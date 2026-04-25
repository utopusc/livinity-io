// Phase 28 Plan 28-02 — ActivityRow (DOC-14).
//
// Single-row presentation for one ActivityEvent. Layout left-to-right:
//   [4px severity stripe] [source icon] [title + body (truncated)] [subtype badge] [relative time]
//
// The whole row is a <button> for keyboard a11y. Clicking dispatches the
// onClick callback which the parent's click-through router consumes (sets
// useDockerResource selections + switches docker section).
//
// Note on formatRelativeDate: helper expects UNIX SECONDS (legacy port from
// server-control). ActivityEvent.timestamp is MS — convert with Math.floor
// /1000 at the call site. The plan's note that the helper "expects ms" was
// wrong; verified against routes/docker/resources/format-relative-date.ts.

import {type Icon, IconBrandDocker, IconCalendarTime, IconSparkles} from '@tabler/icons-react'

import {cn} from '@/shadcn-lib/utils'

import type {ActivityEvent} from './activity-types'
import {formatRelativeDate} from '../resources/format-relative-date'

interface ActivityRowProps {
	event: ActivityEvent
	onClick: (e: ActivityEvent) => void
}

const SOURCE_ICON: Record<ActivityEvent['source'], Icon> = {
	docker: IconBrandDocker,
	scheduler: IconCalendarTime,
	ai: IconSparkles,
}

const SEVERITY_STRIPE: Record<ActivityEvent['severity'], string> = {
	info: 'border-l-blue-500',
	warn: 'border-l-amber-500',
	error: 'border-l-red-500',
}

const SUBTYPE_LABEL: Record<ActivityEvent['sourceType'], string> = {
	container: 'container',
	image: 'image',
	network: 'network',
	volume: 'volume',
	daemon: 'daemon',
	job: 'job',
	'ai-alert': 'ai-alert',
}

export function ActivityRow({event, onClick}: ActivityRowProps) {
	const Icon = SOURCE_ICON[event.source]
	const stripe = SEVERITY_STRIPE[event.severity]
	// formatRelativeDate expects UNIX SECONDS; ActivityEvent.timestamp is MS.
	const relTime = formatRelativeDate(Math.floor(event.timestamp / 1000))

	return (
		<button
			type='button'
			onClick={() => onClick(event)}
			className={cn(
				'flex w-full items-center gap-3 border-l-4 px-3 py-2 text-left',
				'hover:bg-zinc-50 dark:hover:bg-zinc-900',
				'focus:outline-none focus:ring-1 focus:ring-blue-500',
				stripe,
			)}
			title={event.body || event.title}
		>
			<Icon size={16} className='shrink-0 text-zinc-500 dark:text-zinc-400' />
			<div className='flex min-w-0 flex-1 flex-col'>
				<span className='truncate text-sm font-medium text-zinc-800 dark:text-zinc-100'>
					{event.title}
				</span>
				{event.body ? (
					<span className='truncate text-xs text-zinc-500 dark:text-zinc-400'>{event.body}</span>
				) : null}
			</div>
			<span className='shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'>
				{SUBTYPE_LABEL[event.sourceType]}
			</span>
			<span className='shrink-0 text-xs text-zinc-500 dark:text-zinc-400'>{relTime}</span>
		</button>
	)
}
