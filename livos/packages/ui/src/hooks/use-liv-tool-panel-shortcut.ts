/** useLivToolPanelShortcut — Phase 68-06.
 *
 *  Global Cmd+I / Ctrl+I keydown listener that toggles LivToolPanel
 *  visibility. Mounted inside <LivToolPanel /> so listener lifecycle
 *  tracks panel mount lifecycle.
 *
 *  Spec: CONTEXT D-29 + v31-DRAFT line 348.
 *  Cross-platform: checks BOTH metaKey AND ctrlKey (no platform branch).
 *  Excludes input/textarea/contenteditable targets to avoid hijacking
 *  italic shortcut in normal text editing.
 *
 *  Caveat: Until P70 mounts <LivToolPanel /> into ai-chat/index.tsx,
 *  the shortcut is INERT (no listener installed anywhere). Mounting
 *  the panel from P70 onwards activates the shortcut globally for the
 *  chat route. This is the locked "orphan panel" design from P68.
 *
 *  Implementation notes:
 *   - Uses `useLivToolPanelStore.getState()` inside the handler — non-
 *     reactive read, so the hook does NOT re-render on every store
 *     change. Listener registers ONCE via [] deps and never thrashes.
 *   - Calls `event.preventDefault()` only when the shortcut is actually
 *     activated, so it never interferes with browser defaults in cases
 *     it does not handle (e.g. Cmd+I in a textarea = browser italic).
 */

import {useEffect} from 'react'

import {useLivToolPanelStore} from '@/stores/liv-tool-panel-store'

function isEditableTarget(target: EventTarget | null): boolean {
	if (!target) return false
	if (target instanceof HTMLInputElement) return true
	if (target instanceof HTMLTextAreaElement) return true
	if (target instanceof HTMLElement && target.isContentEditable) return true
	return false
}

export function useLivToolPanelShortcut(): void {
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() !== 'i') return
			if (!(e.metaKey || e.ctrlKey)) return
			if (e.altKey || e.shiftKey) return
			if (isEditableTarget(e.target)) return
			e.preventDefault()
			const state = useLivToolPanelStore.getState()
			if (state.isOpen) state.close()
			else state.open()
		}
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
	}, [])
}
