---
phase: 204-provider-key-management
status: planned
created: 2026-05-24
owner: livinity-user
goal: Ship a /settings → Providers tab so the operator can paste LLM API keys (xai, anthropic, openai, groq, mistral, ollama) into the running Mini PC without SSH — and have the liv-claw-gateway pick them up automatically via env-file write + systemctl restart.
---

# Phase 204 — Provider Key Management UI

## Why this phase

Phase 203 § G.1 (operator action item) and § K (deferred #2) called out the only remaining
hand-edit surface in the openclaw chat stack: the operator must SSH the Mini PC and paste
an LLM provider key into `/etc/default/liv-claw-gateway` before chat works. Phase 204
closes that loop with a tiny UI surface + matching tRPC backend.

This is a small, focused phase — 2 plans, ~3-4h, sequential execution.

## Phase Boundary

**IN SCOPE**

- New tRPC namespace `provider.config.*` (list / set / delete) backed by Redis hash `liv:provider:keys`.
  Mounted under `adminProcedure`; routes added to `httpOnlyPaths` in `common.ts`.
- Redact-on-read: `list` NEVER returns the raw key. Returns `{provider, hasKey, preview, addedAt}` where
  `preview` is the last 4 chars prefixed with `<provider>-***` (e.g. `xai-***wxyz`).
- Env-file writer: on `set` or `delete`, regenerate `/etc/default/liv-claw-gateway` from the Redis hash
  with shape `XAI_API_KEY=...\nANTHROPIC_API_KEY=...\n...`. chmod 0600. On EACCES fall back to
  `/opt/livos/etc/liv-claw-gateway.env` (livinityd-owned dir) — Plan 204-02 deploy step adds the
  matching `EnvironmentFile=` line to the systemd unit if the fallback path is taken.
- Restart hook: after env-file write, try `sudo /bin/systemctl restart liv-claw-gateway`. If sudoers
  doesn't allow it without password, surface a "Restart required" banner in the UI (Rule-4 graceful
  fallback). Plan 204-02 ships `/etc/sudoers.d/livos-claw-gateway` granting bruce NOPASSWD on the
  systemctl restart + status of that one unit.
- Frontend: new `ProvidersTab.tsx` in `livos/packages/liv-ai-app/components/settings/`. Lists
  configured providers with redacted previews + a dropdown-driven Add form. Save triggers a
  toast + 30s health-poll on `/liv-ai-app/openclawos/health` (via Caddy split).
- `/settings/page.tsx` gains a 4th `<TabsTrigger value="providers">Providers</TabsTrigger>`.
- Mini PC deploy via `bash /opt/livos/update.sh` patched with: (a) sudoers drop-in install,
  (b) etc/liv-claw-gateway.env mkdir+chown bruce:bruce 0700 (fallback dir).
- Smoke test: open `/liv-ai-app/settings` → Providers → paste a fake key → verify env file
  on disk has the new line + journal shows gateway restart.

**OUT OF SCOPE (defer)**

