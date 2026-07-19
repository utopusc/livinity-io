/**
 * Phase 344-04 (XFER-01 UI half) — Settings-level "Import app bundle" surface.
 *
 * The target-box half of a cross-box single-app migration (D-344-2 = admin browser
 * transport). Flow:
 *   1. Pick a `.livbundle` the operator exported on the SOURCE box.
 *   2. Stream it to the box via the dedicated admin route
 *      POST /api/app-migration/upload?file=<name> (temp+rename staging, 344-03 /
 *      migration-api.ts), with an XHR upload-progress indicator (native-deb-upload
 *      precedent). The uploaded basename is what importBundle then consumes.
 *   3. Run appMigration.importBundle behind the 334 useStepUp() retry hook — the route
 *      is stepUpAdminProcedure server-side (executes an uploaded compose + writes app
 *      data, luksFormat risk tier, D-344-7). We REUSE the apps.uninstall step-up pattern
 *      exactly; we never build a new modal.
 *   4. Poll appMigration.migrationStatus for progress while the import runs.
 *   5. Surface the honest outcome: on {ok:true} the reconstructed appId + a
 *      re-enter-secrets note + the default-subdomain/private note (public access and
 *      protection settings are NOT carried over, D-344-5); on {ok:false} map the reason
 *      token to a friendly EN/TR string.
 *
 * importBundle is stepUpAdminProcedure server-side; non-admins see a disabled control +
 * note (defense-in-depth over the server gate, T-344-17).
 */
import {useRef, useState} from 'react'
import {TbAlertTriangle, TbLoader2, TbPackageImport, TbUpload} from 'react-icons/tb'

import {SettingsPageHeader} from '@/components/settings-page-header'
import {useCurrentUser} from '@/hooks/use-current-user'
import {isStepUpCancelled, isStepUpRequired, useStepUp} from '@/providers/step-up'
import {Button} from '@/shadcn-components/ui/button'
import {Progress} from '@/shadcn-components/ui/progress'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

// Mirrors the server's bundleFileNameSchema (migration-routes.ts) + BUNDLE_FILE_RE
// (migration-api.ts): basename charset (NO slashes → no traversal), ending `.livbundle`.
const BUNDLE_FILE_RE = /^[a-zA-Z0-9._-]+\.livbundle$/

// Reason tokens with a dedicated friendly string (app-migration.reason.*). Anything else
// falls back to app-migration.reason.unknown with the raw reason interpolated.
const KNOWN_REASONS = new Set([
	'app-already-installed',
	'bundle-manifest-invalid',
	'bundle-not-found',
	'bundle-too-new',
	'compose-rejected',
	'insufficient-space',
	'integrity-failure',
	'invalid-app-id',
	'migration-in-progress',
	'unsafe-entry',
])

/** Map a server reason (`[token] extra…` or a bare message) to a friendly localized string. */
function friendlyReason(reason: string): string {
	const m = reason.match(/^\[([a-z-]+)\]/)
	const token = m?.[1]
	if (token && KNOWN_REASONS.has(token)) return t(`app-migration.reason.${token}`)
	return t('app-migration.reason.unknown', {reason})
}

/**
 * Sanitize a picked file's name to the server-accepted basename charset. The operator
 * normally re-uploads a bundle we produced (already safe), but a renamed copy may carry
 * spaces / unicode — coerce disallowed chars to `-` so the upload+import agree on a name
 * the server will accept. Returns null if the file is not a `.livbundle` at all.
 */
function safeBundleName(fileName: string): string | null {
	if (!fileName.toLowerCase().endsWith('.livbundle')) return null
	const base = fileName.slice(0, -'.livbundle'.length)
	const safeBase = base.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^[.]+/, '') || 'bundle'
	const name = `${safeBase}.livbundle`
	return BUNDLE_FILE_RE.test(name) ? name : null
}

type Outcome =
	| {kind: 'success'; appId: string}
	| {kind: 'error'; message: string}

