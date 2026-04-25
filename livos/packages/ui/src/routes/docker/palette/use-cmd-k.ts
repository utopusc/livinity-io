// Phase 29 Plan 29-01 — global cmd+k / ctrl+k keyboard shortcut listener (DOC-18).
//
// Single document keydown listener installed at the DockerApp root. Fires
// usePaletteStore.openPalette() on cmd+k (mac) / ctrl+k (win/linux), with
// preventDefault to suppress browser-default behaviour (Firefox repurposes
// cmd+k as the URL bar search; preventDefault is required to stop that).
//
// Always use 'keydown' (not keypress/keyup); always check metaKey || ctrlKey
// AND e.key === 'k' AND NOT shift+ctrl+k (that's a different shortcut).

import {useEffect} from 'react'

import {usePaletteStore} from './use-palette-store'

export function useCmdK() {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === 'k') {
				e.preventDefault()
				usePaletteStore.getState().openPalette()
			}
		}
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [])
}
