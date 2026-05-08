// Phase 94-02 — AddWebAppDialog.
//
// Right-click empty desktop → "Add WebApp" → this dialog.
//
// Flow:
//   1. User pastes a URL into the input.
//   2. After 300ms idle, tRPC `webapp.extractMetadata` runs and the preview
//      card populates with title + favicon + description.
//   3. User can override the auto-extracted title.
//   4. Confirm → tRPC `webapp.create` mutation → invalidate `webapp.list` →
//      close dialog.
//
// Idempotency: `webapp.create` returns the existing row when (userId, url)
// already exists. The dialog treats that as a clean success — no "already
// added" error toast required.

import {useEffect, useMemo, useRef, useState} from 'react'
import {useDebounce} from 'react-use'

import {Button} from '@/shadcn-components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {trpcReact} from '@/trpc/trpc'

const URL_PROTO_RE = /^https?:\/\//i

function validateUrl(raw: string): {ok: true; url: string} | {ok: false; reason: string} {
	const trimmed = raw.trim()
	if (!trimmed) return {ok: false, reason: ''}
	if (!URL_PROTO_RE.test(trimmed)) {
		return {ok: false, reason: 'URL must start with http:// or https://'}
	}
	try {
		// new URL throws on malformed input.
		const parsed = new URL(trimmed)
		if (!parsed.hostname) return {ok: false, reason: 'URL must include a hostname'}
		return {ok: true, url: trimmed}
	} catch {
		return {ok: false, reason: 'Could not parse URL'}
	}
}

