import {useState} from 'react'
import {TbAlertTriangle, TbDownload, TbLoader2, TbShieldExclamation} from 'react-icons/tb'
import {toast} from 'sonner'

import {APP_ICON_PLACEHOLDER_SRC} from '@/modules/desktop/app-icon'
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
import {Button} from '@/shadcn-components/ui/button'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

// Phase 341-03 (REPO-01/02, D-341-6) — a federated (community) app as projected by
// appStore.federatedCatalog. `trusted` is ALWAYS false (box-stamped server-side,
// never read from the payload); `manifest` is typed unknown at the tRPC edge.
export type FederatedApp = {
	id: string
	sourceId: string
	sourceName: string
	catalogSlug: string
	trusted: false
	manifest: unknown
	iconUrl?: string
}

type ManifestDisplay = {name?: string; tagline?: string}

/**
 * The native "Community · Unverified" browse section rendered BELOW the official
 * livinity.io/store iframe (which is untouched). Every tile carries a persistent,
 * non-dismissible untrusted badge; Install opens a blocking reconfirm before the
 * federated install fires. Admin-only — the caller gates the query on isAdmin and
 * only renders this when there is at least one federated app.
 */
export function FederatedAppsSection({apps}: {apps: FederatedApp[]}) {
	const utils = trpcReact.useUtils()
	const [confirming, setConfirming] = useState<FederatedApp | null>(null)

	const installMut = trpcReact.appStore.installFederated.useMutation({
		onSuccess: (ok) => {
			setConfirming(null)
			utils.apps.list.invalidate()
			if (ok) toast.success(t('app-store.sources.install-started'))
		},
		onError: (err) => {
			setConfirming(null)
			toast.error(err.message)
		},
	})

	return (
		<div className='border-t border-border-default bg-surface-base px-5 py-4'>
			<div className='mb-3 flex items-center gap-2'>
				<TbShieldExclamation className='h-5 w-5 text-amber-600' />
				<h2 className='text-body-sm font-semibold text-text-primary'>{t('app-store.menu.community-app-stores')}</h2>
				<UnverifiedBadge />
			</div>

			<div className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'>
				{apps.map((app) => {
					const m = (app.manifest ?? {}) as ManifestDisplay
					const name = m.name || app.catalogSlug
					return (
						<div key={app.id} className='flex items-start gap-3 rounded-radius-md border border-border-default bg-surface-1 p-3'>
							<img
								src={app.iconUrl || APP_ICON_PLACEHOLDER_SRC}
								alt=''
								className='h-10 w-10 shrink-0 rounded-radius-sm object-cover'
								onError={(e) => {
									e.currentTarget.src = APP_ICON_PLACEHOLDER_SRC
								}}
							/>
							<div className='min-w-0 flex-1 space-y-1'>
								<div className='flex items-center gap-1.5'>
									<span className='truncate text-body-sm font-medium text-text-primary'>{name}</span>
								</div>
								{m.tagline ? <p className='truncate text-caption text-text-tertiary'>{m.tagline}</p> : null}
								<div className='flex flex-wrap items-center gap-1.5 pt-0.5'>
									<UnverifiedBadge />
									<span className='truncate text-caption text-text-tertiary'>· {app.sourceName}</span>
								</div>
							</div>
							<Button variant='default' size='sm' className='self-center' onClick={() => setConfirming(app)}>
								<TbDownload className='mr-1 h-4 w-4' />
								{t('app.install')}
							</Button>
						</div>
					)
				})}
			</div>

			{/* T3 — blocking install reconfirm for an untrusted app (non-dismissible-to-
			    trusted: the only positive action re-states the reduced trust). */}
			<AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className='flex items-center gap-2'>
							<TbAlertTriangle className='h-5 w-5 text-amber-600' />
							{t('app-store.sources.install-confirm-title')}
						</AlertDialogTitle>
						<AlertDialogDescription className='space-y-2'>
							<span className='block'>{t('app-store.sources.install-confirm-body')}</span>
							<span className='block font-medium text-text-secondary'>{t('app-store.sources.no-ai-provider-note')}</span>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={installMut.isPending}>{t('cancel')}</AlertDialogCancel>
						<AlertDialogAction
							onClick={(e) => {
								e.preventDefault()
								if (confirming) installMut.mutate({sourceId: confirming.sourceId, catalogSlug: confirming.catalogSlug})
							}}
							disabled={installMut.isPending}
						>
							{installMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
							{t('continue')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

// Persistent, non-dismissible untrusted badge — muted amber, visually distinct
// from the trusted official catalog. Rendered on every federated surface.
function UnverifiedBadge() {
	return (
		<span className='inline-flex items-center gap-1 rounded-full border border-amber-400/60 bg-amber-50 px-2 py-0.5 text-[11px] font-medium leading-none text-amber-700'>
			<TbShieldExclamation className='h-3 w-3' />
			{t('app-store.sources.unverified-badge')}
		</span>
	)
}
