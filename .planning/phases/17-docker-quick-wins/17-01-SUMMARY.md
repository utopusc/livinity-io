---
phase: 17-docker-quick-wins
plan: 01
subsystem: docker
tags: [websocket, xterm, ansi, streaming, aes-256-gcm, secrets, docker-compose, redis, ioredis]

# Dependency graph
requires:
  - phase: 07-multi-user
    provides: JWT secret at /opt/livos/data/secrets/jwt (used as AES-256-GCM key source)
  - phase: docker-exec-socket
    provides: /ws/docker-exec handler pattern + mountWebSocketServer JWT auth gate
provides:
  - Real-time container log WebSocket at /ws/docker/logs with follow-mode + heartbeat
  - xterm-based LogsTab with ANSI color rendering (replaces 5s polling + stripAnsi)
  - Encrypted stack secret store (AES-256-GCM keyed off JWT secret) in Redis
  - execa-env injection pattern — secrets never written to disk, only shell-env at compose up time
  - tRPC schema extension for per-env-var `secret: boolean` flag on deployStack/editStack
  - UI stack form with secret checkbox, password-type input, redacted placeholder for stored secrets
affects:
  - phase-18-container-file-browser (log-stream pattern reusable for file-content-stream)
  - phase-20-scheduler (log-stream pattern reusable for scheduler task log tails)
  - phase-21-gitops (AES-256-GCM-with-JWT-key pattern reusable for git credential encryption GIT-01)

# Tech tracking
tech-stack:
  added: []   # No new dependencies — reused @xterm/xterm, @xterm/addon-fit, ioredis, crypto, execa
  patterns:
    - "WebSocket streaming handler factory: createXxxHandler({logger}) -> (ws, req) => ..."
    - "execa env injection: $({env:{...process.env, ...secretOverrides}})`docker compose up -d`"
    - "Redaction-on-read: getStackEnv returns value='' for secret entries (hasValue:true)"
    - "Client-side hasValue flag: blank-value + hasValue=true signals 'keep existing stored secret'"
    - "Incremental secret update on edit: delete-missing + set-non-empty (NOT deleteAll)"

key-files:
  created:
    - livos/packages/livinityd/source/modules/docker/docker-logs-socket.ts
    - livos/packages/livinityd/source/modules/docker/stack-secrets.ts
    - .planning/phases/17-docker-quick-wins/17-01-SUMMARY.md
  modified:
    - livos/packages/livinityd/source/modules/docker/docker.ts
    - livos/packages/livinityd/source/modules/docker/stacks.ts
    - livos/packages/livinityd/source/modules/docker/routes.ts
    - livos/packages/livinityd/source/modules/server/index.ts
    - livos/packages/ui/src/routes/server-control/container-detail-sheet.tsx
    - livos/packages/ui/src/routes/server-control/index.tsx
    - livos/packages/ui/src/hooks/use-stacks.ts

key-decisions:
  - "Reuse stripDockerStreamHeaders from docker.ts rather than reimplementing — exported unchanged"
  - "editStack uses incremental add/remove for secrets (NOT deleteAll) so UI can submit blank-value rows to preserve stored secrets"
  - "controlStack('up') also injects secret envOverrides so restarted stacks keep access to secrets"
  - "removeStack purges Redis secret hash best-effort (.catch(() => {})) so a Redis outage can't block stack teardown"
  - "LogsTab search input is visible v1 placeholder — xterm search addon deferred to v28 to avoid scope creep"
  - "tailLines change triggers setTimeout(connect,0) instead of effect-based reconnect to avoid effect loops"

patterns-established:
  - "WebSocket streaming handler pattern (docker-logs-socket.ts): reusable for Phase 18 file-browser stream, Phase 20 scheduler tail"
  - "AES-256-GCM-with-JWT-key pattern (stack-secrets.ts): reusable for Phase 21 GIT-01 credential encryption"
  - "Redacted-on-read env var list pattern (getStackEnv): secrets never round-trip plaintext through the client"

requirements-completed: [QW-01, QW-02]

# Metrics
duration: 7min
completed: 2026-04-24
---

# Phase 17 Plan 01: Real-time log WebSocket + stack secrets as shell env Summary

**Live container log streaming via /ws/docker/logs (xterm + ANSI colors, no 5s polling) and AES-256-GCM-encrypted stack secrets injected via execa env at compose up time (never written to /opt/livos/data/stacks/<name>/.env on disk)**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-24T21:39:42Z
- **Completed:** 2026-04-24T21:46:42Z
- **Tasks:** 4
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments

