// Phase 254-03 — X11DisplayStreamWindow.
//
// Root content for a DISPLAY_:N window. Renders a LIVE, interactive noVNC
// stream of a real X display (the `:1` host + any `:11`/`:12` created via
// the luse MCP `computer_create_display`), so the operator can use that
// screen directly inside the LivOS desktop.
//
// LOCKED DECISION #1 (254-CONTEXT.md): reuse the existing noVNC/RFB infra
// (`use-webapp-vnc.ts`) the WebApp launcher already uses. Crucially, this is
// the LIVE-input variant: `useWebAppVnc(wsUrl, {viewOnly: false})` lets RFB
// forward mouse + keyboard natively over the VNC protocol. We DELIBERATELY do
// NOT add the canvas-level event interceptors that the WebApp stream window
// carries — those exist only because WebApp streams run viewOnly:true and
// re-dispatch each event through a per-window mutation to target a bound wid.
// A whole display has no single bound wid; native RFB forwarding is correct
// here and avoids per-event tRPC dispatch entirely (threat model T-254-09 —
// input only ever reaches a display the server already authorized via
// displays.getVncUrl).
//
// Lifecycle:
//   - On mount (fire-once per displayId, guarded by resolvedForRef mirroring
//     spawnedForRef in webapp-stream-window.tsx): call displays.getVncUrl
//     ({display: displayId}) → capture res.wsUrl.
//   - useWebAppVnc connects the RFB to that wsUrl. Its own teardown disconnects
//     the RFB on unmount. There is NO server-side close route for a display
//     VNC — StreamManager owns the x11vnc lifecycle (Plan 01), so we do not
//     invent one.
//
// Threat model (254-03):
//   T-254-08 (I) — never console.log the wsUrl (capability token); log only
//     the displayId if anything.
//   T-254-09 (E) — getVncUrl (Plan 01) only returns a wsUrl for an owned/host
//     display; this component cannot fabricate one.
//   T-254-10 (T) — displayId originates from displays.list data and is
//     re-validated server-side by getVncUrl's `^:\d+` zod regex.

import {useCallback, useEffect, useRef, useState} from 'react'
import {AlertTriangle, RefreshCw} from 'lucide-react'

import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'
import {useWebAppVnc} from '@/hooks/use-webapp-vnc'

export interface X11DisplayStreamWindowProps {
	/** The X display string, e.g. ':11' (the slice of a DISPLAY_:11 appId). */
	displayId: string
	/** Forwarded by WindowAppContent for parity with sibling stream windows. */
	windowId?: string
}

export default function X11DisplayStreamWindow({displayId}: X11DisplayStreamWindowProps) {
	// Resolve this display's VNC websocket URL. Registered in httpOnlyPaths
	// (Plan 01 / common.ts) because it spawns x11vnc via StreamManager and so
	// must survive a WS reconnect.
	const getVncUrlMutation = trpcReact.displays.getVncUrl.useMutation()

	const [wsUrl, setWsUrl] = useState<string | null>(null)
	const [resolveError, setResolveError] = useState<{code: string; message: string} | null>(null)

	// useMutation returns a fresh object every render, so park it in a ref and
	// guard fire-once per displayId — mirrors spawnedForRef in
	// webapp-stream-window.tsx (prevents a resolve-storm on re-render).
	const getVncUrlMutationRef = useRef(getVncUrlMutation)
	getVncUrlMutationRef.current = getVncUrlMutation
	const resolvedForRef = useRef<string | null>(null)

	const triggerResolve = useCallback(() => {
		setResolveError(null)
		getVncUrlMutationRef.current.mutate(
			{display: displayId},
			{
				onSuccess: (res) => {
					setWsUrl(res.wsUrl)
				},
				onError: (err) => {
					setResolveError({
						code: err.data?.code ?? 'INTERNAL_SERVER_ERROR',
						message: err.message || 'Failed to start display stream',
					})
				},
			},
		)
	}, [displayId])

	useEffect(() => {
		if (wsUrl || resolveError) return
		if (resolvedForRef.current === displayId) return
		resolvedForRef.current = displayId
		triggerResolve()
	}, [wsUrl, resolveError, displayId, triggerResolve])

	// LIVE input — RFB forwards mouse + keyboard natively (viewOnly:false).
	// No canvas event interceptors (those are WebApp-only, viewOnly:true).
	const vnc = useWebAppVnc(wsUrl ?? undefined, {viewOnly: false})

	const onRetry = useCallback(() => {
		// Re-resolve the wsUrl (covers a server-side x11vnc that went away) and
		// kick the RFB reconnect.
		resolvedForRef.current = null
		setWsUrl(null)
		setResolveError(null)
		triggerResolve()
		vnc.reconnect()
	}, [triggerResolve, vnc])

	return (
		<div className='relative flex h-full w-full flex-col bg-black'>
			<div className='relative flex-1 min-h-0 overflow-hidden bg-black'>
				{/* object-contain (NOT cover) — a full desktop must never be cropped. */}
				<div
					ref={vnc.containerRef}
					className='h-full w-full [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-contain'
				/>
				{resolveError ? (
					<DisplayErrorOverlay message={resolveError.message} onRetry={onRetry} />
				) : null}
				{!resolveError && vnc.status === 'connecting' ? (
					<DisplayOverlay text='Connecting to display…' />
				) : null}
				{!resolveError && vnc.status === 'error' && vnc.errorMessage ? (
					<DisplayErrorOverlay message={vnc.errorMessage} onRetry={onRetry} />
				) : null}
			</div>
		</div>
	)
}

function DisplayOverlay({text, variant}: {text: string; variant?: 'error'}) {
	return (
		<div className='absolute inset-0 flex items-center justify-center bg-black/40 text-text-secondary'>
			<span className={cn('text-caption-sm', variant === 'error' && 'text-accent-red')}>{text}</span>
		</div>
	)
}

function DisplayErrorOverlay({message, onRetry}: {message: string; onRetry: () => void}) {
	return (
		<div className='absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 p-6 text-center'>
			<AlertTriangle className='h-8 w-8 text-accent-amber' />
			<div className='max-w-md text-body text-text-primary'>{message}</div>
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
