# v41 Requirements — Admin Panel + Store Hardening + Subdomain Reliability

**Milestone:** v41 (opened 2026-05-26)
**Source:** `.planning/v41-DRAFT.md` (operator-authored 2026-05-26)
**Research:** `.planning/research/2026-05-26-store-admin/{server5-state.md, subdomain-install-bugs.md, install-flow-audit.md}`, `.planning/research/2026-05-26-computer-use-perf/R5-broker-tool-routing.md`
**Operator gating decisions (locked 2026-05-26):**
- Admin seed = `hello@bruceoz.com`
- Static HTML pages (`/dashboard.html`, `/auth.html`, `/login.html`) KEPT — only `/admin/**` new Next.js routes
- Bandwidth time-series in Supabase rollup tables (`hourly_bandwidth`, `daily_bandwidth`)
- Server5 relay state unknown — Phase 210 entry probes it
- CF wildcard cert health audited live in Phase 216

---

## REQ — AI Defaults (Phase 209)

- [ ] **AI-01** — Liv AI chat agent uses `anthropic/claude-haiku-4-5` via local `claude-cli` backend by default (not `openrouter/nvidia/nemotron-nano-9b-v2:free`).
- [ ] **AI-02** — `claude-cli` backend reuses `/root/.claude/.credentials.json` already attached to SdkAgentRunner (zero new auth surface, zero broker, zero API key).
- [ ] **AI-03** — `liv-claw-gateway` journalctl shows `agent model: anthropic/claude-haiku-4-5` after `systemctl restart`.
- [ ] **AI-04** — Liv AI chat coord-click success rate ≥80% (was ~30% with nemotron 9B) on the standard click-test battery.
- [ ] **AI-05** — Per-call latency p50 ≤1.5s (was ~3-5s) on the standard battery.
- [ ] **AI-06** — Zero subscription quota errors during a 30-minute UAT session.

## REQ — Subdomain Reliability (Phase 210)

