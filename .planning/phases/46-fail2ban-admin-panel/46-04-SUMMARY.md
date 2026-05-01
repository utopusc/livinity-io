---
phase: 46-fail2ban-admin-panel
plan: "04"
subsystem: ui-fail2ban-admin-panel
tags: [fail2ban, ui, react, trpc-react, security-section, sidebar, modal, audit-log, settings-toggle]
dependency_graph:
  requires:
    - 46-03-SUMMARY.md (5-procedure tRPC router: listJails, getJailStatus, listEvents, unbanIp, banIp)
    - livos/packages/ui/src/routes/docker/store.ts (12-entry SECTION_IDS pattern)
    - livos/packages/ui/src/routes/docker/sidebar.tsx (SECTION_META + Tabler icon import pattern)
    - livos/packages/ui/src/routes/docker/docker-app.tsx (SectionView switch)
    - livos/packages/ui/src/routes/docker/activity/activity-section.tsx (sticky header + polling analog)
    - livos/packages/ui/src/routes/docker/stacks/stack-dialogs.tsx (Dialog + Checkbox modal analog)
    - livos/packages/ui/src/routes/settings/_components/past-deploys-table.tsx (Table + Badge audit analog)
    - livos/packages/ui/src/routes/settings/_components/settings-toggle-row.tsx (existing toggle row primitive)
  provides:
    - 13th LIVINITY_docker sidebar entry ('security' between activity and schedules)
    - SecuritySection root with 5s-polled jail tabs + 4-state service banner + audit log tab
    - JailStatusCard (per-jail chips + banned-IP table)
    - UnbanModal (whitelist checkbox + 5s click debounce + B-01 user-education)
    - BanIpModal (two-stage type-LOCK-ME-OUT + Zod IPv4 + cellular toggle)
    - AuditLogTab (read-side device_audit_log surface)
    - SecurityToggleRow (Settings toggle writing user_preferences.security_panel_visible)
    - sidebar visibility filter coupling SECTION_IDS to security_panel_visible preference
  affects:
    - 46-05-PLAN.md (Settings page wiring + final UAT prep — uses SecurityToggleRow)
    - ROADMAP.md §46 success criterion #1 (sidebar 13th entry rendered)
    - ROADMAP.md §46 success criterion #6 (settings toggle persists preference)
tech_stack:
  added: []
  patterns:
    - React Query polling cadence (refetchInterval: 5_000, staleTime: 2_500, retry: false)
    - trpcReact.useUtils() + utils.fail2ban.invalidate() for manual refresh + post-mutation invalidation
    - Zod client-side IPv4 dotted-quad regex (defense-in-depth — backend is canonical)
    - Two-stage modal pattern: detect TRPCClientError data.code === 'CONFLICT' && message === 'self_ban' → re-render Stage 2 with type-LOCK-ME-OUT input
    - Sidebar visibility coupled to user_preferences via trpcReact.preferences.get.useQuery
    - 1-line section barrel re-export (matches activity.tsx + logs.tsx convention)
    - SECTION_LABELS exhaustiveness fix in palette-results.ts to satisfy Record<SectionId, string>
key_files:
  created:
    - livos/packages/ui/src/routes/docker/sections/security.tsx
    - livos/packages/ui/src/routes/docker/security/security-section.tsx
    - livos/packages/ui/src/routes/docker/security/jail-status-card.tsx
    - livos/packages/ui/src/routes/docker/security/unban-modal.tsx
    - livos/packages/ui/src/routes/docker/security/ban-ip-modal.tsx
    - livos/packages/ui/src/routes/docker/security/audit-log-tab.tsx
    - livos/packages/ui/src/routes/settings/_components/security-toggle-row.tsx
  modified:
    - livos/packages/ui/src/routes/docker/store.ts
    - livos/packages/ui/src/routes/docker/sidebar.tsx
    - livos/packages/ui/src/routes/docker/docker-app.tsx
    - livos/packages/ui/src/routes/docker/palette/palette-results.ts
