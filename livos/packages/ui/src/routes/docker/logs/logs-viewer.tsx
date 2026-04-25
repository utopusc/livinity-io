// Phase 28 Plan 28-01 — LogsViewer (DOC-13).
//
// Main pane of the cross-container Logs section. Renders an aggregated
// chronological log feed with:
//   - Color-stripe (4px left edge) per container — deterministic via
//     colorForContainer hash.
//   - [container-name] prefix on every line, also colored by hash.
//   - Toolbar: grep regex input (maxLength=500 — T-28-03 DoS bound),
//     severity dropdown (ALL / ERROR / WARN / INFO / DEBUG), live-tail
//     toggle, line-count badge.
//   - Bare-bones virtualized list (no react-window dep — see file footer
//     comment for the math). 20px row height matches font-mono leading-5.
//
// What we DO NOT do:
//   - ANSI parsing — cross-container view is plain text. The xterm-based
//     per-container LogsTab in ContainerDetailSheet (Phase 17) is the
//     canonical drilldown when ANSI colors matter. ANSI escape codes here
//     just render as visible garbage; that's an acceptable v1 trade-off
//     and documented in CONTEXT.md decisions.
//   - Persistent log archival — host docker handles that.
//   - Saved query presets — explicitly deferred per CONTEXT.md.
//
// Threat T-28-03 mitigation: grep input is bounded to 500 chars AND we only
// run the regex against the visible viewport slice (≤ ~30 rows × overscan),
// so even a pathological pattern can't catastrophically backtrack on the
// full 5000-line × 25-container buffer. Invalid regex is caught by try/catch
// and rendered as a red badge — viewer keeps showing all lines unfiltered.

import {useEffect, useMemo, useRef, useState} from 'react'
import {IconAlertCircle, IconSearch} from '@tabler/icons-react'

import {Input} from '@/shadcn-components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/shadcn-components/ui/select'
import {Switch} from '@/shadcn-components/ui/switch'
import {cn} from '@/shadcn-lib/utils'

import {colorForContainer} from './log-color'
import {classifySeverity, type Severity} from './log-severity'
import type {LogLine} from './use-multiplexed-logs'

interface LogsViewerProps {
	lines: LogLine[]
	truncated?: boolean
}

type SeverityFilter = 'ALL' | Severity

const ROW_HEIGHT = 20 // px — matches font-mono leading-5
const OVERSCAN = 4 // extra rows above/below viewport

// Tolerance for "scrolled to bottom" detection (px). Live-tail auto-disables
// when the user scrolls up past this threshold.
const BOTTOM_TOLERANCE = 4

/**
 * Compile a grep pattern. Returns the compiled regex OR an Error if the
 * pattern is malformed. Empty pattern returns null (means "no filter").
 */
function compileGrep(pattern: string): RegExp | Error | null {
	const trimmed = pattern.trim()
	if (trimmed.length === 0) return null
	try {
		return new RegExp(trimmed, 'i')
	} catch (err) {
		return err instanceof Error ? err : new Error('Invalid regex')
	}
}

