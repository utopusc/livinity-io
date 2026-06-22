/**
 * Phase 292 — AnnouncementHost: the box-UI surface that shows fleet
 * announcements. Reads the box-local cache via `announcements.listActive`,
 * shows the highest-priority not-yet-dismissed announcement once per session in
 * a theme-aware radix Dialog (zIndex 99999 → above the Phase-291 command bar,
 * DEC-12), renders trusted visual-builder blocks NATIVELY and the raw-HTML
 * escape hatch through the sandboxed <AnnouncementIframe> (never inline), and
 * wires dismiss/vote/feedback through the Plan-06 key-injecting tRPC mutations.
 */
import {useEffect, useRef, useState} from 'react'

import AnnouncementIframe from '@/components/announcement-iframe'
import {useTheme} from '@/hooks/use-theme'
import {Button} from '@/shadcn-components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {trpcReact} from '@/trpc/trpc'

// Block vocabulary — MUST mirror Plan 03 (platform/web announcements-api.ts).
// The box UI cannot import platform/web, so the shape is re-declared here.
type AnnouncementBlock =
	| {id: string; type: 'heading'; text: string}
	| {id: string; type: 'text'; text: string}
	| {id: string; type: 'image'; url: string; alt?: string}
	| {id: string; type: 'video'; url: string}
	| {id: string; type: 'step'; title: string; body: string}
	| {id: string; type: 'button'; label: string; href: string}
	| {id: string; type: 'poll'; question: string; options: string[]}
	| {id: string; type: 'feedback'; prompt: string}