export function AppMigrationImportSection() {
	const {isAdmin} = useCurrentUser()
	const {withStepUp} = useStepUp()
	const fileInputRef = useRef<HTMLInputElement>(null)

	const [file, setFile] = useState<File | null>(null)
	const [uploadProgress, setUploadProgress] = useState<number | null>(null)
	const [phase, setPhase] = useState<'idle' | 'uploading' | 'importing'>('idle')
	const [outcome, setOutcome] = useState<Outcome | null>(null)
	const [localError, setLocalError] = useState<string | null>(null)

	// Poll the shared single-flight progress ONLY while a migration runs.
	const statusQ = trpcReact.appMigration.migrationStatus.useQuery(undefined, {
		refetchInterval: (query) => (query.state.data?.running ? 1000 : false),
	})
	const importMut = trpcReact.appMigration.importBundle.useMutation()

	const busy = phase !== 'idle'

	// Stream the picked bundle to the admin upload route with XHR progress
	// (native-deb-upload precedent). Resolves with the server-accepted basename.
	const uploadBundle = (picked: File, name: string): Promise<string> =>
		new Promise<string>((resolve, reject) => {
			const xhr = new XMLHttpRequest()
			xhr.open('POST', `/api/app-migration/upload?file=${encodeURIComponent(name)}`)
			xhr.setRequestHeader('Content-Type', 'application/octet-stream')
			xhr.withCredentials = true
			xhr.upload.onprogress = (e) => {
				if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
			}
			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					try {
						const body = JSON.parse(xhr.responseText) as {ok?: boolean; file?: string}
						if (body.ok && body.file) return resolve(body.file)
					} catch {
						/* fall through */
					}
					return reject(new Error(t('app-migration.upload-failed')))
				}
				let message = t('app-migration.upload-failed')
				try {
					const body = JSON.parse(xhr.responseText) as {error?: string}
					if (body.error) message = body.error
				} catch {
					/* keep default */
				}
				reject(new Error(message))
			}
			xhr.onerror = () => reject(new Error(t('app-migration.upload-failed')))
			xhr.send(picked)
		})

	const handleImport = async () => {
		if (!file) return
		setLocalError(null)
		setOutcome(null)

		const name = safeBundleName(file.name)
		if (!name) {
			setLocalError(t('app-migration.invalid-file'))
			return
		}

		try {
			// 1. Upload (progress via XHR).
			setPhase('uploading')
			setUploadProgress(0)
			const uploadedName = await uploadBundle(file, name)
			setUploadProgress(null)

			// 2. Import behind the 334 step-up gate (reused apps.uninstall pattern).
			setPhase('importing')
			statusQ.refetch()
			const result = await withStepUp(() => importMut.mutateAsync({file: uploadedName}))

			if (result.ok) {
				setOutcome({kind: 'success', appId: result.appId})
			} else {
				setOutcome({kind: 'error', message: friendlyReason(result.reason)})
			}
		} catch (error: unknown) {
			// A dismissed step-up modal is a silent no-op (the operator changed their mind);
			// the first-attempt STEP_UP_REQUIRED denial is internal — swallow both.
			if (isStepUpCancelled(error) || isStepUpRequired(error)) {
				setPhase('idle')
				setUploadProgress(null)
				statusQ.refetch()
				return
			}
			const raw = error instanceof Error ? error.message : String(error)
			setOutcome({kind: 'error', message: friendlyReason(raw)})
		} finally {
			setPhase('idle')
			setUploadProgress(null)
			statusQ.refetch()
		}
	}

	const running = statusQ.data?.running ?? false

	return (
		<div className='flex flex-col gap-6'>
			<SettingsPageHeader
				eyebrow='Migration'
				title='Import an'
				titleAccent='app bundle.'
				sub={t('app-migration.import-description')}
			/>

			<div className='space-y-4'>
				<div className='flex items-center gap-2'>
					<TbPackageImport className='h-5 w-5 text-text-primary' />
					<span className='text-body-sm font-medium text-text-primary'>{t('app-migration.import-title')}</span>
				</div>

				{/* File picker */}
				<div className='flex flex-wrap items-center gap-3'>
					<input
						ref={fileInputRef}
						type='file'
						accept='.livbundle'
						className='hidden'
						onChange={(e) => {
							setFile(e.target.files?.[0] ?? null)
							setOutcome(null)
							setLocalError(null)
						}}
					/>
					<Button
						size='sm'
						variant='default'
						onClick={() => fileInputRef.current?.click()}
						disabled={!isAdmin || busy}
					>
						<TbUpload className='mr-1 h-4 w-4' />
						{t('app-migration.choose-file')}
					</Button>
					{file ? <span className='truncate text-caption text-text-secondary'>{file.name}</span> : null}
				</div>

				{/* Import button */}
				<Button
					size='sm'
					variant='primary'
					onClick={handleImport}
					disabled={!isAdmin || !file || busy}
				>
					{busy ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
					{phase === 'uploading'
						? t('app-migration.uploading')
						: phase === 'importing'
							? t('app-migration.importing')
							: t('app-migration.import-button')}
				</Button>

				{/* Upload progress */}
				{phase === 'uploading' && uploadProgress !== null ? (
					<div className='space-y-2'>
						<p className='text-caption text-text-tertiary'>{t('app-migration.uploading')}</p>
						<Progress value={uploadProgress} />
					</div>
				) : null}

				{/* Import progress (polled shared status) */}
				{phase === 'importing' && running ? (
					<div className='space-y-2'>
						<p className='text-caption text-text-tertiary'>
							{statusQ.data?.description || t('app-migration.importing')}
						</p>
						<Progress value={statusQ.data?.progress ?? 0} />
					</div>
				) : null}

				{/* Local validation error */}
				{localError ? (
					<p role='alert' className='text-caption text-red-400'>
						{localError}
					</p>
				) : null}

				{/* Outcome */}
				{outcome?.kind === 'success' ? (
					<div className='space-y-2 rounded-radius-sm border border-border-default bg-surface-base p-3'>
						<p className='text-caption text-emerald-400'>
							{t('app-migration.import-success', {app: outcome.appId})}
						</p>
						<p className='text-caption text-text-tertiary'>{t('app-migration.reenter-secrets-note')}</p>
						<p className='text-caption text-text-tertiary'>{t('app-migration.import-note-subdomain')}</p>
					</div>
				) : null}

				{outcome?.kind === 'error' ? (
					<div className='flex items-start gap-2 rounded-radius-sm border border-border-default bg-surface-base p-3'>
						<TbAlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-red-400' />
						<p role='alert' className='text-caption text-red-400'>
							{outcome.message}
						</p>
					</div>
				) : null}

				{!isAdmin ? <p className='text-caption text-text-tertiary'>{t('app-migration.import-admin-only')}</p> : null}
			</div>
		</div>
	)
}
