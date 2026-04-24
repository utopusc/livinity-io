---
phase: 16-admin-override-emergency-disconnect
plan: 02
subsystem: livos/ui/settings
tags: [admin, ui, react, trpc, settings, force-disconnect, device-security, adminOnly, rbac]
requirements_completed: [ADMIN-01, ADMIN-02]
requirements_partial: false
dependency_graph:
  requires:
    - phase: 16-admin-override-emergency-disconnect
      plan: 01
      why: "Consumes devicesAdmin.adminListAll query and devicesAdmin.adminForceDisconnect mutation created by Plan 16-01"
    - phase: 7-multi-user
      why: "useVisibleMenuItems filters adminOnly menu items via user.role — admin-only menu visibility depends on v7.0 role hierarchy"
  provides:
    - "AdminDevicesSection React component — cross-user device table with Force Disconnect flow"
    - "Settings > Devices admin menu entry (adminOnly: true) wired to AdminDevicesSection via lazy import"
    - "Auto-refresh behavior (refetchInterval: 10s) so force-disconnect transitions surface within ≤10s without manual reload"
    - "Confirmation dialog gate on all destructive force-disconnect actions"
  affects:
    - "Phase 16 (ADMIN-01 + ADMIN-02) is now end-to-end — admin can see every device and disconnect any one via UI"
    - "v26.0 milestone (Device Security & User Isolation) is complete pending verifier sign-off"
    - "Future admin sections can follow the same pattern: lazy import + adminOnly MENU_ITEMS entry + SettingsSection union entry + switch case"
tech_stack:
  added: []
  patterns:
    - "Lazy-load admin section bundle — AdminDevicesSectionLazy = React.lazy(() => import('./admin-devices-section')) matches existing UsersSectionLazy pattern, so non-admin users never download the admin bundle"
    - "Query auto-refresh via refetchInterval: 10_000 — achieves the ≤10s offline-reflection requirement without explicit polling logic in the component"
    - "Confirmation dialog pattern — destructive mutations (force disconnect) always go through a two-click confirm before the mutation fires; matches my-devices RemoveDialog pattern"
    - "Role-filtered menu visibility — useVisibleMenuItems.filter((item) => !item.adminOnly || isAdmin) was already in place from v7.0; new entry just sets adminOnly: true and inherits the behavior"
    - "TRPC utils.invalidate on success — forceDisconnectMut.onSuccess calls utils.devicesAdmin.adminListAll.invalidate() to force immediate refetch (combined with 10s refetchInterval, UI reflects offline within ≤10s guaranteed)"
key_files:
  created:
    - path: livos/packages/ui/src/routes/settings/_components/admin-devices-section.tsx
      purpose: "AdminDevicesSection React component — cross-user device table + Force Disconnect mutation flow with confirmation dialog, loading/error/empty states, auto-refresh"
      lines: 253
  modified:
    - path: livos/packages/ui/src/routes/settings/_components/settings-content.tsx
      purpose: "Registered admin-devices menu entry + switch case + lazy import + TbServer2 icon import"
      change: "+8 lines (5 insertion points: TbServer2 import, SettingsSection union entry, MENU_ITEMS entry, SectionContent switch case, AdminDevicesSectionLazy declaration)"
decisions:
  - "Menu id 'admin-devices' (not 'devices') — avoids collision with the future user-facing my-devices route which is user-scoped. Plan guidance explicit on this."
  - "Icon TbServer2 — semantically matches 'server-side device fleet' (admin view) rather than TbDeviceDesktop (per-device). Verified TbServer2 is a valid export of react-icons/tb via node require; no other file currently uses it but the icon exists in the package."
  - "Table layout over card layout — CONTEXT.md's admin-devices specifics call for a compact table (User, Device, Platform, Status, Last Seen, Action); cards would waste vertical space when scanning 10+ devices. Per-user my-devices keeps cards for the customer-facing view."
  - "Inline formatRelativeTime helper — my-devices/index.tsx is a route not a utility module; re-implementing the 7-line helper avoids cross-route import coupling."
  - "Confirmation dialog for destructive action — force disconnect is irreversible in the short term (breaks the user's active session), so requiring a click-through confirm matches sibling destructive actions (RemoveDialog in my-devices)."
  - "refetchInterval: 10_000 + onSuccess invalidate — combining both ensures the ≤10s must_have is satisfied under all conditions: invalidate fires the next tick on success, and 10s interval covers edge cases where the mutation succeeds but invalidate doesn't propagate."
  - "Lazy import via named-export shape — matches UsersSectionLazy pattern: `React.lazy(() => import('./admin-devices-section').then((m) => ({default: m.AdminDevicesSection})))`. Keeps admin bundle out of the default chunk."
