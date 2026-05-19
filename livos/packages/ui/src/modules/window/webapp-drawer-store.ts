//
// Phase 159 — namespace re-use note (Workstream A).
//
// This Zustand store's `byWebappId` key namespace (chatInputModeByWebappId,
// teachEventsByWebappId, selectedSkillIdByWebappId, etc.) is RE-USED for
// native app ids too. Both WebApp and NativeApp ids are UUIDv4 —
// collision probability is cryptographically negligible (~2^-122 per pair).
//
// The slot name is intentionally preserved (NOT renamed to `byStreamAppId`)
// to keep the existing 117-line source-text invariant test in
// webapp-floating-action-bar.test.tsx passing without cascade-breaking
// 20+ locked literals. Consumers (webapp-floating-action-bar.tsx, Plan 07)
// compute `const streamId = webappId ?? nativeAppId` and select with that.
//
// Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (sdk-agent-runner.ts) unchanged.
//
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
// Phase 100-09-09: extended with `teachEventsByWebappId` +
// `setTeachEvents` so the IconBar (in `webapp-floating-action-bar.tsx`)
// can read the live click count off the recorder. The recorder hook
// itself (`useTeachRecorder`) lives inside `webapp-stream-window.tsx`
// and emits a fresh array on each event push — the stream-window
// mirrors that array to the store via a useEffect, and the floating
// bar's IconBar subscribes to derive `events.length` for the badge.
// Per user "tikladiktan sonra kirmizi buton olsun teach. sag yukarida
// stop butonu olmasin ve sure saymasin sadece clickleri saysin": the
// Teach icon button itself turns red and shows the click count badge;
// the top-right `TeachRecordingOverlay` from 09-06 is removed.
//
// Sacred SHA: liv/packages/core/src/sdk-agent-runner.ts is unchanged
// (file untouched). This is a UI-only addition.

import {create} from 'zustand'

import type {ActionEvent} from '@/hooks/use-teach-recorder'

// Phase 100-10-06 D-100-10-E: ChatInputMode union extended from 2-state
// ('icons' | 'chat-input') to 3-state ('icons' | 'chat-input' |
// 'chat-response'). Send/Enter from ChatInputBar now transitions to
// 'chat-response' (NOT back to 'icons') so the assistant streaming reply
// renders in-place where the input was. The Stop button in 'chat-response'
// mode calls useWebAppAgent.stopStreaming (alias for the existing
// useAgentSocket.interrupt — sends `{type: 'interrupt'}` over the WS).
//
// Phase 100-10-05 D-100-10-G: 'auto' branch narrowed out of the drawer
// mode union. The Auto icon button + WebAppAutoDrawer component were
// removed from the UI surface entirely; only Chat + Teach modes remain
// (and both are now driven via dedicated flag slots — chatInputMode +
// isRecording — not the legacy openByWebappId drawer slot). The slot
// is preserved for type-narrowing safety: openByWebappId entries are
// effectively always null in current code, but the slot stays so the
// Sheet drawer host (which still exists for revert safety) compiles.
export type WebAppDrawerMode = 'chat' | 'teach'

/** Phase 100-09-08: floating action bar 2-mode state machine.
 *  Phase 100-10-06 D-100-10-E: extended to a 3-mode state machine. The
 *  new 'chat-response' mode replaces the input area in-place with a live
 *  streaming response panel + Stop button + Close (X) — Send/Enter no
 *  longer returns directly to 'icons'; it transitions to 'chat-response'
 *  so the assistant reply renders where the user just typed.
 */
export type ChatInputMode = 'icons' | 'chat-input' | 'chat-response'

/** Phase 100-09-09: shared empty-array sentinel for `teachEventsByWebappId`
 *  default reads. Returning a fresh `[]` from a Zustand selector breaks
 *  shallow-equality and re-renders forever; this stable reference keeps
 *  the default selector path identity-stable across renders.
 */
export const EMPTY_TEACH_EVENTS: readonly ActionEvent[] = Object.freeze([])

