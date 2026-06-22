/**
 * Phase 292 — AnnouncementHost: the box-UI surface that shows fleet
 * announcements. Reads the box-local cache via `announcements.listActive`,
 * shows the highest-priority not-yet-dismissed announcement once per session in
 * a theme-aware radix Dialog (zIndex 99999 → above the Phase-291 command bar,
 * DEC-12), renders trusted visual-builder blocks NATIVELY and the raw-HTML
 * escape hatch through the sandboxed <AnnouncementIframe> (never inline), and
 * wires dismiss/vote/feedback through the Plan-06 key-injecting tRPC mutations.
 */
import useEmblaCarousel from 'embla-carousel-react'
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion'
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
	| {id: string; type: 'video'; url: string; poster?: string}
	| {id: string; type: 'step'; title: string; body: string}
	| {id: string; type: 'button'; label: string; href: string; variant?: 'primary' | 'secondary'}
	| {id: string; type: 'poll'; question: string; options: string[]}
	| {id: string; type: 'feedback'; prompt: string}
	// Phase 293 (Wave 4) — mirror the platform/web union (richer layout blocks).
	| {id: string; type: 'divider'}
	| {id: string; type: 'callout'; tone: 'info' | 'warning' | 'success'; text: string}
	| {id: string; type: 'columns'; left: string; right: string}
	| {id: string; type: 'countdown'; label: string; until: string}
	| {id: string; type: 'image-carousel'; urls: string[]}

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

// Phase 293 (Wave 3) — kind-aware accent. Icon + label only; all color comes
// from design tokens (no hex) so it themes light/dark/iridescent automatically.
const KIND_META: Record<string, {icon: string; label: string}> = {
	announcement: {icon: '📣', label: 'Announcement'},
	campaign: {icon: '🎟️', label: 'Campaign'},
	promo: {icon: '🛍️', label: 'Promo'},
	feature: {icon: '✨', label: 'Feature'},
	feedback: {icon: '💬', label: 'Feedback'},
}

function kindMeta(kind: string): {icon: string; label: string} {
	return KIND_META[kind] ?? {icon: '📣', label: 'Announcement'}
}

// Callout tone → icon + left-accent token class (Wave 4). Literal class strings
// so Tailwind's JIT detects them; colors come from theme tokens (no hex).
const CALLOUT_TONE: Record<'info' | 'warning' | 'success', {icon: string; accent: string}> = {
	info: {icon: 'ℹ️', accent: 'border-l-brand'},
	warning: {icon: '⚠️', accent: 'border-l-warning'},
	success: {icon: '✅', accent: 'border-l-success'},
}

