// Phase 38 Plan 01 — D-OV-03 status-text mapping for the BarePage overlay.
//
// Pure derivation: given the most recent JSON event row (Phase 37 D-EVT-02
// schema), compute (a) the UI sub-state (used as a discriminator in the
// overlay component) and (b) the human-readable status text. Plan 04's overlay
// poller calls these on every refetch of `system.listUpdateHistory`.
//
// The 3 in-progress sub-states are derived from the duration fields the bash
// fills in incrementally:
//   - wipe_duration_ms === 0          → "stopping-services"
//   - wipe_duration_ms > 0,
//     reinstall_duration_ms === 0     → "fetching-install-sh"
//   - reinstall_duration_ms > 0       → "reinstalling"
// Terminal states (success/failed/rolled-back) fall straight through from the
// `status` field — the bash sets `status` to its terminal value as the LAST
// write, so any value of the duration fields is valid in those states.

import type {FactoryResetEvent, FactoryResetUiState} from './types'

export type FactoryResetUiStateOrUnknown = FactoryResetUiState | 'unknown'

export function deriveFactoryResetState(
	event: FactoryResetEvent | null,
): FactoryResetUiStateOrUnknown {
	if (!event) return 'unknown'
	switch (event.status) {
		case 'success':
			return 'success'
		case 'failed':
			return 'failed'
		case 'rolled-back':
			return 'rolled-back'
		case 'in-progress': {
			if (event.wipe_duration_ms === 0) return 'stopping-services'
			if (event.reinstall_duration_ms === 0) return 'fetching-install-sh'
			return 'reinstalling'
		}
	}
}

export function stateLabel(
	state: FactoryResetUiStateOrUnknown,
	source: 'live' | 'cache' | null,
): string {
	switch (state) {
		case 'stopping-services':
			return 'Stopping services and stashing API key…'
		case 'fetching-install-sh':
			return 'Wipe complete. Fetching install.sh…'
		case 'reinstalling':
			return `Reinstalling LivOS… (${source ?? 'live'} install.sh source)`
		case 'success':
			return 'Reinstall complete. Redirecting…'
		case 'failed':
			return 'Reinstall failed.'
		case 'rolled-back':
			return 'Rolled back to pre-reset snapshot.'
		case 'unknown':
		default:
			return 'Connecting to LivOS…'
	}
}
