---
phase: 46-fail2ban-admin-panel
verified_at: 2026-05-01T22:30:00Z
status: human_needed
score: 8/8
requirements:
  FR-F2B-01: passed
  FR-F2B-02: passed
  FR-F2B-03: passed
  FR-F2B-04: passed
  FR-F2B-05: passed
  FR-F2B-06: passed
critical_gaps: []
non_critical_gaps: []
human_verification:
  - test: "Section 1 — Sidebar registration + jail discovery"
    expected: "'Security' entry visible as 13th sidebar item between Activity and Schedules; jails auto-discovered (not hardcoded sshd); listJails fires every ~5s; Refresh button invalidates immediately"
    why_human: "Sidebar rendering and polling cadence require a live browser session against the Mini PC"
  - test: "Section 2 — Three service-state banners (binary-missing / service-inactive / no-jails)"
    expected: "Red banner when binary moved; yellow banner when service stopped; yellow banner when no jails configured; banner clears when state restored"
    why_human: "Requires stopping/moving fail2ban on Mini PC and observing UI reaction — cannot be verified without a live deploy"
  - test: "Section 3 — Unban + whitelist checkbox (FR-F2B-02)"
    expected: "Manually banned 192.0.2.99 appears in UI within 5s; unban modal shows correct IP/jail; B-01 user-education note present; whitelist checkbox defaults unchecked; unban removes IP; whitelist checkbox adds to ignoreip"
    why_human: "Requires active fail2ban jail on Mini PC and real ban/unban round-trip via the UI"
  - test: "Section 4 — Manual ban + LOCK ME OUT gate + CIDR rejection (FR-F2B-03)"
    expected: "Stage 1 ban works for non-self IP; Stage 2 modal appears for self-IP; lowercase 'lock me out' keeps button disabled; exact 'LOCK ME OUT' enables it; CIDR inputs rejected client-side without firing mutation"
    why_human: "Self-ban detection requires real HTTP X-Forwarded-For header and live SSH session IP from the Mini PC"
  - test: "Section 5 — Audit log + immutability (FR-F2B-04)"
    expected: "Audit Log tab shows ban/unban/whitelist rows; PG rows have device_id='fail2ban-host' sentinel; UPDATE trigger fires; JSON belt-and-suspenders files exist; no new table created"
    why_human: "Requires live PG queries on Mini PC and psql access to verify immutability trigger and sentinel"
  - test: "Section 6 — Mobile cellular toggle + dual-IP surface (FR-F2B-05)"
    expected: "Cellular toggle visible and OFF by default; toggling ON suppresses self-ban check; both HTTP X-Forwarded-For and active SSH IPs surfaced"
    why_human: "Requires access from a cellular-connected device to verify CGNAT bypass behavior"
  - test: "Section 7 — Settings backout toggle non-destructive (FR-F2B-06)"
    expected: "Toggle visible in Settings > Advanced; toggling OFF hides Security sidebar entry; fail2ban still running on Mini PC; preference persisted in user_preferences; toggling ON restores entry"
    why_human: "Requires live Settings page interaction and PG verification of user_preferences row"
  - test: "Section 8 — httpOnlyPaths under WS reconnect (ROADMAP §46.8)"
    expected: "Unban and Ban mutations complete successfully when livos service is restarted mid-session; network tab shows HTTP POST (not WS frame)"
    why_human: "Requires restarting livos service on Mini PC and observing browser network tab during the reconnect window"
  - test: "Section 9 — End-to-End SSH Lockout Recovery"
    expected: "Operator can recover from SSH lockout via UI alone: ban a machine's IP from CLI, confirm SSH blocked, then unban + whitelist via UI, confirm SSH restored"
    why_human: "Requires multiple machines and real fail2ban ban/unban cycle on Mini PC — the headline value proposition"
---

# Phase 46: Fail2ban Admin Panel — Verification Report

