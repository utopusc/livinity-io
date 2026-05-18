// livos/packages/ui/src/features/local-setup/PortalDnsSetup.tsx
// Phase 104 plan 104-05 — portal step 2: provision subdomain via Server5 +
// walk through Cloudflare TXT challenge (informational; ACME handles the actual write).
// Phase 143-02 — renamed from `HybridDnsSetup.tsx` (Phase 142-02 portal rename
// carry-through). Calls the new `local.provisionPortal` procedure (Phase 143-01).
//
// Phase 104 review fix WIZ-01 + PROVIDE-01: the tRPC mutation runs server-side
// (provisionHybridSubdomain helper) so the CF token stays on the LivOS host
// instead of being typed/pasted into prompt() dialogs.
import {useState} from 'react'
import {IconArrowLeft, IconExternalLink, IconLoader2} from '@tabler/icons-react'

import {trpcReact} from '@/trpc/trpc'

export interface PortalDnsSetupProps {
	cfToken: string
	hostIp: string
	onProvisioned: (subdomain: string, zoneId: string) => void
	onBack: () => void
}

export function PortalDnsSetup({cfToken, hostIp, onProvisioned, onBack}: PortalDnsSetupProps) {
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
		try {
			const result = await provisionM.mutateAsync({hostIp, cloudflareApiToken: cfToken})
			onProvisioned(result.subdomain, result.zoneId)
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : String(e)
			setError(message)
		}
	}

	return (
		<div className='space-y-4' data-testid='portal-dns-setup'>
			<h3 className='text-lg font-semibold'>Provision portal subdomain</h3>
			<p className='text-text-secondary'>
				LivOS will mint a random subdomain under <code>home.livinity.io</code> via Server5 (one-time control-plane
				API call). Public DNS A-record will point at <code>{hostIp}</code>.
			</p>
			<div className='rounded bg-accent-blue/10 p-3 text-sm text-accent-blue'>
				<strong>Zero data-plane Server5 traffic:</strong> after provisioning, Cloudflare DNS resolves the subdomain
				to your LAN IP. All HTTPS traffic stays LAN-direct.
			</div>
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
					disabled={busy || !cfToken}
					className='rounded bg-accent px-4 py-2 text-white disabled:opacity-50'
				>
					{busy && <IconLoader2 className='inline animate-spin' />} Provision subdomain
				</button>
			</div>
		</div>
	)
}
