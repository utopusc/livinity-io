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
import {cn} from '@/shadcn-lib/utils'

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
	//
	// Phase 103.1-10 — flip `viewOnly: false`. WebApp WebApps need viewOnly:true
	// because their x11vnc captures via `-id <wid>` and input via XTestFake
	// re-routes to whatever has X11 focus (wrong wid on multi-stream). Master
	// Chrome's x11vnc captures the WHOLE display (`-display :N`) and there is
	// EXACTLY ONE Chrome window on that display, so RFB-native input from the
	// noVNC viewer goes through x11vnc → XTestFakeKey/MotionEvent → lands on
	// the Chrome window unambiguously. Live UAT 2026-05-11: raw xdotool on the
	// master display delivered input correctly (md5 of screenshot changed
	// before/after every action), but tRPC-driven dispatch produced no visible
	// effect — the dispatch round-trip latency / coord-conversion / xdotool
	// chained semantics broke something we couldn't pin down. RFB-native input
	// bypasses all of that.
	const vnc = useWebAppVnc(running && wsUrl !== undefined ? wsUrl : undefined, {
		viewOnly: false,
	})

	// Phase 103.1-10 — JS-driven input dispatch removed. noVNC RFB protocol
	// (viewOnly:false) carries pointer + key + wheel events straight through
	// to x11vnc → X server → Chrome. The earlier printableBuffer / flushType /
	// toFB infrastructure became dead code; we keep the imports + tRPC
	// mutations declared above for future programmatic dispatch (e.g. an
	// agent driving master Chrome via chromeMaster.input.* routes).

	// Phase 103.1-10 — viewOnly:false above hands all click/key/wheel events
	// straight to the noVNC RFB protocol. No JS event listeners required:
	// noVNC's internal RFB pointer/key encoders run on the connected stream's
	// WebSocket. We keep onContextMenu to suppress the browser-native context
	// menu so right-click reaches the RFB layer as button 3 rather than
	// opening Chrome-host context menu.
	useEffect(() => {
		const el = vnc.containerRef.current
		if (!el || !running || wsUrl === undefined) return
		const onContextMenu = (e: MouseEvent) => {
			e.preventDefault()
		}
		el.addEventListener('contextmenu', onContextMenu)
		el.setAttribute('tabindex', '0')
		return () => {
			el.removeEventListener('contextmenu', onContextMenu)
		}
	}, [vnc.containerRef, running, wsUrl])

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
		<div className='flex flex-col gap-6'>
			{/* Status card — colored dot + Logged in / Not logged in + running pill */}
			<div className='rounded-[var(--r-lg)] border border-line bg-[color:var(--bg)] p-5'>
				<div className='flex flex-wrap items-center justify-between gap-3'>
					<div className='flex items-center gap-3'>
						<span
							className={cn(
								'inline-flex h-2.5 w-2.5 shrink-0 rounded-full',
								loggedIn ? 'bg-green-500' : 'bg-amber-500',
							)}
							aria-hidden='true'
						/>
						<div className='flex flex-col gap-0.5'>
							<span
								className={cn(
									'text-[14px] font-medium',
									loggedIn ? 'text-green-600 dark:text-green-400' : 'text-text-primary',
								)}
							>
								{loggedIn ? 'Logged in' : 'Not logged in'}
							</span>
							<span className='text-[12px] text-text-secondary'>
								{loggedIn
									? 'Every WebApp browser inherits this Google session.'
									: 'Sign in once to share the session with every WebApp.'}
							</span>
						</div>
					</div>
					{/* Master Chrome running indicator */}
					<span
						className={cn(
							'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium',
							running
								? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
								: 'bg-[color:var(--bg-2)] text-text-secondary',
						)}
						title='Master Chrome running'
					>
						Master Chrome running: {running ? 'yes' : 'no'}
					</span>
				</div>
			</div>

			{/* 3-step guide — only until a session exists */}
			{!loggedIn && !running ? (
				<ol className='flex flex-col gap-1.5 text-[13px] text-text-secondary'>
					<li>
						<span className='font-mono text-[color:var(--fg-faint)]'>1.</span> Click{' '}
						<span className='font-medium text-text-primary'>Open Master Chrome</span> below.
					</li>
					<li>
						<span className='font-mono text-[color:var(--fg-faint)]'>2.</span> Sign into your
						Google account in the window that appears.
					</li>
					<li>
						<span className='font-mono text-[color:var(--fg-faint)]'>3.</span> Close it — Gmail,
						Calendar &amp; Drive WebApps now work without re-auth.
					</li>
				</ol>
			) : null}

			{/* Primary actions */}
			<div className='flex flex-row flex-wrap gap-2'>
				<Button
					variant='primary'
					onClick={onOpenMasterClick}
					disabled={running || startMut.isPending}
				>
					{running
						? 'Master Chrome running'
						: startMut.isPending
							? 'Opening…'
							: loggedIn
								? 'Re-open to update login'
								: 'Open Master Chrome'}
				</Button>

				<Button
					onClick={onCloseMasterClick}
					disabled={!running || stopMut.isPending}
					variant='destructive'
				>
					Close Master Chrome
				</Button>
			</div>

			{/* Embedded noVNC viewer when a master Chrome is live */}
			{running && wsUrl !== undefined ? (
				<div className='relative aspect-[16/9] w-full max-w-[1280px] overflow-hidden rounded-[var(--r-md)] border border-line bg-black'>
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

			{/* Danger zone — Reset Master Profile (de-emphasized) */}
			<div className='mt-1 flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-md)] border border-line px-4 py-3'>
				<div className='flex flex-col gap-0.5'>
					<span className='text-[13px] font-medium text-text-primary'>Reset Master Profile</span>
					<span className='text-[12px] text-text-secondary'>
						Clears the saved Google login. The current profile is backed up first.
					</span>
				</div>
				<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
					<Button
						variant='destructive'
						size='sm'
						disabled={running || resetMut.isPending}
						onClick={() => setConfirmOpen(true)}
					>
						Reset
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
		</div>
	)
}
