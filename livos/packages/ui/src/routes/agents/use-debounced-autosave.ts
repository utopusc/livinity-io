// Phase 85 (UI slice) — debounced autosave hook (D-DEBOUNCED-AUTOSAVE).
//
// Trailing-edge 500 ms debounce that fires `onSave(value)` once the value
// has been STABLE for the delay window. Calls onSave only when the value
// actually changed from the last-saved snapshot (prevents the editor from
// repeatedly POSTing the same payload during incidental re-renders).
//
// 500 ms is deliberate per CONTEXT.md D-DEBOUNCED-AUTOSAVE — NOT 250 (too
// chatty), NOT 1000 (feels laggy). Matches Suna's
// agents/new/[agentId]/page.tsx:135-149 timing.
//
// No external debounce library — D-NO-NEW-DEPS. Pure
// useEffect+setTimeout+useRef.

import {useEffect, useRef} from 'react'

export const AUTOSAVE_DELAY_MS = 500

/**
 * Fires `onSave(value)` after the value has been stable for AUTOSAVE_DELAY_MS.
 * Skips the very first render (initial-mount hydration is not a save).
 * Skips no-op saves (deep-equal-by-JSON to the last-saved snapshot).
 *
 * The caller owns `value` (typically a controlled form-state object). The
 * caller owns `onSave` — this hook will not retry on failure; it relies on
 * the next legitimate change to trigger another attempt.
 */
export function useDebouncedAutosave<T>(
	value: T,
	onSave: (value: T) => void,
	options: {delay?: number; enabled?: boolean} = {},
): void {
	const {delay = AUTOSAVE_DELAY_MS, enabled = true} = options

	// Track the last-saved snapshot so we don't fire when the value hasn't
	// actually changed from what's already on the server.
	const lastSavedRef = useRef<string | null>(null)
	const isFirstRenderRef = useRef(true)

	useEffect(() => {
		if (!enabled) return

		// Initial mount — capture the baseline without firing onSave.
		if (isFirstRenderRef.current) {
			isFirstRenderRef.current = false
			lastSavedRef.current = JSON.stringify(value)
			return
		}

		const serialized = JSON.stringify(value)
		// No-op guard — value is identical to what we last saved (or to the
		// initial snapshot). Skip the round trip.
		if (serialized === lastSavedRef.current) return

		const timer = setTimeout(() => {
			lastSavedRef.current = serialized
			onSave(value)
		}, delay)

		return () => clearTimeout(timer)
		// We intentionally exclude `onSave` from deps so a parent that
		// recreates the callback every render doesn't reset the debounce
		// timer. Caller is responsible for stable identity (use useCallback
		// or define onSave at module scope) if they care about precise
		// behavior; the JSON-snapshot guard above handles the common case.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [value, delay, enabled])
}
