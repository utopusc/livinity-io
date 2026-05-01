# Milestone v29.4 Requirements — Server Management Tooling + Bug Sweep

**Goal:** Restore Nexus AI's missing built-in tools, ship a Fail2ban admin panel + Mini PC SSH-recovery via UI-driven unban + whitelist, defensive marketplace-app health probing, and roll up four v29.3 carry-forward fixes — all without new third-party dependencies.

**Locked decisions** (carry from v29.3 and PROJECT.md):
- D-NO-BYOK: Subscription-only AI provider path (no API key field anywhere).
- D-NO-SERVER4: Mini PC `bruce@10.69.31.68` ONLY. Server4 + Server5 off-limits for v29.4 work.
- D-TOS-02: Broker NEVER through raw `@anthropic-ai/sdk`; always Agent SDK `query()` (sacred file `nexus/packages/core/src/sdk-agent-runner.ts`).
- D-NO-NEW-DEPS: 0 new npm/apt deps for v29.4. fail2ban + cloudflared already on Mini PC via `install.sh`. (`maxmind` for geo-IP enrichment of B4 SSH viewer DEFERRED to v30+.)
- D-LIVINITYD-IS-ROOT: livinityd runs as root on the Mini PC; sudoers/polkit/D-Bus brokers are net-new attack surface for zero gain.
- D-DIAGNOSTICS-CARD: A1 + A2 + A4 share a single `diagnostics-section.tsx` scaffold (~25% LOC saving).
- D-D-40-01-RITUAL: every surgical edit to sacred `sdk-agent-runner.ts` follows Phase 40 ritual (pre-edit SHA verify → behavior-preserving change → post-edit SHA verify → integrity test re-pinned with audit comment).
- D-FAIL2BAN-CLIENT-ONLY: parse `fail2ban-client status` text output; no JSON wrapper library; no Python `dbus` bindings.

**Sacred:** `nexus/packages/core/src/sdk-agent-runner.ts` — current SHA `4f868d31...` (drifted from Phase 40 baseline `623a65b9...` due to v43.x model-bump commits). C2 audit-only re-pin lands first; A2 surgical edit may add ANOTHER edit on top.

---

## v29.4 Requirements

### Carry-Forward Sweep (FR-CF) — from v29.3 audit