export function AddWebAppDialog({
	open,
	onOpenChange,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const [rawUrl, setRawUrl] = useState('')
	const [debouncedUrl, setDebouncedUrl] = useState('')
	const [manualTitle, setManualTitle] = useState('')
	const [manualTitleTouched, setManualTitleTouched] = useState(false)

	const utils = trpcReact.useUtils()
	const createMut = trpcReact.webapp.create.useMutation()

	const validation = useMemo(() => validateUrl(rawUrl), [rawUrl])

	// Debounce the URL update — prevents firing extractMetadata on every
	// keystroke while still feeling responsive to a paste.
	useDebounce(
		() => {
			if (validation.ok) {
				setDebouncedUrl(validation.url)
			} else {
				setDebouncedUrl('')
			}
		},
		300,
		[rawUrl, validation.ok],
	)

	const metadataQ = trpcReact.webapp.extractMetadata.useQuery(
		{url: debouncedUrl},
		{
			enabled: debouncedUrl.length > 0,
			retry: false,
			staleTime: 5 * 60 * 1000,
		},
	)

	// Auto-fill the manual title field with the extracted title once it
	// arrives — but only if the user hasn't typed their own override.
	useEffect(() => {
		if (manualTitleTouched) return
		const extracted = metadataQ.data?.title
		if (extracted) setManualTitle(extracted)
	}, [metadataQ.data?.title, manualTitleTouched])

	// Reset state when dialog closes (called via the open transition below).
	const resetState = () => {
		setRawUrl('')
		setDebouncedUrl('')
		setManualTitle('')
		setManualTitleTouched(false)
	}

	// Was this dialog just opened? Used to trigger autofocus side-effects.
	const inputRef = useRef<HTMLInputElement>(null)
	useEffect(() => {
		if (open) {
			// Defer focus to next tick so the dialog has rendered.
			const t = setTimeout(() => inputRef.current?.focus(), 0)
			return () => clearTimeout(t)
		}
	}, [open])

	const isFetchingMetadata = metadataQ.isFetching && debouncedUrl.length > 0
	const metadataError = metadataQ.isError ? metadataQ.error : null
	const metadataLoaded = metadataQ.isSuccess && metadataQ.data != null && debouncedUrl.length > 0

	const titleToSubmit = manualTitle.trim() || metadataQ.data?.title || ''
	const hasUsableTitle = titleToSubmit.length > 0
	const canSubmit = validation.ok && (metadataLoaded || hasUsableTitle) && !createMut.isPending

	const handleSubmit = async () => {
		if (!validation.ok || !canSubmit) return
		try {
			await createMut.mutateAsync({
				url: validation.url,
				title: titleToSubmit || null,
				faviconUrl: metadataQ.data?.faviconUrl ?? null,
				description: metadataQ.data?.description ?? null,
			})
			await utils.webapp.list.invalidate()
			// Best-effort: refresh apps provider too — its data feeds the desktop grid.
			await utils.apps.list.invalidate().catch(() => {})
			onOpenChange(false)
			resetState()
		} catch {
			// Mutation error surfaces below the form via `createMut.error`.
		}
	}

	const handleOpenChange = (next: boolean) => {
		onOpenChange(next)
		if (!next) {
			// Reset state on close so reopening starts fresh.
			resetState()
			createMut.reset()
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add WebApp</DialogTitle>
				</DialogHeader>

				<div className='flex flex-col gap-4'>
					<div className='flex flex-col gap-1.5'>
						<label className='text-xs font-medium text-white/70' htmlFor='add-webapp-url'>
							URL
						</label>
						<Input
							id='add-webapp-url'
							ref={inputRef}
							placeholder='https://example.com'
							value={rawUrl}
							onValueChange={setRawUrl}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && canSubmit) {
									e.preventDefault()
									void handleSubmit()
								}
							}}
						/>
						{rawUrl.trim() !== '' && !validation.ok && validation.reason ? (
							<p className='text-xs text-red-400'>{validation.reason}</p>
						) : null}
					</div>

					<PreviewCard
						loading={isFetchingMetadata}
						error={metadataError ? metadataError.message : null}
						title={metadataQ.data?.title ?? null}
						faviconUrl={metadataQ.data?.faviconUrl ?? null}
						description={metadataQ.data?.description ?? null}
						hasUrl={validation.ok}
						onRetry={() => metadataQ.refetch()}
					/>

					{(metadataLoaded || hasUsableTitle) && (
						<div className='flex flex-col gap-1.5'>
							<label className='text-xs font-medium text-white/70' htmlFor='add-webapp-title'>
								Title
							</label>
							<Input
								id='add-webapp-title'
								placeholder='Override title (optional)'
								value={manualTitle}
								onValueChange={(v: string) => {
									setManualTitle(v)
									setManualTitleTouched(true)
								}}
							/>
						</div>
					)}

					{createMut.isError ? (
						<p className='text-xs text-red-400'>
							{createMut.error?.message ?? 'Failed to add WebApp.'}
						</p>
					) : null}
				</div>

				<DialogFooter>
					<Button
						type='button'
						size='dialog'
						onClick={() => handleOpenChange(false)}
						disabled={createMut.isPending}
					>
						Cancel
					</Button>
					<Button
						type='button'
						size='dialog'
						variant='primary'
						onClick={() => void handleSubmit()}
						disabled={!canSubmit}
					>
						{createMut.isPending ? 'Adding…' : 'Add'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function PreviewCard({
	loading,
	error,
	title,
	faviconUrl,
	description,
	hasUrl,
	onRetry,
}: {
	loading: boolean
	error: string | null
	title: string | null
	faviconUrl: string | null
	description: string | null
	hasUrl: boolean
	onRetry: () => void
}) {
	if (!hasUrl) {
		return (
			<div className='rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-white/50'>
				Paste a URL above to fetch its title and icon.
			</div>
		)
	}
	if (loading) {
		return (
			<div className='flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-white/60'>
				<span className='h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white/80' aria-hidden />
				<span>Fetching site info…</span>
			</div>
		)
	}
	if (error) {
		return (
			<div className='flex items-start justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3'>
				<p className='text-xs text-red-300'>{error}</p>
				<button
					type='button'
					onClick={onRetry}
					className='text-xs font-medium text-red-200 underline-offset-2 hover:underline'
				>
					Retry
				</button>
			</div>
		)
	}
	return (
		<div className='flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3'>
			<div className='flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/10'>
				{faviconUrl ? (
					// eslint-disable-next-line jsx-a11y/alt-text
					<img
						src={faviconUrl}
						loading='lazy'
						className='h-full w-full object-cover'
						onError={(e) => {
							;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
						}}
					/>
				) : null}
			</div>
			<div className='min-w-0 flex-1'>
				<p className='truncate text-sm font-medium text-white'>{title ?? '(no title)'}</p>
				{description ? (
					<p className='mt-0.5 line-clamp-2 text-xs text-white/60'>{description}</p>
				) : null}
			</div>
		</div>
	)
}
