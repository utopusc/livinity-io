import {zodResolver} from '@hookform/resolvers/zod'
import {t} from 'i18next'
import {ChevronDown, Copy, Eye, EyeOff, HardDrive, Loader2, LockKeyhole} from 'lucide-react'
import * as React from 'react'
import {useEffect, useMemo, useState} from 'react'
import {FormProvider, useForm, useFormContext, type Resolver, type SubmitHandler} from 'react-hook-form'
import {Trans} from 'react-i18next/TransWithoutContext'
import {FaRegSave} from 'react-icons/fa'
import {
	TbCheck,
	TbCloudLock,
	TbDatabase,
	TbDeviceDesktop,
	TbExternalLink,
	TbPassword,
	TbShieldExclamation,
	TbShoppingBag,
} from 'react-icons/tb'
import {useNavigate} from 'react-router-dom'
import {useCopyToClipboard} from 'react-use'
import {z} from 'zod'

import {ErrorAlert, WarningAlert} from '@/components/ui/alert'
import {ImmersiveDialogSeparator} from '@/components/ui/immersive-dialog'
import {BackupDeviceIcon} from '@/features/backups/components/backup-device-icon'
import {BackupsExclusions} from '@/features/backups/components/backups-exclusions'
import {AlreadyConfiguredModal} from '@/features/backups/components/modals/already-configured-modal'
import {ConnectExistingModal} from '@/features/backups/components/modals/connect-existing-modal'
import {ReviewCard} from '@/features/backups/components/review-card'
import {TabSwitcher} from '@/features/backups/components/tab-switcher'
import {LoadingTile as LoadingCard} from '@/features/backups/components/tiles'
import {useAppsBackupIgnoredSummary} from '@/features/backups/hooks/use-apps-backup-ignore'
import {useBackupIgnoredPaths} from '@/features/backups/hooks/use-backup-ignored-paths'
import {useBackups, type BackupDestination} from '@/features/backups/hooks/use-backups'
import {useExistingBackupDetection} from '@/features/backups/hooks/use-existing-backup-detection'
import {BACKUP_FILE_NAME, getLastPathSegment, getRelativePathFromRoot} from '@/features/backups/utils/filepath-helpers'
import {AddManuallyCard, ServerCard} from '@/features/files/components/cards/server-cards'
import AddNetworkShareDialog from '@/features/files/components/dialogs/add-network-share-dialog'
import {MiniBrowser} from '@/features/files/components/mini-browser'
import {useExternalStorage} from '@/features/files/hooks/use-external-storage'
import {useNetworkDeviceType} from '@/features/files/hooks/use-network-device-type'
import {useNetworkStorage} from '@/features/files/hooks/use-network-storage'
import {formatFilesystemSize} from '@/features/files/utils/format-filesystem-size'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {useQueryParams} from '@/hooks/use-query-params'
import {systemAppsKeyed} from '@/providers/apps'
import {useConfirmation} from '@/providers/confirmation'
import {useWindowManagerOptional} from '@/providers/window-manager'
import {trpcReact} from '@/trpc/trpc'
import {Button} from '@/shadcn-components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/shadcn-components/ui/dropdown-menu'
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/shadcn-components/ui/form'
import {Input, PasswordInput} from '@/shadcn-components/ui/input'

// ---------------------------------------------
// Types & Schema
// ---------------------------------------------

// Keep the plain ZodObject separate from the refined schema. `.partial()` (used
// by the relaxed wizard-step schema below) only exists on ZodObject, NOT on the
// ZodEffects that `.refine()` returns — calling `encryptionSchema.partial()` on
// the refined value threw `X.partial is not a function` and crashed the whole
// Set-up wizard ("Something went wrong"). This was latent while the Backups tab
// was hidden; re-enabling the tab surfaced it.
const encryptionObjectSchema = z.object({
	password: z.string().min(8, {message: t('backups.password-minimum-length')}),
	confirm: z.string(),
})

const encryptionSchema = encryptionObjectSchema.refine((d) => d.password === d.confirm, {
	message: t('backups.passwords-do-not-match'),
	path: ['confirm'],
})

// Phase 368.6: mirrors the folder-name rule the server enforces
// (destination-policy.ts isValidInternalFolderName). Kept in sync deliberately —
// the server is the boundary, this only avoids a pointless round-trip.
const INTERNAL_FOLDER_NAME = /^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u

const destinationSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('nas'),
		host: z.string().min(1),
		rootPath: z.string().min(1),
	}),
	z.object({
		type: z.literal('external'),
		mountpoint: z.string().min(1),
	}),
	z.object({
		type: z.literal('pool'),
		rootPath: z.string().min(1),
	}),
	z.object({
		type: z.literal('internal'),
		folderName: z
			.string()
			.trim()
			.min(1)
			.max(64)
			.regex(INTERNAL_FOLDER_NAME, {message: t('backups.internal-folder-name-invalid')}),
	}),
]) satisfies z.ZodType<BackupDestination>

const formSchema = z.object({
	destination: destinationSchema,
	folder: z.string().min(1, {message: t('backups.please-choose-folder')}),
	encryption: encryptionSchema,
})

type FormValues = z.infer<typeof formSchema>

/**
 * Phase 368.6 — the display-only pseudo-root for an internal destination. It is
 * NOT a browsable Files root: the operator names a folder and the server maps it
 * under a root it owns. Kept in one place so the wizard, the review step and the
 * path sent to createRepository cannot drift apart.
 */
const internalVirtualPath = (folderName: string) => `/ThisDevice/${folderName.trim()}`

// Relaxed schema used during the wizard (destination required, others can be filled later)
const wizardStepSchema = z.object({
	destination: destinationSchema,
	folder: z.string().optional(),
	encryption: encryptionObjectSchema.partial(),
})

// ---------------------------------------------
// Wizard Steps
// ---------------------------------------------

enum Step {
	Destination = 0,
	Folder = 1,
	Exclusions = 2,
	Encryption = 3,
	Review = 4,
	// Phase 368.8-17. Reached ONLY from a successful submit, never by `next()` —
	// which still clamps at Review. Before this step existed, "Finish setup"
	// navigated to /settings/backups/configure, a browser route that has not
	// existed since Settings became window-only (router.tsx: "/settings/* route
	// REMOVED"). So the last action of the wizard was a 404, and the operator was
	// never told the thing they had just configured had actually started.
	Done = 5,
}