decisions:
  - "Used IconShieldLock (not IconLock) — both available in @tabler/icons-react package; Shield variant communicates the security/firewall semantic better"
  - "All 4 Button variant='outline' calls (the analog pattern from stack-dialogs.tsx) → variant='default' to satisfy this codebase's narrowed Button variant union ('default'|'destructive'|'primary'|'secondary'|'ghost'). Pre-existing files using variant='outline' (stack-dialogs.tsx, add-credential-dialog.tsx) remain unchanged — they're part of the 536 baseline TS error set"
  - "palette-results.ts SECTION_LABELS Record<SectionId, string> required new 'security' entry to compile (Rule 3 — type completeness). Without this fix, store.ts SectionId union expansion would have introduced a permanent compile error"
  - "BanIpInput.confirmation narrowed from string | undefined to 'LOCK ME OUT' | undefined to match backend Zod schema z.literal('LOCK ME OUT').optional() — keeps tRPC mutateAsync input type strict"
  - "v29.4 IP-detection simplification: HTTP X-Forwarded-For + active SSH IPs surface only AFTER the backend rejects with CONFLICT 'self_ban' (cause.adminIps in Stage 2). Stage 1 shows 'unknown' / '(none)' placeholders. v30+ may add fail2ban.detectAdminIps query for proactive Stage 1 display — documented inline as a code comment"
  - "SecurityToggleRow consumes the existing SettingsToggleRow primitive instead of re-implementing the row chrome — keeps Settings styling consistent across the page"
  - "Sidebar visibility filter uses useMemo over SECTION_IDS rather than mutating SECTION_META — sub-issue #4 mandates non-destructive backout: hiding sidebar entry must NOT prevent SECTION_META lookups for the section that's currently open"
  - "Cellular toggle is session-scoped (useState in security-section.tsx, NOT persisted) per FR-F2B-05 — admin-attested per-session truth (B-19 contract is admin-honest)"
  - "Audit log tab refetchInterval: 5s mirrors the section's polling cadence — operators expect bans logged within 5s of the action (matches Phase 28 activity feed UX)"
metrics:
  duration: ~14 minutes (read-first survey + 11 file write/modify + 3 verification gates)
  completed: "2026-05-01T21:36:00Z"
  source_loc: ~770   # 7 new files: ~700 + 4 modifications: ~70
  baseline_ts_errors: 536  # ui package npx tsc --noEmit (pre-Plan-04)
  post_plan_ts_errors: 536 # zero delta — plan acceptance gate met
  source_commit: f70128b4
---

# Phase 46 Plan 46-04: Fail2ban Admin UI Section (Wave 4) Summary

**One-liner:** 7 new UI files + 4 modifications wire the 13th LIVINITY_docker sidebar entry ('Security') to Plan 03's tRPC router — 5s-polled section root, two-stage type-LOCK-ME-OUT ban modal, whitelist-aware unban modal, audit log table, Settings toggle, all encoding B-01/B-02/B-03/B-19 + W-02/W-03/W-04/W-05 + sub-issue #4 mitigations. Zero new TypeScript errors beyond the 536 pre-existing baseline. Sacred file untouched.

## What Was Built

### Modified files (4)

#### `routes/docker/store.ts` (+6 lines)

Added `'security'` to BOTH the `SectionId` union AND the `SECTION_IDS` readonly array, between `'activity'` and `'schedules'` per the operator-cluster ordering (Security sits next to Activity timeline). The `as const satisfies readonly SectionId[]` invariant from Phase 24-01 ties runtime list to type — this single insertion expanded the section count from 12 to 13 across the entire docker-app surface.

#### `routes/docker/sidebar.tsx` (+24 lines)

Three additions:

