// @vitest-environment jsdom
//
// Phase 159 — window-chrome source-text invariants (Workstream A).
//
// Locks the streamKind discriminator + Chat-for-both + Teach/Skills-webapp-only
// contract. Surgical Option A1 — additive nativeAppId branch.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const COMPONENT_PATH = resolve(__dirname, 'window-chrome.tsx')
const SRC = readFileSync(COMPONENT_PATH, 'utf8')

describe('window-chrome — Phase 159 streamKind discriminator', () => {
    it('WindowChromeProps accepts nativeAppId prop', () => {
        expect(SRC).toMatch(/nativeAppId\?\:\s*string/)
    })

    it('declares StreamKind type alias', () => {
        expect(SRC).toMatch(/type StreamKind\s*=\s*'webapp'\s*\|\s*'native'\s*\|\s*null/)
    })

    it('derives streamKind from props', () => {
        expect(SRC).toMatch(/const streamKind:\s*StreamKind\s*=\s*webappId\s*\?\s*'webapp'\s*:\s*nativeAppId\s*\?\s*'native'\s*:\s*null/)
    })

    it('derives streamId from whichever id is set', () => {
        expect(SRC).toMatch(/const streamId\s*=\s*webappId\s*\?\?\s*nativeAppId/)
    })

    it('declares CHROME_FIXED_OVERHEAD_NATIVE constant for native row width math', () => {
        expect(SRC).toMatch(/const CHROME_FIXED_OVERHEAD_NATIVE/)
    })

    it('chat-mode store read keys on streamId (not webappId directly)', () => {
        expect(SRC).toMatch(/s\.chatInputModeByWebappId\[streamId\]/)
    })

    it('action area renders for both webapp AND native (gated on hasChromeChat)', () => {
        expect(SRC).toMatch(/const hasChromeChat\s*=\s*streamKind\s*!==\s*null/)
        expect(SRC).toMatch(/\{hasChromeChat\s*&&\s*\(/)
    })

    it('action area forwards both webappId AND nativeAppId to WebAppFloatingActionBar', () => {
        expect(SRC).toMatch(/<WebAppFloatingActionBar[\s\S]*?webappId=\{webappId\}[\s\S]*?nativeAppId=\{nativeAppId\}/)
    })

    it('Skills slot stays webapp-only (Teach + Skills omitted for native per A5)', () => {
        // The literal `isWebApp` is preserved as the gate (now equals streamKind === 'webapp');
        // the Skills slot must NOT switch to hasChromeChat.
        expect(SRC).toMatch(/\{isWebApp\s*&&\s*\(\s*<div[\s\S]*?<WebAppFloatingSkillsButton/)
    })

    it('keeps the sacred-SHA marker comment present', () => {
        expect(SRC).toMatch(/sdk-agent-runner\.ts/)
    })
})
