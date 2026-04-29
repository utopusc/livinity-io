// Phase 38 Plan 03 — explicit-list confirmation modal (FR-UI-02..04 + FR-UI-07).
//
// Mounted by the /factory-reset route. The Settings > Advanced > Danger Zone
// button (Plan 02) navigates here. On open the modal:
//   1. Renders the verbatim 7-item DELETION_LIST as a real <ul>
//   2. Renders the preserve-account RadioGroup, default-checked on "preserve"
//   3. Renders a text input that must equal "FACTORY RESET" exactly to enable
//   4. Runs preflightFetchLivinity once on mount (D-PF-02; re-mount = re-check)
//   5. Wires updateStatus query for the update-in-progress check
//   6. Computes destructive-button enabled state via computeConfirmEnabled
//   7. On confirm-click, calls reset({preserveApiKey}) and navigates back to
//      the dashboard so the GlobalSystemStateProvider's `resetting` cover
//      takes over (Plan 04 ships the new BarePage overlay).

import {useState} from 'react'
import {TbShieldExclamation} from 'react-icons/tb'
import {useNavigate} from 'react-router-dom'

import {DELETION_LIST} from '@/features/factory-reset/lib/deletion-list'
import {EXPECTED_CONFIRM_PHRASE, isFactoryResetTrigger} from '@/features/factory-reset/lib/typed-confirm'
import {useGlobalSystemState} from '@/providers/global-system-state'
import {Button} from '@/shadcn-components/ui/button'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/shadcn-components/ui/dialog'
import {RadioGroup, RadioGroupItem} from '@/shadcn-components/ui/radio-group'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/shadcn-components/ui/tooltip'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

import {backPath} from './misc'
import {computeConfirmEnabled} from './preflight-decision'
import {usePreflight} from './use-preflight'

type RadioValue = 'preserve' | 'fresh'

export function FactoryResetModal() {
	const navigate = useNavigate()
	const {reset} = useGlobalSystemState()

	// ─ State ────────────────────────────────────────────────────────────────
	const [confirmInput, setConfirmInput] = useState('')
	const [radioValue, setRadioValue] = useState<RadioValue>('preserve') // D-RD-01 default
	const [submitted, setSubmitted] = useState(false)

	// ─ Pre-flight inputs ────────────────────────────────────────────────────
	const updateStatusQ = trpcReact.system.updateStatus.useQuery(undefined, {
		refetchOnWindowFocus: false,
	})
	const updateRunning = updateStatusQ.data?.running === true

	// TODO(v30.0): backup-mutex pre-flight check (BAK-SCHED-04 lock). When v30.0
	// ships, gate on `trpc.backups.statusForFactoryReset.useQuery()` here. For
	// v29.2 we ONLY check update-in-progress + network reachability.

	const preflight = usePreflight({enabled: true})
	const networkReachable = preflight.result === null ? null : preflight.result.reachable

	const typedConfirm = isFactoryResetTrigger(confirmInput)
	const decision = computeConfirmEnabled({
		typedConfirm,
		updateRunning,
		networkReachable,
		preflightInFlight: preflight.inFlight,
		mutationPending: submitted, // single-shot guard until the GlobalSystemState cover takes over
	})

	// ─ Handlers ─────────────────────────────────────────────────────────────
	const handleConfirm = () => {
		if (!decision.enabled || submitted) return
		setSubmitted(true)
		const preserveApiKey = radioValue === 'preserve'
		reset({preserveApiKey})
		// GlobalSystemStateProvider's `resetting` status cover takes over on the
		// next system.status poll. Navigate to root so we sit under the cover.
		navigate('/')
	}

	const handleClose = (open: boolean) => {
		if (!open) navigate(backPath)
	}

	// ─ Render ───────────────────────────────────────────────────────────────
	return (
		<Dialog open onOpenChange={handleClose}>
			<DialogContent
				data-testid='factory-reset-modal'
				onPointerDownOutside={(e) => e.preventDefault()} // D-CF-03: outside click does NOT dismiss
				// Escape DOES dismiss (default Radix behavior — do NOT prevent it)
			>
				<DialogHeader>
					<DialogTitle className='flex items-center gap-2 text-destructive2'>
						<TbShieldExclamation className='h-5 w-5' aria-hidden='true' />
						{t('factory-reset.modal.heading')}
					</DialogTitle>
				</DialogHeader>

				{/* Explicit-list consent surface (D-MD-01 — REAL <ul>) */}
				<p className='text-body-sm font-medium'>{t('factory-reset.modal.intro')}</p>
				<ul
					data-testid='factory-reset-deletion-list'
					className='ml-6 list-disc space-y-1 text-body-sm'
				>
					{DELETION_LIST.map((item, i) => (
						<li key={i}>{item}</li>
					))}
				</ul>
				<p className='text-body-sm text-text-tertiary'>{t('factory-reset.modal.bottom-line')}</p>

				{/* Preserve-account radio (D-RD-01) */}
				<RadioGroup
					data-testid='factory-reset-radio'
					value={radioValue}
					onValueChange={(v) => setRadioValue(v as RadioValue)}
					className='gap-3'
				>
					<label className='flex items-start gap-2 rounded-radius-md bg-surface-1 p-3'>
						<RadioGroupItem value='preserve' id='radio-preserve' className='mt-0.5' />
						<div className='flex-1'>
							<div className='font-medium'>{t('factory-reset.radio.preserve.title')}</div>
							<div className='text-body-sm text-text-tertiary'>
								{t('factory-reset.radio.preserve.description')}
							</div>
						</div>
					</label>
					<label className='flex items-start gap-2 rounded-radius-md bg-surface-1 p-3'>
						<RadioGroupItem value='fresh' id='radio-fresh' className='mt-0.5' />
						<div className='flex-1'>
							<div className='font-medium'>{t('factory-reset.radio.fresh.title')}</div>
							<div className='text-body-sm text-text-tertiary'>
								{t('factory-reset.radio.fresh.description')}
							</div>
						</div>
					</label>
				</RadioGroup>

				{/* Type-to-confirm input (D-CF-01) */}
				<label className='block'>
					<span className='mb-1 block text-body-sm font-medium'>
						{t('factory-reset.confirm-input.label')}
					</span>
					<input
						data-testid='factory-reset-typed-confirm'
						type='text'
						autoComplete='off'
						spellCheck={false}
						value={confirmInput}
						onChange={(e) => setConfirmInput(e.target.value)}
						placeholder={EXPECTED_CONFIRM_PHRASE}
						className='w-full rounded-radius-md border border-border-subtle bg-surface-base px-3 py-2 font-mono text-body-sm focus:outline-none focus:ring-2 focus:ring-brand/30'
					/>
				</label>

				{/* Footer: Cancel + destructive Confirm (gated by computeConfirmEnabled) */}
				<div className='mt-4 flex items-center justify-end gap-2'>
					<Button
						data-testid='factory-reset-cancel'
						type='button'
						variant='secondary'
						onClick={() => navigate(backPath)}
					>
						{t('factory-reset.cancel-button.label')}
					</Button>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<span>
									<Button
										data-testid='factory-reset-confirm'
										type='button'
										variant='destructive'
										disabled={!decision.enabled}
										aria-disabled={!decision.enabled}
										onClick={handleConfirm}
									>
										{t('factory-reset.confirm-button.label')}
									</Button>
								</span>
							</TooltipTrigger>
							{decision.reason && (
								<TooltipContent data-testid='factory-reset-confirm-reason'>
									{decision.reason}
								</TooltipContent>
							)}
						</Tooltip>
					</TooltipProvider>
				</div>
			</DialogContent>
		</Dialog>
	)
}
