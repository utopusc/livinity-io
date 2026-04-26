---
phase: 30
plan: 02
subsystem: ui-software-update
tags: [auto-update, ui, framer-motion, localstorage, notification, sha-keyed-dismissal]

requires:
  - .planning/phases/30-auto-update/30-02-PLAN.md
  - .planning/phases/30-auto-update/30-RESEARCH.md
  - .planning/phases/30-auto-update/30-VALIDATION.md
  - .planning/phases/30-auto-update/REQUIREMENTS.md
  - .planning/phases/30-auto-update/30-01-SUMMARY.md (new tRPC shape contract this plan consumes)
  - livos/packages/ui/src/components/install-prompt-banner.tsx (canonical pattern this clones)
  - livos/packages/ui/src/hooks/use-software-update.ts (hook patched + consumed)
  - livos/packages/ui/src/router.tsx (mount target)

provides:
  - <UpdateNotification /> — desktop-only `fixed bottom-4 right-4 z-[80]` card
  - localStorage SHA-keyed dismissal pattern (livos:update-notification:dismissed-sha)
  - useSoftwareUpdate hourly background poll (refetchInterval: MS_PER_HOUR)
  - Frontend consumers updated for {available, sha, shortSha, message, author, committedAt} shape

affects:
  - livos/packages/ui/src/routes/settings/software-update-confirm.tsx (Title now uses shortSha; body uses message)
  - livos/packages/ui/src/routes/settings/_components/software-update-list-row.tsx (shortSha swap)
  - livos/packages/ui/src/routes/settings/mobile/software-update.tsx (shortSha swap)
  - livos/packages/ui/src/hooks/use-settings-notification-count.ts (toast destructures shortSha)
  - livos/packages/ui/src/providers/global-system-state/update.tsx (deviation Rule 2 — UpdatingCover title)
  - livos/packages/ui/public/locales/en.json (English software-update.new-version retuned for SHA)

tech-stack:
  added: []
  patterns:
    - "First SHA-keyed localStorage dismissal in repo. Pattern: `useState<string | null>(() => localStorage.getItem(KEY))` with visibility check `value !== dismissedSha`. Reusable as `useDismissibleByKey(key, currentValue)` hook in a future refactor."
    - "Defensive `safeFormatRelative(iso)` wrapper around `parseISO + formatDistanceToNow` — bad backend ISO must not crash desktop UI. Pattern reusable any time UI consumes external ISO strings."
    - "Pre-existing UI vitest infra issue surfaced (4 docker test files missing `// @vitest-environment jsdom` directive — 19 fails). Logged in deferred-items.md as out-of-scope per scope-boundary rule. Same fails reproduce on b6981b5f (parent of first Phase 30 commit)."
    - "Smoke-test fallback when @testing-library/react absent — single-line import-defined-ness check + deferred-test comment block. Scales to any test infra where the framework's expensive deps aren't installed yet."

key-files:
  created:
    - livos/packages/ui/src/components/update-notification.tsx (99 lines)
    - livos/packages/ui/src/components/update-notification.unit.test.ts (60 lines, smoke-only)
    - .planning/phases/30-auto-update/deferred-items.md (52 lines)
  modified:
    - livos/packages/ui/src/hooks/use-software-update.ts (53 → 55, +2 for refetchInterval)
    - livos/packages/ui/src/router.tsx (196 → 198, +2 for import + mount)
    - livos/packages/ui/src/routes/settings/software-update-confirm.tsx (50 → 85, +35 net for new title + author/date row)
    - livos/packages/ui/src/routes/settings/_components/software-update-list-row.tsx (72 lines, single-line shape swap)
    - livos/packages/ui/src/routes/settings/mobile/software-update.tsx (85 lines, single-line shape swap)
    - livos/packages/ui/src/hooks/use-settings-notification-count.ts (134 → 136, +2 for shortSha destructure)
    - livos/packages/ui/src/providers/global-system-state/update.tsx (53 lines, single-line shape swap — Rule 2 deviation)
    - livos/packages/ui/public/locales/en.json (English software-update.new-version retuned)