// Header meta per step (title and optional subtitle)
const headerMetaForStep = (s: Step) => {
	switch (s) {
		case Step.Destination:
			return {
				title: t('backups.select-backup-location'),
				subtitle: t('backups.schedule-description'),
			}
		case Step.Folder:
			return {title: t('backups.select-backup-location'), subtitle: t('backups.select-backup-folder-description')}
		case Step.Exclusions:
			return {title: t('backups.exclude-from-backups'), subtitle: t('backups.exclude-from-backups-description')}
		case Step.Encryption:
			return {title: t('backups.set-encryption-password'), subtitle: t('backups.set-encryption-password-description')}
		case Step.Review:
			return {title: t('backups.review'), subtitle: t('backups.review-description')}
		case Step.Done:
			return {title: t('backups.setup-complete-title'), subtitle: t('backups.setup-complete-subtitle')}
		default:
			return {title: '', subtitle: ''}
	}
}

// ---------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------

/**
 * @param onDone Called when the operator dismisses the wizard after a
 *   successful setup. The wizard is rendered inline inside the Settings window,
 *   so it cannot close itself — and it must not try to close itself by
 *   navigating, which is what produced the 404.
 */
export function BackupsSetupWizard({onDone}: {onDone?: () => void} = {}) {
	const [step, setStep] = useState<Step>(Step.Destination)
	const confirm = useConfirmation()

	const form = useForm<FormValues>({
		resolver: zodResolver(wizardStepSchema as any) as Resolver<FormValues>,
		defaultValues: {
			destination: undefined as any,
			folder: '',
			encryption: {password: '', confirm: ''},
		},
		mode: 'onChange',
	})

	const {setupBackup, isSettingUpBackup, repositories, connectExistingRepository, isConnectingExisting} = useBackups()
	const {disks} = useExternalStorage()
	// Phase 368.5: first USER destination — the system-managed safety repo must not hide the exclusions step
	const showExclusionsStep = (repositories ?? []).filter((repo) => repo.isSafety !== true).length === 0

	// Watches so the parent re-renders when these fields change
	const destination = form.watch('destination')
	const folder = form.watch('folder')
	const enc = form.watch('encryption')

	// modals when connecting existing/configured repositories
	const [alreadyConfiguredOpen, setAlreadyConfiguredOpen] = useState(false)
	const [connectExistingOpen, setConnectExistingOpen] = useState(false)
	const [connectPassword, setConnectPassword] = useState('')

	// Detect if the selected folder contains an Livinity backup and whether it's already configured
	const {status: repoStatus} = useExistingBackupDetection(folder, repositories)

	const canNext =
		step === Step.Destination
			? // 368.6: a half-typed folder name must not enable Continue — the server
				// would refuse it, and the wizard would look broken rather than picky.
				!!destination &&
				(destination.type !== 'internal' || INTERNAL_FOLDER_NAME.test(destination.folderName.trim()))
			: step === Step.Folder
				? !!folder
				: step === Step.Encryption
					? (enc?.password?.length ?? 0) >= 8 && enc?.password === enc?.confirm
					: true

	// Validate per-step before advancing
	const next = async () => {
		const fieldsByStep: Record<Step, Array<keyof FormValues | string>> = {
			[Step.Destination]: ['destination'],
			[Step.Folder]: ['folder'],
			[Step.Exclusions]: [],
			[Step.Encryption]: ['encryption.password', 'encryption.confirm'],
			[Step.Review]: [],
		}
		const fields = fieldsByStep[step] ?? []
		const ok = await form.trigger(fields as any, {shouldFocus: true})
		if (!ok) return

		// Intercept Folder step for existing repositories UX
		if (step === Step.Folder) {
			if (repoStatus === 'already-configured') {
				setAlreadyConfiguredOpen(true)
				return
			}
			if (repoStatus === 'exists-not-configured') {
				setConnectExistingOpen(true)
				return
			}
		}

		// Before advancing from Encryption, show a confirmation alert
		if (step === Step.Encryption) {
			try {
				const res = await confirm({
					title: t('backups.store-encryption-password-safely'),
					message: t('backups.encryption-password-warning'),
					actions: [
						{label: t('backups.i-understand'), value: 'confirm', variant: 'primary'},
						{label: t('cancel'), value: 'cancel', variant: 'default'},
					],
				})
				if (res.actionValue !== 'confirm') return
			} catch {
				// dialog dismissed or cancelled
				return
			}
		}
		setStep((s) => {
			let target = Math.min(s + 1, Step.Review)
			// 368.6: an internal destination already knows its full path, so there is
			// nothing to browse — hop straight over the Folder step.
			if (skipFolderStep && s === Step.Destination) target = showExclusionsStep ? Step.Exclusions : Step.Encryption
			if (!showExclusionsStep && s === Step.Folder) target = Step.Encryption
			return target
		})
	}

	const back = () =>
		setStep((s) => {
			let target = Math.max(s - 1, Step.Destination)
			if (!showExclusionsStep && s === Step.Encryption) target = Step.Folder
			// …and back over it again, so Back from Exclusions/Encryption lands on the
			// destination tab rather than a folder picker with no root to browse.
			if (skipFolderStep && target === Step.Folder) target = Step.Destination
			return target
		})

	// When destination changes, reset dependent fields (folder/encryption/frequency) using reset
	const handleDestinationChange = (dest: BackupDestination) => {
		// 368.6: an internal destination is edited a KEYSTROKE at a time (the operator
		// types a folder name), so a full reset per change would wipe the form under
		// them and fight the input. Only a change of destination TYPE resets.
		if (destination?.type === dest.type) {
			form.setValue('destination', dest, {shouldValidate: true, shouldDirty: true})
			if (dest.type === 'internal') {
				form.setValue('folder', internalVirtualPath(dest.folderName), {shouldValidate: true})
			}
			return
		}

		form.reset(
			{
				destination: dest,
				// An internal destination has no folder to browse — its path is fully
				// determined by the name, so fill it in and skip that step.
				folder: dest.type === 'internal' ? internalVirtualPath(dest.folderName) : '',
				encryption: {password: '', confirm: ''},
			},
			{
				keepDirty: false,
				keepTouched: false,
				keepErrors: false,
			},
		)
	}

	// Full submit (strict validate)
	const onSubmit: SubmitHandler<FormValues> = async (values) => {
		const parsed = formSchema.safeParse(values)
		if (!parsed.success) return

		try {
			if (repoStatus === 'exists-not-configured') {
				await connectExistingRepository({path: parsed.data.folder, password: parsed.data.encryption.password})
			} else {
				await setupBackup({
					destination: parsed.data.destination,
					folder: parsed.data.folder,
					encryptionPassword: parsed.data.encryption.password,
				})
			}
			// On success, say so. setupBackup has already kicked off the first
			// backup fire-and-forget (use-backups.ts: `backupNow(repositoryId)`),
			// so "it has started" is a statement of fact, not an encouraging guess.
			setStep(Step.Done)
		} catch {
			// Error toasts are handled in the hook; remain on this step
		}
	}

	const folderRootPath = React.useMemo(() => {
		if (!destination) return undefined
		switch (destination.type) {
			case 'nas':
				return destination.rootPath
			case 'external':
				return destination.mountpoint
			// 368.6: the pool browses like any other mounted root.
			case 'pool':
				return destination.rootPath
			// An internal destination is NOT browsable — the operator named a folder,
			// and it lands under a root LivOS owns. There is nothing to pick.
			case 'internal':
				return undefined
		}
	}, [destination])

	// 368.6: an internal destination skips the Folder step entirely — its path is
	// already fully determined by the name typed on the destination step.
	const skipFolderStep = destination?.type === 'internal'
	const internalFolderPath = destination?.type === 'internal' ? `/ThisDevice/${destination.folderName.trim()}` : ''

	// Clear sensitive encryption fields on unmount (defense-in-depth)
	React.useEffect(() => {
		return () => {
			form.reset({
				...form.getValues(),
				encryption: {password: '', confirm: ''},
			})
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	return (
		<FormProvider {...form}>
			<div className='flex h-full flex-col'>
				{/* Header */}
				<div className='mb-4'>
					{(() => {
						const h = headerMetaForStep(step)
						return (
							<>
								<h2 className='text-24 font-medium text-text-primary'>{h.title}</h2>
								{h.subtitle ? <span className='text-13 text-text-secondary'>{h.subtitle}</span> : null}
							</>
						)
					})()}
				</div>
				<div className='pb-4'>
					<ImmersiveDialogSeparator />
				</div>

				{/* Body */}
				<div className='min-h-0 flex-1 overflow-y-auto'>
					{step === Step.Destination && <DestinationStep onChangeDestination={handleDestinationChange} onNext={next} />}
					{step === Step.Folder && folderRootPath && (
						<FolderPickerStep
							rootPath={folderRootPath}
							disabledPaths={destination?.type === 'nas' ? [folderRootPath] : []}
							value={folder}
							onChange={(val) => form.setValue('folder', val, {shouldValidate: true})}
							selectedName={
								destination?.type === 'nas'
									? destination.host
									: destination?.type === 'external'
										? disks
												?.flatMap((disk) =>
													disk.partitions.map((p) => ({
														mountpoint: p.mountpoints?.[0],
														label: p.label || disk.name || t('external-drive'),
													})),
												)
												.find((p) => p.mountpoint === destination.mountpoint)?.label
										: t('external-drive')
							}
						/>
					)}
					{step === Step.Exclusions && showExclusionsStep && <BackupsExclusions />}
					{step === Step.Encryption && <EncryptionStep />}
					{step === Step.Review && <ReviewStep values={form.getValues()} />}
					{step === Step.Done && <SetupCompleteStep />}
				</div>

				{/* Footer */}
				<div className='mt-6 flex items-center gap-2 pt-4 max-md:flex-col-reverse'>
					{step !== Step.Destination && step !== Step.Done ? (
						<Button size='dialog' onClick={back} className='min-w-0 max-md:w-full'>
							{t('back')}
						</Button>
					) : null}
					{step === Step.Done ? (
						<Button variant='primary' size='dialog' onClick={() => onDone?.()} className='min-w-0 max-md:w-full'>
							{t('backups.setup-complete-dismiss')}
						</Button>
					) : step !== Step.Review ? (
						<>
							<Button
								variant='primary'
								size='dialog'
								onClick={next}
								disabled={!canNext}
								className='min-w-0 max-md:w-full'
							>
								{t('continue')}
							</Button>
						</>
					) : (
						<Button
							variant='primary'
							size='dialog'
							disabled={isSettingUpBackup}
							onClick={form.handleSubmit(onSubmit)}
							className='min-w-0 max-md:w-full'
						>
							<span className={isSettingUpBackup ? 'opacity-0' : 'opacity-100'}>{t('backups-setup-confirm')}</span>
							{isSettingUpBackup && <Loader2 className='absolute h-4 w-4 animate-spin' />}
						</Button>
					)}
				</div>

				{/* Modal: shown when the chosen folder already has a backup configured on this Livinity */}
				<AlreadyConfiguredModal
					open={alreadyConfiguredOpen}
					folderPath={folder}
					onClose={() => setAlreadyConfiguredOpen(false)}
					onManage={() => {
						setAlreadyConfiguredOpen(false)
						// This folder is ALREADY a configured destination, so there is
						// nothing to set up — leave the wizard rather than navigate to a
						// route that does not exist.
						onDone?.()
					}}
				/>
				{/* Modal: shown when the chosen folder contains a backup that is not yet connected here */}
				<ConnectExistingModal
					open={connectExistingOpen}
					folderPath={folder}
					password={connectPassword}
					onPasswordChange={setConnectPassword}
					onClose={() => setConnectExistingOpen(false)}
					onConnect={async () => {
						// Remove the backup file name from the folder path to get the repo path
						// in case the user selected the backup file itself
						await connectExistingRepository({
							path: folder!.endsWith(`/${BACKUP_FILE_NAME}`)
								? folder!.slice(0, -(BACKUP_FILE_NAME.length + 1))
								: folder!,
							password: connectPassword,
						})
						setConnectExistingOpen(false)
						setStep(Step.Done)
					}}
					isConnecting={isConnectingExisting}
				/>
			</div>
		</FormProvider>
	)
}

// ---------------------------------------------
// Step 0 — Destination (NAS, External Drive, This device, Private Cloud)
// ---------------------------------------------

// Phase 368.6: "This device" is deliberately NOT called "This Livinity" — that
// would collide with the "Livinity Private Cloud" tab sitting right beside it.
type DestinationTab = 'nas' | 'external' | 'this-device' | 'livinity-private-cloud'

/** `X free of Y`, or null when the reading is missing/degenerate (row gets disabled). */
function freeOfTotal(root?: {size?: number; free?: number}): string | null {
	if (!root || typeof root.size !== 'number' || typeof root.free !== 'number') return null
	if (!Number.isFinite(root.size) || !Number.isFinite(root.free) || root.size <= 0) return null
	return t('backups.internal-free-of-total', {
		free: formatFilesystemSize(root.free),
		total: formatFilesystemSize(root.size),
	})
}

/**
 * Phase 368.8 (COR-04/COR-05) — why "This device" cannot be chosen right now.
 * The SERVER decides (backups.ts getDestinationRoots); this only turns the code
 * into a sentence, so the wizard and addRepository can never disagree about what
 * is offerable. Offering a row that will be refused is the dead-end this phase
 * exists to remove.
 */
function internalUnavailableReason(root?: {available?: boolean; unavailableReason?: string}): string | null {
	if (!root || root.available) return null
	switch (root.unavailableReason) {
		case 'internal-root-missing':
			return t('backups.internal-root-missing')
		case 'internal-root-not-writable':
			return t('backups.internal-root-not-writable')
		case 'internal-too-full':
			return t('backups.internal-too-full')
		default:
			return t('backups.space-unreadable')
	}
}

function DestinationStep({
	onChangeDestination,
	onNext,
}: {
	onChangeDestination: (dest: BackupDestination) => void
	onNext: () => void
}) {
	const form = useFormContext<FormValues>()
	const {params, addLinkSearchParams} = useQueryParams()
	const navigate = useNavigate()
	const windowManager = useWindowManagerOptional()
	// Open the windowed Files (suffix on the route is read by FilesWindowContent's parser).
	const openFilesWindow = (route: string) => {
		const icon = systemAppsKeyed['LIVINITY_files']?.icon || ''
		if (windowManager) windowManager.openWindow('LIVINITY_files', route, 'Files', icon)
		else navigate(route)
	}
	const initialTabParam = params.get('backups-setup-tab')
	const isMobile = useIsMobile()

	const [tab, setTab] = useState<DestinationTab>(
		initialTabParam === 'external'
			? 'external'
			: initialTabParam === 'this-device'
				? 'this-device'
				: initialTabParam === 'livinity-private-cloud'
					? 'livinity-private-cloud'
					: 'nas',
	)
	const [isAddNasOpen, setAddNasOpen] = useState(false)

	// Prefer the selected destination type to drive the tab (so Back returns to the right tab)
	const dest = form.watch('destination') as BackupDestination | undefined
	useEffect(() => {
		if (dest?.type === 'nas' || dest?.type === 'external') {
			setTab(dest.type)
		}
		// 368.6: pool and internal both live on the "This device" tab. Without this,
		// Back from the next step would bounce an internal selection to the NAS tab
		// and the operator would think their choice was lost.
		if (dest?.type === 'pool' || dest?.type === 'internal') {
			setTab('this-device')
		}
	}, [dest?.type])

	// 368.6: the roots this box can actually accept, derived server-side from the
	// SAME constants the destination predicate uses — a tab that offers a root
	// addRepository then refuses is a dead-end wizard.
	const {data: destinationRoots, isLoading: isLoadingRoots} = trpcReact.backups.getDestinationRoots.useQuery(
		undefined,
		{staleTime: 15_000},
	)
	const poolRoot = destinationRoots?.find((root) => root.kind === 'pool')
	const internalRoot = destinationRoots?.find((root) => root.kind === 'internal')

	// Internal disks that exist but are not usable as a destination yet. This query
	// THROWS by design when the OS disk cannot be resolved (root-disk.ts fails
	// closed rather than listing every disk), so an error must render as an
	// explicit "couldn't list drives" state, never as an empty grid that reads as
	// "you have no other disks".
	const {data: eligibleDrives, isError: eligibleDrivesFailed} = trpcReact.storagePool.listEligibleDrives.useQuery(
		undefined,
		{staleTime: 30_000, retry: false},
	)

	// NAS sources: show hosts that have at least one mounted share
	const {shares, isLoadingShares, refetchShares} = useNetworkStorage({suppressNavigateOnAdd: true})
	const hosts = useMemo(() => {
		if (!shares) return []
		const mounted = shares.filter((s) => s.isMounted)
		return Array.from(new Set(mounted.map((s) => s.host)))
	}, [shares])

	// External drives (partitions)
	const {disks, isLoadingExternalStorage} = useExternalStorage()

	const currentDest = form.watch('destination')

	const switchTab = (tab: DestinationTab) => {
		setTab(tab)
		const search = addLinkSearchParams({'backups-setup-tab': tab})
		// Update URL without navigating
		window.history.replaceState(null, '', search)
	}

	return (
		<div className='space-y-4'>
			{isMobile ? (
				<div className='flex items-center justify-between pb-4'>
					<span className='text-13'>{t('backups.backup-location')}</span>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant='default' className='flex items-center gap-2'>
								<span>
									{tab === 'nas'
										? t('backups-setup-livinity-or-nas')
										: tab === 'external'
											? t('external-drive')
											: tab === 'this-device'
												? t('backups-setup-this-device')
												: t('backups-setup-livinity-private-cloud')}
								</span>
								<ChevronDown className='h-3 w-3' />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align='end' className='min-w-[280px]'>
							<DropdownMenuItem onSelect={() => switchTab('nas')}>
								<div className='flex flex-col'>
									<div className='text-14 font-medium'>{t('backups-setup-livinity-or-nas')}</div>
									<div className='text-12 text-text-tertiary'>{t('backups-setup-nas-or-livinity-description')}</div>
								</div>
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => switchTab('external')}>
								<div className='flex flex-col'>
									<div className='text-14 font-medium'>{t('external-drive')}</div>
									<div className='text-12 text-text-tertiary'>{t('backups-setup-external-description')}</div>
								</div>
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => switchTab('this-device')}>
								<div className='flex flex-col'>
									<div className='text-14 font-medium'>{t('backups-setup-this-device')}</div>
									<div className='text-12 text-text-tertiary'>{t('backups-setup-this-device-description')}</div>
								</div>
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => switchTab('livinity-private-cloud')}>
								<div className='flex flex-col'>
									<div className='text-14 font-medium'>{t('backups-setup-livinity-private-cloud')}</div>
									<div className='text-12 text-text-tertiary'>{t('backups-setup-livinity-private-cloud-description')}</div>
								</div>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			) : (
				<TabSwitcher
					options={[
						{id: 'nas', label: t('backups-setup-livinity-or-nas')},
						{id: 'external', label: t('external-drive')},
						// Third, never the initial tab: a destination on this box is the
						// fallback when there is no drive and no NAS, not the default answer.
						{id: 'this-device', label: t('backups-setup-this-device')},
						{id: 'livinity-private-cloud', label: t('backups-setup-livinity-private-cloud')},
					]}
					value={tab}
					onChange={(v) => {
						switchTab(v as DestinationTab)
					}}
				/>
			)}

			{tab === 'nas' ? (
				<div className='grid grid-cols-[repeat(auto-fill,125px)] gap-3'>
					{isLoadingShares ? (
						<LoadingCard />
					) : hosts.length === 0 ? (
						<AddManuallyCard onClick={() => setAddNasOpen(true)} label={t('backups.add-livinity-or-nas')} />
					) : (
						[
							<AddManuallyCard
								key='add-livinity-or-nas'
								onClick={() => setAddNasOpen(true)}
								label={t('backups.add-livinity-or-nas')}
							/>,
							...hosts.map((host) => {
								const selected =
									currentDest?.type === 'nas' &&
									currentDest.host === host &&
									currentDest.rootPath === `/Network/${host}`
								return (
									<ServerCard
										key={host}
										selected={!!selected}
										onClick={() => onChangeDestination({type: 'nas', host, rootPath: `/Network/${host}`})}
									>
										<BackupDeviceIcon path={`/Network/${host}`} connected className='mb-2 size-12' />
										<span className='w-full truncate text-center text-[12px]' title={host}>
											{host}
										</span>
									</ServerCard>
								)
							}),
						]
					)}
				</div>
			) : tab === 'external' ? (
				<div className='grid grid-cols-[repeat(auto-fill,125px)] gap-3'>
					{isLoadingExternalStorage ? (
						<div className='col-span-full flex items-center justify-start gap-2 py-2 text-sm text-text-secondary'>
							<Loader2 className='size-4 animate-spin will-change-transform' />
							<span>{t('backups.scanning-for-external-drives')}</span>
						</div>
					) : !disks || disks.length === 0 ? (
						<div className='col-span-full flex items-center justify-start py-2'>
							<span className='text-sm text-text-tertiary'>{t('backups.no-external-drives-detected')}</span>
						</div>
					) : (
						<>
							{/* Normal external drives that don't need formatting */}
							{disks
								.filter((disk) => disk.isMounted && !disk.isFormatting)
								.flatMap((disk) =>
									disk.partitions.flatMap((p) => {
										const firstMount = p.mountpoints?.[0]
										if (!firstMount) return []
										const label = p.label || disk.name || t('unknown')
										const selected = currentDest?.type === 'external' && currentDest.mountpoint === firstMount
										return [
											<ServerCard
												key={`${disk.id}-${p.id}-${firstMount}`}
												selected={!!selected}
												onClick={() => onChangeDestination({type: 'external', mountpoint: firstMount})}
											>
												<div className='mb-2 flex h-12 w-12 items-center justify-center'>
													<BackupDeviceIcon path={firstMount} connected className='size-11' />
												</div>
												<div className='w-full truncate text-center text-[12px]'>{label}</div>
												<div className='w-full truncate text-center text-[11px] text-text-tertiary'>
													{formatFilesystemSize(p.size)}
												</div>
											</ServerCard>,
										]
									}),
								)}
							{/* External drives that need formatting */}
							{disks
								.filter((disk) => !disk.isMounted || disk.isFormatting)
								.map((disk) => {
									const label = disk.name || t('unknown')
									return (
										<ServerCard
											key={`${disk.id}-requires-format`}
											selected={false}
											onClick={() => {
												if (disk.isFormatting) return
												openFilesWindow(`/files/Home?dialog=files-format-drive&deviceId=${disk.id}`)
											}}
										>
											<div className='mb-2 flex h-12 w-12 items-center justify-center'>
												<BackupDeviceIcon path='' connected={false} className='size-11' />
											</div>
											<div className='w-full truncate text-center text-[12px]'>{label}</div>
											<div className='w-full truncate text-center text-[11px] text-text-tertiary'>
												{disk.isFormatting ? t('files-format.formatting') : t('files-format.title-requires-format')}
											</div>
										</ServerCard>
									)
								})}
						</>
					)}
				</div>
			) : tab === 'this-device' ? (
				<div className='space-y-3'>
					<div className='grid grid-cols-[repeat(auto-fill,125px)] gap-3'>
						{isLoadingRoots ? (
							<LoadingCard />
						) : (
							<>
								{/* Storage pool — offered only when one is registered. */}
								{poolRoot?.available ? (
									<ServerCard
										selected={currentDest?.type === 'pool'}
										onClick={() => onChangeDestination({type: 'pool', rootPath: '/Pool'})}
									>
										<div className='mb-2 flex h-12 w-12 items-center justify-center'>
											<TbDatabase className='size-11 text-text-secondary' strokeWidth={1.5} />
										</div>
										<div className='w-full truncate text-center text-[12px]'>{t('backups.internal-pool')}</div>
										<div className='w-full truncate text-center text-[11px] text-text-tertiary'>
											{freeOfTotal(poolRoot) ?? t('backups.space-unreadable')}
										</div>
									</ServerCard>
								) : null}

								{/* The system disk. Always offerable, never GREEN.
								    368.8 (COR-04): offered DISABLED, with a reason, when the server says
								    the root is missing / unwritable / too full — so nobody types a folder
								    name and a password only to be refused afterwards. */}
								<ServerCard
									selected={currentDest?.type === 'internal'}
									disabled={!internalRoot?.available}
									onClick={() => {
										if (!internalRoot?.available) return
										onChangeDestination({
											type: 'internal',
											folderName:
												currentDest?.type === 'internal' ? currentDest.folderName : t('backups.internal-system-disk'),
										})
									}}
								>
									<div className='mb-2 flex h-12 w-12 items-center justify-center'>
										<TbDeviceDesktop className='size-11 text-text-secondary' strokeWidth={1.5} />
									</div>
									<div className='flex w-full items-center justify-center gap-1'>
										<span className='size-1.5 shrink-0 rounded-full bg-amber-500' aria-hidden='true' />
										<span className='truncate text-[12px]'>{t('backups.internal-system-disk')}</span>
									</div>
									<div
										className='w-full truncate text-center text-[11px] text-text-tertiary'
										title={internalUnavailableReason(internalRoot) ?? undefined}
									>
										{internalUnavailableReason(internalRoot) ?? freeOfTotal(internalRoot) ?? t('backups.space-unreadable')}
									</div>
								</ServerCard>

								{/* Internal disks that exist but aren't usable yet — shown greyed with
								    a reason rather than hidden, so "where is my second disk?" has an
								    answer on screen. */}
								{(eligibleDrives ?? []).map((drive) => (
									<ServerCard key={`unmounted-${drive.id}`} selected={false} disabled onClick={() => {}}>
										<div className='mb-2 flex h-12 w-12 items-center justify-center opacity-40'>
											<TbDatabase className='size-11 text-text-tertiary' strokeWidth={1.5} />
										</div>
										<div className='w-full truncate text-center text-[12px] text-text-tertiary'>
											{drive.name || t('unknown')}
										</div>
										<div className='w-full truncate text-center text-[11px] text-text-tertiary'>
											{t('backups.internal-unmounted')}
										</div>
									</ServerCard>
								))}
							</>
						)}
					</div>

					{/* listEligibleDrives fails CLOSED (it throws rather than list a disk it
					    cannot vouch for), so say so instead of rendering an empty grid that
					    reads as "there is nothing else here". */}
					{eligibleDrivesFailed ? (
						<p className='text-12 text-text-tertiary'>{t('backups.drives-unreadable')}</p>
					) : (eligibleDrives ?? []).length > 0 ? (
						<p className='text-12 text-text-tertiary'>{t('backups.internal-unmounted-reason')}</p>
					) : null}

					{/* Folder NAME, not a path browser: free-text host paths need privileges
					    livinityd does not have, so the operator names a folder and the server
					    places it under a root it owns. */}
					{currentDest?.type === 'internal' ? (
						// ─────────────────────────────────────────────────────────────
						// Phase 368.8-17 — this panel used to be a bare label, an input
						// and a grey paragraph, and it left three questions unanswered:
						// which disk was chosen, where the folder would actually land,
						// and how serious the same-disk caveat is.
						//
						// Now the chosen disk is restated with its free space (the card
						// above scrolls out of view on short windows), the destination
						// path is shown LIVE as it is typed, and the caveat is an amber
						// panel rather than tertiary grey — it is the one thing about
						// this destination that is genuinely a limitation, and it should
						// not read like a footnote.
						// ─────────────────────────────────────────────────────────────
						<div className='space-y-3 rounded-12 border border-border-default bg-black/10 p-4'>
							<div className='flex items-center gap-3'>
								<div className='flex size-10 shrink-0 items-center justify-center rounded-10 bg-surface-2'>
									<TbDeviceDesktop className='size-6 text-text-secondary' strokeWidth={1.5} />
								</div>
								<div className='min-w-0 flex-1'>
									<div className='truncate text-13 font-medium text-text-primary'>
										{t('backups.internal-system-disk')}
									</div>
									<div className='truncate text-12 text-text-tertiary'>
										{freeOfTotal(internalRoot) ?? t('backups.space-unreadable')}
									</div>
								</div>
							</div>

							<div className='space-y-2'>
								<label className='block text-13 text-text-secondary' htmlFor='backups-internal-folder-name'>
									{t('backups.internal-folder-name-label')}
								</label>
								<Input
									id='backups-internal-folder-name'
									value={currentDest.folderName}
									onValueChange={(value) => onChangeDestination({type: 'internal', folderName: value})}
									autoComplete='off'
									spellCheck={false}
								/>
								{currentDest.folderName.trim().length > 0 &&
								!INTERNAL_FOLDER_NAME.test(currentDest.folderName.trim()) ? (
									<p className='text-12 text-destructive2'>{t('backups.internal-folder-name-invalid')}</p>
								) : currentDest.folderName.trim().length > 0 ? (
									<p className='truncate text-12 text-text-tertiary'>
										{t('backups.internal-folder-name-preview', {
											path: `/ThisDevice/${currentDest.folderName.trim()}`,
										})}
									</p>
								) : null}
							</div>

							<div className='flex items-start gap-2.5 rounded-10 border border-amber-500/30 bg-amber-500/10 p-3'>
								<TbShieldExclamation className='mt-px size-4 shrink-0 text-amber-400' strokeWidth={2} />
								<p className='text-12 leading-relaxed text-text-secondary'>
									{t('backups.internal-system-disk-note')}
								</p>
							</div>
						</div>
					) : currentDest?.type === 'pool' && poolRoot && !poolRoot.offSystemDisk ? (
						// An all-on-the-OS-disk pool is still a destination, but it is not the
						// separate hardware the word "pool" implies. Say so before they pick it.
						<p className='text-12 text-text-tertiary'>{t('backups.internal-pool-same-disk-note')}</p>
					) : currentDest?.type === 'pool' ? (
						<p className='text-12 text-text-tertiary'>{t('backups.internal-pool-note')}</p>
					) : null}
				</div>
			) : tab === 'livinity-private-cloud' ? (
				<div className='flex flex-col items-center justify-center gap-7 rounded-20 border border border-border-default bg-black/10 px-3 pb-10 pt-8'>
					<div className='flex flex-col items-center justify-center gap-1 text-center'>
						<h2 className='mb-0 text-2xl text-text-primary'>{t('backups-setup-livinity-private-cloud')}</h2>
						<span className='mt-0  text-sm text-text-primary'>{t('backups-setup-livinity-private-cloud-subtitle')}</span>
					</div>
					<TbCloudLock
						aria-label={t('backups-setup-livinity-private-cloud')}
						className='size-24 text-brand'
						strokeWidth={1.5}
					/>
					<div className='flex flex-col items-center justify-center gap-2'>
						<p className='max-w-md text-center text-sm text-text-primary'>
							<Trans
								i18nKey='backups-setup-livinity-private-cloud-cta'
								components={{
									bold: <span className='font-bold text-text-primary' />,
								}}
							/>
						</p>
						<Button asChild className='mt-4 px-4' variant='primary'>
							<a href='https://livinity.io' target='_blank' rel='noopener noreferrer'>
								<TbExternalLink className='size-4' />
								{t('backups-setup-livinity-private-cloud-cta-link')}
							</a>
						</Button>
					</div>
				</div>
			) : null}

			<AddNetworkShareDialog
				open={isAddNasOpen}
				onOpenChange={(v) => setAddNasOpen(v)}
				suppressNavigateOnAdd
				onAdded={(host) => {
					// Keep shares fresh so the NAS list stays up to date in the UI
					refetchShares()
					// If we know which host was added, select it as the destination and advance
					if (host) {
						onChangeDestination({type: 'nas', host, rootPath: `/Network/${host}`})
						onNext()
					}
				}}
			/>
		</div>
	)
}

