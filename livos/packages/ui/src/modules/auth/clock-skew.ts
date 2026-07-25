// SKEW-01 (Phase 368.7) — turn "Incorrect 2FA code" into an explanation.
//
// TOTP verification accepts a ±300s window around the SERVER clock (measured
// empirically in livinityd's totp-forensics.repro.test.ts). A box whose clock has
// drifted past that rejects every code from every authenticator identically, and
// the only feedback the user gets is "Incorrect 2FA code" — which sends them to
// re-scan the QR, reinstall their authenticator, and eventually give up, because
// nothing on screen points at the real culprit. This is precisely what happened to
// two external testers on virtualised boxes without time sync.
//
// The browser's clock is OS-synced in practice, so comparing against it measures
// the box's error directly. This is diagnosis only — it never participates in
// verification and never relaxes the window.

import {trpcReact} from '@/trpc/trpc'

type TrpcUtils = ReturnType<typeof trpcReact.useUtils>

/**
 * Returns the server's clock error in seconds (positive = the box is ahead of this
 * device) when it exceeds `thresholdSeconds`, or `null` when the clock is fine or
 * the probe itself fails. Never throws: a failed diagnosis must never replace the
 * real error the caller is already reporting.
 */
export async function getClockSkewSeconds(utils: TrpcUtils, thresholdSeconds = 60): Promise<number | null> {
	try {
		const {skewSeconds} = await utils.user.clockCheck.fetch({clientTime: Date.now()})
		return Math.abs(skewSeconds) > thresholdSeconds ? skewSeconds : null
	} catch {
		return null
	}
}

/** "12 minutes ahead of" / "3 hours behind" — reads inside a sentence about this device. */
export function formatClockSkew(skewSeconds: number): string {
	const absolute = Math.abs(skewSeconds)
	const direction = skewSeconds > 0 ? 'ahead of' : 'behind'

	let amount: string
	if (absolute >= 3600) {
		const hours = Math.round(absolute / 3600)
		amount = `${hours} hour${hours === 1 ? '' : 's'}`
	} else if (absolute >= 60) {
		const minutes = Math.round(absolute / 60)
		amount = `${minutes} minute${minutes === 1 ? '' : 's'}`
	} else {
		amount = `${absolute} seconds`
	}

	return `${amount} ${direction}`
}
