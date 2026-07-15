import {useEffect, useRef, useState} from 'react'
import QRCode from 'react-qr-code'
import {TbLock, TbLoader2, TbAlertTriangle, TbShieldCheck, TbExternalLink} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Switch} from '@/shadcn-components/ui/switch'
import {useCurrentUser} from '@/hooks/use-current-user'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

/**
 * Phase 325-10 (NET-02) — first-class VPN (Tailscale) managed from Settings → VPN.
 * Clone of `os-patching-section.tsx` / sibling of `network-section.tsx`.
 *
 * Wraps the FLAT `system.tailscale` / `system.tailscaleStatus` routes (325-10),
 * which reach the host ONLY through `sudo -n livos-tailscale.sh <action>` (325-09) —
 * livinityd never runs apt/tailscale/ufw/systemctl directly. The action is
 * z.enum-constrained server-side; the UI carries no trust.
 *
 * GUIDED LOGIN (D-11 + WR-01): enabling the toggle runs the wrapper's `login-start`
 * action, which spawns a DETACHED `tailscale login` and returns the `AuthURL:`
 * IMMEDIATELY (rendered here as a clickable link + QR) so the admin can authorize this
 * device on their phone WHILE the login is still pending. The card then POLLS
 * `tailscaleStatus` (which also surfaces the pending AuthURL) until the backend is
 * Running, at which point it fires `login-finish` (persist the overlay bind in
 * /opt/livos/.env + restart the unit — 325-09) followed by `set` (the MagicDNS
 * `accept-dns=false` cloudflared-1033 house fix). Disabling runs `down`.
 *
 * DISPLAY MIRROR: the card renders last-known {enabled, overlayIp, backendState}
 * from the UI-display `tailscale` StoreSchema key (surfaced by `tailscaleStatus` as
 * `mirror`) so it shows meaningful state even when the daemon is unreachable — that
 * key is a display mirror only, NOT the overlay bind mechanism (325-09's `.env` is).
 *
 * T-325-30: `tailscale*` are all `adminProcedure`. A non-admin sees the header + a
 * note but never a host-mutating control. `runTailscale` never throws, so a box
 * where the wrapper is not yet deployed degrades to `{ok:false}` — the card renders
 * an "unavailable" note instead of 500-ing the whole Settings page. All copy flows
 * through `t('vpn.*')`.
 */
