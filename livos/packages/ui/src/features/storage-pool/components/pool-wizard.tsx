import {zodResolver} from '@hookform/resolvers/zod'
import {Loader2} from 'lucide-react'
import {useState} from 'react'
import {FormProvider, useForm, type Resolver} from 'react-hook-form'
import {z} from 'zod'

import {useSmartDrives} from '@/features/files/hooks/use-smart-drives'
import {useStoragePool} from '@/features/storage-pool/hooks/use-storage-pool'
import {Button} from '@/shadcn-components/ui/button'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'
import {maybePrettyBytes} from '@/utils/pretty-bytes'

// ---------------------------------------------------------------------------
// Types & Schema
// ---------------------------------------------------------------------------

// The two locked protection levels (D-01 / D-13). Values match the server enum
// (storagePool.createPool, 318-06). User-facing labels/descriptions live entirely
// in i18n (storage.pool.*) and never expose engine wording.
type ProtectionLevel = 'combine-only' | 'protected'

type PoolWizardValues = {
	selectedDeviceIds: string[]
	protectionLevel: ProtectionLevel
	acknowledged: boolean
}

type StoragePoolHook = ReturnType<typeof useStoragePool>
type PoolState = StoragePoolHook['pool']

// Keep the relaxed wizard-step schema on a PLAIN ZodObject. Trap 16: `.partial()`
// exists ONLY on a ZodObject, NEVER on the ZodEffects that `.refine()` returns —
// calling `.partial()` on a refined schema throws "X.partial is not a function"
// and crashed the whole set-up wizard (documented in backups/setup-wizard.tsx:54).
// This schema has no `.refine()`, so `.partial()` here is safe by construction.
const poolWizardObjectSchema = z.object({
	selectedDeviceIds: z.array(z.string()).min(2),
	protectionLevel: z.enum(['combine-only', 'protected']),
	acknowledged: z.literal(true),
})

// Relaxed schema used while stepping through the wizard (each step fills part of
// the whole). `.partial()` on the plain object — the Trap-16-safe pattern.
const wizardStepSchema = poolWizardObjectSchema.partial()

enum Step {
	Pick = 0,
	Protection = 1,
	Confirm = 2,
	Build = 3,
	Done = 4,
}

// ---------------------------------------------------------------------------
// Small local drive-health badge — reuses the SMART (Phase 313) health signal
// and the existing storage.drive-health.* copy. No engine wording.
// ---------------------------------------------------------------------------

function driveHealthBadge(healthStatus?: string): {dotClass: string; label: string} {
	if (healthStatus === 'healthy') {
		return {dotClass: 'bg-[color:var(--fg)]', label: t('storage.drive-health.status.healthy')}
	}
	if (healthStatus === 'failing') {
		return {dotClass: 'bg-[color:var(--red,#dc2626)]', label: t('storage.drive-health.status.failing-critical')}
	}
	return {dotClass: 'bg-[color:var(--fg-faint)]', label: t('storage.drive-health.unavailable-enclosure')}
}

function formatWhen(at?: number): string {
	if (!at) return t('storage.pool.done.never-synced')
	try {
		return t('storage.pool.done.last-synced', {when: new Date(at).toLocaleString()})
	} catch {
		return t('storage.pool.done.never-synced')
	}
}

// ---------------------------------------------------------------------------
// Status / manage view — always-visible last-synced + Sync now + honest
// "not a backup" note. Rendered by the Done step AND for an existing pool.
// ---------------------------------------------------------------------------

function PoolStatusView({
	pool,
	isSyncing,
	syncNow,
	onDone,
}: {
	pool: PoolState
	isSyncing: boolean
	syncNow: StoragePoolHook['syncNow']
	onDone?: () => void
}) {
	const isProtected = pool?.protectionLevel === 'protected'
	return (
		<div className='flex flex-col gap-4'>
			<div className='flex flex-col gap-1 rounded-[12px] border border-[color:var(--border)] p-4'>
				<span className='text-[14px] text-[color:var(--fg)]'>
					{isProtected ? t('storage.pool.done.protection.protected') : t('storage.pool.done.protection.combine')}
				</span>
				<span className='text-[12px] text-[color:var(--fg-faint)]'>{formatWhen(pool?.lastSync?.at)}</span>
			</div>

			{isProtected && (
				<Button
					variant='default'
					size='dialog'
					disabled={isSyncing}
					onClick={() => syncNow()}
					className='min-w-0 self-start'
				>
					{isSyncing ? <Loader2 className='h-4 w-4 animate-spin' /> : t('storage.pool.done.sync-now')}
				</Button>
			)}

			<p className='text-[12px] text-[color:var(--fg-faint)]'>{t('storage.pool.done.not-a-backup')}</p>

			{onDone ? (
				<Button variant='primary' size='dialog' onClick={onDone} className='min-w-0 self-start'>
					{t('storage.pool.done.finish')}
				</Button>
			) : null}
		</div>
	)
}

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------

