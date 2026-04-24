---
phase: 17-docker-quick-wins
plan: 02
subsystem: docker
tags: [docker, docker-compose, tool-registry, ai-tool, dockerode, child-process-exec, redeploy]

# Dependency graph
requires:
  - phase: 17-01
    provides: controlStack implementation in stacks.ts + secret env overrides on 'up' (pull-and-up extends both)
  - phase: phase-08-nexus-v2
    provides: DockerManager class + docker_manage tool registration pattern
provides:
  - Stack controlStack operation 'pull-and-up' (docker compose pull + up -d in sequence)
  - Stack UI "Redeploy (pull latest)" button + confirmation dialog
  - DockerManager methods: deployStack, controlStack, removeStack, pullImage, createContainer
  - docker_manage AI tool operations: stack-deploy, stack-control, stack-remove, image-pull, container-create
  - PROTECTED_STACK_PREFIXES pattern (mirrors PROTECTED_CONTAINER_PATTERNS at stack level)
affects:
  - phase-22-registry-auth (AI tool image-pull will need registry credential support)
  - phase-28-advanced (AI tool stack-deploy does NOT yet support secret env vars — planned ADV)

# Tech tracking
tech-stack:
  added: []   # No new dependencies — reused dockerode, node:child_process, node:fs/promises
  patterns:
    - "AI docker tool uses local socket + host `docker compose` CLI (not livinityd tRPC) — consistent with existing container ops"
    - "Compose files under /opt/livos/data/stacks/<name>/ shared between livinityd and AI tool so UI sees AI-created stacks immediately"
    - "PROTECTED_STACK_PREFIXES allow-list guard on removeStack — refuses livos*/nexus-infrastructure*/caddy* (mirrors livinityd container protection)"
    - "pull-and-up = pull first (network op, can be slow) then up -d (recreate containers on new digest)"

key-files:
  created:
    - .planning/phases/17-docker-quick-wins/17-02-SUMMARY.md
  modified:
    - livos/packages/livinityd/source/modules/docker/stacks.ts
    - livos/packages/livinityd/source/modules/docker/types.ts
    - livos/packages/livinityd/source/modules/docker/routes.ts
    - livos/packages/ui/src/hooks/use-stacks.ts
    - livos/packages/ui/src/routes/server-control/index.tsx
    - nexus/packages/core/src/docker-manager.ts
    - nexus/packages/core/src/daemon.ts

key-decisions:
  - "AI docker_manage tool stays local-socket + child_process.exec — no HTTP to livinityd — matches existing start/stop/restart/inspect/logs pattern"
  - "pull-and-up re-injects secret env overrides (same path as 'up') so upgrading a stack with secrets doesn't drop them"
  - "AI removeStack adds PROTECTED_STACK_PREFIXES (livos, nexus-infrastructure, caddy) — mirrors the container-level protection at stack level since livinityd's isProtectedContainer is not reachable from nexus-core without an HTTP hop"
  - "Renamed inner `exec` variable in DockerManager.exec() to `execInstance` to avoid shadowing the newly-imported child_process exec (zero behavioral change)"
  - "ActionButton in stacks UI reuses color='blue' (no new 'violet' option) — plan explicitly permitted this fallback; the title 'Redeploy (pull latest images)' distinguishes it"
  - "Confirmation dialog (RedeployStackDialog) is plain — no extra options — pull+up is idempotent and volume-safe, so no destructive-flag checkbox needed"

requirements-completed: [QW-03, QW-04]

# Metrics
duration: 8min
completed: 2026-04-24
---

# Phase 17 Plan 02: Redeploy-with-pull + broader AI docker_manage tool Summary

**One-click stack upgrade via a new `pull-and-up` controlStack operation (UI button pulls latest images and recreates containers with the same volumes) plus a broader AI `docker_manage` tool that gains 5 new operations (stack-deploy / stack-control / stack-remove / image-pull / container-create) backed by new DockerManager methods using the local socket + host `docker compose` CLI.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-24T21:50:42Z
- **Completed:** 2026-04-24T21:58:42Z
- **Tasks:** 4
- **Files modified:** 7 modified, 1 created (this SUMMARY)

## Accomplishments

- **QW-03 (backend):** `controlStack` in `stacks.ts` branches on the new `'pull-and-up'` operation and runs `docker compose pull` followed by `docker compose up -d`. Secret env overrides (from 17-01) are injected on both `up` and `pull-and-up` paths so stacks that rely on Redis-stored secrets survive an upgrade. `StackControlOperation` type, tRPC zod enum, and the UI `controlStack` hook signature were all widened to match.
- **QW-03 (UI):** The stack row in `server-control/index.tsx` now has a "Redeploy (pull latest images)" ActionButton (IconCloudDownload) between Restart and Edit. Clicking it opens a `RedeployStackDialog` that explains "This will pull the latest version of every image in this stack and recreate containers on the new digest. Existing volumes are preserved." Confirm triggers `controlStack(name, 'pull-and-up')` — the existing `actionResult` toast from `useStacks` surfaces success or error.
- **QW-04 (DockerManager):** Five new methods on `nexus/packages/core/src/docker-manager.ts`:
  - `deployStack({name, composeYaml, envVars?})` — validates name, writes compose file under `/opt/livos/data/stacks/<name>/` (the SAME dir livinityd uses, so AI-created stacks appear in the UI immediately), optional `.env` from envVars map, `docker compose up -d`.
  - `controlStack(name, operation)` — full 6-operation surface including `pull-and-up`.
  - `removeStack(name, removeVolumes?)` — refuses names starting with `PROTECTED_STACK_PREFIXES` (`livos`, `nexus-infrastructure`, `caddy`), then `docker compose down [--volumes]` and removes the directory.
  - `pullImage(image)` — thin dockerode `pull` + `followProgress` wrapper.
  - `createContainer({image, name, ports?, env?, pullImage?, autoStart?})` — minimal image/name/ports/env via dockerode; optional pre-pull + auto-start.