// ---------------------------------------------
// Step 1 — Folder Picker (read-only input + mini browser)
// ---------------------------------------------

function FolderPickerStep({
	rootPath,
	value,
	onChange,
	selectedName,
	disabledPaths = [],
}: {
	rootPath: string
	value?: string
	onChange: (v: string) => void
	selectedName?: string
	disabledPaths?: string[]
}) {
	const [isBrowserOpen, setBrowserOpen] = useState(false)

	// Show nothing until a subfolder is chosen
	const displayValue = value || ''
	const shownValue = React.useMemo(() => {
		if (!displayValue) return ''
		return getRelativePathFromRoot(displayValue, rootPath)
	}, [displayValue, rootPath])

	return (
		<div className='space-y-4'>
			<div>
				<div className='mb-4 text-sm font-medium'>
					{/* Use Trans component to allow HTML interpolation for brand styling while maintaining proper i18n sentence context */}
					<Trans
						i18nKey='backups.choose-folder-within-device'
						values={{device: selectedName || ''}}
						components={{
							bold: <span className='font-bold text-brand-lightest' />,
						}}
					/>
				</div>

				{/* Input with inline "Browse" button */}
				<div className='relative'>
					<Input
						type='text'
						value={shownValue}
						readOnly
						className='cursor-pointer select-none pr-28 text-text-primary'
						title={shownValue}
						onClick={() => setBrowserOpen(true)}
					/>
					<Button
						type='button'
						size='sm'
						className='absolute right-5 top-1/2 -translate-y-1/2'
						onClick={() => setBrowserOpen(true)}
					>
						{t('backups.browse')}
					</Button>
				</div>

				<div className='mt-4'>
					<WarningAlert
						icon={HardDrive}
						description={t('backups.storage-capacity-warning', {device: selectedName || ''})}
					/>
				</div>
			</div>

			{/* Mini folder browser */}
			<MiniBrowser
				open={isBrowserOpen}
				onOpenChange={setBrowserOpen}
				rootPath={rootPath}
				disabledPaths={disabledPaths}
				onOpenPath={value || rootPath}
				preselectOnOpen={true}
				selectionMode='folders'
				title={t('backups.select-backup-folder')}
				selectButtonLabel={t('mini-browser.select-folder')}
				onSelect={(p) => {
					onChange(p)
					setBrowserOpen(false)
				}}
				allowNewFolderCreation={true}
			/>
		</div>
	)
}

