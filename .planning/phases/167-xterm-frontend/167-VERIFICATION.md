---
phase: 167
title: xterm.js Frontend (CcTerminal Component)
status: passed
mode: code-complete (real-browser smoke deferred to Phase 170)
date: 2026-05-19
commits:
  167-02: 74b608ef  # CcPtyWsClient (WS client)
  167-01: 05758e80  # CcTerminal component
  167-03: a73c72f1  # theme bridge (livosThemeToXtermTheme)
  167-04: 165339f4  # AI Chat route swap + chat-mobile fallback
must_haves:
  - "<CcTerminal sessionId> mounts xterm.js into a DOM container — PASS (24/24 vitest)"
  - "WS client connects to /ws/cc-pty with attach envelope on open — PASS (13/13 vitest)"
  - "Theme live-updates without remount via term.options.theme reassignment — PASS (verified in CcTerminal Test 8 + terminal-theme structural assertions)"
  - "AI Chat dock window route swapped: desktop → CcTerminal shell, mobile → fallback link — PASS (11/11 vitest)"
  - "Mobile /chat-mobile route renders legacy chat unchanged — PASS (3/3 vitest)"
  - "D-V35-K: legacy chat panel imported in exactly ONE production-source file — PASS (CI-locked via vitest grep walker)"
sacred_guards_post_phase:
  - "liv/packages/core/src/sdk-agent-runner.ts: f3538e1d811992b782a9bb057d1b7f0a0189f95f (Sacred SHA preserved)"
  - "livos/packages/livinityd/source/modules/server/ws-agent.ts: 8fee9a1d75593a5c467a4868739ff56c0073b4b2 (byte-identical)"
  - "livos/packages/livinityd/source/modules/cc-pty/manager.ts: 865b1ad2dc3c173d2cfd60816296ed5ea5b23c18 (byte-identical)"
  - "livos/packages/livinityd/source/modules/cc-pty/ws-handler.ts: 97c53770dfed024041c0c9607f0715722dc018bc (byte-identical)"
  - "livos/packages/livinityd/source/modules/cc-pty/session-store.ts: 1704cfd7d01e34bb4184162bf076b77791fdea9d (byte-identical)"
  - "livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts: 2083f0a3dfc798b4841613b9576b94929f2faf2f (D-09 byte-identical)"
  - "livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts: dc1831f5f284656dc3bd07babf972cfb02b815c6 (Phase 161-02 byte-identical)"
  - "livos/packages/livinityd/source/modules/claude-runner/vault-scaffolder.ts: 5ddfd06508e11554ae80a7a57b269a4835bf6cdb (Phase 162-01 byte-identical)"
  - "liv/packages/core/src/agent-session.ts: 7c690d59ea08b6450da1d5bd243d06e62a70d473 (Phase 162-02 byte-identical)"
  - "livos/packages/livinityd/source/modules/autonomous-scheduler/scheduler.ts: f7c033173070bff819b7373adb96ea4e1898d2b6 (Phase 164 byte-identical)"
  - "livos/packages/livinityd/source/modules/claude-runner/idle-reaper.ts: 8eea049ee28e1ba9bb53a86fa496a1830671ee43 (Phase 165-01 byte-identical)"
  - "livos/packages/livinityd/source/modules/server/index.ts: c1eea6793bfa0b5685f0a3076c2d2f22cea70e76 (byte-identical — no new mount changed)"
  - "livos/packages/ui/package.json: unchanged (D-NEW-DEPS-v35 satisfied — git diff empty)"
  - "livos/pnpm-lock.yaml: unchanged (D-NEW-DEPS-v35 satisfied — git diff empty)"
human_verification:
  status: deferred
  to_phase: 170
  reason: "xterm.js requires a real browser to render its canvas/DOM; jsdom tests prove component LIFECYCLE + lifecycle integration but not visual fidelity. Phase 170 (Mini PC Deploy + UAT) walks the human-verifiable checklist:"
  checklist:
    - "Mini PC update.sh runs successfully — livos service restart clean"
    - "Browser desktop view: open AI Chat dock window → see 260px sidebar + 'Select or create' placeholder"
    - "Mobile UA (devtools toggle to iPhone or similar) → AI Chat dock window shows 'AI Chat requires a desktop browser' fallback + clickable 'Open mobile chat' link"
    - "Click 'Open mobile chat' → mobile UA routes to /chat-mobile → legacy chat panel renders correctly"
    - "Desktop → /chat-mobile direct URL → legacy chat panel still renders (the route works for both UAs)"
    - "Once a session is created (Phase 168 sidebar wiring) → CcTerminal renders xterm.js with the LivOS-theme palette, accepts keystrokes, displays Claude output streaming back via /ws/cc-pty"
    - "Theme toggle (dock → Settings → Theme) → terminal palette updates without remount (no flash, no scrollback reset)"
    - "Resize window → fit addon adjusts cols/rows + server PTY resize envelope flows through"
---

# Phase 167 Verification: xterm.js Frontend

## Status

**PASSED (code-complete)** — All 4 plans shipped, 45/45 vitest assertions pass, all 9 sacred-guard files byte-identical with pre-167 baselines, package.json + pnpm-lock unchanged.

Real-browser visual verification (xterm.js render fidelity, theme live-update visual, WS roundtrip with real Mini PC `/ws/cc-pty` backend) is deferred to Phase 170 per the master plan's wave structure. The Phase 167 frontend is "code-complete and CI-green"; Phase 168 wires the session sidebar (which makes the activeSessionId state useful); Phase 170 walks the human-verifiable UAT checklist.

## Plans Shipped

