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
// 356-readiness: VmScreen's {vm, onBack} prop contract + named export are
// intentionally unchanged so Phase 356 can host this component in a
// window-manager window unmodified — no panel-only assumptions baked in.
import {TbAlertTriangle, TbArrowLeft, TbDeviceDesktop, TbLoader2, TbPlayerPlay, TbRefresh} from 'react-icons/tb'
import {toast} from 'sonner'

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

export function VmScreen({vm, onBack}: {vm: VmView; onBack: () => void}) {
	const utils = trpcReact.useUtils()

	const isRunning = vm.state === 'running'

	// Native RFB canvas over the 353 websockify bridge. Called unconditionally
	// at the top level; passing `undefined` when not running keeps the hook idle
	// (its own contract) so no canvas mounts and no WS is opened in any
	// non-running state. viewOnly:false → keyboard/mouse forwarded to the guest.
	const wsUrl = isRunning ? buildVmWsUrl(vm.id) : undefined
	const vnc = useWebAppVnc(wsUrl, {viewOnly: false})

	const startMut = trpcReact.vm.start.useMutation({
		onSuccess: () => utils.vm.list.invalidate(),
		onError: (error) => toast.error(error.message),
	})

	// RDP hint (Windows only, informational). Reuses the already-shipped
	// system.getIpAddresses query (settings-summary.tsx precedent) + vm.rdpPort.
	const ipQ = trpcReact.system.getIpAddresses.useQuery(undefined, {enabled: vm.kind === 'windows'})
	const rdpIp = ipQ.data?.[0]

	return (
		<div className='flex h-full w-full flex-col'>
			{/* Header: back to list + name + honest state-derived title. */}
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

			{/* Windows-only RDP hint — informational, never implies the screen below. */}
			{vm.kind === 'windows' && vm.rdpPort && rdpIp ? (
				<div className='shrink-0 border-b border-border-default bg-surface-1 px-3 py-2 text-caption text-text-tertiary'>
					{t('vm.screen.rdp-hint', {ip: rdpIp, port: vm.rdpPort})}
				</div>
			) : null}

			<div className='min-h-0 flex-1'>
				{/* running: LivOS's own native RFB canvas + an honest status strip.
				    The canvas is only presented as working on a real RFB connect;
				    connecting/disconnected/error render honest copy (never a blank
				    canvas shown as working — T-355-01). Error copy is a jargon-free
				    t() key, NEVER the hook's raw errorMessage (jargon leak — the hook
				    can set English 'VNC security failure'; T-355-02). */}
				{isRunning ? (
					<div className='flex h-full w-full flex-col'>
						{vnc.status !== 'connected' ? (
							<div className='flex items-center gap-2 border-b border-border-default bg-black/80 px-3 py-1.5 text-caption text-white/70'>
								{vnc.status === 'connecting' ? (
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