export function AnnouncementHost() {
	const {resolvedTheme} = useTheme()
	const reduce = useReducedMotion()
	const activeQ = trpcReact.announcements.listActive.useQuery(undefined, {
		refetchInterval: 60_000,
	})
	const markSeen = trpcReact.announcements.markSeen.useMutation()

	const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
	const [zoomSrc, setZoomSrc] = useState<string | null>(null)
	const seenFiredRef = useRef<Set<string>>(new Set())

	const list = (activeQ.data ?? []) as ActiveAnnouncement[]
	// The poll route returns priority-ordered (priority ASC). `queue` = everything
	// eligible to show now (not day-gated); `remaining` = still-unseen this session.
	// current = highest-priority remaining → stacking is "next after dismiss".
	const queue = list.filter((a) => a && !isDayGated(a))
	const remaining = queue.filter((a) => !dismissed.has(a.id))
	const current = remaining[0] ?? null
	const total = queue.length
	const position = current ? queue.findIndex((a) => a.id === current.id) + 1 : 0
	const moreRemain = remaining.length > 1

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
		setZoomSrc(null)
		setDismissed((prev) => new Set(prev).add(current.id))
	}

	// Entrance/exit transition for the inner content (per-announcement swap).
	// Reduced-motion → fade only, no transform.
	const enter = reduce
		? {initial: {opacity: 0}, animate: {opacity: 1}, exit: {opacity: 0}, transition: {duration: 0.15}}
		: {
				initial: {opacity: 0, y: 12, scale: 0.98},
				animate: {opacity: 1, y: 0, scale: 1},
				exit: {opacity: 0, y: -8, scale: 0.98},
				transition: {duration: 0.22, ease: 'easeOut'},
			}

	const meta = kindMeta(current.kind)

	return (
		<>
			<Dialog
				open
				onOpenChange={(open) => {
					if (!open && current.dismissible) handleDismiss()
				}}
			>
				<DialogContent className="flex max-h-[80vh] flex-col">
					<AnimatePresence mode="wait" initial={false}>
						<motion.div
							key={current.id}
							className="flex min-h-0 flex-1 flex-col"
							initial={enter.initial}
							animate={enter.animate}
							exit={enter.exit}
							transition={enter.transition}
						>
							<DialogHeader>
								<div className="flex items-center justify-between gap-2">
									<span className="inline-flex items-center gap-1.5 rounded-full border border-border-default px-2 py-0.5 text-12 text-text-secondary">
										<span aria-hidden="true">{meta.icon}</span>
										{meta.label}
									</span>
									{total > 1 && (
										<span
											className="text-12 text-text-secondary"
											aria-label={`Announcement ${position} of ${total}`}
										>
											{position} of {total}
										</span>
									)}
								</div>
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
											<BlockView
												key={block.id}
												announcementId={current.id}
												block={block}
												onZoom={setZoomSrc}
											/>
										))}
									</div>
								)}
							</div>

							<DialogFooter>
								{current.dismissible && (
									<Button type="button" variant="default" onClick={handleDismiss}>
										{moreRemain ? 'Next →' : 'Dismiss'}
									</Button>
								)}
							</DialogFooter>
						</motion.div>
					</AnimatePresence>
				</DialogContent>
			</Dialog>

			{/* Image lightbox (Wave 3) — sits above the dialog (zIndex 99999). Colors
			    are rgba/tokens only (no hex). Click anywhere to close. */}
			{zoomSrc && (
				<div
					role="dialog"
					aria-label="Image preview"
					onClick={() => setZoomSrc(null)}
					style={{
						position: 'fixed',
						inset: 0,
						zIndex: 100000,
						background: 'rgba(0,0,0,0.85)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						padding: 24,
						cursor: 'zoom-out',
					}}
				>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={zoomSrc} alt="" style={{maxWidth: '100%', maxHeight: '100%', borderRadius: 8}} />
				</div>
			)}
		</>
	)
}

// ---- native (trusted) block renderer --------------------------------------

