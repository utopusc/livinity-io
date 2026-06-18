---
phase: 285-umbrel-leftover-cleanup-and-docker-scroll-fix
plan: 01
subsystem: ui-docker
status: complete
tags: [ui, css, flexbox, docker, scroll-fix]
requires: []
provides:
  - "Docker containers desktop table scrolls instead of hard-clipping rows below the fold"
affects:
  - livos/packages/ui/src/routes/docker/resources/container-section.tsx
tech-stack:
  added: []
  patterns: ["tailwind flexbox min-h-0 / overflow-y-auto scroll region", "overflow-x-hidden corner-clip preservation"]
key-files:
  created: []
  modified:
    - livos/packages/ui/src/routes/docker/resources/container-section.tsx
decisions:
  - "Used the RESEARCH-recommended hybrid: overflow-hidden -> overflow-x-hidden overflow-y-auto at container-section.tsx:401, so the existing wrapper (:234 overflow-y-auto) scrolls while the rounded-xl corners stay clipped on the horizontal axis. No new flex classes needed — the parent (docker-app.tsx:51 min-h-0 flex-1) and wrapper already provide the chain."
  - "Operator approved the visual-verify checkpoint (trusted the 1-line diff + clean build)."
metrics:
  duration: ~4m
  completed: 2026-06-18
  tasks-completed: 2
  tasks-total: 2
---

# Phase 285 Plan 01: Docker containers section scroll fix (Item 5) — Summary

Fixed the desktop Docker containers table so it scrolls instead of hard-clipping rows below the fold. Root cause (per RESEARCH §Item 5): the table-container `<div>` at `container-section.tsx:401` had `overflow-hidden` with no `min-h-0`/`overflow-y-auto`, so as a flex child of the `flex-col` wrapper it was sized to the available flex space and `overflow-hidden` HARD-CLIPPED the overflowing rows — the wrapper's `overflow-y-auto` never saw overflow (content was clipped, not overflowing), so rows below the fold were unreachable.

## What Changed (Task 1 — committed `fc07237f`)

`livos/packages/ui/src/routes/docker/resources/container-section.tsx:401`:

```diff
- <div className='rounded-xl border border-border-default bg-surface-base overflow-hidden'>
+ <div className='rounded-xl border border-border-default bg-surface-base overflow-x-hidden overflow-y-auto'>
```

- `overflow-y-auto` makes the table container itself scroll the long list.
- `overflow-x-hidden` preserves the `rounded-xl` corner clip on the horizontal axis (no horizontal scrollbar, corners stay rounded).
- The supporting flex chain was re-confirmed before editing and left untouched: parent `docker-app.tsx:51` `min-h-0 flex-1 overflow-auto`; wrapper `container-section.tsx:234` `flex h-full flex-col overflow-y-auto p-4 sm:p-6`; mobile path `:318` `space-y-2` (scrolls at parent).

## Verification Gates — ALL PASS

```
pnpm --filter ui build                                          -> exit 0 ("built in 32.41s")
grep -c "bg-surface-base overflow-hidden" container-section.tsx -> 0  (was 1)
grep -c "bg-surface-base overflow-x-hidden overflow-y-auto"     -> 1
wrapper string (:234) unchanged                                 -> 1
mobile path (:318 space-y-2) untouched                          -> 1
```

Exactly 1 line changed (1 insertion / 1 deletion), no deletions of other content.

**Visual checkpoint:** Operator APPROVED (trusted the 1-line diff + clean build; will spot-check the scroll on localhost:3000 / post-deploy). The pre-existing ~19 `localStorage is not defined` unit-test failures in `routes/docker/**` (Phase 29-01) are out of scope and were not caused by this CSS-only change.

## Deviations from Plan

None. (Chose the hybrid `overflow-x-hidden overflow-y-auto` over a bare `overflow-hidden` removal to keep the rounded-corner clip — RESEARCH §Item 5 line 320 sanctioned this as the least-likely-to-disturb-width option.)

## Known Stubs

None.

## Self-Check: PASSED

- `container-section.tsx` modified at :401: FOUND
- Commit `fc07237f`: FOUND
- `pnpm --filter ui build` exit 0: PASS
- Wrapper + mobile paths untouched: PASS
