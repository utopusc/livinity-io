// Phase 357 (VMDESK-01) — persisted DESKTOP-surface VM pins.
//
// A sibling of useDockPins (354): the SAME client-only idiom (localStorage
// fast-path + generic `preferences.*` cross-device sync + same-page
// StorageEvent fan-out + adopt-once-if-never-written), a SECOND INDEPENDENT
// surface — the dock pin list and the desktop pin list never touch each
// other. Own keys ('livinity-desktop-vm-pins' / 'desktop-vm-pins'). No
// defaults (a VM is on the grid only when explicitly pinned). No reorder —
// AppGrid owns tile position.

import {useCallback, useEffect, useRef, useState} from 'react'

import {trpcReact} from '@/trpc/trpc'

export type DesktopPinKind = 'vm'

export interface DesktopPin {
	kind: DesktopPinKind
	id: string
}

const PINS_STORAGE_KEY = 'livinity-desktop-vm-pins'
const PINS_PREF_KEY = 'desktop-vm-pins'

function isValidPin(value: unknown): value is DesktopPin {
	if (typeof value !== 'object' || value === null) return false
	const v = value as Record<string, unknown>
	return v.kind === 'vm' && typeof v.id === 'string'
}

function sanitize(value: unknown): DesktopPin[] | null {
	if (!Array.isArray(value)) return null
	return value.filter(isValidPin).map((p) => ({kind: p.kind, id: p.id}))
}

/** null = never written on this device (distinct from "user emptied the desktop"). */
function loadPinsLocal(): DesktopPin[] | null {
	try {
		const raw = localStorage.getItem(PINS_STORAGE_KEY)
		if (raw === null) return null
		return sanitize(JSON.parse(raw)) ?? null
	} catch {
		return null
	}
}

function savePinsLocal(pins: DesktopPin[]) {
	localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify(pins))
	// Same-page fan-out — StorageEvent doesn't fire in the mutating
	// document, so dispatch manually (folders-hook precedent).
	window.dispatchEvent(new StorageEvent('storage', {key: PINS_STORAGE_KEY, newValue: JSON.stringify(pins)}))
}

export function useDesktopPins() {
	const [pins, setPins] = useState<DesktopPin[]>(() => loadPinsLocal() ?? [])
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
		(fn: (prev: DesktopPin[]) => DesktopPin[]) => {
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
		(kind: DesktopPinKind, id: string) => pins.some((p) => p.kind === kind && p.id === id),
		[pins],
	)

	const pin = useCallback(
		(p: DesktopPin) => {
			update((prev) => (prev.some((x) => x.kind === p.kind && x.id === p.id) ? prev : [...prev, p]))
		},
		[update],
	)

	const unpin = useCallback(
		(kind: DesktopPinKind, id: string) => {
			update((prev) => prev.filter((p) => !(p.kind === kind && p.id === id)))
		},
		[update],
	)

	return {pins, isPinned, pin, unpin}
}
