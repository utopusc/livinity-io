/* =========================================================
   PersonalizeSection — Settings › Personal › Liv AI

   Phase 272. Lets the user CHANGE the AI personalization
   choices that onboarding's PersonalizeStep sets write-once.
   Same five preference keys, same values — just reachable
   after onboarding and styled like a Settings section
   (SettingsPageHeader + FieldCard) rather than the onboarding
   card idiom.

   Backend contract (no backend changes — reuses existing tRPC):
     - Read:  preferences.get({keys:[...]}) seeds the controls
              on mount with whatever onboarding (or a prior edit)
              saved.
     - Write: preferences.set({key,value}) per change, with the
              SAME keys/values as the onboarding step:
                ai_role            string
                ai_response_style  'concise'|'direct'|'detailed'
                ai_tone            number (0–100, debounced 400ms)
                ai_memory          'off'|'session'|'persistent'
                ai_use_cases       string[]
              After each successful set we invalidate
              preferences.get so the cache stays in sync.

   The option lists below are duplicated byte-identically from
   personalize-step.tsx (which keeps them module-private). They
   are the SAME literals the onboarding step writes — keep the
   two in lockstep if either changes.
   ========================================================= */

import {useEffect, useMemo, useRef, useState, type ReactNode} from 'react'
import {TbCheck} from 'react-icons/tb'

import {FieldCard, FieldRow} from '@/components/field-card'
import {SettingsPageHeader} from '@/components/settings-page-header'
import {trpcReact} from '@/trpc/trpc'

// ─── Option lists — byte-identical to onboarding/steps/personalize-step.tsx ──
const ROLES = ['Developer', 'Student', 'Designer', 'Business', 'Creative', 'General'] as const

const STYLES = [
	{id: 'concise' as const, name: 'Concise', desc: 'Short and to the point'},
	{id: 'direct' as const, name: 'Direct', desc: 'Clear with enough detail'},
	{id: 'detailed' as const, name: 'Detailed', desc: 'Thorough explanations'},
]

const USE_CASES = [
	'Coding',
	'Research',
	'Writing',
	'Automation',
	'Data Analysis',
	'Email',
	'Learning',
	'Planning',
	'Creative Projects',
	'System Admin',
] as const

const MEMORY_OPTS = [
	{id: 'off' as const, name: 'Off', desc: 'No memory between sessions'},
	{id: 'session' as const, name: 'Session', desc: 'Remember within one chat'},
	{id: 'persistent' as const, name: 'Persistent', desc: 'Long-term memory'},
]

function toneLabel(t: number): string {
	if (t < 25) return 'Casual'
	if (t < 55) return 'Friendly'
	if (t < 80) return 'Direct'
	return 'Formal'
}

// ─── Local state shape (mirrors the onboarding choices we persist) ───────────
type StyleId = (typeof STYLES)[number]['id']
type MemoryId = (typeof MEMORY_OPTS)[number]['id']

const PREF_KEYS = ['ai_role', 'ai_response_style', 'ai_tone', 'ai_memory', 'ai_use_cases'] as const

