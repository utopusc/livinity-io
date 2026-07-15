import {Loader2} from 'lucide-react'
import {useEffect, useState} from 'react'
import {TbCopy} from 'react-icons/tb'
import {useSearchParams} from 'react-router-dom'
import {useCopyToClipboard} from 'react-use'

import {ErrorAlert} from '@/components/ui/alert'
import {MySharesList} from '@/features/files/components/dialogs/public-share-dialog/my-shares-list'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {Button} from '@/shadcn-components/ui/button'
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
import {Label} from '@/shadcn-components/ui/label'
import {trpcReact} from '@/trpc/trpc'
import {useDialogOpenProps} from '@/utils/dialog'
import {t} from '@/utils/i18n'
import {sleep} from '@/utils/misc'

// FILES-01 (D-02/D-04/D-05) — the NEW public-share mint dialog. Its OWN dir
// (`public-share-dialog/`), DISTINCT from the Samba LAN share dialog which owns
// the `share` FileOperation, the `files.shares` store key and the
// `files-share.*` i18n. This dialog touches NONE of that surface — it wires
// ONLY to the 324-06 owner procedures (`system.shareCreate` / `shareList` /
// `shareRevoke`) under the NEW `files-public-share.*` namespace.
//
// SECURITY (T-324-20): the raw `liv_share_` token is rendered EXACTLY ONCE, from
// the mint mutation's transient response, with a copy button + an explicit "you
// won't see this again" warning. After the dialog closes it is unrecoverable —
// the always-visible "My shares" audit list below shows the prefix only (D-01).
export default function PublicShareDialog() {
	const isMobile = useIsMobile()
	const dialogProps = useDialogOpenProps('files-public-share')
	const [searchParams] = useSearchParams()
	const name = searchParams.get('files-public-share-name') || ''
	const path = searchParams.get('files-public-share-path') || ''

	const [, copyToClipboard] = useCopyToClipboard()
	const [showCopied, setShowCopied] = useState(false)

	// Optional gate controls. Transient — wiped on every open (see effect below).
	const [password, setPassword] = useState('')
	const [expiry, setExpiry] = useState('')
	const [maxDownloads, setMaxDownloads] = useState('')

	const createMutation = trpcReact.system.shareCreate.useMutation()
	const utils = trpcReact.useUtils()

	// The raw token is surfaced ONCE in the mutation's transient response (D-01).
	const mintedToken = createMutation.data?.token ?? ''
	const shareLink = mintedToken ? `${window.location.origin}/files/share/${mintedToken}` : ''

	// Reset all transient state (incl. the one-time token) on every open/close so
	// the plaintext link never survives a dialog reopen.
	useEffect(() => {
		if (dialogProps.open) {
			setPassword('')
			setExpiry('')
			setMaxDownloads('')
			setShowCopied(false)
			createMutation.reset()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [dialogProps.open, path])

	const handleCreate = async () => {
		const parsedMax = maxDownloads.trim() ? Number.parseInt(maxDownloads, 10) : undefined
		await createMutation
			.mutateAsync({
				virtualPath: path,
				password: password.trim() ? password : undefined,
				expiresAt: expiry ? new Date(expiry).toISOString() : undefined,
				maxDownloads: parsedMax && parsedMax > 0 ? parsedMax : undefined,
			})
			.then(() => {
				// Surface the new row in the audit list immediately.
				utils.system.shareList.invalidate()
			})
			.catch(() => {
				// The mutation's error state renders the inline alert below.
			})
	}

	const handleCopyLink = async () => {
		if (!shareLink) return
		copyToClipboard(shareLink)
		setShowCopied(true)
		await sleep(1200)
		setShowCopied(false)
	}

	const busy = createMutation.isPending

	const title = t('files-public-share.title')
	const description = name
		? t('files-public-share.description', {name})
		: t('files-public-share.description-generic')

	const body = (
		<div className='flex flex-col gap-5'>
			{mintedToken ? (
				/* ── One-time link view (mint success): shown ONCE, never persisted ── */
				<div className='flex flex-col gap-3'>
					<Label className='text-13 text-text-primary'>{t('files-public-share.link-ready-title')}</Label>
					<div className='flex items-start gap-2 rounded-12 border border-[#FF9500]/60 bg-[#FF9500]/10 p-3'>
						<code className='min-w-0 flex-1 select-all whitespace-pre-wrap break-all font-mono text-12 text-text-primary'>
							{shareLink}
						</code>
						<button
							type='button'
							onClick={handleCopyLink}
							className='flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-12 text-text-secondary hover:bg-surface-1'
						>
							<TbCopy className='size-4' />
							{showCopied ? t('clipboard.copied') : t('files-public-share.copy-link')}
						</button>
					</div>
					<ErrorAlert description={t('files-public-share.link-warning')} className='text-left' />
				</div>
			) : (
				/* ── Mint form ── */
				<div className='flex flex-col gap-4'>
					<div className='flex flex-col gap-2'>
						<Label className='text-13 text-text-secondary'>{t('files-public-share.path-label')}</Label>
						<div className='truncate rounded-8 bg-surface-base px-3 py-2 font-mono text-12 text-text-primary' title={path}>
							{path || '—'}
						</div>
					</div>
					<div className='flex flex-col gap-2'>
						<Label htmlFor='pubshare-password' className='text-13 text-text-secondary'>
							{t('files-public-share.password-label')}
						</Label>
						<PasswordInput id='pubshare-password' value={password} onValueChange={setPassword} disabled={busy} />
						<span className='text-12 text-text-tertiary'>{t('files-public-share.password-hint')}</span>
					</div>
					<div className='flex flex-col gap-2'>
						<Label htmlFor='pubshare-expiry' className='text-13 text-text-secondary'>
							{t('files-public-share.expiry-label')}
						</Label>
						<Input
							id='pubshare-expiry'
							type='datetime-local'
							value={expiry}
							onChange={(e) => setExpiry(e.target.value)}
							disabled={busy}
						/>
						<span className='text-12 text-text-tertiary'>{t('files-public-share.expiry-hint')}</span>
					</div>
					<div className='flex flex-col gap-2'>
						<Label htmlFor='pubshare-max' className='text-13 text-text-secondary'>
							{t('files-public-share.max-downloads-label')}
						</Label>
						<Input
							id='pubshare-max'
							type='number'
							min={1}
							value={maxDownloads}
							placeholder={t('files-public-share.max-downloads-placeholder')}
							onChange={(e) => setMaxDownloads(e.target.value)}
							disabled={busy}
						/>
						<span className='text-12 text-text-tertiary'>{t('files-public-share.max-downloads-hint')}</span>
					</div>

					{createMutation.isError && (
						<ErrorAlert description={t('files-public-share.create-error')} className='text-left' />
					)}
				</div>
			)}

			{/* Always-available owner audit/revoke list (D-05, CVE-2026-45285). */}
			<div className='my-1 h-px w-full bg-border-subtle' />
			<MySharesList />
		</div>
	)

	const footer = mintedToken ? (
		<Button variant='primary' size='dialog' onClick={() => dialogProps.onOpenChange(false)}>
			{t('files-public-share.done')}
		</Button>
	) : (
		<Button variant='primary' size='dialog' disabled={busy || !path} onClick={handleCreate}>
			{busy ? <Loader2 className='size-4 animate-spin' /> : t('files-public-share.create')}
		</Button>
	)

	if (isMobile) {
		return (
			<Drawer {...dialogProps}>
				<DrawerContent fullHeight>
					<DrawerHeader>
						<DrawerTitle>{title}</DrawerTitle>
						<DrawerDescription>{description}</DrawerDescription>
					</DrawerHeader>
					<DrawerScroller>{body}</DrawerScroller>
					<DialogFooter className='p-4'>{footer}</DialogFooter>
				</DrawerContent>
			</Drawer>
		)
	}

	return (
		<Dialog {...dialogProps}>
			<DialogContent className='flex max-h-[85vh] flex-col'>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<div className='livinity-hide-scrollbar flex-1 overflow-y-auto'>{body}</div>
				<DialogFooter>{footer}</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