decisions:
  - "@testing-library/react NOT installed in UI devDeps — task `<action>` block authorized smoke-import scaffold + deferred-test comment block. Manual browser verification (Task 7) covers full RTL behaviour contract."
  - "Discovered 5th shape consumer (providers/global-system-state/update.tsx UpdatingCover title) NOT in plan list — added under Rule 2 (Critical Functionality). Without the fix the running update screen would render 'Updating to undefined'."
  - "English locale software-update.new-version retuned ('New X is available' → 'Update X is available') so a 7-char SHA reads naturally. Other 12 locales left untouched — they degrade gracefully via {{name}} interpolation. Future plan should re-translate."
  - "Browser smoke (Task 7) deferred to manual verification — Chrome DevTools MCP not present in tool list, no dev server / livinityd running locally. Per `<checkpoint_handling>` block: this is checkpoint:human-verify advisory, not a hard blocker."
  - "Pre-existing 19 vitest fails + ~40 tsc errors all reproduce on b6981b5f (parent of Phase 30) — confirmed pre-existing, logged in deferred-items.md, NOT fixed (scope-boundary rule)."

metrics:
  duration: ~9min
  completed: 2026-04-26
  tasks: 7 (6 with commits, Task 6 verification-only, Task 7 deferred to manual)
  commits: 6 task commits (test/feat/feat/fix/feat/chore) — see commit-list

threat_flags: []
---

# Phase 30 Plan 02: Auto-Update Notification — Frontend (Desktop Card + Shape Consumers)

GitHub-aware update notification card surfaces in the bottom-right of the desktop UI when `system.checkUpdate` reports a new master commit. SHA-keyed localStorage dismissal lets a NEWER commit re-show the card after a prior "Later" click. All 5 frontend files that destructured the legacy `{name, releaseNotes}` shape (Plan 30-01 swapped to `{available, sha, shortSha, message, author, committedAt}`) updated; TypeScript noEmit clean across all 7 Phase 30-touched UI files.

## Built

- **NEW:** `livos/packages/ui/src/components/update-notification.tsx` (99 lines) — `fixed bottom-4 right-4 z-[80]` desktop-only card; framer-motion `AnimatePresence` + spring transition; SHA-keyed dismissal via `localStorage['livos:update-notification:dismissed-sha']`; `Update` button navigates to `/settings/software-update/confirm`; `Later` writes the current `latestVersion.sha` to localStorage. Mobile branch (`useIsMobile() === true`) returns null-equivalent — avoids overlap with the mobile tab bar.
- **NEW (TEST):** `livos/packages/ui/src/components/update-notification.unit.test.ts` (60 lines) — smoke-import scaffold (`@testing-library/react` not in devDeps; deferred-test comment block lists Tests A–E for future RTL adoption). 1/1 PASS.
- **PATCH:** `useSoftwareUpdate` hook adds `refetchInterval: MS_PER_HOUR` for hourly background polling (UPD-04). React Query auto-pauses on hidden tabs → comfortably under GitHub's 60 req/hr unauth quota.
- **PATCH:** `router.tsx` mounts `<UpdateNotification />` as a sibling of `<InstallPromptBanner />` inside `<EnsureLoggedIn>` (line 85). Auth-gated automatically; auto-suppressed during the `<UpdatingCover />` active-update screen because that flow returns from `useGlobalSystemState`'s switch BEFORE rendering this subtree.
- **SHAPE-CONSUMER FIXES (5 files):**
  - `routes/settings/software-update-confirm.tsx` — `DialogTitle` now reads `'Update to ${shortSha}'`; `Markdown` body renders `message`; new author + committedAt row inside `ScrollArea`.
  - `routes/settings/_components/software-update-list-row.tsx` — single-line swap `latestVersion?.name || LOADING_DASH` → `latestVersion?.shortSha || LOADING_DASH`.
  - `routes/settings/mobile/software-update.tsx` — single-line swap (line 72).
  - `hooks/use-settings-notification-count.ts` — `{shortSha, available}` destructure with `?? 'available'` fallback.
  - `providers/global-system-state/update.tsx` (Rule 2 deviation) — UpdatingCover title swap so live updates render `'Updating to abc1234'` instead of `undefined`.
- **i18n:** English `software-update.new-version` retuned (`'New {{name}} is available'` → `'Update {{name}} is available'`). 12 non-English locales untouched — graceful degradation with the SHA in the placeholder.

