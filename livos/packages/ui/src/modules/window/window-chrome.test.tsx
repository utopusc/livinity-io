// @vitest-environment jsdom
//
// Phase 159 — window-chrome source-text invariants (Workstream A).
//
// Wave 0 stub. Real invariants land in Plan 07 (chrome wiring task).
// Pattern: webapp-floating-action-bar.test.tsx — D-NO-NEW-DEPS,
// `readFileSync` source-text matching, no @testing-library/react.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const COMPONENT_PATH = resolve(__dirname, 'window-chrome.tsx')
const SRC = readFileSync(COMPONENT_PATH, 'utf8')

describe('window-chrome — Phase 159 stub', () => {
    it('source file is readable', () => {
        expect(SRC.length).toBeGreaterThan(0)
    })
})
