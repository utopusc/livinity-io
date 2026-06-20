// Phase 290 — AddShortcutDialog (Wave 2 + R2 enhancements).
//
// One tabbed dialog. R2: the DialogContent is WHITE/opaque, WIDE (860px), and
// two-column on sm (form + live preview). All tabs gate the "Add" button on a
// mandatory icon (#3 — no blank tiles) and a valid target.
//
// Tabs:
//   Web      — ~55-app icon grid (R8) + collapsible "Add a custom URL".
//   Terminal — icon template grid + AI-CLI flag reference (R4), custom shell
//              builder with a folder picker (R5) + "Save as template" (R6).
//   Native   — admin-gated (M4): scan installed host apps + apt install (R7).
//
// 100% ADDITIVE — the existing AddWebAppDialog + webapp.* flow are untouched.

import {useEffect, useMemo, useRef, useState} from 'react'
import {useDebounce} from 'react-use'

import {MiniBrowser} from '@/features/files/components/mini-browser'
import {useCurrentUser} from '@/hooks/use-current-user'
import {useTerminalPanelEnabled} from '@/hooks/use-terminal-panel-enabled'
import {Button} from '@/shadcn-components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/shadcn-components/ui/tabs'
import {trpcReact} from '@/trpc/trpc'

import {IconPicker} from './icon-picker'
import {WEB_APP_CATALOG, WEB_APP_CATEGORIES, webAppIconUrl, type WebAppCategory} from './web-app-catalog'

const TERMINAL_ICON = '/figma-exports/dock-terminal.svg'

// R2 — the single source of the white/wide/scrollable surface. All STATIC
// literals (M1 — JIT-safe). `!` defeats the shared dialogContentClass dark
// surface; width override appended last so it wins.
const WHITE_WIDE_DIALOG =
	'!bg-white !text-gray-900 backdrop-blur-none sm:!max-w-[860px] max-w-[calc(100%-24px)] max-h-[88vh] overflow-y-auto border-black/10'

// Bare-domain normalize: "github.com" → "https://github.com".
function normalizeUrlInput(raw: string): string | null {
	const trimmed = raw.trim()
	if (!trimmed) return null
	const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
	try {
		const u = new URL(withScheme)
		if (!u.hostname || !u.hostname.includes('.')) return null
		return u.toString()
	} catch {
		return null
	}
}

type TabId = 'web' | 'terminal' | 'native'

export function AddShortcutDialog({
	open,
	onOpenChange,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const [tab, setTab] = useState<TabId>('web')
	const {isAdmin} = useCurrentUser()

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next)
				if (!next) setTab('web')
			}}
		>
			<DialogContent className={WHITE_WIDE_DIALOG}>
				<DialogHeader>
					<DialogTitle className='!text-gray-900'>Add Shortcut</DialogTitle>
				</DialogHeader>

				<Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
					<TabsList className='w-full'>
						<TabsTrigger value='web' className='flex-1'>
							Web
						</TabsTrigger>
						<TabsTrigger value='terminal' className='flex-1'>
							Terminal
						</TabsTrigger>
						{/* M4 — Native tab is admin-only (its mutations are adminProcedure). */}
						{isAdmin ? (
							<TabsTrigger value='native' className='flex-1'>
								Native
							</TabsTrigger>
						) : null}
					</TabsList>

					<TabsContent value='web' className='min-h-[420px]'>
						<WebTab onClose={() => onOpenChange(false)} active={open && tab === 'web'} />
					</TabsContent>
					<TabsContent value='terminal' className='min-h-[420px]'>
						<TerminalTab onClose={() => onOpenChange(false)} active={open && tab === 'terminal'} />
					</TabsContent>
					{isAdmin ? (
						<TabsContent value='native' className='min-h-[420px]'>
							<NativeTab active={open && tab === 'native'} />
						</TabsContent>
					) : null}
				</Tabs>
			</DialogContent>
		</Dialog>
	)
}

// ── Shared light-themed field wrappers ──────────────────────────────────────

function FieldLabel({htmlFor, children}: {htmlFor?: string; children: React.ReactNode}) {
	return (
		<label className='text-xs font-medium text-gray-600' htmlFor={htmlFor}>
			{children}
		</label>
	)
}

