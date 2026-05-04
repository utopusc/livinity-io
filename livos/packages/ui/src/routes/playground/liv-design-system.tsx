/**
 * Liv Design System v1 — Playground (Phase 66, Plan 05).
 *
 * Single scrolling visual reference for every primitive shipped by Plans
 * 66-01..66-04. Per CONTEXT.md D-19/D-20, this IS the verification surface
 * for Phase 66 (no Storybook per D-16) and the side-by-side comparison
 * source for the v31-DRAFT line 257-258 "WOW differential A/B" judgment.
 *
 * Sections (D-20):
 *   1. Color Tokens          — 12 swatches + 4 duration demos + 2 easing demos
 *   2. Typography Scale      — 6 type-scale samples (display-1 → mono-sm)
 *   3. Motion Primitives     — 5 demos with replay buttons (FadeIn, GlowPulse,
 *                              SlideInPanel, TypewriterCaret, StaggerList)
 *   4. Glass / Grain / Glow  — 5 utility-class demo panels
 *   5. shadcn liv-* Variants — Button, Badge, Card, Slider in liv-* variants
 *   6. Icon Map              — every LivIcons key rendered with its label
 *
 * Access: gated by EnsureLoggedIn (NOT admin-only per D-21); hidden from main
 * nav, only reachable via direct URL `/playground/liv-design-system`.
 */

import {useEffect, useRef, useState} from 'react'

import {FadeIn, GlowPulse, SlideInPanel, StaggerList, TypewriterCaret} from '@/components/motion'
import {Card} from '@/components/ui/card'
import {Badge} from '@/shadcn-components/ui/badge'
import {Button} from '@/shadcn-components/ui/button'
import {Slider} from '@/shadcn-components/ui/slider'
import {LivIcons, type LivIconKey} from '@/icons/liv-icons'

// Plan 66-01 tokens — names referenced for swatch rendering.
const COLOR_TOKENS = [
	'--liv-bg-deep',
	'--liv-bg-elevated',
	'--liv-bg-glass',
	'--liv-border-subtle',
	'--liv-text-primary',
	'--liv-text-secondary',
	'--liv-text-tertiary',
	'--liv-accent-cyan',
	'--liv-accent-amber',
	'--liv-accent-violet',
	'--liv-accent-emerald',
	'--liv-accent-rose',
] as const

const DURATION_TOKENS = ['--liv-dur-instant', '--liv-dur-fast', '--liv-dur-normal', '--liv-dur-slow'] as const
const EASING_TOKENS = ['--liv-ease-out', '--liv-ease-spring'] as const

type ReplayKeys = {
	fadeIn: number
	glowPulseAmber: number
	glowPulseCyan: number
	glowPulseViolet: number
	slideInPanel: number
	typewriterCaret: number
	staggerList: number
}

// ────────────────────────────────────────────────────────────────────────────
// Section 1 — Color Tokens
// ────────────────────────────────────────────────────────────────────────────

function useResolvedTokenValues(tokens: readonly string[]): Record<string, string> {
	const [values, setValues] = useState<Record<string, string>>({})

	useEffect(() => {
		const root = getComputedStyle(document.documentElement)
		const next: Record<string, string> = {}
		for (const t of tokens) {
			next[t] = root.getPropertyValue(t).trim() || '(unresolved)'
		}
		setValues(next)
	}, [tokens])

	return values
}

