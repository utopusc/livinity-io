import {useState} from 'react'
import {TbBroadcast, TbLoader2, TbAlertTriangle, TbInfoCircle} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {useCurrentUser} from '@/hooks/use-current-user'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

/**
 * Phase 347-04 (LANDNS-01, D-347-3/4/5/8) — opt-in LAN-DNS + mDNS from Settings →
 * LAN DNS & mDNS. Clones `power-management-section.tsx`'s admin-gate + never-throw
 * degrade shape and drives the 347-03 `landns` adminProcedure router
 * (landnsStatus/Install/Enable/Disable/MdnsEnable/MdnsDisable), which reaches
 * dnsmasq/avahi ONLY through `sudo -n livos-landns.sh`. Every value is zod-constrained
 * server-side (hostIp IPv4, domain FQDN + `.local`-reject); the client guards below are
 * UX-only (T-347-14).
 *
 * WARN-1 (D-347-8) — the split-horizon domain is NOT free-typed. It is pre-filled from
 * the box's ALREADY-configured main domain (the same `domain.listMySubdomains` query the
 * Domains card consumes) so the operator cannot typo a non-functional split-horizon
 * targeting a domain the box has no valid public cert for. The field is displayed
 * read-only; when no main domain is configured the section says so and disables enabling.
 *
 * OPT-IN, default-off, REVERSIBLE — surfaced with inline notes (no AlertDialog):
 *  - LANDNS never auto-becomes the LAN resolver; the operator points router-DHCP / clients
 *    at the box explicitly, and if the box goes down the LAN loses DNS (keep a secondary).
 *  - It is DISJOINT from Cloudflare / portal mode — enabling it never touches CF DNS.
 *  - mDNS (.local) is box-DISCOVERY only, never app vhosts.
 * All copy flows through `t('lan-dns.*')`.
 */
