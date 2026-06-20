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
import {Button} from '@/shadcn-components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/shadcn-components/ui/tabs'
import {trpcClient, trpcReact} from '@/trpc/trpc'

import {normalizeAptInput} from './apt-input'
import {IconPicker} from './icon-picker'
import {
	TERMINAL_TEMPLATE_CATEGORIES,
	TERMINAL_TEMPLATE_LIBRARY,
	terminalTemplateIconUrl,
	type TerminalTemplateCategory,
	type TerminalTemplateLibraryEntry,
} from './terminal-template-library'
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

// Mirror of the server `nativeAppConfigSchema` iconUrl gate (native-app-config.ts):
// a full http(s) URL OR a root-relative path with NO query string. The native
// `/api/native/icon-file?path=…` proxy URL is renderable as an <img> but does
// NOT match this, so it's omitted from `apps.native.create` (REQ3d) to avoid a
// schema rejection.
const NATIVE_ROOT_RELATIVE_RE = /^\/[A-Za-z0-9_\-./]*$/
function isSchemaValidNativeIconUrl(v: string): boolean {
	if (v.startsWith('/')) return NATIVE_ROOT_RELATIVE_RE.test(v)
	try {
		new URL(v)
		return true
	} catch {
		return false
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
				iconUrl: webAppIconUrl(entry),
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
											src={webAppIconUrl(entry)}
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
	const utils = trpcReact.useUtils()
	const createMut = trpcReact.shortcut.create.useMutation()
	const saveTplMut = trpcReact.shortcut.userTemplates.create.useMutation()
	const deleteTplMut = trpcReact.shortcut.userTemplates.delete.useMutation()

	const templatesQ = trpcReact.shortcut.terminalTemplates.useQuery(undefined, {
		enabled: active,
		staleTime: 5 * 60 * 1000,
	})
	const userTemplatesQ = trpcReact.shortcut.userTemplates.list.useQuery(undefined, {
		enabled: active,
		staleTime: 30 * 1000,
	})

	const [command, setCommand] = useState('')
	const [title, setTitle] = useState('')
	const [cwd, setCwd] = useState('')
	const [icon, setIcon] = useState(TERMINAL_ICON)
	const [templateId, setTemplateId] = useState<string | undefined>(undefined)
	const [selectedFlags, setSelectedFlags] = useState<{flag: string; description: string}[] | null>(null)
	const [pickerOpen, setPickerOpen] = useState(false)
	// REQ4 — the professional 80+ template library, toggled by the '+'/More tile.
	const [showLibrary, setShowLibrary] = useState(false)

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
		setShowLibrary(false)
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

	// REQ4 — library entries are NOT server builtins; pre-fill + CLEAR templateId.
	const applyLibraryEntry = (entry: TerminalTemplateLibraryEntry) => {
		setCommand(entry.command)
		setTitle(entry.name)
		setIcon(terminalTemplateIconUrl(entry))
		setSelectedFlags(null)
		setTemplateId(undefined)
		setShowLibrary(false)
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
						{/* REQ4 — '+'/More tile opens the 80+ professional template library. */}
						<button
							type='button'
							className={`flex flex-col items-center gap-1.5 rounded-lg border border-dashed p-2 text-center transition-colors ${
								showLibrary
									? 'border-gray-400 bg-gray-100'
									: 'border-gray-300 bg-white hover:bg-gray-50'
							}`}
							title='Browse more templates'
							onClick={() => setShowLibrary((v) => !v)}
						>
							<span className='flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-lg leading-none text-gray-500'>
								+
							</span>
							<span className='w-full truncate text-[11px] text-gray-700'>More</span>
						</button>
					</div>
				</div>

				{/* REQ4 — searchable, category-filtered, A-Z template library. */}
				{showLibrary ? <TemplateLibraryPanel onPick={applyLibraryEntry} /> : null}

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

// ── Terminal template library panel (REQ4) ─────────────────────────────────
//
// Searchable, category-filtered, A-Z list of the 80+ professional templates.
// Each row = dashboard-icons logo (jsDelivr CDN, M4) + name + muted command +
// description. Clicking a row pre-fills the editor via `onPick` (which clears
// the server templateId — these are NOT builtins).

function TemplateLibraryPanel({onPick}: {onPick: (entry: TerminalTemplateLibraryEntry) => void}) {
	const [search, setSearch] = useState('')
	const [category, setCategory] = useState<TerminalTemplateCategory | 'All'>('All')

	const rows = useMemo(() => {
		const q = search.trim().toLowerCase()
		return TERMINAL_TEMPLATE_LIBRARY.filter((e) => {
			if (category !== 'All' && e.category !== category) return false
			if (!q) return true
			return (
				e.name.toLowerCase().includes(q) ||
				e.command.toLowerCase().includes(q) ||
				e.description.toLowerCase().includes(q)
			)
		}).sort((a, b) => a.name.localeCompare(b.name))
	}, [search, category])

	return (
		<div className='flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3'>
			<Input placeholder='Search templates…' value={search} onValueChange={setSearch} />

			<div className='flex flex-wrap gap-1.5'>
				<button
					type='button'
					className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
						category === 'All'
							? 'border-gray-400 bg-gray-200 text-gray-900'
							: 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
					}`}
					onClick={() => setCategory('All')}
				>
					All
				</button>
				{TERMINAL_TEMPLATE_CATEGORIES.map((cat) => (
					<button
						key={cat}
						type='button'
						className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
							category === cat
								? 'border-gray-400 bg-gray-200 text-gray-900'
								: 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
						}`}
						onClick={() => setCategory(cat)}
					>
						{cat}
					</button>
				))}
			</div>

			<div className='flex max-h-[300px] flex-col gap-1 overflow-y-auto'>
				{rows.length === 0 ? (
					<p className='py-4 text-center text-sm text-gray-500'>No matching templates.</p>
				) : (
					rows.map((entry) => (
						<button
							key={entry.name}
							type='button'
							className='flex items-center gap-3 rounded-md border border-transparent bg-white p-2 text-left transition-colors hover:border-gray-200 hover:bg-gray-100'
							onClick={() => onPick(entry)}
							title={`Use: ${entry.command}`}
						>
							<span className='flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-50'>
								{/* eslint-disable-next-line jsx-a11y/alt-text */}
								<img
									src={terminalTemplateIconUrl(entry)}
									loading='lazy'
									className='h-6 w-6 object-contain'
									onError={(e) => {
										;(e.currentTarget as HTMLImageElement).src = TERMINAL_ICON
									}}
								/>
							</span>
							<span className='min-w-0 flex-1'>
								<span className='flex items-baseline gap-2'>
									<span className='truncate text-sm font-medium text-gray-900'>{entry.name}</span>
									<code className='truncate text-[11px] text-gray-500'>{entry.command}</code>
								</span>
								<span className='block truncate text-[11px] text-gray-500'>{entry.description}</span>
							</span>
						</button>
					))
				)}
			</div>
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

	// v44.61 (REQ3) — also surface persisted NativeAppConfigs (apps.native.list) in
	// the "Installed on this device" grid. scanHostApps DROPS flatpak/snap Execs, so
	// store-installed flatpak apps never appear via the scan — merging the config list
	// makes them show, and gives each a real Remove (uninstall) button (REQ2a).
	const nativeListQ = trpcReact.apps.native.list.useQuery(undefined, {
		enabled: active,
		staleTime: 30 * 1000,
		retry: false,
	})
	const uninstallMut = trpcReact.apps.native.uninstall.useMutation()
	const [removingId, setRemovingId] = useState<string | null>(null)

	const removeNativeConfig = async (id: string) => {
		setRemovingId(id)
		try {
			await uninstallMut.mutateAsync({id})
			await utils.apps.native.list.invalidate().catch(() => {})
			await utils.apps.native.scanHostApps.invalidate().catch(() => {})
			await utils.apps.list.invalidate().catch(() => {})
		} catch {
			/* surfaced via uninstallMut.isError below */
		} finally {
			setRemovingId(null)
		}
	}

	// ── App store (catalog) ─────────────────────────────────────────────────────
	// A generic, unbranded app store. Browse by category (All = popular) OR search;
	// the grid accumulates pages and a "Load more" button appends the next page.
	// Install persists a tile whose iconUrl is a full https catalog URL (so it
	// satisfies nativeAppConfigSchema.iconUrl and PERSISTS on the tile).
	type CatalogApp = {appId: string; name: string; summary: string; iconUrl?: string}

	const [fhQuery, setFhQuery] = useState('')
	const [fhDebounced, setFhDebounced] = useState('')
	useDebounce(() => setFhDebounced(fhQuery), 300, [fhQuery])

	// Selected category chip. `null` = All (popular collection). Cleared/ignored
	// while a search is active.
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

	const isSearching = fhDebounced.trim().length > 0

	const categoriesQ = trpcReact.apps.native.flathubCategories.useQuery(undefined, {
		enabled: active,
		staleTime: 60 * 60 * 1000,
		retry: false,
	})
	const categories = (categoriesQ.data ?? []) as string[]

	// Accumulated-pages state. We reset to page 1 whenever the category OR the
	// search query changes (the effect below), then APPEND each subsequent page.
	const [page, setPage] = useState(1)
	const [accApps, setAccApps] = useState<CatalogApp[]>([])
	const [hasMore, setHasMore] = useState(false)

	// The "view key" — changes exactly when the result set should reset. While
	// searching, the category is irrelevant.
	const viewKey = isSearching ? `s:${fhDebounced.trim()}` : `c:${selectedCategory ?? ''}`
	const prevViewKeyRef = useRef(viewKey)
	useEffect(() => {
		if (prevViewKeyRef.current !== viewKey) {
			prevViewKeyRef.current = viewKey
			setPage(1)
			setAccApps([])
			setHasMore(false)
		}
	}, [viewKey])

	const browseQ = trpcReact.apps.native.flathubBrowse.useQuery(
		{category: selectedCategory ?? undefined, page},
		{enabled: active && !isSearching, retry: false, staleTime: 5 * 60 * 1000},
	)
	const searchQ = trpcReact.apps.native.flathubSearch.useQuery(
		{query: fhDebounced.trim(), page},
		{enabled: active && isSearching, retry: false},
	)
	const showing = isSearching ? searchQ : browseQ

	// Append each fetched page into the accumulator (keyed by appId to dedupe).
	useEffect(() => {
		const data = showing.data as {apps?: CatalogApp[]; hasMore?: boolean} | undefined
		if (!data) return
		const incoming = data.apps ?? []
		if (page === 1) {
			setAccApps(incoming)
		} else {
			setAccApps((prev) => {
				const seen = new Set(prev.map((a) => a.appId))
				return [...prev, ...incoming.filter((a) => !seen.has(a.appId))]
			})
		}
		setHasMore(Boolean(data.hasMore))
		// `showing.data` identity changes per fetch; page guards the append branch.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [showing.data])

	const installFlathubMut = trpcReact.apps.native.installFlathub.useMutation()
	const [installingId, setInstallingId] = useState<string | null>(null)
	const [installPct, setInstallPct] = useState(0)
	const [flathubResult, setFlathubResult] = useState<string | null>(null)

	// v44.61 (REQ1) — install with a moving progress bar. The box records progress
	// under progressId (== the flatpak appId here) into apps.v37Progress; we poll it
	// AND run a client-side creep so the bar always moves even if flatpak emits no %.
	const installFlathubApp = async (app: {appId: string; name: string; iconUrl?: string}) => {
		setInstallingId(app.appId)
		setInstallPct(0)
		setFlathubResult(null)
		let done = false
		const startedAt = Date.now()
		const creepFor = (ms: number) => Math.round(90 * (1 - Math.exp(-ms / 30_000)))
		const poll = setInterval(async () => {
			if (done) {
				clearInterval(poll)
				return
			}
			let serverPct = 0
			try {
				const ev = await trpcClient.apps.v37Progress.query({appId: app.appId})
				if (ev && ev.pct > 0) serverPct = Math.round(ev.pct)
			} catch {
				/* server is source of truth — keep creeping */
			}
			setInstallPct(Math.min(99, Math.max(serverPct, creepFor(Date.now() - startedAt))))
		}, 1500)
		try {
			const r = await installFlathubMut.mutateAsync({
				appId: app.appId,
				progressId: app.appId,
				name: app.name,
				iconUrl: app.iconUrl,
			})
			setInstallPct(100)
			setFlathubResult(`Installed ${r.name}.`)
			await utils.apps.native.list.invalidate().catch(() => {})
			await utils.apps.native.scanHostApps.invalidate().catch(() => {})
		} catch (e) {
			setFlathubResult(`Failed: ${e instanceof Error ? e.message : 'install failed'}`)
		} finally {
			done = true
			clearInterval(poll)
			setInstallingId(null)
			setInstallPct(0)
		}
	}

	const [query, setQuery] = useState('')
	const [pkg, setPkg] = useState('')
	const [installResult, setInstallResult] = useState<string | null>(null)
	const [addedId, setAddedId] = useState<string | null>(null)

	// Upload a local .deb (Discord, Chrome, … — not in apt). RAW octet-stream
	// body via XHR (mirrors /api/files/upload). The Native tab is already
	// admin-gated, but the server route re-asserts admin (a .deb runs maintainer
	// scripts as root).
	const debInputRef = useRef<HTMLInputElement>(null)
	const [debFile, setDebFile] = useState<File | null>(null)
	const [debProgress, setDebProgress] = useState<number | null>(null)
	const [debResult, setDebResult] = useState<string | null>(null)

	// v44.61 (REQ3) — merge persisted configs (already installed → Remove) with the
	// host scan (not-yet-a-tile → Add), deduped by binaryPath. The shared
	// /usr/bin/flatpak + /usr/bin/snap wrapper paths are EXCLUDED from the dedupe set
	// (else one flatpak config would swallow every scanned app); flatpak apps never
	// appear in the scan anyway, so there's nothing to collide with.
	type ScannedApp = NonNullable<typeof scanQ.data>[number]
	type NativeCfg = NonNullable<typeof nativeListQ.data>[number]
	type InstalledEntry = {kind: 'config'; cfg: NativeCfg} | {kind: 'scanned'; app: ScannedApp}

	const installedMerged = useMemo<InstalledEntry[]>(() => {
		const configs = nativeListQ.data ?? []
		const scanned = scanQ.data ?? []
		const configBinaries = new Set(
			configs
				.map((c) => c.binaryPath)
				.filter((b) => b !== '/usr/bin/flatpak' && b !== '/usr/bin/snap'),
		)
		const out: InstalledEntry[] = configs.map((cfg) => ({kind: 'config' as const, cfg}))
		for (const app of scanned) {
			if (configBinaries.has(app.binaryPath)) continue
			out.push({kind: 'scanned', app})
		}
		return out.sort((a, b) => {
			const an = a.kind === 'config' ? a.cfg.name : a.app.name
			const bn = b.kind === 'config' ? b.cfg.name : b.app.name
			return an.localeCompare(bn)
		})
	}, [nativeListQ.data, scanQ.data])

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase()
		if (!q) return installedMerged
		return installedMerged.filter((e) =>
			(e.kind === 'config' ? e.cfg.name : e.app.name).toLowerCase().includes(q),
		)
	}, [installedMerged, query])

	const addScanned = async (app: NonNullable<typeof scanQ.data>[number]) => {
		setAddedId(app.id)
		try {
			// Create ONLY a NativeAppConfig (H1 — no shortcut row, no double-tile).
			// crypto.randomUUID() id; the binaryPath is already realpath'd + allow-listed.
			await createMut.mutateAsync({
				id: crypto.randomUUID(),
				name: app.name.slice(0, 64),
				// REQ3d — forward the scanner-resolved `iconUrl` (the gated proxy URL or
				// http(s) URL), never a data-URL (B1). Only forward when it would satisfy
				// nativeAppConfigSchema; the `/api/native/icon-file?path=…` query-string
				// form is still rendered as an <img> below but is omitted from create so
				// it can't 400 the mutation.
				...(app.iconUrl && isSchemaValidNativeIconUrl(app.iconUrl) ? {iconUrl: app.iconUrl} : {}),
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
		// REQ2 — accept a bare pkg OR a pasted full command; reduce to the first
		// package token ON SUBMIT (the server validates a single token, no spaces).
		const p = normalizeAptInput(pkg)
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

	const clearDeb = () => {
		setDebFile(null)
		setDebResult(null)
		if (debInputRef.current) debInputRef.current.value = ''
	}

	// Upload + install a local app package. RAW octet-stream body (NOT FormData /
	// base64 / tRPC), mirroring the Files upload XHR. The LIVINITY_PROXY_TOKEN cookie
	// is sent automatically — no auth header. The format is detected from the file
	// extension client-side and posted to the generalized
	// /api/native/upload-app?format=<deb|appimage|flatpak|snap> route. The server
	// validates magic bytes + admin and returns {ok, name?, message?}.
	const handleDebUpload = () => {
		if (!debFile || debProgress !== null) return
		setDebResult(null)
		const file = debFile
		// Detect the package format from the file extension (case-insensitive).
		const lower = file.name.toLowerCase()
		const format = lower.endsWith('.deb')
			? 'deb'
			: lower.endsWith('.appimage')
				? 'appimage'
				: lower.endsWith('.flatpak')
					? 'flatpak'
					: lower.endsWith('.snap')
						? 'snap'
						: null
		if (!format) {
			setDebResult('Failed: unsupported file type (use .deb/.AppImage/.flatpak/.snap)')
			return
		}
		const xhr = new XMLHttpRequest()
		xhr.open('POST', `/api/native/upload-app?name=${encodeURIComponent(file.name)}&format=${format}`)
		xhr.setRequestHeader('Content-Type', 'application/octet-stream')

		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable) setDebProgress(Math.round((e.loaded / e.total) * 100))
		}

		xhr.onload = async () => {
			setDebProgress(null)
			if (xhr.status >= 200 && xhr.status < 300) {
				let body: {ok?: boolean; name?: string; message?: string} = {}
				try {
					body = JSON.parse(xhr.responseText) as typeof body
				} catch {
					/* fall through to the generic failure below */
				}
				if (body.ok) {
					setDebResult(`Installed ${body.name ?? file.name}.`)
					await utils.apps.native.list.invalidate().catch(() => {})
					await utils.apps.native.scanHostApps.invalidate().catch(() => {})
					setDebFile(null)
					if (debInputRef.current) debInputRef.current.value = ''
				} else {
					setDebResult(`Failed: ${body.message ?? 'install failed'}`)
				}
			} else {
				let message = xhr.statusText || 'upload failed'
				try {
					const body = JSON.parse(xhr.responseText) as {message?: string}
					if (body.message) message = body.message
				} catch {
					/* keep statusText */
				}
				setDebResult(`Failed: ${message}`)
			}
		}

		xhr.onerror = () => {
			setDebProgress(null)
			setDebResult('Failed: network error')
		}

		setDebProgress(0)
		xhr.send(file)
	}

	return (
		<div className='flex flex-col gap-5 pt-2'>
			{/* App store — browse by category (All = popular) or search, paginated. */}
			<div className='flex flex-col gap-2'>
				<p className='text-xs font-semibold uppercase tracking-wide text-gray-500'>Browse apps</p>
				<Input placeholder='Search apps…' value={fhQuery} onValueChange={setFhQuery} />

				{/* Category chips: "All" + one per category. Hidden while searching. */}
				{!isSearching ? (
					<div className='flex flex-wrap gap-1.5'>
						<button
							type='button'
							className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
								selectedCategory === null
									? 'border-gray-400 bg-gray-200 text-gray-900'
									: 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
							}`}
							onClick={() => setSelectedCategory(null)}
						>
							All
						</button>
						{categories.map((cat) => (
							<button
								key={cat}
								type='button'
								className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
									selectedCategory === cat
										? 'border-gray-400 bg-gray-200 text-gray-900'
										: 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
								}`}
								onClick={() => setSelectedCategory(cat)}
							>
								{cat}
							</button>
						))}
					</div>
				) : null}

				{showing.isLoading && accApps.length === 0 ? (
					<p className='py-4 text-center text-sm text-gray-500'>Loading apps…</p>
				) : showing.isError && accApps.length === 0 ? (
					<p className='py-4 text-center text-sm text-red-600'>
						Couldn&apos;t load the app catalog. Check your connection and try again.
					</p>
				) : accApps.length === 0 ? (
					<p className='py-4 text-center text-sm text-gray-500'>
						{isSearching ? `No results for "${fhDebounced.trim()}".` : 'No apps found.'}
					</p>
				) : (
					<div className='flex max-h-[300px] flex-col gap-1 overflow-y-auto'>
						{accApps.map((app) => (
							<div
								key={app.appId}
								className='flex items-center gap-3 rounded-md border border-gray-200 bg-white p-2'
							>
								<span className='flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-50'>
									{app.iconUrl ? (
										// eslint-disable-next-line jsx-a11y/alt-text
										<img
											src={app.iconUrl}
											loading='lazy'
											className='h-8 w-8 object-contain'
											onError={(e) => {
												;(e.currentTarget as HTMLImageElement).style.display = 'none'
											}}
										/>
									) : null}
								</span>
								<span className='min-w-0 flex-1'>
									<span className='block truncate text-sm font-medium text-gray-900'>{app.name}</span>
									{app.summary ? (
										<span className='block truncate text-[11px] text-gray-500'>{app.summary}</span>
									) : null}
								</span>
								<Button
									type='button'
									size='dialog'
									variant='primary'
									disabled={installingId !== null}
									onClick={() => void installFlathubApp(app)}
								>
									{installingId === app.appId ? 'Installing…' : 'Install'}
								</Button>
							</div>
						))}
						{/* Load more — append the next page while the last response hasMore. */}
						{hasMore ? (
							<button
								type='button'
								disabled={showing.isFetching}
								className='mt-1 rounded-md border border-gray-200 bg-gray-50 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50'
								onClick={() => setPage((p) => p + 1)}
							>
								{showing.isFetching ? 'Loading…' : 'Load more'}
							</button>
						) : null}
					</div>
				)}
				{installingId !== null ? (
					<div className='flex flex-col gap-1'>
						<div className='flex items-center justify-between text-[11px] text-gray-500'>
							<span>Installing… this can take a few minutes.</span>
							<span className='font-mono tabular-nums text-gray-700'>{installPct}%</span>
						</div>
						<div className='h-1 w-full overflow-hidden rounded-full bg-gray-200'>
							<div
								className='h-full rounded-full bg-emerald-500 transition-[width]'
								style={{width: `${installPct}%`}}
							/>
						</div>
					</div>
				) : null}
				{flathubResult ? (
					<p
						className={`text-xs ${
							flathubResult.startsWith('Failed') || flathubResult.includes('failed')
								? 'text-red-600'
								: 'text-emerald-700'
						}`}
					>
						{flathubResult}
					</p>
				) : null}
			</div>

			{/* Installed-on-device picker. */}
			<div className='flex flex-col gap-2 border-t border-gray-200 pt-4'>
				<p className='text-xs font-semibold uppercase tracking-wide text-gray-500'>Installed on this device</p>
				<Input placeholder='Search installed apps…' value={query} onValueChange={setQuery} autoFocus={active} />
				{scanQ.isLoading && nativeListQ.isLoading ? (
					<p className='py-4 text-center text-sm text-gray-500'>Scanning…</p>
				) : scanQ.isError && (nativeListQ.data ?? []).length === 0 ? (
					<p className='py-4 text-center text-sm text-red-600'>{scanQ.error?.message ?? 'Scan failed.'}</p>
				) : filtered.length === 0 ? (
					<p className='py-4 text-center text-sm text-gray-500'>No installed apps found.</p>
				) : (
					<div className='grid max-h-[260px] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6'>
						{filtered.map((entry) =>
							entry.kind === 'scanned' ? (
								<button
									key={'s-' + entry.app.id}
									type='button'
									disabled={createMut.isPending}
									onClick={() => void addScanned(entry.app)}
									className='flex flex-col items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 p-2 text-center transition-colors hover:bg-gray-100 disabled:opacity-50'
									title={entry.app.binaryPath}
								>
									<span className='relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-md bg-white'>
										<span className='absolute text-[9px] text-gray-400'>app</span>
										{entry.app.iconUrl ? (
											// REQ3d — render the scanner-resolved iconUrl; onError hides the
											// <img> so the placeholder behind it shows through.
											// eslint-disable-next-line jsx-a11y/alt-text
											<img
												src={entry.app.iconUrl}
												loading='lazy'
												className='relative h-6 w-6 object-contain'
												onError={(e) => {
													;(e.currentTarget as HTMLImageElement).style.display = 'none'
												}}
											/>
										) : null}
									</span>
									<span className='w-full truncate text-[11px] text-gray-700'>
										{addedId === entry.app.id ? 'Adding…' : entry.app.name}
									</span>
								</button>
							) : (
								// v44.61 (REQ2a) — an already-installed config tile. The × button runs the
								// REAL uninstall (apps.native.uninstall): flatpak/snap/AppImage are removed
								// from disk; apt/system tiles are just un-tiled (package kept).
								<div
									key={'c-' + entry.cfg.id}
									className='relative flex flex-col items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/40 p-2 text-center'
									title={entry.cfg.binaryPath}
								>
									<button
										type='button'
										disabled={removingId !== null}
										onClick={() => void removeNativeConfig(entry.cfg.id)}
										aria-label={'Remove ' + entry.cfg.name}
										title={'Remove ' + entry.cfg.name}
										className='absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-[10px] leading-none text-gray-600 transition-colors hover:bg-red-500 hover:text-white disabled:opacity-50'
									>
										{removingId === entry.cfg.id ? '·' : '×'}
									</button>
									<span className='relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-md bg-white'>
										<span className='absolute text-[9px] text-gray-400'>app</span>
										{entry.cfg.iconUrl ? (
											// eslint-disable-next-line jsx-a11y/alt-text
											<img
												src={entry.cfg.iconUrl}
												loading='lazy'
												className='relative h-6 w-6 object-contain'
												onError={(e) => {
													;(e.currentTarget as HTMLImageElement).style.display = 'none'
												}}
											/>
										) : null}
									</span>
									<span className='w-full truncate text-[11px] text-gray-700'>
										{removingId === entry.cfg.id ? 'Removing…' : entry.cfg.name}
									</span>
								</div>
							),
						)}
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
					<Input
						placeholder='gimp  (or paste: sudo apt install gimp)'
						value={pkg}
						onValueChange={setPkg}
					/>
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
					One package name, or paste a "sudo apt install &lt;pkg&gt;" command — we&apos;ll clean it up.
					apt only, no scripts.
				</p>
				{installResult ? (
					<p className={`text-xs ${installResult.startsWith('Failed') || installResult.includes('failed') ? 'text-red-600' : 'text-emerald-700'}`}>
						{installResult}
					</p>
				) : null}
			</div>

			{/* Upload a local app package (Discord, Chrome, … — apps not in apt). */}
			<div className='flex flex-col gap-2 border-t border-gray-200 pt-4'>
				<p className='text-xs font-semibold uppercase tracking-wide text-gray-500'>Upload an app file</p>
				<div className='flex flex-wrap items-center gap-2'>
					<input
						ref={debInputRef}
						type='file'
						accept='.deb,.AppImage,.flatpak,.snap,application/vnd.debian.binary-package'
						className='hidden'
						id='native-deb-file'
						onChange={(e) => {
							const f = e.target.files?.[0] ?? null
							setDebFile(f)
							setDebResult(null)
						}}
					/>
					<label
						htmlFor='native-deb-file'
						className='inline-flex cursor-pointer items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100'
					>
						Choose app file…
					</label>
					<Button
						type='button'
						size='dialog'
						variant='primary'
						onClick={() => handleDebUpload()}
						disabled={!debFile || debProgress !== null}
					>
						{debProgress !== null ? 'Installing…' : 'Install'}
					</Button>
				</div>

				{debFile ? (
					<div className='flex items-center gap-2 text-[11px] text-gray-600'>
						<span className='truncate'>
							{debFile.name} · {(debFile.size / (1024 * 1024)).toFixed(1)} MB
						</span>
						<button
							type='button'
							className='shrink-0 text-gray-500 underline hover:text-gray-700'
							onClick={() => clearDeb()}
						>
							Remove
						</button>
					</div>
				) : null}

				{debProgress !== null ? (
					<div className='h-1 w-full overflow-hidden rounded-full bg-gray-200'>
						<div className='h-full rounded-full bg-emerald-500 transition-[width]' style={{width: `${debProgress}%`}} />
					</div>
				) : null}

				<p className='text-[11px] text-gray-500'>
					Install a .deb, .AppImage, .flatpak, or .snap. Runs as root for .deb/.snap — only upload packages you
					trust.
				</p>
				{debResult ? (
					<p className={`text-xs ${debResult.startsWith('Failed') || debResult.includes('failed') ? 'text-red-600' : 'text-emerald-700'}`}>
						{debResult}
					</p>
				) : null}
			</div>
		</div>
	)
}