- **QW-04 (AI tool):** `docker_manage` tool registration in `daemon.ts` extended:
  - `operation` enum expanded from 5 to 10 ops; description rewritten.
  - New parameters: `composeYaml`, `envVars` (key:value map), `stackOperation`, `removeVolumes`, `image`, `ports`.
  - Existing `start/stop/restart/inspect/logs` cases untouched; 5 new switch branches added, each with input validation and delegation to the corresponding DockerManager method.
  - `name` stays required for all ops (container / stack / image depending on context).

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend controlStack + tRPC route + stack UI hook with 'pull-and-up'** — `915fc0fe` (feat)
2. **Task 2: Stack UI — Redeploy (pull latest) button with confirmation dialog** — `2938cb98` (feat)
3. **Task 3: Extend Nexus DockerManager with stack + image + container ops** — `ffdaf61e` (feat)
4. **Task 4: Extend docker_manage tool schema + execute branches** — `1455d373` (feat)

## Files Created/Modified

### Created
- `.planning/phases/17-docker-quick-wins/17-02-SUMMARY.md` — this file

### Modified
- `livos/packages/livinityd/source/modules/docker/types.ts` — `StackControlOperation` widened to include `'pull-and-up'`
- `livos/packages/livinityd/source/modules/docker/stacks.ts` — `controlStack` adds dedicated `pull-and-up` branch (pull then up -d); secret env overrides re-used for both `up` and `pull-and-up`
- `livos/packages/livinityd/source/modules/docker/routes.ts` — controlStack zod enum extended
- `livos/packages/ui/src/hooks/use-stacks.ts` — `controlStack` type signature widened
- `livos/packages/ui/src/routes/server-control/index.tsx` — `IconCloudDownload` import, `RedeployStackDialog` component, `redeployTarget` state, ActionButton + dialog render
- `nexus/packages/core/src/docker-manager.ts` — new imports (child_process, fs/promises), `STACKS_DIR` + `PROTECTED_STACK_PREFIXES` class constants, 5 new methods (deployStack, controlStack, removeStack, pullImage, createContainer); renamed inner `exec` local to `execInstance` in the existing `exec()` method to prevent shadowing the module-scoped promisified `exec`
- `nexus/packages/core/src/daemon.ts` — `docker_manage` tool: description rewritten, parameters expanded from 3 to 9, 5 new switch-cases appended

## Decisions Made

- **AI tool stays off livinityd tRPC** — the existing `docker_manage` ops (`start/stop/restart/inspect/logs`) all use dockerode directly on the local socket. Extending with `stack-*` via HTTP would have required new JWT plumbing for AI tool calls (no current pattern). Instead, `deployStack/controlStack/removeStack` shell out to `docker compose` via `child_process.exec` — same host, same socket, same effect, zero new transport code. Compose files live in `/opt/livos/data/stacks/<name>/` so livinityd's `listStacks` picks them up immediately.
- **PROTECTED_STACK_PREFIXES on DockerManager** — livinityd's `isProtectedContainer` check protects individual containers but isn't reachable cross-process without an HTTP hop. Mirrored the pattern at the stack level with a small allow-list (`livos`, `nexus-infrastructure`, `caddy`) to prevent AI-initiated removal of the platform's own stacks. Not a perfect mirror but sufficient defense-in-depth.
- **No new `violet` color for ActionButton** — the plan explicitly permitted falling back to `blue` if the existing color set didn't cover a new hue. Introducing a new variant would have touched shared styling in an otherwise scoped plan. The button title ("Redeploy (pull latest images)") carries the semantic distinction.
- **`pull-and-up` re-injects secret overrides** — without this a stack upgrade (secret-bearing stack → `pull-and-up`) would recreate containers without their encrypted env vars, silently breaking the upgrade. Gated via a single `needsSecrets` boolean to keep the hot path (`stop/start/restart/down`) free of Redis reads.
- **Renamed `exec` local → `execInstance`** — the existing method used `const exec = await container.exec(...)` which shadows the newly-added module-scoped `promisify(cpExec)`. Rename is zero-behavior-change and keeps the new methods from accidentally invoking the dockerode `Exec` factory inside a shell.

## Deviations from Plan

None — plan executed exactly as written.

