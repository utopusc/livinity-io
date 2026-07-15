import {Loader2} from 'lucide-react'
import {TbLink, TbLock} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'

// FILES-01 (D-05, CVE-2026-45285) — the always-available "My shares" audit list.
// Consumes the 324-06 `shareList` procedure, which returns ALL of the caller's
// shares INCLUDING revoked/expired ones so no minted share is ever invisible to
// its owner. Each row carries a per-share `shareRevoke` action. The raw token is
// NEVER available here (the list carries only the prefix + metadata, D-01) —
// the plaintext link is shown exactly once at mint time in the parent dialog.
//
// Distinct from the Samba `share-info-dialog`: this is the public-link surface,
// wired to `system.shareList` / `system.shareRevoke`, never `files.shares`.

type ShareStatus = 'active' | 'revoked' | 'expired'

function shareStatus(row: {revokedAt: Date | string | null; expiresAt: Date | string | null}): ShareStatus {
	if (row.revokedAt) return 'revoked'
	if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) return 'expired'
	return 'active'
}

function formatDate(value: Date | string | null): string {
	if (!value) return t('files-public-share.no-expiry')
	const d = new Date(value)
	if (Number.isNaN(d.getTime())) return t('files-public-share.no-expiry')
	return d.toLocaleDateString()
}

export function MySharesList() {
	const utils = trpcReact.useUtils()
	const {data: shares, isLoading} = trpcReact.system.shareList.useQuery(undefined, {
		// Owner audit surface — keep it fresh whenever the dialog is open.
		refetchOnWindowFocus: true,
	})
	const {mutate: revoke, isPending: isRevoking, variables: revokingVars} = trpcReact.system.shareRevoke.useMutation({
		onSuccess: () => {
			utils.system.shareList.invalidate()
		},
	})

	return (
		<div className='flex flex-col gap-3'>
			<h3 className='text-13 font-medium text-text-secondary'>{t('files-public-share.my-shares-title')}</h3>

			{isLoading ? (
				<div className='flex items-center gap-2 py-4 text-13 text-text-tertiary'>
					<Loader2 className='size-4 animate-spin' />
					{t('files-public-share.my-shares-loading')}
				</div>
			) : !shares || shares.length === 0 ? (
				<p className='py-4 text-13 text-text-tertiary'>{t('files-public-share.my-shares-empty')}</p>
			) : (
				<ul className='flex flex-col divide-y divide-border-subtle rounded-12 bg-surface-base'>
					{shares.map((share) => {
						const status = shareStatus(share)
						const isRowRevoking = isRevoking && revokingVars?.id === share.id
						return (
							<li key={share.id} className='flex items-center gap-3 px-3 py-2.5'>
								<TbLink className='size-4 shrink-0 opacity-60' />
								<div className='flex min-w-0 flex-1 flex-col gap-0.5'>
									<div className='flex items-center gap-1.5'>
										<span className='truncate text-13 font-medium text-text-primary' title={share.virtualPath}>
											{share.virtualPath}
										</span>
										{share.hasPassword && (
											<TbLock
												className='size-3.5 shrink-0 opacity-60'
												title={t('files-public-share.has-password')}
												aria-label={t('files-public-share.has-password')}
											/>
										)}
									</div>
									<div className='flex flex-wrap items-center gap-x-3 gap-y-0.5 text-11 text-text-tertiary'>
										<span
											className={cn(
												status === 'active' && 'text-success-light',
												status === 'revoked' && 'text-destructive2-lightest',
											)}
										>
											{status === 'active'
												? t('files-public-share.status-active')
												: status === 'revoked'
													? t('files-public-share.status-revoked')
													: t('files-public-share.status-expired')}
										</span>
										<span className='font-mono'>{share.tokenPrefix}…</span>
										<span>
											{t('files-public-share.col-expires')}: {formatDate(share.expiresAt)}
										</span>
										<span>
											{t('files-public-share.col-downloads')}:{' '}
											{share.maxDownloads === null
												? `${share.downloadCount} / ${t('files-public-share.unlimited')}`
												: `${share.downloadCount} / ${share.maxDownloads}`}
										</span>
									</div>
								</div>
								{status === 'revoked' ? (
									<span className='shrink-0 text-11 text-text-tertiary'>{t('files-public-share.status-revoked')}</span>
								) : (
									<Button
										size='sm'
										variant='destructive'
										className='shrink-0'
										disabled={isRowRevoking}
										onClick={() => revoke({id: share.id})}
									>
										{isRowRevoking ? <Loader2 className='size-3.5 animate-spin' /> : t('files-public-share.revoke')}
									</Button>
								)}
							</li>
						)
					})}
				</ul>
			)}
		</div>
	)
}
