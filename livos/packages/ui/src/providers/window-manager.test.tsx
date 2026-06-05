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

// Phase 254-03 — openWindow gains a trailing optional `suggested` size so a
// DISPLAY_:N window opens at the X display's real WxH (locked decision #1 /
// CONTEXT openWindow sizing seam). Source-text invariants lock the contract:
//   - the context type signature widens to accept `suggested?: {width; height}`
//   - the useCallback param is widened to match
//   - baseSize selection prefers `suggested ?? …` when present
//   - DISPLAY_ windows preserve aspect via getResponsiveSize (like WebApp)
describe('window-manager — Phase 254-03 openWindow suggested size', () => {
    it('context type openWindow signature accepts a trailing suggested {width; height}', () => {
        // The widened param must appear with the exact {width: number; height: number} shape.
        const sigMatches = SRC.match(/suggested\?: ?\{width: number; height: number\}/g) ?? []
        // Expect BOTH the context type declaration and the callback param.
        expect(sigMatches.length).toBeGreaterThanOrEqual(2)
    })

    it('openWindow baseSize prefers the suggested size via `suggested ??`', () => {
        expect(SRC).toMatch(/suggested \?\?/)
    })

    it('DISPLAY_ windows preserve aspect (isDisplay branch threaded into getResponsiveSize)', () => {
        // appId.startsWith('DISPLAY_') must drive a preserve-aspect getResponsiveSize call.
        expect(SRC).toMatch(/appId\.startsWith\('DISPLAY_'\)/)
        expect(SRC).toMatch(/getResponsiveSize\([^)]*isWebApp \|\| isDisplay \|\| suggested != null\)/)
    })
})

// Phase 260-05 (SC6) — hydrate reconciliation against displays.list.
//
// On mount the window-manager rehydrates the persisted pinned (docked) set
// from Postgres (pinnedWindows.list). After 260-02, native-app `:N` displays
// register into the Redis-backed displayManager, so `displays.list` is the
// single source of truth for which streams are still LIVE. The hydrate now
// RECONCILES each persisted native pin against that list:
//   - native pin WITH a matching live display → re-open as docked (idempotent
//     re-spawn re-attaches to the running stream)
//   - native pin with NO matching live display (livinityd restart cleared the
//     in-memory activeNative) → DROP it: skip OPEN_WINDOW + delete the dead
//     Postgres row so it does not resurrect on the next refresh
//   - the reconcile is gated on BOTH pinnedWindows.list AND displays.list being
//     ready, so a still-loading displays query never drops a good pin (T-260-10)
//
// The match key for a native pin is its `title` (= the native app name), which
// equals the display record `name` set by 260-02 — the per-spawn `:N` is not
// stored on the pinned row, so the app name is the stable client-visible key.
//
// These assertions are source-text invariants (the established harness for this
// provider — rendering the full provider in jsdom needs trpc+router wiring,
// high fragility). Each would FAIL against pre-260-05 code (which had no
// displays.list query, no liveDisplayNames set, and no isNative drop branch in
// the hydrate effect).
describe('window-manager — Phase 260-05 hydrate reconciliation (SC6)', () => {
    it('Test 1 (live pin kept): a native pin whose name IS in displays.list re-opens as docked', () => {
        // The reconcile must dispatch OPEN_WINDOW with isPinnedToTopBar:true for
        // a native pin that matches a live display. The hydrate retains its
        // OPEN_WINDOW + isPinnedToTopBar:true dispatch (the kept-pin path).
        expect(SRC).toMatch(/liveDisplayNames\.has\(row\.title\)/)
        expect(SRC).toMatch(/type: 'OPEN_WINDOW'/)
        expect(SRC).toMatch(/isPinnedToTopBar: true/)
        // The drop branch must be guarded so it only applies to native pins —
        // i.e. a matching-name native pin (and every webapp pin) falls through
        // to OPEN_WINDOW.
        expect(SRC).toMatch(/const isNative = row\.appId\.startsWith\('NATIVE_'\)/)
    })

    it('Test 2 (dead pin dropped): a native pin whose name is NOT in displays.list is skipped + Postgres row deleted', () => {
        // The dead-native-pin branch must (a) test isNative && !live, (b) call
        // pinnedDeleteMutation for that windowId, and (c) `continue` (skip
        // OPEN_WINDOW). Lock the full branch shape so a refactor can't silently
        // drop the delete or the skip.
        expect(SRC).toMatch(/if \(isNative && !liveDisplayNames\.has\(row\.title\)\)/)
        const dropBranch = SRC.match(
            /if \(isNative && !liveDisplayNames\.has\(row\.title\)\)\s*\{[\s\S]*?\n\t\t\t\}/,
        )
        expect(dropBranch).not.toBeNull()
        const body = dropBranch![0]
        expect(body).toMatch(/pinnedDeleteMutation\.mutate\(\{windowId: row\.windowId\}\)/)
        expect(body).toMatch(/continue/)
    })

    it('Test 3 (premature-deletion guard): hydrate does not reconcile/drop before displays.list has loaded', () => {
        // The hydrate must bail (return) while displays.list is still loading
        // (`data === undefined`) and BEFORE setting hydratedRef — otherwise a
        // slow displays query would treat "loading" as "no live displays" and
        // erase every native pin. Lock: the displaysData undefined-guard appears
        // textually BEFORE `hydratedRef.current = true`.
        expect(SRC).toMatch(/const displaysData = displaysListQuery\.data/)
        expect(SRC).toMatch(/if \(displaysData === undefined\) return/)
        const effect = SRC.match(
            /const hydratedRef = useRef\(false\)[\s\S]*?\}, \[pinnedListQuery\.data, displaysListQuery\.data, pinnedDeleteMutation\]\)/,
        )
        expect(effect).not.toBeNull()
        const body = effect![0]
        const guardIdx = body.indexOf('if (displaysData === undefined) return')
        const setHydratedIdx = body.indexOf('hydratedRef.current = true')
        expect(guardIdx).toBeGreaterThan(-1)
        expect(setHydratedIdx).toBeGreaterThan(-1)
        expect(guardIdx).toBeLessThan(setHydratedIdx)
    })

    it('Test 4 (query wired): the provider reads displays.list as the liveness source', () => {
        // The provider must declare a displays.list query whose data feeds the
        // reconcile. Without this query there is no liveness signal.
        expect(SRC).toMatch(/trpcReact\.displays\.list\.useQuery/)
        expect(SRC).toMatch(/const liveDisplayNames = new Set/)
    })
})
