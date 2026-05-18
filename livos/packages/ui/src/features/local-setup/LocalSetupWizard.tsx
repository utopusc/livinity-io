// livos/packages/ui/src/features/local-setup/LocalSetupWizard.tsx
// Phase 104 plan 104-05 — root wizard for Settings -> Local Access.
// Phase 142-01 — local-lan branch retired (LocalLanConfigStep + QrCodeStep +
//   PlatformInstructions imports removed; LOCAL_LAN_STEPS dropped).
// Phase 142-02 — `hybrid` renamed → `portal` (HybridConfigStep +
//   HybridVerifyStep inlined as PortalConfigStep + PortalVerifyStep).
// Phase 142-03 — `cloud` is Coming Soon (rendered as an informational pane).
import {useEffect, useState} from 'react'
import {IconArrowLeft, IconCheck, IconLoader2} from '@tabler/icons-react'

import {trpcReact} from '@/trpc/trpc'

import {HybridDnsSetup} from './HybridDnsSetup'
import {ModePickStep} from './ModePickStep'
import {
	CLOUD_STEPS,
	PORTAL_STEPS,
	initialWizardState,
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
				portal: {...s.portal, hostIp: statusQ.data!.hostIp ?? ''},
			}))
		}
	}, [statusQ.data?.hostIp])

	// Phase 142-01: local-lan branch dropped, so the only multi-step flow is
	// portal. Cloud is currently an informational redirect (Coming Soon copy
	// added in Phase 142-03 ModePickStep + the redirect pane below).
	const activeSteps = state.mode === 'cloud' ? CLOUD_STEPS : PORTAL_STEPS

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
						else if (m === 'portal') goto('portal-config')
					}}
				/>
			)}

			{state.step === 'cloud-redirect' && (
				<div className='space-y-4' data-testid='cloud-redirect-pane'>
					<p>
						<strong>Cloud mode</strong> is Coming Soon — Livinity will host the control plane
						for you (no Cloudflare account required). Track progress at{' '}
						<a className='text-accent underline' href='https://livinity.io/dashboard'>
							livinity.io/dashboard
						</a>
						.
					</p>
					<p className='text-text-secondary'>
						For now, use <strong>Portal</strong> mode (the recommended default).
					</p>
				</div>
			)}

			{state.step === 'portal-config' && (
				<PortalConfigStep state={state} setState={setState} onNext={next} onBack={back} />
			)}

			{state.step === 'portal-dns-records' && (
				<HybridDnsSetup
					cfToken={state.portal.cloudflareApiToken}
					hostIp={state.portal.hostIp}
					onProvisioned={(subdomain, zoneId) => {
						setState((s) => ({
							...s,
							portal: {...s.portal, subdomain, zoneId},
						}))
						goto('portal-verify')
					}}
					onBack={back}
				/>
			)}

			{state.step === 'portal-verify' && <PortalVerifyStep state={state} onNext={next} onBack={back} />}

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

// ── Portal config step (inline — collects CF token + host IP) ──
function PortalConfigStep({
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
					value={state.portal.cloudflareApiToken}
					onChange={(e) =>
						setState((s) => ({
							...s,
							portal: {...s.portal, cloudflareApiToken: e.target.value},
						}))
					}
					placeholder='Required for DNS-01 wildcard cert'
				/>
			</label>
			<label className='block'>
				Host IP (LAN)
				<input
					className='mt-1 block w-full rounded border bg-bg-secondary px-3 py-2'
					value={state.portal.hostIp}
					onChange={(e) =>
						setState((s) => ({
							...s,
							portal: {...s.portal, hostIp: e.target.value},
						}))
					}
				/>
			</label>
			<div className='rounded bg-accent-blue/10 p-3 text-sm text-accent-blue'>
				<strong>Portal mode:</strong> public DNS A-record points at your LAN IP. Works on every device including
				iPhone/iPad/Mac. ALL traffic stays LAN-direct — no Server5 relay.
			</div>
			<div className='flex justify-between'>
				<button onClick={onBack} className='px-4 py-2'>
					<IconArrowLeft className='inline' /> Back
				</button>
				<button
					onClick={onNext}
					disabled={!state.portal.cloudflareApiToken || !state.portal.hostIp}
					className='rounded bg-accent px-4 py-2 text-white disabled:opacity-50'
				>
					Next: provision subdomain
				</button>
			</div>
		</div>
	)
}

// ── Portal verify step (calls activateHybrid + waits for green) ──
// NOTE: the underlying tRPC procedure names (activateHybrid / getHybridStatus)
// haven't been renamed yet — they live on the livinityd `local.*` namespace
// and Phase 142-04 sweeps them. Wire-level names are kept for now.
function PortalVerifyStep({
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
				subdomain: state.portal.subdomain,
				zoneId: state.portal.zoneId,
				hostIp: state.portal.hostIp,
			})
			onNext()
		} catch {
			/* renders below */
		}
	}
	return (
		<div className='space-y-4'>
			<p>
				Provisioned subdomain: <code>{state.portal.subdomain}</code>
			</p>
			<p>
				Zone ID: <code>{state.portal.zoneId}</code>
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
					{activateM.isPending ? 'Activating…' : 'Activate Portal'}
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
