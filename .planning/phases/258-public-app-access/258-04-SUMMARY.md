---
phase: 258-public-app-access
plan: 04
subsystem: ui (desktop Share dialog — public-access control surface)
tags: [public-access, share-dialog, ui, trpc, forbidden-lock, whole-app-confirm, paths-prefill, cosmetic-mirror]

# Dependency graph
requires:
  - phase: 258-01
    provides: "PublicAccessConfig shape (mode/paths/hasOwnAuth) the resolved query reflects"
  - phase: 258-03
    provides: "apps.getPublicAccess query (forbidden+reason+suggestedPaths+resolved+publicUrl) + apps.setPublicAccess mutation (owner-or-admin 403 gate + runtime caddy regen); both in httpOnlyPaths"
provides:
  - "PublicAccessSection({appId}) — Share-dialog section: forbidden-lock(reason), paths pre-fill+enable, whole-app inline confirm, public-URL display, make-private; wired to apps.get/setPublicAccess"
  - "forbiddenReasonCopy / wholeAppConfirmText — pure, unit-tested presentation helpers"
  - "ShareAppDialog renders <PublicAccessSection appId={appId}/> below the user-share list"
affects:
  - "258-05 deploy walk consumes this UI for the operator visual UAT (the human-verify checkpoint, deferred)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "UI mirrors (never overrides) the server policy: the lock/confirm are cosmetic; 258-03's 403 + fail-closed regen is the real gate (T-258D-01)"
    - "Pure presentation helpers (forbiddenReasonCopy/wholeAppConfirmText) extracted + vitest-unit-tested — repo has no RTL, so logic is tested pure + component smoke-imported (matches update-notification.unit.test.ts convention)"
    - "Build against the REAL flat tRPC return shape (forbidden/reason/mode/paths/hasOwnAuth/suggestedPaths/publicUrl), not the plan's speculative nested {resolved} interface — 'reflect what the API says'"
    - "Inline confirm sub-panel (not the repo's custom AlertDialog wrapper) for the whole-app warning — avoids nested-dialog z-index + custom-API surface"

key-files:
  created:
    - livos/packages/ui/src/modules/desktop/public-access-section.tsx
    - livos/packages/ui/src/modules/desktop/public-access-section.unit.test.ts
  modified:
    - livos/packages/ui/src/modules/desktop/share-app-dialog.tsx

key-decisions:
  - "Used the ACTUAL 258-03 flat return shape (getPublicAccess → {forbidden,reason,mode,paths,hasOwnAuth,suggestedPaths,publicUrl}); the plan's <interfaces> nested {resolved:{...}} shape was speculative and the plan itself says 'reflect what the API says'"
  - "Whole-app confirm is an inline yellow-bordered sub-panel (plan-allowed alternative to a nested AlertDialog) — the repo's AlertDialog is a custom non-standard wrapper, inline confirm is lower-risk and self-contained"
  - "Mutation pending uses m.isPending (react-query v5 / tRPC v11), NOT isLoading — isLoading exists only on queries here (caught by tsc, fixed)"
  - "Section provides its own border-t separator (in the Shell) so Task 2's 'thin separator' requirement is satisfied without touching dialog markup beyond the single mount line"
  - "Paths seeded once from resolved paths (if already public via paths) else manifest suggestedPaths — pre-fill without clobbering operator edits on re-render"

patterns-established:
  - "Forbidden→friendly-copy map is a pure exported function so the never-public reasons are unit-asserted independent of rendering"

requirements-completed: [PUB-D]

# Metrics
duration: ~10min
completed: 2026-06-03
---

# Phase 258 Plan 04: Share-Dialog "Public access" UX (WS-D) Summary

**A `PublicAccessSection` in the app Share dialog that mirrors the 258-03 server policy: a LOCKED switch + friendly reason for forbidden apps, manifest-suggested public paths pre-filled and editable for `paths` mode, a whole-app toggle gated behind an inline confirm that states the no-LivOS-login + own-auth risk, and the generated public URL after enabling — all wired to `apps.getPublicAccess`/`setPublicAccess` with runtime apply (no reinstall). The UI lock is cosmetic; the server's 403 + fail-closed regen is the real gate.**

## Performance
- **Duration:** ~10 min
- **Tasks:** 2 code tasks (+ 1 deferred operator checkpoint)
- **Files:** 3 (2 created, 1 modified)

## Accomplishments
- **PublicAccessSection** (`public-access-section.tsx`) renders the full state machine over the tRPC data:
  - **LOADING** → skeleton placeholder.
  - **FORBIDDEN** (`data.forbidden`) → disabled `Switch` + muted `forbiddenReasonCopy(reason)` line; no enable path reachable (SC3).
  - **ALLOWED + none** → editable paths textarea (pre-filled from `suggestedPaths`) with "Enable public paths" + a "Make whole app public" button.
  - **ALLOWED + paths/whole-app** → current-state card + clickable `publicUrl` + "Make private".
  - **Whole-app confirm** → inline yellow sub-panel with `wholeAppConfirmText(appName, hasOwnAuth)` ("Anyone with the link can reach … without logging into LivOS. … has its own login / no detected login. Continue?"); only on confirm calls `setPublicAccess({mode:'whole-app'})` (SC2).