metrics:
  duration_seconds: 660
  duration_human: "11m 00s"
  tasks_completed: 2
  files_touched: 2
  commits:
    - hash: "fcc8ce9"
      task: 1
      message: "feat(16-02): AdminDevicesSection component with cross-user table + force-disconnect flow"
    - hash: "a272963"
      task: 2
      message: "feat(16-02): register Settings > Devices admin entry routing to AdminDevicesSection"
  completed_at: "2026-04-24T18:40:54Z"
---

# Phase 16 Plan 02: Admin UI (cross-user device table) Summary

Delivered the Settings UI consumer of the admin backend from Plan 16-01: a new `AdminDevicesSection` React component renders a cross-user device table (User, Device, Platform, Status, Last Seen, Action) with a red `Force Disconnect` button on every online row, wired to `devicesAdmin.adminListAll` (10s auto-refetch) and `devicesAdmin.adminForceDisconnect` (confirmation-gated mutation with toast + invalidate on success). Registered in `settings-content.tsx` as an `adminOnly: true` menu entry so non-admin users never see it — `useVisibleMenuItems` already filters `adminOnly` items by role. Phase 16 end-to-end: admin navigates to Settings > Devices, sees every live device across every user, and can tear down any bridge in one click (≤10s for the UI to reflect offline).

## What Changed

### Task 1: AdminDevicesSection component (commit fcc8ce9)

**New `livos/packages/ui/src/routes/settings/_components/admin-devices-section.tsx`** (253 lines):

- **Named export** `AdminDevicesSection` (matches `UsersSection` naming convention).
- **Query:** `trpcReact.devicesAdmin.adminListAll.useQuery(undefined, {refetchInterval: 10_000})` — polls every 10s so force-disconnect transitions surface without manual reload. Returns `{devices: AdminDeviceRow[]}` where each row has `deviceId, deviceName, platform, ownerUserId, ownerUsername, online, connectedAt`.
- **Mutation:** `trpcReact.devicesAdmin.adminForceDisconnect.useMutation({onSuccess, onError})`. `onSuccess` toasts success, calls `utils.devicesAdmin.adminListAll.invalidate()`, and closes the confirm dialog. `onError` toasts the error message (surfaces `TRPCError FORBIDDEN` for non-admin callers hitting the endpoint directly).
- **Table:** 6 columns — User (ownerUsername or 'unknown'), Device (deviceName + first-12-char deviceId prefix), Platform (localized label), Status (online = green dot + 'Online' badge; offline = gray dot + 'Offline' badge), Last Seen (inline `formatRelativeTime` helper), Action (online = red Force Disconnect button with `variant='destructive'` + `TbX` icon; offline = em-dash).
- **Confirmation dialog:** Destructive action always confirms. Dialog shows target device name + owner username, explains preservation semantics (token + DB row preserved, device can re-pair), and the audit-log note. Two buttons: Cancel (closes dialog) + Force Disconnect (fires mutation, shows spinner while `isPending`).
- **States handled:**
  - Loading → centered `TbLoader2` spinner.
  - Error → red banner with `TbAlertTriangle`, error message, Retry button.
  - Empty → centered `TbDeviceDesktop` + "No devices" message.
  - Populated → full table + Refresh button (with spinning icon while `isFetching`).
- **Helpers:** `PLATFORM_LABEL: Record<string, string>` maps `win32 → Windows`, `darwin → macOS`, `linux → Linux`. `formatRelativeTime(timestampMs)` produces `just now / Nm ago / Nh ago / Nd ago`.
- **Imports:** Only UI primitives already in the codebase — `@/shadcn-components/ui/button`, `@/shadcn-components/ui/badge`, `@/shadcn-components/ui/dialog`, `@/shadcn-lib/utils` (cn), `@/trpc/trpc` (trpcReact), `sonner` (toast), `react-icons/tb` (TbAlertTriangle, TbDeviceDesktop, TbLoader2, TbRefresh, TbX).

### Task 2: Register admin-devices menu entry + route (commit a272963)

**`livos/packages/ui/src/routes/settings/_components/settings-content.tsx`** — 5 small insertions (+8 lines total):

1. **TbServer2 import** — added to the existing `react-icons/tb` import block (line 46). Confirmed `TbServer2` is a valid named export of the package via direct `node -e require` check.
2. **SettingsSection union entry** — added `| 'admin-devices'` immediately after `| 'users'` (line 119) so the admin-section grouping stays visually coherent in the type.
3. **MENU_ITEMS entry** — added `{id: 'admin-devices', icon: TbServer2, label: 'Devices', description: 'All devices across all users', adminOnly: true}` immediately after the `users` entry (line 165). The `adminOnly: true` flag is the ONLY mechanism needed to hide it from non-admin users — `useVisibleMenuItems` already filters.
4. **SectionContent switch case** — added `case 'admin-devices': return <Suspense ...><AdminDevicesSectionLazy /></Suspense>` immediately after the `users` case (line 431-432). Fallback matches the sibling admin sections' loader (Loader2 spinner in py-8 flex container).
5. **Lazy import declaration** — added `const AdminDevicesSectionLazy = React.lazy(() => import('./admin-devices-section').then((m) => ({default: m.AdminDevicesSection})))` right after `UsersSectionLazy` (line 106-108). Matches the named-export lazy pattern already in use.

