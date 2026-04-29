// Phase 38 Plan 03 — pure decision function for the destructive Confirm button.
// Implements D-PF-01 + D-CF-02 precedence:
//   1. mutation-pending     -> disabled, "Reset already in progress…"
//   2. update-running       -> disabled, "An update is currently running. Try again after it completes."
//   3. preflight-in-flight  -> disabled, "Checking network…"
//   4. network-unreachable  -> disabled, "Cannot reach livinity.io. Reinstall would fail. Check your internet connection and try again."
//   5. typed-confirm-mismatch -> disabled, "Type FACTORY RESET (case-sensitive) to enable."
//   6. else                 -> enabled, tooltip null
//
// CALLER MUST also call isFactoryResetTrigger() (Plan 01) to derive
// `typedConfirm` — this function only encodes the precedence chain.

export interface PreflightInputs {
	/** Result of `isFactoryResetTrigger(input.value)` — strict-equality matcher. */
	typedConfirm: boolean
	/** From `trpc.system.updateStatus.useQuery().data?.running === true`. */
	updateRunning: boolean
	/** `null` while preflight is in flight; `true|false` once settled. */
	networkReachable: boolean | null
	/** True while the underlying preflight fetch hasn't returned yet. */
	preflightInFlight: boolean
	/** True after the user clicked Confirm — single-shot guard. */
	mutationPending: boolean
}

export interface PreflightDecision {
	enabled: boolean
	/** Tooltip text shown next to the disabled button; `null` when enabled. */
	reason: string | null
}

export function computeConfirmEnabled(input: PreflightInputs): PreflightDecision {
	if (input.mutationPending) {
		return {enabled: false, reason: 'Reset already in progress…'}
	}
	if (input.updateRunning) {
		return {
			enabled: false,
			reason: 'An update is currently running. Try again after it completes.',
		}
	}
	if (input.preflightInFlight || input.networkReachable === null) {
		return {enabled: false, reason: 'Checking network…'}
	}
	if (input.networkReachable === false) {
		return {
			enabled: false,
			reason: 'Cannot reach livinity.io. Reinstall would fail. Check your internet connection and try again.',
		}
	}
	if (!input.typedConfirm) {
		return {enabled: false, reason: 'Type FACTORY RESET (case-sensitive) to enable.'}
	}
	return {enabled: true, reason: null}
}
