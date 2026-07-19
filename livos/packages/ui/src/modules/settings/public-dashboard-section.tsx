/**
 * Phase 345-04 (GUEST-01, D-345-6/7/8) — the admin "Public dashboard" Settings
 * section. Curates the box-global public dashboard shown to anonymous visitors at
 * `/public` (public-dashboard-page.tsx). Admin-only:
 *   - publicDashboard.getConfig / setConfig are adminProcedure server-side (public
 *     exposure is a box-security decision, not a per-user one);
 *   - apps.setShowOnPublicDashboard is adminProcedure and rejects per-user apps.
 * The UI ALSO hides the controls for non-admins (defense-in-depth over the server
 * gate, mirrors the sibling admin sections).
 *
 * D-345-7 interlock: toggling an app on exposes ONLY its name + icon + a link to
 * its subdomain — it does NOT bypass that app's own login. The caption states this
 * so an admin never assumes "show on public dashboard" == "make the app public".
 *
 * Mutation shapes match 345-03 EXACTLY:
 *   - publicDashboard.setConfig({enabled, title?, links:[{label,url}]})
 *   - apps.setShowOnPublicDashboard({appId, enabled})
 */
import {useEffect, useState} from 'react'
import {TbExternalLink, TbPlus, TbTrash} from 'react-icons/tb'

import {SettingsPageHeader} from '@/components/settings-page-header'
import {useCurrentUser} from '@/hooks/use-current-user'
import {Button} from '@/shadcn-components/ui/button'
import {Checkbox} from '@/shadcn-components/ui/checkbox'
import {Input} from '@/shadcn-components/ui/input'
import {Switch} from '@/shadcn-components/ui/switch'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

// Mirror of the server's sanitizeLinks (curate.ts): trim both fields, drop any
// row with an empty label or url, cap at MAX_PUBLIC_LINKS. Kept client-side so a
// Save sends exactly what the server would persist (no surprise drops).
const MAX_PUBLIC_LINKS = 20

type LinkRow = {label: string; url: string}

function sanitizeLinksClient(links: LinkRow[]): LinkRow[] {
	const out: LinkRow[] = []
	for (const l of links) {
		const label = (l.label ?? '').trim()
		const url = (l.url ?? '').trim()
		if (!label || !url) continue
		out.push({label, url})
		if (out.length >= MAX_PUBLIC_LINKS) break
	}
	return out
}

// A url is "flaggable" (inline warning) when it is non-empty but does NOT parse as
// http(s). We still allow the save (the server accepts it, and the /public page
// simply renders it as plain text rather than a link) — the flag is a courtesy.
function isFlaggedUrl(url: string): boolean {
	const trimmed = url.trim()
	if (!trimmed) return false
	try {
		const u = new URL(trimmed)
		return !(u.protocol === 'http:' || u.protocol === 'https:')
	} catch {
		return true
	}
}

