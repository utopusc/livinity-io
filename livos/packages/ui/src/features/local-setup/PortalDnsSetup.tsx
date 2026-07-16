// livos/packages/ui/src/features/local-setup/PortalDnsSetup.tsx
// Phase 104 plan 104-05 — portal step 2: provision the portal DNS record.
// Phase 143-02 — renamed from `HybridDnsSetup.tsx` (Phase 142-02 portal rename
// carry-through). Calls the new `local.provisionPortal` procedure (Phase 143-01).
// Phase 331-01 (FIX-01) — the 325-03 BYO own-CF-zone backend requires FOUR
// fields (`provisionPortalSchema`: hostIp, cloudflareApiToken, zoneId,
// portalDomain); the mutate payload now sends all four (it previously sent two,
// so every real call failed zod). Copy updated from the retired Server5-mint
// flow to the BYO own-zone flow.
//
// Phase 104 review fix WIZ-01 + PROVIDE-01: the tRPC mutation runs server-side
// so the CF token stays on the LivOS host instead of being typed/pasted into
// prompt() dialogs.
import {useState} from 'react'
import {IconArrowLeft, IconExternalLink, IconLoader2} from '@tabler/icons-react'

import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

export interface PortalDnsSetupProps {
	cfToken: string
	hostIp: string
	zoneId: string
	portalDomain: string
	onProvisioned: (subdomain: string, zoneId: string) => void
	onBack: () => void
}

export function PortalDnsSetup({cfToken, hostIp, zoneId, portalDomain, onProvisioned, onBack}: PortalDnsSetupProps) {
	const [error, setError] = useState<string | null>(null)
	const provisionM = trpcReact.local.provisionPortal.useMutation()
	const busy = provisionM.isPending

	const handleProvision = async () => {
		setError(null)
		if (!cfToken) {
			setError('Cloudflare API token required.')
			return
		}
		if (!hostIp) {
			setError('Host IP required.')
			return
		}
		if (!zoneId) {
			setError('Cloudflare zone ID required.')
			return
		}
		if (!portalDomain) {
			setError('Portal domain required.')
			return
		}
		try {
			const result = await provisionM.mutateAsync({hostIp, cloudflareApiToken: cfToken, zoneId, portalDomain})
			onProvisioned(result.subdomain, result.zoneId)
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : String(e)
			setError(message)
		}
	}

	return (
		<div className='space-y-4' data-testid='portal-dns-setup'>
			<h3 className='text-lg font-semibold'>{t('portal.byo.title')}</h3>
			<p className='text-text-secondary'>{t('portal.byo.description')}</p>
			<p className='text-text-secondary'>
				Portal domain: <code>{portalDomain || '—'}</code> → A-record at <code>{hostIp}</code> (zone{' '}
				<code>{zoneId || '—'}</code>).
			</p>
			<div className='rounded bg-accent-blue/10 p-3 text-sm text-accent-blue'>
				<strong>Zero data-plane Server5 traffic:</strong> Cloudflare DNS resolves your portal domain to your LAN
				IP. All HTTPS traffic stays LAN-direct.
			</div>
			<p className='text-sm text-text-secondary'>{t('portal.byo.certNote')}</p>
			<p className='text-sm text-text-secondary'>
				Token presence: {cfToken ? '✓ provided' : '✗ NOT provided (provision will fail)'}
			</p>
			<a
				href='https://dash.cloudflare.com/profile/api-tokens'
				target='_blank'
				rel='noopener noreferrer'
				className='inline-flex items-center gap-1 text-accent underline'
			>
				Get Cloudflare API token <IconExternalLink className='h-3 w-3' />
			</a>
			{error && (
				<div className='text-accent-red' role='alert'>
					{error}
				</div>
			)}
			<div className='flex justify-between pt-4'>
				<button onClick={onBack} className='px-4 py-2'>
					<IconArrowLeft className='inline' /> Back
				</button>
				<button
					onClick={handleProvision}
					disabled={busy || !cfToken || !zoneId || !portalDomain}
					className='rounded bg-accent px-4 py-2 text-white disabled:opacity-50'
				>
					{busy && <IconLoader2 className='inline animate-spin' />} {t('portal.byo.submit')}
				</button>
			</div>
		</div>
	)
}
