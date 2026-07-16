import prettyBytes from 'pretty-bytes'
import {useCallback, useEffect, useState} from 'react'
import {TbDownload, TbFile, TbFolder, TbLock} from 'react-icons/tb'
import {useParams} from 'react-router-dom'

import LivinityLogo from '@/assets/livinity-logo'
import {Loading} from '@/components/ui/loading'
import {Button} from '@/shadcn-components/ui/button'
import {PasswordInput} from '@/shadcn-components/ui/input'
import {t} from '@/utils/i18n'

// FILES-01 (D-02/D-04/D-05) — the unauthenticated public landing/download page.
// It reads `:token` from the URL and calls the 324-01 public routes
//   GET /api/files/share/:token            (metadata + optional dir listing)
//   GET /api/files/share/:token/download   (stream a file)
//   GET /api/files/share/:token/thumbnail  (existing thumbnail only)
// mounted on the livinityd `publicApi` router (never the session tRPC client).
//
// SECURITY posture:
//  - It assumes NO session cookie — the opaque token in the URL is the ONLY
//    credential. `credentials: 'include'` is set only so the server-minted
//    per-token unlock GRANT cookie (password shares) rides subsequent requests.
//  - It renders a SINGLE generic not-available state for ANY failure and NEVER
//    distinguishes not-found / revoked / expired / exhausted (D-05, no client
//    oracle). Only a password-REQUIRED signal opens the unlock prompt, and a
//    wrong password is surfaced without revealing anything else.
//  - The password is held ONLY in transient state, sent via the `x-share-password`
//    header (never the URL/query), and never persisted client-side.

type ShareEntry = {
	name: string
	type: string
	size: number
	modified: number | string
	subPath: string
	hasThumbnail: boolean
}

type ShareMeta = {
	name: string
	type: string
	size: number
	modified: number | string
	hasPassword: boolean
	expiresAt: number | string | null
	downloadsRemaining: number | null
	entries?: ShareEntry[]
}

type ViewState =
	| {kind: 'loading'}
	| {kind: 'not-available'}
	| {kind: 'password-required'; wrongPassword: boolean}
	| {kind: 'ready'; meta: ShareMeta}

function shareApiBase(token: string): string {
	return `/api/files/share/${encodeURIComponent(token)}`
}

function downloadUrl(token: string, subPath?: string): string {
	const base = `${shareApiBase(token)}/download`
	return subPath ? `${base}?path=${encodeURIComponent(subPath)}` : base
}

function thumbnailUrl(token: string, subPath: string): string {
	return `${shareApiBase(token)}/thumbnail?path=${encodeURIComponent(subPath)}`
}

export default function PublicSharePage() {
	const {token = ''} = useParams<{token: string}>()
	const [view, setView] = useState<ViewState>({kind: 'loading'})
	const [password, setPassword] = useState('')
	const [unlocking, setUnlocking] = useState(false)

	// Fetch the share metadata. `passwordAttempt` is sent via the x-share-password
	// header ONLY when the viewer is submitting an unlock (never on the first load).
	const load = useCallback(
		async (passwordAttempt?: string): Promise<void> => {
			if (!token) {
				setView({kind: 'not-available'})
				return
			}
			try {
				const headers: Record<string, string> = {}
				if (passwordAttempt) headers['x-share-password'] = passwordAttempt
				const res = await fetch(shareApiBase(token), {
					method: 'GET',
					credentials: 'include',
					headers,
				})

				if (res.ok) {
					const meta = (await res.json()) as ShareMeta
					setView({kind: 'ready', meta})
					return
				}

				// 401 with the password-required sentinel → open the unlock prompt.
				// A wrong password (or a throttle, which is byte-identical server-side)
				// re-opens it with a generic wrong-password message. Everything else
				// (404 / any other status) collapses to the single generic state.
				let errorCode = ''
				try {
					const bodyJson = (await res.json()) as {error?: string}
					errorCode = bodyJson.error ?? ''
				} catch {
					errorCode = ''
				}

				if (res.status === 401 && errorCode === '[share-password-required]') {
					setView({kind: 'password-required', wrongPassword: false})
				} else if (res.status === 401) {
					// [share-wrong-password] (or an indistinguishable throttle denial).
					setView({kind: 'password-required', wrongPassword: Boolean(passwordAttempt)})
				} else {
					setView({kind: 'not-available'})
				}
			} catch {
				// Network / parse failure — never leak details, show the generic state.
				setView({kind: 'not-available'})
			}
		},
		[token],
	)

	useEffect(() => {
		void load()
	}, [load])

	const handleUnlock = async () => {
		if (!password) return
		setUnlocking(true)
		await load(password)
		setUnlocking(false)
	}

	return (
		<div className='flex min-h-svh w-full flex-col items-center justify-center gap-6 p-6'>
			<LivinityLogo className='h-8 w-auto opacity-90' />

			<div className='w-full max-w-md rounded-20 border border-border-subtle bg-surface-base p-6 shadow-sm'>
				{view.kind === 'loading' && (
					<div className='flex flex-col items-center gap-3 py-8'>
						<Loading />
						<span className='text-13 text-text-tertiary'>{t('files-public-share.page-loading')}</span>
					</div>
				)}

				{view.kind === 'not-available' && (
					<div className='flex flex-col items-center gap-2 py-8 text-center'>
						<h1 className='text-16 font-semibold text-text-primary'>{t('files-public-share.not-available-title')}</h1>
						<p className='text-13 text-text-secondary'>{t('files-public-share.not-available-description')}</p>
					</div>
				)}

				{view.kind === 'password-required' && (
					<div className='flex flex-col gap-4'>
						<div className='flex flex-col items-center gap-2 text-center'>
							<TbLock className='size-8 opacity-70' />
							<h1 className='text-16 font-semibold text-text-primary'>
								{t('files-public-share.password-required-title')}
							</h1>
							<p className='text-13 text-text-secondary'>
								{t('files-public-share.password-required-description')}
							</p>
						</div>
						<PasswordInput value={password} onValueChange={setPassword} autoFocus />
						{view.wrongPassword && (
							<p className='text-13 text-destructive2-lightest'>{t('files-public-share.wrong-password')}</p>
						)}
						<Button variant='primary' size='dialog' disabled={unlocking || !password} onClick={handleUnlock}>
							{unlocking ? t('files-public-share.unlocking') : t('files-public-share.unlock')}
						</Button>
					</div>
				)}

				{view.kind === 'ready' && <ReadyView token={token} meta={view.meta} />}
			</div>
		</div>
	)
}

