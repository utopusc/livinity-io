// @vitest-environment jsdom
//
// top-bar source-text invariants — right-cluster popover mount.
//
// Originally Phase 159 (WindowsManagerPanel mount). Phase 255-04 rewired the
// right cluster to a SINGLE 🖥️ Displays popover (Monitor icon + DisplaysPopover),
// folding the old per-window manager surface into the merged DisplaysPopover.
// This file now locks the 255-04 contract. The existing pinned-window shelf and
// ClockWithLocation must remain intact (regression guards).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const COMPONENT_PATH = resolve(__dirname, 'top-bar.tsx')
const SRC = readFileSync(COMPONENT_PATH, 'utf8')

describe('top-bar — Phase 255-04 single Displays popover mount', () => {
    it('imports Monitor from lucide-react (the 🖥️ trigger glyph)', () => {
        expect(SRC).toMatch(/import\s*\{\s*Monitor\s*\}\s*from\s*['"]lucide-react['"]/)
    })

    it('imports Popover/PopoverContent/PopoverTrigger from shadcn popover', () => {
        expect(SRC).toMatch(/import\s*\{[\s\S]*?Popover[\s\S]*?PopoverContent[\s\S]*?PopoverTrigger[\s\S]*?\}\s*from\s*['"]@\/shadcn-components\/ui\/popover['"]/)
    })

    it('imports DisplaysPopover from sibling file', () => {
        expect(SRC).toMatch(/import\s*\{\s*DisplaysPopover\s*\}\s*from\s*['"]\.\/displays-popover['"]/)
    })

    it('mounts <DisplaysPopover /> inside a <PopoverContent>', () => {
        expect(SRC).toMatch(/<PopoverContent[\s\S]*?<DisplaysPopover[\s\S]*?\/>[\s\S]*?<\/PopoverContent>/)
    })

    it('Popover trigger button has aria-label "Displays"', () => {
        expect(SRC).toMatch(/aria-label=['"]Displays['"]/)
    })

    it('preserves the existing pinned-window shelf (PinnedWindowChip render)', () => {
        // Regression guard — the right-cluster rewire must NOT remove the existing
        // pinned shelf in the Center drop-zone. Both surfaces coexist.
        expect(SRC).toMatch(/<PinnedWindowChip/)
    })

    it('preserves ClockWithLocation in the right cluster', () => {
        expect(SRC).toMatch(/<ClockWithLocation\s*\/>/)
    })
})
