import {TbFingerprint, TbInfoCircle, TbKey, TbLoader2, TbTrash} from 'react-icons/tb'

import {IconButton} from '@/components/ui/icon-button'
import {usePasskeys} from '@/hooks/use-passkeys'
import {Button} from '@/shadcn-components/ui/button'
import {t} from '@/utils/i18n'

// Phase 323-04 (IDENT-03) — passkey enroll + manage settings section. Clones the
// 2fa-enable no-Dialog settings-panel scaffolding but has NO QR/PinInput: the
// browser WebAuthn ceremony (usePasskeys().enroll -> startRegistration) REPLACES the
// TOTP secret/QR exchange (D-03, enroll-while-authenticated). On a bare-LAN-IP box
// (webauthnAvailable=false) the RP-ID-unavailable note renders INSTEAD of the enroll
// button — never a dead button; TOTP + password stay mandatory. list/delete run
// against the 323-02 privateProcedures which scope to the authenticated user
// (T-323-13). Per-row RENAME is intentionally absent — 323-01/02 expose no rename
// DAO/procedure (see 323-04-SUMMARY deviation); list + delete only.
export function PasskeysSection() {
	const {webauthnAvailable, availabilityLoading, passkeys, passkeysLoading, enroll, enrolling, remove, removing} =
		usePasskeys()

	return (
		<div className='space-y-4'>
			<p className='text-body-sm text-text-secondary'>{t('auth-passkey.enroll.settings-description')}</p>

			{availabilityLoading ? (
				<div className='flex items-center justify-center py-8'>
					<TbLoader2 className='size-5 animate-spin text-text-tertiary' />
				</div>
			) : !webauthnAvailable ? (
				// LAN-IP box: no domain -> no RP-ID -> WebAuthn unavailable. Show the
				// informational note instead of a dead enroll button (D-02).
				<div className='flex items-start gap-3 rounded-radius-md border border-border-default bg-surface-base p-4'>
					<TbInfoCircle className='mt-0.5 size-5 shrink-0 text-text-tertiary' />
					<div className='text-body-sm text-text-secondary'>{t('auth-passkey.enroll.unavailable')}</div>
				</div>
			) : (
				<>
					<div className='flex items-center justify-between rounded-radius-md border border-border-default bg-surface-base p-4'>
						<div>
							<div className='text-body font-medium'>{t('auth-passkey.enroll.settings-title')}</div>
							<div className='text-caption text-text-secondary'>{t('auth-passkey.enroll.add-hint')}</div>
						</div>
						<IconButton onClick={enroll} icon={enrolling ? TbLoader2 : TbFingerprint} disabled={enrolling}>
							{enrolling ? t('auth-passkey.enroll.in-progress') : t('auth-passkey.enroll.add-button')}
						</IconButton>
					</div>

					{/* Credential manage list (nickname + created_at + per-row delete). */}
					{passkeysLoading ? (
						<div className='flex items-center justify-center py-6'>
							<TbLoader2 className='size-5 animate-spin text-text-tertiary' />
						</div>
					) : passkeys.length === 0 ? (
						<p className='text-caption text-text-tertiary'>{t('auth-passkey.enroll.empty')}</p>
					) : (
						<ul className='livinity-divide-y rounded-radius-md border border-border-default bg-surface-base'>
							{passkeys.map((pk) => (
								<li key={pk.credentialId} className='flex items-center justify-between gap-3 p-4'>
									<div className='flex items-center gap-3 min-w-0'>
										<TbKey className='size-5 shrink-0 text-text-tertiary' />
										<div className='min-w-0'>
											<div className='truncate text-body-sm font-medium'>
												{pk.nickname || t('auth-passkey.enroll.unnamed')}
											</div>
											<div className='text-caption text-text-tertiary'>
												{t('auth-passkey.enroll.added-on', {date: formatDate(pk.createdAt)})}
											</div>
										</div>
									</div>
									<Button
										variant='destructive'
										size='sm'
										onClick={() => remove(pk.credentialId)}
										disabled={removing}
									>
										<TbTrash className='size-4' />
										{t('auth-passkey.enroll.delete')}
									</Button>
								</li>
							))}
						</ul>
					)}

					{/* Domain-binding note (RP-ID = host-only, D-02): passkeys are bound to
					    this box's domain — if the domain changes, existing passkeys stop
					    working and must be re-enrolled. Subtle, never a blocking warning. */}
					<p className='flex items-start gap-1.5 text-caption text-text-tertiary'>
						<TbInfoCircle className='mt-0.5 size-3.5 shrink-0' />
						<span>{t('auth-passkey.enroll.domainChangeNote')}</span>
					</p>
				</>
			)}
		</div>
	)
}

function formatDate(iso: string): string {
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return iso
	return d.toLocaleDateString()
}

export default PasskeysSection
