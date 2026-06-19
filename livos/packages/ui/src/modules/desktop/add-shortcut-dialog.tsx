// Phase 290 — AddShortcutDialog (Wave 2).
//
// One tabbed dialog (Web + Terminal this session; Native/Local deferred). Each
// tab gates the "Add" button on a mandatory icon (#3 — no blank tiles) and a
// valid target.
//
// Web tab:
//   - bare-domain normalize ("github.com" → "https://github.com").
//   - reuse webapp.extractMetadata for the title + favicon (the favicon is the
//     mandatory icon; if extraction yields none the user must paste an icon URL).
//   - shortcut.probeFrameable badge ("opens embedded" vs "opens as stream").
//   - shortcut.create({kind:'web', payload:{url}}) → backend picks open_mode.
//
// Terminal tab (L6 — gated on the v43 terminal panel flag):
//   - curated templates from shortcut.terminalTemplates (M5 — claude has NO
//     flags). Selecting a template pre-fills the command + a default icon.
//   - shortcut.create({kind:'terminal', payload:{command, templateId}}).
//
// 100% ADDITIVE — the existing AddWebAppDialog + webapp.* flow are untouched.

import {useEffect, useMemo, useRef, useState} from 'react'
import {useDebounce} from 'react-use'

import {useTerminalPanelEnabled} from '@/hooks/use-terminal-panel-enabled'
import {Button} from '@/shadcn-components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/shadcn-components/ui/tabs'
import {trpcReact} from '@/trpc/trpc'

const TERMINAL_ICON = '/figma-exports/dock-terminal.svg'

// Bare-domain normalize: "github.com" → "https://github.com"; pass through if
// already has a scheme. Returns null if it still can't be a URL.
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

export function AddShortcutDialog({
	open,
	onOpenChange,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const [tab, setTab] = useState<'web' | 'terminal'>('web')

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next)
				if (!next) setTab('web')
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add Shortcut</DialogTitle>
				</DialogHeader>

				<Tabs value={tab} onValueChange={(v) => setTab(v as 'web' | 'terminal')}>
					<TabsList className='w-full'>
						<TabsTrigger value='web' className='flex-1'>
							Web
						</TabsTrigger>
						<TabsTrigger value='terminal' className='flex-1'>
							Terminal
						</TabsTrigger>
					</TabsList>

					<TabsContent value='web'>
						<WebTab onClose={() => onOpenChange(false)} active={open && tab === 'web'} />
					</TabsContent>
					<TabsContent value='terminal'>
						<TerminalTab onClose={() => onOpenChange(false)} active={open && tab === 'terminal'} />
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	)
}

// ── Web tab ───────────────────────────────────────────────────────────────

function WebTab({onClose, active}: {onClose: () => void; active: boolean}) {
	const [rawUrl, setRawUrl] = useState('')
	const [debouncedUrl, setDebouncedUrl] = useState('')
	const [manualTitle, setManualTitle] = useState('')
	const [manualTitleTouched, setManualTitleTouched] = useState(false)
	const [manualIcon, setManualIcon] = useState('')

	const utils = trpcReact.useUtils()
	const createMut = trpcReact.shortcut.create.useMutation()

	const normalizedUrl = useMemo(() => normalizeUrlInput(rawUrl), [rawUrl])

	useDebounce(
		() => setDebouncedUrl(normalizedUrl ?? ''),
		300,
		[normalizedUrl],
	)

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

	const inputRef = useRef<HTMLInputElement>(null)
	useEffect(() => {
		if (active) {
			const t = setTimeout(() => inputRef.current?.focus(), 0)
			return () => clearTimeout(t)
		}
	}, [active])

	const resolvedIcon = manualIcon.trim() || metadataQ.data?.faviconUrl || ''
	const title = manualTitle.trim() || metadataQ.data?.title || (normalizedUrl ? new URL(normalizedUrl).hostname : '')
	// #3 — mandatory-icon gate: cannot add without a resolved icon.
	const hasIcon = resolvedIcon.length > 0
	const canSubmit = Boolean(normalizedUrl) && hasIcon && title.length > 0 && !createMut.isPending

	const reset = () => {
		setRawUrl('')
		setDebouncedUrl('')
		setManualTitle('')
		setManualTitleTouched(false)
		setManualIcon('')
		createMut.reset()
	}

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
			reset()
		} catch {
			/* surfaced below via createMut.error */
		}
	}

	const frameable = frameQ.data?.frameable

	return (
		<div className='flex flex-col gap-4 pt-2'>
			<div className='flex flex-col gap-1.5'>
				<label className='text-xs font-medium text-white/70' htmlFor='add-shortcut-url'>
					URL or domain
				</label>
				<Input
					id='add-shortcut-url'
					ref={inputRef}
					placeholder='github.com or https://example.com'
					value={rawUrl}
					onValueChange={setRawUrl}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && canSubmit) {
							e.preventDefault()
							void handleSubmit()
						}
					}}
				/>
				{rawUrl.trim() !== '' && !normalizedUrl ? (
					<p className='text-xs text-red-400'>Enter a valid domain or URL.</p>
				) : null}
			</div>

			{debouncedUrl ? (
				<div className='flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3'>
					<div className='flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/10'>
						{resolvedIcon ? (
							// eslint-disable-next-line jsx-a11y/alt-text
							<img
								src={resolvedIcon}
								loading='lazy'
								className='h-full w-full object-cover'
								onError={(e) => {
									;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
								}}
							/>
						) : null}
					</div>
					<div className='min-w-0 flex-1'>
						<p className='truncate text-sm font-medium text-white'>
							{metadataQ.isFetching ? 'Fetching site info…' : title || '(no title)'}
						</p>
						{frameable === undefined ? null : (
							<p className='mt-0.5 text-xs text-white/60'>
								{frameable ? 'Opens embedded in a window.' : 'Opens as a live stream (site blocks embedding).'}
							</p>
						)}
					</div>
				</div>
			) : null}

			<div className='flex flex-col gap-1.5'>
				<label className='text-xs font-medium text-white/70' htmlFor='add-shortcut-title'>
					Title
				</label>
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

			{!hasIcon && debouncedUrl ? (
				<div className='flex flex-col gap-1.5'>
					<label className='text-xs font-medium text-amber-300' htmlFor='add-shortcut-icon'>
						Icon required — no favicon found. Paste an icon URL.
					</label>
					<Input
						id='add-shortcut-icon'
						placeholder='https://…/icon.png'
						value={manualIcon}
						onValueChange={setManualIcon}
					/>
				</div>
			) : null}

			{createMut.isError ? (
				<p className='text-xs text-red-400'>{createMut.error?.message ?? 'Failed to add shortcut.'}</p>
			) : null}

			<DialogFooter>
				<Button type='button' size='dialog' onClick={onClose} disabled={createMut.isPending}>
					Cancel
				</Button>
				<Button type='button' size='dialog' variant='primary' onClick={() => void handleSubmit()} disabled={!canSubmit}>
					{createMut.isPending ? 'Adding…' : 'Add'}
				</Button>
			</DialogFooter>
		</div>
	)
}