function ColorTokensSection() {
	const colorValues = useResolvedTokenValues(COLOR_TOKENS)
	const durationValues = useResolvedTokenValues(DURATION_TOKENS)
	const easingValues = useResolvedTokenValues(EASING_TOKENS)

	const [durKey, setDurKey] = useState(0)
	const [easeKey, setEaseKey] = useState(0)

	return (
		<section className='space-y-8' id='section-color-tokens'>
			<h2 className='text-h1'>1. Color Tokens</h2>

			<div className='space-y-3'>
				<h3 className='text-body text-[color:var(--liv-text-secondary)]'>Surface / Text / Accent (12)</h3>
				<div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
					{COLOR_TOKENS.map((token) => (
						<div
							key={token}
							className='flex items-center gap-3 rounded-md border border-[color:var(--liv-border-subtle)] p-3'
						>
							<div
								className='h-12 w-12 shrink-0 rounded-md border border-[color:var(--liv-border-subtle)]'
								style={{background: `var(${token})`}}
							/>
							<div className='min-w-0 flex-1'>
								<div className='text-mono-sm truncate'>{token}</div>
								<div className='text-caption truncate text-[color:var(--liv-text-tertiary)]'>
									{colorValues[token] ?? '…'}
								</div>
							</div>
						</div>
					))}
				</div>
			</div>

			<div className='space-y-3'>
				<h3 className='text-body text-[color:var(--liv-text-secondary)]'>Durations (click to replay)</h3>
				<div className='flex flex-wrap gap-3'>
					<button
						type='button'
						onClick={() => setDurKey((k) => k + 1)}
						className='text-caption rounded-md border border-[color:var(--liv-border-subtle)] px-3 py-1.5 hover:bg-[color:var(--liv-bg-elevated)]'
					>
						Replay all durations
					</button>
				</div>
				<div className='space-y-2'>
					{DURATION_TOKENS.map((token) => (
						<div key={token} className='flex items-center gap-3'>
							<div className='text-mono-sm w-44 shrink-0'>{token}</div>
							<div className='text-caption w-20 shrink-0 text-[color:var(--liv-text-tertiary)]'>
								{durationValues[token] ?? '…'}
							</div>
							<div className='relative h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--liv-bg-elevated)]'>
								<div
									key={`${token}-${durKey}`}
									className='absolute left-0 top-0 h-full w-full bg-[color:var(--liv-accent-cyan)]'
									style={{
										animationName: 'liv-playground-fill',
										animationDuration: `var(${token})`,
										animationTimingFunction: 'linear',
										animationFillMode: 'forwards',
										transformOrigin: 'left',
									}}
								/>
							</div>
						</div>
					))}
				</div>
			</div>

			<div className='space-y-3'>
				<h3 className='text-body text-[color:var(--liv-text-secondary)]'>Easing curves (click to replay)</h3>
				<div className='flex flex-wrap gap-3'>
					<button
						type='button'
						onClick={() => setEaseKey((k) => k + 1)}
						className='text-caption rounded-md border border-[color:var(--liv-border-subtle)] px-3 py-1.5 hover:bg-[color:var(--liv-bg-elevated)]'
					>
						Replay all easings
					</button>
				</div>
				<div className='space-y-2'>
					{EASING_TOKENS.map((token) => (
						<div key={token} className='flex items-center gap-3'>
							<div className='text-mono-sm w-44 shrink-0'>{token}</div>
							<div className='text-caption w-44 shrink-0 truncate text-[color:var(--liv-text-tertiary)]'>
								{easingValues[token] ?? '…'}
							</div>
							<div className='relative h-8 flex-1 overflow-hidden rounded-full bg-[color:var(--liv-bg-elevated)]'>
								<div
									key={`${token}-${easeKey}`}
									className='absolute left-0 top-1 h-6 w-6 rounded-full bg-[color:var(--liv-accent-amber)]'
									style={{
										animationName: 'liv-playground-slide',
										animationDuration: '900ms',
										animationTimingFunction: `var(${token})`,
										animationFillMode: 'forwards',
									}}
								/>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Keyframes for the duration/easing demos. Inlined here to keep the playground self-contained. */}
			<style>{`
				@keyframes liv-playground-fill {
					from { transform: scaleX(0); }
					to   { transform: scaleX(1); }
				}
				@keyframes liv-playground-slide {
					from { left: 0%; }
					to   { left: calc(100% - 1.5rem); }
				}
			`}</style>
		</section>
	)
}

// ────────────────────────────────────────────────────────────────────────────
// Section 2 — Typography Scale
// ────────────────────────────────────────────────────────────────────────────

function TypographySection() {
	const sample = 'The quick brown fox jumps over the lazy dog'
	return (
		<section className='space-y-4' id='section-typography'>
			<h2 className='text-h1'>2. Typography Scale</h2>
			<div className='space-y-4 rounded-md border border-[color:var(--liv-border-subtle)] p-6'>
				<p className='text-display-1'>text-display-1 — {sample}</p>
				<p className='text-display-2'>text-display-2 — {sample}</p>
				<p className='text-h1'>text-h1 — {sample}</p>
				<p className='text-body'>text-body — {sample}</p>
				<p className='text-caption text-[color:var(--liv-text-secondary)]'>text-caption — {sample}</p>
				<p className='text-mono-sm text-[color:var(--liv-text-secondary)]'>
					text-mono-sm — {sample} (JetBrains Mono)
				</p>
			</div>
		</section>
	)
}

// ────────────────────────────────────────────────────────────────────────────
// Section 3 — Motion Primitives
// ────────────────────────────────────────────────────────────────────────────

function ReplayButton({onClick, label}: {onClick: () => void; label: string}) {
	return (
		<button
			type='button'
			onClick={onClick}
			className='text-caption rounded-md border border-[color:var(--liv-border-subtle)] px-3 py-1.5 hover:bg-[color:var(--liv-bg-elevated)]'
		>
			Replay {label}
		</button>
	)
}

function TypewriterCaretDemo({replayCounter}: {replayCounter: number}) {
	const anchorRef = useRef<HTMLSpanElement>(null)
	const [text, setText] = useState('')

	useEffect(() => {
		const target = 'Streaming text… the caret follows the trailing edge.'
		setText('')
		let i = 0
		const id = window.setInterval(() => {
			i += 1
			setText(target.slice(0, i))
			if (i >= target.length) window.clearInterval(id)
		}, 60)
		return () => window.clearInterval(id)
	}, [replayCounter])

	return (
		<div className='rounded-md border border-[color:var(--liv-border-subtle)] p-4'>
			<div className='text-body'>
				<span ref={anchorRef}>{text}</span>
				<TypewriterCaret anchorRef={anchorRef} />
			</div>
		</div>
	)
}

function MotionSection() {
	const [replayKeys, setReplayKeys] = useState<ReplayKeys>({
		fadeIn: 0,
		glowPulseAmber: 0,
		glowPulseCyan: 0,
		glowPulseViolet: 0,
		slideInPanel: 0,
		typewriterCaret: 0,
		staggerList: 0,
	})

	const bump = (k: keyof ReplayKeys) => setReplayKeys((s) => ({...s, [k]: s[k] + 1}))

	return (
		<section className='space-y-6' id='section-motion'>
			<h2 className='text-h1'>3. Motion Primitives</h2>

			{/* FadeIn */}
			<div className='space-y-2'>
				<div className='flex items-center justify-between'>
					<h3 className='text-body text-[color:var(--liv-text-secondary)]'>FadeIn (opacity 0→1, y 8→0, 350ms)</h3>
					<ReplayButton onClick={() => bump('fadeIn')} label='FadeIn' />
				</div>
				<FadeIn key={replayKeys.fadeIn} delay={0} y={8}>
					<div className='rounded-md border border-[color:var(--liv-border-subtle)] bg-[color:var(--liv-bg-elevated)] p-6 text-body'>
						FadeIn demo content — fades up on mount.
					</div>
				</FadeIn>
			</div>

			{/* GlowPulse — three colors */}
			<div className='space-y-2'>
				<div className='flex items-center justify-between'>
					<h3 className='text-body text-[color:var(--liv-text-secondary)]'>GlowPulse (breathing halo)</h3>
					<div className='flex gap-2'>
						<ReplayButton onClick={() => bump('glowPulseAmber')} label='amber' />
						<ReplayButton onClick={() => bump('glowPulseCyan')} label='cyan' />
						<ReplayButton onClick={() => bump('glowPulseViolet')} label='violet' />
					</div>
				</div>
				<div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
					<GlowPulse key={replayKeys.glowPulseAmber} color='amber'>
						<div className='rounded-md border border-[color:var(--liv-border-subtle)] bg-[color:var(--liv-bg-elevated)] p-6 text-body'>
							GlowPulse amber
						</div>
					</GlowPulse>
					<GlowPulse key={replayKeys.glowPulseCyan} color='cyan'>
						<div className='rounded-md border border-[color:var(--liv-border-subtle)] bg-[color:var(--liv-bg-elevated)] p-6 text-body'>
							GlowPulse cyan
						</div>
					</GlowPulse>
					<GlowPulse key={replayKeys.glowPulseViolet} color='violet'>
						<div className='rounded-md border border-[color:var(--liv-border-subtle)] bg-[color:var(--liv-bg-elevated)] p-6 text-body'>
							GlowPulse violet
						</div>
					</GlowPulse>
				</div>
			</div>

			{/* SlideInPanel */}
			<div className='space-y-2'>
				<div className='flex items-center justify-between'>
					<h3 className='text-body text-[color:var(--liv-text-secondary)]'>SlideInPanel (from right)</h3>
					<ReplayButton onClick={() => bump('slideInPanel')} label='SlideInPanel' />
				</div>
				<div className='relative h-32 overflow-hidden rounded-md border border-[color:var(--liv-border-subtle)] bg-[color:var(--liv-bg-elevated)]'>
					<SlideInPanel key={replayKeys.slideInPanel} from='right'>
						<div className='flex h-32 items-center justify-center text-body'>SlideInPanel from right</div>
					</SlideInPanel>
				</div>
			</div>

			{/* TypewriterCaret */}
			<div className='space-y-2'>
				<div className='flex items-center justify-between'>
					<h3 className='text-body text-[color:var(--liv-text-secondary)]'>TypewriterCaret (anchored, 530ms blink)</h3>
					<ReplayButton onClick={() => bump('typewriterCaret')} label='TypewriterCaret' />
				</div>
				<TypewriterCaretDemo replayCounter={replayKeys.typewriterCaret} />
			</div>

			{/* StaggerList */}
			<div className='space-y-2'>
				<div className='flex items-center justify-between'>
					<h3 className='text-body text-[color:var(--liv-text-secondary)]'>StaggerList (50ms stagger)</h3>
					<ReplayButton onClick={() => bump('staggerList')} label='StaggerList' />
				</div>
				<StaggerList key={replayKeys.staggerList} className='space-y-2'>
					{[1, 2, 3, 4, 5].map((n) => (
						<div
							key={n}
							className='rounded-md border border-[color:var(--liv-border-subtle)] bg-[color:var(--liv-bg-elevated)] px-4 py-3 text-body'
						>
							Stagger item #{n}
						</div>
					))}
				</StaggerList>
			</div>
		</section>
	)
}

// ────────────────────────────────────────────────────────────────────────────
// Section 4 — Glass / Grain / Glow Utilities
// ────────────────────────────────────────────────────────────────────────────

function GlassGrainGlowSection() {
	return (
		<section className='space-y-4' id='section-utilities'>
			<h2 className='text-h1'>4. Glass / Grain / Glow Utilities</h2>
			<p className='text-body text-[color:var(--liv-text-secondary)]'>
				Plan 66-01 utility classes layered on a colorful gradient so the blur and glows are visible.
			</p>
			<div
				className='rounded-lg p-8'
				style={{
					background:
						'linear-gradient(135deg, #4dd0e1 0%, #a78bfa 35%, #ffbd38 70%, #fb7185 100%)',
				}}
			>
				<div className='flex flex-wrap gap-6'>
					<div className='liv-glass flex h-32 w-64 items-center justify-center rounded-md text-mono-sm'>
						.liv-glass
					</div>
					<div className='liv-grain flex h-32 w-64 items-center justify-center rounded-md border border-[color:var(--liv-border-subtle)] bg-[color:var(--liv-bg-elevated)] text-mono-sm'>
						.liv-grain
					</div>
					<div className='liv-glow-amber flex h-32 w-64 items-center justify-center rounded-md bg-[color:var(--liv-bg-elevated)] text-mono-sm'>
						.liv-glow-amber
					</div>
					<div className='liv-glow-cyan flex h-32 w-64 items-center justify-center rounded-md bg-[color:var(--liv-bg-elevated)] text-mono-sm'>
						.liv-glow-cyan
					</div>
					<div className='liv-glow-violet flex h-32 w-64 items-center justify-center rounded-md bg-[color:var(--liv-bg-elevated)] text-mono-sm'>
						.liv-glow-violet
					</div>
				</div>
			</div>
		</section>
	)
}

// ────────────────────────────────────────────────────────────────────────────
// Section 5 — shadcn liv-* Variants
// ────────────────────────────────────────────────────────────────────────────

function VariantsSection() {
	const [sliderValue, setSliderValue] = useState<number[]>([50])

	return (
		<section className='space-y-6' id='section-variants'>
			<h2 className='text-h1'>5. shadcn liv-* Variants</h2>

			<div className='space-y-3'>
				<h3 className='text-body text-[color:var(--liv-text-secondary)]'>Button — variant=&quot;liv-primary&quot;</h3>
				<div className='flex flex-wrap items-center gap-3'>
					<Button variant='liv-primary'>Continue</Button>
					<Button variant='liv-primary' disabled>
						Disabled
					</Button>
					<Button variant='liv-primary' size='lg'>
						Large
					</Button>
				</div>
			</div>

			<div className='space-y-3'>
				<h3 className='text-body text-[color:var(--liv-text-secondary)]'>Badge — variant=&quot;liv-status-running&quot;</h3>
				<div className='flex flex-wrap items-center gap-3'>
					<Badge variant='liv-status-running'>Running</Badge>
					<Badge variant='liv-status-running'>browser-navigate</Badge>
					<Badge variant='liv-status-running'>computer-use-screenshot</Badge>
				</div>
			</div>

			<div className='space-y-3'>
				<h3 className='text-body text-[color:var(--liv-text-secondary)]'>Card — variant=&quot;liv-elevated&quot;</h3>
				<div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
					<Card variant='liv-elevated'>
						<div className='text-h1'>Elevated Card</div>
						<div className='text-body text-[color:var(--liv-text-secondary)]'>
							Composes <code className='text-mono-sm'>.liv-glass</code> + a subtle 1px border keyed on{' '}
							<code className='text-mono-sm'>--liv-border-subtle</code>.
						</div>
					</Card>
					<Card variant='liv-elevated'>
						<div className='text-h1'>Reasoning</div>
						<div className='text-body text-[color:var(--liv-text-secondary)]'>
							Glassmorphic surface for P75 reasoning cards (glow optional via <code>.liv-glow-amber</code>).
						</div>
					</Card>
				</div>
			</div>

			<div className='space-y-3'>
				<h3 className='text-body text-[color:var(--liv-text-secondary)]'>Slider — variant=&quot;liv-slider&quot;</h3>
				<div className='space-y-3 rounded-md border border-[color:var(--liv-border-subtle)] p-6'>
					<div className='flex items-center gap-4'>
						<span className='text-mono-sm w-32 shrink-0 text-[color:var(--liv-text-secondary)]'>liv-slider:</span>
						<Slider
							variant='liv-slider'
							value={sliderValue}
							onValueChange={setSliderValue}
							max={100}
							step={1}
							className='w-64'
						/>
						<span className='text-mono-sm w-12 shrink-0 text-[color:var(--liv-text-tertiary)]'>{sliderValue[0]}</span>
					</div>
					<div className='flex items-center gap-4'>
						<span className='text-mono-sm w-32 shrink-0 text-[color:var(--liv-text-secondary)]'>default:</span>
						<Slider defaultValue={[25]} max={100} step={1} className='w-64' />
					</div>
				</div>
			</div>
		</section>
	)
}

// ────────────────────────────────────────────────────────────────────────────
// Section 6 — Icon Map
// ────────────────────────────────────────────────────────────────────────────

function IconMapSection() {
	const entries = Object.entries(LivIcons) as Array<[LivIconKey, (typeof LivIcons)[LivIconKey]]>
	return (
		<section className='space-y-4' id='section-icons'>
			<h2 className='text-h1'>6. Icon Map (LivIcons)</h2>
			<p className='text-body text-[color:var(--liv-text-secondary)]'>
				{entries.length} tool-category icons from <code className='text-mono-sm'>@tabler/icons-react</code>.
			</p>
			<div className='grid grid-cols-2 gap-4 rounded-md border border-[color:var(--liv-border-subtle)] p-6 sm:grid-cols-3 md:grid-cols-5'>
				{entries.map(([key, IconComponent]) => (
					<div
						key={key}
						className='flex flex-col items-center gap-2 rounded-md border border-[color:var(--liv-border-subtle)] bg-[color:var(--liv-bg-elevated)] p-4 text-center'
					>
						<IconComponent size={32} stroke={1.5} color='var(--liv-text-primary)' />
						<span className='text-mono-sm text-[color:var(--liv-text-secondary)]'>{key}</span>
					</div>
				))}
			</div>
		</section>
	)
}

// ────────────────────────────────────────────────────────────────────────────
// Page shell
// ────────────────────────────────────────────────────────────────────────────

export default function LivDesignSystemPlayground() {
	return (
		<div className='min-h-screen bg-[color:var(--liv-bg-deep)] text-[color:var(--liv-text-primary)]'>
			<div className='mx-auto max-w-5xl space-y-16 px-8 py-12'>
				<header className='space-y-3'>
					<h1 className='text-display-2'>Liv Design System v1 — Playground</h1>
					<p className='text-body text-[color:var(--liv-text-secondary)]'>
						Visual reference for every primitive shipped in Phase 66 (Plans 66-01..66-04). Side-by-side
						comparison source for the v31-DRAFT &ldquo;WOW differential A/B&rdquo; verification.
					</p>
					<nav className='flex flex-wrap gap-2 pt-2'>
						{[
							['#section-color-tokens', 'Color Tokens'],
							['#section-typography', 'Typography'],
							['#section-motion', 'Motion'],
							['#section-utilities', 'Glass/Grain/Glow'],
							['#section-variants', 'Variants'],
							['#section-icons', 'Icon Map'],
						].map(([href, label]) => (
							<a
								key={href}
								href={href}
								className='text-caption rounded-md border border-[color:var(--liv-border-subtle)] px-3 py-1 text-[color:var(--liv-text-secondary)] hover:bg-[color:var(--liv-bg-elevated)]'
							>
								{label}
							</a>
						))}
					</nav>
				</header>

				<ColorTokensSection />
				<TypographySection />
				<MotionSection />
				<GlassGrainGlowSection />
				<VariantsSection />
				<IconMapSection />

				<footer className='border-t border-[color:var(--liv-border-subtle)] pt-6'>
					<p className='text-caption text-[color:var(--liv-text-tertiary)]'>
						Phase 66 / Plan 05 — Liv Design System v1 playground. Hidden from main nav (D-21); reachable only
						via direct URL.
					</p>
				</footer>
			</div>
		</div>
	)
}
