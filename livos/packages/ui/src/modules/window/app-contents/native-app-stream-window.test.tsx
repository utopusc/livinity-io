// @vitest-environment jsdom
//
// Phase 159 — native-app-stream-window source-text invariants (Workstream B).
//
// Locks the migration from unmount-cleanup to WindowManager registry.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const COMPONENT_PATH = resolve(__dirname, 'native-app-stream-window.tsx')
const SRC = readFileSync(COMPONENT_PATH, 'utf8')

describe('native-app-stream-window — Phase 159 registry migration', () => {
    it('imports useWindowManagerOptional from window-manager provider', () => {
        expect(SRC).toMatch(/import\s*\{\s*useWindowManagerOptional\s*\}\s*from\s*['"]@\/providers\/window-manager['"]/)
    })

    it('accepts windowId prop in NativeAppStreamWindowProps interface', () => {
        expect(SRC).toMatch(/windowId\?\:\s*string/)
    })

    it('destructures windowId in function signature', () => {
        expect(SRC).toMatch(/NativeAppStreamWindow\(\{nativeAppId,\s*windowId\}/)
    })

    it('registers handler via wm.registerCloseHandler(windowId, handler)', () => {
        expect(SRC).toMatch(/wm\.registerCloseHandler\(windowId,\s*handler\)/)
    })

    it('unregisters handler in useEffect cleanup', () => {
        expect(SRC).toMatch(/wm\.unregisterCloseHandler\(windowId\)/)
    })

    it('handler uses mutateAsync (not mutate) so registry timeout can observe completion', () => {
        expect(SRC).toMatch(/closeMutationRef\.current\.mutateAsync\(\{id:\s*nativeAppId\}\)/)
    })

    it('keeps fallback unmount cleanup for missing windowId (defensive)', () => {
        // The fallback path is intentional — if windowId is somehow not
        // threaded (component used outside WindowManager tree), we still
        // attempt teardown via the legacy unmount path. Both server-side
        // close paths are idempotent.
        expect(SRC).toMatch(/if\s*\(!windowId\s*\|\|\s*!wm\)/)
    })

    it('keeps the sacred-SHA marker comment present', () => {
        expect(SRC).toMatch(/sdk-agent-runner\.ts/)
    })
})
