# v41 Milestone UAT Checklist — Operator-Walked

**Generated:** 2026-05-26
**Walked by:** _<operator name + date>_
**Result:** _<PASS / PARTIAL / FAIL>_

This is the canonical checklist for milestone v41 (Admin Panel + Store Hardening + Subdomain Reliability). Walk each section, mark each row, paste evidence (curl output, screenshot path, journalctl excerpt, etc.). Anything FAIL gets a hot-fix commit; anything SKIP gets justified in the notes column.

Before starting:
```bash
git rev-parse HEAD          # record starting SHA
git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts  # sacred SHA check
```

Expected sacred SHA: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.

---

## P209 — openclaw → claude-haiku-4-5 default

| # | Step | Pass criterion | Mark |
|---|---|---|---|
| 209-01 | SSH Mini PC, restart openclaw service | systemd shows active | ☐ |
| 209-02 | Trigger a chat in openclaw UI | response received | ☐ |
| 209-03 | `journalctl -u openclaw \| grep model=` | model line shows `claude-cli/claude-haiku-4-5` | ☐ |
| 209-04 | Measure 5-token TTFT | ≤2s | ☐ |
| 209-05 | Run 10-message conversation | no model swap mid-conversation | ☐ |

Evidence:
```
<paste journalctl excerpt + timing measurements>
```

---

## P210 — Subdomain canonical format + 3 critical relay/install bugs

| # | Step | Pass criterion | Mark |
|---|---|---|---|
| 210-01 | Restart Server5 PM2 `relay` (CARRY-V41-RELAY-DOWN must be cleared first) | pm2 list shows online | ☐ |
| 210-02 | curl https://`bruce-files`.livinity.io | 200/302 (NOT 502) — hyphen-format parses correctly | ☐ |
| 210-03 | Install an app via Mini PC store | livinityd journal: no "ReferenceError: REDIS_PLATFORM_URL" | ☐ |
| 210-04 | Install with `provisioned=null` in SubdomainConfig | livinityd journal: WARN log (not THROW) | ☐ |
| 210-05 | SUB-08/09/10 live | _SKIP if relay still DOWN_ | ☐ |

CARRIES open at start of UAT: `CARRY-V41-RELAY-DOWN`, `CARRY-P210-RECONCILE`, `CARRY-P210-BUG-D`.

---

## P211 — MCP/App install reliability

| # | Step | Pass criterion | Mark |
|---|---|---|---|
| 211-01 | redis-cli TYPE liv:mcp:config | hash | ☐ |
| 211-02 | Set `liv:mcp:config` to a string via SET; restart liv-core | dual-writer guard refuses, logs WARN | ☐ |
| 211-03 | Install an MCP via store | new entry appears in `liv:mcp:config` HKEYS | ☐ |
| 211-04 | Bus subscriber on `liv:mcp:updated` | event fires on install | ☐ |

CARRIES: `CARRY-P211-UNIFY`, `CARRY-P211-DIALOG`, `CARRY-P211-ADMIN-GATE`.

---

## P212 — Admin panel auth + data model (NEW IN THIS RUN)

| # | Step | Pass criterion | Mark |
|---|---|---|---|
| 212-01 | `SELECT is_admin FROM users WHERE username='bruce'` on Supabase | `true` | ☐ |
| 212-02 | curl `https://livinity.io/api/admin/metrics/summary` without cookie | 401 | ☐ |
| 212-03 | curl with non-admin session cookie | 403 | ☐ |
| 212-04 | curl with admin session OR `x-api-key liv_k_*` | 200, valid JSON with 7 counters | ☐ |
| 212-05 | `SELECT * FROM information_schema.tables WHERE table_name IN ('hourly_bandwidth','daily_bandwidth')` | 2 rows | ☐ |
| 212-06 | Trigger smoke: INSERT into bandwidth_usage, check hourly_bandwidth | row appears with same bytes | ☐ |
| 212-07 | ADM-13: tunnel_connections count when Mini PC online | 0 (expected — wiring gap CARRY-P212-TUNNEL-PERSIST) → record as KNOWN-GAP, not FAIL | ☐ |
| 212-08 | `mcp__supabase__get_advisors security` | no NEW WARN from P212 | ☐ |

