---
plan: 37-02-trpc-route
phase: 37-backend-factory-reset
status: complete
completed_at: 2026-04-29
requirements_addressed: [FR-BACKEND-01, FR-BACKEND-03]
---

# Plan 37-02 Summary — tRPC Route + httpOnlyPaths + Tests

## What was built

The v29.2 `system.factoryReset({preserveApiKey})` mutation is now live in the route registry, fully Zod-validated, RBAC-gated to `adminProcedure`, and reachable via HTTP only (no WebSocket). The handler is a no-op-on-the-spawn-side by design — it returns a 202-style `{accepted, eventPath, snapshotPath}` immediately after pre-flight + API-key stash, with a `SPAWN_INSERTION_POINT` comment marker where Plan 03 will inject the `systemd-run --scope --collect` cgroup-escape spawn.

### Files

| Path | Change |
|------|--------|
| `livos/packages/livinityd/source/modules/system/factory-reset.ts` | Rewritten by Wave 2 first half (commit `b49595e8`); exports `factoryResetInputSchema`, `performFactoryReset`, `preflightCheck`, `stashApiKey`, `buildEventPath`, plus deprecated legacy `performReset`/`getResetStatus` for one-cycle compat |
| `livos/packages/livinityd/source/modules/system/routes.ts` | Replaced legacy `factoryReset({password})` privateProcedure with new `factoryReset({preserveApiKey})` adminProcedure; updated import; dropped unused `setTimeout` |
| `livos/packages/livinityd/source/modules/system/factory-reset.unit.test.ts` | NEW — 17 tests (Zod validation, preflight rejections, API key stash mode/perms/contents, event path schema) |
| `livos/packages/livinityd/source/modules/server/trpc/common.ts` | Added `'system.factoryReset'` to `httpOnlyPaths` with explanatory comment (mirror `system.update` precedent) |

## Pre-flight gates (locked per CONTEXT.md D-RT-05)

The route runs three checks before stashing the key:

1. **Update-in-progress reject** — scans `/opt/livos/data/update-history/*-update.json` for `status: "in-progress"`; if found, throws `BAD_REQUEST` with `Update already in progress`
2. **Missing API key reject** — reads `/opt/livos/.env` for `LIV_PLATFORM_API_KEY`; absent or empty → `BAD_REQUEST` with `LIV_PLATFORM_API_KEY missing from /opt/livos/.env`
3. **adminProcedure** — handled at the procedure layer (RBAC); non-admin gets `FORBIDDEN`

Network reachability check is intentionally NOT here — that's the UI's job (Phase 38 pre-flight).

## API key stash (FR-BACKEND-03)

`preserveApiKey: true` triggers `stashApiKey()` which:
- Reads `LIV_PLATFORM_API_KEY=...` from `/opt/livos/.env` (handles quoting variants)
- Writes the bare value (no trailing newline) to `/tmp/livos-reset-apikey`
- chmods the file to 0600 BEFORE the rm step (so the wipe never sees it)

`preserveApiKey: false` skips the stash entirely; install.sh on the post-wipe boot will prompt for a fresh key. Phase 38 redirects to /onboarding in this case.

## httpOnlyPaths registration (FR-BACKEND-01 partial)

`'system.factoryReset'` is registered alongside `system.update` and `system.updateStatus` — same architecture for the same reason: long-running mutation that the WebSocket cannot survive (livinityd is killed mid-wipe). UI uses split-link routing to send the call over HTTP.

## Tests (17 passing)

All in `factory-reset.unit.test.ts`:

- `factoryResetInputSchema` — accepts `{preserveApiKey: true}`, accepts `{preserveApiKey: false}`, rejects missing field, rejects non-boolean, rejects extra keys
- `preflightCheck` — accepts when no in-progress update; rejects when `*-update.json` has `status: in-progress`; rejects when API key missing; tolerates malformed JSON in update-history (doesn't crash)
- `stashApiKey` — writes correct value, mode 0600, handles quoted env values, fails clearly when `.env` missing
- `buildEventPath` — returns deterministic ISO timestamp + path under `update-history/`

Tests stub fs/disk operations via `vi.mock('node:fs/promises')` so they're hermetic — no real disk writes.

## Notable design decisions

- **Legacy route REPLACED, not appended** (per CONTEXT.md D-RT-01): The `factoryReset({password})` privateProcedure is gone. The legacy `getFactoryResetStatus` query (line 304 of routes.ts) is retained for one cycle to avoid silently breaking compatibility — the deprecated `performReset`/`getResetStatus` exports in factory-reset.ts back it.
- **No-op spawn intentional**: Plan 02 returns the metadata response without actually triggering the wipe. This means a Mini PC running just Plan 02's binary would have a route that takes the API key, stashes it, returns success — but never wipes. **Do NOT deploy Plan 02 in isolation; Plan 03 must land first.** This is documented in the route's comment block and CONTEXT.md.
- **Pre-existing `ctx.livinityd` typing warning inherited**: The codebase has 40+ `ctx.livinityd is possibly undefined` warnings. The new factoryReset route at line 289 inherits this pattern — no regression. Future cleanup is out of scope for v29.2.

## Wave 2 acceptance criteria status

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Route exists with Zod input + adminProcedure + pre-flight + key stash + spawn marker + return value | ✅ | `factory-reset.ts:214-242`; `routes.ts:264-281` |
| Registered in routes.ts | ✅ | `routes.ts:264 factoryReset: adminProcedure` |
| Registered in httpOnlyPaths | ✅ | `common.ts:'system.factoryReset'` |
| Unit tests cover all required cases | ✅ | 17 tests passing |
| `tsc --noEmit` passes for new files | ✅ | 0 errors in factory-reset.ts and factory-reset.unit.test.ts |
| All unit tests pass | ✅ | 17/17 |
| No live execution of factory-reset.sh | ✅ | Tests are hermetic; route is no-op-spawn |
| Each task committed atomically | ✅ | `b49595e8` (route module) + `60746134` (registration + tests) |
| No Server4 references | ✅ | `grep -r Server4 livos/packages/livinityd/source/modules/system/` returns 0 |

## Wave 2 commits

- `b49595e8` — feat(37-02): rewrite factory-reset.ts as v29.2 module (Zod input + preflight + stash)
- `60746134` — feat(37-02): wire system.factoryReset route + httpOnlyPaths + tests

## Open hand-off to Plan 03 (Wave 3)

- The `// === SPAWN_INSERTION_POINT ===` comment block at `factory-reset.ts:226-233` is where `systemd-run --scope --collect` invocation goes
- Runtime artifact deployment lazy-copy (D-CG-02): the route handler should ensure `/opt/livos/data/factory-reset/reset.sh` and `/opt/livos/data/wrapper/livos-install-wrap.sh` exist BEFORE the spawn — copy from source tree if missing or stale (mtime + executable-bit)
- EUID 0 + systemd-run availability gate per CONTEXT.md D-CG-01

## What did NOT happen here

- No actual wipe performed (intentional per CONTEXT.md D-RT-03 / D-CG-01)
- No update.sh or any production deployment path touched
- No Mini PC SSH'd into
- No edit to install.sh.snapshot (Phase 36 frozen input)