| Plan | Commit | Title | Tests | Files Created | Files Modified |
|------|--------|-------|-------|---------------|----------------|
| 167-02 | `74b608ef` | CcPtyWsClient — WS client | 13/13 | 2 | 0 |
| 167-01 | `05758e80` | CcTerminal — xterm.js component | 11/11 | 3 | 0 |
| 167-03 | `a73c72f1` | Theme bridge + ANSI-16 palette | 7/7 (+24 existing pass) | 2 | 2 |
| 167-04 | `165339f4` | AI Chat route swap + chat-mobile | 14/14 | 4 | 1 |
| **TOTAL** | — | — | **45/45** | **11 new** | **3 mod** |

## Acceptance Evidence (Aggregate)

### Vitest

```
pnpm --filter ui exec vitest run \
  src/features/cc-terminal/ \
  src/routes/ai-chat/ai-chat.test.tsx \
  src/routes/chat-mobile/chat-mobile.test.tsx
→ Test Files  5 passed (5)
→      Tests  45 passed (45)
```

### TSC

- **All new files** (cc-terminal/*.{ts,tsx}, routes/chat-mobile/index.tsx, routes/ai-chat/index.tsx, all test files): **0 errors**.
- **routes/ai-chat/* baseline delta**: errors decreased from 19 (pre-167-04) to 14 (post-167-04). The 5-error decrease is because the legacy fat panel's pre-existing type errors moved verbatim from `index.tsx` to `legacy-ai-chat-panel.tsx` without growing — the new `index.tsx` stub is type-clean.

### Sacred-Guard Byte-Identity

All 9 sacred-guard server-side files verified byte-identical via `git hash-object` against the pre-167 baseline (commit `4bedc04b`):

| File | Hash | Status |
|------|------|--------|
| `liv/packages/core/src/sdk-agent-runner.ts` | `f3538e1d...` | **Sacred SHA preserved** |
| `livos/.../server/ws-agent.ts` | `8fee9a1d...` | byte-identical |
| `livos/.../cc-pty/manager.ts` | `865b1ad2...` | byte-identical |
| `livos/.../cc-pty/ws-handler.ts` | `97c53770...` | byte-identical |
| `livos/.../cc-pty/session-store.ts` | `1704cfd7...` | byte-identical |
| `livos/.../luse-system-prompt.ts` | `2083f0a3...` | D-09 byte-identical |
| `livos/.../ai/agent-prompt-builder.ts` | `dc1831f5...` | Phase 161-02 byte-identical |
| `livos/.../claude-runner/vault-scaffolder.ts` | `5ddfd065...` | Phase 162-01 byte-identical |
| `liv/packages/core/src/agent-session.ts` | `7c690d59...` | Phase 162-02 byte-identical |
| `livos/.../autonomous-scheduler/scheduler.ts` | `f7c03317...` | Phase 164 byte-identical |
| `livos/.../claude-runner/idle-reaper.ts` | `8eea049e...` | Phase 165-01 byte-identical |
| `livos/.../server/index.ts` | `c1eea679...` | byte-identical (no mount changes) |

### Dependency Invariant

- `git diff 4bedc04b HEAD -- livos/packages/ui/package.json` → **empty**
- `git diff 4bedc04b HEAD -- livos/pnpm-lock.yaml` → **empty**

**D-NEW-DEPS-v35 satisfied**: zero new dependencies added. (Note: this required Plan 167-01 to drop the `@xterm/addon-web-links` + `@xterm/addon-canvas` addons the original plan referenced — they were never in the lockfile despite the pre-flight claim. Documented in 167-01-SUMMARY.md.)

## Deviations Summary

Per-plan deviation details live in the four `167-NN-SUMMARY.md` files. High-level theme:

1. **Plan documentation drift (Rule 1 / Rule 3)** — The plan's interface blocks contained two documentation errors that would have shipped a broken product if followed literally:
   - Server stdout envelope field name: plan said `payload`, server emits `data`. Client fixed.
   - Server exit event type: plan said `exit`, server emits `exited`. Client fixed.
2. **Pre-flight dependency claim incorrect (Rule 3)** — `@xterm/addon-web-links` + `@xterm/addon-canvas` are NOT in the lockfile despite "8 lockfile refs pre-verified" claim. Per D-NEW-DEPS-v35 we cannot add deps in Phase 167, so the addons were dropped. Terminal still functions: links render as plain text, default DOM renderer replaces canvas renderer.
3. **Type signature mismatch (Rule 3)** — Plan referenced `LivosTheme.colorScheme` which does not exist. The actual hook returns `{theme, resolvedTheme: 'light'|'dark'|'iridescent', setTheme}`. Code adapted; theme-provider.tsx not touched.
4. **D-V35-K target adjustment (Rule 3)** — There is no `SdkChatPanel` in the codebase. The "legacy SDK chat" was the inline 750-line `AiChat` default-export in `routes/ai-chat/index.tsx`. Adapted: moved to `legacy-ai-chat-panel.tsx`, enforced single-import invariant against that module name instead. Spirit preserved.

All deviations were Rule 1/2/3 auto-fixes (no Rule 4 architectural escalations needed).

## Human Verification Plan (deferred to Phase 170)

xterm.js requires a real browser canvas/DOM to render its terminal viewport — jsdom cannot exercise the visual layer. The vitest suite proves React lifecycle, prop wiring, cleanup contracts, and theme-helper purity, but the actual rendering needs a real Chrome/Firefox session. Phase 170's UAT walks the checklist captured in this file's frontmatter.

## Next Phase

**Phase 168 — Session Sidebar + Lifecycle UI** (wave 2). Wires the `setActiveSessionId` setter the Phase 167-04 AI Chat route exposes (currently underscore-prefixed as `_setActiveSessionId` for lint silence). Adds the session list rendering, create-new-session button, and connects to the Phase 166-04 server API for session CRUD.
