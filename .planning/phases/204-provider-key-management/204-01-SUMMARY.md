---
phase: 204-provider-key-management
plan: 204-01
status: code-complete
created: 2026-05-24
subsystem: livinityd / settings backend
duration: 1h 20m
completed_at: 2026-05-24T01:50:00Z
tags: [trpc, redis, env-file, sudo, provider-keys]
requirements_complete: [REQ-204-01, REQ-204-02, REQ-204-04]
dependency_graph:
  requires: [Phase 202-07 settings infra, Phase 203-03 liv-claw-gateway systemd unit]
  provides: [provider.config.* tRPC namespace, Redis key store, env-file writer, restart hook]
  affects: [/etc/default/liv-claw-gateway via livinityd boot wire-up; liv-claw-gateway.service restart cycle]
tech-stack-added:
  - new top-level tRPC namespace: provider.config.*
  - new Redis hash: liv:provider:keys (field=provider, value=JSON {key, addedAt})
  - new Redis key: liv:provider:env-file-path (sticky path choice)
key-files-created:
  - livos/packages/livinityd/source/modules/provider/key-store.ts (250 LOC)
  - livos/packages/livinityd/source/modules/provider/env-file-writer.ts (290 LOC)
  - livos/packages/livinityd/source/modules/provider/restart-hook.ts (130 LOC)
  - livos/packages/livinityd/source/modules/provider/key-store.test.ts (6 cases)
  - livos/packages/livinityd/source/modules/provider/env-file-writer.test.ts (5 cases)
  - livos/packages/livinityd/source/modules/server/trpc/provider-config-router.ts (240 LOC)
  - livos/packages/livinityd/source/modules/server/trpc/provider-config-router.test.ts (7 cases)
key-files-modified:
  - livos/packages/livinityd/source/modules/server/trpc/common.ts (+3 httpOnlyPaths)
  - livos/packages/livinityd/source/modules/server/trpc/index.ts (factory slot + namespace mount)
  - livos/packages/livinityd/source/index.ts (boot wire-up)
decisions:
  - D-204-01 Redis hash liv:provider:keys with JSON record {key, addedAt}
  - D-204-03 enum locked to 6 providers (xai, anthropic, openai, groq, mistral, ollama)
  - D-204-04 env-file write → sudo systemctl restart → return structured result
  - D-204-05 primary path /etc/default/liv-claw-gateway + EACCES fallback /opt/livos/etc/liv-claw-gateway.env
  - D-204-11 redact-on-log + redact-on-throw — raw key NEVER in journal or error message
metrics:
  vitest_cases_passed: 18
  vitest_cases_planned: 15
  files_created: 7
  files_modified: 3
  ts_errors_introduced: 0
  ts_errors_remaining_provider: 0
  sacred_sha_protected_files_touched: 0
  duration_minutes: 80
---

# Plan 204-01 — Backend: provider.config.* tRPC + Redis + env-file writer + restart hook — SUMMARY

## One-liner

Shipped the server-side surface that backs `/settings → Providers`: a factory-DI tRPC router (`provider.config.list/set/delete`) over a Redis hash, with an env-file writer that regenerates `/etc/default/liv-claw-gateway` (or a fallback path) atomically + a `sudo systemctl restart liv-claw-gateway` hook that degrades gracefully when sudoers isn't configured.

## What was built

### `key-store.ts` (250 LOC)

Redis-backed CRUD over the hash `liv:provider:keys`. Key methods:

