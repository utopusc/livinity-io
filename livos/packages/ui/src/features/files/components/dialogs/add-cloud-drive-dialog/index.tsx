import {ChevronDown, ChevronUp, Loader2} from 'lucide-react'
import {useEffect, useState} from 'react'
import {TbBrandGoogleDrive, TbBrandOnedrive, TbCloud} from 'react-icons/tb'
import {toast} from 'sonner'

import {ServerCard} from '@/features/files/components/cards/server-cards'
import {CLOUD_STORAGE_PATH} from '@/features/files/constants'
import {useNavigate} from '@/features/files/hooks/use-navigate'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {Button} from '@/shadcn-components/ui/button'
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '@/shadcn-components/ui/collapsible'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerScroller,
	DrawerTitle,
} from '@/shadcn-components/ui/drawer'
import {Input, PasswordInput} from '@/shadcn-components/ui/input'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'
import type {RouterError} from '@/trpc/trpc'
import {useDialogOpenProps} from '@/utils/dialog'
import {t} from '@/utils/i18n'

// The rclone backends the wrapper ships a built-in shared client_id for.
type CloudBackend = 'drive' | 'dropbox' | 'onedrive'

// The safe rclone remote-name charset (matches the 324-05 server-side guard).
const REMOTE_NAME_RE = /^[a-z0-9_-]+$/

// The rclone backends the wrapper ships a built-in shared client_id for.
const BACKENDS: {id: CloudBackend; labelKey: string; Icon: (props: {className?: string}) => JSX.Element}[] = [
	{id: 'drive', labelKey: 'files-clouddrive.provider-drive', Icon: TbBrandGoogleDrive},
	{id: 'dropbox', labelKey: 'files-clouddrive.provider-dropbox', Icon: TbCloud},
	{id: 'onedrive', labelKey: 'files-clouddrive.provider-onedrive', Icon: TbBrandOnedrive},
]

enum Step {
	Provider = 0,
	Authorize = 1,
}

