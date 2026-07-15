import {TbBrandApple, TbBrandGooglePlay, TbLoader2, TbPhoto} from 'react-icons/tb'
import QRCode from 'react-qr-code'

import {CopyableField} from '@/components/ui/copyable-field'
import {Button} from '@/shadcn-components/ui/button'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

interface ImmichPhotoBackupSectionProps {
	appId: string
	appName: string
	/**
	 * The canonical Immich FQDN surfaced by apps.list (`photos-<user>.<domain>`,
	 * routes.ts:181). Undefined only for legacy entries with no resolved host.
	 */
	host?: string
	/**
	 * The subdomain slug surfaced by apps.list (routes.ts:180) — used only as a
	 * last-resort fallback when `host` is unresolved.
	 */
	subdomain?: string
}

// D-18: store-listing links for the Immich mobile app (fixed literals, never
// caller-supplied — see threat T-326-29).
const IMMICH_APP_STORE_URL = 'https://apps.apple.com/us/app/immich/id1613945652'
const IMMICH_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=app.alextran.immich'

/**
 * Phase 326-09 (MEDIA-01) — Immich photo-backup onboarding section.
 *
 * A dismissible section on the Immich app-settings dialog. It renders a QR code
 * encoding the PLAIN HTTPS instance URL (`https://${host}`) — the phone camera
 * scans it to reach the Immich server; there is NO Immich pairing/deep-link
 * scheme (D-18), so the QR value is the bare server URL only. Below the QR a
 * `CopyableField` offers the same URL as a manual fallback, plus Apple App Store
 * and Google Play badge links to install the Immich mobile app. A "Got it"
 * button persists the dismissal via `apps.setImmichCardDismissed` (privateProcedure
 * — any user can dismiss) so the section hides thereafter.
 *
 * All copy flows through `t('immich-backup.*')` against public/locales/{en,tr}.json.
 * Reuses the already-installed react-qr-code@2.0.12 (no new dependency).
 */
export function ImmichPhotoBackupSection({appId, appName, host, subdomain}: ImmichPhotoBackupSectionProps) {
	const utils = trpcReact.useUtils()

	// Prefer the server-surfaced canonical host; fall back to the subdomain slug
	// only if host is unresolved. Never a caller-supplied string (T-326-29).
	const url = host ? `https://${host}` : subdomain ? `https://${subdomain}` : ''

	const dismissMut = trpcReact.apps.setImmichCardDismissed.useMutation({
		onSuccess: () => {
			utils.apps.state.invalidate({appId})
			utils.apps.list.invalidate()
		},
	})

	return (
		<div className='space-y-4'>
			<div className='flex items-center gap-2'>
				<TbPhoto className='h-5 w-5 text-text-primary' />
				<span className='text-body-sm font-medium text-text-primary'>{t('immich-backup.title')}</span>
			</div>

			<p className='text-caption text-text-tertiary'>{t('immich-backup.description', {app: appName})}</p>

			{url ? (
				<div className='flex flex-col items-center gap-3'>
					<div
						style={{
							background: 'white',
							padding: 12,
							borderRadius: 12,
							width: 200,
							height: 200,
						}}
					>
						<QRCode
							size={256}
							style={{height: 'auto', maxWidth: '100%', width: '100%'}}
							value={url}
							viewBox={`0 0 256 256`}
						/>
					</div>

					<div className='w-full max-w-[360px]'>
						<p className='mb-2 text-center text-caption text-text-tertiary'>{t('immich-backup.url-hint')}</p>
						<CopyableField value={url} />
					</div>
				</div>
			) : null}

			<div className='flex flex-wrap gap-2'>
				<Button asChild size='sm' variant='default'>
					<a href={IMMICH_APP_STORE_URL} target='_blank' rel='noreferrer'>
						<TbBrandApple className='mr-1 h-4 w-4' />
						{t('immich-backup.app-store')}
					</a>
				</Button>
				<Button asChild size='sm' variant='default'>
					<a href={IMMICH_PLAY_STORE_URL} target='_blank' rel='noreferrer'>
						<TbBrandGooglePlay className='mr-1 h-4 w-4' />
						{t('immich-backup.play-store')}
					</a>
				</Button>
			</div>

			<div className='flex items-center gap-2'>
				<Button
					size='sm'
					variant='ghost'
					onClick={() => dismissMut.mutate({appId, dismissed: true})}
					disabled={dismissMut.isPending}
				>
					{dismissMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
					{t('immich-backup.dismiss')}
				</Button>
			</div>

			{dismissMut.isError ? (
				<p role='alert' className='text-caption text-red-400'>
					{dismissMut.error?.message ?? 'Failed to dismiss — try again.'}
				</p>
			) : null}
		</div>
	)
}
