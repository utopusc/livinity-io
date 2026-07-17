/**
 * Phase 334 (STEPUP-01, D-334-3/4) — sudo-mode step-up re-auth provider.
 *
 * One app-level dialog (ConfirmationProvider discipline: context + refs for the
 * pending promise so requests don't re-render the tree). A sensitive mutation
 * that fails with the server's STEP_UP_REQUIRED denial is retried by the
 * useStepUp() hook AFTER the user re-verifies here with ONE fresh factor:
 *   - password  (always offered — every account has one)
 *   - TOTP code (offered when 2FA is enrolled)
 *   - passkey   (offered when WebAuthn is available AND a credential is enrolled)
 * A success mints the 5-min LIVINITY_STEPUP grant cookie server-side
 * (stepUp.verifyPassword / verifyTotp / passkeyVerify), then the pending
 * promise resolves and the caller retries the original mutation. Closing the
 * dialog rejects with StepUpCancelledError (callers treat it as a silent no-op).
 */
import {startAuthentication} from '@simplewebauthn/browser'
import React, {createContext, useCallback, useContext, useRef, useState} from 'react'

import {PinInput} from '@/components/ui/pin-input'
import {Button} from '@/shadcn-components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogPortal,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {PasswordInput} from '@/shadcn-components/ui/input'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

/** The server-side denial message requireStepUpGrant throws (step-up-guard.ts). */
export const STEP_UP_REQUIRED = 'STEP_UP_REQUIRED'

/** True when a tRPC mutation was refused for lack of a step-up grant. */
export function isStepUpRequired(error: unknown): boolean {
	return (error as {message?: string} | null | undefined)?.message === STEP_UP_REQUIRED
}

/** Thrown by withStepUp when the user dismisses the dialog without verifying. */
export class StepUpCancelledError extends Error {
	constructor() {
		super('step-up-cancelled')
		this.name = 'StepUpCancelledError'
	}
}

export function isStepUpCancelled(error: unknown): boolean {
	return (error as {name?: string} | null | undefined)?.name === 'StepUpCancelledError'
}

type StepUpContextType = {
	/** Opens the re-auth dialog; resolves once a grant is minted, rejects with StepUpCancelledError on dismiss. */
	requestStepUp: () => Promise<void>
}

const StepUpContext = createContext<StepUpContextType | undefined>(undefined)

export function useStepUpContext(): StepUpContextType {
	const ctx = useContext(StepUpContext)
	if (!ctx) throw new Error('useStepUp must be used within a StepUpProvider')
	return ctx
}

type Method = 'password' | 'totp' | 'passkey'

export const StepUpProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
	const [open, setOpen] = useState(false)
	const resolveRef = useRef<(() => void) | null>(null)
	const rejectRef = useRef<((reason: unknown) => void) | null>(null)

	const requestStepUp = useCallback(() => {
		return new Promise<void>((resolve, reject) => {
			resolveRef.current = resolve
			rejectRef.current = reject
			setOpen(true)
		})
	}, [])

	const settle = useCallback((verified: boolean) => {
		if (verified) resolveRef.current?.()
		else rejectRef.current?.(new StepUpCancelledError())
		resolveRef.current = null
		rejectRef.current = null
		setOpen(false)
	}, [])

	return (
		<StepUpContext.Provider value={{requestStepUp}}>
			{children}
			<StepUpDialog open={open} onSettle={settle} />
		</StepUpContext.Provider>
	)
}