// ── Web tab ───────────────────────────────────────────────────────────────

function WebTab({onClose, active}: {onClose: () => void; active: boolean}) {
	const utils = trpcReact.useUtils()
	const createMut = trpcReact.shortcut.create.useMutation()
	const [query, setQuery] = useState('')
	const [showCustom, setShowCustom] = useState(false)
	const [addingName, setAddingName] = useState<string | null>(null)

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase()
		if (!q) return WEB_APP_CATALOG
		return WEB_APP_CATALOG.filter((e) => e.name.toLowerCase().includes(q))
	}, [query])

	const byCategory = useMemo(() => {
		const map = new Map<WebAppCategory, typeof WEB_APP_CATALOG[number][]>()
		for (const e of filtered) {
			const arr = map.get(e.category) ?? []
			arr.push(e)
			map.set(e.category, arr)
		}
		return map
	}, [filtered])

	const addFromCatalog = async (entry: typeof WEB_APP_CATALOG[number]) => {
		setAddingName(entry.name)
		try {
			await createMut.mutateAsync({
				kind: 'web',
				title: entry.name,
				iconUrl: webAppIconUrl(entry.slug),
				payload: {url: entry.url},
			})
			await utils.shortcut.list.invalidate()
			await utils.apps.list.invalidate().catch(() => {})
			// Keep the dialog open for multi-add.
		} catch {
			/* surfaced below */
		} finally {
			setAddingName(null)
		}
	}

	return (
		<div className='flex flex-col gap-4 pt-2'>
			<Input
				placeholder='Search apps…'
				value={query}
				onValueChange={setQuery}
				autoFocus={active}
			/>

			<div className='flex flex-col gap-4'>
				{WEB_APP_CATEGORIES.filter((c) => byCategory.has(c)).map((cat) => (
					<div key={cat} className='flex flex-col gap-2'>
						<p className='text-xs font-semibold uppercase tracking-wide text-gray-500'>{cat}</p>
						<div className='grid grid-cols-4 gap-2 sm:grid-cols-6'>
							{(byCategory.get(cat) ?? []).map((entry) => (
								<button
									key={entry.url}
									type='button'
									disabled={createMut.isPending}
									onClick={() => void addFromCatalog(entry)}
									className='flex flex-col items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 p-2 text-center transition-colors hover:bg-gray-100 disabled:opacity-50'
									title={`Add ${entry.name}`}
								>
									<span className='flex h-8 w-8 items-center justify-center overflow-hidden rounded-md bg-white'>
										{/* eslint-disable-next-line jsx-a11y/alt-text */}
										<img
											src={webAppIconUrl(entry.slug)}
											loading='lazy'
											className='h-6 w-6 object-contain'
											onError={(e) => {
												;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
											}}
										/>
									</span>
									<span className='w-full truncate text-[11px] text-gray-700'>
										{addingName === entry.name ? 'Adding…' : entry.name}
									</span>
								</button>
							))}
						</div>
					</div>
				))}
				{filtered.length === 0 ? (
					<p className='py-6 text-center text-sm text-gray-500'>No matching apps.</p>
				) : null}
			</div>

			{createMut.isError ? (
				<p className='text-xs text-red-600'>{createMut.error?.message ?? 'Failed to add shortcut.'}</p>
			) : null}

			<div className='border-t border-gray-200 pt-3'>
				<button
					type='button'
					className='text-sm font-medium text-gray-700 hover:text-gray-900'
					onClick={() => setShowCustom((v) => !v)}
				>
					{showCustom ? '▾' : '▸'} Add a custom URL
				</button>
				{showCustom ? <CustomUrlForm onClose={onClose} /> : null}
			</div>
		</div>
	)
}

