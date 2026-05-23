// @vitest-environment jsdom
//
// Phase 159 — window-manager provider source-text invariants (Workstream B).
//
// Locks the close-handler registry API + the closeWindow ordering that
// makes window-manager-mediated teardown deterministic. Replaces the
// Wave 0 (Plan 01) stub.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

import {DEFAULT_WINDOW_SIZES} from './window-manager'

const PROVIDER_PATH = resolve(__dirname, 'window-manager.tsx')
const SRC = readFileSync(PROVIDER_PATH, 'utf8')

describe('window-manager — Phase 159 close-handler registry', () => {
    it('exports CloseHandler type', () => {
        expect(SRC).toMatch(/export type CloseHandler/)
    })

    it('declares closeHandlersRef as a Map ref', () => {
        expect(SRC).toMatch(/closeHandlersRef\s*=\s*useRef<Map<WindowId, CloseHandler>>/)
    })

    it('defines registerCloseHandler callback that writes to the Map', () => {
        expect(SRC).toMatch(/const\s+registerCloseHandler\s*=\s*useCallback/)
        expect(SRC).toMatch(/closeHandlersRef\.current\.set\(windowId, handler\)/)
    })

    it('defines unregisterCloseHandler callback that deletes from the Map', () => {
        expect(SRC).toMatch(/const\s+unregisterCloseHandler\s*=\s*useCallback/)
        expect(SRC).toMatch(/closeHandlersRef\.current\.delete\(windowId\)/)
    })

    it('closeWindow looks up the handler BEFORE dispatching CLOSE_WINDOW', () => {
        // The handler lookup must appear textually BEFORE the
        // dispatch({type: 'CLOSE_WINDOW' ...}) call inside closeWindow.
        const closeWindowMatch = SRC.match(/const\s+closeWindow\s*=\s*useCallback[\s\S]*?\}\,\s*\[\]\)/)
        expect(closeWindowMatch).not.toBeNull()
        const body = closeWindowMatch![0]
        const lookupIdx = body.indexOf("closeHandlersRef.current.get(windowId)")
        const dispatchIdx = body.indexOf("dispatch({type: 'CLOSE_WINDOW'")
        expect(lookupIdx).toBeGreaterThan(-1)
        expect(dispatchIdx).toBeGreaterThan(-1)
        expect(lookupIdx).toBeLessThan(dispatchIdx)
    })

    it('closeWindow uses Promise.race with 2s timeout for handler', () => {
        expect(SRC).toMatch(/Promise\.race/)
        expect(SRC).toMatch(/setTimeout\(resolve,\s*2000\)/)
    })

    it('context provider value exposes registerCloseHandler + unregisterCloseHandler', () => {
        expect(SRC).toMatch(/registerCloseHandler,\s*\n\s*unregisterCloseHandler,/)
    })

    it('keeps the sacred-SHA marker comment present', () => {
        expect(SRC).toMatch(/sdk-agent-runner\.ts/)
    })
})

// Phase 199-01 — DEFAULT_WINDOW_SIZES Liv AI entry + regression-lock.
//
// D-199-01: Liv AI window opens at {width: 1180, height: 820} instead of
// the {900, 600} default-fallback. INV-199-02 brand-string lock is in
// empty-state.test.tsx; this block locks the SIZE contract.
describe('DEFAULT_WINDOW_SIZES Phase 199-01', () => {
    it('Test 1: DEFAULT_WINDOW_SIZES["LIVINITY_liv-ai"] is exactly {width: 1180, height: 820}', () => {
        expect(DEFAULT_WINDOW_SIZES['LIVINITY_liv-ai']).toEqual({
            width: 1180,
            height: 820,
        })
    })

    it('Test 2: LIVINITY_liv-ai size is NOT equal to the default-fallback (regression-lock against Phase 198 fallback bug)', () => {
        // Without the Phase 199-01 entry, this lookup would fall through
        // to DEFAULT_WINDOW_SIZES.default ({900, 600}). Lock the divergence.
        const livAi = DEFAULT_WINDOW_SIZES['LIVINITY_liv-ai']
        const fallback = DEFAULT_WINDOW_SIZES.default
        expect(livAi).not.toEqual(fallback)
        expect(livAi).toBeDefined()
    })

    it('Test 3: DEFAULT_WINDOW_SIZES still contains all 10 pre-existing entries (regression-lock — adding shouldn\'t delete)', () => {
        const expectedKeys = [
            'LIVINITY_app-store',
            'LIVINITY_files',
            'LIVINITY_settings',
            'LIVINITY_live-usage',
            'LIVINITY_ai-chat',
            'LIVINITY_docker',
            'LIVINITY_my-devices',
            'LIVINITY_subagents',
            'LIVINITY_schedules',
            'LIVINITY_terminal',
            'default',
        ]
        for (const key of expectedKeys) {
            expect(DEFAULT_WINDOW_SIZES[key]).toBeDefined()
        }
    })
})
