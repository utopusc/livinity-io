// Phase 100-06: per-WebApp drawer state, shared between the floating
// action bar (rendered OUTSIDE the window via windows-container.tsx) and
// the Sheet drawer host (rendered inside webapp-stream-window.tsx, but
// portaled to document.body by shadcn Sheet).
//
// Keyed by webappId. Each WebApp window has an independent open-drawer
// mode (or null). Setting a different mode on a webappId swaps content;
// setting the SAME mode toggles closed.
//
// Sacred SHA: liv/packages/core/src/sdk-agent-runner.ts is unchanged
// (file untouched). This is a UI-only addition.

import {create} from 'zustand'

export type WebAppDrawerMode = 'chat' | 'teach' | 'auto'

interface WebAppDrawerState {
	openByWebappId: Record<string, WebAppDrawerMode | null>
	getOpen: (webappId: string) => WebAppDrawerMode | null
	toggle: (webappId: string, mode: WebAppDrawerMode) => void
	close: (webappId: string) => void
}

export const useWebAppDrawerStore = create<WebAppDrawerState>((set, get) => ({
	openByWebappId: {},
	getOpen: (webappId) => get().openByWebappId[webappId] ?? null,
	toggle: (webappId, mode) =>
		set((state) => {
			const current = state.openByWebappId[webappId] ?? null
			return {
				openByWebappId: {
					...state.openByWebappId,
					[webappId]: current === mode ? null : mode,
				},
			}
		}),
	close: (webappId) =>
		set((state) => ({
			openByWebappId: {...state.openByWebappId, [webappId]: null},
		})),
}))
