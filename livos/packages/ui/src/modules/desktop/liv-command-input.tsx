import {useEffect, useMemo, useRef, useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {ArrowUp, ChevronDown, Map, Plus, Shield, Sparkles, X, Zap} from 'lucide-react'

import {cn} from '@/shadcn-lib/utils'

/**
 * LivCommandInput — the in-navbar Liv AI command composer.
 *
 * Clicking the LivOS logo morphs the top bar (same pill, same place) into this
 * input so the operator can fire a command at Liv without opening a window —
 * modelled on the aionUI composer:
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ (+)  Ask Liv to do anything…            [Anthropic][Opus][Ask] (↑) │
 *   └──────────────────────────────────────────────────────────────────┘
 *   left  — `+` (attach / add context)
 *   center— the prompt textarea (grows to fit, capped)
 *   right — provider · model · permission-mode selectors + send
 *
 * UI-FIRST: every selector + the send/attach actions are presentational stubs
 * (local state + onSubmit callback). Wiring to the real Liv runtime (provider
 * registry, model list, permission engine, message dispatch) comes in a follow
 * -up — the operator asked to land the look + interaction first.
 */

export interface LivProvider {
	id: string
	label: string
}
export interface LivModel {
	id: string
	label: string
}
export interface LivPermissionMode {
	id: string
	label: string
	hint: string
	icon: typeof Shield
}

// Placeholder catalogs (UI-first). Replace with the live provider/model registry
// + the permission engine's modes when wiring the functionality.
export const LIV_PROVIDERS: LivProvider[] = [
	{id: 'anthropic', label: 'Anthropic'},
	{id: 'openai', label: 'OpenAI'},
	{id: 'google', label: 'Google'},
	{id: 'local', label: 'Local'},
]

export const LIV_MODELS: Record<string, LivModel[]> = {
	anthropic: [
		{id: 'opus-4-8', label: 'Opus 4.8'},
		{id: 'sonnet-4-6', label: 'Sonnet 4.6'},
		{id: 'haiku-4-5', label: 'Haiku 4.5'},
	],
	openai: [
		{id: 'gpt-5', label: 'GPT-5'},
		{id: 'gpt-5-mini', label: 'GPT-5 mini'},
	],
	google: [{id: 'gemini-2', label: 'Gemini 2'}],
	local: [{id: 'llama-3', label: 'Llama 3'}],
}

export const LIV_PERMISSION_MODES: LivPermissionMode[] = [
	{id: 'ask', label: 'Ask first', hint: 'Confirm each action', icon: Shield},
	{id: 'auto', label: 'Auto-accept', hint: 'Run edits without asking', icon: Zap},
	{id: 'plan', label: 'Plan only', hint: 'Propose a plan, no changes', icon: Map},
]

// ── Generic chip dropdown ────────────────────────────────────────────────────

function SelectorChip({
	label,
	value,
	icon,
	options,
	onSelect,
	align = 'right',
}: {
	label: string
	value: string
	icon?: React.ReactNode
	options: {id: string; label: string; hint?: string; icon?: typeof Shield}[]
	onSelect: (id: string) => void
	align?: 'left' | 'right'
}) {
	const [open, setOpen] = useState(false)
	const wrapRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!open) return
		const onDown = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
		}
		document.addEventListener('mousedown', onDown)
		return () => document.removeEventListener('mousedown', onDown)
	}, [open])

	return (
		<div ref={wrapRef} className='relative shrink-0'>
			<button
				type='button'
				onClick={() => setOpen((v) => !v)}
				title={label}
				aria-label={label}
				aria-haspopup='menu'
				aria-expanded={open}
				className={cn(
					'inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11.5px] font-medium text-[color:var(--fg-dim)] transition-colors hover:border-line-strong hover:bg-[color:var(--bg-2)] hover:text-[color:var(--fg)]',
					open && 'border-line-strong bg-[color:var(--bg-2)] text-[color:var(--fg)]',
				)}
			>
				{icon}
				<span className='max-w-[110px] truncate'>{value}</span>
				<ChevronDown className='h-3 w-3 opacity-60' />
			</button>

			<AnimatePresence>
				{open && (
					<motion.div
						initial={{opacity: 0, y: 6, scale: 0.97}}
						animate={{opacity: 1, y: 0, scale: 1}}
						exit={{opacity: 0, y: 6, scale: 0.97}}
						transition={{duration: 0.12}}
						className={cn(
							'absolute top-[calc(100%+8px)] z-50 w-52 overflow-hidden rounded-2xl border border-line bg-card-bg py-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.4)] backdrop-blur-2xl',
							align === 'right' ? 'right-0' : 'left-0',
						)}
						role='menu'
					>
						<div className='px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--fg-faint)]'>
							{label}
						</div>
						{options.map((opt) => {
							const OptIcon = opt.icon
							const active = opt.label === value
							return (
								<button
									key={opt.id}
									type='button'
									role='menuitem'
									onClick={() => {
										onSelect(opt.id)
										setOpen(false)
									}}
									className={cn(
										'flex w-full items-center gap-2.5 px-3 py-[7px] text-left text-[13px] transition-colors',
										active
											? 'text-[color:var(--fg)]'
											: 'text-[color:var(--fg-dim)] hover:bg-[color:var(--bg-2)] hover:text-[color:var(--fg)]',
									)}
								>
									{OptIcon ? <OptIcon className='h-[15px] w-[15px] shrink-0 opacity-80' /> : null}
									<span className='min-w-0 flex-1'>
										<span className='block truncate font-medium'>{opt.label}</span>
										{opt.hint ? (
											<span className='block truncate text-[11px] text-[color:var(--fg-faint)]'>
												{opt.hint}
											</span>
										) : null}
									</span>
									{active ? <span className='h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--fg)]' /> : null}
								</button>
							)
						})}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}

// ── The composer ─────────────────────────────────────────────────────────────

export function LivCommandInput({
	onClose,
	onSubmit,
	autoFocus = true,
}: {
	onClose: () => void
	/** Stubbed for now — fired on Enter / send-button with the prompt + settings. */
	onSubmit?: (payload: {prompt: string; provider: string; model: string; permission: string}) => void
	autoFocus?: boolean
}) {
	const [prompt, setPrompt] = useState('')
	const [providerId, setProviderId] = useState(LIV_PROVIDERS[0].id)
	const [permissionId, setPermissionId] = useState(LIV_PERMISSION_MODES[0].id)
	const inputRef = useRef<HTMLTextAreaElement>(null)

	const models = LIV_MODELS[providerId] ?? []
	const [modelId, setModelId] = useState(models[0]?.id ?? '')

	// Keep the model valid when the provider changes.
	useEffect(() => {
		const next = LIV_MODELS[providerId] ?? []
		if (!next.some((m) => m.id === modelId)) setModelId(next[0]?.id ?? '')
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [providerId])

	useEffect(() => {
		if (autoFocus) inputRef.current?.focus()
	}, [autoFocus])

	// Escape closes the composer (returns the bar to its normal state).
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [onClose])

	const providerLabel = useMemo(
		() => LIV_PROVIDERS.find((p) => p.id === providerId)?.label ?? providerId,
		[providerId],
	)
	const modelLabel = useMemo(() => models.find((m) => m.id === modelId)?.label ?? '—', [models, modelId])
	const permission = LIV_PERMISSION_MODES.find((m) => m.id === permissionId) ?? LIV_PERMISSION_MODES[0]

	const canSend = prompt.trim().length > 0

	const submit = () => {
		if (!canSend) return
		onSubmit?.({prompt: prompt.trim(), provider: providerId, model: modelId, permission: permissionId})
		setPrompt('')
	}

	const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			submit()
		}
	}

	return (
		<div className='flex h-full w-full items-center gap-2 pl-1 pr-1'>
			{/* Left — add context / attach (stub). */}
			<button
				type='button'
				title='Add context'
				aria-label='Add context'
				className='grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-[color:var(--fg-dim)] transition-colors hover:border-line-strong hover:bg-[color:var(--bg-2)] hover:text-[color:var(--fg)]'
			>
				<Plus className='h-4 w-4' />
			</button>

			{/* Liv mark — a small sparkle so the input reads as "talking to Liv". */}
			<Sparkles className='h-4 w-4 shrink-0 text-[color:var(--fg-faint)]' aria-hidden />

			{/* Center — the prompt. A textarea so long prompts wrap, but capped to
			    one-ish line height inside the pill (auto-grow deferred). */}
			<textarea
				ref={inputRef}
				rows={1}
				value={prompt}
				onChange={(e) => setPrompt(e.target.value)}
				onKeyDown={onKeyDown}
				placeholder='Ask Liv to do anything…'
				className='h-7 min-w-0 flex-1 resize-none self-center bg-transparent text-[14px] leading-7 text-[color:var(--fg)] placeholder:text-[color:var(--fg-faint)] focus:outline-none'
			/>

			{/* Right — provider · model · permission selectors. */}
			<SelectorChip
				label='Provider'
				value={providerLabel}
				options={LIV_PROVIDERS}
				onSelect={setProviderId}
			/>
			<SelectorChip
				label='Model'
				value={modelLabel}
				options={models}
				onSelect={setModelId}
			/>
			<SelectorChip
				label='Permission'
				value={permission.label}
				icon={<permission.icon className='h-3.5 w-3.5 opacity-80' />}
				options={LIV_PERMISSION_MODES}
				onSelect={setPermissionId}
			/>

			{/* Send. */}
			<button
				type='button'
				onClick={submit}
				disabled={!canSend}
				title='Send to Liv (Enter)'
				aria-label='Send to Liv'
				className={cn(
					'grid h-8 w-8 shrink-0 place-items-center rounded-full transition-all',
					canSend
						? 'bg-[color:var(--fg)] text-[color:var(--bg)] hover:opacity-90'
						: 'cursor-not-allowed bg-[color:var(--bg-2)] text-[color:var(--fg-faint)]',
				)}
			>
				<ArrowUp className='h-4 w-4' />
			</button>

			{/* Close — return the bar to normal (also Escape). */}
			<button
				type='button'
				onClick={onClose}
				title='Close (Esc)'
				aria-label='Close command bar'
				className='grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--fg-faint)] transition-colors hover:bg-[color:var(--bg-2)] hover:text-[color:var(--fg)]'
			>
				<X className='h-4 w-4' />
			</button>
		</div>
	)
}