export function VpnSection() {
	// T-325-30 — host-mutating controls render for admins only.
	const {isAdmin} = useCurrentUser()

	// WR-01 — while a guided login is pending we POLL status (every ~3s) so the
	// browser-authorize → Running transition is observed even across a WS reconnect.
	const [loginPending, setLoginPending] = useState(false)
	const statusQ = trpcReact.system.tailscaleStatus.useQuery(undefined, {
		refetchInterval: loginPending ? 3000 : false,
	})
	const refetchStatus = () => void statusQ.refetch()
	const tailscaleMut = trpcReact.system.tailscale.useMutation()

	// The AuthURL captured from `login-start` stdout (`AuthURL: <url>`) or, as a
	// fallback, from the pending-login status poll.
	const [authUrl, setAuthUrl] = useState<string | null>(null)
	const [flowError, setFlowError] = useState<string | null>(null)
	// Re-entrancy guard so the Running-transition effect fires login-finish only once.
	const finishingRef = useRef(false)

	const busy = tailscaleMut.isPending || loginPending

	const mirror = statusQ.data?.mirror
	const status = statusQ.data
	const enabled = mirror?.enabled === true
	const overlayIp = mirror?.overlayIp
	const backendState = mirror?.backendState

	// WR-01 fallback — if login-start did not return an AuthURL in time, adopt the one
	// the status poll surfaces while the login is still pending.
	useEffect(() => {
		if (loginPending && !authUrl && status?.authUrl) setAuthUrl(status.authUrl)
	}, [loginPending, authUrl, status?.authUrl])

	// WR-01 — once the polled backend reaches Running, complete the login exactly once:
	// login-finish persists the overlay bind (+ restarts the unit); set applies the
	// MagicDNS fix. Then stop polling + clear the QR.
	useEffect(() => {
		if (!loginPending || backendState !== 'Running' || finishingRef.current) return
		finishingRef.current = true
		void (async () => {
			try {
				const finished = await tailscaleMut.mutateAsync({action: 'login-finish'})
				if (!finished.ok) setFlowError(finished.reason)
				await tailscaleMut.mutateAsync({action: 'set'}).catch(() => {})
			} catch (e) {
				setFlowError(e instanceof Error ? e.message : String(e))
			} finally {
				setLoginPending(false)
				setAuthUrl(null)
				finishingRef.current = false
				refetchStatus()
			}
		})()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loginPending, backendState])

	const header = (
		<div className='flex items-center gap-2'>
			<TbLock className='h-5 w-5 text-text-primary' />
			<div>
				<span className='text-body-sm font-medium text-text-primary'>{t('vpn.title')}</span>
				<p className='text-caption text-text-tertiary'>{t('vpn.description')}</p>
			</div>
		</div>
	)

	// T-325-30 — no host-mutating controls for non-admins; show header + a note.
	if (!isAdmin) {
		return (
			<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-4'>
				{header}
				<p className='text-caption text-text-tertiary'>{t('vpn.admin-only')}</p>
			</div>
		)
	}

	// runTailscale never throws → not-ok status = wrapper not deployed; degrade to a
	// note (but still honour a last-known mirror if one was ever written).
	if (status && status.ok === false && !enabled) {
		return (
			<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-4'>
				{header}
				<p className='text-caption text-text-tertiary'>{t('vpn.unavailable')}</p>
			</div>
		)
	}

	// Enable = install-if-needed → login-start (surfaces AuthURL fast) → poll status;
	// login-finish + set run from the Running-transition effect above. Disable = down.
	const onToggle = async (next: boolean) => {
		setFlowError(null)
		setAuthUrl(null)
		setLoginPending(false)
		try {
			if (next) {
				if (backendState === 'NotInstalled') {
					const installed = await tailscaleMut.mutateAsync({action: 'install'})
					if (!installed.ok) {
						setFlowError(installed.reason)
						return
					}
				}
				const started = await tailscaleMut.mutateAsync({action: 'login-start'})
				if (!started.ok) {
					setFlowError(started.reason)
					refetchStatus()
					return
				}
				// login-start echoes `AuthURL: <url>` immediately (or `already-running`
				// / `auth-url-pending` — the status poll then surfaces the URL).
				const match = /AuthURL:\s*(\S+)/.exec(started.stdout)
				if (match) setAuthUrl(match[1])
				// Poll status until Running; the effect fires login-finish + set once up.
				setLoginPending(true)
			} else {
				const down = await tailscaleMut.mutateAsync({action: 'down'})
				if (!down.ok) {
					setFlowError(down.reason)
					return
				}
			}
		} catch (e) {
			setFlowError(e instanceof Error ? e.message : String(e))
		} finally {
			refetchStatus()
		}
	}

	return (
		<div className='space-y-4 rounded-radius-sm border border-border-default bg-surface-base p-4'>
			{header}

			{/* Toggle — enable runs the guided Tailscale login; disable runs `down`. */}
			<div className='flex items-center justify-between gap-3 border-t border-border-default pt-3'>
				<div>
					<span className='text-caption font-medium text-text-secondary'>
						{enabled ? t('vpn.enabled') : t('vpn.disabled')}
					</span>
					{busy ? <p className='text-caption text-text-tertiary'>{t('vpn.connecting')}</p> : null}
				</div>
				<div className='flex items-center gap-2'>
					{busy ? <TbLoader2 className='h-4 w-4 animate-spin text-text-tertiary' /> : null}
					<Switch checked={enabled} disabled={busy} onCheckedChange={(v) => void onToggle(v)} />
				</div>
			</div>

			{/* Guided authorize — the AuthURL as a clickable link + a QR to scan. */}
			{authUrl ? (
				<div className='space-y-3 rounded-radius-sm border border-brand/30 bg-brand/5 p-3'>
					<p className='text-caption text-text-secondary'>{t('vpn.scan-qr')}</p>
					<div className='flex justify-center'>
						<div className='rounded-radius-sm bg-white p-2'>
							<QRCode size={160} value={authUrl} viewBox='0 0 256 256' style={{height: 160, width: 160}} />
						</div>
					</div>
					<a
						href={authUrl}
						target='_blank'
						rel='noreferrer'
						className='inline-flex items-center gap-1 text-caption font-medium text-brand hover:underline'
					>
						<TbExternalLink className='h-4 w-4' />
						{t('vpn.open-link')}
					</a>
				</div>
			) : null}

			{/* Connected details — overlay IP + the MagicDNS-fix note. */}
			{enabled && overlayIp ? (
				<div className='space-y-1 border-t border-border-default pt-3'>
					<div className='flex items-center gap-2'>
						<TbShieldCheck className='h-4 w-4 text-emerald-400' />
						<span className='text-caption font-medium text-text-secondary'>{t('vpn.overlay-ip')}</span>
					</div>
					<code className='text-caption text-text-primary'>{overlayIp}</code>
					<p className='text-caption text-text-tertiary'>{t('vpn.magicdns-note')}</p>
				</div>
			) : null}

			{flowError ? (
				<div className='flex items-start gap-2'>
					<TbAlertTriangle className='mt-0.5 h-4 w-4 text-red-400' />
					<p role='alert' className='text-caption text-red-400'>
						{flowError}
					</p>
				</div>
			) : null}

			{/* Status panel — the wrapper's own authoritative probe output. */}
			<div className='space-y-2 border-t border-border-default pt-3'>
				<span className='text-caption font-medium text-text-secondary'>{t('vpn.status-heading')}</span>
				{status && status.ok ? (
					<pre className='max-h-64 overflow-auto whitespace-pre-wrap rounded-radius-sm bg-surface-base p-2 text-caption text-text-tertiary'>
						{status.stdout}
					</pre>
				) : (
					<p className='text-caption text-text-tertiary'>{t('vpn.unavailable')}</p>
				)}
			</div>
		</div>
	)
}
