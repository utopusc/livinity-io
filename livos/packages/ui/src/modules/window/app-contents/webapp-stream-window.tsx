// Phase 95-08 / 100-03 — WebAppStreamWindow.
//
// Root content for a WebApp window. Composes:
//   - VNC stream from useWebAppVnc (95-04) — full-bleed, fills the window.
//   - Overlays: spawn-error banner, VNC overlay, teach overlays, replay
//     scrubber. All absolute-positioned over the stream pane.
//
// Phase 100-03 (V33-MULTI-02 / G-100-E E1):
//   - Top webapp-toolbar (URL bar + back/forward/refresh chord) DROPPED.
//     Chrome `--app=URL` mode (P100-02 backend swap) renders chromeless,
//     so the LivOS-side URL display is doubly redundant.
//   - Inline resizable vertical split DROPPED. The bottom
//     pane that used to host the agent panel + mode selector +
//     skills sidebar is removed; those surfaces relocate into
//     drawers in 100-04. Stream area becomes `flex-1` of a single column.
//   - Root wrapper is `relative flex h-full w-full flex-col`.
//   - Phase 100-06: the bottom action bar moved OUTSIDE the window into
//     `webapp-floating-action-bar.tsx` (rendered in windows-container.tsx
//     for WebApp windows). The `pb-9` reservation on the stream wrapper
//     becomes obsolete here but is preserved for layout stability — the
//     new bar lives 16px below the window edge in viewport coords.
//
// Lifecycle (preserved byte-for-byte from 95-08 / 95-07.B / 99-04):
//   - On mount: fire `webapp.window.spawn({webappId, url})`. Capture wsUrl.
//   - On unmount: fire `webapp.window.close({webappId})` (D-95-CLEANUP,
//     fire-and-forget; window manager owns idle cleanup as a backstop).
//   - SERVICE_UNAVAILABLE from spawn → render inline error banner over the
//     VNC pane with a retry button (D-95-12).

import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {toast} from 'sonner'
import {AlertTriangle, RefreshCw, Square} from 'lucide-react'

import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'
import {useWebAppVnc} from '@/hooks/use-webapp-vnc'
import {useWebAppAgent} from '@/hooks/use-webapp-agent'
import {useTeachRecorder, type ActionLog} from '@/hooks/use-teach-recorder'

import {type WebAppMode} from '../webapp-mode-selector'
import {SkillReplayScrubber} from '../skill-replay-scrubber'

// Phase 100-09-05: WebAppChatDrawer import dropped — chat surface moved
// inline via <WebAppChatBottomBar/> below. The drawer file is retained as
// DEPRECATED reference target (see webapp-chat-drawer.tsx banner).
//
// Phase 100-09-06: WebAppTeachDrawer import dropped — teach surface moved
// to popup-per-event toasts (<WebAppTeachPopupHost/>) + top-right Skills
// popover (<WebAppSkillsPopover/>). The drawer file is retained as
// DEPRECATED reference target (see webapp-teach-drawer.tsx banner).
import {WebAppAutoDrawer} from './webapp-auto-drawer'
import {WebAppChatBottomBar} from './webapp-chat-bottom-bar'
import {WebAppTeachPopupHost} from './webapp-teach-popup-host'
import {WebAppSkillsPopover} from './webapp-skills-popover'

import {Sheet, SheetContent} from '@/shadcn-components/ui/sheet'
import {useWebAppDrawerStore} from '../webapp-drawer-store'

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'

// noVNC keysyms — X11 keysymdef. Preserved here as constants for 100-04's
// drawer hosts to lift back/forward/refresh chord wiring (the chord helpers
// themselves were removed with the toolbar in 100-03; the keysyms stay as
// the canonical X11 values so the lift is a pure paste).
const KEY_ALT_LEFT = 0xffe9 // XK_Alt_L
const KEY_ARROW_LEFT = 0xff51
const KEY_ARROW_RIGHT = 0xff53
const KEY_F5 = 0xffc2

// Phase 96-04 — privacy-warning ack key (96-CONTEXT §gray-area #2).
// Persisted in localStorage so the toast doesn't nag forever once the
// user has acknowledged it. Per-session re-fire would be more naggy than
// the per-install dismissal that the v32 toast convention favours.
const TEACH_PRIVACY_ACK_KEY = 'liv:webapp:teach:warning-ack:v1'