CARRIES: `CARRY-P212-TUNNEL-PERSIST` (blocked by CARRY-V41-RELAY-DOWN), `CARRY-P212-RLS-POLICIES` (→ P214 follow-up), `CARRY-P212-LEGACY-ADMIN-UNIFY`.

---

## P213 — Admin panel UI (NEW)

| # | Step | Pass criterion | Mark |
|---|---|---|---|
| 213-01 | Open `livinity.io/admin` (logged out) | redirect to `/login?next=/admin` | ☐ |
| 213-02 | Login as `bruce` (admin) | `/admin` dashboard loads, shows 7 KPI cards with real numbers | ☐ |
| 213-03 | Login as `baris` (non-admin) | curl `/api/admin/metrics/summary` → 403; UI: `/admin` browse should also gate | ☐ |
| 213-04 | `/admin/users` page | shows bruce/baris/leo with correct is_admin badge + dates | ☐ |
| 213-05 | `/admin/tunnels` | empty-state mentions HEARTBEAT-AUDIT.md | ☐ |
| 213-06 | `/admin/store` curation | featured/verified toggles work, optimistic + commit | ☐ |
| 213-07 | `/admin/walkthrough` | renders 3 guides | ☐ |
| 213-08 | Resize to 1024×768 | sidebar collapses cleanly | ☐ |
| 213-09 | Resize to 1920×1080 | dashboard wide layout (3 KPI cols, 2-col chart grid) | ☐ |

CARRIES: `CARRY-P213-DESIGN-SYSTEM-POLISH`, `CARRY-P213-RSC-REFACTOR`, `CARRY-P213-USERS-DRILLDOWN`, `CARRY-P213-NON-ADMIN-REDIRECT-CLIENT`.

---

## P214 — Store admin gate + sync

| # | Step | Pass criterion | Mark |
|---|---|---|---|
| 214-01 | Open `livinity.io/store` logged-out | redirect to `/login?next=/store` | ☐ |
| 214-02 | Login as `baris` (non-admin), visit `/store` | client gate redirects to `/dashboard` | ☐ |
| 214-03 | Login as `bruce`, visit `/store` | catalog renders | ☐ |
| 214-04 | `/admin/store` "Sync from GitHub" click | toast: created/updated counts non-negative | ☐ |
| 214-05 | After sync, app count in catalog | greater or equal to pre-sync | ☐ |
| 214-06 | Toggle a featured pill | row updates + persists across page reload | ☐ |

CARRIES: `CARRY-P214-STORE-SEARCH`, `CARRY-P214-DETAIL-REDESIGN`, `CARRY-P214-MARKETING-LANDING`, `CARRY-P214-FULL-SYNC-304`.

---

## P215 — One-click install + walkthrough

| # | Step | Pass criterion | Mark |
|---|---|---|---|
| 215-01 | `SELECT 1 FROM install_commands LIMIT 0` | table exists | ☐ |
| 215-02 | POST `/api/admin/install` with `{app_slug:"adguard-home"}` | 200, returns command id + status=queued | ☐ |
| 215-03 | GET `/api/admin/install/<id>` | 200, status=queued | ☐ |
| 215-04 | curl SSE `/api/admin/install/<id>/stream` | event stream emits initial status | ☐ |
| 215-05 | DELETE the queued command | status flips to cancelled | ☐ |
| 215-06 | `/admin/walkthrough` button click | toast "Queued ..." | ☐ |
| 215-07 | WIRE-05: 3 MCPs install in <60s via Mini PC poller | KNOWN-GAP — CARRY-P215-MINIPC-POLLER blocks | ☐ |

CARRIES: `CARRY-P215-MINIPC-POLLER`, `CARRY-P215-WIRE-04-LIVE`, `CARRY-P215-WIRE-05-LIVE`.

---

## P216 — Cloudflare audit

