import {useState} from 'react'
import {TbNetwork, TbLoader2, TbAlertTriangle, TbShieldCheck} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {useCurrentUser} from '@/hooks/use-current-user'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

/**
 * Phase 325-08 (NET-01) — host networking (hostname / static IP / DNS) managed
 * from Settings → Network. Clone of `os-patching-section.tsx`.
 *
 * Wraps the FLAT `system.network*` routes (325-08 Task 1), which reach the host
 * networking stack ONLY through `sudo -n livos-network.sh <action>` (325-06) —
 * livinityd never runs netplan/hostnamectl directly. Every mutation is
 * z.regex constrained server-side; the UI carries no trust.
 *
 * WSL2 HARD-HIDE (D-09b): when `networkStatus.isWsl2` is true the entire
 * static-IP + DNS + hostname card is hidden and replaced by a short note —
 * a `netplan apply` under WSL2 would break the Windows-owned NAT networking,
 * and the hostname there comes from the Windows host / /etc/wsl.conf. The
 * wrapper is NEVER invoked under WSL2.
 *
 * T-325-24: `network*` are all `adminProcedure`. A non-admin sees the header +
 * a note but never a host-mutating control. `runNetwork` never throws, so a box
 * where the wrapper is not yet deployed degrades to `{ok:false}` — the card
 * renders an "unavailable" note instead of 500-ing the whole Settings page.
 * All copy flows through `t('network.*')`.
 *
 * LOCKOUT-SAFE static IP (D-09): applying a static IP arms a fail-closed 90s
 * revert watchdog on the box. The admin MUST reconnect over the NEW address and
 * press Confirm within 90s or the box reverts to the previous config on its own.
 * Confirm is the POSITIVE action → the default outcome is revert.
 */
