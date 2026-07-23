// Phase 355-01 (VMVNC-01, VMVNC-02) — the state-aware VM screen view, now
// driven by LivOS's OWN native RFB canvas.
//
// Replaces 353's iframe of dockur/qemus's bundled noVNC page (`src=/vm/<id>/`)
// with a native RFB canvas rendered via the shared `useWebAppVnc` hook —
// exactly the surface the webapp/native-app/X11 streams already use. The canvas
// connects to the EXISTING admin-gated `wss://<host>/vm/<id>/websockify` WS
// bridge (353 + beta.5, byte-for-byte untouched); cookie auth rides the
// same-origin handshake just like the iframe did. Removing the dockur page also
// removes its coupling (root-path entry, /status install-WS reload-loop,
// /audio socket) that caused the beta.5 pain.
//
// Honesty guarantee (VMVNC-01 / T-355-01): the canvas is presented as working
// ONLY on a real RFB `connect` (vnc.status === 'connected'). connecting /
// disconnected / error render honest copy + a Reconnect affordance — never a
// blank canvas shown as if it were the live desktop. Real RFB
// connect/disconnect/securityfailure events replace 353's fragile
// onLoad/onError/timeout blank-frame heuristic (strictly MORE honest).
//
// Jargon ban (VMVNC-02, operator directive): zero user-facing VNC/noVNC/RFB/
// websockify terminology — every string is a jargon-free t() key. In
// particular the error branch renders t('vm.screen.error.connection') and
// NEVER the hook's raw errorMessage (which can be English 'VNC security
// failure').
//
// 356-readiness: VmScreen's {vm, onBack} core prop contract + named export are
// intentionally unchanged so Phase 356 can host this component in a
// window-manager window unmodified — no panel-only assumptions baked in.
//
// 358-01 (VMPURE-01): an ADDITIVE `pure?` prop suppresses the header/Back/title
// row when the screen is shown AS A WINDOW (the 356 window chrome already
// carries the VM name + OS icon, so a second Back/title is redundant chrome).
// `pure` is false on the mobile in-panel path (windowId absent) so mobile keeps
// its Back — no stranding. The {vm, onBack} core contract is otherwise intact.
import {useEffect, useRef, useState} from 'react'
import {TbAlertTriangle, TbArrowLeft, TbDeviceDesktop, TbLoader2, TbPlayerPlay, TbRefresh} from 'react-icons/tb'
import {toast} from 'sonner'

import {useVmEncodedScreen} from '@/hooks/use-vm-encoded-screen'
import {useVmInput} from '@/hooks/use-vm-input'
import {useWebAppVnc} from '@/hooks/use-webapp-vnc'
import {Button} from '@/shadcn-components/ui/button'
import type {RouterOutput} from '@/trpc/trpc'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

// Consumed from vm.list — never redefined (interfaces block of 353-02-PLAN).
type VmView = RouterOutput['vm']['list'][number]

/**
 * Same-origin WS URL for the VM's screen bridge. Cookie auth rides the
 * same-origin handshake (the 353 upgrade gate reads the session cookie) — NO
 * `?token=` query. This is the ONLY VM-specific part of the wiring; the
 * `/vm/<id>/websockify` gate itself (Origin + verifySessionFull + admin) is
 * byte-for-byte untouched. Exported so the test can pin the shape.
 */
export function buildVmWsUrl(id: string) {
	const p = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
	return `${p}//${window.location.host}/vm/${id}/websockify`
}

