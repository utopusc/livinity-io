import {useEffect, useRef, useState} from 'react'

import {useSound} from '../effects/sound-provider'
import {FooterBar} from '../footer-bar'
import {Icon} from '../icon'

/* =========================================================
   Phase 135-I — VISUAL PORT of the reference's animated terminal.
   The real claude /login PTY backend is its own follow-up phase:
     • livinityd PTY tRPC subscription (spawn `claude /login`, stream
       stdout, accept stdin)
     • Replace CLAUDE_SCRIPT animation with live xterm.js output
     • Detect Anthropic OAuth device URL → open in browser
     • Accept verification code paste → write to PTY stdin
   For now the URL line is clickable so the operator can complete auth
   manually; the wizard advances on click of "I authorized — continue".
   ========================================================= */

type Line = {
	t: 'prompt' | 'info' | 'ok' | 'url' | 'err' | 'com'
	text: string
	delay?: number
	caret?: boolean
}

const CLAUDE_SCRIPT: Line[] = [
	{t: 'prompt', text: '$ claude /login'},
	{t: 'info', text: '→ initializing Anthropic provider…', delay: 600},
	{t: 'ok', text: '✓ runtime found · claude-sonnet-4.5', delay: 700},
	{t: 'info', text: '→ opening authorization in your browser…', delay: 800},
	{t: 'url', text: 'https://console.anthropic.com/auth/livinity', delay: 600},
	{t: 'info', text: '→ waiting for callback (1-time, no password stored)…', delay: 1100, caret: true},
	{t: 'ok', text: '✓ token received · stored in keychain (encrypted)', delay: 900},
	{t: 'info', text: '→ testing connection…', delay: 700},
	{t: 'ok', text: '✓ Claude responded in 312ms', delay: 700},
	{t: 'info', text: '→ registering 47 default tools…', delay: 600},
	{t: 'ok', text: '✓ tools registered · files, web, run, plan, memory', delay: 700},
	{t: 'prompt', text: '$ Liv is connected.', delay: 700},
]

type Props = {
	onContinue: () => void
	onSkip: () => void
	onBack: () => void
	isActive: boolean
}

export function ConnectAiStep({onContinue, onSkip, onBack, isActive}: Props) {
	const [step, setStep] = useState(0)
	const [copied, setCopied] = useState(false)
	const {play} = useSound()
	const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])

	useEffect(() => {
		if (!isActive) return
		setStep(0)
		timers.current.forEach(clearTimeout)
		timers.current = []
		let cumulative = 400
		CLAUDE_SCRIPT.forEach((line, i) => {
			const t = setTimeout(() => {
				setStep(i + 1)
				if (line.t === 'ok' || line.t === 'prompt') play('type')
			}, cumulative)
			timers.current.push(t)
			cumulative += line.delay ?? 600
		})
		return () => timers.current.forEach(clearTimeout)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isActive])

	const restart = () => {
		timers.current.forEach(clearTimeout)
		setStep(0)
		let cumulative = 100
		CLAUDE_SCRIPT.forEach((line, i) => {
			const t = setTimeout(() => setStep(i + 1), cumulative)
			timers.current.push(t)
			cumulative += line.delay ?? 600
		})
	}

	const done = step >= CLAUDE_SCRIPT.length

	const copyKey = () => {
		navigator.clipboard?.writeText('sk-ant-livinity-7f4a3c2e9b1d').catch(() => {})
		setCopied(true)
		setTimeout(() => setCopied(false), 1400)
	}

	return (
		<div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
			<div className='fade-up'>
				<div className='onb-eyebrow'>05 · Connect AI</div>
				<h1 className='onb-title' style={{marginTop: 8}}>
					Sign in with <em>Claude</em>
				</h1>
				<p className='onb-sub' style={{marginTop: 10}}>
					Liv uses Anthropic's Claude as its reasoning engine. One-time authorize — no password
					stored.
				</p>
			</div>
			<div className='terminal fade-up d1'>
				<div className='terminal-bar'>
					<div className='lights'>
						<span></span>
						<span></span>
						<span></span>
					</div>
					<div className='title'>liv · claude · authorize</div>
					<div style={{width: 44}}></div>
				</div>
				<div className='terminal-body'>
					{CLAUDE_SCRIPT.slice(0, step).map((line, i) => {
						const isLast = i === step - 1
						const cls =
							line.t === 'prompt'
								? 'prompt'
								: line.t === 'ok'
									? 'ok'
									: line.t === 'err'
										? 'err'
										: line.t === 'info'
											? 'info'
											: line.t === 'url'
												? 'url'
												: 'com'
						const content =
							line.t === 'url' ? (
								<a
									className='url'
									href={line.text}
									target='_blank'
									rel='noreferrer'
									style={{cursor: 'pointer'}}
								>
									{line.text}
								</a>
							) : (
								<span className={cls}>{line.text}</span>
							)
						return (
							<span className='tl' key={i}>
								{content}
								{isLast && line.caret && !done && <span className='caret'></span>}
							</span>
						)
					})}
				</div>
			</div>
			<div className='claude-helper fade-up d2'>
				<button className={`copy-key ${copied ? 'ok' : ''}`} onClick={copyKey}>
					<Icon name={copied ? 'check' : 'copy'} size={12} />
					{copied ? 'Copied' : 'Or paste API key manually'}
				</button>
				{done && (
					<button className='copy-key' onClick={restart} style={{background: 'transparent'}}>
						↻ Run again
					</button>
				)}
			</div>
			<FooterBar
				onBack={onBack}
				onContinue={onContinue}
				onSkip={onSkip}
				continueLabel={done ? 'Continue' : 'Continue when connected'}
				continueDisabled={!done}
			/>
		</div>
	)
}