No changes to `useVisibleMenuItems` — it already filters `MENU_ITEMS.filter((item) => !item.adminOnly || isAdmin)`, so the new entry with `adminOnly: true` inherits role-gated visibility automatically.

## Grep Audit — Verification Invariants

| Invariant                                                                          | Location                                                                                      | Status |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------ |
| File exists + ≥120 lines                                                           | `admin-devices-section.tsx` (253 lines)                                                       | PASS   |
| `export function AdminDevicesSection` — named export                               | `admin-devices-section.tsx` L58                                                               | PASS   |
| `trpcReact.devicesAdmin.adminListAll` query present                                | `admin-devices-section.tsx` L60                                                               | PASS   |
| `trpcReact.devicesAdmin.adminForceDisconnect` mutation present                     | `admin-devices-section.tsx` L70                                                               | PASS   |
| `refetchInterval: 10_000` on the list query                                        | `admin-devices-section.tsx` L64                                                               | PASS   |
| `utils.devicesAdmin.adminListAll.invalidate()` called on success                   | `admin-devices-section.tsx` L73                                                               | PASS   |
| "Force Disconnect" text literal (button + dialog)                                  | `admin-devices-section.tsx` L191, L245                                                        | PASS   |
| "Phase 16" tag comment                                                             | `admin-devices-section.tsx` L23                                                               | PASS   |
| 3+ occurrences of `'admin-devices'` in settings-content                            | settings-content.tsx (union L119, MENU_ITEMS L165, switch L431 — exactly 3)                   | PASS   |
| `AdminDevicesSectionLazy` declared + referenced                                    | settings-content.tsx L106-108 (decl), L432 (JSX use) — exactly 2                              | PASS   |
| `admin-devices-section` lazy import path                                           | settings-content.tsx L107                                                                     | PASS   |
| `adminOnly: true` on new menu entry                                                | settings-content.tsx L165                                                                     | PASS   |
| `case 'admin-devices':` in SectionContent switch                                   | settings-content.tsx L431                                                                     | PASS   |
| `TbServer2` imported from `react-icons/tb`                                         | settings-content.tsx L46 (import), L165 (usage in MENU_ITEMS)                                 | PASS   |

## Regression Guards — Sibling Sections + Backend Unchanged

| Guard                                                                       | Check                                                                     | Status |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------ |
| Users admin section menu entry intact                                       | `grep "id: 'users'" settings-content.tsx` → present                       | PASS   |
| Users admin section switch case intact                                      | `grep "case 'users':" settings-content.tsx` → present                     | PASS   |
| Plan 16-01 admin-routes.ts still on disk                                    | `test -f livos/.../devices/admin-routes.ts`                               | PASS   |
| Plan 16-01 devicesAdmin still mounted in appRouter                          | `grep devicesAdmin livinityd/.../trpc/index.ts` → 2 occurrences           | PASS   |
| Plan 16-01 httpOnlyPaths entries still present                              | `grep devicesAdmin livinityd/.../trpc/common.ts` → 2 occurrences          | PASS   |
| AiConfigLazy lazy admin-section pattern unchanged                           | `grep AiConfigLazy settings-content.tsx` → still present                  | PASS   |

## TypeScript Compile Results

| File                                                                                                 | New Errors | Notes                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `livos/packages/ui/src/routes/settings/_components/admin-devices-section.tsx` (NEW)                  | 0          | Clean compile — all imports resolve, trpcReact.devicesAdmin.adminListAll + adminForceDisconnect types inferred from Plan 16-01 router, Dialog/Button/Badge props match shadcn definitions            |
| `livos/packages/ui/src/routes/settings/_components/settings-content.tsx` (modified)                  | 0 new      | One pre-existing error on line 181 (`userQ.data?.role` narrow-type issue) — verified via `git show HEAD~1` that the exact same line existed before this plan. Out of scope per deviation rule scope boundary |

## Manual Smoke Checklist (out of scope for automated verify)

After UI deploy (`pnpm --filter @livos/config build && pnpm --filter ui build && pm2 restart livos`):

