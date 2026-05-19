// @vitest-environment jsdom
//
// Phase 159 — window-manager provider source-text invariants (Workstream B).
//
// Wave 0 stub. Real invariants land in Plan 02 (B1 registry task):
//   - registerCloseHandler / unregisterCloseHandler exported on context
//   - closeWindow invokes handler before dispatching CLOSE_WINDOW
//   - 2s Promise.race timeout literal present

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const PROVIDER_PATH = resolve(__dirname, 'window-manager.tsx')
const SRC = readFileSync(PROVIDER_PATH, 'utf8')

describe('window-manager — Phase 159 stub', () => {
    it('source file is readable', () => {
        expect(SRC.length).toBeGreaterThan(0)
    })
})