- All writes go through `setPublicAccess` then `utils.apps.getPublicAccess.invalidate({appId})` → runtime apply, no reinstall; success/error surfaced via `sonner` toast.
- **ShareAppDialog** now renders `<PublicAccessSection appId={appId}/>` below the user-share list, before `DialogFooter`; the section's own `border-t border-white/10` separates it as a distinct block. Existing share logic untouched (additive).
- Pure helpers `forbiddenReasonCopy` + `wholeAppConfirmText` exported and unit-tested (4 vitest tests, all green).

## Task Commits
1. **Task 1: PublicAccessSection component + unit tests** — `c844346b` (feat) — 4 vitest tests pass
2. **Task 2: mount in Share dialog** — `84a0cc60` (feat)

## Verification
- `pnpm --filter ui exec tsc --noEmit` — **clean for both touched files** (`public-access-section.tsx`, `share-app-dialog.tsx`); no new errors. (The pre-existing repo-wide tsc noise is unrelated and untouched.)
- `npx vitest run public-access-section.unit.test.ts` — **4 passed** (forbidden-copy mapping, confirm-text risk wording, smoke import).
- Grep key-links: `share-app-dialog.tsx` imports + renders `PublicAccessSection` (lines 16, 133); section calls `apps.getPublicAccess` (query + invalidate) and `apps.setPublicAccess` (mutation).

## Deviations from Plan
**[Rule 1 - Bug] Mutation pending property** — Found during Task 1 tsc verify. The plan/draft used `m.isLoading`; in this repo's tRPC v11 / react-query v5, mutations expose `isPending` (only queries have `isLoading`). tsc flagged it (`Property 'isLoading' does not exist on UseTRPCMutationResult`); fixed to `m.isPending`. Files: `public-access-section.tsx`. Verified: tsc clean. Folded into commit `c844346b`.

**[Note — not a deviation] Real flat API shape vs plan's speculative interface.** The plan's `<interfaces>` block sketched `getPublicAccess → {resolved:{mode,paths,hasOwnAuth}, forbidden, ...}` (nested). The ACTUAL 258-03 procedure (read at routes.ts:541-559) returns a **flat** object: `{forbidden, reason, mode, paths, hasOwnAuth, suggestedPaths, publicUrl}`. Per the plan's own instruction ("reflect what the API says — don't reimplement the policy client-side") I built against the real shape. No behavior gap — same fields, flatter access.

**Total deviations:** 1 auto-fixed (1 bug). **Impact:** none — type-correct, both files compile clean, tests green. UI is purely presentational; the 258-03 server gate is unchanged.

## Known Stubs
None. The section is fully wired to live tRPC data — no hardcoded/mock values flow to render.

## Threat Flags
None. No new network surface, auth path, or schema introduced — the component only calls the existing 258-03 owner-or-admin-gated procedures. The two threat-register items (T-258D-01 UI-bypass, T-258D-02 no-login whole-app) are mitigated as designed: the lock is cosmetic (server 403s forbidden apps regardless of the client), and `wholeAppConfirmText` surfaces `hasOwnAuth` so the operator makes an informed choice.

## Operator Checkpoint (Task 3 — DEFERRED to the 258-05 deploy walk)
This is the UI half of the operator UAT. **Not blocking** — code is shipped to master; visual verification happens on the deployed Mini PC. What the operator needs to visually verify:
1. Right-click a **clean** app (e.g. Cal.com) → **Share**: a "Public access" section appears with the suggested booking paths **pre-filled** in the editable textarea.
2. Right-click a **forbidden** app (OpenHands / Portainer / a docker.sock or daemon-bearer app) → Share: the toggle is **LOCKED** (disabled switch) with a friendly reason line, no enable path.
3. Click **"Make whole app public"** → the inline **confirmation** ("Anyone with the link can reach … without logging into LivOS …") appears **before** anything applies; only "Make public" applies it.
4. After enabling paths on Cal.com, the **public URL** is shown as a clickable `https://…` link; "Make private" reverts.
- Resume signal: operator types "approved" or describes UI issues. (Functional public-route behavior — the actual 403/carve-out — is the 258-05 SC walk, not this checkpoint.)
- **PWA cache note:** this is a UI-dist change — after the 258-05 deploy, the operator must hard-refresh / clear the service worker, or the stale bundle will hide the new section (MEMORY: LivOS SW aggressively caches).

## Next Phase Readiness
- WS-D complete: the operator now has a legible control surface for public access, fully wired to the 258-03 spine. The only remaining 258 work is the **258-05 deploy + operator UAT walk** (functional public-route verification on the Mini PC).
- Mini PC only; **NO deploy performed** this plan.

## Self-Check: PASSED
- `public-access-section.tsx` — exists on disk ✓
- `public-access-section.unit.test.ts` — exists on disk ✓
- `share-app-dialog.tsx` — modified (imports + renders PublicAccessSection) ✓
- Commits `c844346b`, `84a0cc60` — present in git history ✓
- Key links grep-verified (dialog→section, section→apps.get/setPublicAccess) ✓
- tsc clean for both files; 4/4 unit tests pass ✓

---
*Phase: 258-public-app-access*
*Completed: 2026-06-03*
