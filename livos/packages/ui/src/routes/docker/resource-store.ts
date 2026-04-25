// Phase 26 Plan 26-01 — Docker resource detail-panel store.
//
// Holds the four detail-panel selections (selectedContainer / Image /
// Volume / Network) that ContainerSection / ImageSection / VolumesSection
// (Plan 26-02) / NetworksSection (Plan 26-02) consume to know which row
// is "open". External surfaces (Phase 25 EnvCard click pattern, Phase 28
// cross-container logs deep-link, Phase 29 palette) write into this store
// to programmatically open a specific resource — DOC-20 partial closure
// for the programmatic half. URL-bar deep-linking lands in Phase 29.
//
// All four resource types are declared up-front so Plan 26-02's
// volumes / networks reuse the SAME store — single source of truth, single
// re-render scope, no second rev when 26-02 lands.
//
// NO persist middleware: detail-sheet open state is conversational, not
// preferential. Re-opening the Docker window with a stale detail panel
// would violate least-surprise.

import {create} from 'zustand'

export interface ResourceStore {
	selectedContainer: string | null
	selectedImage: string | null
	selectedVolume: string | null
	selectedNetwork: string | null
	setSelectedContainer: (name: string | null) => void
	setSelectedImage: (id: string | null) => void
	setSelectedVolume: (name: string | null) => void
	setSelectedNetwork: (id: string | null) => void
	clearAllSelections: () => void
}

export const useDockerResource = create<ResourceStore>()((set) => ({
	selectedContainer: null,
	selectedImage: null,
	selectedVolume: null,
	selectedNetwork: null,
	setSelectedContainer: (name) => set({selectedContainer: name}),
	setSelectedImage: (id) => set({selectedImage: id}),
	setSelectedVolume: (name) => set({selectedVolume: name}),
	setSelectedNetwork: (id) => set({selectedNetwork: id}),
	clearAllSelections: () =>
		set({
			selectedContainer: null,
			selectedImage: null,
			selectedVolume: null,
			selectedNetwork: null,
		}),
}))

// Selector hooks — each subscribes to ONE slice only, so a ContainerSection
// won't re-render when selectedImage changes, and vice-versa. Pattern matches
// Plan 24-01's useDockerSection / useSidebarCollapsed split.
export const useSelectedContainer = () => useDockerResource((s) => s.selectedContainer)
export const useSelectedImage = () => useDockerResource((s) => s.selectedImage)
export const useSelectedVolume = () => useDockerResource((s) => s.selectedVolume)
export const useSelectedNetwork = () => useDockerResource((s) => s.selectedNetwork)
