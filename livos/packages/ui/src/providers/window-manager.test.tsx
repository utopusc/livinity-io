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

// Phase 234-02 — DEFAULT_WINDOW_SIZES Liv AI entry retired + Liv Assistant
// (the v42 AionUi-backed chat surface) takes its place at 1280x800.
//
// Phase 199-01 / Hot-fix N originally locked LIVINITY_liv-ai (the legacy
// assistant-ui chat surface) to {1400, 900}. Per 234-01-INVESTIGATION.md
// Section G.1 (Resolution G.1, preferred), the LIVINITY_liv-ai surface +
// systemApps entry + DEFAULT_WINDOW_SIZES entry are all removed together
// as the deferred Phase 231 cleanup. LIVINITY_liv-assistant (Phase 227,
// the iframe over the AionUi /liv/ Caddy handle) becomes the sole v42
// chat surface and gains its own explicit 1280x800 entry (operator
// directive 2026-05-27 night — was falling through to default {900, 600}
// pre-Phase-234 which felt cramped for the iframe SPA).
describe('DEFAULT_WINDOW_SIZES Phase 234-02 — LIVINITY_liv-assistant entry', () => {
    it('Test 1: DEFAULT_WINDOW_SIZES["LIVINITY_liv-assistant"] is exactly {width: 1280, height: 800}', () => {
        expect(DEFAULT_WINDOW_SIZES['LIVINITY_liv-assistant']).toEqual({
            width: 1280,
            height: 800,
        })
    })

    it('Test 2: LIVINITY_liv-assistant size is NOT equal to the default-fallback (regression-lock against the pre-Phase-234 fallthrough bug)', () => {
        // Pre-Phase-234 this lookup fell through to DEFAULT_WINDOW_SIZES.default
        // ({900, 600}) which was too small for the AionUi iframe SPA. Lock the
        // divergence so a future cleanup pass can't silently delete the entry.
        const livAssistant = DEFAULT_WINDOW_SIZES['LIVINITY_liv-assistant']
        const fallback = DEFAULT_WINDOW_SIZES.default
        expect(livAssistant).not.toEqual(fallback)
        expect(livAssistant).toBeDefined()
        expect(livAssistant!.width).toBeGreaterThan(fallback.width)
        expect(livAssistant!.height).toBeGreaterThan(fallback.height)
    })

    it('Test 3: DEFAULT_WINDOW_SIZES still contains all pre-existing entries + the new LIVINITY_liv-assistant (regression-lock — adding shouldn\'t delete)', () => {
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
            'LIVINITY_liv-assistant',
            'default',
        ]
        for (const key of expectedKeys) {
            expect(DEFAULT_WINDOW_SIZES[key]).toBeDefined()
        }
    })

    it('Test 4: legacy LIVINITY_liv-ai entry is REMOVED (Phase 234-02 Section G.1 cleanup)', () => {
        // The LIVINITY_liv-ai dock tile + systemApps entry + window-content
        // mapping were removed together in Phase 234-02. The DEFAULT_WINDOW_SIZES
        // entry must also be gone — keeping it would be dead config that misleads
        // future maintainers about a surface that no longer exists.
        expect(DEFAULT_WINDOW_SIZES['LIVINITY_liv-ai']).toBeUndefined()
    })
})

// Phase 231 retirement — Hot-fix E describe (3 tests for legacy chat-iframe
// default window size) deleted wholesale. The default-size entry was removed
// from window-manager.tsx; Liv Assistant (Phase 227) is the v42 chat surface.
