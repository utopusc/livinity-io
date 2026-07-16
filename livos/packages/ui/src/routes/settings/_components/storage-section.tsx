import {Loader2} from 'lucide-react'
import {useState} from 'react'
import {TbCheck, TbCopy, TbEye, TbEyeOff} from 'react-icons/tb'

import {FieldCard, FieldRow} from '@/components/field-card'
import {SettingsPageHeader} from '@/components/settings-page-header'
import AddNetworkShareDialog from '@/features/files/components/dialogs/add-network-share-dialog'
import {useExternalStorage} from '@/features/files/hooks/use-external-storage'
import {useNetworkStorage} from '@/features/files/hooks/use-network-storage'
import {useSmartDrives} from '@/features/files/hooks/use-smart-drives'
import {PoolWizard} from '@/features/storage-pool/components/pool-wizard'
import {useStoragePool} from '@/features/storage-pool/hooks/use-storage-pool'
import {useCurrentUser} from '@/hooks/use-current-user'
import {useSystemDiskForUi} from '@/hooks/use-disk'
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
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'
import {maybePrettyBytes} from '@/utils/pretty-bytes'

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

			<UsbDrivesBlock />

			<NetworkSharesBlock />

			<FolderSharingBlock />
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
