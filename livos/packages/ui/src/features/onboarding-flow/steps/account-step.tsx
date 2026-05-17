import {useEffect, useMemo, useRef, useState} from 'react'

import {JWT_LOCAL_STORAGE_KEY} from '@/modules/auth/shared'
import {trpcReact, wsClient} from '@/trpc/trpc'

import type {OnboardingData} from '../constants'
import {FooterBar} from '../footer-bar'
import {Icon} from '../icon'

/* =========================================================
   Password helpers (ported from reference)
   ========================================================= */
function passwordStrength(p: string): number {
	if (!p) return 0
	let s = 0
	if (p.length >= 8) s++
	if (p.length >= 12) s++
	if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++
	if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++
	return s
}

const COMMON_BAD = ['password', '12345', 'qwerty', 'letmein', 'admin', 'welcome', 'abc123', 'iloveyou']

function passwordIssues(p: string, name: string): Array<{level: 'warn' | 'danger'; text: string}> {
	const issues: Array<{level: 'warn' | 'danger'; text: string}> = []
	if (!p) return issues
	const lower = p.toLowerCase()
	if (name && name.length >= 3 && lower.includes(name.toLowerCase().split(' ')[0])) {
		issues.push({level: 'warn', text: 'Avoid using your name — easy to guess.'})
	}
	if (COMMON_BAD.some((w) => lower.includes(w))) {
		issues.push({level: 'danger', text: 'This is on every leaked password list. Pick something unique.'})
	}
	if (p.length > 0 && p.length < 8) {
		issues.push({level: 'warn', text: 'At least 8 characters.'})
	}
	if (p.length >= 8 && !/[A-Z]/.test(p) && !/\d/.test(p) && !/[^A-Za-z0-9]/.test(p)) {
		issues.push({level: 'warn', text: 'Add a number or symbol for extra strength.'})
	}
	return issues
}

function generateOtpSecret(): string {
	const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
	let s = ''
	for (let i = 0; i < 16; i++) s += charset[Math.floor(Math.random() * charset.length)]
	return s
}

function formatSecret(s: string): string {
	const groups = s.match(/.{1,4}/g)
	return groups ? groups.join(' ') : ''
}

/* =========================================================
   FakeQR — decorative 21×21 dot grid hashed from the secret.
   Backend renders the real QR; this is the onboarding preview.
   ========================================================= */
function FakeQR({data}: {data: string}) {
	const grid = useMemo(() => {
		const seed = (data || 'x').split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)
		let s = seed
		const cells: boolean[] = []
		for (let i = 0; i < 21 * 21; i++) {
			s = (s * 1103515245 + 12345) | 0
			cells.push((s & 1) === 1)
		}
		return cells
	}, [data])

	const isFinder = (x: number, y: number) =>
		(x < 7 && y < 7) || (x >= 14 && y < 7) || (x < 7 && y >= 14)

	return (
		<div className='qr-frame'>
			<div className='qr-grid'>
				{grid.map((on, i) => {
					const x = i % 21
					const y = Math.floor(i / 21)
					if (isFinder(x, y)) return <span key={i} className='qr-cell off'></span>
					return <span key={i} className={`qr-cell ${on ? 'on' : 'off'}`}></span>
				})}
				<span className='qr-finder tl'></span>
				<span className='qr-finder tr'></span>
				<span className='qr-finder bl'></span>
			</div>
			<div className='qr-logo'>
				<span className='qr-logo-mark'></span>
			</div>
		</div>
	)
}

/* =========================================================
   AccountStep — name + password OR name + 2FA enrollment.
   ========================================================= */
type Props = {
	data: OnboardingData
	setData: (next: OnboardingData) => void
	onContinue: () => void
	onBack: () => void
}