const TEACH_PRIVACY_TEXT =
	'Do not enter passwords during teach mode. Screenshots may capture typed text.'

// Slug-safe skill name validator — mirrors the SLUG_RE in skills-router.ts.
const SKILL_NAME_RE = /^[A-Za-z0-9 _-]{1,80}$/

// Phase 100-04 — bottom action-bar drawer mode constants. Each icon
// toggles its own Sheet drawer (G-100-D D2). Lucide icon set is the
// project convention for window subsystem files.
type DrawerMode = 'chat' | 'teach' | 'auto'

// Phase 100-06: MODE_ICONS / MODE_LABELS moved to webapp-floating-action-bar.tsx
// alongside the icon row's render path. The drawer host below picks the body
// component by `openDrawer` mode and doesn't need the icon/label maps.

interface WebAppStreamWindowProps {
	webappId: string
}

export default function WebAppStreamWindow({webappId}: WebAppStreamWindowProps) {
	// 1. Pull this WebApp's row from the persisted list (URL is needed for
	// the spawn input + the toolbar copy-URL action — D-95-15).
	const webappListQuery = trpcReact.webapp.list.useQuery(undefined, {
		staleTime: 30_000,
	})
	const webapp = useMemo(
		() => webappListQuery.data?.find((w) => w.id === webappId) ?? null,
		[webappListQuery.data, webappId],
	)

	// 2. Spawn the host Chrome window. webapp.window.spawn is registered
	// in httpOnlyPaths so survives WS reconnect (P93 / common.ts).
	const spawnMutation = trpcReact.webapp.window.spawn.useMutation()
	const closeMutation = trpcReact.webapp.window.close.useMutation()

	const [wsUrl, setWsUrl] = useState<string | null>(null)
	const [spawnError, setSpawnError] = useState<{code: string; message: string} | null>(null)

	// 2026-05-08 hotfix: useMutation returns a new object reference every
	// render, so any callback that closes over `spawnMutation` is unstable.
	// Putting `triggerSpawn` in a useEffect dep array caused the spawn call
	// to fire on every render → ERR_INSUFFICIENT_RESOURCES (browser ran out
	// of connection slots). Two-layer fix:
	//   1. Mutation reference is parked in a ref so triggerSpawn's deps
	//      reduce to {webapp, webappId} (stable across renders).
	//   2. spawnedForRef guards "fire once per webappId" — even if upstream
	//      churn rebuilds triggerSpawn, the effect won't re-fire the spawn.
	//      Ref resets only when the user navigates to a different WebApp.
	const spawnMutationRef = useRef(spawnMutation)
	spawnMutationRef.current = spawnMutation
	const spawnedForRef = useRef<string | null>(null)

	const triggerSpawn = useCallback(() => {
		if (!webapp) return
		setSpawnError(null)
		spawnMutationRef.current.mutate(
			{webappId, url: webapp.url, expectedTitle: webapp.title ?? undefined},
			{
				onSuccess: (res) => {
					setWsUrl(res.wsUrl)
				},
				onError: (err) => {
					// SERVICE_UNAVAILABLE is the expected pre-P98 state — surface a
					// friendly banner; keep the agent panel functional below.
					setSpawnError({
						code: err.data?.code ?? 'INTERNAL_SERVER_ERROR',
						message: err.message || 'Failed to start WebApp stream',
					})
				},
			},
		)
	}, [webapp, webappId])

	useEffect(() => {
		if (!webapp || wsUrl || spawnError) return
		if (spawnedForRef.current === webappId) return
		spawnedForRef.current = webappId
		triggerSpawn()
	}, [webapp, wsUrl, spawnError, webappId, triggerSpawn])

	// 3. Cleanup on unmount — fire-and-forget close (D-95-CLEANUP). The
	// window manager owns idle cleanup as a backstop; failure here is
	// logged not blocking.
	const closeMutationRef = useRef(closeMutation)
	useEffect(() => {
		closeMutationRef.current = closeMutation
	}, [closeMutation])

	useEffect(() => {
		return () => {
			try {
				closeMutationRef.current.mutate({webappId})
			} catch {
				// Non-blocking cleanup — log channel handled by tRPC error sink.
			}
		}
	}, [webappId])

	// 4. VNC + agent hooks.
	// Phase 100-07: viewOnly=true disables RFB input forwarding. Mouse +
	// keyboard events are intercepted on the canvas below and dispatched
	// via tRPC `webapp.input.*` so they target the bound wid via
	// `xdotool --window <wid>` (X11-focus-independent).
	const vnc = useWebAppVnc(wsUrl ?? undefined, {viewOnly: true})
	const agent = useWebAppAgent(webappId)

	// Phase 100-07: tRPC input dispatch mutations.
	const inputClickMutation = trpcReact.webapp.input.click.useMutation()
	const inputKeyMutation = trpcReact.webapp.input.keypress.useMutation()
	const inputTypeMutation = trpcReact.webapp.input.type.useMutation()
	// Phase 100-09-02: scroll wheel mutation (closes Bug 2 — scroll-down).
	const inputScrollMutation = trpcReact.webapp.input.scroll.useMutation()

	// Phase 100-07: canvas event interception. Translates browser mouse +
	// keyboard events into framebuffer-space coords (Chrome is locked to
	// 1280x720 by Phase 100-06.1) and forwards via tRPC. RFB transport is
	// viewOnly so x11vnc's XTestFakeKey/MotionEvent dispatch is bypassed.
	useEffect(() => {
		const container = vnc.containerRef.current
		if (!container) return
		// noVNC creates a child <canvas> after connect. Listen on the container
		// so events arrive even before the canvas exists, but resolve coords
		// against whichever inner element actually has the bounding rect.
		container.tabIndex = 0 // make focusable for keyboard events
		container.style.outline = 'none' // suppress focus ring

		const fbW = 1280
		const fbH = 720

		const eventToFbCoords = (ev: MouseEvent): {x: number; y: number} => {
			const rect = container.getBoundingClientRect()
			if (rect.width === 0 || rect.height === 0) return {x: 0, y: 0}
			const cx = (ev.clientX - rect.left) * (fbW / rect.width)
			const cy = (ev.clientY - rect.top) * (fbH / rect.height)
			return {
				x: Math.max(0, Math.min(fbW, Math.round(cx))),
				y: Math.max(0, Math.min(fbH, Math.round(cy))),
			}
		}

		// Map DOM MouseEvent.button (0/1/2) → xdotool 1/2/3.
		const xdotoolButton = (b: number): 1 | 2 | 3 => (b === 2 ? 3 : b === 1 ? 2 : 1)

		// Phase 100-07.1: dispatch a single combined click on mouseup (NOT
		// separate mousedown+mouseup). xdotool's `click` is mousedown+mouseup
		// in a single sub-command — atomic, doesn't double-thrash the
		// `windowactivate --sync` step. Drag-and-double-click are out of MVP
		// scope; can be re-added later if needed.
		const onMouseDown = (ev: MouseEvent) => {
			ev.preventDefault()
			container.focus()
		}

		const onMouseUp = (ev: MouseEvent) => {
			ev.preventDefault()
			const {x, y} = eventToFbCoords(ev)
			// eslint-disable-next-line no-console
			console.info(`[100-07.2] click → tRPC webappId=${webappId} x=${x} y=${y} btn=${xdotoolButton(ev.button)}`)
			inputClickMutation.mutate(
				{
					webappId,
					x,
					y,
					button: xdotoolButton(ev.button),
					kind: 'click',
				},
				{
					onError: (err) => {
						// eslint-disable-next-line no-console
						console.error(`[100-07.2] click mutation failed`, err)
					},
				},
			)
		}

		const onContextMenu = (ev: MouseEvent) => {
			// Suppress browser-native context menu on the stream — right-click
			// is dispatched through onMouseDown/Up as button=3.
			ev.preventDefault()
		}

		// Translate DOM key.event to xdotool keysym names. For printable
		// characters we fall through to dispatchType so xdotool's IME does the
		// keysym mapping; for special keys we send the keysym name directly.
		const SPECIAL_KEYS: Record<string, string> = {
			Enter: 'Return',
			Escape: 'Escape',
			Backspace: 'BackSpace',
			Tab: 'Tab',
			Delete: 'Delete',
			ArrowUp: 'Up',
			ArrowDown: 'Down',
			ArrowLeft: 'Left',
			ArrowRight: 'Right',
			Home: 'Home',
			End: 'End',
			PageUp: 'Page_Up',
			PageDown: 'Page_Down',
			' ': 'space',
			F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
			F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
		}

		const onKeyDown = (ev: KeyboardEvent) => {
			// Only act when our container is the active element (focus-scoped).
			if (document.activeElement !== container) return
			const special = SPECIAL_KEYS[ev.key]
			if (special) {
				ev.preventDefault()
				const mods: string[] = []
				if (ev.ctrlKey) mods.push('ctrl')
				if (ev.shiftKey) mods.push('shift')
				if (ev.altKey) mods.push('alt')
				if (ev.metaKey) mods.push('super')
				const keysym = mods.length > 0 ? `${mods.join('+')}+${special}` : special
				inputKeyMutation.mutate({webappId, key: keysym, kind: 'key'})
				return
			}
			// Modifier-bearing letter shortcuts (e.g. Ctrl+A, Ctrl+L). When a
			// modifier is held with a printable key, route via keypress so
			// xdotool dispatches the chord; otherwise let onKeyPress (below)
			// handle plain text via type.
			if ((ev.ctrlKey || ev.altKey || ev.metaKey) && ev.key.length === 1) {
				ev.preventDefault()
				const mods: string[] = []
				if (ev.ctrlKey) mods.push('ctrl')
				if (ev.shiftKey) mods.push('shift')
				if (ev.altKey) mods.push('alt')
				if (ev.metaKey) mods.push('super')
				const keysym = `${mods.join('+')}+${ev.key.toLowerCase()}`
				inputKeyMutation.mutate({webappId, key: keysym, kind: 'key'})
				return
			}
			// Plain printable: emit via type so unicode chars work without keysym lookup.
			if (ev.key.length === 1) {
				ev.preventDefault()
				inputTypeMutation.mutate({webappId, text: ev.key})
			}
		}

		// Phase 100-09-02: wheel handler. preventDefault REQUIRES passive: false
		// on addEventListener (capture phase). Maps DOM WheelEvent deltaY/deltaX
		// to X11 scroll button conventions:
		//   button 4 = scroll up   (deltaY < 0)
		//   button 5 = scroll down (deltaY > 0)
		//   button 6 = scroll left (deltaX < 0)
		//   button 7 = scroll right(deltaX > 0)
		// Browsers (touchpads in particular) may emit both deltaY and deltaX
		// simultaneously. Dispatch each axis as its own event since xdotool
		// scroll buttons are not combinable.
		const onWheel = (ev: WheelEvent) => {
			// Suppress browser-native scroll — events route through tRPC to the
			// captured Chrome via xdotool (the noVNC canvas is viewOnly:true so
			// scroll never reaches the captured Chrome via RFB). preventDefault
			// requires passive:false on the listener registration below.
			ev.preventDefault()
			const {x, y} = eventToFbCoords(ev)
			if (ev.deltaY !== 0) {
				const button = ev.deltaY > 0 ? 5 : 4
				// eslint-disable-next-line no-console
				console.info(`[100-09-02] wheel-Y → tRPC webappId=${webappId} btn=${button} dy=${ev.deltaY}`)
				inputScrollMutation.mutate(
					{webappId, x, y, button: button as 4 | 5},
					{
						onError: (err) => {
							// eslint-disable-next-line no-console
							console.error(`[100-09-02] scroll mutation failed`, err)
						},
					},
				)
			}
			if (ev.deltaX !== 0) {
				const button = ev.deltaX > 0 ? 7 : 6
				inputScrollMutation.mutate({webappId, x, y, button: button as 6 | 7})
			}
		}

		// Phase 100-07.2: capture phase so OUR handlers fire BEFORE noVNC's
		// canvas listeners (defensive — noVNC viewOnly=true should already
		// no-op its handlers, but capture phase is the belt-and-suspenders
		// guarantee).
		const opts = {capture: true} as const
		container.addEventListener('mousedown', onMouseDown, opts)
		container.addEventListener('mouseup', onMouseUp, opts)
		container.addEventListener('contextmenu', onContextMenu, opts)
		container.addEventListener('keydown', onKeyDown, opts)
		// Phase 100-09-02: wheel listener — capture + passive:false so
		// preventDefault() can suppress native browser scroll. Browsers default
		// wheel listeners to passive:true if not specified, which silently
		// drops preventDefault() calls — the explicit object literal here is
		// LOAD-BEARING for the scroll-routing-via-tRPC behavior.
		const wheelOpts = {capture: true, passive: false} as const
		container.addEventListener('wheel', onWheel, wheelOpts)
		// Diagnostic — log once on mount so we can verify in browser console
		// that the new wiring is loaded (vs. service-worker-cached old UI).
		// eslint-disable-next-line no-console
		console.info(`[100-07.2] canvas input handlers attached webappId=${webappId}`)

		return () => {
			container.removeEventListener('mousedown', onMouseDown, opts)
			container.removeEventListener('mouseup', onMouseUp, opts)
			container.removeEventListener('contextmenu', onContextMenu, opts)
			container.removeEventListener('keydown', onKeyDown, opts)
			container.removeEventListener('wheel', onWheel, wheelOpts)
		}
	}, [vnc.containerRef, webappId, inputClickMutation, inputKeyMutation, inputTypeMutation, inputScrollMutation])

	// 5. Mode (D-95-10 default 'chat'; D-95-MODE-LOCAL = local state only).
	//
	// Phase 100-09-06: `mode` local state retained ONLY for the source-text
	// invariant in webapp-stream-window.unit.test.tsx (`useState<WebAppMode>('chat')`).
	// The recorder lifecycle no longer reads it — that's now driven by the
	// drawer-store `isRecordingByWebappId` flag (see useEffect below). The
	// state hook is preserved as documentation of the historical mode
	// machine without contributing to runtime behavior.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [mode, setMode] = useState<WebAppMode>('chat')

	// Phase 100-06 — drawer-open state moved to a Zustand store
	// (`useWebAppDrawerStore`) so the floating action bar (rendered
	// OUTSIDE this window in windows-container.tsx) can drive it.
	// Second click of the active icon closes; switching swaps content.
	// Toggling also fires WEBAPP_MODE_CHANGE_EVENT (legacy contract).
	const openDrawer = useWebAppDrawerStore((s) => s.openByWebappId[webappId] ?? null)
	const setOpenDrawer = useWebAppDrawerStore((s) => s.close)
	// Phase 100-09-06 — recording flag drives recorder lifecycle (see useEffect below).
	const isRecording = useWebAppDrawerStore((s) => s.isRecordingByWebappId[webappId] ?? false)
	const toggleTeachRecording = useWebAppDrawerStore((s) => s.toggleTeachRecording)
	// Phase 100-06: bar render moved to webapp-floating-action-bar.tsx;
	// WEBAPP_MODE_CHANGE_EVENT dispatch lives there now. This component
	// only subscribes to drawer state for the Sheet body.

	// 5a. Phase 96-05 — Skills sidebar collapse state + selected skill.
	// selectedSkillId is consumed by SkillReplayScrubber (96-06).
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
	const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)

	// 5b. Phase 96-04 — Teach-mode recorder + Save dialog state.
	const recorder = useTeachRecorder()
	const [pendingSave, setPendingSave] = useState<ActionLog | null>(null)
	const skillCreateMutation = trpcReact.webapp.skills.create.useMutation()
	const skillDiscardMutation = trpcReact.webapp.skills.discard.useMutation()
	const skillsListUtils = trpcReact.useUtils()

	// Privacy toast: fire on first Teach activation per install. The first
	// time the user picks Teach we surface the dismissable warning; once
	// acknowledged we persist the localStorage flag and never re-fire.
	const armPrivacyWarningOnce = useCallback(() => {
		try {
			if (localStorage.getItem(TEACH_PRIVACY_ACK_KEY) === '1') return
			toast.warning(TEACH_PRIVACY_TEXT, {
				duration: 8000,
				onDismiss: () => {
					try {
						localStorage.setItem(TEACH_PRIVACY_ACK_KEY, '1')
					} catch {
						/* localStorage may be unavailable */
					}
				},
				onAutoClose: () => {
					try {
						localStorage.setItem(TEACH_PRIVACY_ACK_KEY, '1')
					} catch {
						/* localStorage may be unavailable */
					}
				},
			})
		} catch {
			// localStorage / toast may be unavailable in JSDOM tests.
		}
	}, [])

	// Phase 100-09-06 — recorder lifecycle driven by drawer store flag
	// (replaces the prior `handleModeChange` callback).
	//
	// When `isRecordingByWebappId[webappId]` flips true (Teach icon click in
	// the floating bar), arm + start the recorder. When it flips back false
	// (second Teach icon click), stop and (if events captured) open the
	// Save dialog. Empty recordings → silent server-side discard.
	const prevRecordingRef = useRef(false)
	useEffect(() => {
		if (isRecording && !prevRecordingRef.current) {
			armPrivacyWarningOnce()
			recorder.start({webappId, vncRef: vnc.containerRef})
		} else if (!isRecording && prevRecordingRef.current) {
			void recorder.stop().then((log) => {
				if (log && log.events.length > 0) {
					setPendingSave(log)
				} else if (log && recorder.sessionId) {
					skillDiscardMutation.mutate({sessionId: recorder.sessionId})
				}
			})
		}
		prevRecordingRef.current = isRecording
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isRecording, webappId, armPrivacyWarningOnce])

	// On unmount while still recording → stop and discard (recorder hook
	// already discards on unmount; we additionally close any pending Save
	// dialog so it doesn't survive the parent unmount).
	useEffect(() => {
		return () => {
			setPendingSave(null)
		}
	}, [])

	// Phase 100-09-06 — overlay Stop button delegates to the drawer-store
	// flag flip. The useEffect above observes the flip and runs the actual
	// recorder.stop() + Save-dialog-open path. Keeping the imperative path
	// behind a single source of truth (drawer-store) avoids two parallel
	// stop pipelines that could race.
	const onStopRecording = useCallback(() => {
		if (isRecording) {
			toggleTeachRecording(webappId)
		}
	}, [isRecording, toggleTeachRecording, webappId])

	const onSavePending = useCallback(
		(name: string) => {
			const log = pendingSave
			if (!log) return
			const sessionId = log.meta.sessionId
			skillCreateMutation.mutate(
				{webappId, name, sessionId, actionLog: log},
				{
					onSuccess: () => {
						setPendingSave(null)
						void skillsListUtils.webapp.skills.list.invalidate({webappId})
						toast.success(`Saved skill "${name}"`)
					},
					onError: (err) => {
						toast.error(err.message || 'Failed to save skill')
					},
				},
			)
		},
		[pendingSave, skillCreateMutation, skillsListUtils, webappId],
	)

	const onCancelPending = useCallback(() => {
		const log = pendingSave
		if (log) {
			skillDiscardMutation.mutate({sessionId: log.meta.sessionId})
		}
		setPendingSave(null)
	}, [pendingSave, skillDiscardMutation])

	// 6. Render.
	//
	// Phase 100-03 (V33-MULTI-02 / G-100-E E1):
	//   - Top webapp-toolbar removed (Chrome `--app=URL` is chromeless).
	//   - Resizable vertical split removed; stream is `flex-1`
	//     of a single column.
	//   - Root wrapper is `relative flex h-full w-full flex-col`.
	//   - Phase 100-06: bottom action bar moved OUTSIDE the window
	//     (see `webapp-floating-action-bar.tsx`); `pb-9` here is now
	//     decorative — preserved for layout stability across re-flow.
	//   - Agent panel + mode selector + skills sidebar render sites are
	//     gone here; 100-04 reintroduces them inside drawers.
	//     Mode state, recorder wiring, composer state, and pendingSave
	//     dialog are preserved so 100-04 can lift them into the new
	//     drawer host without re-deriving the spawn lifecycle.

	return (
		<div className='relative flex h-full w-full flex-col bg-surface-base'>
			<div className='relative flex-1 min-h-0 overflow-hidden bg-black pb-9'>
				<div ref={vnc.containerRef} className='h-full w-full' />
				{spawnError ? (
					<SpawnErrorBanner error={spawnError} onRetry={triggerSpawn} />
				) : null}
				{vnc.status === 'connecting' && !spawnError ? (
					<VncOverlay text='Connecting to stream…' />
				) : null}
				{vnc.status === 'error' && vnc.errorMessage ? (
					<VncOverlay text={vnc.errorMessage} variant='error' />
				) : null}
				{recorder.recording ? (
					<TeachRecordingOverlay
						eventCount={recorder.eventCount}
						droppedCount={recorder.droppedCount}
						onStop={onStopRecording}
					/>
				) : null}
				{recorder.autoStopped ? (
					<TeachAutoStopBanner
						onReview={onStopRecording}
						onDismiss={recorder.resetAutoStop}
					/>
				) : null}
				{selectedSkillId ? (
					<SkillReplayScrubber
						skillId={selectedSkillId}
						onClose={() => setSelectedSkillId(null)}
					/>
				) : null}
				{/* Phase 100-09-05 — Inline chat at bottom (replaces Sheet Chat
				    drawer). Per user "Chat penceresi olmasin sadece yazi
				    yazalim. Yazilar sadece Alt kisimda gozuksun." Anchored
				    `absolute inset-x-0 bottom-0 z-10` over the existing pb-9
				    reservation; collapsed by default; floating Chat icon
				    (100-06) toggles expanded/collapsed. */}
				<WebAppChatBottomBar webappId={webappId} />

				{/* Phase 100-09-06 — Teach popup host (sonner toast portal,
				    one toast per captured event during recording).
				    Subscribes to recorder.events + recorder.eventCount. */}
				<WebAppTeachPopupHost
					isRecording={recorder.recording}
					events={recorder.events}
					eventCount={recorder.eventCount}
				/>

				{/* Phase 100-09-06 — Top-right Skills popover (replaces drawer
				    skills sidebar per D-100-09-E1). Lightweight; doesn't eat
				    horizontal space when closed. */}
				<WebAppSkillsPopover
					webappId={webappId}
					onReplaySkill={(skillId) => setSelectedSkillId(skillId)}
				/>
			</div>
			{pendingSave ? (
				<SaveSkillDialog
					open={pendingSave !== null}
					eventCount={pendingSave.events.length}
					durationMs={pendingSave.endedAt - pendingSave.startedAt}
					onSave={onSavePending}
					onCancel={onCancelPending}
					saving={skillCreateMutation.isPending}
				/>
			) : null}

			{/* Phase 100-06 — Bottom action-bar moved OUTSIDE the window
			    (`webapp-floating-action-bar.tsx` rendered in windows-container.tsx).
			    State coupling is via `useWebAppDrawerStore` (Zustand). */}

			{/* Phase 100-04 — Drawer host (V33-MULTI-04, G-100-D D2).
			    Phase 100-09-05: 'chat' branch REMOVED (chat is now inline at
			    the bottom of the stream wrapper via <WebAppChatBottomBar/>).
			    Phase 100-09-06: 'teach' branch REMOVED (teach is now driven
			    by isRecordingByWebappId flag + <WebAppTeachPopupHost/> +
			    <WebAppSkillsPopover/>). Only 'auto' remains hosted here. */}
			<Sheet
				open={openDrawer !== null && openDrawer !== 'chat' && openDrawer !== 'teach'}
				onOpenChange={(o) => {
					if (!o) setOpenDrawer(webappId)
				}}
			>
				<SheetContent
					side='right'
					className='!w-[35%] !max-w-none overflow-hidden'
					closeButton={false}
				>
					<div className='relative z-10 flex h-full flex-col'>
						{openDrawer === 'auto' ? <WebAppAutoDrawer webappId={webappId} /> : null}
					</div>
				</SheetContent>
			</Sheet>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components (kept inline — PLAN 95-07.C / file-budget guidance)
// ─────────────────────────────────────────────────────────────────────

interface SpawnErrorBannerProps {
	error: {code: string; message: string}
	onRetry: () => void
}

function SpawnErrorBanner({error, onRetry}: SpawnErrorBannerProps) {
	// SERVICE_UNAVAILABLE is the pre-P98 expected state — friendlier copy.
	const friendly =
		error.code === 'SERVICE_UNAVAILABLE'
			? 'WebApp stream is not yet available on this server. The agent panel below still works.'
			: error.message
	return (
		<div className='absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 p-6 text-center'>
			<AlertTriangle className='h-8 w-8 text-amber-400' />
			<div className='max-w-md text-body text-text-primary'>{friendly}</div>
			<button
				type='button'
				onClick={onRetry}
				className='inline-flex h-8 items-center gap-2 rounded-radius-sm bg-surface-1 px-3 text-caption-sm text-text-primary hover:bg-surface-2'
			>
				<RefreshCw className='h-3.5 w-3.5' />
				Retry
			</button>
		</div>
	)
}

function VncOverlay({text, variant}: {text: string; variant?: 'error'}) {
	return (
		<div className='absolute inset-0 flex items-center justify-center bg-black/40 text-text-secondary'>
			<span className={cn('text-caption-sm', variant === 'error' && 'text-red-400')}>{text}</span>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────
// Phase 96-04 — Teach-mode UI surfaces (overlay, banner, save dialog).
// ─────────────────────────────────────────────────────────────────────

interface TeachRecordingOverlayProps {
	eventCount: number
	droppedCount: number
	onStop: () => void
}

function TeachRecordingOverlay({eventCount, droppedCount, onStop}: TeachRecordingOverlayProps) {
	return (
		<div className='absolute right-3 top-3 z-10 flex items-center gap-2 rounded-radius-sm bg-black/70 px-3 py-1.5 text-caption-sm text-white shadow-lg backdrop-blur-sm'>
			<span
				className='inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500'
				aria-label='Recording'
				role='status'
			/>
			<span>
				Recording{eventCount > 0 ? ` · ${eventCount} events` : ''}
				{droppedCount > 0 ? ` · ${droppedCount} dropped` : ''}
			</span>
			<button
				type='button'
				onClick={onStop}
				className='ml-1 inline-flex h-6 items-center gap-1 rounded-radius-xs bg-red-500/90 px-2 text-caption-xs text-white hover:bg-red-500'
			>
				<Square className='h-3 w-3' />
				Stop
			</button>
		</div>
	)
}

interface TeachAutoStopBannerProps {
	onReview: () => void
	onDismiss: () => void
}

function TeachAutoStopBanner({onReview, onDismiss}: TeachAutoStopBannerProps) {
	return (
		<div className='absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-radius-sm bg-amber-500/90 px-3 py-2 text-caption-sm text-black shadow-lg'>
			<div className='flex items-center gap-3'>
				<span>Recording auto-stopped at 10 minutes — review and save?</span>
				<button
					type='button'
					onClick={onReview}
					className='rounded-radius-xs bg-black/20 px-2 py-1 text-caption-xs text-black hover:bg-black/30'
				>
					Review
				</button>
				<button
					type='button'
					onClick={onDismiss}
					className='rounded-radius-xs px-2 py-1 text-caption-xs text-black/80 hover:bg-black/10'
				>
					Dismiss
				</button>
			</div>
		</div>
	)
}

interface SaveSkillDialogProps {
	open: boolean
	eventCount: number
	durationMs: number
	saving: boolean
	onSave: (name: string) => void
	onCancel: () => void
}

function SaveSkillDialog({open, eventCount, durationMs, saving, onSave, onCancel}: SaveSkillDialogProps) {
	const [name, setName] = useState('')
	const trimmed = name.trim()
	const valid = SKILL_NAME_RE.test(trimmed)

	const submit = useCallback(() => {
		if (!valid) return
		onSave(trimmed)
	}, [valid, trimmed, onSave])

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) onCancel()
			}}
		>
			<DialogContent className='max-w-md'>
				<DialogHeader>
					<DialogTitle>Save skill</DialogTitle>
					<DialogDescription>
						{eventCount} actions captured over {(durationMs / 1000).toFixed(1)}s. Give the skill a
						name to save it for this WebApp.
					</DialogDescription>
				</DialogHeader>
				<div className='flex flex-col gap-2'>
					<Input
						autoFocus
						value={name}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && valid) submit()
						}}
						placeholder='e.g. open-inbox'
						maxLength={80}
						aria-invalid={name.length > 0 && !valid}
					/>
					{name.length > 0 && !valid ? (
						<div className='text-caption-xs text-red-400'>
							Use 1-80 letters, digits, spaces, underscores or dashes.
						</div>
					) : null}
				</div>
				<DialogFooter>
					<button
						type='button'
						onClick={onCancel}
						className='inline-flex h-8 items-center rounded-radius-sm bg-surface-1 px-3 text-caption-sm text-text-primary hover:bg-surface-2'
						disabled={saving}
					>
						Cancel
					</button>
					<button
						type='button'
						onClick={submit}
						disabled={!valid || saving}
						className={cn(
							'inline-flex h-8 items-center rounded-radius-sm bg-blue-500 px-3 text-caption-sm text-white hover:bg-blue-600',
							(!valid || saving) && 'cursor-not-allowed opacity-50',
						)}
					>
						{saving ? 'Saving…' : 'Save'}
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
