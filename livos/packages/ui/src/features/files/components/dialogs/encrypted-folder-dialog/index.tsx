import {AlertOctagon} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'
import {TbCopy, TbLock, TbLockOpen} from 'react-icons/tb'

import {ErrorAlert} from '@/components/ui/alert'
import {useEncryptedFolderStore} from '@/features/files/store/use-encrypted-folder-store'
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
import {Input} from '@/shadcn-components/ui/input'
import {Label} from '@/shadcn-components/ui/label'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

// STOR-01 (D-04): the net-new Files encrypted-folder dialog. Three modes — Create /
// Unlock / Lock — wired to the 325-05 `system.crypto*` admin routes. Mounted ONCE at
// the Files window root; opens whenever the shared store holds a `target`.
//
// SECURITY (D-02 / T-325-21): the passphrase lives ONLY in transient component state,
// is `type=password`, is cleared on close, is never logged, and never reaches the
// shared store or any query cache key. The master recovery key is shown ONCE (from the
// create mutation's transient `stdout`) and is wiped via `reset()` on close — it is
// never persisted client-side.
export default function EncryptedFolderDialog() {
	const target = useEncryptedFolderStore((s) => s.target)
	const closeEncryptedFolder = useEncryptedFolderStore((s) => s.closeEncryptedFolder)
	const open = target !== null
	const mode = target?.mode ?? 'unlock'

	const utils = trpcReact.useUtils()

	// Transient, secret-bearing state — cleared on every close.
	const [cipherDir, setCipherDir] = useState('')
	const [plainDir, setPlainDir] = useState('')
	const [passphrase, setPassphrase] = useState('')
	const [passphraseConfirm, setPassphraseConfirm] = useState('')
	const [localError, setLocalError] = useState('')

	const createMutation = trpcReact.system.cryptoCreate.useMutation()
	const unlockMutation = trpcReact.system.cryptoUnlock.useMutation()
	const lockMutation = trpcReact.system.cryptoLock.useMutation()

	// Seed the host-path fields for unlock/lock from the registry target; create starts blank.
	useEffect(() => {
		if (!target) return
		setCipherDir(target.cipherDir ?? '')
		setPlainDir(target.plainDir ?? '')
		setPassphrase('')
		setPassphraseConfirm('')
		setLocalError('')
	}, [target])

	const busy = createMutation.isPending || unlockMutation.isPending || lockMutation.isPending

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) return
		// Wipe every secret-bearing surface before the store target clears.
		setCipherDir('')
		setPlainDir('')
		setPassphrase('')
		setPassphraseConfirm('')
		setLocalError('')
		createMutation.reset()
		unlockMutation.reset()
		lockMutation.reset()
		closeEncryptedFolder()
	}

	// The create mutation surfaces the master recovery key ONCE in `stdout` (D-03).
	const recoveryKey = createMutation.data?.ok ? createMutation.data.stdout.trim() : ''

	const routeReason = useMemo(() => {
		const d = mode === 'create' ? createMutation.data : mode === 'unlock' ? unlockMutation.data : lockMutation.data
		return d && !d.ok ? d.reason : ''
	}, [mode, createMutation.data, unlockMutation.data, lockMutation.data])

	// A locked folder in use reports EBUSY/"in use" — never force it, just tell the user.
	const isBusyReason = /busy|in use|ebusy|target is busy/i.test(routeReason)

	const handleCopyRecoveryKey = () => {
		if (recoveryKey) void navigator.clipboard?.writeText(recoveryKey)
	}

	const handleCreate = async () => {
		setLocalError('')
		if (passphrase.length < 8) {
			setLocalError(t('storage.encryption.passphrase-hint'))
			return
		}
		if (passphrase !== passphraseConfirm) {
			setLocalError(t('storage.encryption.passphrase-mismatch'))
			return
		}
		const result = await createMutation.mutateAsync({cipherDir, plainDir, passphrase})
		if (result.ok) {
			// Success: DON'T close — hold the dialog open on the one-time recovery-key view.
			// Wipe the passphrase now that the folder exists; the key stays only in the
			// transient mutation data until the user confirms + closes.
			setPassphrase('')
			setPassphraseConfirm('')
			utils.system.cryptoStatus.invalidate()
		}
	}

	const handleUnlock = async () => {
		setLocalError('')
		const result = await unlockMutation.mutateAsync({cipherDir, plainDir, passphrase})
		if (result.ok) {
			utils.system.cryptoStatus.invalidate()
			handleOpenChange(false)
		}
	}

	const handleLock = async () => {
		const result = await lockMutation.mutateAsync({plainDir})
		if (result.ok) {
			utils.system.cryptoStatus.invalidate()
			handleOpenChange(false)
		}
	}

	if (!open) return null

	const title =
		mode === 'create'
			? t('storage.encryption.create')
			: mode === 'unlock'
				? t('storage.encryption.unlock-title', {name: target?.name ?? ''})
				: t('storage.encryption.lock-title', {name: target?.name ?? ''})

	const Icon = mode === 'unlock' ? TbLockOpen : TbLock

	return (
		<AlertDialog open={open} onOpenChange={handleOpenChange}>
			<AlertDialogContent className='max-sm:px-4'>
				<AlertDialogHeader className='max-sm:py-0'>
					<div className='flex flex-row items-center gap-4 sm:flex-col sm:items-start'>
						<Icon className='size-10 shrink-0 opacity-90' aria-hidden />
						<div className='flex min-w-0 flex-1 flex-col gap-0.5 sm:gap-2'>
							<AlertDialogTitle className='text-left'>{title}</AlertDialogTitle>
							<span className='text-left text-sm text-text-secondary'>{t('storage.encryption.description')}</span>
						</div>
					</div>
				</AlertDialogHeader>

				<AlertDialogDescription className='flex flex-col gap-4 text-left'>
					{/* ── Recovery-key view (create success): shown ONCE, never persisted ── */}
					{recoveryKey ? (
						<div className='flex flex-col gap-3'>
							<Label className='text-left text-13 text-text-primary'>
								{t('storage.encryption.recovery-key-title')}
							</Label>
							<div className='flex items-start gap-2 rounded-dash border border-[#FF9500]/60 bg-[#FF9500]/10 p-3'>
								<code className='min-w-0 flex-1 select-all whitespace-pre-wrap break-all font-mono text-12 text-text-primary'>
									{recoveryKey}
								</code>
								<button
									type='button'
									onClick={handleCopyRecoveryKey}
									className='flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-12 text-text-secondary hover:bg-surface-1'
								>
									<TbCopy className='size-4' />
									{t('storage.encryption.copy-key')}
								</button>
							</div>
							<ErrorAlert
								icon={AlertOctagon}
								description={t('storage.encryption.recovery-key-warning')}
								className='text-left'
							/>
						</div>
					) : mode === 'create' ? (
						/* ── Create form ── */
						<>
							<div className='flex flex-col gap-2'>
								<Label htmlFor='enc-cipher-dir' className='text-left text-13 text-text-primary'>
									{t('storage.encryption.cipher-dir')}
								</Label>
								<Input
									id='enc-cipher-dir'
									value={cipherDir}
									onChange={(e) => setCipherDir(e.target.value)}
									placeholder='/opt/livos/data/users/…/.Secret.enc'
									className='w-full bg-surface-base font-mono text-12'
									disabled={busy}
									autoFocus
								/>
							</div>
							<div className='flex flex-col gap-2'>
								<Label htmlFor='enc-plain-dir' className='text-left text-13 text-text-primary'>
									{t('storage.encryption.plain-dir')}
								</Label>
								<Input
									id='enc-plain-dir'
									value={plainDir}
									onChange={(e) => setPlainDir(e.target.value)}
									placeholder='/opt/livos/data/users/…/Secret'
									className='w-full bg-surface-base font-mono text-12'
									disabled={busy}
								/>
								<span className='text-12 text-text-tertiary'>{t('storage.encryption.path-hint')}</span>
							</div>
							<div className='flex flex-col gap-2'>
								<Label htmlFor='enc-pass' className='text-left text-13 text-text-primary'>
									{t('storage.encryption.passphrase')}
								</Label>
								<Input
									id='enc-pass'
									type='password'
									value={passphrase}
									onChange={(e) => setPassphrase(e.target.value)}
									className='w-full bg-surface-base'
									disabled={busy}
									autoComplete='new-password'
								/>
							</div>
							<div className='flex flex-col gap-2'>
								<Label htmlFor='enc-pass-confirm' className='text-left text-13 text-text-primary'>
									{t('storage.encryption.passphrase-confirm')}
								</Label>
								<Input
									id='enc-pass-confirm'
									type='password'
									value={passphraseConfirm}
									onChange={(e) => setPassphraseConfirm(e.target.value)}
									className='w-full bg-surface-base'
									disabled={busy}
									autoComplete='new-password'
								/>
								<span className='text-12 text-text-tertiary'>{t('storage.encryption.passphrase-hint')}</span>
							</div>
						</>
					) : mode === 'unlock' ? (
						/* ── Unlock form ── */
						<div className='flex flex-col gap-2'>
							<Label htmlFor='enc-unlock-pass' className='text-left text-13 text-text-primary'>
								{t('storage.encryption.passphrase')}
							</Label>
							<Input
								id='enc-unlock-pass'
								type='password'
								value={passphrase}
								onChange={(e) => setPassphrase(e.target.value)}
								className='w-full bg-surface-base'
								disabled={busy}
								autoFocus
								autoComplete='off'
							/>
						</div>
					) : (
						/* ── Lock confirm ── */
						<span className='text-left text-sm text-text-secondary'>{t('storage.encryption.lock-body')}</span>
					)}

					{/* Client-side validation error */}
					{localError ? (
						<ErrorAlert icon={AlertOctagon} description={localError} className='text-left' />
					) : null}

					{/* Route-level failure (never-throw {ok:false}) — degrade, don't crash */}
					{routeReason ? (
						<ErrorAlert
							icon={AlertOctagon}
							description={
								isBusyReason
									? t('storage.encryption.busy')
									: `${t('storage.encryption.failed')} ${routeReason}`
							}
							className='text-left'
						/>
					) : null}
				</AlertDialogDescription>

				<AlertDialogFooter className='md:justify-start'>
					{recoveryKey ? (
						<AlertDialogAction className='px-6' onClick={() => handleOpenChange(false)} hideEnterIcon>
							{t('storage.encryption.recovery-key-saved')}
						</AlertDialogAction>
					) : mode === 'create' ? (
						<>
							<AlertDialogAction className='px-6' onClick={handleCreate} disabled={busy} hideEnterIcon>
								{busy ? t('storage.encryption.working') : t('storage.encryption.create')}
							</AlertDialogAction>
							<AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel>
						</>
					) : mode === 'unlock' ? (
						<>
							<AlertDialogAction className='px-6' onClick={handleUnlock} disabled={busy || !passphrase} hideEnterIcon>
								{busy ? t('storage.encryption.working') : t('storage.encryption.unlock')}
							</AlertDialogAction>
							<AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel>
						</>
					) : (
						<>
							<AlertDialogAction variant='destructive' className='px-6' onClick={handleLock} disabled={busy} hideEnterIcon>
								{busy ? t('storage.encryption.working') : t('storage.encryption.lock')}
							</AlertDialogAction>
							<AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel>
						</>
					)}
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