1. **Icon import** — `IconShieldLock` from `@tabler/icons-react` (verified present in the installed version).
2. **SECTION_META entry** — `security: {icon: IconShieldLock, label: 'Security', comingPhase: 46}`. Label is `'Security'` (NOT `'Fail2ban'`) per architecture research Anti-Pattern 4: leaves room for future audit/sessions/alerts sub-tabs without rename.
3. **Visibility filter** — `trpcReact.preferences.get.useQuery({keys: ['security_panel_visible']})` reads the user preference. `useMemo`-wrapped `securityVisible` defaults ON (treats `undefined`/`null`/`true` as visible; only explicit `false` hides). `visibleSectionIds` filters the array passed to the nav `.map(...)` so the entry disappears without affecting `SECTION_META` lookups for the currently-open section (sub-issue #4 — non-destructive backout).

#### `routes/docker/docker-app.tsx` (+3 lines)

Added `import {Security} from './sections/security'` and a new `case 'security': return <Security />` branch in the exhaustive `SectionView` switch. TypeScript narrowing made the missing case a compile error before this fix landed.

#### `routes/docker/palette/palette-results.ts` (+3 lines) — Rule 3 type-completeness fix

The cmd+k palette stores friendly section labels as `Record<SectionId, string>`. Expanding `SectionId` with `'security'` introduced a missing-property compile error (TS2741). Added `security: 'Security'` entry. **Auto-fix justification:** without this fix, the store.ts change would have introduced a permanent baseline TypeScript error — covered by deviation Rule 3 (auto-fix blocking issues caused directly by the current task's changes).

### New files (7)

#### `routes/docker/sections/security.tsx` — 1-line barrel

Mirrors the `activity.tsx` + `logs.tsx` convention exactly:

```tsx
export {SecuritySection as Security} from '../security/security-section'
```

The `as Security` rename harmonizes with how `Activity` is imported — `DockerApp.tsx` doesn't have to know about the longer `*Section` name.

#### `routes/docker/security/security-section.tsx` (~250 LOC) — section root

**Composes:**
- 5s-polled `trpcReact.fail2ban.listJails.useQuery` (POLL_INTERVAL_MS=5_000, STALE_TIME_MS=2_500, retry:false) — pitfall W-02
- 5s-polled `trpcReact.fail2ban.getJailStatus.useQuery` gated on `enabled: !!effectiveJail`
- `trpcReact.fail2ban.unbanIp.useMutation` with `onSuccess: utils.fail2ban.invalidate()`
- `trpcReact.fail2ban.banIp.useMutation` (no auto-invalidate — modal handles flow via mutateAsync to detect CONFLICT)

**Renders:**
- Sticky header: title + IconShieldLock + 'Fail2ban restarting…' transient badge (B-05) + 'I'm on cellular' Checkbox (FR-F2B-05) + Refresh button + 'Ban an IP' destructive button
- 4-state service banner (FR-F2B-01 / W-04):
  - `binary-missing` → red `<div>` "Fail2ban not installed. Run /opt/livos/install.sh on Mini PC."
  - `service-inactive` → yellow `<div>` "Fail2ban service is stopped. Run systemctl start fail2ban on Mini PC."
  - `no-jails` → yellow `<div>` "Fail2ban running but no jails configured." + link to fail2ban docs
  - `running` → no banner; render Tabs (Jails / Audit log)
- Inside `running` tab:
  - Jail buttons (auto-discover from `listJails.data.jails` — pitfall W-03 — never hardcode `sshd`); selected jail = primary variant
  - `JailStatusCard` for the selected jail (counts chips + banned-IP table)
  - `AuditLogTab` for the audit-log tab
- `UnbanModal` (controlled by `unbanCtx` state)
- `BanIpModal` (controlled by `banModalOpen` state)

**Cellular toggle** is session-scoped `useState<boolean>` — not persisted, per FR-F2B-05 (admin-attested per-session truth).

#### `routes/docker/security/jail-status-card.tsx` (~95 LOC)

Props: `{jail, status: JailStatus, onUnbanClick}`. Renders:
- 4 Badge chips: currently failed / total failed / currently banned (destructive variant) / total banned
- shadcn Table with columns Banned IP / Last Attempted User / Last Attempt / Action
- Per-row Unban button (`variant='default'`, `size='sm'`) calling `onUnbanClick(ip, lastAttemptedUser, lastAttemptedAt)`
- Empty state: "No IPs currently banned in {jail}."
- `lastAttemptedUser` gracefully renders `—` when undefined (FR-F2B-02 sub-issue #3 — backend may not always supply it)
- `safeFormatRelative` wraps `parseISO` + `formatDistanceToNow` in try/catch (mirrors past-deploys-table.tsx)

#### `routes/docker/security/unban-modal.tsx` (~110 LOC)

Mirrors `RemoveStackDialog` exactly:
- DialogTitle: `Unban {ip} from {jail}`
- DialogDescription: includes last-attempt-at via `formatDistanceToNow` (when present) + last-attempted-user (gracefully omitted when undefined)
- **B-01 user-education note** in inline amber-bordered card: "After unban, fail2ban may re-ban this IP if connection attempts continue with bad credentials. Verify your SSH key is correct first."
- shadcn Checkbox: "Add to ignoreip whitelist (prevents re-ban from this IP)" — defaults UNCHECKED (admin must opt-in to whitelist)
- Footer: Cancel + Unban (destructive variant). On click, `onConfirm(addToWhitelist)` is called and the button enters a 5s `setTimeout`-driven debounce (W-01 — prevent double-fire even when parent's `isUnbanning` flag flips slowly on fast LANs)
- Resets local state on every reopen via `useEffect([open])` so previous IP's checkbox doesn't bleed into next confirmation

#### `routes/docker/security/ban-ip-modal.tsx` (~250 LOC)

Two-stage modal:

**Stage 1 (NORMAL ban):**
- shadcn Input for IP address — captioned "IPv4 dotted-quad — no CIDR"
- shadcn Select for jail (from `jails` prop)
- Client-side Zod schema:
  ```ts
  const IPV4_REGEX = /^(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/
  const ipSchema = z.string().trim().refine(s => IPV4_REGEX.test(s), 'IPv4 dotted-quad only — no CIDR allowed (pitfall B-03)')
  ```
- Dual-IP surface card: "Your HTTP request came from: {currentHttpIp ?? 'unknown'}" + "Active SSH sessions from: {activeSshIps.join(', ') || '(none)'}"
- "I'm on cellular (CGNAT — disable self-ban check; pitfall B-19)" Checkbox flowing to `cellularBypass` field
- Submit calls `onSubmit({jail, ip, cellularBypass: isCellular})` via `try/catch`

**Stage 2 (SELF-BAN — only when Stage 1 rejects with TRPCError CONFLICT 'self_ban'):**
- Re-render with destructive amber copy: `WARNING: {ip} is YOUR CURRENT CONNECTION IP. Banning will lock you out.`
- If `err.data.cause.adminIps` is present, surface "These IPs were detected as your active sessions: …" (admin-readable per Plan 03 SUMMARY)
- shadcn Input bound to `confirmText`. Strict equality `confirmText === 'LOCK ME OUT'` enables Confirm Ban button
- On confirm: re-call `onSubmit({jail, ip, confirmation: 'LOCK ME OUT', cellularBypass})` — backend re-validates literal string and proceeds

**Type-narrowing decision (Rule 3):** `BanIpInput.confirmation` is typed `'LOCK ME OUT' | undefined` (literal union, not `string | undefined`) to match backend `z.literal('LOCK ME OUT').optional()`. `LOCK_ME_OUT` const declared `as const` so TypeScript infers the literal type at the Stage 2 call site.

#### `routes/docker/security/audit-log-tab.tsx` (~115 LOC)

Mirrors `past-deploys-table.tsx` structure:
- 5s-polled `trpcReact.fail2ban.listEvents.useQuery({limit: 50})` — refetchInterval, staleTime mirror the section
- shadcn Table with columns When (relative via `safeFormatRelative`) / Action (Badge variant tied to `ban_ip`/`unban_ip`/`whitelist_ip`) / Jail / IP / Admin / Result (success/failed Badge with hover-title showing error message)
- Loading state: "Loading…" placeholder
- Empty state: "No ban/unban events recorded yet."
- Defensive `typeof` checks on every backend field (Plan 03 surfaces a loose `Record<string, unknown>` shape)

#### `routes/settings/_components/security-toggle-row.tsx` (~45 LOC)

Self-contained Settings row consuming the existing `SettingsToggleRow` primitive:
- Reads `trpcReact.preferences.get.useQuery({keys: ['security_panel_visible']})` — defaults ON (only explicit `false` is OFF)
- On change, calls `trpcReact.preferences.set.useMutation({key: 'security_panel_visible', value})` and invalidates both `preferences.get` + `preferences.getAll` so sidebar.tsx re-reads
- Title: "Security panel"
- Description: "Show the Security sidebar entry inside Server Management. Toggling off hides the panel without uninstalling fail2ban."
- Disabled while either query is in-flight

**Wiring into Settings page** is intentionally deferred to Plan 46-05 per the milestone plan ("Settings 'Show Security panel' toggle + final UAT prep"). The component is fully built and ready to be imported into `settings-content.tsx`.

## Verification Gates (all passed)

| Gate | Status |
|------|--------|
| `pnpm --filter @livos/config build` | PASS |
| `pnpm --filter ui build` | PASS (Vite, 32.20s, exit 0) |
| `npx tsc --noEmit` baseline → 536 errors (pre-Plan-04) | confirmed |
| `npx tsc --noEmit` post-plan → 536 errors (DELTA = 0) | PASS |
| `git diff --shortstat HEAD~1 HEAD -- nexus/packages/core/src/sdk-agent-runner.ts` → empty | PASS (sacred file byte-identical) |
| `grep -c security livos/packages/ui/src/routes/docker/store.ts` → 2 (SectionId + SECTION_IDS) | PASS |
| `grep -E "security:|IconShieldLock\|security_panel_visible" sidebar.tsx` → 5 hits | PASS |
| `grep "case 'security'" docker-app.tsx` → 1 hit | PASS |
| `grep "addToWhitelist" unban-modal.tsx` → 4 hits (FR-F2B-02) | PASS |
| `grep "fail2ban may re-ban" unban-modal.tsx` → 1 hit (B-01) | PASS |
| `grep "LOCK ME OUT" ban-ip-modal.tsx` → 2 hits (B-02) | PASS |
| `grep "IPV4_REGEX" ban-ip-modal.tsx` → 2 hits (B-03 client layer) | PASS |
| `grep "cellularBypass" ban-ip-modal.tsx` → 3 hits (B-19) | PASS |
| `grep "self_ban" ban-ip-modal.tsx` → 3 hits (CONFLICT detection) | PASS |
| `grep "fail2ban.listEvents.useQuery" audit-log-tab.tsx` → 1 hit (FR-F2B-04) | PASS |
| `grep "fail2ban.listJails.useQuery\|fail2ban.getJailStatus.useQuery" security-section.tsx` → 2 hits | PASS |
| `grep "binary-missing\|service-inactive\|no-jails" security-section.tsx` → 6 hits (FR-F2B-01) | PASS |
| `grep "transient" security-section.tsx` → 4 hits (B-05) | PASS |
| `grep "cellular" security-section.tsx` → 5 hits (FR-F2B-05) | PASS |
| `grep "BanIpModal\|UnbanModal\|AuditLogTab\|JailStatusCard" security-section.tsx` → 11 hits | PASS |
| `grep "trpcReact.preferences.set" security-toggle-row.tsx` → 1 hit | PASS |
| `grep "security_panel_visible" security-toggle-row.tsx` → 2 hits | PASS |
| `git log -1 --diff-filter=D --name-only HEAD` → no deletions | PASS |
| Atomic commit `f70128b4` exists in `git log` | PASS |

## Pitfall Mitigation Cross-Reference

| Pitfall / FR | Mitigation Encoded In | File:Lines |
|--------------|------------------------|------------|
| **FR-F2B-01** (jail-list UI + 4-state banner) | `security-section.tsx` 4-state branch | security-section.tsx:155-203 |
| **FR-F2B-02** (unban + whitelist checkbox + last-attempted-user surface) | `unban-modal.tsx` Checkbox `addToWhitelist` + last-attempt rendering | unban-modal.tsx:113-122, jail-status-card.tsx:80 |
| **FR-F2B-03** (manual ban + type-LOCK-ME-OUT) | `ban-ip-modal.tsx` two-stage gate | ban-ip-modal.tsx:240-300 |
| **FR-F2B-04** (audit log) | `audit-log-tab.tsx` listEvents query | audit-log-tab.tsx:39-48 |
| **FR-F2B-05** (cellular + dual-IP) | `security-section.tsx` cellular state + `ban-ip-modal.tsx` dual-IP card | security-section.tsx:177-184, ban-ip-modal.tsx:182-202 |
| **FR-F2B-06** (Settings toggle hides sidebar) | `security-toggle-row.tsx` + `sidebar.tsx` visibility filter | security-toggle-row.tsx:full + sidebar.tsx:80-95 |
| **B-01** (re-ban after unban surprise) | `unban-modal.tsx` inline amber user-education note | unban-modal.tsx:107-110 |
| **B-02** (banning own IP without confirm) | `ban-ip-modal.tsx` Stage 2 type-LOCK-ME-OUT strict equality | ban-ip-modal.tsx:135, 261-273 |
| **B-03** (CIDR /0 mass-ban) | `ban-ip-modal.tsx` Zod IPv4 regex (defense in depth) | ban-ip-modal.tsx:35-40 |
| **B-05** (transient errors crash UI) | `security-section.tsx` `transient` Badge + render last-known data | security-section.tsx:91-94, 167-171 |
| **B-19** (cellular CGNAT false self-ban) | `security-section.tsx` cellular toggle + `ban-ip-modal.tsx` cellularBypass field | security-section.tsx:177-184, ban-ip-modal.tsx:191-200 |
| **W-01** (double-fire mutation) | `unban-modal.tsx` 5s `setTimeout` debounce post-click | unban-modal.tsx:80-91 |
| **W-02** (polling cadence) | `security-section.tsx` POLL_INTERVAL_MS=5_000 + STALE_TIME_MS=2_500 + retry:false | security-section.tsx:54-55, 71-105 |
| **W-03** (hardcoded `sshd`) | `security-section.tsx` jails auto-discovered from `listJails.data.jails` | security-section.tsx:78-82, 222-232 |
| **W-04** (4-state banner) | `security-section.tsx` distinct banners for binary-missing/service-inactive/no-jails/running | security-section.tsx:155-203 |
| **W-05** (transient retry) | `security-section.tsx` transient: true badge + faded data, no crash | security-section.tsx:91-94, 167-171 |
| **W-18** (non-destructive backout) | `sidebar.tsx` `useMemo` filter only — no SECTION_META mutation, no auto-redirect | sidebar.tsx:80-95 |
| **Sub-issue #4** (toggle off mid-session) | `sidebar.tsx` filters SECTION_IDS only; `useDockerStore.section` continues unchanged | sidebar.tsx:91-95 |

## Tabler Icon Choice

Both `IconShieldLock` AND `IconLock` are available in the installed `@tabler/icons-react` version (verified via `node_modules/@tabler/icons-react/dist/esm/icons/`). Chose **`IconShieldLock`** because the Shield variant communicates the security/firewall semantic better — fail2ban is a host-perimeter firewall tool, and the shield iconography reads as "boundary protection" while a plain lock icon reads as "access control / authentication" (better matched to login flows).

## Deviations from Plan

**Three minor adjustments (Rule 1 / Rule 3 — type/correctness fixes):**

1. **`palette-results.ts` SECTION_LABELS expanded** (Rule 3 — type completeness). Adding `'security'` to `SectionId` exposed a missing-property compile error in the cmd+k palette helper. Added `security: 'Security'` to keep the codebase compiling. Without this, the plan would have introduced a permanent baseline TS error (would have broken the "zero new TS errors" gate).

2. **All 4 `Button variant='outline'` calls → `variant='default'`** (Rule 1 — TS error fix). The plan's PATTERNS.md explicitly references `variant='outline'` in stack-dialogs.tsx as the analog. However, this codebase's `Button` component (`shadcn-components/ui/button.tsx`) defines variants as `'default'|'destructive'|'primary'|'secondary'|'ghost'` only — `'outline'` is NOT a valid Button variant (existing files using it are pre-baseline TS errors). Switched to `'default'` which renders a bordered surface-1 button visually identical to a typical outline. The pre-existing `variant='outline'` calls in stack-dialogs.tsx and add-credential-dialog.tsx remain unchanged (out-of-scope cleanup).

3. **`BanIpInput.confirmation` narrowed from `string` to `'LOCK ME OUT'` literal union** (Rule 3 — type completeness). Backend Plan 03 schema is `z.literal('LOCK ME OUT').optional()`, which tRPC types as `'LOCK ME OUT' | undefined`. The modal's interface was widened to `string | undefined`, causing a type mismatch at `banMutation.mutateAsync(input)`. Narrowed the interface AND added `as const` to the `LOCK_ME_OUT` constant to ensure call sites pass the literal type.

None of these change the plan's contract or violate any acceptance criterion. All three are documented inline as code comments.

## Settings Page Wiring (deferred to Plan 05)

Per STATE.md Active Todos: "Phase 46 Plan 05 (Settings 'Show Security panel' toggle + final UAT prep)". Plan 46-04 produces the `SecurityToggleRow` component with full read/write/invalidation logic; Plan 05 will import it into `settings-content.tsx` (likely under the existing Advanced or Server Management section group).

Until Plan 05 ships, the toggle component is unmounted — meaning `security_panel_visible` always reads as `undefined` (default ON), so the sidebar entry is unconditionally visible. This is the correct intermediate state per FR-F2B-06's default-ON contract.

## Sub-issues Surfaced for Plan 05 / UAT

- **Wire SecurityToggleRow into settings-content.tsx** — likely placement: under the "Server Management" or "Advanced" section group, near the existing scheduler/external-DNS toggles. (Plan 05 owns this.)
- **First-run UX** — after Plan 05 ships, on a fresh deploy the user should see the Security panel by default. Plan 05's UAT script should verify this.
- **Toggle off → toggle back on roundtrip** — verify the sidebar entry hides and reappears with no race conditions on `preferences.get` cache. Plan 05 UAT.
- **Mini PC cellular bypass UAT** — open Security section while on cellular hotspot, confirm "I'm on cellular" toggle suppresses self-ban check (manually verifiable on Mini PC against real fail2ban).
- **Audit log polling** — open Audit log tab, ban a test IP via Stage 1 (non-self), verify the ban_ip row appears within 5s.

## Self-Check: PASSED

- [x] File `livos/packages/ui/src/routes/docker/store.ts` modified — `'security'` in BOTH SectionId union AND SECTION_IDS array
- [x] File `livos/packages/ui/src/routes/docker/sidebar.tsx` modified — IconShieldLock import + SECTION_META entry + visibility filter via `trpcReact.preferences.get`
- [x] File `livos/packages/ui/src/routes/docker/docker-app.tsx` modified — `case 'security': return <Security />`
- [x] File `livos/packages/ui/src/routes/docker/palette/palette-results.ts` modified — `security: 'Security'` added to SECTION_LABELS
- [x] File `livos/packages/ui/src/routes/docker/sections/security.tsx` exists — 1-line barrel `export {SecuritySection as Security}`
- [x] File `livos/packages/ui/src/routes/docker/security/security-section.tsx` exists — section root with 5s polling + 4-state banner + tabs + modals
- [x] File `livos/packages/ui/src/routes/docker/security/jail-status-card.tsx` exists — counts chips + banned-IP table
- [x] File `livos/packages/ui/src/routes/docker/security/unban-modal.tsx` exists — whitelist checkbox + 5s debounce + B-01 note
- [x] File `livos/packages/ui/src/routes/docker/security/ban-ip-modal.tsx` exists — two-stage type-LOCK-ME-OUT + Zod IPv4 + cellular toggle
- [x] File `livos/packages/ui/src/routes/docker/security/audit-log-tab.tsx` exists — listEvents query + Action/Result Badge table
- [x] File `livos/packages/ui/src/routes/settings/_components/security-toggle-row.tsx` exists — Settings toggle row writing user_preferences.security_panel_visible
- [x] Atomic commit `f70128b4` exists in `git log`
- [x] `pnpm --filter ui build` exits 0
- [x] `npx tsc --noEmit` reports 536 errors (zero delta from 536 baseline)
- [x] Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` UNTOUCHED (`git diff --shortstat HEAD -- ...` empty)
- [x] No new dependencies added (D-NO-NEW-DEPS upheld)
- [x] No new database tables (sidebar visibility uses existing user_preferences key)
- [x] No file deletions (`git diff --diff-filter=D --name-only HEAD~1 HEAD` empty)
- [x] All 6 FR-F2B requirements have UI surface
- [x] All 4 critical pitfalls (B-01/B-02/B-03/B-19) encoded with grep-verifiable literals

## Threat Flags

None. The new UI consumes existing adminProcedure-gated tRPC routes from Plan 03 (no new network endpoints, no new auth paths, no new file access patterns, no schema changes). Sidebar visibility uses an existing `user_preferences` table — no new trust boundaries. The dual-IP surface in `ban-ip-modal.tsx` only renders strings that the backend already returns to authenticated admins (no new info disclosure).
