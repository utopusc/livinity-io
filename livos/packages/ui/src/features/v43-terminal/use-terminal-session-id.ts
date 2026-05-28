/**
 * Phase 246-04 — Generates a stable browser-side tabKey (uuidv7).
 *
 * The tabKey is the browser-local identifier for one UI tab in the
 * terminal panel. It is independent of the server-side `sessionId`
 * (which livinityd mints inside SessionManager.create). Persistence
 * across reload happens at the parent panel: the panel iterates
 * `localStorage` under `livos.v44.terminal.session.<tabKey>` to
 * recover every tab from the previous session. For freshly-minted
 * tabs (the `+` button), `useNewTabKey()` returns a stable uuidv7
 * for the lifetime of the React component instance via `useMemo`.
 */
import {useMemo} from 'react'
import {uuidv7} from 'uuidv7'

export function useNewTabKey(): string {
	return useMemo(() => uuidv7(), [])
}
