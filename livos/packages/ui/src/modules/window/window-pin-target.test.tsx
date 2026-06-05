// @vitest-environment jsdom
//
// window.tsx pin-animation invariants — Phase 260-03 (SC4).
//
// The pin "shrink-to-chip" morph must now land ON the Displays/Monitor button
// (slide-RIGHT into it) instead of the hard-coded navbar center. This locks:
//   - pinTargetX/pinTargetY read the published Displays-button rect via the
//     getDisplaysButtonRect() getter, with a graceful `??` fallback so the
//     animation never breaks when the rect is null,
//   - the pinned window still animates to scale 0.1 and stays MOUNTED
//     (no unmount-on-pin) so the underlying x11vnc stream stays alive.
//
// Source-text invariant style, matching the sibling top-bar.test.tsx harness.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const WINDOW_PATH = resolve(__dirname, 'window.tsx')
const WINDOW_SRC = readFileSync(WINDOW_PATH, 'utf8')
const CONTAINER_PATH = resolve(__dirname, 'windows-container.tsx')
const CONTAINER_SRC = readFileSync(CONTAINER_PATH, 'utf8')

describe('window.tsx — Phase 260-03 (SC4) pin morph repointed at Displays button', () => {
    it('imports getDisplaysButtonRect from window-drag-state', () => {
        expect(WINDOW_SRC).toMatch(/getDisplaysButtonRect/)
        expect(WINDOW_SRC).toMatch(/from\s*['"]@\/providers\/window-drag-state['"]/)
    })

    it('pinTargetX reads the published rect with a `??` fallback', () => {
        expect(WINDOW_SRC).toMatch(/const\s+pinTargetX\s*=\s*displaysRect\?\.x\s*\?\?/)
    })

    it('pinTargetY reads the published rect with a `??` fallback', () => {
        expect(WINDOW_SRC).toMatch(/const\s+pinTargetY\s*=\s*displaysRect\?\.y\s*\?\?/)
    })

    it('keeps the scale-to-0.1 pin morph (window stays mounted, stream alive)', () => {
        expect(WINDOW_SRC).toMatch(/pinAnimateContent\s*=\s*isPinnedToTopBar/)
        expect(WINDOW_SRC).toMatch(/scale:\s*0\.1/)
    })
})

describe('windows-container.tsx — Phase 260-03 keep-alive guard', () => {
    it('still renders pinned windows (filters only on !isMinimized, not pinned)', () => {
        expect(CONTAINER_SRC).toMatch(/\.filter\(\(w\)\s*=>\s*!w\.isMinimized\)/)
        // No unmount-on-pin: the container must NOT filter out pinned windows.
        // (It DOES pass isPinnedToTopBar through as a prop — that's expected;
        // what we forbid is a `.filter(... isPinnedToTopBar ...)` exclusion.)
        expect(CONTAINER_SRC).not.toMatch(/\.filter\([^)]*isPinnedToTopBar/)
    })
})
