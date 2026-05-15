// livos/packages/ui/src/features/local-setup/LocalSetupWizard.tsx
// Phase 104 plan 104-05 — root wizard for Settings -> Local Access.
import {useEffect, useState} from 'react'
import {IconArrowLeft, IconCheck, IconLoader2} from '@tabler/icons-react'

import {trpcReact} from '@/trpc/trpc'

import {HybridDnsSetup} from './HybridDnsSetup'
import {ModePickStep} from './ModePickStep'
import {PlatformInstructions} from './PlatformInstructions'
import {QrCodeStep} from './QrCodeStep'
import {
	CLOUD_STEPS,
	HYBRID_STEPS,
	initialWizardState,
	LOCAL_LAN_STEPS,
	type SelectedMode,
	type WizardState,
	type WizardStep,
} from './types'

export function LocalSetupWizard() {
	const [state, setState] = useState<WizardState>(initialWizardState)

	// Pull current install mode (set by install.sh + first-run)
	const statusQ = trpcReact.local.getStatus.useQuery()

	// Auto-detect host IP from status into the form
	useEffect(() => {
		if (statusQ.data?.hostIp) {
			setState((s) => ({
				...s,
				localLan: {...s.localLan, hostIp: statusQ.data!.hostIp ?? ''},
				hybrid: {...s.hybrid, hostIp: statusQ.data!.hostIp ?? ''},
			}))
		}
	}, [statusQ.data?.hostIp])

	const activeSteps =
		state.mode === 'local-lan'
			? LOCAL_LAN_STEPS
			: state.mode === 'hybrid'
				? HYBRID_STEPS
				: state.mode === 'cloud'
					? CLOUD_STEPS
					: LOCAL_LAN_STEPS // default while mode is null

	const stepIndex = activeSteps.indexOf(state.step)

	const goto = (step: WizardStep) => setState((s) => ({...s, step}))
	const next = () => {
		const i = activeSteps.indexOf(state.step)
		if (i >= 0 && i < activeSteps.length - 1) goto(activeSteps[i + 1])
	}
	const back = () => {
		const i = activeSteps.indexOf(state.step)
		if (i > 0) goto(activeSteps[i - 1])
	}

	return (
		<div data-testid='local-setup-wizard' className='space-y-6'>
			<header className='flex items-center justify-between'>
				<h2 className='text-xl font-semibold'>Local Access Setup</h2>
				<span className='text-sm text-text-secondary'>
					Step {Math.max(stepIndex + 1, 1)} of {activeSteps.length}
				</span>
			</header>

			{statusQ.isLoading && (
				<div className='flex items-center gap-2 text-text-secondary'>
					<IconLoader2 className='animate-spin' />
					Detecting current install mode…
				</div>
			)}

			{state.step === 'mode-pick' && (
				<ModePickStep
					selected={state.mode}
					currentMode={statusQ.data?.mode ?? null}
					onSelect={(m: SelectedMode) => {
						setState((s) => ({...s, mode: m}))
						if (m === 'cloud') goto('cloud-redirect')
						else if (m === 'local-lan') goto('local-lan-config')
						else if (m === 'hybrid') goto('hybrid-config')
					}}
				/>
			)}

			{state.step === 'cloud-redirect' && (
				<div className='space-y-4'>
					<p>
						Cloud mode is configured at <strong>/settings/domain-setup</strong>.
					</p>
					<a className='text-accent underline' href='/settings/domain-setup'>
						Go to Cloud Domain Setup -&gt;
					</a>
				</div>
			)}

			{state.step === 'local-lan-config' && (
				<LocalLanConfigStep state={state} setState={setState} onNext={next} onBack={back} />
			)}

			{state.step === 'local-lan-qr' && (
				<QrCodeStep hostIp={state.localLan.hostIp} tld={state.localLan.tld} onNext={next} onBack={back} />
			)}

			{state.step === 'local-lan-trust' && (
				<PlatformInstructions hostIp={state.localLan.hostIp} onNext={next} onBack={back} />
			)}

			{state.step === 'hybrid-config' && (
				<HybridConfigStep state={state} setState={setState} onNext={next} onBack={back} />
			)}

			{state.step === 'hybrid-dns-records' && (
				<HybridDnsSetup
					cfToken={state.hybrid.cloudflareApiToken}
					hostIp={state.hybrid.hostIp}
					onProvisioned={(subdomain, zoneId) => {
						setState((s) => ({
							...s,
							hybrid: {...s.hybrid, subdomain, zoneId},
						}))
						goto('hybrid-verify')
					}}
					onBack={back}
				/>
			)}

			{state.step === 'hybrid-verify' && <HybridVerifyStep state={state} onNext={next} onBack={back} />}

			{state.step === 'verify' && <VerifyStep mode={state.mode} onDone={() => goto('done')} onBack={back} />}

			{state.step === 'done' && (
				<div className='space-y-3' data-testid='local-setup-done'>
					<IconCheck className='text-accent-green' />
					<p>
						Local Access enrolled in <strong>{state.mode}</strong> mode.
					</p>
					<p className='text-text-secondary'>Server5 traffic (data-plane): none.</p>
				</div>
			)}
		</div>
	)
}

