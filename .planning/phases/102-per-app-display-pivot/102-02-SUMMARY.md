---
phase: 102
plan: 02
title: ChromeProcessSpawner — per-app Chrome subprocess + --app=URL + --start-fullscreen
subsystem: livinityd/webapps
wave: 1
tags: [chrome, webapps, spawner, per-app-display, T-102-02]
requires:
  - D-102-PER-APP-CHROME
  - D-102-SACRED
provides:
  - spawnChromeProcess(opts) → Promise<ChromeProcessHandle>
  - ChromeProcessSpawnError (typed)
  - ChromeProcessHandle.stop() (SIGTERM → 2s grace → SIGKILL)
affects:
  - livos/packages/livinityd/source/modules/webapps/chrome-process-spawner.ts (NEW)
  - livos/packages/livinityd/source/modules/webapps/chrome-process-spawner.test.ts (NEW)
  - livos/packages/livinityd/source/modules/webapps/index.ts (barrel extended)
  - .planning/phases/102-per-app-display-pivot/102-VALIDATION.md (102-02 rows ✅ green)
tech-stack:
  added: []
  patterns:
    - factory-injection spawnFn (test FakeChild) — mirrors vnc-bridge.ts + native-app-spawner.ts
    - detached:true + stdio:[ignore,ignore,pipe] + child.unref()
    - stderr-tail bounded 50 lines, dump on non-zero exit
    - SIGTERM → grace → SIGKILL stop lifecycle (T-102-02c)
    - gate validation BEFORE spawn (T-102-02 — URL/userDataDir/display)
key-files:
  created:
    - livos/packages/livinityd/source/modules/webapps/chrome-process-spawner.ts
    - livos/packages/livinityd/source/modules/webapps/chrome-process-spawner.test.ts
  modified:
    - livos/packages/livinityd/source/modules/webapps/index.ts
    - .planning/phases/102-per-app-display-pivot/102-VALIDATION.md
decisions:
  - T-102-02 mitigated at the gate (validateInputs() before spawn())
  - URL allowlist limited to http:/https:/file: protocols (no javascript:, data:, etc.)
  - userDataDir regex pins UUID v4 grammar exactly (no looser /tmp/livos-chrome-app-* glob)
  - display regex :1..:99 (not :0 — physical screen reserved for Master Login 102-07)
  - --no-sandbox required because Chrome runs under sudo -u bruce without CAP_SYS_ADMIN; per-app --user-data-dir + Xvfb isolation IS our sandbox
metrics:
  duration: ~25min
  completed_date: 2026-05-11
  test_count: 11
  test_pass: 11
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
---

# Phase 102 Plan 02: ChromeProcessSpawner Summary

Per-app google-chrome subprocess spawner that scopes Chrome to its own `--user-data-dir` (singleton-lock isolation) and Xvfb display (`DISPLAY=:N`), with `--start-fullscreen --app=<URL>` for chromeless full-display rendering — the SelfClaude pattern verified working by the user 2026-05-11.

## What Was Built

| Artifact | Surface |
|----------|---------|
| `spawnChromeProcess(opts) → ChromeProcessHandle` | Async entry point. Validates inputs (T-102-02), spawns chrome via injected `spawnFn`, attaches stderr-tail, returns handle with `pid`, `child`, `display`, `userDataDir`, `stop()`. |
| `ChromeProcessSpawnError` | Typed error with stable `code` field (`CHROME_INVALID_URL`, `CHROME_INVALID_USERDATADIR`, `CHROME_INVALID_DISPLAY`, `CHROME_SPAWN_FAILED`). |
| `handle.stop()` | SIGTERM → 2 s grace → SIGKILL teardown for 102-08 close lifecycle. |
| `STATIC_ARGS` (internal const) | Canonical Chrome flags: `--no-first-run`, `--no-default-browser-check`, `--no-sandbox`, `--start-fullscreen`, `--disable-features=ChromeWhatsNewUI,TranslateUI,InfoBars`, `--disable-infobars`, `--test-type`. |
| Barrel export in `webapps/index.ts` | `spawnChromeProcess`, `ChromeProcessSpawnError`, `ChromeSpawnOpts`, `ChromeProcessHandle`, `ChromeSpawnFn`, `ChromeProcessSpawnerLogger`. |

### Canonical Spawn Argv

```
sudo -n -u bruce DISPLAY=:N google-chrome \
    --user-data-dir=/tmp/livos-chrome-app-<uuid v4> \
    --no-first-run --no-default-browser-check --no-sandbox \
    --start-fullscreen \
    --disable-features=ChromeWhatsNewUI,TranslateUI,InfoBars \
    --disable-infobars --test-type \
    --app=<URL>
```

`DISPLAY=:N` appears BOTH as a sudo argv env-mutation token (so the chrome process inherits it) AND in the `spawn()` `SpawnOptions.env` (so any pre-sudo lookups also see it). `detached: true`, `stdio: ['ignore', 'ignore', 'pipe']`, `child.unref()` so livinityd's event loop is not held open by chrome.

## T-102-02 Mitigation (Chrome Arg Injection)