// The original manual-URL flow, kept as a collapsible section (R8).
function CustomUrlForm({onClose}: {onClose: () => void}) {
	const [rawUrl, setRawUrl] = useState('')
	const [debouncedUrl, setDebouncedUrl] = useState('')
	const [manualTitle, setManualTitle] = useState('')
	const [manualTitleTouched, setManualTitleTouched] = useState(false)
	const [icon, setIcon] = useState('')

	const utils = trpcReact.useUtils()
	const createMut = trpcReact.shortcut.create.useMutation()

	const normalizedUrl = useMemo(() => normalizeUrlInput(rawUrl), [rawUrl])
	useDebounce(() => setDebouncedUrl(normalizedUrl ?? ''), 300, [normalizedUrl])

	const metadataQ = trpcReact.webapp.extractMetadata.useQuery(
		{url: debouncedUrl},
		{enabled: debouncedUrl.length > 0, retry: false, staleTime: 5 * 60 * 1000},
	)
	const frameQ = trpcReact.shortcut.probeFrameable.useQuery(
		{url: debouncedUrl},
		{enabled: debouncedUrl.length > 0, retry: false, staleTime: 60 * 60 * 1000},
	)

	useEffect(() => {
		if (manualTitleTouched) return
		const extracted = metadataQ.data?.title
		if (extracted) setManualTitle(extracted)
	}, [metadataQ.data?.title, manualTitleTouched])

	// The icon picker wins; otherwise the extracted favicon.
	const resolvedIcon = icon.trim() || metadataQ.data?.faviconUrl || ''
	const title = manualTitle.trim() || metadataQ.data?.title || (normalizedUrl ? new URL(normalizedUrl).hostname : '')
	const hasIcon = resolvedIcon.length > 0
	const canSubmit = Boolean(normalizedUrl) && hasIcon && title.length > 0 && !createMut.isPending

	const handleSubmit = async () => {
		if (!canSubmit || !normalizedUrl) return
		try {
			await createMut.mutateAsync({
				kind: 'web',
				title,
				iconUrl: resolvedIcon,
				payload: {url: normalizedUrl},
			})
			await utils.shortcut.list.invalidate()
			await utils.apps.list.invalidate().catch(() => {})
			onClose()
		} catch {
			/* surfaced below */
		}
	}

	const frameable = frameQ.data?.frameable

	return (
		<div className='flex flex-col gap-3 pt-3'>
			<div className='flex flex-col gap-1.5'>
				<FieldLabel htmlFor='add-shortcut-url'>URL or domain</FieldLabel>
				<Input
					id='add-shortcut-url'
					placeholder='github.com or https://example.com'
					value={rawUrl}
					onValueChange={setRawUrl}
				/>
				{rawUrl.trim() !== '' && !normalizedUrl ? (
					<p className='text-xs text-red-600'>Enter a valid domain or URL.</p>
				) : null}
			</div>

			{debouncedUrl ? (
				<div className='flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3'>
					<div className='flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white'>
						{resolvedIcon ? (
							// eslint-disable-next-line jsx-a11y/alt-text
							<img src={resolvedIcon} loading='lazy' className='h-full w-full object-contain' />
						) : null}
					</div>
					<div className='min-w-0 flex-1'>
						<p className='truncate text-sm font-medium text-gray-900'>
							{metadataQ.isFetching ? 'Fetching site info…' : title || '(no title)'}
						</p>
						{frameable === undefined ? null : (
							<p className='mt-0.5 text-xs text-gray-500'>
								{frameable ? 'Opens embedded in a window.' : 'Opens as a live stream (site blocks embedding).'}
							</p>
						)}
					</div>
				</div>
			) : null}

			<div className='flex flex-col gap-1.5'>
				<FieldLabel htmlFor='add-shortcut-title'>Title</FieldLabel>
				<Input
					id='add-shortcut-title'
					placeholder='Override title (optional)'
					value={manualTitle}
					onValueChange={(v: string) => {
						setManualTitle(v)
						setManualTitleTouched(true)
					}}
				/>
			</div>

			<div className='flex flex-col gap-1.5'>
				<FieldLabel>Icon</FieldLabel>
				<IconPicker value={icon} onChange={setIcon} idPrefix='web-custom' />
				{!hasIcon && debouncedUrl ? (
					<p className='text-xs text-amber-600'>No favicon found — upload or paste an icon to add.</p>
				) : null}
			</div>

			{createMut.isError ? (
				<p className='text-xs text-red-600'>{createMut.error?.message ?? 'Failed to add shortcut.'}</p>
			) : null}

			<DialogFooter>
				<Button type='button' size='dialog' variant='primary' onClick={() => void handleSubmit()} disabled={!canSubmit}>
					{createMut.isPending ? 'Adding…' : 'Add'}
				</Button>
			</DialogFooter>
		</div>
	)
}

