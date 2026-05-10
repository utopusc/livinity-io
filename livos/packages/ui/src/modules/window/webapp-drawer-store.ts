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
// Phase 100-09-08: extended with `chatInputModeByWebappId` +
// `setChatInputMode` + `toggleChatInputMode` for the 2-mode floating
// action bar. Per user "Message Liv... kismi pencerenin icinde olmamasi
// lazimdi assagida message iconuna tikladigimda o kisimin butun olarak
// inputa donusmesi lazimdi": the persistent inline chat bar shipped in
// 09-05 was wrong. Replace with a state machine on the floating action
// bar (rendered OUTSIDE the WebApp window per 100-06):
//   mode='icons'      → 4-button row (Chat / Teach / Auto).
//   mode='chat-input' → text input + Send + Close (X).
// Default mode is 'icons'. Chat icon click → 'chat-input'.
// Send/Enter sends + returns to 'icons'. Close/Escape returns to 'icons'
// without sending. The 09-05 `chatLogExpandedByWebappId` slot is left
// in place for now (used by the deprecated `webapp-chat-bottom-bar.tsx`;
// removed in v34 cleanup).
//
// Sacred SHA: liv/packages/core/src/sdk-agent-runner.ts is unchanged
// (file untouched). This is a UI-only addition.

import {create} from 'zustand'

export type WebAppDrawerMode = 'chat' | 'teach' | 'auto'

/** Phase 100-09-08: floating action bar 2-mode state machine. */
export type ChatInputMode = 'icons' | 'chat-input'

interface WebAppDrawerState {
	openByWebappId: Record<string, WebAppDrawerMode | null>
	/** Phase 100-09-05: per-webappId expanded state for the inline bottom chat log. */
	chatLogExpandedByWebappId: Record<string, boolean>
	/** Phase 100-09-06: per-webappId teach recording active flag. */
	isRecordingByWebappId: Record<string, boolean>
	/** Phase 100-09-08: per-webappId floating-bar mode (icons | chat-input). */
	chatInputModeByWebappId: Record<string, ChatInputMode>
	getOpen: (webappId: string) => WebAppDrawerMode | null
	toggle: (webappId: string, mode: WebAppDrawerMode) => void
	close: (webappId: string) => void
	/** Phase 100-09-05: flip expanded state for the inline chat log. */
	toggleChatLog: (webappId: string) => void
	/** Phase 100-09-06: flip recording state for the WebApp's teach mode. */
	toggleTeachRecording: (webappId: string) => void
	/** Phase 100-09-08: set the floating-bar mode for a WebApp. */
	setChatInputMode: (webappId: string, mode: ChatInputMode) => void
	/** Phase 100-09-08: toggle between 'icons' and 'chat-input'. */
	toggleChatInputMode: (webappId: string) => void
}

export const useWebAppDrawerStore = create<WebAppDrawerState>((set, get) => ({
	openByWebappId: {},
	chatLogExpandedByWebappId: {},
	isRecordingByWebappId: {}, // Phase 100-09-06
	chatInputModeByWebappId: {}, // Phase 100-09-08
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
	// Phase 100-09-08 — set the floating-bar mode (icons | chat-input).
	// Default (undefined slot) reads as 'icons' at consumer sites via
	// `?? 'icons'`. Setter writes the explicit mode.
	setChatInputMode: (webappId, mode) =>
		set((state) => ({
			chatInputModeByWebappId: {
				...state.chatInputModeByWebappId,
				[webappId]: mode,
			},
		})),
	// Phase 100-09-08 — toggle between icons and chat-input. Convenience
	// for keyboard / programmatic flips; the primary wires (Chat icon
	// click → 'chat-input'; Send/Escape/Close → 'icons') use the explicit
	// `setChatInputMode` path so the action is grep-friendly.
	toggleChatInputMode: (webappId) =>
		set((state) => ({
			chatInputModeByWebappId: {
				...state.chatInputModeByWebappId,
				[webappId]: (state.chatInputModeByWebappId[webappId] ?? 'icons') === 'icons' ? 'chat-input' : 'icons',
			},
		})),
}))