export function PublicDashboardSection() {
	const {isAdmin} = useCurrentUser()
	const utils = trpcReact.useUtils()

	const configQ = trpcReact.publicDashboard.getConfig.useQuery(undefined, {enabled: isAdmin})
	const appsQ = trpcReact.apps.list.useQuery(undefined, {enabled: isAdmin})
	const setConfigMut = trpcReact.publicDashboard.setConfig.useMutation({
		onSuccess: () => utils.publicDashboard.getConfig.invalidate(),
	})
	const setShowMut = trpcReact.apps.setShowOnPublicDashboard.useMutation({
		onSuccess: () => utils.apps.list.invalidate(),
	})

	// Local editable copies of the box-global config. Seeded once from getConfig
	// (and re-seeded whenever the server copy changes and we have no pending edit).
	const [enabled, setEnabled] = useState(false)
	const [title, setTitle] = useState('')
	const [links, setLinks] = useState<LinkRow[]>([])
	const [seeded, setSeeded] = useState(false)

	useEffect(() => {
		if (configQ.data && !seeded) {
			setEnabled(configQ.data.enabled)
			setTitle(configQ.data.title ?? '')
			setLinks(configQ.data.links ?? [])
			setSeeded(true)
		}
	}, [configQ.data, seeded])

	// Persist the full config (enabled + title + links) — setConfig replaces all
	// three, so we always send the current local state.
	const saveConfig = (next: {enabled: boolean; title: string; links: LinkRow[]}) => {
		const cleanTitle = next.title.trim()
		setConfigMut.mutate({
			enabled: next.enabled,
			title: cleanTitle ? cleanTitle : undefined,
			links: sanitizeLinksClient(next.links),
		})
	}

	// The enable toggle saves immediately (a single obvious control).
	const handleToggleEnabled = (value: boolean) => {
		setEnabled(value)
		saveConfig({enabled: value, title, links})
	}

	// Title + links have an explicit Save (they are free-text; auto-saving on every
	// keystroke would spam the store write-lock).
	const handleSaveDetails = () => {
		const cleaned = sanitizeLinksClient(links)
		setLinks(cleaned)
		saveConfig({enabled, title, links: cleaned})
	}

	const addLink = () => {
		if (links.length >= MAX_PUBLIC_LINKS) return
		setLinks([...links, {label: '', url: ''}])
	}
	const removeLink = (i: number) => setLinks(links.filter((_, idx) => idx !== i))
	const updateLink = (i: number, patch: Partial<LinkRow>) =>
		setLinks(links.map((l, idx) => (idx === i ? {...l, ...patch} : l)))

	if (!isAdmin) {
		return (
			<div className='flex flex-col gap-6'>
				<SettingsPageHeader eyebrow='Public dashboard' title='Public' titleAccent='dashboard.' sub={t('public-dashboard.section.description')} />
				<p className='text-caption text-text-tertiary'>{t('public-dashboard.admin-only')}</p>
			</div>
		)
	}

	// Eligible apps: only installed GLOBAL docker apps. Native builtins and private
	// per-user instances (composite `:user:` ids) can never be published (the server
	// rejects per-user; native are ineligible), so the picker hides them.
	const eligibleApps = (appsQ.data ?? []).filter(
		(a): a is Extract<typeof a, {native: false}> =>
			!('error' in a) && a.native === false && !a.id.includes(':user:'),
	)

	const busy = setConfigMut.isPending

	return (
		<div className='flex flex-col gap-8'>
			<SettingsPageHeader
				eyebrow='Public dashboard'
				title='Public'
				titleAccent='dashboard.'
				sub={t('public-dashboard.section.description')}
			/>

			{/* Enable toggle + the D-345-7 clarification */}
			<div className='space-y-3'>
				<div className='flex items-center justify-between gap-4 rounded-radius-sm border border-border-default bg-surface-base p-4'>
					<div className='min-w-0'>
						<div className='text-body-sm font-medium text-text-primary'>{t('public-dashboard.enable.label')}</div>
						<p className='mt-1 text-caption text-text-tertiary'>{t('public-dashboard.enable.caption')}</p>
					</div>
					<Switch checked={enabled} disabled={busy} onCheckedChange={handleToggleEnabled} />
				</div>

				<a
					href='/public'
					target='_blank'
					rel='noopener noreferrer'
					className='inline-flex items-center gap-1.5 text-caption text-text-secondary underline underline-offset-2 hover:text-text-primary'
				>
					<TbExternalLink className='size-3.5' />
					{t('public-dashboard.view')}
				</a>
			</div>

			{/* Per-app picker */}
			<div className='space-y-3'>
				<h2 className='text-body-sm font-medium text-text-primary'>{t('public-dashboard.apps.heading')}</h2>
				{eligibleApps.length === 0 ? (
					<p className='text-caption text-text-tertiary'>{t('public-dashboard.apps.empty')}</p>
				) : (
					<ul className='flex flex-col divide-y divide-border-subtle overflow-hidden rounded-radius-sm border border-border-default bg-surface-base'>
						{eligibleApps.map((app) => {
							const checked = app.showOnPublicDashboard === true
							return (
								<li key={app.id} className='flex items-center gap-3 px-4 py-3'>
									{app.icon ? (
										<img src={app.icon} alt='' className='size-7 shrink-0 rounded-6 object-cover' />
									) : (
										<div className='size-7 shrink-0 rounded-6 bg-surface-2' />
									)}
									<span className='min-w-0 flex-1 truncate text-13 text-text-primary'>{app.name}</span>
									<Checkbox
										checked={checked}
										disabled={setShowMut.isPending}
										onCheckedChange={(v) => setShowMut.mutate({appId: app.id, enabled: v === true})}
									/>
								</li>
							)
						})}
					</ul>
				)}
			</div>

			{/* Title + links editor */}
			<div className='space-y-4'>
				<div className='space-y-1.5'>
					<label className='text-body-sm font-medium text-text-primary'>{t('public-dashboard.title.label')}</label>
					<Input
						value={title}
						onValueChange={setTitle}
						placeholder={t('public-dashboard.title.placeholder')}
						disabled={busy}
					/>
				</div>

				<div className='space-y-2'>
					<h2 className='text-body-sm font-medium text-text-primary'>{t('public-dashboard.links.heading')}</h2>
					{links.map((link, i) => {
						const flagged = isFlaggedUrl(link.url)
						return (
							<div key={i} className='space-y-1'>
								<div className='flex items-center gap-2'>
									<Input
										value={link.label}
										onValueChange={(v) => updateLink(i, {label: v})}
										placeholder={t('public-dashboard.links.label-placeholder')}
										className='flex-1'
										disabled={busy}
									/>
									<Input
										value={link.url}
										onValueChange={(v) => updateLink(i, {url: v})}
										placeholder={t('public-dashboard.links.url-placeholder')}
										className='flex-1'
										disabled={busy}
									/>
									<Button
										variant='default'
										size='icon-only'
										onClick={() => removeLink(i)}
										disabled={busy}
										aria-label={t('public-dashboard.links.remove')}
									>
										<TbTrash className='size-4' />
									</Button>
								</div>
								{flagged ? <p className='text-caption text-amber-400'>{t('public-dashboard.links.invalid-url')}</p> : null}
							</div>
						)
					})}
					<Button variant='default' size='sm' onClick={addLink} disabled={busy || links.length >= MAX_PUBLIC_LINKS}>
						<TbPlus className='mr-1 size-4' />
						{t('public-dashboard.links.add')}
					</Button>
				</div>

				<Button variant='primary' size='sm' onClick={handleSaveDetails} disabled={busy}>
					{t('public-dashboard.save')}
				</Button>
			</div>
		</div>
	)
}