- Per-user provider keys (single-admin in v204; same as Phase 202/203).
- Key validation by hitting the provider's `/v1/models` endpoint (post-paste UI affordance — v210+).
- Rotation reminders / expiry tracking (admin discipline only in v204).
- Encryption at rest (Mini PC = single-tenant; HD-encryption is operator's responsibility — D-204-02).
- A general "secrets manager" surface — this phase ships ONLY LLM provider keys for liv-claw-gateway.
- Hot-reload of the gateway without a restart (gateway resolves env at process boot; restart is the gate).

## Locked Decisions (D-204-XX)

| ID | Decision | Value |
|----|----------|-------|
| D-204-01 | Redis storage | Hash `liv:provider:keys`. Field = provider name (lowercase). Value = JSON `{key: string, addedAt: ISO-8601 string}`. No key history / versioning — overwrites are atomic HSET. |
| D-204-02 | Plaintext storage | Same trust model as `/opt/livos/.env`. Mini PC is single-tenant; HD-encryption is the operator's responsibility. The UI surfaces a one-line "Stored in plaintext on this server" notice under the Add form so the operator is never surprised. |
| D-204-03 | Supported providers | Locked enum `xai \| anthropic \| openai \| groq \| mistral \| ollama` (6 providers; matches the openclaw spike output). All other names are zod-rejected. Adding a 7th = source-edit in 204-01-PLAN scope. |
| D-204-04 | Restart strategy | On every set/delete: write env file → exec `sudo /bin/systemctl restart liv-claw-gateway` → poll `/liv-ai-app/openclawos/health` for up-to-30s (1s interval). Restart-failure does NOT roll back the Redis write — surface a "Restart required" banner instead. |
| D-204-05 | Env file path | Primary: `/etc/default/liv-claw-gateway` (already the unit's `EnvironmentFile=-` target per scripts/install/systemd/liv-claw-gateway.service). Fallback on EACCES: `/opt/livos/etc/liv-claw-gateway.env` — Plan 204-02 deploy step patches the unit with a second `EnvironmentFile=-` line for the fallback path so the gateway picks up whichever path the writer chose. |
| D-204-06 | UI surface | 4th tab in the existing Phase 202-07 `/settings` page. Sibling to Account / MCP / Models. NEVER a separate `/providers` route. |
| D-204-07 | Sacred SHA | INV-204-01 — `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on every commit via the husky pre-commit hook. Carries forward from INV-203-01. |
| D-204-08 | English UI only | INV-204-02 — same as Phase 203 INV-203-05. |
| D-204-09 | Sudoers shape | `/etc/sudoers.d/livos-claw-gateway` (mode 0440, root-owned) granting `bruce ALL=(root) NOPASSWD: /bin/systemctl restart liv-claw-gateway, /bin/systemctl status liv-claw-gateway`. ONLY those two commands. Validated with `visudo -c -f /etc/sudoers.d/livos-claw-gateway` before commit. |
| D-204-10 | Mini PC ONLY | INV-204-03 — Server4 + Server5 off-limits (same as INV-203-06). |
| D-204-11 | Never log raw keys | Server-side: `logger.info` lines mention provider name + `***` only. Client-side: input field type=password; no `console.log` on key value; tRPC inputs schemas zod-redact in error messages. |
| D-204-12 | Preview format | `<provider>-***<last4>` (e.g. `xai-***wxyz`). For `ollama` (typically no key needed), accept any non-empty string ≥ 8 chars and render `ollama-***<last4>` likewise. |

## Invariant Model

| ID | Invariant |
|----|-----------|
| INV-204-01 | Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on every commit |
| INV-204-02 | English UI only (all user-visible strings in ProvidersTab.tsx + tRPC error messages) |
| INV-204-03 | Mini PC only deploy — no patches applied to Server4 or Server5 |
| INV-204-04 | `provider.config.list` NEVER returns the raw key value — only `{provider, hasKey, preview, addedAt}` |
| INV-204-05 | Env file written with chmod 0600 (root-readable only when at `/etc/default/`; bruce-readable only when at `/opt/livos/etc/`) |
| INV-204-06 | No raw key value ever appears in livinityd's journal — pattern `journalctl -u livos --no-pager \| grep -E '(sk-|xai-|gsk_)[A-Za-z0-9]{20,}'` returns 0 lines |
| INV-204-07 | Sudoers drop-in scope is narrow: ONLY `systemctl restart liv-claw-gateway` and `systemctl status liv-claw-gateway` — nothing else |
| INV-204-08 | Caddy + livinityd routing unchanged — no new path mutations beyond `httpOnlyPaths` array additions |

## Threat Model

| ID | Threat | Mitigation |
|----|--------|------------|
| T-204-01 | Operator pastes a key, refreshes, expects to see the value — opens a paste-back attack vector | UI design: NEVER allow re-revealing the key. Show preview only. Operator who needs the value re-copies from their provider dashboard. |
| T-204-02 | Lateral admin reads `liv:provider:keys` from Redis | Mini PC Redis already requires the rotated password (`/opt/livos/.env` REDIS_URL); same trust model as all other liv:* secrets. No additional encryption layer in v204 (D-204-02). |
| T-204-03 | Env file readable by other system users | chmod 0600 + chown root:root (for `/etc/default/`) OR chown bruce:bruce (for `/opt/livos/etc/` fallback). Verified by Plan 204-02 deploy step's `stat -c '%a %U' <path>`. |
| T-204-04 | Restart loop if env file is malformed | Writer validates every value matches `^[A-Za-z0-9_-]{8,500}$` BEFORE write. Reject earlier in the tRPC mutation (zod `.regex(...)`); never touch disk for a value that wouldn't parse. |
| T-204-05 | `sudo systemctl restart` triggers gateway crash → chat stays down | If gateway fails to come back up within 30s health-poll, UI shows "Gateway not healthy — revert to the previous key via SSH" with the exact rollback command. Pre-existing T-203-01 systemd `Restart=on-failure RestartSec=5` still applies. |
| T-204-06 | Key logged accidentally in error stack trace | tRPC error messages use redacted-template strings (`Provider key for '${input.provider}' failed validation` — NEVER `${input.key}`). Server-side logger lines use `[provider-config] set xai (preview=xai-***wxyz)` — never the full value. |
| T-204-07 | Sudoers drop-in left in unsafe permissions on deploy | Plan 204-02 deploy step: `install -m 0440 -o root -g root <file> /etc/sudoers.d/livos-claw-gateway` then `visudo -c -f /etc/sudoers.d/livos-claw-gateway` (exit non-zero on parse failure). |

## Acceptance Envelope — 6 smoke checks (Plan 204-02 deploy)

1. `sudo bash /opt/livos/update.sh` runs clean; sudoers drop-in installed; 7 systemd units still active.
2. Operator opens `https://bruce.livinity.io/liv-ai-app/settings` → Providers tab loads → empty state visible.
3. Operator picks `xai` from dropdown → pastes a fake key `xai-test1234567890abcdef` → clicks Save → toast says "Saved. Restarting gateway…" → within 30s, toast updates to "Gateway healthy".
4. Operator refreshes the Providers tab → row shows `xai` with preview `xai-***cdef` + `Added: <recent timestamp>`. Raw key NEVER rendered.
5. SSH check: `sudo cat /etc/default/liv-claw-gateway` (or fallback path) shows `XAI_API_KEY=xai-test1234567890abcdef` AND `stat -c '%a' <path>` returns `600`.
6. `sudo journalctl -u liv-claw-gateway -n 50 --no-pager | grep -iE 'XAI_API_KEY|provider'` shows the new env was picked up (typically zero lines printing the value, but boot log shows "ready" after restart). Negative check: `sudo journalctl -u livos --since '5 min ago' --no-pager | grep -E 'xai-test1234567890abcdef'` returns 0 lines (INV-204-06).

≥ 5/6 PASS = ship gate.

## Wave Plan

Sequential — only 2 plans, no parallelism needed:

- **Plan 204-01** — Backend: `provider.config.*` tRPC + Redis hash + env-file writer + systemctl restart hook + 3 unit-test files. (~1.5–2h)
- **Plan 204-02** — Frontend: ProvidersTab.tsx + tab registration + sudoers drop-in + update.sh patch + Mini PC deploy + smoke. (~1.5–2h)

Total estimate: **3–4h** of focused execution.

## Skill References

- `senior-backend` — tRPC factory-DI pattern, Redis hash schemas, env-file regeneration, child_process.execFile safety (204-01)
- `senior-frontend` — Next.js client component, native-fetch tRPC batch wrapper, polling pattern (204-02)
- `senior-devops` — sudoers drop-in, systemd EnvironmentFile= precedence, update.sh idempotency (204-02)

## Source Audit

**GOAL coverage:** Ship `/settings → Providers` tab + matching backend → covered by Plan 204-01 (backend) + Plan 204-02 (frontend + deploy).

**REQ coverage:**
- REQ-204-01 (no-SSH key entry) → 204-01 + 204-02 (full surface)
- REQ-204-02 (gateway restart pick-up) → 204-01 (writer + sudo hook) + 204-02 (sudoers drop-in)
- REQ-204-03 (preserve INV-203-01 sacred SHA) → both plans (zero sacred files touched)
- REQ-204-04 (no raw key ever logged or returned) → 204-01 (redact-on-read + redact-on-log)

**RESEARCH coverage:** Direct carry-over from Phase 203 § G.1; no external research artifact needed.

**CONTEXT coverage:** All 12 locked decisions (D-204-01..12) implemented across the 2 plans.

No unplanned items.
