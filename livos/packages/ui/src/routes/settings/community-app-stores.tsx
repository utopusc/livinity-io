import {useState} from 'react'
import {TbAlertTriangle, TbLoader2, TbTrash, TbWorldPlus} from 'react-icons/tb'
import {toast} from 'sonner'

import {useCurrentUser} from '@/hooks/use-current-user'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {useSettingsDialogProps} from '@/routes/settings/_components/shared'
import {Button} from '@/shadcn-components/ui/button'
import {Dialog, DialogHeader, DialogScrollableContent, DialogTitle} from '@/shadcn-components/ui/dialog'
import {Drawer, DrawerContent, DrawerHeader, DrawerScroller, DrawerTitle} from '@/shadcn-components/ui/drawer'
import {Input, Labeled} from '@/shadcn-components/ui/input'
import {Switch} from '@/shadcn-components/ui/switch'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

// Phase 341-03 (REPO-01/02, D-341-6) — admin-only manage-sources surface for the
// federated app-store. Add a catalog URL (blocking trust warning shown BEFORE the
// add), list sources with enable/remove. Every mutation is a server adminProcedure
// (RBAC + audit); this page additionally hides the surface from non-admins.
export default function CommunityAppStoresDrawerOrDialog() {
	const dialogProps = useSettingsDialogProps()
	const isMobile = useIsMobile()
	const title = t('app-store.menu.community-app-stores')

	const body = <CommunityAppStoresContent />

	if (isMobile) {
		return (
			<Drawer {...dialogProps}>
				<DrawerContent fullHeight>
					<DrawerHeader>
						<DrawerTitle>{title}</DrawerTitle>
					</DrawerHeader>
					<DrawerScroller>{body}</DrawerScroller>
				</DrawerContent>
			</Drawer>
		)
	}

	return (
		<Dialog {...dialogProps}>
			<DialogScrollableContent>
				<div className='space-y-6 px-5 py-6'>
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
					</DialogHeader>
					{body}
				</div>
			</DialogScrollableContent>
		</Dialog>
	)
}

function CommunityAppStoresContent() {
	const {isAdmin} = useCurrentUser()
	const utils = trpcReact.useUtils()
	const sourcesQ = trpcReact.appStore.listSources.useQuery(undefined, {enabled: isAdmin})

	const [name, setName] = useState('')
	const [url, setUrl] = useState('')

	const addMut = trpcReact.appStore.addSource.useMutation({
		onSuccess: () => {
			setName('')
			setUrl('')
			utils.appStore.listSources.invalidate()
			utils.appStore.federatedCatalog.invalidate()
		},
	})
	const removeMut = trpcReact.appStore.removeSource.useMutation({
		onSuccess: () => {
			utils.appStore.listSources.invalidate()
			utils.appStore.federatedCatalog.invalidate()
		},
	})
	const enableMut = trpcReact.appStore.setSourceEnabled.useMutation({
		onSuccess: () => {
			utils.appStore.listSources.invalidate()
			utils.appStore.federatedCatalog.invalidate()
		},
	})

	// Defense-in-depth: the entry card in advanced.tsx is already admin-gated and
	// every route below is adminProcedure. If a non-admin reaches this URL directly,
	// show nothing actionable rather than a wall of 403-ing controls.
	if (!isAdmin) {
		return <p className='text-body-sm text-text-tertiary'>{t('app-store.sources.admin-only')}</p>
	}

	const canAdd = name.trim().length > 0 && url.trim().length > 0 && !addMut.isPending

	const submit = () => {
		if (!canAdd) return
		addMut.mutate({name: name.trim(), url: url.trim()})
	}

	const sources = sourcesQ.data ?? []

	return (
		<div className='space-y-5'>
			<p className='text-body-sm leading-tight text-text-tertiary'>{t('community-app-stores.description')}</p>

			{/* BLOCKING trust notice — persistent, non-dismissible; shown ABOVE the add
			    form so the admin reads it before adding a source (D-341-6). */}
			<div className='flex items-start gap-3 rounded-radius-md border border-amber-400/50 bg-amber-50/80 p-4'>
				<TbAlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-amber-600' />
				<p className='text-caption leading-snug text-amber-800'>{t('community-app-stores.warning')}</p>
			</div>

			{/* Add-source form */}
			<div className='space-y-3 rounded-radius-md bg-surface-1 p-4'>
				<h3 className='text-body-sm font-medium text-text-primary'>{t('app-store.sources.add-source')}</h3>
				<Labeled label={t('app-store.sources.source-name')}>
					<Input value={name} onValueChange={setName} placeholder='Community Apps' />
				</Labeled>
				<Labeled label={t('app-store.sources.source-url')}>
					<Input
						value={url}
						onValueChange={setUrl}
						placeholder='https://example.com/catalog.json'
						inputMode='url'
						autoCapitalize='none'
						autoCorrect='off'
						spellCheck={false}
						onKeyDown={(e) => {
							if (e.key === 'Enter') submit()
						}}
					/>
				</Labeled>
				{addMut.isError ? (
					<p role='alert' className='text-caption text-destructive'>
						{addMut.error?.message ?? 'Could not add this source.'}
					</p>
				) : null}
				<Button variant='primary' size='default' onClick={submit} disabled={!canAdd}>
					{addMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : <TbWorldPlus className='mr-1 h-4 w-4' />}
					{t('community-app-stores.add-button')}
				</Button>
			</div>

			{/* Source list */}
			<div className='space-y-2'>
				{sourcesQ.isLoading ? (
					<p className='text-caption text-text-tertiary'>…</p>
				) : sources.length === 0 ? (
					<p className='text-caption text-text-tertiary'>{t('app-store.sources.none')}</p>
				) : (
					sources.map((s) => (
						<div key={s.id} className='flex items-start gap-3 rounded-radius-md bg-surface-1 p-4'>
							<div className='min-w-0 flex-1 space-y-1'>
								<div className='flex items-center gap-2'>
									<span className='truncate text-body-sm font-medium text-text-primary'>{s.name}</span>
								</div>
								<p className='truncate text-caption text-text-tertiary'>{s.url}</p>
								{s.lastFetchStatus === 'error' ? (
									<p className='flex items-center gap-1 text-caption text-destructive'>
										<TbAlertTriangle className='h-3.5 w-3.5' />
										{t('app-store.sources.unreachable')}
										{s.lastFetchError ? <span className='text-text-tertiary'>· {s.lastFetchError}</span> : null}
									</p>
								) : null}
							</div>
							<Switch
								checked={s.enabled}
								onCheckedChange={(enabled) => enableMut.mutate({id: s.id, enabled})}
								disabled={enableMut.isPending}
								aria-label={t('app-store.sources.enabled')}
							/>
							<Button
								variant='ghost'
								size='sm'
								className='text-destructive'
								onClick={() => {
									removeMut.mutate(
										{id: s.id},
										{
											onSuccess: () => toast.success(t('app-store.sources.installed-apps-keep-running')),
										},
									)
								}}
								disabled={removeMut.isPending}
								aria-label={t('app-store.sources.remove')}
							>
								<TbTrash className='h-4 w-4' />
							</Button>
						</div>
					))
				)}
				<p className='text-caption text-text-tertiary'>{t('app-store.sources.installed-apps-keep-running')}</p>
			</div>
		</div>
	)
}
