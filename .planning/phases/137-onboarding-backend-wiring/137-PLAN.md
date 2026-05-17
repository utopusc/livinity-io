# Phase 137 — Onboarding Backend Wiring (MASTER PLAN)

> Companion to `137-CONTEXT.md`. Executable roadmap for `/gsd-execute-phase 137`.

## Goal

End-to-end wire the Phase 135 wizard data to livinityd's tRPC surface: real hardware detection for the Welcome spec card, persisted wallpaper + AI preferences + language as the user progresses, backend-backed resume that survives device switch. AccountStep already persists user via existing register/login mutations — leave alone.

## Atomic commit roadmap

### Plan 137-01 — `system.info` query

**Files:**
- ➕ `livos/packages/livinityd/source/modules/system/info.ts` — `getSystemInfo(): Promise<{cpu, ram, storage, network, region}>`. Reads `os.cpus()[0].model + ' · ' + os.cpus().length + ' cores'`; `(os.totalmem()/1024**3).toFixed(0) + ' GB'`; `df -h /` parsed for total/avail; default route iface from `ip route` (then `iwconfig` to detect Wi-Fi vs ethernet); `cat /etc/timezone` (fall back to `Intl.DateTimeFormat().resolvedOptions().timeZone`).
- ➕ `livos/packages/livinityd/source/modules/system/procedures.ts` — tRPC `info` query, wrapped in `redis.cache('liv:system:info', 60s, getSystemInfo)`.
- ✏️ Root router — register `system: systemRouter`.
- ➕ `livos/packages/livinityd/source/modules/system/__tests__/info.spec.ts` — happy path on Linux, fallback path on non-Linux.

### Plan 137-02 — WelcomeStep consumes real system info

**Files:**
- ✏️ `livos/packages/ui/src/features/onboarding-flow/steps/welcome-step.tsx` — drop `SYS_INFO` const. Add `const sysInfo = trpcReact.system.info.useQuery().data ?? {cpu: '—', ram: '—', storage: '—', network: '—', region: '—'}`. Cells render the live values.

### Plan 137-03 — WallpaperStep + PersonalizeStep + lang persistence

**Files:**
- ✏️ `livos/packages/ui/src/features/onboarding-flow/steps/wallpaper-step.tsx` — wire `setData({wallpaper})` to also `wallpaperSetMut.mutate({id})`; show inline error if request fails but DON'T block Continue.
- ✏️ `livos/packages/ui/src/features/onboarding-flow/steps/personalize-step.tsx` — for each setter, fire `preferences.set({key, value})`. Debounce tone-slider 400ms via `useDebouncedCallback`. Memory + style + role fire on click. Use cases batched (set whole array on each toggle).
- ✏️ `livos/packages/ui/src/features/onboarding-flow/steps/welcome-step.tsx` — lang dropdown change: if user logged in, fire `user.setLanguage`; else, write to `sessionStorage 'temporary-language'` (existing fallback path).
- ➕ `livos/packages/ui/src/hooks/use-debounced-callback.ts` (if not already in repo) — small utility.

### Plan 137-04 — Backend resume

**Files:**
- ✏️ `livos/packages/ui/src/routes/onboarding/setup-wizard-v2.tsx`:
  - On mount, if logged in, `trpcReact.preferences.get.useQuery({key: 'onboarding_state'})` → if exists, hydrate `data` + `stepper.go(idx)`.
  - `useEffect` on `[stepper.idx, data]`: debounced 500ms `preferences.set({key: 'onboarding_state', value: JSON.stringify({idx, data})})`. Only when logged in.
  - Localstorage path remains for unauth state (steps 0-1 before register).

### Plan 137-05 — DoneStep cleanup + failure polish

**Files:**
- ✏️ `livos/packages/ui/src/features/onboarding-flow/steps/done-step.tsx` — `onEnter`: `await preferences.delete({key: 'onboarding_state'})` (best-effort; ignore failure); then `window.location.href = '/'`.
- Polish: cross-step a single `useToast` hook for write-failure toasts; retry-on-next-change pattern.
- ✏️ Settings → Users entry — verify the new preferences appear in the existing preference editor so users can revise post-onboarding (assertion only; no code change expected).

### Plan 137-06 — Mini PC deploy + UAT + memory

**Files:** docs only.
- `bash /opt/livos/update.sh` on Mini PC.
- Walk `137-UAT-CHECKLIST.md`: verify each AC; SQL query `user_preferences` to confirm rows.
- Memory: `project_phase_137_complete.md`.
- ROADMAP flip.

## Acceptance recap

Re-verify against `137-CONTEXT.md` AC-137-M1..M8. All must pass before phase close.

## Rollback

Each plan ships its own commit. `git revert` any plan in isolation leaves the others functional. Worst case is 137-03 revert: wizard reverts to dropping data on Continue (Phase 135 behavior).
