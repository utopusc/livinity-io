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

describe('top-bar — Phase 260.1-03 (SC-C) hover-open Displays popover', () => {
    // The popover opens on HOVER, not click — both the Monitor button AND the
    // (portalled) PopoverContent carry onMouseEnter/onMouseLeave so the cursor
    // can travel between them without snapping shut.
    it('the Monitor button uses onMouseEnter/onMouseLeave (hover-open, not click)', () => {
        // The button block (aria-label "Displays") must wire both hover handlers.
        const buttonBlock = SRC.slice(SRC.indexOf("aria-label='Displays'"))
        expect(buttonBlock).toMatch(/onMouseEnter=\{openDisplays\}/)
        expect(buttonBlock).toMatch(/onMouseLeave=\{scheduleCloseDisplays\}/)
    })

    it('the PopoverContent uses onMouseEnter/onMouseLeave to stay open over the portal', () => {
        const contentBlock = SRC.slice(SRC.indexOf('<PopoverContent'))
        expect(contentBlock).toMatch(/onMouseEnter=\{openDisplays\}/)
        expect(contentBlock).toMatch(/onMouseLeave=\{scheduleCloseDisplays\}/)
    })

    // openDisplays clears the pending close timer and opens; scheduleCloseDisplays
    // arms a ~140ms grace-delay timeout that closes via setDisplaysOpen(false).
    it('openDisplays calls setDisplaysOpen(true) and clears the pending timer', () => {
        expect(SRC).toMatch(/const\s+openDisplays\s*=\s*\(\)\s*=>\s*\{[\s\S]*?clearTimeout\(displaysHoverTimer\.current\)[\s\S]*?setDisplaysOpen\(true\)/)
    })

    it('scheduleCloseDisplays arms a ~140ms grace-delay timeout that closes the popover', () => {
        expect(SRC).toMatch(/const\s+scheduleCloseDisplays\s*=\s*\(\)\s*=>\s*\{[\s\S]*?setTimeout\([\s\S]*?setDisplaysOpen\(false\)[\s\S]*?\},\s*140\)/)
        // The timer is stored in a ref so a re-enter can cancel it.
        expect(SRC).toMatch(/displaysHoverTimer\s*=\s*useRef/)
    })

    it('keeps the Popover controlled (open={displaysOpen}) so Escape/outside-close still work', () => {
        expect(SRC).toMatch(/<Popover\s+open=\{displaysOpen\}\s+onOpenChange=\{setDisplaysOpen\}/)
    })

    it('clears the grace-delay timer on unmount (no stale setDisplaysOpen)', () => {
        expect(SRC).toMatch(/return\s*\(\)\s*=>\s*\{[\s\S]*?clearTimeout\(displaysHoverTimer\.current\)/)
    })

    // 260-03 collapse fix must NOT be regressed by this plan.
    it('does not regress the 260-03 collapse fix (no pinnedWindows.length wedge term)', () => {
        const isExpandedLine = SRC.split('\n').find((l) => /const\s+isExpanded\s*=/.test(l))
        expect(isExpandedLine!).toMatch(/dragState\.isDragging\s*\|\|\s*isHoverExpanded/)
        expect(isExpandedLine!).not.toMatch(/pinnedWindows\.length\s*>\s*0/)
    })
})

describe('top-bar — Phase 260.1-03 (SC-A) Displays-button intake animation on drop', () => {
    it('imports useAnimationControls from framer-motion', () => {
        expect(SRC).toMatch(/import\s*\{[\s\S]*?useAnimationControls[\s\S]*?\}\s*from\s*['"]framer-motion['"]/)
    })

    it('creates intakeControls via useAnimationControls', () => {
        expect(SRC).toMatch(/const\s+intakeControls\s*=\s*useAnimationControls\(\)/)
    })

    // The intake pop is a 500-stiffness spring scale-pop fired in the drop path.
    it('fires intakeControls.start({scale: [1, 1.28, 1]}) with a 500-stiffness spring', () => {
        expect(SRC).toMatch(/intakeControls\.start\(\s*\{\s*scale:\s*\[1,\s*1\.28,\s*1\]\s*\}/)
        expect(SRC).toMatch(/stiffness:\s*500/)
    })

    // The intake must be fired inside the drop `inside` branch AFTER pinWindowToTopBar.
    it('fires the intake AFTER pinWindowToTopBar inside the drop `inside` branch', () => {
        expect(SRC).toMatch(/if\s*\(inside\)\s*\{[\s\S]*?pinWindowToTopBar\(event\.windowId\)[\s\S]*?intakeControls\.start\(/)
    })

    // The Monitor button is a motion.button driven by animate={intakeControls}.
    it('the Monitor button is a motion.button with animate={intakeControls}', () => {
        const buttonBlock = SRC.slice(SRC.indexOf('<motion.button'), SRC.indexOf("aria-label='Displays'") + 400)
        expect(SRC).toMatch(/<motion\.button[\s\S]*?ref=\{dropZoneRef/)
        expect(buttonBlock).toMatch(/animate=\{intakeControls\}/)
    })

    // 260-03 keep-alive: docking never routes through closeWindow.
    it('the drop path never CALLS closeWindow (260-03 keep-alive invariant)', () => {
        expect(SRC).not.toMatch(/\.closeWindow\(/)
        expect(SRC).toMatch(/pinWindowToTopBar/)
    })
})
