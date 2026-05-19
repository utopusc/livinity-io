// Phase 157 round 5 — NativeAppStreamWindow.
//
// Native-app analog of WebAppStreamWindow (Phase 95). When the user
// clicks a native-app desktop icon, `useLaunchNativeApp` opens a window
// keyed `NATIVE_<nativeAppId>`; WindowContent routes that prefix here.
// This component:
//
//   1. Fires `apps.native.spawn({id})` on mount → returns {wsUrl}.
//      `spawn` is idempotent (Phase 157 round 5 server change): if the
//      binary is already alive the existing handle is returned, so
//      re-mounting after a window close-reopen reuses the stream rather
//      than allocating a fresh Xvfb + display slot.
//   2. Renders the VNC canvas via `useWebAppVnc(wsUrl, {viewOnly:
//      false})`. viewOnly is FALSE for native apps — the binary needs
//      direct mouse/keyboard input, and x11vnc forwards RFB events into
//      the per-app Xvfb display via XTestFakeKey/MotionEvent.
//   3. On unmount, fires `apps.native.close({id})` to release the
//      stream slot, display number, port, and SIGTERM the binary.
//      Best-effort — failure is logged, not blocking.

import {useEffect, useMemo, useRef, useState} from 'react'

import {Loading} from '@/components/ui/loading'
import {useWebAppVnc} from '@/hooks/use-webapp-vnc'
import {useWindowManagerOptional} from '@/providers/window-manager'
import {trpcReact} from '@/trpc/trpc'

interface NativeAppStreamWindowProps {
	nativeAppId: string
	/**
	 * Phase 159 — windowId from WindowManager. Required for the
	 * registerCloseHandler pattern (close runs while React tree is
	 * still mounted, so closeMutationRef is fresh + WS is live).
	 * Optional for backward-compat during the Phase 159 rollout —
	 * absent windowId falls back to the legacy unmount cleanup (kept
	 * defensively until prop is reliably threaded).
	 */
	windowId?: string
}