// ── Liv command-bar state machine ────────────────────────────────────────────
//
//   idle ──click──▶ compose ──send──▶ working ──(done)──▶ done ──click──▶ answer
//     ▲                │                  (logo spins)      (badge)         │
//     └────────────────┴──────────────── close / Esc ──────────────────────┘
//
// All five states live in top-bar.tsx; the pieces below render them. Every
// colour is a theme CSS var (or emerald, legible on both) → dark/light safe.
export type LivState = 'idle' | 'compose' | 'working' | 'done' | 'answer'

/**
 * LivBrandMarkInner — the animated donut VISUALS (working halo + donut +
 * done-dot) with NO button wrapper, so it drops inside the existing top-bar logo
 * button (which owns hover/aria/onClick). The parent must be `relative` — the
 * halo fills it and the dot sits on its corner.
 *   • idle   — static donut.
 *   • working— a conic-gradient halo rotates + the donut "breathes" (busy).
 *   • done   — a pulsing emerald notification dot.
 */
export function LivBrandMarkInner({state, donutSize = 24}: {state: LivState; donutSize?: number}) {
	const working = state === 'working'
	const done = state === 'done'
	return (
		<>
			{/* Working halo — a rotating conic-gradient ring (masked to a thin band). */}
			<AnimatePresence>
				{working && (
					<motion.span
						key='halo'
						initial={{opacity: 0, scale: 0.82}}
						animate={{opacity: 1, scale: 1, rotate: 360}}
						exit={{opacity: 0, scale: 0.82}}
						transition={{
							rotate: {repeat: Infinity, ease: 'linear', duration: 1.4},
							opacity: {duration: 0.2},
							scale: {duration: 0.2},
						}}
						className='pointer-events-none absolute inset-0 rounded-full'
						style={{
							background:
								'conic-gradient(from 0deg, transparent 0deg, var(--accent, #6366f1) 280deg, transparent 360deg)',
							WebkitMask:
								'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))',
							mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))',
						}}
					/>
				)}
			</AnimatePresence>

			{/* The donut mark — gently breathes while working. */}
			<motion.span
				aria-hidden='true'
				animate={working ? {scale: [1, 0.84, 1]} : {scale: 1}}
				transition={working ? {repeat: Infinity, duration: 1.4, ease: 'easeInOut'} : {duration: 0.2}}
				className='relative inline-block rounded-full bg-[color:var(--fg)]'
				style={{height: donutSize, width: donutSize}}
			>
				<span className='absolute rounded-full bg-[color:var(--bg)]' style={{inset: donutSize * 0.29}} />
			</motion.span>

			{/* Done — pulsing emerald notification dot (legible on dark + light). */}
			<AnimatePresence>
				{done && (
					<motion.span
						key='dot'
						initial={{scale: 0, opacity: 0}}
						animate={{scale: 1, opacity: 1}}
						exit={{scale: 0, opacity: 0}}
						transition={{type: 'spring', stiffness: 500, damping: 20}}
						className='absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[color:var(--bg)] bg-emerald-500'
					>
						<motion.span
							className='absolute -inset-px rounded-full bg-emerald-500'
							animate={{scale: [1, 2], opacity: [0.55, 0]}}
							transition={{repeat: Infinity, duration: 1.6, ease: 'easeOut'}}
						/>
					</motion.span>
				)}
			</AnimatePresence>
		</>
	)
}

