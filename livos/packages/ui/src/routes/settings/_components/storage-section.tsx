import {Loader2} from 'lucide-react'
import {useState} from 'react'
import {TbCheck, TbCopy, TbEye, TbEyeOff, TbLock, TbLockOpen} from 'react-icons/tb'
import {toast} from 'sonner'

import {FieldCard, FieldRow} from '@/components/field-card'
import {SettingsPageHeader} from '@/components/settings-page-header'
import AddNetworkShareDialog from '@/features/files/components/dialogs/add-network-share-dialog'
import {useExternalStorage} from '@/features/files/hooks/use-external-storage'
import {useNetworkStorage} from '@/features/files/hooks/use-network-storage'
// Phase 340-02 USBIMP-01 — copy-on-insert rule hook.
import {useUsbImport} from '@/features/files/hooks/use-usb-import'
import {useSmartDrives} from '@/features/files/hooks/use-smart-drives'
import {PoolWizard} from '@/features/storage-pool/components/pool-wizard'
import {useStoragePool} from '@/features/storage-pool/hooks/use-storage-pool'
import {useCurrentUser} from '@/hooks/use-current-user'
import {useSystemDiskForUi} from '@/hooks/use-disk'
// Phase 334 STEPUP-01 — re-auth wrapper for the step-up-gated system.luksFormat.
import {isStepUpRequired, useStepUp} from '@/providers/step-up'
// Phase 339-03 W2 — single UI-side source of truth for the quota unit + soft ratio.
import {BYTES_PER_GB, QUOTA_SOFT_RATIO} from '@/routes/settings/users'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/shadcn-components/ui/alert-dialog'
import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/shadcn-components/ui/select'
import {Switch} from '@/shadcn-components/ui/switch'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'
import {formatBytes, maybePrettyBytes} from '@/utils/pretty-bytes'

// ─────────────────────────────────────────────────────────────────────────────
// Storage & Drives (SYSTEM)
// v36 LivOS Design Port — Settings section mirroring AccountSection /
// WallpaperSection / AdvancedSection. Surfaces USB drives, network (SMB) shares,
// Samba folder-sharing, and overall disk usage. All backed by existing tRPC
// procedures + the files/* hooks (no new backend).
// ─────────────────────────────────────────────────────────────────────────────

const FILESYSTEM_OPTIONS = [
	{value: 'ext4', label: 'ext4 (Linux)'},
	{value: 'exfat', label: 'exFAT (cross-platform)'},
] as const

type Filesystem = (typeof FILESYSTEM_OPTIONS)[number]['value']

// Mirrors the backend constraint: /^[A-Za-z0-9-_ ]+$/ length 1-11.
const LABEL_PATTERN = /^[A-Za-z0-9-_ ]{1,11}$/

