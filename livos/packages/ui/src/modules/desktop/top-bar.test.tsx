// @vitest-environment jsdom
//
// Phase 159 — top-bar source-text invariants (Workstream C mount).
//
// Wave 0 stub. Real invariants land in Plan 08 (C2 mount task):
//   - imports WindowsManagerPanel
//   - imports Popover/PopoverTrigger/PopoverContent
//   - imports LayoutGrid lucide icon
//   - Popover wraps a button in the right-side cluster

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const COMPONENT_PATH = resolve(__dirname, 'top-bar.tsx')
const SRC = readFileSync(COMPONENT_PATH, 'utf8')

describe('top-bar — Phase 159 stub', () => {
    it('source file is readable', () => {
        expect(SRC.length).toBeGreaterThan(0)
    })
})