## Test Results

| File | Tests | Pass | Notes |
|------|-------|------|-------|
| update-notification.unit.test.ts | 1 (smoke) | 1 | Import + defined-ness + DISMISSED_KEY literal sanity. RTL behaviour tests deferred. |

Pre-existing failures across the broader UI suite (19 fails / 4 docker test files) are NOT introduced by Phase 30 — verified by checking out b6981b5f (parent of first Phase 30 commit) and reproducing the same fails. Logged in `deferred-items.md` as out-of-scope.

**Phase 30 contribution to vitest:** 1 new test, 1 passing, 0 new fails.

## TypeScript Verification

```bash
cd livos/packages/ui && pnpm exec tsc --noEmit 2>&1 | grep -E "update-notification|software-update-confirm|software-update-list-row|mobile/software-update|use-settings-notification|use-software-update|router\.tsx|providers/global-system-state/update"
```

Returns ZERO matches — all 7 Phase 30 touched UI files compile clean.

Pre-existing unrelated TypeScript errors (~40 total across cmdk, motion-primitives, app-store, ai-chat, stories/widgets, etc.) reproduce on b6981b5f and are NOT introduced by Phase 30. Logged in `deferred-items.md`.

## Grep Audit Results

| Audit | Expected | Actual | Status |
|-------|----------|--------|--------|
| `latestVersion?.name \| latestVersion?.releaseNotes \| checkUpdateResult.*\.name \| latestVersion\.name \| latestVersion\.releaseNotes` in `livos/packages/ui/src` | 0 | 0 | PASS |
| `UpdateNotification` in `router.tsx` (import + JSX) | 2 | 2 (lines 6 + 85) | PASS |
| `MS_PER_HOUR` in `use-software-update.ts` | ≥1 | 2 (import + option) | PASS |
| `'livos:update-notification:dismissed-sha'` in src/ | ≥2 | 5 (component + 4× test file) | PASS |
| `<UpdateNotification />` after `<InstallPromptBanner />` in router.tsx | true | true (line 84 < line 85) | PASS |
| Net new TS errors in 7 touched files | 0 | 0 | PASS |

## Manual Verification Pending (Task 7)

Browser E2E smoke (Task 7 — `checkpoint:human-verify`) was deferred to manual execution because:

1. Chrome DevTools MCP tools (`mcp__chrome-devtools__*`) are NOT present in this executor's tool list.
2. No livinityd backend or Vite dev server is running on the Windows dev host (`http://127.0.0.1:9223` and `localhost:3000` both unreachable).
3. UpdateNotification consumes `system.checkUpdate` over tRPC — without a backend the hook returns `undefined`, making interactive verification impossible.

Per the prompt's `<checkpoint_handling>` block: "If browser smoke is impractical (no dev server running, MCP not connected, etc.), document the manual verification steps in the SUMMARY.md 'Manual Verification Pending' section and return successfully — this is a checkpoint:human-verify, advisory only, not a hard blocker."

### Manual verification protocol (for the verifier — Path A on Server4)

1. Backend already shipped (Plan 30-01 deployed; `.deployed-sha` bootstrapped on Server4 + Mini PC). Frontend will be live after the next `bash /opt/livos/update.sh`.
2. To force "update available" on a host already on the latest deploy:
   ```bash
   ssh root@45.137.194.103 "cat /opt/livos/.deployed-sha"  # capture current SHA
   ssh root@45.137.194.103 "echo '0000000000000000000000000000000000000000' > /opt/livos/.deployed-sha"
   ```
3. Open `https://livinity.cloud` (or current Server4 domain) in a desktop browser, log in. Wait up to 1 hour for the React Query refetchInterval, OR force-fresh by clearing `livos:update-notification:dismissed-sha` from localStorage and refreshing the page.
4. Verify visual:
   - Bottom-right card with `bottom-4 right-4` position
   - 320px wide (`w-80`)
   - Header: TbDownload icon + "New update available"
   - Body: `<font-mono>shortSha</font-mono> — <commit message first line, ≤80 chars>`
   - Meta: `{author}, {relative committedAt}` (e.g., "Alice, 2 hours ago")
   - Buttons: blue `Update` (flex-1) + outlined `Later`
   - Animation: spring slide-up + fade-in on mount
