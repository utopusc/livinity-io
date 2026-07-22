// Dock+Launchpad Phase 4 — persisted, ordered dock pins.
//
// Model: the dock renders a data-driven list of DockPin entries instead
// of hardcoded JSX. Array order IS the dock order (no separate
// `dock-order` key). Persistence mirrors useDesktopFolders /
// useDesktopLayout (desktop-content.tsx): localStorage is the fast
// local source of truth, the `dock-pins` preferences key syncs across
// devices, and a StorageEvent fan-out keeps multiple hook instances on
// the same page coherent (dock + launchpad tiles + desktop context
// menus all mutate pins).
//
// One deliberate deviation from the folders hook: the remote value is
// adopted ONLY when localStorage has never been written on this device
// (null), not whenever remote is non-empty — otherwise "unpin
// everything" would resurrect the server copy on every reload.
//
// The Apps (Launchpad) tile is NOT a pin — dock.tsx renders it fixed
// first, non-removable (macOS Launchpad convention).

import {useCallback, useEffect, useRef, useState} from 'react'

import {trpcReact} from '@/trpc/trpc'

export type DockPinKind = 'system' | 'app' | 'webapp' | 'native' | 'vm'

export interface DockPin {
	kind: DockPinKind
	id: string
}

export const dockPinKey = (pin: DockPin) => `${pin.kind}:${pin.id}`

// Default pins = the pre-Phase-4 hardcoded dock (dock.tsx 102-218).
// Liv AI stays in the list even when the v42 flag is off — dock.tsx
// skips rendering it (same D-V42-ROLLBACK gate as before), so flipping
// the flag back on restores the tile without touching pins.
export const DEFAULT_DOCK_PINS: DockPin[] = [
	{kind: 'system', id: 'LIVINITY_files'},
	{kind: 'system', id: 'LIVINITY_settings'},
	{kind: 'system', id: 'LIVINITY_app-store'},
	{kind: 'system', id: 'LIVINITY_server-control'},
	{kind: 'system', id: 'LIVINITY_liv-assistant'},
]

const PINS_STORAGE_KEY = 'livinity-dock-pins'
const PINS_PREF_KEY = 'dock-pins'

function isValidPin(value: unknown): value is DockPin {
	if (typeof value !== 'object' || value === null) return false
	const v = value as Record<string, unknown>
	return (
		(v.kind === 'system' || v.kind === 'app' || v.kind === 'webapp' || v.kind === 'native' || v.kind === 'vm') &&
		typeof v.id === 'string'
	)
}

function sanitize(value: unknown): DockPin[] | null {
	if (!Array.isArray(value)) return null
	return value.filter(isValidPin).map((p) => ({kind: p.kind, id: p.id}))
}

/** null = never written on this device (distinct from "user emptied the dock"). */
function loadPinsLocal(): DockPin[] | null {
	try {
		const raw = localStorage.getItem(PINS_STORAGE_KEY)
		if (raw === null) return null
		return sanitize(JSON.parse(raw)) ?? null
	} catch {
		return null
	}
}

function savePinsLocal(pins: DockPin[]) {
	localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify(pins))
	// Same-page fan-out — StorageEvent doesn't fire in the mutating
	// document, so dispatch manually (folders-hook precedent).
	window.dispatchEvent(new StorageEvent('storage', {key: PINS_STORAGE_KEY, newValue: JSON.stringify(pins)}))
}

export function useDockPins() {
	const [pins, setPins] = useState<DockPin[]>(() => loadPinsLocal() ?? DEFAULT_DOCK_PINS)
	const serverSynced = useRef(false)

	const prefsQ = trpcReact.preferences.get.useQuery({keys: [PINS_PREF_KEY]}, {retry: false})
	const setPref = trpcReact.preferences.set.useMutation()

	useEffect(() => {
		if (prefsQ.data && !serverSynced.current) {
			serverSynced.current = true
			// Adopt the server copy only on a device that never persisted
			// pins locally (first load / fresh browser).
			if (loadPinsLocal() === null) {
				const remote = sanitize(prefsQ.data[PINS_PREF_KEY])
				if (remote && remote.length > 0) {
					setPins(remote)
					savePinsLocal(remote)
				}
			}
		}
	}, [prefsQ.data])

	useEffect(() => {
		const handler = (e: StorageEvent) => {
			if (e.key !== PINS_STORAGE_KEY) return
			try {
				const next = sanitize(JSON.parse(e.newValue || '[]'))
				if (next) setPins(next)
			} catch {}
		}
		window.addEventListener('storage', handler)
		return () => window.removeEventListener('storage', handler)
	}, [])

	const update = useCallback(
		(fn: (prev: DockPin[]) => DockPin[]) => {
			setPins((prev) => {
				const next = fn(prev)
				savePinsLocal(next)
				setPref.mutate({key: PINS_PREF_KEY, value: next})
				return next
			})
		},
		[setPref],
	)

	const isPinned = useCallback(
		(kind: DockPinKind, id: string) => pins.some((p) => p.kind === kind && p.id === id),
		[pins],
	)

	const pin = useCallback(
		(p: DockPin) => {
			update((prev) => (prev.some((x) => x.kind === p.kind && x.id === p.id) ? prev : [...prev, p]))
		},
		[update],
	)

	const unpin = useCallback(
		(kind: DockPinKind, id: string) => {
			update((prev) => prev.filter((p) => !(p.kind === kind && p.id === id)))
		},
		[update],
	)

	/** dnd-kit drag-reorder: move the pin with key `activeKey` to the slot of `overKey`. */
	const reorder = useCallback(
		(activeKey: string, overKey: string) => {
			update((prev) => {
				const from = prev.findIndex((p) => dockPinKey(p) === activeKey)
				const to = prev.findIndex((p) => dockPinKey(p) === overKey)
				if (from === -1 || to === -1 || from === to) return prev
				const next = [...prev]
				const [moved] = next.splice(from, 1)
				next.splice(to, 0, moved)
				return next
			})
		},
		[update],
	)

	return {pins, isPinned, pin, unpin, reorder}
}
