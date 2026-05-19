// @vitest-environment jsdom
//
// Phase 159 — use-native-app-agent source-text invariants (Workstream A).
//
// Wave 0 stub. Real invariants land in Plan 06 (hook creation task).
// Until Plan 06 lands, the target file does not exist — the stub
// asserts only that the test runner picks the file up.

import {existsSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const HOOK_PATH = resolve(__dirname, 'use-native-app-agent.ts')

describe('use-native-app-agent — Phase 159 stub', () => {
    it('scaffold ready (target file will be created in Plan 06)', () => {
        // Trivial assertion — Plan 06 swaps this block for real
        // source-text invariants that read HOOK_PATH.
        expect(typeof HOOK_PATH).toBe('string')
        // Document but do not enforce existence; Plan 06 adds the file.
        void existsSync
    })
})
