import {useCallback, useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {
	IconGlobe,
	IconLoader2,
	IconCheck,
	IconCopy,
	IconAlertCircle,
	IconLock,
	IconExternalLink,
	IconArrowRight,
	IconArrowLeft,
	IconRefresh,
	IconTrash,
} from '@tabler/icons-react'

import {trpcReact} from '@/trpc/trpc'

import {SettingsPageLayout} from './_components/settings-page-layout'

// ─── Types ──────────────────────────────────────────────────────

type WizardStep = 'domain' | 'dns-records' | 'verify' | 'activate' | 'done'

const STEPS: WizardStep[] = ['domain', 'dns-records', 'verify', 'activate', 'done']

// ─── Copy Helper ────────────────────────────────────────────────

function CopyButton({text}: {text: string}) {
	const [copied, setCopied] = useState(false)

	const handleCopy = () => {
		navigator.clipboard.writeText(text)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	return (
		<button
			onClick={handleCopy}
			className='rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/70'
			title='Copy'
		>
			{copied ? <IconCheck size={14} className='text-green-400' /> : <IconCopy size={14} />}
		</button>
	)
}

// ─── Step 1: Enter Domain ───────────────────────────────────────

function StepDomain({
	domain,
	setDomain,
	serverIp,
	onNext,
	saving,
}: {
	domain: string
	setDomain: (d: string) => void
	serverIp: string | null
	onNext: () => void
	saving: boolean
}) {
	const valid = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(domain) && domain.includes('.')

	return (
		<div className='space-y-5'>
			<div>
				<h3 className='text-base font-semibold text-white/90'>Enter your domain</h3>
				<p className='mt-1 text-xs text-white/40'>
					Enter the domain name you want to use for this server.
				</p>
			</div>

			<div>
				<label className='mb-1.5 block text-xs font-medium text-white/50'>Domain name</label>
				<input
					type='text'
					value={domain}
					onChange={(e) => setDomain(e.target.value)}
					onKeyDown={(e) => e.key === 'Enter' && valid && onNext()}
					placeholder='myserver.example.com'
					className='w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none transition-colors focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/25'
					autoFocus
				/>
			</div>

			{serverIp && (
				<div className='flex items-center gap-2 rounded-xl bg-white/5 px-4 py-3'>
					<IconGlobe size={14} className='text-blue-400' />
					<span className='text-xs text-white/50'>Server IP:</span>
					<span className='font-mono text-xs text-white/80'>{serverIp}</span>
					<CopyButton text={serverIp} />
				</div>
			)}

			<div className='flex justify-end pt-1'>
				<button
					onClick={onNext}
					disabled={!valid || saving}
					className='flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-violet-500 disabled:opacity-40'
				>
					{saving ? <IconLoader2 size={14} className='animate-spin' /> : <IconArrowRight size={14} />}
					Next
				</button>
			</div>
		</div>
	)
}

// ─── Step 2: DNS Records ────────────────────────────────────────

function StepDnsRecords({
	domain,
	serverIp,
	onNext,
	onBack,
}: {
	domain: string
	serverIp: string
	onNext: () => void
	onBack: () => void
}) {
	// Extract subdomain vs root
	const parts = domain.split('.')
	const isRoot = parts.length === 2
	const hostName = isRoot ? '@' : parts.slice(0, -2).join('.')

	return (
		<div className='space-y-5'>
			<div>
				<h3 className='text-base font-semibold text-white/90'>Add DNS record</h3>
				<p className='mt-1 text-xs text-white/40'>
					Go to your domain registrar and add the following DNS record:
				</p>
			</div>

			<div className='overflow-hidden rounded-xl border border-white/10 bg-white/5'>
				<table className='w-full text-left text-xs'>
					<thead>
						<tr className='border-b border-white/10 bg-white/5'>
							<th className='px-4 py-2.5 font-medium text-white/50'>Type</th>
							<th className='px-4 py-2.5 font-medium text-white/50'>Name</th>
							<th className='px-4 py-2.5 font-medium text-white/50'>Value</th>
							<th className='px-4 py-2.5 font-medium text-white/50'>TTL</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td className='px-4 py-3'>
								<span className='rounded bg-blue-500/20 px-2 py-0.5 font-mono font-medium text-blue-400'>A</span>
							</td>
							<td className='px-4 py-3'>
								<div className='flex items-center gap-1.5'>
									<span className='font-mono text-white/80'>{hostName}</span>
									<CopyButton text={hostName} />
								</div>
							</td>
							<td className='px-4 py-3'>
								<div className='flex items-center gap-1.5'>
									<span className='font-mono text-white/80'>{serverIp}</span>
									<CopyButton text={serverIp} />
								</div>
							</td>
							<td className='px-4 py-3'>
								<span className='font-mono text-white/60'>300</span>
							</td>
						</tr>
					</tbody>
				</table>
			</div>

			<div className='rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-400/80'>
				DNS changes can take a few minutes to propagate. Setting TTL to 300 (5 minutes) helps speed this up.
			</div>

			<div className='flex justify-between pt-1'>
				<button
					onClick={onBack}
					className='flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm text-white/50 transition-all hover:bg-white/10 hover:text-white/70'
				>
					<IconArrowLeft size={14} />
					Back
				</button>
				<button
					onClick={onNext}
					className='flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-violet-500'
				>
					I've added the record
					<IconArrowRight size={14} />
				</button>
			</div>
		</div>
	)
}

// ─── Step 3: Verify DNS ─────────────────────────────────────────

function StepVerify({
	domain,
	onNext,
	onBack,
}: {
	domain: string
	onNext: () => void
	onBack: () => void
}) {
	const [checking, setChecking] = useState(true)
	const [autoRetry, setAutoRetry] = useState(true)

	const verifyQuery = trpcReact.domain.verifyDns.useQuery(undefined, {
		refetchInterval: autoRetry ? 10_000 : false,
	})

	const result = verifyQuery.data
	const isMatch = result?.match === true

	// Stop auto-retry once matched
	useEffect(() => {
		if (isMatch) {
			setAutoRetry(false)
			setChecking(false)
		}
	}, [isMatch])

	useEffect(() => {
		if (verifyQuery.isFetched && !verifyQuery.isFetching) {
			setChecking(false)
		}
	}, [verifyQuery.isFetched, verifyQuery.isFetching])

	const handleRetry = () => {
		setChecking(true)
		verifyQuery.refetch()
	}

	return (
		<div className='space-y-5'>
			<div>
				<h3 className='text-base font-semibold text-white/90'>Verify DNS</h3>
				<p className='mt-1 text-xs text-white/40'>
					Checking if <span className='font-mono text-white/60'>{domain}</span> points to your server...
				</p>
			</div>

			<div className='rounded-xl border border-white/10 bg-white/5 p-4'>
				{verifyQuery.isFetching || checking ? (
					<div className='flex items-center gap-3'>
						<IconLoader2 size={18} className='animate-spin text-violet-400' />
						<span className='text-sm text-white/60'>Checking DNS records...</span>
					</div>
				) : isMatch ? (
					<div className='flex items-center gap-3'>
						<div className='flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20'>
							<IconCheck size={18} className='text-green-400' />
						</div>
						<div>
							<span className='text-sm font-medium text-green-400'>DNS verified!</span>
							<p className='mt-0.5 text-xs text-white/40'>
								<span className='font-mono'>{domain}</span> resolves to{' '}
								<span className='font-mono'>{result?.currentIp ?? ''}</span>
							</p>
						</div>
					</div>
				) : (
					<div className='space-y-3'>
						<div className='flex items-center gap-3'>
							<div className='flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20'>
								<IconAlertCircle size={18} className='text-amber-400' />
							</div>
							<div>
								<span className='text-sm font-medium text-amber-400'>Not yet resolved</span>
								<p className='mt-0.5 text-xs text-white/40'>DNS records may need more time to propagate.</p>
							</div>
						</div>

						{result && (
							<div className='rounded-lg bg-white/5 px-3 py-2 text-xs'>
								<div className='flex items-center justify-between'>
									<span className='text-white/40'>Current:</span>
									<span className='font-mono text-white/60'>{result.currentIp || 'No A record found'}</span>
								</div>
								<div className='mt-1 flex items-center justify-between'>
									<span className='text-white/40'>Expected:</span>
									<span className='font-mono text-white/60'>{result.expected}</span>
								</div>
							</div>
						)}

						{autoRetry && (
							<p className='text-[11px] text-white/30'>Auto-checking every 10 seconds...</p>
						)}
					</div>
				)}
			</div>

			{!isMatch && (
				<button
					onClick={handleRetry}
					className='flex items-center gap-2 text-xs text-white/40 transition-colors hover:text-white/60'
				>
					<IconRefresh size={14} />
					Check again
				</button>
			)}

			<div className='flex justify-between pt-1'>
				<button
					onClick={onBack}
					className='flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm text-white/50 transition-all hover:bg-white/10 hover:text-white/70'
				>
					<IconArrowLeft size={14} />
					Back
				</button>
				<button
					onClick={onNext}
					disabled={!isMatch}
					className='flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-violet-500 disabled:opacity-40'
				>
					Next
					<IconArrowRight size={14} />
				</button>
			</div>
		</div>
	)
}

// ─── Step 4: Activate HTTPS ─────────────────────────────────────

function StepActivate({
	domain,
	onNext,
	onBack,
}: {
	domain: string
	onNext: () => void
	onBack: () => void
}) {
	const [activating, setActivating] = useState(false)
	const [error, setError] = useState('')

	const activateMutation = trpcReact.domain.activate.useMutation()

	const handleActivate = async () => {
		setError('')
		setActivating(true)
		try {
			await activateMutation.mutateAsync()
			onNext()
		} catch (err: any) {
			setError(err.message || 'Failed to activate HTTPS')
		} finally {
			setActivating(false)
		}
	}

	return (
		<div className='space-y-5'>
			<div>
				<h3 className='text-base font-semibold text-white/90'>Activate HTTPS</h3>
				<p className='mt-1 text-xs text-white/40'>
					DNS is verified. Ready to enable HTTPS for{' '}
					<span className='font-mono text-white/60'>{domain}</span>.
				</p>
			</div>

			<div className='space-y-3 rounded-xl border border-white/10 bg-white/5 p-4'>
				<div className='flex items-start gap-3'>
					<IconLock size={16} className='mt-0.5 flex-shrink-0 text-green-400' />
					<div>
						<p className='text-sm text-white/80'>Free SSL certificate from Let's Encrypt</p>
						<p className='mt-0.5 text-xs text-white/40'>
							Caddy will automatically obtain and renew a certificate.
						</p>
					</div>
				</div>
				<div className='flex items-start gap-3'>
					<IconGlobe size={16} className='mt-0.5 flex-shrink-0 text-blue-400' />
					<div>
						<p className='text-sm text-white/80'>HTTP to HTTPS redirect</p>
						<p className='mt-0.5 text-xs text-white/40'>
							All HTTP traffic will be automatically redirected to HTTPS.
						</p>
					</div>
				</div>
			</div>

			{error && (
				<div className='flex items-start gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-xs text-red-400'>
					<IconAlertCircle size={14} className='mt-0.5 flex-shrink-0' />
					<span>{error}</span>
				</div>
			)}

			<div className='flex justify-between pt-1'>
				<button
					onClick={onBack}
					className='flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm text-white/50 transition-all hover:bg-white/10 hover:text-white/70'
				>
					<IconArrowLeft size={14} />
					Back
				</button>
				<button
					onClick={handleActivate}
					disabled={activating}
					className='flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-green-500 disabled:opacity-40'
				>
					{activating ? (
						<IconLoader2 size={14} className='animate-spin' />
					) : (
						<IconLock size={14} />
					)}
					Activate HTTPS
				</button>
			</div>
		</div>
	)
}

// ─── Step 5: Done ───────────────────────────────────────────────

function StepDone({domain, onClose}: {domain: string}) {
	const url = `https://${domain}`

	return (
		<div className='space-y-5'>
			<div className='flex flex-col items-center py-4'>
				<div className='mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/20'>
					<IconCheck size={28} className='text-green-400' />
				</div>
				<h3 className='text-base font-semibold text-white/90'>HTTPS is active!</h3>
				<p className='mt-1 text-xs text-white/40'>
					Your server is now accessible via HTTPS.
				</p>
			</div>

			<div className='flex items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-3'>
				<IconLock size={14} className='text-green-400' />
				<a
					href={url}
					target='_blank'
					rel='noopener noreferrer'
					className='font-mono text-sm text-blue-400 transition-colors hover:text-blue-300'
				>
					{url}
				</a>
				<IconExternalLink size={14} className='text-white/30' />
			</div>

			<div className='flex justify-center pt-2'>
				<button
					onClick={onClose}
					className='flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-violet-500'
				>
					Done
				</button>
			</div>
		</div>
	)
}

// ─── Active Domain Status ───────────────────────────────────────

function DomainStatus({
	domain,
	activatedAt,
	onRemove,
	onReconfigure,
}: {
	domain: string
	activatedAt: number | null
	onRemove: () => void
	onReconfigure: () => void
}) {
	const [removing, setRemoving] = useState(false)

	const removeMutation = trpcReact.domain.remove.useMutation()

	const handleRemove = async () => {
		if (!confirm('Remove domain and revert to IP-only access?')) return
		setRemoving(true)
		try {
			await removeMutation.mutateAsync()
			onRemove()
		} finally {
			setRemoving(false)
		}
	}

	const url = `https://${domain}`

	return (
		<div className='space-y-4'>
			<div className='flex items-center gap-3'>
				<div className='flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/20'>
					<IconLock size={20} className='text-green-400' />
				</div>
				<div className='flex-1'>
					<div className='flex items-center gap-2'>
						<span className='text-sm font-medium text-white/90'>HTTPS Active</span>
						<span className='rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-medium text-green-400'>
							Secured
						</span>
					</div>
					<a
						href={url}
						target='_blank'
						rel='noopener noreferrer'
						className='mt-0.5 flex items-center gap-1 font-mono text-xs text-blue-400 transition-colors hover:text-blue-300'
					>
						{url}
						<IconExternalLink size={12} />
					</a>
				</div>
			</div>

			{activatedAt && (
				<p className='text-[11px] text-white/30'>
					Activated {new Date(activatedAt).toLocaleDateString()}
				</p>
			)}

			<div className='flex gap-2'>
				<button
					onClick={onReconfigure}
					className='flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-xs text-white/50 transition-all hover:bg-white/10 hover:text-white/70'
				>
					<IconRefresh size={14} />
					Change domain
				</button>
				<button
					onClick={handleRemove}
					disabled={removing}
					className='flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-2 text-xs text-red-400 transition-all hover:bg-red-500/20'
				>
					{removing ? <IconLoader2 size={14} className='animate-spin' /> : <IconTrash size={14} />}
					Remove
				</button>
			</div>
		</div>
	)
}

// ─── Wrapper for Dialog (legacy support) ────────────────────────
// This is kept for backwards compatibility with DomainSetupDialog
export function DomainSetupDialogContent({onClose}: {onClose: () => void}) {
	return <DomainSetupInner onClose={onClose} />
}

// ─── Step Progress Indicator ────────────────────────────────────

function StepIndicator({current}: {current: WizardStep}) {
	const labels = ['Domain', 'DNS', 'Verify', 'HTTPS', 'Done']
	const currentIdx = STEPS.indexOf(current)

	return (
		<div className='flex items-center gap-1.5'>
			{labels.map((label, idx) => {
				const isActive = idx === currentIdx
				const isDone = idx < currentIdx

				return (
					<div key={label} className='flex items-center gap-1.5'>
						{idx > 0 && <div className={`h-px w-4 ${isDone ? 'bg-violet-500' : 'bg-white/10'}`} />}
						<div
							className={`flex h-6 items-center rounded-full px-2.5 text-[10px] font-medium transition-all ${
								isActive
									? 'bg-violet-600 text-white'
									: isDone
										? 'bg-violet-500/20 text-violet-400'
										: 'bg-white/5 text-white/30'
							}`}
						>
							{isDone ? <IconCheck size={10} className='mr-1' /> : null}
							{label}
						</div>
					</div>
				)
			})}
		</div>
	)
}

// ─── Inner Component (for dialog/legacy) ────────────────────────

function DomainSetupInner({onClose}: {onClose: () => void}) {
	const [step, setStep] = useState<WizardStep>('domain')
	const [domain, setDomain] = useState('')
	const [serverIp, setServerIp] = useState<string | null>(null)
	const [saving, setSaving] = useState(false)
	const [showWizard, setShowWizard] = useState(false)

	// Fetch current status
	const statusQuery = trpcReact.domain.getStatus.useQuery()
	const ipQuery = trpcReact.domain.getPublicIp.useQuery()
	const setDomainMutation = trpcReact.domain.setDomain.useMutation()

	// Set server IP when loaded
	useEffect(() => {
		if (ipQuery.data?.ip) {
			setServerIp(ipQuery.data.ip)
		}
	}, [ipQuery.data])

	// If domain is already configured, load it
	useEffect(() => {
		if (statusQuery.data?.domain) {
			setDomain(statusQuery.data.domain)
		}
	}, [statusQuery.data])

	// Handle step 1 "Next" -> save domain to Redis
	const handleSaveDomain = useCallback(async () => {
		setSaving(true)
		try {
			await setDomainMutation.mutateAsync({domain})
			setStep('dns-records')
		} catch {
			// error handled by tRPC
		} finally {
			setSaving(false)
		}
	}, [domain, setDomainMutation])

	const handleRemoved = () => {
		setShowWizard(false)
		setStep('domain')
		setDomain('')
		statusQuery.refetch()
	}

	// Loading state
	if (statusQuery.isLoading) {
		return (
			<div className='flex items-center justify-center py-12'>
				<IconLoader2 size={24} className='animate-spin text-white/30' />
			</div>
		)
	}

	// If domain is active and not reconfiguring, show status
	if (statusQuery.data?.active && !showWizard) {
		return (
			<DomainStatus
				domain={statusQuery.data.domain!}
				activatedAt={statusQuery.data.activatedAt}
				onRemove={handleRemoved}
				onReconfigure={() => {
					setShowWizard(true)
					setStep('domain')
				}}
			/>
		)
	}

	// Wizard mode
	return (
		<div>
			{/* Progress */}
			<div className='mb-6'>
				<StepIndicator current={step} />
			</div>

			{/* Steps */}
			{step === 'domain' && (
				<StepDomain
					domain={domain}
					setDomain={setDomain}
					serverIp={serverIp}
					onNext={handleSaveDomain}
					saving={saving}
				/>
			)}
			{step === 'dns-records' && serverIp && (
				<StepDnsRecords
					domain={domain}
					serverIp={serverIp}
					onNext={() => setStep('verify')}
					onBack={() => setStep('domain')}
				/>
			)}
			{step === 'verify' && (
				<StepVerify
					domain={domain}
					onNext={() => setStep('activate')}
					onBack={() => setStep('dns-records')}
				/>
			)}
			{step === 'activate' && (
				<StepActivate
					domain={domain}
					onNext={() => setStep('done')}
					onBack={() => setStep('verify')}
				/>
			)}
			{step === 'done' && (
				<StepDone
					domain={domain}
					onClose={() => {
						setShowWizard(false)
						statusQuery.refetch()
						onClose()
					}}
				/>
			)}
		</div>
	)
}

// ─── Main Page Component ─────────────────────────────────────────

export default function DomainSetupPage() {
	const navigate = useNavigate()

	return (
		<SettingsPageLayout title='Domain & HTTPS' description='Configure custom domain and SSL certificate'>
			<DomainSetupInner onClose={() => navigate('/settings')} />
		</SettingsPageLayout>
	)
}
