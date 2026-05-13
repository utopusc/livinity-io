# v34 Handoff — 2026-05-13 Night Session End State

**Generated:** 2026-05-13 night by Claude Opus 4.7 (continuation of evening session)
**Session duration:** ~2 hours
**Commits shipped this night:** 6 (`8e9cfa3e..db512a59`)
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — preserved 6/6 ✓
**All pushed to origin/master.**

---

## ✅ Shipped this session

| Phase | Status | Commits | Live Evidence |
|---|---|---|---|
| **Mini PC sync** (Phase 112+114 source pickup + API key inject) | ✅ DONE | n/a | `bash /opt/livos/update.sh` ran clean (deployed SHA `ec52daf`); `livos:platform:api_key=liv_k_gcOHv6skaLtcOffBiv4n` set in Mini PC Redis; tunnel preserve log signal `[tunnel] Existing active domain "bruce.livinity.io" preserved (source: livinity-tunnel) — tunnel-assigned URL not applied`. |
| **Tunnel slot conflict resolution** | ✅ RESOLVED | n/a | Discovered post-update kick war (38 closes/2min) caused by Mini PC + mainserver both auth'ing as same user `utopusc` against Server5 `tunnel_connections.user_id_key UNIQUE` constraint. Resolved by DEL'ing `livos:platform:api_key` on mainserver Redis + `systemctl restart livos` → mainserver journal `[tunnel] No API key configured, staying idle`; Mini PC reclaimed slot, tunnel stable post-pause (0 closes since). User explicitly chose Mini PC priority: *"Mini PC'ye ayrımcalık tanı, tunnel kalsın, OwnCloud olarak kullanıyorum"*. Saved as memory `feedback_minipc_is_owncloud_primary`. |
| **111** — Server5 Dashboard Install Wizard | ✅ CODE-COMPLETE | 6 (5 plan + 1 tracking) | All 5 plans shipped sequential 3-wave: 111-01 install.sh URL fix → 111-02 api_keys multi-per-user migration + CRUD routes → 111-03 CF zone-id resolver → 111-04 4-step wizard UI at `/onboarding/install` → 111-05 mode reference docs panel. Each plan UAT-validated live (10/10, 8/8, 6/6, 6/6 PASS respectively). |

## Mini PC state (`bruce@10.69.31.68`)

| Component | State |
|---|---|
| Source code | `ec52daf` deployed (Phase 112+114+107+113 sources) |
| `systemctl is-active livos` | `active` |
| `livos:platform:api_key` | `liv_k_gcOHv6skaLtcOffBiv4n` ✓ |
| `livos:domain:config` | `{"domain":"bruce.livinity.io","active":true,...,"source":"livinity-tunnel"}` (preserved by Phase 114) |
| Tunnel session | stable, no closes since slot war resolution |
| `https://utopusc.livinity.io/` | HTTP/2 200 ✓ (Server5-auto-assigned URL works) |
| `https://bruce.livinity.io/` | HTTP/2 503 (pre-existing — no `custom_domains` row in Server5 PG; v34.x scope) |
| `https://livinity.io/store?instance=utopusc.livinity.io` | HTTP/2 200 ✓ (App Store iframe gate passes) |

## Mainserver state (`154.53.56.75` / `test.livinity.live`)

| Component | State |
|---|---|
| `livos:platform:api_key` | **DEL'd** (intentional pause to give Mini PC the tunnel slot) |
| `livos:domain:config` | `test.livinity.live` (preserved across reload by Phase 114; intact) |
| `systemctl is-active livos` | `active` |
| Tunnel state | "No API key configured, staying idle" (intentional; restore by re-setting api_key when needed) |
| `https://test.livinity.live/` | 503 expected (tunnel idle by design — see `feedback_minipc_is_owncloud_primary`) |
| Caddy `--environ` flag | stripped (Phase 113 fix intact) |
| Source on disk | tunnel-client.ts has Phase 114 preserve block visible |

## Server5 state (`45.137.194.102`)

| Component | State |
|---|---|
| `https://livinity.io/install.sh` | 99-line modular dispatcher (Plan 111-01 ✓) |
| `https://livinity.io/api/account/api-keys` (POST/GET/DELETE) | live, unauth → 401 (Plan 111-02 ✓) |
| `https://livinity.io/api/cf/resolve-zone` (POST) | live, unauth → 401, token-no-persist triple-proven (Plan 111-03 ✓) |
| `https://livinity.io/onboarding/install` | wizard live, unauth → 307 to /login (Plan 111-04 ✓) |
| `mode-docs.tsx` accordion | rendered with "Zero relay data plane" honesty disclosure on Hybrid card (Plan 111-05 ✓ D-111-RELAY-DATA-PLANE-DOC) |
| `api_keys.user_id` UNIQUE | DROPPED (multi-key per user enabled); test user sacred key `8b52d071... liv_k_gcOHv6sk` byte-identical post-migration |
| `tunnel_connections.user_id` UNIQUE | **STILL PRESENT** (multi-tunnel = v34.x scope, see Open Follow-ups) |
| Caddyfile `@authproxy path` whitelist | patched (added `/onboarding/install /onboarding/install/*`) |
| pm2 `web` (id 14) | online, no restart loop |
| Backups (rollback): | `mode-cards.tsx.pre-111-05.bak`, `page.tsx.pre-111-05.bak`, `schema.ts.pre-111-02.bak`, `route.ts.pre-111-01.bak`, Caddyfile `.pre-111-04.bak`, `/tmp/api_keys_pre_111_02.sql` (pg_dump full table) |
| Sacred SHA | `f3538e1d8...` |

