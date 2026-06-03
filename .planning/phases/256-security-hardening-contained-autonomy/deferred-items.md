# Phase 256 — Deferred Items (out-of-scope discoveries)

## From 256-02 (WS-B)

- **Pre-existing tsc errors in `apps.ts` + `builtin-apps.ts`** (NOT introduced by 256-02):
  - `apps.ts(178)`: `execa $` template arg typed `string | Buffer` (rsync/chown invocation) — pre-exists at HEAD 232c19b4.
  - `apps.ts(218)`: same `string | Buffer` template-expression issue.
  - `builtin-apps.ts(1433)`: `working_dir` not in `ComposeServiceDef` type.
  - Verified present BEFORE the 256-02 Task 3 edits via `git stash` + tsc. The
    new WS-B files (cred-egress-proxy.ts, inject-local-ai-clis.ts, metered-key.ts)
    all type-check clean. These belong to an unrelated typing pass, left untouched.
