// Phase 28 Plan 28-01 — LogsSection composition (DOC-13).
//
// Top-level cross-container logs surface. Composes:
//   - LogsSidebar (left, 240px) — running containers in selected env, with
//     checkboxes the user toggles to add/remove streams.
//   - LogsViewer (right, fills remaining space) — multiplexed log feed with
//     grep + severity + live-tail.
//   - useMultiplexedLogs hook owns per-container WebSocket lifecycle, line
//     aggregation, and the 25-socket truncation cap (T-28-02).
//
// `selectedNames` is local component state (NOT zustand) — checkbox state
// is conversational, like resource detail panels (resource-store had no
// persist for the same reason). When the env changes, useMultiplexedLogs
// internally clears all buffers; we ALSO reset selectedNames here so the
// new env's sidebar starts clean (no checkboxes pointing at containers
// that don't exist in the new env).
//
// Note: per-container xterm log viewer in ContainerDetailSheet (Phase 17
// QW-01) stays untouched — that's the canonical drilldown for ANSI-colored
// single-container logs. This section is the complementary cross-container
// surface for grep / triage workflows.

import {useCallback, useEffect, useState} from 'react'

import {useContainers} from '@/hooks/use-containers'
import {useSelectedEnvironmentId} from '@/stores/environment-store'

import {LogsSidebar} from './logs-sidebar'
import {LogsViewer} from './logs-viewer'
import {useMultiplexedLogs} from './use-multiplexed-logs'

export function LogsSection() {
	const envId = useSelectedEnvironmentId()
	const {containers} = useContainers()
	const [selectedNames, setSelectedNames] = useState<string[]>([])

	// On env change: clear selections so checkboxes don't reference
	// containers from the previous env. useMultiplexedLogs internally
	// closes all sockets + clears buffers when envId changes; this just
	// keeps the UI state in sync.
	useEffect(() => {
		setSelectedNames([])
	}, [envId])

	// Drop stale selections when the running container list changes (e.g.
	// user stopped a container that was being streamed) — mirrors the
	// pattern from container-section.tsx.
	useEffect(() => {
		const runningNames = new Set(containers.filter((c) => c.state === 'running').map((c) => c.name))
		setSelectedNames((prev) => {
			const filtered = prev.filter((n) => runningNames.has(n))
			if (filtered.length === prev.length) return prev
			return filtered
		})
	}, [containers])

	const onToggle = useCallback((name: string) => {
		setSelectedNames((prev) => {
			if (prev.includes(name)) return prev.filter((n) => n !== name)
			return [...prev, name]
		})
	}, [])

	const onSelectAll = useCallback(() => {
		const runningNames = containers.filter((c) => c.state === 'running').map((c) => c.name)
		setSelectedNames(runningNames)
	}, [containers])

	const onClearAll = useCallback(() => {
		setSelectedNames([])
	}, [])

	const {lines, states, truncated} = useMultiplexedLogs({
		includedNames: selectedNames,
		envId,
		tail: 500,
	})

	return (
		<div className='flex h-full'>
			<LogsSidebar
				selectedNames={selectedNames}
				onToggle={onToggle}
				onSelectAll={onSelectAll}
				onClearAll={onClearAll}
				states={states}
			/>
			<div className='flex min-w-0 flex-1 flex-col'>
				<LogsViewer lines={lines} truncated={truncated} />
			</div>
		</div>
	)
}