type ActiveAnnouncement = {
	id: string
	slug: string | null
	title: string
	kind: string
	blocks: AnnouncementBlock[]
	raw_html_sanitized: string | null
	frequency: string
	frequency_n: number | null
	priority: number
	dismissible: boolean
	start_at: string | null
	end_at: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

function dayGateKey(id: string): string {
	return `livos:ann:lastShown:${id}`
}

// once_per_day: the central cap is permissive (Plan 04); the box enforces the
// 24h boundary via a per-announcement localStorage timestamp.
function isDayGated(a: ActiveAnnouncement): boolean {
	if (a.frequency !== 'once_per_day') return false
	try {
		const ts = localStorage.getItem(dayGateKey(a.id))
		if (!ts) return false
		const last = Number(ts)
		return Number.isFinite(last) && Date.now() - last < DAY_MS
	} catch {
		return false
	}
}

// Only http/https URLs are allowed for native block media (defense-in-depth
// alongside the publish-time sanitize). Anything else renders nothing.
function safeUrl(url: string): string | undefined {
	const lower = (url || '').trim().toLowerCase()
	return lower.startsWith('http://') || lower.startsWith('https://') ? url : undefined
}

export function AnnouncementHost() {
	const {resolvedTheme} = useTheme()
	const activeQ = trpcReact.announcements.listActive.useQuery(undefined, {
		refetchInterval: 60_000,
	})
	const markSeen = trpcReact.announcements.markSeen.useMutation()

	const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
	const seenFiredRef = useRef<Set<string>>(new Set())

	const list = (activeQ.data ?? []) as ActiveAnnouncement[]
	// The poll route already returns priority-ordered (priority ASC). Show the
	// first not-locally-dismissed, not-day-gated one — stacking = next-after-dismiss.
	const current = list.find((a) => a && !dismissed.has(a.id) && !isDayGated(a)) ?? null

	// Increment the central seen_count once per announcement per session when it
	// first becomes current (drives the frequency cap). Guarded by a ref so it
	// fires once, not every render.
	useEffect(() => {
		if (!current) return
		if (seenFiredRef.current.has(current.id)) return
		seenFiredRef.current.add(current.id)
		markSeen.mutate({announcement_id: current.id})
		try {
			localStorage.setItem(dayGateKey(current.id), String(Date.now()))
		} catch {
			// localStorage unavailable — ignore
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [current?.id])

	if (!current) return null

	const handleDismiss = () => {
		markSeen.mutate({announcement_id: current.id, dismissed: true})
		setDismissed((prev) => new Set(prev).add(current.id))
	}

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && current.dismissible) handleDismiss()
			}}
		>
			<DialogContent className="flex max-h-[80vh] flex-col">
				<DialogHeader>
					<DialogTitle>{current.title}</DialogTitle>
				</DialogHeader>

				<div className="min-h-0 flex-1 overflow-y-auto py-2">
					{current.raw_html_sanitized ? (
						<div className="h-[50vh] min-h-[240px] w-full">
							<AnnouncementIframe html={current.raw_html_sanitized} theme={resolvedTheme} />
						</div>
					) : (
						<div className="flex flex-col gap-3">
							{(current.blocks ?? []).map((block) => (
								<BlockView key={block.id} announcementId={current.id} block={block} />
							))}
						</div>
					)}
				</div>

				<DialogFooter>
					{current.dismissible && (
						<Button type="button" variant="default" onClick={handleDismiss}>
							Dismiss
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// ---- native (trusted) block renderer --------------------------------------

function BlockView({announcementId, block}: {announcementId: string; block: AnnouncementBlock}) {
	switch (block.type) {
		case 'heading':
			return <h2 className="text-15 font-semibold text-text-primary">{block.text}</h2>
		case 'text':
			return <p className="text-13 leading-relaxed text-text-secondary">{block.text}</p>
		case 'image': {
			const src = safeUrl(block.url)
			if (!src) return null
			// eslint-disable-next-line @next/next/no-img-element
			return <img src={src} alt={block.alt ?? ''} className="w-full rounded-8" />
		}
		case 'video': {
			const src = safeUrl(block.url)
			if (!src) return null
			return <video src={src} controls className="w-full rounded-8" />
		}
		case 'step':
			return (
				<div className="rounded-8 border border-border-default p-3">
					<div className="text-13 font-semibold text-text-primary">{block.title}</div>
					<div className="text-13 text-text-secondary">{block.body}</div>
				</div>
			)
		case 'button': {
			const href = safeUrl(block.href)
			if (!href) return null
			return (
				<a href={href} target="_blank" rel="noopener noreferrer" className="self-start">
					<Button type="button" variant="primary">
						{block.label}
					</Button>
				</a>
			)
		}
		case 'poll':
			return <PollBlock announcementId={announcementId} block={block} />
		case 'feedback':
			return <FeedbackBlock announcementId={announcementId} block={block} />
	}
}

function PollBlock({
	announcementId,
	block,
}: {
	announcementId: string
	block: Extract<AnnouncementBlock, {type: 'poll'}>
}) {
	const submitVote = trpcReact.announcements.submitVote.useMutation()
	const [choice, setChoice] = useState<string | null>(null)
	const [done, setDone] = useState(false)

	return (
		<div className="rounded-8 border border-border-default p-3">
			<div className="text-13 font-semibold text-text-primary">{block.question}</div>
			<div className="mt-2 flex flex-col gap-1.5">
				{block.options.map((opt, i) => (
					<label key={i} className="flex items-center gap-2 text-13 text-text-secondary">
						<input
							type="radio"
							name={`poll-${block.id}`}
							value={opt}
							checked={choice === opt}
							disabled={done}
							onChange={() => setChoice(opt)}
						/>
						{opt}
					</label>
				))}
			</div>
			<div className="mt-2">
				<Button
					type="button"
					variant="primary"
					size="sm"
					disabled={!choice || done || submitVote.isPending}
					onClick={() => {
						if (!choice) return
						submitVote.mutate(
							{announcement_id: announcementId, block_id: block.id, vote_option: choice},
							{onSuccess: () => setDone(true)},
						)
					}}
				>
					{done ? 'Voted ✓' : 'Vote'}
				</Button>
			</div>
		</div>
	)
}

function FeedbackBlock({
	announcementId,
	block,
}: {
	announcementId: string
	block: Extract<AnnouncementBlock, {type: 'feedback'}>
}) {
	const submitFeedback = trpcReact.announcements.submitFeedback.useMutation()
	const [text, setText] = useState('')
	const [done, setDone] = useState(false)

	return (
		<div className="rounded-8 border border-border-default p-3">
			<div className="text-13 font-semibold text-text-primary">{block.prompt}</div>
			<textarea
				className="mt-2 w-full rounded-8 border border-border-default bg-transparent p-2 text-13 text-text-primary"
				rows={3}
				maxLength={8000}
				value={text}
				disabled={done}
				onChange={(e) => setText(e.target.value)}
				placeholder="Your feedback…"
			/>
			<div className="mt-2">
				<Button
					type="button"
					variant="primary"
					size="sm"
					disabled={!text.trim() || done || submitFeedback.isPending}
					onClick={() => {
						if (!text.trim()) return
						submitFeedback.mutate(
							{announcement_id: announcementId, block_id: block.id, free_text: text.trim()},
							{onSuccess: () => setDone(true)},
						)
					}}
				>
					{done ? 'Sent ✓' : 'Send'}
				</Button>
			</div>
		</div>
	)
}
