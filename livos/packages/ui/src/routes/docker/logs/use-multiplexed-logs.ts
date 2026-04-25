// Phase 28 Plan 28-01 — multiplexed Docker logs hook (DOC-13).
//
// Opens one WebSocket per included container against the existing
// `/ws/docker/logs?container=<name>&envId=<id>&tail=<n>&token=<jwt>` handler
// (extended in Plan 28-01 Task 2 to accept envId). Aggregates lines client-
// side into a single chronological array sorted by receivedAt ASC, capped at
// MAX_LINES_PER_CONTAINER × includedNames.length.
//
// Key design choices:
// - One WS per container (not a single multiplexed-protocol WS) so the
//   per-container heartbeat/teardown that Phase 17 ContainerDetailSheet uses
//   carries forward unchanged. The aggregation lives client-side.
// - 100ms throttle on setLines so a chatty container (>20 lines/sec) doesn't
//   drag the React tree. All chunks within the window coalesce into one
//   setState. setTimeout (not requestAnimationFrame) so background tabs still
//   flush.
// - Hard cap of 25 concurrent sockets (T-28-02 mitigation). If the user
//   selects >25 containers we slice to first 25 and surface `truncated: true`
//   so the viewer can show a banner.
// - On envId change: close ALL sockets, clear ALL buffers (no cross-env line
//   bleed). On includedNames diff: open new, close removed; preserve buffer
//   for still-included names.
//
// Per-container ring buffer: pushBounded(buf, line, MAX_LINES_PER_CONTAINER)
// from log-buffer.ts. Each container caps at 5000 lines independently so a
// chatty container can't starve a quiet one out of view.

import {useEffect, useRef, useState} from 'react'

import {MAX_LINES_PER_CONTAINER, pushBounded} from './log-buffer'

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export interface LogLine {
	id: string // monotonic per-container — `${name}#${counter}`. React key, NOT dedup.
	containerName: string
	body: string // raw text chunk (one stream chunk; may be a single newline-stripped piece)
	receivedAt: number // Date.now() at receipt
}

export interface UseMultiplexedLogsResult {
	lines: LogLine[]
	states: Record<string, ConnectionState>
	truncated: boolean
}

export const MAX_CONCURRENT_SOCKETS = 25

const FLUSH_WINDOW_MS = 100

interface UseMultiplexedLogsOptions {
	includedNames: string[]
	envId: string
	tail?: number
}

/**
 * Build the WS URL — mirrors container-detail-sheet.tsx LogsTab line 470-479
 * verbatim (port logic, JWT from localStorage, ws:/wss: scheme switching).
 */
function buildWsUrl(containerName: string, envId: string, tail: number): string {
	const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
	const port = window.location.port ? `:${window.location.port}` : ''
	const token = localStorage.getItem('jwt') || ''
	const params = new URLSearchParams({
		container: containerName,
		envId,
		tail: String(tail),
		token,
	})
	return `${wsProtocol}//${window.location.hostname}${port}/ws/docker/logs?${params}`
}