- **QW-01**: New WebSocket endpoint `/ws/docker/logs` streams `container.logs({follow:true})` with Docker frame-header stripping and 30s ping/pong heartbeat. The LogsTab in `container-detail-sheet.tsx` is rewritten to consume this stream via `@xterm/xterm` — new log lines appear in <1s with ANSI colors rendered natively (was: 5s poll + `stripAnsi`).
- **QW-02**: Stack env vars now carry a `secret?: boolean` flag. Secret values are encrypted with AES-256-GCM (key = SHA-256 of JWT secret) and stored in Redis under `nexus:stack:secrets:{name}`. At `docker compose up` time, they're injected via execa's `env` option — compose interpolates them into containers without ever touching `/opt/livos/data/stacks/<name>/.env`.
- Stack deploy/edit form gets a per-row "secret" checkbox with `IconLock`, amber left border for visual distinction, password-type input, and a `•••••••• (stored, re-enter to change)` placeholder for already-stored secrets.
- `getStackEnv` now returns redacted `{key, value:'', secret:true, hasValue:true}` for stored secrets — plaintext never round-trips through the client.
- `editStack` uses incremental delete-missing + set-non-empty rather than `deleteAll`, so a user can leave a secret row blank on edit to keep the existing stored value untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add /ws/docker/logs streaming handler with heartbeat + register in server** — `8a4a1509` (feat)
2. **Task 2: Rewrite LogsTab in container-detail-sheet.tsx to consume /ws/docker/logs with xterm + ANSI** — `37b17dd1` (feat)
3. **Task 3: Add Redis-backed encrypted stack secret store + extend stacks.ts to inject via execa env** — `1269a064` (feat)
4. **Task 4: UI stack deploy/edit form — per-env-var secret checkbox + redacted display for stored secrets** — `83ee57df` (feat)

**Plan metadata:** _(appended below after state updates)_

## Files Created/Modified

### Created
- `livos/packages/livinityd/source/modules/docker/docker-logs-socket.ts` — WebSocket handler for real-time log streaming (follow=true, 30s heartbeat, stream-header strip, ANSI-preserving)
- `livos/packages/livinityd/source/modules/docker/stack-secrets.ts` — AES-256-GCM encrypt/decrypt helpers + Redis-backed `StackSecretStore` (set/get/delete/listKeys/deleteAll)

### Modified
- `livos/packages/livinityd/source/modules/docker/docker.ts` — exported `stripDockerStreamHeaders` for reuse by the WS handler
- `livos/packages/livinityd/source/modules/docker/stacks.ts` — `deployStack`/`editStack` split `secret:true` from plain envs; secrets go to Redis, plain envs to `.env` file; both paths inject via `execa env` at compose up time; `controlStack('up')` also injects; `removeStack` purges Redis hash; new `getStackEnv` return shape (secret+hasValue)
- `livos/packages/livinityd/source/modules/docker/routes.ts` — `deployStack`/`editStack` zod schemas extended with `secret: z.boolean().optional().default(false)` per env var
- `livos/packages/livinityd/source/modules/server/index.ts` — registered `/ws/docker/logs` via `mountWebSocketServer` (uses existing JWT query-param auth gate)
- `livos/packages/ui/src/routes/server-control/container-detail-sheet.tsx` — LogsTab rewritten as xterm WS consumer; `XTERM_THEME` hoisted to module scope
- `livos/packages/ui/src/routes/server-control/index.tsx` — stack deploy/edit form: secret checkbox, password-type input, amber border, redacted placeholder, submit strips `hasValue`
- `livos/packages/ui/src/hooks/use-stacks.ts` — widened `deployStack`/`editStack` input types to include `secret?: boolean`

## Decisions Made

- **No `containerLogs` tRPC deprecation** — left intact as backwards-compat snapshot path (could be used as initial-tail fallback if WS unavailable). Matches plan guidance.
- **`hasValue` is UI-only** — server never returns it alongside real values; UI adds it when hydrating from `getStackEnv` to signal "stored but redacted". Stripped on submit.
- **Blank-value submit policy** — for `editStack`, a row with `secret:true + value:''` is preserved (kept as-is). For `deployStack`, fresh deploy replaces entire secret set, so blank-value secret rows on initial deploy would silently drop (acceptable — no prior state to preserve).
- **`controlStack('up')` re-injects secrets** — otherwise a `stop` → `up` cycle would lose secret env vars. Non-`up` operations skip the Redis fetch (zero cost when disabled).
- **Search input kept as visible v1 placeholder** — users see "Search logs (v28)..." so the intent is clear; xterm search addon deferred to avoid scope creep beyond QW-01 acceptance (truths say real-time + ANSI, not search).

