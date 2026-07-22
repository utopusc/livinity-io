// Phase 353-02 (VMVIEW-01, VMVIEW-02) — the state-aware VM screen view.
//
// Replaces the 352 disabled "open screen" placeholder with a real browser
// noVNC surface. The view drives ENTIRELY off the already-shipped vm.list/vm.get
// polling (352) plus the existing system.getIpAddresses query — no new backend
// query, no touch of vm-manager/vm-registry.
//
// Honesty guarantee (VMVIEW-02 / T-353-06): a running VM's iframe is only ever
// presented as working AFTER onLoad fires. If onLoad never fires within the
// timeout, or onError fires, we flip to an honest retry/error affordance —
// NEVER a bare/blank iframe shown as if it were the live desktop. The iframe is
// same-origin (`/vm/<id>/`, remote-desktop-content.tsx precedent) to avoid
// Cloudflare-Tunnel cross-subdomain issues.
//
// noVNC entry page (VERIFIED live 2026-07-22 against dockur/qemus source): the
// dockur/qemus container serves its viewer at the ROOT `/` on port 8006 (nginx
// `location / { root /run/shm }`, index.html with RELATIVE asset refs), NOT at
// `/vnc.html` (the earlier RESEARCH guess 404'd on the box). The src MUST keep
// the trailing slash so (a) index.html's relative `css/`,`js/` refs resolve
// under `/vm/<id>/`, and (b) the viewer's `getURL()` (window.location.pathname)
// derives the correct `/vm/<id>/websockify` + `/vm/<id>/status` WS URLs. The
// viewer opens TWO websockets (websockify=VNC, status=install-progress); both
// (plus /audio) are proxied by the Express /vm/:id/<endpoint> WS bridge — a
// missing /status WS would trigger the viewer's onerror window.location.reload()
// loop. The blank-frame heuristic below remains the honest backstop.
import {useEffect, useRef, useState} from 'react'
import {TbAlertTriangle, TbArrowLeft, TbDeviceDesktop, TbLoader2, TbPlayerPlay, TbRefresh} from 'react-icons/tb'
import {toast} from 'sonner'

import {Button} from '@/shadcn-components/ui/button'
import type {RouterOutput} from '@/trpc/trpc'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

// Consumed from vm.list — never redefined (interfaces block of 353-02-PLAN).
type VmView = RouterOutput['vm']['list'][number]

/**
 * Exact sandbox token list (locked by test). Scoped to the MINIMUM noVNC needs:
 * same-origin (canvas reads same-origin assets + the /websockify WS is
 * same-origin) + scripts (the noVNC React/JS client). Deliberately withholds the
 * form-submit, popup, and download grants — the noVNC chrome has no login form,
 * no popup, no file download (T-353-07: minimal EoP surface). Order + spacing
 * matter (mirrors the LIV_ASSISTANT sandbox convention).
 */
export const VM_SCREEN_SANDBOX = 'allow-same-origin allow-scripts'

/** How long the iframe gets to fire onLoad before we call it a failed load. */
const LOAD_TIMEOUT_MS = 15_000

export function VmScreen({vm, onBack}: {vm: VmView; onBack: () => void}) {
	const utils = trpcReact.useUtils()

	// Blank-frame heuristic (the one genuinely-new bit of logic — no in-repo
	// analog). `loaded` flips true only on the iframe's onLoad; `failed` flips
	// true on onError OR when the timeout elapses without a load. `attempt` bumps
	// the iframe key to force a clean re-mount on retry.
	const [loaded, setLoaded] = useState(false)
	const [failed, setFailed] = useState(false)
	const [attempt, setAttempt] = useState(0)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const isRunning = vm.state === 'running'

	// Arm/disarm the load-timeout only while we're actually trying to show the
	// iframe (running + not yet loaded/failed). Reset on every attempt + whenever
	// the VM leaves the running state.
	useEffect(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current)
			timerRef.current = null
		}
		if (!isRunning || loaded || failed) return
		timerRef.current = setTimeout(() => setFailed(true), LOAD_TIMEOUT_MS)
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current)
		}
	}, [isRunning, loaded, failed, attempt])

	const retry = () => {
		setLoaded(false)
		setFailed(false)
		setAttempt((n) => n + 1)
	}

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

			<div className='relative min-h-0 flex-1'>
				{/* running: same-origin noVNC iframe with the blank-frame backstop. */}
				{isRunning && !failed ? (
					<iframe
						key={attempt}
						src={`/vm/${vm.id}/`}
						title={t('vm.screen.title', {name: vm.name})}
						data-testid='vm-screen-iframe'
						className='h-full w-full border-0 bg-black'
						sandbox={VM_SCREEN_SANDBOX}
						allow='clipboard-read; clipboard-write'
						onLoad={() => setLoaded(true)}
						onError={() => setFailed(true)}
					/>
				) : null}

				{/* running but the frame never confirmed a load: HONEST failure, not a
				    blank frame shown as working (VMVIEW-02 core guarantee). */}
				{isRunning && failed ? (
					<div className='flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center'>
						<TbAlertTriangle className='h-8 w-8 text-destructive2' />
						<p className='max-w-md text-body-sm leading-tight text-text-tertiary'>
							{t('vm.screen.error.blank-frame')}
						</p>
						<Button size='sm' variant='default' onClick={retry}>
							<TbRefresh className='h-4 w-4' />
							{t('vm.screen.error.retry')}
						</Button>
					</div>
				) : null}

				{/* running + not-yet-loaded: honest connecting spinner over the frame. */}
				{isRunning && !loaded && !failed ? (
					<div className='pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-black/40 text-body-sm text-white'>
						<TbLoader2 className='h-4 w-4 animate-spin' />
						{t('vm.screen.loading')}
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

				{/* creating / installing-os: honest progress, no iframe. */}
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
