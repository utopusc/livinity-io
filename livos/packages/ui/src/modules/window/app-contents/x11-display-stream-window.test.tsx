// Phase 254-03 — X11DisplayStreamWindow source-text invariants.
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS, same precedent as liv-assistant-window.unit.test.tsx).
// The component composes trpcReact + useWebAppVnc + a fire-once mutation
// ref, so a full render harness would need a tRPC provider + noVNC mock.
// These invariants lock the contract that matters for locked decision #1
// (reuse noVNC/RFB) and the threat model (no per-event xdotool dispatch,
// no wsUrl logging).
//
// References:
//   - .planning/phases/254-…/254-03-PLAN.md (Task 2)
//   - .planning/phases/254-…/254-CONTEXT.md (LOCKED DECISION #1 — LIVE VNC)

import {readFileSync, existsSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const COMP_PATH = resolve(__dirname, 'x11-display-stream-window.tsx')

describe('x11-display-stream-window — Phase 254-03 LIVE VNC display window', () => {
    it('the component file exists', () => {
        expect(existsSync(COMP_PATH)).toBe(true)
    })

    it('has a default export (the window-content lazy import target)', () => {
        const src = readFileSync(COMP_PATH, 'utf8')
        expect(src).toMatch(/export default function X11DisplayStreamWindow/)
    })

    it('renders through useWebAppVnc with viewOnly:false (LIVE input)', () => {
        const src = readFileSync(COMP_PATH, 'utf8')
        expect(src).toMatch(/useWebAppVnc\([^)]*viewOnly: ?false/)
    })

    it('resolves the ws URL via displays.getVncUrl mutation', () => {
        const src = readFileSync(COMP_PATH, 'utf8')
        expect(src).toMatch(/getVncUrl/)
    })

    it('has NO per-event xdotool / tRPC input dispatch (RFB-native input only)', () => {
        const src = readFileSync(COMP_PATH, 'utf8')
        expect(src).not.toMatch(/xdotool|input\.click|inputClickMutation|webapp\.input/)
    })

    it('does NOT console.log the wsUrl (T-254-08 — log only displayId)', () => {
        const src = readFileSync(COMP_PATH, 'utf8')
        // No console.log line may reference wsUrl.
        expect(src).not.toMatch(/console\.log\([^)]*wsUrl/)
    })
})