// ── Terminal tab ────────────────────────────────────────────────────────────

function TerminalTab({onClose, active}: {onClose: () => void; active: boolean}) {
	const terminalEnabled = useTerminalPanelEnabled()
	const utils = trpcReact.useUtils()
	const createMut = trpcReact.shortcut.create.useMutation()
	const saveTplMut = trpcReact.shortcut.userTemplates.create.useMutation()
	const deleteTplMut = trpcReact.shortcut.userTemplates.delete.useMutation()

	const templatesQ = trpcReact.shortcut.terminalTemplates.useQuery(undefined, {
		enabled: active && terminalEnabled,
		staleTime: 5 * 60 * 1000,
	})
	const userTemplatesQ = trpcReact.shortcut.userTemplates.list.useQuery(undefined, {
		enabled: active && terminalEnabled,
		staleTime: 30 * 1000,
	})

	const [command, setCommand] = useState('')
	const [title, setTitle] = useState('')
	const [cwd, setCwd] = useState('')
	const [icon, setIcon] = useState(TERMINAL_ICON)
	const [templateId, setTemplateId] = useState<string | undefined>(undefined)
	const [selectedFlags, setSelectedFlags] = useState<{flag: string; description: string}[] | null>(null)
	const [pickerOpen, setPickerOpen] = useState(false)

	const builtins = templatesQ.data ?? []
	const selectedBuiltin = builtins.find((t) => t.id === templateId)

	const canSubmit =
		command.trim().length > 0 && title.trim().length > 0 && icon.trim().length > 0 && !createMut.isPending

	const reset = () => {
		setCommand('')
		setTitle('')
		setCwd('')
		setIcon(TERMINAL_ICON)
		setTemplateId(undefined)
		setSelectedFlags(null)
		createMut.reset()
	}

	const applyBuiltin = (tpl: NonNullable<typeof builtins>[number]) => {
		setCommand(tpl.command)
		if (!title.trim()) setTitle(tpl.label)
		setTemplateId(tpl.id)
		setIcon(tpl.icon || TERMINAL_ICON)
		setSelectedFlags(tpl.category === 'ai-cli' && tpl.flags ? tpl.flags : null)
	}

	const applyUserTemplate = (tpl: {label: string; command: string; iconUrl: string | null; cwd: string | null}) => {
		setCommand(tpl.command)
		if (!title.trim()) setTitle(tpl.label)
		setIcon(tpl.iconUrl || TERMINAL_ICON)
		if (tpl.cwd) setCwd(tpl.cwd)
		setSelectedFlags(null)
		setTemplateId(undefined)
	}

	const handleSubmit = async () => {
		if (!canSubmit) return
		try {
			await createMut.mutateAsync({
				kind: 'terminal',
				title: title.trim(),
				iconUrl: icon.trim() || TERMINAL_ICON,
				payload: {
					command: command.trim(),
					templateId,
					...(cwd.trim() ? {cwd: cwd.trim()} : {}),
				},
			})
			await utils.shortcut.list.invalidate()
			await utils.apps.list.invalidate().catch(() => {})
			onClose()
			reset()
		} catch {
			/* surfaced below */
		}
	}

	const handleSaveTemplate = async () => {
		if (command.trim().length === 0 || title.trim().length === 0) return
		try {
			await saveTplMut.mutateAsync({
				label: title.trim(),
				command: command.trim(),
				iconUrl: icon.trim() || undefined,
				...(cwd.trim() ? {cwd: cwd.trim()} : {}),
			})
			await utils.shortcut.userTemplates.list.invalidate()
		} catch {
			/* surfaced below */
		}
	}

	if (!terminalEnabled) {
		return (
			<div className='flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600'>
				<p className='font-medium text-gray-900'>Enable the new terminal first</p>
				<p className='text-xs'>
					Terminal shortcuts run a command in the persistent terminal, which is currently off on
					this device. Once it&apos;s enabled, this tab lets you save one-click command tiles.
				</p>
			</div>
		)
	}

	return (
		<div className='flex flex-col gap-4 pt-2 sm:flex-row sm:gap-6'>
			{/* Left — form. */}
			<div className='flex min-w-0 flex-1 flex-col gap-4'>
				<div className='flex flex-col gap-2'>
					<span className='text-xs font-medium text-gray-600'>Templates</span>
					<div className='grid grid-cols-3 gap-2 sm:grid-cols-4'>
						{builtins.map((tpl) => (
							<button
								key={tpl.id}
								type='button'
								className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition-colors ${
									templateId === tpl.id
										? 'border-gray-400 bg-gray-100'
										: 'border-gray-200 bg-gray-50 hover:bg-gray-100'
								}`}
								title={tpl.hint}
								onClick={() => applyBuiltin(tpl)}
							>
								<span className='flex h-8 w-8 items-center justify-center overflow-hidden rounded-md bg-white'>
									{/* eslint-disable-next-line jsx-a11y/alt-text */}
									<img
										src={tpl.icon || TERMINAL_ICON}
										loading='lazy'
										className='h-6 w-6 object-contain'
										onError={(e) => {
											;(e.currentTarget as HTMLImageElement).src = TERMINAL_ICON
										}}
									/>
								</span>
								<span className='w-full truncate text-[11px] text-gray-700'>{tpl.label}</span>
							</button>
						))}
					</div>
				</div>

				{/* R6 — user-saved templates. */}
				{(userTemplatesQ.data?.length ?? 0) > 0 ? (
					<div className='flex flex-col gap-2'>
						<span className='text-xs font-medium text-gray-600'>Saved</span>
						<div className='flex flex-wrap gap-2'>
							{(userTemplatesQ.data ?? []).map((tpl) => (
								<span
									key={tpl.id}
									className='inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 py-1 pl-3 pr-1 text-xs text-emerald-800'
								>
									<button type='button' className='hover:underline' onClick={() => applyUserTemplate(tpl)}>
										{tpl.label}
									</button>
									<button
										type='button'
										className='flex h-4 w-4 items-center justify-center rounded-full text-emerald-700 hover:bg-emerald-100'
										title='Delete saved template'
										onClick={async () => {
											await deleteTplMut.mutateAsync({id: tpl.id}).catch(() => {})
											await utils.shortcut.userTemplates.list.invalidate()
										}}
									>
										×
									</button>
								</span>
							))}
						</div>
					</div>
				) : null}

				{/* R5 — custom shell builder. */}
				<div className='flex flex-col gap-1.5'>
					<FieldLabel htmlFor='add-shortcut-cmd'>Command</FieldLabel>
					<Input id='add-shortcut-cmd' placeholder='e.g. htop' value={command} onValueChange={setCommand} />
				</div>

				<div className='flex flex-col gap-1.5'>
					<FieldLabel htmlFor='add-shortcut-cwd'>Working directory (optional)</FieldLabel>
					<div className='flex items-center gap-2'>
						<Input
							id='add-shortcut-cwd'
							placeholder='/Home/projects'
							value={cwd}
							onValueChange={setCwd}
						/>
						<Button type='button' size='dialog' onClick={() => setPickerOpen(true)}>
							Browse…
						</Button>
					</div>
				</div>

				<div className='flex flex-col gap-1.5'>
					<FieldLabel htmlFor='add-shortcut-cmd-title'>Title</FieldLabel>
					<Input
						id='add-shortcut-cmd-title'
						placeholder='Shortcut label'
						value={title}
						onValueChange={setTitle}
					/>
				</div>

				<div className='flex flex-col gap-1.5'>
					<FieldLabel>Icon</FieldLabel>
					<IconPicker value={icon} onChange={setIcon} idPrefix='terminal' />
				</div>

				{createMut.isError ? (
					<p className='text-xs text-red-600'>{createMut.error?.message ?? 'Failed to add shortcut.'}</p>
				) : null}
				{saveTplMut.isError ? (
					<p className='text-xs text-red-600'>{saveTplMut.error?.message ?? 'Failed to save template.'}</p>
				) : null}

				<DialogFooter>
					<Button
						type='button'
						size='dialog'
						onClick={() => void handleSaveTemplate()}
						disabled={command.trim().length === 0 || title.trim().length === 0 || saveTplMut.isPending}
					>
						{saveTplMut.isPending ? 'Saving…' : 'Save as template'}
					</Button>
					<Button type='button' size='dialog' variant='primary' onClick={() => void handleSubmit()} disabled={!canSubmit}>
						{createMut.isPending ? 'Adding…' : 'Add'}
					</Button>
				</DialogFooter>
			</div>

			{/* Right — AI-CLI flag reference (R4) when an ai-cli template is selected. */}
			{selectedFlags && selectedBuiltin ? (
				<div className='w-full shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:w-[300px]'>
					<p className='mb-2 text-xs font-semibold text-gray-700'>{selectedBuiltin.label} flags</p>
					<div className='flex max-h-[360px] flex-col gap-2 overflow-y-auto'>
						{selectedFlags.map((f) => (
							<div key={f.flag} className='flex items-start justify-between gap-2'>
								<div className='min-w-0'>
									<code className='break-all text-[11px] font-medium text-gray-900'>{f.flag}</code>
									<p className='text-[11px] text-gray-500'>{f.description}</p>
								</div>
								<button
									type='button'
									className='shrink-0 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-100'
									title='Append this flag to the command'
									onClick={() => {
										// Opt-in only (M5) — append the flag token (first form, sans desc).
										const token = f.flag.split(' ')[0].split('/')[0].trim()
										setCommand((c) => `${c.trimEnd()} ${token}`.trim())
									}}
								>
									Insert
								</button>
							</div>
						))}
					</div>
				</div>
			) : null}

			{/* H5 — folder picker renders its OWN Radix Dialog. Keep its open state
			    INDEPENDENT: its onOpenChange only closes the picker, it never bubbles
			    to the parent AddShortcut dialog. */}
			<MiniBrowser
				open={pickerOpen}
				onOpenChange={(o) => {
					if (!o) setPickerOpen(false)
				}}
				rootPath='/Home'
				preselectOnOpen={false}
				selectionMode='folders'
				title='Choose a working directory'
				onSelect={(p) => {
					setCwd(p)
					setPickerOpen(false)
				}}
			/>
		</div>
	)
}

// ── Native tab (admin-only, M4) ─────────────────────────────────────────────

function NativeTab({active}: {active: boolean}) {
	const utils = trpcReact.useUtils()
	const scanQ = trpcReact.apps.native.scanHostApps.useQuery(undefined, {
		enabled: active,
		staleTime: 60 * 1000,
		retry: false,
	})
	const createMut = trpcReact.apps.native.create.useMutation()
	const installMut = trpcReact.apps.native.installFromHost.useMutation()

	const [query, setQuery] = useState('')
	const [pkg, setPkg] = useState('')
	const [installResult, setInstallResult] = useState<string | null>(null)
	const [addedId, setAddedId] = useState<string | null>(null)

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase()
		const apps = scanQ.data ?? []
		if (!q) return apps
		return apps.filter((a) => a.name.toLowerCase().includes(q))
	}, [scanQ.data, query])

	const addScanned = async (app: NonNullable<typeof scanQ.data>[number]) => {
		setAddedId(app.id)
		try {
			// Create ONLY a NativeAppConfig (H1 — no shortcut row, no double-tile).
			// crypto.randomUUID() id; the binaryPath is already realpath'd + allow-listed.
			await createMut.mutateAsync({
				id: crypto.randomUUID(),
				name: app.name.slice(0, 64),
				// Native icons are http/root-relative or a bare freedesktop name (B1 —
				// never a data-URL). Only forward a schema-valid icon; else omit so the
				// tile shows a placeholder rather than failing nativeAppConfigSchema.
				...(app.icon && (app.icon.startsWith('/') || /^https?:\/\//.test(app.icon))
					? {iconUrl: app.icon}
					: {}),
				binaryPath: app.binaryPath,
				...(app.wmClassHint ? {wmClassHint: app.wmClassHint} : {}),
			})
			await utils.apps.native.list.invalidate().catch(() => {})
			await utils.apps.list.invalidate().catch(() => {})
		} catch {
			/* surfaced below */
		} finally {
			setAddedId(null)
		}
	}

	const handleInstall = async () => {
		const p = pkg.trim()
		if (!p) return
		setInstallResult(null)
		try {
			const outcome = await installMut.mutateAsync({pkg: p, name: p})
			if (outcome && typeof outcome === 'object' && 'ok' in outcome) {
				setInstallResult(
					outcome.ok ? `Installed ${p}.` : `Failed: ${(outcome as {message?: string}).message ?? 'unknown error'}`,
				)
				if (outcome.ok) {
					await utils.apps.native.list.invalidate().catch(() => {})
					await utils.apps.native.scanHostApps.invalidate().catch(() => {})
				}
			}
		} catch (err) {
			setInstallResult(err instanceof Error ? err.message : 'Install failed.')
		}
	}

	return (
		<div className='flex flex-col gap-5 pt-2'>
			{/* Installed-on-device picker. */}
			<div className='flex flex-col gap-2'>
				<p className='text-xs font-semibold uppercase tracking-wide text-gray-500'>Installed on this device</p>
				<Input placeholder='Search installed apps…' value={query} onValueChange={setQuery} autoFocus={active} />
				{scanQ.isLoading ? (
					<p className='py-4 text-center text-sm text-gray-500'>Scanning…</p>
				) : scanQ.isError ? (
					<p className='py-4 text-center text-sm text-red-600'>{scanQ.error?.message ?? 'Scan failed.'}</p>
				) : filtered.length === 0 ? (
					<p className='py-4 text-center text-sm text-gray-500'>No installed apps found.</p>
				) : (
					<div className='grid max-h-[260px] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6'>
						{filtered.map((app) => (
							<button
								key={app.id}
								type='button'
								disabled={createMut.isPending}
								onClick={() => void addScanned(app)}
								className='flex flex-col items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 p-2 text-center transition-colors hover:bg-gray-100 disabled:opacity-50'
								title={app.binaryPath}
							>
								<span className='flex h-8 w-8 items-center justify-center overflow-hidden rounded-md bg-white'>
									{app.icon && (app.icon.startsWith('/') || /^https?:\/\//.test(app.icon)) ? (
										// eslint-disable-next-line jsx-a11y/alt-text
										<img
											src={app.icon}
											loading='lazy'
											className='h-6 w-6 object-contain'
											onError={(e) => {
												;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
											}}
										/>
									) : (
										<span className='text-[9px] text-gray-400'>app</span>
									)}
								</span>
								<span className='w-full truncate text-[11px] text-gray-700'>
									{addedId === app.id ? 'Adding…' : app.name}
								</span>
							</button>
						))}
					</div>
				)}
				{createMut.isError ? (
					<p className='text-xs text-red-600'>{createMut.error?.message ?? 'Failed to add app.'}</p>
				) : null}
			</div>

			{/* Install from apt. */}
			<div className='flex flex-col gap-2 border-t border-gray-200 pt-4'>
				<p className='text-xs font-semibold uppercase tracking-wide text-gray-500'>Install via apt</p>
				<div className='flex items-center gap-2'>
					<Input placeholder='package name, e.g. gimp' value={pkg} onValueChange={setPkg} />
					<Button
						type='button'
						size='dialog'
						variant='primary'
						onClick={() => void handleInstall()}
						disabled={!pkg.trim() || installMut.isPending}
					>
						{installMut.isPending ? 'Installing…' : 'Install'}
					</Button>
				</div>
				<p className='text-[11px] text-gray-500'>
					Installs the package with apt (needs sudo). Catalog/apt only — no arbitrary scripts.
				</p>
				{installResult ? (
					<p className={`text-xs ${installResult.startsWith('Failed') || installResult.includes('failed') ? 'text-red-600' : 'text-emerald-700'}`}>
						{installResult}
					</p>
				) : null}
			</div>
		</div>
	)
}
