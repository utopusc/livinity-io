// @vitest-environment jsdom
//
// Phase 159 — native-app-stream-window source-text invariants (Workstream B).
//
// Wave 0 stub. Real invariants land in Plan 04 (B2 stream-window migration):
//   - wm.registerCloseHandler invocation present
//   - unmount-cleanup pattern (`return () => closeMutationRef.current.mutate`) REMOVED
//   - windowId prop wired

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const COMPONENT_PATH = resolve(__dirname, 'native-app-stream-window.tsx')
const SRC = readFileSync(COMPONENT_PATH, 'utf8')

describe('native-app-stream-window — Phase 159 stub', () => {
    it('source file is readable', () => {
        expect(SRC.length).toBeGreaterThan(0)
    })
})