- [ ] **SUB-01** — Single canonical subdomain format `<app>-<username>.livinity.io` (hyphen-format) is the only form written end-to-end (DNS, Supabase `user_app_subdomains`, Caddy host block, install metadata).
- [ ] **SUB-02** — Relay `parseSubdomain` (`platform/relay/src/subdomain-parser.ts:46-50`) splits hyphen-format on last hyphen: `username=suffix`, `appName=prefix`, forwards to `<username>` tunnel with `X-App-Name: <appName>` header.
- [ ] **SUB-03** — Bug 210.1 has RED→GREEN test coverage: 4 cases (hyphen-format, dot-format, no-app bare username, invalid).
- [ ] **SUB-04** — `provisionAppSubdomain` (`livos/packages/livinityd/source/modules/apps/apps.ts:578-585`) THROWS on any non-409 failure instead of returning `null`. On 409, fetches existing canonical host from Supabase.
- [ ] **SUB-05** — `registerAppSubdomain` never writes a config row without the `host` field; `caddy.ts:279` falls through to canonical Supabase host on any missing-host condition.
- [ ] **SUB-06** — Bug 210.2 has RED→GREEN coverage: simulated Server5-down + simulated 409 collision.
- [ ] **SUB-07** — `REDIS_PLATFORM_URL` constant is declared in `livos/packages/livinityd/source/modules/apps/apps.ts` alongside `REDIS_PLATFORM_API_KEY`.
- [ ] **SUB-08** — `reportInstallEvent` writes a row to Supabase `install_history` within 2s of install completion. Bug 210.3 has RED→GREEN coverage.
- [ ] **SUB-09** — Installing n8n opens at `n8n-bruce.livinity.io` (canonical hyphen format) in <30s, returns the n8n UI (not bruce's root).
- [ ] **SUB-10** — Zero "fall through to offline page" log lines per successful install (was ≥1 per install pre-fix).
- [ ] **SUB-11** — Phase 210 entry runs ONE batched SSH probe to confirm Server5 relay state before patching (resolves D-V41-RELAY-STATE-UNKNOWN).

## REQ — Install Reliability (Phase 211)

- [ ] **INST-01** — `liv:mcp:config` Redis key has a single writer (JSON-string, agent-consumed). The HASH writer in `livinityd mcp-config-router.ts` is deprecated and removed.
- [ ] **INST-02** — Installing an MCP via Settings → MCP UI makes the agent's `tools/list` show the new MCP **without restart** within 5s.
- [ ] **INST-03** — `EnvironmentOverridesDialog` reads `envSchema` from the app manifest and prompts for each `required: true` env var before install proceeds.
- [ ] **INST-04** — Per-user env file is updated atomically before install starts (no half-installed state with missing env).
- [ ] **INST-05** — Installing an MCP that requires an API key surfaces the dialog (not the generic `dependency_missing` toast) and completes successfully after the operator fills it.
- [ ] **INST-06** — One-click MCP install completes in <60s for at least 3 sample MCPs (browser, filesystem, github).

## REQ — Admin Auth + Data (Phase 212)

- [ ] **ADM-01** — Supabase migration adds `is_admin BOOLEAN DEFAULT FALSE` to `public.users`. Backfilled `is_admin=true` for `hello@bruceoz.com`. `created_at` + `last_seen_at` columns ensured present.
- [ ] **ADM-02** — RLS policy: only `is_admin=true` can `SELECT *` on `public.users`, `tunnel_connections`, `install_history`, `bandwidth_usage`. Non-admin gets row-level filter (`WHERE user_id = auth.uid()`).
- [ ] **ADM-03** — Non-admin `SELECT * FROM public.users` returns only the caller's own row (RLS verification test).
- [ ] **ADM-04** — `platform/web/middleware.ts` gates `/admin/**` and `/api/admin/**` with Supabase Auth + `is_admin` check; redirects non-admin to `/dashboard` (static HTML).
- [ ] **ADM-05** — `GET /api/admin/metrics/summary` returns real counts: total users, active tunnels (heartbeat < 5min), apps installed (sum), MCPs installed.
- [ ] **ADM-06** — `GET /api/admin/users` returns paginated user list with `last_seen`, installed apps count, bandwidth this month.
- [ ] **ADM-07** — `GET /api/admin/tunnels` returns live tunnel connection list with heartbeat freshness gate.
- [ ] **ADM-08** — `GET /api/admin/apps` returns install_history feed with status filter (installed/failed/uninstalled).
- [ ] **ADM-09** — `GET /api/admin/bandwidth?range=24h|7d|30d` returns time-series rows from Supabase rollup tables (`hourly_bandwidth` and `daily_bandwidth`).
- [ ] **ADM-10** — `GET /api/admin/install-failures` returns recent install errors with operator-actionable info (stack snippet, env, retry hint).
- [ ] **ADM-11** — All `/api/admin/*` routes return 403 to non-admin and 200 to admin (auth + RBAC verification test).
- [ ] **ADM-12** — Supabase rollup tables (`hourly_bandwidth`, `daily_bandwidth`) created with a writer (cron or trigger) that aggregates `bandwidth_usage` rows. Rollup lag <5min.
- [ ] **ADM-13** — Heartbeat persistence audit: `tunnel_connections` row count >0 when ≥1 Mini PC is online. If broken, fix the relay → Supabase upsert path.

## REQ — Admin Panel UI (Phase 213)

- [ ] **UI-01** — `/admin` landing dashboard renders 6 KPI cards (users, active tunnels, apps installed, MCPs installed, bandwidth today, install failures last 24h) + 2 charts (bandwidth 7d, install timeline) from real Supabase data.
- [ ] **UI-02** — `/admin/users` renders sortable table: email | created | last_seen | apps | mcps | bandwidth | actions (suspend, make admin).
- [ ] **UI-03** — `/admin/users/[id]` renders per-user detail: installed apps, mcps, recent install events, bandwidth chart, tunnel status.
- [ ] **UI-04** — `/admin/tunnels` renders live tunnel status: hostname | user | mini_pc_ip | last_heartbeat | bandwidth, refreshing every 5s.
- [ ] **UI-05** — `/admin/apps` renders install_history feed with filters (status, app slug, user) and a retry-failed button.
- [ ] **UI-06** — `/admin/store` renders the store catalog admin: list all 304 candidate apps, mark featured, mark verified.
- [ ] **UI-07** — `/admin/walkthrough` renders embedded docs (3 guides — see Phase 215).
- [ ] **UI-08** — Non-admin GET `/admin/**` → 302 to `/dashboard` (static HTML).
- [ ] **UI-09** — All 6 pages mobile-responsive (1024×768 baseline + 1920×1080 expanded).
- [ ] **UI-10** — Stack: shadcn/ui + recharts + Supabase server-component fetch. Soft sidebar nav, Linear-style opacity-tier typography.

## REQ — Store Redesign (Phase 214)

- [ ] **STORE-01** — `/store/**` middleware redirects non-admin → `/dashboard` (or shows login modal).
- [ ] **STORE-02** — `POST /api/admin/sync-catalog` Vercel function pulls `utopusc/livinity-apps` repo manifests and upserts into Supabase `public.apps`. Returns count of new/updated apps.
- [ ] **STORE-03** — Admin sees all 304 catalog apps via `/admin/store` after first sync.
- [ ] **STORE-04** — Admin can toggle `featured` and `verified` flags per app via `/admin/store`.
- [ ] **STORE-05** — Store search + filter: category dropdown, search bar, "newly added" sort.
- [ ] **STORE-06** — App detail page renders README, screenshots, install button (admin only), system requirements.

## REQ — Install Wiring + Walkthrough (Phase 215)

- [ ] **WIRE-01** — Store "Install" button → Mini PC bridge → Phase 211 install path (auto-config + reconcile). No SSH, no manual restart.
- [ ] **WIRE-02** — Install progress UI uses Server-Sent Events from the bridge with stages: `downloading` → `configuring` → `starting` → `ready`.
- [ ] **WIRE-03** — `/admin/walkthrough` renders 3 guides: "Add a new Docker app" (fork livinity-apps → manifest.yaml → PR → sync), "Add a new MCP" (manifest variants), "Add a custom non-Docker app" (Mini PC bridge custom-runner pattern).
- [ ] **WIRE-04** — Each guide has an embedded test-install button that drives a sample install through the wired path.
- [ ] **WIRE-05** — 3 sample MCPs install via one-click in <60s each end-to-end.

## REQ — Cloudflare Audit (Phase 216)

- [ ] **CF-01** — `.planning/cloudflare-state.md` enumerates current DNS records (livinity.io zone) via Cloudflare API: A/AAAA, www CNAME, MX, TXT (SPF/DKIM/DMARC).
- [ ] **CF-02** — Live audit of per-user wildcard cert (`*.livinity.io`) — confirms whether Server5 Caddy on-demand TLS + relay `/internal/ask` gate still works post-Vercel migration. Closes D-V41-CF-CERT-AUDIT-DEFERRED.
- [ ] **CF-03** — If wildcard cert path is broken, ship the fix within this phase (do not defer to v42).
- [ ] **CF-04** — Per-user subdomain provisioning (Phase 210 fixes) works end-to-end with the Cloudflare API after this audit.
- [ ] **CF-05** — Optional: Terraform/wrangler config declaring DNS state checked into the repo (operator decides at audit time).

## REQ — E2E UAT (Phase 217)

- [ ] **UAT-01** — `UAT-CHECKLIST.md` written with one section per Phase 209-216 deliverable.
- [ ] **UAT-02** — Operator walks every section, marks PASS/FAIL/SKIP, attaches evidence (screenshot, journal snippet, curl output).
- [ ] **UAT-03** — Every FAIL gets a fix and re-verify cycle before milestone close.
- [ ] **UAT-04** — `STATE.md`, `ROADMAP.md` updated to reflect final phase statuses; milestone archived to `.planning/milestones/v41/`.

---

## Coverage map (REQ → Phase)

| Category | Phase | REQ count |
|----------|-------|-----------|
| AI       | 209   | 6 (AI-01..06) |
| SUB      | 210   | 11 (SUB-01..11) |
| INST     | 211   | 6 (INST-01..06) |
| ADM      | 212   | 13 (ADM-01..13) |
| UI       | 213   | 10 (UI-01..10) |
| STORE    | 214   | 6 (STORE-01..06) |
| WIRE     | 215   | 5 (WIRE-01..05) |
| CF       | 216   | 5 (CF-01..05) |
| UAT      | 217   | 4 (UAT-01..04) |
| **Total** | **9 phases** | **66 requirements** |

---

## Out of Scope (v41 — explicit exclusions)

- Server5 admin panel migration — old Server5 web app may keep running through transition, but admin panel lives ONLY on Vercel from day one (D-V41-NO-SERVER5-ADMIN-MIGRATION).
- Supabase Auth replacement — use what's already wired (D-V41-NO-SUPABASE-AUTH-REPLACEMENT).
- Broker rebuild — Phase 209's `claude-cli` reuse path is the canonical subscription wiring; no broker resurrection.
- Static-HTML page port to Next.js — `/dashboard.html`, `/auth.html`, `/login.html` stay static (D-V41-STATIC-HTML-KEEP).
- TimescaleDB extension on Supabase — bandwidth time-series uses plain rollup tables (D-V41-BANDWIDTH-ROLLUPS).
- External time-series store (Grafana Cloud, InfluxDB) — Supabase rollups are sufficient at current scale.
- Server4 deploys — Server4 remains off-limits (sacred user-confirmed rule 2026-04-27).
- BYOK / raw `claude_*` API keys for openclaw — sacred subscription rule holds (D-NO-BYOK, D-V41-CLAUDE-CLI-REUSE).
- Public open store — `/store` becomes admin-only (D-V41-ADMIN-ONLY-STORE); future "verified-only public store" deferred to v42+.

---

## Traceability (filled by roadmap)

See `.planning/ROADMAP.md` v41 section for per-phase REQ-ID mapping and success criteria.
