// Phase 290 — ShortcutIframeWindow (Wave 1, T1.2).
//
// Root content for a SHORTCUT_<id> window. The desired URL + render mode are
// decoded from the window-manager route (shortcut://<mode>?u=<url>).
//
//   mode='browser-stream' → reuse the WebApp X11 stream (immune to
//                           X-Frame-Options) via WebAppStreamWindow's additive
//                           urlOverride. The backend probe already chose this
//                           mode at create time for frame-deny sites (H3).
//   mode='iframe'         → render an <iframe> with two escape hatches to the
//                           stream (an XFO/CSP block is NOT client-detectable —
//                           the blocked iframe still fires `load`):
//                           (1) a no-load auto-downgrade — if the frame never
//                               fires `load` within the budget it is almost
//                               certainly blocked, so we auto-switch to the
//                               stream and persist the downgrade; and
//                           (2) INV-1 — an ALWAYS-available manual "Open as
//                               stream" affordance shown after a short settle
//                               regardless of the `loaded` flag, so a
//                               blank-but-"loaded" frame is still escapable.
//                           Both paths persist open_mode=browser-stream via the
//                           shortcut.update mutation so the choice sticks next
//                           open (best-effort; ignore failure).
//
// All in-window — NEVER a pop-up-blockable window.open (#1 fix).

import {Suspense, lazy, useEffect, useRef, useState} from 'react'
import {AlertTriangle, MonitorPlay} from 'lucide-react'

import {Loading} from '@/components/ui/loading'
import {decodeShortcutRoute, type ShortcutWindowMode} from '@/modules/shortcuts/shortcut-window-route'
import {trpcReact} from '@/trpc/trpc'

const WebAppStreamWindowContent = lazy(() => import('./webapp-stream-window'))

/** How long an iframe may take to fire `load` before we AUTO-downgrade to the
 *  stream (ms). An iframe that never even fires `load` is almost certainly a
 *  blocked/blank surface, so we swap to the stream automatically. */
const IFRAME_LOAD_WATCHDOG_MS = 6000

/** INV-1 (FIX B) — after this short settle the manual "Open as stream"
 *  affordance is ALWAYS shown, regardless of the `loaded` flag. An XFO/CSP
 *  block is NOT client-detectable (the blocked iframe still fires `load`), so
 *  the only reliable escape from a blank-but-"loaded" frame is a manual switch
 *  that is always reachable. */
const STREAM_AFFORDANCE_SETTLE_MS = 2500

export interface ShortcutIframeWindowProps {
	/** The shortcut UUID (sliced from the SHORTCUT_<id> appId). */
	shortcutId: string
	/** The window-manager route string (shortcut://<mode>?u=<url>). */
	route: string
	/** WindowManager windowId (forwarded to the stream child for teardown). */
	windowId?: string
	/** The window title (for the iframe a11y title). */
	title?: string
}

