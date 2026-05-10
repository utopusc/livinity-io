// Phase 100-06: per-WebApp drawer state, shared between the floating
// action bar (rendered OUTSIDE the window via windows-container.tsx) and
// the Sheet drawer host (rendered inside webapp-stream-window.tsx, but
// portaled to document.body by shadcn Sheet).
//
// Keyed by webappId. Each WebApp window has an independent open-drawer
// mode (or null). Setting a different mode on a webappId swaps content;
// setting the SAME mode toggles closed.
//
// Phase 100-09-05: extended with `chatLogExpandedByWebappId` +
// `toggleChatLog` for the inline bottom-bar chat (replaces the Chat
// shadcn Sheet drawer per user "Chat penceresi olmasin sadece yazi
// yazalim. Yazilar sadece Alt kisimda gozuksun."). The drawer host's
// `chat` branch is removed in webapp-stream-window.tsx; the floating
// Chat icon dispatches `toggleChatLog(webappId)` instead of `toggle`.
//
// Phase 100-09-06: extended with `isRecordingByWebappId` +
// `toggleTeachRecording` for the popup-driven Teach mode (replaces the
// Teach shadcn Sheet drawer per user "altadki teach mode da da aynisi
// gecerli tiklandiginda panel acilmasin"). The drawer host's `teach`
// branch is removed in webapp-stream-window.tsx; the floating Teach
// icon dispatches `toggleTeachRecording(webappId)` and the recorder
// hook lifecycle is driven from this Zustand state via a useEffect in
// webapp-stream-window.tsx.
//
// Sacred SHA: liv/packages/core/src/sdk-agent-runner.ts is unchanged
// (file untouched). This is a UI-only addition.

import {create} from 'zustand'

export type WebAppDrawerMode = 'chat' | 'teach' | 'auto'

interface WebAppDrawerState {
	openByWebappId: Record<string, WebAppDrawerMode | null>
	/** Phase 100-09-05: per-webappId expanded state for the inline bottom chat log. */
	chatLogExpandedByWebappId: Record<string, boolean>
	/** Phase 100-09-06: per-webappId teach recording active flag. */
	isRecordingByWebappId: Record<string, boolean>
	getOpen: (webappId: string) => WebAppDrawerMode | null
	toggle: (webappId: string, mode: WebAppDrawerMode) => void
	close: (webappId: string) => void
	/** Phase 100-09-05: flip expanded state for the inline chat log. */
	toggleChatLog: (webappId: string) => void
	/** Phase 100-09-06: flip recording state for the WebApp's teach mode. */
	toggleTeachRecording: (webappId: string) => void
}

export const useWebAppDrawerStore = create<WebAppDrawerState>((set, get) => ({
	openByWebappId: {},
	chatLogExpandedByWebappId: {},
	isRecordingByWebappId: {}, // Phase 100-09-06
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
	toggleChatLog: (webappId) =>
		set((state) => ({
			chatLogExpandedByWebappId: {
				...state.chatLogExpandedByWebappId,
				[webappId]: !state.chatLogExpandedByWebappId[webappId],
			},
		})),
	// Phase 100-09-06 — flip the teach recording flag. The recorder hook
	// lifecycle (start/stop) is driven from a useEffect in
	// webapp-stream-window.tsx that subscribes to this slot.
	toggleTeachRecording: (webappId) =>
		set((state) => ({
			isRecordingByWebappId: {
				...state.isRecordingByWebappId,
				[webappId]: !state.isRecordingByWebappId[webappId],
			},
		})),
}))
