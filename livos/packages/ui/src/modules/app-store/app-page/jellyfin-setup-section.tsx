import {TbDeviceTvOld, TbLoader2, TbMovie, TbSettings} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

interface JellyfinSetupSectionProps {
	appId: string
	appName: string
}

// The default library folders pre-created under the container's /media mount by the
// install-time preconfig hook (jellyfin-preconfig.ts, D-23). FIXED literals — shown so
// the operator points each Jellyfin library at the matching path. Kept in sync with
// DEFAULT_MEDIA_LIBRARIES in jellyfin-preconfig.ts.
const DEFAULT_LIBRARY_PATHS = ['/media/Movies', '/media/Shows', '/media/Music'] as const

/**
 * Phase 329-11 (MEDIA-02, D-23) — Jellyfin setup onboarding section.
 *
 * A dismissible section on the Jellyfin app-settings dialog (immich-section clone).
 * It guides the operator through the two post-install steps that Livinity deliberately
 * does NOT automate (no /Startup/* wizard automation — D-23):
 *   1. verify hardware acceleration (Dashboard → Playback → Transcoding), which the
 *      install-time encoding.xml seed pre-selected when a GPU branch resolved, and
 *   2. add media libraries pointed at the pre-created /media/{Movies,Shows,Music}.
 *
 * A "Got it" button persists the dismissal via `apps.setJellyfinCardDismissed`
 * (privateProcedure — any user can dismiss) so the section hides thereafter.
 *
 * All copy flows through `t('jellyfin-setup.*')` against public/locales/{en,tr}.json.
 */
export function JellyfinSetupSection({appId, appName}: JellyfinSetupSectionProps) {
	const utils = trpcReact.useUtils()

	const dismissMut = trpcReact.apps.setJellyfinCardDismissed.useMutation({
		onSuccess: () => {
			utils.apps.state.invalidate({appId})
			utils.apps.list.invalidate()
		},
	})

	return (
		<div className='space-y-4'>
			<div className='flex items-center gap-2'>
				<TbDeviceTvOld className='h-5 w-5 text-text-primary' />
				<span className='text-body-sm font-medium text-text-primary'>{t('jellyfin-setup.title')}</span>
			</div>

			<p className='text-caption text-text-tertiary'>{t('jellyfin-setup.description', {app: appName})}</p>

			<div className='space-y-3'>
				<div className='flex gap-3'>
					<TbSettings className='mt-0.5 h-4 w-4 shrink-0 text-text-secondary' />
					<div className='space-y-1'>
						<p className='text-body-sm font-medium text-text-primary'>{t('jellyfin-setup.hwaccel-title')}</p>
						<p className='text-caption text-text-tertiary'>{t('jellyfin-setup.hwaccel-hint')}</p>
					</div>
				</div>

				<div className='flex gap-3'>
					<TbMovie className='mt-0.5 h-4 w-4 shrink-0 text-text-secondary' />
					<div className='space-y-1'>
						<p className='text-body-sm font-medium text-text-primary'>{t('jellyfin-setup.library-title')}</p>
						<p className='text-caption text-text-tertiary'>{t('jellyfin-setup.library-hint')}</p>
						<ul className='mt-1 space-y-1'>
							{DEFAULT_LIBRARY_PATHS.map((path) => (
								<li key={path} className='font-mono text-caption text-text-secondary'>
									{path}
								</li>
							))}
						</ul>
					</div>
				</div>
			</div>

			<div className='flex items-center gap-2'>
				<Button
					size='sm'
					variant='ghost'
					onClick={() => dismissMut.mutate({appId, dismissed: true})}
					disabled={dismissMut.isPending}
				>
					{dismissMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
					{t('jellyfin-setup.dismiss')}
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
