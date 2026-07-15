import {useState} from 'react'
import {TbRouter, TbLoader2, TbAlertTriangle, TbPlus, TbTrash} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/shadcn-components/ui/select'
import {useCurrentUser} from '@/hooks/use-current-user'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

/**
 * Phase 329-10 (NET-04) — managed raw TCP/UDP openings from Settings → Ports.
 * Clone of `network-section.tsx` (same admin-gate + WSL2 hard-hide + never-throw
 * degrade shape). Wraps the 329-06 `netExpose*` adminProcedures, which reach the
 * host DOCKER-USER firewall chain ONLY through `sudo -n livos-net-expose.sh`
 * (329-02) — livinityd never edits iptables directly; every positional value is
 * zod-constrained server-side (proto enum / port 1-65535 / strict IPv4 CIDR).
 *
 * WSL2 HARD-HIDE (D-11): when `netExposeStatus.isWsl2` is true the ENTIRE card is
 * hidden — a raw-port opening is meaningless under WSL2's Windows-owned NAT, so
 * the wrapper is never invoked there (exactly like the network card, D-11/D-20).
 *
 * TWO MANDATORY HONESTY NOTES (D-10) so the card never gives a false sense of
 * exposure/security: (a) the router must still forward the port (NAT) — a
 * separate step outside LivOS; (b) these openings live in the DOCKER-USER chain
 * and do NOT appear in `ufw status`. All copy flows through `t('net-expose.*')`.
 */
