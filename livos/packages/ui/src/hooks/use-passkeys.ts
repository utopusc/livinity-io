import {startRegistration} from '@simplewebauthn/browser'
import {useCallback, useState} from 'react'

import {toast} from '@/components/ui/toast'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

// Phase 323-04 (IDENT-03) — passkey enroll + manage hook. Clones use-2fa.ts in
// discipline (mutation/query wrapper + invalidation + toast) but has NO QR/PinInput
// body: the browser WebAuthn ceremony (@simplewebauthn/browser startRegistration,
// bundled in 323-03) REPLACES the TOTP secret/QR exchange. Enrollment runs against
// the 323-02 privateProcedure pair (webauthnRegisterOptions -> startRegistration ->
// webauthnRegisterVerify) — enroll-while-authenticated only (D-03). listPasskeys +
// deletePasskey drive the settings manage list (both user-scoped server-side; a user
// only ever sees/deletes their OWN credentials — T-323-13).
export function usePasskeys() {
	const ctx = trpcReact.useUtils()

	// LAN-IP gate: on a bare-IP box resolveRpId(mainDomain) is null so WebAuthn is
	// unavailable — the section renders the RP-ID-unavailable note INSTEAD of the
	// enroll button (never a dead button). Defaults false until the query resolves.
	const availableQ = trpcReact.user.webauthnAvailable.useQuery()
	const webauthnAvailable = availableQ.data?.available ?? false

	// The manage list: the current user's enrolled credentials (nickname + created_at).
	const listQ = trpcReact.user.listPasskeys.useQuery()

	const verifyMut = trpcReact.user.webauthnRegisterVerify.useMutation({
		onSuccess: () => {
			ctx.user.listPasskeys.invalidate()
			toast.success(t('auth-passkey.enroll.success'))
		},
	})

	const deleteMut = trpcReact.user.deletePasskey.useMutation({
		onSuccess: () => {
			ctx.user.listPasskeys.invalidate()
			toast.success(t('auth-passkey.enroll.delete-success'))
		},
	})

	const [enrolling, setEnrolling] = useState(false)

	// enroll — fetch server registration options, run the browser attestation
	// ceremony, then verify server-side. A cancelled prompt (NotAllowedError /
	// AbortError) is swallowed silently; any other failure toasts but never locks
	// the user out (password + TOTP stay reachable — additive, D-03).
	const enroll = useCallback(async () => {
		if (!webauthnAvailable) return
		setEnrolling(true)
		try {
			const options = await ctx.user.webauthnRegisterOptions.fetch()
			const attResp = await startRegistration({optionsJSON: options})
			await verifyMut.mutateAsync({response: attResp})
		} catch (error) {
			const name = (error as {name?: string})?.name
			if (name !== 'NotAllowedError' && name !== 'AbortError') {
				toast.error(t('auth-passkey.enroll.failed'))
			}
		} finally {
			setEnrolling(false)
		}
	}, [ctx, verifyMut, webauthnAvailable])

	const remove = useCallback(
		async (credentialId: string) => {
			await deleteMut.mutateAsync({credentialId})
		},
		[deleteMut],
	)

	return {
		webauthnAvailable,
		availabilityLoading: availableQ.isLoading,
		passkeys: listQ.data ?? [],
		passkeysLoading: listQ.isLoading,
		enroll,
		enrolling,
		remove,
		removing: deleteMut.isPending,
	}
}
