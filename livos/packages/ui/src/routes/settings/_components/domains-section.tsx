import {Loader2} from 'lucide-react'
import {TbCheck, TbExternalLink} from 'react-icons/tb'

import {FieldCard, FieldRow} from '@/components/field-card'
import {SettingsPageHeader} from '@/components/settings-page-header'
import {trpcReact} from '@/trpc/trpc'

/**
 * Phase 302 R3 — Settings → Domains.
 *
 * A dedicated, app-independent place to see your subdomains + the per-user DNS
 * counter (operator: "DNS limitini nerede göreceğim?"). The per-app "Public
 * Access" card hides its counter behind a "Domain Required" gate; this page does
 * NOT — it lists straight from domain.listMySubdomains (admin/operator → ALL
 * subdomains on the box; members → only their own) and reads the quota from
 * domain.getSubdomainQuota. Read-only: subdomains are still created/changed from
 * an app's page (App Store → app → Public Access).
 */
export function DomainsSection() {
	const listQ = trpcReact.domain.listMySubdomains.useQuery()
	const quotaQ = trpcReact.domain.getSubdomainQuota.useQuery()

	const items = listQ.data?.items ?? []
	const mainDomain = listQ.data?.mainDomain ?? null
	const quota = quotaQ.data
	const loading = listQ.isLoading || quotaQ.isLoading

	const fqdn = (it: {subdomain: string; host: string | null}) =>
		it.host ?? (mainDomain ? `${it.subdomain}.${mainDomain}` : it.subdomain)

	// Members see "X / 5 DNS used" (enforced); admins/operators are exempt → show
	// the total count + a note that members are limited.
	const overCap = !!quota && quota.enforced && quota.used >= quota.limit
	const usageLabel = !quota
		? ''
		: quota.enforced
			? `${quota.used} / ${quota.limit} DNS used`
			: `${items.length} subdomain${items.length === 1 ? '' : 's'} on this device`

	return (
		<div className='flex flex-col gap-8'>
			<SettingsPageHeader
				eyebrow='Domains'
				title='Your'
				titleAccent='subdomains.'
				sub={
					quota?.enforced
						? `Each app you publish gets a subdomain (e.g. app.${mainDomain ?? 'your-domain'}). You can have up to ${quota.limit}.`
						: `Every public subdomain on this device. Members are limited to ${quota?.limit ?? 5} each — you (admin) are exempt.`
				}
			/>

			<FieldCard>
				<FieldRow
					label='DNS usage'
					value={
						loading ? (
							<span className='inline-flex items-center gap-2 text-[color:var(--fg-faint)]'>
								<Loader2 className='h-3.5 w-3.5 animate-spin' /> Loading…
							</span>
						) : (
							<span className={overCap ? 'text-yellow-400' : undefined}>{usageLabel}</span>
						)
					}
				/>
			</FieldCard>

			<FieldCard>
				{loading ? (
					<FieldRow
						label=''
						value={
							<span className='inline-flex items-center gap-2 text-[color:var(--fg-faint)]'>
								<Loader2 className='h-3.5 w-3.5 animate-spin' /> Loading…
							</span>
						}
					/>
				) : items.length === 0 ? (
					<FieldRow
						label='No subdomains'
						value={
							<span className='text-[color:var(--fg-mute)]'>
								Open an app in the App Store and use its <strong>Public Access</strong> section to publish it under a
								subdomain.
							</span>
						}
					/>
				) : (
					items.map((it) => (
						<FieldRow
							key={it.appId}
							label={it.subdomain}
							value={
								it.enabled && mainDomain ? (
									<a
										href={`https://${fqdn(it)}`}
										target='_blank'
										rel='noopener noreferrer'
										className='inline-flex items-center gap-1 font-mono text-[color:var(--fg)] hover:underline'
									>
										{fqdn(it)}
										<TbExternalLink className='h-3.5 w-3.5 shrink-0' />
									</a>
								) : (
									<span className='font-mono text-[color:var(--fg-mute)]'>{fqdn(it)}</span>
								)
							}
							trailing={
								it.enabled ? (
									<span className='inline-flex items-center gap-1 text-xs text-green-400'>
										<TbCheck className='h-3.5 w-3.5' /> Active
									</span>
								) : (
									<span className='text-xs text-[color:var(--fg-faint)]'>Disabled</span>
								)
							}
						/>
					))
				)}
			</FieldCard>
		</div>
	)
}