export default function ShortcutIframeWindow({shortcutId, route, windowId, title}: ShortcutIframeWindowProps) {
	const decoded = decodeShortcutRoute(route)
	// Phase 290 R5 — web shortcuts open as the browser-stream X11 surface ONLY
	// (XFO/CSP-immune, never a blocked iframe). The earlier iframe fast-path made
	// frame-deny sites (Notion etc.) render the browser's "This content is blocked"
	// page, so ANY 'iframe' route — including already-stored rows created before
	// this change — is forced to the stream at render time. Operator decision:
	// stream-only for web shortcuts (reliability over the lighter iframe path).
	// `setMode` is retained for the (now-unreached) iframe escape-hatch code below;
	// nothing ever sets the mode back to 'iframe'.
	const [mode, setMode] = useState<ShortcutWindowMode>(
		decoded.mode === 'iframe' ? 'browser-stream' : decoded.mode,
	)
	const [loaded, setLoaded] = useState(false)
	// INV-1 (FIX B) — after a short settle, ALWAYS surface the "Open as stream"
	// escape hatch, even when `loaded` is true (an XFO/CSP block still fires
	// `load`, so a blank-but-"loaded" frame is otherwise inescapable).
	const [showStreamAffordance, setShowStreamAffordance] = useState(false)
	const iframeRef = useRef<HTMLIFrameElement>(null)

	// INV-1 (FIX B persist) — when the user (or the watchdog) downgrades to the
	// stream, persist open_mode=browser-stream for this shortcut so it sticks on
	// the next open. Best-effort: ignore failure (the in-window switch already
	// fixed THIS session). updateShortcutInput.patch carries the openMode field.
	const updateMutation = trpcReact.shortcut.update.useMutation()
	const switchToStream = (persist: boolean) => {
		setMode('browser-stream')
		if (persist) {
			try {
				updateMutation.mutate({id: shortcutId, patch: {openMode: 'browser-stream'}})
			} catch {
				/* best-effort — the in-window switch already applied for this session */
			}
		}
	}

	// H3 — no-load auto-downgrade. If the iframe has NOT fired `load` within the
	// budget it is almost certainly blocked/blank, so we auto-switch to the
	// stream (and persist the downgrade). Only runs in iframe mode. A frame that
	// is merely slow fires `load` (→ `loaded` true), which re-runs this effect and
	// clears the timer before it trips.
	useEffect(() => {
		if (mode !== 'iframe' || loaded) return
		const timer = setTimeout(() => switchToStream(true), IFRAME_LOAD_WATCHDOG_MS)
		return () => clearTimeout(timer)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mode, loaded])

	// INV-1 (FIX B) — settle timer for the ALWAYS-available manual affordance.
	// Independent of `loaded`: an XFO-blocked iframe fires `load` (so `loaded`
	// becomes true) yet renders nothing, and that is NOT detectable from JS.
	// Showing the escape hatch unconditionally after the settle is the only
	// reliable recovery.
	useEffect(() => {
		if (mode !== 'iframe') return
		const timer = setTimeout(() => setShowStreamAffordance(true), STREAM_AFFORDANCE_SETTLE_MS)
		return () => clearTimeout(timer)
	}, [mode])

	if (!decoded.url) {
		return (
			<div className='flex h-full flex-col items-center justify-center gap-2 text-text-secondary'>
				<AlertTriangle className='h-6 w-6 text-amber-400' />
				<p className='text-sm'>This shortcut has no valid target URL.</p>
			</div>
		)
	}

	if (mode === 'browser-stream') {
		return (
			<Suspense fallback={<Loading />}>
				<WebAppStreamWindowContent
					webappId={shortcutId}
					windowId={windowId}
					urlOverride={decoded.url}
					titleOverride={title}
				/>
			</Suspense>
		)
	}

	// iframe mode
	// INV-1 (FIX B) — the manual escape hatch is shown whenever the settle timer
	// has elapsed (`showStreamAffordance`), regardless of `loaded`, so a frame
	// that is XFO/CSP-blocked (fires `load`, renders blank) is still escapable.
	// The copy adapts based on whether the frame ever loaded.
	const offerStream = showStreamAffordance
	return (
		<div className='relative h-full w-full'>
			<iframe
				ref={iframeRef}
				src={decoded.url}
				title={title ?? 'Shortcut'}
				className='h-full w-full border-0 bg-background'
				allow='clipboard-read; clipboard-write; fullscreen'
				onLoad={() => setLoaded(true)}
			/>
			{offerStream ? (
				<div className='pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3'>
					<button
						type='button'
						className='pointer-events-auto flex items-center gap-2 rounded-full border border-white/15 bg-black/70 px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur transition-colors hover:bg-black/85'
						onClick={() => switchToStream(true)}
					>
						<MonitorPlay className='h-4 w-4' />
						{loaded
							? "Not showing correctly? This site may block embedding — open as stream"
							: 'This site is taking a while or blocking embedding — open as stream'}
					</button>
				</div>
			) : null}
		</div>
	)
}
