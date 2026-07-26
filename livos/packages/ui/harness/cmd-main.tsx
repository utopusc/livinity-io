import {StrictMode, useEffect, useRef, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {AnimatePresence, motion} from 'framer-motion'

import '@/index.css'
import {cn} from '@/shadcn-lib/utils'
import {
	LivAnswerPanel,
	LivAnswerView,
	LivBrandMark,
	LivCommandInput,
	type LivState,
} from '@/modules/desktop/liv-command-input'

// No-auth, no-trpc preview of the FULL navbar → Liv command-bar flow + the
// working/done/answer states. Mirrors the top-bar.tsx state machine so the
// animation + dark/light themes can be verified via chrome-devtools.
function Preview() {
	const [dark, setDark] = useState(true)
	const [livState, setLivState] = useState<LivState>('idle')
	const [prompt, setPrompt] = useState('')
	const [answer, setAnswer] = useState<string | null>(null)
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const isOverlay = livState === 'compose' || livState === 'answer'

	useEffect(() => {
		document.documentElement.classList.toggle('dark', dark)
	}, [dark])

	const submit = (p: {prompt: string; provider: string; model: string; permission: string}) => {
		setPrompt(p.prompt)
		setAnswer(null)
		setLivState('working')
		if (timer.current) clearTimeout(timer.current)
		timer.current = setTimeout(() => {
			setAnswer(
				`(preview) Liv would handle this with ${p.provider} · ${p.model} in “${p.permission}” mode. ` +
					`The command-bar UI is done — wiring the real Liv runtime is the next step.`,
			)
			setLivState('done')
		}, 2600)
	}
	const close = () => {
		if (timer.current) clearTimeout(timer.current)
		setLivState('idle')
		setAnswer(null)
		setPrompt('')
	}
	const onLogo = () => {
		if (livState === 'idle') setLivState('compose')
		else if (livState === 'done') setLivState('answer')
	}

	return (
		<div
			style={{
				minHeight: '100vh',
				background: dark
					? 'radial-gradient(120% 120% at 50% 0%, #1a1d27 0%, #0b0c10 60%)'
					: 'radial-gradient(120% 120% at 50% 0%, #eef1f6 0%, #ccd2de 60%)',
			}}
		>
			<div style={{position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '90px 24px'}}>
				<div className='flex w-full justify-center'>
					<div
						className={cn(
							'pointer-events-auto relative flex h-16 w-full items-center rounded-full border bg-card-bg/78 px-3.5 backdrop-blur-2xl backdrop-saturate-150 dark:bg-black/55',
							'transition-[max-width,border-color] duration-[700ms] ease-out',
							isOverlay ? 'max-w-[840px] border-line-strong' : 'max-w-[580px] border-line',
						)}
					>
						<div
							className={cn(
								'grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5 transition-opacity duration-200',
								isOverlay && 'pointer-events-none opacity-0',
							)}
						>
							<div className='flex min-w-0 items-center gap-2.5 pl-2'>
								<span className='grid h-8 w-8 place-items-center rounded-full text-[13px] font-semibold text-white' style={{background: 'linear-gradient(135deg, #ff8a65, #f06292)'}}>
									B
								</span>
								<span className='truncate text-[14px] font-medium text-[color:var(--fg)]'>Bruce</span>
							</div>
							<div className='flex justify-center'>
								<LivBrandMark state={livState} onClick={onLogo} />
							</div>
							<div className='flex justify-end pr-3 text-[13px] font-medium text-[color:var(--fg-mute)] tabular-nums'>18:42</div>
						</div>

						<AnimatePresence>
							{isOverlay && (
								<motion.div
									key={livState}
									initial={{opacity: 0, y: 6, scale: 0.985}}
									animate={{opacity: 1, y: 0, scale: 1}}
									exit={{opacity: 0, y: 6, scale: 0.985}}
									transition={{type: 'spring', stiffness: 460, damping: 34}}
									className='absolute inset-0 flex items-center px-3.5'
								>
									{livState === 'compose' ? (
										<LivCommandInput onClose={close} onSubmit={submit} />
									) : (
										<LivAnswerView prompt={prompt} answer={answer} onAskAgain={() => setLivState('compose')} onClose={close} />
									)}
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</div>

				<div className='pointer-events-none absolute inset-x-0 top-[150px] flex justify-center'>
					<AnimatePresence>
						{livState === 'answer' && answer && (
							<motion.div
								initial={{opacity: 0, y: -10, scale: 0.98}}
								animate={{opacity: 1, y: 0, scale: 1}}
								exit={{opacity: 0, y: -10, scale: 0.98}}
								transition={{type: 'spring', stiffness: 420, damping: 32}}
								className='pointer-events-auto'
							>
								<LivAnswerPanel prompt={prompt} answer={answer} />
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				<button
					type='button'
					onClick={() => setDark((d) => !d)}
					className='mt-8 rounded-full border border-line px-3 py-1 text-[12px] font-medium text-[color:var(--fg-dim)]'
				>
					Toggle theme (now: {dark ? 'dark' : 'light'})
				</button>
				<p className='text-[13px] text-[color:var(--fg-mute)]'>
					Logo → compose · Send → working (logo spins) → done (dot) · click dot → answer.
				</p>
			</div>
		</div>
	)
}

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<Preview />
	</StrictMode>,
)
