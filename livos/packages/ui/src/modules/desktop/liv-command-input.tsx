import {useEffect, useMemo, useRef, useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {ArrowUp, ArrowUpRight, Blocks, ChevronDown, Map, Pencil, Plus, Shield, Sparkles, Upload, X, Zap} from 'lucide-react'

import {cn} from '@/shadcn-lib/utils'

import {useLivAgents} from './use-liv-agents'
import {getLivMcpServers, listLivSkills, uploadLivFile, type LivMcpServer, type LivSkill} from './liv-command-aionui'

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
 * Phase 291 — wired to AionUi (the live Liv): the Agent + Model selectors come
 * from /liv/api/agents (handshake.available_models); Permission is AionUi's real
 * per-conversation mode; the "+" menu does file upload + skill injection. Dispatch
 * streams the reply from AionUi's chat WebSocket (liv-command-aionui.ts).
 */

export interface LivPermissionMode {
	id: 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions'
	label: string
	hint: string
	icon: typeof Shield
}

// Phase 291 — AionUi's REAL permission modes for the Claude Code backend (set
// per-conversation via config-options, best-effort on a new session). The plan's
// claim that "Plan does not exist" was about the deleted native path, not AionUi.
// Confirmations that still fire route to the "Open in Liv" escape hatch.
export const LIV_PERMISSION_MODES: LivPermissionMode[] = [
	{id: 'default', label: 'Default', hint: 'Ask before actions', icon: Shield},
	{id: 'plan', label: 'Plan', hint: 'Read-only — propose a plan', icon: Map},
	{id: 'acceptEdits', label: 'Accept edits', hint: 'Auto-approve edits, ask for commands', icon: Pencil},
	{id: 'bypassPermissions', label: 'Auto-run', hint: 'Approve every action (YOLO)', icon: Zap},
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

// ── "+" add-context menu (Upload from device · Skills · MCP) ──────────────────
// Mirrors AionUi's composer "+" menu. File upload is real (POST /liv/api/fs/upload
// → path → sendMessage files); Skills toggle real (inject_skills); MCP is an
// informational count (display-only in AionUi too).

function LivPlusMenu({
	files,
	onAddFiles,
	onRemoveFile,
	selectedSkills,
	onToggleSkill,
}: {
	files: {name: string; path: string}[]
	onAddFiles: (added: {name: string; path: string}[]) => void
	onRemoveFile: (path: string) => void
	selectedSkills: string[]
	onToggleSkill: (name: string) => void
}) {
	const [open, setOpen] = useState(false)
	const [skills, setSkills] = useState<LivSkill[]>([])
	const [mcp, setMcp] = useState<LivMcpServer[]>([])
	const [loaded, setLoaded] = useState(false)
	const [uploading, setUploading] = useState(false)
	const wrapRef = useRef<HTMLDivElement>(null)
	const fileRef = useRef<HTMLInputElement>(null)

	// Lazy-load skills + MCP the first time the menu opens (cheap; box-only).
	useEffect(() => {
		if (!open || loaded) return
		setLoaded(true)
		let cancelled = false
		void listLivSkills()
			.then((r) => !cancelled && setSkills(r))
			.catch(() => !cancelled && setSkills([]))
		void getLivMcpServers()
			.then((r) => !cancelled && setMcp(r))
			.catch(() => !cancelled && setMcp([]))
		return () => {
			cancelled = true
		}
	}, [open, loaded])

	useEffect(() => {
		if (!open) return
		const onDown = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
		}
		document.addEventListener('mousedown', onDown)
		return () => document.removeEventListener('mousedown', onDown)
	}, [open])

	const onPick = async (list: FileList | null) => {
		if (!list || list.length === 0) return
		setUploading(true)
		const added: {name: string; path: string}[] = []
		for (const f of Array.from(list)) {
			const path = await uploadLivFile(f)
			if (path) added.push({name: f.name, path})
		}
		setUploading(false)
		if (added.length) onAddFiles(added)
	}

	const mcpEnabled = mcp.filter((m) => m.enabled).length
	const badge = files.length + selectedSkills.length

	return (
		<div ref={wrapRef} className='relative shrink-0'>
			<input
				ref={fileRef}
				type='file'
				multiple
				className='hidden'
				onChange={(e) => {
					void onPick(e.target.files)
					e.target.value = ''
				}}
			/>
			<button
				type='button'
				onClick={() => setOpen((v) => !v)}
				title='Add context'
				aria-label='Add context'
				aria-haspopup='menu'
				aria-expanded={open}
				className={cn(
					'relative grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-[color:var(--fg-dim)] transition-colors hover:border-line-strong hover:bg-[color:var(--bg-2)] hover:text-[color:var(--fg)]',
					open && 'border-line-strong bg-[color:var(--bg-2)] text-[color:var(--fg)]',
				)}
			>
				<Plus className='h-4 w-4' />
				{badge > 0 && (
					<span className='absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[color:var(--accent,#6366f1)] px-1 text-[9px] font-semibold leading-none text-white'>
						{badge}
					</span>
				)}
			</button>

			<AnimatePresence>
				{open && (
					<motion.div
						initial={{opacity: 0, y: 6, scale: 0.97}}
						animate={{opacity: 1, y: 0, scale: 1}}
						exit={{opacity: 0, y: 6, scale: 0.97}}
						transition={{duration: 0.12}}
						className='absolute left-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-2xl border border-line bg-card-bg py-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.4)] backdrop-blur-2xl'
						role='menu'
					>
						{/* Upload from device */}
						<button
							type='button'
							role='menuitem'
							onClick={() => fileRef.current?.click()}
							className='flex w-full items-center gap-2.5 px-3 py-[7px] text-left text-[13px] text-[color:var(--fg-dim)] transition-colors hover:bg-[color:var(--bg-2)] hover:text-[color:var(--fg)]'
						>
							<Upload className='h-[15px] w-[15px] shrink-0 opacity-80' />
							<span className='flex-1'>{uploading ? 'Uploading…' : 'Upload from device'}</span>
						</button>

						{files.length > 0 && (
							<div className='px-3 py-1'>
								{files.map((f) => (
									<div key={f.path} className='flex items-center gap-2 py-0.5 text-[12px] text-[color:var(--fg-dim)]'>
										<span className='min-w-0 flex-1 truncate'>{f.name}</span>
										<button
											type='button'
											onClick={() => onRemoveFile(f.path)}
											aria-label={`Remove ${f.name}`}
											className='shrink-0 text-[color:var(--fg-faint)] hover:text-red-500'
										>
											<X className='h-3 w-3' />
										</button>
									</div>
								))}
							</div>
						)}

						<div className='my-1 h-px bg-line' />

						{/* Skills (selected/total) — toggling injects them for the next turn. */}
						<div className='px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--fg-faint)]'>
							Skills{skills.length > 0 ? ` (${selectedSkills.length}/${skills.length})` : ''}
						</div>
						{skills.length === 0 ? (
							<div className='px-3 pb-1.5 text-[12px] text-[color:var(--fg-faint)]'>None available</div>
						) : (
							<div className='max-h-40 overflow-y-auto'>
								{skills.map((s) => {
									const on = selectedSkills.includes(s.name)
									return (
										<button
											key={s.name}
											type='button'
											role='menuitemcheckbox'
											aria-checked={on}
											onClick={() => onToggleSkill(s.name)}
											className='flex w-full items-center gap-2.5 px-3 py-[6px] text-left text-[13px] transition-colors hover:bg-[color:var(--bg-2)]'
										>
											<span
												className={cn(
													'grid h-3.5 w-3.5 shrink-0 place-items-center rounded border text-[9px] leading-none',
													on
														? 'border-[color:var(--accent,#6366f1)] bg-[color:var(--accent,#6366f1)] text-white'
														: 'border-line',
												)}
											>
												{on ? '✓' : ''}
											</span>
											<span className='min-w-0 flex-1 truncate text-[color:var(--fg-dim)]'>{s.name}</span>
										</button>
									)
								})}
							</div>
						)}

						<div className='my-1 h-px bg-line' />

						{/* MCP — informational count (display-only in AionUi). */}
						<div className='flex items-center gap-2.5 px-3 py-[7px] text-[13px] text-[color:var(--fg-faint)]'>
							<Blocks className='h-[15px] w-[15px] shrink-0 opacity-80' />
							<span className='flex-1'>MCP</span>
							<span className='tabular-nums text-[12px]'>
								{mcpEnabled}/{mcp.length}
							</span>
						</div>
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
	/** Fired on Enter / send with the prompt + agent + model + mode + files + skills. */
	onSubmit?: (payload: {
		prompt: string
		agentId: string | undefined
		modelId: string | undefined
		mode: LivPermissionMode['id']
		files: string[]
		injectSkills: string[]
	}) => void
	autoFocus?: boolean
}) {
	const [prompt, setPrompt] = useState('')
	const [permissionId, setPermissionId] = useState<LivPermissionMode['id']>(LIV_PERMISSION_MODES[0].id)
	const inputRef = useRef<HTMLTextAreaElement>(null)

	// Live agent list from AionUi (the real "which AI" selector). Empty when the
	// backend isn't reachable (dev / cold box) → the chip is hidden and dispatch
	// uses AionUi's configured default agent.
	const {agents} = useLivAgents(true)
	const [agentId, setAgentId] = useState<string>('')
	const [modelId, setModelId] = useState<string>('') // '' = the agent's Default Model
	const agent = useMemo(() => agents.find((a) => a.id === agentId), [agents, agentId])
	// Default to the first agent once the list resolves; reset the model whenever
	// the agent changes (each agent has its own model list).
	useEffect(() => {
		if (!agentId && agents.length > 0) setAgentId(agents[0].id)
	}, [agents, agentId])
	useEffect(() => {
		setModelId('')
	}, [agentId])

	// "+" menu — files uploaded + skills selected for the next message.
	const [files, setFiles] = useState<{name: string; path: string}[]>([])
	const [selectedSkills, setSelectedSkills] = useState<string[]>([])

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

	const agentLabel = agent?.name ?? 'Liv'
	const models = agent?.models ?? []
	const modelLabel = useMemo(() => models.find((m) => m.id === modelId)?.label ?? 'Default', [models, modelId])
	// A leading "Default" entry = the agent's own default model (omit the id).
	const modelOptions = useMemo(
		() => [{id: '', label: 'Default'}, ...models.map((m) => ({id: m.id, label: m.label}))],
		[models],
	)
	const permission = LIV_PERMISSION_MODES.find((m) => m.id === permissionId) ?? LIV_PERMISSION_MODES[0]

	const canSend = prompt.trim().length > 0

	const submit = () => {
		if (!canSend) return
		onSubmit?.({
			prompt: prompt.trim(),
			agentId: agentId || undefined,
			modelId: modelId || undefined,
			mode: permissionId,
			files: files.map((f) => f.path),
			injectSkills: selectedSkills,
		})
		setPrompt('')
		setFiles([])
		setSelectedSkills([])
	}

	const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			submit()
		}
	}

	return (
		<div className='flex h-full w-full items-center gap-2 pl-1 pr-1'>
			{/* Left — "+" add-context menu (upload · skills · MCP). */}
			<LivPlusMenu
				files={files}
				onAddFiles={(added) =>
					setFiles((f) => [...f, ...added.filter((a) => !f.some((x) => x.path === a.path))])
				}
				onRemoveFile={(path) => setFiles((f) => f.filter((x) => x.path !== path))}
				selectedSkills={selectedSkills}
				onToggleSkill={(name) =>
					setSelectedSkills((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]))
				}
			/>

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

			{/* Right — agent · model · permission selectors. Agent + Model only render
			    when AionUi returned data; otherwise dispatch uses the defaults. */}
			{agents.length > 0 ? (
				<SelectorChip
					label='Agent'
					value={agentLabel}
					options={agents.map((a) => ({id: a.id, label: a.name}))}
					onSelect={setAgentId}
				/>
			) : null}
			{models.length > 0 ? (
				<SelectorChip label='Model' value={modelLabel} options={modelOptions} onSelect={setModelId} />
			) : null}
			<SelectorChip
				label='Permission'
				value={permission.label}
				icon={<permission.icon className='h-3.5 w-3.5 opacity-80' />}
				options={LIV_PERMISSION_MODES}
				onSelect={(id) => setPermissionId(id as LivPermissionMode['id'])}
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
			{/* The donut mark IS the working indicator — it pulses (breathes) while
			    Liv works. The old rotating conic-gradient halo was removed per
			    operator: "sadece logo oynasa daha iyi olur". */}
			<motion.span
				aria-hidden='true'
				animate={working ? {scale: [1, 0.8, 1], opacity: [1, 0.65, 1]} : {scale: 1, opacity: 1}}
				transition={working ? {repeat: Infinity, duration: 1.2, ease: 'easeInOut'} : {duration: 0.2}}
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
	onOpenInLiv,
}: {
	prompt: string
	answer: string | null
	onAskAgain: () => void
	onClose: () => void
	/** Open the full Liv (AionUi) window — escape hatch for tool/approval flows. */
	onOpenInLiv?: () => void
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
			{onOpenInLiv ? (
				<button
					type='button'
					onClick={onOpenInLiv}
					title='Open the full Liv window'
					className='inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-3 py-1 text-[12px] font-medium text-[color:var(--fg-dim)] transition-colors hover:border-line-strong hover:bg-[color:var(--bg-2)] hover:text-[color:var(--fg)]'
				>
					Open in Liv
					<ArrowUpRight className='h-3.5 w-3.5' />
				</button>
			) : null}
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
export function LivAnswerPanel({
	turns,
	working,
	onOpenInLiv,
}: {
	/** The session transcript — every Q&A turn so far (answer lives ONLY here). */
	turns: Array<{prompt: string; answer: string}>
	/** The last turn is still streaming. */
	working?: boolean
	/** Open the full Liv (AionUi) window to continue the conversation / approve tools. */
	onOpenInLiv?: () => void
}) {
	return (
		<div className='w-[min(720px,calc(100vw-48px))] overflow-hidden rounded-3xl border border-line bg-card-bg/95 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.5)] backdrop-blur-2xl'>
			<div className='max-h-[52vh] overflow-y-auto px-5 py-4'>
				{turns.map((turn, ti) => {
					const isLast = ti === turns.length - 1
					return (
						<div key={ti} className={ti > 0 ? 'mt-4 border-t border-line pt-4' : ''}>
							<div className='mb-1.5 flex items-center gap-2'>
								<Sparkles className='h-3.5 w-3.5 shrink-0 text-[color:var(--accent,#6366f1)]' aria-hidden />
								<span className='truncate text-[12px] text-[color:var(--fg-mute)]'>{turn.prompt}</span>
							</div>
							<div className='text-[14px] leading-relaxed text-[color:var(--fg)]'>
								{turn.answer ? (
									turn.answer.split('\n').map((line, i) => (
										<p key={i} className={line.trim() ? 'mb-2' : 'mb-2 h-2'}>
											{line}
										</p>
									))
								) : working && isLast ? (
									<p className='animate-pulse text-[color:var(--fg-faint)]'>Liv is thinking…</p>
								) : null}
							</div>
						</div>
					)
				})}
			</div>
			{onOpenInLiv ? (
				<div className='flex justify-end border-t border-line px-5 py-2.5'>
					<button
						type='button'
						onClick={onOpenInLiv}
						className='inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-[12px] font-medium text-[color:var(--fg-dim)] transition-colors hover:border-line-strong hover:bg-[color:var(--bg-2)] hover:text-[color:var(--fg)]'
					>
						Open in Liv
						<ArrowUpRight className='h-3.5 w-3.5' />
					</button>
				</div>
			) : null}
		</div>
	)
}
