// Phase 332 (WAF-01/02) — per-app "Protection" section for the app settings dialog.
//
// Clone of gpu-access-section.tsx: admin-gated controls bound to
// apps.setAppProtection / apps.getAppProtection. Three stock-Caddy controls:
//   - abuse-ban toggle (WAF-01 fail2ban leg)
//   - IP/CIDR ban list (WAF-02, textarea — one entry per line)
//   - User-Agent block list (WAF-02, textarea — literal substrings)
// A non-admin sees the section (so it still explains protection) but the mutating
// controls are disabled. All copy via t('app-protection.*') against en/tr.json.
import {useEffect, useState} from 'react'
import {TbShieldLock, TbInfoCircle, TbLoader2} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Switch} from '@/shadcn-components/ui/switch'
import {useCurrentUser} from '@/hooks/use-current-user'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

interface AppProtectionSectionProps {
	appId: string
	appName: string
}

// Split a textarea value into trimmed, non-empty lines.
function toLines(value: string): string[] {
	return value
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0)
}

export function AppProtectionSection({appId, appName}: AppProtectionSectionProps) {
	const utils = trpcReact.useUtils()
	const {isAdmin} = useCurrentUser()

	const protectionQuery = trpcReact.apps.getAppProtection.useQuery({appId})
	const [abuseBan, setAbuseBan] = useState(false)
	const [banIpsText, setBanIpsText] = useState('')
	const [banUasText, setBanUasText] = useState('')

	// Seed the local editors once the persisted config loads.
	useEffect(() => {
		const cfg = protectionQuery.data
		if (cfg) {
			setAbuseBan(!!cfg.abuseBan)
			setBanIpsText((cfg.banIps ?? []).join('\n'))
			setBanUasText((cfg.banUserAgents ?? []).join('\n'))
		}
	}, [protectionQuery.data])

	const setProtectionMut = trpcReact.apps.setAppProtection.useMutation({
		onSuccess: () => {
			utils.apps.getAppProtection.invalidate({appId})
		},
	})

	const handleSave = () => {
		setProtectionMut.mutate({
			appId,
			banIps: toLines(banIpsText),
			banUserAgents: toLines(banUasText),
			abuseBan,
		})
	}

	const handleToggleAbuse = (next: boolean) => {
		setAbuseBan(next)
		// The toggle persists immediately with the current lists (mirrors gpu-access).
		setProtectionMut.mutate({
			appId,
			banIps: toLines(banIpsText),
			banUserAgents: toLines(banUasText),
			abuseBan: next,
		})
	}

	return (
		<div className='space-y-4'>
			<div className='flex items-center gap-2'>
				<TbShieldLock className='h-5 w-5 text-text-primary' />
				<span className='text-body-sm font-medium text-text-primary'>{t('app-protection.title')}</span>
			</div>

			<p className='text-caption text-text-tertiary'>{t('app-protection.description', {app: appName})}</p>

			{!isAdmin ? <p className='text-caption text-text-tertiary'>{t('app-protection.admin-only')}</p> : null}

			{/* WAF-01 — abuse-ban toggle (fail2ban jail leg). */}
			<div className='flex items-center justify-between'>
				<div className='flex items-center gap-3'>
					<Switch checked={abuseBan} onCheckedChange={handleToggleAbuse} disabled={setProtectionMut.isPending || !isAdmin} />
					<p className='text-caption text-text-tertiary'>{t('app-protection.abuse-ban-label')}</p>
				</div>
				{setProtectionMut.isPending ? <TbLoader2 className='h-4 w-4 animate-spin text-text-secondary' /> : null}
			</div>

			{/* WAF-02 — IP/CIDR ban list. */}
			<div className='space-y-1'>
				<label className='text-caption text-text-secondary'>{t('app-protection.ban-ips-label')}</label>
				<textarea
					className='block w-full rounded-radius-sm border border-border-default bg-surface-base px-3 py-2 text-caption text-text-primary disabled:opacity-50'
					value={banIpsText}
					onChange={(e) => setBanIpsText(e.target.value)}
					disabled={!isAdmin}
					rows={3}
					placeholder={'1.2.3.4\n10.0.0.0/8'}
				/>
				<p className='text-caption text-text-tertiary'>{t('app-protection.ban-ips-help')}</p>
			</div>

			{/* WAF-02 — User-Agent block list. */}
			<div className='space-y-1'>
				<label className='text-caption text-text-secondary'>{t('app-protection.ban-uas-label')}</label>
				<textarea
					className='block w-full rounded-radius-sm border border-border-default bg-surface-base px-3 py-2 text-caption text-text-primary disabled:opacity-50'
					value={banUasText}
					onChange={(e) => setBanUasText(e.target.value)}
					disabled={!isAdmin}
					rows={3}
					placeholder={'GPTBot\nAhrefsBot'}
				/>
				<p className='text-caption text-text-tertiary'>{t('app-protection.ban-uas-help')}</p>
			</div>

			<div className='flex items-center gap-3'>
				<Button size='sm' variant='default' onClick={handleSave} disabled={!isAdmin || setProtectionMut.isPending}>
					{setProtectionMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
					{t('app-protection.save')}
				</Button>
				{setProtectionMut.isSuccess && !setProtectionMut.isPending ? (
					<span className='text-caption text-green-400'>{t('app-protection.saved')}</span>
				) : null}
			</div>

			{/* Honest note: rate-abuse bans bite LAN-direct/portal traffic; CF-fronted
			    traffic is filtered at the edge (Pro). */}
			<div className='rounded-radius-sm border border-border-default bg-surface-base p-4'>
				<div className='flex items-start gap-3'>
					<TbInfoCircle className='mt-0.5 h-5 w-5 text-yellow-400' />
					<p className='text-caption text-text-secondary'>{t('app-protection.scope-note')}</p>
				</div>
			</div>

			{setProtectionMut.isError ? (
				<p role='alert' className='text-caption text-red-400'>
					{setProtectionMut.error?.message ?? t('app-protection.error')}
				</p>
			) : null}
		</div>
	)
}