1. **Admin visibility:** Login as admin → Settings → see "Devices" entry in the admin-only section (between Users and AI Configuration). Click → table renders with all live devices.
2. **Non-admin invisibility:** Login as member-role user → Settings → "Devices" entry NOT in menu (filtered by `useVisibleMenuItems`).
3. **Force disconnect end-to-end:** As admin, click "Force Disconnect" on an online device → confirmation dialog appears → click confirm → toast success → within ≤10s the row flips to Offline status (em-dash in Action column). Verify on the live device: its connection was torn down (reconnect attempts visible in livinityd logs).
4. **Direct tRPC bypass:** Login as member → open browser devtools → call `trpc.devicesAdmin.adminForceDisconnect({deviceId: 'anything'})` directly → toast error "FORBIDDEN" (adminProcedure gate enforces server-side).
5. **Audit log:** Check `device_audit_log` table → new rows with `tool_name='admin.list_all'` (per query) and `tool_name='admin.force_disconnect'` (per disconnect click), attributed to admin's `user_id`.

## Deploy Notes

Per project memory (v7.0+ UI deploy sequence):

```bash
# On server4 (production livinity.cloud):
ssh root@45.137.194.103
cd /opt/livos
git pull
cd livos
pnpm --filter @livos/config build && pnpm --filter ui build
pm2 restart livos
```

No livinityd/nexus-core rebuild needed — this plan touches UI only. Plan 16-01 already deployed the backend.

## Requirement Coverage — End-to-End Closure

### ADMIN-01 — Admin lists all devices cross-user (end-to-end)

- **Plan 16-01 backend:** `devicesAdmin.adminListAll` tRPC adminProcedure + platform-web REST fallback.
- **Plan 16-02 UI:** AdminDevicesSection consumes `trpcReact.devicesAdmin.adminListAll.useQuery` with `refetchInterval: 10_000`. Renders `{devices: [...]}` as a 6-column table. Non-admin users never see the entry (`adminOnly: true` + `useVisibleMenuItems` filter). Status: **COMPLETE end-to-end**.

### ADMIN-02 — Admin force-disconnects any device within 3s (end-to-end)

- **Plan 16-01 backend:** `devicesAdmin.adminForceDisconnect` → `DeviceBridge.forceDisconnect` → tunnel `admin_force_disconnect` verb → relay closes target WS with code 4403 reason `admin_disconnect`. Well under 3s bound.
- **Plan 16-02 UI:** AdminDevicesSection's red Force Disconnect button fires `adminForceDisconnect.useMutation` (confirmation-gated) → on success, toast + invalidate → refetch shows offline within ≤10s. User sees immediate visual feedback; the actual tunnel teardown happens synchronously at the relay. Status: **COMPLETE end-to-end**.

### Phase 16 Milestone Status

**v26.0 (Device Security & User Isolation) — all requirements now complete:**
- ADMIN-01 [x] — backend (Plan 16-01) + UI (Plan 16-02)
- ADMIN-02 [x] — backend (Plan 16-01) + UI (Plan 16-02)

After this plan's final metadata commit, the Phase 16 directory contains PLAN.md + SUMMARY.md for both 16-01 and 16-02, and REQUIREMENTS.md can be updated to mark both ADMIN-01 and ADMIN-02 as satisfied. Phase 16 is the final phase of v26.0 — the milestone is complete pending verifier sign-off.

## Deviations from Plan

None — plan executed exactly as written. All verification grep invariants pass on the first attempt; no Rule 1-4 auto-fixes were required. The component was written verbatim from the plan's action block with only whitespace/formatting differences (the plan used 2-space indentation in the code snippet; the repo convention is tabs, confirmed by reading sibling `users.tsx` and `settings-content.tsx` — I followed the repo convention).

One pre-existing TypeScript error in `settings-content.tsx:181` (`userQ.data?.role` narrow-type issue on the union type) was observed during typecheck and verified via `git show HEAD~1` to predate this plan. Not fixed (scope boundary — out of scope per deviation rules). Already logged informally in Phase 16 context as part of the v7.0 multi-user baseline.

## Authentication Gates

None — no external auth required. All work was local edits to `.tsx` files + git commits. TypeScript compile run locally against the UI package.

## Self-Check: PASSED

Files verified present:
- FOUND: livos/packages/ui/src/routes/settings/_components/admin-devices-section.tsx (253 lines)
- FOUND: livos/packages/ui/src/routes/settings/_components/settings-content.tsx (modified, +8 lines)

Commits verified present:
- FOUND: fcc8ce9 (Task 1 — AdminDevicesSection component)
- FOUND: a272963 (Task 2 — settings-content.tsx registration)

Plan 16-01 backend dependencies verified still present:
- FOUND: livos/packages/livinityd/source/modules/devices/admin-routes.ts
- FOUND: devicesAdmin import + mount in trpc/index.ts
- FOUND: devicesAdmin.adminListAll + adminForceDisconnect in common.ts httpOnlyPaths
