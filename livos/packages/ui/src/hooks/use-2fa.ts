import {useCallback, useState} from 'react'

import {toast} from '@/components/ui/toast'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

export function use2fa(onEnableChange?: (enabled: boolean) => void) {
	const ctx = trpcReact.useUtils()

	const enableMut = trpcReact.user.enable2fa.useMutation({
		onSuccess: (data) => {
			ctx.user.is2faEnabled.invalidate()
			// IDENT-05: a DB user enrol returns one-time recovery codes — keep the
			// enrol dialog OPEN so the caller can display them, then close it via
			// confirmEnrolled() once acknowledged. The legacy YAML path returns no
			// recovery codes, so it closes immediately (unchanged behaviour).
			const codes = (data as {recoveryCodes?: string[]} | undefined)?.recoveryCodes
			if (!codes || codes.length === 0) {
				setTimeout(() => {
					toast.success(t('2fa.enable.success'))
					onEnableChange?.(true)
				}, 500)
			}
		},
	})

	const disableMut = trpcReact.user.disable2fa.useMutation({
		onSuccess: () => {
			ctx.user.is2faEnabled.invalidate()
			setTimeout(() => {
				toast.success(t('2fa.disable.success'))
				onEnableChange?.(false)
			}, 500)
		},
	})

	// Phase 368.8-11 — this hook deliberately does NOT query user.is2faEnabled.
	// It used to, ungated, which meant EVERY consumer subscribed to that read —
	// including onboarding's account-step.tsx:100, which calls use2fa() while the
	// box is still unauthenticated (setup-wizard-v2.tsx:56: "covers unauth steps
	// 0-1 before AccountStep registers + logs in"). Since user.is2faEnabled is now
	// a privateProcedure (it must be, to see WHICH user is asking), a pre-auth
	// subscriber would 401 on every fresh-box onboarding. Only one consumer ever
	// read the value — routes/settings/2fa.tsx — and it now queries it directly.
	// The two invalidate() calls above are intentionally KEPT: they are correct no
	// matter who holds the query, and without them the Settings card would show a
	// stale enabled/disabled state right after an enrol.

	// TOTP URI
	const [totpUri, setTotpUri] = useState('')
	const generateTotpUri = useCallback(() => {
		ctx.user.generateTotpUri.fetch().then((res) => setTotpUri(res))
	}, [ctx])

	const enable = useCallback(
		// PinInput's onCodeCheck expects Promise<boolean>. The mutation now resolves
		// to {recoveryCodes} (DB path), so we normalise to a boolean here — the codes
		// are read separately from enableMut.data via `recoveryCodes` below.
		async (totpToken: string): Promise<boolean> => {
			await enableMut.mutateAsync({totpToken, totpUri})
			return true
		},
		[enableMut, totpUri],
	)

	const disable = useCallback(
		async (totpToken: string) => {
			return disableMut.mutateAsync({totpToken})
		},
		[disableMut],
	)

	// One-time recovery codes returned by the DB enrol path (undefined on the
	// legacy YAML path). Shown ONCE in the enrol dialog, never re-fetchable.
	const recoveryCodes = (enableMut.data as {recoveryCodes?: string[]} | undefined)?.recoveryCodes

	// Called by the enrol dialog once the user acknowledges their recovery codes;
	// fires the success toast and closes the dialog (DB path completion).
	const confirmEnrolled = useCallback(() => {
		toast.success(t('2fa.enable.success'))
		onEnableChange?.(true)
	}, [onEnableChange])

	return {
		enable,
		disable,
		totpUri,
		generateTotpUri,
		recoveryCodes,
		confirmEnrolled,
	}
}