interface WebAppDrawerState {
	openByWebappId: Record<string, WebAppDrawerMode | null>
	/** Phase 100-09-05: per-webappId expanded state for the inline bottom chat log. */
	chatLogExpandedByWebappId: Record<string, boolean>
	/** Phase 100-09-06: per-webappId teach recording active flag. */
	isRecordingByWebappId: Record<string, boolean>
	/** Phase 100-09-08: per-webappId floating-bar mode (icons | chat-input). */
	chatInputModeByWebappId: Record<string, ChatInputMode>
	/** Phase 100-09-09: per-webappId mirror of the active recorder's events
	 *  (live array reference; reset to empty on stop). IconBar reads this
	 *  to derive `events.length` for the click-count badge.
	 */
	teachEventsByWebappId: Record<string, readonly ActionEvent[]>
	/** Phase 100-10-05 D-100-10-D: per-webappId selected skill id (drives
	 *  the SkillReplayScrubber inside webapp-stream-window.tsx). The new
	 *  outside-window floating skills button writes here via setSelectedSkillId;
	 *  the stream-window reads it to render the scrubber overlay.
	 */
	selectedSkillIdByWebappId: Record<string, string | null>
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
	/** Phase 100-09-09: replace the events mirror for a WebApp (called from
	 *  webapp-stream-window.tsx whenever `recorder.events` updates).
	 */
	setTeachEvents: (webappId: string, events: readonly ActionEvent[]) => void
	/** Phase 100-10-05 D-100-10-D: set the selected skill id (called from
	 *  the outside-window WebAppFloatingSkillsButton when user clicks Play).
	 *  Pass null to clear (scrubber close path).
	 */
	setSelectedSkillId: (webappId: string, skillId: string | null) => void
}

export const useWebAppDrawerStore = create<WebAppDrawerState>((set, get) => ({
	openByWebappId: {},
	chatLogExpandedByWebappId: {},
	isRecordingByWebappId: {}, // Phase 100-09-06
	chatInputModeByWebappId: {}, // Phase 100-09-08
	teachEventsByWebappId: {}, // Phase 100-09-09
	selectedSkillIdByWebappId: {}, // Phase 100-10-05
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
	// click → 'chat-input'; Send → 'chat-response'; Escape/Close → 'icons')
	// use the explicit `setChatInputMode` path so the action is grep-friendly.
	// Phase 100-10-06: kept as a 2-state flip (icons ↔ chat-input) for
	// back-compat. The new 'chat-response' mode is only reachable via
	// explicit `setChatInputMode(webappId, 'chat-response')` from the
	// ChatInputBar Send/Enter handler.
	toggleChatInputMode: (webappId) =>
		set((state) => ({
			chatInputModeByWebappId: {
				...state.chatInputModeByWebappId,
				[webappId]: (state.chatInputModeByWebappId[webappId] ?? 'icons') === 'icons' ? 'chat-input' : 'icons',
			},
		})),
	// Phase 100-09-09 — mirror the recorder's events array. The
	// stream-window's existing recorder.events state is the canonical
	// source; this store slot is a read-side mirror for the floating
	// action bar's IconBar (which can't access the recorder directly
	// because it lives outside the WebApp window subtree). Stable
	// identity matters: pass through the recorder's array reference
	// directly so consumers' shallow-equality selectors stay correct.
	setTeachEvents: (webappId, events) =>
		set((state) => ({
			teachEventsByWebappId: {
				...state.teachEventsByWebappId,
				[webappId]: events,
			},
		})),
	// Phase 100-10-05 D-100-10-D — write the per-webappId selected skill id
	// from the outside-window floating skills button. The stream-window
	// subscribes to read it and render the SkillReplayScrubber overlay.
	setSelectedSkillId: (webappId, skillId) =>
		set((state) => ({
			selectedSkillIdByWebappId: {
				...state.selectedSkillIdByWebappId,
				[webappId]: skillId,
			},
		})),
}))