| # | Step | Pass criterion | Mark |
|---|---|---|---|
| 216-01 | `bash scripts/cf-audit.sh` (with CF_API_TOKEN set) | exits 0, prints summary | ☐ |
| 216-02 | Apex A row in output | matches Vercel (76.76.21.21 or current Vercel doc) | ☐ |
| 216-03 | www CNAME | points at `cname.vercel-dns.com` | ☐ |
| 216-04 | TLS handshake `bruce.livinity.io` | cert chain valid, SAN covers subdomain | ☐ |
| 216-05 | HTTP probe `bruce.livinity.io` | 200/302 (or 503 if Mini PC offline — acceptable) | ☐ |
| 216-06 | Custom hostnames list | shows expected per-user entries | ☐ |
| 216-07 | SPF + DMARC TXT present | yes | ☐ |
| 216-08 | Archive `cf-audit-<date>.json` | exists | ☐ |

CARRIES: `CARRY-P216-LIVE-VERIFICATION` (closed by this walk), `CARRY-P216-TERRAFORM`, `CARRY-P216-REPROVISION-ENDPOINT`, `CARRY-P216-APPS-CNAME-DECISION`.

---

## P217 — UAT + archive

| # | Step | Pass criterion | Mark |
|---|---|---|---|
| 217-01 | Every FAIL above resolved or escalated to a new phase | yes | ☐ |
| 217-02 | All KNOWN-GAPs have a CARRY entry | yes | ☐ |
| 217-03 | Update `.planning/STATE.md` with milestone close | `status: complete` | ☐ |
| 217-04 | Flip ROADMAP v41 to ✅ Shipped | done | ☐ |
| 217-05 | Archive `.planning/milestones/v41/` | done | ☐ |
| 217-06 | Update PROJECT.md v41 footer | done | ☐ |
| 217-07 | Final git push | done | ☐ |

---

## Carry-forward summary (filed during v41 — total ~25)

**Mini PC code work (blocked by relay restart):**
- CARRY-V41-RELAY-DOWN (pre-existing)
- CARRY-P212-TUNNEL-PERSIST
- CARRY-P212-TUNNEL-SESSION-UNIQUE
- CARRY-P215-MINIPC-POLLER

**RLS / DB hardening:**
- CARRY-P212-RLS-POLICIES
- CARRY-P212-LEGACY-ADMIN-UNIFY

**Admin UI polish:**
- CARRY-P213-DESIGN-SYSTEM-POLISH (shadcn + recharts)
- CARRY-P213-RSC-REFACTOR
- CARRY-P213-USERS-DRILLDOWN
- CARRY-P213-NON-ADMIN-REDIRECT-CLIENT
- CARRY-P213-REALTIME

**Store polish:**
- CARRY-P214-STORE-SEARCH
- CARRY-P214-DETAIL-REDESIGN
- CARRY-P214-MARKETING-LANDING
- CARRY-P214-FULL-SYNC-304

**Install bridge:**
- CARRY-P215-WIRE-04-LIVE
- CARRY-P215-WIRE-05-LIVE
- CARRY-P215-RELAY-PATH

**CF / DNS:**
- CARRY-P216-LIVE-VERIFICATION (closed by this walk if PASS)
- CARRY-P216-TERRAFORM
- CARRY-P216-REPROVISION-ENDPOINT
- CARRY-P216-APPS-CNAME-DECISION

**P210 carries:**
- CARRY-P210-RECONCILE
- CARRY-P210-BUG-D

These can populate v42 milestone planning as a single "v41 carry-forward" phase or be distributed across multiple milestones based on operator priority.

---

## Final verdict

After completing the walk, fill in:

**Result:** `PASS` / `PARTIAL` / `FAIL`

**FAILs fixed before close:** _(list commit SHAs)_

**KNOWN-GAPs documented as carries:** _(count — must match the carry-forward summary)_

**Date walked:** _<YYYY-MM-DD>_

**Operator sign-off:** _<name>_

When `Result=PASS` or `Result=PARTIAL` (with all KNOWN-GAPs carried), proceed to milestone archive (P217 §3-7).
