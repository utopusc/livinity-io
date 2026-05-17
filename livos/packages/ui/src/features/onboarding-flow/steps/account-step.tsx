import {useState} from 'react'
import QRCode from 'react-qr-code'

import {CopyableField} from '@/components/ui/copyable-field'
import {PinInput} from '@/components/ui/pin-input'
import {use2fa} from '@/hooks/use-2fa'
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

/* =========================================================
   AccountStep — name + password + confirm, then MANDATORY 2FA
   enrollment via the existing Settings flow (use2fa hook +
   trpcReact.user.generateTotpUri + enable2fa). 2FA is required
   for every new account per user directive 2026-05-17.
   ========================================================= */
type Props = {
	data: OnboardingData
	setData: (next: OnboardingData) => void
	onContinue: () => void
	onBack: () => void
}

type SubState = 'register' | 'enrolling-2fa'

export function AccountStep({data, setData, onContinue, onBack}: Props) {
	const [showPw, setShowPw] = useState(false)
	const [registerError, setRegisterError] = useState<string>('')
	const [subState, setSubState] = useState<SubState>('register')

	const strength = passwordStrength(data.password)
	const match = Boolean(data.password) && Boolean(data.confirm) && data.password === data.confirm
	const mismatch = Boolean(data.confirm) && data.password !== data.confirm
	const issues = passwordIssues(data.password, data.name)
	const canRegister = data.name.trim().length >= 2 && data.password.length >= 8 && match

	// 2FA hook from Settings (use-2fa.ts) — generateTotpUri + enable.
	const {totpUri, generateTotpUri, enable} = use2fa(() => {
		// onEnableChange(true) — 2FA flag flipped server-side. Advance to wallpaper.
		onContinue()
	})

	// Login mutation — fires after register; sets JWT + closes WS for re-auth.
	const loginMut = trpcReact.user.login.useMutation({
		onSuccess: (jwt) => {
			localStorage.setItem(JWT_LOCAL_STORAGE_KEY, jwt)
			wsClient.close()
			// Now logged in — kick off the TOTP URI fetch + flip the view.
			generateTotpUri()
			setSubState('enrolling-2fa')
		},
		onError: (e) => setRegisterError(e.message),
	})
	const registerMut = trpcReact.user.register.useMutation({
		onSuccess: () => loginMut.mutate({password: data.password, totpToken: ''}),
		onError: (e) => {
			// "Attempted to register when user is already registered" — fall through to login.
			if (/already registered/i.test(e.message)) {
				loginMut.mutate({password: data.password, totpToken: ''})
			} else {
				setRegisterError(e.message)
			}
		},
	})
	const isLoading = registerMut.isPending || loginMut.isPending

	const handleRegister = () => {
		setRegisterError('')
		registerMut.mutate({name: data.name, password: data.password, language: data.lang})
	}

	// PinInput's onCodeCheck wants Promise<boolean>; route through use2fa.enable.
	const onCodeCheck = async (code: string): Promise<boolean> => {
		try {
			const ok = await enable(code)
			return Boolean(ok)
		} catch {
			return false
		}
	}

	if (subState === 'enrolling-2fa') {
		return (
			<div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
				<div className='fade-up'>
					<div className='onb-eyebrow'>02 · Account</div>
					<h1 className='onb-title' style={{marginTop: 8}}>
						Secure with <em>two-factor</em>
					</h1>
					<p className='onb-sub' style={{marginTop: 12}}>
						Scan the QR with Authy, 1Password, or Google Authenticator. Enter the 6-digit code below to
						finish enrolling. Two-factor is required for your account.
					</p>
				</div>

				<div className='field-card fade-up d2' style={{padding: 24}}>
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							gap: 18,
						}}
					>
						<div
							style={{
								background: 'white',
								padding: 12,
								borderRadius: 12,
								width: 200,
								height: 200,
							}}
						>
							{totpUri ? (
								<QRCode
									size={256}
									style={{height: 'auto', maxWidth: '100%', width: '100%'}}
									value={totpUri}
									viewBox={`0 0 256 256`}
								/>
							) : (
								<div
									style={{
										width: '100%',
										height: '100%',
										display: 'grid',
										placeItems: 'center',
										color: 'var(--fg-mute)',
										fontSize: 12,
									}}
								>
									Loading…
								</div>
							)}
						</div>

						<div style={{width: '100%', maxWidth: 360}}>
							<div
								style={{
									textAlign: 'center',
									fontSize: 13,
									color: 'var(--fg-mute)',
									marginBottom: 8,
								}}
							>
								Or paste this URI in your app
							</div>
							{totpUri && <CopyableField value={totpUri} />}
						</div>

						<div
							style={{
								width: '100%',
								height: 1,
								background: 'var(--line)',
								margin: '4px 0',
							}}
						/>

						<div style={{textAlign: 'center'}}>
							<div style={{fontSize: 14, color: 'var(--fg)', marginBottom: 12}}>
								Enter the 6-digit code
							</div>
							<PinInput length={6} onCodeCheck={onCodeCheck} />
						</div>
					</div>
				</div>

				<div className='warn-note fade-up d3'>
					<Icon name='shield' size={12} style={{marginRight: 6, verticalAlign: '-2px'}} />
					Keep your authenticator app safe. If you lose it, you'll need to recover via this Livinity
					device.
				</div>
			</div>
		)
	}

	// subState === 'register'
	return (
		<div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
			<div className='fade-up'>
				<div className='onb-eyebrow'>02 · Account</div>
				<h1 className='onb-title' style={{marginTop: 8}}>
					Create your <em>account</em>
				</h1>
				<p className='onb-sub' style={{marginTop: 12}}>
					Your info stays on your Livinity. Pick a strong password — you'll set up two-factor on the
					next step.
				</p>
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
			</div>

			<div className='warn-note fade-up d3'>
				<Icon name='shield' size={12} style={{marginRight: 6, verticalAlign: '-2px'}} />
				Your password is the master key. We cannot recover it. Two-factor is required and set up next.
			</div>

			{registerError && (
				<div className='warn-note fade-up d3' style={{color: 'var(--red)'}}>
					<Icon name='alert' size={12} style={{marginRight: 6, verticalAlign: '-2px'}} />
					{registerError}
				</div>
			)}

			<FooterBar
				onBack={onBack}
				onContinue={handleRegister}
				continueLabel={isLoading ? 'Creating…' : 'Create account'}
				continueDisabled={!canRegister || isLoading}
				hint='↵ to continue · esc for back'
			/>
		</div>
	)
}
