# Phase 137 — Onboarding Backend Wiring (CONTEXT)

**Opened:** 2026-05-17
**Driver:** Phase 135 ships the visual onboarding port complete, but the wizard's collected data is currently DROPPED on "Enter Dashboard" (only `register` + `login` happen during AccountStep; wallpaper, role, AI style, tone, memory, use-cases, and language are not persisted anywhere). Additionally, the WelcomeStep `SYS_INFO` is hard-coded ("Apple M2 · 8 cores", "16 GB", etc.) and the resume banner reads from `localStorage` only — won't survive device switches. Phase 137 wires the wizard end-to-end against the existing livinityd tRPC surface.

**User context:** Phase 135 commits flagged "Backend wiring of wallpaper/preferences also deferred" as a known follow-up. This phase closes that gap.

## Locked decisions

| # | Decision | Locked value | Source |
|---|----------|--------------|--------|
| D-137-PERSIST-ON | When wizard data writes to backend | On step transition (Continue) rather than batched at the end. Reason: if user closes the tab mid-wizard, partial choices are preserved and resume picks up exactly where they left off. | UX best-practice + matches reference resume flow |
| D-137-PERSIST-SHAPE | Where each field lands | `data.wallpaper` → `trpcReact.wallpaper.set` (existing); `data.role/style/tone/memory/useCases` → `trpcReact.preferences.set` (key-value, existing); `data.lang` → `trpcReact.user.setLanguage` (existing); `data.name/password` → `trpcReact.user.register` then `user.login` (already wired in 135-F) | Use existing tRPC surface; no new procedures except sys.info |
| D-137-SYS-INFO | WelcomeStep system spec source | New tRPC query `system.info`: returns `{cpu, ram, storage, network, region}` derived from `os.cpus()`, `os.totalmem()`, `df -h /`, `ip route` defaults, `/etc/timezone`. Cached 60s in Redis to avoid re-running shell on every render. | Replaces hard-coded SYS_INFO constants |
| D-137-RESUME-BACKEND | Resume state storage | `user_preferences` row with key `onboarding_state`, value `JSON.stringify({idx, data})`. Read on wizard mount via `trpcReact.preferences.get('onboarding_state')`; written via `preferences.set`. localStorage fallback retained for unauth (pre-AccountStep) state. | Survives device switch; aligns with existing preferences infra |
| D-137-RESUME-CLEAR | When to clear backend resume | On DoneStep's "Enter Dashboard" click, before navigating to `/` | Standard wizard-finish pattern |
| D-137-PARTIAL-FAILURE | If a persistence call fails mid-flow | Surface error inline, allow retry without losing wizard state, don't block step advance for non-critical writes (wallpaper/preferences). AccountStep register failure already blocks (preserved from 135-F). | UX: wizard must feel resilient |
| D-137-SYS-INFO-FALLBACK | system.info reading on dev (non-Linux backend) | Returns shape-correct placeholders if `df`/`ip` not available; UI never sees an empty card | Dev parity |
| D-137-SACRED-SHA | sdk-agent-runner.ts SHA | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved every commit | Project invariant |

## Codebase baseline (audited 2026-05-17)

**Existing tRPC surface (verified usable):**
- `trpcReact.user.register` — wires name/password/language → JWT (135-F already uses)
- `trpcReact.user.login` — wires password/totpToken → JWT (135-F already uses)
- `trpcReact.user.setLanguage` — wires language (existing in V1 wizard)
- `trpcReact.wallpaper.set` — wires wallpaper ID (existing in V1 wizard)
- `trpcReact.preferences.set({key, value})` — wires arbitrary key-value (existing, used by `onboarding-sync.tsx` for `ai_role/ai_response_style/ai_use_cases`)
- `trpcReact.preferences.get({key})` — read single key (existing)
- `trpcReact.user.get` — read user record (existing)

**Missing — to add in 137-01:**
- `trpcReact.system.info` — new namespace + query, returns `{cpu: string, ram: string, storage: string, network: string, region: string}`

