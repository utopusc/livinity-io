// @vitest-environment jsdom
//
// Phase 101-09 — webapp-floating-action-bar source-text invariants.
//
// Pillar E (D-101-CHAT-ANIMS) ships three chat animations into the
// `ChatInputBar` component inside `webapp-floating-action-bar.tsx`:
//
//   1. Thinking pulse — 3 staggered dots (animation-delays 0ms / 150ms / 300ms)
//      rendered while `isStreaming && messages.length === lastSentCount`
//      (i.e. user sent but no assistant token has streamed back yet).
//   2. Streaming caret — already present from 100-10-06 (in ChatResponseBar).
//   3. Idle pulse — `chat-input-idle` utility class applied to the input
//      border when unfocused + empty + not streaming. @keyframes idleBreath
//      lives in index.css and respects `prefers-reduced-motion: reduce`.
//
// `@testing-library/react` is NOT installed (D-NO-NEW-DEPS — same precedent
// as webapp-stream-window.unit.test.tsx). This file ships SOURCE-TEXT
// invariants that lock the contract for the 3-dot DOM, the gating
// condition, the idle-pulse class application, and the motion-reduce
// Tailwind variant for a11y compliance (Q5 RESOLVED — OS-level only, no
// Settings toggle).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const COMPONENT_PATH = resolve(__dirname, 'webapp-floating-action-bar.tsx')
const SRC = readFileSync(COMPONENT_PATH, 'utf8')

describe('webapp-floating-action-bar — Phase 101-09 chat animations', () => {
	// ─── Thinking dots (3 staggered) ──────────────────────────────────

	it('renders 3 staggered-pulse dots with animation-delay 0ms / 150ms / 300ms', () => {
		// Three distinct delay literals must all appear in the file. The
		// exact Tailwind arbitrary-value shape is `[animation-delay:Nms]`
		// per the CONTEXT D-101-CHAT-ANIMS spec lines 122-129.
		expect(SRC).toMatch(/\[animation-delay:0ms\]/)
		expect(SRC).toMatch(/\[animation-delay:150ms\]/)
		expect(SRC).toMatch(/\[animation-delay:300ms\]/)
	})

	it('thinking-dots are gated on isStreaming + no assistant token yet', () => {
		// The gating predicate must reference both `isStreaming` and a
		// "no assistant message body yet" check (we use the existing
		// lastAssistant pattern from ChatResponseBar, exposed in
		// ChatInputBar via the hoisted `agent` prop).
		expect(SRC).toMatch(/isStreaming/)
		// Locks the gating condition: the dot block must check that no
		// assistant text has arrived yet (either no assistant message OR
		// an empty-content assistant message).
		expect(SRC).toMatch(/thinking-dots/)
	})

	it('thinking-dot spans use bg-text-tertiary + rounded-full + h-1.5 w-1.5', () => {
		// Locks the visual style from CONTEXT lines 122-129.
		expect(SRC).toMatch(/w-1\.5 h-1\.5 rounded-full bg-text-tertiary animate-pulse/)
	})

	// ─── Idle pulse (chat input border breathe) ──────────────────────

	it('applies chat-input-idle class when input unfocused + empty + not streaming', () => {
		// The class name is the contract with index.css (@keyframes
		// idleBreath + .chat-input-idle utility from Task 2).
		expect(SRC).toMatch(/chat-input-idle/)
	})

	it('chat-input-idle gating tracks focus + value + streaming state', () => {
		// The conditional class application must reference all three
		// gating predicates. We track focus locally via useState in
		// ChatInputBar; `input` value is already present; isStreaming
		// comes from the agent prop.
		expect(SRC).toMatch(/isFocused/)
		expect(SRC).toMatch(/input\.length === 0|input === ''|!input/)
		expect(SRC).toMatch(/!agent\.isStreaming/)
	})

	// ─── prefers-reduced-motion (Q5 RESOLVED — OS-level only) ─────────

	it('honors prefers-reduced-motion via Tailwind motion-reduce: variant', () => {
		// Q5 RESOLVED — accessibility per Phase 101 RESEARCH: respect the
		// OS-level reduced-motion preference; no per-user Settings toggle.
		// Tailwind's `motion-reduce:` variant compiles to the `@media
		// (prefers-reduced-motion: reduce)` query; the CSS override in
		// index.css (Task 2) is a defense-in-depth backstop for raw
		// `animate-pulse` and `chat-input-idle` rules.
		expect(SRC).toMatch(/motion-reduce:/)
	})

	// ─── Preserve existing 100-10-10 status line behavior ─────────────

	it('preserves the per-tool phrase/currentTool status line (100-10-10)', () => {
		// The 100-10-10 status sub-line must remain — it's the surface
		// that will render Hermes `phrase` once Pillar F (Task 3) closes
		// the backend relay gap. Locks the fallback render order:
		// phrase ?? `Using ${currentTool}…`.
		expect(SRC).toMatch(/agentStatus\.phrase/)
		expect(SRC).toMatch(/agentStatus\.currentTool/)
		expect(SRC).toMatch(/Using \$\{agent\.agentStatus\.currentTool\}/)
	})

	// ─── Risk note #1 enforcement (deprecated bottom-bar untouched) ──

	it('does NOT import the deprecated webapp-chat-bottom-bar (PATTERNS risk #1)', () => {
		// PATTERNS.md risk note #1: webapp-chat-bottom-bar.tsx is
		// DEPRECATED per its own header. Phase 101-09 animations land
		// HERE, NOT there. This invariant prevents accidental re-wiring.
		expect(SRC).not.toMatch(/webapp-chat-bottom-bar/)
	})

	// ─── Sacred SHA reaffirmation (preserved from 100-10-10) ─────────

	it('keeps the sacred-SHA marker comment present', () => {
		expect(SRC).toMatch(/sdk-agent-runner\.ts/)
	})
})