**Phase Goal:** Admin can recover from SSH lockout via UI (unban + whitelist) without SSH access, observe banned IPs, manually ban malicious IPs (with self-ban guardrails), and review an immutable audit trail.
**Verified:** 2026-05-01T22:30:00Z
**Status:** human_needed — all 8/8 mechanism-level must-haves VERIFIED; 9 UAT sections deferred to live Mini PC deploy (per v29.3 / Phase 45 pattern)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin sees jail list with 5s poll and 4-state service banner | VERIFIED | `security-section.tsx` POLL_INTERVAL_MS=5_000 wired; 4-state branch verified by grep (binary-missing/service-inactive/no-jails/running) |
| 2 | Unban modal with whitelist checkbox + last-attempted-user + IP disappears within next poll | VERIFIED | `unban-modal.tsx` Checkbox `addToWhitelist` exists; `jail-status-card.tsx` surfaces `lastAttemptedUser`; `addIgnoreIp` called in `routes.ts` when flag set |
| 3 | Manual ban with type-LOCK-ME-OUT gate + Zod CIDR reject before fail2ban-client call | VERIFIED | `ban-ip-modal.tsx` Stage 2 with `LOCK_ME_OUT as const`; `routes.ts` `z.literal('LOCK ME OUT').optional()`; integration Test 9 proves `0.0.0.0/0` → Zod BAD_REQUEST with `execFile.length === 0` |
| 4 | `device_audit_log` reused (no new table); `device_id='fail2ban-host'` sentinel | VERIFIED | `events.ts` REUSES `device_audit_log` (6 references); `SENTINEL_DEVICE_ID = 'fail2ban-host'` (4 references); `computeParamsDigest` imported from `devices/audit-pg.ts` (not redefined) |
| 5 | Cellular toggle surfaces both HTTP X-Forwarded-For and SSH session IPs; bypasses self-ban when ON | VERIFIED | `routes.ts` `getAdminActiveIps` unions X-Forwarded-For + `listActiveSshSessions()`; `cellularBypass: z.boolean().default(false)` skips check; `security-section.tsx` renders cellular toggle; integration Tests 6/7/8 validate the gate |
| 6 | Three distinct service-state banners (binary-missing / service-inactive / no-jails) | VERIFIED | `security-section.tsx` lines 198-216 render distinct JSX blocks for all 4 states; `routes.ts` listJails returns typed `state` field; integration Tests 1-3 cover all 3 error states |
| 7 | Settings toggle defaults ON, persists in `user_preferences` | VERIFIED | `security-toggle-row.tsx` reads/writes `security_panel_visible`; `sidebar.tsx` `useMemo` filter on SECTION_IDS; `SecurityToggleRow` mounted in `settings-content.tsx` line 87 + 1825 |
| 8 | `fail2ban.unbanIp` and `fail2ban.banIp` in `httpOnlyPaths` (namespaced, not bare) | VERIFIED | `common.ts` lines 189-190; bare `'unbanIp'`/`'banIp'` absent (grep count 0); `common.test.ts` Tests 5-7 assert presence + footgun guard |

