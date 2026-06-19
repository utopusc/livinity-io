// Phase 290 — ShortcutIframeWindow (Wave 1, T1.2).
//
// Root content for a SHORTCUT_<id> window. The desired URL + render mode are
// decoded from the window-manager route (shortcut://<mode>?u=<url>).
//
//   mode='browser-stream' → reuse the WebApp X11 stream (immune to
//                           X-Frame-Options) via WebAppStreamWindow's additive
//                           urlOverride. The backend probe already chose this
//                           mode at create time for frame-deny sites (H3).
//   mode='iframe'         → render an <iframe>. A timeout-only watchdog (H3 —
//                           cross-origin contentWindow is unreadable, so we do
//                           NOT rely on it) downgrades to the stream if the
//                           frame never signals `load` within the budget. A
//                           manual "Open as stream" affordance covers the
//                           residual per-path frame-deny class.
//
// All in-window — NEVER a pop-up-blockable window.open (#1 fix).

import {Suspense, lazy, useEffect, useRef, useState} from 'react'
import {AlertTriangle, MonitorPlay} from 'lucide-react'

import {Loading} from '@/components/ui/loading'
import {decodeShortcutRoute, type ShortcutWindowMode} from '@/modules/shortcuts/shortcut-window-route'

const WebAppStreamWindowContent = lazy(() => import('./webapp-stream-window'))

/** How long an iframe may take to fire `load` before we offer the stream (ms). */
const IFRAME_LOAD_WATCHDOG_MS = 6000

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
	// Runtime mode can be upgraded iframe→browser-stream by the watchdog or the
	// manual affordance; it never downgrades.
	const [mode, setMode] = useState<ShortcutWindowMode>(decoded.mode)
	const [loaded, setLoaded] = useState(false)
	const [watchdogFired, setWatchdogFired] = useState(false)
	const iframeRef = useRef<HTMLIFrameElement>(null)

	// H3 — timeout-only watchdog. If the iframe has not fired `load` within the
	// budget, surface the manual "Open as stream" hint (we do NOT auto-switch,
	// to avoid yanking a frame that is merely slow). Only runs in iframe mode.
	useEffect(() => {
		if (mode !== 'iframe' || loaded) return
		const timer = setTimeout(() => setWatchdogFired(true), IFRAME_LOAD_WATCHDOG_MS)
		return () => clearTimeout(timer)
	}, [mode, loaded])

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
	return (
		<div className='relative h-full w-full'>
			<iframe
				ref={iframeRef}
				src={decoded.url}
				title={title ?? 'Shortcut'}
				className='h-full w-full border-0 bg-background'
				allow='clipboard-read; clipboard-write; fullscreen'
				onLoad={() => {
					setLoaded(true)
					setWatchdogFired(false)
				}}
			/>
			{watchdogFired && !loaded ? (
				<div className='pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3'>
					<button
						type='button'
						className='pointer-events-auto flex items-center gap-2 rounded-full border border-white/15 bg-black/70 px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur transition-colors hover:bg-black/85'
						onClick={() => setMode('browser-stream')}
					>
						<MonitorPlay className='h-4 w-4' />
						This site is taking a while or blocking embedding — open as stream
					</button>
				</div>
			) : null}
		</div>
	)
}