export default function NativeAppStreamWindow({nativeAppId, windowId}: NativeAppStreamWindowProps) {
	// 1. Pull this native app's config row from apps.native.list. The
	// config carries the display name used in error UI (failed-spawn
	// surface), and ensures the icon's id is a real, persisted config —
	// if the row vanishes mid-session (e.g. someone removed the app from
	// another tab), we show a clear "not found" rather than 500-spam.
	const listQuery = trpcReact.apps.native.list.useQuery(undefined, {
		staleTime: 30 * 1000,
		retry: false,
	})
	const cfg = useMemo(
		() => listQuery.data?.find((c) => c.id === nativeAppId) ?? null,
		[listQuery.data, nativeAppId],
	)

	// 2. Spawn the binary + start the stream. apps.native.spawn is
	// idempotent (Phase 157 round 5 server change), so safe to fire on
	// every mount.
	const spawnMutation = trpcReact.apps.native.spawn.useMutation()
	const closeMutation = trpcReact.apps.native.close.useMutation()

	const [wsUrl, setWsUrl] = useState<string | null>(null)
	const [spawnError, setSpawnError] = useState<{code: string; message: string} | null>(null)

	// Match the WebAppStreamWindow guards: mutation refs ride in refs so
	// useEffect deps stay stable, and a "spawned for X" ref ensures the
	// mutation fires exactly once per nativeAppId across re-renders.
	const spawnMutationRef = useRef(spawnMutation)
	spawnMutationRef.current = spawnMutation
	const closeMutationRef = useRef(closeMutation)
	closeMutationRef.current = closeMutation
	const spawnedForRef = useRef<string | null>(null)

	useEffect(() => {
		// Reset spawn-once-per-id guard when nativeAppId actually changes
		// (the WindowManager may reuse this component instance across IDs).
		if (spawnedForRef.current && spawnedForRef.current !== nativeAppId) {
			spawnedForRef.current = null
			setWsUrl(null)
			setSpawnError(null)
		}
	}, [nativeAppId])

	useEffect(() => {
		if (!cfg || wsUrl || spawnError) return
		if (spawnedForRef.current === nativeAppId) return
		spawnedForRef.current = nativeAppId
		spawnMutationRef.current.mutate(
			{id: nativeAppId},
			{
				onSuccess: (res) => setWsUrl(res.wsUrl),
				onError: (err) => {
					setSpawnError({
						code: err.data?.code ?? 'INTERNAL_SERVER_ERROR',
						message: err.message || 'Failed to start native app',
					})
				},
			},
		)
	}, [cfg, wsUrl, spawnError, nativeAppId])

	// 3. Phase 159 — window-manager-mediated teardown (Workstream B).
	// Replaces the unmount-cleanup race (H1 of 159-RESEARCH.md): when the
	// user clicks `[X]`, WindowManagerProvider.closeWindow invokes our
	// registered handler BEFORE dispatching CLOSE_WINDOW, so the React
	// tree is still mounted, closeMutationRef is fresh, and the WS
	// transport is live. The handler uses mutateAsync so the registry's
	// 2s Promise.race timeout can observe completion. If `windowId` is
	// absent (defensive fallback during rollout), we keep the legacy
	// unmount cleanup — both paths are idempotent server-side.
	//
	// Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (sdk-agent-runner.ts) unchanged.
	const wm = useWindowManagerOptional()
	useEffect(() => {
		if (!windowId || !wm) {
			// Fallback for the brief window where windowId isn't threaded
			// yet (component used outside WindowManager tree). Unmount
			// cleanup is the H1-prone path but better than no teardown.
			const idForCleanup = nativeAppId
			return () => {
				try {
					closeMutationRef.current.mutate({id: idForCleanup})
				} catch {
					// non-blocking
				}
			}
		}
		const handler = async () => {
			try {
				await closeMutationRef.current.mutateAsync({id: nativeAppId})
			} catch {
				// non-blocking — Plan 03 reaper is the backstop
			}
		}
		wm.registerCloseHandler(windowId, handler)
		return () => wm.unregisterCloseHandler(windowId)
	}, [windowId, nativeAppId, wm])

	// 4. VNC view. viewOnly=false so the binary receives mouse + keyboard
	// directly through x11vnc's XTest dispatch. Per-app Xvfb means no
	// cross-app input bleed — the binary is the only X11 client on its
	// display.
	const vnc = useWebAppVnc(wsUrl ?? undefined, {viewOnly: false})

	if (listQuery.isLoading) {
		return (
			<div className='flex h-full w-full items-center justify-center bg-black'>
				<Loading />
			</div>
		)
	}

	if (!cfg) {
		return (
			<div className='flex h-full w-full items-center justify-center bg-black text-white/70'>
				<div className='text-center'>
					<p className='text-body-sm'>Native app config not found.</p>
					<p className='mt-1 text-caption text-white/40'>id: {nativeAppId}</p>
				</div>
			</div>
		)
	}

	if (spawnError) {
		const isCapped = spawnError.message.includes('stream cap exceeded')
		return (
			<div className='flex h-full w-full items-center justify-center bg-black text-white/80'>
				<div className='max-w-md p-6 text-center'>
					<p className='text-body-sm font-medium text-white'>
						Couldn't start {cfg.name}
					</p>
					<p className='mt-2 text-caption text-white/60'>
						{spawnError.message}
					</p>
					{isCapped && (
						<p className='mt-3 text-caption text-white/50'>
							The streaming pool is full. Close another native or webapp
							window, or run <code>apps.stopAllStreams</code> to free
							slots.
						</p>
					)}
				</div>
			</div>
		)
	}

	return (
		<div className='flex h-full w-full flex-col bg-black'>
			{/* Status strip — shown only while connecting or after a
			    transient disconnect. Hidden once VNC reports `connected`
			    so the stream fills the window. */}
			{vnc.status !== 'connected' && (
				<div className='flex items-center gap-2 border-b border-white/10 bg-black/80 px-3 py-1.5 text-caption text-white/70'>
					{vnc.status === 'connecting' && <span>Connecting to {cfg.name}…</span>}
					{vnc.status === 'disconnected' && (
						<>
							<span>Disconnected.</span>
							<button
								type='button'
								className='text-blue-400 hover:text-blue-300'
								onClick={vnc.reconnect}
							>
								Reconnect
							</button>
						</>
					)}
					{vnc.status === 'error' && (
						<span className='text-red-300'>
							{vnc.errorMessage || 'VNC error'}
						</span>
					)}
					{vnc.status === 'idle' && wsUrl === null && (
						<span>Starting {cfg.name}…</span>
					)}
				</div>
			)}

			{/* VNC canvas. useWebAppVnc owns the noVNC RFB connection. */}
			<div
				ref={vnc.containerRef}
				className='flex-1 outline-none'
				style={{background: 'black'}}
			/>
		</div>
	)
}
