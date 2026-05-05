/**
 * KeyboardShortcutsProvider — Phase 89 (V32-A11Y-02)
 *
 * Thin wrapper that mounts useKeyboardShortcuts() exactly once at the top of
 * the React tree (inside ThemeProvider, alongside TrpcProvider in main.tsx).
 *
 * Usage in main.tsx:
 *   <ThemeProvider defaultTheme="system">
 *     <KeyboardShortcutsProvider>
 *       <TrpcProvider>
 *         ...
 *       </TrpcProvider>
 *     </KeyboardShortcutsProvider>
 *   </ThemeProvider>
 */

import type { ReactNode } from 'react'

import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'

interface KeyboardShortcutsProviderProps {
  children: ReactNode
}

export function KeyboardShortcutsProvider({ children }: KeyboardShortcutsProviderProps) {
  useKeyboardShortcuts()
  // Renders children directly — no extra DOM wrapper.
  return <>{children}</>
}