## Deviations from Plan

None — plan executed exactly as written.

The plan prescribed file structures, patterns, and verification commands with high specificity. Every `<done>` criterion was met:
- Task 1: `stripDockerStreamHeaders` exported, `/ws/docker/logs` registered, heartbeat present, typecheck touches-clean.
- Task 2: LogsTab connects on mount, no `containerLogs` call remains in LogsTab, `pnpm --filter ui build` passed (32s), ANSI rendering via xterm native, Download/Reconnect/Clear/tail-slider all wired.
- Task 3: `stack-secrets.ts` uses `aes-256-gcm`, deployStack/editStack split by `secret` flag, `editStack` uses incremental delete-missing+set-non-empty, `getStackEnv` redacts with `value:''`, `removeStack` purges Redis hash, typecheck touches-clean.
- Task 4: secret checkbox visible, password-type input present, `hasValue` wired, blank-value secret rows preserved on submit, UI build passed (32s).

One minor intentional variance: the value `<Input>` uses `type={env.secret ? 'password' : 'text'}` (ternary) rather than a hardcoded `type='password'`. This preserves the plain/secret visual distinction for non-secret rows. The `'password'` literal is still present in the file, matching the verify grep.

**Total deviations:** 0
**Impact on plan:** None — full scope delivered, all acceptance truths met.

## Issues Encountered

**Pre-existing `pnpm --filter livinityd typecheck` errors** in `user/routes.ts`, `widgets/routes.ts`, `user/user.ts`, `utilities/file-store.ts`, and multiple lines in `server/index.ts` (unrelated to this plan's edits). Per scope boundary in deviation rules, these were NOT fixed — logged here for awareness but out-of-scope.

Filtered typecheck of just the files touched by this plan (`docker-logs-socket.ts`, `docker/stacks.ts`, `docker/routes.ts`, `stack-secrets.ts`, server/index.ts edits near line 1015) returned zero errors. UI `pnpm --filter ui build` passed clean for both LogsTab and stack-form changes.

## Known Stubs

- `LogsTab` search input is a v1 placeholder that sets state but does not yet search the xterm buffer. Documented inline as `// TODO(QW-01/search): wire xterm search addon in v28` — deferred per plan's explicit guidance.

These are intentional v28.0 follow-ups, NOT unwired data sources blocking QW-01/QW-02 acceptance.

## User Setup Required

None — QW-01 (logs streaming) requires no secrets. QW-02 (stack secrets) uses the existing `/opt/livos/data/secrets/jwt` already created by multi-user setup (Phase 07). Redis is already running on server4.

**Deployment caveat:** `JWT_SECRET_PATH` in `stack-secrets.ts` is hardcoded to `/opt/livos/data/secrets/jwt`. On server4/server5 this works; if the daemon is ever run with a different JWT secret location (dev environment), secrets will fail to encrypt/decrypt. If that situation arises, lift the path to an env var — not blocking for production.

## Next Phase Readiness

- **WebSocket streaming handler pattern** is now the reference for Phase 18 (Container File Browser — can stream file contents), Phase 20 (Scheduler — can tail task logs live).
- **AES-256-GCM-with-JWT-key pattern** is the reference for Phase 21 GIT-01 (git credential encryption).
- **`getStackEnv` redaction convention** is the reference for any future secret-bearing API (never return plaintext to client).
- Plan 17-02 (Redeploy-with-pull + AI docker_manage tool expansion) is unblocked — no dependencies from this plan block it.

## Self-Check: PASSED

All created files present on disk:
- `livos/packages/livinityd/source/modules/docker/docker-logs-socket.ts`
- `livos/packages/livinityd/source/modules/docker/stack-secrets.ts`
- `.planning/phases/17-docker-quick-wins/17-01-SUMMARY.md`

All 4 task commits present in `git log --oneline --all`:
- `8a4a1509` — Task 1 (WS handler)
- `37b17dd1` — Task 2 (xterm LogsTab)
- `1269a064` — Task 3 (secret store + stacks.ts)
- `83ee57df` — Task 4 (UI secret checkbox)

---
*Phase: 17-docker-quick-wins*
*Completed: 2026-04-24*