export function LogsViewer({lines, truncated = false}: LogsViewerProps) {
	const [grep, setGrep] = useState('')
	const [severity, setSeverity] = useState<SeverityFilter>('ALL')
	const [liveTail, setLiveTail] = useState(true)
	const [scrollTop, setScrollTop] = useState(0)
	const [viewportHeight, setViewportHeight] = useState(0)

	const scrollRef = useRef<HTMLDivElement>(null)

	// Compile grep once per pattern change. Invalid -> Error instance, which
	// the toolbar surfaces as a red badge. Valid -> RegExp; null -> no filter.
	const grepResult = useMemo(() => compileGrep(grep), [grep])
	const grepRegex = grepResult instanceof RegExp ? grepResult : null
	const grepInvalid = grepResult instanceof Error

	// Apply grep + severity filter to the line list.
	const filteredLines = useMemo(() => {
		if (!grepRegex && severity === 'ALL') return lines
		return lines.filter((line) => {
			if (severity !== 'ALL') {
				// classifySeverity returns null for unrecognized lines.
				// When a non-ALL severity is selected, null lines are HIDDEN
				// (intentional — documented in plan).
				if (classifySeverity(line.body) !== severity) return false
			}
			if (grepRegex && !grepRegex.test(line.body)) return false
			return true
		})
	}, [lines, grepRegex, severity])

	// Measure viewport height on mount + window resize.
	useEffect(() => {
		const el = scrollRef.current
		if (!el) return
		const measure = () => setViewportHeight(el.clientHeight)
		measure()
		const ro = new ResizeObserver(measure)
		ro.observe(el)
		return () => ro.disconnect()
	}, [])

	// Scroll listener — drives virtualization start index AND auto-disables
	// live-tail when the user manually scrolls up.
	const handleScroll = () => {
		const el = scrollRef.current
		if (!el) return
		setScrollTop(el.scrollTop)
		if (liveTail) {
			const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_TOLERANCE
			if (!atBottom) setLiveTail(false)
		}
	}

	// Live-tail effect — when on, snap to bottom whenever the line list grows.
	useEffect(() => {
		if (!liveTail) return
		const el = scrollRef.current
		if (!el) return
		// rAF so we run after the row layout has been committed.
		const id = requestAnimationFrame(() => {
			el.scrollTop = el.scrollHeight
		})
		return () => cancelAnimationFrame(id)
	}, [liveTail, filteredLines.length])

	// Re-enable live tail: snap to bottom immediately.
	const onLiveTailChange = (next: boolean) => {
		setLiveTail(next)
		if (next) {
			const el = scrollRef.current
			if (el) {
				requestAnimationFrame(() => {
					el.scrollTop = el.scrollHeight
				})
			}
		}
	}

	// Virtualization math: render only [startIndex, startIndex + visibleCount].
	const visibleCount = Math.max(0, Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN)
	const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - Math.floor(OVERSCAN / 2))
	const endIndex = Math.min(filteredLines.length, startIndex + visibleCount)
	const visibleSlice = filteredLines.slice(startIndex, endIndex)

	const totalLines = lines.length
	const visibleTotal = filteredLines.length
	const isFiltered = grepRegex !== null || severity !== 'ALL'

	return (
		<div className='flex h-full flex-col bg-surface-base'>
			{/* Toolbar */}
			<div className='flex h-12 shrink-0 items-center gap-3 border-b border-border-default bg-surface-base px-3'>
				<div className='relative w-64 max-w-full'>
					<IconSearch
						size={14}
						className='absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary'
					/>
					<Input
						sizeVariant='short-square'
						value={grep}
						onChange={(e) => setGrep(e.target.value)}
						placeholder='grep regex…'
						maxLength={500}
						className='pl-8 text-xs'
						aria-label='grep filter'
					/>
				</div>
				{grepInvalid && (
					<span
						role='status'
						className='flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-500'
					>
						<IconAlertCircle size={12} />
						invalid regex
					</span>
				)}

				<Select value={severity} onValueChange={(v) => setSeverity(v as SeverityFilter)}>
					<SelectTrigger className='h-9 w-32 text-xs' aria-label='severity filter'>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value='ALL'>ALL</SelectItem>
						<SelectItem value='ERROR'>ERROR</SelectItem>
						<SelectItem value='WARN'>WARN</SelectItem>
						<SelectItem value='INFO'>INFO</SelectItem>
						<SelectItem value='DEBUG'>DEBUG</SelectItem>
					</SelectContent>
				</Select>

				<label className='flex items-center gap-2 text-xs text-text-secondary'>
					<Switch checked={liveTail} onCheckedChange={onLiveTailChange} aria-label='Live tail' />
					<span>Live tail</span>
				</label>

				<div className='ml-auto text-xs text-text-tertiary'>
					Showing <span className='font-medium text-text-primary'>{visibleTotal}</span> of{' '}
					<span className='font-medium'>{totalLines}</span> lines
				</div>
			</div>

			{/* Truncation banner */}
			{truncated && (
				<div className='shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400'>
					Showing first 25 selected containers (multiplex cap). Uncheck some to add others.
				</div>
			)}

			{/* Virtualized list body */}
			<div ref={scrollRef} onScroll={handleScroll} className='min-h-0 flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-950'>
				{totalLines === 0 ? (
					<div className='flex h-full items-center justify-center p-8 text-center text-sm text-text-tertiary'>
						Select a container in the sidebar to start streaming logs.
					</div>
				) : visibleTotal === 0 && isFiltered ? (
					<div className='flex h-full items-center justify-center p-8 text-center text-sm text-text-tertiary'>
						No lines match grep / severity. Clear filters to see all.
					</div>
				) : (
					// Outer fixed-height div sets the total scrollable area; rows are
					// absolutely positioned at top: i*20px so we render only the
					// visible slice.
					<div
						style={{height: filteredLines.length * ROW_HEIGHT, position: 'relative'}}
						aria-label='log lines'
					>
						{visibleSlice.map((line, i) => {
							const absoluteIndex = startIndex + i
							const color = colorForContainer(line.containerName)
							return (
								<div
									key={line.id}
									className='absolute left-0 right-0 flex items-stretch font-mono text-xs leading-5'
									style={{top: absoluteIndex * ROW_HEIGHT, height: ROW_HEIGHT}}
								>
									<span
										aria-hidden
										className='shrink-0'
										style={{borderLeft: `4px solid ${color}`, marginRight: 8}}
									/>
									<span
										className='shrink-0 select-none px-1 font-medium'
										style={{color}}
										title={line.containerName}
									>
										[{line.containerName}]
									</span>
									<span
										className={cn(
											'min-w-0 flex-1 truncate whitespace-pre px-1',
											'text-zinc-800 dark:text-zinc-100',
										)}
									>
										{line.body}
									</span>
								</div>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
}

// Bare-bones virtualizer math (no react-window dep):
//   visibleCount = ceil(clientHeight / rowHeight) + OVERSCAN
//   startIndex   = floor(scrollTop / rowHeight) - OVERSCAN/2
//   endIndex     = min(total, startIndex + visibleCount)
//   render slice = lines[startIndex, endIndex] absolutely positioned at i*ROW_HEIGHT
// Outer div height = total * rowHeight gives the scrollbar correct extent.
// Live-tail snaps scrollTop to scrollHeight inside requestAnimationFrame so
// we run after row layout commits. Auto-disables when user scrolls up past
// BOTTOM_TOLERANCE — mirrors Dockhand UX.