/**
 * LivBrandMark — standalone animated logo button (used by the harness preview).
 * top-bar.tsx renders LivBrandMarkInner inside its EXISTING logo button instead.
 */
export function LivBrandMark({
	state,
	onClick,
	size = 40,
}: {
	state: LivState
	onClick?: () => void
	size?: number
}) {
	const working = state === 'working'
	const done = state === 'done'
	return (
		<button
			type='button'
			onClick={onClick}
			aria-label={working ? 'Liv is working' : done ? 'Liv has a response' : 'Open Liv'}
			title={working ? 'Liv is working…' : done ? 'Liv has a response — click to read' : 'Ask Liv'}
			className='relative grid cursor-pointer place-items-center rounded-full transition-[transform,background] duration-200 ease-out hover:scale-110 hover:bg-[color:var(--bg-2)]'
			style={{height: size, width: size}}
		>
			<LivBrandMarkInner state={state} donutSize={size * 0.6} />
		</button>
	)
}

/**
 * LivAnswerView — the in-bar summary shown in the `answer` state: the prompt
 * (muted) over Liv's reply (one line), with "Ask again" + close. The full reply
 * drops in a panel below the bar (LivAnswerPanel) — "same place" as requested.
 */
export function LivAnswerView({
	prompt,
	answer,
	onAskAgain,
	onClose,
}: {
	prompt: string
	answer: string | null
	onAskAgain: () => void
	onClose: () => void
}) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [onClose])

	return (
		<div className='flex h-full w-full items-center gap-3 pl-2 pr-1'>
			<Sparkles className='h-4 w-4 shrink-0 text-[color:var(--accent,#6366f1)]' aria-hidden />
			<div className='min-w-0 flex-1 leading-tight'>
				<div className='truncate text-[11px] text-[color:var(--fg-faint)]'>{prompt}</div>
				<div className='truncate text-[13.5px] font-medium text-[color:var(--fg)]'>
					{answer ?? '—'}
				</div>
			</div>
			<button
				type='button'
				onClick={onAskAgain}
				className='shrink-0 rounded-full border border-line px-3 py-1 text-[12px] font-medium text-[color:var(--fg-dim)] transition-colors hover:border-line-strong hover:bg-[color:var(--bg-2)] hover:text-[color:var(--fg)]'
			>
				Ask again
			</button>
			<button
				type='button'
				onClick={onClose}
				title='Close (Esc)'
				aria-label='Close'
				className='grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--fg-faint)] transition-colors hover:bg-[color:var(--bg-2)] hover:text-[color:var(--fg)]'
			>
				<X className='h-4 w-4' />
			</button>
		</div>
	)
}

/**
 * LivAnswerPanel — the full reply, dropped in a card directly BELOW the bar so
 * the answer reads "in the same place". Theme-adaptive (bg-card-bg + tokens).
 */
export function LivAnswerPanel({prompt, answer}: {prompt: string; answer: string}) {
	return (
		<div className='w-[min(720px,calc(100vw-48px))] overflow-hidden rounded-3xl border border-line bg-card-bg/95 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.5)] backdrop-blur-2xl'>
			<div className='flex items-center gap-2 border-b border-line px-5 py-3'>
				<Sparkles className='h-3.5 w-3.5 text-[color:var(--accent,#6366f1)]' aria-hidden />
				<span className='truncate text-[12px] text-[color:var(--fg-mute)]'>{prompt}</span>
			</div>
			<div className='max-h-[46vh] overflow-y-auto px-5 py-4 text-[14px] leading-relaxed text-[color:var(--fg)]'>
				{answer.split('\n').map((line, i) => (
					<p key={i} className={line.trim() ? 'mb-2' : 'mb-2 h-2'}>
						{line}
					</p>
				))}
			</div>
		</div>
	)
}
