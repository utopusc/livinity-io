// livos/packages/ui/src/features/local-setup/QrCodeStep.tsx
// Phase 104 plan 104-05 — local-lan step 2: render QR code with CA cert URL.
// Uses Cloudflare's public QR endpoint (no new npm dep needed; D-NO-NEW-DEPS).
import {IconArrowLeft, IconDownload} from '@tabler/icons-react'

export interface QrCodeStepProps {
	hostIp: string
	tld: string
	onNext: () => void
	onBack: () => void
}

export function QrCodeStep({hostIp, tld, onNext, onBack}: QrCodeStepProps) {
	// CA cert is served by Caddy's HTTP-only block at http://<hostIp>/api/local/ca.crt
	// (plan 104-03 generates this in generateLocalCaddyfile).
	// Mobile-friendly: scan QR -> phone browser opens URL -> downloads .crt.
	const caUrl = `http://${hostIp}/api/local/ca.crt`
	const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(caUrl)}`

	return (
		<div className='space-y-4' data-testid='qr-code-step'>
			<h3 className='text-lg font-semibold'>Install the LivOS Local CA</h3>
			<p className='text-text-secondary'>
				Browsers will mark <code>https://*.{tld}</code> as untrusted until you install the CA root certificate. Scan
				the QR with your phone or click the download link below.
			</p>

			<div className='flex flex-col items-center gap-4'>
				<img
					src={qrUrl}
					alt={`QR code to download CA cert from ${caUrl}`}
					width={240}
					height={240}
					className='rounded border'
				/>
				<a
					href={caUrl}
					className='flex items-center gap-2 text-accent underline'
					download='livos-local-ca.crt'
				>
					<IconDownload className='h-4 w-4' />
					Download CA cert ({caUrl})
				</a>
			</div>

			<div className='flex justify-between pt-4'>
				<button onClick={onBack} className='px-4 py-2'>
					<IconArrowLeft className='inline' /> Back
				</button>
				<button onClick={onNext} className='rounded bg-accent px-4 py-2 text-white'>
					Next: install instructions
				</button>
			</div>
		</div>
	)
}
