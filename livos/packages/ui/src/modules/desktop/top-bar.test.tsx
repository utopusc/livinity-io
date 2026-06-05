// @vitest-environment jsdom
//
// top-bar source-text invariants.
//
// Phase 159 → 255-04: right-cluster single 🖥️ Displays popover (Monitor icon +
// DisplaysPopover). Phase 260-03 (SC3/SC4): the dock gesture was rebuilt — the
// center "pinned-windows shelf" + PinnedWindowChip are GONE, the navbar collapses
// after a drag ends (no wedged pill), and the drop target moved onto the Displays
// button (drop INSIDE its rect → pinWindowToTopBar, never closeWindow), with the
// pin morph repointed at the button. This file locks all three contracts as
// source-text invariants (the established harness style for this component).

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

    it('preserves ClockWithLocation in the right cluster', () => {
        expect(SRC).toMatch(/<ClockWithLocation\s*\/>/)
    })
})

describe('top-bar — Phase 260-03 (SC4) navbar collapses, no wedged pill', () => {
    // Test 1 — the navbar must NOT stay expanded just because a window is
    // pinned. The wedge term `|| pinnedWindows.length > 0` is what kept the
    // bar open and stuck the dropped pill in the center; it must be gone.
    it('isExpanded no longer contains the `pinnedWindows.length > 0` wedge term', () => {
        const isExpandedLine = SRC.split('\n').find((l) => /const\s+isExpanded\s*=/.test(l))
        expect(isExpandedLine, 'isExpanded assignment line should exist').toBeTruthy()
        // Exactly: dragState.isDragging || isHoverExpanded — and nothing about pinnedWindows.
        expect(isExpandedLine!).toMatch(/dragState\.isDragging\s*\|\|\s*isHoverExpanded/)
        expect(isExpandedLine!).not.toMatch(/pinnedWindows\.length\s*>\s*0/)
    })

    // The whole-file guard: no `pinnedWindows.length > 0` term feeds the
    // expansion anywhere (belt-and-suspenders against re-introducing the wedge).
    it('drops the center-shelf paradigm — no PinnedWindowChip render in the navbar', () => {
        expect(SRC).not.toMatch(/<PinnedWindowChip/)
    })

    // pinnedWindows derived value is retained (plan 260-04 needs it for the badge).
    it('retains the pinnedWindows derived value for the 260-04 badge', () => {
        expect(SRC).toMatch(/const\s+pinnedWindows\s*=/)
        expect(SRC).toMatch(/\.filter\(\(w\)\s*=>\s*w\.isPinnedToTopBar\)/)
    })
})

describe('top-bar — Phase 260-03 (SC3/SC4) drop on Displays button docks via pin', () => {
    // Test 2 — a drop INSIDE the drop-zone rect calls pinWindowToTopBar.
    // The drop subscriber hit-tests dropZoneRef (now the Displays button) and
    // pins on a hit.
    it('drop subscriber calls pinWindowToTopBar on a hit-test inside the rect', () => {
        expect(SRC).toMatch(/onWindowDragDrop\(/)
        expect(SRC).toMatch(/windowManager\?\.pinWindowToTopBar\(event\.windowId\)/)
    })

    // Test 3 — a drop OUTSIDE the rect must NOT pin. This is encoded by the
    // `if (inside)` guard wrapping the pin call (and the early `if (!rect) return`).
    it('only pins when the cursor is INSIDE the Displays-button rect (guarded)', () => {
        // The pin call must be nested under an `if (inside)` guard.
        expect(SRC).toMatch(/if\s*\(inside\)\s*\{[\s\S]*?pinWindowToTopBar/)
        // And the hit-test must read the drop-zone rect.
        expect(SRC).toMatch(/dropZoneRef\.current\?\.getBoundingClientRect\(\)/)
    })

    // LANDMINE guard — docking must NEVER route through closeWindow (that fires
    // the stream-teardown handler). The drop path uses pin only.
    it('the drop path never CALLS closeWindow (keep-alive)', () => {
        // No actual closeWindow() invocation may remain — the only former caller
        // was the removed PinnedWindowChip close action. (Comments may still
        // reference the word to document the keep-alive landmine; we forbid the
        // call form `.closeWindow(`, not the bare word.)
        expect(SRC).not.toMatch(/\.closeWindow\(/)
        // And the drop subscriber pins instead of closing.
        expect(SRC).toMatch(/pinWindowToTopBar/)
    })

    // dropZoneRef is attached to the Displays/Monitor button, not the center shelf.
    it('dropZoneRef is attached to the Displays/Monitor button trigger', () => {
        expect(SRC).toMatch(/ref=\{dropZoneRef\s+as\s+RefObject<HTMLButtonElement>\}/)
    })

    // The drag-over affordance highlights the Displays button.
    it('shows a drag-over highlight on the Displays button via isDragOverShelf', () => {
        expect(SRC).toMatch(/isDragOverShelf\s*&&/)
    })
})

describe('top-bar — Phase 260-03 (SC4) pin animation repointed at the Displays button', () => {
    // The TopBar publishes the Displays-button rect so window.tsx morphs onto it.
    it('publishes the Displays-button rect via setDisplaysButtonRect', () => {
        expect(SRC).toMatch(/setDisplaysButtonRect\(\{\s*x:\s*rect\.left\s*\+\s*rect\.width\s*\/\s*2/)
    })
})

describe('top-bar — Phase 260-04 (SC5) {n} count badge on the Displays button', () => {
    // Test 1 — the badge is conditionally rendered, hidden when the count is 0.
    // The `displaysBadgeCount > 0` guard is the hidden-at-0 contract.
    it('hides the badge when the count is 0 (guarded by displaysBadgeCount > 0)', () => {
        expect(SRC).toMatch(/displaysBadgeCount\s*>\s*0\s*&&/)
    })

    // Test 2 — the count derives from BOTH the live displays.list count AND the
    // docked (pinned) windows: badge = max(displays.list length, pinnedWindows.length).
    // The pinnedWindows.length floor guarantees a docked stream is never under-counted.
    it('derives the count from displays.list floored by pinnedWindows.length', () => {
        expect(SRC).toMatch(/displays\.list\.useQuery/)
        expect(SRC).toMatch(/const\s+displaysBadgeCount\s*=\s*Math\.max\([\s\S]*?pinnedWindows\.length/)
    })

    // Test 3 — the badge uses AnimatePresence + a motion.span for the pop on change.
    it('renders the badge inside AnimatePresence as a motion.span', () => {
        expect(SRC).toMatch(/import\s*\{[\s\S]*?AnimatePresence[\s\S]*?\}\s*from\s*['"]framer-motion['"]/)
        expect(SRC).toMatch(/<AnimatePresence>[\s\S]*?<motion\.span[\s\S]*?<\/AnimatePresence>/)
    })

    // Test 4 — the badge renders the count value itself.
    it('renders the displaysBadgeCount value in the badge', () => {
        expect(SRC).toMatch(/>\s*\{displaysBadgeCount\}\s*</)
    })
})
