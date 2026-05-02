---
phase: 48-live-ssh-session-viewer
plan: "02"
subsystem: ui-security-section
tags: [ui, ssh-sessions, websocket, ring-buffer, click-to-ban, click-to-copy, scroll-tolerance, fr-ssh-02]
requires: ["48-01"]
provides:
  - "Live-tail SSH-sessions tab inside Security section"
  - "Click-to-ban cross-link from SSH events to Phase 46 BanIpModal"
  - "5000-event client-side ring buffer with scroll-tolerance auto-disable"
affects:
  - livos/packages/ui/src/routes/docker/security/security-section.tsx
  - livos/packages/ui/src/routes/docker/security/ban-ip-modal.tsx
tech-stack:
  added: []
  patterns:
    - "Native browser WebSocket (no socket.io / no library) — mirrors Phase 28 docker-logs"
    - "Lifted-up state for cross-component IP propagation (security-section.banModalIp)"
    - "Additive-only prop extension on Phase 46 BanIpModal (initialIp?: string) — preserves all existing call sites"
    - "Local-time HH:mm:ss display with full ISO date in tooltip"
    - "Discriminated-union ConnectionState for type-exhaustive close-code banners"
key-files:
  created:
    - livos/packages/ui/src/routes/docker/security/ssh-sessions-tab.tsx
  modified:
    - livos/packages/ui/src/routes/docker/security/security-section.tsx
    - livos/packages/ui/src/routes/docker/security/ban-ip-modal.tsx
decisions:
  - "Use localStorage 'jwt' (not LIVINITY_SESSION cookie) — mirrors 4 existing UI WS call sites"
  - "Native WebSocket + useState ring buffer — no react-window / no virtualization (Phase 28 precedent)"
  - "Lifted IP state in security-section.tsx + additive initialIp prop on BanIpModal — does NOT modify Phase 46 modal logic, only extends interface"
  - "Distinct banner copy for close codes 4403 (admin) vs 4404 (journalctl missing) vs 1006/1011/1000 (network)"
  - "Reset banModalIp on modal close so header 'Ban an IP' click re-opens with empty input"
metrics:
  duration_minutes: 15
  completed: "2026-05-02"
  requirements_closed: ["FR-SSH-02"]
  loc_delta: 354
  files_created: 1
  files_modified: 2
  ts_error_delta: 0
  new_deps: 0
  build_status: "pass"
---

# Phase 48 Plan 48-02: SSH Sessions UI Tab Summary

**One-liner:** Live-tail SSH-sessions tab streams `/ws/ssh-sessions` events into a 5000-row ring-buffered table with click-to-copy + click-to-ban affordances, cross-linking into the Phase 46 BanIpModal via a 3-line additive `initialIp?: string` prop and lifted-up state in `security-section.tsx`.

## What shipped

The `Security` panel inside Server Management → Docker now has a third sub-tab **SSH Sessions** (alongside `Jails` and `Audit log`). Opening the tab establishes a browser WebSocket to `/ws/ssh-sessions?token=<jwt>` (built in Plan 48-01) and streams sshd events as live-tail rows. Each row shows local-time HH:mm:ss, the raw sshd MESSAGE, and (when present) the source IP. The IP cell exposes two icon buttons: a Copy (writes to `navigator.clipboard`) and a destructive Ban (delegates up via `onBanIp(ip)`). Clicking Ban opens the existing Phase 46 `BanIpModal` with the IP **pre-populated** — admin types `LOCK ME OUT` if it's a self-ban, otherwise just confirms. End-to-end observation-to-action loop: see → click → ban — without leaving the page.

When a user scrolls upward by more than 4 px (`SCROLL_TOLERANCE_PX = 4`) inside the table, live-tail auto-disables and a primary "Resume tailing" button surfaces; clicking it re-enables auto-scroll and snaps to the bottom. The client maintains a 5000-event ring buffer (`RING_BUFFER_LIMIT = 5_000`); the 5001st event drops the oldest. Close codes from the WS handler trigger distinct banners: `4403` → "Admin role required", `4404` → "journalctl unavailable on host", `1006/1011/1000` → "Connection lost / Server closed" with a Reconnect button.

## Cross-link contract

```
ssh-sessions-tab.tsx
  └─ onBanIp(ev.ip)                                         // lifted callback prop
        │
        ▼
security-section.tsx
  ├─ setBanModalIp(ip)                                      // store IP in section state
  └─ setBanModalOpen(true)                                  // open the modal
        │
        ▼
<BanIpModal initialIp={banModalIp} ... />                   // pre-populated open
        │
        ▼
ban-ip-modal.tsx (Phase 46 — additive only)
  └─ useEffect([open, jails, initialIp]):
       if (open) setIp(initialIp ?? '')                     // pre-fill OR fall through
```

The lift-up is the cleanest way to share IP context across `ssh-sessions-tab` and `ban-ip-modal` without coupling them. Phase 46 `BanIpModal` was extended additively (3 lines: interface field, destructure, useEffect dep + setIp arg) — every existing Phase 46 call site that omits `initialIp` continues to receive `undefined` and falls back to `''`, behaving identically to before.

## Files

### Created (1)

| File | LOC | Purpose |
|---|---|---|
| `livos/packages/ui/src/routes/docker/security/ssh-sessions-tab.tsx` | 314 | WebSocket tail + ring buffer + click-to-copy + click-to-ban + scroll-tolerance + close-code banners |

### Modified (2)

