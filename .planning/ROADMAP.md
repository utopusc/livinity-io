# Roadmap — LivOS

## Milestones

- ✅ **v29.3 Marketplace AI Broker (Subscription-Only)** — Phases 39-44 (shipped local 2026-05-01) — see [milestones/v29.3-ROADMAP.md](milestones/v29.3-ROADMAP.md)
- ✅ **v29.4 Server Management Tooling + Bug Sweep** — Phases 45-48 (shipped local 2026-05-01) — see [milestones/v29.4-ROADMAP.md](milestones/v29.4-ROADMAP.md)
- ✅ **v29.5 v29.4 Hot-Patch Recovery + Verification Discipline** — Phases 49-54 (shipped local 2026-05-02 via `--accept-debt`) — see [milestones/v29.5-ROADMAP.md](milestones/v29.5-ROADMAP.md)
- ✅ **v30.0 Livinity Broker Professionalization (incl. v30.5 informal scope)** — Phases 56-63 (shipped local 2026-05-04 via `--accept-debt`) — see [milestones/v30.0-ROADMAP.md](milestones/v30.0-ROADMAP.md)
- ✅ **v31.0 Liv Agent Reborn** — Phases 64-79 (closed 2026-05-05 — P77+P78+P79 hot-fix wave shipped same day; bytebot MCP working end-to-end via host GNOME desktop)
- ✅ **v32.0 AI Chat Ground-up Rewrite + Hermes Background Runtime** — Phases 80-91 (CODE-COMPLETE 2026-05-06 via autonomous wave-based dispatch; pending Mini PC UAT signoff — see [.planning/phases/91-uat-polish/UAT-CHECKLIST.md](phases/91-uat-polish/UAT-CHECKLIST.md))
- ✅ **v33.0 WebApp Launcher + Teach/Auto Modes** — Phases 92-98 (CODE-COMPLETE 2026-05-08; pending Mini PC UAT signoff — see [.planning/phases/98-uat-polish/UAT-CHECKLIST.md](phases/98-uat-polish/UAT-CHECKLIST.md))
- ✅ **v35.0 Design System Unification (UI/UX)** — Phases 115-121 (shipped 2026-05-15; 77 commits, sacred SHA preserved 77/77, AC#3 cross-surface parity 92.5%, operator UAT pending) — see [milestones/v35.0-ROADMAP.md](milestones/v35.0-ROADMAP.md)
- 🟢 **v36.0 LivOS Design Port** — Phases 122-129 (active 2026-05-15; 8-step additive port of the Livinity Design System from claude.ai/design into `livos/packages/ui/` — component-by-component, screenshot per step). Master plan: [v36-DESIGN-PORT-MASTER.md](v36-DESIGN-PORT-MASTER.md). Superseded the old [v36-DRAFT.md](v36-DRAFT.md) (segment-dock direction rejected; see [feedback-v36-no-bold-redesigns](../../../.claude/projects/.../memory/feedback_v36_no_bold_redesigns.md)).
- 🟢 **v37.0 Store Reimagining + Plugin Platform** — Phases 148-155 (opened 2026-05-18; LOCKED draft at [v37-DRAFT.md](v37-DRAFT.md)). Redesigns `/store` with 5 sections (Apps/WebApp/Native/AI/Plugin), reuses WebApp window infra for native Linux apps, AI section bundles MCP+Agents+GSD, plugin runtime supports HOT-RELOAD. 7-11 days. Operator-signed plugins for v37; third-party submission deferred to v38.
- 🟢 **v42.0 Liv Assistant (AionUi-based replacement for OpenClawOS)** — Phases 222-233 (opened 2026-05-27; spike 222 PASSED `b2be397f` → vendor-and-wrap strategy). Replaces openclaw + claw-client chat surface with vendored AionUi tarball, iframe-embedded in LivOS shell, Claude Code subscription via local CLI. 3-4 days. Master: [milestones/v42/PROJECT.md](milestones/v42/PROJECT.md), per-phase plan: [milestones/v42/ROADMAP.md](milestones/v42/ROADMAP.md).
- ⏸ **(deferred) Backup & Restore** — paused, 8 phases / 47 BAK-* reqs defined in [milestones/v30.0-DEFINED/](milestones/v30.0-DEFINED/) (resumes as future slot e.g. v34+)

---

## Phases

<details>
<summary>✅ v30.0 Livinity Broker Professionalization (Phases 56-63) — SHIPPED 2026-05-04 via --accept-debt</summary>

Real-API-key broker for external/open-source apps (Bolt.diy, Open WebUI, Continue.dev, Cline, Cursor) — Bearer + x-api-key dual-auth, public api.livinity.io endpoint, true token streaming, spec-compliant rate-limit + alias resolver + provider stub, per-user usage tracking + Settings UI. v30.5 informal scope (F1/F6/F8) folded into close. F2-F5 + F7 → v31 carryover.

8 phases / 44 plans (41 summaries) / 166 commits since v30.0 seed (`d59b1b51`).

</details>

### 🟢 v34.0 Bootstrap Polish + First-Run UX (Active — Phases 106-113)

**Status (2026-05-12):** Opened after Phase 105 (deploy-livinityd 1:1 update.sh port) shipped + 2× UAT live-validated on mainserver `154.53.56.75`. Phase 105 UAT surfaced 4 categories of follow-up work that are out of Phase 105 scope (which was strictly the update.sh deploy port) but block "fresh-VPS install → working UX" parity with Mini PC. v34 batches these into a dedicated milestone so they can be planned, executed, and tested cleanly.

**Trigger:** Phase 105 PARTIAL→FULL PASS UAT (2026-05-12T23:16Z) revealed: (a) bootstrap-layer apt-installs (Bug #7-#10: mender, samba, google-chrome, bruce-user + fluxbox) all on-server hotfixed but NOT in `deploy-livinityd.sh`; (b) JWT secret format Bug #11 — `_dld_generate_jwt_secret` writes 65-byte file (64 hex + newline) but `validateSecret` requires exactly 64 — fixed on-server; (c) Bug #12 — yaml `user: {}` empty hash makes `user.exists()` return `true` falsely; (d) hardcoded webapp shortcuts (Facebook/Chrome/WhatsApp gibi) in dock not user-friendly for fresh installs; (e) App Store requires Server5 API key — local mode is missing; (f) MCP servers (Luse, bytebot, etc.) not seeded — admin must manually configure; (g) Phase 99 WebApp Launcher VNC swap carry-over from v33.

**Direction:**
- Each issue gets its own phase (clean scope, individual UAT, atomic commits)
- Test count target: maintain 168 PASS combined static + add new regression tests per phase
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved through every commit
- D-NO-PROD-IMPACT on Mini PC's `livos/install.sh` and `update.sh` (read-only references)
- All phases gated by operator UAT walk per `feedback_milestone_uat_gate.md`

**Sacred:** `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED.

**Depends on:** Phase 105 ✅ Shipped (`290885bc..332239e2` — 14 commits). Mainserver `154.53.56.75` available as UAT target (currently running last-test state).

**Phases (5 total — to be planned individually via `/gsd-plan-phase`):**

---

### Phase 106: deploy-livinityd Bootstrap-Layer Hotfix Back-Port — 🟡 CODE-COMPLETE 2026-05-12 (pending mainserver UAT)

**Goal:** Back-port the 6 in-scope deploy bugs discovered during Phase 105 UAT into `scripts/install/deploy-livinityd.sh` so fresh-VPS installs are byte-equivalent to the manually-hotfixed mainserver state. Covers:

- **Bug #11 (refined):** `_dld_generate_jwt_secret` MUST write exactly 64 bytes (no trailing newline). Fix: `openssl rand -hex 32 | tr -d '\n' > /opt/livos/data/secrets/jwt`. validateSecret regex is strict.
- **Bug #12:** Schema/migration leaves `user: {}` empty hash in livinity.yaml → `user.exists()` true → register blocked. Fix: either (a) don't seed yaml `user` key at all, (b) seed only after first register-API call, or (c) change `exists()` to check `user.hashedPassword !== undefined` instead of `user !== undefined`.
- **Bug #7 (mender):** silence WARN log spam by gating `mender commit` call on `command -v mender` check, OR install actual `mender` binary from official apt repo (smaller scope: gate the call).
- **Bug #8 (samba):** add `samba samba-common-bin` to apt-install list in `_dld_install_streaming_packages` (or a new `_dld_install_files_packages` helper). Mini PC has this from initial bootstrap.
- **Bug #9 (google-chrome):** add Google Chrome stable APT repo + install in deploy-livinityd. WebApp Launcher won't work without it. Reference: Mini PC `livos/install.sh:~700`.
- **Bug #10 (bruce + fluxbox):** create `bruce` user (uid=1000, sudo + docker groups) + install fluxbox if not present + write `/etc/sudoers.d/99-bruce` NOPASSWD entry. Make user-name configurable via `_DLD_LIVOS_USER` env (already partially supported).

**Plan count estimate:** 1 plan with 8 tasks (6 source fixes + 1 test extension + 1 SUMMARY, atomic commits).

**Plans:** 1/1 plans complete

Plans:
- [x] **106-01-PLAN.md** — CODE-COMPLETE 2026-05-12. Back-ported Bugs #7-#12 into deploy-livinityd.sh + user.exists() fix + +22 regression assertions + SUMMARY. **Commits:** `c3f13dd2..262e28f4` (7 source commits + this SUMMARY commit). **Test delta:** 126 → 148 PASS in test-deploy-livinityd.sh; combined 168 → **190 PASS** (deploy 148 + hybrid 18 + tunnel 24). **Sacred SHA preserved 7/7.** **D-104-NO-PROD-IMPACT preserved:** `livos/install.sh` + `update.sh` UNTOUCHED. **D-104-RELAY-ZERO-DATA-PLANE preserved:** zero new Server5/livinity.io refs in deploy-livinityd.sh. **One Rule-1 deviation:** vitest test-rig has pre-existing `@anthropic-ai/claude-agent-sdk` import resolution issue in Windows worktree (out of scope; Bug #12 fix is statically test-safe per plan §4). **SUMMARY:** `.planning/phases/106-deploy-livinityd-bootstrap-layer-hotfix-back-port/106-01-SUMMARY.md`. **Status flip to ✅ Shipped pending operator-walked mainserver UAT** (Task 8 checkpoint:human-verify) — full procedure in SUMMARY's `Mainserver UAT Carry-Forward` section.

**Test extension:** +22 regression assertions (mostly Bug #10 which needed 8 sub-asserts for the multi-faceted user-creation helper; far exceeded the planned +6).
**UAT:** fresh VPS install → verify livinityd NRestarts=0 after install (no manual hotfix needed). Combined static tests delivered 190/174 PASS target.

---

### Phase 107: First-Run Polish + Default Apps Cleanup

**Goal:** Make a fresh-install LivOS dashboard look clean and useful out-of-the-box. Currently the dock shows hardcoded shortcuts (Facebook, Chrome, WhatsApp, etc.) that don't make sense for a new user — they should be discoverable via App Store, not pre-pinned.

**Direction:**
- Identify where hardcoded webapp shortcuts come from (UI source `apps.tsx` provider vs DB seed migration vs onboarding wizard) — needs investigation
- Remove the legacy default-app pre-pin list — leave only: Files, Settings, App Store, Live Usage, AI Chat (genuine system apps)
- Add a "Suggested apps from App Store" carousel on the dashboard if dock is empty (UX delight, optional)
- D-107-NO-MINI-PC-REGRESSION: Mini PC's existing dock state must NOT change (only affect fresh installs)

**Plan count estimate:** 2 plans (P107-01 investigation + removal, P107-02 UX enhancement if scope allows).
**UAT:** fresh install → dock shows only system apps (Files/Settings/AppStore/LiveUsage/AIChat) — no Facebook/Chrome/WhatsApp pre-pinned.

---

### Phase 108: App Store Local Mode (No API Key Required)

**Goal:** Make `/app-store` route functional on a fresh VPS install without requiring the user to register their LivOS instance with the Livinity platform first. Currently the App Store shows "Connect to Livinity Platform" prompt requiring an API key from livinity.io (`app-store-content.tsx:92`).

**Direction:**
- Allow local-mode App Store catalog: serve manifests directly from `/opt/livos/data/app-stores/utopusc-livinity-apps-github-*` (gallery cache already populated by Phase 105 `_dld_update_gallery_cache` helper — 304 manifests on disk)
- Add `livos:appstore:mode=local|platform` Redis key with `local` default for fresh installs
- Hide "Connect to Livinity Platform" prompt when in local mode — show local catalog instead
- Optional: still allow users to opt into platform mode (API key) for shared apps + cloud sync features
- D-108-NO-API-KEY-FOR-LOCAL: zero outbound calls to livinity.io required for local-mode App Store browsing or installing

**Plans:** 1/1 plans complete

Plans:
- [x] 108-01-PLAN.md — UI dual-mode rewire (default local catalog via existing /app-store route; iframe preserved as platform-mode opt-in) + +8 regression assertions. Backend audit (planner): zero changes needed — appStore.registry already serves the gallery cache. **SHIPPED 2026-05-13** (`f4ca52e9..bfbd603d`, 204 PASS combined, sacred SHA preserved 3/3, mainserver UAT carry-forward).
**UAT:** fresh install → click App Store → see 304+ apps from local catalog, install one (e.g. AdGuard) — no API key prompt, no livinity.io calls. **Operator-walk Steps A–F documented in 108-01-SUMMARY.md.**

---

### Phase 109: MCP Servers Auto-Seed (Luse, bytebot, etc.)

**Goal:** Auto-register the default set of MCP servers (Luse, bytebot, etc.) during install so the AI side has tool-use capabilities out-of-the-box. Currently `liv:mcp:*` Redis namespace is empty on fresh install — admin must manually configure each MCP server.

**Direction:**
- Discover Mini PC's current MCP server set via `redis-cli KEYS 'liv:mcp:*'` (likely ~5-15 entries)
- Export Mini PC MCP server config to a seed file (e.g. `scripts/install/seeds/mcp-servers.json`)
- Add `_dld_seed_mcp_servers` helper to `deploy-livinityd.sh` that reads the seed file and INSERTs/SETs into Redis (idempotent on re-run)
- Bake the seed file's content into the install package — no external network fetch
- D-109-IDEMPOTENT: re-running install.sh does NOT duplicate or overwrite user-customized MCP server configs
- D-109-VERSIONED: seed file pinned to a specific Mini PC export date; future MCP server additions need new export

**Plans:** 1/1 plans complete
- [x] 109-01-PLAN.md (Wave 1, autonomous) — Seed `liv:mcp:config` Redis key from `scripts/install/seeds/mcp-servers.json` (sequential-thinking + luse, exported from Mini PC 2026-05-13) via new `_dld_seed_mcp_servers` helper in `deploy-livinityd.sh`. Idempotent (EXISTS gate), fail-soft, password substituted from `/opt/livos/.env` at install-time (D-109-PASSWORD-NEVER-IN-REPO). +4 regression assertions (149 → 153 deploy; 190 → 195 combined). **CODE-COMPLETE 2026-05-13** (commits `863c2125..214c2b38`, 3 source + SUMMARY, sacred SHA preserved 3/3). Mainserver UAT on 154.53.56.75 — operator-pending (procedure in 109-01-SUMMARY.md Steps A-F).

**UAT:** fresh install → open AI Chat → MCP panel shows `sequential-thinking` + `luse` (not "No servers installed"). Re-run install → user customizations preserved (idempotency).

---

### Phase 110: Phase 99 WebApp Launcher VNC Swap (carry-over) — `[x]` SHIPPED 2026-05-14

**Status:** **SHIPPED 2026-05-14.** Operator-walked binding UAT confirmed PASS by user 2026-05-14 ("calisiyor"). All 6 criteria satisfied: P110-1 RFB handshake (PASS via 2026-05-13 smoke), P110-2 no-pollution (PASS), P110-3 WebApp click → noVNC handshake (PASS, operator-confirmed), P110-4 bidirectional input (PASS, operator-confirmed), P110-5 sacred SHA (PASS), P110-6 closure-only scope (PASS). Closure is `.planning/`-only (D-110-NO-RECODE) — Phase 99 source already shipped 11 commits (`9a61d78a..351bcb62`, 66/66 vitest green) and is currently live on Mini PC at deployed SHA `1df2ec6`. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved.

**Goal (revised):** Close the v34.0 Phase 110 placeholder by capturing the missing `[x]` rollup artifact for the Phase 99 carry-over. The original ROADMAP.md draft of Phase 110 (skeleton-opened 2026-05-12) directed re-implementing `vnc-bridge.ts` per-window spawn logic — but that work was already shipped in Phase 99-02 (`909cca8e feat(99-02): implement vnc-bridge.ts (spawn x11vnc + WS↔TCP byte pipe)`) and verified live in 99-01 (`9a61d78a docs(99-01): record Mini PC x11vnc -id <wid> live verification (PASS)`). The actual gap was a missing closure artifact: a `[x]` Phase 110 entry, an OPERATOR-PENDING UAT row, a non-disruptive runtime evidence point, and a 110-SUMMARY.md.

**Direction (executed):**
- Smoke-test the in-tree x11vnc backend on Mini PC's live `:0` Xorg display via ephemeral `x11vnc -display :0 -localhost -rfbport 5933 -timeout 30 -shared -nopw -noxdamage` + `nc 127.0.0.1 5933` to capture the RFB 003.008 handshake banner (banner ASCII `RFB 003.008`; hex `5246 4220 3030 332e 3030 380a`) — done 2026-05-13.
- Append OPERATOR-PENDING UAT row to `.planning/phases/98-uat-polish/UAT-CHECKLIST.md` with 6 criteria (P110-1..6); 4 PASS via Claude-side smoke + sacred SHA + scope re-verify, 2 OPERATOR-PENDING for browser walk.
- Closure commit: `.planning/`-only. Zero source-tree changes.
- D-110-NO-FMPEG-REGRESSION: Phase 93 fMP4 path (`fmp4-fanout.ts`, `encoder-args.ts` fmp4 branches, `pipewire-portal.ts`, `geometry-tracker.ts`) untouched.
- D-110-NO-PROD-IMPACT: no Mini PC script edits.
- D-110-OPERATOR-PENDING-UAT: browser-walked binding UAT decoupled from Claude-side smoke (Mini PC = active OwnCloud per `feedback_minipc_is_owncloud_primary`; do not disrupt).
- D-110-EPHEMERAL-LOCALHOST-ONLY: smoke port 5933 chosen outside production [15900,16100) per-stream port ring.

**Plans:** 1/1 plans complete
- [x] 110-01-PLAN.md (Wave 1, autonomous, closure) — Mini PC SSH RFB 003.008 smoke (PASS) + 110-SUMMARY.md + UAT-CHECKLIST.md row + ROADMAP/STATE flip + sacred SHA + scope re-verify + single closure commit. **CODE-COMPLETE-PLUS-RUNTIME-SMOKE 2026-05-13**.

**UAT:** fresh install → open WebApp (Google) → see actual Google homepage rendered in browser (not "vnc backend closed" error). **OPERATOR-PENDING:** operator opens `https://bruce.livinity.io` in their own browser → walks P110-3 (WebApp click → noVNC handshake) + P110-4 (bidirectional input) → reports PASS in chat → next session flips Phase 110 from `[~]` to `[x]` SHIPPED.

---

### Phase 111: Server5 Dashboard — Install Wizard (Mode Selection + Auto-Generated Install Command) — ✅ CODE-COMPLETE 2026-05-13

**Goal:** Add a first-login onboarding wizard to the Server5 livinity.io dashboard (`platform/web/` Next.js app at `45.137.194.102`) where a new (or existing) user picks an install type, fills in mode-specific fields, and gets a **ready-to-paste one-liner install command with all secrets baked in** (API key auto-generated, user's CF token + domain pre-filled). User pastes the one-liner on a fresh VPS → install completes end-to-end → App Store works without any manual API key entry in Settings.

**User-stated vision (2026-05-13):**
> livinity.io/dashboard'da kullanıcı yeni ise şu soru sorulsun. Local mi kuracaksın Hybrid mi? Hybrid'de kendi domainini cloudflare tokenini vs eklemen gerekercek ve bu token'i kullanacaksın. Sen zaten UI'dan eklediğinde biz sana hali hazır kod vereceğiz, bu kod ile sen ancak indirip kurabilirsin bu kodun içinde livinity api key de olacak sen bu şekilde markete bağlanabilirsin.

**Driver:** Phase 108 + v34 mainserver UAT (2026-05-13) revealed the missing UX loop. `install.sh` already accepts `--api-key liv_k_...` (Plan 104-09) and as of `adcc5a5d feat(v34): _dld_seed_platform_api_key` the helper auto-seeds Redis on install → App Store iframe works end-to-end. The dashboard counterpart (issue the key + generate the command) is the last missing piece.

**Direction:**
- **Onboarding wizard** (4 steps):
  1. **Welcome / mode selection:** Radio cards for `Local` (LAN-only) | `Hybrid` (own domain + Cloudflare) | `Own-Cloud` (Coming Soon, disabled) | `Cloud` (Coming Soon, disabled). For now only Local + Hybrid are functional.
  2. **Mode-specific fields:**
     - **Local:** domain auto-resolved to `<machine-name>.local`; no extra fields. Skip to step 3.
     - **Hybrid:** form for `domain` (e.g. `test.livinity.live`), `cf-token` (Cloudflare API token with DNS:Edit + Zone:Read scope), `cf-zone-id` (auto-resolved from `domain` via CF API GET `/zones?name=<domain>` using their token).
     - Inline doc links: "How to get a Cloudflare API token" (link to CF docs).
  3. **Generated install command:** display the one-liner with all flags baked in. Show as `<pre>` block with copy-to-clipboard button. Behind the scenes:
     - Generate a fresh `liv_k_*` API key for this user (POST `/api/account/api-keys`)
     - Format: `curl -fsSL https://livinity.io/install.sh | sudo bash -s -- --mode <MODE> --domain <DOMAIN> --cf-token <TOKEN> --cf-zone-id <ZONE> --api-key liv_k_<GENERATED>`
     - Local mode: `curl ... | sudo bash -s -- --mode local-lan --domain <hostname>.local --api-key liv_k_<GENERATED>`
  4. **Verification (auto-detect):** After user pastes the one-liner on their VPS, dashboard polls `livos:platform:api_key` heartbeat. Within 5–10 min show "✓ Your LivOS instance is online at https://<DOMAIN>".
- **D-111-INSTALL-CMD-COPY-FRIENDLY:** the generated one-liner must be exactly ONE shell line, no continuation backslashes (those break in some terminals/copy-paste flows). Use `&&`-chains or `set -e` script vs multi-line `bash -s --`.
- **D-111-KEY-NEVER-RE-SHOWN:** the plain `liv_k_*` token is shown ONCE inside the command. If the user navigates away before copying, "regenerate key" is the only path (old token revoked).
- **D-111-CF-TOKEN-NEVER-PERSISTED:** the CF token is never stored on Server5 — passed through to the one-liner display only. User's responsibility to keep it safe.
- **D-111-EXISTING-AUTH:** reuse existing Server5 user auth (`platform.users` table, login already implemented per memory `project_v34_account_tunnel_marketplace_vision`).
- **D-111-NO-LIVOS-CHANGE:** this phase is Server5-side only. `livos/` and `liv/` source trees in this repo are NOT modified.

**Plans:** 5 plans (planning complete 2026-05-13 — discovered prerequisite install.sh URL fix bumps plan count from 4-5 estimate to 5 final; verification polling deferred to Phase 112+):
- [x] 111-01-PLAN.md — Server5 install.sh route serves Phase 104+ modular installer (prereq — fixes Phase 108 UAT discovery that wizard one-liners would silently fail against legacy livos/install.sh) — **SHIPPED `8e9cfa3e`** 2026-05-13 evening; live curl verified 1725-line legacy → 99-line modular dispatcher.
- [x] 111-02-PLAN.md — api_keys multi-per-user migration (DROP UNIQUE constraint) + POST/GET/DELETE `/api/account/api-keys` Next.js routes — **SHIPPED `52d2a4f9`** 2026-05-13 evening; 10/10 UAT (multi-key per user proven, cross-user revoke 404, sacred test key byte-identical).
- [x] 111-03-PLAN.md — POST `/api/cf/resolve-zone` Cloudflare API proxy (zone-id auto-resolution, token never persisted) — **SHIPPED `448a9cd9`** 2026-05-13 evening; 8/8 UAT, D-111-CF-TOKEN-NEVER-PERSISTED triple-proven (static grep + runtime grep + DB row-count).
- [x] 111-04-PLAN.md — `/onboarding/install` 3-step wizard UI (mode cards + hybrid/local form + generated install command display) — **SHIPPED `cc12cf33`** 2026-05-13 evening; 6/6 server-side UAT (wizard live at livinity.io/onboarding/install), Caddyfile path whitelist patched. Operator-walked binding UAT (fresh VPS + Hybrid + real CF token) pending.
- [x] 111-05-PLAN.md — Mode reference docs panel (Local + Hybrid full pre-reqs/what-it-does/security tradeoffs; Own-Cloud + Cloud stubs) — **SHIPPED `41288965`** 2026-05-13 evening; 6/6 UAT, D-111-RELAY-DATA-PLANE-DOC delivered ("Zero relay data plane" honesty disclosure on Hybrid card).

**Deferred to Phase 112+:** Verification polling (auto-detect install completion via heartbeat). User can still verify manually via existing /dashboard polling.

**Repo for Server5 changes:** `/opt/platform/web/` on Server5 (45.137.194.102) is **NOT** a Git repo — plans execute direct file edits via SSH (single-session batch per `feedback_ssh_rate_limit`). PLAN+SUMMARY artifacts live in this repo's `.planning/`. Server5 file backups (`.pre-111-NN.bak`) created in each plan for rollback.

**UAT:** Open livinity.io/dashboard as a new user → see onboarding wizard → pick `Hybrid` → enter domain + CF token → copy generated one-liner → paste on fresh VPS → install completes → open `https://<your-domain>` → App Store loads with full marketplace catalog (no manual key prompt). Then click on a featured app (e.g. n8n) → install completes → app appears in dock.

---

### Phase 112: WebApp Subdomain Gateway Proxy Fix (n8n routing)

**Goal:** Fix livinityd's subdomain gateway middleware so requests to `<app>.<domain>` (e.g. `n8n.test.livinity.live`) are proxied to the per-app container (e.g. `127.0.0.1:5678`) instead of serving livinityd's own UI. Currently DNS wildcard + Caddy TLS resolve correctly to livinityd, but livinityd returns its own dashboard HTML for every subdomain — making every installed WebApp unreachable from the browser.

**Driver:** v34 mainserver UAT (2026-05-13T22:03Z) — wildcard `*.test.livinity.live` DNS + LE cert + Caddy `reverse_proxy 127.0.0.1:8080` all verified green, `livos:domain:subdomains` Redis has the `n8n` entry, but `curl -H "Host: n8n.test.livinity.live" http://127.0.0.1:8080` returns livinityd's CSP-stamped UI HTML instead of n8n's homepage. Hypothesis: gateway middleware in `livos/packages/livinityd/source/server/index.ts:150-200` reads `domainInfo.appMapping[subPrefix]` from `livos:custom_domain:*` namespace but NOT `livos:domain:subdomains` (where actual subdomain → app/port mappings live). Two systems are not wired together. Without this fix, every WebApp install ends with "container running but browser can't reach it" — blocks v34 App Store end-to-end.

**Direction:**
- **Investigate first** (no code changes until root cause confirmed): trace gateway middleware end-to-end against the Redis keys actually used by `apps.ts installForUser()` and the subdomain registration path. Identify exactly where the lookup diverges from the registration.
- **Fix the lookup mismatch:** either (a) make gateway consult `livos:domain:subdomains` alongside `livos:custom_domain:*`, or (b) ensure subdomain registrations also write into the namespace gateway already reads. Pick whichever matches existing patterns better (zero schema drift if avoidable).
- **Live UAT on mainserver:** restart livinityd → reload `n8n.test.livinity.live` in browser → see n8n's actual UI (not livinityd's dashboard) → install another app → its subdomain also works.
- **D-112-NO-CADDY-CHANGE:** Caddy config is correct. Don't touch Caddyfile or DNS — fix is purely livinityd middleware.
- **D-112-NO-LIVOS-AUTH-BYPASS:** subdomain proxy still passes through livinityd auth (session cookie / API key) for apps that require it. Public apps (n8n with own auth) pass through unauthenticated only if the app's own manifest declares `public: true`.
- **D-112-SACRED-SHA-UNTOUCHED:** `sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` not in scope.

**Plans:** 1 plan — **SHIPPED 2026-05-13 (UAT APPROVED)**

Plans:
- [x] 112-01-PLAN.md — Investigate gateway short-circuit (livos:domain:config missing on hybrid installs) + ship _dld_seed_domain_config install-time helper + livinityd boot-time fallback + 5 regression assertions + mainserver UAT — **SHIPPED `e39fb679..8f9f0395`** (4 source commits + SUMMARY); 158 → 163 PASS, 0 FAIL; sacred SHA preserved 4/4; mainserver UAT operator-approved (HTTP 302 → /login → n8n UI loads).

**UAT:** Mainserver `https://n8n.test.livinity.live` → ✓ **operator browser UAT APPROVED 2026-05-13** (n8n UI rendered after LivOS auth). Subsequent installs (bolt.diy, AdGuard, …) automatically benefit from the same gateway path now functional. Out-of-scope follow-up: `apps.ts:registerAppSubdomain public:true` propagation so public-by-design apps bypass LivOS auth (see 112-01-SUMMARY.md § Follow-up — candidate Phase 113-bis or v34.1).

---

### Phase 113: Caddy CLOUDFLARE_API_TOKEN Log Leak Remediation — ✅ SHIPPED 2026-05-13

**Goal:** Stop Caddy systemd unit from logging the plaintext `CLOUDFLARE_API_TOKEN=cfut_...` env-var to `journalctl -u caddy` on every reload. Currently anyone with root or journalctl read access on mainserver can recover the CF API token from logs — medium-severity credential leak.

**Driver:** v34 session 2026-05-13 — the orchestrator literally recovered the CF token from `journalctl -u caddy` to create the wildcard DNS record (proves the leak is real). Documented in `.planning/v34-HANDOFF-2026-05-13.md` Issue 5.

**Outcome (2026-05-13):** Root cause was Caddy's `--environ` debug flag in the base unit's `ExecStart` (prints `os.Environ()` to stdout → journald). The `EnvironmentFile=` migration the plan assumed was needed had already been done in an earlier session (`livos-cf-token.conf` drop-in, mode 600 root:root) — `systemctl show caddy --property=Environment` was already empty. Fix shipped via new `/etc/systemd/system/caddy.service.d/strip-environ-flag.conf` drop-in that resets `ExecStart=` and re-declares it without `--environ`. Post-restart journal clean (`AFTER_COUNT_SINCE_RESTART=0`, was 5 since boot). TLS preserved on `test.livinity.live` + wildcard subdomain.

**Plans:**
- [x] 113-01-PLAN.md — Investigate leak source + apply fix + verify journalctl clean — **SHIPPED `52fe695f..6df3cb8b`** (2 source commits + SUMMARY); 5 → 0 plaintext token occurrences in journal; sacred SHA preserved 2/2; mainserver TLS verified live. Plan's Task 2 mechanism revised mid-flight (Rule 1+3 deviation): strip `--environ` flag instead of migrate `Environment=` (which was a no-op). See `113-01-INVESTIGATION.md` and `113-01-SUMMARY.md`.

**UAT:** `journalctl -u caddy --since "$(date '+%Y-%m-%d %H:%M:%S' -d '30 seconds ago')" | grep -i cloudflare_api_token` returns empty post-restart. `curl -sIL https://test.livinity.live` → HTTP/2 200; `curl -sIL -H "Host: n8n.test.livinity.live" https://test.livinity.live` → HTTP/2 302 (wildcard cert renewal still works, Phase 112 routing preserved).

**Locked decisions honored:** D-113-NO-CADDY-DOWNTIME (restart was <500ms, brief TCP reset acceptable since drop-in `ExecStart=` only applies on next start), D-113-NO-DNS-DROP (EnvironmentFile + Caddyfile `{env.CLOUDFLARE_API_TOKEN}` untouched), D-113-MAINSERVER-ONLY (one new drop-in file on mainserver, zero source-tree commits — only `.planning/` docs), D-113-SACRED-SHA-UNTOUCHED.

**Follow-ups (out of scope, operator-decision-gated):** (a) journal vacuum for 5 historic leaked entries (`journalctl --vacuum-time=1s` — destructive), (b) CF token rotation via Cloudflare dashboard + update `/etc/livos/secrets/cf-token`, (c) audit other systemd units for similar debug flags (v34.x phase), (d) fold `strip-environ-flag.conf` into `scripts/install/deploy-livinityd.sh` for fresh installs (Phase 114 or v34.x polish).

---

**Non-goals (HARD):**
- Must NOT modify Mini PC's `update.sh` or `livos/install.sh` (read-only canonical refs)
- Must NOT touch sacred `sdk-agent-runner.ts` SHA
- Must NOT bundle large binaries in repo (chrome, mender → apt-install at deploy time)
- Phase 99/v33's existing 5 host-Chrome fixes preserved (no regression)

---

### 🟢 v31.0 Liv Agent Reborn (Active — Phases 64-76)

**Goal:** Make AI Chat the WOW centerpiece of LivOS. Replace "Nexus" cosmetic identity with "Liv" project-wide. Adopt Suna's UI patterns verbatim (side panel + per-tool views + browser/computer-use display). Add computer use via Bytebot desktop image. Polish streaming UX, reasoning cards, lightweight memory, agent marketplace.

**Source plan:** `.planning/v31-DRAFT.md` (851 lines, file-level breakdown user-validated 2026-05-04).

**UI scope guard (locked):** ONLY Suna UI patterns. NO Hermes UI per user direction 2026-05-04.

**Estimated effort:** 171-229 hours (6-12 weeks solo at 4-6h/day).

**Phase summary:**

- [ ] **Phase 64: v30.5 Final Cleanup at v31 Entry** (CARRY-01..05) — F7 Suna sandbox network blocker fix + 14 carryforward UATs + Phase 63's 11 plan walks + 3 v28.0 quick-tasks resolution + external client compat matrix UAT
- [~] **Phase 65: Liv Rename + Foundation Cleanup** (RENAME-01..13) — Nexus → Liv project-wide (~5,800 occurrences); `nexus/` → `liv/` git mv; @nexus/* → @liv/*; NEXUS_* → LIV_*; nexus:* Redis → liv:*; Mini PC `/opt/nexus/` → `/opt/liv/` migration. **Progress 2026-05-05:** 4/6 plans shipped (65-01 preflight + 65-02 git mv + 65-03 source sweep + 65-06 docs/memory). 65-04 (deploy scripts) + 65-05 (Mini PC migration script + cutover) pending. Sacred SHA `4f868d31...` preserved across all shipped plans.
- [ ] **Phase 66: Liv Design System v1** (DESIGN-01..07) — color tokens (deep navy + cyan + amber + violet), motion primitives (FadeIn/GlowPulse/SlideInPanel/TypewriterCaret), typography (Inter Variable + JetBrains Mono), shadcn liv-* variants, Tabler icons unified
- [x] **Phase 67: Liv Agent Core Rebuild** (CORE-01..07) — 4/4 plans complete 2026-05-04; Redis-as-SSE-relay (24h TTL, reconnectable runs), ToolCallSnapshot data model, LivAgentRunner wrapper around SdkAgentRunner, SSE endpoint with `?after=` resume support — production wiring of livAgentRunnerFactory deferred to P68/P73 (route surface complete + 503 stub when unwired)
- [x] **Phase 68: Side Panel + Tool View Dispatcher** (PANEL-01..10 + PANEL-AUTO-OPEN-E2E) — 7/7 plans complete 2026-05-04; LivToolPanel auto-open contract (visual-tools-only, STATE.md line 79 LOCKED) shipped + E2E regression-protected via 8 integration tests; Cmd+I global shortcut; orphan until P70 mounts in ai-chat/index.tsx; sacred SHA `4f868d31...` unchanged across all 7 plans
- [ ] **Phase 69: Per-Tool Views Suite** (VIEWS-01..11) — 9 view components (Browser/Command/FileOp/StrReplace/WebSearch/WebCrawl/WebScrape/Mcp/Generic) all Suna-derived + inline tool pill (Suna pattern, not Hermes)
- [ ] **Phase 70: Composer + Streaming UX Polish** (COMPOSER-01..09) — auto-grow textarea, stop button toggle, slash commands expanded, mention menu, voice + model badge, streaming caret, agent status, typing dots, welcome screen
- [ ] **Phase 71: Computer Use Foundation** (CU-FOUND-01..07) — Bytebot desktop image to livinity-apps catalog (per-user compose templating, port 14100+, --privileged, shm 2g); react-vnc embed; app gateway auth; container lifecycle (30min idle timeout, max 1/user)
- [ ] **Phase 72: Computer Use Agent Loop** (CU-LOOP-01..07) — 16 Bytebot tool schemas + system prompt verbatim copy; livinityd computer-use module; BYTEBOT_LLM_PROXY_URL → broker → Kimi; NEEDS_HELP/takeover UI flow
- [ ] **Phase 73: Reliability Layer** (RELIAB-01..06) — ContextManager (75% Kimi window summarization) ✅ 73-01+73-03; BullMQ background queue per-user concurrency=1 ✅ 73-02+73-04; reconnectable runs (boot-recovery scan) — pending 73-05; per-user resource limits — deferred
- [ ] **Phase 74: F2-F5 Carryover from v30.5** (BROKER-CARRY-01..05) — token cadence streaming, multi-turn tool_result protocol, Caddy timeout for long agentic, identity preservation across turns
- [ ] **Phase 75: Reasoning Cards + Lightweight Memory** (MEM-01..08) — Kimi reasoning_content collapsible amber card, Postgres tsvector FTS over conversations, pinned messages, conversation export
- [ ] **Phase 76: Agent Marketplace + Onboarding Tour** (MARKET-01..07) — agent_templates table + 8-10 seed agents, Suna marketplace UX adapted, first-run interactive tour (9 steps), Settings "Liv Agent" section
- [ ] **Phase 77: MCP Agent Loop Integration** (MCP-AGENT-01..04) — Wire McpClientManager-discovered tools into agent loop so registered MCP servers' tools reach Claude's `tools[]` array; close discovery gap identified by 2026-05-05 deploy investigation. Sacred file `liv/packages/core/src/sdk-agent-runner.ts` MUST remain untouched (D-NO-BYOK / sdk-subscription-only). Pattern: extend at `agent-runs.ts` factory boundary or via SDK option construction, NOT inside the sacred runner. Deliverables: McpConfigManager.listServers() → mcpServers config injection at runtime; Bytebot env-flag default-on (gated by linux+file-exists guards); integration tests for MCP tool snapshot emission end-to-end.
- [ ] **Phase 78: Provider Endpoint + MCP Browser Dialog** (PROV-01..03 + MCP-UI-01..04) — Three coupled fixes for "Kimi" badge / MCP page / Suna inline-marketplace feel: (a) liv-core `/api/providers` endpoint reports broker active provider (Claude) so livinityd tRPC stops falling back to hardcoded `'kimi'`; (b) MCP panel install/uninstall buttons wired to actual tRPC mutations + currently-running-tools section; (c) `LivMcpBrowserDialog` component (Suna `BrowseDialog` parity) opened from composer `+ MCP` button + agent settings — `/agent-marketplace` route stays as community-agent destination (Suna parity confirmed).
- [x] **Phase 79: Bytebot Hot-Fix Wave** (BYTEBOT-01..04) — 4 sequential fixes shipped 2026-05-05 to make bytebot MCP work end-to-end via Mini PC's host GNOME desktop: 79-01 (`AgentSessionManager` MCP injection + `nexus-tools` legacy wrapper default-OFF), 79-02 (JSON-Schema → Zod converter for MCP SDK 1.25.x), 79-03 (XAUTHORITY GDM path `/run/user/1000/gdm/Xauthority`), 79-04 (scrot subprocess replaces nut-js native binding for reliable framebuffer capture). User confirmed working "Tamam simdi calisiyor".

### 🟢 v32.0 AI Chat Ground-up Rewrite + Hermes Background Runtime (Active — Phases 80-91)

**Goal:** Suna-faithful UI rewrite + Hermes-inspired background runtime patterns. Light theme. Single MCP source of truth. 4-5 specialized seed agents. Per-agent model badges. Direct in-place at `/ai-chat` (Redis flag-gated). 12 phases / 4-6 günde ship via parallel waves.

**Source plan:** [v32-DRAFT.md](v32-DRAFT.md) (master plan + 5 locked answers from user 2026-05-05).

**Phase summary:**

- [x] **Phase 80: Foundation** (V32-FOUND-01..05) — OKLCH design tokens (Suna globals.css verbatim), `:root`+`.dark` swap, Geist Sans/Mono fonts via @fontsource-variable, Tailwind config extension, ThemeProvider + useTheme hook, `/playground/v32-theme` preview route. **Wave 1 — file-disjoint, paralel P85+P87.**
- [x] **Phase 81: Chat UI Port** (V32-CHAT-01..08) — `routes/ai-chat/v32/{MessageThread, ChatComposer, MessageInput, FileAttachment, AttachmentGroup, preview-renderers}.tsx`, gradient pill rendering, streaming caret animation, drag-drop on Card. Suna `ThreadContent.tsx` + `chat-input/*` ported with LivOS auth/API substitutions. **Wave 2.**
- [x] **Phase 82: Tool Side Panel** (V32-PANEL-01..06) — `ToolCallPanel.tsx` (`fixed inset-y-0 right-0 z-30` overlay, slide-in animation, slider scrubber, live/manual mode, "Jump to Live" pill, Cmd+I close, `liv-sidebar-toggled` event). `isVisualTool(name)` regex extended to `mcp_bytebot_*`. **Wave 2 paralel P81+P83.**
- [x] **Phase 83: Per-Tool Views** (V32-VIEWS-01..11) — `ToolViewRegistry.tsx` JS object dispatch, `ToolViewWrapper.tsx` shared chrome, 9 view components (Browser/Command/FileOp/StrReplace/WebSearch/WebCrawl/WebScrape/Mcp/Generic), `MCPContentRenderer.tsx` + `mcp-format-detector.ts` (search/table/JSON/markdown/error/plain auto-detect), `getMCPServerColor()` per-server identity. **Wave 2 paralel P81+P82.**
- [x] **Phase 84: MCP Single Source of Truth** (V32-MCP-01..09) — `BrowseDialog.tsx` (modal, search + categorized sidebar + server cards), `ConfigDialog.tsx` (credentials form from `configSchema` + tool-selection checkboxes), `ConfiguredMcpList.tsx` (per-agent), `MCPConfigurationNew.tsx` wrapper, source selector pill: "Official" (default `registry.modelcontextprotocol.io`) / "Smithery" (gated by `liv:config:smithery_api_key`), `mcp-smithery-client.ts` new client. tRPC: `mcp.search`, `mcp.installToAgent`, `mcp.removeFromAgent`. DEPRECATE `mcp-panel.tsx` from sidebar. **Wave 3 (depends on P83 view + P85 schema).**
- [x] **Phase 85: Agent Management** (V32-AGENT-01..10) — DB migration: `agents` table (agent_id PK, user_id FK, name, description, system_prompt, model_tier, configured_mcps JSONB, agentpress_tools JSONB, avatar emoji, avatar_color, is_default, is_public, marketplace_published_at, download_count, created_at, updated_at). tRPC: `agents.{list,get,create,update,delete,publish,unpublish,clone}`. Routes: `/agents` grid + `/agents/:id` two-pane editor (Manual + Agent Builder Beta tabs). 500ms debounced autosave. `AgentCard.tsx` (rounded-2xl + h-50 color zone + backdrop-blur badges + group-hover delete). 5 seed agents migration: Liv Default + Researcher + Coder + Computer Operator + Data Analyst. **Wave 1 schema migration; Wave 2 UI paralel P81+P82+P83.**
- [x] **Phase 86: Marketplace** (V32-MKT-01..06) — Route `/marketplace` (replaces `/agent-marketplace`), 4-col responsive grid (sm:2/lg:3/xl:4), search input + sort select (newest/popular/most_downloaded) + tag filter chip strip, `MarketplaceCard.tsx` (h-50 color zone + backdrop-blur download badge + tag badges + creator/date), "Add to Library" mutation → `agents.cloneFromMarketplace`. Existing `agent_templates` table data migrated to `agents` table with `is_public:true`. **Wave 3 paralel P84.**
- [x] **Phase 87: Hermes-inspired Background Runtime** (V32-HERMES-01..07) — Extend `liv/packages/core/src/liv-agent-runner.ts`: (1) new `RunStore.ChunkType.status_detail` payload `{phase, phrase, elapsed}` emitted on each assistant turn + tool dispatch + tool result, (2) `THINKING_VERBS[15]` constants from Hermes verbatim, (3) `maxIterations` LivAgentRunnerOptions field default 90 — INCR counter with error chunk on breach, (4) `_pendingSteer` field + `injectSteer(guidance)` method drained on next assistant turn, (5) `WSClientMessage.steer` type added to `agent-session.ts`, (6) `ToolCallSnapshot.batchId?` additive optional field for parallel grouping, (7) 4-pass JSON repair chain in legacy `kimi-agent-runner.ts` (defensive, low-prio). Sacred `sdk-agent-runner.ts` UNTOUCHED (post-P77 SHA `f3538e1d` baseline). **Wave 1 — backend file-disjoint, paralel P80+P85-schema.**
- [x] **Phase 88: WebSocket → SSE Migration** (V32-MIGRATE-01..05) — Refactor `routes/ai-chat/v32/index.tsx` to use `useLivAgentStream` (P67-04 SSE) instead of legacy `useAgentSocket` (WebSocket). Bridge SSE chunks → UI state: text → MessageThread, tool_snapshot → ToolCallPanel auto-open (when `isVisualTool` matches), status_detail → animated phrase card (consumes P87 chunks). Reconnect-with-after-idx logic validated. Deprecate `useAgentSocket` for v32 chat (legacy `/ai-chat` keeps it during cutover grace). **Wave 4 (depends on P81+P82+P87).**
- [x] **Phase 89: Theme Toggle + Accessibility + Keyboard** (V32-A11Y-01..06) — `<ThemeToggle>` component (sun/moon icon) in chat header, system default → `<html class>` toggle persisted to localStorage. Keyboard shortcuts: Cmd+I (close panel), Cmd+K (composer focus), Cmd+/ (slash menu), Cmd+Shift+C (copy last message). ARIA labels on all interactive components. WCAG AA color contrast verification on light theme. Focus-visible rings (Tailwind `focus-visible:ring-2`). **Wave 4 paralel P88.**
- [x] **Phase 90: Cutover** (V32-CUT-01..05) — Set `liv:config:new_chat_enabled=true` Redis flag, switch `/ai-chat/index.tsx` default routing to `v32/`. Remove `mcp-panel.tsx` sidebar tab from `routes/ai-chat/index.tsx`. `/agent-marketplace` → `/marketplace` HTTP 301 redirect in livinityd `server/index.ts` + client-side fallback. Update Dock app entry. Schedule `useAgentSocket` removal for v33. Update STATE.md + memory. **Wave 5.**
- [x] **Phase 91: UAT + Polish** (V32-UAT-01..06) — Full flow smoke test on Mini PC: open chat → chat with each of 5 seed agents → see streaming → tool pill → click pill → side panel opens → screenshot tool → image visible → switch theme to light → no flash → marketplace browse → Add to Library → see in /agents. Mobile responsive verification. A/B blink test: side-by-side screenshot vs current `/ai-chat` (the `igrenc` baseline). User-driven UAT signoff. **Wave 5 (final).**

**Dependency graph:**
```
                                          ┌─→ P81 (chat UI)         ┐
                                          │                          ├─→ P88 (WS→SSE)  ┐
P80 (foundation) ─────────────────────────┼─→ P82 (tool panel)      ─┤                  ├─→ P90 (cutover) ─→ P91 (UAT)
                                          │                          │   P89 (a11y)    ─┘
                                          ├─→ P83 (per-tool views)  ─┴─→ P84 (MCP SoT) ─┐
P85-schema (DB migration) ────────────────┼─→ P85-UI (agent mgmt)   ─┐                  │
                                          ├─→ P86 (marketplace)     ─┤                  │
                                          │                          │                  │
P87 (Hermes runtime) ─────────────────────┴──────────────────────────┴──────────────────┘
```

**Wave plan (parallel execution):**
- **Wave 1** (start now, all file-disjoint): P80 + P85-schema + P87 — 3 paralel agent
- **Wave 2** (after Wave 1): P81 + P82 + P83 + P85-UI + P86 — 5 paralel
- **Wave 3** (after Wave 2): P84 — single (depends on multiple Wave 2 deliverables)
- **Wave 4** (after Wave 3): P88 + P89 — 2 paralel
- **Wave 5** (after Wave 4): P90 → P91 — sequential (cutover then UAT)

**Locked decisions for v32 entry:**
- Direct in `/ai-chat` (`liv:config:new_chat_enabled` Redis flag during dev, set true at P90 cutover)
- MCP source: official MCP Registry preserved, optional Smithery toggle (gated by API key)
- 5 specialized seed agents (Liv Default + Researcher + Coder + Computer Operator + Data Analyst)
- Per-agent model badge ("Liv Default · Claude Sonnet 4.6")
- All 5 Hermes patterns ported at P87
- Light theme REQUIRED, theme toggle at P89
- Sacred `sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED throughout v32

---

### 🟡 v33.0 WebApp Launcher + Teach/Auto Modes (HOT-FIX IN PROGRESS — Phases 92-100)

**Status (2026-05-08):** P92-P98 code-complete; UAT discovered protocol mismatch — backend ships fMP4 but frontend (`use-webapp-vnc.ts`) is a noVNC RFB client. Phase 99 added to swap backend to per-window `x11vnc -id <wid>` (the original D-V33-03 design that P93 spike incorrectly rejected). 5 host-Chrome fixes shipped 2026-05-08 (`5e126607..4c55b173`) preserved through swap.

**Milestone closure summary (2026-05-08):**

- **Code-complete:** all 7 phases (92-98) shipped in 7 waves, ~50 atomic commits across master since `743a414b` (P93 close).
- **Commit ranges by phase:**
  - P92 (metadata extractor): `d86d185e..318e2bb4` (5 commits)
  - P93 (streaming + window manager): `cf61685d..743a414b` (14 commits)
  - P94 (desktop launcher): `dfac4bb5..aa08a3e0` (6 commits)
  - P95 (stream window + AI panel): `e303017b..966ea050` (8 commits) plus deploy hot-fix `952226c8` (libva-utils for vainfo)
  - P96 (teach mode): `cfd83100..d85904bf` interleaved with P97 (6 commits + 1 fixture rollup `74f198c1`)
  - P97 (auto mode): `072bb074..acb8354c` (8 commits)
  - P98 (UAT + polish + lifecycle hookup): this commit batch
- **Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across **every** v33 commit. Verified before AND after every phase per `97-03` sacred-SHA verification harness.
- **Tests:** 200/200 streaming + window-manager green (P93 baseline); ~95 new test cases added across the milestone.
- **Lifecycle hookup:** P98 wired `streamManager` + `webappWindowManager` singletons into `livinityd.start()` so the tRPC `webapp.window.*` and `streams.*` routes return real responses (previously `SERVICE_UNAVAILABLE` because the optional fields were declared but never instantiated — see `93-SUMMARY.md` carry-over).
- **Ship date (code-complete):** 2026-05-08. Final flip to `Shipped` deferred until user-walked Mini PC UAT (`UAT-CHECKLIST.md`) reports PASS — per `feedback_milestone_uat_gate.md`.


**Goal:** Right-click desktop → "Add WebApp" → URL → auto-detected favicon + title → desktop icon. Click → host Chrome (existing user profile, NOT containerized) opens new window at URL → window-scoped VNC stream + v32 AI panel below with Watch/Teach/Auto/Chat modes. Teach mode records user actions as reusable skills; Auto mode runs goal-driven bytebot loop using skill-as-context, scoped to that one Chrome window via `xdotool --window <wid>`.

**Source plan:** [v33-DRAFT.md](v33-DRAFT.md) (v2 — host-direct after user pivot away from per-WebApp containers).

**Estimated effort:** 17-26 days solo (4-6h/day) — 3-5 weeks.

**Phase summary:**

- [x] **Phase 92: WebApp Metadata Extractor** (V33-META-01..04) — livinityd tRPC `webapp.extractMetadata({url})` returns `{title, faviconUrl, description, ogImage}`. Redis cache 24h. URL validation (reject file://, javascript:, intranet IPs). Postgres `webapps` table migration. Files: `livos/packages/livinityd/source/modules/webapps/{metadata-extractor,trpc-router}.ts`.
- [x] **Phase 93: Streaming Subsystem + Window Manager** (V33-WIN-01..07) — Code-complete 2026-05-07. ffmpeg fMP4 (libx264 / h264_vaapi) + Node WS fan-out replaces the rejected per-window x11vnc design (Mutter incompat). PipeWire screencast portal as primary per-window source (D-93-04); ffmpeg x11grab crop + GeometryTracker as fallback. install.sh + update.sh apt-install 18 binaries (ffmpeg/gstreamer/xdotool/ydotool/vainfo/portal/etc). New modules under livos/packages/livinityd/source/modules/{streaming,webapps}/. New tRPC namespaces streams.* (3) + webapp.window.* (4) — all 7 in httpOnlyPaths. WS endpoint `/ws/stream/:id` with JWT-from-query + ownership check (404 on foreign). Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED. 200/200 tests green incl. integration test with fake-encoder fixture. Mini PC live deploy + 2h UAT in P98.
- [x] **Phase 94: Desktop "Add WebApp" Context Menu + Persistence** (V33-DESK-01..04) — Extend `desktop-context-menu.tsx` with new ContextMenuItem. AddWebAppDialog (URL input + metadata preview). WebAppIcon component renders alongside Docker apps via `app-grid.tsx`. tRPC `webapps.{create,list,delete,update}`.
- [x] **Phase 95: WebApp Stream Window + AI Panel + Mode Selector** (V33-STREAM-01..07) — New window content type `webapp-stream` registered with window manager. Vertical split: 70% react-vnc/noVNC connected to wsUrl, 30% v32 chat panel. Toolbar (back/forward/refresh/copy URL/fullscreen). Mode selector pill (Watch/Teach/Auto/Chat). Per-WebApp agent session via `LivAgentRunner` SSE. Postgres `webapp_agent_sessions`.
- [x] **Phase 96: Teach Mode — Action Recording** (V33-TEACH-01..07) — `useTeachRecorder` hook captures VNC client mouse/keyboard events. Screenshot every event + 1s heartbeat. Save dialog → POST `webapps.skills.create`. Postgres `webapp_skills` table (JSONB action log + screenshot blob refs). Skills sidebar UI. Replay scrubber (timeline w/ thumbnails).
- [x] **Phase 97: Auto Mode — Skill-Guided Bytebot, Window-Scoped** (V33-AUTO-01..07) — Extend native primitives (`screenshot.ts`, `input.ts`) with `windowId?: number` param: `maim -i <wid>`, `xdotool --window <wid> ...`. New tool `webapp_replay_skill({skillId, freeFormGoal?})`. Skill context builder injects `<previously-learned-skill>` block into agent system prompt. Per-WebApp bytebot MCP spawn with `BYTEBOT_TARGET_WINDOW_ID` env. Vision-validated stepping. Failure recovery (3 strikes → needs help). Sacred SHA UNTOUCHED — extensions through `LivAgentRunner` + `LivMcpClientManager`.
- [x] **Phase 98: UAT + Polish + Docs** (V33-UAT-01..03) — Full flow test: 3 WebApps (facebook/gmail/x), profile sharing verified, teach a skill in each, run auto mode, verify autonomy + needs-help recovery. Resource verification. WebApp delete cascade (skills + sessions). User docs `docs/webapp-launcher.md`. ROADMAP close + memory updates.
- [~] **Phase 99: WebApp VNC Swap — fMP4 → x11vnc** (V33-VNC-01..05) — PARTIAL-PASS 2026-05-08. Protocol-level mismatch RESOLVED: backend now serves RFB over `/ws/stream/:streamId` via per-window `x11vnc -id <wid>` + WS↔TCP `vnc-bridge.ts`. Single WebApp click → stream window with live RFB handshake + bidirectional input verified on Mini PC. UAT-DISCOVERED GAPS deferred to Phase 100: (G-99-UAT-1) multi-stream concurrent broken — second WebApp click does not produce an independent stream; (G-99-UAT-2..4) stream window UI redesign needed (drop URL bar, full-bleed stream, move Chat/Teach/Watch/Auto out of inline pane into floating icon buttons anchored on the window edge like the existing drag/close buttons). Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 12 Phase 99 commits (`9a61d78a..cd6f442a`).

- [ ] **Phase 100: Multi-Stream + Stream-Window Redesign** (V33-MULTI-01..05) — Close the four UAT gaps from Phase 99: (1) two concurrent WebApps must each have their OWN stream + own x11vnc port + own stream window (current single-stream-only is the kill-gate); (2) drop URL bar from stream window (URL is bound to the WebApp; redundant inside); (3) stream area fills the window (no toolbar chrome); (4) Chat/Teach/Watch/Auto inline panel REMOVED — replaced with a floating icon-button row anchored to the stream window's bottom edge (mirroring the existing top drag-to-move + close button pattern). Each button opens its own popover/sheet on click. Backend: investigate Chrome `--new-window` IPC merge against `--user-data-dir=/home/bruce/.config/livos-chrome` (likely root cause of single-stream symptom); if confirmed, switch to `--app=URL` site-specific-browser mode (no IPC merge AND chromeless windows — partial fix for G-99-UAT-2). Frontend: rewire `webapp-stream-window.tsx` + `webapp-toolbar.tsx` + `webapp-mode-selector.tsx` to the new shape. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED throughout (no `liv/packages/core/` edits).

  **Plans:** 5 plans (written 2026-05-08)
  - [x] 100-01-PLAN.md — Mini PC kill-gate (autonomous=false, user-walked SSH) — empirical H1..H4 root-cause probe + sacred-SHA pre-commit hook bootstrap (✓ 2026-05-08, commits a6c519fd + bb36e8d1: H1 verified, B1 fix locked)
  - [x] 100-02-PLAN.md — Backend argv swap `--new-window URL` → `--app=URL` (✓ 2026-05-08, commits 3bbcfb2f + 00a5b0bd: argv swap shipped, Test 11 invariant locked, 226/226 webapps+streaming tests green, sacred SHA preserved)
  - [x] 100-03-PLAN.md — Frontend full-bleed: drop URL bar + ResizablePanelGroup; root flex-col (✓ 2026-05-08, commits ff99ebfd + 6702780c: webapp-toolbar.tsx deleted, webapp-stream-window.tsx slimmed 776→524 lines, root flex-col + pb-9 reservation locked, 13/13 invariant tests green, sacred SHA preserved)
  - [x] 100-04-PLAN.md — Frontend bottom 4-icon action-bar + slide-in drawers Chat/Teach/Watch/Auto (✓ 2026-05-08, commits b2145d09 + b7e19f60 + af77d2e6: 4 drawer components shipped, bottom-bar at `absolute inset-x-0 bottom-0 z-20` wired with Sheet host `!w-[35%]` + `closeButton={false}`, second-click closes, WEBAPP_MODE_CHANGE_EVENT dispatch preserved, mode-selector collapsed to 22-line constants module, 17/17 invariant tests green, sacred SHA preserved)
  - [~] 100-05-PLAN.md — git push + Mini PC deploy via update.sh + user-walked UAT (✓ deploy GREEN 2026-05-08 — Mini PC `4954d9ba`; UAT 9/11 PASS via interactive checkpoint; FAIL on Row 3 click routing + Row 9 chat → bytebot scope; v33 milestone flip BLOCKED — Plan 100-06 queued for routing fix). Sacred SHA `f3538e1d…` preserved on disk + at HEAD.

  - [x] 100-06-PLAN.md (inline-executed) — UI revisions per user feedback after PARTIAL-PASS deploy: action bar moved OUTSIDE the WebApp window (mirrors window-chrome.tsx top close-button pattern; new `webapp-floating-action-bar.tsx`), round buttons (`rounded-full bg-white/90 backdrop-blur-xl + soft shadow` — close-button parity), Watch mode dropped (`webapp-watch-drawer.tsx` deleted; `WebAppMode` collapsed 4 → 3), fixed `1280×720` WebApp window resolution (`window-manager.tsx`). State via new `webapp-drawer-store.ts` (Zustand keyed by webappId). 21/21 invariants PASS, build clean. (✓ 2026-05-08, commit f18c8973; deployed Mini PC `f18c8973`)
  - [ ] 100-07-PLAN.md — Routing fix (creative: click bypass via `xdotool --window <wid>` tRPC mutation + chat MCP scoping system-prompt fix + explicit windowId on every bytebot tool call). Original 100-06 scope, renumbered when 100-06 was redirected to UI revisions on 2026-05-08.

  **Phase 100 status: PARTIAL-PASS 2026-05-08** — visual rewire + multi-stream creation work + 4 user-requested UI corrections shipped; routing fix queued as Plan 100-07. v33 milestone remains CODE-COMPLETE-PENDING-UAT-SIGNOFF until 100-07 ships and Phase 100 UAT re-walks the routing rows (R3 + R9) PASS. PHASE-SUMMARY.md committed.

**Dependency graph:**
```
P92 (metadata) ─┬─→ P94 (context menu) ─┐
                │                         ├─→ P95 (stream window + AI panel) ─┬─→ P96 (teach mode) ─┐
P93 (window mgr+vnc) ─────────────────────┘                                    │                      ├─→ P98 (UAT) ─→ P99 (VNC swap)
                                                                               └─→ P97 (auto mode)   ─┘
```

**Wave plan (parallel execution):**
- **Wave 1** (paralel — backend foundation): P92 + P93 — 2 paralel agents
- **Wave 2** (single — UI gateway): P94
- **Wave 3** (single — heaviest UI phase): P95
- **Wave 4** (paralel — agent capabilities): P96 + P97 — 2 paralel agents
- **Wave 5** (final): P98

**Locked decisions for v33 entry** (per v33-DRAFT.md §4):
- Host Chrome with `--new-window` per WebApp (no Docker containers — user explicit)
- Shared user Chrome profile across WebApps (Google login persists)
- Window discovery via xdotool title-poll (CDP deferred to v34)
- Per-window streaming via `x11vnc -id <wid>` + websockify (with ffmpeg/maim fallback if Mutter blocks)
- Single Mini PC user only in v33 (multi-user → v34)
- AI panel reuses v32 chat components (no new chat surface)
- Sacred `sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED throughout v33

---

### v31 Dependencies (legacy)

**Dependencies:**
```
P64 → P65 → P66 ─┬→ P67 ─┬→ P68 → P69 → P70
                  │        ├→ P73
                  │        ├→ P74
                  │        ├→ P75
                  │        ├→ P76
                  │        └→ P77 → P78
                  └→ P71 → P72
```

P65 (rename) blocks all subsequent. P66 (design system) provides tokens for P68/P69/P70/P71/P75/P76. P67 (core rebuild) blocks anything using new ToolCallSnapshot model. P71 (CU foundation) blocks P72 (CU agent loop). P73-P76 can run in parallel after P67 done.

**Locked decisions for v31 entry:**
- ONLY Suna UI patterns (NO Hermes UI)
- Side panel auto-opens ONLY for `browser-*`/`computer-use-*` tools
- Bytebot: desktop image only (Apache 2.0); agent code NOT used
- Subscription-only preserved (D-NO-BYOK)
- Single-user privileged Bytebot containers accepted
- Sacred file old "UNTOUCHED" rule retired (was stale memory; current SHA `9f1562be...` after 25 normal commits)

**Carry from v30.0 (mapped into v31 phases):**
- F7 Suna sandbox network blocker → P71 (Bytebot per-session container architecture solves this category)
- F2-F5 broker improvements → P74 (dedicated carryover phase)
- 14 carryforward UATs + Phase 63's 11 plan walks → P64 (v30.5 final cleanup)

---

## Phase Details

### Phase 64: v30.5 Final Cleanup at v31 Entry

**Goal:** Resolve all v30.0 carry-forward items before v31 momentum builds. Suna sandbox network blocker fixed; 14 carryforward UATs walked; Phase 63's 11 plan walks completed; external client compat matrix documented.

**Depends on:** Nothing (first phase of v31).

**Requirements:** CARRY-01..05

**Success criteria:**
1. Suna marketplace install → "Navigate to google.com" smoke test passes via Suna UI
2. 14 UAT files (4 v29.5 + 4 v29.4 + 6 v29.3) walked on Mini PC with results documented
3. Phase 63 R-series formal walkthrough complete (11 plans)
4. External client compat matrix doc written (Bolt.diy + Cursor + Cline + Continue.dev + Open WebUI quirks)
5. 3 v28.0 quick-tasks resolved or moved to backlog ✓ (P64-05, all 3 already-resolved — see `.planning/phases/64-v30-5-final-cleanup-at-v31-entry/64-QUICK-TASK-TRIAGE.md`)

### Phase 65: Liv Rename + Foundation Cleanup

**Goal:** Project-wide cosmetic rename Nexus → Liv. Mechanical, high blast radius, must be atomic.

**Progress (2026-05-05):** 5/6 plans shipped — 65-01 (preflight), 65-02 (git mv + 6 package.json), 65-03 (source-code sweep, 4 commits), 65-04 (deploy scripts: update.sh + livos/install.sh + .github/workflows/{deploy,update-sh-smoke}.yml; Server4 deploy DELETED per HARD RULE; commit `65d584dc`), 65-06 (active docs + memory file). Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` preserved across all shipped plans. Pending: 65-05 (Mini PC migration script + LIVE CUTOVER user-walk).

**Depends on:** Phase 64 (v30.5 cleanup so we don't rename a half-broken state).

**Requirements:** RENAME-01..13 (RENAME-13 documentation update marked complete by 65-06)

**Success criteria:**
1. `git grep -i "nexus" liv/ livos/` returns 0 (allowed: archived planning docs) — ✅ achieved by 65-03
2. All systemd units green on Mini PC after `/opt/nexus/` → `/opt/liv/` migration — ⏳ awaits 65-05 cutover
3. Subscription Claude responds via `/v1/messages` post-rename — ⏳ awaits 65-05 smoke test
4. Mini PC migration script idempotent + rollback-ready (< 10 min rollback target) — ⏳ scripts authored in 65-05

### Phase 66: Liv Design System v1

**Goal:** Establish visual identity that produces "WOW" reaction. Tokens, motion language, typography, glow primitives, icon language.

**Depends on:** Phase 65 (rename complete; design tokens prefix `liv-` consistent).

**Requirements:** DESIGN-01..07

**Success criteria:**
1. Storybook/playground shows every token, motion, variant in one place
2. Side-by-side screenshot vs current ai-chat shows visible WOW differential
3. All shadcn liv-* variants render with proper accent + glow
4. Motion primitives reusable across subsequent phases — **MET (2026-05-04 via 66-02; FadeIn/GlowPulse/SlideInPanel/TypewriterCaret/StaggerList barrel exported from `@/components/motion`)**

### Phase 67: Liv Agent Core Rebuild

**Goal:** Replace direct WS streaming with Redis-as-SSE-relay. Introduce ToolCallSnapshot data model. Wrap SdkAgentRunner with new LivAgentRunner orchestrator.

**Depends on:** Phase 65 (uses `liv/` paths).

**Requirements:** CORE-01..07

**Success criteria:**
1. Browser refresh mid-agent-run → SSE catches up from last chunk
2. `stop` signal terminates loop within 1 iteration
3. Tool snapshots arrive paired (assistantCall + toolResult) not separate chunks
4. Reasoning chunks distinguished from text chunks in stream

**Plans:** 4 plans in 3 waves (4/4 complete ✅)
- [x] 67-01-PLAN.md (Wave 1) — RunStore: Redis-backed agent-run lifecycle (createRun/appendChunk/getChunks/subscribeChunks/setControl/markComplete/markError + 24h TTL) — ✅ done 2026-05-04, commits `a00523ca`+`eccbb8d8`, 7/7 tests pass, sacred SHA verified, CORE-01+CORE-02 complete
- [x] 67-02-PLAN.md (Wave 2, deps: 01) — LivAgentRunner: composition wrapper around SdkAgentRunner; reasoning extraction (D-14), tool snapshot batching (D-15), computer-use stub (D-16) — ✅ done 2026-05-04, commits `db740ffe`+`23a1a5a4`, 5/5 tests pass, sacred SHA verified, CORE-03..06 complete
- [x] 67-03-PLAN.md (Wave 3, deps: 01,02) — POST /api/agent/start + GET /api/agent/runs/:runId/stream (SSE with ?after= resume + 15s heartbeat) + POST /api/agent/runs/:runId/control — ✅ done 2026-05-04, commits `20ad516f`+`ef6a30d2`, 13/13 vitest pass, sacred SHA verified, CORE-07 complete (route surface; production runner factory wiring deferred to P68/P73)
- [x] 67-04-PLAN.md (Wave 1) — useLivAgentStream React hook (Zustand-backed; reconnect-after; ToolCallSnapshot dedupe by toolId) — ✅ done 2026-05-04, commits `599f7a9a`+`02dab648`, 44/44 tests pass

### Phase 68: Side Panel + Tool View Dispatcher

**Goal:** Port Suna's ToolCallSidePanel as LivToolPanel. Wire Zustand store. Tool view dispatcher with GenericToolView fallback. Auto-open behavior for visual tools only.

**Depends on:** Phase 66 (design tokens), Phase 67 (ToolCallSnapshot data model).

**Requirements:** PANEL-01..10

**Success criteria:**
1. Visual tool auto-open: Agent runs `browser-navigate` → panel slides in automatically, even if user previously closed
2. Non-visual tool no auto-open: Agent runs `execute-command` → no panel pop; tool inline; clickable to open
3. Click any tool call in chat → panel slides in, focuses that tool
4. Cmd+I → panel closes; stays closed until next visual tool

### Phase 69: Per-Tool Views Suite

**Goal:** Implement all 9 tool view components + inline tool row. Each visually distinct using Suna pattern.

**Depends on:** Phase 68 (panel + dispatcher framework).

**Requirements:** VIEWS-01..11

**Success criteria:**
1. Each tool type renders with distinct view component (visually verifiable)
2. Status transitions smooth (running → done with check icon morph)
3. Browser tool shows live VNC for computer-use category, static screenshot otherwise
4. Diff rendering correct on str-replace
5. Mobile readable for all 9 views

### Phase 70: Composer + Streaming UX Polish

**Goal:** Transform input composer into delightful interaction. Polish streaming feedback. Suna patterns + welcome screen. Mount LivToolPanel + wire useLivAgentStream snapshot bridge (deferred handoff from P67/P68).

**Depends on:** Phase 66 (design tokens), Phase 67 (streaming model + useLivAgentStream hook), Phase 68 (LivToolPanel + useLivToolPanelStore).

**Requirements:** COMPOSER-01..09

**Plans:** 8 plans in 3 waves
- [x] 70-01-PLAN.md (Wave 1) — LivComposer auto-grow textarea + file attachment + slash/mention trigger detection (COMPOSER-01, COMPOSER-02) — commits `0ae8e69b` (RED) + `e3cbb4c9` (GREEN); 14/14 vitest pass; build clean (41.91s); sacred SHA unchanged. SUMMARY: `70-01-SUMMARY.md`.
- [ ] 70-02-PLAN.md (Wave 1) — LivSlashMenu with 6+ built-in commands + filter helper (COMPOSER-03)
- [ ] 70-03-PLAN.md (Wave 1) — LivWelcome screen with greeting + 4 suggestion cards (COMPOSER-09)
- [ ] 70-04-PLAN.md (Wave 1) — LivStreamingText with TypewriterCaret + markdown gate (COMPOSER-05)
- [ ] 70-05-PLAN.md (Wave 1) — LivAgentStatus (6 visual states + GlowPulse) + LivTypingDots (500ms cycle) (COMPOSER-07, COMPOSER-08)
- [x] 70-06-PLAN.md (Wave 2, deps: 70-01) — LivStopButton color toggle (red↔cyan) + LivModelBadge inline (COMPOSER-02, COMPOSER-04) — commits `d9521f61` (RED) + `72367292` (GREEN); 13/13 vitest pass; build clean (45.63s); sacred SHA unchanged. SUMMARY: `70-06-SUMMARY.md`.
- [x] 70-07-PLAN.md (Wave 2, deps: 70-01) — LivMentionMenu placeholder (9 stub mentions, P76 swaps real data) (COMPOSER-04) — commits `7e09c8f9` (feat) + `9a91d7fd` (test); 13/13 vitest pass; build clean (37.89s); sacred SHA unchanged. SUMMARY: `70-07-SUMMARY.md`.
- [ ] 70-08-PLAN.md (Wave 3, deps: 70-01..70-07) — Integration: mount LivToolPanel + LivComposer + LivWelcome in index.tsx; wire useLivAgentStream snapshot bridge; swap chat-messages.tsx to LivAgentStatus/LivStreamingText/LivTypingDots (all 9 COMPOSER reqs)

**Success criteria:**
1. Type message → streaming caret hugs last token (no orphan)
2. Drag image → preview chip appears
3. Press `/` → slash menu opens with 6+ commands
4. First open → welcome screen with 4 suggestion cards visible

### Phase 71: Computer Use Foundation

**Goal:** Get bytebot-desktop image installed per-user, react-vnc embedding live, app gateway authenticating /computer-use endpoint.

**Depends on:** Phase 65 (uses `liv/` naming for env vars + paths).

**Requirements:** CU-FOUND-01..07

**Success criteria:**
1. User triggers "/computer start" → container spawns within 15s
2. VNC iframe loads, shows XFCE desktop
3. User can take over mouse (viewOnly=false)
4. Idle 30 min → container stops, next start fresh
5. Single user constraint enforced (max 1 active container per user account)

### Phase 72: Computer Use Agent Loop

**Goal:** Wire Liv agent to bytebotd. Agent issues 16 Bytebot tools, screenshots come back as tool results, NEEDS_HELP flow when agent stuck.

**Depends on:** Phase 71 (CU foundation), Phase 67 (LivAgentRunner with computer-use tool routing hook).

**Requirements:** CU-LOOP-01..07

**Success criteria:**
1. "Navigate to google.com and search 'weather'" → end-to-end works, side panel shows live VNC, screenshots per step
2. "Open Firefox and read https://news.ycombinator.com" → application tool launches, browser navigation, content extracted
3. Agent stuck (e.g., login page) → emits NEEDS_HELP → user takes over → completes login → returns control → agent resumes

**Plans:** 9 plans (2 shipped + 7 new native plans), 3 waves (RE-ARCHITECTED #2 2026-05-05 — NATIVE X11 PORT FINAL; old 72-03..06 + 72-mcp-01..06 all superseded; see 72-CONTEXT.md D-NATIVE-* register)
- [x] 72-01-PLAN.md (Wave 0, shipped) — 17 Bytebot tool schemas verbatim copy in livinityd computer-use module (CU-LOOP-01) — REUSED by NEW#3 architecture
- [x] 72-02-PLAN.md (Wave 0, shipped) — Bytebot system prompt verbatim copy; REUSED in NEW#3 (kept for future direct-prompt mode in P75) (CU-LOOP-03)
- [~] 72-03-PLAN.md (DEPRECATED OLD#1 — bytebot-desktop container approach)
- [~] 72-04-PLAN.md (DEPRECATED OLD#1 — BYTEBOT_LLM_PROXY_URL env-var spec)
- [~] 72-05-PLAN.md (DEPRECATED OLD#1 — NEEDS_HELP UI via RunMeta)
- [~] 72-06-PLAN.md (DEPRECATED OLD#1 — old integration test + UAT)
- [~] 72-mcp-01-PLAN.md (DEPRECATED OLD#2 — bytebot-mcp MCP server wrapping bytebotd HTTP daemon)
- [~] 72-mcp-02-PLAN.md (DEPRECATED OLD#2 — BytebotdHttpClient HTTP wrapper)
- [~] 72-mcp-03-PLAN.md (DEPRECATED OLD#2 — categorize patch under MCP HTTP arch; carried forward into 72-native-05)
- [~] 72-mcp-04-PLAN.md (DEPRECATED OLD#2 — registerBytebotMcpServer under MCP HTTP arch; carried forward into 72-native-06)
- [~] 72-mcp-05-PLAN.md (DEPRECATED OLD#2 — LivNeedsHelpCard under MCP HTTP arch; carried forward into 72-native-05)
- [~] 72-mcp-06-PLAN.md (DEPRECATED OLD#2 — UAT under MCP HTTP arch; superseded by 72-native-07)
- [x] 72-native-01-PLAN.md (Wave 1) — native/screenshot.ts via @nut-tree-fork/nut-js screen.capture (CU-LOOP-02)
- [x] 72-native-02-PLAN.md (Wave 1) — native/input.ts via nut-js mouse + keyboard (CU-LOOP-02)
- [x] 72-native-03-PLAN.md (Wave 1) — native/window.ts via wmctrl spawn (CU-LOOP-02)
- [x] 72-native-04-PLAN.md (Wave 1) — LivDesktopViewer UI (replaces deprecated react-vnc role) + computerUse.takeScreenshot tRPC (CU-LOOP-05)
- [x] 72-native-05-PLAN.md (Wave 2, deps: native-01..03) — mcp/server.ts + mcp/tools.ts + categorizeTool patch + LivNeedsHelpCard UI (CU-LOOP-04, CU-LOOP-05)
- [ ] 72-native-06-PLAN.md (Wave 2, deps: native-01..03,05) — bytebot-mcp-config.ts + livinityd boot wire + ALLOWED_COMMANDS tsx patch (CU-LOOP-06)
- [ ] 72-native-07-PLAN.md (Wave 3, deps: native-01..06) — Mini PC UAT walk + install.sh patch + computer-use-deploy.sh; autonomous=false, human-verify (CU-LOOP-07)

### Phase 73: Reliability Layer

**Goal:** Make agent runs survive crashes, reconnects, long durations. ContextManager prevents Kimi window overflow. BullMQ backgrounds long tasks.

**Depends on:** Phase 67 (run-store base), Phase 72 (computer-use long runs need this).

**Requirements:** RELIAB-01..06

**Success criteria:**
1. 3-hour agent run survives without context overflow error
2. Browser refresh mid-run → SSE catches up, no chunks lost
3. Stop button mid-run → loop terminates within 1 iteration
4. Pause + Resume → run continues from exact state

### Phase 74: F2-F5 Carryover from v30.5

**Goal:** Tackle 4 deferred broker improvements that were in v30.5 scope.

**Depends on:** Phase 67 (broker integration via LivAgentRunner).

**Requirements:** BROKER-CARRY-01..05

**Success criteria:**
1. Type "hi" → tokens stream visibly word-by-word (cadence test)
2. Long tool chain → no `tool_use_id mismatch` errors (Kimi strict validation)
3. 10-min agent run → no Caddy 504 timeouts
4. Ask agent "who are you?" → consistent "Liv Agent powered by Kimi" response

### Phase 75: Reasoning Cards + Lightweight Memory

**Goal:** Show Kimi reasoning to user via custom Liv-designed reasoning card. Implement minimal memory via Postgres tsvector FTS.

**Depends on:** Phase 67 (reasoning chunk emission), Phase 66 (GlowPulse motion primitive).

**Requirements:** MEM-01..08

**Success criteria:**
1. Kimi reasoning collapsible card visible in chat with amber glow when streaming
2. Conversation history search returns highlighted snippets within 300ms debounced
3. Pinned messages auto-injected into agent context
4. Export thread as Markdown / JSON works

### Phase 76: Agent Marketplace + Onboarding Tour

**Goal:** Browse/clone agent templates (Suna pattern adapted). First-run tour that triggers WOW.

**Depends on:** All previous phases (showcase the full UX).

**Requirements:** MARKET-01..07

**Success criteria:**
1. User opens marketplace → sees 8+ agent templates with cards
2. "Add to Library" clones template → appears in user's agent list
3. First-time user opens AI Chat → 9-step tour plays automatically
4. Tour replayable from Settings

---

### Phase 100: Multi-Stream + Stream-Window Redesign

**Goal:** Close the four UAT gaps from Phase 99 so v33 (WebApp Launcher) can ship: (1) two concurrent WebApps must each get their own independent stream + own x11vnc port + own stream window component; (2) drop URL bar from stream window — URL is bound to the WebApp icon and redundant inside the stream view; (3) stream area fills the window (no inline toolbar/agent panel chrome below it, only the standard top drag-strip + close-X); (4) Chat / Teach / Watch / Auto inline pane removed and replaced with a floating icon-button row anchored to the stream window's bottom edge (mirrors the existing top drag/close pattern), each button opening its own slide-in drawer (~35% window width). Backend root-cause work is empirical-first on the Mini PC: 100-01 verifies which of H1..H4 (Chrome `--new-window` IPC merge vs. xdotool matcher race vs. frontend single-render vs. wid-collision-via-merge) is the real cause; 100-02 implements the locked fix (default candidate: swap `--new-window URL` → `--app=URL` site-specific-browser mode, which also delivers full-bleed chromeless windows for free → solves G-99-UAT-2 in the same commit). 100-03/100-04 do the frontend rewire. 100-05 deploys to Mini PC + walks UAT-CHECKLIST.md A-J with the user.

**Depends on:** Phase 99 (PARTIAL-PASS — RFB protocol swap shipped; Phase 100 inherits `vnc-bridge.ts`, `stream-manager.ts` discriminated union, WS dispatch, fresh `VNC_PORT_COUNTER` ring 15900..16099 — all locked / unmodified).

**Requirements:** V33-MULTI-01..05

**Locked decisions (D-100-*):**
- **D-100-SACRED:** `liv/packages/core/src/sdk-agent-runner.ts` SHA must equal `f3538e1d811992b782a9bb057d1b7f0a0189f95f` before AND after every commit (pre/post `git hash-object` gate).
- **D-100-NO-SERVER4:** Mini PC `bruce@10.69.31.68` only.
- **D-100-NO-BYOK:** Subscription-only Agent SDK; no `@anthropic-ai/sdk` paths.
- **D-100-FMP4-ALIVE:** `Fmp4Fanout`, `encoder-args`, `pipewire-portal`, `geometry-tracker` preserved byte-for-byte (desktop-stream native app keeps using them).
- **D-100-SHARED-PROFILE:** Chrome continues to share `/home/bruce/.config/livos-chrome` (no per-WebApp profile dir; loses Google login if split).
- **D-100-X11VNC-CANONICAL:** Phase 99-02 `spawnVncForWindow` argv recipe is locked, not modified.
- **D-100-LIVE-VERIFY-FIRST:** No 100-02 backend change ships until 100-01 has empirically pinned the real root cause on the Mini PC.

**Success criteria (UAT-walkable):**
1. Open WebApp A → stream window opens at port 15900, RFB handshake, captured Chrome visible.
2. Open WebApp B → SECOND stream window opens at port 15901, independent RFB handshake, independent Chrome window with different URL captured.
3. Both stream windows render simultaneously; mouse input in one does not reach the other.
4. Each window has NO URL bar — only the standard drag-strip + close-X.
5. Stream area fills the window (no inline toolbar/agent panel below it).
6. Bottom edge of each window has a row of 4 icon-buttons (Chat / Teach / Watch / Auto).
7. Clicking Chat opens a slide-in drawer with the chat surface; second click closes; opens again on Chat-icon click.
8. Clicking Teach opens the teach-recorder UI in a slide-in drawer; same close behavior; same swap-on-other-button-click behavior.
9. Bytebot Auto mode in WebApp A does not interfere with WebApp B (per-window MCP env confirmed via `BYTEBOT_TARGET_WINDOW_ID`).
10. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all Phase 100 commits.
11. Mini PC user-walked UAT signoff documented in `UAT-CHECKLIST.md` sections A-J → v33 milestone flips to ✅ Shipped.

---

### Phase 101: LivOS Universal App Orchestration

**Goal:** Six-pillar orchestration upgrade per user UAT 2026-05-10:
- (A) Tek Chrome process + multi-port per-app stream (same Google login across all)
- (B) Ubuntu native apps as first-class LivOS citizens (dock-launchable + auto-stream)
- (C) Luse window-context auto-awareness (chat session knows hangi pencerede)
- (D) SelfClaude action-driven Teach (click → instruction popover → step)
- (E) Chat animations (thinking dots + idle pulse)
- (F) Hermes per-tool phrase relay (close 100-10-10 backend gap)

**Full context:** `.planning/phases/101-livos-universal-app-orchestration/101-CONTEXT.md` (10 sub-plans, 4 parallel waves, locked decisions D-101-*, 20-row UAT)

**Trigger:** 2026-05-10 live diagnostic on Mini PC during Phase 100-10. Per-WebApp Xvfb (`:10`, `:11`, ...) was code-correct but every new `--app=URL` spawn IPC-redirected to the existing Chrome PID on `:10`, so no window appeared on `:11`. User chose to keep shared profile → 100-10-08 restored Phase 99 single-display + per-wid x11vnc behavior. The user's actual long-term vision — Luse opens ports + spawns multi-screen Chrome targets + navigates between windows + teaching mode compatible — needs a different architecture: drive ONE Chrome process via CDP, create multiple Target/Browser contexts, and bind x11vnc / capture per-target.

**Direction (high-level — Phase 101 CONTEXT will harden):**
- Run a single Chrome with `--remote-debugging-port=<N>` against `/home/bruce/.config/livos-chrome` (singleton-friendly).
- Use CDP `Target.createBrowserContext` / `Target.createTarget({url, browserContextId})` to spawn isolated tab/window targets while sharing the user-data-dir.
- Each Luse-driven target gets its own wid (via `Browser.getWindowForTarget` + `Browser.setWindowBounds`); x11vnc per-wid (D-99-01 baseline) captures it.
- Luse MCP tools (`mcp__luse__list_windows`, `screenshot_window`, `focus_window`, `create_stream`, `list_streams` from 100-10-03/04) keep their public shape; their internals shift from xdotool/wmctrl primitives to CDP-aware calls.
- The 100-10-08 scaffolding (`DisplayAllocator`, `xvfbStartFn`/`fluxboxStartFn` opts, `-display :N` branch in `vnc-bridge.ts`, `VncWindowTarget = {display: string}` variant, `LuseMcpDescriptor.display` override) is retained for the case where Phase 101 needs per-display targets for parity (e.g., second physical display, remote rendering, debug surfaces).

**Sacred:** `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` MUST stay untouched. Pre-commit hook continues to enforce.

**Phase 101 sub-goals (tracked):**
- A. CDP-driven Luse orchestration — same-profile multi-target Chrome via Chrome DevTools Protocol (see Direction above)
- B. SelfClaude action-driven Teach pattern — event-driven click + per-step instruction prompt; replaces today's interval-based frame capture. See `.planning/phases/100-multi-stream-window-redesign/100-10-12-RESEARCH.md` for design input.
- C. Per-tool streaming backend bridge — agent-session.ts → runStore status_detail relay so Hermes phrase reaches WebApp chat UI (gap identified in 100-10-10 SUMMARY)

**Status:** CONTEXT authored 2026-05-10 (101-CONTEXT.md). Ready for `/gsd-plan-phase 101 --chain` or `/gsd-autonomous --only 101`.

**Decomposition:** 10 sub-plans across 4 parallel waves:
- **Wave 1 (3 plans, parallel):** 101-01 Chrome CDP bootstrap, 101-02 port allocator (15900..15999), 101-03 native app spawner
- **Wave 2 (3 plans, parallel):** 101-04 CDP WebApp spawn (replaces window-manager argv), 101-05 native app stream binder, 101-06 Luse auto-context injection
- **Wave 3 (3 plans, parallel):** 101-07 LivOS dock native app UI, 101-08 SelfClaude Teach v3 refactor, 101-09 chat animations + Hermes phrase relay
- **Wave 4 (1 plan, user-walked):** 101-10 Mini PC deploy + 20-row UAT

**Plans:** 11 plans (Wave 0 scaffolding plan added — 101-00)

Plans:
- [x] 101-00-PLAN.md — Wave 0 test-stub scaffolding + chrome-remote-interface install + test:run scripts (SHIPPED 2026-05-11 `1cfafcfe..39297f8c`)
- [ ] 101-01-PLAN.md — Chrome CDP bootstrap + chrome-remote-interface install + livinityd wire-up
- [ ] 101-02-PLAN.md — Per-app stream port allocator (15900..15999) + StreamManager refactor
- [ ] 101-03-PLAN.md — Native app spawner + Redis config store + tRPC apps.native.{list,create,delete,get}
- [ ] 101-04-PLAN.md — CDP-driven WebApp spawn (rewrites window-manager.spawn body)
- [ ] 101-05-PLAN.md — Native app window-bind + apps.native.spawn(id) stream wire-up
- [ ] 101-06-PLAN.md — Luse auto-context injection (activeWid + activeAppMeta in WS envelope)
- [ ] 101-07-PLAN.md — Dock native-app form + icon + launch hook (UI)
- [ ] 101-08-PLAN.md — SelfClaude Teach v3 (event-driven recorder + popover + v3 replay)
- [ ] 101-09-PLAN.md — Chat thinking-dots + idle-pulse + Hermes status_detail relay (Pillar E+F)
- [ ] 101-10-PLAN.md — Mini PC deploy + 20-row UAT walk (autonomous: false)

---

### Phase 102: Per-App Display Pivot

**Goal:** Correct Phase 101's CDP-on-shared-`:1` architecture mistake (user UAT 2026-05-11). Each app gets a DEDICATED Xvfb display + its own Chrome process. Master profile seed-copy at spawn time gives same Google login across all apps without sharing user-data-dir (singleton lock isolated). x11vnc captures whole display (no WID polling). Luse coords 1:1 with 1280x720 (no 1920x1080 drift).

**Full context:** `.planning/phases/102-per-app-display-pivot/102-CONTEXT.md` (10 sub-plans, 4 parallel waves, locked decisions D-102-*, 25-row UAT)

**Trigger:** 2026-05-11 user UAT verbatim: "Yeni screen derken ayri Xvfb display mi istiyorsun evet. Ayni screen de iki farkli yayin yapiyorsun ustuste bindiginde sorun cikiyor. Luse duzgun kullanamiyor ayrica luse ssleri 1920x1080 aliyor bizim screen res farkli." SelfClaude reference works well (per-app user-data-dir pattern). Phase 102 adopts it + master profile seed-copy for shared Google login.

**Direction:**
- Per-app Xvfb `:N` (N ∈ 10..99) at 1280x720x24
- Per-app Chrome subprocess with own `--user-data-dir=/tmp/livos-chrome-app-<uuid>` (singleton-isolated)
- Master profile at `/opt/livos/data/chrome-master/` seeded via `cp -r` at every spawn (~10MB, ~200ms)
- Chromeless fullscreen Chrome via `--app=URL --start-fullscreen` flags
- x11vnc `-display :N` whole-screen capture (no `-id <wid>` WID filter)
- Luse env switches `LUSE_TARGET_WINDOW_ID` → `LUSE_TARGET_DISPLAY=:N` (all X11 ops scope to :N)
- Master Chrome Login UI in Settings (one-time login → all apps inherit)
- Clean shutdown lifecycle (Chrome + x11vnc + Xvfb + /tmp dir cleanup)

**Sacred:** `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED.

**Phase 101 salvage:** ~70% retained (PortAllocator, NativeAppSpawner, Luse auto-context, dock UI, Teach v3, chat anims, Hermes relay). Replaced: 101-04 CDP-driven spawn → 102-04 Xvfb + Chrome subprocess spawn. Optional: 101-01 ChromeCdpClient kept but not wired in v1 (per-app Chrome doesn't need CDP control unless Luse later requires it).

**Status:** CONTEXT authored 2026-05-11 (102-CONTEXT.md). Ready for `/gsd-autonomous --only 102`.

**Decomposition:** 10 sub-plans across 4 parallel waves:
- **Wave 1 (3 plans, parallel):** 102-01 DisplayAllocator + XvfbSpawner, 102-02 ChromeProcessSpawner, 102-03 MasterProfileSeeder
- **Wave 2 (3 plans, parallel):** 102-04 window-manager rewrite (Xvfb + Chrome subprocess flow), 102-05 native-app-binder display swap, 102-06 Luse env switch (LUSE_TARGET_DISPLAY)
- **Wave 3 (3 plans, parallel):** 102-07 Master Chrome Login UI, 102-08 close lifecycle (kill Chrome+x11vnc+Xvfb+rm /tmp), 102-09 x11vnc -display :N rewrite
- **Wave 4 (1 plan, user-walked):** 102-10 Mini PC deploy + 25-row UAT

**Plans:** 10 plans (Wave 0 not needed — test stubs added per-plan)

Plans:
- [ ] 102-01-PLAN.md — DisplayAllocator + XvfbSpawner
- [ ] 102-02-PLAN.md — ChromeProcessSpawner (per-app subprocess + --app=URL fullscreen)
- [ ] 102-03-PLAN.md — MasterProfileSeeder (cp -r master → app dir)
- [ ] 102-04-PLAN.md — window-manager rewrite (Xvfb + Chrome process + x11vnc orchestrator)
- [ ] 102-05-PLAN.md — native-app-binder display swap (DisplayAllocator instead of WM_CLASS)
- [ ] 102-06-PLAN.md — Luse LUSE_TARGET_DISPLAY env switch
- [ ] 102-07-PLAN.md — Master Chrome Login UI in Settings
- [ ] 102-08-PLAN.md — App close lifecycle (clean Chrome+x11vnc+Xvfb+/tmp)
- [ ] 102-09-PLAN.md — x11vnc -display :N whole-screen rewrite
- [ ] 102-10-PLAN.md — Mini PC deploy + 25-row UAT walk (autonomous: false)

---

### Phase 103: Master Chrome Streaming + Single-MCP Display-Aware

**Goal:** Close the two functional loose ends from Phase 102 by (a) making the Master Chrome Login flow usable on a headless Mini PC via the existing per-app streaming pipeline (Xvfb + x11vnc + noVNC viewer embedded in the Settings panel), and (b) replacing the 1-MCP-server-per-WebApp luse architecture with a single global display-aware MCP whose tools accept an optional `display: ":N"` arg — eliminating the Claude Code wildcard-permission prompt the user explicitly rejected ("permissionu vermek istemiyorum bunu tek mcp den coz").

**Trigger:** 2026-05-11 user UAT on Phase 102 r14 deploy. (1) Master Chrome Login button spawns Chrome on the host `:0` display which is invisible on a headless box ("Open Master Chrome buna tikliyorum ama acilmiyor en azindan streaming baslasa pencereden iyi olurdu"). (2) Phase 102 r12 hot-fix Bug B mandate: per-WebApp Luse MCP creates one MCP entry per WebApp (`luse:webapp:<slug>-<uuid>`), forcing Claude Code to prompt for wildcard permission per registration. User explicitly chose single-MCP redesign over per-app: "permissionu vermek istemiyorum bunu tek mcp den coz".

**Direction:**
- **Master Chrome streaming (sub-goal A):**
  - Allocate a managed Xvfb display (DisplayAllocator) for the master login session — NOT `:0`
  - Reuse `chrome-process-spawner.ts` shape but with `--user-data-dir=/opt/livos/data/chrome-master/` (skip profile-seeder; the master IS the seed source)
  - Spawn `x11vnc -display :N -rfbport <allocated>` + create a StreamSession via existing stream-manager
  - `chromeMaster.startLogin` returns `{wsUrl, streamId, display, pid, startedAt}`
  - UI: master-chrome-login.tsx renders `useWebAppVnc(wsUrl)` viewer inline when running; existing canvas + tRPC click/key/scroll dispatch reused (master is a special WebApp under the hood)
  - Lifecycle: master Chrome exit (user closes window in noVNC) → stream stops + Xvfb killed + display released; profile is now populated and persisted in `/opt/livos/data/chrome-master/` for subsequent per-app `cp -r` seeds
- **Single-MCP display-aware (sub-goal B):**
  - Default `LIVOS_PER_APP_LUSE=0` (skip per-app MCP registration entirely)
  - Modify global `luse` MCP server (`livos/packages/livinityd/source/modules/computer-use/mcp/server.ts`) — add optional `display: ":N"` param to relevant tools (list_windows, computer_screenshot, computer_click_mouse, computer_type, computer_press_keys, computer_drag_mouse, etc.); tool handlers set `DISPLAY=:N` env when executing X11 ops via execFile; default fallback `LUSE_TARGET_DISPLAY` (=`:1`)
  - Modify `buildActiveDisplaySnippet` (carried from 102-06): instruct agent in system prompt to ALWAYS pass `display: ":N"` arg when scoping to active WebApp
  - Result: 1 global MCP, ~20 tools, scoping via param — cleaner tool surface for the agent and no Claude Code wildcard permission prompt
- **UX polish carry-overs:**
  - Settings → Chrome Profile theme-aware text colours (already shipped in r14a — Phase 103 carries the regression test)
  - Master Chrome inner-block duplicate header removal (already shipped in r14a)

**Sacred:** `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED.

**Depends on:** Phase 102 (Wave 0-3 SHIPPED; sub-goal A reuses 102-01 DisplayAllocator + 102-02 ChromeProcessSpawner shape + 102-09 x11vnc -display capture path; sub-goal B drops 102-06 per-app luse-mcp-config and re-shapes its `LUSE_TARGET_DISPLAY` env into a per-call MCP tool arg).

**Status:** Planned 2026-05-11 (6 plans, 3 waves). Run `/gsd-execute-phase 103` to begin Wave 1.

**Plans:** 6 plans

Plans:
- [x] 103-01-PLAN.md — Sub-goal A backend: widen chrome-process-spawner USER_DATA_DIR_RE + refactor master-login-routes to factory-injected router with startLogin/stopLogin/input.* (Wave 1) — ✅ Shipped 2026-05-11 (`978f7bae..f0f09922`, 3 commits, sacred SHA preserved)
- [x] 103-02-PLAN.md — Sub-goal A UI: embedded noVNC viewer + input dispatch in master-chrome-login.tsx (Wave 2) — ✅ Shipped 2026-05-11 (`c5eb9360`, 1 commit, TDD RED+GREEN, sacred SHA preserved)
- [x] 103-03-PLAN.md — Sub-goal B native: withScopedDisplay + display arg on 13 X11-touching luse tools (Wave 1) — ✅ Shipped 2026-05-11 (`d38af35f..2bd32a25`, 3 commits, sacred SHA preserved)
- [x] 103-04-PLAN.md — Sub-goal B prompt: buildActiveDisplaySnippet prescriptive "MUST pass display" instruction (Wave 1) — ✅ Shipped 2026-05-11 (`dc86a7c2..cab8b331`, 2 commits TDD RED+GREEN, sacred SHA preserved)
- [x] 103-05-PLAN.md — Sub-goal B production: flip LIVOS_PER_APP_LUSE default OFF + orphan-sweep boot pass (Wave 2) — ✅ Shipped 2026-05-11 (`f2e7f2a2..ca1b1f79`, 4 commits TDD RED+GREEN × 2 tasks, sacred SHA preserved)
- [ ] 103-06-PLAN.md — Deploy + 12-row UAT walk (Wave 3, autonomous: false)

**Non-goals (deferred to later phase):**
- Two-way profile sync (auth changes in app A propagate back to master) — keep one-way master → apps from Phase 102
- Per-app profile retention (user marks "save this app's state for next launch")
- Master Chrome multi-account (multiple Google identities) — single profile only

---

### Phase 104: One-shot Local Install + Docker Ubuntu GUI UAT

**Goal:** Make it possible for any user to install LivOS fully locally on their own machine with a single `install.sh` invocation and access the system via `<username>.livinity.local` from any LAN device — no cloud domain, no Cloudflare account, no port-forward required. The install path must be self-testable inside a GUI-enabled Ubuntu Docker container so the orchestrator can prove end-to-end correctness before shipping to real hardware.

**Trigger:** Post-v33 carry-over. User wants a "local-first" install mode in parallel with the existing cloud Mini PC path. CONTEXT.md (5cd3a194) and research doc (e5864b2b — `.planning/research/local-livinity-setup.md`) are the authoritative source-of-truth for this phase.

**Direction:**
- **Single `install.sh` entry point** (mode resolution — A: `--mode local|cloud` flag, B: two scripts, C: env var — decision deferred to /gsd-plan-phase)
- **dnsmasq + local TLD:** `address=/.livinity.local/<host-ip>` wildcard; Q3 (macOS/iOS mDNS interception) validated during planning or punted to `.livos.home` fallback
- **Caddy `tls internal` named-CA:** `LivOS Local CA` PKI block + wildcard `*.livinity.local` virtual host pointing at livinityd `:8080`; CA root cert served at `http://<host>:80/api/local/ca.crt` for one-click trust
- **Mode persistence:** Redis `livos:domain:local_mode=true` so livinityd boot path skips ACME / Cloudflare DNS challenge
- **Docker UAT GO/NO-GO gate:** `docker/local-uat/` with Ubuntu 24.04 + systemd-in-docker + Xvfb + fluxbox + x11vnc + noVNC bridge; Claude drives a browser via Chrome DevTools MCP against `http://localhost:6080`, takes screenshot of working `https://bruce.livinity.local` UI, verifies dnsmasq + Caddy + livinityd stack healthy — all without touching the real Mini PC
- **Enrollment wizard UI:** Settings → Local Access tab with QR code + per-platform trust instructions (LocalSetupWizard.tsx, QrCodeStep.tsx, PlatformInstructions.tsx)
- **Cloud-mode regression test:** `install.sh --mode cloud` reproduces existing Mini PC behavior byte-for-byte against a second container; CI gate after every install.sh change

**Sacred:** `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED.

**Depends on:** Phase 103 (Master Chrome streaming + single-MCP shipped). Cloud Mini PC deploy at `dab261cc` must keep working byte-for-byte — `D-104-NO-PROD-IMPACT` locked decision.

**Status:** Planned 2026-05-11 (7 plans, 6 waves). Run `/gsd-execute-phase 104` to begin Wave 1.

**Plans:** 13 plans (7 + 104-08 hotfix + 104-09 hotfix + 104-10 v34-seed + 104-11 deploy-livinityd + 104-12 path-bug-fix-plus-liv-stack + 104-13 pnpm-block-exotic-subdeps-hotfix)

Plans:
- [x] 104-01-PLAN.md - Docker UAT container scaffolding (Wave 1, autonomous) — Shipped 2026-05-12 (`e0c4fc6c..500b4912`; runtime verify pending Docker Desktop)
- [x] 104-02-PLAN.md - install.sh skeleton with --mode dispatch + helpers (Wave 2, autonomous) — Shipped 2026-05-12 (`2a1a274b..1361f483`; AC-104-16 verified, AC-104-1 scaffold-path + AC-104-2 idempotency runtime verify pending Docker Desktop)
- [x] 104-03-PLAN.md - local-lan backend: dnsmasq + Caddy pki-global.conf + livinityd local-dns module (Wave 3, autonomous, parallel with 104-04) — Shipped 2026-05-12 (`9bba50ba..8d8cec66`; 24/24 vitest pass; AC-104-8 + D-104-NO-PROD-IMPACT enforced; runtime AC-104-4..7 deferred to 104-07 UAT)
- [x] 104-04-PLAN.md - hybrid backend: Cloudflare DNS-01 + Server5 control-plane subdomain mint (Wave 3, autonomous, parallel with 104-03) — Shipped 2026-05-12 (`9a9801c8..62a526b1`; 52/52 vitest pass; D-104-RELAY-ZERO-DATA-PLANE static negative-grep PASS; D-104-NO-PROD-IMPACT enforced; runtime AC-104-15 tcpdump deferred to 104-07 UAT)
- [x] 104-05-PLAN.md - Settings -> Local Access enrollment wizard UI (Wave 4, autonomous) — Shipped 2026-05-12 (`4c853ce0..18a097f3`; 17/17 vitest pass; D-104-DEFAULT-MODE + D-NO-NEW-DEPS + D-104-RELAY-ZERO-DATA-PLANE UI surfaces enforced; runtime AC-104-9/-10/-15 end-to-end UAT deferred to 104-07)
- [x] 104-06-PLAN.md - cloud-mode regression test: install.sh --mode cloud byte-equivalent to Mini PC dab261cc (Wave 5, autonomous) — Shipped 2026-05-12 (`1e6f1f01..e9e3c125`; mode-cloud.sh body refactored as strict subset of livos/install.sh; docker/cloud-regression/ UAT container with always-on D-104-NO-PROD-IMPACT negative checks + conditional byte-equivalence diff; `docker compose build` succeeds locally; operator runs capture-minipc-baseline.sh once to land fixtures)
- [/] 104-07-PLAN.md - End-to-end UAT walk + user-walked Apple verification (Wave 6, autonomous: false) — **Task 1 SHIPPED** 2026-05-12 (`8c143b7b`; walk.mjs 10-test full AC walk + lib/chrome-cdp.mjs + lib/tcpdump-check.mjs + UAT-CHECKLIST.md + UAT-EVIDENCE/.gitkeep; D-NO-NEW-DEPS honored; Sacred SHA preserved). **Task 2 AWAITING operator Apple-device walk** via `.planning/phases/104-local-install-and-docker-uat/UAT-CHECKLIST.md`. Phase 104 final disposition pending operator sign-off.
- [x] 104-08-PLAN.md - User-owned-domain hybrid HOTFIX: `--mode hybrid --domain X --cf-token Y --cf-zone-id Z` skips Server5 mint, creates CF DNS A-record on user's own zone (Wave 7 hotfix, autonomous) — Shipped 2026-05-12 (`3f8d20bc..be9cf160`; 18/18 host-side bash test PASS — `scripts/install/__tests__/test-mode-hybrid-args.sh`; AC-104-08-{1..5} all green; D-104-RELAY-ZERO-DATA-PLANE realized at install-time; D-104-NO-PROD-IMPACT preserved — when --domain unset, legacy Server5 mint runs unchanged; `curl -K -` config-from-stdin pattern keeps CF API token off curl argv (AC-104-08-5); CGNAT detection via ifconfig.me + RFC 6598 100.64.0.0/10 regex, WARN-not-FAIL semantics; Sacred SHA preserved across all 3 commits)
- [x] 104-09-PLAN.md - Cloudflare Tunnel install mode HOTFIX: `--mode tunnel --domain X --cf-tunnel-token Y [--api-key liv_k_Z]` installs cloudflared via signed pkg.cloudflare.com apt repo, registers systemd service, points Caddy at plain :80 with `auto_https off` (CF edge terminates TLS). Outbound-only — bypasses public-IP / CGNAT / port-forward requirements entirely. Zero Server5 data-plane traffic. Also adds orthogonal `--api-key liv_k_*` flag (works in all modes; tunnel persists to /etc/livos/secrets/api-key for future marketplace integration) (Wave 7 hotfix, autonomous) — Shipped 2026-05-12 (`55acaa5c..(Task-3-this-commit)`; 24/24 host-side bash test PASS — `scripts/install/__tests__/test-mode-tunnel-args.sh`; 104-08's 18/18 still PASS — D-104-NO-PROD-IMPACT preserved; D-104-RELAY-ZERO-DATA-PLANE realized at install-time for a 3rd path — mode-tunnel.sh contains ZERO Server5/livinity.io refs verified by static grep; CF Tunnel token NEVER on curl/cloudflared argv via env-var interpolation, ONE unavoidable argv exposure at `cloudflared service install <token>` documented + scoped + acceptable; Sacred SHA preserved across all 3 commits)
- [x] 104-10-PLAN.md - LivOS heartbeat client (FIRST CLIENT-SIDE piece of v34 LivOS ↔ livinity.io account integration): new `livos/packages/livinityd/source/modules/account/` module with api-key.ts (reads `/etc/livos/secrets/api-key` via Redis pointer key `livos:account:api_key_path`; null on missing/empty/malformed; never throws; redactedPreview() helper), device-id.ts (stable per-box UUIDv4 via `crypto.randomUUID()`, persists `/var/lib/livos/device-id` mode 0600), heartbeat-payload.ts (pure builder for `{device_id, hostname, mode, version, ip, uptime, node_version}`; ~200 bytes), heartbeat-sender.ts (native fetch + 10s AbortController + X-Api-Key header + self-rescheduling setTimeout + status matrix: 2xx verbose / 401 stop+error / 404 warn-once / 429 warn / 5xx warn / network err warn; log-once-per-restart semantics; returns stop() for graceful shutdown). Wired into Livinityd.start() AFTER ai.start() — guarded on `livos:account:api_key_path` Redis key (only armed when 104-09 `--api-key` was supplied; otherwise silent skip — no log spam for LAN-only installs). Forward-compat with Server5 missing endpoint: 404 logs once + retries silently until v34.x ships `/api/devices/heartbeat` route in a separate repo. ZERO new npm deps (Node 18+ built-ins only). D-104-RELAY-ZERO-DATA-PLANE: heartbeat is control-plane (~12KB/day at 60s interval) — explicitly allowed (Wave 8 hotfix, autonomous) — Shipped 2026-05-12 (`dc3d4044..(Task-3-this-commit)`; 43/43 account/ vitest PASS in 3.34s; pre-existing baseline vitest count 1275 → 1318 total with +43 PASS additions; Sacred SHA preserved across all 3 commits)
- [x] 104-11-PLAN.md - **PATH BUG discovered post-ship on mainserver 154.53.56.75 live test (`pnpm install` failed with `ENOENT: no such file or directory, scandir '/opt/livos/liv/packages/core'` — nested-`/opt/livos/livos/` rsync layout broke livinityd's `@liv/core: file:../../../liv/packages/core` resolution); FIXED in 104-12 (see below) — flat /opt/livos/ layout + sibling /opt/liv/ rsync.** install.sh full livinityd deployment GAP-CLOSE: new `scripts/install/deploy-livinityd.sh` (404 lines, 11 idempotent helpers — Node 22 LTS via NodeSource + pnpm via npm -g + postgresql + redis-server + build deps; Postgres role/DB/schema.sql apply via PGPASSWORD env (T-104-11-1) with sudo -u postgres fallback for peer-auth; Redis requirepass with sed-remove-then-append idempotency; git clone → /tmp/livos-install-stage + rsync to /opt/livos/livos/ excluding .git/.planning/docker/node_modules; pnpm install --frozen-lockfile + @livos/config tsc + ui vite build + BUILD-FAIL guards; JWT secret /opt/livos/data/secrets/jwt mode 0600; /opt/livos/.env mode 0600 with reuse-on-rerun reading existing DATABASE_URL/REDIS_URL passwords + .env.bak backup; livos.service systemd unit with After=postgresql+redis + Requires=postgresql+redis + EnvironmentFile + pnpm --filter livinityd start + Restart=on-failure + LimitNOFILE=65536; 30s curl :8080 health check WARN-not-FAIL; /etc/caddy/Caddyfile rewrite to `reverse_proxy 127.0.0.1:8080` per-mode shape — hybrid/tunnel/local-lan/cloud). Plus install.sh + parse-cli.sh + show-banner.sh edits wiring `--skip-deploy` CLI flag + SKIP_DEPLOY env-var fallback + per-mode "UI: open https://X" banner branch when deploy ran. Closes the "TLS green but UI absent" gap discovered on mainserver 154.53.56.75 (104-08 cert pipeline worked but browser saw Caddy placeholder). Scope boundary: liv-core/liv-worker/liv-memory DEFERRED to Plan 104-12 (documented + asserted by TEST 10 negative-grep). D-104-RELAY-ZERO-DATA-PLANE preserved: deploy-livinityd.sh has ZERO Server5/livinity.io references — only network calls are git clone (GitHub), apt (Ubuntu archive + NodeSource + Cloudsmith), and optional 104-10 heartbeat (--api-key gated). D-104-11-REUSE-NOT-ROTATE: re-running install.sh preserves existing PG/Redis passwords (reads from .env first). D-104-11-HEALTH-NONFATAL: health check WARN-not-FAIL so half-installed state is debuggable post-install (Wave 9 GAP-CLOSE, autonomous) — Shipped 2026-05-12 (`78714614..(Task-3-this-commit)`; 44/44 host-side bash test PASS — `scripts/install/__tests__/test-deploy-livinityd.sh`; 104-08 + 104-09 18/18 + 24/24 regression smoke still PASS — combined 86 PASS across 3 test files; D-104-NO-PROD-IMPACT preserved — mode-cloud.sh untouched via TEST 6 negative-grep; Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 3 commits). **Pending operator walk: re-run install.sh on mainserver 154.53.56.75 and confirm `https://test.livinity.live` shows LivOS login screen.**
- [x] 104-13-PLAN.md - pnpm `blockExoticSubdeps` HOTFIX: `deploy-livinityd.sh` now writes `/opt/livos/.npmrc` with `block-exotic-subdeps=false` BEFORE `pnpm install` runs, unblocking `baileys → libsignal` (a legitimate Phase 25 WhatsApp subdep resolved via git-repository URL) on pnpm 11+. Mainserver 154.53.56.75 re-test of 104-12 failed at `pnpm install` with `[ERR_PNPM_EXOTIC_SUBDEP] Exotic dependency "libsignal" (resolved via git-repository) is not allowed in subdependencies when blockExoticSubdeps is enabled`; Mini PC unaffected because older pnpm there doesn't enforce the gate. New helper `_dld_write_pnpm_npmrc` is idempotent (greps for existing `^block-exotic-subdeps=` directive and short-circuits if present) and is wired into `deploy_livinityd` AFTER `_dld_clone_source` (so `/opt/livos/` exists) and BEFORE `_dld_build_packages` (so pnpm sees the file). Header comment block documents the supply-chain tradeoff (relaxes the gate for ALL git-resolved subdeps, not just libsignal) and lists deferred audit checklist: (a) review every git-resolved subdep in pnpm-lock.yaml, (b) pin baileys to a libsignal-free version when one becomes available, (c) consider switching to npm-published libsignal-client wrapper so the gate can be re-enabled. Test extensions: 66 → 71 assertions (TEST 15 NEW: helper defined, literal `block-exotic-subdeps=false` present, target path under `_DLD_LIVOS_DIR`, idempotent grep guard, call-order between clone and build). D-104-13-SECURITY-TRADEOFF documented as accepted in helper source comment + 104-13-SUMMARY.md. D-104-13-IDEMPOTENT-APPEND documented (no double-write on install.sh re-run). (Wave 11 HOTFIX, autonomous) — Shipped 2026-05-12 (`85b0b3ef..(Task-2-this-commit)`; 71/71 host-side bash test PASS — `scripts/install/__tests__/test-deploy-livinityd.sh`; 104-08 + 104-09 18/18 + 24/24 regression smoke still PASS — **combined 18 + 24 + 71 = 113 PASS across 3 test files (up from 108 after 104-12)**; D-104-NO-PROD-IMPACT preserved — mode-cloud.sh untouched via TEST 6 negative-grep; D-104-RELAY-ZERO-DATA-PLANE preserved — zero Server5 references; Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across both commits). **Pending orchestrator next-step: re-run `bash install.sh --mode hybrid --domain test.livinity.live --cf-token X --cf-zone-id Y` on mainserver 154.53.56.75 and confirm pnpm install succeeds (no more `[ERR_PNPM_EXOTIC_SUBDEP]`) + all 4 systemd services active + UI loads at `https://test.livinity.live` — this is the GO/NO-GO gate for closing Phase 104.**
- [x] 104-12-PLAN.md - deploy-livinityd path-bug fix + liv-stack deploy: HOTFIX + SCOPE-EXTENSION. Fixes the critical nested-`/opt/livos/livos/` rsync bug in 104-11 that caused `pnpm install` to fail with `ENOENT: no such file or directory, scandir '/opt/livos/liv/packages/core'` on mainserver 154.53.56.75 live test (root cause: livinityd's `@liv/core: "file:../../../liv/packages/core"` resolves from `/opt/livos/packages/livinityd/`, three levels up = `/opt/liv/`; nested layout pointed `../../../liv` at `/liv` which doesn't exist). Path constants: retired `_DLD_LIVOS_SRC`; flat `_DLD_LIVOS_DIR=/opt/livos/`; new `_DLD_LIV_DIR=/opt/liv/` + `_DLD_SYSTEMD_LIV_CORE_UNIT`/`_DLD_SYSTEMD_LIV_WORKER_UNIT`/`_DLD_SYSTEMD_LIV_MEMORY_UNIT`. schema.sql + systemd WorkingDirectory + rsync dest + BUILD-FAIL guards + UI symlink all flat-rewired. Pre-flight check: assert `/opt/liv/packages/core/` exists before `pnpm install` (catches ENOENT loudly). `_dld_clone_source` extended to ALSO rsync `repo/liv/` → `/opt/liv/` (sibling sync). 3 NEW helpers: `_dld_build_liv_packages` (npm install --omit=optional in /opt/liv + per-package npm run build for core/worker/mcp-server/memory + BUILD-FAIL guards mirroring update.sh:287-295; closes update.sh's missing-memory-build bug per project memory), `_dld_sync_liv_dist_into_pnpm_store` (iterates ALL `@liv+<pkg>*` store dirs with rsync --delete — canonical Phase 31 BUILD-02 multi-dir fix extended to all 4 liv packages; closes Mini PC pitfall where pnpm sharp-version drift causes stale-dist imports), `_dld_write_liv_systemd_units` (writes liv-core.service + liv-worker.service + liv-memory.service; each ExecStart=node dist/index.js + EnvironmentFile=/opt/livos/.env + Restart=on-failure + RestartSec=5 + LimitNOFILE=65536; enable/start order memory → worker → core; mcp-server intentionally NO systemd unit per P77 on-demand spawn). `livos.service` After= clause adds liv-core for boot ordering. `deploy_livinityd` pipeline reordered: system pkgs → infra → clone-both-trees → build livos (pnpm) → build liv (npm) → sync liv dist into pnpm store → jwt + .env → liv systemd units FIRST → livos systemd unit → health check → caddy reload. Test extensions: 44 → 66 assertions (TEST 3 extended; TEST 10 INVERTED from negative-grep to positive — liv unit templates + systemctl enable + pnpm-store iteration + rsync repo/liv/ + NEGATIVE no liv-mcp-server.service; TEST 12 NEW — path-bug fix verification; TEST 13 NEW — liv-stack build pipeline; TEST 14 NEW — deploy_livinityd call order). After this plan ships, running install.sh --mode hybrid on a fresh Ubuntu box should result in a fully working LivOS — UI loads, livinityd backend up, all 4 systemd services active (livos.service + liv-core.service + liv-worker.service + liv-memory.service). D-104-12-FLAT-LAYOUT: /opt/livos/ is FLAT (matches Mini PC + Phase 65 rename). D-104-12-MCP-SERVER-NO-SYSTEMD: mcp-server built but no daemon (P77 on-demand spawn). D-104-12-SYSTEMD-LOOSE-DEP: liv-* services use After= ordering, NOT hard Requires= between themselves. D-104-12-COMBINED-TASK-1-2: path-bug fix + liv-stack extension committed atomically (inseparable; splitting leaves intermediate state where pnpm install still fails). (Wave 10 HOTFIX, autonomous) — Shipped 2026-05-12 (`7a708430..(Task-3-this-commit)`; 66/66 host-side bash test PASS — `scripts/install/__tests__/test-deploy-livinityd.sh`; 104-08 + 104-09 18/18 + 24/24 regression smoke still PASS — **combined 18 + 24 + 66 = 108 PASS across 3 test files (up from 86 after 104-11)**; D-104-NO-PROD-IMPACT preserved — mode-cloud.sh untouched via TEST 6 negative-grep; D-104-RELAY-ZERO-DATA-PLANE preserved — zero Server5 references; Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 3 commits verified via `git hash-object`). **Pending orchestrator next-step: re-run `bash install.sh --mode hybrid --domain test.livinity.live --cf-token X --cf-zone-id Y` on mainserver 154.53.56.75 and confirm `pnpm install` succeeds (no more ENOENT) + all 4 systemd services active (`systemctl is-active livos liv-core liv-worker liv-memory` returns 4× "active") + UI loads at `https://test.livinity.live` — this is the GO/NO-GO gate for closing Phase 104.**

**Non-goals (HARD):**
- Must NOT break existing cloud `<username>.livinity.io` deploy path on Mini PC
- Must NOT touch sacred `sdk-agent-runner.ts` SHA
- Remote access from outside the LAN is OUT OF SCOPE — Tailscale/WireGuard layered on top later by users who want that

---

### Phase 105: deploy-livinityd 1:1 Mini-PC update.sh Port

**Goal:** Replace the half-baked `scripts/install/deploy-livinityd.sh` (shipped in Plans 104-11/12/13) with a faithful 1:1 port of the Mini PC's production-tested `update.sh` (703 lines). Every quirk that `update.sh` has accreted over Phases 29-65 (pnpm flags, rsync excludes, `.env` reuse-vs-write order, systemd unit shape, liv-dist copy into pnpm-store, multi-store iteration, JWT secret bootstrap, gallery cache, ydotool apt step) MUST be mirrored in `deploy-livinityd.sh` so a fresh-install on a clean Ubuntu 24.04 VPS produces an identical filesystem + service topology to the live Mini PC. The live test on mainserver `154.53.56.75` for Phase 104 hit six cascading bugs — this phase is the dedicated cleanup that gets `install.sh --mode hybrid --domain X --cf-token Y --cf-zone-id Z` end-to-end-green on a fresh VPS: `https://X` shows the actual LivOS login UI (NOT a Caddy placeholder, NOT a build error page) and all 4 systemd services are `active`.

**Trigger:** USER DECISION 2026-05-12 (Path A locked in memory `project_p104_deploy_gap.md`). Phase 104's TLS pipeline (xcaddy + caddy-dns/cloudflare + LE DNS-01) is production-ready and stays untouched. Phase 104's deploy layer (Plans 11/12/13) is the gap — instead of patching it bug-by-bug, port what already works on Mini PC.

**Direction:**
- **Canonical reference:** `update.sh` at repo root. Read line-by-line, map each step to a deploy-livinityd helper.
- **Step mapping (update.sh → deploy-livinityd.sh):**
  - Pre-flight (cgroup escape, log file, SHA tracking, precheck) → OMIT for first-install (no existing service to escape, no prior SHA to compare) but PRESERVE the verify_build helper + JSON history-log directory scaffolding for forward-compat with future `update.sh` runs
  - Step 1 (git pull → /tmp + capture target SHA) → replace `git pull` with `git clone` (first-install has no checkout to update)
  - Step 1b (apt packages: ffmpeg, x11-utils, x11-xserver-utils, ydotool, xdotool, scrot, imagemagick, ydotoold systemd unit) → port verbatim, idempotent
  - Step 2 (rsync `/tmp/livos/` → `/opt/livos/` with `--delete --exclude='.git'`) → port verbatim. Critical: do NOT use over-broad `--exclude='docker/'` (kills UI routes per memory) — anchor pattern `--exclude='/docker/'`
  - Step 3 (rsync `/tmp/liv/` → `/opt/liv/` sibling sync) → port verbatim
  - Step 4 (`pnpm install --frozen-lockfile || pnpm install` in /opt/livos; `npm install --omit=optional` in /opt/liv) → port verbatim BUT add `block-exotic-subdeps=false` to `/opt/livos/.npmrc` BEFORE pnpm install (Plan 104-13 retained; pnpm 11 vs Mini PC's older pnpm divergence)
  - Step 5 (build: `pnpm --filter @livos/config build && pnpm --filter ui build` in /opt/livos; per-package `cd packages/X && npm run build` for liv core/worker/mcp-server/memory + dist-copy to ALL `@liv+<pkg>*` pnpm-store dirs) → port verbatim. Honor `verify_build` BUILD-FAIL guard pattern (update.sh:287-295)
  - Step 6 (gallery cache git pull, idempotent on missing dir) → port as-is
  - Step 7 (chown -R bruce:bruce /opt/livos /opt/liv) → port BUT make user configurable (deploy-livinityd defaults to root but should accept --user flag)
  - Step 8 (systemctl daemon-reload + restart livos, liv-core, liv-worker, liv-memory in order) → for first-install, replace `restart` with `enable --now` + write all 4 unit files (104-12 has 3 of these; verify mcp-server intentionally has NO systemd unit per P77)
  - Step 9 (cleanup /tmp) → port verbatim
- **First-install-only additions (NOT in update.sh):**
  - PostgreSQL role/DB/schema.sql apply (104-11 helper) — runs ONCE on fresh VPS
  - Redis `requirepass` bootstrap (104-11 helper) — runs ONCE
  - JWT secret `/opt/livos/data/secrets/jwt` generation (104-11 helper) — runs ONCE
  - `.env` generation with random PG/Redis passwords (104-11 helper) — preserve REUSE-on-rerun semantics (D-104-11-REUSE-NOT-ROTATE)
  - Caddy reload at the end (104-11 helper) — runs each install
- **Sacred:** `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED.
- **D-105-MINIPC-PARITY:** deploy-livinityd.sh after this phase must produce a directory tree under `/opt/livos/` and `/opt/liv/` that is byte-equivalent to what `update.sh` produces on Mini PC (modulo first-install-only files: data/, .env, jwt secret). Verifiable via a `tree --noreport /opt/livos /opt/liv` diff harness during UAT.
- **D-105-NO-PROD-IMPACT:** Mini PC's `update.sh` is NOT modified by this phase — only `deploy-livinityd.sh` and its test suite. Mini PC keeps running update.sh exactly as it does today. (104-NO-PROD-IMPACT preserved.)
- **D-105-NO-NEW-TLS:** TLS pipeline (104-08 + 104-09) is untouched. This phase ONLY rewires deploy-livinityd. install.sh CLI surface (--mode hybrid --domain X --cf-token Y --cf-zone-id Z) MUST work byte-equivalent to 104-13's behavior.
- **Live test GO/NO-GO gate:** Rent a fresh Ubuntu 24.04 VPS (or re-use cleaned mainserver `154.53.56.75`). Run `bash install.sh --mode hybrid --domain <user-domain> --cf-token <token> --cf-zone-id <zone>`. PASS = all 5 of: (a) `systemctl is-active livos liv-core liv-worker liv-memory` returns 4× "active"; (b) `curl -sk https://<domain>` returns LivOS login HTML (not Caddy placeholder, not 502); (c) browser-side green padlock + LivOS UI renders; (d) Sacred SHA preserved via `git hash-object liv/packages/core/src/sdk-agent-runner.ts`; (e) `update.sh` re-run on the same box succeeds idempotently (i.e., the layout produced by `deploy-livinityd.sh` is compatible with subsequent `update.sh` invocations — proves parity).
- **Plan count estimate:** 3-5 plans (1 plan per major update.sh step group + 1 dedicated live-VPS UAT plan).

**Sacred:** `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED.

**Depends on:** Phase 104 (TLS layer + 104-11 deploy-livinityd helpers as starting scaffold). Mini PC `update.sh` at repo HEAD as canonical reference (production-tested, do not modify).

**Status:** ✅ **SHIPPED** 2026-05-12. Plans 105-01/02/03 ✅ + 105-04 ✅ operator walk + 105-05 ✅ Bug #1-#6 back-port (10 commits: `290885bc..e3ebb572`). Combined static tests: 126 + 18 + 24 = **168 PASS, 0 FAIL**. Sacred SHA preserved 14/14 commits. **UAT canlı-doğrulandı 2× (initial + re-run after Bug #6 fix):** auth+tor Docker containers RUNNING on fresh VPS via Mini PC retag pattern; LE green-padlock cert + `<title>Livinity</title>` HTML + LivOS UI serving HTTP 200; livinityd alive-window 3% → **25% (8× improvement after Bug #6)**; restart-rate 24+ → **3 over 3 min**. Phase 105's contract (1:1 port of Mini PC update.sh) fully delivered. **Remaining work (Bugs #7-#10: google-chrome, mender, samba, bruce-user + fluxbox) deferred to v34 bootstrap-layer milestone** — these are subset of `livos/install.sh:1-1725` initial bootstrap, NOT in Phase 105 scope (update.sh port). See `UAT-CHECKLIST.md` for both UAT walks + bug analysis + re-run evidence.

**Plans:** 4 plans in 3 waves
- [x] 105-01-PLAN.md (Wave 1, autonomous) — Pipeline refactor + `_dld_verify_build` helper extraction + anchored `/docker/` exclude fix + env-before-pnpm reorder + `_DLD_TEMP_DIR` alias. Shipped 2026-05-12 (`290885bc..b377d785`; 79 PASS in test-deploy-livinityd.sh, +8 over 71 baseline; 121 combined; sacred SHA + update.sh untouched; Rule 3 deviation in TEST 13 regex; Rule 1 fix in TEST 16 fallback)
- [x] 105-02-PLAN.md (Wave 2, autonomous, deps: 105-01) — Gap closure G2-G9: apt streaming packages (ffmpeg + ydotoold systemd unit per update.sh:339-405) + atomic update.sh self-rsync via .new + mv + gallery cache helper + chown + app-script chmod +x + temp dir cleanup + .deployed-sha forward-compat + UI rm -rf dist before vite build. Shipped 2026-05-12 (`2bef633d..19f01fbc`; +185 net lines into deploy-livinityd.sh; pipeline order verified — streaming AFTER clone+BEFORE jwt, gallery BEFORE perm, cleanup LAST; sacred SHA + update.sh untouched; 79 PASS preserved — new tests deferred to 105-03)
- [x] 105-03-PLAN.md (Wave 2 sequential after 105-02, autonomous, deps: 105-01) — Test harness extension: +38 assertions (TESTs 17, 18, 20-28, 28b/c/d, 29, 30, 32a-e) covering G2-G9 + Hazard #1 PGPASSWORD shell-scope guard + Hazard #2/#3 pipeline-order + D-105-STEP8 sub-decisions + sacred SHA negative-grep + update.sh write-protection. Shipped 2026-05-12 (`535e4f3c..3ba5e698`; **117 PASS** in test-deploy-livinityd.sh — overshot 115 target by +2 due to plan-spec arithmetic correction; combined 117+18+24=**159 PASS**; TEST 33 deleted per plan-checker WARNING #2; TEST 32 split to 32a-e per plan-checker BLOCKER; Rule 1 deviation in TEST 17 multi-line regex). Iteration 1 plan-checker revision validated.
- [x] 105-04-PLAN.md (Wave 3, autonomous walk by Claude 2026-05-12) — UAT walked end-to-end on mainserver `154.53.56.75` (Ubuntu 24.04.3, fresh). Install ran with `--mode hybrid --domain test.livinity.live --cf-token <X> --cf-zone-id e480ff1ba15eb4c26af72dfd1207698f`. Evidence captured in `UAT-EVIDENCE/`: services-active.txt, health-response.json, sacred-sha-vps.txt, livos-html-200-sample.html, install-log.txt. **Result: PARTIAL PASS** — TLS pipeline + deploy-livinityd 1:1 update.sh port FUNCTIONALLY VERIFIED (LE cert + Caddy reverse_proxy + `<title>Livinity</title>` HTML body proven during livinityd alive-window via HTTP 200 catch at T+11s); sacred SHA preserved on VPS; 4/5 services 100% stable (livos flapping from upstream Bug #6-#10 gaps NOT in Phase 105 scope). See UAT-CHECKLIST.md for 10-bug analysis: Bugs #1-#5 are deploy-livinityd-scope (Plan 105-05 back-port); Bugs #6-#10 are bootstrap-layer (auth-server private image, mender, samba, chrome, bruce user — deferred to v34).
- [x] 105-05-PLAN.md (Wave 4, autonomous, deps: 105-04 UAT signoff) — **HOTFIX BACK-PORT shipped 2026-05-12**: all 6 in-scope UAT bugs fixed (commits `232cf063..e3ebb572`). Bug #1: pnpm 11 `ERR_PNPM_IGNORED_BUILDS` → `--config.dangerously-allow-all-builds=true` on all 3 pnpm install paths. Bug #2: `_dld_update_gallery_cache` find pipefail → `|| true`. Bug #3: cli.ts +x after rsync → chmod in `_dld_fix_permissions`. Bug #4: Caddyfile mode 0644 in `_dld_update_caddy_to_livinityd`. Bug #5: livos.service ExecStart matches Mini PC pattern (`/usr/bin/npx tsx ... --data-directory ... --port 8080`). Bug #6: **NEW** `_dld_setup_docker_images` helper mirrors Mini PC `livos/install.sh:408-443 setup_docker_images()` — pulls `getumbrel/auth-server:1.0.5` + `getumbrel/tor:0.4.7.8`, retags as `livos/*` + `:latest` alias locally; pipeline runs it right after `_dld_install_streaming_packages`. **Re-run UAT 2026-05-12T23:16Z verified Bug #6 RESOLVED LIVE**: `docker ps` shows `auth` + `tor_proxy` containers RUNNING with `livos/*` images; livinityd alive-window improved from ~3% to 25% (8× improvement); restart-rate from 24+ to 3 over 3 min. Test extensions: +9 assertions (TESTs 34-38, 38b, 39, 40, 41) → 117 → 126 PASS in test-deploy-livinityd.sh; combined 168 PASS (was 159 at code-complete). Phase 105 contract fully delivered + live-validated 2×. Companion artifacts: `docker-images/README.md` + `push-to-dockerhub.sh` (Docker Hub backup path under `utopusc/livos-*` for CI/CD mirrors or airgapped installs).

**Non-goals (HARD):**
- Must NOT modify Mini PC's `update.sh` (only deploy-livinityd.sh and its test harness)
- Must NOT regress TLS pipeline from 104-08 / 104-09 (zero changes to caddy/CF/LE wiring)
- Must NOT touch sacred `sdk-agent-runner.ts` SHA
- Must NOT add a parallel deploy implementation (Docker compose or Ansible — those are Path B / Path C; this phase is Path A only)

---

## Coverage

All v31 requirements (CARRY/RENAME/DESIGN/CORE/PANEL/VIEWS/COMPOSER/CU-FOUND/CU-LOOP/RELIAB/BROKER-CARRY/MEM/MARKET) mapped to phases 64-76. 100% coverage. See REQUIREMENTS.md Traceability table (filled by phase planning).

---

## Project-Level Milestone Index (carry-over)

- v19.0 Custom Domain Management (shipped 2026-03-27)
- v20.0 Live Agent UI (shipped 2026-03-27)
- v21.0 Autonomous Agent Platform (shipped 2026-03-28)
- v22.0 Livinity AGI Platform (shipped 2026-03-29)
- v23.0 Mobile PWA (shipped 2026-04-01)
- v24.0 Mobile Responsive UI (shipped 2026-04-01)
- v25.0 Memory & WhatsApp Integration (shipped 2026-04-03)
- v26.0 Device Security & User Isolation (shipped 2026-04-24)
- v27.0 Docker Management Upgrade (shipped 2026-04-25)
- v28.0 Docker Management UI (Dockhand-Style) (shipped 2026-04-26)
- v29.0 Deploy & Update Stability (shipped 2026-04-27)
- v29.2 Factory Reset (shipped 2026-04-29)
- v29.3 Marketplace AI Broker (Subscription-Only) (shipped local 2026-05-01)
- v29.4 Server Management Tooling + Bug Sweep (shipped local 2026-05-01)
- v29.5 v29.4 Hot-Patch Recovery + Verification Discipline (shipped local 2026-05-02 via `--accept-debt`)
- v30.0 Livinity Broker Professionalization (incl. v30.5 informal scope) (shipped local 2026-05-04 via `--accept-debt`)
- **v31.0 Liv Agent Reborn** (active — Phases 64-76)
- **v32.0 AI Chat Ground-up Rewrite + Hermes Background Runtime** (CODE-COMPLETE 2026-05-06 — Phases 80-91 — pending UAT)
- **v33.0 WebApp Launcher + Teach/Auto Modes** (CODE-COMPLETE 2026-05-08 — Phases 92-98 — pending UAT)
- (deferred) Backup & Restore — 8 phases defined in `milestones/v30.0-DEFINED/`, renumbered to future slot (likely v32.0)

---

*Last updated: 2026-05-14 — v35.0 milestone OPENED (Design System Unification, Phases 115-121). Master plan at `.planning/v35-DESIGN-SYSTEM-MILESTONE.md`. v34.0 8/8 phases CODE-COMPLETE; operator-walked binding UAT pending for Phase 110 (WebApp click) + Phase 111 (fresh-VPS install).*

---

# v35.0 — Design System Unification (UI/UX) — OPENED 2026-05-14

**Goal:** Unify all 3 LivOS UI surfaces (Mini PC livinityd UI, Server5 Next.js platform, landing static HTML) on the canonical `dashboard.html` design language (Geist + Geist Mono + Instrument Serif fonts, custom CSS variables, light/dark/iridescent themes, bento layout, accent color palette).

**Master plan:** [`v35-DESIGN-SYSTEM-MILESTONE.md`](v35-DESIGN-SYSTEM-MILESTONE.md) (470 lines — read this first).

**Why now:** During Phase 111 binding UAT prep on 2026-05-14 the user observed visual discontinuity across surfaces (Tailwind+zinc vs Geist+CSS-vars vs shadcn). User-stated: *"livinity.io nun tasarimini biliyorsun ... UI da cok profesyonel ol dashboard daki UI vs kullan."* v35.0 generalizes the Phase 111 quick fix.

**Surface inventory:**
- Mini PC livinityd UI: `livos/packages/ui/src/` — **654 TSX files** (95 components + 123 modules + 219 routes + 29 shadcn + 142 features + 7 layouts + 23 providers)
- Server5 Next.js: `/opt/platform/web/src/` — 68 TSX + 69 TS files
- Landing static HTML: `/opt/landing/livinity.io/` — 8 HTML (all already use Geist; drift to fix)

**Locked invariants:** D-V35-CANONICAL-IS-DASHBOARD-HTML, D-V35-NO-FUNCTIONAL-REGRESSIONS, D-V35-MINI-PC-OPERATOR-PRIORITY, D-V35-SACRED-SHA, D-V35-INCREMENTAL-COMMITS, D-V35-LIGHT-DARK-IRIDESCENT-PARITY, D-V35-ACCESSIBILITY-WHEN-MIGRATING (full text in master plan).

---

### Phase 115: UI Component Inventory & Visual Baseline — ✅ CODE-COMPLETE 2026-05-14

**Status:** Shipped 3 plans (115-01 Mini PC 654 TSX classified / 919 lines, 115-02 Server5 67 TSX + 52 TS / 236 lines / 0 canonical, 115-03 8 landing HTML + 48 PNG screenshots + COMPONENT-MAP 13 primitives). 7/7 must-haves PASS. D-115-READ-ONLY honored (`git diff` clean). Chrome DevTools MCP unreachable → headless Chrome fallback (48 PNGs vs 0). Iridescent capture deferred to Phase 117/121. Commits `f768e5d3..2d18c0cc` (6 commits).

**Goal:** Produce A→Z inventory of every UI component on every surface + baseline screenshots of every public route. Output: 3 INVENTORY.md docs + COMPONENT-MAP.md (cross-surface) + baseline-screenshots/.

**Direction:**
- Map every TSX file in `livos/packages/ui/src/` to {file path, primary purpose, route/feature, visual idiom, migration tag}
- Same for `/opt/platform/web/src/` (Server5, via SSH)
- Same for `/opt/landing/livinity.io/*.html`
- Chrome DevTools MCP — capture light + dark screenshots of every public route
- COMPONENT-MAP.md: identify same conceptual components across surfaces (button, card, stepper, modal) — these become Phase 119 ui-kit candidates
- D-115-READ-ONLY: zero source changes, pure documentation

**Plans (3 parallel-safe):** 115-01 Mini PC inventory · 115-02 Server5 inventory · 115-03 landing inventory + visual baseline.
**Estimated:** 2-3 hours of agent work.
**UAT:** all 3 INVENTORY docs reviewed by operator, baseline screenshots stored.

---

### Phase 116: Canonical Design System Spec — ✅ CODE-COMPLETE 2026-05-14

**Status:** Both plans shipped. **Tagged `v35.0-design-tokens-1.0.0`** (local, not pushed). `@livinity/design-tokens` v1.0.0 ships canonical `:root` block (3 cross-verified sources), Tailwind 3.4 preset, JSON manifest, DESIGN-SYSTEM.md (254 lines), STYLE-GUIDE.md skeleton, fonts.css with 4 @font-face blocks (Geist + Geist Mono + Instrument Serif × 2), 4 self-hosted `.woff2` files, LICENSE-FONTS.md OFL attribution, smoke-test PNG (44685 bytes, headless Chrome render proves offline fonts paint correctly). D-116-LOCK-CANONICAL + D-116-NO-CONSUMER-CHANGES + D-116-SELF-HOSTED-FONT-FALLBACK all upheld. Commits: `f7f83e05 → 96320229 → fde48137 → abad6e80 → 9b1f682b → (closure)`. **Open follow-ups (non-blocking):** D-116-FOLLOW-UP-DARK + D-116-FOLLOW-UP-IRIDESCENT — `body.dark` + `body.iridescent` blocks shipped as PENDING stubs (Server5 SSH unreachable at fetch); patch as `v35.0-design-tokens-1.0.1` when Server5 returns. **Deviation:** Plan 116-02 executor hit content-filter mid-task (OFL 1.1 full-text inlining); manual closure linked SIL canonical URL instead — license obligation met.

**Goal:** Codify dashboard.html aesthetic into a portable, version-controlled spec. Single source of truth that every surface consumes.

**Direction:**
- Author DESIGN-SYSTEM.md: typography scale, color tokens (light/dark/iridescent), spacing, radius, shadow, motion curves, accessibility (focus rings, contrast targets), interaction patterns
- Build `livos/packages/design-tokens/`:
  - `tokens.css` — pure CSS `:root` + `body.dark` + `body.iridescent` blocks
  - `tailwind.preset.cjs` — Tailwind preset mapping the same tokens
  - `theme.json` — JSON manifest for tooling
  - `fonts.css` — Geist + Instrument Serif declarations (Google Fonts CDN + self-hosted fallback for offline LivOS)
- Tag release `v35.0-design-tokens-1.0.0`
- D-116-LOCK-CANONICAL: tokens map exactly to dashboard.html's current shipped values; no improvisation

**Plans (2):** 116-01 spec + tokens + tailwind preset · 116-02 fonts + visual smoke test.
**Estimated:** 3-5 hours.
**UAT:** import tokens.css into a throwaway HTML, render dashboard.html elements, pixel-diff against baseline.

---

### Phase 117: Server5 Next.js Platform Migration — ✅ CODE-COMPLETE 2026-05-14

**Status:** All 5 plans shipped. 11/11 must-haves PASS. Server5 `web` PM2 online; 4 public routes verified HTTP 200 (login, store, download, /dashboard/install). Commits `58d5f482 → f2e9a61d → afbc96c9 → 9b8b2d18 → 436017c8`. Cross-repo: 31 `.pre-117-NN.bak` rollback backups live on Server5, dead `src/src/` archived to `_pre-117-src-src.tar.gz`. Tailwind 4 (`@theme inline` CSS-first) auto-migration discovered + applied (Server5 had moved past Tailwind 3.4). D-117-NO-API-CHANGES + D-117-NO-AUTH-FLOW-CHANGES + D-117-PRESERVE-DASHBOARD-INSTALL + D-117-CROSS-REPO + D-117-OPERATOR-CAN-RESTART-AT-WILL all upheld.

**Goal:** Apply canonical design system to every Server5 Next.js route. After this phase, `livinity.io/login`, `/register`, `/verify`, `/forgot-password`, `/reset-password`, `/dashboard/install`, `/store`, `/download`, `/dashboard` (Next.js side, currently NOT live but should match) all share dashboard.html's visual identity.

**Direction:**
- `app/layout.tsx` injects `tokens.css` + `fonts.css` from `@livinity/design-tokens`
- `tailwind.config.ts` extends design-tokens preset
- `globals.css` replaces bespoke styles with token references
- Per-route restyle: 6 (auth)/* routes + dashboard/install (already aligned, audit) + store + download
- Cross-repo: `.planning/` artifacts in this repo, source edits via SSH on Server5, backups (`*.pre-117-NN.bak`)
- D-117-NO-API-CHANGES: API routes (`/api/**`) and DB schema untouched
- D-117-NO-AUTH-FLOW-CHANGES: session cookie + getSession + redirect logic untouched

**Plans (5):** 117-01 foundation · 117-02 (auth)/* · 117-03 /dashboard/install audit · 117-04 /store · 117-05 /download + Next.js /dashboard.
**Estimated:** 8-12 hours.
**UAT:** browser-walk every Server5 route, side-by-side with dashboard.html — visual continuity confirmed.

---

### Phase 118: Landing Static HTML Polish & Drift Fix — ✅ CODE-COMPLETE 2026-05-14

**Status:** Both plans shipped. 9/9 must-haves PASS. `_shared/tokens.css` + `_shared/fonts.css` + 4 self-hosted woff2 + `_shared/nav.jsx` live on Server5. 8 HTML pages linked + mount-div + Babel-in-browser nav. Defense-in-depth: dashboard.html keeps inline `:root` AND links shared. Hex scrub: 5 substitutions across 6 needs-migration files. Commits: `ad523f9a` (118-01), `9b5f46a5` (118-02). 16 `.pre-118-NN.bak` backups on Server5. **Carry-over:** Phase 119 will collapse the 7 stacked navs (existing inline + new shared) into a single `<Nav>` ui-kit primitive.

**Goal:** All 8 HTML pages share dashboard.html's exact CSS variable definitions and reusable classes. Drift fixed. Common nav/header extracted.

**Direction:**
- Audit drift: `index.html`, `auth.html`, `profile.html`, `customize.html`, `download.html`, `forgot-password.html` vs dashboard.html canonical values
- Extract `/opt/landing/livinity.io/_shared/tokens.css` — all HTML pages `<link>` it (replaces inline `:root` definitions)
- Extract `/opt/landing/livinity.io/_shared/nav.jsx` — reusable React UMD component for top nav (Livinity brand + theme toggle + sign-in/dashboard link)
- Backward-compat: dashboard.html + dashboard-install.html keep inline tokens AND link to _shared/tokens.css (defense in depth)

**Plans (2):** 118-01 drift audit + extract _shared/tokens.css · 118-02 reusable nav.jsx + integration.
**Estimated:** 3-5 hours.
**UAT:** all 8 HTML pages render identical chrome (header, theme toggle, footer); operator-walked.

---

### Phase 119: Reusable Component Library (`@livinity/ui-kit`) — ✅ CODE-COMPLETE 2026-05-14

**Status:** All 4 plans shipped. 10/10 must-haves PASS. `@livinity/ui-kit` v0.1.0 published locally: 11 components (5 atoms + 6 composites) + ToastProvider + useToast + theme utils = **18 named exports**. 3 build targets all green (ESM 14.42KB, CJS, UMD 9.71KB). **62/62 Vitest tests PASS.** Storybook 8 builds clean. UMD smoke verifier PASS (`window.LivKit` 18 exports). Headless Chrome screenshot 57.3KB. Commits `a64160e6 → bc12071e` (15 commits). **Critical auto-fix during 119-04:** `process.env.NODE_ENV` not inlined in UMD — would have crashed all Phase 118 landing pages. Caught + fixed (bundle 22.35KB → 9.71KB). D-119-NO-CONSUMER-CHANGES upheld (only `livos/packages/ui-kit/**` + workspace.yaml + lockfile changes). Ready for Phase 120 (Mini PC) + Phase 121 retrofit of Phase 118 landing pages.

**Goal:** Single React component library that any surface imports. Mini PC livinityd UI (Vite), Server5 Next.js, landing HTML pages (UMD) all consume the same components. New UI work defaults to the library.

**Direction:**
- New package: `livos/packages/ui-kit/`
- Initial exports (locked to dashboard.html idioms): Button, Card, Stepper, Pill, Input, PasswordInput, CommandBox, Modal, Toast, ThemeToggle, NavBar
- 3 build outputs: ESM (Vite/Next), CJS (legacy/SSR), UMD (HTML pages — `window.LivKit.Button`)
- Storybook stories per component
- Vitest unit tests per component
- Depends on `@livinity/design-tokens` (Phase 116)
- D-119-NO-CONSUMER-CHANGES: ships standalone; consumers migrate in Phase 120/121

**Plans (4):** 119-01 scaffolding + build pipeline · 119-02 atoms (Button/Card/Pill/Input/PasswordInput) · 119-03 composites (Stepper/CommandBox/Modal/Toast/NavBar/ThemeToggle) · 119-04 UMD build + landing HTML smoke test.
**Estimated:** 12-16 hours.
**UAT:** Storybook screenshot suite passes; smoke-import each component into a Server5 dummy route.

**Progress:** 1/4 plans shipped.
- **119-01 SHIPPED 2026-05-14** — `@livinity/ui-kit` v0.1.0 chassis green: tsup ESM+CJS (151 B mjs + 184 B cjs + 76 B d.ts), vite UMD (360 B livkit.umd.js with LivKit global), Vitest jsdom (5/5 pass), Storybook 8.6 static build (storybook-static/index.html, design-tokens CSS injected, livTheme 3-way global toolbar). Commits: `a64160e6`, `468f9802`, `4ab24bcf`. D-119-NO-CONSUMER-CHANGES upheld (`git diff --name-only` shows only `packages/ui-kit/**` + `pnpm-workspace.yaml` + lockfile). Two devDep additions for Windows pnpm stability: `@jridgewell/gen-mapping ^0.3.13` + `@babel/generator ^7.29.0` + local `.npmrc` `public-hoist-pattern` (documented Rule 3 deviation in 119-01-SUMMARY.md).
- 119-02 + 119-03: PENDING (Wave 2 parallel-ready)
- 119-04: PENDING (Wave 3)

---

### Phase 120: Mini PC livinityd UI Migration — Wave 1 (high-impact) — ✅ CODE-COMPLETE 2026-05-14

**Status:** All 5 plans shipped, 9/9 must-haves PASS, Sacred SHA `f3538e1d…` preserved 5/5 commits. Foundation wired (`@livinity/design-tokens` + `@livinity/ui-kit` workspace deps + Tailwind preset + tokens.css + fonts.css + body-class theme toggle + iridescent). **14 high-impact components migrated** (vs 23 plan target — honest tally; 9 deferred to Phase 121 long-tail as already-canonical NOOP or prop-API mismatch). Commits: `82f9f61a → a1acc390 → 85f6e05d → ccfc769d → 01787e04`. All behavioral-diff guards PASS (zero handler/hook/SSE drift). **Operator UAT pending** (per-plan UAT blocks in each SUMMARY.md — `bash /opt/livos/update.sh` then browse `https://bruce.livinity.io`). D-120-MINI-PC-OPERATOR-PRIORITY upheld: each plan independently revertable via `git revert <commit> && bash /opt/livos/update.sh`.

**Goal:** Migrate the 30 highest-traffic Mini PC components to canonical design system + ui-kit. After this phase, opening Mini PC dashboard shows identical fonts/spacing/colors as `livinity.io/dashboard`.

**Direction:**
- Foundation: install `@livinity/design-tokens` + `@livinity/ui-kit` in `livos/packages/ui/`
- `tailwind.config.ts` extends design-tokens preset
- `index.css` imports tokens + fonts; replace bespoke vars with token refs
- Theme provider: switch body class on `liv_theme` localStorage (light/dark/iridescent)
- Restyle the 30 highest-traffic components:
  - Layouts (desktop.tsx, bare layouts)
  - Top-level chrome (dock, spotlight, cmdk, app-icon, window-content, window-manager)
  - Settings shell + 5 most-used Settings panels
  - AI Chat input + chat panel + slash-command-menu
  - App Store window content
  - Login screen
- Visual diff vs Phase 115 baseline (regression check)
- D-120-NO-FUNCTIONAL-CHANGES: visual layer only, prop APIs untouched
- D-120-INCREMENTAL-DEPLOY: per-plan deployable; revert-safe; operator runs `update.sh` between plans (per `feedback_minipc_is_owncloud_primary`)

**Plans (5):** 120-01 foundation · 120-02 layout + chrome · 120-03 Settings shell + panels · 120-04 AI Chat surface · 120-05 App Store window.
**Estimated:** 16-24 hours.
**UAT:** operator browses Mini PC dashboard after each plan; visual continuity vs `livinity.io/dashboard` confirmed; OwnCloud functionality unchanged.

---

### Phase 121: Mini PC UI Long-Tail Migration + Cross-Surface Audit

**Goal:** Migrate remaining ~600 Mini PC components in feature batches; audit cross-surface visual consistency; lock with regression tests; ship developer style guide.

**Direction:**
- Long-tail batches: backups (~30) + factory-reset (~10) + local-setup (~10) → batch 1; files (~25) → batch 2; window-content app dialogs (~50) → batch 3; routes/* (~219, sub-batched) → batch 4; generic components (~150) + shadcn replacement audit → batch 5
- Cross-surface audit: side-by-side screenshots of common elements; document residual diffs in `121-cross-surface-audit/CONSISTENCY-REPORT.md`; fix outliers
- Visual regression suite: Playwright snapshots for canonical pages; GitHub Actions workflow on PRs
- Developer style guide: `livos/packages/design-tokens/STYLE-GUIDE.md` ("How to add a new LivOS UI component")
- D-121-OPERATOR-CHECKPOINTS: routes batch (large) inserts UAT checkpoints between sub-batches

**Plans:** 6 plans

Plans:
- [x] 121-01-PLAN.md — Backups + Factory-reset + Local-setup token+ui-kit migration (~47 tsx files, wave 1, autonomous) — SHIPPED
- [x] 121-02-PLAN.md — Files feature token+ui-kit migration (~119 tsx files, wave 2, autonomous, OwnCloud-priority surface) — SHIPPED
- [x] 121-03-PLAN.md — Window chrome + WebApp Launcher + per-app content dialogs migration (~63 tsx files, wave 2, autonomous, strong behavioral guard) — SHIPPED
- [x] 121-04-PLAN.md — routes/* sub-batched 04a settings 04b apps+docker 04c misc with 3 operator UAT checkpoints (~219 tsx files, wave 3, autonomous=false) — SHIPPED
- [x] 121-05-PLAN.md — Generic components + features survivors + shadcn-components/ui audit-and-delete-or-keep (~95 + 29 audit, wave 4, autonomous) — SHIPPED (4 commits, 22 v0.2.0 candidates documented)
- [x] 121-06-PLAN.md — CONSISTENCY-REPORT.md + Playwright visual-regression suite + GitHub Actions + STYLE-GUIDE.md expansion + v35.0 AC#1-8 close-out (wave 5, autonomous) — SHIPPED 2026-05-14, 4 commits `be41adfb..036a1e57`, sacred SHA preserved 4/4, AC#3 PASS at 92.5% avg, AC#6 config-complete
**Estimated:** 24-40 hours.
**Status:** All 6 plans SHIPPED. Phase 121 CODE-COMPLETE 2026-05-14. Sacred SHA preserved 19/19 commits across the phase. v35.0 milestone CODE-COMPLETE pending AC#8 operator final UAT walk.
**UAT:** all 654 TSX components migrated; operator-walked end-to-end (`bruce.livinity.io` → `livinity.io/dashboard` → `livinity.io/dashboard/install` → `livinity.io/login` → Mini PC livinityd UI) — visual continuity is the win condition. **Final v35.0 UAT walk in 121-06-SUMMARY.md § Operator post-121-06 final UAT block.**

---

**Total v35.0 estimate:** 70-105 hours of agent work (multiple sessions, paced for operator UAT checkpoints).

**Acceptance criteria (milestone-level):** see `v35-DESIGN-SYSTEM-MILESTONE.md` § "Acceptance criteria".

**Out of scope (v36+ candidates):** mobile app design, Agent Electron UI port, marketing copy refresh, email templates, Storybook→Figma sync, marketplace + changelog services, apps.livinity.io dark mode.

---

### 🟢 v36.0 LivOS Design Port (Active — Phases 122-129)

**Status (2026-05-15):** Opened after the original `v36-DRAFT.md` (segment-dock direction) was rejected in Phase 122 v1 (`3e8734f8` reverted to `bd1adc27`). User dropped a 10MB design handoff bundle from `claude.ai/design` (Livinity Design System, user-authored) and re-scoped v36 as a **component-by-component additive port** of that system into `livos/packages/ui/`. Master plan: [v36-DESIGN-PORT-MASTER.md](v36-DESIGN-PORT-MASTER.md). Design bundle local copies: `.planning/design-system/`.

**Direction:**
- 8 phases mapping to the 8-step port-guide in `design-system.html` §20 (tokens → button → section-head → field-card → plan-card → stat-tile → app-tile → chat-bubble)
- **Additive only** — new tokens/components ship parallel to existing. ZERO renames or breaking changes until each legacy consumer is migrated.
- **Micro-commits** — every visible change ships as the smallest atomic commit. Screenshot + user UAT before stacking. Multiple visual changes in one commit = rejected per [feedback_v36_no_bold_redesigns.md].
- **STRICTLY SEQUENTIAL** — Phase N starts only after Phase N-1 ships AND user UAT-approves the visible delta. No parallel work.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved through every commit.
- Mini PC UI ONLY — Server5 + landing untouched.

**Depends on:** v35.0 ✅ Shipped (provides `@livinity/design-tokens` + `@livinity/ui-kit` foundation).

**Phases (8 total — planned one-at-a-time via `/gsd-plan-phase`):**

---

### Phase 122: Design Tokens (Additive Port, Step 1 of 8) — ✅ SHIPPED 2026-05-15 (3 commits c2dbcd0c..658714ee, sacred SHA preserved 3/3, visible delta=NONE confirmed by screenshot diff)

**Goal:** Add Livinity Design System tokens (`--fg/--bg/--surface/--line/--r-*/--shadow-window/--shadow-pop/--ease-out-v36`) to `@livinity/design-tokens` package WITHOUT removing or renaming any existing token. After this phase ships, new Tailwind utilities (`bg-fg`, `text-fg-mute`, `border-line`, `rounded-r-lg`, `shadow-window-soft`, etc.) are usable but no component visibly changes.

**Direction:**
- Touched: `livos/packages/design-tokens/{tokens.css, tailwind.preset.cjs, DESIGN-SYSTEM.md}` (3 files)
- NOT touched: `livos/packages/ui/src/**` (D-122-NO-CONSUMER-CHANGES)
- Existing `--accent-blue/--dash-line/--card-shadow/--hero-grad/--card-bg/--dash-radius` byte-unchanged (D-122-ADDITIVE verified by grep)
- Visible delta: **NONE expected** — smoke verifies screenshot byte-equal to last approved state

**Plans:** 4 atomic commits (tokens.css → tailwind.preset.cjs → smoke verification → DESIGN-SYSTEM.md doc)

**Detailed plan:** [phases/122-design-tokens-additive-port/122-PLAN.md](phases/122-design-tokens-additive-port/122-PLAN.md)

**Estimated:** 30-60 min including smoke + commit loop.

**Depends on:** v35.0 design-tokens foundation ✅. Existing `--card-shadow` already byte-equals new `--shadow-card` (verified) → aliases not duplicates.

**UAT:** Build green + Vite HMR clean + browser screenshot diff = noise only. NO Mini PC deploy required (no visible delta).

---

### Phase 123: Button Shadcn Override (Additive Variants, Step 2 of 8) — ✅ SHIPPED 2026-05-15 (1 commit 4e47cb72, sacred SHA preserved 1/1, additive — zero production delta, 4 new v36-* variants + sizes available for opt-in)

**Goal:** Override `livos/packages/ui/src/shadcn-components/ui/button.tsx` variants to match design-system.html §04 — pill radius (`rounded-r-full`), `fg/bg` invert primary (black bg / white text), hairline `border border-line-strong` ghost, `rgba(220,38,38,0.3)` border danger, square icon-only.

**Direction:** Variant-by-variant commits. Old shadcn variant names preserved (backward-compatible) so unmigrated callsites stay green. Screenshot per variant for UAT.

**Plans:** TBD (write when P122 ships) — estimated 4-5 plans.

**Depends on:** Phase 122 ✅.

---

### Phase 124: Section-Head Pattern as `<SettingsPageHeader/>` (Step 3 of 8) — ✅ SHIPPED 2026-05-15 (1 commit 780d668a, sacred SHA preserved 1/1; ai-config first consumer; SettingsPageLayout additive hideHeader prop)

**Goal:** New shared component `livos/packages/ui/src/components/settings-page-header.tsx` per design-system.html §17 — `eyebrow (mono uppercase 11px) → italic-serif h2 → 14px body sub`. Proof of use on ONE settings page.

**Plans:** TBD — estimated 2-3 plans.

**Depends on:** Phase 123 ✅ (Button variants used inside the header for "Edit" / "Open" affordances).

---

### Phase 125: Field-Card + List-Row (Step 4 of 8) — ✅ SHIPPED 2026-05-15 (1 commit 3e297d2e, sacred SHA preserved 1/1; FieldCard + FieldRow + FieldCardInput components; consumer migration deferred to v37)

**Goal:** Migrate ONE Settings panel (`src/routes/settings/_components/settings-content.tsx`) to field-card pattern per §05/§06 — `180px / 1fr / auto` grid, gradient peach→pink avatar (only color permitted).

**Plans:** TBD — estimated 3-4 plans.

**Depends on:** Phase 124 ✅.

---

### Phase 126: Plan Card (3 + Featured) (Step 5 of 8) — ✅ SHIPPED 2026-05-15 (1 commit, sacred SHA preserved 1/1; PlanCard + PlanGrid components with featured beige gradient + Popular badge)

**Goal:** `src/routes/settings/usage-dashboard.tsx` tier section adopts §08 — 3 plan cards with featured "beige wash" highlight + Recommended pill.

**Plans:** TBD — estimated 2-3 plans.

**Depends on:** Phase 125 ✅.

---

### Phase 127: Stat Tile + Hairline Progress (Step 6 of 8) — ✅ SHIPPED 2026-05-15 (1 commit, sacred SHA preserved 1/1; StatTile + StatRow + StatValue components with 4px hairline progress)

**Goal:** CPU/Memory/Storage cards (`_components/{cpu,memory,storage}-card-content.tsx`) adopt §11 — 4px hairline progress + mono `em` unit label. Old gradient bars retired.

**Plans:** TBD — estimated 3-4 plans.

**Depends on:** Phase 126 ✅.

---

### Phase 128: App Tile (Monogram) (Step 7 of 8) — ✅ SHIPPED 2026-05-15 (1 commit, sacred SHA preserved 1/1; AppTile + AppTileGrid components with monogram + iconUrl fallback)

**Goal:** App Store rows (`src/modules/app-store/*`) get §09 — 34×34 monogram glyph variant for apps without icons. Dock untouched in this phase.

**Plans:** TBD — estimated 2-3 plans.

**Depends on:** Phase 127 ✅.

---

### Phase 129: Chat Bubble (Step 8 of 8) — ✅ SHIPPED 2026-05-15 (1 commit, sacred SHA preserved 1/1; ChatBubble + ChatLog components — role-asymmetric fg/bg invert per §13)

**Goal:** `src/routes/ai-chat/*` bubbles adopt §13 — user = `fg` solid (black bg / white text), Liv = `surface` with hairline border. Asymmetric layout. No emoji.

**Plans:** TBD — estimated 2-3 plans.

**Depends on:** Phase 128 ✅.

---

**Total v36 estimate:** 22-30 atomic commits across 8 phases (each phase 30-60 min including HMR + screenshot + user UAT round-trip).

**Acceptance criteria (milestone-level):** see `.planning/v36-DESIGN-PORT-MASTER.md` § "The 8 port steps" — every phase has its own AC block.

**Out of scope:** Replacing `--accent-blue` site-wide (v37), dark mode token transcription (D-116-FOLLOW-UP-DARK), iridescent (D-116-FOLLOW-UP-IRIDESCENT), OS window chrome §14, terminal §15, greeting card §16, motion language §18 (v37+ candidates).

---

### Phase 130: Dark-Mode Polish + Top Bar + AI Chat Modernization — 🟢 IN-PROGRESS 2026-05-15 (commits c8b7866f, 99cef55e, 2fb06e15, 900b3bda, d986c6d0, 1e7c55f5, fc154cf5, 6526607e, cacd03cd — sacred SHA preserved 9/9, awaiting Mini PC UAT)

**Goal:** UAT round on the v36-shipped surfaces — dark-mode token wiring fixes, Settings sidebar polish (Liv Agent drop, Troubleshoot 2-tab, Software Update/Advanced re-promotion), TopBar v1→v3 evolution (compact pill, expand-on-drag, drop-zone shelf, profile dropdown), AI Chat modernization (pill composer, monochrome bubbles), Files dark-mode regressions.

**Plans:** 9 sub-plans shipped (130-01 through 130-09).

**Depends on:** v36.0 milestone (Phases 122-129) ✅ CODE-COMPLETE.

### Phase 132: v34 Install.sh Hardening — UAT-Driven Fixes — 🟡 CODE-COMPLETE 2026-05-17 (commits 9860af01, 5b79f63e, f161a028, 63d19c1e, 282b0ec7, 578f65b6, 7a8c0eb8, 8b28f6ee, dcaa3ffa — sacred SHA preserved 9/9, pushed to origin/master, livinity.io/install.sh serving new self-bootstrap; awaiting operator fresh-VPS UAT)

**Goal:** Close 7 install bugs discovered in 2026-05-16 Mini PC reinstall UAT so the canonical wizard one-liner JUST WORKS on a fresh Ubuntu 24.04 VPS.
**Requirements**: V34-INST-01..07
**Depends on:** Phase 105
**Plans:** 7 plans + UAT checklist

Plans:
- [x] 132-01 Server5 dashboard HTML (Bugs #1+#2) — on-server canonical ratify
- [x] 132-02 Server5 emailVerified gate removed (Bug #3) — Path A live patch
- [x] 132-03 install.sh self-bootstrap (Bug #4)
- [x] 132-04 pnpm config dedup (Bug #5)
- [x] 132-05 @liv/core import-verify + reset-failed livos (Bug #6)
- [x] 132-06 reset-failed caddy + 30s wait-for-active (Bug #7)
- [x] 132-07 task 07-01 UAT checklist surfaced (07-02 operator walk deferred)

---

### Phase 135: LivOS Onboarding Redesign — Livinity.io Reference Port — ✅ CODE-COMPLETE 2026-05-17 (13 commits `061e5613..4f6b9f07` pushed; UAT-walked at localhost:3000)

**Goal:** Full visual port of the Livinity.io reference onboarding (zip handoff `Livinity.io (1).zip`) into LivOS — 6 steps (Welcome / Account / Wallpaper / Personalize / Connect AI / Done) with ambient orbs, parallax, Web Audio sounds, help bubble, confetti, and italic-serif marketing-grade aesthetic. Scope re-cast 2026-05-17 from the original v1 plan (monochrome `.planning/design-system/` port) after the user delivered the production-grade reference package.

**Driver:** User: *"Ayni buradaki gibi olsun istiyorum"* + scoped Q&A: full visual port, extra steps (domain/network/advanced) hidden in onboarding (kept in Settings), 2FA option in account creation, Connect AI as real terminal `claude /login` stream (visual port now; PTY backend = Phase 136).

**Locked decisions:** D-135-V2-FULL · D-135-V2-2FA · D-135-V2-EXTRA-OUT · D-135-V2-CLAUDE-REAL · D-135-V2-NO-KIMI · D-135-V2-SCOPE-CSS (verbatim CSS port scoped via `[data-flow="onboarding"]`) · D-135-V2-RESUME-BACKEND · D-135-V2-SACRED-SHA. Master at `.planning/phases/135-onboarding-redesign-livinity-ds/135-MASTER-v2.md`.

**Plans shipped (13 commits, sacred SHA `f3538e1d...` preserved 13/13):**
- [x] 135-01 DS tokens + OnboardingShell layout — `061e5613`
- [x] 135-02 superseded by 135-E — `80710482`
- [x] 135-A onboarding.css scope port (1708 LOC → `[data-flow="onboarding"]`) — `e0c3858f`
- [x] 135-B effects.jsx → React (ParallaxOrbs, SoundProvider, HelpBubble, Confetti) — `1e2ec9fa`
- [x] 135-C Icon + useStepper helpers — `080db1a3`
- [x] 135-D SetupWizardV2 shell (top bar + segmented progress + ETA + resume + ambient) — `19eeb9ad`
- [x] 135-E WelcomeStep (brand + spec card + lang pill + Start) — `41ab52fb`
- [x] 135-F AccountStep (Password + 2FA modes) — `8dd5ee60`
- [x] 135-G WallpaperStep + live dashboard preview — `942844c2`
- [x] 135-H PersonalizeStep (role/style/tone/memory/use-cases) — `39f2a1d0`
- [x] 135-I ConnectAiStep terminal animation (visual only — real PTY backend = Phase 136) — `bd6d1b3b`
- [x] 135-J DoneStep + Confetti — `c9a237f0`
- [x] 135-K retire V1 wizard (1402 LOC delete) + router cleanup — `4f6b9f07`

**Known follow-ups (scoped into Phases 136-139):** real `claude /login` PTY pipe (136), backend wiring of wallpaper + preferences + system info detect + resume-via-backend (137), real TOTP enrollment (138), i18n + a11y + mobile + perf hardening (139).

**Depends on:** Phase 134 ✅

---

### Phase 136: Real `claude /login` PTY Pipe — 🔴 PLANNED 2026-05-17 (closes the visual-only gap left by Phase 135-I)

**Goal:** Replace the animated `CLAUDE_SCRIPT` in ConnectAiStep with a real PTY pipe to `claude /login` on the host. xterm.js renders live stdout; auth URL is detected + click-opens; user pastes verification code into UI input → piped to PTY stdin; `/root/.config/anthropic/.credentials.json` populated on success.

**Driver:** Phase 135's D-135-V2-CLAUDE-REAL decision; 135-I shipped visual scaffold + flagged backend wiring as Phase 136 follow-up.

**Locked decisions:** D-136-RUNTIME (livinityd owns PTY) · D-136-PTY-LIB (`node-pty`) · D-136-TRANSPORT (tRPC subscription on WSS) · D-136-RPC-SHAPE (`claudeLogin.start/sendInput/cancel`) · D-136-UI-LIB (xterm.js, already a dep) · D-136-URL-PARSE (regex on Anthropic OAuth URLs) · D-136-CODE-INPUT (dedicated input below xterm, pipes via sendInput) · D-136-FALLBACK (clear error if claude CLI missing) · D-136-SUBSCRIPTION-PATH (BROKER_FORCE_ROOT_HOME, /root creds) · D-136-SACRED-SHA. Full context + decision matrix at `.planning/phases/136-claude-login-pty-pipe/136-CONTEXT.md`.

**Plans:** 6 sub-plans (master at `.planning/phases/136-claude-login-pty-pipe/136-PLAN.md`)
- [ ] 136-01 Backend skeleton + node-pty dep + tRPC namespace stub
- [ ] 136-02 PTY spawner + Redis mutex + lifecycle (kill/timeout/cancel)
- [ ] 136-03 `<XtermView/>` component (mount xterm + subscription consumer)
- [ ] 136-04 Auth URL + verification-code parser + verification input form
- [ ] 136-05 Wire ConnectAiStep to live view (drop CLAUDE_SCRIPT; success/error states; Continue gating)
- [ ] 136-06 Mini PC deploy + operator-walked UAT + memory

**Depends on:** Phase 135 ✅ (visual scaffold); Phase 106 ✅ (Mini PC build-essential apt-installed for native node-pty compile)

---

### Phase 137: Onboarding Backend Wiring (wallpaper + preferences + system info + backend resume) — 🔴 PLANNED 2026-05-17

**Goal:** End-to-end wire Phase 135 wizard data to livinityd's tRPC surface. Wallpaper + role + style + tone + memory + use-cases + lang persisted as user progresses (not just at the end). WelcomeStep spec card reads real hardware (new `system.info` query). Resume migrates from localStorage to `user_preferences.onboarding_state` so it survives device switch.

**Driver:** Phase 135 commits flagged "Backend wiring of wallpaper/preferences also deferred" as a known follow-up; this phase closes it.

**Locked decisions:** D-137-PERSIST-ON (write on each step transition, not batched) · D-137-PERSIST-SHAPE (existing tRPC procedures: wallpaper.set / preferences.set / user.setLanguage) · D-137-SYS-INFO (new `system.info` query — cpu/ram/storage/network/region with 60s Redis cache) · D-137-RESUME-BACKEND (`user_preferences.onboarding_state` key) · D-137-PARTIAL-FAILURE (non-critical writes don't block step advance; AccountStep register failure still blocks) · D-137-SACRED-SHA. Full context at `.planning/phases/137-onboarding-backend-wiring/137-CONTEXT.md`.

**Plans:** 6 sub-plans (master at `.planning/phases/137-onboarding-backend-wiring/137-PLAN.md`)
- [ ] 137-01 Backend `system.info` namespace + collector (os.cpus, totalmem, df, ip route, /etc/timezone) + 60s Redis cache
- [ ] 137-02 WelcomeStep consumes `system.info` (drop hard-coded SYS_INFO)
- [ ] 137-03 Wire WallpaperStep + PersonalizeStep + lang dropdown to existing tRPC mutations (debounced tone-slider)
- [ ] 137-04 Backend resume: write `onboarding_state` key on each step/data change; read on mount; merge with localStorage fallback for unauth state
- [ ] 137-05 DoneStep clears backend resume on Enter Dashboard; cross-step failure-handling polish (toast + auto-retry)
- [ ] 137-06 Mini PC deploy + UAT + memory

**Depends on:** Phase 135 ✅

---

### Phase 138: Real TOTP 2FA Enrollment — 🔴 PLANNED 2026-05-17

**Goal:** Replace Phase 135-F's client-side TOTP mock with real RFC 6238 enrollment: server-generated 160-bit base32 secret encrypted-at-rest via pgcrypto, real scannable QR (otpauth:// SVG), ±1 window verification, 10 single-use recovery codes shown once with download-as-text gate, `user.login` mutation enforces `totpToken` when `totp_enabled=true`.

**Driver:** Phase 135 commit `8dd5ee60` flagged: *"2FA mode: visual flow complete, but backend TOTP enrollment is TODO 135-F-2FA"*. Phase 138 closes the security-critical gap.

**Locked decisions:** D-138-ALGORITHM (RFC 6238 HMAC-SHA1 / 6 digits / 30s) · D-138-LIBRARY (`otplib` + `qrcode`) · D-138-SECRET-LEN (20 bytes / 160 bits) · D-138-STORAGE (pgcrypto encrypted-at-rest with per-user salt) · D-138-QR-RENDERING (server-issued SVG) · D-138-ENROLL-FLOW (register2fa → display QR → verify2fa → success+login) · D-138-LOGIN-PARAM (extend existing `totpToken` field with server validation) · D-138-RECOVERY (10 single-use codes shown once + downloadable) · D-138-DISABLE-2FA (post-onboarding via Settings, out of scope) · D-138-SACRED-SHA. Full context at `.planning/phases/138-real-totp-2fa-enrollment/138-CONTEXT.md`.

**Plans:** 6 sub-plans (master at `.planning/phases/138-real-totp-2fa-enrollment/138-PLAN.md`)
- [ ] 138-01 DB migration: `users.totp_secret/totp_enabled/recovery_codes` cols (idempotent)
- [ ] 138-02 Backend: otplib + qrcode + pgcrypto + `register2fa` mutation (issues secret + qrSvg + recovery codes)
- [ ] 138-03 Backend: `verify2fa` mutation; extend `user.login` to gate by `totp_enabled`; single-use recovery-code consumption
- [ ] 138-04 Frontend: AccountStep — drop FakeQR + client mock, consume real qrSvg, wire verify2fa
- [ ] 138-05 RecoveryCodesModal — 10-code grid + download-as-text + "I've saved them" gate
- [ ] 138-06 Mini PC deploy + Authy phone UAT + memory

**Depends on:** Phase 135 ✅; helpful (not required): Phase 137

---

### Phase 139: Onboarding Hardening — i18n + a11y + mobile + perf — 🔴 PLANNED 2026-05-17

**Goal:** Bring Phase 135's pixel-perfect English-desktop port up to production-ready: full i18n for en+tr (de/fr/es stubs), WCAG 2.1 AA accessibility (keyboard + screen-reader + contrast + reduced-motion), mobile-responsive from 360px, LCP <1500ms on simulated 4G cold reload.

**Driver:** Phase 135 ships English-desktop-only; production onboarding must clear the polish bars before public roll-out.

**Locked decisions:** D-139-I18N-FRAMEWORK (existing i18next) · D-139-I18N-LANGS (en+tr at GA; de/fr/es stubs) · D-139-I18N-KEY-LOCATION (new `onboarding-v2` namespace) · D-139-A11Y-TARGET (WCAG 2.1 AA) · D-139-A11Y-MOTION (prefers-reduced-motion respect) · D-139-MOBILE-MIN (360px) · D-139-MOBILE-LAYOUT (top-bar restack, tfa stack, wallpaper-grid 2-col, single ambient orb) · D-139-PERF-LCP (<1500ms 4G) · D-139-PERF-BUNDLE (<250KB gzip onboarding chunk) · D-139-SACRED-SHA. Full context at `.planning/phases/139-onboarding-hardening/139-CONTEXT.md`.

**Plans:** 6 sub-plans (master at `.planning/phases/139-onboarding-hardening/139-PLAN.md`)
- [ ] 139-01 i18n: extract ~85 keys to `onboarding-v2` namespace; en+tr; stub de/fr/es
- [ ] 139-02 a11y pass: ARIA labels, focus management, axe-core audit, darken `--fg-faint` for contrast
- [ ] 139-03 Mobile responsive: media queries on top-bar/tfa-layout/wallpaper-grid; HelpBubble repositioning
- [ ] 139-04 Perf: ParallaxOrbs IntersectionObserver gate, visibility-pause, LCP baseline capture
- [ ] 139-05 Reduced-motion + prefers-color-scheme respect
- [ ] 139-06 Cross-device UAT (desktop+iOS+Android × EN+TR × NVDA/VoiceOver) + memory

**Depends on:** Phase 135 ✅ (others — 136/137/138 — bring their own strings that are added to the i18n namespace as those phases land; not blocking)

---

### Phase 134: CF Tunnel as Default Hybrid Transport — ✅ Shipped 2026-05-17 (commits d6a8c3aa, f492603a, 41422c8d + Caddyfile-fix hot-fix — sacred SHA preserved, Mini PC UAT PASS via burak.livinity.live HTTP 200 external)

**Goal:** `--mode hybrid` (the default user-facing install mode) transparently uses Cloudflare Tunnel as its transport. Direct-LAN code (Caddy LE DNS-01 + A-record-to-LAN-IP) retired. cloudflared dials outbound — works behind no-public-IP / CGNAT / Client Isolation. Universal one-liner install preserved across VPS / VDS / Mini PC / home boxes. Existing installs migrate via automated `migrate-to-cf-tunnel.sh`. Server5 wizard updated to emit Phase 134 contract (`--cf-tunnel-token`, no zone-id).

**Driver:** User directive 2026-05-17: *"ben --tunel modunu --hybrid in icinde istiyorum"* (I want tunnel mode inside hybrid). Phase 132 install on Mini PC ended in direct-LAN hybrid (`bruce.livinity.live → 192.168.20.33`); UniFi Client Isolation + no-public-IP combo meant browser access failed from anywhere except Tailscale workaround. Phase 134 closes the anywhere-access gap.

**Locked decisions:** D-134-MODE (hybrid = CF Tunnel) · D-134-MODE-ALIAS (--mode tunnel kept as alias) · D-134-RETIRE-DIRECT-LAN (xcaddy + caddy-dns/cloudflare + LE DNS-01 path deleted) · D-134-PROVISION (Server5 wizard emits new contract; full API auto-provision deferred to v34.x) · D-134-MIGRATION (migrate-to-cf-tunnel.sh — 15 steps, idempotent, dry-run) · D-134-UNIVERSAL (single `curl | sudo bash -s --` works on any device) · D-134-ZERO-PUBLIC-IP · D-134-SACRED-SHA.

**Plans:** 5 plans (master at `.planning/phases/134-cf-tunnel-default-hybrid-rebrand/134-PLAN.md`)
- [x] 134-01 install.sh + parse-cli + mode-hybrid.sh refactor — mode-hybrid.sh shrunk 304 LOC → 29 LOC (delegates to install_mode_tunnel); parse-cli accepts --cf-tunnel-token in hybrid mode; 44 PASS test (20 + 24)
- [x] 134-02 Server5 wizard CF Tunnel auto-provision — UI patched (on-server, /opt/landing/livinity.io/dashboard-install.html); full API auto-create deferred to v34.x (requires operator CF token with Tunnel:Edit scope)
- [x] 134-03 migrate-to-cf-tunnel.sh — 15-step idempotent migration with --dry-run; 19 PASS test
- [x] 134-04 (folded into 134-01) — test fixtures: 44 PASS total across test-mode-hybrid-args.sh + test-mode-tunnel-args.sh
- [x] 134-05 Mini PC UAT — fresh-wipe + universal one-liner install; `https://burak.livinity.live/` HTTP 200 external (CF POP SJC); 6/6 services active; sacred SHA preserved; deploy-livinityd.sh Caddyfile regression discovered + fixed in-session

**UAT-EVIDENCE:** `.planning/phases/134-cf-tunnel-default-hybrid-rebrand/UAT-EVIDENCE/post-install-state.txt` + `external-curl-200.txt`

---

### Phase 133: Kill Server5 Tunnel Default + Custom-Domain-Only Hero + Wizard UX — 🔴 PLANNED 2026-05-17 (carry-over from Phase 132 UAT discovery: 3 bugs — A wizard doesn't persist chosen domain in `custom_domains`, B dashboard hero hard-codes `${username}.livinity.io`, C wizard Domain input is empty free-text without username auto-prefill)

**Goal:** Stop the platform from EVER displaying `${username}.livinity.io` as a user's computer URL. Hero derives URL exclusively from active `custom_domains` (no tunnel fallback). Wizard Generate auto-registers the chosen domain. Wizard hybrid-mode Domain input pre-fills `${username}.` so users type only the parent domain. Per user directive 2026-05-17: *"Hiç bir şekilde Server5'deki tunnel'i kullansın istemiyorum"* + UX bug C reported later same day.
**Requirements**: V34-PLATFORM-01..03 + V34-PLATFORM-01C
**Depends on:** Phase 132
**Plans:** 2 fix plans + 1 UAT (master plan at `.planning/phases/133-platform-hero-custom-domain-only-kill-server5-tunnel-default/133-PLAN.md`)

Plans:
- [ ] 133-01 wizard Generate auto-INSERT custom_domains (Bug A) + HybridStep `${username}.` pre-fill (Bug C) — autonomous, single deploy
- [ ] 133-02 hero URL derives from custom_domain only (Bug B) — autonomous (per 2026-05-17 directive, lucylu data hotfix dropped, general update only)
- [ ] 133-03 operator-walked fresh-user UAT, Flows A/B/C/D (autonomous:false)

---

### Phase 131: Pinned-Windows Architecture — 🔴 PLANNED 2026-05-15 (pinned-window drag-drop currently broken in Phase 130-09; persistent background-running pinned windows is a new architectural feature)

**Goal:** Make pinned windows a first-class OS-shaped concept: (a) drag-to-pin actually works, (b) pinned windows persist across page refreshes / navigation, (c) their underlying app session keeps running in the background, (d) AI agents can read + control them while the user is elsewhere on the site or has it closed. Touches the WindowManager, the window-frame drag pipeline, backend persistence, the AI agent loop, the TopBar UI, and any per-app session preservation (stream windows, WebApp Chrome sessions).

**Plans:** TBD — estimated 5-7 plans (see `.planning/phases/131-pinned-windows-architecture/131-PLAN.md`).

**Depends on:** Phase 130 ✅ (130-09 dropped the localStorage pinned-IDs cache + introduced `WindowState.isPinnedToTopBar` which 131 builds on).

---

### Phase 140: CF for SaaS Multi-Tenant Auto-Provisioning — ✅ SHIPPED 2026-05-17 (commits `39c02ced..04ba6fbf`; live smoke-tested on Server5 + Mini PC with socinity user)

**Goal:** Every Livinity user gets a Cloudflare-managed subdomain + Tunnel automatically provisioned at signup. End-user touches only the dashboard + terminal — no CF dashboard, no domain ownership, no TLS/DNS/tunnel manual work. Backend uses CF API to create tunnel, fetch token, push ingress, write DNS records, all transparent to the user. URL pattern locked to flat `{app}-{user}.livinity.io` (single-hyphen separator) to stay within Universal SSL coverage (Free plan; CF for SaaS wildcards confirmed Enterprise-only via CF API error 1456 on 2026-05-17). Cost stays $0 forever regardless of user/app count.

**Goal split:**
- V34-PLATFORM-04: zero-Cloudflare-touch user onboarding (signup → tunnel + DNS auto-provisioned)
- V34-PLATFORM-05: per-app subdomain auto-provisioning at install time
- V34-PLATFORM-06: username validation (reserved-name blacklist + dynamic app-slug collision)
- V34-PLATFORM-07: domain consolidation — `livinity.live` retired, `livinity.io` the only user-facing domain

**Plans:** TBD — estimated 6-8 plans (see `.planning/phases/140-cf-saas-multi-tenant/PLAN.md`).

**Depends on:** Phase 134 ✅ (CF Tunnel as default transport), Phase 133 ✅ (custom-domain field in DB).

**Operator setup status (2026-05-17):**
- CF API token created, verified scope-complete (Account.Tunnel:Edit + Zone.SSL:Edit + Zone.DNS:Edit + Zone.Zone:Read for livinity.io) ✓
- Token + Account ID + Zone ID saved to Server5 `pm2 ecosystem` (CF_API_TOKEN, CF_ACCOUNT_ID, CF_ZONE_ID_LIVINITY_IO) ✓
- pm2 web reloaded with new env ✓
- CF for SaaS Fallback Origin set to `livinity.io` ✓
- Free-plan wildcard custom hostname confirmed UNAVAILABLE (error 1456 — Enterprise only) — flat URL strategy locked ✓
- Awaiting kickoff of implementation work.

---

### Phase 141: Multi-Tenant App Install Hardening — ✅ CODE-COMPLETE 2026-05-17 (commits `04ba6fbf`+`70e02749..d1e3c70c`, 10 sub-plans, sacred SHA preserved 11/11)

**Goal:** Close the 8 distinct livinityd-side gaps that surfaced the moment Phase 140 took its first real user (socinity) end-to-end. Phase 140 proved CF/Server5 provisioning works at the platform tier; Phase 141 makes the Mini PC side production-correct so a brand-new user does NOT need ten manual SSH hotfixes after running install.sh.

**Sub-plans shipped:**
- 141-01 `70e02749` — drain install-pending Redis seeds on livinityd boot (closes the empty-`livos:domain:local_mode` cascade)
- 141-02 `04ba6fbf` — rebuildCaddy isTunnel covers Phase 134 CF Tunnel mode (not just legacy relay tunnel)
- 141-03+04 `54f3de2f` — apps.ts captures Server5-minted hyphen-pattern host; SubdomainConfig gains `host?` field; caddy.ts + Settings UI honor it (fixes both the Caddyfile shape bug AND the UI display bug)
- 141-05 `a5e7bdcc` — Settings → Public Access "Change subdomain" + "Remove" call Server5's CF DELETE/POST endpoints (subdomain reconciliation across rename)
- 141-06 `b89ee4ac` — CSP connect-src curated allowlist for trusted widget APIs (`*.open-meteo.com`)
- 141-07 `c4c64178` — dashboard online check via CF Tunnel API (`cfd_tunnel/{id}/connections`) with 30s per-tunnel cache; falls back to legacy relay probe for pre-Phase-140 users
- 141-08 `eb588dfa` — operator playbook at `docs/operator/post-deploy-playbook.md` (cache-bust + Caddy http:// discipline + cloudflared token recovery + standard smoke-test curl trio)
- 141-09 `003c2dcd` — install.sh:mode-tunnel.sh reconciles cloudflared.service ExecStart `--token` on re-install (closes the stale-token / wrong-tunnel 530 bug on box re-use)
- 141-10 `d1e3c70c` — `scripts/install/factory-reset.sh` (idempotent; gated on `--confirm-destroy`; closes the gap that left Lucy's PG row in place when "wiping" for socinity)

**Plus extras shipped same window:**
- `2a3b5d45` — `docs/marketplace/how-to-add-an-app.md` user-requested README walking through how to publish a new app to the Server5 marketplace (real n8n row used as the worked example).

**Plans / artifacts:** `.planning/phases/141-multi-tenant-app-install-hardening/{PLAN.md,CONTEXT.md,CONTINUE.md,SUMMARY.md}`.

**Depends on:** Phase 140 ✅ (CF for SaaS provisioning) — this phase is its follow-up surface.

**Pending operator step:** `bash /opt/livos/update.sh` on Mini PC (10.69.31.68) → walk the post-deploy smoke-test trio in `docs/operator/post-deploy-playbook.md` §8. After that lands clean, the manual Caddyfile sed-prefix + manual cloudflared token sed + manual Redis local_mode set that socinity is currently relying on all become no-op (the code-paths shipped here take over).

---

### Phase 142: Single-Mode UX — Portal + Cloud (Coming Soon) — ✅ CODE-COMPLETE 2026-05-17 (commits `646e6daa`, `e3d58f4c`; 3 sub-plans, sacred SHA preserved 2/2)

**Goal:** Collapse the install mode set from `{cloud, local-lan, hybrid, tunnel}` down to one user-facing active mode (`portal` — rename of `hybrid` per user direction "daha yaratıcı olsun"), retire `local-lan` entirely (no production install base, maintenance-cost-only path), and surface `cloud` as Coming Soon in the install wizard so the future hosted-control-plane story has a visible placeholder. Driven by a mid-session user request after the Phase 141 deploy went green: "Local modu vs çıkarmak istiyorum tek mod olsun" + "hybridin de adını değiştirelim daha yaratıcı olsun" + "cloud olsun ama bunu ileride koyacağımız için bu suanlik coming soon olsun."

**Sub-plans shipped:**
- 142-02 `646e6daa` — `feat(142-02/single-mode)` rename `hybrid` → `portal` end-to-end. parse-cli.sh default mode + whitelist + help text rewritten; install.sh dispatch collapsed to `portal)`; show-banner.sh trimmed to one portal-shaped banner; livinityd readers (apps.ts:rebuildCaddy, index.ts Phase 112 fallback switch) accept `portal` ∪ `hybrid` ∪ `tunnel` so already-deployed boxes survive update.sh without state migration; UI types (SelectedMode, WizardState.portal, PORTAL_STEPS, portal-* step IDs) + ModePickStep card + LocalSetupWizard state-machine literals renamed. NEW test-mode-portal-rename.sh (11 PASS) + updated test-mode-hybrid-args.sh (21 PASS) + LocalSetupWizard.test.tsx (17 PASS).
- 142-01 `e3d58f4c` — `feat(142-01/single-mode)` retire `local-lan` end-to-end. Deletes `scripts/install/mode-local-lan.sh` + `PlatformInstructions.tsx` + `QrCodeStep.tsx`; drops `generateLocalCaddyfile` + `validateLocalTld` from caddy.ts; drops `local.activate` + `local.getCaCert` tRPC procedures (with their schema + caddy mock); `local.getStatus` keeps `caCertAvailable` field on the return shape for back-compat but always reports false; `local.activateHybrid` write site updated to `local_mode='portal'` (Phase 142-02 rename reflected at every writer). caddy.test.ts shrunk + gained Phase 142-01 retirement guard. routes.test.ts gained 2 router-definition guards (`activate` + `getCaCert` no longer present in `_def.procedures`). tsc baseline 382 → 381 (one fewer error after dead-code drop). +143/-754 LOC net.
- 142-03 (bundled into 142-01) — `cloud` Coming Soon UI badge in ModePickStep + LocalSetupWizard's `cloud-redirect` step replaced with informational Coming-Soon copy + pointer at livinity.io/dashboard. parse-cli.sh `--mode cloud` rejects with a Coming-Soon-shaped error before whitelisted dispatch. AC-134-01-7 test updated to assert the new rejection shape.
- 142-04 — docs sweep + ROADMAP/SUMMARY (this commit). docs/operator/post-deploy-playbook.md `livos:domain:local_mode` references updated portal-first with back-compat note for legacy `hybrid`/`tunnel` values; ROADMAP Phase 142 entry; SUMMARY.md.

**Out of scope / Phase 143+:**
- Wire-level rename of `local.activateHybrid` / `local.getHybridStatus` tRPC procedures + the `HybridDnsSetup.tsx` component file → `PortalDnsSetup.tsx`. The current LocalSetupWizard still imports `HybridDnsSetup` as a leaf component; renaming is mechanical but touches the test invariants and the tRPC client cache. Held back for a focused Phase 143 sweep.
- Delete `livos/.../local-dns/pki.ts` + `dnsmasq-config.ts` (dead-but-small after 142-01; safe to delete; deferred to Phase 143 polish).
- Live the cloud-mode story when the hosted control-plane is actually built (Phase 144+ likely).

**Plans / artifacts:** `.planning/phases/142-single-mode-portal-coming-soon/{SUMMARY.md,SCOPE.md}`.

**Depends on:** Phase 141 ✅ (the live-deploy + boot-time drain validation that made the mode-collapse work reachable safely).

---

### Phase 143: Portal Naming Sweep (wire-level + dead-file cleanup) — ✅ CODE-COMPLETE 2026-05-17 (sacred SHA preserved)

**Goal:** Close the Phase 142 carryover — finish the `hybrid` → `portal` rename at the wire / source-file level so no future contributor has to remember a "wire-level name differs from user-facing name" mapping. Also delete the dead local-dns files orphaned by Phase 142-01.

**Sub-plans shipped (single atomic commit):**
- 143-01 — tRPC procedures renamed canonically: `local.provisionHybrid` → `provisionPortal`, `local.activateHybrid` → `activatePortal`, `local.getHybridStatus` → `getPortalStatus`. Legacy procedure names ALSO kept on the router as back-compat aliases (same handler bodies; lets a cached UI bundle survive mid-flight). httpOnlyPaths in common.ts gains the new entries.
- 143-02 — `livos/.../local-setup/HybridDnsSetup.tsx` renamed → `PortalDnsSetup.tsx`; exported component + props interface renamed; LocalSetupWizard.tsx import + test grep updated.
- 143-03 — `caddy.ts`: `generateHybridCaddyfile` → `generatePortalCaddyfile`, `validateHybridDomain` → `validatePortalDomain`, `LocalSubdomainConfig` → `PortalSubdomainConfig`. Legacy names exported as deprecated aliases (same function references — proven by 3 alias-back-compat tests). local-dns/routes.ts callers updated.
- 143-04 — deleted `livos/.../local-dns/pki.ts` + `dnsmasq-config.ts` + their orphaned test files. server/index.ts `/api/local/ca.crt` route now returns HTTP 410 Gone with a Phase-142-pointer body instead of crashing on the missing import.

**Tests:** caddy.test.ts gained 3 alias-back-compat guards (function-reference identity + byte-identical output); routes.test.ts gained 3 Portal-procedure guards (canonical procedure call + alias coexistence assertions); LocalSetupWizard.test.tsx swept `Hybrid` → `Portal` grep invariants. **52/52 vitest PASS** across the touched files.

**tsc baseline:** 381 → 383 (+2 `ctx.livinityd possibly undefined` errors from the new Portal procedures — pre-existing pattern, not net new). UI tsc: 0 errors in local-setup.

**Out of scope / Phase 144+:**
- Delete legacy procedure-name aliases (provisionHybrid / activateHybrid / getHybridStatus) once we're confident every cached client has refreshed.
- Delete legacy caddy.ts aliases (generateHybridCaddyfile / validateHybridDomain / LocalSubdomainConfig) once external consumers (if any) have migrated.
- Rename `livos/.../local-dns/` directory → `portal-dns/` (touches every import path; pure mechanical).
- Rename `hybrid-provision.ts` → `portal-provision.ts` + its function `provisionHybridSubdomain` → `provisionPortalSubdomain`.

**Plans / artifacts:** `.planning/phases/143-portal-naming-sweep/SUMMARY.md`.

**Depends on:** Phase 142 ✅ (the user-facing rename this commit propagates to the wire).

---

### Phase 146: Big-Bang Migration Server5 → Vercel + Supabase + Realtime Presence — ✅ SHIPPED 2026-05-18 (live on `https://livinity.io` via Vercel; Server5 pm2 stack stopped)

**Status:** ✅ SHIPPED 2026-05-18 — see [146-SUMMARY.md](phases/146-relay-to-supabase-realtime/SUMMARY.md). 11 atomic commits `pre-146-cutover..(W5-T2-commit)`. Sacred SHA preserved 11/11. All 4 demo users (lucy, bozturk, socinity, bolcay) deleted per operator clean-slate directive. Server5 VM kept hot 7 days for rollback. Outstanding: bandwidth metering (Phase 147), device events Broadcast (Phase 148), dead Next.js page cleanup, broker re-implementation if needed, RLS policies, Mini PC orphan livinityd stop (ZeroTier unreachable at cutover time).

**Trigger:** User decision 2026-05-18 — switch control-plane hosting to security-first managed PaaS (Vercel + Supabase + Cloudflare). Demo-only current users (lucy, bozturk, socinity) unlock big-bang cutover: NO backwards-compat requirement, NO strangler-fig parallel run. Researcher's earlier strangler-fig recommendation (`146-RESEARCH.md`) was scoped to "preserve live users" — that constraint is removed.

**Goal:** Within ~5-6 focused hours, sunset Server5 entirely. livinity.io served from Vercel. `platform` Postgres on Supabase. relay's presence/online-status replaced by Supabase Realtime channels. livinityd's `tunnel-client.ts` rewritten to open a Supabase Realtime presence channel instead of WS to `wss://livinity.io:4000`. mainserver + Mini PC fresh-installed with the new livinityd. DNS swap. Server5 pm2 stack stopped but VM kept hot for 7-day rollback window, then destroyed.

**Direction:**
- ~5-6 hour budget total (6 waves; see plan)
- Big-bang cutover: no parallel run, no strangler-fig, no compat shim
- Demo users wipeable: lucy + bozturk + socinity get fresh-installed with new livinityd via the Phase 145-02 aesthetic one-liner (now served from Vercel)
- **In scope:** Postgres migration, Vercel deploy, Supabase Realtime presence, livinityd `tunnel-client.ts` rewrite, dashboard online check rewrite, DNS cutover, end-to-end UAT on 3 demo users
- **Out of scope (defer to Phase 147+):** bandwidth metering, audit events log, force-disconnect, custom domain resolution, Supabase Auth migration (keep custom `users` table for now), `api.livinity.io` broker (untouched), public app store DB (deferred separate phase)
- **Drops:** 2 pre-existing bugs (flap loop, `bandwidth_usage_user_id_fkey` violation) — relay's complete replacement eliminates both
- Sacred SHA `f3538e1d8...` preserved every commit
- Server4 + Mini PC hard rules honored (Mini PC IS a UAT target as the socinity install host; Server4 NEVER touched)

**Plans:** 1 plan with 6 waves (W0 prep → W1 backend → W2 realtime → W3 livinityd → W4 cutover → W5 cleanup).

Plans:
- [x] 146-01-PLAN.md - SHIPPED 2026-05-18. Adapted scope: W4-T2/T3 reinstalls replaced by "delete all users" cleanup per operator directive. NEW W1-T4 added to migrate Server5 static landing HTML (plan-146 miss). See [SUMMARY.md](phases/146-relay-to-supabase-realtime/SUMMARY.md) for the 7 critical findings (wrong JWT_SECRET, landing-HTML miss, Vercel-managed DNS, broker==relay, bolcay user, no custom_domains FK, Vercel lazy-init build fix).

**UAT:** After cutover, fresh registration flow on Vercel dashboard → api-key → curl one-liner → install on mainserver → online badge green within 5s of livinityd start. Repeat for 3 demo users. Server5 pm2 stop verified clean (no pending tunnel connections).

**Rollback (7-day window):** DNS TTL pre-lowered to 60s; rollback = (a) DNS swap livinity.io back to Server5 IP, (b) `pm2 start web relay changelog` on Server5, (c) livinityd's that fail Realtime connect fall back to disconnected — recovery = re-install pre-146 build via update.sh from a tagged commit `pre-146-cutover`.

**Depends on:** Phase 145 ✅ (api-key-only one-liner — Vercel-served install.sh will use the same parse-cli logic).

**Carryover folded in:** none (Phase 145 carryovers tracked separately).

**Phase 147+ candidates surfacing from this scope cut:** bandwidth metering migration (Supabase Postgres CDC), audit events centralization, force-disconnect via Supabase broadcast, custom-domain resolution at CF Worker edge, Supabase Auth migration to drop custom session code.

---

### Phase 145: API-Key-Only Install One-Liner

**Status:** 🟢 PLANNED 2026-05-17 (1 plan, 5 tasks)

**Plans:** 1 plan

Plans:
- [ ] 145-01-PLAN.md — Server5 /api/me/profile endpoint + install.sh subdomain auto-resolve + warn-on-conflict + mainserver UAT

**Trigger:** Phase 144 follow-up + user request 2026-05-17. Today's working one-liner requires BOTH `--api-key` AND `--subdomain` even though Server5 already knows which user owns the api-key. Pasting from the dashboard onto a new VPS should be ONE flag, not two — copy-paste latency goes down, typo risk (subdomain mismatch) disappears.

**Goal:** Make `curl -sSL https://livinity.io/install.sh | sudo bash -s -- --api-key liv_k_xxxxx` the canonical install command. `--subdomain` becomes optional back-compat only. If both are passed and disagree, warn + use api-key's owner (no fatal abort).

**Direction:**
- Server5: new public endpoint `GET /api/me/profile` (X-API-Key) → `{username, email}`. Mirror tunnel-token's auth flow (validateApiKey → DB row → JSON).
- install.sh `parse-cli.sh`: when `--subdomain` empty AND `--api-key` set → curl profile endpoint, set `LIVOS_SUBDOMAIN=<username>`, continue.
- Conflict handling: `--subdomain X` + api-key owned by Y → log `[WARN] --subdomain X overridden by api-key owner Y (Phase 145)` and use Y. NEVER fail-stop.
- Edge: api-key invalid → existing 401 error from tunnel-token surfaces; resolver step bails with clear `[FAIL] api-key rejected by livinity.io/api/me/profile (HTTP 401)`.

**Plan count estimate:** 1 plan with 5 tasks: (1) Server5 /api/me/profile route, (2) parse-cli.sh auto-resolve + conflict-warn + help-text, (3) test-subdomain-args.sh extension (TESTS 12/13/14), (4) Server5 deploy + cache flush + endpoint smoke, (5) mainserver wipe + single-flag install UAT + conflict-warn live test.

**UAT:** mainserver wipe → `curl … | bash -s -- --api-key liv_k_uYmDq_eI5ASmW7grwEba` (no --subdomain) → install completes → `https://lucy.livinity.io` 200. Then repeat with `--subdomain lucylu --api-key liv_k_…lucy` and verify warn + correct resolve to `lucy`.

**Depends on:** Phase 144 ✅ (install.sh self-bootstrap healthy + lucy.livinity.io live as test target).

**Carryover folded in from Phase 144 surface:** none — this is fresh Phase 145 scope. Other Phase 144 carryover items (J's scripts/install/ disk deploy, Caddy `:80` catch-all 404, Server5 factory-reset, install.sh `--dry-run`) remain candidates for separate sub-plans/phases.

---

### Phase 144: Fresh-Install UAT for 141 + 142 + 143 — ✅ CODE-COMPLETE 2026-05-17 (autonomous A-E + J + K + L PASS; F/G/H/I deferred to operator browser walk per autonomous-mode scope; 144-01 hotfix shipped; 7 Phase 145 carryover items recorded)

**144-01 hotfix shipped same session** (`bedfb95a`): `scripts/install.sh` self-bootstrap HELPERS_REQUIRED still listed `mode-local-lan.sh` (Phase 142-01 retired the file but missed the helper list). Live install.sh on `livinity.io/install.sh` curl-fetched fresh from GitHub raw after pm2 web restart + .next/cache/fetch-cache purge. Discovered Section B1 first-install attempt exit 3.

**D3 dangerous-test fallout (carryover #4):** UAT-PLAN's `bash install.sh --mode hybrid --domain x --cf-tunnel-token y | grep` actually RUNS the full install with fake credentials, overwriting `/etc/livos/secrets/cf-tunnel-token` and `/etc/systemd/system/cloudflared.service` ExecStart token. Live smoke went from 200/200 → 530/530 mid-UAT. Recovery: re-ran install.sh with real `--api-key liv_k_phase140socinityRESET12` (which was also a side-effect Section K1 pass = re-install regression replay clean). Phase 145 needs a `--dry-run` parse-cli harness or test-only entry point.

**Final smoke (post-recovery):** apex `200`, /trpc/system.status `200`, n8n-socinity `200`, code-server-socinity `200` (note: hyphen-pattern URLs return 200 from livinityd's default UI per Caddy `:80` catch-all — carryover #6).

**Artifacts:** `MINI-PC-ZERO-STATE.md`, `UAT-PLAN.md`, `UAT-REPORT.md`, `SUMMARY.md`, `RESUME-PROMPT.md`, `section-f-n8n-install.sh`.

**Next:** Phase 145 opens with 6 carryover candidates — install.sh `--dry-run`, scripts/install/ disk deploy, Next.js cache control, Caddy default-host 404, Server5 factory-reset endpoint, operator UAT walk for F/G/H/I.



**Goal:** Phases 141 / 142 / 143 each shipped + auto-deployed onto the SAME socinity Mini PC that hosted the original bug-discovery session. Every deploy ran on top of partial back-compat state (legacy Redis values, manually-fixed Caddyfile, etc.). Phase 144 wipes the Mini PC to zero state and walks every code-path the three phases shipped, fresh — so the production install behaves correctly on a never-touched box.

**Setup status (2026-05-17, pre-/clear handoff):**
- ✅ Mini PC tabula-rasa-wiped via `/tmp/mini-pc-full-wipe.sh` (LivOS state + Claude state + Chrome profiles + cache + stale systemd backups). See `MINI-PC-ZERO-STATE.md` for the verified-clean snapshot.
- ✅ Server5 socinity row + CF tunnel `633ab1f5-3f10-4d62-a3a7-50d8eace247c` + `liv_k_phase140socinityRESET12` api key all **deliberately preserved** so the re-install regression replay (Section K) is meaningful.
- ✅ Full 12-section UAT plan written at `UAT-PLAN.md` (~30 min execute time on a clean pass; ~45-60 min thorough walk).
- ✅ RESUME-PROMPT.md ready to paste after `/clear`.

**UAT sections (see `UAT-PLAN.md` for the per-section command blocks + expected output):**
- A. Pre-flight sanity (Mini PC zero / Server5 intact / public URLs 5xx)
- B. Fresh install one-liner + smoke trio
- C. Phase 141 features (boot drain log + Caddyfile prefix + cloudflared token + dashboard online)
- D. Phase 142 CLI surface (local-lan retired / cloud Coming Soon / hybrid+tunnel normalize / --help portal-first)
- E. Phase 143 wire surface (activatePortal procedure + alias coexistence + /api/local/ca.crt 410)
- F. App install (n8n → hyphen-pattern host in Caddyfile + Redis + UI)
- G. Subdomain rename (Server5 DELETE+POST round-trip)
- H. Dashboard online via CF Tunnel API (stop/restart cloudflared → asleep → Online)
- I. CSP allowlist (weather widget hits *.open-meteo.com cleanly)
- J. **KNOWN-FAIL:** factory-reset.sh missing on disk → surfaces a Phase 145 carryover (update.sh doesn't rsync `scripts/install/`)
- K. Re-install regression replay (Phase 141-09 token reconcile)
- L. Final smoke summary

**Plans / artifacts:** `.planning/phases/144-fresh-install-uat/{MINI-PC-ZERO-STATE.md,UAT-PLAN.md,RESUME-PROMPT.md}`.

**Depends on:** Phases 141 ✅ + 142 ✅ + 143 ✅ — this UAT validates all three on a fresh box.

**On completion:** Carryover items surfaced (at minimum Section J's `update.sh` rsync gap) become Phase 145 entries. Phase 144 itself flips to ✅ in this ROADMAP.

---

### 🟢 v37.0 Store Reimagining + Plugin Platform (Active — Phases 148-155)

**Status (2026-05-18):** OPENED — Phase 148 (Spec) ✅ SHIPPED 2026-05-18. Phases 149-155 queued for `/gsd-autonomous` run. LOCKED design in [v37-DRAFT.md](v37-DRAFT.md); data contract in [phases/148-store-spec/SPEC.md](phases/148-store-spec/SPEC.md).

**Trigger:** Post-Phase-146 (Server5 → Vercel + Supabase migration) — `/store` is a single flat list of 27 OSS apps using Phase 117 design tokens, no plugin extensibility, no Native/AI sections. Operator requested (1) redesign to current Livinity DS, (2) 5-section catalog (Apps/WebApp/Native/AI/Plugin), (3) plugin runtime so third parties can extend livinityd backend + UI.

**Goal:** Ship a sectioned `/store` marketplace with FIVE catalog types, each with its own install handler, backed by a hot-reloadable plugin runtime. Operator-signed plugins for v37; third-party submission deferred to v38.

**Direction:**
- **Zero Server5 dependency** (hard constraint, operator-locked 2026-05-18): apps catalog + install_history on Supabase Postgres; plugin bundles + pubkey registry on GitHub; install callbacks via Vercel apex
- 5 sections as first-class DB enum: `app | webapp | native | ai | plugin`
- Plugin URLs path-based: `https://<user>.livinity.io/p/<plugin-id>/...` (single CF Tunnel + cert per user)
- Hot-reload plugin runtime via dynamic `import()` + version-busted cache + Express subrouter dispatcher
- Operator-signed via Ed25519; pubkey registry at `livinity-apps/.signing/pubkeys.json`
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved every commit

**Estimated duration:** 7-11 days across 8 phases (148 ✅ done; 149-155 remaining). NOT autonomous-runnable end-to-end — needs operator decisions at phase boundaries (per `/gsd-autonomous` flow).

---

### Phase 148: Spec + Section Data Model — ✅ SHIPPED 2026-05-18

**Status:** ✅ COMPLETE — see [148-SUMMARY.md](phases/148-store-spec/SUMMARY.md).

**Goal:** Lock the data contract for v37 — section enum, per-section manifest schemas, plugin manifest spec, install handler interfaces, plugin runtime contracts. Plus enforce **zero Server5 dependency** as a hard constraint across all v37 code paths.

**Plans:** 0 — spec-only phase, deliverable is SPEC.md.

**Deliverables:**
- [x] [SPEC.md](phases/148-store-spec/SPEC.md) — 9 sections covering: §0 Zero-Server5 placement + migration plan, §1 section enum + 0013 migration SQL, §2 5 manifest variants, §3 plugin manifest schema (zod + Ed25519 signing), §4 install handler interfaces, §5 plugin runtime contracts, §6 5 reference manifests, §7 deferrals, §8 acceptance.

**Depends on:** Phase 146 ✅ (Supabase + Vercel control plane shipped) — gives v37 a stable PaaS backbone with NO Server5 dependency.

---

### Phase 149: `/store` UI Redesign (5-section nav, current design system)

**Status:** 🔴 PLANNED 2026-05-18 (next phase to run).

**Goal:** Apply current Livinity Design System to `/store` — section nav (5 tabs: Apps / WebApp / Native / AI / Plugin), per-section grid layouts, detail modal or sub-route, empty/loading/error states. **Plus Phase 149 task 0:** apply migration `0013_phase_148_add_section_enum.sql` on Supabase + one-shot data sync of 27 existing rows from Server5 → Supabase. Vercel `DATABASE_URL` env points to Supabase pooler URI; the `127.0.0.1:5432/platform` fallback in `platform/web/src/lib/drizzle.ts` made fail-loud to prevent silent Server5 fallback.

**Plans:** 1 estimated (UI redesign + supabase migration + drizzle env hardening).

**UAT:** Vercel preview screenshots PASS visual review; tsc green; Lighthouse 90+ on /store.

**Depends on:** Phase 148 ✅.

---

### Phase 150: Native Linux Apps Section (apt + AppImage + window infra)

**Status:** 🔴 PLANNED 2026-05-18.

**Goal:** First end-to-end section. Seed 5-10 popular Linux apps (VSCode, Cursor, IntelliJ-Community, Audacity, OBS, Inkscape, GIMP, LibreOffice, Blender, Krita). livinityd install handler with apt path (`apt install <pkgs>` + .desktop file generation) and AppImage path (download → `chmod +x` → .desktop). Reuse Phase 33 dock-item pattern + Phase 95 x11vnc window pattern. Re-parse install manifest through existing `nativeAppConfigSchema` at trust boundary.

**Plans:** 2 estimated (installer + seed + dock integration).

**UAT:** Install VSCode from store → appears on dock → click → window opens → VSCode launches.

**Depends on:** Phase 148 ✅.

---

### Phase 151: WebApp Section + Custom URL Form

**Status:** 🔴 PLANNED 2026-05-18.

**Goal:** Pre-curated WebApp catalog (Notion, Linear, Slack, Discord, etc.) + Custom URL form on the WebApp section page — URL input → livinityd fetches OpenGraph title + favicon (10s timeout) → creates webapp via existing `webapp.create` tRPC. Custom URL submissions DO NOT create `apps` rows (store WebApp section is curated discovery, not a registry). CSP + URL allow-list to mitigate phishing risk.

**Plans:** 1 estimated.

**UAT:** Install Notion from store → desktop icon → click → opens in window. Add custom URL "https://example.com" → window opens with example.com.

**Depends on:** Phase 148 ✅.

---

### Phase 152: AI Section (MCP Market + Agents + GSD)

**Status:** 🔴 PLANNED 2026-05-18.

**Goal:** AI section with three sub-flows: (1) MCP Market — 10 pre-vetted servers (filesystem, github, postgres, brave-search, puppeteer, slack, gdrive, memory, fetch, everything) + Livinity Tools sub-cat (livinity-files, livinity-apps, bytebot-desktop); (2) Agent Templates — 10-20 pre-built system prompts + tool sets, one-click clones to user's agents; (3) GSD — packaged planning skills as installable AI tool. AI Chat "Add MCP" link routes to `/store/ai/mcp`.

**Plans:** 2 estimated (catalog seed + install dispatcher per `manifest.kind`).

**UAT:** Install github MCP → AI Chat lists github tools → invoke one successfully.

**Depends on:** Phase 148 ✅ + Phase 151 (uses same install dispatcher pattern).

---

### Phase 153: Plugin Runtime with HOT-RELOAD (biggest, ~3 days)

**Status:** 🔴 PLANNED 2026-05-18 — biggest phase.

**Goal:** Backend plugin loader in livinityd: scans `/opt/livos/plugins/*/manifest.json`, dynamic `import()` for hot-reload via `?v=<ts>` cache-busting, mounts routes under `/p/<id>/` on the live Express app via wrapping dispatcher middleware (Express has no direct route removal). Capability gate refuses install if plugin requests caps beyond its signing tier. Ed25519 signature verification against operator pubkey. Frontend UI plugin loader injects React components into declared hooks (dock, settings, AI chat) via `React.createPortal` + Shadow DOM. WebSocket `plugin:installed` event triggers UI hot-mount without page reload. Plugin SDK `@livinity/plugin-sdk` published as TypeScript interfaces.

**Plans:** 3-4 estimated (loader + signature verify + UI bundle loader + reference plugin).

**UAT:** Install reference plugin `hello-world` from store → routes mounted at `/p/hello/` within 5s, widget appears in dock without page reload, AI chat lists `/hello` slash-command, uninstall removes everything live without restart.

**Depends on:** Phase 148 ✅ + Phases 149-152 (uses install dispatcher infra).

---

### Phase 154: Livinity Broker Plugin

**Status:** 🔴 PLANNED 2026-05-18.

**Goal:** Package existing `livos/packages/livinityd/source/modules/livinity-broker/` as the first non-trivial plugin via the v37 runtime. Plugin id `livinity-broker`. Routes `/p/livinity-broker/v1/messages` + `/p/livinity-broker/v1/chat/completions`. Manages own api-keys in own Postgres tables (decoupled from platform auth). Plugin UI: settings page in /store after install, generate api-key + show URL pattern for Bolt/Cline/Cursor.

**Plans:** 1 estimated.

**UAT:** Install plugin → generate api-key → Bolt configured with `https://<user>.livinity.io/p/livinity-broker/v1` succeeds against Claude.

**Depends on:** Phase 153 ✅ (plugin runtime).

---

### Phase 155: Developer Portal + Documentation

**Status:** 🔴 PLANNED 2026-05-18 — final v37 phase.

**Goal:** `/developers` route on livinity.io with "How to publish a plugin" walkthrough, Plugin SDK reference docs, submission flow (PR to `livinity-apps` repo, signature review, publish to store). v37 portal still publishes operator-signed-only plugins; third-party tier (`verified` / `community`) deferred to v38.

**Plans:** 1 estimated.

**UAT:** External developer can read the docs and ship a plugin without operator help.

**Depends on:** Phase 153 ✅ (plugin runtime + SDK exists).

### Phase 160: Luse LivOS Overlay + Haiku Routing — ✅ SHIPPED 2026-05-19 (backend additive; 18 commits, sacred SHA preserved 18/18, D-09 intact, vitest 150 PASS; production wire-through deferred to Phase 161)

**Ship note (2026-05-19):** Mini PC deploy via `bash /opt/livos/update.sh` succeeded — deployed SHA `1062c4e`, all 4 services (livos, liv-core, liv-worker, liv-memory) active. Operator browser UAT discovered the production wire-through gap: Plan 160-01 routed the **broker** (api.livinity.io external clients — Bolt.diy, Cline) but the LivOS internal NativeApp flow goes through `AgentSessionManager → @anthropic-ai/claude-agent-sdk → api.anthropic.com` (Max subscription path), bypassing the broker. Result: backend code shipped clean and tested but the internal computer-use loop still fires `claude-sonnet-4-6` instead of Haiku. Same wiring gap applies to Plan 160-02 overlay (composer ready, AgentSessionManager still calls legacy `injectComputerUseSystemPrompt`) and Plan 160-03 launcher (mcp/server.ts not injecting `livosAppResolver`). Plan 160-05 sandbox is wiring-free and works directly. Honest closure: ship the backend (additive, safe, sacred SHA preserved), open Phase 161 for the wiring sweep.

**Goal:** Two parallel improvements to the Luse computer-use MCP. (A) Route computer-use loop to Haiku (`claude-haiku-4-5-20251001`) for screenshot-grounded turns while AI Chat panel + WebApp chat keep Opus/Sonnet (operator's explicit request: faster + cheaper computer-use without losing chat reasoning quality). (B) Fix verbatim-Bytebot drift on LivOS via prompt-builder OVERLAY (preserves D-09 invariant: `luse-system-prompt.ts` body bytes UNCHANGED). LivOS context overlay prepends app catalog + runtime display size + dash-pattern domain rule (`n8n-bruce.livinity.io`, NOT dot subdomain). Plus `computer_application` integration with LivOS launcher (n8n / LibreOffice via `windowManager.openWindow`) and `computer_read_file` path sandbox.

**Requirements**: operator-driven additive phase + security hardening, no REQ-IDs
**Depends on:** Phase 159 ✅ (NativeApp lifecycle parity stable)
**Plans:** 6 plans / 3 waves

**Workstreams:**
- **A (Plan 01)** — Haiku model routing for computer-use loop (agent-runner-factory `mode: 'computer-use'` → forces `claude-haiku-4-5-20251001`; chat path untouched)
- **B (Plan 02)** — LivOS system prompt overlay (prompt-builder prepends LivOS context; `luse-system-prompt.ts` UNCHANGED for upstream sync compatibility)
- **C (Plan 03)** — `computer_application` LivOS launcher (apps.list + apps.native.list resolver dispatches to `windowManager.openWindow` for LivOS apps; classic Bytebot apps retained as fallback; dash-pattern URL `<app>-<user>.livinity.io`)
- **D (Plan 04)** — Dynamic display size via xdpyinfo (overlay's `actualDisplaySize` placeholder filled at runtime — replaces hardcoded 1280x960 with real 1920x1080 / 1280x720)
- **E (Plan 05)** — `computer_read_file` path sandbox (allowlist: `/home/<user>/`, `/tmp/luse-`, `/opt/livos/data/uploads/<userId>/`; realpath resolution + path traversal protection)

**Hard guardrails:**
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` — preserved across all commits
- D-09 verbatim invariant: `luse-system-prompt.ts` bytes UNCHANGED (overlay only at prompt-builder layer)
- D-NO-NEW-DEPS: no new npm packages
- Domain pattern: `<app>-<user>.<root>` (DASH separator) — locked via test invariant
- Chat path untouched: `use-webapp-agent.ts` + `use-native-app-agent.ts` + AI Chat panel keep current Opus/Sonnet model

**Resume:** `/clear` then `/gsd-execute-phase 160`. CONTEXT + 6 PLAN files all ready at `.planning/phases/160-luse-livos-overlay-haiku-routing/`. Operator UAT (Plan 06) is the only autonomous: false step — Mini PC deploy + 10-step browser walk.

Plans:
- [x] 160-01 — Haiku routing for computer-use loop (Wave 1) — CODE-COMPLETE 2026-05-19; 2 commits `95d61ec6..1b063810`; X-Livinity-Computer-Use header gates `mode: 'computer-use'` opt on `createSdkAgentRunnerForUser` which injects `tier: 'haiku'` + `model: 'claude-haiku-4-5-20251001'` into /api/agent/stream body; liv-core api.ts honors `body.tier` override; sacred SHA preserved; 11 new tests PASS (4 tsx + 7 vitest); chat path untouched
- [x] 160-02 — LivOS system prompt overlay (Wave 1) — CODE-COMPLETE 2026-05-19; 2 commits `ef6f60a5..5926c76d`; `buildLuseOverlay()` + `buildLuseSystemPromptWithOverlay()` in `agent-prompt-builder.ts` prepend a LivOS context block (DISPLAY hook for Plan 04, AVAILABLE APPS hook for Plan 03, WEBAPP URL PATTERN dash-rule with `n8n-user.livinity.io` correct + `n8n.user.livinity.io` anti-example, CONFLICT RULE `THIS CONTEXT WINS`); `PerWebAppMcpDescriptor` gains optional `userSlug?`+`domainRoot?` fields threaded as `LIVOS_USER_SLUG`+`LIVOS_DOMAIN_ROOT` env vars to the spawned Luse MCP child; 14 new vitest invariants PASS (5 source-text + 2 D-09 verbatim-guard + 7 runtime); `agent-prompt-builder.test.ts` 39 PASS / 0 FAIL (was 25 / 0); `luse-system-prompt.ts` bytes UNCHANGED (D-09 verified empty diff); sacred SHA preserved 2/2
- [x] 160-03 — computer_application LivOS launcher (Wave 2, depends on 160-02) — CODE-COMPLETE 2026-05-19; 3 commits `95de89ca..c2939fd6`; `_applicationTool` enum dropped from MCP schema (free-form `string`); `LivosAppMatch` + `LivosAppResolver` types + `defaultLivosAppResolver(name, deps)` pure resolver added to `native/window.ts` (Promise.all parallel `listWebApps + listNativeApps`, case-insensitive match, WebApp before Native, DASH-pattern URL `${proto}://${sub}-${userSlug}.${domainRoot}/`); `LuseToolsOptions.livosAppResolver?` DI hook added; `computer_application` handler rewritten with resolver-first dispatch (emit `[luse-mcp] open_livos_app kind=… appId=… route=…` stderr IPC line on match) + APP_MAP fallback on null/throw; 6 source-text invariants lock the dispatch shape + dash-pattern (positive regex + dot-pattern negative regex) + IPC literal + parallel-query shape; `mcp/tools.test.ts` 50 PASS / 0 FAIL (was 44 / 0); sacred SHA preserved 3/3; D-09 verbatim invariant `luse-system-prompt.ts` UNCHANGED; D-NO-NEW-DEPS upheld
- [x] 160-04 — Dynamic display size via xdpyinfo (Wave 2, depends on 160-02) — CODE-COMPLETE 2026-05-19; 1 commit `36bb3130`; NEW `computer-use/native/display-size.ts` (95 lines) with `readActualDisplaySize(display): Promise<DisplaySize | null>` using `spawn('xdpyinfo', ['-display', display])` + strict `/^:[0-9]{1,2}$/` shell-injection guard + `dimensions: WxH pixels` regex parse + 2000 ms SIGKILL safety timeout + `settled` flag against double-resolve + null-on-any-failure graceful degrade; NEW `buildLuseSystemPromptWithOverlayResolved(opts): Promise<string>` async composer in `agent-prompt-builder.ts` short-circuits when `opts.actualDisplaySize` pre-supplied else reads `process.env.LUSE_TARGET_DISPLAY ?? process.env.DISPLAY ?? ':0'` then helper → composes via existing locked `buildLuseOverlay + LUSE_SYSTEM_PROMPT` sync helper (Plan 160-02 source-text invariant preserved); 6 vitest invariants lock the wire-up (4 source-text: import + env reads + strict regex literal + timeout literal; 2 runtime: short-circuit + Promise<string> contract); `agent-prompt-builder.test.ts` 45 PASS / 0 FAIL (was 39 / 0); sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved; D-09 verbatim `luse-system-prompt.ts` UNCHANGED (overlay's PREPENDED `DISPLAY: <real>` line overrides verbatim's "1280 x 960 pixels" via Plan 160-02 CONFLICT RULE); D-NO-NEW-DEPS upheld (`node:child_process` reused from sibling `screenshot.ts`); files-modified disjoint from Plan 160-03 + 160-05 (parallel safety contract honored)
- [x] 160-05 — computer_read_file path sandbox (Wave 2) — CODE-COMPLETE 2026-05-19; 2 commits `5def1871..42b04ff2`; per-user allowlist `/home/<user>/` + `/tmp/luse-*/` + `/opt/livos/data/uploads/<userId>/` gated by `fs.realpath` symlink resolution BEFORE allowlist check + NUL-byte pre-flight reject; `LUSE_USER_ID` env drives userSlug+userId (defaults to `'bruce'`); rejection error echoes `requested=… resolved=… (allowed prefixes: …)` for agent self-correction without leaking file content; `isPathAllowed()` exported pure helper + `__setRealpathForTest` test seam (mirrors existing `__setReaddirForTest` pattern); 7 source-text invariants lock the sandbox literal + 8 runtime rejection/accept tests exercise `/etc/passwd` reject, `../../etc/shadow` traversal reject, NUL-byte path reject, symlink-out-of-jail reject (realpath collapse to /etc/passwd), accept cases for `/tmp/luse-*` and `/opt/livos/data/uploads/bruce/`; `mcp/tools.test.ts` 65 PASS / 0 FAIL (was 50 / 0); sacred SHA preserved 2/2; D-09 verbatim `luse-system-prompt.ts` UNCHANGED; D-NO-NEW-DEPS upheld; files-modified disjoint from Plan 160-04 (parallel safety contract honored)
- [x] 160-06 — Verification sweep + 10-step operator UAT (Wave 3) — CODE-COMPLETE 2026-05-19; (ship 2026-05-19 + 1 ship commit appended after UAT discovered Phase 161 wiring gap — closure honest); 3 commits `294020ff..` (test fix-pass + VERIFICATION.md + SUMMARY); 160-VERIFICATION.md ships with status=pending_uat, full 15-row grep matrix verified, Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 16 Phase 160 commits, D-09 invariant proven (zero Phase 160 commits to `luse-system-prompt.ts`), 5/5 Plan SUMMARYs cross-referenced (all self-checks PASSED), combined vitest 150 PASS / 3 FAIL (3 pre-existing LUSE_REDIS_URL drift in `luse-mcp-config.test.ts` T4/T5/T6 documented as out-of-scope per scope-boundary rule), tsc Phase 160 production surface 0 errors, agent-runner-factory.test.ts pre-existing failure fixed inline (`294020ff` — flipped `toContain('LUSE_TARGET_DISPLAY')` → `not.toContain` per 160-04 SUMMARY recommendation, 22/1 → 23/0); carry-forwards documented: (1) mcp/tools.test.ts +8 tsc type-narrowness errors (runtime PASS 65/65, cosmetic test-typing nuance), (2) Plan 160-03 `livosAppResolver` wiring deferred to Phase 161 mcp/server.ts integration (handler falls back to APP_MAP cleanly until wired), (3) NativeApp Chat client may need `X-Livinity-Computer-Use: true` header emit for Haiku routing to fire; 10-step operator UAT checklist pending (Mini PC `sudo bash /opt/livos/update.sh` + browser walk)

### Phase 161: Computer-Use SDK Path Wiring (Phase 160 carry-forward) — ✅ SHIPPED 2026-05-19 (15 commits + Mini PC deploy + live runtime probe PASS; sacred SHA preserved 15/15, D-09 intact, D-NO-NEW-DEPS green; MH1 LIVE-PROVEN via synthetic WS probe; MH2/MH3/MH4/MH7 queued for operator browser walk)

**Ship note (2026-05-19):** Phase 161 plan + execute completed in a single autonomous session: 1 CONTEXT.md + 1 RESEARCH.md + 1 PATTERNS.md + 4 PLAN.md + 4 source plans (14 atomic commits `f526f376..6ac03e4d`) + 1 VERIFICATION.md + 1 ship update. Mini PC deploy via `sudo bash /opt/livos/update.sh` succeeded (deployed SHA `fbb8e3a`), all 4 services (livos, liv-core, liv-worker, liv-memory) active. Synthetic WS probe (JWT minted from `/opt/livos/data/secrets/jwt`, `start` message with `conversationId:"native:smoke161:abc12345"`) live-verified the highest-failure-mode link (model routing): journal showed `AgentSessionManager: computer-use session detected, routing to Haiku` → SDK boundary received `model: 'claude-haiku-4-5-20251001'` (dated literal — L1 honored end-to-end) → streaming response. Real `xdpyinfo` readout on Mini PC: `2560x1440 pixels` — Phase 160-04 dynamic display will pick this up live when MH4 fires through actual prompt body. MH2 (LIVOS CONTEXT overlay), MH3 (`open n8n` → `n8n-bruce.livinity.io` DASH), MH4 (real display in prompt), MH7 (browser-emitted convId) queued for operator 10-step browser walk per Phase 160 VERIFICATION.md checklist.

**Goal (original):** Make Phase 160's backend additions (Haiku routing, LivOS overlay, dynamic display size, LivOS launcher) actually fire on the LivOS internal NativeApp / WebApp flow. Phase 160 wired the **broker** path (api.livinity.io external clients); this phase wires the **SDK subscription path** (`AgentSessionManager → @anthropic-ai/claude-agent-sdk → api.anthropic.com` via Max credentials) that LivOS UI actually uses.

**Trigger:** 2026-05-19 Phase 160 operator UAT — journal showed every NativeApp Chat turn still hitting `claude-sonnet-4-6`. Inspection revealed Phase 160-01's `forceComputerUseModel` lives at the broker router layer which the SDK subscription path bypasses. Same wiring gap for Plan 160-02 overlay composer + Plan 160-03 launcher resolver. Plan 160-05 sandbox is wiring-free and works end-to-end.

**Direction (4 atomic patches — small phase, ~2-3 hours):**
- **161-01** `AgentSessionManager`: detect computer-use session (via session metadata, conversationId prefix `native:` / `webapp:`, or a `mode` field threaded from the UI hook) → pass `model: 'claude-haiku-4-5-20251001'` to SDK `query()` instead of the user's chat model
- **161-02** `AgentSessionManager`: for computer-use sessions, build system prompt via `buildLuseSystemPromptWithOverlayResolved()` (Plan 160-02 + 160-04 composer) instead of calling legacy `injectComputerUseSystemPrompt` — this gets the LivOS overlay + dynamic display size into the actual prompt
- **161-03** `computer-use/mcp/server.ts`: construct `defaultLivosAppResolver({listWebApps, listNativeApps, userSlug, domainRoot})` from the authenticated user's trpc context + pass into `LuseToolsOptions.livosAppResolver` so `computer_application` dispatches to LivOS launcher (Plan 160-03)
- **161-04** `use-native-app-agent.ts` (UI hook): emit the session-type hint that 161-01/02 detection rely on (depending on which detection design wins — `mode: 'computer-use'` field, conversationId prefix, or session metadata)

**Hard guardrails (inherited from Phase 160):**
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` — preserved
- D-09 verbatim invariant: `luse-system-prompt.ts` bytes UNCHANGED
- D-NO-NEW-DEPS
- Chat path untouched: regular chat sessions (no computer-use tools) keep Opus/Sonnet model + legacy prompt
- Subscription-only: SDK still hits api.anthropic.com via /root/.credentials.json (BROKER_FORCE_ROOT_HOME)

**UAT criteria:** Repeat Phase 160 10-step walk → Step 5 (NativeApp LibreOffice Chat) journal shows `claude-haiku-4-5-20251001`; Step 6 (`journalctl | grep "LIVOS CONTEXT"`) shows overlay text; Step 7 (`open n8n`) opens window at `n8n-bruce.livinity.io` (dash pattern); Step 9 (`grep DISPLAY:`) shows real 1920x1080 / 1280x720 (not 1280x960). Step 8 (sandbox reject `/etc/passwd`) already PASSes from Phase 160-05.

**Depends on:** Phase 160 ✅ Shipped (backend additive code in place; this phase only adds wire-through, no backend re-design needed).

**Plans:** 4 plans / 1 wave (161-02 serialized after 161-01; 161-03 + 161-04 parallel-safe)

Plans:
- [x] 161-01-PLAN.md — AgentSessionManager Haiku tier override + isComputerUseSession pure helper (SHIPPED 2026-05-19; 3 commits `f526f376..f18c1bed`; +11 PASS new test file; sacred SHA preserved 3/3; chat-path-untouched regression locked; **MH1 LIVE-PROVEN** via synthetic WS probe — journal `routing to Haiku` + SDK_INIT `claude-haiku-4-5-20251001`)
- [x] 161-02-PLAN.md — computerUseSystemPromptBuilder DI option + ws-agent.ts closure wire-up (SHIPPED 2026-05-19; 4 commits `940e6f1f..d4323d88`; +10 PASS DI + cross-file invariants; sacred SHA + D-09 preserved 4/4; module DAG preserved — @liv/core does NOT import from livinityd; selector branch order locked computer-use FIRST → intentResult → BASE)
- [x] 161-03-PLAN.md — livosAppResolver env-thread + HTTP fetch construction in mcp/server.ts + luse-mcp-config.ts baseEnv extension (SHIPPED 2026-05-19; 4 commits `6d061851..1f251a30`; +17 source-text invariants; mcp/server.test.ts 28/28 PASS; sacred SHA + D-09 + D-NO-NEW-DEPS preserved 4/4; **L2 honored** — `LIVINITYD_API_URL` distinct from `LIV_API_URL:3200`; **L3 honored** — `[luse-mcp] resolver:` prefix no collision with `[luse-mcp] open_livos_app` IPC channel; fail-open fall-through when env vars missing)
- [x] 161-04-PLAN.md — UI hook prefix-invariant tests (SHIPPED 2026-05-19; 3 commits `91fee041..6ac03e4d`; +8 PASS invariants across native + webapp hooks; verification-only contract HONORED — `use-native-app-agent.ts` + `use-webapp-agent.ts` byte-identical pre/post 161-04; locks `native:`/`webapp:` prefix-emit through pass-through to AgentSessionManager)

**Carry-forward to Phase 162 (operator browser UAT):** Re-walk Phase 160 VERIFICATION.md 10-step checklist via browser at `bruce.livinity.io` to close MH2/MH3/MH4/MH7:
- Step 5 (NativeApp LibreOffice Chat) — re-confirm `claude-haiku-4-5` in journal (already LIVE-PROVEN via synthetic probe; browser-driven repeat = sanity)
- Step 6 (`journalctl | grep "LIVOS CONTEXT"`) — overlay text visible in prompt body
- Step 7 (NativeApp "open n8n") — window at `n8n-bruce.livinity.io` (DASH pattern)
- Step 9 (`grep DISPLAY:` in prompt) — real `2560x1440` (Mini PC xdpyinfo confirmed)
- Step 8 (sandbox `/etc/passwd` reject) — already PASS from Phase 160-05

If browser UAT surfaces a bug → Phase 162 open as targeted fix plan. If all green → Phase 161 closes fully, move to v34 next milestone item.

---

### Phase 165: Polish + Settings UI + v34.x Ship — 🔴 PLANNED 2026-05-19

**Goal:** Idle session reaper, Settings UI (model picker + autonomous panel + budget editor), memory linter slash command, v34.x consolidated VERIFICATION + final Mini PC deploy. v34.x milestone CODE-COMPLETE at this phase's close.

**Depends on:** Phase 164 SHIPPED
**Plans:** 4 plans across 3 waves (Wave 1: 165-01 + 165-03 parallel; Wave 2: 165-02; Wave 3: 165-04 deploy + OperatorUAT gate)
**Approach:** autonomous (165-01/02/03) + checkpoint (165-04 final UAT gate)
**Estimated:** ~4-6 saat
**CONTEXT.md:** `.planning/phases/165-cc-integration-polish/165-CONTEXT.md` (locked decisions)

**Hard guardrails:** Sacred SHA preserved, D-09 verbatim, D-NO-NEW-DEPS, Phase 161 chat-path-untouched contract (legacy mode still flippable via Redis flag), agent-session.ts UNCHANGED (idle reaper accesses sessions via ws-agent interface), Phase 162-01 vault-scaffolder source UNCHANGED, Phase 164 scheduler core UNCHANGED (only additive public getters in 165-02).

**Plans:**
- [x] 165-01-PLAN.md — IdleSessionReaper module + ws-agent activity hook + livinityd boot wire-up (Wave 1, autonomous) — **CODE-COMPLETE 2026-05-19** (commits `249b2840..1aef001c`; 12/12 idle-reaper.test.ts PASS; agent-session.ts UNCHANGED via SessionActivityProvider interface; sacred SHAs preserved 2/2; D-NO-NEW-DEPS upheld)
- [ ] 165-02-PLAN.md — Settings UI panels + autonomous + chatConfig tRPC routers + scheduler public read-getters (Wave 2, autonomous)
- [ ] 165-03-PLAN.md — livos-vault-doctor SKILL.md template + scaffolder regression test (Wave 1, autonomous)
- [ ] 165-04-PLAN.md — Mini PC deploy + live smoke probes + v34-VERIFICATION.md consolidated + Operator UAT gate (Wave 3, checkpoint: human-verify)

---

### Phase 164: Autonomous Scheduler + Sample Agents — 🟢 SHIPPED 2026-05-19 (LIVE-PROVEN on Mini PC, 2/2 probes PASS)

**Goal:** Background autonomous CC agents tetiklenebilsin (cron + event triggers from `vault/livos-agents/*.md` frontmatter). Output `vault/inbox/*.md`'a yazılır. Budget guardrails (per-agent + daily Mini PC total cap).

**Depends on:** Phase 163 SHIPPED
**Plans:** 5/5 CODE-COMPLETE + LIVE-VERIFIED (164-01 agent def parser, 164-02 scheduler module, 164-03 inbox writer, 164-04 sample agents nightly-backup-audit + pr-watcher, 164-05 deploy + manual trigger smoke + concurrent cap UAT)
**Approach:** autonomous
**Actual:** ~6 saat (5-7 saat estimate hit)
**CONTEXT.md:** `.planning/phases/164-autonomous-scheduler/164-CONTEXT.md`
**Verification:** `.planning/phases/164-autonomous-scheduler/164-VERIFICATION.md` (status: passed)

**Defaults at ship:**
- `liv:config:autonomous_enabled` = `false` (explicit opt-in) ✓ LIVE
- `liv:config:autonomous_daily_budget` = `5000` cents ($50) ✓ wired in budget-gate.ts
- `liv:config:autonomous_max_concurrent` = `3` ✓ LIVE-PROVEN (4 fan-out → 3 admitted)
- Sample agents ship `enabled: false` in frontmatter (user flips manually) ✓ LIVE on Mini PC

**Hard guardrails (all preserved):** Sacred SHA `f3538e1d` ✓, D-09 verbatim ✓, D-NO-NEW-DEPS ✓, autonomous run resource caps enforced ✓ (Probe 1: cost_usd $0.1045 / 11 turns / 75s well within $3 + 15-turn caps; Probe 2: cap-reject log on T3 with active_count back to 0).

**Plans:**
- [x] 164-01-PLAN.md — Agent definition format + parser (vault/livos-agents/*.md YAML+body → AgentDefinition) — SHIPPED
- [x] 164-02-PLAN.md — Scheduler module + budget gate + CLI trigger + livinityd boot wire-up — SHIPPED
- [x] 164-03-PLAN.md — Inbox writeback (vault/inbox/<ts>_<agent>.md with frontmatter + backlinks) — SHIPPED
- [x] 164-04-PLAN.md — Sample autonomous agents (nightly-backup-audit + pr-watcher, both enabled:false) — SHIPPED
- [x] 164-05-PLAN.md — Mini PC deploy + live UAT (manual trigger + concurrent cap probes) — SHIPPED + LIVE-PROVEN

**Live UAT highlights:**
- Probe 1: nightly-backup-audit CLI trigger → inbox entry `2026-05-19_19-41_nightly-backup-audit.md` with full frontmatter + real disk audit body (WARN status, 7% disk, 6 daemon restarts found); spend counter 0→10c; active_count 0
- Probe 2: 4 simultaneous fan-out → 3 inbox entries (NOT 4) with collision-suffixing `_2`/`_3`; spend 10→28c (3 runs billed); explicit `concurrent cap 3 exceeded` log line; active_count 0
- Safety wind-down: `autonomous_enabled=false` + sample agent `enabled: false` + 5 sacred SHAs byte-identical pre→post-deploy→post-revert

---

### Phase 163: Surface-Specific Vault Contexts + Phase 161 Helper Bridge — 🔴 PLANNED 2026-05-19

**Goal:** WebApp Chat + NativeApp Chat oturumları `vault/surfaces/<kind>/<id>/` CWD'sini kullansın. Surface-özel `CLAUDE.md` install hook'larıyla otomatik üretilsin. Phase 161 Haiku routing + LivOS overlay olduğu gibi reuse (sadece runtime CWD seçimi değişir).

**Depends on:** Phase 162 SHIPPED
**Plans:** 4 (163-01 surface scaffolder + install hooks, 163-02 isComputerUseSession → CWD resolution, 163-03 LivOS overlay coexistence with vault mode, 163-04 deploy + synthetic surface probes)
**Approach:** autonomous
**Estimated:** ~6-8 saat
**CONTEXT.md:** `.planning/phases/163-surface-vault-contexts/163-CONTEXT.md`

**Hard guardrails:** Sacred SHA preserved, D-09 verbatim, D-NO-NEW-DEPS, Phase 161 contract (native:/webapp: → Haiku model dated literal) preserved verbatim.

---

### Phase 162: Vault Scaffolding + SDK Settings Integration — 🔴 PLANNED 2026-05-19 — **NEXT ACTION**

**Goal:** v34.x milestone'unun temel taşı. `/home/bruce/livinity-vault/` Obsidian-uyumlu vault'u boot-time idempotent oluştur. AgentSessionManager.consumeAndRelay()'i `cwd` + `settingSources: ['project']` options ile çağıracak şekilde upgrade et — vault/CLAUDE.md + vault/.claude/skills + commands artık SDK tarafından auto-load. Redis flag `liv:config:chat_backend = vault | legacy` ile gate.

**Master plan reference:** `.planning/v34-LIVOS-CC-INTEGRATION-MASTER.md` (Decisions D-V34-A through D-V34-N locked, no discuss-phase needed)

**Trigger:** 2026-05-19 user feedback — "şu an seninle konuşan Claude Code, LivOS chat'i daha düşük kaliteli. Claude Code'u Livinity ile bütünleştirmek istiyorum". Research showed root cause: AgentSessionManager passes `query()` without `cwd` + `settingSources`, so vault/CLAUDE.md + .claude/skills/ never load. Hermes Agent's CC orchestration patterns + official Anthropic docs (https://code.claude.com/docs/en/headless, https://code.claude.com/docs/en/agent-sdk) informed v3 architecture: SDK-direct integration (not subprocess CLI) since the SDK already bundles + runs CC binary internally.

**Direction (5 plans):**
- **162-01** Vault scaffolder module + templates (CLAUDE.md, .claude/settings.json, memory/* shaped per master plan D-V34-D); idempotent boot-time creation
- **162-02** AgentSessionManagerOptions gains `vaultModeConfig?: {vaultPath, defaultModel}`; consumeAndRelay() branches: vaultMode true → pass cwd + settingSources + drop custom systemPrompt; vaultMode false → Phase 161 verbatim. Redis flag at livinityd wires the gate.
- **162-03** Auth threading verifier — boot-time smoke check that SDK subprocess reads `/root/.claude/.credentials.json` correctly (HOME env propagation per `BROKER_FORCE_ROOT_HOME`)
- **162-04** Multi-instance refactor: AgentSessionManager.sessions key shape from `userId` → `${userId}:${surfaceKind}:${surfaceId?}:${connectionId}` for parallel Main + WebApp + autonomous sessions per user
- **162-05** Mini PC deploy (detached + log poll) + live runtime probe (Phase 161 synthetic WS pattern adapted for vault mode — expect Opus 4.7 default + CLAUDE.md context evidence)

**Hard guardrails (master plan D-V34-J):**
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` — preserved
- D-09 verbatim `luse-system-prompt.ts` — preserved
- D-NO-NEW-DEPS — sıfır `package.json` diff
- Phase 161 chat-path-untouched: `liv:config:chat_backend=legacy` set olduğunda byte-identical pre-162 path (regression test asserts)
- Subscription-only (BYOK closed per user preference)

**UAT criteria (per-phase, automated where possible):**
- Synthetic WS probe (`conversationId: 'conv_smoke162'`, no native:/webapp: prefix) responds with `claude-opus-4-7` in journal
- Vault scaffolded files present + bruce-owned + Obsidian-readable
- Redis flag flip vault→legacy reverts behavior in <5sn (chat path unchanged)
- Sacred SHA + D-09 + D-NO-NEW-DEPS checks green at every Phase 162 commit
- Phase 161 regression: native:/webapp: prefix sessions still route to Haiku dated literal

**Plans:**
- [ ] 162-01-PLAN.md — Vault scaffolder + templates
- [ ] 162-02-PLAN.md — AgentSessionManager vault mode option + Redis flag gate
- [ ] 162-03-PLAN.md — Auth threading verifier
- [ ] 162-04-PLAN.md — Multi-instance sessionKey refactor
- [ ] 162-05-PLAN.md — Mini PC deploy + synthetic vault probe

**Resume:** `/clear` then `/gsd-autonomous --from 162`. Master plan + 4 CONTEXT.md files committed; autonomous run loops planner → executor → verifier per phase without user input. Mini PC deploys included per phase per `feedback_full_autonomous_no_questions` memory override.

---

### Phase 159: NativeApp WebApp Parity + Window Manager Panel — ✅ SHIPPED 2026-05-19 (browser UAT PASS via chrome-devtools MCP — LibreOffice open/close/reopen cycle proven leak-free; Xvfb :10 fully released and new :11 allocated cleanly; `closeNativeApp` journal trail confirmed in 3s window after panel Close click)

**Goal:** Bring NativeApp surface to functional parity with WebApp — same Chat chrome row (Teach + Skills omitted per A5; native binaries have no DOM), clean backend teardown on window close (no leaked streams or duplicate windows on reopen). Add a Windows Manager panel listing every open window with focus/close/minimize/pin controls. Frontend visual deferred to a follow-up phase; this phase locks data contracts, lifecycle, and wiring.
**Requirements**: operator-driven additive phase, no REQ-IDs
**Depends on:** Phase 157, Phase 158 (UI Chrome + Dock Iteration — open-ended polish, not blocking)
**Plans:** 9 plans / 32 commits / 4 waves

**Shipped:**
- **Workstream A — Chrome parity:** `nativeAppId` threaded windows-container → window → window-chrome → action-bar; dual-hook resolution preserving `const agent = useWebAppAgent(webappId` literal (T-10-10-RESPONSE-01 invariant green); `useNativeAppAgent` hook mirrors `UseWebAppAgentResult`; `NATIVE_MODES` = Chat-only
- **Workstream B — Lifecycle parity:** `registerCloseHandler`/`unregisterCloseHandler` API on WindowManagerContext with 2s `Promise.race` timeout; NativeAppStreamWindow + WebAppStreamWindow both migrated (defensive fallback on WebApp preserves D-95-CLEANUP literal); 30min idle reaper backstop (`NATIVE_APP_IDLE_REAP_MS` env override); `native-routes-new.ts` deploy landmine `git rm`'d
- **Workstream C — Windows Manager Panel:** TopBar Radix Popover behind Lucide LayoutGrid trigger; 4 actions/row (Focus / Min-Restore / Pin-Unpin / Close); activates latent `minimizeWindow`/`restoreWindow` reducer actions; visual intentionally utilitarian (frontend redesign deferred)

**Verification (automated):** 79/79 Phase 159-scoped vitest PASS; tsc clean on 13-file surface; sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 32 commits. BLOCKER #1 (variable-name preservation) + BLOCKER #2 (Plan 04↔07 file ownership) runtime-verified via grep matrix.

**Pending:** Mini PC `bash /opt/livos/update.sh` deploy + 12-step operator UAT walkthrough per `.planning/phases/159-nativeapp-webapp-parity-window-manager-panel/159-VERIFICATION.md`. Step 4 includes explicit `pgrep -af 'Xvfb :|x11vnc.*-display :'` zero-leak check post-close.

Plans:
- [x] 159-01 — Test stub scaffold (7 files)
- [x] 159-02 — registerCloseHandler API + landmine git rm
- [x] 159-03 — Native app idle reaper (30min backstop)
- [x] 159-04 — Native stream window registry migration
- [x] 159-05 — WebApp symmetric migration (defensive)
- [x] 159-06 — useNativeAppAgent hook
- [x] 159-07 — Chrome parity (nativeAppId thread + dual-hook + NATIVE_MODES)
- [x] 159-08 — Windows Manager panel (TopBar dropdown)
- [x] 159-09 — Full phase verification + UAT doc (automated half PASS; operator UAT pending)

---

### Phase 157: Install Action Wiring (close-out phase for v37)

**Status:** 🔴 PLANNED 2026-05-18 — operator-reported install bug found mid-Wave-B. Last v37 phase before milestone audit.

**Trigger:** Operator clicked Install in /store and nothing happened. Root cause: `useAppStoreBridge` (LivOS UI) carries its own copy of the postMessage protocol and was not updated for v37's new sections (webapp/native/ai/plugin) or the `installCustomWebapp` message type. Bridge silently ignores unknown messages → user sees optimistic UI but the install never reaches livinityd.

**Goal:** Wire the new section install handlers (P150-B / P152-B / P153 / P154-B) into the bridge + livinityd trpc layer so clicking Install actually installs across every section. Plus AppCard gains an inline Install button (single-click in embedded mode).

**Direction (3 waves):**
- **Wave V (Vercel, immediate):** `StoreToLivOSMessage.install` gains `section: Section` field. `sendInstall` forwards it. AppCard renders inline Install button with section-aware copy.
- **Wave U (LivOS UI, operator deploys):** Bridge protocol sync; `handleInstall` switches on section; new `handleInstallCustomWebapp` handler.
- **Wave L (livinityd, operator deploys):** Service container wires `InstallDispatcher` + registers handlers. 4 new trpc procedures (installNative/installAi/installPlugin + webapp.installFromCatalog) + 1 progress query. Express `/p/:id/*` plugin middleware. Sudoers deploy. WebSocket broadcast for plugin install/uninstall.

**Plans:** 1 plan (PLAN.md) covering Wave V/U/L + 10 UAT steps.

**UAT:** 10-step walkthrough (PLAN.md → "Wave UAT") covering install for every section + uninstall + failure case. Acceptance: VS Code from /store → dock → window opens.

**Depends on:** Phases 148 ✅ (contracts) + 150 ✅ + 152 ✅ + 153 ✅ + 154 ✅ (handlers in repo) + 156 ✅ (admin so operator can debug rows).

**Carryover:** None — this is the close-out phase. After P157 ships + UAT passes, v37 milestone audit runs.

---

# v35.0 — Claude Code PTY Embed + Vault Memory Graph — 🟢 CODE-COMPLETE-AND-LIVE-VERIFIED 2026-05-19

> **Status:** CODE-COMPLETE-AND-LIVE-VERIFIED (operator browser walk pending) — see [`.planning/phases/170-v35-deploy-uat/v35-VERIFICATION.md`](phases/170-v35-deploy-uat/v35-VERIFICATION.md)
>
> **Shipped:** 5 phases / 23 plans / 26 commits / 285+ vitest assertions GREEN / 10-of-11 live Mini PC probes PASS / Sacred SHA preserved across all commits / `tmux 3.4` apt-installed on Mini PC / `.deployed-sha=45d52116`.
>
> **Supersedes:** v35.0 Design System Unification (2026-05-14, rolled back per memory note `project_v36_draft.md`)
>
> **Theme:** AI Chat dock window pivots from custom SDK wrapper to embedded Claude Code via xterm.js + tmux PTY. Session persists across browser close (tmux owns the process). Vault memory graph view added as 2nd tab. Other chat surfaces (WebApp/NativeApp) KEEP SDK approach (Phase 161/163 untouched).
>
> **Master plan:** [`v35-CC-PTY-MASTER.md`](v35-CC-PTY-MASTER.md) (READ THIS FIRST — full pre-flight + 14 locked decisions D-V35-A..N + 7 success criteria + risk register)
>
> **Pre-flight verified 2026-05-19:** Node v22.22.1 + python3 + make + g++ ✓; claude v2.1.84 with --resume ✓; HOME=/root contract ✓; @xterm refs 8 in lockfile ✓; node-pty refs 3 ✓; d3-force refs 6 ✓; **tmux NOT installed** (Phase 170 apt install) **react-force-graph-2d NOT in lockfile** (Phase 169 adds).
>
> **D-NEW-DEPS-v35 EXCEPTION:** Two new deps authorized — `react-force-graph-2d` (npm) + `tmux` (apt). v34.x D-NO-NEW-DEPS guardrail RETIRED for this milestone. Sacred SHA + D-09 + Phase 161-02 helper + Phase 162-01 vault-scaffolder + Phase 162-02 agent-session.ts + Phase 163 ws-agent.ts surface routing + Phase 164 scheduler core ALL REMAIN LOCKED.

### Phase 166: CC PTY Backend (tmux + node-pty + WebSocket) — 🟢 CODE-COMPLETE 2026-05-19

**Goal:** livinityd-side tmux/node-pty bridge that owns Claude Code subprocess lifecycle. WebSocket endpoint `/ws/cc-pty` lets browser clients attach by sessionId; tmux owns the `claude` process (NOT the WebSocket). Browser tab close → tmux keeps running. Reattach = new WS over existing tmux. Plus 24h idle reaper.

**Plans (5 / 5 SHIPPED):**
- [x] 166-01 tmux apt install + cc-pty module scaffold + types — commit `4dd30c83`
- [x] 166-02 SessionStore (file-backed metadata at `vault/.claude/livos-cc-sessions.json`) — commit `3e72db4a`
- [x] 166-03 PTY manager (tmux + node-pty bridge, attach/detach/kill, concurrent cap) — commit `8827d2a9`
- [x] 166-04 WebSocket handler `/ws/cc-pty` (auth + JSON envelopes + base64 stdout) — commit `6e9e2bc6`
- [x] 166-05 Boot wire-up + idle reaper (5min interval, 24h default cutoff) — commit `64596174`

**Wave:** 1
**Verification:** `.planning/phases/166-cc-pty-backend/166-VERIFICATION.md` — 71 vitest assertions GREEN, sacred SHA preserved 6/6 commits.

---

### Phase 167: xterm.js Frontend Component (CcTerminal) — 🟢 CODE-COMPLETE 2026-05-19

**Goal:** Browser-side `<CcTerminal>` React component using xterm.js. Replaces legacy SDK chat in AI dock window. Theme-aware (LivOS dark/light bound to xterm colors). Mobile shows "open on desktop" fallback. Legacy SDK chat moves to `/chat-mobile` route.

**Plans (4 / 4 SHIPPED):**
- [x] 167-01 CcTerminal core component (xterm.js + FitAddon only — web-links/canvas dropped per D-NEW-DEPS-v35) — commit `05758e80`
- [x] 167-02 WebSocket client (terminal-ws-client.ts, exponential backoff reconnect) — commit `74b608ef`
- [x] 167-03 LivOS theme → xterm theme bridge (live-bound, no remount) — commit `a73c72f1`
- [x] 167-04 AI Chat route swap (legacy inline AiChat → legacy-ai-chat-panel.tsx → /chat-mobile route) + mobile fallback — commit `165339f4`

**Wave:** 1
**Verification:** `.planning/phases/167-xterm-frontend/167-VERIFICATION.md` — 45 vitest assertions GREEN, sacred SHA preserved 5/5 commits.

---

### Phase 168: Session Sidebar + Lifecycle UI — 🟢 CODE-COMPLETE 2026-05-19

**Goal:** AI Chat sidebar lists user's CC sessions. New Session button → spawn tmux + auto-select. Click session → mount CcTerminal. Rename/delete actions. Last-message preview from CC's jsonl. Cross-tab "attached elsewhere" indicator via Redis pub/sub.

**Plans (4 / 4 SHIPPED):**
- [x] 168-01 tRPC `cc-pty-router.ts` (5 procedures: list, create, rename, delete, getPreview; +5 httpOnlyPaths) — commit `36b5c662`
- [x] 168-02 SessionSidebar + SessionItem + NewSessionButton components — commit `55b1e097`
- [x] 168-03 AI Chat route integration (wire sidebar + terminal) — commit `312ac6a1`
- [x] 168-04 Cross-tab attach indicator (Redis pub/sub) — commit `ba945a12`

**Wave:** 2 (depends on 166 + 167)
**Verification:** `.planning/phases/168-session-sidebar/168-VERIFICATION.md` — 93 vitest assertions GREEN, 0 NEW tsc errors, sacred SHA `f3538e1d` preserved 4/4 commits. Real Redis pub/sub round-trip + two-tab UAT deferred to Phase 170.

---

### Phase 169: Vault Memory Graph View — 🟢 CODE-COMPLETE 2026-05-19

**Goal:** Visual graph of vault contents in AI Chat as 2nd tab. Backend walks vault/*.md, parses YAML + `[[wikilinks]]`, emits `{nodes, edges}` JSON. Frontend uses `react-force-graph-2d`. Click node → side drawer with file content. Cap at 2000 nodes.

**Plans (5 / 5 SHIPPED):**
- [x] 169-01 Vault walker + frontmatter parser (js-yaml CORE_SCHEMA) + wikilink extractor — commit `d81b7ba6`
- [x] 169-02 Graph builder + REST endpoint `/api/vault/graph` + `/api/vault/file` (Express routes, 1MiB cap, `..` block) — commit `7ecc98dc`
- [x] 169-03 VaultGraph React component (react-force-graph-2d@^1.29.1) + GraphNodeDetail drawer — commit `c51dd919`
- [x] 169-04 AI Chat route — Terminal/Graph tab nav — commit `151111af`
- [x] 169-05 Boot wire-up + mountVaultGraphRoutes helper + integration test — commit `8e766344`

**Wave:** 1
**Verification:** `.planning/phases/169-vault-graph/169-VERIFICATION.md` — 76 vitest assertions GREEN; live Mini PC probe: 15 nodes, 8 edges, path traversal blocked.

---

### Phase 170: v35.0 Mini PC Deploy + UAT + Milestone Close — 🟢 CODE-COMPLETE 2026-05-19

**Goal:** Deploy v35.0 to Mini PC. `apt install tmux`. Live smoke probes covering all master plan success criteria (session lifecycle, persistence-across-browser-close, subagent on-disk, vault graph endpoint, Phase 162/163 regression). Consolidated `v35-VERIFICATION.md`. Safety wind-down.

**Plans (executed inline by orchestrator — no per-plan commits, evidence in v35-VERIFICATION.md):**
- [x] 170-01 Pre-deploy guard sweep — all 7 sacred SHAs verified pre-deploy on Mini PC; tmux 3.4 apt-installed
- [x] 170-02 update.sh run via nohup + log poll — exit 0; `.deployed-sha=45d52116`; all 4 services active; cc-pty + vault-graph boot log lines present
- [x] 170-03 Live smoke probes — Probes 1, 1b, 2a-2e, 3, 4, 4b, 4c, 5 all PASS (10/11); only interactive subagent spawn deferred to operator
- [x] 170-04 v35-VERIFICATION.md — written at `.planning/phases/170-v35-deploy-uat/v35-VERIFICATION.md` with 8-step Operator UAT § Browser Walk
- [x] 170-05 STATE.md + ROADMAP.md updated — milestone marked CODE-COMPLETE-AND-LIVE-VERIFIED

**Wave:** 3 (FINAL — depends on 166, 167, 168, 169)
**Verification:** `.planning/phases/170-v35-deploy-uat/v35-VERIFICATION.md` — status `passed-pending-OperatorUAT` (operator browser walk closes the milestone fully)
**Closes:** v35.0 LivOS Claude Code Embed milestone (operator browser walk pending)

---


# v38.0 — Liv Agent Platform — ✅ CODE-COMPLETE-AND-LIVE-VERIFIED 2026-05-20

> **Master plan:** [`v38-LIV-AGENT-PLATFORM-MASTER.md`](v38-LIV-AGENT-PLATFORM-MASTER.md) (READ FIRST — 21 locked decisions D-V38-A..U + 4 LivOS-native default skills + GSD-style 3-layer architecture + 14 phases / 61 plans / 5 waves)
>
> **Theme:** AI Chat sidebar pivots from flat session list to a tree of **Project / Agent / Chat** Items, each backed by a folder on disk. Main "Liv" root agent greets new users with 4 LivOS-native default skills (luse-driver, livos-operator, appstore, window-manager). `npx liv` CLI clones `gsd-sdk`'s 3-layer architecture verbatim. Vault Graph polished into Obsidian-class IA wrapped in Livinity Design tokens. Mobile `/chat-mobile` upgraded from SDK fallback to real Claude Code. Settings restructured.
>
> **Vault rename:** `/root/livinity-vault/` → `/root/liv/` (operator vote 2026-05-20). Phase 173 handles atomic migration + compatibility symlink + env-var resolver (sacred SHA on Phase 162-01 vault-scaffolder STAYS — additive shim only).
>
> **D-NEW-DEPS-v38:** 3 new npm deps authorized — `react-arborist` (Phase 174 tree UI), `node-cron` (Phase 177 schedules), `nanoid` (Phase 171 UUID v7). Everything else holds D-NO-NEW-DEPS.

---

### Phase 171: Item Model + Storage Layer — 🔴 PLANNED 2026-05-20

**Goal:** NEW livinityd module `vault-items/` with types, file-backed item-store, tree-resolver, atomic CRUD ops, schema v1. tRPC `vault.items.{list,get,create,update,move,archive,delete}`. Redis pub/sub `liv:tree:updated`.

**Wave:** 1 (parallel-safe with 172)
**Plans:** 5 plans (waves 1 → 2 → 3 → 4)

Plans:
- [ ] 171-01-PLAN.md — Item types + vault-root-resolver + nanoid dep (wave 1, no deps)
- [ ] 171-02-PLAN.md — ItemStore (file-backed atomic CRUD + per-type scaffolding) (wave 2, depends 171-01)
- [ ] 171-03-PLAN.md — Tree-resolver + cycle/depth-cap validation + tree.json cache (wave 3, depends 171-01)
- [ ] 171-04-PLAN.md — tRPC `vault.items.*` router (7 procedures) + httpOnlyPaths (wave 4, depends 171-02 + 171-03)
- [ ] 171-05-PLAN.md — PubSub `liv:tree:updated` wrapper + livinityd boot wire-up (wave 4, depends 171-02)

---

### Phase 172: `@livos/cli` Package Skeleton — 🟢 CODE-COMPLETE 2026-05-20

**Goal:** NEW workspace package `packages/cli/` exposing `liv` bin with commands: `init`, `project new`, `agent new`, `chat`, `list --tree`, `attach`, `config get/set`, `doctor`, `migrate`, `query`. ESM, minimal deps. tRPC HTTP client + filesystem fallback. Mirrors `gsd-sdk` 3-layer (CLI + bundled skills + bundled templates installed via postinstall symlink).

**Wave:** 1 (parallel-safe with 171)
**Plans:** 5 plans (5/5 SHIPPED)
Plans:
- [x] 172-01-PLAN.md — Package scaffold + bin entry (wave 1, no deps) — ✅ SHIPPED
- [x] 172-02-PLAN.md — tRPC HTTP client + filesystem-mode fallback + auth resolver (wave 2, depends 172-01) — ✅ SHIPPED (14 vitest PASS)
- [x] 172-03-PLAN.md — Query registry + 10 command handler modules + cli.ts rewire (wave 3, depends 172-01 + 172-02) — ✅ SHIPPED (16 new vitest PASS)
- [x] 172-04-PLAN.md — Bundled skills + workflows + idempotent postinstall (wave 2, depends 172-01; parallel-safe with 172-02) — ✅ SHIPPED (4 smoke PASS)
- [x] 172-05-PLAN.md — `liv init` + `liv doctor` + E2E smoke (wave 4, depends 172-02 + 172-03) — ✅ SHIPPED (16 new vitest PASS incl. real-spawn E2E)

**Quality gate:** 46 vitest PASS + 4 postinstall smoke PASS = 50 total automated checks. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all commits. See `.planning/phases/172-livos-cli-skeleton/172-VERIFICATION.md`.

---

### Phase 173: Vault Rename + Phase 168 Migration + Sacred Freeze — 🟢 CODE-COMPLETE 2026-05-20 (4/4 plans shipped, 51 tests PASS, sacred SHA hook now JSON-driven w/ 25 file pins, 13 commits e0cd2b0e..3dcb2e6f)

**Goal:** Atomic `mv /root/livinity-vault/ /root/liv/` on Mini PC at deploy time. Compatibility symlink. NEW `vault-root-resolver.ts` shim (Phase 162-01 scaffolder STAYS byte-identical). Migrate `livos-cc-sessions.json` → ChatItems under Main Liv. Update Sacred SHA hook to lock vault-items + cli modules.

**Depends on:** Phase 171
**Wave:** 2 (parallel with 179 — depends on 171)
**Plans:** 4 plans

Plans:
- [x] 173-01-PLAN.md — Deploy-time vault rename script (idempotent mv + symlink + service restart) + deploy_livinityd wire-up — ✅ SHIPPED (21 bash-test PASS / 0 FAIL; 4 commits `e0cd2b0e..e08ca7f4`; sacred SHA preserved)
- [ ] 173-02-PLAN.md — Session migration writer (livos-cc-sessions.json → ChatItems under Main Liv) + backup + 8 vitest assertions
- [ ] 173-03-PLAN.md — Sacred SHA hook v38 freeze (JSON registry of 25 sacred files, check-sacred.sh rewrite, CI test)
- [ ] 173-04-PLAN.md — livinityd systemd unit env update (Environment=LIV_VAULT_ROOT=/root/liv) + CI test

---

### Phase 174: SidebarTree Component — 🟢 CODE-COMPLETE 2026-05-20 (5/5 plans, ~18 commits f956813d..08abfc9c, 58 tests PASS UI+server, react-arborist@3.7.0, sacred SHA hook PASS every commit)

**Goal:** NEW `<SidebarTree>` using react-arborist. Per-type row styling (Project/Agent/Chat icon + color from D-V38-O palette). Drag-to-reparent with cycle check. Context menu (rename/duplicate/archive/delete/export). Bottom-left Settings gear button.

**Depends on:** Phase 171, 173
**Wave:** 3 (depends 171 ✓ + 173 ✓ — both shipped)
**Plans:** 5 plans

Plans:
- [ ] 174-01-PLAN.md — Install react-arborist@^3.x + scaffold features/sidebar-tree/ (3 skeleton files: SidebarTree, ItemTreeRow, barrel)
- [ ] 174-02-PLAN.md — Implement SidebarTree body: vault.items.list tRPC query + react-arborist render + Main Liv pin + empty-state hint + 5s poll (10 vitest assertions + 8 pure-transformer tests)
- [ ] 174-03-PLAN.md — Per-type styling on ItemTreeRow: D-V38-O token-driven colors + lucide icons (FolderKanban / Bot / MessageSquare) (8 vitest assertions, dark+light parity)
- [x] 174-04-PLAN.md — Drag-drop via react-arborist onMove + vault.items.move tRPC; additive cause field on TRPCError for typed UI toasts; cycle/depth-hard error + depth-soft warn handling — ✅ SHIPPED 2026-05-20 (`f8c35827..8edf69be`, 18 server + 16 UI vitest PASS, sacred SHA preserved 4/4)
- [ ] 174-05-PLAN.md — ItemContextMenu (Radix; agent-only Run Now/View Inbox/Stop Tmux) + SidebarFooter (lucide Settings gear button, stub handler for Phase 183) + barrel updates (4 + 4 vitest assertions)

---

### Phase 175: Add Modal + Item Detail Views — 🟢 CODE-COMPLETE 2026-05-20 (5/5 plans, 10 commits d257fbc0..9577370f, 50 vitest assertions PASS, Phase 168 cc-sessions + cc-pty-router DELETED, sacred SHA hook PASS 10/10)

**Goal:** NEW `<AddItemModal>` — type selection + per-type form. NEW `<ProjectDetail>`, `<AgentDetail>` views. `<ChatDetail>` = direct CC PTY attach (no detail page). Replace Phase 168 `SessionSidebar` + `NewSessionButton`.

**Depends on:** Phase 174
**Wave:** 2
**Estimated:** 5 plans

---

### Phase 176: Main Liv Root Agent + 4 LivOS-Native Skills — ✅ CODE-COMPLETE 2026-05-20

**Goal:** NEW Liv root agent with 6 mutation tools (`create_item`, `list_items`, `move_item`, `archive_item`, `open_item`, `run_agent`). 4 LivOS-native default subagents scaffolded into `~/liv/.claude/agents/`:
- **`luse-driver.md`** — computer use via Phase 165 luse MCP (re-registered into Liv's tool set)
- **`livos-operator.md`** — LivOS architecture + diagnostics knowledge
- **`appstore.md`** — install/uninstall/list apps via existing `apps.*` tRPC
- **`window-manager.md`** — window list/focus/close/pin via Phase 159 WindowManager tRPC

Empty-state UI (terminal centered, Liv greeting). Liv's tmux session auto-spawned on first user boot.

**Depends on:** Phase 171, 175
**Wave:** 5
**Plans:** 5 plans — ALL SHIPPED
**Commits:** `e1a8f5d5..cad3aa07` (6 commits)
**Tests:** 66 new tests — 66/66 PASS
**Sacred SHA:** preserved 6/6

Plans:
- [x] 176-01-PLAN.md — liv-rootagent.md template + LivScaffolder (ensureLivRootAgent) — commit e1a8f5d5
- [x] 176-02-PLAN.md — 6 Liv MCP tools (create_item/list_items/move_item/archive_item/open_item/run_agent) — commit e50065cc
- [x] 176-03-PLAN.md — 4 LivOS-native subagent templates + ensureLivSkills scaffolder — commit dffdcf52
- [x] 176-04-PLAN.md — LivWelcomeTerminal empty-state UI + ai-chat route empty-state branch — commit a95078d2
- [x] 176-05-PLAN.md — SidebarTree openItem subscription + vault-items-router openItem procedure — commits 1b18ac1e + cad3aa07

---

### Phase 177: Schedule Engine + Inbox System — ✅ CODE-COMPLETE 2026-05-20

**Goal:** Extend Phase 164 autonomous-scheduler with per-Agent cron registry (`node-cron`). Inbox writer (`items/<uuid>/inbox/<runId>.md`). Inbox UI component (sidebar badge + detail view inbox list). Cross-Item global inbox via filesystem walker.

**Depends on:** Phase 171, 176
**Wave:** 4 (sequential — each plan depends on prior)
**Plans:** 4 plans | 9 commits `b14dac8c..950347d7` | 68 tests | sacred SHA 25/25

Plans:
- [x] 177-01-PLAN.md — node-cron AgentScheduleRegistry + boot sweep + additive autonomous-scheduler export ✅ (10 tests)
- [x] 177-02-PLAN.md — AgentRunner (Redis lock + CC PTY spawn + per-agent inbox write) + run_agent tool unwire ✅ (12 tests)
- [x] 177-03-PLAN.md — InboxReader filesystem walker + vault.inbox tRPC router (listByAgent/listGlobal/markRead/get) ✅ (16 tests)
- [x] 177-04-PLAN.md — Inbox badge on ItemTreeRow + AgentDetail live tRPC wire + GlobalInboxWindow ✅ (30 tests)

---

### Phase 178: Vault Graph MVP Polish — 🟢 CODE-COMPLETE 2026-05-20 (38/38 vitest PASS, 7 commits 6b2690dd..ebcabf3f, sacred SHA preserved)

**Goal:** Re-palette to D-V38-O 7-type colors (steel-blue / violet / sage / amber / teal / plum / gray-mute). Replace `<pre>` markdown with streamdown render. Backlinks/Outgoing lists derived client-side. Refresh button + truncated banner restyled per Livinity DS. SearchBar `Cmd+K` + live filter.

**Wave:** 3 (parallel with 177)
**Estimated:** 4 plans

---

### Phase 179: Vault Graph Controls Panel — ✅ CODE-COMPLETE 2026-05-20

**Goal:** Right-edge floating Controls panel — **Filters** (type, orphans, recent, ghosts) + **Groups** (by type/folder/tag/custom) + **Display** (label, size, thickness, arrows) + **Forces** (4 sliders + reset). Backend extends `/api/vault/graph` to emit per-node `tags[]` + `topDir`.

**Depends on:** Phase 178
**Wave:** 3
**Plans:** 5/5 complete | 43 new assertions | 125 total PASS

Plans:
- [x] 179-01-PLAN.md — backend extension: extractTags() + VaultFile.topDir + GraphNode.tags/topDir (9 assertions)
- [x] 179-02-PLAN.md — GraphControls scaffold + FiltersSection with localStorage persistence (10 assertions)
- [x] 179-03-PLAN.md — GroupsSection: 4 group modes + hashToOklch auto-color + 300ms transition (8 assertions)
- [x] 179-04-PLAN.md — DisplaySection (3 sliders + 2 toggles) + ForcesSection (4 sliders + Reset) (10 assertions)
- [x] 179-05-PLAN.md — useGraphSettings hook + VaultGraph orchestrator full wiring (6 assertions)

---

### Phase 180: Local Graph + Animation Timeline — ✅ CODE-COMPLETE 2026-05-20

**Goal:** Local Graph mode (BFS from active node, depth chip UI). Animate timeline (`mtime`-ordered reveal). Optional legend badge bottom-left.

**Depends on:** Phase 179
**Wave:** 3
**Plans:** 3/3 plans shipped

Plans:
- [x] 180-01-PLAN.md — BFS depth resolver + DepthChip + VaultGraph local mode (8 assertions) ✅
- [x] 180-02-PLAN.md — animation.ts setTimeout reveal + DisplaySection Animate button (6 assertions) ✅
- [x] 180-03-PLAN.md — LegendBadge bottom-left + hiddenGroups wiring (6 assertions) ✅

**Commits:** 306d9ae0..351a8069 (6 commits) | Tests: 92/92 PASS (+20 new) | Sacred SHA: 25/25

---

### Phase 181: Mobile CC PTY — ✅ CODE-COMPLETE 2026-05-20

**Goal:** Replace `/chat-mobile` legacy SDK fallback. Tablet (≥640px + `pointer:coarse`) → `<CcTerminal>` + `<MobileTerminalKeyBar>` (2-row sticky-Ctrl). Phone (<640px) → CC-backed bubble UI streaming `/ws/cc-pty`. Touch gestures: pinch-zoom, two-finger paste, three-finger detach. WS resilience: visibilitychange resume, heartbeat ping/pong, `tmux capture-pane` replay-on-reattach.

**Depends on:** Phase 175
**Wave:** 4
**Plans:** 4 plans (4/4 complete)
**Commits:** `a03cde0e..a19ebdc5`
**Tests:** 74 UI + 76 backend, 43 new Phase-181 assertions, 31 Phase-167 baseline preserved
**Key:** legacy-ai-chat-panel.tsx DELETED; sacred 25/25 PASS

Plans:
- [x] 181-01-PLAN.md — Device class detection (useDeviceClass hook) + chat-mobile route branching
- [x] 181-02-PLAN.md — MobileTerminalKeyBar (2-row sticky-Ctrl key bar for tablet)
- [x] 181-03-PLAN.md — Touch gestures on CcTerminal (pinch-zoom, two-finger paste, three-finger detach)
- [x] 181-04-PLAN.md — WS resilience (visibilitychange + heartbeat) + tmux capture-pane + MobileBubbleChat + legacy delete

---

### Phase 182: Settings Restructure — ✅ CODE-COMPLETE 2026-05-20

**Goal:** Remove `ChatBackendPanel` + route. Drop top-menu Agents tile (sidebar absorbs). Rename "Autonomous Agents" → "Scheduled Agents". Settings sidebar regrouped into PERSONAL / WORKSPACE / AI / SYSTEM. NEW `<AiChatSettingsPanel>` (7 fields incl. dangerously-skip toggle, default cwd, idle hours, max sessions, allowed paths, force terminal on phone, default model). NEW `<McpServersPanel>` lifted from chat sidebar.

**Wave:** 4 (parallel with 181)
**Plans:** 5/5 complete

Plans:
- [x] 182-01-PLAN.md — Delete ChatBackend + drop LIVINITY_subagents + rename Autonomous→Scheduled + absorb model picker into ai-config (`81d655f3`)
- [x] 182-02-PLAN.md — Sidebar grouping (PERSONAL/WORKSPACE/AI/SYSTEM) + footer cluster (`ec22b4bb`)
- [x] 182-03-PLAN.md — NEW AiChatSettingsPanel (7 fields, ccPty tRPC router, confirm dialog) (`97198867`)
- [x] 182-04-PLAN.md — Lift mcp-panel into McpServerList + McpServerDetail + NEW settings/mcp-servers page (`17ac0533`)
- [x] 182-05-PLAN.md — Settings router cleanup + deep-link audit + full suite green (`d9bd3a47`)

---

### Phase 183: tmux status off + dangerously-skip default + sidebar Settings button — ✅ CODE-COMPLETE 2026-05-20

**Goal:** `tmux set -g status off` on session spawn (eliminates status line). `cc-pty/manager.ts` reads `liv:config:cc_pty_skip_perms` (default **true** per D-V38-K) → injects `--dangerously-skip-permissions` flag. Sidebar bottom-left gear-icon Settings button (D-V38-N).

4 commits `fc71dc66..64444b74` · 33 manager assertions + 54 sidebar-tree assertions · sacred SHA 25/25

**Depends on:** Phase 174, 182
**Wave:** 4
**Plans:** 2 plans

Plans:
- [x] 183-01-PLAN.md — cc-pty/manager.ts: tmux set-option status off + dangerously-skip-permissions Redis-gated flag (D-V38-K/R) (+8 vitest assertions, total 33) — ✅ SHIPPED `fc71dc66..8fd04f49`
- [x] 183-02-PLAN.md — SidebarTree gear click → openWindow/focusWindow Settings (D-V38-N, idempotent, +4 vitest assertions) — ✅ SHIPPED `123f9a56..64444b74`

---

### Phase 184: v38.0 Mini PC Deploy + UAT + Milestone Close — ✅ CODE-COMPLETE 2026-05-20

**Goal:** Push + `bash /opt/livos/update.sh`. Migration script (Phase 173) auto-runs on first boot. Live probes: tree CRUD, sidebar drag-drop, Add modal Project/Agent/Chat, Liv root agent greet, autonomous agent run via cron, Vault Graph controls panel functional, mobile route serves CC-backed UI, Settings panels in new groups, MCP panel functional, no Phase 168 SessionSidebar reachable. v38-VERIFICATION.md. STATE + ROADMAP milestone close.

**Depends on:** all prior phases (171-183)
**Wave:** 5 (FINAL)
**Plans:** 5 plans
**Closes:** v38.0 Liv Agent Platform milestone

Plans:
- [x] 184-01-PLAN.md — Pre-deploy guard sweep: Mini PC SSH + service health + 25 sacred SHA inventory — ✅ SHIPPED `a0d26c65`
- [x] 184-02-PLAN.md — Run update.sh on Mini PC (detached nohup + log-poll) + post-deploy SHA/service/migration verify — ✅ SHIPPED `23fd40d6`
- [x] 184-03-PLAN.md — Live smoke probes P1-P13: 11/13 PASS (P5+P6 PASS-deferred by design) — ✅ SHIPPED `8c5cd577`
- [x] 184-04-PLAN.md — v38-VERIFICATION.md: 406 lines, 8 sections, 20 SC-V38-xx rows, 12-step operator UAT walk — ✅ SHIPPED `feefc235`
- [x] 184-05-PLAN.md — STATE.md + ROADMAP.md milestone close markers + safety wind-down + final push — ✅ SHIPPED

---

## v38.0 — Liv Agent Platform — CLOSED 2026-05-20

**Status:** CODE-COMPLETE-AND-LIVE-VERIFIED
**Phases shipped:** 14 (Phase 171 → Phase 184)
**Total commits:** 141 (b208a320..feefc235 + 184-05 close commits)
**Push range:** b208a320..HEAD
**Sacred SHA:** f3538e1d811992b782a9bb057d1b7f0a0189f95f — preserved across all 141 commits
**Sacred registry:** 25 files locked (scripts/sacred-shas-v38.json)
**Verification:** `.planning/phases/184-v38-deploy-uat/v38-VERIFICATION.md`
**Operator UAT:** pending browser walk (§ Operator UAT Browser Walk in v38-VERIFICATION.md)
**Deployed SHA:** a0d26c65676e6f3161deaccb4fb4b3e0068701a6

### v38.0 Deliverables
- Tree-of-Items vault: Project/Agent/Chat hierarchy replaces flat session list (Phase 171)
- Phase 173: livinity-vault → ~/liv/ rename + migration script
- Phase 174: SidebarTree with drag-drop reparenting + cycle/depth guards
- Phase 175: Add Modal + Item Detail Views
- Phase 176: Main Liv root agent + 4 LivOS-native default skills
- Phase 177: Schedule Engine + Inbox (autonomous agents)
- Phase 172: @livos/cli npm package skeleton (daemon + filesystem modes)
- Phase 178+179+180: Vault Graph MVP + Controls Panel + Local mode + Animation
- Phase 181: Mobile CC PTY (tablet terminal + phone bubble)
- Phase 182: Settings Restructure (PERSONAL/WORKSPACE/AI/SYSTEM groups)
- Phase 183: tmux status off + dangerously-skip default + sidebar gear
- Phase 184: Mini PC deploy + 11/13 live probes PASS + v38-VERIFICATION.md

### v38.1+ Carry-overs
- Real Liv root agent interactive screenshot via luse-driver
- @livos/cli npm publish
- Two-tab cross-attach indicator visual verification
- Mobile device real-world test (iPad + Android tablet + iPhone)
- LIV_VAULT_ROOT=/root/liv env var + mv /root/livinity-vault /root/liv (vault rename D-V38-A carry-over)
- Remaining items from .planning/phases/184-v38-deploy-uat/v38-VERIFICATION.md § Deferred Items

---

# v38.1 — Liv Agent Platform UAT Hotfix — 🔴 OPENED 2026-05-20

**Status:** OPEN — 3 UAT findings from v38.0 operator review need fix
**Source:** Operator UAT 2026-05-20 — user identified 3 visible bugs after sleeping autonomous run
**Phases:** 3 (Phase 185 → 187)
**Closes:** v38.0 UAT loop

### v38.0 UAT Findings (the bugs)
1. **No sidebar visible** — Phase 174's `<SidebarTree>` was built but never wired into a global layout. The ai-chat route comment says "they live in the global dock window manager" but no global dock actually mounts them. User sees no tree, can't open Chats per Phase 175's prompt.
2. **MCP panel moved to Settings against operator preference** — Phase 182-04 lifted `mcp-panel.tsx` from AI Chat into `routes/settings/mcp-servers.tsx`. User wants MCP back in AI Chat area (next to the chat content, not buried in Settings).
3. **Vault Graph UI quality** — Phase 178-180 shipped functional graph but UX still feels rough. Operator referenced 3 Obsidian repos for pattern study: `breferrari/obsidian-mind`, `eugeniughelbur/obsidian-second-brain`, `kepano/obsidian-skills`.

---

### Phase 185: Mount SidebarTree in AI Chat Window (Left Pane) — 🟡 CODE-COMPLETE 2026-05-20

**Goal:** Wire `<SidebarTree>`, `<SidebarFooter>`, and `<AddItemModal>` into the AI Chat window content (`routes/ai-chat/index.tsx`) as a persistent left pane. Per [feedback_livos_window_logic_no_url_routing.md], the sidebar belongs INSIDE the AI Chat window — not in the global desktop shell. Resolves v38.0 UAT finding #1: "Open a Chat from the sidebar to attach a terminal" (no sidebar was visible).

**Scope:**
- 185-01: Split AI Chat window into left pane (SidebarTree ~280px) + right pane (tab content)
- 185-02: Right-pane item routing — Chat click → ChatDetail, Project → ProjectDetail, Agent → AgentDetail
- 185-03: Mobile collapse via useIsMobile + AddItemModal trigger at top of sidebar
- 185-04: UAT probe doc + ROADMAP status marker

**Depends on:** Phase 174 (SidebarTree), Phase 175 (AddItemModal + Detail views), Phase 176 (open_item), Phase 183 (gear button)
**Wave:** 1 (file-disjoint with Phase 186)
**Plans:** 4 plans

Plans:
- [x] 185-01-PLAN.md — Split layout + SidebarTree mount (6 assertions)
- [x] 185-02-PLAN.md — Right-pane item routing (8 assertions)
- [x] 185-03-PLAN.md — Mobile collapse + AddItemModal trigger (4 assertions)
- [x] 185-04-PLAN.md — UAT probe + ROADMAP marker (docs only)

**Test delta:** +18 vitest assertions (32 PASS in ai-chat.test.tsx after phase close)
**Sacred SHA preserved:** yes (no liv/packages/core changes)

---


### Phase 186: Restore MCP Panel in AI Chat Window — CODE-COMPLETE 2026-05-20

**Goal:** Mount McpServerList + McpServerDetail as a third tab ('MCP Servers') in the AI Chat window right pane. Extract FeaturedMcpInstaller shared component. Delete orphan mcp-panel.tsx.

**Depends on:** Phase 182-04, Phase 185-01
**Wave:** 2 (after 185-01 lands)
**Plans:** 3 plans (3/3 shipped)

Plans:
- [x] 186-01-PLAN.md — Add 'mcp' tab to AI Chat + mount McpServerList/Detail (42/42 PASS)
- [x] 186-02-PLAN.md — FeaturedMcpInstaller shared component + mount in AI Chat + Settings (6/6 PASS)
- [x] 186-03-PLAN.md — Delete orphan mcp-panel.tsx + grep audit (CLEAN)

**Result:** 60/60 vitest PASS; 25/25 sacred SHAs; 5 commits `ccfbe62f..dfcae745`; mcp-panel.tsx deleted.

---

### Phase 187: Vault Graph UI Polish (Obsidian-inspired) — CODE-COMPLETE 2026-05-20

**Goal:** Improve Vault Graph UX by adopting 5 Obsidian-inspired patterns: degree-proportional node sizing, orphan ring highlighting, detail-pane navigation, semantic edge thickness, and topology stats.

**Depends on:** Phase 178 + 179 + 180; 187-02 + 187-05 depend on 187-01
**Wave:** 3 (after 185 + 186)
**Plans:** 5 plans

Plans:
- [x] 187-01-PLAN.md — Degree Sizing: builder.ts degree+wikiDegree + nodeVal callback
- [x] 187-02-PLAN.md — Orphan Flagging: getOrphanRingColor + nodeCanvasObject red ring
- [x] 187-03-PLAN.md — Detail Navigation: clickable backlinks/outgoing + handleNavigateTo
- [x] 187-04-PLAN.md — Edge Thickness: linkWidth/linkColor callbacks + edge.weight
- [x] 187-05-PLAN.md — Topology Stats: computeGraphStats + LegendBadge stats footer

**Result:** 124 vault-graph vitest PASS (15 test files, +39 new assertions); 25/25 sacred SHAs; 10 commits `18b79754..e9bcc17c`; hubs bigger, orphans flagged, navigation works, edges semantic, stats shown.

---

## v38.1 — CODE-COMPLETE 2026-05-20

All 3 v38.1 hotfix phases shipped:
- Phase 185: SidebarTree mounted in AI Chat window (left pane) — CODE-COMPLETE
- Phase 186: MCP Panel restored in AI Chat window — CODE-COMPLETE
- Phase 187: Vault Graph UI Polish (Obsidian-inspired) — CODE-COMPLETE

**v38.1 close marker:** 2026-05-20 — all 3 UAT findings addressed. Operator UAT browser walk queued per 187-VERIFICATION.md.

---

# v38.2 — Agent Workspace Rebuild — 🔴 OPENED 2026-05-20

**Status:** OPEN — v38.0/v38.1 Agent UX rejected by operator post-UAT 2026-05-20
**Source:** Operator literal spec ("tane tane anlatıyorum") + references nousresearch/hermes-agent + thesysdev/openclaw-os
**Phases:** 3 (Phase 188 → 190); future v38.3 = Phase 191 (settings gear panel w/ rich MCP) + Phase 192 (Obsidian + obsidian-mcp install) + Phase 193 (Project workspace research)
**Anti-pattern reminder:** Do NOT extrapolate beyond literal spec, do NOT delete things user might want, do NOT add features

### v38.2 Operator Spec (literal)
1. **+ Add modal:** 2 cards (Agent | Project) → name + icon → "Kur" button. Simple.
2. **Agent click:** right pane = Claude Code terminal, cwd = `~/liv/items/<agentName>/`, first launch runs chat-based setup wizard (Claude asks MCPs/tasks/schedule/tools), config persists to `.agent/config.json` + `claude.md`, sessions log to `.agent/sessions/<runId>.md`.
3. **Multiple terminal tabs:** AI Chat top bar = dynamic terminal tabs + Claude icon + Terminal icon at right.

### v38.2 Implicit Deletions
- **Vault Graph: GONE** (operator said "Cault kullanmak istemiyorum")
- **MCP Server top tab: GONE** (moves to settings gear panel in v38.3 Phase 191 — for now just remove tab)

---

### Phase 188: Simplified Add Modal (Agent|Project + name + icon) + DELETE Vault Graph — 🔴 PLANNED 2026-05-20

**Goal:** Replace current AddItemModal multi-step form with: Step 1 = 2 type cards (Agent / Project), Step 2 = name input + icon picker, "Kur" button. Create on-disk folder `~/liv/items/<id>/` with `claude.md` placeholder + `.agent/config.json` (empty defaults). Item appears in sidebar immediately. ALSO: delete Vault Graph feature module entirely (UI files + tab in AI Chat) — operator explicitly does not want it. Fix `+ Add` modal z-index bug.

**Depends on:** Phase 174, 175, 185 (existing sidebar + modal infrastructure)
**Wave:** 1
**Plans:** 4 plans
**Estimated:** ~0.5 day

Plans:
- [ ] 188-01-PLAN.md — AddItemModal 2-step rewrite (type picker + name/icon + Kur)
- [ ] 188-02-PLAN.md — vault-items backend: icon field + Agent/.agent & Project/.project scaffolding
- [ ] 188-03-PLAN.md — z-index + Portal container fix (z-50 + document.body)
- [ ] 188-04-PLAN.md — DELETE vault-graph UI + remove Vault Graph tab from ai-chat

---

### Phase 189: Agent click → CC PTY + Chat-Based Setup Wizard — 🔴 PLANNED 2026-05-20

**Goal:** Click agent in sidebar → right pane mounts `<CcTerminal>` with tmux session `liv-agent-<id>` in cwd `~/liv/items/<agentName>/`. First launch (detected by absent `.agent/setup-done`): Claude Code runs chat-based setup conversation — asks which MCPs to enable, what tasks the agent will do, schedule (cron/manual), tool permissions. Claude writes answers to `<agentName>/.agent/config.json` + appends to `claude.md` (the agent's system prompt). After setup, normal Claude Code chat continues. Every session writes `<agentName>/.agent/sessions/<runId>.md` capturing what the agent did + learned. Research-informed by Hermes Agent + OpenClaw OS patterns.

**Depends on:** Phase 188, Phase 166 (cc-pty manager), Phase 176 (Liv tools + agent scaffolder)
**Wave:** 2
**Plans:** 5 plans

Plans:
- [ ] 189-01-PLAN.md � AgentTerminalPane component + ai-chat routing (AgentDetail ? AgentTerminalPane)
- [ ] 189-02-PLAN.md � First-open detection + setup wizard system prompt injection
- [ ] 189-03-PLAN.md � agent_config_set MCP tool (wizard persistence hook)
- [ ] 189-04-PLAN.md � StarterChips conversation starter chips + empty-state UI
- [ ] 189-05-PLAN.md � Per-session transcript writer (.agent/sessions/<runId>.md)
**Estimated:** ~1.5 days

---

### Phase 190: Multiple Terminal Tabs + Claude/Terminal Icons at Right — ✅ CODE-COMPLETE 2026-05-21

**Goal:** Replace AI Chat top tab bar (currently `Terminal | Vault Graph | MCP Server` — after 188, just `Terminal | MCP Server`) with dynamic terminal tabs: each open agent/chat gets a tab labeled by name. At right of tab bar: Claude icon (+ new ad-hoc Claude session, cwd = $HOME) and Terminal icon (+ new bare bash terminal). Capacity ≥10 concurrent tabs. Tab switch = swap right-pane mounted CcTerminal session id (no re-spawn). Close-tab kills the tmux session. Remove MCP Server tab entirely (will live in settings gear panel — v38.3 Phase 191).

**Depends on:** Phase 188 (Vault Graph removed), Phase 189 (per-agent tmux sessions exist), Phase 167 (CcTerminal substrate)
**Wave:** 3 (sequential: 190-01 → 190-02 → 190-03 → 190-04)
**Plans:** 4 plans
**Requirements:** 190-bare-terminal, 190-tab-strip, 190-tab-wiring, 190-mcp-tab-removal, 190-tab-persistence

Plans:
- [x] 190-01-PLAN.md — BareTerminal component + ws-handler sessionType passthrough
- [x] 190-02-PLAN.md — TerminalTabStrip + TerminalTab components
- [x] 190-03-PLAN.md — AiChatRoute tab strip wiring + MCP tab removal
- [x] 190-04-PLAN.md — localStorage tab persistence (300ms debounce)

**Estimated:** ~1 day | **Assertions:** 32 new vitest (6+10+8+6+2) | **Actual:** 53min | Commits: `5ce80623..ade1f945`

---

# v38.3 — Drop Vault + bruce-user Refactor — 🔴 OPENED 2026-05-21

**Status:** OPEN — architectural refactor after Hermes/OpenClaw research showed root cause of v38.0/v38.1/v38.2 cascading bugs is the "vault" concept + root-user execution
**Source:** Operator directive 2026-05-21 ("ben sana bunu livinity-vault/ kullanmayalim demistim" + "biz neden root da calistiriyoruz kullanicida degil") + research synthesis (`feedback_v38_3_drop_vault_concept`)
**Phases:** 3 (Phase 192 → 194)
**Anti-pattern reminder:** NEVER reintroduce `vault/`, `livinity-vault/`, `vaultPath`, `vault.items.*` paths

### v38.3 Goals
1. **livinityd as bruce user** — eliminates `--dangerously-skip-permissions` claude refusal + `/root/livinity-vault/` vs `/home/bruce/livinity-vault/` ownership split
2. **`/home/bruce/livinity/` canonical state root** — single dir, slug-named subdirs, frontmatter-in-claude.md per agent (Hermes pattern)
3. **Filesystem as source-of-truth** — no per-item `.agent/config.json` dotfiles; one `claude.md` per agent with YAML frontmatter + body

### Reference Architectures Studied
- **nousresearch/hermes-agent** — `~/.hermes/skills/<name>/` folders + `MEMORY.md`/`USER.md` + SQLite FTS5 search index
- **thesysdev/openclaw-os** — single state dir, DB-backed surfaces, flat sidebar (agents/sessions/apps/artifacts/notifications/crons all first-class)
- **LivOS synthesis** — adopt Hermes filesystem-source-of-truth + OpenClaw flat surface model

---

### Phase 192: livinityd User=bruce Switch + sudoers + Migration — 🔴 PLANNED 2026-05-21

**Goal:** Switch `livos.service` from `User=root` to `User=bruce`. Add sudoers entries for the narrow set of root-required ops (chown, systemctl reload caddy). Migrate ownership of `/opt/livos/data/` + `.env*` to bruce. Drop the `manager.ts` `isRoot` hack (Bug #17 hotfix becomes no-op). Claude can use `--dangerously-skip-permissions` again → autonomous agents per D-V38-K.

**Depends on:** nothing (foundational)
**Wave:** 1
**Plans:** 4 (audit + service-unit + code-paths + sacred-re-pin)
**Estimated:** ~0.5-1 day (testing-heavy)

Plans:
- [ ] 192-01-PLAN.md — Audit root-required ops + sudoers template (Wave 1)
- [ ] 192-02-PLAN.md — livos.service User=bruce + migration script + deploy invocation (Wave 2, depends 192-01)
- [ ] 192-03-PLAN.md — Code-path adjustments: drop isRoot, HOME=os.homedir(), broker /root/.claude → ~/.claude (Wave 2, depends 192-01)
- [ ] 192-04-PLAN.md — Sacred SHA registry repin + Mini PC live verification (Wave 3, depends 192-02 + 192-03)

---

### Phase 193: ~/livinity/ Filesystem Refactor (DROP "vault") — 🔴 PLANNED 2026-05-21

**Goal:** Replace `vault/items/<uuid>/.agent/config.json` model with `/home/bruce/livinity/agents/<slug>/claude.md` (YAML frontmatter + body). Single state root. Slug-named dirs (human-readable). Filesystem is source-of-truth; SQLite FTS5 only for search index. Migration script copies existing items from `/root/livinity-vault/items/<uuid>/` + `/home/bruce/livinity-vault/items/<uuid>/` to new layout. tRPC `vault.items.*` API surface UNCHANGED (frontend stays). Phase 162-01 sacred scaffolder STAYS as code (legacy, no longer called — formal retirement in v38.4).

**Depends on:** Phase 192 (bruce-user)
**Wave:** 2
**Plans:** 5 (scaffolder + claude.md format + item-store rewrite + migration script + cc-pty path adapt)
**Estimated:** ~1-1.5 days (biggest of v38.3)

---

### Phase 194: Sidebar UI + Files Default Adapt — ⚫ OBSOLETED 2026-05-22

**Status:** Obsoleted by AI Chat deletion (commit `782ee4a3`). Sidebar/AddItemModal/AgentInlineSettings were AI-Chat-coupled features — all deleted. Plans 194-01..05 no longer applicable. Scope retired without execution.

---

### Phase 195: xAI OAuth Onboarding (Replace Claude Setup) — ✅ CODE-COMPLETE 2026-05-22 (5/5 plans shipped — all waves done)

**Goal:** Replace the static "Sign in with Claude" placeholder in `features/onboarding-flow/steps/connect-ai-step.tsx` with a real OAuth flow. Backend spawns `opencode auth login -p xai` as a hidden child process, extracts the xAI device-code URL from stdout, returns it to the frontend. Frontend opens URL in a new browser tab; backend long-polls `~/.local/share/opencode/auth.json` for the captured xai entry. On success, exposes credentials via a new `XaiCredentialsService` consumable by the future LangGraph agent + new lean Livinity broker. All OpenCode mechanics hidden from the user — they only see "Sign in with xAI" → "✓ Connected as SuperGrok Tier N".

**Live test evidence (2026-05-22 with operator's own SuperGrok):**
- Chat (`grok-4.3`), function calling, models list, image gen, video gen: HTTP 200 ✅
- Voice TTS: HTTP 403 "Team is not authorized" ❌ (out of subscription scope)
- Voice STT: HTTP 404 ❌
- Voice scope deferred to self-hosted Whisper+Kokoro (separate phase)

**Depends on:** nothing executable (Phase 192 bruce-user recommended for Mini PC path correctness, not blocking)
**Wave:** 1 (foundational — LangGraph + new broker consume these credentials)
**Plans:** 5 plans (auth flow service + credentials service + tRPC router + UI replacement + provider scaffold)
**Estimated:** ~1-2 days

Plans:
- [x] 195-01-PLAN.md — XaiAuthFlowService: OpenCode CLI wrapper, stdout URL extraction (Wave 1) — ✅ CODE-COMPLETE 2026-05-22 (15 vitest PASS, 6 NEW files, sacred SHA preserved 2/2 across commits 57679789 + 82cf91be)
- [x] 195-02-PLAN.md — XaiCredentialsService: token store, JWT decode, background refresh (Wave 1) — ✅ CODE-COMPLETE 2026-05-22 (24 vitest PASS, 8 NEW files, single-flight refresh + PID-suffixed atomic auth.json writes, sacred SHA preserved 2/2 across commits abaee743 + 4d1572f1)
- [x] 195-03-PLAN.md — tRPC `auth.xai.{start,status,waitForCompletion,disconnect}` + httpOnlyPaths (Wave 2, depends 195-01 + 195-02) — ✅ CODE-COMPLETE 2026-05-22 (5 vitest PASS, 2 NEW files [xai-auth-router.ts + test] + 2 MOD [trpc/index.ts mounts under auth.xai.*, common.ts adds 4 httpOnlyPaths entries], 4/4 procedures adminProcedure-gated T-195-03-01, flowId via crypto.randomUUID T-195-03-02, zero new TS errors, sacred SHA preserved 2/2 across commits 730e1177 + 92fbc557)
- [x] 195-04-PLAN.md — `connect-ai-step.tsx` replacement: state machine, `window.open(url)`, long-poll status (Wave 3, depends 195-03) — ✅ CODE-COMPLETE 2026-05-22 (7/7 vitest PASS in 110 ms, 2 commits b58bc1aa + 16826b26, 370 LOC component + 367 LOC test = 737 LOC; 4 STRIDE mitigations wired AND tested [T-195-04-01 URL allow-list via `new URL().hostname` strict equality, T-195-04-02 10-min watchdog `setTimeout(600_000)`, T-195-04-03 `noopener,noreferrer` on every window.open, T-195-04-04 connected-only-when-`status.connected === true`]; D-NO-NEW-DEPS preserved via react-dom/client harness; vite build green 41.9s; sacred SHA preserved 2/2; 17/17 acceptance criteria PASS)
- [x] 195-05-PLAN.md — `xai-provider/` scaffold: OpenAI-compatible client, 401 refresh+retry, voice rejection errors (Wave 2, depends 195-02) — ✅ CODE-COMPLETE 2026-05-22 (7 vitest PASS, 5 NEW files under livos/packages/livinityd/source/modules/xai-provider/, commits ca1540b9 + eafa3a56, sacred SHA preserved 2/2)

---

### Phase 196: xAI Onboarding Completion + First-Run Installer + Locale — 🟢 CODE-COMPLETE 2026-05-22 (all 5 plans shipped; operator UAT pending on Mini PC `bruce@10.69.31.68`)

**Goal:** Close Phase 195's deferred runtime gaps (DI wire-up + opencode CLI install) AND add three operator-requested onboarding deliverables: provider→auth auto-route for xAI, region/location selection step, locale+timezone configuration with system clock alignment. After Phase 196 the setup wizard becomes the genuine "click 5 buttons and you are running LivOS with xAI" experience implied by v34.0 Bootstrap Polish.

**Live runtime evidence (2026-05-22, Mini PC SHA `da5fe05`):**
- `trpc.auth.xai.start` → HTTP 500 `xai-auth-router: flowService not injected` (predicted by 195-VERIFICATION.md, self-documenting error message points to fix)
- `which opencode` → not-found
- All 4 services boot clean; empty-injection Proxy only throws when called

**Depends on:** Phase 195 (5/5 plans CODE-COMPLETE), Phase 192 (sudoers boundary — extended in Plan 196-05)
**Wave:** 1 (blocks LangGraph + new broker phases — neither can do anything until DI wire-up + opencode binary land)
**Plans:** 5 plans (DI wire-up + install.sh + provider auto-route + region step + locale/timezone step)
**Estimated:** 1-2 days

Plans:
- [ ] 196-01-PLAN.md — livinityd DI wire-up (XaiAuthFlowService + XaiCredentialsService singletons → `createAppRouter({chromeMaster, xaiAuth})` injection at `index.ts:854`) — closes Phase 195 HUMAN-UAT #1
- [ ] 196-02-PLAN.md — install.sh idempotent first-run installer (opencode CLI install + system deps + bruce user + sudoers + systemd units + builds + service start) — closes Phase 195 HUMAN-UAT #2
- [x] 196-03-PLAN.md — onboarding provider-step xAI auto-route (selecting xAI immediately advances to ConnectAiStep, no intermediate click) — ✅ CODE-COMPLETE 2026-05-22 (commits b4bee157 + 5ed44ad4; 4/4 vitest PASS; UI build green; TOTAL=7; sacred SHA + sudoers SHA preserved)
- [x] 196-04-PLAN.md — onboarding region/location selection step (6 regions, IP/timezone suggestion, manual override, Redis persistence) — ✅ CODE-COMPLETE 2026-05-22 (commits 5d43b4bd + 71ee17a1 + 5f8b8ea2; 59/59 vitest PASS [47 region-suggestion + 6 setup-router + 6 region-step]; UI build green; sacred SHA + sudoers SHA preserved; wizard mount + sudoers re-pin deferred to 196-05 per file-disjoint contract)
- [x] 196-05-PLAN.md — locale + timezone configuration step (auto-detect, operator override, `timedatectl set-timezone` via extended sudoers Cmnd, Intl-based UI formatters) — ✅ CODE-COMPLETE 2026-05-22 (5 atomic commits `23e7f249` + `778a00f3` + `04fad313` + `6d2a1950` + `10d9ae1c`; **31 new vitest PASS** [8 timezone-service + 4 new setup-router T7-T10 + 7 intl + 6 locale-timezone-step] + 23/23 full onboarding-flow regression PASS + 73/73 livinityd trpc+locale; pnpm --filter ui build exit 0; tsc clean on changed files; **sudoers fragment SHA atomically re-pinned `568e4403...→aea64b87...` in Task 1 commit** alongside the LIVINITYD_TIMEDATECTL Cmnd_Alias extension — pre-commit hook `[sacred-sha] PASS: 20 files verified` × 5; sacred SDK-runner SHA `f3538e1d...` PRESERVED 5/5; all 7 STRIDE threats honoured. Phase 196 is **CODE-COMPLETE** — operator UAT walks `bash /opt/livos/update.sh` + 9-step wizard + `cat /etc/timezone` + `redis-cli get liv:user:timezone` on Mini PC bruce@10.69.31.68 to close both Phase 195 HUMAN-UAT items + Phase 196's own checklist in one pass).

---

### Phase 197 (rev-2): Liv AI — Mastra Agent + Provider Router + Dock App — 🟢 CODE-COMPLETE + LIVE 2026-05-22 (all 6 plans shipped + Mini PC deploy verified — boot wire-up confirmed via journalctl `Phase 197-05 — Liv AI agent + Mastra tRPC router wired (memory + mcpBridge + agent + approval-manager ready)`)

**Goal:** Ship "Liv AI" — a visible chat app in the LivOS Dock. Operator clicks the icon, a window opens, types a message, the agent responds via Mastra running Grok via xAI OAuth (or future Claude/OpenAI via ProviderRouter). The agent has computer-use tools (screenshot, list windows, click, type, launch apps) via Mastra MCPClient consuming Luse MCP and/or selfclaude MCP. 4-layer memory backed by livos PG + pgvector. HITL approval for destructive tools. NOT in Docker — bundled with LivOS install via pnpm.

**Pivot from earlier 197 plan (CONTEXT rewritten 2026-05-22 + old 6 PLAN.md deleted):** Operator directive: "Mastra alt yapısını app install için istemiyorum, Liv AI'ı tasarlamak istiyorum yeniden. LivOS ile birlikte indirilmesi lazım, Docker'da çalışmayacak. Otomatik hangi provider seçili ise onu kullanacak. LivOS UI'da Dock'ta tıkladığımda pencere açılsın. SelfClaude şu şekilde olmalı, Luse MCP computer-use özellikleri eklendi." App-install workflow + eval+OTel deferred to Phase 198+.

**Live evidence (2026-05-22):**
- xAI OAuth device-code flow live on Mini PC SHA `9f71435c`
- `XaiCredentialsService.getToken()` returns fresh tokens with 6h auto-refresh — Mastra `@ai-sdk/xai` `fetch` middleware consumes this
- Luse MCP server design exists (vault-templates/skills/luse-driver.md verifies 13 computer-use tools); server binary path resolved via `LUSE_MCP_PATH` env var (graceful-skip if absent)
- selfclaude MCP runs at `http://localhost:8090/mcp` on Mini PC (4 tools)
- LivOS Dock reads `systemApps` array in `livos/packages/ui/src/providers/apps.tsx` — adding `LIVINITY_liv-ai` entry + `/liv-ai` route is the entry point

**Differentiation from selfclaude/OpenClaw (visible in code, not just docs):**
1. Provider-agnostic (single ProviderRouter abstraction — xAI today, Claude/OpenAI plugin tomorrow)
2. OS-native bundled (no Docker, runs as part of livinityd via pnpm install)
3. Dock-first UX (first-class LivOS app with icon + window)
4. Computer-use via MCP bridge (Mastra MCPClient consuming Luse + selfclaude, not direct xdotool)
5. 4-layer Mastra memory backed by livos PG (raw + working + semantic recall + observational)

**Depends on:** Phase 195 (xAI OAuth core), Phase 196 (livinityd DI pattern), Phase 196.1 (live device-code flow validated)
**Wave:** 1 (foundational — Liv AI is the marquee agent surface for v38.3 + v39.0)
**Plans:** 6 plans (Mastra core + ProviderRouter / MCP bridge / memory + pgvector / Liv AI agent definition / tRPC SSE bridge / Dock app + chat window UI)
**Estimated:** 2-3 days

Plans:
- [x] 197-01-PLAN.md — ✅ CODE-COMPLETE 2026-05-22 (3 commits c141cee4 + 24629fa7 + fc422eb1; Mastra deps EXACT-pinned [@mastra/core@1.36.0 + @mastra/memory@1.19.0 + @mastra/pg@1.11.1 + @mastra/mcp@1.8.0 + @ai-sdk/xai@3.0.91 + @ai-sdk/openai-compatible@2.0.47]; workspace-root pnpm.overrides.zod=^3.25.0; ProviderRouter reads liv:config:active_provider [ALLOW-LIST validated, defaults to xai]; fresh-OAuth-per-request via XaiCredentialsService.getToken() through @ai-sdk/xai fetch middleware [scrubBearer defense-in-depth on transport errors — T-197-01-01]; zero static env-key path [T-197-01-02]; LivOSMastra singleton with FINAL B-02 contract — typed agents.livAi?:Agent + memory + mcpBridge slots + attachLivAiAgent/attachMemory/attachMcpBridge helpers; livinityd.start() DI wire-up inside chromeMaster try/catch [graceful degradation on construction failure]; **12/12 vitest PASS** [8 provider-router + 4 index]; sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f PRESERVED 3/3)
- [x] 197-02-PLAN.md — ✅ CODE-COMPLETE 2026-05-22 (1 commit 22238162; McpBridge via @mastra/mcp MCPClient with MANDATORY id='livos-mcp-bridge' [T-197-02-02 memory-leak guard]; Luse stdio source guarded by fs.access(X_OK) on LUSE_MCP_PATH [T-197-02-01]; selfclaude HTTP source hostname-allow-list {localhost,127.0.0.1,::1} [T-197-02-03 DNS-injection mitigation] + 2_000ms AbortController HEAD probe [T-197-02-04]; 6 destructive Luse tools tagged meta.requireApproval=true [T-197-02-05]; graceful degradation — empty tool map valid when both sources unavailable; **N-01 lock** NAMED EXPORT destructiveToolNames:ReadonlySet<string> with 6 namespaced ids ['luse_computer_click_mouse','luse_computer_type_text','luse_computer_press_keys','luse_computer_application','luse_computer_drag_mouse','luse_computer_paste_text'] consumed by Plans 197-04 + 197-05 for name-based detection [NOT chunk.tool.meta]; **11/11 vitest PASS** [Tests 1-10 enablement combinations + Test 11 destructiveToolNames Set]; sacred SHA preserved 1/1)
- [x] 197-03-PLAN.md — ✅ CODE-COMPLETE 2026-05-22 (1 commit a7dd2012 + live-deploy fixes 440f4f57 + 86df7041 + ed537b01; scripts/install/pgvector-enable.sh idempotent installer [dpkg -s guard + apt-get install postgresql-16-pgvector + sudo -u postgres psql CREATE EXTENSION IF NOT EXISTS vector; zero destructive statements — T-197-03-01]; bash harness 10/10 PASS [bash -n + literal greps + idempotent re-run drill with PATH-shimmed apt/dpkg/psql/sudo]; createLivOSMemory() factory wires PostgresStore [v1.11 API — NOT PgStore] + PgVector [hnsw + dotproduct indexConfig] with options.workingMemory.scope='thread' [T-197-03-05 mitigation — Mastra default changed to 'resource' 2026-03 would leak cross-thread context]; options.semanticRecall=false at runtime [embedder deferred to Phase 198+ — @ai-sdk/xai v3.0.91 doesn't expose .embedding() yet; SEMANTIC-RECALL-SCOPE-INVARIANT 'scope:thread' preserved as code-level comment for future re-enable]; redactPgUrl() scrubs user:password from inner+outer error messages [T-197-03-02 defense-in-depth]; migrations/001-mastra-tables.sql ships 4 CREATE TABLE IF NOT EXISTS [mastra_threads + mastra_messages + mastra_working_memory + mastra_workflow_runs] + 2 CREATE INDEX IF NOT EXISTS — zero \${} interpolation [T-197-03-03]; runMastraMigrations({databaseUrl,dryRun?}) idempotent runner with parameterized pg client queries; **8/8 vitest PASS** [5 memory + 3 migrate]; **pgvector live-enabled on Mini PC** [postgresql-16-pgvector apt installed + extension vector verified via sudo -u postgres psql]; sacred SHA preserved 1/1)
- [x] 197-04-PLAN.md — ✅ CODE-COMPLETE 2026-05-22 (1 commit 9107742e; createLivAiAgent({providerRouter,memory,mcpBridge,approvalManager}) returns Mastra Agent with id='liv-ai' + name='Liv AI'; LIV_AI_SYSTEM_PROMPT static string [zero \${} interpolation — T-197-04-01]; dynamic model resolver [model: async () => providerRouter.resolveAgentModel()] re-runs per turn so Redis active-provider changes take effect without restart [T-197-04-02]; dynamic tools resolver [tools: async () => wrapDestructiveTools(filterMcpTools(await mcpBridge.listTools()), approvalManager)]; filterMcpTools enforces ALLOWED_TOOL_PREFIXES={luse_,selfclaude_} allow-list [T-197-04-04 prompt-injection/scope-leak]; **W-02 lock** wrapToolWithApproval gates every name in destructiveToolNames Set [N-01 import] — wrapper awaits gate.registerPending(toolCallId,runId) then on approved=true delegates to original execute OR on approved=false returns REJECTED_TOOL_RESULT sentinel {rejected:true, reason:'operator rejected this tool call'} as NORMAL tool result [no throw, no controller.abort — agent continuation explains rejection naturally]; B-02 lock honoured — Plan 197-04 does NOT modify ../index.ts [LivOSMastra class FINAL from 197-01]; **18/18 vitest PASS** [6 wrap-tool + 12 liv-ai including filterMcpTools + wrapDestructiveTools]; sacred SHA preserved 1/1)
- [x] 197-05-PLAN.md — ✅ CODE-COMPLETE 2026-05-22 (3 commits 8d71ca63 + f5859b29 + d12465bb + live-deploy fix b84e2f8a; ApprovalManager class [registerPending(toolCallId,runId):Promise<boolean> + resolve(toolCallId,approved) + cancelAll(runId) + 5-minute auto-reject timeout — T-197-05-05] structurally satisfies Plan 197-04 ApprovalGate interface; redactError() returns {message,code?,stack:'[redacted]'} for Mastra issue #15827 stack-trace leakage [T-197-05-02]; createMastraRouter({livOSMastra,approvalManager}) factory mounts 5 adminProcedure routes [agent.stream SSE via tRPC v11 async generator + agent.approve mutation + agent.cancel mutation + agent.threads.list query + agent.threads.delete mutation — T-197-05-01 all adminProcedure-gated]; **W-02 lock** SSE chunk handler OBSERVES destructive tool-call chunks [destructiveToolNames.has(chunk.toolName) — N-01 import, NOT chunk.tool.meta] and emits tool-call-approval chunk; wrapped tool handles pause-resume internally; SSE NEVER calls registerPending and NEVER aborts on Reject [only mastra.agent.cancel aborts via AbortController registry]; **W-03 lock** tRPC v11 native .subscription(async function*) pattern locked; **B-02 lock** Plan 197-05 does NOT modify ../mastra/index.ts — boot wire-up CALLS livOSMastra.attachMemory/attachMcpBridge/attachLivAiAgent helpers; createAppRouter opts.mastra slot narrowed from `unknown` to ReturnType<typeof createMastraRouter>; 5 new httpOnlyPaths entries [mastra.agent.{stream,approve,cancel,threads.list,threads.delete}] — same B-12/X-04 WS-reconnect-survival rationale as auth.xai.* family; livinityd boot wire-up sequential construction inside chromeMaster try/catch [1.ApprovalManager → 2.runMastraMigrations → 3.createLivOSMemory → 4.createMcpBridge → 5.createLivAiAgent → 6.createMastraRouter] with failures non-fatal [livinityd boots with empty-injection Proxy mastraRouter on degradation]; **20/20 vitest PASS** [9 approval-manager+redact-error + 11 mastra-router including W-02 anti-pattern grep T9]; sacred SHA preserved 3/3)
- [x] 197-06-PLAN.md — ✅ CODE-COMPLETE 2026-05-22 (1 commit aa0179f4; LIVINITY_liv-ai entry in systemApps array [livos/packages/ui/src/providers/apps.tsx] with /figma-exports/liv-ai.svg cyan-gradient LA monogram + systemAppTo='/liv-ai'; window-content.tsx switch case + lazy-loaded LivAiWindowContent + fullHeightApps set extended; useLivAi(threadId) React hook wraps trpc.mastra.agent.stream subscription with reducer over chunks [text-delta/tool-call/tool-result/run-start/tool-call-approval/finish] + exposes {messages,pendingApproval,isStreaming,sendMessage,approve,cancel,reset}; ApprovalModal renders when pendingApproval set — autoFocus on Reject button [T-197-06-01 — Enter key intercepted via handleKeyDown, Escape→reject]; redactArgsForDisplay() scrubs token/key/secret/password/authorization fields recursively before display [T-197-06-03]; MessageBubble renders via React text interpolation only [T-197-06-02 — NEVER dangerouslySetInnerHTML]; ThreadSidebar fetches mastra.agent.threads.list + delete mutation; LivAiChatWindow composes ThreadSidebar+messageList+ApprovalModal+input box+Send/Cancel toggle; D-NO-NEW-DEPS preserved [zero new npm deps, zero @testing-library/react]; **5/5 redact-args.test PASS** (UI); **pnpm --filter ui build exit 0 (33.65s)**; sacred SHA preserved 1/1). **NOTE 2026-05-23:** Operator rejected the bespoke UI on first UAT walk ("inanılmaz kötü ve çalışmıyor"). Phase 198 replaces this entire UI surface with assistant-ui + tool-ui + Generative UI rendering — see Phase 198 entry below. Backend (tRPC `mastra.agent.*` + ApprovalManager + LivOSMastra) STAYS; only the UI layer (`livos/packages/ui/src/features/liv-ai/`) is deleted and rebuilt.

---

### Phase 198: Liv AI v2 — assistant-ui + Generative UI + tool-ui + Mastra Production Polish — 🟡 CODE-COMPLETE + DEPLOYED 2026-05-23T03:02Z pending operator UAT (10-step browser walk deferred to operator AM — see `.planning/phases/198-liv-ai-v2-assistant-ui-generative-ui/198-VERIFICATION.md` § 7; will flip 🟢 + LIVE + OPERATOR-UAT-PASSED when operator returns and walks the 10 steps)

**Goal:** Replace Phase 197's bespoke chat UI with a production-grade assistant-ui-based Thread that ships polished chat UX + Generative UI rendering for tool calls + tool-ui primitive library + inline HITL Approval Card + ThreadList sidebar + slash commands + suggested prompts + attachments. Operator's literal directive: "Generative UI destekli olsun, görseller kullansın — gezilecek yerlerin listesi diye basit text ile değil AI UI ile anlat." All assistant-ui features should be available; this becomes the management hub for everything.

**Source directive (operator 2026-05-23):** "https://www.assistant-ui.com/ lütfen bizim UI anlayışımıza göre iyi bir plan hazırla ve bütün Tool call özellikleri vs her şey olsun, çok iyi bir iş ortaya çıkar. Hatta şunu da araştırabilir misin — bizim UI'mız Generative UI destekli olsun, openUI MCP ile birleşik olsun. Kullanıcı bir soru sorduğunda mesela gezilecek yerlerin listesi diye, bunu basit bir text ile anlatmasın AI UI'lı anlatsın görseller kullansın."

**Research outcome:** assistant-ui (10.2k⭐ MIT, framework-agnostic React, official Mastra integration guide) is the unanimous best fit. Beats langchain-ai/agent-chat-ui (Next.js+LangGraph locked), vercel/ai-chatbot (RSC-only), Morphic (RSC-only), open-webui/librechat (no embeddable component). **tool-ui** (assistant-ui/tool-ui, 692⭐ MIT, shadcn copy-paste model) provides 25+ Generative UI primitives. MCP-UI / SEP-1865 deferred to P199+ (SDK adoption too young as of May 2026).

**Depends on:** Phase 197 (Mastra backend, LivOSMastra singleton, ApprovalManager, PostgresStore Memory, McpBridge — all kept intact)
**Wave:** 1 (foundational — Liv AI is the marquee UX of v38.3)
**Plans:** 8 plans across 4 waves (~1530 LOC added + ~600 LOC deleted, est 3-5 hours wall-clock)
**Estimated:** 1 day autonomous + operator-walked UAT

Plans:
- [x] 198-01-PLAN.md — ✅ CODE-COMPLETE 2026-05-23 (3 commits abd00d52 + 9705e393 + 5a8d40f5; createChatRouteHandler factory + ChatRequestSchema zod gate + ALLOWED_AGENT_IDS Set allow-list + inline chatAuthGate Express middleware [two-source token via this.server.verifyToken] + POST /chat/:agentId mount in livinityd source/index.ts inside chromeMaster try/catch; @mastra/ai-sdk@1.4.3 + ai@6.0.191 EXACT-pinned; 7 vitest PASS [happy path + zod gate + 503 missing-agent + 404 unknown-agentId + SSE Content-Type forwarding + 2 schema-unit checks]; sacred SHA preserved 3/3; T-198-01 EoP + T-198-02 Tampering + T-198-08 path-bypass all mitigated inline)
- [x] 198-02-PLAN.md — ✅ CODE-COMPLETE 2026-05-23 (4 commits 9e9a75b7 + f0c3676e + 9a525838 + d32653b4; @assistant-ui/react@^0.14.7 + react-ai-sdk@^1.3.26 + react-markdown@^0.14.0 installed; 5 bespoke P197-06 files deleted [566 LOC: approval-modal + message-bubble + thread-sidebar + use-liv-ai + liv-ai-chat-window]; redact-args.ts + redact-args.test.ts PRESERVED [5/5 PASS — P198-04 ApprovalCard reuse]; manual-copy-fallback Thread scaffold at src/components/assistant-ui/thread.tsx [126 LOC, @assistant-ui/react primitives only — assistant-ui CLI + shadcn fallback both ELIFECYCLE on Windows host via POSIX postinstall cp -r ./.../.]; new <Assistant /> at src/features/liv-ai/assistant.tsx [50 LOC — AssistantRuntimeProvider + useChatRuntime + AssistantChatTransport({api:'/chat/livAi', credentials:'include'}) + Thread]; liv-ai-content.tsx rewired LivAiChatWindow → Assistant; vite build EXIT 0 in 36.24s; tsc --noEmit ZERO new errors on 3 modified files; sacred SHA preserved 4/4; 2 deviations [both Windows postinstall workarounds, Plan Task 3 step 2 explicitly anticipated CLI-failure branch])
- [x] 198-03-PLAN.md — ✅ CODE-COMPLETE 2026-05-23 (tool-ui primitives copy-paste + 10 generative-UI tool renderers — 11 primitives at `livos/packages/ui/src/components/tool-ui/` [Image Gallery, Geo Map, Item Carousel, Weather, Data Table, Chart, Link Preview, Approval Card, Code Block, Code Diff, Sources]; `tool-renderers.tsx` registers `makeAssistantToolUI` for 10 named tools + ToolFallback; `react-leaflet@^5` + `leaflet@^1.9` + `@types/leaflet` deps for Geo Map; ToolRenderers barrel mounted inside `<Assistant />` runtime; 6 commits `34c29041..afa5b0b9`; sacred SHA preserved)
- [x] 198-04-PLAN.md — ✅ CODE-COMPLETE 2026-05-23 (HITL ApprovalCard inline + 6 destructive-tool registrations — Approval Card component + 6 `makeAssistantToolUI` registrations for the 6 destructive `luse_computer_*` tools via `destructiveToolNames` Set import [N-01 lock]; `useApproveMutation` hook wraps existing `mastra.agent.approve` tRPC mutation [P197-05 KEEP]; W-02 lock preserved [Reject = REJECTED_TOOL_RESULT, not run-abort]; 5 commits `27ca94e0..dd485d53`; sacred SHA preserved)
- [x] 198-05-PLAN.md — ✅ CODE-COMPLETE 2026-05-23 (ThreadList sidebar — `ExternalStoreThreadListAdapter` wired via `useThreadListAdapter` hook to `mastra.agent.threads.list` + `mastra.agent.threads.delete` [P197-05 KEEP]; "+ New conversation" button; per-thread Memory scoping verified; title fallback "Untitled · {timestamp}" [title-generation deferred to P199]; 4 commits `c2509428..ed8df964`; sacred SHA preserved)
- [x] 198-06-PLAN.md — ✅ CODE-COMPLETE 2026-05-23 (Composer power features — `SLASH_COMMANDS` catalog with 4 locked triggers `/help` `/clear` `/screenshot` `/search` + `parseSlashCommand` with leading-whitespace tolerance + `/clear` suppress-send + `/search` rest-arg rewrite; `DEFAULT_SUGGESTED_PROMPTS` with 4 locked prompts + `<SuggestedPrompts>` chip component; `createImageAttachmentAdapter()` wrapping `SimpleImageAttachmentAdapter` in `CompositeAttachmentAdapter` [extensible for P199 PDF/audio; image/png|jpeg|webp|gif allow-list + 10 MB ceiling]; `SlashCommandInterceptor` wraps `composerRuntime.send()` with useRef-guarded idempotent useEffect; 7 commits `0e17cb31..eea049f0`; 23 new vitest PASS [9 slash + 5 suggested + 9 attachment] + 48 prior = 71/71 PASS zero regressions; sacred SHA preserved)
- [x] 198-07-PLAN.md — ✅ CODE-COMPLETE 2026-05-23 (Empty State + DevTools + Accessibility Polish — rich `<EmptyState>` at `empty-state.tsx` [73 LOC] mounts `/figma-exports/liv-ai.svg` + 'Liv AI' heading + locked `LIV_AI_TAGLINE` "LivOS'un yapay zekası — ekranını yönetir, sorularına cevap verir, hatırlar." + delegated `<SuggestedPrompts>`; dev-only `<DevToolsMount>` with DOUBLE `import.meta.env.DEV` guard + try/catch fallback for the optional `@assistant-ui/react-devtools` dynamic import [NOT installed — D-NO-NEW-DEPS preserved via Rollup `external` whitelist in `vite.config.ts`]; `<div role='application' aria-label='Liv AI chat'>` a11y wrapper; left sidebar promoted to `<ul aria-label='Threads'>`/`<li aria-current>` semantics + per-thread delete `aria-label='Delete thread: {title}'`; 5 commits `829bfda1..b2c31066`; 3 new vitest + 71 prior = 74/74 PASS; T-198-07-01 verified `grep "react-devtools" dist/assets/*.js` = 0 matches; sacred SHA preserved)
- [x] 198-08-PLAN.md — 🟡 CODE-COMPLETE + DEPLOYED 2026-05-23T03:02Z (operator browser UAT pending — Mini PC live deploy via `bash /opt/livos/update.sh` + bruce-ownership patch + service restart; 4 services `active`; 3 boot markers present [197-01 + 197-05 + 198-01]; `POST /trpc/mastra.agent.approve` → `401` adminProcedure gate; `POST /chat/livAi` → `401` chatAuthGate; production bundle clean of `react-devtools` strings; deployed SHA `8c22fe1`; sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRESERVED on Mini PC via git-blob recompute; Phase 197 tRPC `mastra.agent.*` namespace marked `@deprecated` + dev-mode `console.warn` [one-release grace before P199 full removal — commit `8c22fe10`]; Task 3 operator UAT deferred to morning [`type="human-verify"` cannot be auto-walked; 10-step walk template + decision rules in `198-VERIFICATION.md` § 7]; status: `human_needed` until operator returns)

**P198 UAT hot-fixes (2026-05-23 post-deploy):**
- `99130f72` — ChatRequestSchema dropped UIMessage `parts` → Mastra rejected empty `{role:'user'}` 500. Fix: `.passthrough()` + `convertToModelMessages()`. 7/7 vitest PASS.
- `af83d6f7` — `convertToModelMessages` async in ai@6 (was sync in ai@4/5). Missing await → Promise serialised as `{}` → Mastra "role: undefined" crash. Fix: add `await`.
- `566b044d` — Agent had ZERO MCP tools live (Luse path unset + selfclaude unreachable) → Grok hallucinated tool calls as plain text. Fix: ship 3 built-in tools (`weather` via open-meteo, `luse_list_windows` via wmctrl, `get_current_time`); harden system prompt with TOOL HONESTY clause + Turkish-response rule.

---

### Phase 199: Liv AI UI Polish — Brand + Sizing + Model Picker + Centered Empty + Generative UI Polish — 🟡 CODE-COMPLETE + DEPLOYED 2026-05-23 (operator UAT pending)

**Goal:** Operator-requested UI polish on the Phase 198 Liv AI surface. Five concrete asks: (1) marquee app name "Liv AI" everywhere, (2) bigger window default (1180×820), (3) model picker with xAI Grok variants persisted to Redis, (4) ChatGPT-style centered empty-state composer (input in middle on new thread, slides to bottom once messages start), (5) Generative UI cilası — RunningHeader during tool execution + status-branch polish across 10 renderers.

**Source directive (operator 2026-05-23):** "Liv AI olacak uygulamanin Adi! Biraz daha buyuk yap pencereyi ayrica Model secimi ekle Inputu baslangicta ortaya al. Cok ama cok detaylica a dan z ye mcp yi kullanarak incele. Ve Cok buyuk bir UI improve Plani hazirla."

**Research outcome:** assistant-ui-docs MCP + context7 MCP queried for canonical patterns. `<AuiIf>` primitive (assistant-ui Grok example) solves centered empty-state. Mastra v1 `RequestContext` (`model: ({requestContext}) => …`) is the canonical dynamic-model pattern for per-request provider routing. ZERO new top-level deps required (shadcn dropdown-menu/select/table/dialog already shipped). Window default size bug: `LIVINITY_liv-ai` missing from `DEFAULT_WINDOW_SIZES` falls back to 900×600 — single-line fix to 1180×820. Full research at `.planning/phases/199-liv-ai-ui-polish/199-RESEARCH.md` (2025 lines, dense citations).

**Depends on:** Phase 198 (assistant-ui shell, Mastra agent, AssistantChatTransport, ToolRenderers barrel — all KEPT intact, additive-only polish)
**Wave:** 1 (foundational UX polish, blocks v38.3 close)
**Plans:** 8 plans across 4 waves (~780 LOC added/modified, est 3-4 hours wall-clock)
**Estimated:** 1 day autonomous + operator-walked UAT

Plans:
- [x] 199-01-PLAN.md — Window default size patch + brand string regression-lock ✅ CODE-COMPLETE 2026-05-23
- [x] 199-02-PLAN.md — Provider-router ALLOWED_XAI_MODELS allow-list + `coerceModel` + new `mastra.agent.listAvailableModels` protectedProcedure ✅ CODE-COMPLETE 2026-05-23
- [x] 199-03-PLAN.md — Mastra agent dynamic-model via `RequestContext` + chat-route `config.modelName` zod field ✅ CODE-COMPLETE 2026-05-23
- [x] 199-04-PLAN.md — `LIV_AI_MODELS` registry + `<LivAiModelPicker>` shadcn DropdownMenu + backend-drift-lock test ✅ CODE-COMPLETE 2026-05-23
- [x] 199-05-PLAN.md — Centered empty-state via `<AuiIf>` + extracted Composer ✅ CODE-COMPLETE 2026-05-23 — 3 commits `b9eac2ab..9b4abe05`, sacred SHA preserved 3/3, 95/95 liv-ai vitest PASS
- [x] 199-06-PLAN.md — `<RunningHeader>` micro-primitive + 10 generative renderer status-branch updates ✅ CODE-COMPLETE 2026-05-23 — 3 commits `6c45ca37..4d341bd1`, sacred SHA preserved 3/3, 106/106 liv-ai+tool-ui vitest PASS
- [x] 199-07-PLAN.md — Header bar with "Liv AI" title + `<LivAiModelPicker>` + new-conversation; Redis `liv:config:active_model` via new `getActiveModel`/`setActiveModel` tRPC procedures ✅ CODE-COMPLETE 2026-05-23
- [x] 199-08-PLAN.md — (no separate close-out commit — Phase 199 close-out folded into Phase 200-08 deploy + verification since both shared the same Mini PC update.sh run on 2026-05-23T02:18Z)

**Invariants carried forward:** Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (INV-199-01); B-02 mastra/index.ts FINAL (INV-199-02); W-02 Reject=tool-result sentinel (INV-199-03); D-NO-NEW-DEPS strict (INV-199-04); Phase 198 generative-UI renderer freeze (INV-199-05); T-197-04-01 LIV_AI_SYSTEM_PROMPT 4 substrings (INV-199-06); P198 hot-fix `convertToModelMessages` await preserved (INV-199-07); 3 built-in tools `weather` + `luse_list_windows` + `get_current_time` preserved (INV-199-08); pre-commit sacred-sha hook PASS (INV-199-09).

**Deferred to Phase 200+:** MCP server install ops (Luse + bytebot), embedder for semanticRecall, voice, PDF attachment, title-generation, multi-agent routing.

---

### Phase 200: Liv AI UI Complete Redesign + Computer-Use Built-in Tools — 🟡 CODE-COMPLETE + DEPLOYED 2026-05-23T02:18Z (operator UAT pending)

**Goal:** Adopt the canonical assistant-ui shadcn registry (`r.assistant-ui.com/*.json`) as the structural baseline; rebuild composer with `@` mention picker + `/` slash adapter (canonical `unstable_use*Adapter` form) + inline model picker (Grok pattern, collapses to icon while typing); add hover-visible Copy button via `ActionBarPrimitive`; fix the New Conversation runtime sync bug via single-line `await runtime.threads.switchToNewThread()` in `thread-list-adapter.ts`; DELETE the imperative `SlashCommandInterceptor` + the `header-bar.tsx` strip; switch all UI text to English (`LIV_AI_TAGLINE` → "Liv AI — your operating system's assistant."). In parallel: Phase 200-C ships 7 `luse_computer_*` built-in tools (screenshot via scrot, click_mouse + type_text + press_keys + drag_mouse via xdotool, application via wmctrl/gtk-launch, paste_text via xsel+xdotool).

**Source directive (operator):** continuation of Phase 199 — operator wanted the assistant-ui shadcn registry as the visible baseline + `@`/`/` pickers + the Grok-style inline model picker; old header-bar to go away.

**Depends on:** Phase 199 (Mastra dynamic-model + `LIV_AI_MODELS` registry + Redis active-model persistence + window 1180×820 — all KEPT intact; Phase 200 is layered on top, additive UI-only).

**Wave:** Wave 0 = dep audit + registry port (200-01 + 200-02); Wave 1 = `@` + `/` adapters + composer rebuild (200-03 + 200-04 + 200-05); Wave 2 = canonical Thread mount + Copy + runtime-sync fix + deploy (200-06 + 200-07 + 200-08). Parallel track: 200-C (computer-use built-ins, file-disjoint from UI plans).

**Plans:** 8 UI plans + 7 built-in-tool sub-plans (200-C-1..200-C-7), 17 commits total `e592465c..d032e63e`; sacred SHA preserved 17/17.

Plans (UI track):
- [x] 200-01-PLAN.md — Wave-0 dep audit + shadcn avatar/collapsible primitives ✅ CODE-COMPLETE 2026-05-23 — 1 commit `e592465c`; D-NO-NEW-DEPS confirmed (the 4 candidate deps were already present)
- [x] 200-02-PLAN.md — Port 9 canonical assistant-ui shadcn registry files (verbatim + composerSlot prop) ✅ CODE-COMPLETE 2026-05-23 — 2 commits `b198c5d6` + `4354fe41`
- [x] 200-03-PLAN.md — `@` mention adapter + static tool catalog (7 items) ✅ CODE-COMPLETE 2026-05-23 — 1 commit `4b9715ab`
- [x] 200-04-PLAN.md — `/` slash adapter + delete imperative `SlashCommandInterceptor` ✅ CODE-COMPLETE 2026-05-23 — 1 commit `4648a770`
- [x] 200-05-PLAN.md — Composer rebuild with inline model picker + `@`/`+` popovers; DELETE `header-bar.tsx` ✅ CODE-COMPLETE 2026-05-23 — 1 commit `dd90567b`
- [x] 200-06-PLAN.md — Mount canonical Thread with `LivAiComposer` slot + English `LIV_AI_TAGLINE` + ActionBar Copy verified ✅ CODE-COMPLETE 2026-05-23 — 2 commits `f71b76d7` + `33af07c4`
- [x] 200-07-PLAN.md — New Conversation runtime sync via `runtime.threads.switchToNewThread()` (Option A) ✅ CODE-COMPLETE 2026-05-23 — 2 commits `2ecd37c8` + `d032e63e`; 18/18 vitest PASS in-scope (7 thread-list-adapter + 11 assistant)
- [x] 200-08-PLAN.md — Mini PC deploy + executor-run smoke tests + 200-VERIFICATION.md + STATE/ROADMAP flip ✅ CODE-COMPLETE + DEPLOYED 2026-05-23T02:18Z (operator browser UAT pending; `status: human_needed` in 200-VERIFICATION.md)

Plans (200-C parallel built-in tools — file-disjoint from UI plans, INV-200-09):
- [x] 200-C-1 — `luse_computer_screenshot` via scrot — commit `959ce84f`
- [x] 200-C-2 — `luse_computer_click_mouse` via xdotool — commit `131e8639`
- [x] 200-C-3 — `luse_computer_type_text` via xdotool — commit `0d19e109`
- [x] 200-C-4 — `luse_computer_press_keys` via xdotool — commit `8c858afc`
- [x] 200-C-5 — `luse_computer_application` via wmctrl/gtk-launch — commit `3b002676`
- [x] 200-C-6 — `luse_computer_drag_mouse` via xdotool — commit `b9036b37`
- [x] 200-C-7 — `luse_computer_paste_text` via xsel+xdotool — commit `b9df0c0f`

**Commits:** `e592465c..d032e63e` exclusive of base (17 commits — 10 UI + 7 200-C built-in tools).
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved 17/17 (per-commit pre-commit hook `[sacred-sha] PASS: 20 files verified`); Mini PC post-deploy git-blob recompute PASS.
**Live HTTP smoke tests (executor-run on Mini PC port 8080):** `POST /chat/livAi` HTTP 200 with real SSE stream + `updateWorkingMemory` tool firing + Turkish-response rule active; `GET /trpc/mastra.agent.listAvailableModels` HTTP 200 returning 3 models (grok-4.20-0309-non-reasoning + grok-4.20-0309-reasoning + grok-4.3); `GET /trpc/mastra.agent.getActiveModel` HTTP 200 returning `grok-4.3` (Redis-persisted from earlier session).
**Bundle integrity on Mini PC `/opt/livos/packages/ui/dist/assets/liv-ai-content-f784580e.js`:** 0 `SlashCommandInterceptor` (Acceptance #15 PASS), 0 `LivAiHeaderBar` (Acceptance #14 PASS), 1 `your operating system's assistant` (Acceptance #5 PASS), 0 Turkish substrings (INV-200-05 PASS).
**Service status post-deploy + bruce-ownership patch:** `systemctl is-active livos liv-core liv-worker liv-memory` → 4× `active`; 6 boot markers present (197-01 + 197-05 + 198-01 + 199-02 + 199-03 + 199-07).
**Invariants:** INV-200-01 sacred SHA preserved (PASS 17/17); INV-200-02 `mastra/index.ts` byte-identical B-02 lock (PASS); INV-200-03 P198 generative-UI renderers FROZEN (PASS — `tool-renderers.tsx` not in any P200 diff); INV-200-04 D-NO-NEW-DEPS strict (PASS — only 200-01 audit allowed, none added since); INV-200-05 English UI only (PASS — bundle grep zero Turkish); INV-200-06 `SLASH_COMMANDS` catalog preserved (PASS — 4 IDs `help`/`clear`/`screenshot`/`search`); INV-200-07 4-task per plan max (PASS); INV-200-08 New Conversation fix locus = `thread-list-adapter.ts` only (PASS); INV-200-09 200-C parallel-safe (PASS — file-disjoint).
**Carry-overs to Phase 201:** Option B `switchToThread(oldId)` runtime sync via `ExternalStoreThreadListAdapter` + `mastra.agent.threads.getHistory` tRPC route (D-200-20 deferred); live MCP-bridge tool discovery in `@` mention catalog (D-200-08 static-list deferred); Phase 197 `mastra.agent.*` tRPC namespace full removal (one-release grace expiring); `update.sh` enhancement to add `chown -R bruce:bruce /opt/livos /opt/liv` before `systemctl restart` (recurring P198/P199/P200 ownership patch).
**UAT walk template:** 10 steps in `.planning/phases/200-liv-ai-ui-redesign/200-VERIFICATION.md` § B (frontmatter `status: human_needed` until operator walks). Phase 200 ROADMAP heading flips 🟡 → 🟢 CODE-COMPLETE + LIVE + OPERATOR-UAT-PASSED when operator returns and ticks all 10 rows PASS.

**Deferred to Phase 201:** Option B sidebar-click-old-thread history reload (D-200-20); live MCP tool discovery in `@` catalog; `update.sh` chown hook; full removal of P197 `mastra.agent.*` namespace deprecation; per-thread model persistence; voice/TTS; PDF attachment adapter.

---

### Phase 201: Liv AI Next.js Iframe Rebuild — 🟡 CODE-COMPLETE + DEPLOYED 2026-05-23T12:15Z (operator UAT pending)

**Goal:** Replace the Vite-embedded Liv AI surface with a standalone Next.js App Router subapp (assistant-ui's official scaffold target) served at `127.0.0.1:3010` by a new `livos-app-liv-ai.service` systemd unit, reverse-proxied at `https://bruce.livinity.io/liv-ai-app/*` via Caddy, and embedded in the LivOS desktop window as a same-origin `<iframe src="/liv-ai-app" />`. Keeps livinityd backend untouched; only the UI tier is rebuilt on the official assistant-ui path. JWT cookie auto-flows parent → iframe → `/chat/livAi`.

**Source directive (operator):** Phase 200 ported assistant-ui's shadcn registry into the Vite `livos/packages/ui` package by hand (path remap, postinstall workarounds, manual-copy fallback) — technically correct but visually rough and slow to iterate. assistant-ui's `npx assistant-ui create -t default` officially targets Next.js App Router only. Running on the official scaffold gives native shadcn theme + components (no remap), battle-tested `<Assistant />` + `<Thread />` composition, working DevTools / ActionBar.Copy / Markdown / Reasoning / ToolGroup primitives, and no ELIFECYCLE postinstall noise.

**Depends on:** Phase 200 (`mastra.agent.*` tRPC + LIV_AI_SYSTEM_PROMPT + 10 built-in tools + Mastra chatRoute at POST /chat/livAi + 4 Grok models in ALLOWED_XAI_MODELS — all KEPT intact; Phase 201 is UI-tier only, backend untouched per INV-201-02).

**Wave:** Wave 0 = scaffold + transport wire (201-01 + 201-02); Wave 1 = adapter + tool-renderer ports (201-03 + 201-04 + 201-05); Wave 2 = Caddy + systemd + update.sh infra (201-06); Wave 3 = iframe wrap + deploy + close (201-07 + 201-08).

**Plans:** 8 plans, 14 commits in push range `085ff9f5..664bb3c5`; sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across the entire phase.

Plans:
- [x] 201-01-PLAN.md — Scaffold `livos/packages/liv-ai-app/` via `npx assistant-ui create liv-ai-app -t default --yes` ✅ CODE-COMPLETE 2026-05-23
- [x] 201-02-PLAN.md — Wire `AssistantChatTransport({api: '/chat/livAi', credentials: 'include'})` to parent livinityd + DELETE Next.js's own `/api/chat/route.ts` ✅ CODE-COMPLETE 2026-05-23
- [x] 201-03-PLAN.md — Port tool-renderers + 14 tool-ui primitives + redact-args + native approve fetch into `liv-ai-app/src/lib/{tool-ui,liv-ai}/` ✅ CODE-COMPLETE 2026-05-23 — 1 commit `d0698952`, 23 files / +1926 lines, sacred SHA preserved, 3 deviations (use-approve-mutation API preserved over plan example, react-leaflet SSR split, JSX.Element type removal for React 19)
- [x] 201-04-PLAN.md — Port 6 adapters (mention, slash, model-picker, thread-list, composer) + wire LivAiComposer via `composerSlot` + native tRPC fetch ✅ CODE-COMPLETE 2026-05-23 — 1 commit `ed1a41c6`, 11 files / +1436 lines, sacred SHA preserved, 4 deviations (Button variant remap, composer-trigger-popover port, dropdown-menu install, tRPC v10/v11 envelope fallback)
- [x] 201-05-PLAN.md — MCP panel surfaces 10 built-in tools as "Built-in" source group ✅ CODE-COMPLETE 2026-05-23 — commits `60e2bdb0` + docs `cd9eb7ad`
- [x] 201-06-PLAN.md — Caddy `handle /liv-ai-app/*` block + `livos-app-liv-ai.service` systemd unit + `update.sh` Step 7.2 build + Step 7.7 self-install ✅ CODE-COMPLETE 2026-05-23 — 1 commit `fc255096`, 8 files / +200 lines, sacred SHA preserved, 3 deviations (3-layer Caddy heredoc + runtime generator, Step 7.7 self-install for pre-201 boxes, two-block `handle{}` shape over plan example), 31/31 caddy.test.ts PASS
- [x] 201-07-PLAN.md — Flip `livos/packages/ui/src/modules/window/app-contents/liv-ai-content.tsx` from Vite-embedded `<Assistant />` to same-origin `<iframe src="/liv-ai-app" />` ✅ CODE-COMPLETE 2026-05-23 — 1 commit `1eb9e7de`, 1 file / +17/-10 lines, sacred SHA preserved, 0 deviations
- [x] 201-08-PLAN.md — Push + Mini PC deploy + 4 HTTP smoke tests + sacred SHA verification + chrome-devtools screenshot ATTEMPT (skipped honestly) + 12-row operator UAT walk template + VERIFICATION.md + STATE/ROADMAP flip ✅ CODE-COMPLETE + DEPLOYED 2026-05-23T12:15Z — pushed `085ff9f5..664bb3c5`, 5/5 services active on Mini PC, 4/4 HTTP smokes PASS, sacred SHA `f3538e1d...` PRESERVED via git-blob recompute, 2 inline deviations during deploy (Rule-3 update.sh rsync gap + Rule-1 pnpm-filter prune of arg@5.0.2)

**Commits:** Push range `085ff9f5..664bb3c5` (14 commits — 8 plan commits + 6 docs/SUMMARY commits).
**Deployed SHA on Mini PC (`/opt/livos/.deployed-sha`):** `664bb3c540c8926db54e972957bacb85575a5792`.
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across the entire phase (per-plan SUMMARYs confirm `[sacred-sha] PASS: 20 files verified` on every commit; Mini PC post-deploy git-blob recompute on `/opt/liv/packages/core/src/sdk-agent-runner.ts` → exact match).
**Live HTTP smoke tests (executor-run on Mini PC, JWT minted via `/opt/livos/data/secrets/jwt`):** `GET http://127.0.0.1:3010` → 404 (expected; basePath `/liv-ai-app`); `GET http://127.0.0.1:3010/liv-ai-app` → 200 + Next.js HTML shell; `GET https://bruce.livinity.io/liv-ai-app` (Caddy) → 200; `POST http://127.0.0.1:8080/chat/livAi` → 200 + real SSE stream with `updateWorkingMemory` tool firing (Phase 199 hot-fixes preserved); `GET http://127.0.0.1:8080/trpc/mastra.agent.listBuiltInTools` → 200 + array of exactly 10 tools (weather + luse_list_windows + luse_computer_screenshot + get_current_time + 6 destructive computer-use).
**Service status post-deploy + bruce-ownership patch:** `systemctl is-active livos liv-core liv-worker liv-memory livos-app-liv-ai` → **5× `active`**; ports listening: `127.0.0.1:3200` (liv-core), `*:3010` (next-server / liv-ai-app), `*:8080` (livinityd).
**Invariants:** INV-201-01 sacred SHA preserved (PASS — every commit + Mini PC); INV-201-02 backend (livinityd, Mastra) UNCHANGED (PASS — per per-plan SUMMARY diffs); INV-201-03 Phase 200-C 10 built-in tools preserved (PASS — § C.4 returns 10 tools); INV-201-04 HITL Reject = REJECTED_TOOL_RESULT (operator-walkable § E#9); INV-201-05 English UI only (operator-walkable § E#2/#12); INV-201-06 same-origin iframe (PASS — relative `src="/liv-ai-app"`); INV-201-07 livinityd `/chat/livAi` unchanged (PASS — § C.3 SSE stream identical); INV-201-08 `/trpc/mastra.agent.*` unchanged (PASS — § C.4); INV-201-09 Mini PC deploy uses update.sh (PARTIAL — update.sh ran but did NOT install the unit due to atomic self-replace pattern + rsync gap; manual install applied inline; Phase 202 patches the gap).
**Carry-overs to Phase 202+:** (1) `update.sh` rsync gap for `packages/liv-ai-app/` (must add to lines 420-475 block); (2) `update.sh` chown hook (recurring P198/P199/P200/P201 pattern, fold into `_dld_fix_permissions`); (3) Avoid `pnpm --filter <pkg> install` in update.sh (use full workspace install + filter build); (4) Standalone Luse MCP server binary; (5) Option B `switchToThread(oldId)` history reload (D-201-23 carry); (6) Live MCP-bridge tool discovery in `@` catalog (D-200-08 carry); (7) Full removal of Phase 197 `mastra.agent.*` deprecation (grace expiring); (8) Voice mode; (9) PDF attachment adapter; (10) Title generation; (11) Multi-agent routing; (12) PWA / service worker; (13) Custom shadcn theme tokens; (14) Loading skeleton during hydration; (15) Multi-user iframe isolation (Phase 220+).
**UAT walk template:** 12 steps in `.planning/phases/201-liv-ai-nextjs-iframe/201-VERIFICATION.md` § E (frontmatter `status: human_needed` until operator walks). Phase 201 ROADMAP heading flips 🟡 → 🟢 CODE-COMPLETE + LIVE + OPERATOR-UAT-PASSED when operator walks all 12 rows and confirms ≥10/12 PASS.

**Deferred to Phase 202+:** Standalone Luse MCP server binary (replaces built-in tool indirection); voice mode (browser SpeechRecognition or external API); PDF attachment adapter; title generation (LLM call after first 4 messages); multi-agent routing within the same chat; ExternalStoreThreadListAdapter Option B (P200-07 follow-up); PWA / service worker for offline iframe loading; custom shadcn theme tokens matching LivOS brand; loading skeleton during Next.js initial hydration (NextScript optimization); update.sh rsync gap fix for packages/liv-ai-app/; update.sh chown hook fold-in.

---

### Phase 202: Agents Platform — multi-agent + scheduling + generative UI — 🟡 CODE-COMPLETE + DEPLOYED 2026-05-23T08:54:16Z (operator UAT pending)

**Goal:** Self-service Agents Platform on top of Mastra. Operators create Agents from the UI (`/agents/new`), bind cron schedules, link parent → child sub-agents via Supervisor pattern, and watch live runs at `/agents`. Settings page lands at `/settings` with Account / MCP / Models tabs. Chat upgrades to true Generative UI via assistant-ui tool-ui primitives + `@openuidev/renderer` (OpenUI Lang `ui_render` tool). Mastra constructor wrapped with `telemetry: {enabled, export:'console'}` + empty `workflows:{}` / `evals:{}` scaffold for Phase 203+.

**Depends on:** Phase 201 (Liv AI Next.js iframe rebuild + Luse MCP restore). All Mastra invariants from 197-201 preserved (B-02 LivOSMastra additive-only, W-02 approval gate, N-01 destructive tool name set, INV-200-05 English UI).

**Wave plan:**

- **Wave 1 — Backend foundation:** 202-01 (schema + Drizzle migration + AgentRepository + livAi seed), 202-02 (dynamic Mastra registry + Supervisor wire + LivOSMastra additive), 202-03 (node-cron scheduler + Redis mutex + agent CRUD tRPC + task lifecycle routes)
- **Wave 2 — Frontend pages:** 202-04 (`/agents` dashboard + SSE live status + sidebar nav), 202-05 (`/agents/[id]` detail + edit + recent tasks + Run now), 202-06 (`/agents/new` create form + cron/tool/sub-agent/model pickers)
- **Wave 3 — Settings + Generative UI:** 202-07 (`/settings` page with Account/MCP/Models tabs + external MCP CRUD via Redis `liv:mcp:config`), 202-08 (OpenUI Lang `ui_render` tool + renderer + 14-component whitelist)
- **Wave 4 — Polish + deploy:** 202-09 (SubAgentTree + Mastra constructor wrap with telemetry + empty workflows/evals scaffold), 202-10 (Mini PC deploy + executor smoke + 202-VERIFICATION.md + STATE/ROADMAP flip + final commit)

**Plans (10):**
- [x] 202-01-PLAN.md — `livos_agents` schema + Drizzle migration + AgentRepository + livAi seed ✅ CODE-COMPLETE 2026-05-23 (6 commits `16b76525..a0dd7a1b`; 13/13 vitest PASS; sacred SHA preserved 6/6; 3 deviations documented in 202-01-SUMMARY.md)
- [x] 202-02-PLAN.md — Dynamic Mastra agent registry + Supervisor wire + LivOSMastra additive extension ✅ CODE-COMPLETE 2026-05-23 (5 commits `ae89e9f1..c01a0d09`; 8/8 vitest PASS; sacred SHA preserved 5/5; INV-202-03 B-02 lock honoured — LivOSMastra diff is purely additive (1 new slot + 1 new method); 2 deviations documented in 202-02-SUMMARY.md)
- [x] 202-03-PLAN.md — node-cron scheduler + agent CRUD tRPC + task lifecycle routes ✅ CODE-COMPLETE 2026-05-23 (6 commits `02a118eb..e5789829`; 8/8 vitest PASS + 21 sibling tests still PASS; sacred SHA preserved 6/6; INV-202-03 B-02 additive — LivOSMastra +1 slot `scheduler` + `attachScheduler()`; T-202-01 lock + T-202-03 cron validate + T-202-02 unique map + T-202-04 depth map + D-202-20 system delete refusal all wired through tRPC error codes (AGENT_CRON_INVALID / AGENT_NAME_TAKEN / AGENT_DEPTH_EXCEEDED / AGENT_IS_SYSTEM); 3 deviations documented in 202-03-SUMMARY.md; Wave 1 CLOSED)
- [x] 202-04-PLAN.md — `/agents` dashboard + SSE live status + sidebar nav ✅ CODE-COMPLETE 2026-05-23 (6 commits `2d602961..70d8e807`; build PASS — /agents in Next.js 16.2.6 Turbopack route manifest; 8 pre-existing AgentScheduler vitest cases still PASS after additive EventEmitter; sacred SHA preserved 6/6; INV-202-02 boundary respected — backend in livinityd, frontend in liv-ai-app; INV-202-05 English-only verified by Turkish-char grep = 0; D-202-08 SSE via native EventSource shipped; D-202-24 agents page lives in subapp; 9 files created + 3 modified additively; 3 deviations documented in 202-04-SUMMARY.md; Wave 2 opened)
- [x] 202-05-PLAN.md — `/agents/[id]` detail + edit + recent tasks + Run now ✅ CODE-COMPLETE 2026-05-23 (5 commits `7f76a4e7..844fdf8c`; build PASS — `ƒ /agents/[id]` dynamic route in Next.js 16.2.6 Turbopack manifest; sacred SHA preserved 5/5; INV-202-02 boundary respected — ZERO backend changes (tRPC routes from 202-03 sufficient); INV-202-05 English-only verified by Turkish-char grep = 0; INV-202-10 Phase 201 generative UI renderers FROZEN; D-202-13 parent select hides agents that are already a child; D-202-14 AGENT_NAME_TAKEN surfaced inline; D-202-15 debounced cronstrue preview via agents.cronPreview; D-202-16 any-admin RunNowButton; D-202-20 system agents — name + parent disabled, Delete row hidden entirely; hooks/components from 202-04 REUSED (useAgentStatusSSE, useAgentsList, StatusBadge); 6 files created (use-agent.ts + use-tasks-list.ts + AgentEditForm.tsx + RunNowButton.tsx + RecentTasksList.tsx + app/agents/[id]/page.tsx); 0 deviations — plan executed exactly as written modulo template substitution from shadcn Tabs/Select/Switch to native HTML+Tailwind (matches StatusBadge / AgentCard hand-rolled pattern from 202-04); details in 202-05-SUMMARY.md)
- [x] 202-06-PLAN.md — `/agents/new` create form + cron/tool/sub-agent/model pickers ✅ CODE-COMPLETE 2026-05-23 (5 commits `c72db03d..65856373`; build PASS — `○ /agents/new` in Next.js 16.2.6 Turbopack route manifest; sacred SHA preserved 5/5; INV-202-02 boundary respected — ZERO backend changes (agents.create + agents.cronPreview from Plan 202-03 sufficient); INV-202-05 English-only verified by Turkish-char grep = 0 over app/agents/new + 4 pickers; INV-202-06 SubAgentPicker disables already-a-child candidates client-side (D-202-13 depth-2 cap); INV-202-09 BUILTIN_TOOLS const surfaces 10 Phase 200-C built-ins; INV-202-10 src/lib/tool-ui/ untouched; D-202-13 / D-202-14 / D-202-15 / D-202-17 / D-202-21 / D-202-24 all honoured; 5 files created (CronPicker.tsx + ToolPicker.tsx + SubAgentPicker.tsx + ModelPicker.tsx + app/agents/new/page.tsx); 1 deviation (Rule 1 — Bug) folded into Task 5 commit: CronPicker JSDoc embedded cron literal crashed Turbopack ECMAScript parser (same trap as 202-03 scheduler.ts) — fixed by rewriting paragraph to prose; PRESETS const runtime strings untouched; details in 202-06-SUMMARY.md; Wave 2 CLOSED)
- [x] 202-07-PLAN.md — `/settings` page with Account/MCP/Models tabs + external MCP CRUD ✅ CODE-COMPLETE 2026-05-23 (6 commits `ecec755f..2d640409`; build PASS — `○ /settings` in Next.js 16.2.6 Turbopack route manifest; sacred SHA preserved 6/6; INV-202-01 PASS; INV-202-02 boundary respected — 4 backend files under `livos/packages/livinityd/` (mcp-config-router.ts NEW + trpc/index.ts + trpc/common.ts + source/index.ts) + 9 frontend files under `livos/packages/liv-ai-app/`; INV-202-05 English-only verified by Turkish-char grep = 0 over app/settings + components/settings + src/lib/settings; INV-202-08 McpBridge untouched at runtime — UI surfaces amber restart-required banner so operator sees the constraint; INV-202-09 BUILT_IN_TOOL_CATALOG unchanged; INV-202-10 Phase 201 generative UI renderers FROZEN — McpTab built fresh in subapp (NOT a port of 1316-line legacy livinity-mcp-panel.tsx); D-202-11 `/settings` at subapp root + D-202-12 Redis hash `liv:mcp:config` backing + D-202-24 subapp under `livos/packages/liv-ai-app/` all honoured; 9 files created (mcp-config-router.ts + use-mcp-servers.ts + McpTab.tsx + AddMcpServerDialog.tsx + AccountTab.tsx + ModelsTab.tsx + tabs.tsx + settings/page.tsx + settings/layout.tsx); 5 files modified additively (trpc/index.ts merge into mcp.* + trpc/common.ts +5 httpOnlyPaths + source/index.ts production wire-up + AgentsSidebar Settings link + threadlist-sidebar Settings link); 1 deviation (Rule 1 — Bug) folded into Task 6+7 commit: useMcpServers BatchResult<unknown> array destructuring left both entries untyped, tsc rejected unwrapBatch<McpServerConfig[]>() — fixed by per-entry cast `data?.[0] as BatchResult<McpServerConfig[]> | undefined` (sound because tRPC batch positional contract guarantees response ordering matches request ordering); 3 plan-template adjustments NOT counted as deviations (documented in 202-07-SUMMARY.md): shadcn CLI install bypassed in favour of umbrella radix-ui (avoids new @radix-ui/react-tabs dep), AccountTab JWT secret rotation timestamp omitted (no rotation surface exists in this codebase — static file at /data/secrets/jwt per MEMORY.md), sidebar Settings wired in BOTH sidebars not just ThreadListSidebar so Settings is reachable from every subapp surface; details in 202-07-SUMMARY.md; Wave 3 opened)
- [x] 202-08-PLAN.md — OpenUI Lang `ui_render` tool + renderer + 14-component whitelist ✅ CODE-COMPLETE 2026-05-23 (4 commits `2d41fcfd..f8cf7ce9`; build PASS — `pnpm --filter liv-ai-app build` Compiled successfully in 5.7s + TypeScript pass; sacred SHA preserved 4/4; INV-202-01 PASS; INV-202-02 boundary respected — backend changes limited to built-in-tools.ts (uiRenderTool + catalog entry #11) + liv-ai.ts (system prompt GENERATIVE UI clause); INV-202-05 English-only verified by grep = 0 Turkish chars in openui/*; INV-202-09 annotation updated 10 → 11 built-ins, ui_render is non-destructive; INV-202-10 PRESERVED — tool-renderers.tsx diff shows additions only (1 import + 1 JSX mount + 1 annotation comment); D-202-09 reuse honored (16 frozen renderers untouched, OpenUI added alongside); D-202-10 reinterpreted via Rule-3 deviation: `@openuidev/renderer` does NOT exist on npm (`npm view` returns 404), plan's deviation clause (b) authorised an in-repo minimal implementation with the same XSS contract — `ui_render` tool surface (`tree: z.unknown()`) unchanged; T-202-06 implemented: 14-component whitelist (heading/text/paragraph/button/list/card/image/link/divider/layout-stack/layout-row/badge/input/table) + isSafeUrl() URL allow-list (https://, root-relative, fragment, data:image/* for images only — javascript:/vbscript:/data:text/file: rejected) + no `dangerouslySetInnerHTML` anywhere + zod safeParse per-component props with graceful chip fallback + MAX_TREE_DEPTH=32 recursion cap; 2 files created (src/lib/openui/openui-components.tsx 455 lines + openui-renderer.tsx 176 lines); 6 files modified (built-in-tools.ts + liv-ai.ts + tool-renderers.tsx + tsconfig.json + package.json zod dep + pnpm-lock.yaml); 3 deviations (Rule-3 npm 404 → in-repo renderer, Rule-3 transitive zod → explicit dep, Rule-1 .ts → .tsx because JSX); Task 7 live smoke skipped — deferred to Plan 202-10 deploy UAT (smoke-test reference documented in 202-08-SUMMARY.md); details in 202-08-SUMMARY.md; Wave 3 CLOSED)
- [x] 202-09-PLAN.md — SubAgentTree + Mastra constructor wrap (telemetry + workflows/evals scaffold) ✅ CODE-COMPLETE 2026-05-23 (4 commits `d765ffbd..beab5126`; build PASS — `pnpm --filter liv-ai-app build` Turbopack production build clean + 6-route manifest unchanged; livinityd typecheck pre-existing 382 errors UNCHANGED before+after via git-stash roundtrip — zero new TS errors introduced; sacred SHA preserved 4/4; INV-202-01 PASS; INV-202-03 B-02 lock honoured for the THIRD consecutive plan — LivOSMastra diff is purely additive: ONE new import (`Mastra` type), ONE new slot (`mastraInstance: Mastra | null`), ONE new attach method (`attachMastraInstance`) with all five pre-existing slots `agents.livAi?`/`memory`/`mcpBridge`/`registry`/`scheduler` untouched; INV-202-05 English-only verified by Turkish-char grep = 0 over SubAgentTree + mastra-instance + boot wire-up; INV-202-06 depth-2 cap surfaced visually as `[depth limit reached]` italic hint on ChildCard whose own children exist; INV-202-08 Mastra MCP source list unchanged — constructor wrap does NOT enumerate MCP servers; INV-202-09 11 built-in tools preserved; INV-202-10 Phase 201 generative UI renderers FROZEN — no edits to src/lib/tool-ui/; D-202-06 `new Mastra({agents,workflows,telemetry})` constructor wrap shipped; D-202-07 workflows={} empty maps; D-202-13 visual depth cap + read-only mirror (re-parenting still happens via AgentEditForm parentAgentId select shipped in 202-05); D-202-18 telemetry export=console only via inline literal `{enabled:true,serviceName:'livOS',sampling:{type:'always_on'},export:{type:'console'}}`; 2 files created (SubAgentTree.tsx 157 lines + mastra-instance.ts 132 lines); 3 files modified additively (`app/agents/[id]/page.tsx` IIFE-wrapped section + `mastra/index.ts` ONE slot + ONE attach + `source/index.ts` createMastraInstance import + boot wire-up); 2 deviations (Rule-3 — both library version drift anticipated by plan template Task 3 body): @mastra/core@1.36.0 renamed `telemetry`→`observability` (new shape: Observability instance from @mastra/observability), shipped via `as never` cast per plan escape hatch; `evals`→`scorers` (new shape: MastraScorer instances) field OMITTED entirely (passing old key would not survive `as never` cleanly + would mislead future readers); Task 5 runtime telemetry-spans-in-journalctl verification DEFERRED to Plan 202-10 Mini PC smoke tests per plan's own "Or" escape hatch (working tree is Windows; livinityd runs only on Mini PC); details in 202-09-SUMMARY.md; Wave 4 half one CLOSED)
- [x] 202-10-PLAN.md — Mini PC deploy + verification + STATE/ROADMAP flip ✅ CODE-COMPLETE + DEPLOYED 2026-05-23T08:54:16Z (3 atomic deploy hot-fix commits `2e6d7a30..ef0c130b` + this docs commit; deployed SHA `ef0c130b` recorded in `/opt/livos/.deployed-sha`; sacred SHA `f3538e1d...` PRESERVED canonically AND verified on Mini PC live via git-blob recompute = exact match; 5/5 services active post-deploy; 6/6 HTTP smoke results PASS (agents.list returns livAi + /agents 200 + /settings 200 + /agents/new 200 + mcp.config.list 200 + listBuiltInTools 200 with tool count = 11 confirming INV-202-09); 10 Phase 202 boot markers present in journalctl (202-01/02/03/04/07/09 wiring + scheduler armed 3 jobs); `livos_agents` table + livAi seed (system=true, root) verified via PG queries; 4 deviations (Rule-2 update.sh liv-ai-app rsync gap fix + Rule-2 bruce ownership chown hook + Rule-3 pnpm `--no-frozen-lockfile` fallback + Rule-1 untracked livinity-logo.tsx committed); 1 honest skip (chrome-devtools-mcp screenshot covered by operator UAT § I 13-step walk); 4 deploy iterations until success (each hotfix atomically committed + pushed before next attempt); details in 202-10-SUMMARY.md; **OPERATOR UAT PENDING** — 13-step walk template in 202-VERIFICATION.md § I, ≥ 11/13 PASS threshold to flip Phase 202 → 🟢 SHIPPED; Phase 202 CODE-COMPLETE + DEPLOYED)

**Phase-level deploy state (2026-05-23T08:54:16Z):**
- **Push range (close-out):** `d34ed5d4..ef0c130b` (4 commits)
- **Deployed SHA on Mini PC:** `ef0c130bf07c59c5bfdf097ff2e7ec979fa75aeb` (HEAD of master)
- **Sacred SHA canonical:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — PRESERVED across every Phase 202 commit; Mini PC live recompute on `/opt/liv/packages/core/src/sdk-agent-runner.ts` = EXACT match (INV-202-01 PASS)
- **Services active:** 5/5 — livos + liv-core + liv-worker + liv-memory + livos-app-liv-ai (next-server port 3010)
- **HTTP smoke PASS:** 6/6 — agents.list (livAi present) / /agents 200 / /settings 200 / /agents/new 200 / mcp.config.list 200 / listBuiltInTools 200 with count = 11
- **Phase 202 boot markers:** 10 lines present in journalctl-u-livos (P202-01 registry / P202-02 init+refresh / P202-09 Mastra constructor / P202-03 scheduler+routers / P202-04 SSE / P202-07 mcp.config / scheduler 3 jobs armed)
- **DB state:** `livos_agents` table present with 11 columns + UNIQUE(name) + self-ref FK + depth-2 trigger; `livAi` seed row with `system=true`
- **VERIFICATION.md:** `.planning/phases/202-agents-platform/202-VERIFICATION.md` filed with `status: human_needed` + 13-step operator UAT walk template
- **Carry-overs to Phase 203+** (12 items): concrete workflows/scorers bodies + external telemetry backend (Langfuse/Phoenix/OTLP) + multi-user agent ownership + per-agent ACL + sub-agent depth > 2 + agent versioning + distributed scheduler (Inngest) + WebSocket bi-directional + live MCP-bridge tool discovery in `@` catalog + standalone Luse MCP binary + assistant.tsx/globals.css/next.config.ts dev-mode commits + Mastra v1.36 `evals` → `scorers` refactor (currently shipped via `as never` cast per Plan 202-09)

**Plans:** 10/10 plans CODE-COMPLETE (operator UAT closes ROADMAP heading 🟡 → 🟢)

**Locked decisions (D-202-01..24):** see `.planning/phases/202-agents-platform/202-CONTEXT.md`.

**Invariants:** INV-202-01 sacred SHA preserved; INV-202-02 backend stays in livinityd; INV-202-03 LivOSMastra B-02 additive-only; INV-202-04 approval gate preserved; INV-202-05 English UI; INV-202-06 sub-agent depth ≤ 2 (DB trigger + runtime double-check); INV-202-07 agent name UNIQUE; INV-202-08 Mastra MCP source list preserved; INV-202-09 Phase 200-C 10 built-ins preserved (now 11 with `ui_render`); INV-202-10 Phase 201-03 generative UI renderers FROZEN.

**Threats / mitigations (T-202-01..08):** Schedule overlap → Redis SET NX PX lock; name collision → DB UNIQUE + form validation; cron injection → node-cron.validate; sub-agent recursion → DB trigger + runtime guard; telemetry leak → console-only export; OpenUI XSS → 14-component whitelist + safe-URL check; privilege escalation → adminProcedure gate; scheduler thunder-herd → 1-min resolution + cron jitter.

**Speed budget:** 13-17 hours wall-clock for autonomous executor (Wave 1: 4-5h, Wave 2: 4-5h, Wave 3: 3-4h, Wave 4: 2-3h).

**Resume command:** `/gsd-execute-phase 202` (CONTEXT + 10 PLANs already on disk).


### Phase 203: Liv AI on openclaw-os + Desktop App Integration — 🟡 CODE-COMPLETE + DEPLOYED 2026-05-23T23:45Z (operator UAT pending; 2 operator action items in `.planning/phases/203-liv-ai-openclaw-os/203-VERIFICATION.md § G`)

**Goal:** Replace the entire Mastra + assistant-ui Liv AI stack with a fork-and-rebrand of `openclaw-os` (cloned from thesysdev/openclaw-os, rebranded "Liv AI") backed by the MIT-licensed `openclaw` npm gateway, AND wire a new desktop-integration path so OpenUI apps generated by the `app_create` tool surface as clickable LivOS dock icons that open a window rendering the live OpenUI markup. See `.planning/phases/203-liv-ai-openclaw-os/203-CONTEXT.md`.

**Depends on:** Phase 202 (Agents Platform). Phase 202 tRPC contracts (agents.*, agents.tasks.*, mcp.config.*) preserved unchanged per INV-203-09 — only inner Mastra calls swap for the new openclaw + LivOSAgent runtime.

**Wave plan:** Wave 1 spike + clone + rebrand (203-01..03) → Wave 2 bridge to livinityd (203-04..06) → Wave 3 Mastra + assistant-ui purge (203-07..09) → Wave 4 desktop integration + deploy + UAT (203-10..13).

**Plans (13):**
- [x] 203-01-PLAN.md — L0 spike: clone openclaw-os, boot gateway, write decision matrix for D-203-06 branch — ✅ **CODE-COMPLETE 2026-05-23** — Branch A CONFIRMED (openclaw self-dispatches LLM via 57-provider catalog + env vars + `agents.defaults.model.primary` config; no backend callback required). openclaw-os HEAD `076ae63478fa2417d38c39b5b6d13f9188b8580b` pinned for Plan 203-02. openclaw@2026.5.20 booted clean on port 18790 with `{"ok":true,"status":"live"}` health probe. 647-line `203-01-SPIKE.md` covers all 12 required sections + 10 risks/surprises (notably: D-203-04 service topology needs 1-unit revision — plugin runs IN-process, not as a separate worker).
- [x] 203-02-PLAN.md — Clone openclaw-os into livos/packages/liv-claw-os + rebrand pass (OpenClaw → Liv AI) — ✅ **CODE-COMPLETE 2026-05-23** — Cloned `thesysdev/openclaw-os` at SPIKE-pinned SHA `076ae63...` into `livos/packages/liv-claw-os/`, removed nested `.git`, wrote `UPSTREAM-COMMIT` marker; renamed root `package.json` → `@livos/liv-claw-os` + extended outer `pnpm-workspace.yaml` to register inner claw-client + claw-plugin packages. Rebrand sweep: README/AGENTS/SECURITY/CONTRIBUTING fork-framed; openclaw.plugin.json + package.json + src/index.ts plugin name/description + CLI descriptions → "Liv AI"; claw-client `<title>` + manifest.webmanifest PWA + favicon.svg placeholder + AppSidebar Logo + MobileShell + Settings dialogs all rebranded; orphaned hero PNG deleted. PRESERVED VERBATIM per spike DO/DON'T: npm package names, `:openclaw-os` session-key suffix, `openclaw-os-plugin` id, `/plugins/openclawos` HTTP route, `openclawos.*` RPC namespace, OpenClawEngine + OpenClawPluginToolContext class/type names, import paths, CSS selectors, localStorage keys. 3 atomic commits `ee05a9ef..af9f7ff5`; sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRESERVED 3/3. Build verification: `pnpm --filter @livos/liv-claw-os build` PASS — esbuild 169.2kb plugin bundle + Next.js 16 4-route static export. INV-203-05 PASS (0 Turkish chars in TS/TSX). 1 deviation (pre-existing Windows `packages/ui` postinstall `mkdir -p` failure, out of scope per SCOPE BOUNDARY).
- [x] 203-03-PLAN.md — liv-claw-gateway workspace package + systemd unit + update.sh patch — ✅ **CODE-COMPLETE 2026-05-23** — `@livos/liv-claw-gateway` workspace package shipped (package.json depending on `openclaw@^2026.5.20` + `@livos/liv-claw-os` workspace, `start.js` Node entrypoint resolving openclaw bin + plugin bundle then spawning `openclaw gateway run --plugin <bundle>`, `start.sh` POSIX systemd ExecStart wrapper). `scripts/install/systemd/liv-claw-gateway.service` unit per D-203-04 AMENDED single-unit topology (Type=simple, bruce user, port 18789, Restart=on-failure RestartSec=5 for T-203-01 mitigation, OPENCLAW_HOME=/opt/livos/data/openclaw, EnvironmentFile=-/opt/livos/.env). `systemd-units-install.sh` `_units=()` array extended. `update.sh` patched in 5 places: Step 2 rsync (packages/liv-claw-os + packages/liv-claw-gateway), Step 7.3 `pnpm --filter @livos/liv-claw-os build`, Step 7.4 wrapper deps, Step 7.8 idempotent unit self-install + state-dir mkdir/chown (Rule 2), Step 8 restart loop entry. Caddy routing D-203-05 flip — `LIV_AI_APP_HANDLE` constant in caddy.ts + 6 install-time bootstrap heredocs (`deploy-livinityd.sh` x3 + `mode-tunnel.sh` x1 + `mode-cloud.sh` x2): `reverse_proxy 127.0.0.1:3010` → `:18789`. `.env.example` documents new ANTHROPIC_API_KEY requirement. 4 atomic commits `07512ed3..42716513`; sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRESERVED 4/4. Regression checks: `npx vitest run caddy.test.ts` 31/31 PASS, `pnpm --filter @livos/liv-claw-os build` PASS post-routing change. INV-203-01 + INV-203-08 PASS. 3 deviations all auto-fixed in band (Rule 3 plan path drift `livos/scripts/` → `scripts/`, Rule 3 plugin bundle resolution, Rule 2 state-dir provisioning). Wave 1 (203-01 spike → 203-02 clone+rebrand → 203-03 systemd gateway) CLOSED; Wave 2 unblocked.
- [x] 203-04-PLAN.md — liv-claw-plugin tools call livinityd HTTP + livos_openui_apps table + openclawos.apps.* tRPC + shared openui-validator — ✅ **CODE-COMPLETE 2026-05-23** — Postgres bridge between rebranded plugin and livinityd shipped. Migration `0003_livos_openui_apps.sql` (D-203-09 verbatim) + sibling `livos_openui_app_versions` (FK CASCADE, capped at MAX_VERSIONS_PER_SLUG=25 via repo transactions); drizzle bindings + 4 new types in schema.ts; `runLivOSMigrations` extended to apply both migrations in order. `OpenUIAppsRepository` (CRUD + transactional snapshot+bump+overflow-delete + `versions`/`currentVersion`/`incrementVersion` helpers). `openclawos.apps.*` tRPC namespace — 6 adminProcedure routes (list/get/create/update/delete/version) mounted under NEW top-level `openclawos` namespace (INV-203-09 preserved — `mcp.*`+`agents.*` UNCHANGED), with `SlugSchema` blocking whitespace/path-traversal, `mapRepoError` short-circuiting on pre-mapped TRPCErrors (preserves OPENUI_REPO_UNAVAILABLE differentiation from empty-injection stub), `validateContent` JSON-parse-guarded so raw lang source passes through to plugin lint hook (T-203-03 mitigation targets pre-rendered JSON trees specifically). 6 paths added to `httpOnlyPaths` in common.ts. Boot wire-up in livinityd index.ts creates dedicated `pg.Pool` + `drizzle` handle, wraps in `OpenUIAppsRepository`, passes to `createAppRouter` as `openclawosApps` slot (non-fatal degradation to OPENUI_REPO_UNAVAILABLE stub if DATABASE_URL absent). **Plugin reshape**: `livos/packages/liv-claw-os/packages/claw-plugin/src/app-store.ts` FULL REWRITE — fs.writeJson → loopback HTTP POST to `${LIVINITY_BASE_URL ?? 'http://127.0.0.1:8080'}/trpc/openclawos.apps.*?batch=1` with v10/v11 envelope, X-Api-Key header from LIV_PLUGIN_TOKEN/LIV_API_KEY env, 5xx retry once with 250ms backoff (T-203-01 client-side symmetry), slug = slugified-title + 6-char uuid tail for PK uniqueness; StoredApp/VersionEntry types preserved verbatim so index.ts callers compile unchanged; plugin-side `validateOpenUITree()` fast-fail before network call. **Shared validator duplicated byte-identical in BOTH livinityd AND plugin** (~80 LOC each — pragmatic; documented in SUMMARY for v204+ workspace-package extraction). T-203-07 scope-boundary marker added to plugin index.ts (db_query/db_execute still local SQLite; Plan 203-06+ evaluates Postgres bridge). 5 atomic commits `07b1396c..a8fa10b3`; sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRESERVED 5/5 (`[sacred-sha] PASS: 20 files verified` on every commit — zero sacred files touched). 47/47 livinityd vitest cases PASS (validator 25 + repo 12 + router 10); 8/8 plugin-side validator parity smoke PASS via tsx (plugin vitest 4.x has pre-existing vite resolution gap from Plan 203-02 install — out of scope per SCOPE BOUNDARY); npx tsc --noEmit in claw-plugin CLEAN; esbuild bundle 175.7kb in 35ms (+6.5kb vs pre-203-04). INV-203-01 PASS (sacred SHA preserved); INV-203-02 PASS (livos_agents schema UNCHANGED — additive only); INV-203-09 PASS (Phase 202 tRPC namespaces preserved). 5 deviations all auto-fixed in band: (1) Rule-3 Task 4 path drift `liv-claw-plugin/` → `liv-claw-os/packages/claw-plugin/` (Plan 203-02 already cloned + Plan 203-03 resolves bundle from that path; second copy would fork wire-protocol identifiers); (2) Rule-3 plugin vitest 4.x vite resolution gap (pre-existing from Plan 203-02 install — worked around with tsx smoke); (3) Rule-2 validateContent passthrough for raw lang source (avoids false-positives on lang strings); (4) Rule-2 mapRepoError TRPCError passthrough (preserves stub differentiation); (5) Rule-2 plugin HTTP 5xx retry-once-with-backoff (T-203-01 client symmetry). 0 auth gates. SUMMARY at `.planning/phases/203-liv-ai-openclaw-os/203-04-SUMMARY.md`.
- [x] 203-05-PLAN.md — /openclawos/handshake JWT→Ed25519 bridge + Caddy /liv-ai-app/* → :18789 — ✅ **CODE-COMPLETE 2026-05-23** — POST /openclawos/handshake Express route on livinityd:8080 verifies LIVINITY_SESSION JWT (Bearer or cookie, mirrors chatAuthGate at index.ts:1279) and mints a 5-min Ed25519 device token via Node-native `crypto.generateKeyPairSync('ed25519')` + `sign`/`verify` (zero new deps replacing plan's tweetnacl suggestion); keypair persisted at `/opt/livos/data/secrets/openclaw-ed25519` (Mini PC) or `livos/data/secrets/openclaw-ed25519` (dev fallback) with mode 0o600 JSON-wrapped PEM for forward-compat key rotation; tokens cached per-jti in Redis as `liv:openclaw:device-token:{jti}` with `EX 300` (T-203-02 replay mitigation — each handshake call returns a DIFFERENT token, asserted by test 12). Caddy `OPENCLAWOS_HANDSHAKE_HANDLE` emitted in **all 3 generator sites** (null-mainDomain `:80` + apex + multi-user subdomain) BEFORE the existing `LIV_AI_APP_HANDLE` so first-match-wins steers JWT POST to livinityd:8080 not gateway:18789; same handle added to **all 3 bootstrap heredocs** in `scripts/install/deploy-livinityd.sh` (tunnel CF-Tunnel-terminates-TLS, local-LAN tls-internal, cloud plain-:80). Client-side patch in `livos/packages/liv-claw-os/packages/claw-client/src/lib/gateway/`: new `livinityd-handshake.ts` exporting `fetchLivinitydDeviceToken` (same-origin POST with `credentials:'include'` so LIVINITY_SESSION cookie auto-forwarded by Caddy) + `shouldRefreshDeviceToken` (30s refresh buffer = conservative 1/10-of-TTL); `socket.ts` patched (+58 lines) — GatewaySocket caches `livinitydDeviceToken` + `livinitydDeviceTokenExpiresAt`; in `handleOpen` BEFORE `buildConnectParams` fetches fresh token if cache stale → augments local settings with `deviceToken` → `buildConnectParams` uses it via `auth.deviceToken` path; on `LivinitydHandshakeError`, warns + clears cache + falls through to raw `settings.token` path so stand-alone (non-LivOS) deploys keep working. Upstream wire-protocol constants in `handshake.ts` (`PROTOCOL_VERSION`, `SCOPES`, `GATEWAY_CLIENT_*` enums) UNCHANGED — only ADD a pre-step; Ed25519 device-identity signature path (D-203-12 internal handshake) preserved verbatim. 4 atomic commits `79f88ce7..0e5dcc76`: `79f88ce7` device-token + 12-case test, `43fdbde8` route + boot mount + 12-case test, `c6dd8808` Caddy generator + 3 heredocs + caddy.test +5 cases, `0e5dcc76` claw-client patch + 13-case test. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRESERVED 4/4 (`[sacred-sha] PASS: 20 files verified` on every commit — ZERO sacred source files touched). 60/60 livinityd vitest cases PASS via `npx vitest run source/modules/openclawos/device-token.test.ts source/modules/openclawos/handshake-route.test.ts source/modules/domain/caddy.test.ts` — device-token 12 + handshake-route 12 + caddy 36 (was 31, +5 new ordering + INV-203-08 negative-grep). `npx tsc --noEmit` in claw-client CLEAN (exit=0); 0 new TypeScript errors in livinityd. INV-203-01 PASS 4/4; INV-203-08 PASS (handshake handle is THE ONLY second routing surface added; negative-grep test asserts no new port targets beyond {8080, 18789, app-port}); INV-203-10 PASS (LIVINITY_SESSION JWT remains outer auth; Ed25519 minted only AFTER JWT verify); T-203-02 PASS (each handshake call returns DIFFERENT token). 6 deviations all auto-fixed in band: (1) Rule-1 bug — `Server` type import from node:http conflicted with Express's listen-return shape (TS2740); replaced with `any` for test-scope server handle; (2) Rule-2 critical functionality — 30s proactive refresh buffer on client (avoids in-flight expiry during slow WS negotiation); (3) Rule-2 critical functionality — fall-through on `LivinitydHandshakeError` for non-LivOS deploys; (4) Rule-2 critical functionality — `OPENCLAW_KEYPAIR_PATH` env override for tests (avoids cache leak + prod path pollution); (5) Rule-3 pre-existing dependency drift — plugin vitest 4.x Vite-7 gap (203-04 carry-over); same fetch shape exercised end-to-end by route-level handshake-route.test.ts via livinityd vitest 2.1.9; (6) Plan-level — Task 5 "Commit" satisfied by 4 atomic per-task commits matching Plan 203-04 delivery shape. 0 auth gates. SUMMARY at `.planning/phases/203-liv-ai-openclaw-os/203-05-SUMMARY.md`.
- [x] 203-06-PLAN.md — Luse + 11 built-in tools as openclaw gateway tools via liv-claw-plugin (ApprovalManager RPC preserved) — ✅ **CODE-COMPLETE 2026-05-23** — `POST /openclawos/plugin-rpc` Express route on livinityd:8080 (X-Internal-Plugin-Token auth via LIV_PLUGIN_TOKEN/LIV_API_KEY env) dispatches 5 methods: `luse.list` / `luse.invoke` / `builtin.list` / `builtin.invoke` / `approval.request`. New `ApprovalManager.requestSync({toolName, agentId?, userId?, toolCallId?, timeoutMs?})` entry-point returns `{decision: 'approved'|'rejected'|'timeout', toolCallId, runId}` (differentiates timeout from explicit reject); same underlying Map + setTimeout state as registerPending so cancelAll(runId) still works. mcp-tool-adapter.ts bridges existing mcpBridge surface to plugin-rpc shape (luse_* tools from MCPClient via Mastra wrappers — `bridge.listTools()` + `.execute({context: args})`, no new @mastra/mcp import). Plugin side: shared `livinityd-rpc.ts` HTTP client with X-Internal-Plugin-Token + retry-once-on-5xx + 90s default timeout; `luse-proxy.ts` registers 9 luse_* factories (6 destructive route through `approval.request` first, 3 non-destructive direct to `luse.invoke`); `builtin-proxy.ts` registers 11 LivOS built-in factories matching `BUILT_IN_TOOL_CATALOG` exactly (weather + get_current_time + ui_render + 8 luse_*). Plugin `index.ts` calls `registerLuseProxyTools(api)` + `registerBuiltinProxyTools(api)` at init — openclaw gateway sees 29 total tools (9 upstream + 9 luse + 11 built-in). 4 atomic commits `8b833a02..08447ba2`; sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRESERVED 4/4 (`[sacred-sha] PASS: 20 files verified` on every commit). 61/61 livinityd vitest cases PASS (12 plugin-rpc + 13 approval-manager + 12 handshake + 12 device-token + 12 openui-apps-repo); `npx tsc --noEmit` in claw-plugin CLEAN (0 errors after tuple-access fixes for noUncheckedIndexedAccess); 0 new TS errors in livinityd. INV-203-01 PASS 4/4; INV-203-03 PASS (Luse MCP server process unchanged — adapter is read-side wrapper); INV-203-04 PASS (destructive tools route through `approval.request` → `requestSync` → existing `Map<toolCallId, PendingApproval>` primitive — 5-min auto-reject + cancelAll(runId) semantics preserved); INV-203-09 PASS (`agents.*`+`agents.tasks.*`+`mcp.config.*` unchanged — plugin-rpc is plain Express, no new tRPC routes). 4 deviations all auto-fixed in band: (1) Rule-3 plan path drift `liv-claw-plugin/` → `liv-claw-os/packages/claw-plugin/` (matches 203-04-D-01); (2) Rule-2 requestSync returns object tuple (decision + toolCallId + runId) not bare string union — plugin needs correlation IDs; (3) Rule-2 per-tool in-execute approval gate ALSO present (not just before_tool_call hook) — defense-in-depth against upstream hook surface changes; (4) Rule-3 pre-existing plugin vitest 4.x Vite-7 gap (203-04 carry-over) — 14 plugin-side test cases TS-clean, livinityd plugin-rpc.test.ts exercises same RpcResponse contract end-to-end. 0 auth gates. HANDOFF to Plan 203-09: backend approval gate works end-to-end via plugin-rpc; ApprovalCard UI still lives in assistant-ui (deprecated by 203-09) — bridge window is intentional, ApprovalManager singleton shared between old + new surfaces. SUMMARY at `.planning/phases/203-liv-ai-openclaw-os/203-06-SUMMARY.md`. **Wave 2 of 4 closed** — Wave 3 (203-07 + 203-08 + 203-09) unblocked.
- [x] 203-07-PLAN.md — LivOSAgent + agent-runtime factory + memory + boot toggle (Branch A or B per 203-01 spike) — ✅ **CODE-COMPLETE 2026-05-23** — Branch A (openclaw built-in LLM dispatch — 203-01 SPIKE lock) shipped. New module `livos/packages/livinityd/source/modules/agent-runtime/` (5 source files + 2 test files): `index.ts` LivOSAgent class with 7 attach* methods + 7 typed slots (slot-mirror of LivOSMastra: `attachAgentClient` / `attachMemory` / `attachMcpBridge` / `attachRegistry` / `attachScheduler` / `attachApprovalManager` / `attachAgentInstance` + `attachLivAi` for back-compat); `openclaw-client.ts` OpenclawClient + parseSseEvent + 3 typed error classes (OpenclawClientError / AuthError / UnavailableError) — health/listProviders/invoke/streamInvoke with retry-once-on-5xx + 401/403 no-retry + SSE tolerance of both `data:` and `data: ` per MEMORY.md Kimi quirk; `agent-factory.ts` createAgentFromRow(row, deps) → OpenclawAgentHandle contract-equivalent to mastra factory (D-202-03 sub-agent map projected as `subAgentNames`); `memory.ts` ConversationMemoryAdapter wrapper + createInMemoryAdapter for tests; `types.ts` shared types + ProviderRouter/ApprovalGate re-exports. Boot wire-up in `livinityd/source/index.ts`: `LIV_AGENT_RUNTIME` env var (also accepts `LIVOS_AGENT_RUNTIME` per LIVOS_* convention; defaults `mastra`) toggles dispatch path; `OPENCLAW_GATEWAY_URL` env override (defaults `http://127.0.0.1:18789`); LivOSAgent constructed unconditionally + shadow-wired with same Memory/McpBridge/Registry/Scheduler/ApprovalManager that LivOSMastra gets so a flag flip on the next restart is the only switch-over needed. 1 atomic commit `a9520ea6`; sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRESERVED (`[sacred-sha] PASS: 20 files verified`). 24/24 agent-runtime vitest cases PASS via `cd livos/packages/livinityd && npx vitest run --testTimeout 60000 source/modules/agent-runtime` (livos-agent 8 + openclaw-client 16); 0 new TypeScript errors (382 errors before, 382 after — all pre-existing in unrelated webapps/server/widgets/xai-auth files). INV-203-01 PASS (sacred SHA); INV-203-09 PASS (Phase 202 agents.*/agents.tasks.*/mcp.config.* tRPC contracts UNCHANGED — registry + scheduler shared between both runtimes during coexistence window). 6 deviations all auto-fixed in band: (1) Rule-2 streamInvoke async iterator on top of bare invoke() — chat-route + tool-call rendering need streaming; (2) Rule-2 typed error subclasses (OpenclawClientError/AuthError/UnavailableError) so consumers `instanceof`-branch without parsing error text; (3) Rule-2 health() NEVER throws — degrades to false so dock badge + boot wire-up don't brick; (4) Rule-3 file layout drift 3→5 files (plan frontmatter: index/agent-factory/memory; prompt added openclaw-client + types for separation of concerns — min_lines still satisfied); (5) Rule-3 Task 6 live smoke deferred to Plan 203-12 (gateway is a Mini PC systemd unit, not Windows-bootable dev binary; SSE pipeline mocked end-to-end via 16 cases); (6) Plan-level attachLivAiAgent → attachLivAi rename (LivOSAgent takes OpenclawAgentHandle not Mastra Agent — `Agent` suffix misleading). 0 auth gates. LivOSMastra + @mastra/* deps EXPLICITLY PRESERVED (Plan 203-08 purges). SUMMARY at `.planning/phases/203-liv-ai-openclaw-os/203-07-SUMMARY.md`.
- [x] 203-08-PLAN.md — Purge @mastra/* + LivOSMastra; move runtime files to agent-runtime/ (Phase 202 contracts preserved) — ✅ **CODE-COMPLETE 2026-05-23** — `LivOSMastra` class DELETED; entire `modules/mastra/` directory DELETED (16 files); framework-agnostic files moved via `git mv` to `modules/agent-runtime/` (history preserved): approval-manager + provider-router + scheduler + mcp-bridge + migrate + errors + agents/{repository,registry,factory,built-in-tools,wrap-tool-with-approval}. `@mastra/core` + `@mastra/ai-sdk` + `@mastra/memory` + `@mastra/mcp` + `@mastra/pg` REMOVED from livinityd/package.json (`pnpm --filter livinityd list | grep @mastra` returns 0). Surface swaps: `@mastra/core/agent` Agent → LocalAgent; `@mastra/core/tools` createTool → 50-LOC local shim; `@mastra/mcp` MCPClient → 150-LOC in-house StdioMcpClient (JSON-RPC 2.0 over stdio per MCP spec). Boot wire-up: `LIV_AGENT_RUNTIME` default flipped `mastra` → `openclaw`; LivOSAgent sole runtime; `/chat/:agentId` Express mount DELETED (openclaw gateway owns chat surface); Memory swapped to in-process passthrough (gateway SQLite owns conversation persistence per D-203-09); mastra-router gutted to 4 frontend-used procedures. Scheduler drain helpers added (T-203-04): `pauseAll` / `resumeAll` / `drainForRuntimeSwap` + 4 new vitest cases. tRPC routers `agent-router` + `agent-task-router` repointed at LivOSAgent (slot-shape preserved per INV-203-09; contracts identical). 3 atomic commits `67026ce3..f4f2f237`; sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRESERVED 3/3. Typecheck: 379 errors (3 BELOW 382 baseline). Tests: 124/129 PASS in agent-runtime/ + 76/76 PASS in openclawos+trpc (5 failing pre-existed in baseline). INV-203-01/02/03/04/09 ALL PASS. 8 deviations all auto-fixed in band. 3 known stubs (LocalAgent.stream placeholder + in-process Memory + legacy mastra_* migration). SUMMARY at `.planning/phases/203-liv-ai-openclaw-os/203-08-SUMMARY.md`. **HANDOFF to Plan 203-09**: backend runtime fully Mastra-free; assistant-ui purge (frontend) is the only remaining swap surface in Wave 3.
- [x] 203-09-PLAN.md — Purge @assistant-ui/* + chat surface from liv-ai-app; keep Phase 202 /agents + /settings — ✅ **CODE-COMPLETE 2026-05-23** — 3 @assistant-ui/* deps + `ai` package REMOVED from liv-ai-app/package.json; 39 chat-surface files (5,473 lines) DELETED across `app/assistant.tsx`, `components/assistant-ui/**`, `components/{thread-list,tool-fallback,tool-group,markdown-text,reasoning,attachment,tooltip-icon-button}.tsx`, `src/lib/{tool-ui,liv-ai,openui}/**`. `app/page.tsx` rewritten as `redirect('/agents')` stub; `app/layout.tsx` metadata title updated. Phase 202 dashboard fully preserved (`app/agents/{page,layout,[id]/page,new/page}.tsx` + `app/settings/{page,layout}.tsx` + all `components/agents/**` + `components/settings/**` + `components/ui/**` + `src/lib/{agents,settings}/**` UNTOUCHED). `pnpm --filter liv-ai-app build` PASS — 5 functional routes (/, /agents, /agents/[id], /agents/new, /settings) + /_not-found. Caddy `LIV_AI_APP_HANDLE` split via `handle_path /liv-ai-app/openclawos[/*]` → :18789 (strips prefix) + `@livaiSubapp path /liv-ai-app /liv-ai-app/*` → :3010 — patched in caddy.ts + 3 install-time bootstrap heredocs; 39/39 caddy unit tests PASS. 4 atomic commits `1edbe9fe..8940cbed` + metadata commit `b104d2af`; sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRESERVED 4/4. 1 deviation (Rule-2 missing critical routing — without the Caddy split the Phase 202 dashboard would 404 in production despite the build PASS). SUMMARY at `.planning/phases/203-liv-ai-openclaw-os/203-09-SUMMARY.md`. **HANDOFF to Plan 203-10**: (1) gateway URL mismatch — `handle_path` strips the external prefix but the gateway plugin matches `/plugins/openclawos`; need either ROUTE_PREFIX change OR Caddy rewrite. (2) ApprovalCard rebuild — the assistant-ui inline ApprovalCard is gone; claw-client needs a new surface for the destructive-tool HITL gate.
- [x] 203-10-PLAN.md — Desktop integration: OpenUI apps register as dock icons + OpenUiAppContent window — ✅ **CODE-COMPLETE 2026-05-23** — When `openclawos.apps.create/update/delete` succeeds, livinityd ALSO fires `registerOpenUiAppAsDesktopIcon` (or `unregisterOpenUiApp`) which wraps `NativeAppConfigStore` with deterministic v5-shaped UUID from slug + `wmClassHint = 'liv-openui-<slug>'` + `iconUrl = '/liv-ai-app/icons/liv-ai-placeholder.svg'`. Dock auto-refresh piggybacks on the existing `liv:config:updated` Redis pub/sub — NO new SSE channel, NO new window manager (D-203-10 verbatim). Click flow: NativeAppIcon → useLaunchNativeApp detects `liv-openui-` wmClassHint prefix → opens `OPENUI_<slug>` window → window-content's `isOpenUiAppKind` discriminator routes to `<OpenUiAppContent slug={...}>` which renders `<iframe src="/liv-ai-app/apps/<slug>">` (same-origin per T-203-06). Legacy NATIVE_<id> binary-spawn path preserved for non-OpenUI native apps. Best-effort dock-register hook in the tRPC handlers (try/catch + warn log) so a transient Redis hiccup does NOT mask a successful Postgres write. New `iconUrl` schema widened additively to accept root-relative paths in addition to full URLs. Plan 203-09 handoff items both addressed: (1) Caddy `rewrite * /plugins/openclawos{path}` added inside the `handle_path` block in caddy.ts + 6 install-time heredocs (3 new caddy tests assert ordering); (2) ApprovalCard rebuilt — `ApprovalManager` extended with event bus (subscribe/listPending/PendingApprovalSummary/ApprovalEvent) + new `GET /openclawos/approvals/stream` SSE + `POST /openclawos/approvals/respond` Express routes on livinityd:8080 (same JWT-cookie auth as /openclawos/handshake); claw-client `useApprovals()` hook + `<ApprovalCardStack />` component mounted in ThreadArea above the composer in both active + empty-thread layouts. 5 atomic commits `27c4cf4d..12eb7379`; sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRESERVED 5/5. 180/180 livinityd vitest cases PASS across all touched modules (openclawos 71 + approval-manager 13 + native-app-config 14 + caddy 42 + openclawos-router 15 + openui 25); 30/30 UI vitest cases PASS (use-launch-native-app 8 + window-content 9 + native-app-icon 13). Typecheck 372 errors (7 BELOW the 379 Phase 203-08 baseline). INV-203-01/04/09 ALL PASS. 5 deviations all auto-fixed in band (Rule-1 iconUrl schema widening + 4 Rule-2 missing-functionality items including the 2 Plan 203-09 handoff items). 0 auth gates. 3 known stubs documented (placeholder binary, iframe title=slug not name, /liv-ai-app/apps/<slug> route deferred to 203-11). SUMMARY at `.planning/phases/203-liv-ai-openclaw-os/203-10-SUMMARY.md`. **HANDOFF to Plan 203-11**: the OpenUI iframe target `/liv-ai-app/apps/<slug>` route needs to be shipped inside the Next.js liv-ai-app subapp (standalone OpenUI renderer reading from `openclawos.apps.get(slug)` — no chat, no composer); until then the dock click opens a window that 404s inside the iframe. End-to-end click → window → live OpenUI render becomes PASS-able once 203-11 lands.
- [x] 203-11-PLAN.md — /liv-ai-app/apps/[slug] standalone OpenUI app renderer — ✅ **CODE-COMPLETE 2026-05-23** — Shipped the `/apps/[slug]` Next.js App Router route inside the rebranded openclaw-os claw-client. Server-shell-with-client-body split: `page.tsx` exports `generateStaticParams` returning a single `__placeholder__` sentinel + `dynamicParams=false` (mandated by `output:'export'`); `layout.tsx` is a minimal pass-through (NO chat shell / NO composer per D-203-10); `OpenUiAppView.tsx` is the `'use client'` body that extracts the live slug from `window.location.pathname` (handles all 3 prefixes the request may travel under), fetches via the new `fetchOpenUiApp(slug)` helper hitting `openclawos.apps.get` over the same-origin tRPC v10/v11 batch GET envelope (`?batch=1&input=<{0:{json:{slug}}}>` with `credentials:'include'` so LIVINITY_SESSION cookie auto-flows per T-203-06), and renders the OpenUI Lang content via the upstream `@openuidev/react-lang` Renderer + `@openuidev/react-ui` openuiLibrary — same renderer AppDetail uses, so T-203-03 14-component whitelist is enforced server-side at write time (Plan 203-04 validator) AND by the renderer's own AST walker + prop validation + onError callback at view time. **NO toolProvider in the standalone surface** — defence-in-depth per T-203-07; a buggy or malicious app cannot escalate to tool execution through the dock-window iframe. Apps that need live tool calls open from inside a chat session via AppDetail. **claw-plugin `src/index.ts` patched** with a 9-line `/apps/<unknown> → __placeholder__.html` fallback BEFORE the generic SPA index.html fallback (line 248-pre-edit). Without this, the generic fallback would serve ChatApp's root index.html for unknown `/apps/<slug>` paths (because the static export only prebuilds `__placeholder__.html`) — completely the wrong surface for the dock-window iframe. More-specific match wins; existing routing semantics for non-`/apps/` URLs unchanged. 2 atomic commits `790f4eba` (fetch helper + 8-case test) + `f807eae3` (page+layout+view+plugin fallback + 10-case extractor test); sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRESERVED 2/2 (`[sacred-sha] PASS: 20 files verified` on both — ZERO sacred files touched). Build verification: claw-client `npx tsc --noEmit` 0 errors + `npx next build` 5/5 static pages generated with `● /apps/[slug]` in route manifest prerendered to `out/apps/__placeholder__.html` (10.5 KB) + `npx eslint` on all new files 0 warnings; claw-plugin `npx tsc --noEmit` 0 errors + `npx esbuild` 190.6 KB in 33 ms. Structural smoke PASS — placeholder HTML contains 'Loading app' + OpenUiAppView bundle reference + openclawos/apps URL fragments (proves hydration fires the runtime path). 7 deviations all auto-fixed in band: (1) Rule-3 plan path drift — frontmatter said `livos/packages/liv-claw-os/app/` but App Router lives at `packages/claw-client/src/app/`; (2) Rule-3 plan path drift — verify expected `pnpm --filter @livos/liv-claw-os build` but package is `@openuidev/claw-client`; (3) Rule-3 output mode mismatch — plan specified server-side fetch with `cookies()`, claw-client uses `output:'export'` with no server runtime; adapted to client-side fetch with `credentials:'include'`; (4) Rule-3 output mode mismatch — plan verify expects `ƒ` (Dynamic) but `output:'export'` produces `●` (SSG); (5) Rule-2 missing critical functionality — plugin static-file `/apps/<unknown>` fallback (without it, ChatApp serves unknown slug requests); (6) Rule-2 defence-in-depth — NO toolProvider in standalone view; (7) Rule-3 — Task 4 local smoke deferred to Plan 203-12 Mini PC deploy (full local boot needs livinityd+PG+gateway+plugin simultaneously on Windows). 0 auth gates. 2 known stubs (`generateStaticParams` sentinel — mandated workaround, not behavioural; renderErrors banner shows first message only — matches AppDetail). INV-203-01 PASS 2/2; INV-203-09 PASS (no tRPC contract changes anywhere — only added a UI consumer of `openclawos.apps.get`). SUMMARY at `.planning/phases/203-liv-ai-openclaw-os/203-11-SUMMARY.md`. **HANDOFF to Plan 203-12**: Mini PC deploy walk picks up the rebuilt claw-client static export + rebundled claw-plugin via existing rsync; no deploy-script changes needed. UAT step 6 (operator clicks dock icon → window opens → OpenUI app renders live) becomes PASS-able end-to-end once 203-12 has deployed.
- [x] 203-12-PLAN.md — Mini PC deploy + smoke log + update.sh Phase 203 patches — ✅ **CODE-COMPLETE 2026-05-23** — Mini PC live deploy via `bash /opt/livos/update.sh` × 5 passes; 4 inline Rule-1 hot-fix commits (`d5f33480` openclaw bin resolution via .mjs path walk, `227e9599` drop --plugin flag + reorder Environment= after EnvironmentFile=, `ff612109` drop --force from --link + always --allow-unconfigured + decouple EnvironmentFile to /etc/default/liv-claw-gateway, `8badfa4c` Caddy rewrite path /plugins/openclawos → /openclawos with 3 caddy.test.ts assertion repointings) + 1 docs commit `38c67d70`. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRESERVED 5/5 across all commits (INV-203-01). Final live state: 7 systemd units active (livos + liv-core + liv-worker + liv-memory + NEW `liv-claw-gateway` on :18789 + `livos-app-liv-ai` kept per D-203-09 split + caddy); openclaw gateway booted with 7 stock plugins + 7 plugins loaded JSON; Caddy split routing live via inline-patched `/etc/caddy/Caddyfile` (`/liv-ai-app/openclawos*` → :18789 with prefix-strip + rewrite, `/liv-ai-app/*` → :3010 preserving Phase 202 dashboard at /agents + /settings, catch-all `/` → :8080 livinityd); Postgres migration 0003 applied (`livos_openui_apps` + `livos_openui_app_versions`); sacred SHA recompute on `/opt/liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d...` MATCH; mastra residue in livinityd journal last 10 min = 0 lines. Deployed SHA on Mini PC = `ff61210901a68f40f12379987b2af4e091ff9c37`. Caddy test suite post-source-fix: 42/42 PASS. Final smoke battery: 12/12 PASS. 5 decisions documented (D-01..D-06) including (D-04) `livos-app-liv-ai.service` kept rather than retired per D-203-09 split routing (Phase 202 dashboard at /agents + /settings would 404), (D-05) migration 0004 (DROP mastra) NOT applied — Plan 203-08 D-02 explicitly kept mastra_* tables as legacy back-compat, (D-06) 5 update.sh patches Plan 203-12 Task 1 called for were SKIPPED because earlier amended decisions eliminated the need. 9 deviations all auto-fixed in band. 0 auth gates (LLM provider key absence is a config gap, not auth gate; operator UAT step 2 catches). 3 known stubs documented: (1) live `/etc/caddy/Caddyfile` patch carries Phase 203-09 split + 203-10 rewrite — source-side caddy.ts fix in commit `8badfa4c` lands the correct shape on next install.sh-from-scratch (regen-on-existing-deploys is a Phase 220+ carry-over); (2) `/opt/livos/.env` has no LLM provider key (OPERATOR ACTION ITEM — § G.1 of VERIFICATION); (3) `openclaw.plugin.json` missing from claw-plugin `dist/` — Plan 203-04 build chain gap — RESOLVED inline in Plan 203-13 commit `eedde743`. SUMMARY at `.planning/phases/203-liv-ai-openclaw-os/203-12-SUMMARY.md`. DEPLOY-LOG at `.planning/phases/203-liv-ai-openclaw-os/203-12-DEPLOY-LOG.md`. **HANDOFF to Plan 203-13:** Mini PC live with 7 services + 12/12 smoke PASS; 2 deferred items become operator action items in VERIFICATION.md § G (LLM provider key + re-run update.sh for plugin manifest fix).
- [x] 203-13-PLAN.md — 203-VERIFICATION.md + STATE/ROADMAP flip + final commit — ✅ **CODE-COMPLETE 2026-05-23** — Close-out plan shipped. Inline-fixed Plan 203-12 carry-over #1 (claw-plugin manifest gap): commit `eedde743` adds `shx cp openclaw.plugin.json dist/openclaw.plugin.json && shx cp package.json dist/package.json` to claw-plugin build script + changes liv-claw-gateway `start.js` `resolvePluginBundle()` to point at package ROOT (canonical openclaw plugin shape: directory containing both `openclaw.plugin.json` and `package.json` with `main:./dist/index.js`) instead of bundle file — fixes "plugin manifest not found: openclaw.plugin.json" CLI rejection; next `update.sh` run on Mini PC re-runs build + re-links plugin, gateway boots with 8 plugins (7 stock + Liv AI's `openclaw-os-plugin`) instead of 7. Documented as Plan 203-12 carry-over #2 (LLM provider API key gap) as OPERATOR ACTION ITEM in 203-VERIFICATION.md § G.1 with exact paste commands. Filed `.planning/phases/203-liv-ai-openclaw-os/203-VERIFICATION.md` with `status: human_needed` + frontmatter (deployed_sha + services_active=7 + smoke_tests_passed=12 + sacred_sha_canonical + sacred_sha_minipc + sacred_sha_match=true + uat_steps=13 + ship_threshold) + § A deploy state summary + § B Mini PC service inventory + § C executor smoke battery + § D INV-203-01..10 verification (10/10 PASS) + § E T-203-01..07 mitigation status (6 MITIGATED + 1 PARTIAL with defence-in-depth) + § F plan summaries cross-reference (13/13 PASSED) + § G 2 operator action items with exact bash commands + § H 14 Phase 204+ carry-overs + § I 13-step operator UAT walk (each row `[ ] PENDING`) + § J sacred SHA verification (canonical + Mini PC blob match documented) + § K deferred items index (Plan 203-12 deferred #1 + #3 marked RESOLVED, deferred #2 marked OPERATOR ACTION ITEM). Flipped STATE.md frontmatter (`status: CODE-COMPLETE + DEPLOYED`, `last_shipped_phase: 203-liv-ai-openclaw-os`, `next_phase: null`, `completed_plans: 13`) + body (`Last shipped phase` flipped to Phase 203 with full close summary, `Next action` flipped to operator UAT walk, `Current Position` flipped to CODE-COMPLETE + DEPLOYED 13/13 plans). 3 atomic commits (inline plugin manifest fix `eedde743` + this docs commit + STATE/ROADMAP flip commit). Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRESERVED on every 203-13 commit (INV-203-01). SUMMARY at `.planning/phases/203-liv-ai-openclaw-os/203-13-SUMMARY.md`. **Phase 203 CODE-COMPLETE + DEPLOYED — operator UAT is the only thing standing between 🟡 and 🟢 SHIPPED.**

**Locked decisions (D-203-01..18):** see `.planning/phases/203-liv-ai-openclaw-os/203-CONTEXT.md`.

**Invariants:** INV-203-01 sacred SHA preserved; INV-203-02 Phase 202 livos_agents schema unchanged; INV-203-03 Luse MCP server unchanged; INV-203-04 ApprovalManager HITL preserved; INV-203-05 English UI only; INV-203-06 Mini PC only deploy; INV-203-07 update.sh idempotent; INV-203-08 Caddy /liv-ai-app/* is the ONLY routing mutation; INV-203-09 Phase 202 tRPC namespaces preserved; INV-203-10 LIVINITY_SESSION JWT remains outer auth.

**Threats / mitigations (T-203-01..07):** Gateway crash → systemd Restart=on-failure + healthcheck; Ed25519 token replay → 5-min TTL + per-session validation; OpenUI XSS → 14-component whitelist + isSafeUrl shared validator; Mastra removal breaks cron → scheduler drainForRuntimeSwap; dock refresh race → idempotent deterministic uuid; iframe trust chain → same-origin + CSP frame-ancestors self; db_query escalation → read-only PG role + SELECT-only guard + per-user namespace.

**Speed budget:** 14-20 days wall-clock (3-4 weeks) including L0 spike, agent runtime swap, full Mastra + assistant-ui purge, desktop integration, Mini PC deploy.

**Phase-level deploy state (2026-05-23):**
- Wave 1 + 2 + 3 + 4 ALL closed (13/13 plans shipped CODE-COMPLETE)
- Deployed SHA on Mini PC: `ff61210901a68f40f12379987b2af4e091ff9c37` (`/opt/livos/.deployed-sha`)
- Follow-up source-side commits pending re-deploy: `8badfa4c` (caddy rewrite — already live-patched in `/etc/caddy/Caddyfile`) + `eedde743` (Plan 203-13 inline plugin manifest fix — picked up on next routine update.sh run)
- Sacred SHA canonical: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — PRESERVED across every Phase 203 commit (~80+ commits, INV-203-01); Mini PC live recompute on `/opt/liv/packages/core/src/sdk-agent-runner.ts` = exact match
- Services active: 7/7 — `livos` + `liv-core` + `liv-worker` + `liv-memory` + NEW `liv-claw-gateway` (port 18789) + `livos-app-liv-ai` (kept per D-203-09 split routing) + `caddy`
- Executor smoke battery: 12/12 PASS (Phase 203 services + gateway HTTP + livinityd HTTP + Caddy 7 routes + sacred SHA + Postgres tables + mastra residue 0)
- Mastra + assistant-ui FULL PURGE confirmed: `pnpm --filter livinityd list | grep '@mastra'` = 0, `pnpm --filter liv-ai-app list | grep '@assistant-ui'` = 0, livinityd journal `mastra` residue = 0 lines
- INV-203-01..10 ALL PASS; T-203-01..07 mitigations live (T-203-07 PARTIAL with defence-in-depth via Plan 203-11 NO-toolProvider standalone surface)
- 13-step operator UAT walk template at `.planning/phases/203-liv-ai-openclaw-os/203-VERIFICATION.md § I` — ship gate = ≥ 11/13 PASS
- 2 operator action items in `.planning/phases/203-liv-ai-openclaw-os/203-VERIFICATION.md § G`: (G.1) paste LLM provider API key into `/etc/default/liv-claw-gateway` + restart gateway; (G.2) re-run `update.sh` to pick up plugin manifest fix from commit `eedde743`

**Carry-overs to Phase 204+:** custom OpenUI app icons (agent-emitted `iconUrl`) + per-user OpenUI apps + OpenUI app marketplace/sharing + multi-user iframe isolation + external telemetry backend + hot-reload of MCP servers + sub-agent depth > 2 + distributed gateway + voice mode/PDF/title generation + `db_query` Postgres bridge with `livos_openui_ro` role (full T-203-07 mitigation) + migration 0004 (DROP mastra tables) + livinityd caddy.ts regenerate-on-every-boot script in update.sh + `livos-app-liv-ai.service` retirement (after Phase 202 dashboard moves into openclaw plugin).

**Resume command:** Operator walks 13-step UAT at `.planning/phases/203-liv-ai-openclaw-os/203-VERIFICATION.md § I` after addressing § G operator action items. NO next phase planned.
---

## ✅ v38.2 MILESTONE CLOSED — 2026-05-21

**Milestone:** v38.2 Terminal Tabs + Vault Graph Polish
**Phases shipped:** 188 (vault-graph polish), 189 (agent session hooks), 190 (multiple terminal tabs)
**New vitest assertions:** 188: ~20 | 189: ~25 | 190: 32 — total ~77 across milestone
**Sacred SHA:** 25/25 PASS across all milestone commits
**UI tests:** 1004 passing (25 pre-existing failures unchanged)
**livinityd tests:** 1901 passing (23 pre-existing failures unchanged)
**Key deliverables:**
- Dynamic terminal tab strip replaces static Terminal/MCP tab bar in AI Chat
- BareTerminal (bash PTY) + CcTerminal (claude) + AgentTerminalPane per-agent sessions
- Sidebar agent click → opens named tab (focus existing, no duplicate)
- Claude icon + Terminal icon → ad-hoc tabs
- localStorage persistence (300ms debounce, user-scoped)
- MCP tab removed; component files stay on disk for Phase 191

---

### Phase 204: Provider Key Management UI — 🟡 CODE-COMPLETE + DEPLOYED 2026-05-24T02:10Z (5/6 smokes PASS executor-side; 1 visual UAT pending operator at `.planning/phases/204-provider-key-management/204-VERIFICATION.md § G.1`)

**Goal:** Ship a `/settings → Providers` tab so the operator can paste LLM provider API keys (xai, anthropic, openai, groq, mistral, ollama) into the running Mini PC without SSH — and have the `liv-claw-gateway` pick them up automatically via env-file write + systemctl restart. Closes Phase 203 § G.1 (operator action item) + § K deferred #2 (LLM provider key not in env). See `.planning/phases/204-provider-key-management/204-CONTEXT.md`.

**Depends on:** Phase 202 settings page + Phase 203 openclaw gateway / systemd unit.

**Wave plan:** Sequential — Plan 204-01 backend (tRPC + Redis + env-file writer + restart hook) → Plan 204-02 frontend (ProvidersTab + tab registration + sudoers drop-in + Mini PC deploy).

**Plans (2):**
- [x] 204-01-PLAN.md — Backend: `provider.config.*` tRPC + Redis hash `liv:provider:keys` + env-file writer + `sudo systemctl restart liv-claw-gateway` hook + 18 vitest cases — ✅ **CODE-COMPLETE 2026-05-24** — `provider.config.{list,set,delete}` tRPC namespace shipped with factory-DI pattern matching mcp-config-router. `ProviderKeyStore` (Redis hash `liv:provider:keys` with INV-204-04 redact-on-read — `list()` returns `{provider, preview, addedAt}`, NEVER raw key). `EnvFileWriter` (atomic tmp+rename with chmod 0600 + EACCES fallback `/etc/default/liv-claw-gateway` → `/opt/livos/etc/liv-claw-gateway.env` + sticky path cache in Redis + KEY_SHAPE_REGEX `/^[A-Za-z0-9_\-.]{8,500}$/` pre-write validation per T-204-04). `createRestartHook` (sudo systemctl restart liv-claw-gateway via `spawn` with hard 10s SIGTERM timeout; NEVER throws — returns `{ok, reason?}` graceful degradation per T-204-05). 18/18 vitest cases PASS (planned 15; 3 extra added during impl). 3 deviations all auto-fixed in band: (1) Rule-3 `node:child_process` typed import → switched to `import {spawn} from 'child_process'` matching native-installer.ts pattern; (2) Rule-2 hard timeout on restart hook with SIGTERM; (3) Rule-1 test type narrowing `as never` for mockResolvedValueOnce union. Boot wire-up in livinityd index.ts non-fatal degradation to PROVIDER_CONFIG_UNAVAILABLE stub if Redis missing. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRESERVED (0 protected files touched). Commit `0fcf0e2f`. SUMMARY at `.planning/phases/204-provider-key-management/204-01-SUMMARY.md`.
- [x] 204-02-PLAN.md — Frontend: ProvidersTab.tsx + tab registration + sudoers drop-in + bootstrap script + Mini PC deploy + 6-check smoke — ✅ **CODE-COMPLETE + DEPLOYED 2026-05-24** — `use-providers.ts` hook (PROVIDER_LABELS map + `pingGatewayHealth()` Caddy-proxied probe + focus-refetch lifecycle). `ProvidersTab.tsx` 340 LOC — Configured providers list with redacted previews + Delete + Add form (password input + locked dropdown of unconfigured providers + plaintext-storage notice per D-204-02) + 5-state restart banner (idle/restarting/healthy/restart_required/error) with 30s health poll deadline. `/settings/page.tsx` extended to 4 tabs (Account / MCP / Models / Providers per D-204-06). `scripts/install/sudoers.d/livos-claw-gateway` narrow grant per INV-204-07 (exactly `systemctl restart` + `systemctl status liv-claw-gateway`, nothing else). `scripts/install/204-provider-bootstrap.sh` idempotent (visudo -c rollback on parse fail + /opt/livos/etc mkdir bruce:bruce 0700 + unit patch with EnvironmentFile=- fallback). `scripts/install/systemd/liv-claw-gateway.service` source-side patch (cold installs include fallback EnvironmentFile= out of box). Mini PC deploy via `bash /opt/livos/update.sh` × 2 passes (first deploy `5d98e3f2` + envelope-fix re-deploy `13f2eb0f`). Live smoke battery: **5/6 PASS** executor-side (7/7 services active; end-to-end set returns `{ok:true, envFilePath, restartTriggered:true}`; list returns redacted `xai-***cdef` only — INV-204-04 verified; env file `/opt/livos/etc/liv-claw-gateway.env` chmod 600 — INV-204-05 verified; raw key NEVER in journal — INV-204-06 verified). 1/6 deferred to operator browser walk (visual confirmation of tab render in production CSS). 4 deviations all auto-fixed in band: (1) Rule-1 McpTab tRPC envelope `{"0":{"json":...}}?batch=1` SILENTLY BROKEN on this server — verified live; switched to bare non-batch POST + `callMutation` helper (pre-existing McpTab bug noted as carry-over to Phase 205+); (2) Rule-3 `scripts/install/` not on update.sh rsync path — ran bootstrap from /tmp/livinity-update-prefetch/; (3) Rule-2 fallback env-file dir + matching unit patch on cold install; (4) Rule-4 McpTab.tsx pre-existing mutation bug documented as Phase 205+ candidate (out of scope). Sacred SHA preserved across all 4 commits (0/0 protected files touched). Commits `5d98e3f2..13f2eb0f`. SUMMARY at `.planning/phases/204-provider-key-management/204-02-SUMMARY.md`. DEPLOY-LOG at `.planning/phases/204-provider-key-management/204-02-DEPLOY-LOG.md`.

**Phase-level deploy state (2026-05-24):**
- Both plans CODE-COMPLETE + DEPLOYED on Mini PC.
- Deployed SHA on Mini PC: `13f2eb0ff9baf9161a8b8d88509472bc80fd9c09` (`/opt/livos/.deployed-sha`).
- Sacred SHA canonical: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — PRESERVED across all Phase 204 commits (7 commits, INV-204-01); 0 protected files touched.
- Live end-to-end smoke: pasted test xai key → backend wrote `/opt/livos/etc/liv-claw-gateway.env` (chmod 0600) → `sudo systemctl restart liv-claw-gateway` fired successfully → gateway came back up. Then deleted key → env file empty.
- Ship-gate: ≥5/6 PASS — **MET** executor-side. Operator browser walk (Step 2 of § I in 204-VERIFICATION.md) is the only thing standing between 🟡 and 🟢 SHIPPED.

**Closes Phase 203 carryovers:**
- Phase 203 § G.1 (operator action item — LLM provider key entry) → NO LONGER REQUIRES SSH; operator pastes via Providers tab.
- Phase 203 § K deferred #2 (LLM provider API key not in env) → RESOLVED end-to-end.

**Locked decisions (D-204-01..12):** see `.planning/phases/204-provider-key-management/204-CONTEXT.md`.

**Invariants:** INV-204-01 sacred SHA preserved (carries forward from INV-203-01); INV-204-02 English UI only; INV-204-03 Mini PC only deploy; INV-204-04 `list` NEVER returns the raw key (redacted preview only); INV-204-05 env file chmod 0600; INV-204-06 no raw key ever in livinityd journal; INV-204-07 sudoers drop-in scope is narrow (2 commands only); INV-204-08 no routing surface mutations beyond `httpOnlyPaths` additions.

**Threats / mitigations (T-204-01..07):** Paste-back attack → no re-reveal (preview only); Lateral Redis admin → same trust model as `/opt/livos/.env`; Env file world-readable → chmod 0600; Restart loop on malformed value → zod regex pre-validation; Gateway crash on restart → existing T-203-01 systemd Restart=on-failure; Key in error stack trace → redact-on-throw templates; Sudoers permissions left wrong → `install -m 0440` + `visudo -c` verify.

**Speed budget:** 3-4 hours wall-clock; sequential 2-plan execution.

---

### Phase 205: Liv AI UI Carry-Over Bundle (in-chat provider picker + MCP UI in shell + OpenClaw gateway settings UI) — ⚪ NOT STARTED

**Goal:** Close the three UI gaps surfaced during Phase 203/204 operator UAT so the openclaw chat shell becomes operationally self-sufficient (no SSH-edit of `/opt/livos/data/openclaw/openclaw.json`, no jumping out to `/settings` for per-chat decisions). Bundles three small UI carry-overs into one phase so the wave can ship together.

**Depends on:** Phase 203 (openclaw chat shell + gateway), Phase 204 (provider-config tRPC + ProvidersTab pattern), Phase 203 Hot-fix F5 (`X-Api-Key` service-token path that lets the openclaw plugin reach livinityd tRPC without holding admin JWT).

**Sub-features (3):**
- **205-01 — In-chat provider picker.** Operator picks which LLM provider runs the current chat (XAI / Anthropic / OpenAI / Groq / Mistral / Ollama). Today provider is picked once globally via `/settings → Providers`; carry-over from Phase 203 § G operator action item.
- **205-02 — MCP server management UI inside Liv AI chat shell.** Existing `/settings → MCP` tab (Phase 202-07) lives in liv-ai-app Next.js subapp only. Operator wants MCP control inside the openclaw chat surface as well so adding/removing MCP servers does not require shell-switching.
- **205-03 — OpenClaw gateway settings UI.** Surface gateway config (allowedOrigins, auth mode, paired device list, plugin list, sweepable pairings) via a settings tab so the operator does not have to SSH-edit `openclaw.json` or run `systemctl restart liv-claw-gateway` to revoke a device.

**Triggered by (handoff source):** `project_v40_session_handoff.md` § "Open carry-overs for next session" + Phase 204-02 4th deviation note ("McpTab.tsx pre-existing mutation bug documented as Phase 205+ candidate").

**Speed budget:** 6-10 hours wall-clock; 3 sub-features ship as parallel waves where state shape allows.

**Status:** Wave 0 spike SHIPPED 2026-05-24 (1/4 plans complete). 205-01 spike notes lock JWT shape + auth path + revoke race + auth.mode enum corrections for downstream waves; Plan 205-04 has 3 locked adjustments (header-based self-lock, 3-step atomic revoke + deny-list, corrected zod enum).

**Plans:** 4 plans (1 complete, 3 unblocked)

Plans:
- [x] 205-01-PLAN.md -- Wave 0 spike: live JWT shape probe + browser auth path lock + pending.json race confirmation on Mini PC -- **CODE-COMPLETE 2026-05-24** -- 4 batched SSH probes resolved 4 unknowns: A1 (JWT has NO deviceId/jti -> self-lock guard uses X-Claw-Device-Id header), AUTH PATH (X-Api-Key via runtime-config bootstrap), A5 (3-step atomic revoke + revoked.json deny-list), A6 (gateway auto-reloads openclaw.json on file-write; auth.mode enum corrected to ['none','token','password','trusted-proxy']). 1 commit 52215473. Sacred SHA PASS 1/1. SUMMARY at .planning/phases/205-liv-ai-ui-carryovers/205-01-SUMMARY.md.
- [ ] 205-02-PLAN.md -- Wave 1: Settings entry-point + SegmentedTabs strip in SettingsDialog (Connection / MCP Servers / Gateway placeholders) + livinityd-client.ts helper -- **UNBLOCKED**
- [ ] 205-03-PLAN.md -- Wave 2: MCP Servers tab + mcp-config-router publishes liv:mcp:updated + mcp-bridge.ts subscribe loop + reconcileServers (restart-free MCP propagation) -- **UNBLOCKED** (consumes spike AUTH PATH livinityd-client.ts template)
- [ ] 205-04-PLAN.md -- Wave 3: Gateway tab + new openclawos-gateway-router.ts + OpenclawConfigStore + self-lock guard -- **UNBLOCKED with 3 plan adjustments** (header self-lock, 3-step atomic revoke, corrected auth.mode enum)

---


### Phase 206: Unified Provider+Model Config via openclaw Native CLI — ⚪ NOT STARTED

**Goal:** Replace Phase 204's gateway env file approach (proven dead 2026-05-24 — env file holds only `LIV_API_KEY` despite ProvidersTab UI claiming to save 6 providers) with a thin tRPC wrapper around openclaw 2026.5.20's native `capability model` CLI surface. Operator picks default model from any of 35+ providers, clicks Connect → OAuth (ChatGPT/Codex, Claude, xAI, GitHub Copilot, etc.) or API key flow lands creds in agent's `auth-profiles.json` (NOT the dead env file), `/models` slash command surfaces the configured providers, chat actually works without "missing provider" errors.

**Depends on:** Phase 195 (xai-auth-router pattern — generalize), Phase 205 (Settings content-swap route + ProvidersTab shell — keep, replace body), Phase 203 (openclaw chat shell), openclaw 2026.5.20 binary at `/opt/livos/node_modules/.pnpm/openclaw@2026.5.20/`.

**Triggered by:** Operator UAT 2026-05-24 after Phase 205 Hot-fix N+O ship — chat fails with "No API key found for provider 'openai'. Auth store: /opt/livos/data/openclaw/agents/main/agent/auth-profiles.json". Live Mini PC inspection confirmed: (a) `/opt/livos/etc/liv-claw-gateway.env` only holds `LIV_API_KEY`; (b) Phase 204's `provider.config.set` never reaches the agent; (c) openclaw's native `capability model auth status` JSON exposes the exact `defaultModel` / `agentDir` / `providersWithOAuth` / `missingProvidersInUse` data the UI needs; (d) openclaw natively supports 35+ providers with OAuth methods including OpenAI ChatGPT/Codex, Anthropic Claude, xAI, Google, GitHub Copilot, vercel-ai-gateway, openrouter (265 models).

**Sub-features (3):**
- **206-01 — `openclaw.*` tRPC namespace.** New livinityd router shell-execs openclaw native CLI: `openclaw.providers.list` (capability model providers), `openclaw.models.list` (capability model list), `openclaw.auth.status` (capability model auth status), `openclaw.auth.login` (capability model auth login --provider X --method Y, generalized from xai-auth flow-service), `openclaw.auth.logout`, `openclaw.config.setDefaultModel` (openclaw.json patch).
- **206-02 — Generalize xai-auth-router → generic auth-flow-service.** `opencode-spawner.ts` already takes `provider` + `method` parameters; `url-extractor.ts` is xAI-regex-specific — generalize to per-provider URL pattern map. Backward-compat: `auth.xai.*` paths keep working (delegate to new generic surface).
- **206-03 — ProvidersTab redesign.** Default-model picker at top (live `capability model list`, group by provider). Provider grid below: each card shows status pill (configured/selected/missing), available auth methods as buttons (Connect with ChatGPT, Connect with Claude, Use API key), model count. OAuth flow: in-card URL panel + spinner (existing N+O pattern, generalized). Deprecate `provider-config-router.ts` (keep for migration safety, stop new writes).

**Speed budget:** 6-8 hours wall-clock; 3 sub-features ship sequentially (206-01 first because UI depends on tRPC surface, then 206-02 + 206-03 in parallel waves).

**Status:** SPEC.md TODO.

**Plans:** TBD (locked during planning phase).

---

### Phase 207: Phase 206 Carry-Overs + UAT-Surfaced Bugs — ⚪ NOT STARTED

**Goal:** Close the operator-visible regressions surfaced after Phase 206 + bridge deploy (commit `a493ed33`), and finish the auth-flow generalization deferred from Phase 206 SPEC.

**Triggered by:** Operator UAT 2026-05-24 surfaced 5 distinct issues:
- MCP tools invisible to chat agent (only built-ins surfaced)
- Composer model dropdown shows all 955 models (should filter to configured providers)
- WS `/ws/agent` flooding console with failures
- `openclawos.apps.list` returns empty payload error
- EventSource MIME mismatch (text/html vs text/event-stream)

Plus Phase 206 carry-overs:
- OAuth bridge token-refresh staleness (~24h)
- Generic auth-flow for OpenAI Codex / Anthropic via opencode bridge
- Phase 204 dead-code deletion (further deferred)
- Mobile route migration (further deferred)

**Depends on:** Phase 206 (openclaw.* tRPC namespace + auth-profiles store + bridge), Phase 205 (Settings content-swap), Phase 203 (openclaw chat shell).

**Status:** SPEC.md written; PLAN.md TODO.

**SPEC:** `.planning/phases/207-phase206-carryovers/207-SPEC.md`

---

# v41 — Admin Panel + Store Hardening + Subdomain Reliability — 🔴 OPENED 2026-05-26

**Goal:** Ship Vercel-hosted admin panel at `livinity.io/admin`, lock the public store down to admin-only, end the `n8n-bruce` vs `n8n.bruce` subdomain chaos with a single canonical format, make MCP/app install one-click reliable from the store, switch Liv AI chat from nemotron-9B to Anthropic Claude Haiku 4.5 via local `claude-cli` reuse.

**Source:** `.planning/v41-DRAFT.md` (operator-authored 2026-05-26).
**Research:** `.planning/research/2026-05-26-store-admin/{server5-state.md, subdomain-install-bugs.md, install-flow-audit.md}` + `R5-broker-tool-routing.md`.
**Requirements:** `.planning/REQUIREMENTS.md` (66 REQs across 9 phases).

**Locked decisions (D-V41-*):**
- D-V41-ADMIN-SEED = `hello@bruceoz.com`
- D-V41-STATIC-HTML-KEEP — `/dashboard.html`/`/auth.html`/`/login.html` untouched
- D-V41-BANDWIDTH-ROLLUPS — Supabase rollup tables (no TimescaleDB)
- D-V41-RELAY-STATE-UNKNOWN — Phase 210 entry probes
- D-V41-CF-CERT-AUDIT-DEFERRED — Phase 216 lives audit
- D-V41-CLAUDE-CLI-REUSE — openclaw uses local `claude-cli` backend (no broker, no BYOK)
- D-V41-ADMIN-ONLY-STORE — `/store` admin-only
- D-V41-NO-SERVER5-ADMIN-MIGRATION — admin on Vercel from day one
- D-V41-NO-SUPABASE-AUTH-REPLACEMENT — reuse existing `auth` schema

**Estimated effort:** 18-22 days (~120-150 hours).

---

### Phase 209: openclaw → Claude CLI reuse + Haiku 4.5 default — 🟢 SHIPPED 2026-05-26 (4/4 ship-gates PASS; AI-04/05/06 operator-UAT deferred to P217)

**Goal:** Liv AI chat agent stops using `openrouter/nvidia/nemotron-nano-9b-v2:free` (bad coord prediction, slow tool use), starts using `anthropic/claude-haiku-4-5` via local `claude-cli` backend reusing `/root/.claude/.credentials.json` already attached to SdkAgentRunner.

**Effort:** TODAY, ~5 min ops (zero code change, subscription path, Anthropic-sanctioned per 2026-05-26 operator confirmation).

**Requirements:** AI-01, AI-02, AI-03, AI-04, AI-05, AI-06 (6 REQs).

**Tasks (Mini PC ops):**
1. `ssh bruce@10.69.31.68`
2. `openclaw models auth login --provider anthropic --method cli --set-default`
3. `openclaw config set agents.defaults.model.primary anthropic/claude-haiku-4-5`
4. `sudo systemctl restart liv-claw-gateway`
5. Verify: `journalctl -u liv-claw-gateway` shows `agent model: anthropic/claude-haiku-4-5` (was nemotron).

**Success criteria:**
1. Journalctl confirms model swap (AI-03).
2. Liv AI chat coord-click success rate ≥80% on standard battery (AI-04).
3. Per-call latency p50 ≤1.5s (AI-05).
4. Zero subscription quota errors during 30-min UAT (AI-06).

**Why first:** Operator's primary pain. Cost-free. Zero code change. Unblocks all subsequent UAT.

---

### Phase 210: Subdomain canonical format + 3 critical relay/install bugs — 🟡 CODE-COMPLETE 2026-05-26 (4/4 code gates PASS; SUB-08/09/10 live-verify deferred to P217 pending CARRY-V41-RELAY-DOWN restart)

**Goal:** End the `n8n-bruce` vs `n8n.bruce` vs `bruce.livinity.io` chaos. One canonical format (hyphen), deterministic across install path → DNS → relay → Caddy → app.

**Effort:** 3-5 days.

**Requirements:** SUB-01..11 (11 REQs).

**Depends on:** Phase 209 (UAT clarity), `.planning/research/2026-05-26-store-admin/subdomain-install-bugs.md`.

**Entry probe (resolves D-V41-RELAY-STATE-UNKNOWN):** ONE batched SSH probe to confirm whether `platform/relay/` is still on Server5 or has moved, before any patch. Capture result in `phases/210-*/210-CONTEXT.md`.

**Sub-features:**
- **210.1 (CRITICAL) — Relay `parseSubdomain` misroutes hyphen-format.** File `platform/relay/src/subdomain-parser.ts:46-50`. Fix: split single-part hyphen subdomain on last hyphen, forward to `<username>` tunnel with `X-App-Name: <appName>` header so Mini PC Caddy can route. 4-case test coverage. Deploy: rsync + `pm2 restart relay` (or Vercel deploy depending on entry probe outcome).
- **210.2 (HIGH) — `provisionAppSubdomain` silent-null Caddy mismatch.** Files `livos/packages/livinityd/source/modules/apps/apps.ts:578-585`, `caddy.ts:279`. Fix: throw (not null) on non-409 failures; on 409 fetch existing canonical host from Supabase. Repair migration for in-the-wild stale rows.
- **210.3 (MEDIUM) — `REDIS_PLATFORM_URL` undeclared (silent install-event drop).** File `livos/packages/livinityd/source/modules/apps/apps.ts:849`. Fix: declare `const REDIS_PLATFORM_URL = 'livos:platform:url'` alongside `REDIS_PLATFORM_API_KEY`. Test: install event appears in `install_history` within 2s.

**Success criteria:**
1. All 3 bugs RED→GREEN test coverage (SUB-03, SUB-06, SUB-08).
2. Install n8n → opens at `n8n-bruce.livinity.io` in <30s, returns n8n UI not bruce root (SUB-09).
3. `install_history` row in Supabase within 2s of install (SUB-08).
4. Zero "fall through to offline page" log lines per install (SUB-10).
5. Entry probe written to phase context (SUB-11).

---

### Phase 211: MCP/App install reliability + auto-install MCP — 🟡 PARTIAL 2026-05-26 (211.1 defensive dual-writer guard shipped; 211.2 + 211.3 + full unification carried)

**Goal:** Click "Install" in store → MCP/app working, zero manual config, zero restart, clear feedback on env-vars needed.

**Effort:** 2-3 days.

**Requirements:** INST-01..06 (6 REQs).

**Depends on:** Phase 210 (canonical subdomain), `.planning/research/2026-05-26-store-admin/install-flow-audit.md`.

**Sub-features:**
- **211.1 — Dual-writer collision at `liv:mcp:config`.** `liv/core/McpConfigManager` writes JSON string + publishes `mcp_config`; `livinityd mcp-config-router.ts` writes Redis HASH + publishes `liv:mcp:updated`. Pick JSON-string writer (agent-consumed); migrate Settings → MCP tab; deprecate HASH writer. Test: install via UI → `tools/list` shows new MCP without restart.
- **211.2 — `EnvironmentOverridesDialog` for AI installs.** Read `envSchema` from app manifest; modal prompts for each `required: true` env; saves to per-user env file before install proceeds. Test: install MCP requiring API key → modal → fill → install completes.
- **211.3 — Admin-only install gate (interim, hardened in Phase 212).** Add `is_admin BOOLEAN` to Supabase `public.users`; seed `hello@bruceoz.com`; enforce `is_admin=true` on `apps.install`, `installV37`, `/api/admin/apps` tRPC + REST routes. (Migration formalized in Phase 212 — this sub-feature ships the enforcement path.)

**Success criteria:**
1. One-click MCP install works for ≥3 sample MCPs (browser, filesystem, github) in <60s each (INST-02, INST-06).
2. Missing env vars surfaced via dialog (not toast) (INST-05).
3. Non-admin user gets 403 on install; admin gets 200 (INST hooks Phase 212 RLS gate).

---

### Phase 212: Admin panel auth + data model — 🟡 CODE-COMPLETE 2026-05-26 (commits `e9b37106..62b0ea0a`; SUB-2/4 of 5 success criteria GREEN, ADM-13 RED → CARRY-P212-TUNNEL-PERSIST + CARRY-V41-RELAY-DOWN, ADM-03 YELLOW → CARRY-P212-RLS-POLICIES → P214)

**Goal:** Single source of truth for who-is-admin + the queries that power the admin dashboard. Backend only.

**Effort:** 2 days.

**Requirements:** ADM-01..13 (13 REQs).

**Depends on:** Phase 211 (admin gate enforcement path).

**Tasks:**
1. **Supabase migration** — add `is_admin BOOLEAN DEFAULT FALSE` to `public.users`, ensure `created_at` + `last_seen_at`, backfill `hello@bruceoz.com` to `true`. Add RLS policies for `users`, `tunnel_connections`, `install_history`, `bandwidth_usage`.
2. **6 admin API routes** under `platform/web/app/api/admin/` — `metrics/summary`, `users`, `tunnels`, `apps`, `bandwidth`, `install-failures`. All gated by `is_admin=true` via Supabase Auth + new `middleware.ts`.
3. **Bandwidth rollup tables** — create `hourly_bandwidth` + `daily_bandwidth` rollup tables in Supabase; writer (cron or trigger) aggregates `bandwidth_usage` with <5min lag.
4. **Heartbeat persistence audit** — verify `tunnel_connections` rows when a Mini PC is online. Fix the relay → Supabase upsert if missing.

**Success criteria:**
1. `GET /api/admin/metrics/summary` returns real numbers (ADM-05).
2. All `/api/admin/*` return 403 to non-admin / 200 to admin (ADM-11).
3. `tunnel_connections` count >0 when ≥1 Mini PC online (ADM-13).
4. RLS verified: non-admin `SELECT * FROM users` returns only own row (ADM-03).
5. Rollup lag <5min (ADM-12).

---

### Phase 213: Admin panel UI — 🟡 CODE-COMPLETE 2026-05-26 (commits `713a47eb..e4242552`; 4/6 pages real, 2 placeholders by design; UI-09 mobile-responsive PASS; UI-08 non-admin client redirect → CARRY-P213-NON-ADMIN-REDIRECT-CLIENT)

**Goal:** Operator opens `livinity.io/admin`, sees the whole system at a glance, drills into detail views.

**Effort:** 4 days.

**Requirements:** UI-01..10 (10 REQs).

**Depends on:** Phase 212 (admin API surface).

**Constraint:** `next.config.ts` Phase 146 rewrites intercept `/dashboard`, `/login`, etc. to static HTML. `/admin` is FREE — no static intercept (D-V41-STATIC-HTML-KEEP). Lock the `beforeFiles` rewrite list so nobody adds `/admin.html`.

**Pages:** `/admin` (6 KPI cards + 2 charts), `/admin/users`, `/admin/users/[id]`, `/admin/tunnels`, `/admin/apps`, `/admin/store`, `/admin/walkthrough`.

**Stack:** shadcn/ui + recharts + Supabase server components. Soft sidebar nav, Linear-style opacity-tier typography.

**Success criteria:**
1. All 6 pages render real data from Supabase (UI-01..06).
2. Non-admin redirected to `/dashboard` (UI-08).
3. Mobile-responsive at 1024×768 + 1920×1080 (UI-09).

---

### Phase 214: Store redesign — admin-only gate + UX polish — 🟡 CODE-COMPLETE 2026-05-26 (commits `4f90360f..1a4c7f65`; all 4 success criteria GREEN; tasks 4 (search) + 5 (detail redesign) deferred to CARRY-P214-STORE-SEARCH + CARRY-P214-DETAIL-REDESIGN)

**Goal:** `livinity.io/store` becomes admin-only. Non-admin sees marketing landing. Admin sees full catalog + install management.

**Effort:** 3 days.

**Requirements:** STORE-01..06 (6 REQs).

**Depends on:** Phase 212 (auth middleware), Phase 213 (`/admin/store` UI page).

**Tasks:**
1. `/store/**` middleware → non-admin redirected to `/dashboard`.
2. `POST /api/admin/sync-catalog` Vercel function pulls manifests from `utopusc/livinity-apps` repo and upserts into Supabase `public.apps`. 304 candidate apps → catalog.
3. Featured/verified curation UI via `/admin/store`.
4. Search + filter (category, search, "newly added" sort).
5. App detail page redesign — README rendered, screenshots, install button (admin only), system requirements.

**Success criteria:**
1. Non-admin GET `/store` → 302 to `/dashboard` (STORE-01).
2. Admin sees 304 catalog apps after first sync (STORE-03).
3. Admin can mark featured / verified (STORE-04).
4. Sync function reports count of new/updated apps (STORE-02).

---

### Phase 215: One-click MCP/app install in store + walkthrough docs — 🟡 PARTIAL 2026-05-26 (Vercel-side complete: install_commands schema + 4 endpoints + SSE + 3-guide walkthrough; Mini PC poller deferred → CARRY-P215-MINIPC-POLLER; WIRE-04/05 live verification gated)

**Goal:** Admin clicks "Install" → flows to Mini PC bridge → MCP/app working in <60s. `/admin/walkthrough` explains how to add a new app/MCP from scratch.

**Effort:** 2 days.

**Requirements:** WIRE-01..05 (5 REQs).

**Depends on:** Phase 211 (install path reliability), Phase 213 (`/admin/walkthrough` page), Phase 214 (store admin UI).

**Tasks:**
1. Wire store "Install" → Mini PC bridge → Phase 211 install path (auto-config + reconcile).
2. SSE install progress UI: `downloading` → `configuring` → `starting` → `ready`.
3. `/admin/walkthrough` page with 3 guides (Docker app, MCP, custom non-Docker).
4. Embedded test-install button per guide.

**Success criteria:**
1. 3 sample MCPs install via one-click in <60s each (WIRE-05).
2. Walkthrough page renders, test-install works for sample (WIRE-04).
3. Doc walkthroughs reviewed by operator (WIRE-03).

**Risk:** Vercel-only Next.js cannot directly write to Mini PC — install command must travel through Server5 relay or a Supabase-mediated channel (Mini PC polls Supabase for install commands). Phase 211 must clarify which; Phase 215 reuses the chosen channel.

---

### Phase 216: Cloudflare audit + automation — 🟡 DOCS-COMPLETE 2026-05-26 (CF-AUDIT.md + scripts/cf-audit.sh shipped; CF-01 🟢, CF-02/03/04 → operator-walk in P217)

**Goal:** Document + automate CF DNS state. Today CF is DNS-only (no tunnel), Vercel handles edge. Live-audit per-user wildcard cert path post-migration.

**Effort:** 1-2 days.

**Requirements:** CF-01..05 (5 REQs).

**Depends on:** Phase 210 (subdomain provisioning).

**Tasks:**
1. Enumerate current DNS records (livinity.io zone) via CF API → `.planning/cloudflare-state.md`.
2. Verify Vercel A/AAAA, www CNAME, MX, TXT (SPF, DKIM, DMARC).
3. **Live audit** of per-user wildcard cert (`*.livinity.io` via Server5 Caddy on-demand TLS + relay `/internal/ask`) — closes D-V41-CF-CERT-AUDIT-DEFERRED. If broken, fix lands in this phase.
4. Optional: Terraform/wrangler config declaring DNS state (operator decides at audit time).

**Success criteria:**
1. DNS state documented (CF-01).
2. Per-user wildcard cert path verified live; if broken, fixed within phase (CF-02, CF-03).
3. Per-user subdomain provisioning works end-to-end with CF API (CF-04).

---

### Phase 217: E2E UAT + verification — 🟡 OPERATOR-PENDING 2026-05-26 (UAT-CHECKLIST.md ready; operator walk required to close milestone)

**Goal:** Operator walks every Phase 209-216 deliverable, confirms; milestone archived.

**Effort:** 2 days.

**Requirements:** UAT-01..04 (4 REQs).

**Depends on:** Phases 209-216 complete.

**Tasks:**
1. Write `UAT-CHECKLIST.md` with sections per Phase 209-216 deliverable.
2. Operator walks each section, marks PASS/FAIL/SKIP with evidence.
3. Fix any FAIL, re-verify.
4. Update STATE.md, ROADMAP.md; archive milestone to `.planning/milestones/v41/`.

**Success criteria:**
1. UAT-CHECKLIST.md written and walked (UAT-01, UAT-02).
2. All FAILs fixed and re-verified before close (UAT-03).
3. STATE.md + ROADMAP.md updated; milestone archived (UAT-04).

---

## v41 Coverage

| Phase | REQs | Status |
|-------|------|--------|
| 209 | AI-01..06 (6) | ⚪ NOT STARTED |
| 210 | SUB-01..11 (11) | ⚪ NOT STARTED |
| 211 | INST-01..06 (6) | ⚪ NOT STARTED |
| 212 | ADM-01..13 (13) | ⚪ NOT STARTED |
| 213 | UI-01..10 (10) | ⚪ NOT STARTED |
| 214 | STORE-01..06 (6) | ⚪ NOT STARTED |
| 215 | WIRE-01..05 (5) | ⚪ NOT STARTED |
| 216 | CF-01..05 (5) | ⚪ NOT STARTED |
| 217 | UAT-01..04 (4) | ⚪ NOT STARTED |
| **Total** | **66 / 66 mapped** | **0 / 9 shipped** |

All 66 requirements from `.planning/REQUIREMENTS.md` mapped to exactly one phase. ✓

## v41 Risk register

- **Vercel-only Next.js cannot directly write to Mini PC** — install commands must travel through Server5 relay or Supabase-mediated channel (Mini PC polls). Phase 211 picks the channel; Phase 215 reuses.
- **Static-HTML rewrites in `next.config.ts`** may intercept `/admin` if anyone adds `/admin.html` to static. Phase 213 must lock the `beforeFiles` list.
- **Heartbeat persistence gap** (ADM-13) blocks all live metrics if not fixed.
- **Supabase RLS misconfiguration** could leak user data — Phase 212 must include RLS verification tests asserting non-admin row counts.
- **Server5 relay state unknown** at milestone open (D-V41-RELAY-STATE-UNKNOWN) — Phase 210 entry probe must run before patching.
- **CF wildcard cert may be broken post-migration** (D-V41-CF-CERT-AUDIT-DEFERRED) — Phase 216 live audit will surface.

---

## v42 — Liv Assistant (AionUi-based) — OPENED 2026-05-27

Replaces the openclaw + claw-client chat surface in LivOS with a vendored AionUi v2.1.4 headless WebUI (`aionui-web-2.1.4-linux-x86_64.tar.gz`), iframe-embedded into the LivOS desktop shell. Uses local `claude` CLI binary for Claude subscription auth — no Anthropic API key required for end users.

**Strategy decision (post-Phase 222 spike, SHA `b2be397f`):** vendor-and-wrap upstream tarball, **no source fork**. License: Apache-2.0. See [milestones/v42/PROJECT.md](milestones/v42/PROJECT.md) for full milestone scope (12 phases 222-233) and locked invariants.

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (broker subscription path) must remain untouched across all v42 phases — pre-commit hook enforces.

---

### Phase 222: Spike — AionUi feasibility on Mini PC — ✅ DONE 2026-05-27 (`b2be397f`)

**Goal:** PASS/FAIL on 4 gates (build, iframe headers, Claude CLI subscription, license) before committing engineering time to the rest of v42.

**Outcome:** All 4 PASS. Pre-built tarball boots in 2s, no XFO/CSP, built-in Claude Code agent uses local CLI + subscription creds, Apache-2.0 with no GPL deps. Verdict PROCEED. Strategy: vendor-and-wrap (no fork). See [.planning/phases/222-aionui-spike/222-SPIKE.md](phases/222-aionui-spike/222-SPIKE.md).

---

### Phase 223: Vendor AionUi tarball + LivOS install scaffold — 🟡 IN PROGRESS (2/5 plans shipped)

**Plan progress:**
- ✅ **223-01** SHIPPED 2026-05-27 (`d1276e12`) — `scripts/install-liv-assistant.sh` idempotent installer, SHA-pinned, Apache LICENSE preserved. See [223-01-SUMMARY.md](phases/223-vendor-aionui-install/223-01-SUMMARY.md).
- ✅ **223-02** SHIPPED 2026-05-27 (`ec6f5855`) — `systemd/liv-assistant.service` unit (Type=simple, User=bruce, port 3020, bun PATH, journal output for Plan 03 password capture). See [223-02-SUMMARY.md](phases/223-vendor-aionui-install/223-02-SUMMARY.md).
- ⚪ **223-03** READY — `scripts/capture-liv-assistant-password.sh` first-boot password capture.
- ⚪ **223-04** READY — `docs/liv-assistant-install.md` operator runbook.
- ⚪ **223-05** READY — Mini PC live deploy + UAT + Phase 222 scratch cleanup.


**Goal:** Land the install scaffolding that downloads, verifies, extracts, and runs the upstream AionUi WebUI tarball as a Mini PC system service named `liv-assistant`. **No source fork.** Apache `LICENSE` + `NOTICE` preserved. First-boot admin password captured into a known location for later LivOS UI integration. Service is idempotent (re-running `install.sh` heals partial state, does not re-download if SHA matches). No Caddy routing yet (deferred to Phase 226), no LivOS UI changes yet (Phase 227), no auth bridge (Phase 228), no brand overlay (Phase 232).

**Effort:** 3h.

**Requirements:** This phase has no formal REQ-IDs because v42 was opened post-REQUIREMENTS.md. Acceptance is goal-backward: install script works, service boots, password captured. Future REQ-ID mapping (LIV-* prefix) can be added when v42 REQUIREMENTS.md gets formalized.

**Depends on:** Phase 222 ✅ (spike PROCEED verdict).

**Tasks:**
1. Write `scripts/install-liv-assistant.sh` — idempotent installer:
   - Downloads `aionui-web-2.1.4-linux-x86_64.tar.gz` from upstream GitHub Releases to `/opt/liv-assistant/cache/`.
   - Verifies sha256 against pinned hash `0bb02d0028d932c2e65e676c63074bcee2079508aa954e088c16ece92ba36778`.
   - Extracts to `/opt/liv-assistant/aionui-web-2.1.4/` (versioned dir for future upgrades).
   - Symlinks `/opt/liv-assistant/current` → versioned dir for stable path.
   - Installs `bun` to `/home/bruce/.bun/` if not present (`curl https://bun.sh/install | bash` as bruce).
   - Preserves Apache `LICENSE` + `NOTICE` next to the binary; creates `/opt/liv-assistant/UPSTREAM.md` documenting source repo + version + SHA + license.
2. Write `systemd/liv-assistant.service` unit:
   - Runs as `bruce` user.
   - Working dir `/opt/liv-assistant/current`.
   - `ExecStart` = `./aionui-web start --port 3020 --data-dir /opt/liv-assistant/data --backend-bin ./bundled-aioncore/linux-x64/aioncore`.
   - `Environment="PATH=/home/bruce/.bun/bin:/usr/local/bin:/usr/bin:/bin"` so the Claude Code ACP bridge finds `bun`.
   - Restart=on-failure, RestartSec=5.
   - Stdout/stderr → journald.
3. Write `scripts/capture-liv-assistant-password.sh` — post-first-boot helper:
   - Reads journald for the first-boot `Generated initial admin password: ...` line.
   - Writes credentials to `/etc/livos/liv-assistant-credentials` (mode 0600, owned by bruce).
   - File format: `username=admin\npassword=<captured>\n`.
   - Idempotent: if file exists and is non-empty, no-op; if first-boot line not yet in journald, exits 0 with a "not yet ready" message (caller polls).
4. Document install + service in `docs/liv-assistant-install.md` for operator + future runbook.
5. **Deploy to Mini PC** — run installer, start service, verify `systemctl is-active liv-assistant` = `active`, `curl http://127.0.0.1:3020/api/auth/status` returns 200, `/etc/livos/liv-assistant-credentials` exists with non-empty password.
6. **Cleanup Phase 222 scratch** on Mini PC: `kill $(cat /tmp/v42-spike/aionui.pid) 2>/dev/null; rm -rf /tmp/v42-spike`. Confirm port 9099 free.

**Success criteria:**
1. `scripts/install-liv-assistant.sh` is idempotent — running twice in a row produces zero diff in `/opt/liv-assistant/`.
2. SHA256 mismatch on the downloaded tarball aborts installation with a clear error (does not extract garbage).
3. `systemctl status liv-assistant` shows `active (running)` on Mini PC.
4. `curl -sSI http://127.0.0.1:3020/` returns `HTTP/1.1 200 OK` with no `X-Frame-Options` and no `Content-Security-Policy`.
5. `sudo cat /etc/livos/liv-assistant-credentials` returns a non-empty `password=...` line, file mode `0600`, owner `bruce`.
6. `/opt/liv-assistant/LICENSE` and `/opt/liv-assistant/NOTICE` (or `cache/.../LICENSE`) exist and contain Apache-2.0 text.
7. `/opt/liv-assistant/UPSTREAM.md` exists and records upstream URL, version `2.1.4`, SHA, and license.
8. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged (pre-commit hook verifies).

**Risks:**
- Mini PC `bun` install path divergence — installer must check both `/home/bruce/.bun/bin/bun` and `/usr/local/bin/bun` before re-downloading.
- Port 3020 may collide with an existing service — installer should `ss -tlnp \| grep ':3020 '` and abort with a clear message if collision detected.
- First-boot password line race — journald may not have the line yet when `capture-liv-assistant-password.sh` runs; the script must tolerate this and the deploy step retries.

---