export function PoolWizard({onDone}: {onDone?: () => void}) {
	const {pool, isWsl2, eligibleDrives, isLoadingEligible, createPool, isCreatingPool, syncNow, isSyncing} =
		useStoragePool()
	const {drives} = useSmartDrives()

	const [step, setStep] = useState<Step>(Step.Pick)

	const form = useForm<PoolWizardValues>({
		resolver: zodResolver(wizardStepSchema as any) as Resolver<PoolWizardValues>,
		defaultValues: {
			selectedDeviceIds: [],
			protectionLevel: 'combine-only',
			acknowledged: false,
		},
		mode: 'onChange',
	})

	const selectedDeviceIds = form.watch('selectedDeviceIds') ?? []
	const protectionLevel = form.watch('protectionLevel') ?? 'combine-only'
	const acknowledged = form.watch('acknowledged') ?? false

	// WSL2 has no real internal disks — the whole surface is hidden (D-14). This
	// is a defensive fallback; the parent card hard-hides before mounting us.
	if (isWsl2) {
		return <p className='text-[13px] text-[color:var(--fg-faint)]'>{t('storage.pool.unavailable-wsl')}</p>
	}

	// An already-combined pool → show the always-on status view (last synced +
	// manual sync + the honest "not a backup" note), not the build wizard.
	if (pool?.members?.length && !pool.incomplete && step !== Step.Done) {
		return <PoolStatusView pool={pool} isSyncing={isSyncing} syncNow={syncNow} onDone={onDone} />
	}

	// `eligibleDrives` is the server-filtered `storagePool.listEligibleDrives`
	// result (internal, non-removable, non-system drives only — 318-06).
	const eligible = eligibleDrives ?? []
	const eligibleIds = new Set(eligible.map((d) => d.id))
	// Drives the SMART enumeration sees that are NOT combineable — shown greyed
	// with a plain reason so the user understands the omission (D-13).
	const ineligible = (drives ?? []).filter((d) => !eligibleIds.has(d.deviceId))

	const selectedDrives = eligible.filter((d) => selectedDeviceIds.includes(d.id))
	// The largest selected drive becomes the safety drive under "Protected".
	const safetyDrive =
		protectionLevel === 'protected' && selectedDrives.length
			? [...selectedDrives].sort((a, b) => b.size - a.size)[0]
			: undefined

	const toggleDrive = (id: string) => {
		const next = selectedDeviceIds.includes(id)
			? selectedDeviceIds.filter((x) => x !== id)
			: [...selectedDeviceIds, id]
		form.setValue('selectedDeviceIds', next, {shouldValidate: true})
	}

	const canBuild = eligible.length >= 2
	const canNext = step === Step.Pick ? selectedDeviceIds.length >= 2 : step === Step.Confirm ? acknowledged : true

	const back = () => setStep((s) => Math.max(s - 1, Step.Pick))
	const next = () => setStep((s) => Math.min(s + 1, Step.Done))

	const build = async () => {
		setStep(Step.Build)
		try {
			await createPool({selectedDeviceIds, protectionLevel})
			setStep(Step.Done)
		} catch {
			// The hook surfaces the error toast; return to the confirm step.
			setStep(Step.Confirm)
		}
	}

	const headerFor = (s: Step): {title: string; subtitle?: string} => {
		switch (s) {
			case Step.Pick:
				return {title: t('storage.pool.pick.title'), subtitle: t('storage.pool.pick.description')}
			case Step.Protection:
				return {title: t('storage.pool.protection.title'), subtitle: t('storage.pool.protection.description')}
			case Step.Confirm:
				return {title: t('storage.pool.confirm.title'), subtitle: t('storage.pool.confirm.description')}
			case Step.Build:
				return {title: t('storage.pool.build.title'), subtitle: t('storage.pool.build.description')}
			case Step.Done:
				return {title: t('storage.pool.done.title'), subtitle: t('storage.pool.done.description')}
		}
	}

	const header = headerFor(step)

	return (
		<FormProvider {...form}>
			<div className='flex h-full flex-col gap-5'>
				<div className='flex flex-col gap-1'>
					<h2 className='text-[18px] font-medium text-[color:var(--fg)]'>{header.title}</h2>
					{header.subtitle ? <span className='text-[13px] text-[color:var(--fg-mute)]'>{header.subtitle}</span> : null}
				</div>

				<div className='min-h-0 flex-1 overflow-y-auto'>
					{/* ── Step 1: pick combineable drives ── */}
					{step === Step.Pick && (
						<div className='flex flex-col gap-4'>
							{isLoadingEligible ? (
								<div className='flex items-center gap-2 py-6 text-[13px] text-[color:var(--fg-faint)]'>
									<Loader2 className='size-4 animate-spin' />
									<span>{t('storage.pool.pick.loading')}</span>
								</div>
							) : eligible.length === 0 ? (
								<div className='flex flex-col gap-1 rounded-[10px] border border-[color:var(--border)] p-4'>
									<span className='text-[14px] text-[color:var(--fg)]'>{t('storage.pool.pick.empty')}</span>
									<span className='text-[13px] text-[color:var(--fg-faint)]'>{t('storage.pool.pick.empty-hint')}</span>
								</div>
							) : eligible.length === 1 ? (
								<div className='flex flex-col gap-1 rounded-[10px] border border-[color:var(--border)] p-4'>
									<span className='text-[14px] text-[color:var(--fg)]'>{t('storage.pool.pick.need-two')}</span>
								</div>
							) : (
								<div className='flex flex-col gap-2'>
									{eligible.map((d) => {
										const smart = (drives ?? []).find((s) => s.deviceId === d.id)
										const badge = driveHealthBadge(smart?.healthStatus)
										const selected = selectedDeviceIds.includes(d.id)
										return (
											<button
												type='button'
												key={d.id}
												onClick={() => toggleDrive(d.id)}
												className={cn(
													'flex items-center justify-between rounded-[10px] border p-3 text-left transition-colors',
													selected
														? 'border-[color:var(--fg)] bg-[color:var(--bg-2)]'
														: 'border-[color:var(--border)] hover:bg-[color:var(--bg-2)]',
												)}
											>
												<div className='flex flex-col gap-0.5'>
													<span className='text-[14px] text-[color:var(--fg)]'>{d.model}</span>
													<span className='text-[12px] text-[color:var(--fg-faint)]'>{maybePrettyBytes(d.size)}</span>
												</div>
												<span className='flex items-center gap-1.5 text-[12px] text-[color:var(--fg-mute)]'>
													<span className={cn('size-2 rounded-full', badge.dotClass)} />
													{badge.label}
												</span>
											</button>
										)
									})}
								</div>
							)}

							{/* Greyed, non-selectable drives with a plain reason. */}
							{ineligible.length > 0 && (
								<div className='flex flex-col gap-2'>
									<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
										{t('storage.pool.pick.ineligible.title')}
									</span>
									{ineligible.map((d) => (
										<div
											key={d.deviceId}
											className='flex items-center justify-between rounded-[10px] border border-[color:var(--border)] p-3 opacity-50'
										>
											<span className='text-[14px] text-[color:var(--fg)]'>{d.model || d.deviceId}</span>
											<span className='text-[12px] text-[color:var(--fg-faint)]'>
												{d.transport === 'usb'
													? t('storage.pool.pick.ineligible.usb')
													: t('storage.pool.pick.ineligible.system')}
											</span>
										</div>
									))}
								</div>
							)}
						</div>
					)}

					{/* ── Step 2: choose protection level (TWO options, plain language) ── */}
					{step === Step.Protection && (
						<div className='flex flex-col gap-3'>
							{(
								[
									{
										value: 'combine-only' as const,
										label: t('storage.pool.protection.combine.label'),
										description: t('storage.pool.protection.combine.description'),
									},
									{
										value: 'protected' as const,
										label: t('storage.pool.protection.protected.label'),
										description: t('storage.pool.protection.protected.description'),
									},
								]
							).map((opt) => {
								const selected = protectionLevel === opt.value
								return (
									<button
										type='button'
										key={opt.value}
										onClick={() => form.setValue('protectionLevel', opt.value, {shouldValidate: true})}
										className={cn(
											'flex flex-col gap-1 rounded-[12px] border p-4 text-left transition-colors',
											selected
												? 'border-[color:var(--fg)] bg-[color:var(--bg-2)]'
												: 'border-[color:var(--border)] hover:bg-[color:var(--bg-2)]',
										)}
									>
										<span className='text-[15px] font-medium text-[color:var(--fg)]'>{opt.label}</span>
										<span className='text-[13px] text-[color:var(--fg-mute)]'>{opt.description}</span>
									</button>
								)
							})}
							{protectionLevel === 'protected' && (
								<p className='text-[12px] text-[color:var(--fg-faint)]'>
									{t('storage.pool.protection.protected.note')}
								</p>
							)}
						</div>
					)}

					{/* ── Step 3: destructive confirm — lists EVERY drive to be erased ── */}
					{step === Step.Confirm && (
						<div className='flex flex-col gap-4'>
							<p className='text-[13px] text-[color:var(--fg-mute)]'>{t('storage.pool.confirm.warning')}</p>
							<div className='flex flex-col gap-2'>
								{selectedDrives.map((d) => (
									<div
										key={d.id}
										className='flex items-center justify-between rounded-[10px] border border-[color:var(--border)] p-3'
									>
										<span className='text-[14px] text-[color:var(--fg)]'>{d.model}</span>
										<span className='text-[12px] text-[color:var(--fg-faint)]'>{maybePrettyBytes(d.size)}</span>
									</div>
								))}
							</div>
							{safetyDrive && (
								<p className='text-[12px] text-[color:var(--fg-faint)]'>
									{t('storage.pool.confirm.safety-drive', {model: safetyDrive.model})}
								</p>
							)}
							<label className='flex items-center gap-2 text-[13px] text-[color:var(--fg)]'>
								<input
									type='checkbox'
									checked={acknowledged}
									onChange={(e) => form.setValue('acknowledged', e.target.checked, {shouldValidate: true})}
								/>
								{t('storage.pool.confirm.acknowledge')}
							</label>
						</div>
					)}

					{/* ── Step 4: build (async — does not block the UI thread) ── */}
					{step === Step.Build && (
						<div className='flex flex-col items-center justify-center gap-3 py-10 text-center'>
							<Loader2 className='size-6 animate-spin text-[color:var(--fg-mute)]' />
							<span className='text-[14px] text-[color:var(--fg)]'>{t('storage.pool.build.working')}</span>
						</div>
					)}

					{/* ── Step 5: done — last synced + Sync now + not-a-backup note ── */}
					{step === Step.Done && (
						<PoolStatusView pool={pool} isSyncing={isSyncing} syncNow={syncNow} onDone={onDone} />
					)}
				</div>

				{/* Footer nav — hidden on the build + done steps */}
				{step !== Step.Build && step !== Step.Done && (
					<div className='mt-2 flex items-center gap-2'>
						{step !== Step.Pick ? (
							<Button size='dialog' onClick={back} className='min-w-0'>
								{t('back')}
							</Button>
						) : null}
						{step === Step.Confirm ? (
							<Button
								variant='destructive'
								size='dialog'
								disabled={!acknowledged || isCreatingPool}
								onClick={build}
								className='min-w-0'
							>
								{isCreatingPool ? <Loader2 className='h-4 w-4 animate-spin' /> : t('storage.pool.confirm.submit')}
							</Button>
						) : (
							<Button
								variant='primary'
								size='dialog'
								disabled={!canNext || (step === Step.Pick && !canBuild)}
								onClick={next}
								className='min-w-0'
							>
								{t('continue')}
							</Button>
						)}
					</div>
				)}
			</div>
		</FormProvider>
	)
}
