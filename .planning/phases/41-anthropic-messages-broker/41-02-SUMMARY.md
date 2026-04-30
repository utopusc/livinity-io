---
phase: 41-anthropic-messages-broker
plan: 41-02
status: complete-locally
completed: 2026-04-30
type: skeleton
---

# Plan 41-02 Summary — Broker Module Skeleton + IP Guard + Translator

## Files Created (5 new)

- `livos/packages/livinityd/source/modules/livinity-broker/types.ts` — Anthropic Messages wire types
- `livos/packages/livinityd/source/modules/livinity-broker/auth.ts` — `containerSourceIpGuard` + `resolveAndAuthorizeUserId`
- `livos/packages/livinityd/source/modules/livinity-broker/translate-request.ts` — pure-function `translateAnthropicMessagesToSdkArgs`
- `livos/packages/livinityd/source/modules/livinity-broker/router.ts` — Express router with full middleware chain (IP guard → JSON parse → user auth → body validation → translation → stub handler)
- `livos/packages/livinityd/source/modules/livinity-broker/index.ts` — module entrypoint exporting `mountBrokerRoutes`

## Files Modified (1 edit)

- `livos/packages/livinityd/source/modules/server/index.ts`:
  - Added static import at line 45: `import {mountBrokerRoutes} from '../livinity-broker/index.js'`
  - Added mount call at line 1215 (between `/api/files` mount at 1209 and `/logs/` route at 1218):
    ```typescript
    mountBrokerRoutes(this.app, this.livinityd)
    ```

## Sacred File Verification

- Pre-commit hash: `623a65b9a50a89887d36f770dcd015b691793a7f`
- Post-commit hash: `623a65b9a50a89887d36f770dcd015b691793a7f` (unchanged — broker module never touches sacred file)
- `git diff nexus/packages/core/src/sdk-agent-runner.ts` → empty

## Test Results

- `cd nexus/packages/core && npm run test:phase40` → 9/9 PASS (4 home-override + 5 chained Phase 39)
- `npx tsx --eval "import('./source/modules/livinity-broker/index.js')..."` → loads cleanly
- `translateAnthropicMessagesToSdkArgs({model:'x', messages:[{role:'user', content:'hi'}]})` → `{task:'hi'}` (correct)

## Stub Route Smoke Test

After `pnpm --filter @livos/livinityd dev`, a developer can run:

```bash
curl -X POST http://127.0.0.1:8080/u/<some-user-id>/v1/messages \
  -H 'content-type: application/json' \
  -d '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"hi"}]}'
```

Expected (Plan 41-02 stub):
- `200 OK` with JSON body `{stub: true, phase: '41-02', userId: '<some-user-id>', stream: false, translated: {task: 'hi'}, notice: 'Plan 41-03 will replace this stub...'}`
- `404` if userId is not in users table
- `400` if body is malformed (`messages: []`, missing `model`, etc.)
- `403` in single-user mode if userId is not the admin's id
- `401` if request source IP is not on the allowlist

## Deviations from Plan

### [Rule 1 — Bug] Plan example used non-existent `livinityd.users.*` API
- **Found during:** Plan 41-02 Task 1 implementation.
- **Issue:** Plan 41-02's example code in `auth.ts` referenced `livinityd.users.getById(...)` and `livinityd.users.getAdmin(...)` — neither method exists. The plan even noted this as a verification step.
- **Fix:** Used `findUserById` and `getAdminUser` module-level functions imported from `'../database/index.js'` (per Plan 41-01 audit Section 4 correction).
- **Files modified:** `livos/packages/livinityd/source/modules/livinity-broker/auth.ts`.
- **Commit:** rolled into the Plan 41-02 atomic commit.

### [Rule 3 — Blocking] Type assertion strictness
- **Found during:** Initial typecheck of `translate-request.ts`.
- **Issue:** Naive `req.system.filter((b) => b.type === 'text')` lost type information; `b.text` access flagged as possibly undefined.
- **Fix:** Used user-defined type guards (`(b): b is AnthropicContentBlock => ...`) for filter — preserves narrowing through to `.map((b) => b.text)`.
- **Files modified:** `translate-request.ts`.
- **Commit:** rolled into the Plan 41-02 atomic commit.

## Pointer

Next plan: `41-03-PLAN.md` (SSE adapter + sync response builder + agent-runner-factory wiring).
