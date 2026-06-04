import {useEffect, useState} from 'react'
import {toast} from 'sonner'

import {trpcReact} from '@/trpc/trpc'
import {Switch} from '@/shadcn-components/ui/switch'
import {cn} from '@/shadcn-lib/utils'

// ─── Phase 258 WS-D (258-04) — the Share-dialog "Public access" section ────────
//
// This component is PURELY presentational over the 258-03 server policy. The
// SERVER (setPublicAccess) is the real gate — it returns 403 for a forbidden app
// and re-asserts isPublicForbidden at every Caddy regen (fail-closed). The lock /
// confirm / pre-fill here MIRROR that policy; they never override it. See
// 258-03-SUMMARY.md ("the UI lock is cosmetic").

type ForbiddenReason =
	| 'never-public'
	| 'daemon-bearer'
	| 'docker-sock'
	| 'privileged'
	| 'host-network'
	| 'local-ai-clis'

/**
 * Map the server's machine `reason` to friendly operator copy. Pure so it can be
 * unit-tested without rendering (the UI package has no RTL — see repo convention).
 */
export function forbiddenReasonCopy(reason: ForbiddenReason | string | undefined): string {
	switch (reason) {
		case 'never-public':
			return "This app can't be made public — it's a never-public admin app."
		case 'daemon-bearer':
			return "This app can't be made public — it uses a privileged LivOS daemon token."
		case 'docker-sock':
			return "This app can't be made public — it has access to the Docker socket."
		case 'privileged':
			return "This app can't be made public — it runs as a privileged container."
		case 'host-network':
			return "This app can't be made public — it uses the host network."
		case 'local-ai-clis':
			return "This app can't be made public — it runs host AI CLIs with your credentials."
		default:
			return "This app can't be made public for security reasons."
	}
}

/**
 * Build the whole-app confirmation warning. Pure + unit-tested: surfaces the
 * no-LivOS-login risk and the app's own-auth situation (SC2 — make the
 * no-fallback-auth risk explicit).
 */
export function wholeAppConfirmText(appName: string, hasOwnAuth: boolean): string {
	return (
		`Anyone with the link can reach ${appName} without logging into LivOS. ` +
		`${appName} has ${hasOwnAuth ? 'its own login' : 'no detected login'}. Continue?`
	)
}

export function PublicAccessSection({appId}: {appId: string}) {
	const utils = trpcReact.useUtils()
	const q = trpcReact.apps.getPublicAccess.useQuery({appId})
	const m = trpcReact.apps.setPublicAccess.useMutation()

	// Editable paths buffer (one prefix per line). Seeded from the resolved/suggested
	// server paths once the query resolves.
	const [pathsText, setPathsText] = useState<string>('')
	const [confirmingWholeApp, setConfirmingWholeApp] = useState(false)
	const [seeded, setSeeded] = useState(false)

	const data = q.data
	const appName = appId

	// Seed the editable paths once: prefer the currently-configured paths, else the
	// manifest-suggested defaults (SC1 — pre-fill suggested public paths).
	useEffect(() => {
		if (!data || seeded) return
		const seed = data.paths && data.paths.length > 0 ? data.paths : data.suggestedPaths
		setPathsText((seed ?? []).join('\n'))
		setSeeded(true)
	}, [data, seeded])

	const apply = async (mode: 'none' | 'whole-app' | 'paths', paths?: string[]) => {
		try {
			const res = await m.mutateAsync({appId, mode, paths})
			await utils.apps.getPublicAccess.invalidate({appId})
			if (mode === 'none') {
				toast.success(`${appName} is now private`)
			} else {
				toast.success(`${appName} is now public`)
			}
			return res
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to update public access')
		}
	}

	const enablePaths = () => {
		const paths = pathsText
			.split('\n')
			.map((p) => p.trim())
			.filter((p) => p.length > 0)
		void apply('paths', paths)
	}

	// ── Section shell ──────────────────────────────────────────────────────────
	const Shell = ({children}: {children: React.ReactNode}) => (
		<div className='mt-3 border-t border-white/10 pt-3'>
			<div className='mb-1 text-sm font-medium text-white'>Public access</div>
			{children}
		</div>
	)

	if (q.isLoading || !data) {
		return (
			<Shell>
				<div className='h-9 animate-pulse rounded-lg bg-white/5' />
			</Shell>
		)
	}

	// ── FORBIDDEN: locked toggle + reason (SC3) ────────────────────────────────
	if (data.forbidden) {
		return (
			<Shell>
				<div className='flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2.5 opacity-60'>
					<Switch checked={false} disabled />
					<div className='flex-1 text-xs text-white/50'>{forbiddenReasonCopy(data.reason)}</div>
				</div>
			</Shell>
		)
	}

	const isPublic = data.mode !== 'none'
	const busy = m.isPending

	return (
		<Shell>
			<p className='mb-2 text-xs text-white/50'>
				Make this app reachable without a LivOS login, for share-by-link use cases.
			</p>

			{/* Current state + make-private */}
			{isPublic && (
				<div className='mb-2 rounded-lg bg-white/5 px-3 py-2.5'>
					<div className='text-xs text-white/70'>
						Public via{' '}
						<span className='font-medium text-white'>
							{data.mode === 'whole-app' ? 'whole app' : 'specific paths'}
						</span>
					</div>
					{data.publicUrl && (
						<a
							href={`https://${data.publicUrl}`}
							target='_blank'
							rel='noreferrer'
							className='mt-1 block truncate text-xs text-brand underline'
						>
							https://{data.publicUrl}
						</a>
					)}
					<button
						onClick={() => apply('none')}
						disabled={busy}
						className='mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50'
					>
						Make private
					</button>
				</div>
			)}

			{/* Paths mode — pre-filled editable prefixes (SC1) */}
			<div className='mb-2'>
				<label className='mb-1 block text-xs text-white/50'>
					Public path prefixes (one per line)
				</label>
				<textarea
					value={pathsText}
					onChange={(e) => setPathsText(e.target.value)}
					rows={4}
					placeholder='/booking&#10;/d/'
					className='w-full resize-y rounded-lg bg-white/10 px-3 py-2 font-mono text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-brand/50'
				/>
				<button
					onClick={enablePaths}
					disabled={busy}
					className='mt-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50'
				>
					{data.mode === 'paths' ? 'Update public paths' : 'Enable public paths'}
				</button>
			</div>

			{/* Whole-app toggle with confirmation (SC2) */}
			{!confirmingWholeApp ? (
				<button
					onClick={() => setConfirmingWholeApp(true)}
					disabled={busy || data.mode === 'whole-app'}
					className={cn(
						'rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50',
						data.mode === 'whole-app' && 'cursor-default opacity-50',
					)}
				>
					Make whole app public
				</button>
			) : (
				<div className='rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5'>
					<div className='text-xs text-white/80'>{wholeAppConfirmText(appName, data.hasOwnAuth)}</div>
					<div className='mt-2 flex gap-2'>
						<button
							onClick={async () => {
								setConfirmingWholeApp(false)
								await apply('whole-app')
							}}
							disabled={busy}
							className='rounded-lg bg-yellow-500/80 px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-yellow-500 disabled:opacity-50'
						>
							Make public
						</button>
						<button
							onClick={() => setConfirmingWholeApp(false)}
							disabled={busy}
							className='rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50'
						>
							Cancel
						</button>
					</div>
				</div>
			)}
		</Shell>
	)
}