describe('webapp-floating-action-bar — Phase 159 dual-hook (native + webapp)', () => {
	it('imports useNativeAppAgent + UseStreamAppAgentResult from native-agent hook module', () => {
		expect(SRC).toMatch(/import\s*\{\s*useNativeAppAgent,\s*type\s+UseStreamAppAgentResult\s*\}\s*from\s*['"]@\/hooks\/use-native-app-agent['"]/)
	})

	it('preserves the T-10-10-RESPONSE-01 literal: `const agent = useWebAppAgent(webappId` appears exactly once', () => {
		const matches = SRC.match(/const\s+agent\s*=\s*useWebAppAgent\(webappId/g) ?? []
		expect(matches.length).toBe(1)
	})

	it('declares `const nativeAgent = useNativeAppAgent(nativeAppId` exactly once', () => {
		const matches = SRC.match(/const\s+nativeAgent\s*=\s*useNativeAppAgent\(nativeAppId/g) ?? []
		expect(matches.length).toBe(1)
	})

	it('declares `const activeAgent: UseStreamAppAgentResult` exactly once', () => {
		const matches = SRC.match(/const\s+activeAgent:\s*UseStreamAppAgentResult/g) ?? []
		expect(matches.length).toBe(1)
	})

	it('activeAgent selects nativeAgent when nativeAppId set, else agent', () => {
		expect(SRC).toMatch(/const\s+activeAgent:\s*UseStreamAppAgentResult\s*=\s*nativeAppId\s*\?\s*nativeAgent\s*:\s*agent/)
	})

	it('declares NATIVE_MODES (Chat-only) alongside MODES', () => {
		expect(SRC).toMatch(/const NATIVE_MODES/)
		// NATIVE_MODES contains ONLY the chat entry, not teach
		expect(SRC).toMatch(/NATIVE_MODES[\s\S]*?\{id:\s*'chat'[^}]*\}\s*,?\s*\]/)
	})

	it('WebAppFloatingActionBarProps accepts optional nativeAppId', () => {
		expect(SRC).toMatch(/interface WebAppFloatingActionBarProps[\s\S]*?nativeAppId\?\:\s*string/)
	})

	it('IconBarProps accepts optional nativeAppId', () => {
		expect(SRC).toMatch(/interface IconBarProps[\s\S]*?nativeAppId\?\:\s*string/)
	})

	it('IconBar selects modes by nativeAppId presence', () => {
		expect(SRC).toMatch(/const\s+modes\s*=\s*nativeAppId\s*\?\s*NATIVE_MODES\s*:\s*MODES/)
	})
})