5. Click `Later`:
   - Card slides down + fades out (exit animation)
   - DevTools → Application → Local Storage shows `livos:update-notification:dismissed-sha = <full sha>`
   - Refresh — card stays hidden
6. Simulate a NEWER commit:
   ```bash
   ssh root@45.137.194.103 "echo '1111111111111111111111111111111111111111' > /opt/livos/.deployed-sha"
   ```
   Refresh — card should reappear (new SHA ≠ dismissedSha).
7. Click `Update`:
   - URL changes to `/settings/software-update/confirm`
   - Dialog opens with `'Update to <shortSha>'` title and commit message body
   - "By {author} — {committedAt}" row visible at the bottom of the ScrollArea
8. Mobile verification: open the same URL in mobile-emulator devtools (≤ 768 px width):
   - Card does NOT render
9. Restore `.deployed-sha`:
   ```bash
   ssh root@45.137.194.103 "echo '<original SHA>' > /opt/livos/.deployed-sha"
   ```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical Functionality] 5th shape consumer found (`providers/global-system-state/update.tsx`)**
- **Found during:** Task 4 grep audit
- **Issue:** Plan listed 4 shape-consumer files but `pnpm tsc --noEmit` flagged a 5th: `src/providers/global-system-state/update.tsx:36` — the `<UpdatingCover />` title `t('software-update.updating-to', {name: latestVersion.name})`. Without the fix, the running update screen would render `'Updating to undefined'` (a correctness/UX bug surfaced by TypeScript).
- **Fix:** Single-line swap `latestVersion.name` → `latestVersion.shortSha` to match the new shape contract.
- **Files modified:** `livos/packages/ui/src/providers/global-system-state/update.tsx`.
- **Commit:** 2c20cb9a (folded into the Task 4 commit alongside the 4 plan-listed files).

**2. [Scope-boundary] Pre-existing UI vitest infra failures NOT fixed**
- **Found during:** Task 6 wave-end full vitest run
- **Issue:** `pnpm --filter ui exec vitest run` reports 19 failing tests across 4 docker-related test files. All 4 files predate Phase 30 (verified — same fails reproduce on b6981b5f, the parent of the first Phase 30 commit). Common cause: missing `// @vitest-environment jsdom` directive at file top → `localStorage is not defined` in node test env.
- **Fix:** NOT fixed — out-of-scope per executor scope-boundary rule. Logged in `.planning/phases/30-auto-update/deferred-items.md` for a future maintenance phase.
- **Files modified:** `.planning/phases/30-auto-update/deferred-items.md` (new).
- **Commit:** c34dcf0c.

**3. [Scope-boundary] Pre-existing UI TypeScript errors NOT fixed**
- **Found during:** Task 6 wave-end `tsc --noEmit`
- **Issue:** ~40 pre-existing TS errors across cmdk, install-button, motion-primitives, ai-chat, app-store, stories. All reproduce on b6981b5f. Phase 30 introduces zero new errors.
- **Fix:** NOT fixed — out-of-scope. Same `deferred-items.md` log.

### Architectural Decisions

None — no Rule 4 (architectural change) was triggered. All deviations were Rule 2 / scope-boundary.

### Auth Gates

None.

## Threat Mitigations

All threats from `<threat_model>` accounted for:

| ID | Category | Component | Disposition | Verified |
|----|----------|-----------|-------------|----------|
| T-30-08 | InformationDisclosure | localStorage key | accept | Verified — only stores public commit SHA (no PII / tokens / user identifiers). Same-origin policy isolation. |
| T-30-09 | Tampering | Hand-edited dismissed-sha | accept | Verified — manually editing the value to match a future SHA suppresses one notification for the user themselves. No security boundary. |
| T-30-10 | Spoofing | Untrusted commit message rendered | mitigate | Verified — `latestVersion.message` rendered via React `{...}` interpolation (auto-escaped HTML). NOT via `dangerouslySetInnerHTML` or Markdown raw. The `.split('\n')[0].slice(0, 80)` further bounds output. |
| T-30-11 | DenialOfService | Excessive polling under tab-burst | accept | Verified — React Query refetchInterval auto-pauses on hidden tabs. 1h × 1 tab = 1 req/hr. 10 simultaneous tabs would still be user-controlled. |