## v34 Milestone Phase Status

| Phase | Status | Notes |
|---|---|---|
| 106 | ✅ SHIPPED | Mainserver UAT pending operator walk |
| 107 | ✅ SHIPPED | UI-only, Mini PC pickup pending |
| 108 | ❌ REVERTED | User rejected native /app-store route post-UAT |
| 109 | ✅ SHIPPED | Mainserver UAT passed |
| **110** | ⏳ no_directory | WebApp VNC swap carry-over from v33 (Phase 99 incomplete). NEEDS Mini PC for UAT. **DEFERRED THIS SESSION**: Mini PC is active OwnCloud; cannot disrupt without operator coordination. |
| **111** | **✅ CODE-COMPLETE (this session)** | 5/5 plans, sacred SHA preserved, all per-plan UAT PASS. **Operator-walked binding UAT pending** (fresh VPS + Hybrid + real CF token). |
| 112 | ✅ SHIPPED | n8n routing fix; Mini PC source pickup verified this session |
| 113 | ✅ SHIPPED | Caddy --environ flag stripped on mainserver only |
| 114 | ✅ SHIPPED | Tunnel domain preserve; Mini PC source pickup verified this session |

## Recommended next-session entry

1. `/clear` to reset context
2. Memory + handoff doc auto-load on init (you're reading this now)
3. **First action:** decide path for Phase 110 + Phase 111 binding UAT:

   **Option A — Phase 110 (WebApp VNC swap):**
   - Coordinate with operator: Mini PC OwnCloud usage window where x11vnc work won't disrupt
   - `/gsd-plan-phase 110` → `/gsd-execute-phase 110`
   - Read `.planning/phases/99-webapp-vnc-swap/CONTINUE.md` first (memory `project_v33_protocol_mismatch`)
   - Estimated 3-4 hours including UAT
   - D-110-NO-FMPEG-REGRESSION: Phase 93 streaming subsystem must remain untouched

   **Option B — Phase 111 binding UAT (operator-walked):**
   - Fresh Ubuntu 24.04 VPS (Contabo or Hetzner cheap tier)
   - Browser-walk wizard at `https://livinity.io/onboarding/install`
   - Pick Hybrid mode + enter your domain + paste real CF API token (DNS:Edit + Zone:Read scopes)
   - Verify on-blur shows resolved zone-id
   - Click step 3, copy generated `curl ... | sudo bash -s -- --mode hybrid --domain ... --cf-token ... --cf-zone-id ... --api-key liv_k_...` one-liner
   - SSH to fresh VPS, paste, observe install completion
   - Open `https://<your-domain>` → expect App Store loads with marketplace catalog (no manual API key prompt)
   - If pass → flip Phase 111 status from CODE-COMPLETE → SHIPPED in ROADMAP

   **Option C — Multi-device tunnel (v34.x):**
   - Drop `tunnel_connections.user_id` UNIQUE constraint on Server5 PG
   - Update relay registry to key by `(user_id, device_id)` instead of `username` alone
   - Plumb device_id through tunnel-client auth message (livos source)
   - Allows Mini PC + mainserver (and any other LivOS install) to coexist with separate tunnel slots
   - Closes the tunnel slot conflict that surfaced this session

   **Option D — `bruce.livinity.io` custom domain registration:**
   - INSERT row in Server5 PG `custom_domains` for user `utopusc` with domain `bruce.livinity.io`, status `dns_verified`
   - Verify routing through relay's `lookupCustomDomain` path
   - Restores user's preferred public alias (currently 503)

## What NOT to do next session

- ❌ Do NOT re-set `livos:platform:api_key` on mainserver Redis without coordinating with Mini PC (will re-trigger kick war per `feedback_minipc_is_owncloud_primary`)
- ❌ Do NOT add a SECOND row to `api_keys` for `burakcanoztruk@gmail.com` and expect it to give Mini PC a separate tunnel — `tunnel_connections.user_id` UNIQUE still applies. Multi-key ≠ multi-tunnel.
- ❌ Do NOT re-add Facebook/WhatsApp/YouTube/TradingView/Google/Yahoo to dock or systemApps (Phase 107 explicitly removed them)
- ❌ Do NOT touch sacred `liv/packages/core/src/sdk-agent-runner.ts` (SHA gate enforced, pre-commit hook blocks)
- ❌ Do NOT use `--no-verify` on git commits unless inside an executor worktree (where it's required to avoid hook contention)
- ❌ Do NOT modify Mini PC scripts (`livos/install.sh`, `livos/update.sh`) — D-NO-PROD-IMPACT
- ❌ Do NOT touch `livos/packages/livinityd/source/modules/platform/tunnel-client.ts` `handleAuthOk` domain-config write logic — Phase 114 preserves existing active domain by design
- ❌ Do NOT modify Plan 111-02's DELETE route to remove the `AND user_id = $2` filter — D-111-NO-CROSS-USER-LEAK is a security-critical filter

## Open follow-ups (operator decisions / v34.x scope)

1. **Phase 111 binding UAT** — fresh-VPS browser walk (Option B above)
2. **Multi-device tunnel** — `tunnel_connections.user_id` UNIQUE drop + relay registry refactor (Option C above; resolves slot conflict permanently)
3. **`bruce.livinity.io` custom_domain** — Server5 PG INSERT row for user's preferred alias (Option D above)
4. **Mainserver tunnel re-enable** — re-SET `livos:platform:api_key` on mainserver Redis ONLY if multi-device tunnel is shipped first OR Mini PC tunnel is intentionally paused
5. **Mini PC pickup of Phase 107 UI changes** — Phase 107 (default apps cleanup) still pending Mini PC `update.sh` re-run if user wants the cleaned dock there too
6. **Verification polling** — auto-detect install completion via heartbeat (deferred from Phase 111 to Phase 112+; would close the wizard step-3-to-dashboard gap so user doesn't have to manually return)
7. **Own-Cloud + Cloud mode card "Coming Soon" stubs** — implement real install flows for these modes (currently disabled in wizard)
8. **n8n auth bypass** — `apps.ts:registerAppSubdomain` should propagate `public:true` from app manifests so apps like n8n bypass LivOS auth and serve their own auth (carry-forward from Phase 112)
9. **Journal vacuum on mainserver** — `journalctl --vacuum-time=1s` to purge 5 historic leaked CLOUDFLARE_API_TOKEN entries (DESTRUCTIVE — operator decision)
10. **CF token rotation** — old token exposed in historic mainserver journal (operator decision via Cloudflare dashboard)
11. **Strip-environ-flag drop-in back-port to scripts/install/** — fresh installs should auto-write the Phase 113 drop-in
12. **Pre-existing TS errors** in `cmdk.tsx:426` + `app-icon.tsx:151` — typing cleanup phase, NOT blocking

## UAT debt (carry-over from earlier)

3 VERIFICATION.md files with `human_needed` status (Phase 62, 105, 106). Plus now **Phase 111 binding UAT** added to the list. Run `/gsd-audit-uat` to review when ready.

## Critical invariants maintained this session

- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across 6 commits (live grep verified)
- D-NO-PROD-IMPACT on Mini PC's `livos/install.sh` + `livos/update.sh`
- D-NO-LIVOS-CHANGE on Phase 111 (Server5 work + .planning artifacts only; `git diff master~6..master -- livos/ liv/` = 0 lines)
- D-111-CF-TOKEN-NEVER-PERSISTED triple-proven on Plan 111-03
- D-111-NO-CROSS-USER-LEAK enforced on Plan 111-02 DELETE route
- D-111-INSTALL-CMD-COPY-FRIENDLY enforced on Plan 111-04 (one-line install command, no `\` continuations)
- D-111-RELAY-DATA-PLANE-DOC delivered on Plan 111-05 ("Zero relay data plane" Hybrid card honesty disclosure)
- All shipped plans have SUMMARY.md committed
- All pushed to GitHub origin/master
- Mini PC tunnel slot priority preserved per user's stated OwnCloud usage

## Session-specific learnings

1. **Same-user multi-install kick war** — Mini PC + mainserver both auth'd as user `utopusc` against Server5's `tunnel_connections.user_id_key UNIQUE`, causing 1 connect → 2s → close → reconnect loop. Resolved by pausing one side. True fix needs schema change (multi-device tunnel = v34.x).
2. **Mini PC's `bruce.livinity.io` is aspirational, not routed** — Server5 has no `custom_domains` row for it; `*.livinity.io` Caddy block routes by username (`utopusc` works, `bruce` doesn't match the user). Memory note added that `utopusc.livinity.io` is the working public URL for Mini PC.
3. **redis-cli URL parsing quirk on Mini PC** — passing `-u "$REDIS_URL"` with URL-encoded password (`%21` for `!`) fails with WRONGPASS. Workaround: extract password via Python `urllib.parse.urlparse` + `unquote`, then pass via `-a "$PW" --no-auth-warning`.
4. **Cherry-pick fallback for divergent worktree merges** — when worktree is based on master HEAD-at-spawn-time but master has advanced (sibling plans merged in between), `git merge --ff-only` fails with "Diverging branches". Solution: `git cherry-pick <worktree-commit-sha>` after deleting the worktree branch. Cleaner than `--no-ff` merge commits for sequential plan execution.