export function useMultiplexedLogs(opts: UseMultiplexedLogsOptions): UseMultiplexedLogsResult {
	const {includedNames, envId, tail = 500} = opts

	// Cap to MAX_CONCURRENT_SOCKETS to defend against the user accidentally
	// checking 100 containers. UI surfaces the truncation via the banner.
	const cappedNames = includedNames.slice(0, MAX_CONCURRENT_SOCKETS)
	const truncated = includedNames.length > MAX_CONCURRENT_SOCKETS

	// Per-container WebSocket map. Keyed by containerName; one entry per open
	// stream. Lives in a ref so it survives re-renders WITHOUT being part of
	// React's dependency tracking.
	const socketsRef = useRef<Map<string, WebSocket>>(new Map())

	// Per-container ring buffer. Keyed by containerName; each slot holds at
	// most MAX_LINES_PER_CONTAINER lines. Buffers persist across renders and
	// across the React state-flush window.
	const buffersRef = useRef<Map<string, LogLine[]>>(new Map())

	// Per-container monotonically increasing counter for LogLine.id. React
	// uses this as a key (NOT for de-duplication — the WS handler is the
	// source of truth for what arrives).
	const counterRef = useRef<Map<string, number>>(new Map())

	// Connection state mirror for the sidebar's per-row dot.
	const [states, setStates] = useState<Record<string, ConnectionState>>({})

	// Aggregated chronological line list — what consumers render.
	const [lines, setLines] = useState<LogLine[]>([])

	// Throttle timer ref — coalesces chunk events into a single setLines call
	// per FLUSH_WINDOW_MS. Critical for streams >20 lines/sec.
	const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Track previous envId so we know when to clear buffers (env crossing).
	const prevEnvIdRef = useRef<string>(envId)

	// Effect: open / close / reconcile sockets when includedNames or envId
	// changes. We intentionally take a fresh snapshot of cappedNames on each
	// run (closure over the latest array) and diff against the open sockets.
	useEffect(() => {
		const sockets = socketsRef.current
		const buffers = buffersRef.current
		const counters = counterRef.current
		const isEnvCrossing = prevEnvIdRef.current !== envId

		// Crossing the env boundary — no carryover. Close all current sockets
		// AND clear ALL buffers + counters so the new env starts from a clean
		// slate (T-28-01 cross-env isolation).
		if (isEnvCrossing) {
			sockets.forEach((s) => {
				try {
					s.close()
				} catch {
					/* ignore */
				}
			})
			sockets.clear()
			buffers.clear()
			counters.clear()
			setStates({})
			setLines([])
			prevEnvIdRef.current = envId
		}

		const desired = new Set(cappedNames)

		// Close + drop sockets/buffers for names that are no longer included.
		// Preserves buffers for still-included names so already-fetched history
		// doesn't disappear when an unrelated container is unchecked.
		for (const name of Array.from(sockets.keys())) {
			if (!desired.has(name)) {
				try {
					sockets.get(name)?.close()
				} catch {
					/* ignore */
				}
				sockets.delete(name)
				buffers.delete(name)
				counters.delete(name)
				setStates((prev) => {
					const next = {...prev}
					delete next[name]
					return next
				})
			}
		}

		// Open WS for any newly-included name.
		for (const name of cappedNames) {
			if (sockets.has(name)) continue

			setStates((prev) => ({...prev, [name]: 'connecting'}))

			let ws: WebSocket
			try {
				ws = new WebSocket(buildWsUrl(name, envId, tail))
			} catch (err) {
				// `new WebSocket(url)` throws synchronously only on bad URL
				// (extremely defensive).
				console.error(`[useMultiplexedLogs] failed to open WS for ${name}`, err)
				setStates((prev) => ({...prev, [name]: 'error'}))
				continue
			}
			ws.binaryType = 'arraybuffer'
			sockets.set(name, ws)

			ws.onopen = () => {
				setStates((prev) => ({...prev, [name]: 'open'}))
			}

			ws.onmessage = (event) => {
				const text =
					typeof event.data === 'string'
						? event.data
						: new TextDecoder().decode(new Uint8Array(event.data as ArrayBuffer))

				// Split chunk on newlines; drop trailing empty (Docker frames usually
				// end with \n). Empty pieces in the middle are kept as visible blank
				// lines, mirroring xterm rendering.
				const pieces = text.split(/\r?\n/)
				if (pieces.length > 0 && pieces[pieces.length - 1] === '') pieces.pop()

				const now = Date.now()
				let counter = counters.get(name) ?? 0
				const newLines: LogLine[] = []
				for (const piece of pieces) {
					const line: LogLine = {
						id: `${name}#${counter++}`,
						containerName: name,
						body: piece,
						receivedAt: now,
					}
					const buf = buffers.get(name) ?? []
					buffers.set(name, pushBounded(buf, line, MAX_LINES_PER_CONTAINER))
					newLines.push(line)
				}
				counters.set(name, counter)

				if (newLines.length === 0) return

				// Throttle the React state setter — coalesce all chunks within a
				// FLUSH_WINDOW_MS window into one setLines call. setTimeout (NOT
				// requestAnimationFrame) so background tabs still flush.
				if (flushTimerRef.current) return
				flushTimerRef.current = setTimeout(() => {
					flushTimerRef.current = null
					// Flatten ALL per-container buffers (most recent first per buffer,
					// then merge by receivedAt). We always rebuild from buffersRef
					// rather than appending so the cap math is honest — a re-included
					// container restoring a 5000-line buffer doesn't double-count.
					const flat: LogLine[] = []
					buffers.forEach((b) => flat.push(...b))
					flat.sort((a, b) => a.receivedAt - b.receivedAt)
					// Global cap: per-container cap × current included count.
					// Defensive in case multiple containers each filled to cap and
					// the merged total exceeds the worst-case React render budget.
					const globalCap = MAX_LINES_PER_CONTAINER * Math.max(1, cappedNames.length)
					if (flat.length > globalCap) {
						setLines(flat.slice(flat.length - globalCap))
					} else {
						setLines(flat)
					}
				}, FLUSH_WINDOW_MS)
			}

			ws.onerror = () => {
				setStates((prev) => ({...prev, [name]: 'error'}))
			}

			ws.onclose = () => {
				setStates((prev) => {
					// Don't downgrade from 'error' to 'closed' — error is more
					// informative for the sidebar dot.
					if (prev[name] === 'error') return prev
					return {...prev, [name]: 'closed'}
				})
			}
		}

		// Cleanup runs when the effect re-runs OR the component unmounts.
		// On RE-RUN (deps changed), we DON'T want to nuke everything — the
		// reconcile loop above already handled diffs. The ONLY thing the
		// cleanup needs to do is final teardown when unmounting; the deps
		// array intentionally captures includedNames + envId + tail so each
		// changing input triggers a re-run that hits the diff loop FIRST,
		// then cleanup runs at unmount.
		return () => {
			// We can't reliably detect unmount-vs-rerun in a useEffect; tear
			// everything down on every cleanup is the safe default. The next
			// run rebuilds via the diff loop above.
			if (flushTimerRef.current) {
				clearTimeout(flushTimerRef.current)
				flushTimerRef.current = null
			}
			// Note: we DO NOT close sockets in cleanup — the diff loop on the
			// next run handles close-or-keep per name. On true unmount, the
			// browser closes the sockets when the page navigates / tab closes.
			// React StrictMode double-invokes effects in dev — closing here
			// would tear down sockets the diff loop just opened.
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [includedNames.join('|'), envId, tail])

	// Final unmount: close every socket. Separate effect with empty deps so it
	// only runs once at mount/unmount, NOT on every includedNames change.
	useEffect(() => {
		return () => {
			socketsRef.current.forEach((s) => {
				try {
					s.close()
				} catch {
					/* ignore */
				}
			})
			socketsRef.current.clear()
			buffersRef.current.clear()
			counterRef.current.clear()
			if (flushTimerRef.current) {
				clearTimeout(flushTimerRef.current)
				flushTimerRef.current = null
			}
		}
	}, [])

	return {lines, states, truncated}
}
