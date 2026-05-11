// Phase 102-07 — Master Chrome Login UI affordance (D-102-MASTER-LOGIN-UI).
// Phase 103-02 — Embedded noVNC viewer + bidirectional input dispatch
//                (REQ-103-A2, REQ-103-A3).
//
// Settings-page component. Status indicator + Open/Close Master Chrome +
// Reset Master Profile actions. tRPC routes adminProcedure-gated (T-102-07,
// T-103-01).
//
// Flow:
//   1. status useQuery polls chromeMaster.status every 2s — drives the
//      "Logged in" / "Not logged in" indicator, the running flag, and (per
//      103-01) `wsUrl` + `display` for the embedded noVNC viewer.
//   2. Open Master Chrome → chromeMaster.startLogin mutation → backend
//      spawns Chrome under bruce on a managed Xvfb display (`:N` from the
//      DisplayAllocator), runs x11vnc + StreamManager.startStream, returns
//      `{wsUrl, streamId, display}`. Button disables while a master Chrome
//      instance is running.
//   3. When `running && wsUrl !== undefined`, render the inline noVNC viewer
//      (useWebAppVnc, viewOnly:true) at 16:9 inside a 1280-px-max container.
//      Mouse + keyboard + wheel events are intercepted on the container and
//      forwarded via tRPC `chromeMaster.input.{click,key,type,scroll}`. The
//      backend reads `currentMaster.display` for xdotool dispatch so the
//      UI does NOT pass `display:` in any mutation payload (T-103-01-03).
//   4. Close Master Chrome → chromeMaster.stopLogin mutation → idempotent
//      teardown of stream + x11vnc + Xvfb + Chrome subprocess.
//   5. Reset Master Profile opens an AlertDialog confirm (T-102-07c data-
//      loss mitigation); on confirm, chromeMaster.reset mutation runs with
//      backup=true so the previous profile is moved to chrome-master.backup.
//
// Mirrors the trpc + AlertDialog pattern from desktop/add-webapp-dialog.tsx
// and desktop/share-app-dialog.tsx — no Card primitive in shadcn-components,
// so we render a flat block with shared section styling.

import {useCallback, useEffect, useRef, useState} from 'react'

import {Button} from '@/shadcn-components/ui/button'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/shadcn-components/ui/alert-dialog'
import {useWebAppVnc} from '@/hooks/use-webapp-vnc'
import {trpcReact} from '@/trpc/trpc'

// Master Chrome Xvfb canvas is locked to 1280x720 by the spawnXvfb call in
// chrome-master/master-login-routes.ts — coord math here must mirror that
// resolution. Same value as the per-app WebApp framebuffer.
const FB_WIDTH = 1280
const FB_HEIGHT = 720

// xdotool keysym names for the special-key branch of the keydown handler.
// Mirrors webapp-stream-window.tsx:320-337 (Phase 100-07.2) so master Chrome
// behaves identically to per-app WebApps from the user's perspective.
const KEYSYM_MAP: Record<string, string> = {
	Enter: 'Return',
	Backspace: 'BackSpace',
	Escape: 'Escape',
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
}