**Frontend touch points:**
- `livos/packages/ui/src/features/onboarding-flow/steps/welcome-step.tsx` — drop `SYS_INFO` const; consume `trpcReact.system.info.useQuery()`; render loading skeleton on first render
- `livos/packages/ui/src/features/onboarding-flow/steps/wallpaper-step.tsx` — wire `setData` → also fires `wallpaper.set` mutation (optimistic UI, no await on Continue)
- `livos/packages/ui/src/features/onboarding-flow/steps/personalize-step.tsx` — wire each setData mutation to `preferences.set` (debounced ~400ms so tone-slider doesn't spam)
- `livos/packages/ui/src/features/onboarding-flow/steps/welcome-step.tsx` — wire lang dropdown change → `user.setLanguage` (after register only; pre-register write to sessionStorage)
- `livos/packages/ui/src/features/onboarding-flow/steps/done-step.tsx` — clear `onboarding_state` backend key before navigate
- `livos/packages/ui/src/routes/onboarding/setup-wizard-v2.tsx` — `useEffect` to read backend `onboarding_state` on mount (only when user is logged in, i.e. post AccountStep); merge into `data`; write on every step/data change (debounced 500ms)

**Backend:**
- ➕ `livos/packages/livinityd/source/modules/system/info.ts` — system spec collector
- ✏️ `livos/packages/livinityd/source/modules/system/index.ts` (or `procedures.ts`) — export `info` query under `system` namespace
- ✏️ Root router — register `system: systemRouter`

## Acceptance criteria (master)

- [ ] AC-137-M1: Walk wizard end-to-end on Mini PC. Open SQL console: `user_preferences` for the new user contains rows for `ai_role`, `ai_response_style`, `ai_tone`, `ai_memory`, `ai_use_cases`. `wallpaper` set on user record. `language` correctly persisted.
- [ ] AC-137-M2: WelcomeStep spec card displays REAL hardware values (not "Apple M2"). On Mini PC: shows whatever `bruce-EQ` actually is (Intel? ARM? whatever the box reports).
- [ ] AC-137-M3: Cold reload mid-wizard (e.g. at step 3) brings the user back to step 3 with previously-chosen role/style/tone preserved.
- [ ] AC-137-M4: Cross-device resume: complete steps 0-2 on browser A (signed in), open `/onboarding` on browser B (signed in with same account) — resume banner appears, "Resume" advances to step 2 with the same data.
- [ ] AC-137-M5: AccountStep functionality preserved (no regression on register/login).
- [ ] AC-137-M6: Network failure during a non-critical persistence call (e.g. wallpaper.set times out) surfaces an unobtrusive toast but lets user advance; on next data change the failed write is retried.
- [ ] AC-137-M7: No new console errors on any step.
- [ ] AC-137-M8: Sacred SHA preserved across all commits.

## Non-goals

- 2FA enrollment backend (handled in Phase 138)
- Live `claude /login` integration (Phase 136)
- New preference keys beyond what the reference wizard collects
- A11y / i18n / mobile polish (Phase 139)
- Settings UI for editing these preferences post-onboarding (existing Settings already handles this)

## Dependencies

- Phase 135 ✅ (V2 wizard exists)
- Phase 136 (not strict — 137 can ship without it; ConnectAI step's "Continue" still works via the visual mock)

## Sub-plans

| # | Plan file | Scope | Approx LOC | Depends on |
|---|---|---|---|---|
| 137-01 | `137-01-PLAN.md` | Backend: new `system.info` namespace + collector (cpus, mem, df, ip, timezone) + 60s Redis cache | +180 | — |
| 137-02 | `137-02-PLAN.md` | Frontend: WelcomeStep consumes `system.info` query; skeleton while loading; fallback to "—" cells on error | +60 | 137-01 |
| 137-03 | `137-03-PLAN.md` | Wire WallpaperStep + PersonalizeStep + lang dropdown to existing tRPC mutations (debounced where needed) | +180 | 137-02 |
| 137-04 | `137-04-PLAN.md` | Backend resume: write `onboarding_state` key on every step/data change (debounced 500ms via `useDebouncedCallback`); read on mount; merge with localStorage fallback for unauth state | +120 | 137-03 |
| 137-05 | `137-05-PLAN.md` | DoneStep: clear backend onboarding_state, then navigate; failure-handling polish across all writes (toast + retry) | +80 | 137-04 |
| 137-06 | `137-06-PLAN.md` | Mini PC deploy + UAT walk against AC-137-M1..M8; flip ROADMAP/STATE; memory | docs | 137-05 |

**Total est:** ~620 LOC, 6 atomic commits.

## Rollback

Each plan is atomic. Worst case revert: 137-04 (resume) alone leaves wallpaper + preferences wired but resume falls back to localStorage. 137-03 (preference wiring) revert leaves system.info but UI doesn't persist user choices — wizard works visually, just doesn't write to backend. 137-01 (sys.info) revert restores hard-coded SYS_INFO.

## Related memories

- `[[project-phase-135-complete]]` — what shipped before
- Existing `onboarding-sync.tsx` provider — current preference-sync pattern (a one-shot after-login sync via localStorage); 137 replaces this with eager mid-wizard writes