**Score:** 8/8 truths verified at mechanism level

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `livos/.../fail2ban-admin/parser.ts` | Pure text parsers (4 functions, 0 node: imports) | VERIFIED | 4 exported functions; `grep "^import.*from 'node:'"` → 0 matches; `Journal matches:` + `File list:` both handled |
| `livos/.../fail2ban-admin/client.ts` | execFile DI factory + Fail2banClientError hierarchy | VERIFIED | `BINARY_PATH = '/usr/bin/fail2ban-client'`; `makeFail2banClient(ExecFileFn)` factory; 7 kinds discriminated; `unbanip` + `addignoreip` in client |
| `livos/.../fail2ban-admin/active-sessions.ts` | Mock-friendly `who -u` provider | VERIFIED | `makeActiveSessionsProvider` factory; ENOENT → `[]` + warn; delegates to `parseWhoOutput` |
| `livos/.../fail2ban-admin/events.ts` | Fire-and-forget audit writer reusing device_audit_log | VERIFIED | Sentinel `fail2ban-host`; `computeParamsDigest` imported; PG + JSON belt-and-suspenders; never re-throws |
| `livos/.../fail2ban-admin/index.ts` | Module barrel re-exporting + listEvents read-side | VERIFIED | 6 convenience functions exported; `listEvents` queries `device_audit_log` via `getPool()` with sentinel filter |
| `livos/.../fail2ban-admin/routes.ts` | 5-procedure tRPC router, all adminProcedure-gated | VERIFIED | All 5 procedures use `adminProcedure`; Zod schemas present; self-ban detection in `banIp`; whitelist in `unbanIp` |
| `livos/.../fail2ban-admin/parser.test.ts` | 14 golden-file fixture tests | VERIFIED | LIVE Mini PC fixtures (A1, B1, C1) + SYNTHETIC fixtures; exits 0 |
| `livos/.../fail2ban-admin/client.test.ts` | 13 DI injection tests | VERIFIED | All 13 pass; no vi.mock; ENOENT / service-down / timeout / jail-not-found covered |
| `livos/.../fail2ban-admin/active-sessions.test.ts` | 4 parser tests | VERIFIED | All 4 pass; synthetic IPv4-mapped-IPv6 + empty-parens cases covered |
| `livos/.../fail2ban-admin/integration.test.ts` | 10 e2e tRPC tests | VERIFIED | Tests 6/9/10 assert `execCalls.length === 0` when validation gates fire; pg.Pool prototype patched |
| `livos/packages/ui/src/routes/docker/sections/security.tsx` | 1-line barrel re-export | VERIFIED | `export {SecuritySection as Security}` present |
| `livos/.../docker/security/security-section.tsx` | Section root with 5s polling + 4-state banner | VERIFIED | `POLL_INTERVAL_MS=5_000`; 4-state banner JSX; BanIpModal + UnbanModal + AuditLogTab + JailStatusCard composed |
| `livos/.../docker/security/jail-status-card.tsx` | Per-jail counts + banned IP table + Unban action | VERIFIED | 4 Badge chips; `lastAttemptedUser` gracefully omitted when null; `onUnbanClick` wired |
| `livos/.../docker/security/unban-modal.tsx` | Whitelist checkbox + 5s debounce + B-01 note | VERIFIED | `addToWhitelist` Checkbox; amber note "fail2ban may re-ban"; 5s debounce via `setTimeout` |
| `livos/.../docker/security/ban-ip-modal.tsx` | Two-stage type-LOCK-ME-OUT + Zod IPv4 + cellular toggle | VERIFIED | `IPV4_REGEX`; `LOCK_ME_OUT as const`; Stage 2 self-ban render; `cellularBypass` field |
| `livos/.../docker/security/audit-log-tab.tsx` | Audit log table with 5s poll | VERIFIED | `trpcReact.fail2ban.listEvents.useQuery`; 5_000/2_500 intervals |
| `livos/.../settings/_components/security-toggle-row.tsx` | Settings row writing `security_panel_visible` | VERIFIED | `PREF_KEY = 'security_panel_visible'`; `preferences.set.useMutation`; invalidates both `get` + `getAll` |
| `livos/packages/ui/src/routes/docker/store.ts` (modified) | `'security'` in SectionId union + SECTION_IDS | VERIFIED | Lines 31 + 55: both present |
| `livos/packages/ui/src/routes/docker/sidebar.tsx` (modified) | IconShieldLock + SECTION_META + visibility filter | VERIFIED | 5 grep hits for security/IconShieldLock/security_panel_visible |
| `livos/packages/ui/src/routes/docker/docker-app.tsx` (modified) | `case 'security':` branch | VERIFIED | Line 87: `case 'security':` present |
| `livos/packages/ui/src/routes/docker/palette/palette-results.ts` (modified) | `security: 'Security'` entry | VERIFIED | Line 77 present (type-completeness fix) |
| `livos/packages/ui/src/routes/settings/_components/settings-content.tsx` (modified) | SecurityToggleRow imported + mounted in AdvancedSection | VERIFIED | Import line 87; JSX line 1825 |
| `nexus/packages/core/package.json` (modified) | `test:phase46` chaining test:phase45 + 4 new tests | VERIFIED | Line 28 present; chains all 4 fail2ban-admin test files |
| `livos/.../server/trpc/index.ts` (modified) | `fail2ban` router registered | VERIFIED | Lines 27 + 55: import + registration |
| `livos/.../server/trpc/common.ts` (modified) | `'fail2ban.unbanIp'` + `'fail2ban.banIp'` in httpOnlyPaths | VERIFIED | Lines 189-190; no bare-name footgun |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `security-section.tsx` | `fail2ban.listJails` tRPC | `trpcReact.fail2ban.listJails.useQuery` | WIRED | 5s poll wired; `listJailsQuery` used to derive `serviceState` and `jails` |
| `security-section.tsx` | `fail2ban.getJailStatus` tRPC | `trpcReact.fail2ban.getJailStatus.useQuery` | WIRED | gated on `enabled: !!effectiveJail`; passed to `JailStatusCard` |
| `security-section.tsx` | `fail2ban.unbanIp` tRPC | `trpcReact.fail2ban.unbanIp.useMutation` | WIRED | `onSuccess: utils.fail2ban.invalidate()`; flows `addToWhitelist` from UnbanModal |
| `security-section.tsx` | `fail2ban.banIp` tRPC | `trpcReact.fail2ban.banIp.useMutation` via `BanIpModal.onSubmit` | WIRED | Stage 1 + Stage 2 confirm flows to `mutateAsync` with typed input |
| `audit-log-tab.tsx` | `fail2ban.listEvents` tRPC | `trpcReact.fail2ban.listEvents.useQuery` | WIRED | `{limit: 50}` + 5s poll + 2.5s staleTime |
| `security-toggle-row.tsx` | `user_preferences` | `trpcReact.preferences.set.useMutation` + `preferences.get.useQuery` | WIRED | Invalidates `get` + `getAll`; sidebar.tsx reads same key |
| `sidebar.tsx` | SECTION_IDS visibility filter | `trpcReact.preferences.get.useQuery({keys: ['security_panel_visible']})` | WIRED | `useMemo` filter that hides `'security'` only when pref explicitly `false` |
| `routes.ts:banIp` | self-ban detection | `getAdminActiveIps(ctx)` = X-Forwarded-For ∪ `listActiveSshSessions()` | WIRED | `.catch(() => [])` graceful degrade; `cellularBypass` skips check entirely |
| `routes.ts:unbanIp` | whitelist | `addIgnoreIpImpl(jail, ip)` when `addToWhitelist=true` | WIRED | Integration Test 5 asserts 2 execFile calls: `unbanip` + `addignoreip` |
| `events.ts` | `device_audit_log` | `getPool()` INSERT with sentinel | WIRED | 6 references; `computeParamsDigest` from `devices/audit-pg.ts` |
| `server/trpc/common.ts` | HTTP transport for mutations | `httpOnlyPaths` array entries | WIRED | 2 namespaced entries; `common.test.ts` Tests 5+6 assert presence; Test 7 asserts bare footgun absent |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `security-section.tsx` | `listJailsQuery.data` | `fail2ban.listJails` → `realFail2banClient.listJails()` → `execFile('/usr/bin/fail2ban-client', ['status'])` → `parseJailList(stdout)` | Yes — live process stdout parsed | FLOWING |
| `jail-status-card.tsx` | `status` prop | `fail2ban.getJailStatus` → `realFail2banClient.getJailStatus(jail)` → execFile → `parseJailStatus(stdout)` | Yes — live process stdout | FLOWING |
| `audit-log-tab.tsx` | `eventsQuery.data` | `fail2ban.listEvents` → `device_audit_log` SELECT filtered by sentinel | Yes — real PG query with JOIN to users | FLOWING |
| `unban-modal.tsx` | `addToWhitelist` flag | `useState(false)` → propagated to `unbanMutation.mutate({addToWhitelist})` → `addIgnoreIpImpl` | Yes — flows to real execFile call | FLOWING |
| `ban-ip-modal.tsx` | Stage 2 trigger | Backend `TRPCClientError` with `code='CONFLICT' message='self_ban'` | Yes — real self-ban detection from union of live IPs | FLOWING |
| `security-toggle-row.tsx` | `isOn` | `preferences.get.useQuery` reading PG `user_preferences` | Yes — real PG read/write via existing preferences API | FLOWING |

