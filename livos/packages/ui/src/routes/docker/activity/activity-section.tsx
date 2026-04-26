// Phase 28 Plan 28-02 — Activity Timeline section (DOC-14).
//
// Composes:
//   - useActivityFeed             — three polling tRPC queries → unified feed
//   - ActivityFilters             — source + severity chip rows
//   - ActivityRow inside AnimatePresence — fade-in at top on 5s polls
//
// Click-through routing per CONTEXT.md decisions:
//   - docker container row    → setSelectedContainer + section='containers'
//   - docker image / volume / network row
//                             → setSelectedImage|Volume|Network + section
//   - docker daemon row       → section='dashboard'
//   - scheduler job row       → section='schedules'
//   - ai alert row            → setSelectedContainer + section='containers'
//                               (sourceId is always present per Phase 23)
//
// Performance: filtered list capped at 500 by mergeAndSort; AnimatePresence
// handles 500 children without trouble (TopCpuPanel precedent in 25-02). No
// virtualization needed at this scale.

import {AnimatePresence, motion} from 'framer-motion'
import {useCallback, useMemo, useState} from 'react'

import {useDockerResource} from '../resource-store'
import {useSetDockerSection} from '../store'

import {ActivityFilters, type SeverityFilter, type SourceFilter} from './activity-filters'
import {ActivityRow} from './activity-row'
import type {ActivityEvent} from './activity-types'
import {useActivityFeed} from './use-activity-feed'

const ROW_VARIANTS = {
	initial: {opacity: 0, y: -8},
	animate: {opacity: 1, y: 0},
	exit: {opacity: 0},
}

export function ActivitySection() {
	const {events, isLoading, isError, errorMessages} = useActivityFeed()
	const setSection = useSetDockerSection()

	const [source, setSource] = useState<SourceFilter>('all')
	const [severity, setSeverity] = useState<SeverityFilter>('all')

	const filtered = useMemo(
		() =>
			events.filter(
				(e) =>
					(source === 'all' || e.source === source) &&
					(severity === 'all' || e.severity === severity),
			),
		[events, source, severity],
	)

	const handleClick = useCallback(
		(e: ActivityEvent) => {
			const r = useDockerResource.getState()

			// Docker container row → open container detail sheet.
			if (e.source === 'docker' && e.sourceType === 'container') {
				r.setSelectedContainer(e.sourceId)
				setSection('containers')
				return
			}
			// Scheduler job row → schedules section.
			if (e.source === 'scheduler') {
				setSection('schedules')
				return
			}
			// AI alert row — sourceId is the containerName (always present per
			// Phase 23). Open container detail sheet. Falls back to logs if
			// somehow empty.
			if (e.source === 'ai') {
				if (e.sourceId) {
					r.setSelectedContainer(e.sourceId)
					setSection('containers')
				} else {
					setSection('logs')
				}
				return
			}
			// Other docker subtypes — open the matching resource section + select.
			if (e.sourceType === 'image') {
				r.setSelectedImage(e.sourceId)
				setSection('images')
				return
			}
			if (e.sourceType === 'volume') {
				r.setSelectedVolume(e.sourceId)
				setSection('volumes')
				return
			}
			if (e.sourceType === 'network') {
				r.setSelectedNetwork(e.sourceId)
				setSection('networks')
				return
			}
			// daemon → dashboard (no per-resource detail panel).
			setSection('dashboard')
		},
		[setSection],
	)

	return (
		<div className='flex h-full min-h-0 flex-col'>
			{/* Sticky header: title + counts + filter chips */}
			<div className='shrink-0 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950'>
				<div className='flex items-center justify-between px-4 pb-1 pt-3'>
					<h2 className='text-sm font-semibold text-zinc-800 dark:text-zinc-100'>Activity</h2>
					<span className='text-xs text-zinc-500 dark:text-zinc-400'>
						Showing {filtered.length} of {events.length} events
					</span>
				</div>
				<ActivityFilters
					source={source}
					setSource={setSource}
					severity={severity}
					setSeverity={setSeverity}
				/>
			</div>

			{/* Optional error banner */}
			{isError ? (
				<div className='shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'>
					Some sources failed to load: {errorMessages.join('; ')}
				</div>
			) : null}

			{/* Body */}
			<div className='min-h-0 flex-1 overflow-y-auto'>
				{isLoading && events.length === 0 ? (
					<SkeletonRows />
				) : filtered.length === 0 ? (
					<EmptyState totalEvents={events.length} />
				) : (
					<ul className='divide-y divide-zinc-100 dark:divide-zinc-900'>
						<AnimatePresence initial={false}>
							{filtered.map((ev) => (
								<motion.li
									key={ev.id}
									variants={ROW_VARIANTS}
									initial='initial'
									animate='animate'
									exit='exit'
									transition={{duration: 0.2}}
									layout='position'
								>
									<ActivityRow event={ev} onClick={handleClick} />
								</motion.li>
							))}
						</AnimatePresence>
					</ul>
				)}
			</div>
		</div>
	)
}

function SkeletonRows() {
	return (
		<ul className='divide-y divide-zinc-100 dark:divide-zinc-900'>
			{Array.from({length: 5}).map((_, i) => (
				<li key={i} className='flex items-center gap-3 px-3 py-3'>
					<div className='h-4 w-4 shrink-0 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800' />
					<div className='flex flex-1 flex-col gap-1'>
						<div className='h-3 w-2/3 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800' />
						<div className='h-2 w-1/3 animate-pulse rounded bg-zinc-100 dark:bg-zinc-900' />
					</div>
					<div className='h-3 w-12 shrink-0 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800' />
				</li>
			))}
		</ul>
	)
}

function EmptyState({totalEvents}: {totalEvents: number}) {
	return (
		<div className='flex h-full flex-col items-center justify-center gap-1 p-8 text-center'>
			<p className='text-sm text-zinc-500 dark:text-zinc-400'>
				{totalEvents === 0
					? 'No activity yet. New events appear automatically.'
					: 'No events match the current filters.'}
			</p>
		</div>
	)
}
