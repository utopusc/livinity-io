// Phase 38 Plan 04 — D-OV-04 polling display state.
//
// Pure derivation of the overlay display-state from the latest event +
// query-failure inputs. The overlay component owns the React-y bits (the
// failure clock, refetchInterval, useEffect wiring); this module only encodes
// the rules:
//
//   queryFailing=false                        → "live" mode, state-machine label
//   queryFailing=true, < 90s consecutive      → "reconnecting" mode
//   queryFailing=true, ≥ 90s consecutive      → "manual-recovery" mode + hint
//
// 90s threshold is locked by D-OV-04. Exporting it as a const lets tests
// override it via `recoveryThresholdMs` for fast assertions, while production
// callers leave it at default.

import type {FactoryResetEvent} from './types'
import {deriveFactoryResetState, stateLabel} from './state-machine'

// D-OV-04: 90 seconds of consecutive query failures triggers manual-recovery
// hint. The hint replaces the dynamic state label but the overlay does NOT
// redirect — the user might be momentarily disconnected during the brief
// livinityd-restart window between wipe-end and reinstall-start.
export const CONSECUTIVE_FAILURE_RECOVERY_THRESHOLD_MS = 90_000

export type PollingDisplayMode = 'live' | 'reconnecting' | 'manual-recovery'

export interface PollingDisplayState {
	mode: PollingDisplayMode
	label: string
	hint?: string
}

export interface PollingInputs {
	lastEvent: FactoryResetEvent | null
	queryFailing: boolean
	/** Milliseconds of consecutive failure (0 when not failing). */
	consecutiveFailureMs: number
	/** Override threshold for tests; defaults to D-OV-04 90s. */
	recoveryThresholdMs?: number
}

export function computePollingDisplayState(input: PollingInputs): PollingDisplayState {
	const threshold = input.recoveryThresholdMs ?? CONSECUTIVE_FAILURE_RECOVERY_THRESHOLD_MS
	if (input.queryFailing) {
		if (input.consecutiveFailureMs >= threshold) {
			return {
				mode: 'manual-recovery',
				label: 'Connection lost.',
				hint: 'Wait or check `/diagnostic` (manual SSH).',
			}
		}
		return {
			mode: 'reconnecting',
			label: 'Reconnecting to LivOS…',
		}
	}
	// Live mode: derive from the latest event
	const state = deriveFactoryResetState(input.lastEvent)
	const source = input.lastEvent?.install_sh_source ?? null
	return {mode: 'live', label: stateLabel(state, source)}
}