export function NetworkSection() {
	// T-325-24 — host-mutating controls render for admins only.
	const {isAdmin} = useCurrentUser()

	// WR-02 — while the box's fail-closed revert watchdog is armed, poll status so the
	// persistent Confirm banner (derived from the authoritative `revert-timer: active`
	// signal below) stays honest: it clears itself once confirmed or after auto-revert.
	const statusQ = trpcReact.system.networkStatus.useQuery(undefined, {
		refetchInterval: (query) => {
			const s = query.state.data?.status
			return s && s.ok && /revert-timer:\s*active/.test(s.stdout) ? 5000 : false
		},
	})
	const refetchStatus = () => void statusQ.refetch()
	const setHostnameMut = trpcReact.system.networkSetHostname.useMutation({onSuccess: refetchStatus})
	const applyIpMut = trpcReact.system.networkApplyIp.useMutation({onSuccess: refetchStatus})
	const confirmMut = trpcReact.system.networkConfirm.useMutation({onSuccess: refetchStatus})
	const setDnsMut = trpcReact.system.networkSetDns.useMutation({onSuccess: refetchStatus})

	// Local form state.
	const [hostname, setHostname] = useState('')
	const [address, setAddress] = useState('')
	const [gateway, setGateway] = useState('')
	const [dns, setDns] = useState('')

	const busy =
		setHostnameMut.isPending ||
		applyIpMut.isPending ||
		confirmMut.isPending ||
		setDnsMut.isPending

	const status = statusQ.data?.status
	const isWsl2 = statusQ.data?.isWsl2 === true

	// Client-side guards mirror the server-side z.regex so a malformed field never
	// fires a mutation that would round-trip only to 400.
	const hostnameValid = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(hostname)
	const ipv4 = /^((25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])$/
	const addressValid = /^((25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])\/([0-9]|[12][0-9]|3[0-2])$/.test(
		address,
	)
	const gatewayValid = ipv4.test(gateway)
	const dnsServers = dns
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
	const dnsValid = dnsServers.length > 0 && dnsServers.every((s) => ipv4.test(s))

	const header = (
		<div className='flex items-center gap-2'>
			<TbNetwork className='h-5 w-5 text-text-primary' />
			<div>
				<span className='text-body-sm font-medium text-text-primary'>{t('network.title')}</span>
				<p className='text-caption text-text-tertiary'>{t('network.description')}</p>
			</div>
		</div>
	)

	// T-325-24 — no host-mutating controls for non-admins; show header + a note.
	if (!isAdmin) {
		return (
			<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-4'>
				{header}
				<p className='text-caption text-text-tertiary'>{t('network.admin-only')}</p>
			</div>
		)
	}

	// D-09b — WSL2 HARD-HIDE: the entire static-IP/DNS/hostname card is hidden;
	// the box's netplan/hostnamectl stack is not the network owner under WSL2.
	if (isWsl2) {
		return (
			<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-4'>
				{header}
				<p className='text-caption text-text-tertiary'>{t('network.wsl2-note')}</p>
			</div>
		)
	}

	// runNetwork never throws → not-ok = wrapper not deployed; degrade to a note.
	if (status && status.ok === false) {
		return (
			<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-4'>
				{header}
				<p className='text-caption text-text-tertiary'>{t('network.unavailable')}</p>
			</div>
		)
	}

	const applyFailure = applyIpMut.data && applyIpMut.data.ok === false ? applyIpMut.data.reason : null
	const applied = applyIpMut.data?.ok === true

	// WR-02 — derive the Confirm affordance from the AUTHORITATIVE wrapper status
	// (`revert-timer: active` in `status` stdout), NOT the transient apply mutation.
	// Applying a static IP over LAN/portal access drops the admin's connection to the
	// OLD address; they must reconnect over the NEW address — a fresh page load where
	// `applyIpMut.data` is gone. Reading the armed-timer signal from status means the
	// Confirm control survives that reconnect, so a good config can actually be kept.
	const revertArmed = status && status.ok ? /revert-timer:\s*active/.test(status.stdout) : false
	const showConfirm = applied || revertArmed

	return (
		<div className='space-y-4 rounded-radius-sm border border-border-default bg-surface-base p-4'>
			{header}

			{/* Hostname → set-hostname wrapper action. */}
			<div className='space-y-2'>
				<label className='text-caption font-medium text-text-secondary'>{t('network.hostname')}</label>
				<div className='flex flex-wrap items-center gap-2'>
					<Input
						value={hostname}
						onChange={(e) => setHostname(e.target.value)}
						placeholder={t('network.hostname-placeholder')}
						disabled={busy}
						className='w-56'
					/>
					<Button
						size='sm'
						variant='default'
						onClick={() => setHostnameMut.mutate({hostname})}
						disabled={busy || !hostnameValid}
					>
						{setHostnameMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
						{t('network.set-hostname')}
					</Button>
				</div>
			</div>

			{/* Static IP → apply-ip wrapper action + the 90s fail-closed confirm UX. */}
			<div className='space-y-2 border-t border-border-default pt-3'>
				<label className='text-caption font-medium text-text-secondary'>{t('network.static-ip')}</label>
				<div className='flex flex-wrap items-center gap-2'>
					<Input
						value={address}
						onChange={(e) => setAddress(e.target.value)}
						placeholder={t('network.address-placeholder')}
						disabled={busy}
						className='w-48'
					/>
					<Input
						value={gateway}
						onChange={(e) => setGateway(e.target.value)}
						placeholder={t('network.gateway-placeholder')}
						disabled={busy}
						className='w-44'
					/>
					<Button
						size='sm'
						variant='default'
						onClick={() => applyIpMut.mutate({address, gateway})}
						disabled={busy || !addressValid || !gatewayValid}
					>
						{applyIpMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
						{t('network.apply-ip')}
					</Button>
				</div>

				{/* Fail-closed 90s confirm banner — shown whenever the box's revert
				    watchdog is armed (WR-02: derived from the authoritative status, so it
				    survives the reconnect over the NEW address). The admin must reconnect
				    and confirm or the box reverts on its own. */}
				{showConfirm ? (
					<div className='space-y-2 rounded-radius-sm border border-amber-500/40 bg-amber-500/10 p-3'>
						<div className='flex items-start gap-2'>
							<TbAlertTriangle className='mt-0.5 h-4 w-4 text-amber-400' />
							<p role='alert' className='text-caption text-amber-300'>
								{t('network.confirm-banner')}
							</p>
						</div>
						<Button
							size='sm'
							variant='default'
							onClick={() => confirmMut.mutate()}
							disabled={confirmMut.isPending}
						>
							{confirmMut.isPending ? (
								<TbLoader2 className='mr-1 h-4 w-4 animate-spin' />
							) : (
								<TbShieldCheck className='mr-1 h-4 w-4' />
							)}
							{t('network.confirm')}
						</Button>
					</div>
				) : null}

				{applyFailure ? (
					<div className='flex items-start gap-2'>
						<TbAlertTriangle className='mt-0.5 h-4 w-4 text-red-400' />
						<p role='alert' className='text-caption text-red-400'>
							{applyFailure}
						</p>
					</div>
				) : null}
			</div>

			{/* DNS servers → set-dns wrapper action (no watchdog — resolver-only). */}
			<div className='space-y-2 border-t border-border-default pt-3'>
				<label className='text-caption font-medium text-text-secondary'>{t('network.dns')}</label>
				<div className='flex flex-wrap items-center gap-2'>
					<Input
						value={dns}
						onChange={(e) => setDns(e.target.value)}
						placeholder={t('network.dns-placeholder')}
						disabled={busy}
						className='w-64'
					/>
					<Button
						size='sm'
						variant='default'
						onClick={() => setDnsMut.mutate({servers: dnsServers})}
						disabled={busy || !dnsValid}
					>
						{setDnsMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
						{t('network.set-dns')}
					</Button>
				</div>
			</div>

			{/* Status panel — the wrapper's own authoritative probe output. */}
			<div className='space-y-2 border-t border-border-default pt-3'>
				<span className='text-caption font-medium text-text-secondary'>{t('network.status-heading')}</span>
				{status && status.ok ? (
					<pre className='max-h-64 overflow-auto whitespace-pre-wrap rounded-radius-sm bg-surface-base p-2 text-caption text-text-tertiary'>
						{status.stdout}
					</pre>
				) : (
					<p className='text-caption text-text-tertiary'>{t('network.unavailable')}</p>
				)}
			</div>
		</div>
	)
}