// ── Local-lan config step (inline — tiny, doesn't need its own file) ──
function LocalLanConfigStep({
	state,
	setState,
	onNext,
	onBack,
}: {
	state: WizardState
	setState: React.Dispatch<React.SetStateAction<WizardState>>
	onNext: () => void
	onBack: () => void
}) {
	const activateM = trpcReact.local.activate.useMutation()
	const handleActivate = async () => {
		try {
			await activateM.mutateAsync({
				tld: state.localLan.tld,
				hostIp: state.localLan.hostIp,
			})
			onNext()
		} catch {
			// error rendered via mutation state below
		}
	}
	return (
		<div className='space-y-4'>
			<label className='block'>
				Local TLD
				<input
					className='mt-1 block w-full rounded border bg-bg-secondary px-3 py-2'
					value={state.localLan.tld}
					onChange={(e) =>
						setState((s) => ({
							...s,
							localLan: {...s.localLan, tld: e.target.value},
						}))
					}
				/>
			</label>
			<label className='block'>
				Host IP
				<input
					className='mt-1 block w-full rounded border bg-bg-secondary px-3 py-2'
					value={state.localLan.hostIp}
					onChange={(e) =>
						setState((s) => ({
							...s,
							localLan: {...s.localLan, hostIp: e.target.value},
						}))
					}
				/>
			</label>
			<div className='rounded bg-accent-amber/10 p-3 text-sm text-accent-amber'>
				<strong>Note:</strong> .local TLDs do NOT work on Apple devices (iOS, macOS) due to RFC 6762 mDNS
				interception. Use <em>hybrid</em> mode for Apple support.
			</div>
			{activateM.error && (
				<div className='text-accent-red' role='alert'>
					{activateM.error.message}
				</div>
			)}
			<div className='flex justify-between'>
				<button onClick={onBack} className='px-4 py-2'>
					<IconArrowLeft className='inline' /> Back
				</button>
				<button
					onClick={handleActivate}
					disabled={!state.localLan.hostIp || activateM.isPending}
					className='rounded bg-accent px-4 py-2 text-white disabled:opacity-50'
				>
					{activateM.isPending ? 'Activating…' : 'Activate Local-LAN'}
				</button>
			</div>
		</div>
	)
}

