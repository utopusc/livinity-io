// Phase 29 Plan 29-01 — global palette open/close store (DOC-18).
//
// Tiny zustand store so cmd+k AND the StatusBar Search button BOTH control
// the same modal. NO persist middleware — open-state is conversational
// (closing the docker window should NOT leave the palette stuck open on
// next launch). Mirrors the resource-store pattern from Plan 26-01.

import {create} from 'zustand'

interface PaletteStore {
	open: boolean
	openPalette: () => void
	closePalette: () => void
	setOpen: (open: boolean) => void
}

export const usePaletteStore = create<PaletteStore>((set) => ({
	open: false,
	openPalette: () => set({open: true}),
	closePalette: () => set({open: false}),
	setOpen: (open) => set({open}),
}))

export const useIsPaletteOpen = () => usePaletteStore((s) => s.open)