| File | Changes | Notes |
|---|---|---|
| `livos/packages/ui/src/routes/docker/security/security-section.tsx` | +24 / −3 | Import SshSessionsTab, widen topTab union, add banModalIp state, third TabsTrigger + TabsContent, pass initialIp + reset-on-close to BanIpModal |
| `livos/packages/ui/src/routes/docker/security/ban-ip-modal.tsx` | +12 / −2 | Additive `initialIp?: string` prop + destructure + useEffect dep + `setIp(initialIp ?? '')` |

**Total LOC delta:** +354 / −8 (net **+346**).

## Verification

### Pre-commit gates

| Gate | Result |
|---|---|
| `git diff --shortstat HEAD -- nexus/packages/core/src/sdk-agent-runner.ts` (sacred file untouched) | **Empty (PASS)** |
| Sacred file SHA pre-plan | `4f868d318abff71f8c8bfbcf443b2393a553018b` |
| Sacred file SHA post-plan | `4f868d318abff71f8c8bfbcf443b2393a553018b` (byte-identical — PASS) |
| TypeScript error count pre-plan | 536 |
| TypeScript error count post-plan | 536 |
| TypeScript error delta | **0 (PASS)** |
| `pnpm --filter @livos/config build` | exit 0 |
| `pnpm --filter ui build` | exit 0 — vite built in 36.49 s, PWA emitted 195 precache entries |
| New npm dependencies (D-NO-NEW-DEPS) | **0 (PASS)** |
| File deletions in commit | **0 (PASS)** |

### Acceptance-criteria verification

**Task 1 — `ssh-sessions-tab.tsx`:**

| Criterion | Result |
|---|---|
| File exists at expected path | ✓ |
| Connects to `/ws/ssh-sessions` (substring present) | ✓ (2 lines) |
| `RING_BUFFER_LIMIT = 5_000` literal | ✓ |
| `SCROLL_TOLERANCE_PX = 4` literal | ✓ |
| Handles close codes 4403 + 4404 explicitly | ✓ (6 occurrences) |
| `navigator.clipboard.writeText` used | ✓ |
| `onBanIp` prop typed + destructured + invoked | ✓ (3 occurrences) |
| `Resume tailing` literal rendered | ✓ |
| No `react-window` / `react-virtualized` / `maxmind` imports | ✓ (clean) |
| ssh-sessions-tab.tsx introduces 0 new TS errors | ✓ |

**Task 2 — `security-section.tsx` + `ban-ip-modal.tsx`:**

| Criterion | Result |
|---|---|
| `import {SshSessionsTab} from './ssh-sessions-tab'` present | ✓ |
| `'ssh-sessions'` literal occurrences in security-section | 5 (state union, onValueChange union, TabsTrigger, TabsContent, comment) |
| `banModalIp` state declared + setter calls + prop pass + reset-on-close | ✓ (5 reference sites) |
| `onBanIp` callback wired in security-section | ✓ |
| `initialIp` references in ban-ip-modal.tsx | 5 (interface, destructure, useEffect setIp arg, useEffect dep, doc comment) |
| `pnpm --filter ui build` passes | ✓ (vite built in 36.49 s) |
| Phase 46 BanIpModal contract preserved (existing callers unchanged) | ✓ (the section-header "Ban an IP" call site does not pass `initialIp` → `undefined ?? ''` → empty input as before) |

## Sacred file SHA verification

```
git rev-parse HEAD:nexus/packages/core/src/sdk-agent-runner.ts (pre-plan):  4f868d318abff71f8c8bfbcf443b2393a553018b
git rev-parse HEAD:nexus/packages/core/src/sdk-agent-runner.ts (post-plan): 4f868d318abff71f8c8bfbcf443b2393a553018b
                                                                            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                                                            byte-identical — sacred-file gate PASSED
```

D-NO-NEW-DEPS upheld. D-NO-SERVER4 upheld (this is a UI-package change; never touches Server4). Phase-46 surgical-edit budget preserved (1 additive prop on BanIpModal does not break Phase 46 acceptance criteria — the section-header "Ban an IP" path still opens an empty modal).

## Wire-format adherence

The UI parses the exact format Plan 48-01 emits — JSON-per-WebSocket-message:

```ts
interface SshSessionEvent {
  timestamp: string   // microseconds-since-epoch (parsed via Number(t) / 1000 → ms → Date)
  message: string     // sshd MESSAGE field
  ip: string | null   // null when no "from <ip>" pattern in message
  hostname?: string   // optional _HOSTNAME field — UI does not currently render
}
```

The UI defensively type-checks `timestamp` and `message` are strings before pushing into state (T-48-09 mitigation — UI does not re-validate; relies on backend filter as authoritative source).

## Manual smoke-test

Smoke-test from a local dev server is **deferred to Plan 48-03 (UAT)** per the standard Phase-48 sequence. The build artefact for this plan compiles cleanly and the static contract has been verified end-to-end (TS check + grep-based acceptance criteria).

## Self-Check: PASSED

**Files verified to exist:**
- `livos/packages/ui/src/routes/docker/security/ssh-sessions-tab.tsx` — FOUND (314 LOC)
- `livos/packages/ui/src/routes/docker/security/security-section.tsx` — FOUND (modified)
- `livos/packages/ui/src/routes/docker/security/ban-ip-modal.tsx` — FOUND (modified)

**Commits verified to exist:**
- `32dec195` — `feat(48-02): SSH Sessions UI tab + click-to-ban cross-link to Phase 46 ban modal (FR-SSH-02)` — FOUND in `git log --oneline`