export function AccountStep({data, setData, onContinue, onBack}: Props) {
	const [showPw, setShowPw] = useState(false)
	const [authMode, setAuthMode] = useState<'password' | '2fa'>(data.authMode || 'password')
	const [secretCopied, setSecretCopied] = useState(false)
	const [registerError, setRegisterError] = useState<string>('')
	const [otpDigits, setOtpDigits] = useState<string[]>(() => {
		if (data.otpCode) return data.otpCode.split('')
		return ['', '', '', '', '', '']
	})
	const otpRefs = useRef<Array<HTMLInputElement | null>>([])

	useEffect(() => {
		if (authMode === '2fa' && !data.otpSecret) {
			setData({...data, otpSecret: generateOtpSecret(), authMode: '2fa'})
		}
		if (authMode === 'password' && data.authMode !== 'password') {
			setData({...data, authMode: 'password'})
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [authMode])

	useEffect(() => {
		const code = otpDigits.join('')
		if (code !== (data.otpCode ?? '')) setData({...data, otpCode: code})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [otpDigits])

	const strength = passwordStrength(data.password)
	const match = Boolean(data.password) && Boolean(data.confirm) && data.password === data.confirm
	const mismatch = Boolean(data.confirm) && data.password !== data.confirm
	const issues = passwordIssues(data.password, data.name)

	const otpFilled = otpDigits.every((d) => /^\d$/.test(d))
	const canContinue =
		data.name.trim().length >= 2 &&
		(authMode === 'password' ? data.password.length >= 8 && match : otpFilled)

	/* tRPC wiring (password mode only — 2FA backend is a follow-up). */
	const loginMut = trpcReact.user.login.useMutation({
		onSuccess: (jwt) => {
			localStorage.setItem(JWT_LOCAL_STORAGE_KEY, jwt)
			wsClient.close()
			onContinue()
		},
		onError: (e) => setRegisterError(e.message),
	})
	const registerMut = trpcReact.user.register.useMutation({
		onSuccess: () => loginMut.mutate({password: data.password, totpToken: ''}),
		onError: (e) => {
			// "Attempted to register when user is already registered" — try login instead.
			if (/already registered/i.test(e.message)) {
				loginMut.mutate({password: data.password, totpToken: ''})
			} else {
				setRegisterError(e.message)
			}
		},
	})

	const isLoading = registerMut.isPending || loginMut.isPending

	const handleContinue = () => {
		setRegisterError('')
		if (authMode === 'password') {
			registerMut.mutate({name: data.name, password: data.password, language: data.lang})
		} else {
			// TODO 135-F-2FA: real TOTP enrollment endpoint. For now, advance the
			// wizard without backend verification so the visual flow still works.
			onContinue()
		}
	}

	const copySecret = () => {
		navigator.clipboard?.writeText(data.otpSecret || '').catch(() => {})
		setSecretCopied(true)
		setTimeout(() => setSecretCopied(false), 1400)
	}

	const regenSecret = () => {
		setData({...data, otpSecret: generateOtpSecret(), otpCode: ''})
		setOtpDigits(['', '', '', '', '', ''])
		setTimeout(() => otpRefs.current[0]?.focus(), 50)
	}

	const onOtpChange = (i: number, v: string) => {
		const digit = v.replace(/\D/g, '').slice(-1)
		const next = [...otpDigits]
		next[i] = digit
		setOtpDigits(next)
		if (digit && i < 5) otpRefs.current[i + 1]?.focus()
	}

	const onOtpKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Backspace' && !otpDigits[i] && i > 0) otpRefs.current[i - 1]?.focus()
		if (e.key === 'ArrowLeft' && i > 0) otpRefs.current[i - 1]?.focus()
		if (e.key === 'ArrowRight' && i < 5) otpRefs.current[i + 1]?.focus()
	}

	const onOtpPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
		const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
		if (!text) return
		e.preventDefault()
		const next = ['', '', '', '', '', '']
		for (let i = 0; i < text.length; i++) next[i] = text[i]
		setOtpDigits(next)
		const focusIdx = Math.min(text.length, 5)
		otpRefs.current[focusIdx]?.focus()
	}

	return (
		<div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
			<div className='fade-up'>
				<div className='onb-eyebrow'>02 · Account</div>
				<h1 className='onb-title' style={{marginTop: 8}}>
					Create your <em>account</em>
				</h1>
				<p className='onb-sub' style={{marginTop: 12}}>
					Your info stays on your Livinity. Secure it with a password — two-factor with an
					authenticator app is coming soon.
				</p>
			</div>

			<div className='auth-mode-toggle fade-up d1'>
				<button className={authMode === 'password' ? 'on' : ''} onClick={() => setAuthMode('password')}>
					<Icon name='lock' size={12} /> Password
				</button>
				{/* Phase 138 — Two-factor disabled until backend TOTP enrollment ships.
				    Visible greyed out + title so users know it's planned, not broken. */}
				<button
					className=''
					disabled
					title='Two-factor enrollment ships in Phase 138 — coming soon'
					style={{opacity: 0.4, cursor: 'not-allowed'}}
				>
					<Icon name='shield' size={12} /> Two-factor · soon
				</button>
			</div>

			<div className='field-card fade-up d2'>
				<div className='field-row'>
					<div className='lbl'>
						Your name<span className='req'>*</span>
					</div>
					<input
						className='input'
						type='text'
						placeholder='e.g. Bruce Oz'
						value={data.name}
						onChange={(e) => setData({...data, name: e.target.value})}
						autoFocus
					/>
				</div>

				{authMode === 'password' ? (
					<>
						<div className='field-row'>
							<div className='lbl'>
								Password<span className='req'>*</span>
							</div>
							<div>
								<div style={{position: 'relative'}}>
									<input
										className='input'
										type={showPw ? 'text' : 'password'}
										placeholder='At least 8 characters'
										value={data.password}
										onChange={(e) => setData({...data, password: e.target.value})}
										style={{paddingRight: 40}}
									/>
									<button
										type='button'
										onClick={() => setShowPw(!showPw)}
										style={{
											position: 'absolute',
											right: 10,
											top: '50%',
											transform: 'translateY(-50%)',
											color: 'var(--fg-mute)',
											padding: 6,
										}}
										aria-label='Toggle password visibility'
									>
										<Icon name={showPw ? 'eye-off' : 'eye'} size={15} />
									</button>
								</div>
								<div className='password-meter' data-strength={strength}>
									<span></span>
									<span></span>
									<span></span>
									<span></span>
								</div>
								{issues.length > 0 && (
									<div className='password-warnings'>
										{issues.map((iss, i) => (
											<div key={i} className={`pw-warn ${iss.level}`}>
												<Icon name='alert' size={11} /> {iss.text}
											</div>
										))}
									</div>
								)}
							</div>
						</div>
						<div className='field-row'>
							<div className='lbl'>
								Confirm<span className='req'>*</span>
							</div>
							<div>
								<input
									className='input'
									type={showPw ? 'text' : 'password'}
									placeholder='Type it again'
									value={data.confirm}
									onChange={(e) => setData({...data, confirm: e.target.value})}
								/>
								{match && (
									<div className='password-hint match'>
										<Icon name='check' size={12} /> Passwords match
									</div>
								)}
								{mismatch && <div className='password-hint mismatch'>Passwords don't match yet</div>}
							</div>
						</div>
					</>
				) : (
					<div className='field-row two-factor-row'>
						<div className='tfa-layout'>
							<div className='tfa-qr-side'>
								<FakeQR data={data.otpSecret || ''} />
								<div className='tfa-qr-hint'>Scan with your authenticator app</div>
							</div>
							<div className='tfa-input-side'>
								<div className='tfa-step'>
									<div className='tfa-num'>1</div>
									<div className='tfa-step-body'>
										<div className='tfa-step-title'>Install an authenticator</div>
										<div className='tfa-apps'>
											<span className='tfa-app'>Authy</span>
											<span className='tfa-app'>1Password</span>
											<span className='tfa-app'>Google Auth.</span>
										</div>
									</div>
								</div>
								<div className='tfa-step'>
									<div className='tfa-num'>2</div>
									<div className='tfa-step-body'>
										<div className='tfa-step-title'>Or paste this code manually</div>
										<div className='tfa-secret-row'>
											<code className='tfa-secret'>{formatSecret(data.otpSecret || '')}</code>
											<div className='tfa-secret-actions'>
												<button
													className={`seed-btn ${secretCopied ? 'ok' : ''}`}
													onClick={copySecret}
													title='Copy secret'
												>
													<Icon name={secretCopied ? 'check' : 'copy'} size={11} />
													{secretCopied ? 'Copied' : 'Copy'}
												</button>
												<button className='seed-btn' onClick={regenSecret} title='Regenerate secret'>
													<Icon name='sparkle' size={11} /> New
												</button>
											</div>
										</div>
									</div>
								</div>
								<div className='tfa-step'>
									<div className='tfa-num'>3</div>
									<div className='tfa-step-body'>
										<div className='tfa-step-title'>Enter the 6-digit code</div>
										<div className='tfa-otp' onPaste={onOtpPaste}>
											{otpDigits.map((d, i) => (
												<input
													key={i}
													ref={(el) => {
														otpRefs.current[i] = el
													}}
													className='tfa-otp-box'
													type='text'
													inputMode='numeric'
													pattern='[0-9]*'
													maxLength={1}
													value={d}
													onChange={(e) => onOtpChange(i, e.target.value)}
													onKeyDown={(e) => onOtpKey(i, e)}
													aria-label={`OTP digit ${i + 1}`}
												/>
											))}
										</div>
										{otpFilled && (
											<div className='password-hint match' style={{marginTop: 8}}>
												<Icon name='check' size={12} /> Ready to verify
											</div>
										)}
									</div>
								</div>
							</div>
						</div>
					</div>
				)}
			</div>

			<div className='warn-note fade-up d3'>
				<Icon name='shield' size={12} style={{marginRight: 6, verticalAlign: '-2px'}} />
				{authMode === 'password'
					? 'Your password is the master key. We cannot recover it.'
					: "Keep your authenticator app safe. Lose it and you'll need to recover via your Livinity device."}
			</div>

			{registerError && (
				<div className='warn-note fade-up d3' style={{color: 'var(--red)'}}>
					<Icon name='alert' size={12} style={{marginRight: 6, verticalAlign: '-2px'}} />
					{registerError}
				</div>
			)}

			<FooterBar
				onBack={onBack}
				onContinue={handleContinue}
				continueLabel={
					isLoading
						? 'Creating…'
						: authMode === 'password'
							? 'Create account'
							: 'Verify & continue'
				}
				continueDisabled={!canContinue || isLoading}
				hint='↵ to continue · esc for back'
			/>
		</div>
	)
}