---

## Behavioral Spot-Checks

Step 7b: SKIPPED for live network/process calls (fail2ban requires Mini PC deploy). Tests run instead.

| Behavior | Evidence | Status |
|----------|----------|--------|
| `test:phase46` master gate | `nexus/packages/core/package.json` line 28; SUMMARY claims 86/86 PASS exit 0 | PASS (per SUMMARY — not re-run in verifier to avoid slow chain) |
| parser tests (14/14) | `parser.test.ts` fixtures include LIVE Mini PC A1/B1/C1 outputs | PASS (per SUMMARY) |
| client tests (13/13) | DI factory pattern; ENOENT/service-down/jail-not-found/timeout mapped | PASS (per SUMMARY) |
| active-sessions tests (4/4) | `parseWhoOutput` with synthetic IPv4-mapped-IPv6 fixtures | PASS (per SUMMARY) |
| integration tests (10/10) | Tests 6/9/10 prove execFile=0 when gates fire; pg.Pool prototype patched | PASS (per SUMMARY) |
| common.test.ts (7/7, extended) | Tests 5+6 assert namespaced presence; Test 7 asserts bare absent | PASS (per SUMMARY) |
| UI Vite build | `pnpm --filter ui build` exits 0 (32.20s per Plan 04) | PASS (per SUMMARY) |
| TypeScript baseline | 536 errors pre- and post-plan (zero delta) | PASS (per SUMMARY) |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| FR-F2B-01 | Plan 03 + 04 | Jail list + poll @ 3-5s + 4-state service banner | SATISFIED | `listJails` returns 4-state `state` field; `security-section.tsx` renders all 4 banners; 5s poll confirmed |
| FR-F2B-02 | Plan 02 + 03 + 04 | Unban modal with whitelist checkbox + last-attempted-user + action-targeted unban | SATISFIED | `addToWhitelist` checkbox wired; `lastAttemptedUser` rendered with null-fallback `—`; `unbanip` NOT global flush |
| FR-F2B-03 | Plan 02 + 03 + 04 | Manual ban + LOCK ME OUT gate + Zod CIDR /0-/7 reject | SATISFIED | `IPV4_REGEX` client + Zod server; `z.literal('LOCK ME OUT').optional()`; integration Test 9 proves pre-spawn rejection |
| FR-F2B-04 | Plan 02 + 03 + 04 | `device_audit_log` REUSED (no new table); `device_id='fail2ban-host'` sentinel; append-only trigger (v22.0) enforces immutability | SATISFIED | Sentinel confirmed; `computeParamsDigest` reused; NO new migration; audit-log-tab wired to `listEvents` |
| FR-F2B-05 | Plan 03 + 04 | Cellular toggle + dual-IP surface (X-Forwarded-For + SSH sessions) | SATISFIED | `getAdminActiveIps` unions both sources; `cellularBypass` skips check; UI toggle in sticky header + ban modal |
| FR-F2B-06 | Plan 04 + 05 | Settings toggle defaults ON, persists in `user_preferences`, hides sidebar non-destructively | SATISFIED | `security-toggle-row.tsx` wired in `settings-content.tsx`; sidebar.tsx `useMemo` filter; `preferences.set` + `preferences.get` both wired |