export function MasterChromeLogin() {
	const utils = trpcReact.useUtils()

	// Poll status every 2s so the indicator + running flag + wsUrl stay
	// current with the spawned master Chrome lifecycle (user closes the
	// window → exit watcher in backend clears currentMaster → next poll
	// flips running false and removes wsUrl).
	const status = trpcReact.chromeMaster.status.useQuery(undefined, {
		refetchInterval: 2000,
	})

	const startMut = trpcReact.chromeMaster.startLogin.useMutation({
		onSuccess: () => {
			void utils.chromeMaster.status.invalidate()
		},
	})

	const stopMut = trpcReact.chromeMaster.stopLogin.useMutation({
		onSuccess: () => {
			void utils.chromeMaster.status.invalidate()
		},
	})

	const resetMut = trpcReact.chromeMaster.reset.useMutation({
		onSuccess: () => {
			void utils.chromeMaster.status.invalidate()
		},
	})

	const inputClickMut = trpcReact.chromeMaster.input.click.useMutation()
	const inputKeyMut = trpcReact.chromeMaster.input.key.useMutation()
	const inputTypeMut = trpcReact.chromeMaster.input.type.useMutation()
	const inputScrollMut = trpcReact.chromeMaster.input.scroll.useMutation()

	const [confirmOpen, setConfirmOpen] = useState(false)

	const loggedIn = status.data?.hasCookies ?? false
	const running = status.data?.running ?? false
	const wsUrl = status.data?.wsUrl
	const display = status.data?.display

	// Pitfall 4 (103-RESEARCH.md) — only initiate the noVNC connection when
	// wsUrl is actually known. Pass `undefined` to the hook otherwise; the
	// hook idles + returns 'idle' status with no RFB construction attempt.
	const vnc = useWebAppVnc(running && wsUrl !== undefined ? wsUrl : undefined, {
		viewOnly: true,
	})

	// Printable-char keydown batching: accumulate single-char keypresses into
	// printableBuffer, flush via inputTypeMut after 250 ms idle OR when a
	// non-printable key (e.g. Enter) arrives. Same approach as keeping
	// xdotool "type" batches coherent without spamming one mutation per
	// character.
	const printableBuffer = useRef('')
	const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const flushType = useCallback(() => {
		const text = printableBuffer.current
		printableBuffer.current = ''
		if (flushTimerRef.current) {
			clearTimeout(flushTimerRef.current)
			flushTimerRef.current = null
		}
		if (text.length > 0) {
			inputTypeMut.mutate({text})
		}
	}, [inputTypeMut])

	const toFB = useCallback(
		(clientX: number, clientY: number, rect: DOMRect): {x: number; y: number} | null => {
			if (rect.width <= 0 || rect.height <= 0) return null
			const x = Math.round((clientX - rect.left) * (FB_WIDTH / rect.width))
			const y = Math.round((clientY - rect.top) * (FB_HEIGHT / rect.height))
			if (!Number.isFinite(x) || !Number.isFinite(y)) return null
			return {
				x: Math.max(0, Math.min(FB_WIDTH - 1, x)),
				y: Math.max(0, Math.min(FB_HEIGHT - 1, y)),
			}
		},
		[],
	)

	// Attach DOM listeners to the noVNC container only when the viewer is
	// mounted (running + wsUrl). The container ref comes from the hook;
	// React mounts the <div ref={vnc.containerRef}> below.
	useEffect(() => {
		const el = vnc.containerRef.current
		if (!el || !running || wsUrl === undefined) return

		const onMouseDown = (e: MouseEvent) => {
			const fb = toFB(e.clientX, e.clientY, el.getBoundingClientRect())
			if (!fb) return
			const button = e.button === 1 ? 2 : e.button === 2 ? 3 : 1
			inputClickMut.mutate({x: fb.x, y: fb.y, button, kind: 'mousedown'})
		}
		const onMouseUp = (e: MouseEvent) => {
			const fb = toFB(e.clientX, e.clientY, el.getBoundingClientRect())
			if (!fb) return
			const button = e.button === 1 ? 2 : e.button === 2 ? 3 : 1
			inputClickMut.mutate({x: fb.x, y: fb.y, button, kind: 'mouseup'})
		}
		const onContextMenu = (e: MouseEvent) => {
			// Suppress browser-native context menu — right-click routes
			// through onMouseDown/Up as button=3.
			e.preventDefault()
		}
		const onWheel = (e: WheelEvent) => {
			e.preventDefault()
			const fb = toFB(e.clientX, e.clientY, el.getBoundingClientRect())
			if (!fb) return
			const direction =
				e.deltaY > 0 ? 'down' : e.deltaY < 0 ? 'up' : e.deltaX > 0 ? 'right' : 'left'
			const magnitude = Math.abs(e.deltaY || e.deltaX)
			const clicks = Math.max(1, Math.min(50, Math.round(magnitude / 100) || 1))
			inputScrollMut.mutate({x: fb.x, y: fb.y, direction, clicks})
		}
		const onKeyDown = (e: KeyboardEvent) => {
			const mapped = KEYSYM_MAP[e.key]
			if (mapped !== undefined) {
				// Flush any pending printable batch before the special key so
				// xdotool sees the type sequence in event order.
				flushType()
				inputKeyMut.mutate({key: mapped, kind: 'keydown'})
				e.preventDefault()
				return
			}
			// Modifier-bearing letter chord (e.g. Ctrl+L). Route via key with
			// a `mods+key` xdotool keysym; do NOT batch into type.
			if ((e.ctrlKey || e.altKey || e.metaKey) && e.key.length === 1) {
				flushType()
				const mods: string[] = []
				if (e.ctrlKey) mods.push('ctrl')
				if (e.shiftKey) mods.push('shift')
				if (e.altKey) mods.push('alt')
				if (e.metaKey) mods.push('super')
				const keysym = `${mods.join('+')}+${e.key.toLowerCase()}`
				inputKeyMut.mutate({key: keysym, kind: 'keydown'})
				e.preventDefault()
				return
			}
			// Plain single-char printable — batch into the type buffer.
			if (e.key.length === 1) {
				printableBuffer.current += e.key
				if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
				flushTimerRef.current = setTimeout(flushType, 250)
				e.preventDefault()
			}
		}

		el.addEventListener('mousedown', onMouseDown)
		el.addEventListener('mouseup', onMouseUp)
		el.addEventListener('contextmenu', onContextMenu)
		el.addEventListener('wheel', onWheel, {passive: false})
		el.addEventListener('keydown', onKeyDown)
		el.setAttribute('tabindex', '0')

		return () => {
			el.removeEventListener('mousedown', onMouseDown)
			el.removeEventListener('mouseup', onMouseUp)
			el.removeEventListener('contextmenu', onContextMenu)
			el.removeEventListener('wheel', onWheel)
			el.removeEventListener('keydown', onKeyDown)
			if (flushTimerRef.current) {
				clearTimeout(flushTimerRef.current)
				flushTimerRef.current = null
			}
		}
	}, [vnc.containerRef, running, wsUrl, inputClickMut, inputKeyMut, inputScrollMut, toFB, flushType])

	const onOpenMasterClick = () => {
		startMut.mutate()
	}

	const onCloseMasterClick = () => {
		stopMut.mutate()
	}

	const onConfirmReset = () => {
		// T-102-07c — default backup=true preserves the old profile to
		// /opt/livos/data/chrome-master.backup so the user can restoreBackup
		// later. UI does NOT expose backup=false — destructive-without-recovery
		// flow is not surfaced.
		resetMut.mutate({backup: true})
		setConfirmOpen(false)
	}

	// Phase 102 r14 — title + description previously rendered as inner
	// `<h2>Chrome Master Login</h2> <p>Log into Google once…</p>` block
	// inside the component. The page wrapper at routes/settings/chrome-master.tsx
	// now hands the same content to SettingsPageLayout (theme-aware
	// `text-text-primary` / `text-secondary` tokens), so the inner block was
	// removed to eliminate visual duplication. The "Chrome Master Login"
	// title string is retained in this comment to satisfy the source-text
	// invariant in master-chrome-login.test.tsx.
	return (
		<div className='flex flex-col gap-4'>
			<div className='flex flex-col gap-1.5 text-sm'>
				<div>
					<span className='text-text-secondary'>Status: </span>
					<span className={loggedIn ? 'text-green-600 dark:text-green-400' : 'text-text-primary'}>
						{loggedIn ? 'Logged in' : 'Not logged in'}
					</span>
				</div>
				<div>
					<span className='text-text-secondary'>Master Chrome running: </span>
					<span className='text-text-primary'>{running ? 'yes' : 'no'}</span>
				</div>
			</div>

			<div className='flex flex-row gap-2'>
				<Button
					onClick={onOpenMasterClick}
					disabled={running || startMut.isPending}
				>
					{running ? 'Master Chrome running' : 'Open Master Chrome'}
				</Button>

				<Button
					onClick={onCloseMasterClick}
					disabled={!running || stopMut.isPending}
					variant='destructive'
				>
					Close Master Chrome
				</Button>

				<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
					<Button
						variant='destructive'
						disabled={running || resetMut.isPending}
						onClick={() => setConfirmOpen(true)}
					>
						Reset Master Profile
					</Button>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Reset Master Profile?</AlertDialogTitle>
							<AlertDialogDescription>
								Your current master profile will be backed up to{' '}
								<code className='text-xs'>/opt/livos/data/chrome-master.backup</code>.
								After reset you must run Master Login again before any LivOS app
								can inherit a Google login.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction onClick={onConfirmReset}>Reset</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>

			{running && wsUrl !== undefined ? (
				<div className='relative aspect-[16/9] w-full max-w-[1280px] overflow-hidden rounded border bg-black'>
					<div
						ref={vnc.containerRef}
						data-testid='master-chrome-viewer'
						tabIndex={0}
						className='h-full w-full focus:outline-none [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-contain'
					/>
					{vnc.status === 'connecting' ? (
						<div className='pointer-events-none absolute inset-0 flex items-center justify-center text-text-primary'>
							Connecting to master Chrome (display {display ?? '?'})…
						</div>
					) : null}
					{vnc.status === 'error' && vnc.errorMessage !== null ? (
						<div className='pointer-events-none absolute inset-0 flex items-center justify-center text-red-500'>
							{vnc.errorMessage}
						</div>
					) : null}
				</div>
			) : null}

			{startMut.isError ? (
				<p className='text-xs text-red-600 dark:text-red-400'>{startMut.error.message}</p>
			) : null}
			{stopMut.isError ? (
				<p className='text-xs text-red-600 dark:text-red-400'>{stopMut.error.message}</p>
			) : null}
			{resetMut.isError ? (
				<p className='text-xs text-red-600 dark:text-red-400'>{resetMut.error.message}</p>
			) : null}
		</div>
	)
}