| Input | Validation | On reject |
|-------|------------|-----------|
| `url` | `new URL(opts.url)` + protocol allowlist `[http:, https:, file:]` | Throws `ChromeProcessSpawnError('CHROME_INVALID_URL', ...)` BEFORE `spawn()` |
| `userDataDir` | Regex `/^\/tmp\/livos-chrome-app-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/` (UUID v4 grammar pinned) | Throws `ChromeProcessSpawnError('CHROME_INVALID_USERDATADIR', ...)` BEFORE `spawn()` |
| `display` | Regex `/^:[1-9][0-9]?$/` (`:1`..`:99`) | Throws `ChromeProcessSpawnError('CHROME_INVALID_DISPLAY', ...)` BEFORE `spawn()` |

Test 2-7 each prove `spawnFn` is never invoked when validation fails — verified via `expect(spawnFn).not.toHaveBeenCalled()`.

## Tests

`livos/packages/livinityd/source/modules/webapps/chrome-process-spawner.test.ts` — 11 cases:

1. Happy path — sudo + DISPLAY env + canonical argv assembled correctly
2. T-102-02 invalid URL (`not-a-url`) → `CHROME_INVALID_URL`, no spawn
3. T-102-02 javascript: protocol → `CHROME_INVALID_URL`, no spawn
4. T-102-02 path traversal `/tmp/../etc/passwd` → `CHROME_INVALID_USERDATADIR`, no spawn
5. T-102-02 non-UUID suffix → `CHROME_INVALID_USERDATADIR`, no spawn
6. T-102-02 shell-meta in display `:0; evil` → `CHROME_INVALID_DISPLAY`, no spawn
7. Display range — `:99` accepted, `:100` rejected
8. Stderr tail accumulates lines; `logger.error` fires with tail on exit code !=0
9. `handle.stop()` — SIGTERM immediate, SIGKILL after 2000ms grace (fake timers)
10. STATIC_ARGS contains canonical flags (`--start-fullscreen`, `--no-first-run`, etc.)
11. Custom `chromeBinary` overrides the default `google-chrome`

```
Test Files  1 passed (1)
Tests       11 passed (11)
Duration    ~12ms
```

## Sacred SHA

- **Pre-plan:** `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- **Post-plan:** `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- **Status:** UNTOUCHED across all 4 commits (this plan does not touch `liv/` tree at all)

## Commits

| Hash | Type | Message |
|------|------|---------|
| `b06263ca` | test | `test(102-02-01): RED — ChromeProcessSpawner stubs with T-102-02 validation cases` |
| `b2d88b91` | feat | `feat(102-02-02): GREEN — ChromeProcessSpawner with T-102-02 input validation + stderr tail` |
| `428a9810` | feat | `feat(102-02-03): barrel export spawnChromeProcess + ChromeProcessHandle in webapps/index.ts` |
| `787e64b8` | chore | `chore(102-02-04): sacred SHA verified + VALIDATION.md 102-02 rows green` |

## Deviations from Plan

None — plan executed exactly as written.

The plan's `acceptance_criteria` for Task 3 mentioned `pnpm --filter @livos/livinityd build`. The actual livinityd package has no `build` script (it runs via tsx directly — confirmed by reading `package.json`); the equivalent verification is `pnpm typecheck` + `pnpm test:run`. Typecheck for the new files passes cleanly; pre-existing typecheck errors in `trpc-router.ts`, `widgets/routes.ts`, etc. were on master baseline and are out of scope per the executor scope-boundary rule.

## Deferred / Carried Forward

- **Caller wiring** — `spawnChromeProcess()` is consumable but no production call site yet. Wave 2 plan 102-04 (`window-manager.ts` rewrite) will replace the current CDP-driven spawn body with `displayAllocator.allocate() → xvfbSpawner.start() → profileSeeder.seed() → spawnChromeProcess() → streamManager.startStream({target:{display}})`.
- **Close lifecycle** — `handle.stop()` is implemented but no caller invokes it yet. Wave 3 plan 102-08 wires the close path so `WebAppWindowManager.close()` calls `chromeHandle.stop()` alongside x11vnc + Xvfb teardown.
- **`stop()` double-call replay** — current implementation uses `child.once('exit')`. A second `stop()` call AFTER the child already exited would hang on the listener (EventEmitter does not replay past events). v1 callers (102-08) call `stop()` exactly once, so this is a v2 concern; flagged inline as a comment in `stopChrome()`.

## Threat Flags

No new threat surface introduced beyond the documented T-102-02 (already in `<threat_model>` of 102-02-PLAN.md). Mitigation in place.

## Self-Check

- `livos/packages/livinityd/source/modules/webapps/chrome-process-spawner.ts` → FOUND
- `livos/packages/livinityd/source/modules/webapps/chrome-process-spawner.test.ts` → FOUND (11 tests, all pass)
- `livos/packages/livinityd/source/modules/webapps/index.ts` → barrel exports spawnChromeProcess
- Commit `b06263ca` → FOUND (RED)
- Commit `b2d88b91` → FOUND (GREEN)
- Commit `428a9810` → FOUND (barrel)
- Commit `787e64b8` → FOUND (sacred verify)
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` → VERIFIED unchanged
- `pnpm --filter livinityd test:run webapps/chrome-process-spawner.test.ts` → 11/11 pass

## Self-Check: PASSED