function BlockView({
	announcementId,
	block,
	onZoom,
}: {
	announcementId: string
	block: AnnouncementBlock
	onZoom?: (src: string) => void
}) {
	switch (block.type) {
		case 'heading':
			return <h2 className="text-15 font-semibold text-text-primary">{block.text}</h2>
		case 'text':
			return <p className="text-13 leading-relaxed text-text-secondary">{block.text}</p>
		case 'image': {
			const src = safeUrl(block.url)
			if (!src) return null
			return (
				<button
					type="button"
					onClick={() => onZoom?.(src)}
					className="block w-full border-0 bg-transparent p-0 text-left"
					style={{cursor: 'zoom-in'}}
					aria-label={block.alt || 'Enlarge image'}
				>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={src} alt={block.alt ?? ''} className="w-full rounded-8" />
				</button>
			)
		}
		case 'video': {
			const src = safeUrl(block.url)
			if (!src) return null
			const poster = block.poster ? safeUrl(block.poster) : undefined
			return <video src={src} poster={poster} controls className="w-full rounded-8" />
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
			const variant = block.variant === 'secondary' ? 'secondary' : 'primary'
			return (
				<a href={href} target="_blank" rel="noopener noreferrer" className="self-start">
					<Button type="button" variant={variant}>
						{block.label}
					</Button>
				</a>
			)
		}
		case 'poll':
			return <PollBlock announcementId={announcementId} block={block} />
		case 'feedback':
			return <FeedbackBlock announcementId={announcementId} block={block} />
		case 'divider':
			return <hr className="border-0 border-t border-border-default" />
		case 'callout': {
			const tone = CALLOUT_TONE[block.tone] ?? CALLOUT_TONE.info
			return (
				<div className={`flex gap-2 rounded-8 border-l-4 ${tone.accent} bg-surface-1 p-3`}>
					<span aria-hidden="true">{tone.icon}</span>
					<div className="text-13 text-text-primary">{block.text}</div>
				</div>
			)
		}
		case 'columns':
			return (
				<div className="flex flex-col gap-3 sm:flex-row">
					<p className="flex-1 text-13 leading-relaxed text-text-secondary">{block.left}</p>
					<p className="flex-1 text-13 leading-relaxed text-text-secondary">{block.right}</p>
				</div>
			)
		case 'countdown':
			return <CountdownBlock block={block} />
		case 'image-carousel':
			return <CarouselBlock block={block} />
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

// Live countdown (Wave 4). Ticks once a second on the box; shows a friendly
// "It's here" state once the target passes. Tokens only (no hex).
function CountdownBlock({block}: {block: Extract<AnnouncementBlock, {type: 'countdown'}>}) {
	const [now, setNow] = useState(() => Date.now())
	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(t)
	}, [])

	const target = new Date(block.until).getTime()
	const valid = Number.isFinite(target)
	const diff = valid ? Math.max(0, target - now) : 0
	const ended = valid && diff === 0
	const s = Math.floor(diff / 1000)
	const parts = [
		{label: 'days', value: Math.floor(s / 86400)},
		{label: 'hrs', value: Math.floor((s % 86400) / 3600)},
		{label: 'min', value: Math.floor((s % 3600) / 60)},
		{label: 'sec', value: s % 60},
	]

	return (
		<div className="rounded-8 border border-border-default p-3 text-center">
			<div className="text-13 font-semibold text-text-primary">{block.label}</div>
			{!valid ? (
				<div className="mt-1 text-13 text-text-secondary">—</div>
			) : ended ? (
				<div className="mt-1 text-15 font-semibold text-text-primary">It&rsquo;s here 🎉</div>
			) : (
				<div className="mt-2 flex items-center justify-center gap-3">
					{parts.map((p) => (
						<div key={p.label} className="flex flex-col items-center">
							<span className="text-15 font-semibold tabular-nums text-text-primary">
								{String(p.value).padStart(2, '0')}
							</span>
							<span className="text-12 uppercase text-text-secondary">{p.label}</span>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

// Image carousel (Wave 4). embla-carousel-react for native swipe/drag + a gentle
// 4s auto-advance (no extra autoplay plugin needed). Only http(s) URLs render.
function CarouselBlock({block}: {block: Extract<AnnouncementBlock, {type: 'image-carousel'}>}) {
	const reduce = useReducedMotion()
	const [emblaRef, emblaApi] = useEmblaCarousel({loop: true})
	useEffect(() => {
		// WCAG 2.2.2 — skip the auto-advance when the user prefers reduced motion
		// (manual swipe/drag still works).
		if (!emblaApi || reduce) return
		const t = setInterval(() => emblaApi.scrollNext(), 4000)
		return () => clearInterval(t)
	}, [emblaApi, reduce])

	const urls = (block.urls ?? []).map((u) => safeUrl(u)).filter((u): u is string => !!u)
	if (urls.length === 0) return null

	return (
		<div className="overflow-hidden rounded-8" ref={emblaRef}>
			<div className="flex">
				{urls.map((u, i) => (
					<div className="min-w-0 flex-[0_0_100%]" key={i}>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src={u} alt="" className="w-full rounded-8" />
					</div>
				))}
			</div>
		</div>
	)
}