export function VmScreen({vm, onBack, pure}: {vm: VmView; onBack: () => void; pure?: boolean}) {
	const utils = trpcReact.useUtils()

	const isRunning = vm.state === 'running'

	// ── Honest MSE-vs-RFB fallback state machine (365-02) ──────────────────────
	// Try the 364 host-hardware-encoded <video> stream first; on ANY terminal
	// status (unavailable/error) — or when the user asks to control the machine —
	// LATCH a fall-back to the fully-intact 355 RFB view (which carries input).
	// Invariants: never a black <video> presented as live (the 365-01 hook only
	// reports 'connected' on a real playing frame + fail-closes its own connect
	// deadline, so no hung spinner); the two surfaces are MUTUALLY EXCLUSIVE and
	// the RFB socket only opens on fallback (`!showEncoded`), so exactly one live
	// socket exists; the fallback decision is stored in `forcedFallback` STATE,
	// not re-derived per render, so a status flap can never flip the surface back.
	// The encoded surface takes input DIRECTLY since 367 (pointer/keyboard/wheel
	// ride the stream socket via useVmInput); the escape-hatch button below still
	// latches to the standard RFB view (encoder trouble / input feel / clipboard
	// — which stays RFB-only, Latin-1 deferral). Multi-viewer: N browsers may
	// each open the player — 2 tabs currently = 2 backend encode pairs, a
	// documented 365-HUMAN-UAT open question, not fixed here; input from N admin
	// viewers interleaves last-write-wins on the one shared guest connection.
	//
	// Cap-slot discipline: the cheap synchronous MediaSource support check gates
	// the hook arg, so a browser that can never play the encoded stream never
	// burns a backend encode slot; the hook idles when we've latched to RFB.
	const mseSupported = typeof window !== 'undefined' && typeof window.MediaSource !== 'undefined'
	const [forcedFallback, setForcedFallback] = useState(false)
	const mse = useVmEncodedScreen(isRunning && mseSupported && !forcedFallback ? vm.id : undefined)
	// Encoded is shown while idle/connecting/connected; a terminal status excludes it.
	const showEncoded =
		mseSupported && isRunning && !forcedFallback && mse.status !== 'unavailable' && mse.status !== 'error'

	// One-way latch: any terminal encoded status routes to the 355 RFB fallback.
	// After it fires the hook arg goes undefined (status resets to idle) but
	// forcedFallback keeps showEncoded false → no flapping.
	useEffect(() => {
		if (mse.status === 'unavailable' || mse.status === 'error') setForcedFallback(true)
	}, [mse.status])
	// Fresh session only: a stop→start (or a different VM) re-attempts the encoded
	// path; within one running session the latch holds.
	useEffect(() => {
		setForcedFallback(false)
	}, [vm.id, isRunning])

	// 367-02: input capture for the encoded view — pointer/keyboard/wheel on the
	// focusable wrapper below, relayed over the 365 hook's OWN stream socket
	// (mse.sendInput; no second socket). The hook is called unconditionally
	// (rules of hooks); `enabled` gates everything on a GENUINELY connected
	// stream, so input is dead while connecting/latched — the honest-state
	// invariant extends to input.
	const encInputRef = useRef<HTMLDivElement>(null)
	useVmInput({
		containerRef: encInputRef,
		videoRef: mse.videoRef,
		sendInput: mse.sendInput,
		enabled: showEncoded && mse.status === 'connected',
	})

	// Native RFB canvas over the 353 websockify bridge — the honest fallback.
	// MUTUALLY EXCLUSIVE with the encoded path: the wsUrl (and thus the live WS)
	// is gated on `!showEncoded`, so `useWebAppVnc` stays idle while the encoded
	// path is active — never two live sockets. viewOnly:false → keyboard/mouse
	// forwarded to the guest, with full clipboard (the encoded path defers
	// clipboard — Latin-1 wire limitation, 367-01 decision).
	const wsUrl = isRunning && !showEncoded ? buildVmWsUrl(vm.id) : undefined
	const vnc = useWebAppVnc(wsUrl, {viewOnly: false})

	const startMut = trpcReact.vm.start.useMutation({
		onSuccess: () => utils.vm.list.invalidate(),
		onError: (error) => toast.error(error.message),
	})

	return (
		<div className='flex h-full w-full flex-col'>
			{/* Header (Back + name + title): suppressed in a WINDOW (pure stream —
			    the 356 window chrome already carries name + OS icon). Kept on the
			    mobile in-panel path (pure false) so the user can return to the VM
			    list. The Windows RDP hint block that used to sit below the header
			    was REMOVED here in 358-01 (info-disclosure of the host LAN IP; it
			    re-homes to the 359 settings/details surface). */}
			{!pure && (
				<div className='flex shrink-0 items-center gap-2 border-b border-border-default p-3'>
					<Button size='sm' variant='ghost' onClick={onBack} aria-label={t('vm.screen.back')}>
						<TbArrowLeft className='h-4 w-4' />
						{t('vm.screen.back')}
					</Button>
					<TbDeviceDesktop className='h-4 w-4 shrink-0 text-text-secondary' />
					<span className='truncate text-body-sm font-medium text-text-primary'>
						{t('vm.screen.title', {name: vm.name})}
					</span>
				</div>
			)}

			<div className='min-h-0 flex-1'>
				{/* running (encoded): the host-hardware-encoded <video>, INTERACTIVE
				    since 367 (pointer/keyboard/wheel captured on the focusable
				    wrapper via useVmInput, riding the stream socket). Presented as
				    working only while the encoded status is idle/connecting/connected
				    (an honest overlay reusing vm.screen.loading until a real playing
				    frame); ANY terminal status latches the RFB fallback below.
				    Mutually exclusive with the RFB branch (`showEncoded` vs
				    `!showEncoded`). The compact escape-hatch button force-latches to
				    the standard RFB view (encoder trouble / input feel / clipboard /
				    operator preference — honest affordance, not a dead one). */}
				{isRunning && showEncoded ? (
					<div className='flex h-full w-full flex-col'>
						{mse.status !== 'connected' ? (
							<div className='flex items-center gap-2 border-b border-border-default bg-black/80 px-3 py-1.5 text-caption text-white/70'>
								<TbLoader2 className='h-4 w-4 animate-spin' />
								{t('vm.screen.loading')}
							</div>
						) : (
							<div className='flex items-center gap-2 border-b border-border-default bg-black/80 px-3 py-1.5 text-caption text-white/70'>
								<Button size='sm' variant='ghost' onClick={() => setForcedFallback(true)}>
									<TbDeviceDesktop className='h-4 w-4' />
									{t('vm.screen.action.switch-standard')}
								</Button>
							</div>
						)}
						{/* Focusable input wrapper (tabIndex — key events need a focused
						    target; useVmInput focuses it on pointerdown) around the
						    encoded stream. The <video> attribute list itself is
						    byte-identical to 365 (pinned). */}
						<div
							ref={encInputRef}
							tabIndex={0}
							className='flex min-h-0 w-full flex-1 flex-col outline-none'
							style={{background: 'black'}}
						>
							<video
								ref={mse.videoRef}
								autoPlay
								muted
								playsInline
								data-testid='vm-screen-video'
								className='min-h-0 w-full flex-1 object-contain'
								style={{background: 'black'}}
							/>
						</div>
					</div>
				) : null}

				{/* running (fallback): LivOS's own native RFB canvas + an honest
				    status strip — mounted ONLY when the encoded path is not active
				    (`!showEncoded`), so the two surfaces are mutually exclusive and
				    exactly one live socket exists. The canvas is only presented as
				    working on a real RFB connect; connecting/disconnected/error render
				    honest copy (never a blank canvas shown as working — T-355-01).
				    Error copy is a jargon-free t() key, NEVER the hook's raw
				    errorMessage (jargon leak — the hook can set English 'VNC security
				    failure'; T-355-02). */}
				{isRunning && !showEncoded ? (
					<div className='flex h-full w-full flex-col'>
						{vnc.status !== 'connected' ? (
							<div className='flex items-center gap-2 border-b border-border-default bg-black/80 px-3 py-1.5 text-caption text-white/70'>
								{vnc.status === 'connecting' || vnc.status === 'idle' ? (
									<>
										<TbLoader2 className='h-4 w-4 animate-spin' />
										{t('vm.screen.loading')}
									</>
								) : null}
								{vnc.status === 'disconnected' ? (
									<>
										<span>{t('vm.screen.state.disconnected')}</span>
										<Button size='sm' variant='ghost' onClick={vnc.reconnect}>
											<TbRefresh className='h-4 w-4' />
											{t('vm.screen.error.retry')}
										</Button>
									</>
								) : null}
								{vnc.status === 'error' ? (
									<>
										<span className='text-destructive2'>{t('vm.screen.error.connection')}</span>
										<Button size='sm' variant='ghost' onClick={vnc.reconnect}>
											<TbRefresh className='h-4 w-4' />
											{t('vm.screen.error.retry')}
										</Button>
									</>
								) : null}
							</div>
						) : null}
						{/* isRunning-gated native canvas (mounts only in this branch). */}
						<div
							ref={vnc.containerRef}
							data-testid='vm-screen-canvas'
							className='flex-1 min-h-0 outline-none [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-contain'
							style={{background: 'black'}}
						/>
					</div>
				) : null}

				{/* stopped: start affordance (auto-transitions via 2s transitional poll). */}
				{vm.state === 'stopped' ? (
					<div className='flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center'>
						<p className='max-w-md text-body-sm leading-tight text-text-tertiary'>
							{t('vm.screen.state.stopped-hint')}
						</p>
						<Button
							size='sm'
							variant='primary'
							disabled={startMut.isPending}
							onClick={() => startMut.mutate({id: vm.id})}
						>
							{startMut.isPending ? (
								<TbLoader2 className='h-4 w-4 animate-spin' />
							) : (
								<TbPlayerPlay className='h-4 w-4' />
							)}
							{t('vm.controls.start')}
						</Button>
					</div>
				) : null}

				{/* creating / installing-os: honest progress, no canvas. */}
				{vm.state === 'creating' || vm.state === 'installing-os' ? (
					<div className='flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center'>
						<TbLoader2 className='h-8 w-8 animate-spin text-text-secondary' />
						<p className='max-w-md text-body-sm leading-tight text-text-tertiary'>
							{vm.state === 'creating'
								? t('vm.screen.state.creating')
								: t('vm.screen.state.installing-os')}
						</p>
					</div>
				) : null}

				{/* error: honest copy + the raw lastError, never a screen. */}
				{vm.state === 'error' ? (
					<div className='flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center'>
						<TbAlertTriangle className='h-8 w-8 text-destructive2' />
						<p className='max-w-md text-body-sm leading-tight text-text-tertiary'>
							{t('vm.screen.state.error')}
						</p>
						{vm.lastError ? (
							<p className='max-w-md text-caption text-destructive2'>{vm.lastError}</p>
						) : null}
					</div>
				) : null}
			</div>
		</div>
	)
}
