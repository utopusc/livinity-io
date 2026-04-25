// Phase 24-02 — Time-tick hook for the StatusBar clock pill.
//
// Returns a Date that updates every `intervalMs` (default 1000ms). Owned by
// the StatusBar so re-renders triggered by the clock don't propagate to
// the rest of the docker-app (Sidebar / SectionView don't import this).
//
// Skipped a unit test: setInterval testing requires fake timers and adds
// friction for trivially correct code; the StatusBar smoke test in Task 3
// validates the time pill ticks visually.

import {useEffect, useState} from 'react'

export function useNow(intervalMs: number = 1000): Date {
	const [now, setNow] = useState(() => new Date())
	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), intervalMs)
		return () => clearInterval(id)
	}, [intervalMs])
	return now
}
