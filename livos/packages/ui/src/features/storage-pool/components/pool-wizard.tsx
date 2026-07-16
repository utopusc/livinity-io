import {zodResolver} from '@hookform/resolvers/zod'
import {Loader2} from 'lucide-react'
import {useState, type ReactNode} from 'react'
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
	forceSyncOverride,
	isForcingSync,
	onDone,
	onReplace,
}: {
	pool: PoolState
	isSyncing: boolean
	syncNow: StoragePoolHook['syncNow']
	// The freeze-gate override (D-08 / WR-02): a one-shot forced sync that commits
	// the mass deletion after the operator confirms it was intentional.
	forceSyncOverride: StoragePoolHook['forceSyncOverride']
	isForcingSync: boolean
	onDone?: () => void
	// Enters the guided replacement runbook (protected pools only — a combine-only
	// pool has no safety copy to rebuild a replaced drive from).
	onReplace?: () => void
}) {
	const isProtected = pool?.protectionLevel === 'protected'
	// When the D-08 freeze gate blocks a sync, the server returns {blocked, reason}
	// instead of throwing. WR-02: we capture that here so the card can surface the
	// reason + an explicit override, rather than silently appearing to succeed.
	const [blocked, setBlocked] = useState<{reason?: string} | null>(null)

	const handleSyncNow = async () => {
		const res = await syncNow()
		setBlocked(res?.blocked ? {reason: res.reason} : null)
	}

	const handleOverride = async () => {
		await forceSyncOverride({confirm: true})
		setBlocked(null)
	}

	return (
		<div className='flex flex-col gap-4'>
			<div className='flex flex-col gap-1 rounded-[12px] border border-[color:var(--border)] p-4'>
				<span className='text-[14px] text-[color:var(--fg)]'>
					{isProtected ? t('storage.pool.done.protection.protected') : t('storage.pool.done.protection.combine')}
				</span>
				<span className='text-[12px] text-[color:var(--fg-faint)]'>{formatWhen(pool?.lastSync?.at)}</span>
			</div>

			{isProtected && (
				<div className='flex flex-wrap items-center gap-2'>
					<Button
						variant='default'
						size='dialog'
						disabled={isSyncing || isForcingSync}
						onClick={handleSyncNow}
						className='min-w-0'
					>
						{isSyncing ? <Loader2 className='h-4 w-4 animate-spin' /> : t('storage.pool.done.sync-now')}
					</Button>
					{onReplace ? (
						<Button variant='default' size='dialog' onClick={onReplace} className='min-w-0'>
							{t('storage.pool.replace.intro')}
						</Button>
					) : null}
				</div>
			)}

			{/* WR-02: the freeze gate blocked the sync — show WHY + the explicit
			    "these deletions are intentional" override (the ONLY path that commits
			    the mass deletion to parity). Without this the card looked like it
			    succeeded and there was no way forward. */}
			{isProtected && blocked ? (
				<div className='flex flex-col gap-2 rounded-[12px] border border-[color:var(--red,#dc2626)] p-4'>
					<span className='text-[13px] font-medium text-[color:var(--fg)]'>
						{t('storage.pool.done.sync-blocked.title')}
					</span>
					{blocked.reason ? (
						<span className='text-[12px] leading-[1.5] text-[color:var(--fg-faint)]'>{blocked.reason}</span>
					) : null}
					<Button
						variant='destructive'
						size='dialog'
						disabled={isForcingSync}
						onClick={handleOverride}
						className='min-w-0 self-start'
					>
						{isForcingSync ? (
							<Loader2 className='h-4 w-4 animate-spin' />
						) : (
							t('storage.pool.done.sync-blocked.confirm')
						)}
					</Button>
				</div>
			) : null}

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
// Replacement runbook (D-11 / POOL-03) — a wizard RE-ENTRY mode keyed off the
// persisted `storagePool.runbookStep`. It walks the operator through swapping a
// degraded drive: identify the failed disk → physically swap → format + mount
// the new disk at the same slot → rebuild its files from the safety copy →
// CHECK the rebuild (a HARD STOP when problems are found) → bring the safety copy
// up to date → clear the alert.
//
// ★ Trap 12 / D-11: the CHECK step reads `summary:error_unrecoverable` (surfaced
// as `result.errorUnrecoverable` + the server's `hardStop` flag). When it is > 0
// the runbook HARD-STOPS with plain-language copy and NEVER offers the sync step —
// a fix is never auto-chained into a sync over unrecoverable corruption.
// ---------------------------------------------------------------------------

type RunbookPhase = 'detect' | 'swap' | 'format' | 'mount' | 'fix' | 'check' | 'hardstop' | 'sync' | 'done'
type PoolMemberUi = NonNullable<PoolState>['members'][number]
type CandidateDrive = {id: string; model: string; size: number}

// Map the persisted runbook step → the phase to resume at on a page reload. The
// destructive steps already done are skipped; a resumed CHECK is re-run so the
// HARD-STOP decision is always derived fresh (never trusted from stale memory).
function phaseFromStep(step: string | null): RunbookPhase {
	switch (step) {
		case 'replace:formatted':
			return 'mount'
		case 'replace:mounted':
			return 'fix'
		case 'replace:fixed':
			return 'check'
		// WR-03: the check verdict is persisted (`:ok` / `:blocked`). On resume we
		// ALWAYS re-run the check so the HARD-STOP decision is derived fresh, never
		// trusted from stale memory — so every checked variant resumes at 'check'.
		case 'replace:checked':
		case 'replace:checked:ok':
		case 'replace:checked:blocked':
			return 'check'
		case 'replace:synced':
			return 'done'
		default:
			return 'detect'
	}
}

// Derive the safety-engine disk label (dN) from a member's slot WITHOUT ever
// surfacing the raw mount path in the UI (D-12).
function diskLabelFor(mountpoint?: string): string {
	const m = mountpoint ? /disk(\d+)\s*$/.exec(mountpoint) : null
	return m ? `d${m[1]}` : ''
}

function RunbookRow({title, description}: {title: string; description?: string}) {
	return (
		<div className='flex flex-col gap-1'>
			<h2 className='text-[18px] font-medium text-[color:var(--fg)]'>{title}</h2>
			{description ? <span className='text-[13px] text-[color:var(--fg-mute)]'>{description}</span> : null}
		</div>
	)
}

function RunbookView({hook, onExit}: {hook: StoragePoolHook; onExit: () => void}) {
	const {
		pool,
		runbookStep,
		replaceDetect,
		isDetecting,
		replaceFormat,
		isReplaceFormatting,
		replaceMount,
		isReplaceMounting,
		replaceFix,
		isReplaceFixing,
		replaceCheck,
		isReplaceChecking,
		replaceSync,
		isReplaceSyncing,
		replaceClear,
		isReplaceClearing,
	} = hook
	const {drives} = useSmartDrives()

	// Seed the phase from the persisted step (resume) once, on first mount. The
	// parent only mounts RunbookView when runbookStep is already set (resume) or
	// the operator explicitly started a replacement (runbookStep null → 'detect').
	const [phase, setPhase] = useState<RunbookPhase>(() => phaseFromStep(runbookStep))
	const [failedMember, setFailedMember] = useState<PoolMemberUi | undefined>(undefined)
	const [candidates, setCandidates] = useState<CandidateDrive[]>([])
	const [replacementId, setReplacementId] = useState<string | undefined>(undefined)
	const [unrecoverable, setUnrecoverable] = useState<number>(0)

	const dataMembers = (pool?.members ?? []).filter((m) => m.role === 'data')
	const label = diskLabelFor(failedMember?.mountpoint)

	const smartFor = (deviceId?: string) => (drives ?? []).find((s) => s.deviceId === deviceId)

	// On resume (runbookStep set) but with no in-memory failed member, the operator
	// must re-identify which drive they are replacing before a device-scoped step —
	// this re-derives the slot without repeating any completed destructive step.
	const needsReidentify =
		!failedMember && (phase === 'mount' || phase === 'fix' || phase === 'check')

	const reidentify = (
		<div className='flex flex-col gap-3'>
			<RunbookRow
				title={t('storage.pool.replace.reidentify.title')}
				description={t('storage.pool.replace.reidentify.description')}
			/>
			<div className='flex flex-col gap-2'>
				{dataMembers.map((m) => {
					const badge = driveHealthBadge(smartFor(m.deviceId)?.healthStatus)
					return (
						<button
							type='button'
							key={m.deviceId}
							onClick={() => setFailedMember(m)}
							className='flex items-center justify-between rounded-[10px] border border-[color:var(--border)] p-3 text-left hover:bg-[color:var(--bg-2)]'
						>
							<span className='text-[14px] text-[color:var(--fg)]'>{smartFor(m.deviceId)?.model || m.deviceId}</span>
							<span className='flex items-center gap-1.5 text-[12px] text-[color:var(--fg-mute)]'>
								<span className={cn('size-2 rounded-full', badge.dotClass)} />
								{badge.label}
							</span>
						</button>
					)
				})}
			</div>
		</div>
	)

	const footer = (children: ReactNode) => <div className='mt-2 flex items-center gap-2'>{children}</div>

	const cancelBtn = (
		<Button size='dialog' onClick={onExit} className='min-w-0'>
			{t('storage.pool.replace.cancel')}
		</Button>
	)

	let body: ReactNode = null

	if (needsReidentify) {
		body = (
			<>
				<p className='text-[12px] text-[color:var(--fg-faint)]'>{t('storage.pool.replace.resume-note')}</p>
				{reidentify}
				{footer(cancelBtn)}
			</>
		)
	} else if (phase === 'detect') {
		body = (
			<>
				<RunbookRow
					title={t('storage.pool.replace.detect.title')}
					description={t('storage.pool.replace.detect.description')}
				/>
				{dataMembers.length === 0 ? (
					<p className='text-[13px] text-[color:var(--fg-faint)]'>{t('storage.pool.replace.detect.none')}</p>
				) : (
					<div className='flex flex-col gap-2'>
						{dataMembers.map((m) => {
							const badge = driveHealthBadge(smartFor(m.deviceId)?.healthStatus)
							return (
								<button
									type='button'
									key={m.deviceId}
									disabled={isDetecting}
									onClick={async () => {
										try {
											const res = await replaceDetect({failedDeviceId: m.deviceId})
											setFailedMember(res.failedMember as PoolMemberUi)
											setCandidates(res.candidates as CandidateDrive[])
											setPhase('swap')
										} catch {
											/* hook surfaces the error toast */
										}
									}}
									className='flex items-center justify-between rounded-[10px] border border-[color:var(--border)] p-3 text-left hover:bg-[color:var(--bg-2)] disabled:opacity-50'
								>
									<span className='text-[14px] text-[color:var(--fg)]'>{smartFor(m.deviceId)?.model || m.deviceId}</span>
									<span className='flex items-center gap-1.5 text-[12px] text-[color:var(--fg-mute)]'>
										<span className={cn('size-2 rounded-full', badge.dotClass)} />
										{badge.label}
									</span>
								</button>
							)
						})}
					</div>
				)}
				{footer(cancelBtn)}
			</>
		)
	} else if (phase === 'swap') {
		const failedSmart = smartFor(failedMember?.deviceId)
		body = (
			<>
				<RunbookRow
					title={t('storage.pool.replace.swap.title')}
					description={t('storage.pool.replace.swap.description')}
				/>
				<div className='flex flex-col gap-3'>
					<div className='flex flex-col gap-1 rounded-[10px] border border-[color:var(--border)] p-3'>
						<span className='text-[12px] uppercase tracking-[0.12em] text-[color:var(--fg-faint)]'>
							{t('storage.pool.replace.swap.failed-label')}
						</span>
						<span className='text-[14px] text-[color:var(--fg)]'>
							{failedSmart?.model || failedMember?.deviceId}
						</span>
						{failedMember?.serial ? (
							<span className='text-[12px] text-[color:var(--fg-faint)]'>
								{t('storage.pool.replace.serial', {serial: failedMember.serial})}
							</span>
						) : null}
					</div>

					<span className='text-[13px] text-[color:var(--fg)]'>{t('storage.pool.replace.swap.pick-replacement')}</span>
					{candidates.length === 0 ? (
						<p className='text-[13px] text-[color:var(--fg-faint)]'>{t('storage.pool.replace.swap.no-candidates')}</p>
					) : (
						<div className='flex flex-col gap-2'>
							{candidates.map((c) => {
								const selected = replacementId === c.id
								return (
									<button
										type='button'
										key={c.id}
										onClick={() => setReplacementId(c.id)}
										className={cn(
											'flex items-center justify-between rounded-[10px] border p-3 text-left transition-colors',
											selected
												? 'border-[color:var(--fg)] bg-[color:var(--bg-2)]'
												: 'border-[color:var(--border)] hover:bg-[color:var(--bg-2)]',
										)}
									>
										<span className='text-[14px] text-[color:var(--fg)]'>{c.model}</span>
										<span className='text-[12px] text-[color:var(--fg-faint)]'>{maybePrettyBytes(c.size)}</span>
									</button>
								)
							})}
						</div>
					)}
				</div>
				{footer(
					<>
						{cancelBtn}
						<Button
							variant='primary'
							size='dialog'
							disabled={!replacementId}
							onClick={() => setPhase('format')}
							className='min-w-0'
						>
							{t('continue')}
						</Button>
					</>,
				)}
			</>
		)
	} else if (phase === 'format') {
		body = (
			<>
				<RunbookRow
					title={t('storage.pool.replace.format.title')}
					description={t('storage.pool.replace.format.description')}
				/>
				{footer(
					<>
						<Button size='dialog' onClick={() => setPhase('swap')} className='min-w-0'>
							{t('back')}
						</Button>
						<Button
							variant='destructive'
							size='dialog'
							disabled={!replacementId || isReplaceFormatting}
							onClick={async () => {
								if (!replacementId) return
								try {
									await replaceFormat({deviceId: replacementId})
									setPhase('mount')
								} catch {
									/* stay on this step; hook toasts the error */
								}
							}}
							className='min-w-0'
						>
							{isReplaceFormatting ? <Loader2 className='h-4 w-4 animate-spin' /> : t('storage.pool.replace.format.submit')}
						</Button>
					</>,
				)}
			</>
		)
	} else if (phase === 'mount') {
		body = (
			<>
				<RunbookRow
					title={t('storage.pool.replace.mount.title')}
					description={t('storage.pool.replace.mount.description')}
				/>
				{footer(
					<>
						{cancelBtn}
						<Button
							variant='primary'
							size='dialog'
							disabled={!replacementId || !failedMember?.mountpoint || isReplaceMounting}
							onClick={async () => {
								if (!replacementId || !failedMember?.mountpoint) return
								try {
									await replaceMount({deviceId: replacementId, mountpoint: failedMember.mountpoint})
									setPhase('fix')
								} catch {
									/* stay; hook toasts the error */
								}
							}}
							className='min-w-0'
						>
							{isReplaceMounting ? <Loader2 className='h-4 w-4 animate-spin' /> : t('storage.pool.replace.mount.submit')}
						</Button>
					</>,
				)}
			</>
		)
	} else if (phase === 'fix') {
		body = (
			<>
				<RunbookRow title={t('storage.pool.replace.fix.title')} description={t('storage.pool.replace.fix.description')} />
				{isReplaceFixing ? (
					<div className='flex items-center gap-2 py-6 text-[13px] text-[color:var(--fg-faint)]'>
						<Loader2 className='size-4 animate-spin' />
						<span>{t('storage.pool.replace.fix.working')}</span>
					</div>
				) : null}
				{footer(
					<>
						{cancelBtn}
						<Button
							variant='primary'
							size='dialog'
							disabled={!label || isReplaceFixing}
							onClick={async () => {
								if (!label) return
								try {
									await replaceFix({disk: label})
									setPhase('check')
								} catch {
									/* stay; hook toasts the error */
								}
							}}
							className='min-w-0'
						>
							{isReplaceFixing ? <Loader2 className='h-4 w-4 animate-spin' /> : t('storage.pool.replace.fix.submit')}
						</Button>
					</>,
				)}
			</>
		)
	} else if (phase === 'check') {
		body = (
			<>
				<RunbookRow
					title={t('storage.pool.replace.check.title')}
					description={t('storage.pool.replace.check.description')}
				/>
				{isReplaceChecking ? (
					<div className='flex items-center gap-2 py-6 text-[13px] text-[color:var(--fg-faint)]'>
						<Loader2 className='size-4 animate-spin' />
						<span>{t('storage.pool.replace.check.working')}</span>
					</div>
				) : null}
				{footer(
					<>
						{cancelBtn}
						<Button
							variant='primary'
							size='dialog'
							disabled={!label || isReplaceChecking}
							onClick={async () => {
								if (!label) return
								try {
									// HARD STOP (Trap 12): replaceCheck surfaces `summary:error_unrecoverable`
									// as result.errorUnrecoverable + the server's `hardStop` flag. We NEVER
									// auto-chain into sync — an unrecoverable result routes to the hard-stop
									// screen with NO path forward to sync.
									const res = await replaceCheck({disk: label})
									const errorUnrecoverable = res.result.errorUnrecoverable
									if (res.hardStop || errorUnrecoverable > 0) {
										setUnrecoverable(errorUnrecoverable)
										setPhase('hardstop')
									} else {
										setPhase('sync')
									}
								} catch {
									/* stay; hook toasts the error */
								}
							}}
							className='min-w-0'
						>
							{isReplaceChecking ? <Loader2 className='h-4 w-4 animate-spin' /> : t('storage.pool.replace.check.submit')}
						</Button>
					</>,
				)}
			</>
		)
	} else if (phase === 'hardstop') {
		// The unrecoverable path: plain-language stop, NO continue-to-sync button.
		body = (
			<>
				<div className='flex flex-col gap-2 rounded-[12px] border border-[color:var(--red,#dc2626)] p-4'>
					<h2 className='text-[18px] font-medium text-[color:var(--red,#dc2626)]'>
						{t('storage.pool.replace.hardstop.title')}
					</h2>
					<p className='text-[13px] text-[color:var(--fg-mute)]'>{t('storage.pool.replace.hardstop.description')}</p>
					{unrecoverable > 0 ? (
						<p className='text-[12px] text-[color:var(--fg-faint)]'>
							{t('storage.pool.replace.hardstop.count', {count: unrecoverable})}
						</p>
					) : null}
				</div>
				{footer(
					<Button size='dialog' onClick={onExit} className='min-w-0'>
						{t('storage.pool.replace.hardstop.close')}
					</Button>,
				)}
			</>
		)
	} else if (phase === 'sync') {
		body = (
			<>
				<RunbookRow
					title={t('storage.pool.replace.sync.title')}
					description={t('storage.pool.replace.sync.description')}
				/>
				{isReplaceSyncing ? (
					<div className='flex items-center gap-2 py-6 text-[13px] text-[color:var(--fg-faint)]'>
						<Loader2 className='size-4 animate-spin' />
						<span>{t('storage.pool.replace.sync.working')}</span>
					</div>
				) : null}
				{footer(
					<Button
						variant='primary'
						size='dialog'
						disabled={isReplaceSyncing}
						onClick={async () => {
							try {
								await replaceSync()
								setPhase('done')
							} catch {
								/* stay; hook toasts the error */
							}
						}}
						className='min-w-0'
					>
						{isReplaceSyncing ? <Loader2 className='h-4 w-4 animate-spin' /> : t('storage.pool.replace.sync.submit')}
					</Button>,
				)}
			</>
		)
	} else if (phase === 'done') {
		body = (
			<>
				<RunbookRow
					title={t('storage.pool.replace.done.title')}
					description={t('storage.pool.replace.done.description')}
				/>
				{footer(
					<Button
						variant='primary'
						size='dialog'
						disabled={isReplaceClearing}
						onClick={async () => {
							try {
								await replaceClear()
							} finally {
								onExit()
							}
						}}
						className='min-w-0'
					>
						{isReplaceClearing ? <Loader2 className='h-4 w-4 animate-spin' /> : t('storage.pool.replace.done.finish')}
					</Button>,
				)}
			</>
		)
	}

	return <div className='flex h-full flex-col gap-5'>{body}</div>
}

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------

export function PoolWizard({onDone}: {onDone?: () => void}) {
	const hook = useStoragePool()
	const {
		pool,
		isWsl2,
		runbookStep,
		eligibleDrives,
		isLoadingEligible,
		createPool,
		isCreatingPool,
		syncNow,
		isSyncing,
		forceSyncOverride,
		isForcingSync,
	} = hook
	const {drives} = useSmartDrives()

	const [step, setStep] = useState<Step>(Step.Pick)
	// The operator explicitly entered the replacement runbook from the status view.
	const [runbookActive, setRunbookActive] = useState(false)

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

	// A replacement runbook takes precedence: an in-flight persisted step (resume
	// after a reload) OR an operator-initiated replacement re-enters the runbook
	// mode. While it is in flight the server blocks competing formats (T-318-18).
	if (runbookStep || runbookActive) {
		return <RunbookView hook={hook} onExit={() => setRunbookActive(false)} />
	}

	// An already-combined pool → show the always-on status view (last synced +
	// manual sync + the honest "not a backup" note), not the build wizard. Protected
	// pools also expose "Replace a drive" (enters the guided replacement runbook).
	if (pool?.members?.length && !pool.incomplete && step !== Step.Done) {
		return (
			<PoolStatusView
				pool={pool}
				isSyncing={isSyncing}
				syncNow={syncNow}
				forceSyncOverride={forceSyncOverride}
				isForcingSync={isForcingSync}
				onDone={onDone}
				onReplace={pool.protectionLevel === 'protected' ? () => setRunbookActive(true) : undefined}
			/>
		)
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
						<PoolStatusView
							pool={pool}
							isSyncing={isSyncing}
							syncNow={syncNow}
							forceSyncOverride={forceSyncOverride}
							isForcingSync={isForcingSync}
							onDone={onDone}
						/>
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