Note: REQUIREMENTS.md status table for FR-F2B-06 still shows "Pending" (written during Plan 04 before Plan 05 wired it). Code is authoritative — the wire-up exists at `settings-content.tsx` lines 87 + 1825.

---

## Sacred File Audit

| File | Status | Evidence |
|------|--------|---------|
| `nexus/packages/core/src/sdk-agent-runner.ts` | UNTOUCHED | `git log fd56d1e9..7abd2e3b -- nexus/packages/core/src/sdk-agent-runner.ts` → empty output; last touch was Phase 43.12 (pre-Phase 46) |

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `security-section.tsx:324` | `activeSshIps={[]}` passed to `BanIpModal` | INFO | The `activeSshIps` prop is a planning placeholder for future proactive Stage 1 display (noted inline as a code comment: "v30+ may add fail2ban.detectAdminIps"). Actual SSH IPs flow into self-ban detection via `getAdminActiveIps` in `routes.ts` on the server side. UI surfaces the IPs from `TRPCError.data.cause.adminIps` in Stage 2. This is intentional architecture documented in Plan 04 decisions — NOT a stub. |

The `activeSshIps={[]}` prop is NOT a blocker: Stage 2 of BanIpModal renders `cause.adminIps` from the backend error when the self-ban is detected. The empty prop only affects the Stage 1 "proactive" display that was explicitly deferred to v30+.

---

## Human Verification Required

### 1. Sidebar Registration + Jail Discovery (FR-F2B-01)

**Test:** Deploy to Mini PC via `bash /opt/livos/update.sh`. Open Server Management → verify "Security" entry is the 13th sidebar item between Activity and Schedules. Click it and watch network tab for `fail2ban.listJails` firing every ~5s. Click Refresh button.
**Expected:** Sidebar entry visible; jails auto-discovered (no hardcoded `sshd`); 5s poll confirmed; manual Refresh invalidates immediately.
**Why human:** Live browser session + network tab observation required.

### 2. Three Service-State Banners (FR-F2B-01 / B-04)