function StepUpDialog({open, onSettle}: {open: boolean; onSettle: (verified: boolean) => void}) {
	const [method, setMethod] = useState<Method>('password')
	const [password, setPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)

	const utils = trpcReact.useUtils()
	// Branch availability — queried lazily while the dialog is open. Password is
	// ALWAYS offered; TOTP/passkey only when actually usable for this user.
	const twoFaQ = trpcReact.user.is2faEnabled.useQuery(undefined, {enabled: open})
	const webauthnQ = trpcReact.user.webauthnAvailable.useQuery(undefined, {enabled: open})
	const passkeysQ = trpcReact.user.listPasskeys.useQuery(undefined, {enabled: open})
	const totpAvailable = twoFaQ.data === true
	const passkeyAvailable = (webauthnQ.data?.available ?? false) && (passkeysQ.data?.length ?? 0) > 0

	const verifyPasswordMut = trpcReact.stepUp.verifyPassword.useMutation()
	const verifyTotpMut = trpcReact.stepUp.verifyTotp.useMutation()
	const passkeyVerifyMut = trpcReact.stepUp.passkeyVerify.useMutation()

	// Reset transient state whenever the dialog (re)opens.
	const wasOpen = useRef(false)
	if (open && !wasOpen.current) {
		wasOpen.current = true
	} else if (!open && wasOpen.current) {
		wasOpen.current = false
	}

	const finishSuccess = () => {
		setPassword('')
		setError(null)
		setMethod('password')
		onSettle(true)
	}

	const submitPassword = async () => {
		if (!password || busy) return
		setBusy(true)
		setError(null)
		try {
			await verifyPasswordMut.mutateAsync({password})
			finishSuccess()
		} catch {
			setError(t('step-up.error'))
		} finally {
			setBusy(false)
		}
	}

	const submitTotp = async (code: string) => {
		try {
			await verifyTotpMut.mutateAsync({token: code})
			finishSuccess()
			return true
		} catch {
			return false
		}
	}

	const submitPasskey = async () => {
		if (busy) return
		setBusy(true)
		setError(null)
		try {
			const options = await utils.stepUp.passkeyOptions.fetch()
			const assertion = await startAuthentication({optionsJSON: options as never})
			await passkeyVerifyMut.mutateAsync({response: assertion})
			finishSuccess()
		} catch (err) {
			const name = (err as {name?: string})?.name
			// A cancelled browser prompt is not an error — just stay on the dialog.
			if (name !== 'NotAllowedError' && name !== 'AbortError') {
				setError(t('step-up.error'))
			}
		} finally {
			setBusy(false)
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) {
					setPassword('')
					setError(null)
					setMethod('password')
					onSettle(false)
				}
			}}
		>
			<DialogPortal>
				<DialogContent className='flex flex-col gap-5'>
					<DialogHeader>
						<DialogTitle>{t('step-up.title')}</DialogTitle>
					</DialogHeader>
					<p className='text-body-sm text-text-secondary'>{t('step-up.description')}</p>

					{method === 'password' ? (
						<form
							onSubmit={(e) => {
								e.preventDefault()
								void submitPassword()
							}}
							className='flex flex-col gap-3'
						>
							<PasswordInput autoFocus label={t('step-up.password-label')} value={password} onValueChange={setPassword} />
							<Button type='submit' size='dialog' variant='primary' disabled={!password || busy}>
								{t('step-up.confirm')}
							</Button>
						</form>
					) : null}

					{method === 'totp' ? (
						<div className='flex flex-col items-center gap-3'>
							<p className='text-body-sm text-text-secondary text-center'>{t('step-up.totp-hint')}</p>
							<PinInput autoFocus length={6} onCodeCheck={submitTotp} />
						</div>
					) : null}

					{method === 'passkey' ? (
						<div className='flex flex-col gap-3'>
							<p className='text-body-sm text-text-secondary'>{t('step-up.passkey-hint')}</p>
							<Button size='dialog' variant='primary' disabled={busy} onClick={() => void submitPasskey()}>
								{t('step-up.passkey-button')}
							</Button>
						</div>
					) : null}

					{error ? <p className='text-13 text-red-400'>{error}</p> : null}

					{/* Alternative-factor switcher — only real options are shown. */}
					<div className='flex flex-wrap items-center gap-2'>
						{method !== 'password' ? (
							<Button size='sm' variant='default' onClick={() => setMethod('password')}>
								{t('step-up.use-password')}
							</Button>
						) : null}
						{totpAvailable && method !== 'totp' ? (
							<Button size='sm' variant='default' onClick={() => setMethod('totp')}>
								{t('step-up.use-totp')}
							</Button>
						) : null}
						{passkeyAvailable && method !== 'passkey' ? (
							<Button size='sm' variant='default' onClick={() => setMethod('passkey')}>
								{t('step-up.use-passkey')}
							</Button>
						) : null}
					</div>
				</DialogContent>
			</DialogPortal>
		</Dialog>
	)
}