export function StorageDrivesSection() {
	const disk = useSystemDiskForUi({poll: true})

	return (
		<div className='flex flex-col gap-8'>
			<SettingsPageHeader
				eyebrow='Storage'
				title='Storage'
				titleAccent='& drives.'
				sub='Manage USB drives, network shares, and folder sharing.'
			/>

			<OverallDiskUsageCard disk={disk} />

			<DriveHealthBlock />

			<StoragePoolBlock />

			{/* Phase 339-03 STORD-02 — whole-disk LUKS (between pool + USB, same
			    internal-non-pool disk universe as the pool wizard). */}
			<DiskEncryptionBlock />

			<UsbDrivesBlock />

			{/* Phase 340-02 USBIMP-01 — opt-in copy-on-insert rule (beside the raw USB
			    drive list; both are the removable-media surface). Admin-only. */}
			<UsbImportBlock />

			<NetworkSharesBlock />

			<FolderSharingBlock />

			{/* Phase 339-03 STORD-01 — per-folder quota editor (beside folder sharing;
			    both operate on shared/managed virtual folders). */}
			<FolderQuotaBlock />
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Overall disk usage
// ─────────────────────────────────────────────────────────────────────────────

function OverallDiskUsageCard({disk}: {disk: ReturnType<typeof useSystemDiskForUi>}) {
	const pct = Math.max(0, Math.min(1, Number.isFinite(disk.progress) ? disk.progress : 0)) * 100
	const isLow = !disk.isLoading && (disk.isDiskFull || disk.isDiskLow)

	return (
		<section className='flex flex-col gap-3'>
			<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
				Disk usage
			</span>
			<FieldCard>
				<FieldRow
					label='System disk'
					value={
						<div className='flex flex-col gap-2'>
							<div className='flex items-baseline gap-2'>
								<span className='text-[15px] font-semibold tracking-[-0.01em] text-[color:var(--fg)]'>
									{disk.value}
								</span>
								<span className='text-[12px] text-[color:var(--fg-faint)]'>{disk.valueSub}</span>
							</div>
							<div className='h-1.5 w-full overflow-hidden rounded-[2px] bg-[color:var(--bg-2)]'>
								<div
									className={cn(
										'h-full rounded-[2px] transition-[width] duration-300 ease-out',
										isLow ? 'bg-[color:var(--red,#dc2626)]' : 'bg-[color:var(--fg)]',
									)}
									style={{width: `${pct}%`}}
								/>
							</div>
							<span className={cn('text-[12px]', isLow ? 'text-[color:var(--red,#dc2626)]' : 'text-[color:var(--fg-faint)]')}>
								{disk.isLoading ? 'Reading disk…' : disk.secondaryValue}
							</span>
						</div>
					}
				/>
			</FieldCard>
		</section>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK A0 — Drive health (SMART) — Phase 313 SMART-01 / SMART-04
// ─────────────────────────────────────────────────────────────────────────────

// The drive shape returned by monitoring.diskHealth.list (inferred from tRPC —
// no cross-package type import needed).
type SmartDriveUi = NonNullable<ReturnType<typeof useSmartDrives>['drives']>[number]

// Map an honest SMART state → dot color + label.
// ★ SMART-04 (no false-healthy): 'unavailable'/'permission-denied' get a MUTED
// (--fg-faint) dot — explicitly NOT red, and never the healthy neutral — so
// "can't read this drive through this enclosure" reads visually + textually
// distinct from both "healthy" and "failing". It is NEVER a green/healthy badge.
function driveHealthBadge(drive: SmartDriveUi): {dotClass: string; textClass: string; label: string} {
	if (drive.healthStatus === 'healthy') {
		return {
			dotClass: 'bg-[color:var(--fg)]',
			textClass: 'text-[color:var(--fg-mute)]',
			label: t('storage.drive-health.status.healthy'),
		}
	}
	if (drive.healthStatus === 'failing') {
		if (drive.severity === 'critical') {
			return {
				dotClass: 'bg-[color:var(--red,#dc2626)]',
				textClass: 'text-[color:var(--red,#dc2626)]',
				label: t('storage.drive-health.status.failing-critical'),
			}
		}
		return {
			dotClass: 'bg-[color:#d97706]',
			textClass: 'text-[color:#d97706]',
			label: t('storage.drive-health.status.failing-warning'),
		}
	}
	// healthStatus === 'unavailable' — muted, honest, never green, never omitted.
	return {
		dotClass: 'bg-[color:var(--fg-faint)]',
		textClass: 'text-[color:var(--fg-faint)]',
		label:
			drive.detectionMethod === 'permission-denied'
				? t('storage.drive-health.permission-denied')
				: t('storage.drive-health.unavailable-enclosure'),
	}
}

// Temperature is DISPLAY-ONLY (never a failing/alert state) — just colored.
function driveTempClass(status: SmartDriveUi['temperatureStatus']): string {
	if (status === 'hot') return 'text-[color:var(--red,#dc2626)]'
	if (status === 'warm') return 'text-[color:#d97706]'
	return 'text-[color:var(--fg-faint)]'
}

function driveAttrClass(status: SmartDriveUi['attributes'][number]['status']): string {
	if (status === 'critical') return 'text-[color:var(--red,#dc2626)] border-[color:var(--red,#dc2626)]'
	if (status === 'warning') return 'text-[color:#d97706] border-[color:#d97706]'
	return 'text-[color:var(--fg-faint)] border-line'
}

function DriveHealthBlock() {
	const {drives, isLoading, runSelfTest, isSelfTesting} = useSmartDrives()
	const {isAdmin} = useCurrentUser()

	return (
		<section className='flex flex-col gap-3'>
			<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
				{t('storage.drive-health.title')}
			</span>

			{isLoading ? (
				<FieldCard>
					<div className='flex items-center justify-center gap-2 py-8 text-[color:var(--fg-faint)]'>
						<Loader2 className='size-4 animate-spin' />
						<span className='text-[13px]'>{t('storage.drive-health.scanning')}</span>
					</div>
				</FieldCard>
			) : (drives?.length ?? 0) === 0 ? (
				<FieldCard>
					<FieldRow
						label={t('storage.drive-health.title')}
						value={<span className='text-[color:var(--fg-faint)]'>{t('storage.drive-health.none')}</span>}
					/>
				</FieldCard>
			) : (
				<FieldCard>
					{/* ★ SMART-04: EVERY drive is rendered — unavailable/permission-denied
					    drives are NEVER filtered out (an omitted drive reads as "healthy /
					    not monitored", a false-healthy-adjacent failure). */}
					{drives!.map((drive) => {
						const badge = driveHealthBadge(drive)
						// A drive we could not read cannot be self-tested — hide the trigger
						// (but still render the row with its honest badge, above).
						const canSelfTest = isAdmin && drive.healthStatus !== 'unavailable'
						const selfTestDisabled = drive.selfTestInProgress || isSelfTesting
						return (
							<FieldRow
								key={drive.deviceId}
								label={
									<div className='flex flex-col gap-1'>
										<span className='inline-flex items-center gap-2'>
											<span className={cn('inline-block size-2 shrink-0 rounded-full', badge.dotClass)} />
											<span className={cn('text-[13px] font-medium', badge.textClass)}>{badge.label}</span>
										</span>
										<span
											className='truncate text-[12px] text-[color:var(--fg-faint)]'
											title={`${drive.model} · /dev/${drive.deviceId}`}
										>
											{drive.model || 'Drive'} · /dev/{drive.deviceId}
										</span>
									</div>
								}
								value={
									<div className='flex flex-col gap-1.5'>
										{drive.temperature !== null && (
											<span className={cn('text-[12px]', driveTempClass(drive.temperatureStatus))}>
												{t('storage.drive-health.temperature')}: {drive.temperature}°C
											</span>
										)}
										{drive.attributes.length > 0 && (
											<div className='flex flex-wrap gap-1.5'>
												{drive.attributes.map((attr) => (
													<span
														key={attr.key}
														title={attr.label}
														className={cn(
															'rounded-[3px] border px-1.5 py-0.5 text-[11px] leading-none',
															driveAttrClass(attr.status),
														)}
													>
														{attr.label}: {attr.raw}
													</span>
												))}
											</div>
										)}
									</div>
								}
								trailing={
									canSelfTest ? (
										<Button
											variant='v36-ghost'
											size='v36-pill-sm'
											disabled={selfTestDisabled}
											onClick={() => {
												runSelfTest({deviceId: drive.deviceId, mode: 'short'}).catch(() => {})
											}}
										>
											{drive.selfTestInProgress && <Loader2 className='h-3.5 w-3.5 animate-spin' />}
											{t('storage.drive-health.run-self-test')}
										</Button>
									) : undefined
								}
							/>
						)
					})}
				</FieldCard>
			)}
		</section>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK A0.5 — Storage pool + internal drives — Phase 318 POOL-03 / POOL-04
//
// D-14: internal drives listed with SMART health (313) + capacity + a
// pool-membership badge; a triple-gated format action ONLY for NON-pool internal
// drives (via storagePool.formatInternalDevice). A single <PoolWizard/> doubles
// as the setup wizard / status view / replacement-runbook re-entry mode (318-08).
//
// The ENTIRE block is HARD-HIDDEN under WSL2 (donor power-management-section.tsx:
// 106-115) — a Windows-managed WSL2 VM has no real internal-disk topology.
//
// D-12 anti-pattern guard: this block NEVER surfaces raw per-disk mount paths —
// only the pool + the physical drive (model + health + capacity).
// ─────────────────────────────────────────────────────────────────────────────

function StoragePoolBlock() {
	const {pool, isWsl2, runbookStep, eligibleDrives, formatInternalDevice, isFormattingInternal} = useStoragePool()
	const {drives} = useSmartDrives()
	const {isAdmin} = useCurrentUser()

	const [formatTarget, setFormatTarget] = useState<{id: string; name: string} | null>(null)
	const [showWizard, setShowWizard] = useState(false)

	// ── WSL2 HARD-HIDE (D-14) — the whole pooling + internal-drive block is hidden;
	// there is no meaningful internal-disk topology under a Windows-managed VM.
	if (isWsl2) {
		return (
			<section className='flex flex-col gap-3'>
				<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
					{t('storage.pool.disks.title')}
				</span>
				<FieldCard>
					<FieldRow
						label={t('storage.pool.disks.title')}
						value={<span className='text-[color:var(--fg-faint)]'>{t('storage.pool.disks.wsl2-note')}</span>}
					/>
				</FieldCard>
			</section>
		)
	}

	const memberIds = new Set((pool?.members ?? []).map((m) => m.deviceId))
	// A device with an in-flight runbook is blocked from any competing format —
	// the server (318-05) enforces it; the UI mirrors it (T-318-18).
	const runbookInFlight = !!runbookStep
	// Internal drives only — the SMART enumeration is the source of truth for
	// internal-disk health/topology; USB drives live in their own block.
	const internalDrives = (drives ?? []).filter((d) => d.transport !== 'usb')
	// Capacity is available for NON-pool internal drives via listEligibleDrives.
	const sizeById = new Map((eligibleDrives ?? []).map((d) => [d.id, d.size]))
	// 331-04 (FIX-04, closes 318-09 D-14): pool MEMBERS may drop out of the
	// eligible projection, which left their capacity cell blank — their size now
	// rides on the persisted PoolMember contract (createPool/addDisk capture it).
	for (const member of pool?.members ?? []) {
		if (member.size !== undefined && !sizeById.has(member.deviceId)) {
			sizeById.set(member.deviceId, member.size)
		}
	}

	const hasPool = !!pool?.members?.length && !pool.incomplete
	// The single <PoolWizard/> opens for: an existing pool (status view), an
	// in-flight replacement runbook (resume), or when the operator starts setup.
	const wizardOpen = showWizard || hasPool || runbookInFlight

	return (
		<section className='flex flex-col gap-3'>
			<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
				{t('storage.pool.disks.title')}
			</span>

			{/* Pool setup / status / replacement-runbook — one <PoolWizard/> (318-08). */}
			{wizardOpen ? (
				<FieldCard>
					<div className='p-1'>
						<PoolWizard onDone={() => setShowWizard(false)} />
					</div>
				</FieldCard>
			) : (
				<FieldCard>
					<FieldRow
						label={t('storage.pool.disks.protect.title')}
						value={<span className='text-[color:var(--fg-faint)]'>{t('storage.pool.disks.protect.description')}</span>}
						trailing={
							<Button variant='v36-ghost' size='v36-pill-sm' onClick={() => setShowWizard(true)}>
								{t('storage.pool.disks.protect.action')}
							</Button>
						}
					/>
				</FieldCard>
			)}

			{/* Internal drives — health + capacity + pool-membership badge. */}
			{internalDrives.length === 0 ? (
				<FieldCard>
					<FieldRow
						label={t('storage.pool.disks.drives-title')}
						value={<span className='text-[color:var(--fg-faint)]'>{t('storage.pool.disks.none')}</span>}
					/>
				</FieldCard>
			) : (
				<FieldCard>
					{internalDrives.map((drive) => {
						const badge = driveHealthBadge(drive)
						const isMember = memberIds.has(drive.deviceId)
						const size = sizeById.get(drive.deviceId)
						return (
							<FieldRow
								key={drive.deviceId}
								label={
									<div className='flex flex-col gap-1'>
										<span className='inline-flex items-center gap-2'>
											<span className={cn('inline-block size-2 shrink-0 rounded-full', badge.dotClass)} />
											<span className={cn('text-[13px] font-medium', badge.textClass)}>{badge.label}</span>
										</span>
										<span className='truncate text-[12px] text-[color:var(--fg-faint)]' title={drive.model}>
											{drive.model || t('storage.pool.disks.drive-fallback')}
										</span>
									</div>
								}
								value={
									<div className='flex flex-col gap-0.5'>
										{size ? (
											<span className='text-[13px] text-[color:var(--fg-mute)]'>{maybePrettyBytes(size)}</span>
										) : null}
										{isMember ? (
											<span className='inline-flex w-fit items-center rounded-[3px] border border-line px-1.5 py-0.5 text-[11px] leading-none text-[color:var(--fg-mute)]'>
												{t('storage.pool.disks.member-badge')}
											</span>
										) : (
											<span className='text-[12px] text-[color:var(--fg-faint)]'>
												{t('storage.pool.disks.not-in-pool')}
											</span>
										)}
									</div>
								}
								trailing={
									// Format ONLY for NON-pool internal drives the server actually deems
									// eligible (triple-gated), disabled while a replacement runbook is in
									// flight (T-318-18). Pool members are never formattable from here.
									//
									// WR-06: gate on `sizeById.has(deviceId)` — sizeById is built from the
									// server's listEligibleDrives (internal, non-removable, NON-system). A
									// device absent from that set is the OS/boot disk (or removable), which
									// the server refuses to format anyway; showing a "Format" button on the
									// system disk is a dangerous UX affordance (D-10/D-12), so we hide it.
									!isMember && isAdmin && sizeById.has(drive.deviceId) ? (
										<Button
											variant='v36-ghost'
											size='v36-pill-sm'
											disabled={runbookInFlight || isFormattingInternal}
											title={runbookInFlight ? t('storage.pool.disks.runbook-note') : undefined}
											onClick={() => setFormatTarget({id: drive.deviceId, name: drive.model || t('storage.pool.disks.drive-fallback')})}
										>
											{t('storage.pool.disks.format')}
										</Button>
									) : undefined
								}
							/>
						)
					})}
				</FieldCard>
			)}

			{runbookInFlight && (
				<p className='text-[12px] leading-[1.5] text-[color:var(--fg-faint)]'>{t('storage.pool.disks.runbook-note')}</p>
			)}

			{/* Format confirm — WIPES a non-pool internal drive (triple-gated server-side). */}
			<FormatInternalDialog
				target={formatTarget}
				isFormatting={isFormattingInternal}
				onCancel={() => setFormatTarget(null)}
				onConfirm={async () => {
					if (!formatTarget) return
					try {
						await formatInternalDevice({deviceId: formatTarget.id})
					} finally {
						setFormatTarget(null)
					}
				}}
			/>
		</section>
	)
}

function FormatInternalDialog({
	target,
	isFormatting,
	onCancel,
	onConfirm,
}: {
	target: {id: string; name: string} | null
	isFormatting: boolean
	onCancel: () => void
	onConfirm: () => void
}) {
	return (
		<AlertDialog open={!!target} onOpenChange={(open) => !open && onCancel()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t('storage.pool.disks.format-confirm.title', {name: target?.name ?? ''})}</AlertDialogTitle>
					<AlertDialogDescription>{t('storage.pool.disks.format-confirm.description')}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogAction variant='destructive' disabled={isFormatting} onClick={onConfirm}>
						{isFormatting ? <Loader2 className='h-4 w-4 animate-spin' /> : t('storage.pool.disks.format-confirm.submit')}
					</AlertDialogAction>
					<AlertDialogCancel>{t('storage.pool.disks.format-confirm.cancel')}</AlertDialogCancel>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK A — USB Drives
// ─────────────────────────────────────────────────────────────────────────────

function UsbDrivesBlock() {
	const {disks, isLoadingExternalStorage, ejectDisk, isEjecting, formatExternalStorageDevice, isFormatting, isExternalStorageSupported} =
		useExternalStorage()

	// AlertDialog state — one disk targeted at a time for eject/format.
	const [ejectTarget, setEjectTarget] = useState<{id: string; name: string} | null>(null)
	const [formatTarget, setFormatTarget] = useState<{id: string; name: string} | null>(null)

	return (
		<section className='flex flex-col gap-3'>
			<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
				USB drives
			</span>

			{!isExternalStorageSupported ? (
				<FieldCard>
					<FieldRow
						label='Unavailable'
						value={
							<span className='text-[color:var(--fg-mute)]'>
								External storage management isn’t supported on this device.
							</span>
						}
					/>
				</FieldCard>
			) : isLoadingExternalStorage ? (
				<FieldCard>
					<div className='flex items-center justify-center gap-2 py-8 text-[color:var(--fg-faint)]'>
						<Loader2 className='size-4 animate-spin' />
						<span className='text-[13px]'>Scanning for drives…</span>
					</div>
				</FieldCard>
			) : (disks?.length ?? 0) === 0 ? (
				<FieldCard>
					<FieldRow
						label='No drives'
						value={<span className='text-[color:var(--fg-faint)]'>Plug in a USB drive to see it here.</span>}
					/>
				</FieldCard>
			) : (
				<FieldCard>
					{disks!.map((d) => {
						const isMounted = d.isMounted
						const isBusy = d.isFormatting
						return (
							<FieldRow
								key={d.id}
								label={
									<span className='truncate' title={d.name}>
										{d.name || 'USB drive'}
									</span>
								}
								value={
									<div className='flex flex-col gap-0.5'>
										<span className='text-[13px] text-[color:var(--fg-mute)]'>{maybePrettyBytes(d.size)}</span>
										<span className='text-[12px] text-[color:var(--fg-faint)]'>
											{isBusy ? 'Formatting…' : isMounted ? 'Mounted' : 'Connected'}
										</span>
									</div>
								}
								trailing={
									<div className='flex items-center gap-2'>
										<Button
											variant='v36-ghost'
											size='v36-pill-sm'
											disabled={isEjecting || isBusy}
											onClick={() => setFormatTarget({id: d.id, name: d.name || 'USB drive'})}
										>
											Format
										</Button>
										<Button
											variant='v36-ghost'
											size='v36-pill-sm'
											disabled={isEjecting || isBusy}
											onClick={() => setEjectTarget({id: d.id, name: d.name || 'USB drive'})}
										>
											Eject
										</Button>
									</div>
								}
							/>
						)
					})}
				</FieldCard>
			)}

			{/* Eject confirm — hard eject. */}
			<AlertDialog open={!!ejectTarget} onOpenChange={(open) => !open && setEjectTarget(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Eject “{ejectTarget?.name}”?</AlertDialogTitle>
						<AlertDialogDescription>
							This is a hard eject. Make sure no files on this drive are open or being copied, otherwise you may lose data.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogAction
							variant='destructive'
							disabled={isEjecting}
							onClick={async () => {
								if (!ejectTarget) return
								try {
									await ejectDisk({deviceId: ejectTarget.id})
								} finally {
									setEjectTarget(null)
								}
							}}
						>
							{isEjecting ? <Loader2 className='h-4 w-4 animate-spin' /> : 'Eject'}
						</AlertDialogAction>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Format confirm — WIPES the drive. */}
			<FormatDriveDialog
				target={formatTarget}
				isFormatting={isFormatting}
				onCancel={() => setFormatTarget(null)}
				onConfirm={async ({filesystem, label}) => {
					if (!formatTarget) return
					try {
						await formatExternalStorageDevice({deviceId: formatTarget.id, filesystem, label})
					} finally {
						setFormatTarget(null)
					}
				}}
			/>
		</section>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 340-02 USBIMP-01 — USB auto-import (copy-on-insert) rule
// A single global opt-in rule (D-340-2 A1): enable toggle + destination folder
// (confined to the owner's tree, validated client-side to the same charset the
// backend enforces) + last-run summary + owner-missing state. adminProcedure
// routes → admin-only block (mirrors the host-storage blocks). Fully t()-driven.
// ─────────────────────────────────────────────────────────────────────────────
function UsbImportBlock() {
	const {isAdmin} = useCurrentUser()
	const {rules, isLoading, saveRule, isSaving, removeRule, isRemoving} = useUsbImport()
	// Owner-resolution for the "owner missing" state (A2): the rule stores an
	// explicit ownerUsername; if that user no longer exists the import is inert.
	const usersQ = trpcReact.user.listAllUsers.useQuery(undefined, {enabled: isAdmin})

	// `null` draft = "mirror the saved rule"; a string = the admin is editing.
	const [draft, setDraft] = useState<string | null>(null)
	const [confirmRemove, setConfirmRemove] = useState(false)

	// adminProcedure routes — hide the block entirely for non-admins.
	if (!isAdmin) return null

	const rule = rules[0]
	const destination = draft ?? rule?.destinationVirtualPath ?? ''
	const trimmed = destination.trim()
	// Reuse the folder-quota client mirror of the server charset (absolute, no `..`).
	const pathValid = FOLDER_QUOTA_PATH_RE.test(trimmed) && !trimmed.split('/').includes('..')

	const ownerMissing = !!rule && !!usersQ.data && !usersQ.data.some((u) => u.username === rule.ownerUsername)

	const eyebrow = (
		<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
			{t('storage.usb-import.title')}
		</span>
	)

	if (isLoading) {
		return (
			<section className='flex flex-col gap-3'>
				{eyebrow}
				<FieldCard>
					<div className='flex items-center justify-center gap-2 py-8 text-[color:var(--fg-faint)]'>
						<Loader2 className='size-4 animate-spin' />
						<span className='text-[13px]'>{t('storage.usb-import.title')}</span>
					</div>
				</FieldCard>
			</section>
		)
	}

	const saveInvalid = () => toast.error(t('storage.usb-import.destination-invalid'))

	// Empty state — no rule yet: choose a destination and create (disabled rule).
	if (!rule) {
		const onCreate = () => {
			if (!pathValid) return saveInvalid()
			saveRule({enabled: false, destinationVirtualPath: trimmed})
				.then(() => setDraft(null))
				.catch(saveInvalid)
		}
		return (
			<section className='flex flex-col gap-3'>
				{eyebrow}
				<FieldCard>
					<FieldRow
						label={t('storage.usb-import.destination-label')}
						value={
							<div className='flex flex-col gap-1.5'>
								<span className='text-[13px] text-[color:var(--fg-faint)]'>{t('storage.usb-import.empty')}</span>
								<Input
									value={destination}
									onChange={(e) => setDraft(e.target.value)}
									placeholder='/Home/USB Imports'
									spellCheck={false}
								/>
								<span className='text-[12px] text-[color:var(--fg-faint)]'>{t('storage.usb-import.destination-hint')}</span>
							</div>
						}
						trailing={
							<Button variant='v36-ghost' size='v36-pill-sm' disabled={isSaving || !pathValid} onClick={onCreate}>
								{isSaving ? <Loader2 className='h-4 w-4 animate-spin' /> : t('storage.usb-import.create')}
							</Button>
						}
					/>
				</FieldCard>
			</section>
		)
	}

	const onToggle = (next: boolean) => {
		if (next && (!trimmed || !pathValid)) {
			toast.error(t('storage.usb-import.destination-required'))
			return
		}
		saveRule({id: rule.id, enabled: next, destinationVirtualPath: trimmed || rule.destinationVirtualPath}).catch(saveInvalid)
	}

	const onSaveDestination = () => {
		if (!pathValid) return saveInvalid()
		saveRule({id: rule.id, enabled: rule.enabled, destinationVirtualPath: trimmed})
			.then(() => {
				setDraft(null)
				toast.success(t('storage.usb-import.save'))
			})
			.catch(saveInvalid)
	}

	const lastRun = rule.lastRun

	return (
		<section className='flex flex-col gap-3'>
			{eyebrow}
			<FieldCard>
				{/* Enable toggle */}
				<FieldRow
					label={t('storage.usb-import.enable-label')}
					value={<span className='text-[13px] text-[color:var(--fg-faint)]'>{t('storage.usb-import.enable-hint')}</span>}
					trailing={<Switch checked={rule.enabled} onCheckedChange={onToggle} disabled={isSaving} />}
				/>

				{/* Destination folder */}
				<FieldRow
					label={t('storage.usb-import.destination-label')}
					value={
						<div className='flex flex-col gap-1.5'>
							<Input
								value={destination}
								onChange={(e) => setDraft(e.target.value)}
								placeholder='/Home/USB Imports'
								spellCheck={false}
							/>
							<span className='text-[12px] text-[color:var(--fg-faint)]'>{t('storage.usb-import.destination-hint')}</span>
						</div>
					}
					trailing={
						<Button
							variant='v36-ghost'
							size='v36-pill-sm'
							disabled={isSaving || !pathValid || trimmed === rule.destinationVirtualPath}
							onClick={onSaveDestination}
						>
							{isSaving ? <Loader2 className='h-4 w-4 animate-spin' /> : t('storage.usb-import.save')}
						</Button>
					}
				/>

				{/* Last-run summary — only after the first import wrote lastRun. */}
				{lastRun && (
					<FieldRow
						label={t('storage.usb-import.title')}
						value={
							<div className='flex flex-col gap-0.5'>
								<span className={cn('text-[13px]', lastRun.failed > 0 && 'text-[color:#d97706]')}>
									{t('storage.usb-import.last-run', {
										copied: lastRun.copied,
										failed: lastRun.failed,
										skipped: lastRun.skipped,
									})}
								</span>
								<span className='text-[12px] text-[color:var(--fg-faint)]'>
									{t('storage.usb-import.last-run-where', {path: lastRun.destinationPath})} ·{' '}
									{new Date(lastRun.at).toLocaleString()}
								</span>
							</div>
						}
					/>
				)}

				{/* Owner-missing (A2) — the stored owner no longer exists → the rule is inert. */}
				{ownerMissing && (
					<FieldRow
						label={
							<span className='inline-flex w-fit items-center rounded-[3px] border border-[color:#d97706] px-1.5 py-0.5 text-[11px] leading-none text-[color:#d97706]'>
								{t('storage.usb-import.title')}
							</span>
						}
						value={
							<span className='text-[13px] text-[color:#d97706]'>
								{t('storage.usb-import.owner-missing', {user: rule.ownerUsername})}
							</span>
						}
						trailing={
							<Button
								variant='v36-ghost'
								size='v36-pill-sm'
								disabled={isRemoving}
								onClick={() => setConfirmRemove(true)}
							>
								{t('storage.usb-import.remove')}
							</Button>
						}
					/>
				)}
			</FieldCard>

			{/* Remove-rule affordance (always available so a bad/inert rule is recoverable). */}
			{!ownerMissing && (
				<div className='flex justify-end'>
					<Button variant='v36-ghost' size='v36-pill-sm' disabled={isRemoving} onClick={() => setConfirmRemove(true)}>
						{t('storage.usb-import.remove')}
					</Button>
				</div>
			)}

			{/* Remove confirm — light (deletes the rule config; no files touched). */}
			<AlertDialog open={confirmRemove} onOpenChange={(open) => !open && setConfirmRemove(false)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('storage.usb-import.remove')}</AlertDialogTitle>
						<AlertDialogDescription>{t('storage.usb-import.remove-body')}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogAction
							variant='destructive'
							disabled={isRemoving}
							onClick={async () => {
								try {
									await removeRule({id: rule.id})
									setDraft(null)
								} finally {
									setConfirmRemove(false)
								}
							}}
						>
							{isRemoving ? <Loader2 className='h-4 w-4 animate-spin' /> : t('storage.usb-import.remove')}
						</AlertDialogAction>
						<AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	)
}

function FormatDriveDialog({
	target,
	isFormatting,
	onCancel,
	onConfirm,
}: {
	target: {id: string; name: string} | null
	isFormatting: boolean
	onCancel: () => void
	onConfirm: (input: {filesystem: Filesystem; label: string}) => void
}) {
	const [filesystem, setFilesystem] = useState<Filesystem>('ext4')
	const [label, setLabel] = useState('')

	const trimmed = label.trim()
	const labelValid = LABEL_PATTERN.test(trimmed)

	return (
		<AlertDialog
			open={!!target}
			onOpenChange={(open) => {
				if (!open) {
					setFilesystem('ext4')
					setLabel('')
					onCancel()
				}
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Format “{target?.name}”?</AlertDialogTitle>
					<AlertDialogDescription>
						This permanently erases everything on the drive. This action cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className='flex flex-col gap-4 text-left'>
					<label className='flex flex-col gap-1.5'>
						<span className='text-[13px] font-medium text-text-secondary'>Filesystem</span>
						<Select value={filesystem} onValueChange={(v) => setFilesystem(v as Filesystem)}>
							<SelectTrigger>
								<SelectValue placeholder='Select a filesystem' />
							</SelectTrigger>
							<SelectContent>
								{FILESYSTEM_OPTIONS.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</label>

					<label className='flex flex-col gap-1.5'>
						<span className='text-[13px] font-medium text-text-secondary'>Drive label</span>
						<Input
							value={label}
							onValueChange={setLabel}
							placeholder='My Drive'
							maxLength={11}
						/>
						<span className='text-[12px] text-text-tertiary'>
							1–11 characters. Letters, numbers, spaces, hyphens and underscores only.
						</span>
					</label>
				</div>

				<AlertDialogFooter>
					<AlertDialogAction
						variant='destructive'
						disabled={!labelValid || isFormatting}
						onClick={() => onConfirm({filesystem, label: trimmed})}
					>
						{isFormatting ? <Loader2 className='h-4 w-4 animate-spin' /> : 'Erase & format'}
					</AlertDialogAction>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK B — Network shares (SMB)
// ─────────────────────────────────────────────────────────────────────────────

function NetworkSharesBlock() {
	const {shares, isLoadingShares, removeHostOrShare, isRemovingShare} = useNetworkStorage({suppressNavigateOnAdd: true})
	const [showAdd, setShowAdd] = useState(false)
	const [removeTarget, setRemoveTarget] = useState<{path: string; label: string} | null>(null)

	return (
		<section className='flex flex-col gap-3'>
			<div className='flex items-baseline justify-between gap-2'>
				<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
					Network shares
				</span>
				<Button variant='v36-ghost' size='v36-pill-sm' onClick={() => setShowAdd(true)}>
					Add share
				</Button>
			</div>

			{isLoadingShares ? (
				<FieldCard>
					<div className='flex items-center justify-center gap-2 py-8 text-[color:var(--fg-faint)]'>
						<Loader2 className='size-4 animate-spin' />
						<span className='text-[13px]'>Loading network shares…</span>
					</div>
				</FieldCard>
			) : (shares?.length ?? 0) === 0 ? (
				<FieldCard>
					<FieldRow
						label='No shares'
						value={<span className='text-[color:var(--fg-faint)]'>Connect a network (SMB) share to access it from Files.</span>}
					/>
				</FieldCard>
			) : (
				<FieldCard>
					{shares!.map((s) => (
						<FieldRow
							key={s.mountPath}
							label={
								<span className='truncate' title={`${s.host}/${s.share}`}>
									{s.share}
								</span>
							}
							value={
								<div className='flex flex-col gap-0.5 min-w-0'>
									<span className='truncate text-[13px] text-[color:var(--fg-mute)]' title={s.host}>
										{s.host}
									</span>
									<span className='text-[12px] text-[color:var(--fg-faint)]'>
										{s.isMounted ? 'Mounted' : 'Not mounted'}
									</span>
								</div>
							}
							trailing={
								<Button
									variant='v36-ghost'
									size='v36-pill-sm'
									disabled={isRemovingShare}
									onClick={() => setRemoveTarget({path: s.mountPath, label: `${s.host}/${s.share}`})}
								>
									Remove
								</Button>
							}
						/>
					))}
				</FieldCard>
			)}

			{/* Controlled add-share dialog — suppress navigation so we stay in Settings. */}
			<AddNetworkShareDialog open={showAdd} onOpenChange={setShowAdd} suppressNavigateOnAdd onAdded={() => setShowAdd(false)} />

			{/* Remove confirm — light. */}
			<AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove “{removeTarget?.label}”?</AlertDialogTitle>
						<AlertDialogDescription>
							This unmounts the network share from this device. The files on the remote server are not affected.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogAction
							variant='destructive'
							disabled={isRemovingShare}
							onClick={async () => {
								if (!removeTarget) return
								try {
									await removeHostOrShare(removeTarget.path)
								} finally {
									setRemoveTarget(null)
								}
							}}
						>
							{isRemovingShare ? <Loader2 className='h-4 w-4 animate-spin' /> : 'Remove'}
						</AlertDialogAction>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK C — Folder sharing (Samba)
// ─────────────────────────────────────────────────────────────────────────────

function FolderSharingBlock() {
	const utils = trpcReact.useUtils()
	const sharesQ = trpcReact.files.shares.useQuery()
	const passwordQ = trpcReact.files.sharePassword.useQuery()
	const removeShareMut = trpcReact.files.removeShare.useMutation({
		onSuccess: () => utils.files.shares.invalidate(),
	})

	const [revealPassword, setRevealPassword] = useState(false)
	const [copied, setCopied] = useState(false)
	const [stopTarget, setStopTarget] = useState<{path: string; label: string} | null>(null)

	const shares = sharesQ.data

	const handleCopy = async () => {
		if (!passwordQ.data) return
		try {
			await navigator.clipboard.writeText(passwordQ.data)
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		} catch {
			// clipboard may be unavailable — silently ignore
		}
	}

	return (
		<section className='flex flex-col gap-3'>
			<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
				Folder sharing
			</span>

			<FieldCard>
				{/* SMB password reveal row */}
				<FieldRow
					label='SMB password'
					value={
						passwordQ.isLoading ? (
							<span className='inline-flex items-center gap-2 text-[color:var(--fg-faint)]'>
								<Loader2 className='size-3.5 animate-spin' /> Loading…
							</span>
						) : passwordQ.data ? (
							<span className='font-mono tracking-[0.04em] text-[color:var(--fg-mute)] break-all'>
								{revealPassword ? passwordQ.data : '••••••••••••'}
							</span>
						) : (
							<span className='text-[color:var(--fg-faint)]'>—</span>
						)
					}
					trailing={
						<div className='flex items-center gap-2'>
							<Button
								variant='v36-ghost'
								size='v36-pill-sm'
								disabled={!passwordQ.data}
								onClick={() => setRevealPassword((v) => !v)}
							>
								{revealPassword ? <TbEyeOff className='h-3.5 w-3.5' /> : <TbEye className='h-3.5 w-3.5' />}
								{revealPassword ? 'Hide' : 'Reveal'}
							</Button>
							<Button
								variant='v36-ghost'
								size='v36-pill-sm'
								disabled={!passwordQ.data}
								onClick={handleCopy}
							>
								{copied ? <TbCheck className='h-3.5 w-3.5' /> : <TbCopy className='h-3.5 w-3.5' />}
								{copied ? 'Copied' : 'Copy'}
							</Button>
						</div>
					}
				/>

				{/* Shared folders list */}
				{sharesQ.isLoading ? (
					<div className='flex items-center justify-center gap-2 py-8 text-[color:var(--fg-faint)]'>
						<Loader2 className='size-4 animate-spin' />
						<span className='text-[13px]'>Loading shared folders…</span>
					</div>
				) : (shares?.length ?? 0) === 0 ? (
					<FieldRow
						label='No shared folders'
						value={
							<span className='text-[color:var(--fg-faint)]'>
								Share folders from the Files app (right-click → Share).
							</span>
						}
					/>
				) : (
					shares!.map((s) => (
						<FieldRow
							key={s.path}
							label={
								<span className='truncate' title={s.path}>
									{s.name}
								</span>
							}
							value={
								<div className='flex flex-col gap-0.5 min-w-0'>
									<span className='truncate text-[13px] text-[color:var(--fg-mute)]' title={s.sharename}>
										{s.sharename}
									</span>
									<span className='truncate text-[12px] text-[color:var(--fg-faint)]' title={s.path}>
										{s.path}
									</span>
								</div>
							}
							trailing={
								<Button
									variant='v36-ghost'
									size='v36-pill-sm'
									disabled={removeShareMut.isPending}
									onClick={() => setStopTarget({path: s.path, label: s.name})}
								>
									Stop sharing
								</Button>
							}
						/>
					))
				)}
			</FieldCard>

			{/* Add note — folder sharing originates from the Files app. */}
			<p className='text-[12px] leading-[1.5] text-[color:var(--fg-faint)]'>
				Share folders from the Files app (right-click → Share). Connect using the SMB password above.
			</p>

			{/* Stop sharing confirm — light. */}
			<AlertDialog open={!!stopTarget} onOpenChange={(open) => !open && setStopTarget(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Stop sharing “{stopTarget?.label}”?</AlertDialogTitle>
						<AlertDialogDescription>
							This folder will no longer be reachable over the network. The files themselves are not changed.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogAction
							variant='destructive'
							disabled={removeShareMut.isPending}
							onClick={async () => {
								if (!stopTarget) return
								try {
									await removeShareMut.mutateAsync({path: stopTarget.path})
								} finally {
									setStopTarget(null)
								}
							}}
						>
							{removeShareMut.isPending ? <Loader2 className='h-4 w-4 animate-spin' /> : 'Stop sharing'}
						</AlertDialogAction>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK D — Encrypted disks (Phase 339-03 STORD-02, D-339-2)
//
// Whole-disk LUKS2 for STANDALONE new/empty internal disks. Admin-only (every
// route is adminProcedure; luksFormat is additionally step-up-gated). The ENTIRE
// block is HARD-HIDDEN under WSL2 (donor StoragePoolBlock @307) — a Windows-managed
// VM has no real block-device topology.
//
// Create wizard: pick eligible disk → typed-confirm (type the device id, STRICT
// equality) → passphrase (client min 12; server re-checks) → system.luksFormat
// (via the 334 useStepUp().withStepUp retry) → recovery-key-shown-once modal
// (typed ack required to dismiss). Per-disk Locked/Unlocked cards + a lock/unlock
// flow. The passphrase + recovery key live in TRANSIENT component state ONLY —
// never the shared store, a query-cache key, or a persisted field; wiped on close.
// Manual re-unlock is the lockout-safe default (nothing auto-mounts at boot).
// ─────────────────────────────────────────────────────────────────────────────

// The never-throw discriminated result the LUKS routes return (mirrors runLuks).
type LuksProbe = {ok: true; stdout: string} | {ok: false; reason: string}

// Locked/Unlocked/unknown → dot color + label, in the same 3-state visual language
// as driveHealthBadge. A LOCKED disk is LOUD (amber) because it needs an unlock
// (D-339-2); an unreadable probe is muted/faint (never a false "unlocked").
function luksStatusBadge(status: LuksProbe): {dotClass: string; textClass: string; label: string; locked: boolean} {
	if (status.ok && status.stdout.trim() === 'unlocked') {
		return {
			dotClass: 'bg-[color:var(--fg)]',
			textClass: 'text-[color:var(--fg-mute)]',
			label: t('storage.disk-encryption.badge.unlocked'),
			locked: false,
		}
	}
	if (status.ok && status.stdout.trim() === 'locked') {
		return {
			dotClass: 'bg-[color:#d97706]',
			textClass: 'text-[color:#d97706]',
			label: t('storage.disk-encryption.badge.locked'),
			locked: true,
		}
	}
	// Not-ok (cryptsetup missing / probe error) — muted, honest, treated as locked.
	return {
		dotClass: 'bg-[color:var(--fg-faint)]',
		textClass: 'text-[color:var(--fg-faint)]',
		label: t('storage.disk-encryption.failed'),
		locked: true,
	}
}

function DiskEncryptionBlock() {
	const {isAdmin} = useCurrentUser()
	const {isWsl2} = useStoragePool()
	const utils = trpcReact.useUtils()
	// adminProcedure + WSL2-meaningless → only fetch when it can actually resolve.
	const enabled = isAdmin && !isWsl2
	const listQ = trpcReact.system.luksList.useQuery(undefined, {enabled})
	const eligibleQ = trpcReact.system.luksListEligible.useQuery(undefined, {enabled})

	const [showCreate, setShowCreate] = useState(false)
	const [unlockTarget, setUnlockTarget] = useState<{deviceId: string; label?: string} | null>(null)

	const lockMut = trpcReact.system.luksClose.useMutation({
		onSuccess: (result) => {
			if (result.ok) {
				utils.system.luksList.invalidate()
			} else {
				// EBUSY / in-use → soft "in use" message; never a force (mirrors gocryptfs lock UX).
				const busy = /busy|in use|ebusy/i.test(result.reason)
				toast.error(busy ? t('storage.disk-encryption.busy') : `${t('storage.disk-encryption.failed')} ${result.reason}`)
			}
		},
		onError: (error) => toast.error(error.message),
	})

	// adminProcedure routes — the block is a no-op for non-admins.
	if (!isAdmin) return null

	// ── WSL2 HARD-HIDE — whole-disk LUKS is meaningless without real block topology.
	if (isWsl2) {
		return (
			<section className='flex flex-col gap-3'>
				<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
					{t('storage.disk-encryption.title')}
				</span>
				<FieldCard>
					<FieldRow
						label={t('storage.disk-encryption.title')}
						value={<span className='text-[color:var(--fg-faint)]'>{t('storage.disk-encryption.wsl2-unavailable')}</span>}
					/>
				</FieldCard>
			</section>
		)
	}

	const disks = listQ.data?.disks ?? []
	const eligible = eligibleQ.data
	const canCreate = eligible?.ok === true && eligible.drives.length > 0

	return (
		<section className='flex flex-col gap-3'>
			<div className='flex items-baseline justify-between gap-2'>
				<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
					{t('storage.disk-encryption.title')}
				</span>
				{canCreate && (
					<Button variant='v36-ghost' size='v36-pill-sm' onClick={() => setShowCreate(true)}>
						{t('storage.disk-encryption.create')}
					</Button>
				)}
			</div>

			{/* Registered encrypted disks (default state after reboot is Locked). */}
			{listQ.isLoading ? (
				<FieldCard>
					<div className='flex items-center justify-center gap-2 py-8 text-[color:var(--fg-faint)]'>
						<Loader2 className='size-4 animate-spin' />
						<span className='text-[13px]'>{t('storage.disk-encryption.loading')}</span>
					</div>
				</FieldCard>
			) : disks.length === 0 ? (
				<FieldCard>
					<FieldRow
						label={t('storage.disk-encryption.title')}
						value={<span className='text-[color:var(--fg-faint)]'>{t('storage.disk-encryption.none')}</span>}
					/>
				</FieldCard>
			) : (
				<FieldCard>
					{disks.map((disk) => {
						const badge = luksStatusBadge(disk.status)
						return (
							<FieldRow
								key={disk.deviceId}
								label={
									<div className='flex flex-col gap-1'>
										<span className='inline-flex items-center gap-2'>
											<span className={cn('inline-block size-2 shrink-0 rounded-full', badge.dotClass)} />
											<span className={cn('text-[13px] font-medium', badge.textClass)}>{badge.label}</span>
										</span>
										<span
											className='truncate text-[12px] text-[color:var(--fg-faint)]'
											title={`${disk.label || disk.deviceId} · /dev/${disk.deviceId}`}
										>
											{disk.label || disk.deviceId} · /dev/{disk.deviceId}
										</span>
									</div>
								}
								value={
									<span className='truncate text-[12px] text-[color:var(--fg-faint)]' title={disk.mountpoint}>
										{disk.mountpoint}
									</span>
								}
								trailing={
									badge.locked ? (
										<Button
											variant='v36-ghost'
											size='v36-pill-sm'
											onClick={() => setUnlockTarget({deviceId: disk.deviceId, label: disk.label})}
										>
											<TbLockOpen className='h-3.5 w-3.5' />
											{t('storage.disk-encryption.unlock')}
										</Button>
									) : (
										<Button
											variant='v36-ghost'
											size='v36-pill-sm'
											disabled={lockMut.isPending}
											onClick={() => lockMut.mutate({deviceId: disk.deviceId})}
										>
											<TbLock className='h-3.5 w-3.5' />
											{t('storage.disk-encryption.lock')}
										</Button>
									)
								}
							/>
						)
					})}
				</FieldCard>
			)}

			{/* Eligibility notes — fail-closed "cannot list" vs "nothing eligible". */}
			{eligible?.ok === false ? (
				<p className='text-[12px] leading-[1.5] text-[color:var(--fg-faint)]'>{t('storage.disk-encryption.cannot-list')}</p>
			) : eligible?.ok === true && eligible.drives.length === 0 ? (
				<p className='text-[12px] leading-[1.5] text-[color:var(--fg-faint)]'>{t('storage.disk-encryption.none-eligible')}</p>
			) : null}

			<p className='text-[12px] leading-[1.5] text-[color:var(--fg-faint)]'>{t('storage.disk-encryption.description')}</p>

			{/* Create wizard — mounted only while open so its secret-bearing state is
			    fresh on mount + fully discarded on unmount. */}
			{showCreate && eligible?.ok === true && (
				<DiskEncryptionCreateDialog
					eligible={eligible.drives}
					onClose={() => setShowCreate(false)}
					onCreated={() => utils.system.luksList.invalidate()}
				/>
			)}

			{/* Unlock card — likewise mounted only while a target is set. */}
			{unlockTarget && (
				<DiskEncryptionUnlockDialog
					target={unlockTarget}
					onClose={() => setUnlockTarget(null)}
					onUnlocked={() => utils.system.luksList.invalidate()}
				/>
			)}
		</section>
	)
}

function DiskEncryptionCreateDialog({
	eligible,
	onClose,
	onCreated,
}: {
	eligible: {id: string; model: string; size: number}[]
	onClose: () => void
	onCreated: () => void
}) {
	const {withStepUp} = useStepUp()
	const [step, setStep] = useState<'pick' | 'confirm' | 'passphrase' | 'recovery'>('pick')
	const [deviceId, setDeviceId] = useState(eligible[0]?.id ?? '')
	const [label, setLabel] = useState('')
	const [typed, setTyped] = useState('')
	const [passphrase, setPassphrase] = useState('')
	const [passphraseConfirm, setPassphraseConfirm] = useState('')
	const [localError, setLocalError] = useState('')
	// Transient, shown-ONCE secrets — never persisted anywhere.
	const [recoveryKey, setRecoveryKey] = useState('')
	const [savedAck, setSavedAck] = useState('')

	const formatMut = trpcReact.system.luksFormat.useMutation({
		onError: (error) => {
			// The first attempt's STEP_UP_REQUIRED denial opens the re-auth modal — it
			// must never surface as an error toast (334-03 pattern).
			if (isStepUpRequired(error)) return
			toast.error(error.message)
		},
	})

	const busy = formatMut.isPending
	// STRICT equality typed-confirm (NO trim/lowercase/normalize) — the value here is
	// the device id (doubles as "did I pick the right disk"); reuses the factory-reset
	// type-to-confirm discipline (typed-confirm.ts) applied to a dynamic value.
	const typedConfirmed = typed === deviceId
	// The recovery-key modal can only be dismissed once the operator types the exact
	// ack phrase — STRICT equality against the localized confirm string.
	const savedConfirmed = savedAck === t('storage.disk-encryption.recovery-key-saved-confirm')

	const handleClose = () => {
		// Wipe every secret-bearing surface before unmount.
		setPassphrase('')
		setPassphraseConfirm('')
		setRecoveryKey('')
		setSavedAck('')
		formatMut.reset()
		onClose()
	}

	const handleFormat = async () => {
		setLocalError('')
		if (passphrase.length < 12) {
			setLocalError(t('storage.disk-encryption.passphrase-hint'))
			return
		}
		if (passphrase !== passphraseConfirm) {
			setLocalError(t('storage.disk-encryption.passphrase-mismatch'))
			return
		}
		try {
			const result = await withStepUp(() =>
				formatMut.mutateAsync({deviceId, passphrase, label: label.trim() || undefined}),
			)
			if (result.ok) {
				setRecoveryKey(result.recoveryKey)
				// The passphrase is no longer needed once the disk exists — wipe it now.
				setPassphrase('')
				setPassphraseConfirm('')
				onCreated()
				setStep('recovery')
			} else {
				setLocalError(`${t('storage.disk-encryption.failed')} ${result.reason}`)
			}
		} catch {
			// Dismissed step-up modal (StepUpCancelledError) or an already-toasted
			// failure — leave the dialog on the passphrase step so the operator can retry.
		}
	}

	const selected = eligible.find((d) => d.id === deviceId)

	return (
		<AlertDialog
			open
			onOpenChange={(nextOpen) => {
				// The recovery-key step must NOT close until the ack is typed.
				if (nextOpen || step === 'recovery') return
				handleClose()
			}}
		>
			<AlertDialogContent className='max-sm:px-4'>
				<AlertDialogHeader>
					<AlertDialogTitle>{t('storage.disk-encryption.create-title')}</AlertDialogTitle>
					{step !== 'recovery' && (
						<AlertDialogDescription>{t('storage.disk-encryption.description')}</AlertDialogDescription>
					)}
				</AlertDialogHeader>

				<div className='flex flex-col gap-4 text-left'>
					{step === 'pick' && (
						<>
							<label className='flex flex-col gap-1.5'>
								<span className='text-[13px] font-medium text-text-secondary'>{t('storage.disk-encryption.pick-disk')}</span>
								<Select value={deviceId} onValueChange={setDeviceId}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{eligible.map((d) => (
											<SelectItem key={d.id} value={d.id}>
												{(d.model || 'Drive') + ' · ' + maybePrettyBytes(d.size) + ' · /dev/' + d.id}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</label>
							<label className='flex flex-col gap-1.5'>
								<span className='text-[13px] font-medium text-text-secondary'>{t('storage.disk-encryption.label-label')}</span>
								<Input value={label} onValueChange={setLabel} placeholder={t('storage.disk-encryption.label-placeholder')} maxLength={64} />
							</label>
						</>
					)}

					{step === 'confirm' && (
						<>
							<p className='text-[13px] font-medium text-[color:var(--red,#dc2626)]'>
								{t('storage.disk-encryption.erase-warning')}
							</p>
							<label className='flex flex-col gap-1.5'>
								<span className='text-[13px] font-medium text-text-secondary'>
									{t('storage.disk-encryption.typed-confirm-label')}
								</span>
								<Input
									value={typed}
									onValueChange={setTyped}
									placeholder={deviceId}
									autoComplete='off'
									autoFocus
								/>
							</label>
						</>
					)}

					{step === 'passphrase' && (
						<>
							<label className='flex flex-col gap-1.5'>
								<span className='text-[13px] font-medium text-text-secondary'>{t('storage.disk-encryption.passphrase')}</span>
								<Input
									type='password'
									value={passphrase}
									onValueChange={setPassphrase}
									autoComplete='new-password'
									autoFocus
									disabled={busy}
								/>
							</label>
							<label className='flex flex-col gap-1.5'>
								<span className='text-[13px] font-medium text-text-secondary'>{t('storage.disk-encryption.passphrase-confirm')}</span>
								<Input
									type='password'
									value={passphraseConfirm}
									onValueChange={setPassphraseConfirm}
									autoComplete='new-password'
									disabled={busy}
								/>
								<span className='text-[12px] text-text-tertiary'>{t('storage.disk-encryption.passphrase-hint')}</span>
							</label>
						</>
					)}

					{step === 'recovery' && (
						<div className='flex flex-col gap-3'>
							<span className='text-[13px] font-medium text-text-primary'>{t('storage.disk-encryption.recovery-key-title')}</span>
							<div className='flex items-start gap-2 rounded-[var(--r-sm)] border border-[#d97706]/60 bg-[#d97706]/10 p-3'>
								<code className='min-w-0 flex-1 select-all whitespace-pre-wrap break-all font-mono text-[12px] text-text-primary'>
									{recoveryKey}
								</code>
								<button
									type='button'
									onClick={() => {
										if (recoveryKey) void navigator.clipboard?.writeText(recoveryKey)
									}}
									className='flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-text-secondary hover:bg-surface-1'
								>
									<TbCopy className='h-4 w-4' />
									{t('storage.disk-encryption.copy-key')}
								</button>
							</div>
							<p className='text-[12px] leading-[1.5] text-[color:#d97706]'>{t('storage.disk-encryption.recovery-key-warning')}</p>
							<p className='text-[12px] leading-[1.5] text-[color:var(--fg-faint)]'>{t('storage.disk-encryption.no-recovery')}</p>
							<label className='flex flex-col gap-1.5'>
								<span className='text-[12px] text-text-secondary'>
									{t('storage.disk-encryption.recovery-key-saved-hint', {phrase: t('storage.disk-encryption.recovery-key-saved-confirm')})}
								</span>
								<Input value={savedAck} onValueChange={setSavedAck} autoComplete='off' placeholder={t('storage.disk-encryption.recovery-key-saved-confirm')} />
							</label>
						</div>
					)}

					{localError ? <p className='text-[12px] text-[color:var(--red,#dc2626)]'>{localError}</p> : null}
				</div>

				<AlertDialogFooter>
					{step === 'pick' && (
						<>
							<Button variant='v36-ghost' size='dialog' disabled={!deviceId} onClick={() => setStep('confirm')}>
								{t('storage.disk-encryption.continue')}
							</Button>
							<Button variant='default' size='dialog' onClick={handleClose}>
								{t('cancel')}
							</Button>
						</>
					)}
					{step === 'confirm' && (
						<>
							<Button variant='destructive' size='dialog' disabled={!typedConfirmed} onClick={() => setStep('passphrase')}>
								{t('storage.disk-encryption.continue')}
							</Button>
							<Button variant='default' size='dialog' onClick={() => setStep('pick')}>
								{t('storage.disk-encryption.back')}
							</Button>
						</>
					)}
					{step === 'passphrase' && (
						<>
							<Button variant='destructive' size='dialog' disabled={busy} onClick={handleFormat}>
								{busy ? <Loader2 className='h-4 w-4 animate-spin' /> : t('storage.disk-encryption.create-submit')}
							</Button>
							<Button variant='default' size='dialog' disabled={busy} onClick={() => setStep('confirm')}>
								{t('storage.disk-encryption.back')}
							</Button>
						</>
					)}
					{step === 'recovery' && (
						<Button variant='primary' size='dialog' disabled={!savedConfirmed} onClick={handleClose}>
							{t('storage.disk-encryption.recovery-key-saved')}
						</Button>
					)}
				</AlertDialogFooter>

				{/* Selected-disk hint on the pick step (below the fold, non-interactive). */}
				{step === 'pick' && selected ? (
					<span className='text-[11px] text-[color:var(--fg-faint)]'>
						/dev/{selected.id} · {maybePrettyBytes(selected.size)}
					</span>
				) : null}
			</AlertDialogContent>
		</AlertDialog>
	)
}

function DiskEncryptionUnlockDialog({
	target,
	onClose,
	onUnlocked,
}: {
	target: {deviceId: string; label?: string}
	onClose: () => void
	onUnlocked: () => void
}) {
	// Transient secret — accepts the passphrase OR the recovery key (same keyslots).
	const [secret, setSecret] = useState('')
	const [reason, setReason] = useState('')

	const openMut = trpcReact.system.luksOpen.useMutation({
		onError: (error) => setReason(error.message),
	})

	const handleClose = () => {
		setSecret('')
		setReason('')
		openMut.reset()
		onClose()
	}

	const handleUnlock = async () => {
		setReason('')
		try {
			const result = await openMut.mutateAsync({deviceId: target.deviceId, passphrase: secret})
			if (result.ok) {
				onUnlocked()
				handleClose()
			} else {
				setReason(result.reason)
			}
		} catch {
			// error already surfaced via onError → reason
		}
	}

	const busy = openMut.isPending

	return (
		<AlertDialog open onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t('storage.disk-encryption.unlock-title', {name: target.label || target.deviceId})}</AlertDialogTitle>
					<AlertDialogDescription>{t('storage.disk-encryption.unlock-body')}</AlertDialogDescription>
				</AlertDialogHeader>

				<div className='flex flex-col gap-2 text-left'>
					<Input
						type='password'
						value={secret}
						onValueChange={setSecret}
						autoComplete='off'
						autoFocus
						disabled={busy}
						placeholder={t('storage.disk-encryption.unlock-placeholder')}
					/>
					<span className='text-[12px] text-[color:var(--fg-faint)]'>{t('storage.disk-encryption.no-recovery')}</span>
					{reason ? <p className='text-[12px] text-[color:var(--red,#dc2626)]'>{`${t('storage.disk-encryption.failed')} ${reason}`}</p> : null}
				</div>

				<AlertDialogFooter>
					<Button variant='primary' size='dialog' disabled={busy || !secret} onClick={handleUnlock}>
						{busy ? <Loader2 className='h-4 w-4 animate-spin' /> : t('storage.disk-encryption.unlock')}
					</Button>
					<Button variant='default' size='dialog' disabled={busy} onClick={handleClose}>
						{t('cancel')}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK E — Folder quotas (Phase 339-03 STORD-01)
//
// Admin-only per-FOLDER storage caps — extends the shipped per-user quota +
// du-scan pattern (325). Each row shows the folder path, a usage bar from the
// scan cache (usageBytes / limitBytes), a warn-only-vs-blocking badge, and
// Edit/Remove. Copy distinguishes "warn only" (default, additive) from "block
// writes at the limit". All routes are adminProcedure — a no-op for members.
// ─────────────────────────────────────────────────────────────────────────────

type FolderQuotaRow = {
	virtualPath: string
	limitBytes: number
	hardBlock: boolean
	usageBytes?: number
	scannedAt?: number
}

// Mirror of the server folderQuotaPathSchema (files/routes.ts) — an absolute
// virtual path, restricted charset, no `..` segment. Client-side pre-validation
// only; the server is the authority.
const FOLDER_QUOTA_PATH_RE = /^\/[A-Za-z0-9 ._/-]+$/

function FolderQuotaBlock() {
	const {isAdmin} = useCurrentUser()
	const utils = trpcReact.useUtils()
	const listQ = trpcReact.files.folderQuotaList.useQuery(undefined, {enabled: isAdmin})

	const [dialogTarget, setDialogTarget] = useState<FolderQuotaRow | 'new' | null>(null)
	const [removeTarget, setRemoveTarget] = useState<FolderQuotaRow | null>(null)

	const removeMut = trpcReact.files.folderQuotaRemove.useMutation({
		onSuccess: () => {
			utils.files.folderQuotaList.invalidate()
			setRemoveTarget(null)
		},
		onError: (error) => toast.error(error.message),
	})

	// adminProcedure routes — no-op for members.
	if (!isAdmin) return null

	const rows = listQ.data ?? []

	return (
		<section className='flex flex-col gap-3'>
			<div className='flex items-baseline justify-between gap-2'>
				<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
					{t('storage.folder-quota.title')}
				</span>
				<Button variant='v36-ghost' size='v36-pill-sm' onClick={() => setDialogTarget('new')}>
					{t('storage.folder-quota.add')}
				</Button>
			</div>

			{listQ.isLoading ? (
				<FieldCard>
					<div className='flex items-center justify-center gap-2 py-8 text-[color:var(--fg-faint)]'>
						<Loader2 className='size-4 animate-spin' />
						<span className='text-[13px]'>{t('storage.folder-quota.loading')}</span>
					</div>
				</FieldCard>
			) : rows.length === 0 ? (
				<FieldCard>
					<FieldRow
						label={t('storage.folder-quota.title')}
						value={<span className='text-[color:var(--fg-faint)]'>{t('storage.folder-quota.none')}</span>}
					/>
				</FieldCard>
			) : (
				<FieldCard>
					{rows.map((row) => {
						const hasLimit = row.limitBytes > 0
						const used = row.usageBytes ?? 0
						const pct = hasLimit ? Math.max(0, Math.min(1, used / row.limitBytes)) * 100 : 0
						const overSoft = hasLimit && used >= row.limitBytes * QUOTA_SOFT_RATIO
						return (
							<FieldRow
								key={row.virtualPath}
								label={
									<div className='flex flex-col gap-1'>
										<span className='truncate text-[13px] font-medium text-[color:var(--fg)]' title={row.virtualPath}>
											{row.virtualPath}
										</span>
										<span
											className={cn(
												'inline-flex w-fit items-center rounded-[3px] border px-1.5 py-0.5 text-[11px] leading-none',
												row.hardBlock ? 'border-[color:#d97706] text-[color:#d97706]' : 'border-line text-[color:var(--fg-faint)]',
											)}
										>
											{row.hardBlock ? t('storage.folder-quota.blocking') : t('storage.folder-quota.warn-only')}
										</span>
									</div>
								}
								value={
									hasLimit ? (
										<div className='flex flex-col gap-2'>
											<div className='h-1.5 w-full overflow-hidden rounded-[2px] bg-[color:var(--bg-2)]'>
												<div
													className={cn(
														'h-full rounded-[2px] transition-[width] duration-300 ease-out',
														overSoft ? 'bg-[color:var(--red,#dc2626)]' : 'bg-[color:var(--fg)]',
													)}
													style={{width: `${pct}%`}}
												/>
											</div>
											<span className={cn('text-[12px]', overSoft ? 'text-[color:var(--red,#dc2626)]' : 'text-[color:var(--fg-faint)]')}>
												{t('storage.folder-quota.usage', {used: formatBytes(used), limit: formatBytes(row.limitBytes)})}
											</span>
										</div>
									) : (
										<span className='text-[12px] text-[color:var(--fg-faint)]'>{t('storage.folder-quota.unlimited')}</span>
									)
								}
								trailing={
									<div className='flex items-center gap-2'>
										<Button variant='v36-ghost' size='v36-pill-sm' onClick={() => setDialogTarget(row)}>
											{t('storage.folder-quota.edit')}
										</Button>
										<Button
											variant='v36-ghost'
											size='v36-pill-sm'
											disabled={removeMut.isPending}
											onClick={() => setRemoveTarget(row)}
										>
											{t('storage.folder-quota.remove')}
										</Button>
									</div>
								}
							/>
						)
					})}
				</FieldCard>
			)}

			<p className='text-[12px] leading-[1.5] text-[color:var(--fg-faint)]'>{t('storage.folder-quota.description')}</p>

			{/* Add / edit — mounted only while open. */}
			{dialogTarget && (
				<FolderQuotaDialog
					existing={dialogTarget === 'new' ? null : dialogTarget}
					onClose={() => setDialogTarget(null)}
					onSaved={() => utils.files.folderQuotaList.invalidate()}
				/>
			)}

			{/* Remove confirm — light (removes the cap, files untouched). */}
			<AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('storage.folder-quota.remove-title', {path: removeTarget?.virtualPath ?? ''})}</AlertDialogTitle>
						<AlertDialogDescription>{t('storage.folder-quota.remove-body')}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogAction
							variant='destructive'
							disabled={removeMut.isPending}
							onClick={() => {
								if (removeTarget) removeMut.mutate({virtualPath: removeTarget.virtualPath})
							}}
						>
							{removeMut.isPending ? <Loader2 className='h-4 w-4 animate-spin' /> : t('storage.folder-quota.remove')}
						</AlertDialogAction>
						<AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	)
}

function FolderQuotaDialog({
	existing,
	onClose,
	onSaved,
}: {
	existing: FolderQuotaRow | null
	onClose: () => void
	onSaved: () => void
}) {
	const isEdit = existing !== null
	// Seed once on mount (the dialog is mounted only while open).
	const [path, setPath] = useState(existing?.virtualPath ?? '')
	const [gb, setGb] = useState(existing && existing.limitBytes > 0 ? String(Math.round(existing.limitBytes / BYTES_PER_GB)) : '')
	const [hardBlock, setHardBlock] = useState(existing?.hardBlock ?? false)

	const setMut = trpcReact.files.folderQuotaSet.useMutation({
		onSuccess: () => {
			onSaved()
			toast.success(t('storage.folder-quota.save'))
			onClose()
		},
		onError: (error) => toast.error(error.message),
	})

	const trimmedPath = path.trim()
	const pathValid = FOLDER_QUOTA_PATH_RE.test(trimmedPath) && !trimmedPath.split('/').includes('..')

	const handleSave = () => {
		// Empty / non-positive GB = unlimited (send 0 — the backend's clear-cap value).
		const parsed = Number.parseFloat(gb)
		const limitBytes = !Number.isFinite(parsed) || parsed <= 0 ? 0 : Math.round(parsed * BYTES_PER_GB)
		setMut.mutate({virtualPath: trimmedPath, limitBytes, hardBlock})
	}

	return (
		<AlertDialog open onOpenChange={(open) => !open && onClose()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{isEdit ? t('storage.folder-quota.edit-title') : t('storage.folder-quota.add-title')}</AlertDialogTitle>
				</AlertDialogHeader>

				<div className='flex flex-col gap-4 text-left'>
					<label className='flex flex-col gap-1.5'>
						<span className='text-[13px] font-medium text-text-secondary'>{t('storage.folder-quota.folder-label')}</span>
						<Input
							value={path}
							onValueChange={setPath}
							placeholder={t('storage.folder-quota.folder-placeholder')}
							disabled={isEdit}
							autoFocus={!isEdit}
						/>
					</label>

					<label className='flex flex-col gap-1.5'>
						<span className='text-[13px] font-medium text-text-secondary'>{t('storage.folder-quota.limit-label')}</span>
						<Input type='number' inputMode='decimal' min={0} value={gb} onValueChange={setGb} placeholder={t('storage.folder-quota.limit-placeholder')} />
					</label>

					<label className='flex items-start gap-3'>
						<input type='checkbox' checked={hardBlock} onChange={(e) => setHardBlock(e.target.checked)} className='mt-1 size-4 shrink-0' />
						<span className='flex flex-col gap-0.5'>
							<span className='text-[13px] font-medium text-text-secondary'>{t('storage.folder-quota.hard-block-toggle')}</span>
							<span className='text-[12px] text-text-tertiary'>{t('storage.folder-quota.hard-block-help')}</span>
						</span>
					</label>
				</div>

				<AlertDialogFooter>
					{/* Plain buttons (not AlertDialogAction/Cancel): this dialog is mounted
					    only while open, so an auto-closing action would unmount before the
					    mutation's onSuccess can fire. Save closes via onSuccess → onClose. */}
					<Button variant='primary' size='dialog' disabled={!pathValid || setMut.isPending} onClick={handleSave}>
						{setMut.isPending ? <Loader2 className='h-4 w-4 animate-spin' /> : t('storage.folder-quota.save')}
					</Button>
					<Button variant='default' size='dialog' disabled={setMut.isPending} onClick={onClose}>
						{t('cancel')}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
