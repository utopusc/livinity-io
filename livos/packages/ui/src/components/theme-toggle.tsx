/**
 * ThemeToggle — Phase 89 (V32-A11Y-01)
 *
 * Dropdown-based theme selector that cycles through Light / Dark / System.
 * Consumes useTheme() from the ThemeProvider established in Phase 80.
 *
 * Accessibility:
 *   - Trigger: aria-label="Toggle theme", aria-haspopup="menu"
 *   - Current selection announced via aria-live="polite" visually-hidden region
 *   - Keyboard: Enter/Space opens; arrow keys navigate; Escape closes (Radix)
 *   - Active item has aria-checked="true" (radio-item role) or a visible check
 *
 * Usage:
 *   import { ThemeToggle } from '@/components/theme-toggle'
 *   <ThemeToggle />
 *   <ThemeToggle className="ml-auto" />
 */

import { Check, Monitor, Moon, Sun } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shadcn-components/ui/dropdown-menu'
import { cn } from '@/shadcn-lib/utils'
import { useTheme } from '@/hooks/use-theme'
import type { Theme } from '@/providers/theme-provider'

// ---------------------------------------------------------------------------
// Option definitions
// ---------------------------------------------------------------------------

interface ThemeOption {
  value: Theme
  label: string
  Icon: React.ComponentType<{ className?: string }>
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

// ---------------------------------------------------------------------------
// ThemeToggle component
// ---------------------------------------------------------------------------

export interface ThemeToggleProps {
  /** Additional classes forwarded to the trigger button */
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme()

  // Pick the icon that represents the CURRENT resolved state so the button
  // gives instant visual feedback even when theme === 'system'.
  const ActiveIcon = resolvedTheme === 'dark' ? Moon : Sun
  const resolvedLabel =
    theme === 'system'
      ? `System (${resolvedTheme})`
      : theme.charAt(0).toUpperCase() + theme.slice(1)

  return (
    <>
      {/*
       * Visually-hidden live region announces theme changes to screen readers.
       * Placed outside the DropdownMenu so it stays in the DOM at all times.
       */}
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        Theme: {resolvedLabel}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Toggle theme"
            aria-haspopup="menu"
            className={cn(
              // Base: ghost square button matching Suna's h-9 w-9 pattern
              'inline-flex h-9 w-9 items-center justify-center rounded-md',
              'text-liv-foreground',
              // Hover / focus
              'hover:bg-liv-accent hover:text-liv-accent-foreground',
              'focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-liv-ring focus-visible:ring-offset-2',
              'focus-visible:ring-offset-liv-background',
              // Transition
              'transition-colors duration-150',
              className,
            )}
          >
            <ActiveIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="min-w-[140px]">
          {THEME_OPTIONS.map(({ value, label, Icon }) => {
            const isActive = theme === value
            return (
              <DropdownMenuItem
                key={value}
                onSelect={() => setTheme(value)}
                className="flex items-center gap-2 cursor-pointer"
                aria-current={isActive ? 'true' : undefined}
              >
                <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span className="flex-1">{label}</span>
                {isActive && (
                  <Check
                    className="h-3.5 w-3.5 ml-auto flex-shrink-0 text-liv-primary"
                    aria-hidden="true"
                  />
                )}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