// ── Hybrid config step (inline) ──
function HybridConfigStep({
	state,
	setState,
	onNext,
	onBack,
}: {
	state: WizardState
	setState: React.Dispatch<React.SetStateAction<WizardState>>
	onNext: () => void
	onBack: () => void
}) {
	return (
		<div className='space-y-4'>
			<label className='block'>
				Cloudflare API Token
				<input
					type='password'
					className='mt-1 block w-full rounded border bg-bg-secondary px-3 py-2'
					value={state.hybrid.cloudflareApiToken}
					onChange={(e) =>
						setState((s) => ({
							...s,
							hybrid: {...s.hybrid, cloudflareApiToken: e.target.value},
						}))
					}
					placeholder='Required for DNS-01 wildcard cert'
				/>
			</label>
			<label className='block'>
				Host IP (LAN)
				<input
					className='mt-1 block w-full rounded border bg-bg-secondary px-3 py-2'
					value={state.hybrid.hostIp}
					onChange={(e) =>
						setState((s) => ({
							...s,
							hybrid: {...s.hybrid, hostIp: e.target.value},
						}))
					}
				/>
			</label>
			<div className='rounded bg-accent-blue/10 p-3 text-sm text-accent-blue'>
				<strong>Hybrid mode:</strong> public DNS A-record points at your LAN IP. Works on every device including
				iPhone/iPad/Mac. ALL traffic stays LAN-direct — no Server5 relay.
			</div>
			<div className='flex justify-between'>
				<button onClick={onBack} className='px-4 py-2'>
					<IconArrowLeft className='inline' /> Back
				</button>
				<button
					onClick={onNext}
					disabled={!state.hybrid.cloudflareApiToken || !state.hybrid.hostIp}
					className='rounded bg-accent px-4 py-2 text-white disabled:opacity-50'
				>
					Next: provision subdomain
				</button>
			</div>
		</div>
	)
}

// ── Hybrid verify step (calls activateHybrid + waits for green) ──
function HybridVerifyStep({
	state,
	onNext,
	onBack,
}: {
	state: WizardState
	onNext: () => void
	onBack: () => void
}) {
	const activateM = trpcReact.local.activateHybrid.useMutation()
	const statusQ = trpcReact.local.getHybridStatus.useQuery()
	const handleActivate = async () => {
		try {
			await activateM.mutateAsync({
				subdomain: state.hybrid.subdomain,
				zoneId: state.hybrid.zoneId,
				hostIp: state.hybrid.hostIp,
			})
			onNext()
		} catch {
			/* renders below */
		}
	}
	return (
		<div className='space-y-4'>
			<p>
				Provisioned subdomain: <code>{state.hybrid.subdomain}</code>
			</p>
			<p>
				Zone ID: <code>{state.hybrid.zoneId}</code>
			</p>
			<p>
				cfTokenAvailable: <code>{String(statusQ.data?.cfTokenAvailable ?? '...')}</code>
			</p>
			{activateM.error && (
				<div className='text-accent-red' role='alert'>
					{activateM.error.message}
				</div>
			)}
			<div className='flex justify-between'>
				<button onClick={onBack} className='px-4 py-2'>
					<IconArrowLeft className='inline' /> Back
				</button>
				<button
					onClick={handleActivate}
					disabled={activateM.isPending}
					className='rounded bg-accent px-4 py-2 text-white'
				>
					{activateM.isPending ? 'Activating…' : 'Activate Hybrid'}
				</button>
			</div>
		</div>
	)
}

// ── Final verify step ──
function VerifyStep({
	mode,
	onDone,
	onBack,
}: {
	mode: SelectedMode | null
	onDone: () => void
	onBack: () => void
}) {
	const statusQ = trpcReact.local.getStatus.useQuery(undefined, {refetchInterval: 2000})
	const isGreen = statusQ.data?.mode === mode
	return (
		<div className='space-y-4'>
			<p>
				Status: <strong>{statusQ.data?.mode ?? 'detecting'}</strong>
			</p>
			<p>
				Expected: <strong>{mode}</strong>
			</p>
			{isGreen && <IconCheck className='text-accent-green' />}
			<div className='flex justify-between'>
				<button onClick={onBack} className='px-4 py-2'>
					<IconArrowLeft className='inline' /> Back
				</button>
				<button
					onClick={onDone}
					disabled={!isGreen}
					className='rounded bg-accent px-4 py-2 text-white disabled:opacity-50'
				>
					Done
				</button>
			</div>
		</div>
	)
}

export default LocalSetupWizard