export function LanDnsSection() {
	const {isAdmin} = useCurrentUser()

	const statusQ = trpcReact.landns.landnsStatus.useQuery()
	const refetch = () => void statusQ.refetch()

	// WARN-1 — the domain is sourced from the box's already-configured main domain, NOT
	// free-typed. Reuses the existing Domains-card query (no new server read invented).
	const domainQ = trpcReact.domain.listMySubdomains.useQuery()
	const mainDomain = domainQ.data?.mainDomain ?? null

	const installMut = trpcReact.landns.landnsInstall.useMutation({onSuccess: refetch})
	const enableMut = trpcReact.landns.landnsEnable.useMutation({onSuccess: refetch})
	const disableMut = trpcReact.landns.landnsDisable.useMutation({onSuccess: refetch})
	const mdnsEnableMut = trpcReact.landns.landnsMdnsEnable.useMutation({onSuccess: refetch})
	const mdnsDisableMut = trpcReact.landns.landnsMdnsDisable.useMutation({onSuccess: refetch})

	// Only the host IP is operator-entered; the domain is pre-filled read-only.
	const [hostIp, setHostIp] = useState('')

	const busy =
		installMut.isPending ||
		enableMut.isPending ||
		disableMut.isPending ||
		mdnsEnableMut.isPending ||
		mdnsDisableMut.isPending

	const status = statusQ.data

	// Client-side guards mirror the server-side zod (UX-only — server is authoritative).
	const IPV4_RE = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
	const FQDN_RE = /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/
	const hostIpValid = IPV4_RE.test(hostIp)
	// The pre-filled domain must be a real FQDN and NOT `.local` (mirrors domainSchema).
	const domainValid = Boolean(mainDomain) && FQDN_RE.test(mainDomain as string) && !(mainDomain as string).endsWith('.local')
	const enableValid = hostIpValid && domainValid

	const header = (
		<div className='flex items-center gap-2'>
			<TbBroadcast className='h-5 w-5 text-text-primary' />
			<div>
				<span className='text-body-sm font-medium text-text-primary'>{t('lan-dns.title')}</span>
				<p className='text-caption text-text-tertiary'>{t('lan-dns.description')}</p>
			</div>
		</div>
	)

	// Admin-only host-mutating controls.
	if (!isAdmin) {
		return (
			<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-4'>
				{header}
				<p className='text-caption text-text-tertiary'>{t('lan-dns.admin-only')}</p>
			</div>
		)
	}

	// runLandns never throws → not-ok = wrapper not deployed; degrade to a note.
	if (status && status.ok === false) {
		return (
			<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-4'>
				{header}
				<p className='text-caption text-text-tertiary'>{t('lan-dns.unavailable')}</p>
			</div>
		)
	}

	return (
		<div className='space-y-4 rounded-radius-sm border border-border-default bg-surface-base p-4'>
			{header}

			{/* Opt-in notes — LANDNS is reversible; surfaced inline (no AlertDialog). */}
			<div className='space-y-2 rounded-radius-sm border border-border-default bg-surface-1 p-3'>
				<div className='flex items-start gap-2'>
					<TbInfoCircle className='mt-0.5 h-4 w-4 shrink-0 text-text-tertiary' />
					<p className='text-caption text-text-tertiary'>{t('lan-dns.point-router-note')}</p>
				</div>
				<div className='flex items-start gap-2'>
					<TbInfoCircle className='mt-0.5 h-4 w-4 shrink-0 text-text-tertiary' />
					<p className='text-caption text-text-tertiary'>{t('lan-dns.cf-disjoint-note')}</p>
				</div>
				<div className='flex items-start gap-2'>
					<TbInfoCircle className='mt-0.5 h-4 w-4 shrink-0 text-text-tertiary' />
					<p className='text-caption text-text-tertiary'>{t('lan-dns.mdns-scope-note')}</p>
				</div>
			</div>

			{/* Install — apt-ensure dnsmasq + avahi-daemon (idempotent prerequisite). */}
			<div className='space-y-2 border-t border-border-default pt-3'>
				<label className='text-caption font-medium text-text-secondary'>{t('lan-dns.install-heading')}</label>
				<div className='flex flex-wrap items-center gap-2'>
					<Button size='sm' variant='default' onClick={() => installMut.mutate()} disabled={busy}>
						{installMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
						{t('lan-dns.install')}
					</Button>
				</div>
				{installMut.data && installMut.data.ok === false ? (
					<p role='alert' className='text-caption text-red-400'>
						{installMut.data.reason}
					</p>
				) : null}
			</div>

			{/* dnsmasq split-horizon enable — hostIp entered, domain PRE-FILLED (WARN-1). */}
			<div className='space-y-2 border-t border-border-default pt-3'>
				<label className='text-caption font-medium text-text-secondary'>{t('lan-dns.dnsmasq-heading')}</label>
				<div className='flex flex-wrap items-end gap-2'>
					<div className='flex flex-col gap-1'>
						<span className='text-caption-sm text-text-tertiary'>{t('lan-dns.hostip-label')}</span>
						<Input
							value={hostIp}
							onChange={(e) => setHostIp(e.target.value)}
							placeholder={t('lan-dns.hostip-placeholder')}
							disabled={busy}
							className='w-44'
						/>
					</div>
					<div className='flex flex-col gap-1'>
						<span className='text-caption-sm text-text-tertiary'>{t('lan-dns.domain-label')}</span>
						{/* Read-only — the box's configured domain, never free-typed (WARN-1). */}
						<Input value={mainDomain ?? ''} placeholder={t('lan-dns.domain-placeholder')} disabled readOnly className='w-56' />
					</div>
				</div>
				{!mainDomain ? <p className='text-caption text-text-tertiary'>{t('lan-dns.no-domain-note')}</p> : null}
				<div className='flex flex-wrap items-center gap-2'>
					<Button
						size='sm'
						variant='default'
						onClick={() => mainDomain && enableMut.mutate({hostIp, domain: mainDomain})}
						disabled={busy || !enableValid}
					>
						{enableMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
						{t('lan-dns.enable')}
					</Button>
					<Button size='sm' variant='default' onClick={() => disableMut.mutate()} disabled={busy}>
						{disableMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
						{t('lan-dns.disable')}
					</Button>
				</div>
				{enableMut.data && enableMut.data.ok === false ? (
					<div className='flex items-start gap-2'>
						<TbAlertTriangle className='mt-0.5 h-4 w-4 text-red-400' />
						<p role='alert' className='text-caption text-red-400'>
							{enableMut.data.reason}
						</p>
					</div>
				) : null}
			</div>

			{/* mDNS (avahi) box-discovery — .local finds the box only, not app vhosts. */}
			<div className='space-y-2 border-t border-border-default pt-3'>
				<label className='text-caption font-medium text-text-secondary'>{t('lan-dns.mdns-heading')}</label>
				<div className='flex flex-wrap items-center gap-2'>
					<Button size='sm' variant='default' onClick={() => mdnsEnableMut.mutate()} disabled={busy}>
						{mdnsEnableMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
						{t('lan-dns.mdns-enable')}
					</Button>
					<Button size='sm' variant='default' onClick={() => mdnsDisableMut.mutate()} disabled={busy}>
						{mdnsDisableMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
						{t('lan-dns.mdns-disable')}
					</Button>
				</div>
			</div>

			{/* Status panel — the wrapper's own authoritative probe output. */}
			<div className='space-y-2 border-t border-border-default pt-3'>
				<span className='text-caption font-medium text-text-secondary'>{t('lan-dns.status-heading')}</span>
				{status && status.ok ? (
					<pre className='max-h-64 overflow-auto whitespace-pre-wrap rounded-radius-sm bg-surface-base p-2 text-caption text-text-tertiary'>
						{status.stdout}
					</pre>
				) : (
					<p className='text-caption text-text-tertiary'>{t('lan-dns.unavailable')}</p>
				)}
			</div>
		</div>
	)
}