## Carry-forward for Verifier

Phase 30 close-out:

- **UPD-01** (Plan 30-01) — Backend `system.checkUpdate` queries GitHub commits API + compares to `.deployed-sha`. ✓ Shipped.
- **UPD-02** (Plan 30-01) — Backend `system.update` spawns `bash /opt/livos/update.sh` with section-marker progress. ✓ Shipped.
- **UPD-03** (Plan 30-01) — `update.sh` writes `.deployed-sha` after successful build. ✓ Shipped on Server4 + Mini PC.
- **UPD-04** (Plan 30-02) — `<UpdateNotification />` desktop card + `useSoftwareUpdate` hourly polling + 5 shape consumers updated. ✓ Shipped (this plan).

All 4 v28.0 phase-30 requirements satisfied. Phase 30 ready for verifier sign-off pending the manual browser smoke (Task 7 manual verification protocol above).

### Future hook extraction

The SHA-keyed dismissal pattern (`localStorage.getItem(KEY)` → `useState<string | null>` → `value !== dismissedValue` visibility check) is the FIRST instance of this pattern in the repo. As a future refactor, extract a generic hook:

```ts
function useDismissibleByKey(storageKey: string, currentValue: string | null | undefined): {
  dismissed: boolean
  dismiss: () => void
}
```

Reusable any time we need: "show banner X until user dismisses; re-show when X's identity changes." Don't extract eagerly — wait for a 2nd consumer in a future plan.

### Future i18n cleanup

12 non-English locales of `software-update.new-version` retain the pre-Phase-30 wording (e.g., German "Neue X ist verfügbar zur Installation"). They degrade gracefully — the SHA still substitutes into `{{name}}`. A future i18n cleanup pass should re-translate the 12 strings to be SHA-friendly (e.g., German "Update X ist verfügbar zur Installation").

### Browser verification handoff

Run the 9-step manual verification protocol above against Server4 once the next `bash /opt/livos/update.sh` deploys this branch. Returns no automated artifacts (this is checkpoint:human-verify per design — animations + GitHub round-trip + dialog open are visual contracts).

## Commits

| Task | Type | Hash | Files |
|------|------|------|-------|
| 1 (RED) | test | 1b864874 | livos/packages/ui/src/components/update-notification.unit.test.ts |
| 2 (GREEN) | feat | 88b5e39a | livos/packages/ui/src/components/update-notification.tsx |
| 3 | feat | 571648b0 | livos/packages/ui/src/hooks/use-software-update.ts |
| 4 | fix | 2c20cb9a | (5 shape consumers + en.json — see commit) |
| 5 | feat | 8a752cb2 | livos/packages/ui/src/router.tsx |
| 6 | (verification only — no commit) | — | — |
| 7 | (manual verification — pending) | — | — |
| out-of-scope log | chore | c34dcf0c | .planning/phases/30-auto-update/deferred-items.md |

## Self-Check: PASSED

Verified all created files exist:
- `livos/packages/ui/src/components/update-notification.tsx`: FOUND (99 lines)
- `livos/packages/ui/src/components/update-notification.unit.test.ts`: FOUND (60 lines)
- `.planning/phases/30-auto-update/deferred-items.md`: FOUND (52 lines)

Verified all task commits exist (`git log --oneline | grep`):
- 1b864874: FOUND (test(30-02))
- 88b5e39a: FOUND (feat(30-02) component)
- 571648b0: FOUND (feat(30-02) hook)
- 2c20cb9a: FOUND (fix(30-02) shape consumers)
- 8a752cb2: FOUND (feat(30-02) router mount)
- c34dcf0c: FOUND (chore(30-02) deferred-items)

Verified ZERO regressions:
- Shape-consumer audit grep: 0 matches in `livos/packages/ui/src`
- TS errors in 7 touched files: 0
- Pre-existing TS / vitest fails: same count on b6981b5f (Phase 30 contribution = 0 new fails)

All success criteria from PLAN.md `<success_criteria>` satisfied except Task 7 (manual browser verification — deferred to verifier with full protocol documented above).
