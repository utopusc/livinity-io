// @vitest-environment jsdom
//
// Phase 159 — top-bar source-text invariants (Workstream C mount).
//
// Locks the WindowsManagerPanel mount via Radix Popover in the right
// cluster. Existing pinned-window shelf logic must remain intact.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const COMPONENT_PATH = resolve(__dirname, 'top-bar.tsx')
const SRC = readFileSync(COMPONENT_PATH, 'utf8')

describe('top-bar — Phase 159 windows manager mount', () => {
    it('imports LayoutGrid from lucide-react', () => {
        expect(SRC).toMatch(/import\s*\{\s*LayoutGrid\s*\}\s*from\s*['"]lucide-react['"]/)
    })

    it('imports Popover/PopoverContent/PopoverTrigger from shadcn popover', () => {
        expect(SRC).toMatch(/import\s*\{[\s\S]*?Popover[\s\S]*?PopoverContent[\s\S]*?PopoverTrigger[\s\S]*?\}\s*from\s*['"]@\/shadcn-components\/ui\/popover['"]/)
    })

    it('imports WindowsManagerPanel from sibling file', () => {
        expect(SRC).toMatch(/import\s*\{\s*WindowsManagerPanel\s*\}\s*from\s*['"]\.\/windows-manager-panel['"]/)
    })

    it('mounts <WindowsManagerPanel /> inside a <PopoverContent>', () => {
        expect(SRC).toMatch(/<PopoverContent[\s\S]*?<WindowsManagerPanel\s*\/>[\s\S]*?<\/PopoverContent>/)
    })

    it('Popover trigger button has aria-label "Windows manager"', () => {
        expect(SRC).toMatch(/aria-label=['"]Windows manager['"]/)
    })

    it('preserves the existing pinned-window shelf (PinnedWindowChip render)', () => {
        // Regression guard — Plan 08 must NOT remove the existing pinned
        // shelf in the Center drop-zone. Both surfaces coexist per
        // RESEARCH C risk #4.
        expect(SRC).toMatch(/<PinnedWindowChip/)
    })

    it('preserves ClockWithLocation in the right cluster', () => {
        expect(SRC).toMatch(/<ClockWithLocation\s*\/>/)
    })
})