export function PersonalizeSection() {
	// Read back the saved choices so the controls reflect onboarding (or a
	// prior edit) on mount. Defaults match onboarding's DEFAULT_DATA.
	const prefsQ = trpcReact.preferences.get.useQuery({keys: [...PREF_KEYS]})
	const utils = trpcReact.useUtils()
	const setPref = trpcReact.preferences.set.useMutation({
		// Keep the read-back cache in sync after every successful write.
		onSuccess: () => utils.preferences.get.invalidate(),
	})

	const [role, setRoleState] = useState<string>('Developer')
	const [style, setStyleState] = useState<StyleId>('direct')
	const [tone, setToneState] = useState<number>(55)
	const [memory, setMemoryState] = useState<MemoryId>('session')
	const [useCases, setUseCasesState] = useState<string[]>([])

	// One-time hydration from the saved preferences — a ref guards it so a slow
	// read-back can't clobber an in-progress edit.
	const hydratedRef = useRef(false)
	useEffect(() => {
		if (hydratedRef.current) return
		if (!prefsQ.data) return
		hydratedRef.current = true
		const d = prefsQ.data as Record<string, unknown>
		if (typeof d.ai_role === 'string') setRoleState(d.ai_role)
		if (d.ai_response_style === 'concise' || d.ai_response_style === 'direct' || d.ai_response_style === 'detailed') {
			setStyleState(d.ai_response_style)
		}
		if (typeof d.ai_tone === 'number') setToneState(d.ai_tone)
		if (d.ai_memory === 'off' || d.ai_memory === 'session' || d.ai_memory === 'persistent') {
			setMemoryState(d.ai_memory)
		}
		if (Array.isArray(d.ai_use_cases)) {
			setUseCasesState(d.ai_use_cases.filter((x): x is string => typeof x === 'string'))
		}
	}, [prefsQ.data])

	// Debounced tone writer — 400ms, exactly like the onboarding step, so we
	// don't spam preferences.set on every pixel of slider drag.
	const persistTone = useDebouncedTone((value: number) => {
		setPref.mutate({key: 'ai_tone', value})
	}, 400)

	function pickRole(r: string) {
		setRoleState(r)
		setPref.mutate({key: 'ai_role', value: r})
	}
	function pickStyle(s: StyleId) {
		setStyleState(s)
		setPref.mutate({key: 'ai_response_style', value: s})
	}
	function pickMemory(m: MemoryId) {
		setMemoryState(m)
		setPref.mutate({key: 'ai_memory', value: m})
	}
	function changeTone(value: number) {
		setToneState(value)
		persistTone(value)
	}
	function toggleCase(uc: string) {
		const next = useCases.includes(uc) ? useCases.filter((x) => x !== uc) : [...useCases, uc]
		setUseCasesState(next)
		setPref.mutate({key: 'ai_use_cases', value: next})
	}

	return (
		<div className='flex flex-col gap-8'>
			<SettingsPageHeader
				eyebrow='Liv AI'
				title='Personalize'
				titleAccent='Liv.'
				sub='Tune how the assistant works for you — role, response style, tone, memory and use cases. Changes save instantly and apply to new conversations.'
			/>

			<FieldCard>
				{/* Role */}
				<FieldRow
					label='Your role'
					value={
						<div className='flex flex-wrap gap-2'>
							{ROLES.map((r) => (
								<Chip key={r} active={role === r} onClick={() => pickRole(r)}>
									{r}
								</Chip>
							))}
						</div>
					}
				/>

				{/* Response style */}
				<FieldRow
					label='Response style'
					value={
						<div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
							{STYLES.map((s) => (
								<button
									key={s.id}
									type='button'
									onClick={() => pickStyle(s.id)}
									aria-pressed={style === s.id}
									className={cardButtonClass(style === s.id)}
								>
									<span className='text-[13px] font-medium text-[color:var(--fg)]'>{s.name}</span>
									<span className='text-[11px] text-[color:var(--fg-faint)]'>{s.desc}</span>
								</button>
							))}
						</div>
					}
				/>

				{/* Tone slider */}
				<FieldRow
					label={
						<span>
							Tone{' '}
							<span className='text-[color:var(--fg-faint)]'>· {toneLabel(tone)}</span>
						</span>
					}
					value={
						<div className='flex flex-col gap-2'>
							<input
								type='range'
								min={0}
								max={100}
								step={1}
								value={tone}
								onChange={(e) => changeTone(parseInt(e.target.value, 10))}
								aria-label='Tone slider'
								className='w-full max-w-[320px] accent-[color:var(--brand,#6366f1)]'
							/>
							<div className='flex max-w-[320px] justify-between text-[10px] text-[color:var(--fg-faint)]'>
								<span>Casual</span>
								<span>Friendly</span>
								<span>Direct</span>
								<span>Formal</span>
							</div>
						</div>
					}
				/>

				{/* Memory */}
				<FieldRow
					label='Memory'
					value={
						<div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
							{MEMORY_OPTS.map((m) => (
								<button
									key={m.id}
									type='button'
									onClick={() => pickMemory(m.id)}
									aria-pressed={memory === m.id}
									className={cardButtonClass(memory === m.id)}
								>
									<span className='text-[13px] font-medium text-[color:var(--fg)]'>{m.name}</span>
									<span className='text-[11px] text-[color:var(--fg-faint)]'>{m.desc}</span>
								</button>
							))}
						</div>
					}
				/>

				{/* Use cases */}
				<FieldRow
					label={
						<span>
							Use cases <span className='text-[color:var(--fg-faint)]'>· pick any</span>
						</span>
					}
					value={
						<div className='flex flex-wrap gap-2'>
							{USE_CASES.map((uc) => {
								const on = useCases.includes(uc)
								return (
									<Chip key={uc} active={on} onClick={() => toggleCase(uc)}>
										<span className='inline-flex items-center gap-1'>
											{uc}
											{on && <TbCheck className='h-3 w-3' />}
										</span>
									</Chip>
								)
							})}
						</div>
					}
				/>
			</FieldCard>
		</div>
	)
}

// ─── Small presentational helpers ───────────────────────────────────────────

function Chip({active, onClick, children}: {active: boolean; onClick: () => void; children: ReactNode}) {
	return (
		<button
			type='button'
			onClick={onClick}
			aria-pressed={active}
			className={
				'rounded-full border px-3 py-1.5 text-[13px] transition-colors ' +
				(active
					? 'border-brand bg-brand/15 text-text-primary'
					: 'border-border-default text-text-secondary hover:bg-surface-base')
			}
		>
			{children}
		</button>
	)
}

function cardButtonClass(active: boolean): string {
	return (
		'flex flex-col items-start gap-0.5 rounded-radius-sm border px-3 py-2 text-left transition-colors ' +
		(active ? 'border-brand bg-brand/15' : 'border-border-default hover:bg-surface-base')
	)
}

/**
 * Local debounced callback — fires only after `delay`ms of inactivity. Mirrors
 * the onboarding step's useDebouncedCallback so the tone slider doesn't spam
 * preferences.set on every drag pixel. Kept local to avoid importing from the
 * onboarding feature (separate change in flight there).
 */
function useDebouncedTone(cb: (value: number) => void, delay: number): (value: number) => void {
	const cbRef = useRef(cb)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		cbRef.current = cb
	}, [cb])

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current)
		}
	}, [])

	return useMemo(
		() => (value: number) => {
			if (timerRef.current) clearTimeout(timerRef.current)
			timerRef.current = setTimeout(() => cbRef.current(value), delay)
		},
		[delay],
	)
}
