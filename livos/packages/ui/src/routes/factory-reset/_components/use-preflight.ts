// Phase 38 Plan 03 — React hook wrapper around preflightFetchLivinity.
// Runs ONCE per modal-open (D-PF-02 last paragraph). Caller passes `enabled`
// which goes false when the modal closes; the next open re-mounts this hook
// (because the modal unmounts when closed) and triggers a fresh check.
//
// 5-second timeout per D-PF-02 — passed to AbortController via the lib helper.

import {useEffect, useRef, useState} from 'react'

import {
	DEFAULT_PREFLIGHT_TIMEOUT_MS,
	preflightFetchLivinity,
	type PreflightResult,
} from '@/features/factory-reset/lib/network-preflight'

export interface UsePreflightState {
	inFlight: boolean
	result: PreflightResult | null
}

export function usePreflight(
	opts: {enabled: boolean; fetchImpl?: typeof fetch} = {enabled: true},
): UsePreflightState {
	const [state, setState] = useState<UsePreflightState>({inFlight: opts.enabled, result: null})
	const ranRef = useRef(false)

	useEffect(() => {
		if (!opts.enabled) return
		if (ranRef.current) return
		ranRef.current = true
		let cancelled = false
		setState({inFlight: true, result: null})
		preflightFetchLivinity({
			timeoutMs: DEFAULT_PREFLIGHT_TIMEOUT_MS,
			fetchImpl: opts.fetchImpl,
		}).then((result) => {
			if (cancelled) return
			setState({inFlight: false, result})
		})
		return () => {
			cancelled = true
		}
	}, [opts.enabled, opts.fetchImpl])

	return state
}
