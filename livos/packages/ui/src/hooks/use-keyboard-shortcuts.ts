/**
 * useKeyboardShortcuts — Phase 89 (V32-A11Y-02)
 *
 * Registers global keydown listeners for application-level shortcuts.
 * Mounted ONCE via KeyboardShortcutsProvider in main.tsx.
 *
 * Shortcut ownership:
 *   Cmd+I  — OWNED BY P82 (ToolCallPanel.tsx lines 146-158). NOT duplicated here.
 *   Cmd+K  — composer focus (dispatches `liv-composer-focus` CustomEvent)
 *   Cmd+/  — slash command menu (dispatches `liv-slash-menu-open` CustomEvent)
 *   Cmd+Shift+C — copy last assistant message (reads localStorage `liv-last-assistant`)
 *
 * All shortcuts are silently ignored when focus is inside an editable element
 * (input, textarea, [contenteditable]) to avoid stealing keyboard input.
 *
 * Mac: uses Meta (Cmd). Windows/Linux: uses Ctrl. Detected via navigator.platform.
 *
 * NOTE for P90: ChatComposer must addEventListener('liv-composer-focus', ...) and
 * call .focus() on its textarea ref.
 *
 * NOTE for P90: The SSE message handler (P88) must call
 *   localStorage.setItem('liv-last-assistant', text)
 * on each completed assistant message so Cmd+Shift+C has content to copy.
 */

import { useEffect } from 'react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when the event target is an editable element. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const tag = target.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (target.getAttribute('contenteditable') !== null) return true
  return false
}

/**
 * Returns true if the modifier key for shortcuts is pressed.
 * Mac:  Meta (Cmd).
 * Other: Ctrl.
 */
function isModifierPressed(e: KeyboardEvent): boolean {
  // navigator.platform is deprecated but remains the most reliable synchronous
  // check for Mac vs non-Mac that does not require a user-agent parse.
  // The platform string is 'MacIntel', 'MacPPC', 'Mac68K' on macOS.
  const isMac = /mac/i.test(navigator.platform)
  return isMac ? e.metaKey : e.ctrlKey
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      // Never intercept keystrokes in editable contexts.
      if (isEditableTarget(e.target)) return

      const mod = isModifierPressed(e)
      if (!mod) return

      // ── Cmd+K: focus the message composer textarea ────────────────────────
      // ChatComposer (P88/P90) must listen for this event on window.
      if (e.key === 'k' && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('liv-composer-focus'))
        return
      }

      // ── Cmd+/: open slash command menu ────────────────────────────────────
      // SlashMenu (future phase) must listen for this event on window.
      if (e.key === '/' && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('liv-slash-menu-open'))
        return
      }

      // ── Cmd+Shift+C: copy last assistant message ──────────────────────────
      // The chat surface (P88) is responsible for writing
      // localStorage.setItem('liv-last-assistant', text) on each new
      // completed assistant message. If the key is absent, this is a no-op.
      if (e.key === 'c' && e.shiftKey && !e.altKey) {
        e.preventDefault()
        try {
          const text = localStorage.getItem('liv-last-assistant')
          if (text) {
            navigator.clipboard.writeText(text).catch(() => {
              // clipboard write failures (e.g. no permissions) — silently ignore
            })
          }
        } catch {
          // localStorage unavailable (sandboxed iframe) — no-op
        }
        return
      }

      // NOTE: Cmd+I is intentionally NOT handled here.
      // ToolCallPanel.tsx (P82, lines 146-158) owns that shortcut.
      // Adding it here would create duplicate preventDefault() calls and
      // interfere with P82's isOpen guard.
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
