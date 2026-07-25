import {useState} from 'react'
import QRCode from 'react-qr-code'
import {useCopyToClipboard} from 'react-use'

import {CopyableField} from '@/components/ui/copyable-field'
import {PinInput} from '@/components/ui/pin-input'
import {use2fa} from '@/hooks/use-2fa'
import {getClockSkewSeconds} from '@/modules/auth/clock-skew'
import {JWT_LOCAL_STORAGE_KEY} from '@/modules/auth/shared'
import {trpcReact, wsClient} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

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
   AccountStep — name + password + confirm, then an OPTIONAL 2FA
   enrollment offer via the existing Settings flow (use2fa hook +
   trpcReact.user.generateTotpUri + enable2fa).

   2FA was mandatory here from 2026-05-17 until Phase 368.7
   (2026-07-25), when it became optional by operator decision: two
   external testers could not get past this screen and never saw the
   product at all. Two defects combined —

     1. the enrol sub-state rendered no FooterBar, so its ONLY exit was
        onContinue(), and
     2. onContinue() is driven by use2fa's onEnableChange callback, which
        Phase 328 (IDENT-05) stopped firing whenever the server returns
        one-time recovery codes — which, for a DB-backed session, is
        ALWAYS (user/routes.ts enable2fa).

   So a correct code enabled 2FA server-side and then stranded the user on
   a screen with no way forward. Both are fixed below: recovery codes are
   now surfaced and acknowledged (completing the flow), and the screen has
   a "Skip for now" exit. Skipping leaves 2FA off, which is a supported
   state — security.require2fa defaults to false, and Settings → Security
   can enrol later.
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
	// recoveryCodes + confirmEnrolled are REQUIRED here, not optional extras: on a
	// DB-backed session enable2fa always returns codes, and use2fa deliberately
	// withholds onEnableChange until confirmEnrolled() acknowledges them. Consuming
	// only {totpUri, generateTotpUri, enable} is what dead-ended the wizard.
	const {totpUri, generateTotpUri, enable, recoveryCodes, confirmEnrolled} = use2fa(() => {
		// onEnableChange(true) — 2FA flag flipped server-side. Advance to wallpaper.
		onContinue()
	})
	const showRecovery = Boolean(recoveryCodes && recoveryCodes.length > 0)

	const utils = trpcReact.useUtils()
	const [codeError, setCodeError] = useState('')
	// ONB-03: set when the server reports the account is already enrolled — the one
	// state in which the wizard must offer a plain Continue, because there is
	// nothing left for the user to do here.
	const [alreadyEnabled, setAlreadyEnabled] = useState(false)
	const [, copyToClipboard] = useCopyToClipboard()
	const [copiedCodes, setCopiedCodes] = useState(false)

	// Login mutation — fires after register; sets JWT + closes WS for re-auth.
	const loginMut = trpcReact.user.login.useMutation({
		onSuccess: (jwt) => {
			localStorage.setItem(JWT_LOCAL_STORAGE_KEY, jwt)
			wsClient.close()
			setSubState('enrolling-2fa')
			// Defer the TOTP URI fetch until the WS has had a moment to reconnect
			// with the new JWT. Even though user.generateTotpUri is in
			// httpOnlyPaths (livinityd common.ts), the tRPC client's split-link
			// can briefly race during reconnect. The small delay + the HTTP
			// transport together make this reliable.
			setTimeout(() => generateTotpUri(), 250)
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
	//
	// ONB-03: this catch used to be bare (`catch { return false }`), which is how the
	// dead end became inescapable. Once the first code has enrolled the account,
	// enable2fa short-circuits on its `alreadyEnabled` guard (user/routes.ts) and
	// throws BEFORE it ever verifies the token — so every subsequent attempt, even a
	// perfectly good code from a freshly scanned QR, produced the exact same red
	// shake as a wrong code. The user is told they keep failing at something they
	// already completed. Distinguish the three outcomes instead.
	const onCodeCheck = async (code: string): Promise<boolean> => {
		try {
			const ok = await enable(code)
			setCodeError('')
			return Boolean(ok)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)

			if (/already enabled/i.test(message)) {
				setAlreadyEnabled(true)
				setCodeError(t('onboarding.2fa.already-enabled'))
				return false
			}

			// SKEW-01: a rejected code usually does not mean the user mistyped — the
			// authenticator is right and the BOX's clock has drifted outside the ±300s
			// window, which rejects every code from every app identically. Name it,
			// otherwise the user re-scans forever with no way to know what is wrong.
			const skew = await getClockSkewSeconds(utils)
			setCodeError(
				skew === null
					? t('onboarding.2fa.rejected')
					: t('2fa.error.clock-skew', {minutes: Math.max(1, Math.round(Math.abs(skew) / 60))}),
			)
			return false
		}
	}

	const handleSkip = () => {
		setCodeError('')
		onContinue()
	}

	// Enrolment succeeded and the server handed back one-time recovery codes. They
	// are shown exactly once — there is no query that can re-read them (they are
	// DEK-encrypted at rest), and without one a drifted clock or a lost phone means
	// a permanently locked box. Acknowledging them calls confirmEnrolled(), which is
	// what finally fires onEnableChange → onContinue and completes the wizard.
	if (subState === 'enrolling-2fa' && showRecovery) {
		const codes = recoveryCodes ?? []
		const copyAll = () => {
			copyToClipboard(codes.join('\n'))
			setCopiedCodes(true)
			setTimeout(() => setCopiedCodes(false), 1500)
		}
		const downloadCodes = () => {
			const blob = new Blob([codes.join('\n') + '\n'], {type: 'text/plain'})
			const url = window.URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			a.download = 'livinity-recovery-codes.txt'
			document.body.appendChild(a)
			a.click()
			document.body.removeChild(a)
			setTimeout(() => window.URL.revokeObjectURL(url), 0)
		}

		return (
			<div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
				<div className='fade-up'>
					<div className='onb-eyebrow'>02 · Account</div>
					<h1 className='onb-title' style={{marginTop: 8}}>
						{t('2fa.recovery.title')}
					</h1>
					<p className='onb-sub' style={{marginTop: 12}}>
						{t('2fa.recovery.sub')}
					</p>
				</div>

				<div className='field-card fade-up d2' style={{padding: 24}}>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(2, 1fr)',
							gap: 8,
							fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
							fontSize: 13,
							textAlign: 'center',
						}}
					>
						{codes.map((code) => (
							<span key={code} style={{userSelect: 'all', letterSpacing: '0.04em'}}>
								{code}
							</span>
						))}
					</div>
					<div style={{display: 'flex', justifyContent: 'center', gap: 10, marginTop: 18}}>
						<button className='btn btn-text' onClick={copyAll}>
							{copiedCodes ? t('clipboard.copied') : t('2fa.recovery.copy')}
						</button>
						<button className='btn btn-text' onClick={downloadCodes}>
							{t('2fa.recovery.download')}
						</button>
					</div>
				</div>

				<div className='warn-note fade-up d3'>
					<Icon name='shield' size={12} style={{marginRight: 6, verticalAlign: '-2px'}} />
					{t('2fa.recovery.lost-device-note')}
				</div>

				<FooterBar onContinue={confirmEnrolled} continueLabel={t('2fa.recovery.done')} hint='↵ to continue' />
			</div>
		)
	}

	if (subState === 'enrolling-2fa') {
		return (
			<div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
				<div className='fade-up'>
					<div className='onb-eyebrow'>02 · Account</div>
					<h1 className='onb-title' style={{marginTop: 8}}>
						{t('onboarding.2fa.title')}
					</h1>
					<p className='onb-sub' style={{marginTop: 12}}>
						{t('onboarding.2fa.sub')}
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
								{t('2fa.enable.or-paste')}
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
								{t('onboarding.2fa.enter-code')}
							</div>
							<PinInput length={6} onCodeCheck={onCodeCheck} />
						</div>
					</div>
				</div>

				{codeError && (
					<div className='warn-note fade-up d3' style={{color: 'var(--red)'}}>
						<Icon name='alert' size={12} style={{marginRight: 6, verticalAlign: '-2px'}} />
						{codeError}
					</div>
				)}

				<div className='warn-note fade-up d3'>
					<Icon name='shield' size={12} style={{marginRight: 6, verticalAlign: '-2px'}} />
					{t('onboarding.2fa.optional-note')}
				</div>

				{/* The exit this screen never had (ONB-02). "Skip for now" is the TEXT
				    button deliberately: the wizard's global Enter handler clicks
				    `.btn-primary:not(:disabled)` in the active step (setup-wizard-v2.tsx),
				    so putting skip on the primary would let a stray Enter silently
				    decline two-factor. The primary stays disabled and only lights up in
				    the one state where continuing is the correct action — the account is
				    already enrolled and there is nothing left to do here (ONB-03). */}
				<FooterBar
					onBack={onBack}
					onSkip={handleSkip}
					skipLabel={t('onboarding.2fa.skip')}
					onContinue={onContinue}
					continueLabel={t('onboarding.2fa.continue')}
					continueDisabled={!alreadyEnabled}
					hint='esc for back'
				/>
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
					{t('onboarding.account.sub')}
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
				Your password is the master key. We cannot recover it. Two-factor is offered next and can be
				added any time from Settings.
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
