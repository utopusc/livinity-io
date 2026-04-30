---
phase: 41-anthropic-messages-broker
plan: 41-01
status: complete-locally
completed: 2026-04-30
type: audit
---

# Plan 41-01 Summary — Codebase Audit

## Files Created

- `.planning/phases/41-anthropic-messages-broker/41-AUDIT.md` (~370 lines, 7 sections + table of contents)

## Sacred File Verification

- Pre-audit hash: `623a65b9a50a89887d36f770dcd015b691793a7f` (Phase 40 baseline)
- Post-audit hash: `623a65b9a50a89887d36f770dcd015b691793a7f` (untouched — read-only audit)
- `git diff nexus/packages/core/src/sdk-agent-runner.ts` → empty (zero output)

## Sections Filled (7 / 7)

- [x] Section 1 — Express mount inventory (25 mount sites mapped) + recommended broker insertion at line 1209
- [x] Section 2 — `/api/agent/stream` proxy chain with full diagram + line-cited table; documents `userId` forwarding gap to be closed by Plan 41-04
- [x] Section 3 — `SdkAgentRunner` public surface (constructor, `run()` shape, event names, sample event-data shapes per type, sacred-file `safeEnv.HOME` line 266)
- [x] Section 4 — `per-user-claude.ts` reuse contract (full export signatures, path convention, defensive validation regex, **CORRECTION:** users-table API lives in `database/index.ts` as `findUserById` / `getAdminUser` — NOT `livinityd.users.*`)
- [x] Section 5 — Express middleware order at broker mount point (cookieParser → helmet CSP → referrer policy → request logger → app-gateway proxy with explicit fall-through verification for loopback IPs)
- [x] Section 6 — Sacred file SHA snapshot + verification commands for downstream plans
- [x] Section 7 — AI Chat carry-forward design (X-LivOS-User-Id header forwarding strategy, 4 numbered steps), Container source IP guard implementation (CIDR allowlist + 9 test cases), SSE streaming format reference (Anthropic spec citation + required event sequence + wire format), and 4 misc open questions answered (livinityd bind, app identifier, import style, data directory)

## Key Discovery (deviation from plan example code)

Plan 41-02's example code uses `livinityd.users.getById(...)` and `livinityd.users.getAdmin(...)` — **these methods do not exist**. The actual API is module-level functions exported from `livos/packages/livinityd/source/modules/database/index.ts`:

```typescript
import {findUserById, getAdminUser} from '../../database/index.js'

const user = await findUserById(userId)
const admin = await getAdminUser()
```

`auth.ts` in Plan 41-02 will use these exports directly. Documented in Section 4 of AUDIT.md.

## Pointer

Next plan: `41-02-PLAN.md` (broker module skeleton + IP guard + request translator).
