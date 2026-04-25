// Phase 29 Plan 29-02 — Sidebar density preference (DOC-17).
//
// Persisted zustand store for the Docker app sidebar's per-item padding.
// 'comfortable' (default) → py-2; 'compact' → py-1. Surfaced in the
// Docker > Settings > Appearance tab as a radio toggle.
//
// Persistence key: `livos:docker:sidebar-density` — mirrors the env-store
// key naming convention from Phase 22-02 D-01.
//
// Defensive: corrupted persisted value (anything other than 'compact' or
// 'comfortable') falls back to the default 'comfortable' on hydrate.

import {create} from 'zustand'
import {createJSONStorage, persist} from 'zustand/middleware'

export type SidebarDensity = 'compact' | 'comfortable'

interface SidebarDensityStore {
	density: SidebarDensity
	setDensity: (d: SidebarDensity) => void
}

export const useSidebarDensity = create<SidebarDensityStore>()(
	persist(
		(set) => ({
			density: 'comfortable',
			setDensity: (density) => set({density}),
		}),
		{
			name: 'livos:docker:sidebar-density',
			storage: createJSONStorage(() => localStorage),
			// Defensive merge: if the persisted value is corrupted (e.g. 'banana'),
			// fall back to the default 'comfortable' rather than crash the UI.
			merge: (persisted, current) => {
				const p = persisted as Partial<SidebarDensityStore> | undefined
				const density: SidebarDensity = p?.density === 'compact' ? 'compact' : 'comfortable'
				return {...current, density}
			},
		},
	),
)