export function NetExposeSection() {
	const {isAdmin} = useCurrentUser()

	const statusQ = trpcReact.system.netExposeStatus.useQuery()
	const listQ = trpcReact.system.netExposeList.useQuery()
	const refetch = () => {
		void statusQ.refetch()
		void listQ.refetch()
	}
	const openMut = trpcReact.system.netExposeOpen.useMutation({onSuccess: refetch})
	const closeMut = trpcReact.system.netExposeClose.useMutation({onSuccess: refetch})

	// Add-opening form state.
	const [proto, setProto] = useState<'tcp' | 'udp'>('tcp')
	const [port, setPort] = useState('')
	const [cidr, setCidr] = useState('')

	const busy = openMut.isPending || closeMut.isPending

	const status = statusQ.data?.status
	const isWsl2 = statusQ.data?.isWsl2 === true

	// Client-side guards mirror the server-side zod so a malformed field never
	// fires a mutation that would only round-trip to 400.
	const portNum = Number(port)
	const portValid = Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535
	const cidrPattern =
		/^((25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])\/([0-9]|[12][0-9]|3[0-2])$/
	const cidrTrimmed = cidr.trim()
	const cidrValid = cidrTrimmed === '' || cidrPattern.test(cidrTrimmed)

	const header = (
		<div className='flex items-center gap-2'>
			<TbRouter className='h-5 w-5 text-text-primary' />
			<div>
				<span className='text-body-sm font-medium text-text-primary'>{t('net-expose.title')}</span>
				<p className='text-caption text-text-tertiary'>{t('net-expose.description')}</p>
			</div>
		</div>
	)

	// Host-mutating controls render for admins only.
	if (!isAdmin) {
		return (
			<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-4'>
				{header}
				<p className='text-caption text-text-tertiary'>{t('net-expose.admin-only')}</p>
			</div>
		)
	}

	// D-11 — WSL2 HARD-HIDE: the entire card is hidden; a raw-port opening is
	// meaningless under WSL2's Windows-owned NAT.
	if (isWsl2) {
		return (
			<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-4'>
				{header}
				<p className='text-caption text-text-tertiary'>{t('net-expose.wsl2-note')}</p>
			</div>
		)
	}

	// runNetExpose never throws → not-ok = wrapper not deployed; degrade to a note.
	if (status && status.ok === false) {
		return (
			<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-4'>
				{header}
				<p className='text-caption text-text-tertiary'>{t('net-expose.unavailable')}</p>
			</div>
		)
	}

	const submit = () => {
		if (!portValid || !cidrValid) return
		openMut.mutate({
			proto,
			port: portNum,
			...(cidrTrimmed ? {src: cidrTrimmed} : {}),
		})
	}

	const openFailure = openMut.data && openMut.data.ok === false ? openMut.data.reason : null
	const listOk = listQ.data && listQ.data.ok === true

	return (
		<div className='space-y-4 rounded-radius-sm border border-border-default bg-surface-base p-4'>
			{header}

			{/* Two mandatory honesty notes (D-10). */}
			<div className='space-y-2'>
				<div className='flex items-start gap-2 rounded-radius-sm border border-amber-500/40 bg-amber-500/10 p-3'>
					<TbAlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-amber-400' />
					<p className='text-caption text-amber-300'>{t('net-expose.note-nat')}</p>
				</div>
				<div className='flex items-start gap-2 rounded-radius-sm border border-border-default bg-surface-1 p-3'>
					<TbAlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-text-tertiary' />
					<p className='text-caption text-text-tertiary'>{t('net-expose.note-ufw')}</p>
				</div>
			</div>

			{/* Add opening form. */}
			<div className='space-y-2 border-t border-border-default pt-3'>
				<label className='text-caption font-medium text-text-secondary'>{t('net-expose.add-heading')}</label>
				<div className='flex flex-wrap items-center gap-2'>
					<Select value={proto} onValueChange={(v) => setProto(v as 'tcp' | 'udp')} disabled={busy}>
						<SelectTrigger className='w-24'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='tcp'>TCP</SelectItem>
							<SelectItem value='udp'>UDP</SelectItem>
						</SelectContent>
					</Select>
					<Input
						value={port}
						onChange={(e) => setPort(e.target.value)}
						placeholder={t('net-expose.port-placeholder')}
						disabled={busy}
						inputMode='numeric'
						className='w-28'
					/>
					<Input
						value={cidr}
						onChange={(e) => setCidr(e.target.value)}
						placeholder={t('net-expose.cidr-placeholder')}
						disabled={busy}
						className='w-48'
					/>
					<Button size='sm' variant='default' onClick={submit} disabled={busy || !portValid || !cidrValid}>
						{openMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : <TbPlus className='mr-1 h-4 w-4' />}
						{t('net-expose.open')}
					</Button>
				</div>
				<p className='text-caption-sm text-text-tertiary'>{t('net-expose.cidr-hint')}</p>

				{openFailure ? (
					<div className='flex items-start gap-2'>
						<TbAlertTriangle className='mt-0.5 h-4 w-4 text-red-400' />
						<p role='alert' className='text-caption text-red-400'>
							{openFailure}
						</p>
					</div>
				) : null}
			</div>

			{/* Close an opening — same fields as the add form (routes take proto+port+src). */}
			<div className='space-y-2 border-t border-border-default pt-3'>
				<label className='text-caption font-medium text-text-secondary'>{t('net-expose.close-heading')}</label>
				<p className='text-caption-sm text-text-tertiary'>{t('net-expose.close-hint')}</p>
				<Button
					size='sm'
					variant='destructive'
					onClick={() => {
						if (!portValid || !cidrValid) return
						closeMut.mutate({proto, port: portNum, ...(cidrTrimmed ? {src: cidrTrimmed} : {})})
					}}
					disabled={busy || !portValid || !cidrValid}
				>
					{closeMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : <TbTrash className='mr-1 h-4 w-4' />}
					{t('net-expose.close')}
				</Button>
			</div>

			{/* Current openings — the wrapper's own authoritative list output. */}
			<div className='space-y-2 border-t border-border-default pt-3'>
				<span className='text-caption font-medium text-text-secondary'>{t('net-expose.current-heading')}</span>
				{listOk ? (
					<pre className='max-h-64 overflow-auto whitespace-pre-wrap rounded-radius-sm bg-surface-base p-2 text-caption text-text-tertiary'>
						{listQ.data && listQ.data.ok ? listQ.data.stdout : ''}
					</pre>
				) : (
					<p className='text-caption text-text-tertiary'>{t('net-expose.unavailable')}</p>
				)}
			</div>
		</div>
	)
}