function ReadyView({token, meta}: {token: string; meta: ShareMeta}) {
	const isDirectory = meta.type === 'directory'

	return (
		<div className='flex flex-col gap-4'>
			<div className='flex items-center gap-3'>
				{isDirectory ? <TbFolder className='size-8 shrink-0 opacity-80' /> : <TbFile className='size-8 shrink-0 opacity-80' />}
				<div className='flex min-w-0 flex-col'>
					<span className='truncate text-15 font-semibold text-text-primary' title={meta.name}>
						{meta.name}
					</span>
					<span className='text-12 text-text-tertiary'>
						{isDirectory ? t('files-public-share.folder-heading') : prettyBytes(meta.size || 0)}
					</span>
				</div>
			</div>

			{meta.downloadsRemaining !== null && (
				<p className='text-12 text-text-tertiary'>
					{t('files-public-share.downloads-remaining', {count: meta.downloadsRemaining})}
				</p>
			)}

			{isDirectory ? (
				(meta.entries?.length ?? 0) === 0 ? (
					<p className='py-4 text-13 text-text-tertiary'>{t('files-public-share.directory-empty')}</p>
				) : (
					<ul className='flex flex-col divide-y divide-border-subtle rounded-12 bg-surface-1'>
						{meta.entries!.map((entry) => (
							<li key={entry.subPath} className='flex items-center gap-3 px-3 py-2.5'>
								{entry.hasThumbnail ? (
									<img
										src={thumbnailUrl(token, entry.subPath)}
										alt=''
										className='size-8 shrink-0 rounded-6 object-cover'
										loading='lazy'
									/>
								) : entry.type === 'directory' ? (
									<TbFolder className='size-5 shrink-0 opacity-70' />
								) : (
									<TbFile className='size-5 shrink-0 opacity-70' />
								)}
								<div className='flex min-w-0 flex-1 flex-col'>
									<span className='truncate text-13 text-text-primary' title={entry.name}>
										{entry.name}
									</span>
									{entry.type !== 'directory' && (
										<span className='text-11 text-text-tertiary'>{prettyBytes(entry.size || 0)}</span>
									)}
								</div>
								{entry.type !== 'directory' && (
									<a
										href={downloadUrl(token, entry.subPath)}
										className='shrink-0 rounded-lg p-1.5 text-text-secondary hover:bg-surface-2 hover:text-text-primary'
										title={t('files-public-share.download')}
										download
									>
										<TbDownload className='size-4' />
									</a>
								)}
							</li>
						))}
					</ul>
				)
			) : (
				<a href={downloadUrl(token)} download>
					<Button variant='primary' size='dialog' className='w-full'>
						<TbDownload className='size-4' />
						{t('files-public-share.download')}
					</Button>
				</a>
			)}
		</div>
	)
}