// ---------------------------------------------
// Step 3 — Encryption (index 3)
// ---------------------------------------------

function EncryptionStep() {
	const form = useFormContext<FormValues>()

	return (
		<div className='space-y-4'>
			<Form {...form}>
				<div className='grid grid-cols-1 gap-3'>
					<FormField
						control={form.control}
						name='encryption.password'
						render={({field}) => (
							<FormItem>
								<FormLabel className='text-13 opacity-60'>{t('password')}</FormLabel>
								<FormControl>
									<PasswordInput value={field.value} onValueChange={field.onChange} />
								</FormControl>
								<div className='relative'>
									<FormMessage className='absolute -top-1 left-0 text-xs' />
								</div>
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name='encryption.confirm'
						render={({field}) => (
							<FormItem>
								<FormLabel className='text-13 opacity-60'>{t('backups.confirm-password')}</FormLabel>
								<FormControl>
									<PasswordInput value={field.value} onValueChange={field.onChange} />
								</FormControl>
								<div className='relative'>
									<FormMessage className='absolute -top-1 left-0 text-xs' />
								</div>
							</FormItem>
						)}
					/>
				</div>
			</Form>

			<ErrorAlert icon={LockKeyhole} description={t('backups.password-safety-warning')} />
		</div>
	)
}

// ---------------------------------------------
// Step 4 — Review (index 4)
// ---------------------------------------------

// ---------------------------------------------
// Step 5 — Done (index 5)
// ---------------------------------------------

/**
 * Phase 368.8-17 — what the operator sees after "Finish setup".
 *
 * Previously: a navigation to a dead route, i.e. a 404, with no confirmation
 * that anything had happened. The destination WAS created and the first backup
 * WAS already running; only the UI failed to say so.
 *
 * The claims here are all things that are true at this moment rather than
 * reassurance: the destination exists (createRepository resolved), the first
 * backup has started (backupNow was called), and it continues without this
 * window (it is fire-and-forget on the server). The dock island is named
 * because that is where the progress the operator can actually watch appears.
 */
function SetupCompleteStep() {
	return (
		<div className='flex flex-col items-center justify-center gap-5 rounded-20 border border-border-default bg-black/10 px-6 py-10 text-center'>
			<div className='flex size-16 items-center justify-center rounded-full bg-accent-green/15'>
				<TbCheck className='size-9 text-accent-green' strokeWidth={2} />
			</div>
			<div className='space-y-1.5'>
				<h3 className='text-18 font-medium text-text-primary'>{t('backups.setup-complete-heading')}</h3>
				<p className='mx-auto max-w-sm text-13 leading-relaxed text-text-secondary'>
					{t('backups.setup-complete-body')}
				</p>
			</div>
			<p className='mx-auto max-w-sm text-12 text-text-tertiary'>{t('backups.setup-complete-note')}</p>
		</div>
	)
}

// ---------------------------------------------
// Step 4 — Review (index 4)
// ---------------------------------------------

function ReviewStep({values}: {values: FormValues}) {
	// 368.6: four destination kinds now, so the root each path is shown relative to
	// is per-kind. The previous `else` branch read `.mountpoint` unconditionally,
	// which no longer exists on every variant.
	const stripRoot = (path: string, root: string) => {
		if (!root || !path.startsWith(root)) return path
		const stripped = path.slice(root.length) || '/'
		return stripped.startsWith('/') ? stripped : `/${stripped}`
	}

	let pathOnly = values.folder
	switch (values.destination.type) {
		case 'nas':
			pathOnly = stripRoot(pathOnly, `/Network/${values.destination.host}`)
			break
		case 'external':
			pathOnly = stripRoot(pathOnly, values.destination.mountpoint)
			break
		case 'pool':
			pathOnly = stripRoot(pathOnly, values.destination.rootPath)
			break
		case 'internal':
			// Nothing to strip — the operator named this folder, so show the name.
			pathOnly = values.destination.folderName.trim()
			break
	}

	const {deviceType} = useNetworkDeviceType(values.destination.type === 'nas' ? values.destination.rootPath : '')

	let locationCombined: string
	switch (values.destination.type) {
		case 'nas':
			locationCombined = `${deviceType === 'livinity' ? t('livinity') : t('nas')} · ${values.destination.host} · ${pathOnly}`
			break
		case 'external':
			locationCombined = `${t('external-drive')} · ${getLastPathSegment(values.destination.mountpoint)} · ${pathOnly}`
			break
		case 'pool':
			locationCombined = `${t('backups.internal-pool')} · ${pathOnly}`
			break
		case 'internal':
			// 368.8-17: the folder defaults to the disk's own name, so this read
			// "This device · System disk · System disk" — three labels, one place.
			// Collapse consecutive repeats instead of hard-coding which one to drop,
			// because the operator can rename the folder to anything.
			locationCombined = [t('backups-setup-this-device'), t('backups.internal-system-disk'), pathOnly]
				.filter((part, index, parts) => part.length > 0 && part !== parts[index - 1])
				.join(' · ')
			break
	}

	const [showPw, setShowPw] = useState(false)
	const plainPw = values.encryption.password
	const masked = plainPw ? '•'.repeat(Math.max(8, plainPw.length)) : ''
	const [, copyToClipboard] = useCopyToClipboard()

	const {filteredIgnoredPaths} = useBackupIgnoredPaths()
	const {excludedAppsCount} = useAppsBackupIgnoredSummary()

	return (
		<div className='space-y-3'>
			<ReviewCard icon={<FaRegSave className='h-5 w-5 opacity-80' />} label={t('backups.location')}>
				<div className='break-words text-sm' title={locationCombined}>
					{locationCombined}
				</div>
			</ReviewCard>

			<ReviewCard icon={<TbShoppingBag className='h-5 w-5 opacity-80' />} label={t('backups.apps-and-data')}>
				<div className='text-sm'>
					{filteredIgnoredPaths.length > 0 || excludedAppsCount > 0
						? [
								filteredIgnoredPaths.length > 0
									? t('{{count}} {{fileFolderText}} excluded', {
											count: filteredIgnoredPaths.length,
											fileFolderText: filteredIgnoredPaths.length === 1 ? t('file/folder') : t('files/folders'),
										})
									: null,
								excludedAppsCount > 0
									? t('{{count}} {{appText}} excluded', {
											count: excludedAppsCount,
											appText: excludedAppsCount === 1 ? t('app') : t('apps'),
										})
									: null,
							]
								.filter(Boolean)
								.join(' · ')
						: t('backups.all-apps-and-data-will-be-backed-up')}
				</div>
			</ReviewCard>

			<ReviewCard icon={<TbPassword className='h-5 w-5 opacity-80' />} label={t('backups.encryption')}>
				<div className='flex items-center gap-2 text-sm'>
					{plainPw ? (
						<>
							<span className='opacity-90'>{t('backups.password-is-set')}</span>
							{/* Constrained, selectable password display */}
							<Input
								readOnly
								value={showPw ? plainPw : masked}
								size={Math.min((showPw ? plainPw : masked).length, 32)}
								type={showPw ? 'text' : 'text'}
								className='flex h-6 w-auto max-w-[120px] items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-[3px] border border-border-subtle bg-surface-1 px-1 font-mono text-12 leading-none outline-none'
							/>
							<span
								className='group inline-flex h-6 w-6 cursor-pointer items-center justify-center'
								onClick={() => setShowPw((s) => !s)}
								title={showPw ? t('backups.hide') : t('backups.show')}
							>
								{showPw ? (
									<EyeOff className='h-4 w-4 opacity-80 transition-colors group-hover:opacity-100' />
								) : (
									<Eye className='h-4 w-4 opacity-80 transition-colors group-hover:opacity-100' />
								)}
							</span>
							<span
								className='group inline-flex h-6 w-6 cursor-pointer items-center justify-center'
								onClick={() => copyToClipboard(plainPw)}
								title={t('backups.copy')}
							>
								<Copy className='h-4 w-4 opacity-80 transition-colors group-hover:opacity-100' />
							</span>
						</>
					) : (
						<span className='opacity-60'>{t('backups.no-password-set')}</span>
					)}
				</div>
			</ReviewCard>
		</div>
	)
}