Every `<done>` criterion was met:
- Task 1: controlStack in stacks.ts branches on 'pull-and-up', type + zod enum + UI hook all widened, `pnpm --filter livinityd typecheck` clean for docker/ module (pre-existing errors elsewhere are out-of-scope per 17-01 precedent).
- Task 2: Redeploy ActionButton present, RedeployStackDialog renders on click, confirm calls `controlStack(name, 'pull-and-up')`, `pnpm --filter ui build` passed in 31s.
- Task 3: DockerManager has all 5 new methods, PROTECTED_STACK_PREFIXES guard active, `npm run build --workspace=packages/core` clean.
- Task 4: docker_manage tool lists 10 operations (5 legacy + 5 new), parameters cover composeYaml/stackOperation/removeVolumes/image/ports/envVars, src and dist both contain 16 instances of the new operation strings (threshold was ≥5).

One minor intentional variance: the plan showed a 3-parameter description on the `operation` field (`description: 'Operation to perform'`); I kept it but reformatted the parameter block over multiple lines to handle the longer enum. No behavioral change — the `description` text remains.

**Total deviations:** 0
**Impact on plan:** None — full scope delivered, all 7 must-have truths satisfiable.

## Issues Encountered

**Pre-existing `pnpm --filter livinityd typecheck` errors** in `user/routes.ts`, `widgets/routes.ts`, `user/user.ts`, `utilities/file-store.ts` — identical set to 17-01-SUMMARY "Issues Encountered". Per scope boundary, these were NOT fixed (unrelated to docker module edits). Filtered typecheck of just `docker/*.ts` returned zero errors.

**Pre-existing `pnpm --filter ui typecheck` errors** — same IconProps/ForwardRefExoticComponent ActionButton prop mismatches and Button variant `'outline'` not-in-union errors that existed before this plan. The `pnpm --filter ui build` (which is what Vite actually runs and what gets deployed) succeeded in 31s. Not a regression.

## Known Stubs

None. Every new surface is wired end-to-end:
- Redeploy button → RedeployStackDialog → controlStack('pull-and-up') → stacks.ts → docker compose pull + up -d — fully operational once deployed.
- AI docker_manage stack-deploy/stack-control/stack-remove/image-pull/container-create → DockerManager → dockerode/docker compose — fully operational.

One **intentional follow-up** (not a stub, documented in plan output):
- AI `stack-deploy` does NOT forward an `envVars[].secret` flag. Rationale: the secret store is a livinityd concern (reads JWT secret file, writes to Redis under a livinityd key). Exposing it cross-process would need the same HTTP-to-livinityd hop the plan explicitly avoided. Deferred to v28 (ADV): either route AI stack-deploy through the livinityd tRPC with an internal JWT, or give DockerManager its own read path on the same Redis key.

## User Setup Required

**Restart required on server4 after deployment** (per CLAUDE.md — nexus-core runs compiled `dist/`):

```bash
ssh server4 "cd /opt/livos && git pull && \
  source /root/.profile && \
  cd /opt/livos/livos && pnpm --filter @livos/config build && pnpm --filter ui build && \
  pm2 restart livos && \
  cd /opt/nexus/app && npm run build --workspace=packages/core && pm2 restart nexus-core"
```

No secrets, env-var, or config changes required. `PROTECTED_STACK_PREFIXES` is a static class constant.

## Next Phase Readiness

- **QW-03 + QW-04 satisfied** — both requirements close out Phase 17 (QW-01, QW-02 closed by 17-01; QW-03, QW-04 closed here). Phase 17 is complete.
- **PROTECTED_STACK_PREFIXES pattern** becomes the reference for Phase 22 (scheduler/gitops) if those phases add AI tool surfaces that can remove platform resources.
- **Local-socket + child_process.exec pattern** is now established for any future AI tool that needs to call compose primitives without an HTTP roundtrip.
- **Stack UI is feature-complete for v27.0** — Deploy, Edit, Start/Stop/Restart, Redeploy-with-pull, Remove all available from the same row.

## Self-Check: PASSED

Created file present on disk:
- `.planning/phases/17-docker-quick-wins/17-02-SUMMARY.md` — FOUND

All 4 task commits present in `git log --oneline --all`:
- `915fc0fe` — Task 1 (controlStack pull-and-up)
- `2938cb98` — Task 2 (Redeploy UI button + dialog)
- `ffdaf61e` — Task 3 (DockerManager extensions)
- `1455d373` — Task 4 (docker_manage tool extensions)

Grep verifications ran clean:
- `pull-and-up` in stacks.ts, types.ts, routes.ts, use-stacks.ts, server-control/index.tsx, docker-manager.ts
- `RedeployStackDialog`, `IconCloudDownload`, `redeployTarget` in server-control/index.tsx
- `async deployStack|async controlStack|async removeStack|async pullImage|async createContainer` + `PROTECTED_STACK_PREFIXES` in docker-manager.ts
- 16 occurrences each in src/daemon.ts and dist/daemon.js of the 5 new operation strings

---
*Phase: 17-docker-quick-wins*
*Completed: 2026-04-24*