- [x] **FR-CF-01** *(C1)*: Broker error path forwards Anthropic upstream HTTP 429 verbatim (NOT collapsed to 500) AND preserves the upstream `Retry-After` header (seconds OR HTTP-date format, both forms forwarded as-is). Verified by integration test mocking nexus 429 → broker returns 429 + Retry-After preserved + `broker_usage` throttled row written + UI banner-section renders critical state. Status code allowlist is STRICT 429-only (502/504 do NOT get re-mapped to 429). **Completed 2026-05-01 in commit `cdd34445`.**
- [x] **FR-CF-02** *(C2)*: Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` integrity test BASELINE_SHA re-pinned from stale `623a65b9...` to current `4f868d31...` per Phase 40 D-40-01 audit-only ritual. Commit gate: `git diff --shortstat nexus/packages/core/src/sdk-agent-runner.ts` returns empty (test constant changes only — no source edit). Audit comment in test file lists every surgical edit that contributed to drift since the previous baseline. **Completed 2026-05-01 in commit `f5ffdd00`.**
- [x] **FR-CF-03** *(C3)*: tRPC routes `claudePerUserStartLogin` (subscription) + `usage.getMine` (query) + `usage.getAll` (query) added to `httpOnlyPaths` array at `livos/packages/livinityd/source/modules/server/trpc/common.ts`. Verified by killing livinityd while UI is open, restarting, observing each route resolves on reconnect without WS-hang. **Completed 2026-05-01 in commit `d2c99e8a`.** (Restart-livinityd-mid-session integration test deferred to UAT on Mini PC per pitfall W-20; static-array test in `common.test.ts` covers presence + namespacing-convention guard, 4/4 PASS.)
- [ ] **FR-CF-04** *(C4)*: OpenAI SSE adapter `livos/.../livinity-broker/openai-sse-adapter.ts` emits a final `data:` chunk containing `{usage: {prompt_tokens, completion_tokens, ...}, choices: [{index: 0, delta: {}, finish_reason: "stop"}]}` BEFORE `data: [DONE]\n\n`. Verified by integration test asserting OpenAI Python SDK consumes the stream successfully AND `broker_usage` row is written for OpenAI streaming traffic.

### Nexus Tool Registry Restore (FR-TOOL) — was A1

- [ ] **FR-TOOL-01**: Settings > Advanced > Diagnostics card shows a "Capability Registry" sub-section with: Redis manifest count, built-in tool count from source, syncedAt timestamp, and a 3-way categorized list of capabilities — `expected-and-present`, `expected-but-missing` (e.g. `shell`, `docker_*`, `files`, `web_search`), `unexpected-extras`. The "missing" branch distinguishes "missing because Redis lost it" from "missing because precondition not met (e.g. web_search needs API key)".
- [ ] **FR-TOOL-02**: Admin clicks "Re-sync registry" button → atomic-swap resync (write to temp Redis prefix `capability:tmp:*`, swap-pointer flush, then drop old prefix) so AI chat traffic mid-resync sees either OLD or NEW set, never empty. Pre-existing user-set `enabled: false` overrides from `user_capability_overrides` table are re-applied AFTER resync. Verified by integration test using isolated Redis DB.

### Model Identity Stability (FR-MODEL) — was A2

- [ ] **FR-MODEL-01**: Settings > Advanced > Diagnostics card shows "Model Identity" sub-section running a 6-step on-Mini-PC diagnostic: (1) curl broker `/v1/messages` with `messages: [{role: user, content: "What model are you?"}]`, (2) inspect `response.model` field, (3) snapshot `/proc/<claude-pid>/environ` of any active claude CLI subprocess, (4) `ls -la /opt/livos/node_modules/.pnpm/@nexus+core*/` to detect pnpm-store dist drift, (5) `readlink -f` resolved nexus/core dist path inside livinityd's node_modules, (6) `grep` deployed dist for the system-prompt identity-line marker. Surfaces a verdict: dist-drift / source-confabulation / both / neither.
- [ ] **FR-MODEL-02**: Based on FR-MODEL-01 verdict, exactly ONE remediation lands:
  - **Branch A (dist drift):** patch `update.sh` pnpm-store dist-copy step (BACKLOG 999.5b) so it copies into the LAST `find -maxdepth 1 -name '@nexus+core*' | tail -1` (currently uses head -1 which can resolve to stale dir). NO sacred-file edit. ~30 LOC.
  - **Branch B (source confabulation):** sacred-file surgical edit at `sdk-agent-runner.ts` system-prompt construction site to switch from raw `systemPrompt: "..."` to `{type: 'preset', preset: 'claude_code', append: ...}`. Phase 40 D-40-01 ritual MUST be followed (pre-SHA → edit → post-SHA → integrity test re-pinned with audit comment). Sequenced AFTER FR-CF-02 (C2 lands first as audit-only, FR-MODEL-02-Branch-B adds a NEW surgical edit on top with new SHA).
  - **Branch C (both):** Both fixes land in two separate atomic commits; integrity test re-pinned to final SHA after Branch B.
  - Verified by post-fix re-run of FR-MODEL-01 diagnostic returning verdict `clean`.

### Marketplace App Health Probe (FR-PROBE) — was A3 + A4

- [ ] **FR-PROBE-01**: New tRPC route `apps.healthProbe(appId)` (privateProcedure — every authenticated user can probe THEIR own apps' reachability) returns `{reachable: boolean, statusCode: number | null, ms: number, lastError: string | null, probedAt: ISO}`. Probe target derives from app's docker-compose published port + app's per-user subdomain (e.g. `bolt.{username}.livinity.io`). Uses `undici` (already in stack) with 5s timeout.
- [ ] **FR-PROBE-02**: Marketplace app detail page (and Bolt.diy specifically per user report) shows a "Probe reachability" button next to install/uninstall actions. Output renders inline as a status card: green check (reachable + 2xx), yellow warning (reachable + non-2xx), red error (unreachable / timeout). Surfaces same root-cause diagnostic info as the v29.3 livos.app deploy probe pattern (subdomain → Caddy → backend container).

### Fail2ban Admin Panel (FR-F2B) — was B1 + B2 (table stakes) + last-user + manual-ban + mobile cellular toggle

**Backend module:** `livos/packages/livinityd/source/modules/fail2ban-admin/` — mirrors v29.3 `livinity-broker/` shape (5 files: index.ts public API, client.ts execFile wrapper, parser.ts text-output parsers, events.ts JSON event row writer, routes.ts tRPC procedures).

**UI:** new "Security" sidebar entry inside `LIVINITY_docker` (13th entry; promotion to standalone `LIVINITY_security` peer app deferred to v30+).

- [ ] **FR-F2B-01**: Admin sees a list of all configured fail2ban jails with per-jail status: jail name, currently-failed count, total-failed count, currently-banned count, total-banned count, banned IP list. Refreshes via React Query poll @ 3-5s with manual "Refresh" button. Three-state binary detection — distinguishes (a) `fail2ban-client` binary missing (UI banner: "Install Fail2ban" with one-click install via `systemd-run --scope`-spawned `apt-get install -y fail2ban`), (b) service stopped (banner: "Fail2ban service inactive" with start button), (c) running but no jails (banner: "Fail2ban running but no jails configured" with link to docs).
- [ ] **FR-F2B-02**: Per-IP unban modal: shows IP + jail + last-attempt timestamp + attempt count + last-attempted-user (parsed from `fail2ban.log` for the SSH jail). Modal includes a checkbox "Add to ignoreip whitelist after unban (so future fail2ban triggers won't re-ban this IP)". Unban action runs `fail2ban-client set <jail> unbanip <ip>` (action-targeted, NOT a global flush) + if whitelist box checked, also runs `fail2ban-client set <jail> addignoreip <ip>`. Optimistic UI update with "Refreshing..." badge until next poll confirms. RBAC: adminProcedure only.
- [ ] **FR-F2B-03**: Manual ban-IP from UI: button "Ban an IP" opens modal with IP-input field, jail-select dropdown, confirmation field requiring user type `LOCK ME OUT` if the IP matches the admin's current connection IP (HTTP X-Forwarded-For OR cellular toggle source). Zod validation rejects CIDR /0 through /7 (anti-self-DOS). Calls `fail2ban-client set <jail> banip <ip>`. Audit-logged.
- [ ] **FR-F2B-04**: Audit log via REUSE of existing `device_audit_log` table (no new table). Each unban/ban/whitelist event writes a row with `device_id := 'fail2ban-host'` sentinel + `tool_name := 'unban_ip' | 'ban_ip' | 'whitelist_ip'` + `params := {jail, ip, reason}` (SHA-256 digest preserved per existing trigger contract) + `user_id := <admin who performed action>`. Audit tab in the panel renders last 50 events with click-to-expand details. Append-only trigger from v22.0 enforces immutability.
- [ ] **FR-F2B-05**: Mobile cellular-IP toggle: when admin opens panel from a mobile browser, surface BOTH the HTTP X-Forwarded-For IP AND a "I'm on cellular" toggle. When toggled, FR-F2B-03 self-ban detection compares against the cellular CGNAT IP retrieved via `who -u`-equivalent abstraction (livinityd module returning active SSH session source IPs). Prevents accidental self-ban when admin is on a different IP than the session.
- [ ] **FR-F2B-06**: Settings toggle "Show Security panel" defaults ON; admin can hide the entire sidebar entry. Provides a non-destructive backout if the panel itself causes issues. Toggle persists per-user in `user_preferences` table.

### Live SSH Session Viewer (FR-SSH) — was B4 (stretch goal, user opted in)

- [ ] **FR-SSH-01**: New "SSH Sessions" sub-section in Security sidebar. WebSocket endpoint `/ws/ssh-sessions` (mirrors `/ws/docker/logs` from Phase 28) streams `journalctl -u ssh -o json -f --since "1 hour ago"` filtered to lines matching `_SYSTEMD_UNIT === "ssh.service"`. Each emitted event includes `__REALTIME_TIMESTAMP`, `MESSAGE`, and an extracted IP (regex). RBAC adminProcedure gate. Pure raw stream — NO geo-IP enrichment, NO ASN lookup (deferred v30+ via `maxmind` if user wants country flags).
- [ ] **FR-SSH-02**: Session viewer UI renders the live tail with: timestamp column, message column, IP column with click-to-copy button + click-to-ban-IP cross-link to FR-F2B-03 (the killer feature — see a malicious-looking session, click the IP to open the ban modal pre-populated with that IP). 5000-line ring buffer (mirror Phase 28). Live-tail toggle with 4px scroll-tolerance auto-disable on user scroll.

---

## Future Requirements (Deferred)

- **FR-SSH-future-01** — geo-IP / ASN enrichment for live SSH viewer via `maxmind` + `node-geolite2-redist`. Single follow-up phase if shipped.
- **FR-GW-future-01** — B3b active SSH gateway via cloudflared (`ssh.{user}.livinity.io` tunnel). Defer until "passive whitelist" pattern proves insufficient in production.
- **FR-F2B-future-01** — Bulk unban (multi-row checkbox). Skipped per research anti-feature consensus.
- **FR-F2B-future-02** — Custom jail editor (filter/findtime/maxretry CRUD). Skipped — anti-feature per Webmin support-burden data.
- **FR-AUDIT-future-01** — Sync history audit log for capability registry (which sync added/removed which capability when). Skip — `capability_audit_log` would duplicate existing Redis sync timestamp + audit-log table.
- **FR-DIAG-future-01** — Probe history persistence (last 30 probes per app shown as sparkline). Defer — single-snapshot probe is sufficient for v29.4.

---

## Out of Scope (Explicit exclusions with reasoning)

- **B3b active SSH gateway via cloudflared in v29.4** — research recommends defer; passive whitelist via FR-F2B-02 covers the "Claude SSH from cloud" use case. Reconsider in v30+ if production friction proves the case.
- **MiroFish marketplace anchor app** — DROPPED 2026-05-01 per user direction at v29.3 close. Manifest draft preserved as planning artifact only.
- **Tool / function calling support in broker** — D-41-14 + D-42-12 carry forward; v30+ if marketplace anchor app explicitly needs it.
- **Multi-host fail2ban admin** (showing ban events from environments other than the local Mini PC) — v29.4 is single-host; multi-environment pattern deferred to v30+ alongside Phase 22 multi-host docker work.
- **Sudoers entry / polkit rule for fail2ban-client** — livinityd runs as root on the Mini PC; adding sudo is net-new attack surface for zero security gain. D-LIVINITYD-IS-ROOT.
- **`fail2ban` npm wrapper** — abandons stable `child_process.execFile` for a Python-pickle subprocess dependency. D-FAIL2BAN-CLIENT-ONLY.
- **JSON output flag for `fail2ban-client`** — does not exist in fail2ban 1.0.2 / 1.1.0; text-parser is the supported approach.
- **Tailscale / WireGuard SSH gateway** — cloudflared already installed; second VPN stack is duplicate maintenance.
- **Geo-IP enrichment for SSH session viewer** — adds ~7MB MMDB binary + 30-day license-deletion lifecycle. Raw IP + click-to-ban gives 80% of value for 0% install cost.
- **POSIX-enforced cross-user `.claude/` isolation** — D-40-05 + D-40-16 from v29.3; future security audit may add it later.
- **v29.3 manual UAT execution** — 6 UAT files un-executed (operator-deferred to natural deploy cadence). Not blocking v29.4.
- **Server4 / Server5 deployment** — D-NO-SERVER4. Mini PC only.
- **Lu invite bug** — pre-existing v6.0 multi-user bug; separate fix outside v29.4 scope.
- **v43.x tech-debt consolidation (3 iframes / 3 install handlers in BACKLOG 999.8)** — defer to v29.5 OR v30+; v29.4 scope is already at 8 phases.

---

## Traceability

Phase ↔ requirement mapping (filled by `/gsd-roadmapper` after this file is approved). Every v1 requirement maps to exactly one phase. Coverage = 18 / 18.

| Requirement | Phase | Category | Status |
|-------------|-------|----------|--------|
| FR-CF-01 | 45 | Carry-Forward | **Complete** (`cdd34445`) |
| FR-CF-02 | 45 | Carry-Forward | **Complete** (`f5ffdd00`) |
| FR-CF-03 | 45 | Carry-Forward | **Complete** (`d2c99e8a`) |
| FR-CF-04 | 45 | Carry-Forward | Pending |
| FR-TOOL-01 | 47 | Diagnostics | Pending |
| FR-TOOL-02 | 47 | Diagnostics | Pending |
| FR-MODEL-01 | 47 | Diagnostics | Pending |
| FR-MODEL-02 | 47 | Diagnostics | Pending |
| FR-PROBE-01 | 47 | Diagnostics | Pending |
| FR-PROBE-02 | 47 | Diagnostics | Pending |
| FR-F2B-01 | 46 | Fail2ban | Pending |
| FR-F2B-02 | 46 | Fail2ban | Pending |
| FR-F2B-03 | 46 | Fail2ban | Pending |
| FR-F2B-04 | 46 | Fail2ban | Pending |
| FR-F2B-05 | 46 | Fail2ban | Pending |
| FR-F2B-06 | 46 | Fail2ban | Pending |
| FR-SSH-01 | 48 | SSH Viewer | Pending |
| FR-SSH-02 | 48 | SSH Viewer | Pending |

**Mapped:** 18 / 18
**Orphans:** 0
**Duplicates:** 0

---

*Initial draft: 2026-05-01. Categories sized via parallel research (`v29.4-STACK.md` / `v29.4-FEATURES.md` / `v29.4-ARCHITECTURE.md` / `v29.4-PITFALLS.md` / `v29.4-SUMMARY.md`). Roadmap generated 2026-05-01 by `/gsd-roadmapper` — phase numbers filled (18/18 mapped, 0 orphans, 0 duplicates). Phases 45-48; see `.planning/ROADMAP.md`.*