- `set(provider, key)` — atomic HSET with `{key, addedAt}` JSON. Audit log line uses `redactKey()` — never the raw value (INV-204-06).
- `get(provider)` — raw record; internal use only.
- `delete(provider)` — idempotent; returns boolean.
- `list()` — **INV-204-04 boundary** — returns only `{provider, preview, addedAt}` rows. Corrupt rows skipped (warn log). Out-of-enum entries skipped (defence-in-depth — e.g. a 7th provider HSET'd manually is ignored).
- `getAllForEnvFile()` — internal use only (env-file writer); returns `{ENV_VAR: rawKey}` map.

Locked enum `PROVIDER_ENUM` = `['xai','anthropic','openai','groq','mistral','ollama']` per D-204-03. Adding a 7th = source edit + matching `PROVIDER_ENV_VAR` entry.

### `env-file-writer.ts` (290 LOC)

Regenerates the env file on every set/delete. Behaviour:

1. Read full map via `keyStore.getAllForEnvFile()`.
2. Build deterministic body via pure `formatEnvFile(map, ts)` — banner comments + sorted `KEY=VALUE` lines + trailing newline.
3. Atomic write (tmp + rename) with chmod 0600 to primary `/etc/default/liv-claw-gateway`.
4. On EACCES/EPERM/ENOENT → fall back to `/opt/livos/etc/liv-claw-gateway.env` (livinityd-owned dir). mkdir -p 0700 first.
5. Sticky path: first successful write cached in Redis `liv:provider:env-file-path`; subsequent syncs prefer that path (avoids re-probing `/etc/default/` every save).
6. Pre-write validation via `KEY_SHAPE_REGEX = /^[A-Za-z0-9_\-.]{8,500}$/` — throws `InvalidKeyFormatError` BEFORE touching disk (T-204-04 defence-in-depth).
7. Filesystem ops injected via `EnvFileWriterFs` interface so tests can simulate EACCES without `chmod`-fighting Windows.

### `restart-hook.ts` (130 LOC)

`sudo /bin/systemctl restart liv-claw-gateway` via `spawn`. Returns `{ok: boolean; reason?: string}`. Hard-timeout (10s default) with SIGTERM. Spawn error / non-zero exit / timeout all map to `{ok: false}`. **Never throws** — restart failure is a graceful-degradation path; the UI shows a "Restart required, SSH and run X" banner if `ok===false`.

### `provider-config-router.ts` (240 LOC)

Three adminProcedure routes (`list`, `set`, `delete`). Factory-DI pattern mirrors mcp-config-router exactly. Empty-injection stub throws `PRECONDITION_FAILED + PROVIDER_CONFIG_UNAVAILABLE`. Validation:

- `provider`: `z.enum(PROVIDER_ENUM)` — unknown providers → BAD_REQUEST.
- `key`: `z.string().min(8).max(500).regex(KEY_SHAPE_REGEX)` — short or malformed → INVALID_KEY_FORMAT.

Flow on `set`:
1. `keyStore.set(provider, key)`
2. `envFileWriter.sync()` → captures chosen path
3. `restartHook()` → if ok=true → `{ok, restartTriggered: true, restartRequired: false}`; if ok=false → `{ok, restartTriggered: false, restartRequired: true, restartReason}`

`delete` mirrors the same flow minus the keyStore.set step.

INV-204-06: error messages use redacted previews only (e.g. `PROVIDER_REDIS_WRITE_FAILED: ... (preview=xai-***1234)`).

### `common.ts` (+3 lines)

```ts
'provider.config.list',
'provider.config.set',
'provider.config.delete',
```

Added at end of httpOnlyPaths array with the standard WS-reconnect-survival comment.

### `trpc/index.ts` (factory slot + namespace mount)

- New import: `createProviderConfigRouter, providerConfigRouter`.
- New `providerConfig?:` slot on `createAppRouter` opts.
- New mount: `provider: router({config: opts.providerConfig ?? providerConfigRouter})`. **NEW top-level `provider` namespace** — INV-204-08 honoured (no mutation to existing namespaces).

### `source/index.ts` (boot wire-up)

Mirrors the mcp-config-router block exactly: construct `ProviderKeyStore` + `EnvFileWriter` + `restartHook`, wrap in `createProviderConfigRouter({...})`, pass as `providerConfig:` to the createAppRouter call. Failure non-fatal (logs error, falls back to stub).

## Tests

18/18 vitest cases PASS (planned 15 — 3 extra "nice-to-have" cases added during implementation):

```
✓ source/modules/provider/key-store.test.ts (6 tests) 6ms
✓ source/modules/provider/env-file-writer.test.ts (5 tests) 11ms
✓ source/modules/server/trpc/provider-config-router.test.ts (7 tests) 10ms

Test Files  3 passed (3)
     Tests  18 passed (18)
```

| File | Cases | Coverage |
|------|-------|----------|
| `key-store.test.ts` | 6 | set+get round-trip, list redaction (INV-204-04), delete idempotency, get-on-empty, overwrite semantics, redactKey format |
| `env-file-writer.test.ts` | 5 | formatEnvFile sort + banner, chmod 0600, EACCES fallback, byte-determinism, InvalidKeyFormatError throw |
| `provider-config-router.test.ts` | 7 | empty-injection stub, list-empty, set call order, zod short-key reject, zod unknown-provider reject, restartRequired=true on hook failure, delete flow |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `node:child_process` typed-import + execFile vs spawn**

- **Found during:** Task 3 implementation (restart-hook.ts).
- **Issue:** `import {execFile} from 'node:child_process'` → returned `ChildProcess` was missing event-emitter methods (`.on('error', ...)` → `TS2339`). Same `node:`-prefixed import pattern is used elsewhere (openclawos/device-token.ts), but with different runtime methods that don't trip the strict-mode lib-resolution edge.
- **Fix:** Switched to `import {spawn} from 'child_process'` (no `node:` prefix — matches the working pattern in `modules/apps/native-installer.ts`). Re-wrote the hook to use `spawn` with stdio + close/error events, plus a hard SIGTERM timeout. Cleaner separation between exec semantics + event subscription anyway.
- **Files modified:** `restart-hook.ts`.
- **Commit:** included in the single backend commit (no separate sub-commit needed).

**2. [Rule 2 - Missing critical functionality] Hard timeout on restart hook**

- **Found during:** restart-hook.ts implementation.
- **Issue:** Plan called for a `timeoutMs` option but `execFile`'s `timeout` flag is unreliable on Windows + slow under sudo password prompts (theoretical — sudoers should be NOPASSWD per Plan 204-02, but defence-in-depth).
- **Fix:** Added an explicit `setTimeout` that fires `child.kill('SIGTERM')` + settles with `{ok: false, reason: 'timeout after Xms'}`. clearTimeout on settle to avoid leaks.
- **Files modified:** `restart-hook.ts`.

**3. [Rule 1 - Bug] Test type narrowing on `mockResolvedValueOnce({ok: false, ...})`**

- **Found during:** vitest type-check.
- **Issue:** Mock typed as `Promise<{ok: true}>` (from the default return); calling `mockResolvedValueOnce({ok: false, ...})` failed type narrowing.
- **Fix:** Cast `as never` to bypass — vitest unions the union types at runtime correctly; this is a type-only widening.
- **Files modified:** `provider-config-router.test.ts`.

### Threat Flags

None — no new network endpoints, auth paths, or schema changes at trust boundaries beyond what `<threat_model>` covered.

## Sacred SHA verification

Pre-commit hook fired on the commit: `[sacred-sha] PASS: 20 files verified`.

**Files in the 20-file registry touched by this plan:** 0.

## Self-Check

- ✅ `livos/packages/livinityd/source/modules/provider/key-store.ts` exists
- ✅ `livos/packages/livinityd/source/modules/provider/env-file-writer.ts` exists
- ✅ `livos/packages/livinityd/source/modules/provider/restart-hook.ts` exists
- ✅ `livos/packages/livinityd/source/modules/server/trpc/provider-config-router.ts` exists
- ✅ 3 vitest test files exist with 18 PASS
- ✅ Commit `0fcf0e2f` exists in git log
- ✅ Sacred SHA hook PASS
- ✅ `npx tsc --noEmit` clean for all new provider/ files

## Self-Check: PASSED

## Handoff to Plan 204-02

Backend is fully wired and type-clean. Plan 204-02 needs to:

1. Build the React `ProvidersTab.tsx` + `use-providers.ts` hook (UI surface).
2. Register the tab in `app/settings/page.tsx`.
3. Ship the sudoers drop-in `/etc/sudoers.d/livos-claw-gateway` so the restart hook actually works (until then, the hook returns `{ok: false, reason: 'sudo unavailable'}` and the UI shows the "Restart required" banner — Rule-4 graceful fallback).
4. Patch `liv-claw-gateway.service` with `EnvironmentFile=-/opt/livos/etc/liv-claw-gateway.env` so the fallback path is picked up when `/etc/default/` isn't writable.
5. Deploy to Mini PC + walk the 6-check smoke battery from CONTEXT.md.
