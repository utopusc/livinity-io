// Phase 159 — native-app-idle-reaper unit tests (Workstream B).
//
// Wave 0 stub. Real timer-mocked unit tests land in Plan 03 (B4 reaper task):
//   - Self-rescheduling setTimeout fires on interval
//   - Entries older than idleMs get closeNativeApp() called
//   - Recent entries are NOT reaped
//   - stop() callback halts further ticks
//
// Pattern reference: account/heartbeat-sender.test.ts uses REAL timers with
// short intervals (0.05s) — same approach here once Plan 03 lands.

import {existsSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const REAPER_PATH = resolve(__dirname, 'native-app-idle-reaper.ts')

describe('native-app-idle-reaper — Phase 159 stub', () => {
    it('scaffold ready (target file will be created in Plan 03)', () => {
        expect(typeof REAPER_PATH).toBe('string')
        void existsSync
    })
})
