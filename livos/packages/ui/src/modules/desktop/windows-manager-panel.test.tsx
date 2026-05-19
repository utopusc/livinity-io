// @vitest-environment jsdom
//
// Phase 159 — windows-manager-panel source-text invariants (Workstream C).
//
// Locks the consumer contract with WindowManager + the 4-action surface.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const PANEL_PATH = resolve(__dirname, 'windows-manager-panel.tsx')
const SRC = readFileSync(PANEL_PATH, 'utf8')

describe('windows-manager-panel — Phase 159 contract', () => {
    it('imports useWindowManagerOptional + WindowState type', () => {
        expect(SRC).toMatch(/import\s*\{[\s\S]*?useWindowManagerOptional[\s\S]*?WindowState[\s\S]*?\}\s*from\s*['"]@\/providers\/window-manager['"]/)
    })

    it('exports WindowsManagerPanel as a function component', () => {
        expect(SRC).toMatch(/export function WindowsManagerPanel\(\)/)
    })

    it('returns null when no WindowManager provider in tree', () => {
        expect(SRC).toMatch(/if\s*\(!wm\)\s*return null/)
    })

    it('classifyAppId covers WEBAPP_ + NATIVE_ + LIVINITY_ prefixes', () => {
        expect(SRC).toMatch(/WEBAPP_APP_ID_PREFIX\s*=\s*['"]WEBAPP_['"]/)
        expect(SRC).toMatch(/NATIVE_APP_ID_PREFIX\s*=\s*['"]NATIVE_['"]/)
        expect(SRC).toMatch(/SYSTEM_APP_ID_PREFIX\s*=\s*['"]LIVINITY_['"]/)
    })

    it('renders empty state when wm.windows is empty', () => {
        expect(SRC).toMatch(/No open windows/)
    })

    it('row Focus button calls wm.focusWindow(w.id)', () => {
        expect(SRC).toMatch(/wm\.focusWindow\(w\.id\)/)
    })

    it('row Minimize/Restore button calls the right action based on isMinimized', () => {
        expect(SRC).toMatch(/w\.isMinimized\s*\?\s*wm\.restoreWindow\(w\.id\)\s*:\s*wm\.minimizeWindow\(w\.id\)/)
    })

    it('row Pin/Unpin button calls the right action based on isPinnedToTopBar', () => {
        expect(SRC).toMatch(/w\.isPinnedToTopBar\s*\?\s*wm\.unpinWindowFromTopBar\(w\.id\)\s*:\s*wm\.pinWindowToTopBar\(w\.id\)/)
    })

    it('row Close button calls wm.closeWindow(w.id) — relies on Plan 02 registry for backend teardown', () => {
        expect(SRC).toMatch(/wm\.closeWindow\(w\.id\)/)
    })

    it('describeState surfaces all three states', () => {
        expect(SRC).toMatch(/['"]Minimized['"]/)
        expect(SRC).toMatch(/['"]Pinned['"]/)
        expect(SRC).toMatch(/['"]Visible['"]/)
    })

    it('keeps the sacred-SHA marker comment present', () => {
        expect(SRC).toMatch(/sdk-agent-runner\.ts/)
    })
})