/* ------------------------------------------------------------------ */
/* MAIN COMPONENT                                                      */
/* ------------------------------------------------------------------ */
export default function AddCloudDriveDialog() {
	const dialogProps = useDialogOpenProps('files-clouddrive')
	const isMobile = useIsMobile()
	const utils = trpcReact.useUtils()
	const {navigateToDirectory} = useNavigate()

	// Wizard STEP 1 — surface the two-machine copy-paste `rclone authorize` blob.
	const {mutateAsync: authorizeStart, isPending: isAuthorizing} =
		trpcReact.system.cloudDriveAuthorizeStart.useMutation({
			onError: (error: RouterError) =>
				toast.error(t('files-clouddrive.authorize-error', {message: error.message})),
		})

	// Wizard STEP 2 — persist (DEK-encrypted) + mount the drive.
	const {mutateAsync: addDrive, isPending: isAddingDrive} = trpcReact.system.cloudDriveAdd.useMutation({
		onError: (error: RouterError) => toast.error(t('files-clouddrive.add-error', {message: error.message})),
	})

	const [step, setStep] = useState<Step>(Step.Provider)
	const [backend, setBackend] = useState<CloudBackend | undefined>(undefined)
	const [remote, setRemote] = useState('')
	const [instructions, setInstructions] = useState('')
	const [token, setToken] = useState('')
	const [showAdvanced, setShowAdvanced] = useState(false)
	const [clientId, setClientId] = useState('')
	const [clientSecret, setClientSecret] = useState('')

	const resetAll = () => {
		setStep(Step.Provider)
		setBackend(undefined)
		setRemote('')
		setInstructions('')
		setToken('')
		setShowAdvanced(false)
		setClientId('')
		setClientSecret('')
	}

	useEffect(() => {
		if (dialogProps.open) resetAll()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [dialogProps.open])

	const remoteValid = REMOTE_NAME_RE.test(remote) && remote.length <= 64
	// The exact command the operator runs on a machine that has a browser.
	const authorizeCommand = backend ? `rclone authorize "${backend}"` : ''

	// Move Provider → Authorize, fetching the copy-paste instructions blob.
	const goAuthorize = async () => {
		if (!backend || !remoteValid) return
		try {
			const res = await authorizeStart({backend})
			setInstructions(res.instructions ?? '')
			setStep(Step.Authorize)
		} catch {
			// hook shows the error toast; stay on the provider step
		}
	}

	const handleSubmit = async () => {
		if (!backend || !remoteValid || !token.trim()) return
		try {
			await addDrive({
				remote,
				backend,
				token: token.trim(),
				clientId: clientId.trim() || undefined,
				clientSecret: clientSecret.trim() || undefined,
			})
			// Refresh the sidebar list + the /Cloud listing, then jump into the new drive.
			await utils.system.cloudDriveList.invalidate()
			utils.files.list.invalidate({path: CLOUD_STORAGE_PATH})
			navigateToDirectory(`${CLOUD_STORAGE_PATH}/${remote}`)
			dialogProps.onOpenChange(false)
		} catch {
			// the add-drive mutation shows the error toast
		}
	}

	/* footer */
	let footer: React.ReactNode = null
	if (step === Step.Provider) {
		footer = (
			<DialogFooter className={`${isMobile ? 'flex flex-col items-stretch' : 'flex items-center'} gap-2 pt-4`}>
				<Button variant='primary' size='dialog' disabled={!backend || !remoteValid || isAuthorizing} onClick={goAuthorize}>
					{isAuthorizing ? <Loader2 className='h-4 w-4 animate-spin' /> : t('files-clouddrive.continue')}
				</Button>
			</DialogFooter>
		)
	} else {
		footer = (
			<DialogFooter className='gap-2 pt-4'>
				<Button size='dialog' onClick={() => setStep(Step.Provider)}>
					{t('files-clouddrive.back')}
				</Button>
				<Button variant='primary' size='dialog' disabled={!token.trim() || isAddingDrive} onClick={handleSubmit}>
					{isAddingDrive ? <Loader2 className='h-4 w-4 animate-spin' /> : t('files-clouddrive.add-drive')}
				</Button>
			</DialogFooter>
		)
	}

	const header = (
		<>
			{isMobile ? (
				<DrawerHeader>
					<DrawerTitle>{t('files-clouddrive.title')}</DrawerTitle>
					<DrawerDescription>{t('files-clouddrive.description')}</DrawerDescription>
				</DrawerHeader>
			) : (
				<DialogHeader>
					<DialogTitle>{t('files-clouddrive.title')}</DialogTitle>
					<DialogDescription>{t('files-clouddrive.description')}</DialogDescription>
				</DialogHeader>
			)}
		</>
	)

	const body = (
		<div className='flex-1 overflow-y-auto overflow-x-hidden'>
			{step === Step.Provider ? (
				<ProviderStep
					backend={backend}
					onSelectBackend={setBackend}
					remote={remote}
					onRemoteChange={setRemote}
					remoteValid={remoteValid}
				/>
			) : (
				<AuthorizeStep
					command={authorizeCommand}
					instructions={instructions}
					token={token}
					onTokenChange={setToken}
					showAdvanced={showAdvanced}
					onToggleAdvanced={() => setShowAdvanced((v) => !v)}
					clientId={clientId}
					onClientIdChange={setClientId}
					clientSecret={clientSecret}
					onClientSecretChange={setClientSecret}
				/>
			)}
		</div>
	)

	if (isMobile) {
		return (
			<Drawer open={dialogProps.open} onOpenChange={dialogProps.onOpenChange}>
				<DrawerContent fullHeight>
					{header}
					<DrawerScroller>{body}</DrawerScroller>
					{footer}
				</DrawerContent>
			</Drawer>
		)
	}

	return (
		<Dialog {...dialogProps}>
			<DialogContent className='flex min-h-[480px] flex-col'>
				{header}
				{body}
				{footer}
			</DialogContent>
		</Dialog>
	)
}

/* ------------------------------------------------------------------ */
/* STEP 1 — provider picker + drive name                              */
/* ------------------------------------------------------------------ */
function ProviderStep({
	backend,
	onSelectBackend,
	remote,
	onRemoteChange,
	remoteValid,
}: {
	backend?: CloudBackend
	onSelectBackend: (b: CloudBackend) => void
	remote: string
	onRemoteChange: (v: string) => void
	remoteValid: boolean
}) {
	return (
		<div className='space-y-5 py-2'>
			<div className='space-y-3'>
				<p className='text-sm font-medium'>{t('files-clouddrive.provider-label')}</p>
				<div className='grid grid-cols-[repeat(auto-fill,minmax(125px,1fr))] gap-4'>
					{BACKENDS.map(({id, labelKey, Icon}) => (
						<ServerCard key={id} selected={backend === id} onClick={() => onSelectBackend(id)}>
							<Icon className='mb-2 size-10 text-text-secondary' />
							<span className='w-full truncate text-center text-[12px]'>{t(labelKey)}</span>
						</ServerCard>
					))}
				</div>
			</div>

			<div className='space-y-2'>
				<label className='text-13 text-text-secondary'>{t('files-clouddrive.name-label')}</label>
				<Input
					type='text'
					// Keep input aligned with the server-side charset guard.
					value={remote}
					onChange={(e) => onRemoteChange(e.target.value.toLowerCase())}
					placeholder={t('files-clouddrive.name-placeholder')}
				/>
				<p className={cn('text-xs', remote && !remoteValid ? 'text-destructive2-lightest' : 'text-text-tertiary')}>
					{remote && !remoteValid ? t('files-clouddrive.name-invalid') : t('files-clouddrive.name-hint')}
				</p>
			</div>
		</div>
	)
}

/* ------------------------------------------------------------------ */
/* STEP 2 — two-machine copy-paste authorize                          */
/* ------------------------------------------------------------------ */
function AuthorizeStep({
	command,
	instructions,
	token,
	onTokenChange,
	showAdvanced,
	onToggleAdvanced,
	clientId,
	onClientIdChange,
	clientSecret,
	onClientSecretChange,
}: {
	command: string
	instructions: string
	token: string
	onTokenChange: (v: string) => void
	showAdvanced: boolean
	onToggleAdvanced: () => void
	clientId: string
	onClientIdChange: (v: string) => void
	clientSecret: string
	onClientSecretChange: (v: string) => void
}) {
	return (
		<div className='space-y-4 py-2'>
			<p className='text-sm font-medium'>{t('files-clouddrive.authorize-title')}</p>
			<p className='text-13 text-text-tertiary'>{t('files-clouddrive.authorize-hint')}</p>

			{/* The exact command to run on a machine that has a web browser. */}
			<div className='space-y-1.5'>
				<label className='text-13 text-text-secondary'>{t('files-clouddrive.command-label')}</label>
				<code className='block select-all break-all rounded-8 bg-surface-base px-3 py-2 font-mono text-13 text-text-primary'>
					{command}
				</code>
			</div>

			{/* The full server-provided instructions blob. */}
			{instructions && (
				<pre className='whitespace-pre-wrap rounded-8 bg-surface-base px-3 py-2 text-xs text-text-tertiary'>
					{instructions}
				</pre>
			)}

			{/* Paste-back the token blob rclone prints on the browser machine. */}
			<div className='space-y-1.5'>
				<label className='text-13 text-text-secondary'>{t('files-clouddrive.token-label')}</label>
				<textarea
					value={token}
					onChange={(e) => onTokenChange(e.target.value)}
					placeholder={t('files-clouddrive.token-placeholder')}
					rows={4}
					className='w-full resize-y rounded-8 border border-border-subtle bg-surface-base px-3 py-2 font-mono text-13 text-text-primary outline-none focus:border-brand'
				/>
			</div>

			{/* Advanced escape hatch: bring-your-own OAuth client if the shared one is throttled. */}
			<Collapsible open={showAdvanced}>
				<CollapsibleTrigger
					onClick={onToggleAdvanced}
					className='flex w-full items-center justify-between text-xs font-medium text-brand-lightest transition-opacity duration-300 hover:opacity-80'
				>
					{t('files-clouddrive.advanced-toggle')}
					{showAdvanced ? <ChevronUp className='h-4 w-4' /> : <ChevronDown className='h-4 w-4' />}
				</CollapsibleTrigger>
				<CollapsibleContent className='space-y-3 pt-3'>
					<p className='text-xs text-text-tertiary'>{t('files-clouddrive.advanced-hint')}</p>
					<div className='space-y-1.5'>
						<label className='text-13 text-text-secondary'>{t('files-clouddrive.client-id-label')}</label>
						<Input
							type='text'
							value={clientId}
							onChange={(e) => onClientIdChange(e.target.value)}
							placeholder={t('files-clouddrive.client-id-placeholder')}
						/>
					</div>
					<div className='space-y-1.5'>
						<label className='text-13 text-text-secondary'>{t('files-clouddrive.client-secret-label')}</label>
						<PasswordInput value={clientSecret} onValueChange={onClientSecretChange} />
					</div>
				</CollapsibleContent>
			</Collapsible>
		</div>
	)
}
