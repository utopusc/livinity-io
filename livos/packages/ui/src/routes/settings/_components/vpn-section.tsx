import {useState} from 'react'
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
 * GUIDED LOGIN (D-11): enabling the toggle runs the wrapper's `login` flow, which
 * prints an `AuthURL:` the admin opens on their phone (rendered here as a clickable
 * link + a QR code) to authorize this device on their Tailscale network, then polls
 * until the tailnet backend is Running. Once up, the wrapper applies the MagicDNS
 * fix (`set --accept-dns=false`, the cloudflared-1033 house fix) and persists the
 * overlay bind in /opt/livos/.env (325-09) — NOT this card. Disabling runs `down`.
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

	const statusQ = trpcReact.system.tailscaleStatus.useQuery()
	const refetchStatus = () => void statusQ.refetch()
	const tailscaleMut = trpcReact.system.tailscale.useMutation()

	// The AuthURL captured from the most recent `login` mutation stdout (the wrapper
	// prints `AuthURL: <url>` for the guided browser/QR authorize step).
	const [authUrl, setAuthUrl] = useState<string | null>(null)
	const [flowError, setFlowError] = useState<string | null>(null)

	const busy = tailscaleMut.isPending

	const mirror = statusQ.data?.mirror
	const status = statusQ.data
	const enabled = mirror?.enabled === true
	const overlayIp = mirror?.overlayIp
	const backendState = mirror?.backendState

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

	// Enable = install-if-needed → login (surfaces AuthURL) → set (MagicDNS fix).
	// Disable = down. The login mutation is long-running (the wrapper polls until the
	// tailnet backend is Running while the admin authorizes) — the AuthURL/QR is
	// surfaced from its returned stdout for the guided browser step.
	const onToggle = async (next: boolean) => {
		setFlowError(null)
		setAuthUrl(null)
		try {
			if (next) {
				if (backendState === 'NotInstalled') {
					const installed = await tailscaleMut.mutateAsync({action: 'install'})
					if (!installed.ok) {
						setFlowError(installed.reason)
						return
					}
				}
				const loggedIn = await tailscaleMut.mutateAsync({action: 'login'})
				if (!loggedIn.ok) {
					setFlowError(loggedIn.reason)
					refetchStatus()
					return
				}
				// The wrapper prints `AuthURL: <url>` for the guided authorize step.
				const match = /AuthURL:\s*(\S+)/.exec(loggedIn.stdout)
				if (match) setAuthUrl(match[1])
				// Apply the MagicDNS/cloudflared-1033 house fix (best-effort).
				await tailscaleMut.mutateAsync({action: 'set'}).catch(() => {})
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