// ── Terminal tab ────────────────────────────────────────────────────────────

function TerminalTab({onClose, active}: {onClose: () => void; active: boolean}) {
	// L6 — the Terminal kind needs the v43 persistent terminal (the command
	// queue consumer). If the flag is OFF, creating a terminal tile would no-op
	// on launch — surface a hint instead of the form.
	const terminalEnabled = useTerminalPanelEnabled()

	const utils = trpcReact.useUtils()
	const createMut = trpcReact.shortcut.create.useMutation()
	const templatesQ = trpcReact.shortcut.terminalTemplates.useQuery(undefined, {
		enabled: active && terminalEnabled,
		staleTime: 5 * 60 * 1000,
	})

	const [command, setCommand] = useState('')
	const [title, setTitle] = useState('')
	const [templateId, setTemplateId] = useState<string | undefined>(undefined)

	const canSubmit = command.trim().length > 0 && title.trim().length > 0 && !createMut.isPending

	const reset = () => {
		setCommand('')
		setTitle('')
		setTemplateId(undefined)
		createMut.reset()
	}

	const handleSubmit = async () => {
		if (!canSubmit) return
		try {
			await createMut.mutateAsync({
				kind: 'terminal',
				title: title.trim(),
				// Terminals have no favicon — ship the bundled terminal icon (the
				// mandatory-icon gate is satisfied; no blank tiles).
				iconUrl: TERMINAL_ICON,
				payload: {command: command.trim(), templateId},
			})
			await utils.shortcut.list.invalidate()
			await utils.apps.list.invalidate().catch(() => {})
			onClose()
			reset()
		} catch {
			/* surfaced below */
		}
	}

	if (!terminalEnabled) {
		return (
			<div className='flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70'>
				<p className='font-medium text-white'>Enable the new terminal first</p>
				<p className='text-xs'>
					Terminal shortcuts run a command in the persistent terminal, which is currently
					off on this device. Once it&apos;s enabled, this tab lets you save one-click
					command tiles.
				</p>
			</div>
		)
	}

	return (
		<div className='flex flex-col gap-4 pt-2'>
			<div className='flex flex-col gap-1.5'>
				<span className='text-xs font-medium text-white/70'>Templates</span>
				<div className='flex flex-wrap gap-2'>
					{(templatesQ.data ?? []).map((tpl) => (
						<button
							key={tpl.id}
							type='button'
							className='rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 transition-colors hover:bg-white/10'
							title={tpl.hint}
							onClick={() => {
								setCommand(tpl.command)
								if (!title.trim()) setTitle(tpl.label)
								setTemplateId(tpl.id)
							}}
						>
							{tpl.label}
						</button>
					))}
				</div>
			</div>

			<div className='flex flex-col gap-1.5'>
				<label className='text-xs font-medium text-white/70' htmlFor='add-shortcut-cmd'>
					Command
				</label>
				<Input
					id='add-shortcut-cmd'
					placeholder='e.g. htop'
					value={command}
					onValueChange={setCommand}
				/>
			</div>

			<div className='flex flex-col gap-1.5'>
				<label className='text-xs font-medium text-white/70' htmlFor='add-shortcut-cmd-title'>
					Title
				</label>
				<Input
					id='add-shortcut-cmd-title'
					placeholder='Shortcut label'
					value={title}
					onValueChange={setTitle}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && canSubmit) {
							e.preventDefault()
							void handleSubmit()
						}
					}}
				/>
			</div>

			{createMut.isError ? (
				<p className='text-xs text-red-400'>{createMut.error?.message ?? 'Failed to add shortcut.'}</p>
			) : null}

			<DialogFooter>
				<Button type='button' size='dialog' onClick={onClose} disabled={createMut.isPending}>
					Cancel
				</Button>
				<Button type='button' size='dialog' variant='primary' onClick={() => void handleSubmit()} disabled={!canSubmit}>
					{createMut.isPending ? 'Adding…' : 'Add'}
				</Button>
			</DialogFooter>
		</div>
	)
}