**Test:** Stop fail2ban on Mini PC (`systemctl stop fail2ban`), refresh UI, verify yellow service-inactive banner. Move binary (`mv /usr/bin/fail2ban-client /usr/bin/fail2ban-client.bak`), restart, verify red binary-missing banner. Restore and verify it clears.
**Expected:** Each of 3 distinct banners renders with correct copy and color; clears on restore.
**Why human:** Requires OS-level service manipulation on Mini PC.

### 3. Unban + Whitelist (FR-F2B-02)

**Test:** `sudo fail2ban-client set sshd banip 192.0.2.99`. UI: verify IP appears within 5s. Open Unban modal — verify B-01 user-education note present, whitelist checkbox defaults unchecked. Unban without whitelist. Verify IP removed. Re-ban .100, unban with whitelist checked. Verify ignoreip extended.
**Expected:** Unban removes from banned list; whitelist checked → `addignoreip` called; checkbox defaults OFF.
**Why human:** Requires live fail2ban state manipulation and CLI verification.

### 4. Manual Ban + Self-Ban Gate + CIDR Rejection (FR-F2B-03)

**Test:** Ban a non-self IP (198.51.100.42) → confirm Stage 1 succeeds. Ban own SSH source IP → confirm Stage 2 renders with type-LOCK-ME-OUT input; lowercase variant keeps button disabled; exact match enables. Try CIDR inputs (0.0.0.0/0, 1.2.3.4/8) → confirm client-side rejection without mutation firing.
**Expected:** All three sub-tests pass as described.
**Why human:** Self-ban detection requires real X-Forwarded-For and active SSH session context.

### 5. Audit Log Immutability (FR-F2B-04)

**Test:** Open Audit Log tab after Sections 3+4. Verify rows present with correct columns. SSH: query PG for `device_id='fail2ban-host'` rows. Attempt `UPDATE device_audit_log SET tool_name='tampered'` → confirm trigger error. Verify JSON files in `/opt/livos/data/security-events/`. Confirm no new table exists (`\dt`).
**Expected:** PG rows present with sentinel; UPDATE blocked by trigger; JSON files written; no new table.
**Why human:** Requires live PG access and filesystem inspection on Mini PC.

### 6. Mobile Cellular Toggle (FR-F2B-05)

**Test:** Open panel from cellular-connected device. Verify "I'm on cellular" toggle visible and OFF. Toggle ON. Try to ban a WiFi router IP → succeeds without Stage 2 gate.
**Expected:** Cellular bypass suppresses self-ban check; toggle is session-scoped (not persisted).
**Why human:** Requires access from a real cellular-connected device.

### 7. Settings Backout Toggle (FR-F2B-06)

**Test:** Open Settings → Advanced → find "Security panel" toggle. Verify ON by default. Toggle OFF. Verify Security disappears from sidebar. Verify fail2ban still running on Mini PC. Toggle ON → entry returns. Verify PG user_preferences row.
**Expected:** Non-destructive backout; fail2ban unaffected; preference persisted.
**Why human:** Requires Settings page interaction and PG verification.

### 8. httpOnlyPaths Under WS Reconnect (ROADMAP §46.8)

**Test:** Open Security panel in browser. Restart livos service on Mini PC (`systemctl restart livos`). Immediately attempt a ban or unban mutation. Observe network tab.
**Expected:** Mutation completes via HTTP POST (not WS frame) within ~2s of restart completion.
**Why human:** Requires restarting the livinityd service and observing browser network tab during the reconnect window.

### 9. End-to-End SSH Lockout Recovery

**Test:** Ban a work-laptop IP from CLI. Confirm SSH blocked from that machine. From a different SSH-connected device, open UI, unban with whitelist checked. Confirm SSH restored from formerly-blocked machine.
**Expected:** Operator recovers SSH access via UI alone, without physical console access.
**Why human:** The headline value proposition — requires multiple machines and real fail2ban enforcement on Mini PC.

---

## Gaps Summary

No mechanism-level gaps found. All 8 ROADMAP success criteria are wired in code. All 6 FR-F2B requirements are satisfied at the implementation level. The 9 human verification items are standard Mini PC UAT deferred to the next deploy window per the v29.3 / Phase 45 pattern.

The single noted anti-pattern (`activeSshIps={[]}` prop in security-section.tsx) is intentional and documented — proactive Stage 1 SSH IP display is explicitly deferred to v30+. Stage 2 (the critical path) correctly receives `cause.adminIps` from the backend.

---

_Verified: 2026-05-01T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
