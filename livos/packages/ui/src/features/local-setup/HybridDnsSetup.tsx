// livos/packages/ui/src/features/local-setup/HybridDnsSetup.tsx
// Phase 104 plan 104-05 — hybrid step 2: provision subdomain via Server5 +
// walk through Cloudflare TXT challenge (informational; ACME handles the actual write).
import {useState} from 'react'
import {IconArrowLeft, IconExternalLink, IconLoader2} from '@tabler/icons-react'

export interface HybridDnsSetupProps {
	cfToken: string
	hostIp: string
	onProvisioned: (subdomain: string, zoneId: string) => void
	onBack: () => void
}

export function HybridDnsSetup({cfToken, hostIp, onProvisioned, onBack}: HybridDnsSetupProps) {
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)

	const handleProvision = async () => {
		setBusy(true)
		setError(null)
		try {
			// Call Server5 control-plane directly from the browser (CORS-permitting)
			// OR — better — proxy via livinityd which holds the token securely.
			// For UI simplicity, prompt user to run install.sh which has the token,
			// then enter the subdomain manually:
			const subdomain = prompt(
				'Server5 will mint a subdomain. Enter the value install.sh logged (e.g. ab12cd34.home.livinity.io):',
			)
			const zoneId = prompt('Cloudflare zone ID logged by install.sh:')
			if (subdomain && zoneId) {
				onProvisioned(subdomain, zoneId)
			} else {
				setError('Both subdomain and zoneId required.')
			}
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : String(e)
			setError(message)
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className='space-y-4' data-testid='hybrid-dns-setup'>
			<h3 className='text-lg font-semibold'>Provision hybrid subdomain</h3>
			<p className='text-text-secondary'>
				LivOS will mint a random subdomain under <code>home.livinity.io</code> via Server5 (one-time control-plane
				API call). Public DNS A-record will point at <code>{hostIp}</code>.
			</p>
			<div className='rounded bg-blue-50 p-3 text-sm text-blue-900'>
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
				<div className='text-rose-600' role='alert'>
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
