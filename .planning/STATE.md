---
gsd_state_version: 1.0
milestone: v35.0
milestone_name: Design System Unification (UI/UX)
status: in-progress
last_updated: "2026-05-15T00:00:00.000Z"
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 27
  completed_plans: 16
  percent: 71
previous_milestone: v34.0
previous_milestone_status: code-complete-pending-operator-uat
v35_master_plan: .planning/v35-DESIGN-SYSTEM-MILESTONE.md
v35_phases: [115, 116, 117, 118, 119, 120, 121]
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** **v34.0 Bootstrap Polish + First-Run UX** — OPENED 2026-05-12 (Phases 106-110 skeleton'ed in ROADMAP.md, individual planning pending).
**Last shipped phase:** Phase 105 deploy-livinityd 1:1 update.sh port — Shipped 2026-05-12, 2× UAT live-validated on mainserver `154.53.56.75` (register/login/UI working, 168 PASS combined tests, sacred SHA preserved 14/14 commits `290885bc..332239e2`).
**Next action:** `/gsd-plan-phase 106` to plan bootstrap-layer hotfix back-port (Bug #7-#12 from Phase 105 UAT). Roadmap: 106 (bootstrap apt-install + JWT format + yaml seed) → 107 (default apps cleanup) → 108 (App Store local mode) → 109 (MCP servers auto-seed) → 110 (Phase 99 WebApp Launcher VNC swap carry-over). v32 + v33 UAT walks still pending on Mini PC (separate from v34 fresh-VPS install scope).

## Current Position

Phase: 119 (Reusable Component Library `@livinity/ui-kit`) — **COMPLETE**
Plan: 4 of 4 — **119-04 COMPLETE** (Plan 119-04 shipped 2026-05-14, UMD smoke test + landing consumer recipe, commits `27adbd0b`, `c41e6509`, `05ff03cc`; caught + fixed a release-blocking `process is not defined` bug in `vite.config.umd.ts` — NODE_ENV inlined as `production`, UMD bundle 22.35 KB → 9.71 KB; 18 exports verified via Node vm-based shape verifier; 57.3 KB headless Chrome PNG fixture committed). All 4 plans of Phase 119 shipped: 01 (chassis) → 02 (atoms) → 03 (composites) → 04 (UMD smoke). Next: Phase 120 (Mini PC livinityd UI wave 1).
Milestone: **v35.0 — Design System Unification (UI/UX)** — OPENED 2026-05-14
Master plan: [`.planning/v35-DESIGN-SYSTEM-MILESTONE.md`](v35-DESIGN-SYSTEM-MILESTONE.md) (470 lines — read first)
Phases: 115 (inventory) ✓ → 116 (canonical tokens) ✓ → 117 (Server5 migration) → 118 (landing polish) ✓ → 119 (ui-kit) ← here → 120 (Mini PC wave 1) → 121 (Mini PC long-tail + audit)
Total estimated: 70-105 hours of agent work across multiple sessions, paced for operator UAT checkpoints

**Next action (after `/clear`):** `/gsd-execute-phase 119` to run Wave 2 (119-02 atoms + 119-03 composites in parallel) followed by Wave 3 (119-04 UMD landing HTML integration smoke test). Plan 119-01 chassis is green: 3 build targets (ESM/CJS/UMD), 5/5 Vitest assertions, Storybook static export builds clean, design-tokens CSS injected via preview.tsx with 3-way livTheme global toolbar.

**v34.0 carry-over:** v34.0 sits at 8/8 CODE-COMPLETE; operator-walked binding UAT pending for Phase 110 (WebApp click test) + Phase 111 (fresh-VPS install). These do NOT block v35.0 — can be walked at operator's discretion in parallel. Phase 110 was operator-confirmed PASS via "calisiyor" chat 2026-05-14 but ROADMAP entry still shows `[~]`; operator-walked binding UAT for Phase 111 still required.

**Mainserver state:** TLS clean (Phase 113); `tunnel_disabled=1` (Mini PC has the tunnel slot); api_key set (App Store works on test.livinity.live).
**Server5 state:** all 4 PM2 services online; relay has 4 in-tree hot-patches (custom_domain unconditional + appMapping fallback for HTTP+WS, both shipped 2026-05-14); platform.custom_domains correctly maps `bruce.livinity.io` + `livinity.live` to bruce user (corrected 2026-05-14 evening).
**Mini PC state:** tunnel stable as **bruce** (api_key swapped from utopusc to bruce 2026-05-14 evening); deployed SHA `a4027136` (post-Phase-110 closure); 4 healthy containers (n8n, code-server, auth, tor_proxy); 3 subdomains registered; bruce.livinity.io HTTP 200 + n8n.bruce.livinity.io HTTP 302 (gateway active).
**Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`** preserved across all v34 commits.

## v35.0 Plan Summary (2026-05-14) — OPENED, ready to execute

- **Why:** During Phase 111 binding UAT prep, the operator observed visual discontinuity across LivOS surfaces: `livinity.io/dashboard` (Geist + bespoke CSS vars + bento) vs `livinity.io/onboarding/install` (Tailwind zinc + shadcn-ish) vs Mini PC livinityd UI (Tailwind 3.4 + shadcn). Three idioms. User-stated requirement: *"livinity.io nun tasarimini biliyorsun ... UI da cok profesyonel ol dashboard daki UI vs kullan."* Quick fix: Phase 111 wizard re-skinned to dashboard.html style on 2026-05-14, shipped as `/dashboard/install` static HTML. v35.0 generalizes the fix.
- **Surfaces:** Mini PC livinityd UI (`livos/packages/ui/src/`, **654 TSX files** — 95 components + 123 modules + 219 routes + 29 shadcn + 142 features + 7 layouts + 23 providers); Server5 Next.js (`/opt/platform/web/src/`, 68 TSX + 69 TS); landing static HTML (`/opt/landing/livinity.io/`, 8 HTML, all already use Geist).
- **Canonical reference:** `/opt/landing/livinity.io/dashboard.html` (Geist + Geist Mono + Instrument Serif fonts; CSS vars `--dash-pad/radius/line/card-bg/accent-blue/green/amber/red`; light/dark/iridescent themes; bento grid 12-col; `.h-btn`/`.b-card`/`.cmd-box`/`.stepper` reusable classes).
- **7 phases / 27 plans:**
  - **115** UI Component Inventory & Visual Baseline (3 plans, parallel-safe) — INVENTORY-MINI-PC.md + INVENTORY-SERVER5.md + INVENTORY-LANDING.md + COMPONENT-MAP.md + baseline screenshots; D-115-READ-ONLY
  - **116** Canonical Design System Spec (2 plans) — DESIGN-SYSTEM.md + `livos/packages/design-tokens/{tokens.css,tailwind.preset.cjs,theme.json,fonts.css}`; tag `v35.0-design-tokens-1.0.0`; D-116-LOCK-CANONICAL
  - **117** Server5 Next.js Migration (5 plans) — layout.tsx + tailwind config + globals.css + (auth)/* + dashboard/install audit + store + download; D-117-NO-API-CHANGES, D-117-NO-AUTH-FLOW-CHANGES
  - **118** Landing HTML Polish (2 plans) — drift fix + `_shared/tokens.css` + `_shared/nav.jsx` reusable nav
  - **119** Reusable Component Library `@livinity/ui-kit` (4 plans) — Button/Card/Stepper/Pill/Input/PasswordInput/CommandBox/Modal/Toast/NavBar/ThemeToggle; ESM + CJS + UMD; Storybook; Vitest; D-119-NO-CONSUMER-CHANGES
  - **120** Mini PC UI Wave 1 (5 plans, ~30 high-impact components) — foundation + layout/chrome + Settings shell + AI Chat + App Store; D-120-NO-FUNCTIONAL-CHANGES, D-120-INCREMENTAL-DEPLOY, D-120-MINI-PC-OPERATOR-PRIORITY
  - **121** Mini PC Long-Tail + Cross-Surface Audit (6 plans, ~600 components) — backups+factory-reset+local-setup batch + files + window-content + routes/* sub-batched + generic+shadcn + cross-surface CONSISTENCY-REPORT.md + Playwright regression suite + STYLE-GUIDE.md; D-121-OPERATOR-CHECKPOINTS
- **Locked invariants:** D-V35-CANONICAL-IS-DASHBOARD-HTML, D-V35-NO-FUNCTIONAL-REGRESSIONS, D-V35-MINI-PC-OPERATOR-PRIORITY, D-V35-SACRED-SHA, D-V35-INCREMENTAL-COMMITS, D-V35-LIGHT-DARK-IRIDESCENT-PARITY, D-V35-ACCESSIBILITY-WHEN-MIGRATING (full text in master plan).
- **Per-phase CONTEXT skeletons:** all 7 phase directories created + CONTEXT.md written:
  - `.planning/phases/115-ui-component-inventory/115-CONTEXT.md`
  - `.planning/phases/116-canonical-design-system/116-CONTEXT.md`
  - `.planning/phases/117-server5-nextjs-migration/117-CONTEXT.md`
  - `.planning/phases/118-landing-html-polish/118-CONTEXT.md`
  - `.planning/phases/119-reusable-component-library/119-CONTEXT.md`
  - `.planning/phases/120-mini-pc-ui-migration-wave-1/120-CONTEXT.md`
  - `.planning/phases/121-mini-pc-long-tail-and-audit/121-CONTEXT.md`
- **Acceptance criteria (8):** see master plan § "Acceptance criteria". Tied to operator-walked end-to-end UAT — visual continuity across surfaces is the win condition.
- **Out of scope (v36+ candidates):** mobile design, Agent Electron UI, marketing copy, email templates, Storybook→Figma, marketplace+changelog services, apps.livinity.io dark mode (full list in master plan § "Out of scope").

## 116-01 Status (2026-05-14) — Canonical Design System Spec Plan 1 CODE-COMPLETE (3 commits, 9 files created, sacred SHA preserved 3/3; D-116-LOCK-CANONICAL + D-116-NO-CONSUMER-CHANGES upheld)

- **PACKAGE SKELETON + CANONICAL TOKENS + SPEC** (Plan 1 of 2 in Phase 116, 3 tasks): ships `@livinity/design-tokens` v1.0.0 — the canonical LivOS design token package. Three source commits + this SUMMARY:
  1. `f7f83e05` Task 1 — `livos/packages/design-tokens/{package.json, .gitignore, README.md}` + `.planning/phases/116-canonical-design-system/116-01-dashboard-snapshot.txt` + `livos/pnpm-workspace.yaml` (Rule 3 deviation: existing workspace uses explicit per-package list, not `packages/*` glob; added `packages/design-tokens` entry) + `livos/pnpm-lock.yaml` (`pnpm install --filter @livinity/design-tokens` sync).
  2. `96320229` Task 2 — `livos/packages/design-tokens/{tokens.css, tailwind.preset.cjs, theme.json}`. `:root` block verbatim from canonical (3 cross-verified sources: master plan + 116-01 plan + Phase 115 work file); `body.dark` + `body.iridescent` shipped as documented PENDING stubs (D-116-FOLLOW-UP-DARK + D-116-FOLLOW-UP-IRIDESCENT). Tailwind 3.4 preset maps every `:root` token to `theme.extend.colors/spacing/borderRadius/boxShadow/backgroundImage/fontFamily/transitionDuration`. `theme.json` JSON manifest mirrors the same tokens in camelCase with `_note` markers on pending variants.
  3. `fde48137` Task 3 — `livos/packages/design-tokens/{DESIGN-SYSTEM.md, STYLE-GUIDE.md}`. DESIGN-SYSTEM.md long-form spec with 12 H2 sections (Overview, Typography, Color Tokens [Light fully populated + Dark/Iridescent PENDING markers], Spacing, Radius, Shadow, Motion, Accessibility, Interaction Patterns, Tailwind Integration, Tailwind 4 Migration Note, Canonical Reference, Changelog). STYLE-GUIDE.md skeleton with 5 must-haves contract + anti-patterns + workflow, Phase 121 expansion notes.
- **Verification (full end-of-plan)**: 8/8 files present in `livos/packages/design-tokens/`; canonical token spot-checks (`--dash-pad: 28px`, `--accent-blue:  #2563eb` double-space, `--card-shadow: 0 1px 2px ...`, `--font-mono:  "Geist Mono", ...` double-space) all PASS; `node -e require()` for `package.json` + `tailwind.preset.cjs` + `theme.json` all PASS; `pnpm -r list --depth -1 | grep "@livinity/design-tokens"` PASS; forbidden-glob committed-diff (`livos/packages/{ui,ui-next,livinityd,config,docker-agent,marketplace}`, `liv/`, `scripts/`) = EMPTY (D-116-NO-CONSUMER-CHANGES upheld).
- **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED** across all 3 commits.
- **Deviations** (both Rule 3 — blocking issue, auto-fixed):
  1. `livos/pnpm-workspace.yaml` uses explicit per-package list (not `packages/*` glob assumed by plan); added `packages/design-tokens` entry. Outside D-116-NO-CONSUMER-CHANGES forbidden glob.
  2. Server5 (`45.137.194.102`) was unreachable at SSH fetch time (port 22 closed, ICMP fails, public HTTP timeout) — known operator-pending state per `project_v34_session_2026_05_13.md`. `:root` block locked from 3 cross-verified canonical sources (zero risk); `body.dark` + `body.iridescent` shipped as documented PENDING stubs per Plan 116-01 Task 2 Step A explicit allowance. **NO improvised values** — D-116-LOCK-CANONICAL strictly upheld.
- **Open follow-ups** (rolled into Plan 116-02 or filed as 116-01 patch once Server5 returns): D-116-FOLLOW-UP-DARK (transcribe `body.dark` overrides verbatim → patch tokens.css + theme.json + DESIGN-SYSTEM.md, ship v1.0.1) + D-116-FOLLOW-UP-IRIDESCENT (same for iridescent) + Plan 116-02 (fonts.css + .woff2 self-host + LICENSE-FONTS.md + smoke test — package.json `exports` + `files` array already declare these paths).
- Carry-forward: Plan 116-02 is the next action. `body.dark` / `body.iridescent` populate folds into 116-02 once Server5 is reachable, otherwise ships as standalone 116-01 patch on operator decision.

## 110-01 Status (2026-05-13) — Phase 99 WebApp Launcher VNC Swap Carry-over CLOSURE CODE-COMPLETE-PLUS-RUNTIME-SMOKE (closure-only `.planning/` rollup; Mini PC RFB 003.008 smoke PASS; OPERATOR-PENDING for browser-walked binding UAT)

- **CARRY-OVER CLOSURE** (single plan in Phase 110, 2 tasks): closes the v34.0 ROADMAP.md placeholder Phase 110 (line 124, opened 2026-05-12 in milestone-skeleton) that was misleadingly drafted as "implement x11vnc per-window spawn logic in `streaming/vnc-bridge.ts`" — but that file already exists (290 lines, shipped Phase 99-02 commit `909cca8e` 2026-05-08). The actual gap was a missing `[x]` carry-over rollup artifact for the v33 → v34 closure proof. Six `.planning/` files + zero source-tree changes (D-110-NO-RECODE):
  1. **Mini PC RFB 003.008 smoke (PASS):** ephemeral `x11vnc -display :0 -localhost -rfbport 5933 -timeout 30 -shared -nopw -noxdamage` on bruce@10.69.31.68 + 2× `nc 127.0.0.1 5933` connections. Captured ASCII `RFB 003.008` + hex `5246 4220 3030 332e 3030 380a` (12-byte canonical RFB ProtocolVersion banner). x11vnc log confirmed `Got connection from client 127.0.0.1` + `check_access ... matches host 127.0.0.1`. Cleanup via `pkill -f "x11vnc.*5933"` (log: `caught signal: 15`). Production state intact: post-smoke `pgrep -af x11vnc` returns ONLY pre-existing canonical Mini PC `:0` helper at port 5900 (PID 3095510) — UNRELATED to smoke. Smoke port 5933 chosen outside production [15900,16100) per-stream port ring (D-110-EPHEMERAL-LOCALHOST-ONLY).
  2. **Closure rollup files written:** `110-CONTEXT.md` (background, locked decisions, threat surface, sacred-SHA evidence trail across 13 Phase 99/99-05 commits), `110-01-PLAN.md` (closure plan), `110-SUMMARY.md` (rollup with self-check section).
  3. **Existing files updated:** `.planning/phases/98-uat-polish/UAT-CHECKLIST.md` (appended Phase 110 section with 6-row table P110-1..6 — 4 PASS via Claude-side smoke + sacred SHA + scope re-verify; 2 OPERATOR-PENDING for browser walk); `.planning/ROADMAP.md` Phase 110 entry rewritten (skeleton → CODE-COMPLETE-PLUS-RUNTIME-SMOKE with `[x] 110-01-PLAN.md` line); `.planning/STATE.md` (this section + frontmatter `progress.completed_phases` 7 → 8, `completed_plans` 11 → 12, `percent` 69 → 71).
  4. **Closure commit:** single `docs(110-01): close Phase 99 carry-over — runtime smoke PASS, operator-pending UAT` (planned for Task 2 Step F). All 6 files staged together; pre-commit hook gates sacred SHA.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED (verified pre-commit via `git hash-object liv/packages/core/src/sdk-agent-runner.ts`; pre-commit hook live since Phase 100 commit `2f973413`; no `--no-verify` bypasses).
- D-110-NO-RECODE upheld: `git diff HEAD -- liv/ livos/` returns empty pre-commit. Phase 99 source code (vnc-bridge.ts + StreamSession discriminated union + WebAppWindowManager swap + WS dispatch) shipped in `9a61d78a..351bcb62` (11 commits) + Phase 99-05 partial-close `cd6f442a..66f6b75e` is ALREADY LIVE on Mini PC at deployed SHA `1df2ec6`. Re-coding the same work would create commit-history confusion.
- D-110-NO-FMPEG-REGRESSION upheld: Phase 93 fMP4 path (`fmp4-fanout.ts`, `encoder-args.ts` fmp4 branches, `pipewire-portal.ts`, `geometry-tracker.ts`) UNTOUCHED. Smoke test exercised dedicated port 5933 outside production [15900,16100) per-stream ring; smoke `x11vnc` invoked directly (NOT through livinityd's vnc-bridge port allocator) so no risk of stealing a per-WebApp port from a hypothetical concurrent live stream.
- D-110-NO-PROD-IMPACT upheld: no Mini PC script edits (`livos/install.sh`, `livos/update.sh` UNTOUCHED).
- D-110-OPERATOR-PENDING-UAT upheld: P110-3 (WebApp click → noVNC handshake) + P110-4 (bidirectional input) recorded as OPERATOR-PENDING in UAT-CHECKLIST.md. Per `feedback_minipc_is_owncloud_primary`, Mini PC is bruce's active OwnCloud — disrupting an existing user session for an in-CLI browser walk is unacceptable. Operator walks at own discretion in own browser session; reports PASS in chat; next session flips Phase 110 from `[~]` to `[x]` SHIPPED. Both criteria were PASS at Phase 99 ship 2026-05-08 (deployed SHA `cd6f442`); regression risk between then and `1df2ec6` is low (no streaming-subsystem edits in 14 master commits between).
- Deviations: **NONE.** Plan executed exactly as designed. One execution note documented in 110-SUMMARY.md: the initial single-SSH `bash -c` chain hit a quoting peculiarity (Exit 127 surfaced AFTER the banner was already captured); follow-up SSH call confirmed cleanup state explicitly. Future smoke iterations should prefer two SSH calls (kick-off + verify) over one chained `bash -c` for parsable per-line output.
- v34.0 milestone advances: 7/8 → **8/8 phases CODE-COMPLETE**. Operator-pending UAT backlog at v34.0: Phase 108 (mainserver fresh-VPS UAT), Phase 109 (mainserver MCP seed UAT), Phase 110 (Mini PC browser walk), Phase 111 (operator-walked binding UAT for fresh Hybrid install). v34.0 → SHIPPED flips when all four operator-pending UATs report PASS.
- Carry-forward: zero new carryovers beyond what 99-SUMMARY.md captured (fMP4 path orphaned for WebApp use case but ALIVE for `mode:'desktop'`; Phase 100 owns multi-stream + UI gaps).

## 111 Status (2026-05-13 evening) — Server5 Dashboard Install Wizard CODE-COMPLETE (5/5 plans shipped, sacred SHA preserved 5/5, all per-plan UAT PASS — operator-walked binding UAT pending)

- **WIZARD CENTERPIECE** (5 plans, 3 waves): closes the v34 gap where new users had no first-login onboarding flow and had to manually copy install one-liners + paste API keys + look up CF zone IDs. Five commits on master, all preserve sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`:
  1. `8e9cfa3e` Plan 111-01 — `livinity.io/install.sh` route flipped from legacy 1725-line `livos/install.sh` bootstrap to Phase 104+ modular dispatcher (`scripts/install.sh`, 99 lines, `mode-cloud.sh / mode-local-lan.sh / mode-hybrid.sh` dispatch). Live curl: header now `# scripts/install.sh — LivOS one-shot installer`. PM2 reload, no restart loop.
  2. `52d2a4f9` Plan 111-02 — `api_keys` UNIQUE(user_id) constraint dropped via Drizzle migration `0010_api_keys_multi_per_user.sql` (additive `idx_api_keys_user_id` non-unique index added; FK preserved). `POST/GET/DELETE /api/account/api-keys[/id]` Next.js routes shipped — POST returns plain `liv_k_*` token EXACTLY ONCE in response body, GET returns metadata only (NEVER `key_hash` or plain key), DELETE filters by `user_id = session.userId AND id = $1` (cross-user revoke returns 404, not 200 — id-enumeration oracle prevented). 10/10 live UAT PASS, sacred test user key `8b52d071... liv_k_gcOHv6sk` byte-identical post-migration. Backups: `schema.ts.pre-111-02.bak` + `pg_dump -t api_keys > /tmp/api_keys_pre_111_02.sql`.
  3. `448a9cd9` Plan 111-03 — `POST /api/cf/resolve-zone` Next.js endpoint (CF API proxy that resolves `cf-zone-id` from `{domain, cfToken}`). 8/8 live UAT PASS. **D-111-CF-TOKEN-NEVER-PERSISTED triple-proven**: static grep on deployed file (0 banned persistence calls — no `pool.query INSERT`, `redis.set`, `fs.write*`, `console.*`); runtime grep on `pm2 logs web` (0 hits for literal test token); DB row-count assertion (`api_keys` test user count 1=1 unchanged). Subdomain stripping confirmed (`test.livinity.live` → `livinity.live` zone lookup).
  4. `cc12cf33` Plan 111-04 — `/onboarding/install` 4-step wizard UI (mode cards + hybrid/local form + generated install command display). 7 new files under `/opt/platform/web/src/app/onboarding/install/`. Caddyfile patched (added `/onboarding/install /onboarding/install/*` to `@authproxy path` whitelist; was 404 before). 6/6 server-side UAT PASS (unauth 307 redirect to /login, mode cards rendered, "Coming Soon" badges on Own-Cloud/Cloud, manifest valid, pm2 web online). Generated one-liner is exactly ONE shell line (`bash -s -- <args>`, no `\` continuations — D-111-INSTALL-CMD-COPY-FRIENDLY).
  5. `41288965` Plan 111-05 — Mode reference docs panel (`mode-docs.tsx` accordion + `mode-cards.tsx` "Learn more" wiring + `page.tsx` integration). 6/6 UAT PASS, Plan 111-04 regression-safe. **D-111-RELAY-DATA-PLANE-DOC delivered**: Hybrid `securityTradeoffs[1]` = "Zero relay data plane — your traffic does NOT flow through Server5. The legacy {username}.livinity.io alias does (DO NOT use that — prefer your own domain)" — explicit honesty disclosure that Server5 relay terminates TLS for tunnel-mode aliases.
  6. `(this commit)` 5× SUMMARY.md (one per plan) + this STATE.md update + ROADMAP.md plan progress (5× `[ ]` → `[x]` + Phase 111 header CODE-COMPLETE tag).
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 5 commits (verified via pre-commit hook + post-merge grep `git diff master~5..master -- liv/packages/core/src/sdk-agent-runner.ts` = empty).
- D-NO-LIVOS-CHANGE preserved: `git diff master~5..master -- livos/ liv/` = 0 lines (Server5 work + .planning/ artifacts only).
- D-NO-PROD-IMPACT preserved: Mini PC's `livos/install.sh` and `livos/update.sh` untouched.
- D-111-NO-CROSS-USER-LEAK enforced: Plan 111-02 DELETE route filters `WHERE id = $1 AND user_id = $2`; cross-user revoke returns 404 (not 200), preventing id-enumeration oracle.
- Wave structure: Wave 1 (parallel-safe: 111-01, 111-02, 111-03 — different files, executed sequentially since `parallelization=false`); Wave 2 (111-04 depends on Waves 1's two endpoints); Wave 3 (111-05 builds on 111-04).
- **Tunnel slot side-effect (mid-session discovery)**: Plan 111-02 drops `api_keys.user_id` UNIQUE but `tunnel_connections.user_id` UNIQUE remains — multi-key per user does NOT yet imply multi-tunnel per user. The Mini PC + mainserver tunnel kick war this session was caused by both boxes sharing the same API key with single tunnel slot enforced via the latter constraint. Resolved by pausing mainserver tunnel (Redis `livos:platform:api_key` DEL'd, livos restart → "No API key configured, staying idle"). True multi-device tunnel = v34.x scope. See [feedback_minipc_is_owncloud_primary](../memory/feedback_minipc_is_owncloud_primary.md).
- Operator-walked binding UAT pending (per `feedback_milestone_uat_gate`): fresh Ubuntu 24.04 VPS + browser-walk wizard at `https://livinity.io/onboarding/install` + Hybrid mode + real Cloudflare API token (with DNS:Edit + Zone:Read scopes) + paste generated one-liner on VPS + observe install completion + open `https://<domain>` + App Store loads with marketplace catalog. Until walked, Phase 111 is CODE-COMPLETE not SHIPPED.
- Follow-ups (out of Phase 111 scope, candidate v34.x): (a) verification polling — auto-detect install completion via heartbeat (deferred to Phase 112+ per ROADMAP); (b) multi-device tunnel — drop `tunnel_connections.user_id` UNIQUE + relay registry keyed by api_key_id instead of username; (c) `bruce.livinity.io` `custom_domains` registration for Mini PC's preferred public alias; (d) Own-Cloud + Cloud mode card "Coming Soon" stubs need real impls.

## 113-01 Status (2026-05-13) — Caddy `--environ` Flag Stripped, Journal Clean (Rule 1+3 mid-flight deviation; plan's `Environment=` migration was already done in earlier session, real leak source was `--environ` debug flag in base ExecStart)

- **CADDY ENV LEAK FIX** (single plan in Phase 113, 2 tasks): closes the v34 hygiene gap where `journalctl -u caddy` carried 5 plaintext `CLOUDFLARE_API_TOKEN=cfut_...` lines since boot (most recent `May 13 18:24`). Two source commits + SUMMARY commit:
  1. `52fe695f` Task 1 — `.planning/phases/113-caddy-cloudflare-api-token-log-leak-remediation/113-01-INVESTIGATION.md` (248 lines). Live mainserver probe: 5 plaintext token lines confirmed; `systemctl show caddy --property=Environment` returned EMPTY (proves inline Environment= was already migrated by an earlier session via `/etc/systemd/system/caddy.service.d/livos-cf-token.conf` which had `EnvironmentFile=/etc/livos/secrets/cf-token`, mode 600 root:root, 75 bytes); base unit had `ExecStart=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile`. Identified `--environ` flag (Caddy debug feature that prints `os.Environ()` to stdout → journald) as the real leak source. Revised Task 2 plan: strip the flag via a second drop-in instead of migrating `Environment=` (which was a no-op).
  2. `6df3cb8b` Task 2 — `.planning/phases/113-caddy-cloudflare-api-token-log-leak-remediation/113-01-DEPLOY.md`. Applied new drop-in `/etc/systemd/system/caddy.service.d/strip-environ-flag.conf` (mode 644) with `ExecStart=` reset + re-declare `ExecStart=/usr/bin/caddy run --config /etc/caddy/Caddyfile` (no `--environ`). `systemctl daemon-reload && systemctl restart caddy` → `is-active: active` within 3s. `systemctl show caddy --property=ExecStart` → `argv[]=/usr/bin/caddy run --config /etc/caddy/Caddyfile` (no `--environ`). `journalctl -u caddy --since "30 seconds ago" | grep -c CLOUDFLARE_API_TOKEN` → **0** (was 5 since boot). `curl -sIL https://test.livinity.live` → HTTP/2 200; `curl -sIL -H "Host: n8n.test.livinity.live" https://test.livinity.live` → HTTP/2 302 (wildcard cert still works, Phase 112 routing preserved). Cert dir intact: `test.livinity.live` + `wildcard_.test.livinity.live`.
  3. `(this commit)` 113-01-SUMMARY.md + this STATE.md update + ROADMAP.md plan progress.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across both Phase 113 commits (verified after each).
- **Deviation:** Rule 1+3 (Bug, blocking). Plan's Task 2 mechanism (migrate inline `Environment=` → `EnvironmentFile=`) was moot — already done in an earlier session. Real leak was `--environ` debug flag. Revised Task 2 (strip flag via new drop-in) preserved objective / scope / blast radius / locked decisions (D-113-NO-CADDY-DOWNTIME, D-113-NO-DNS-DROP, D-113-MAINSERVER-ONLY, D-113-SACRED-SHA-UNTOUCHED). Full diagnostic rationale in 113-01-INVESTIGATION.md. No user input needed per Rule 4 (same target, same risk, correct mechanism).
- D-113-NO-CADDY-DOWNTIME: `systemctl restart caddy` was required (drop-in `ExecStart=` only applies on next start) — restart was <500ms, brief TCP reset acceptable. Cert renewal continues normally.
- D-113-NO-DNS-DROP preserved: `EnvironmentFile=/etc/livos/secrets/cf-token` still loaded; `{env.CLOUDFLARE_API_TOKEN}` in Caddyfile still resolves; wildcard cert renewal works (curl 302 proves it).
- D-113-MAINSERVER-ONLY preserved: one new drop-in file on mainserver, zero source-tree commits (only `.planning/` docs).
- Follow-ups (out of Phase 113 scope, documented in SUMMARY): (a) journal vacuum for 5 historic leaked entries (operator decision, destructive), (b) CF token rotation (operator-only, needs Cloudflare dashboard), (c) audit other systemd units for similar debug flags (v34.x scope), (d) fold `strip-environ-flag.conf` into `scripts/install/deploy-livinityd.sh` for fresh installs (Phase 114 or v34.x polish).

## 112-01 Status (2026-05-13) — WebApp Subdomain Gateway Proxy Fix SHIPPED + UAT APPROVED (defense-in-depth `livos:domain:config` bootstrap; n8n.test.livinity.live now routes through gateway)

- **DEFENSE-IN-DEPTH FIX** (single plan in Phase 112, 3 tasks): closes the v34 mainserver UAT routing dead-end where `curl -H "Host: n8n.test.livinity.live" http://127.0.0.1:8080` returned livinityd's CSP-stamped dashboard HTML instead of n8n's homepage. Root cause: `livos:domain:config` Redis key empty on fresh hybrid installs → gateway middleware at `livos/packages/livinityd/source/modules/server/index.ts:321-324` short-circuits with `next()` → every subdomain falls through to LivOS UI. Four source commits (`e39fb679..8f9f0395`) + SUMMARY commit:
  1. `e39fb679` Task 1 — `.planning/phases/112-webapp-subdomain-gateway-proxy-fix-n8n-routing/112-01-INVESTIGATION.md` (154 lines). Live mainserver Redis dump + before-curl evidence: `livos:domain:config` empty, `livos:domain:subdomains` has the n8n entry but is unreachable past the gate, `livos:domain:hybrid_subdomain=test.livinity.live` (the canonical domain to derive from), `livos:domain:local_mode=hybrid`. Confirmed Hypothesis A (config-missing gate). Refuted Hypothesis B (subdomain-table-not-consulted) — code at `server/index.ts:342-345` IS correct, just unreachable. Locked Recommended Fix Shape = Option A + Option B (defense in depth).
  2. `9cbcc945` Task 2a — `_dld_seed_domain_config()` helper in `scripts/install/deploy-livinityd.sh` (+104 / -3). Reads REDIS_URL from `_DLD_ENV_FILE` (after `_dld_write_env_file`), extracts password via `sed`, EXISTS short-circuits if `livos:domain:config` already present (D-112-IDEMPOTENT — preserves Settings-wizard or tunnel-client auto-bootstrap), case-switches on `livos:domain:local_mode` (hybrid → `hybrid_subdomain`; tunnel → `tunnel_domain`; local-lan → `local_tld`; cloud/unset → skip silently). Writes `{"domain","active":true,"activatedAt":<epoch>,"source":"install-112"}` matching DomainConfig interface (routes.ts:27-31). Wired into `deploy_livinityd` pipeline after `_dld_seed_mcp_servers` and before `_dld_write_systemd_unit`. WARN-not-FAIL on every error path (5 `return 0` exit ramps; zero `fail ` calls — D-112-WARN-NOT-FAIL).
  3. `43fe0fd0` Task 2b — Boot-time fallback in `livos/packages/livinityd/source/index.ts start()` (+43). Same derivation logic in TypeScript, immediately after `seedDefaultAliases` block (before heartbeat block). Reads `livos:domain:config` → early-returns if present; reads `livos:domain:local_mode` → switches; for hybrid/tunnel/local-lan reads matching source key; writes `source:"boot-112"`. Wrapped in try/catch + `this.logger.error('Phase 112: failed to bootstrap livos:domain:config', err)` on failure (non-fatal). Survives accidental `redis-cli DEL livos:domain:config` (which is exactly how this bug surfaced — the key got DELed during earlier 503 troubleshooting).
  4. `8f9f0395` Task 2c — `TEST_PHASE_112_DOMAIN_CONFIG_SEED` block in `scripts/install/__tests__/test-deploy-livinityd.sh` (+60 / -1). 5 assertions: (1) helper defined, (2) helper body contains 4 required tokens (`EXISTS livos:domain:config`, `SET livos:domain:config`, `livos:domain:hybrid_subdomain`, `livos:domain:tunnel_domain`), (3) WARN-not-FAIL semantics (zero `fail ` + ≥5 `return 0`), (4) pipeline order via `grep -n + awk -F:` cross-platform-robust line-extraction (`env_file < mcp_servers < domain_config < systemd_unit`), (5) JSON envelope shape (`"source":"install-112"` + DomainConfig fields). Suite: **158 → 163 PASS, 0 FAIL.**
  5. `(this commit)` 112-01-SUMMARY.md + this STATE.md update + ROADMAP.md plan progress.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 4 source commits (`git hash-object liv/packages/core/src/sdk-agent-runner.ts` returned matching SHA after each; pre-commit hook gated every commit; no `--no-verify` bypasses). Verified on mainserver `/opt/liv/packages/core/src/sdk-agent-runner.ts` post-deploy = matching SHA.
- D-NO-PROD-IMPACT preserved: `git diff e39fb679~1..8f9f0395 -- livos/install.sh livos/update.sh | wc -l` → 0. Mini PC source-of-truth scripts UNTOUCHED.
- D-112-NO-CADDY-CHANGE preserved: `git diff e39fb679~1..8f9f0395 -- '*Caddyfile*' livos/packages/livinityd/source/modules/domain/caddy.ts | wc -l` → 0.
- D-112-NO-LIVOS-AUTH-BYPASS preserved: `git diff e39fb679~1..8f9f0395 -- livos/packages/livinityd/source/modules/server/index.ts | wc -l` → 0. Gateway middleware byte-identical pre/post. The 302 → /login behavior at AFTER curl IS the auth gate firing correctly on a non-`public` app, NOT a regression.
- D-112-MIN-BLAST-RADIUS preserved: only NEW code is 1 bash helper (~80 lines) + 1 TS try/catch (~30 lines) + 5 test assertions. Gateway middleware byte-identical.
- D-112-IDEMPOTENT-SEED preserved: EXISTS short-circuit in both helper and boot block — operator manual config from Settings wizard or tunnel-client auto-bootstrap is preserved. UAT Step 5 (operator-mutation idempotency proof) was scoped but deferred — the EXISTS gate is asserted in TEST_PHASE_112 assertion 2 + the `if (!existing)` guard in the boot block is similarly defensive. Low-risk carry-forward.
- **Mainserver live deploy (2026-05-13):** `bash /opt/livos/update.sh` on `root@154.53.56.75` → rsynced source → restarted livos → boot-time fallback fired: Redis `livos:domain:config` = `{"domain":"test.livinity.live","active":true,"source":"boot-112"}` ✓; journalctl shows `Phase 112: bootstrapped livos:domain:config domain=test.livinity.live (local_mode=hybrid)` ✓; curl `-H "Host: n8n.test.livinity.live" http://127.0.0.1:8080` → **HTTP 302 → /login** (was HTTP 200 + livinityd CSP) ✓.
- **Operator browser UAT (2026-05-13):** **APPROVED.** User opened `https://n8n.test.livinity.live` in a real browser and confirmed n8n's UI rendered (either via existing LivOS session, or via /login → n8n flow). Phase 112 functionally complete from user's perspective.
- Deviations: **NONE.** Plan executed exactly as written. One baseline reconciliation noted in SUMMARY: test-deploy-livinityd.sh baseline was 158 (not 156 as plan estimated) due to independent Phase 108/109 test growth between plan time and execute time; +5 delta exact.
- Carry-forward (out of scope for Phase 112 by D-112-NO-LIVOS-AUTH-BYPASS): `apps.ts:registerAppSubdomain` should write `public:true` for apps whose manifest declares it, so public-by-design apps (n8n, etc.) bypass LivOS auth and serve their own login UI directly. Documented as follow-up plan candidate in 112-01-SUMMARY.md § Follow-up / Carry-forward. Phase 113-bis or v34.1 absorbs.

## 108-01 Status (2026-05-13) — App Store Local Mode CODE-COMPLETE (204 PASS combined; 2 source commits + SUMMARY; sacred SHA preserved 3/3; mainserver UAT carry-forward)

- **LOCAL-MODE REWIRE** (single plan in Phase 108, 3 tasks): closes the fresh-VPS dead-end discovered after Phase 105/106/109 shipped, where clicking the App Store dock icon on a fresh install (no livinity.io API key) rendered a `<NoApiKeyMessage />` "Connect to Livinity Platform" prompt instead of the existing native catalog. Two source commits (`f4ca52e9..edb568c9`) + SUMMARY commit `bfbd603d`:
  1. `f4ca52e9` Task 1 — `livos/packages/ui/src/modules/window/app-contents/app-store-content.tsx` rewritten. Default branch when `apiKey == null`: `<Navigate to='/app-store' replace />` → defers to native `/app-store` route already powered by `AvailableAppsProvider + trpcReact.appStore.registry` (gallery cache from `/opt/livos/data/app-stores/*/livinity-app.yml`). Platform-mode iframe path preserved in new sub-component `PlatformModeIframe` (D-108-PLATFORM-OPT-IN-PRESERVED). Only new dependency: `Navigate` from `react-router-dom` (already top-level dep — D-108-NO-NEW-DEPS).
  2. `edb568c9` Task 2 — NEW `app-store-content.test.tsx` (vitest, readFileSync+regex pattern from sibling `webapp-teach-popup-host.test.tsx`; no @testing-library/react needed): 6 source-text invariants — Navigate import present, Navigate→/app-store usage present, NoApiKeyMessage gone, "Connect to Livinity Platform" copy gone, livinity.io/store iframe URL preserved, useAppStoreBridge wiring preserved. Plus deploy-livinityd.sh `_dld_update_gallery_cache` comment block + step() banner explicitly reference Phase 108. Plus TEST 21B block in `test-deploy-livinityd.sh` (+2 regression assertions: comment block references Phase 108, step banner combines "105-02 G5 / 108"). Test deltas: deploy-livinityd 154 → 156 (+2), mode-hybrid 18 (unchanged), mode-tunnel 24 (unchanged), UI vitest 0 → 6 (+6 new file). **Combined: 156 + 18 + 24 + 6 = 204 PASS, 0 FAIL** (up from 196 pre-108).
  3. `bfbd603d` Task 3 — `108-01-SUMMARY.md` + this STATE.md update.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 3 commits (`git hash-object liv/packages/core/src/sdk-agent-runner.ts` post each commit; pre-commit hook gated every commit; no `--no-verify` bypasses).
- D-NO-PROD-IMPACT preserved: `git diff f4ca52e9~1..bfbd603d -- livos/install.sh livos/update.sh | wc -l` → 0. Mini PC's source-of-truth scripts UNTOUCHED.
- D-108-NO-API-KEY-FOR-LOCAL upheld: local-mode render path is purely a client-side React-Router redirect to `/app-store` (already wired). Zero outbound HTTP traffic to livinity.io or apps.livinity.io in the new code path. tRPC `appStore.registry` query reads filesystem only.
- D-108-PLATFORM-OPT-IN-PRESERVED upheld: `https://livinity.io/store` iframe + postMessage bridge + EnvironmentOverridesDialog all retained in `PlatformModeIframe` (mounted only when `apiKey` is a non-empty string). Vitest assertions 5 & 6 lock this in.
- Deviations: NONE. The only cosmetic adjustment was rephrasing the source-file's leading comment block to avoid the literal substrings `NoApiKeyMessage` and `Connect to Livinity Platform`, which would otherwise have tripped Vitest's negative-grep assertions 3 and 4. Functional code unchanged.
- Carry-forward: **mainserver `154.53.56.75` UAT is the binding gate for closing Phase 108.** Operator-walked. Procedure documented in `108-01-SUMMARY.md:Mainserver UAT Carry-Forward` section (Steps A–F: push + git pull → rebuild UI + restart livos → confirm gallery cache populated → local-mode smoke (Discover loads, no livinity.io network calls) → install smoke (AdGuard installs from local) → platform-mode opt-in smoke (set API key, iframe loads, clear key). Until that PASSes, status is `code-complete-pending-mainserver-uat`, not `shipped`.

## 109-01 Status (2026-05-13) — MCP Servers Auto-Seed CODE-COMPLETE (195 PASS combined; 3 source commits + SUMMARY; sacred SHA preserved 3/3; mainserver UAT carry-forward)

- **AUTO-SEED** (single plan in Phase 109, 4 tasks): closes the first-run UX gap discovered after Phase 105/106 shipped, where fresh installs came up with AI Chat present but tool-use empty (`liv:mcp:config` unset → MCP panel showed "No servers installed — Browse the Marketplace to add MCP servers"). New install pipeline auto-registers 2 default MCP servers (`sequential-thinking` + `luse`) by seeding Redis key `liv:mcp:config` from a templated JSON file. Three source commits (`863c2125..214c2b38`) + this SUMMARY commit:
  1. `863c2125` Task 1 — `scripts/install/seeds/mcp-servers.json` (NEW file, new directory). Verbatim Mini PC `liv:mcp:config` export with two host-specific fields templated: `luse.env.LUSE_REDIS_URL` → `__LIVOS_REDIS_URL__` placeholder (D-109-PASSWORD-NEVER-IN-REPO); both `installedAt` epochs → `0` (D-109-INSTALLED-AT-ZERO). 33 lines.
  2. `3780fd4b` Task 2 — `_dld_seed_mcp_servers` helper (~85 lines) + pipeline wire in `deploy-livinityd.sh`. Idempotent: `EXISTS liv:mcp:config` short-circuit before SET (D-109-IDEMPOTENT — preserves user customizations across `update.sh` re-runs). Fail-soft: every `redis-cli` error path is `warn`-then-`return 0` (D-109-FAIL-SOFT — a failed MCP seed must NOT brick install). Substitution: `sed "s|__LIVOS_REDIS_URL__|${redis_url}|g"` with pipe delimiter (REDIS_URL contains `/`). Pipeline wire: between `_dld_write_env_file` (line 1328) and `_dld_write_pnpm_npmrc` (line 1330) — `.env` exists FIRST so helper can read `REDIS_URL` from it.
  3. `214c2b38` Task 3 — `+4` regression assertions (`TEST_PHASE_109_MCP_SEED` block) in `test-deploy-livinityd.sh`: (1) seed file present + valid JSON + placeholder + both server entries, (2) helper defined, (3) helper body has 4 required tokens (`__LIVOS_REDIS_URL__` / `EXISTS liv:mcp:config` / `SET liv:mcp:config` / `sed` substitution), (4) pipeline order via `grep -n + awk -F:` extracting line numbers + `(( a < b < c ))`. Summary echo updated to mention `+ 109`. Deploy-livinityd: 149 → 153 PASS. **Combined: 153 (deploy) + 18 (hybrid) + 24 (tunnel) = 195 PASS, 0 FAIL** (up from 190 in Phase 106 SUMMARY — slight baseline drift accounts for the +1 over the planned 194 target, but +4 from deploy-livinityd is exact).
  4. `(this commit)` 109-01-SUMMARY.md + STATE.md update.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 3 source commits (`git ls-tree HEAD~3 / HEAD~2 / HEAD~1 / HEAD liv/packages/core/src/sdk-agent-runner.ts` all return the same SHA; pre-commit hook gated every commit; no `--no-verify` bypasses).
- D-NO-PROD-IMPACT preserved: `git diff 863c2125~1..214c2b38 -- livos/install.sh livos/update.sh | wc -l` → 0. Mini PC's source-of-truth scripts UNTOUCHED.
- D-104-RELAY-ZERO-DATA-PLANE preserved: seed file contains zero Server5 / livinity.io / nexus.livinity references. Helper additions reference only localhost (127.0.0.1:6379 via Redis URL).
- D-109-PASSWORD-NEVER-IN-REPO upheld: `git diff 863c2125~1..214c2b38 | grep -c "a3bb23cb"` → 0. The seed file's only Redis-related token is the literal `__LIVOS_REDIS_URL__` placeholder; the real REDIS_URL is substituted at install-time on the target host.
- Deviations: NONE. Plan was specific about file contents, helper body (verbatim), pipeline insertion site, and test assertion shape. One minor cross-platform adaptation: the plan's `grep -Pzoq` pattern for Task 3 Assertion 4 fails on Windows Git Bash without `LC_ALL=C.UTF-8`; switched to the Bug #9 pattern (Phase 106 line 1014) — `grep -n + awk -F:` for line numbers + `(( a < b < c ))` — semantically equivalent, cross-platform robust, more informative on failure.
- Carry-forward: **mainserver `154.53.56.75` re-install UAT (Task 4 binding gate) is operator-walked.** Procedure documented in `109-01-SUMMARY.md:Mainserver UAT Carry-Forward` section (Steps A-F: push → fresh install → wait + journal → `redis-cli KEYS / GET` verify → idempotency proof via manual mutation + helper re-execute → UI smoke check at `https://test.livinity.live/` AI Chat → MCP panel showing 2 servers). Until that PASSes, status is `code-complete-pending-mainserver-uat`, not `shipped`.

## 106-01 Status (2026-05-12) — Bootstrap-Layer Hotfix Back-Port CODE-COMPLETE (190 PASS combined; 7 source commits + SUMMARY; sacred SHA preserved 7/7; mainserver UAT carry-forward)

- **BACK-PORT** (single plan in Phase 106, 8 tasks): closes the gap discovered in Phase 105's 2× UAT on mainserver `154.53.56.75` where 6 bootstrap-layer bugs surfaced AFTER the canonical 1:1 update.sh port shipped. All 6 fixes back-ported to repo so a fresh `bash install.sh --mode hybrid ...` on Ubuntu 24.04 is byte-equivalent to the manually-hotfixed mainserver state. Seven source commits (`c3f13dd2..262e28f4`) + this SUMMARY commit:
  1. `c3f13dd2` Bug #7 — `_dld_install_system_packages` adds `mender-client4` (WARN-not-FAIL; silences `spawn mender ENOENT` log spam from livinityd update-check)
  2. `f31dc494` Bug #8 — `_dld_install_system_packages` adds `samba samba-common-bin` (main apt array — required, not optional; livinityd Files module needs smbpasswd + /etc/samba/smb.conf)
  3. `ba6e084d` Bug #9 — NEW helper `_dld_install_google_chrome` + pipeline wire (FATAL bug — WebApp Launcher blocker; livinityd's Streaming module spawned `google-chrome` → ENOENT → flap; signed-keyring pattern, /usr/share/keyrings/google-chrome.gpg, WARN-not-FAIL; wired between streaming_packages and setup_docker_images)
  4. `3fd11273` Bug #10 — NEW helper `_dld_create_desktop_user` + new constants `_DLD_DESKTOP_USER:-bruce` / `_DLD_DESKTOP_UID:-1000` + pipeline wire (`sudo: unknown user bruce` fix; idempotent useradd + usermod -aG sudo[,docker] + /etc/sudoers.d/99-bruce NOPASSWD:ALL drop-in validated by visudo -cf; existing `_DLD_LIVOS_USER:-root` PRESERVED — different purpose: file-tree owner vs. GUI/sudo human login; D-104-NO-PROD-IMPACT preserved)
  5. `1bc488a9` Bug #11 — `_dld_generate_jwt_secret` rewrite: `openssl rand -hex 32 | tr -d '\n'` (exactly 64 hex chars, no terminator) matches `validateSecret` regex `/^[0-9a-fA-F]+$/ AND length === 64` in `livos/packages/livinityd/source/modules/jwt.ts`. REUSE path detects old base64 format, backs up as `.pre-106.bak`, rotates to hex (forced re-login is better than continued crash-loop). Post-write self-check guards fs glitches.
  6. `4205b902` Bug #12 — `livos/packages/livinityd/source/modules/user/user.ts:exists()` returns `Boolean(user?.hashedPassword)` instead of `user !== undefined`. FileStore seeds `user: {}` (empty hash) on first run → old check false-positived → fresh-install register flow rejected with "user is already registered". All 5 callers (register guard, login redirect, startup migrations, tRPC procedures) ALREADY want hashedPassword-present semantics per plan §3.
  7. `262e28f4` +22 regression assertions in `scripts/install/__tests__/test-deploy-livinityd.sh` (126 → 148 PASS). Breakdown: TEST_BUG_7 (1 assert), TEST_BUG_8 (1), TEST_BUG_9 (4 incl. pipeline-order check), TEST_BUG_10 (8 incl. D-104-NO-PROD-IMPACT preservation), TEST_BUG_11 (5 incl. negative-grep on old base64 form), TEST_BUG_12 (3). Combined regression smoke: deploy-livinityd 148 + mode-hybrid-args 18 + mode-tunnel-args 24 = **190 PASS, 0 FAIL** (up from 168 pre-106).
  8. `(this commit)` 106-01-SUMMARY.md + STATE.md + ROADMAP.md updates (single commit per `state` handler protocol).
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 7 source commits (`git hash-object liv/packages/core/src/sdk-agent-runner.ts` re-checked after each commit; pre-commit hook gated every commit; no `--no-verify` bypasses).
- D-104-NO-PROD-IMPACT preserved: `git diff c3f13dd2~1..262e28f4 -- livos/install.sh livos/update.sh | wc -l` → 0. Mini PC's source-of-truth scripts UNTOUCHED.
- D-104-RELAY-ZERO-DATA-PLANE preserved: `grep -E '45\.137\.194\.10[23]|livinity\.io|nexus\.livinity|relay\.livinity|server5' scripts/install/deploy-livinityd.sh` → exit 1 (no matches). No new Server5/livinity.io control-plane traffic added by Phase 106.
- D-106-NEW-CONSTANT-PATTERN: Bug #10 introduced a NEW constant `_DLD_DESKTOP_USER` rather than reusing existing `_DLD_LIVOS_USER`. Rationale: they serve different purposes — `_DLD_LIVOS_USER` owns `/opt/livos/` + `/opt/liv/` trees (defaults `root` to match Mini PC at first-install per update.sh:619-620); `_DLD_DESKTOP_USER` is the human-friendly GUI/sudo login (defaults `bruce`). Conflating them would break either Mini PC ownership semantics OR the new desktop-user identity. Test gate (TEST_BUG_10 D-104-NO-PROD-IMPACT assertion) verifies `_DLD_LIVOS_USER:-root` default preserved.
- D-106-WARN-NOT-FAIL: Bugs #7 (mender) and #9 (chrome) accept install failure as WARN-not-FAIL. Rationale: hard-fail would brick deploys on minimal containers / universe-less Ubuntu derivatives. Bug #7 fixes verbose log spam (non-critical); Bug #9 hard-fails Streaming module if chrome absent but the deploy completes so operator can debug ENOENT. Bug #8 (samba) and #10 (sudoers) and #11 (JWT format) are required and use hard-fail (or `fail` on JWT post-write self-check).
- Deviations: ONE Rule 1 deviation (Task 6 / Bug #12). `npx vitest run source/modules/user/user.integration.test.ts` failed in the Windows worktree with `Cannot find package '...@anthropic-ai/claude-agent-sdk/index.js'` imported from `@liv/core/dist/sdk-agent-runner.js` — pre-existing pnpm workspace dependency-resolution issue in the local test rig, NOT caused by this change. Out of scope per Rule SCOPE-BOUNDARY (only auto-fix issues DIRECTLY caused by current task's changes). Bug #12 fix is statically test-safe per plan §4 (empty store → `Boolean(undefined) === false`; post-register → `Boolean(hash) === true`). Carry-forward to a v34.x test-hygiene plan — does not block plan completion.
- Carry-forward: **mainserver `154.53.56.75` re-install UAT (Task 8 checkpoint:human-verify) is the BINDING GATE for closing Phase 106.** Operator-walked. Procedure documented in `106-01-SUMMARY.md:Mainserver UAT Carry-Forward` section: SSH to mainserver, `git pull`, `bash install.sh --mode hybrid --domain test.livinity.live --cf-token X --cf-zone-id Y`, then verify (i) all 4 systemd services active, (ii) `NRestarts=0`, (iii) `journalctl -u livos.service -n 50 | grep -E "spawn ENOENT|Invalid JWT|user is already registered"` → exit 1, (iv) `id bruce` shows uid 1000 + sudo + docker groups, (v) `/etc/sudoers.d/99-bruce` exists mode 0440, (vi) chrome+samba+smbpasswd on PATH, (vii) JWT secret is 64 hex chars no newline, (viii) browser `https://test.livinity.live` shows REGISTER screen (NOT login — Bug #12 unblocked) and register succeeds. Until that PASSes, status is `code-complete-pending-mainserver-uat`, not `shipped`.

## 104-13 Status (2026-05-12) — pnpm blockExoticSubdeps hotfix SHIPPED (71/71 host-side bash test PASS; unblocks baileys → libsignal git-repository subdep on pnpm 11+)

- **HOTFIX** (13th plan added to phase after 104-12): 104-13 fixes the second mainserver 154.53.56.75 re-deploy failure mode on 104-12's `deploy-livinityd.sh`. Modern Ubuntu 24.04 hosts get pnpm 11.1.1+ via `npm install -g pnpm@latest`, which enforces `blockExoticSubdeps` by default. pnpm refuses to install `libsignal` (a legitimate `baileys@6.7.21` WhatsApp subdep that comes from a `git-repository` URL) and `pnpm install` fails with `[ERR_PNPM_EXOTIC_SUBDEP]`. Mini PC unaffected — older pnpm there doesn't enforce the gate. Two commits:
  1. `85b0b3ef` `scripts/install/deploy-livinityd.sh` (1 new helper + pipeline wire): `_dld_write_pnpm_npmrc` writes/appends `block-exotic-subdeps=false` to `${_DLD_LIVOS_DIR}/.npmrc` (i.e. `/opt/livos/.npmrc`). Idempotent: greps for existing `^block-exotic-subdeps=` line and short-circuits with `ok` log when present; only appends when absent. Wired into `deploy_livinityd` AFTER `_dld_clone_source` (so `/opt/livos/` exists) and BEFORE `_dld_build_packages` (so pnpm sees the file at install time). Header comment block documents the supply-chain tradeoff (relaxes the gate for ALL git-resolved subdeps, not just `libsignal`) and lists the deferred audit checklist (review every git-resolved subdep, pin baileys to libsignal-free version, switch to npm-published libsignal-client wrapper). Pipeline header comment + final `ok` line updated to mention 104-13. Plus `.planning/phases/104-local-install-and-docker-uat/104-13-PLAN.md`.
  2. `(this commit)` `scripts/install/__tests__/test-deploy-livinityd.sh` (TEST 15 added, 66 → 71 assertions: (a) `_dld_write_pnpm_npmrc()` function defined, (b) literal `block-exotic-subdeps=false` present in source, (c) helper targets `.npmrc` under `_DLD_LIVOS_DIR`, (d) idempotent `grep -q "^block-exotic-subdeps="` guard present, (e) call-order check using awk-extracted `deploy_livinityd` body: clone < npmrc-write < build). Plus 104-13-SUMMARY.md + STATE.md + ROADMAP.md updates.
- Test results: `bash scripts/install/__tests__/test-deploy-livinityd.sh` → 71 PASS, 0 FAIL. Plus 104-08 test-mode-hybrid-args.sh 18/18 still PASS + 104-09 test-mode-tunnel-args.sh 24/24 still PASS. **Combined: 18 + 24 + 71 = 113 PASS across 3 test files (up from 108 after 104-12).**
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across both commits (verified via `git hash-object liv/packages/core/src/sdk-agent-runner.ts` post each commit).
- D-104-NO-PROD-IMPACT preserved: mode-cloud.sh untouched (TEST 6 negative-grep still PASS); 104-08/104-09 regression smoke still PASS.
- D-104-RELAY-ZERO-DATA-PLANE preserved: deploy-livinityd.sh has ZERO Server5 / livinity.io / nexus.livinity / relay.livinity references — only network calls are git clone (GitHub), apt-get, optional 104-10 heartbeat.
- D-104-13-SECURITY-TRADEOFF: setting `block-exotic-subdeps=false` relaxes pnpm's supply-chain safety for ALL git-resolved subdeps, not just `libsignal`. Accepted because in our current `pnpm-lock.yaml` the only git-resolved subdep IS the known-good upstream `libsignal`. Deferred audit checklist documented in helper source comment + 104-13-SUMMARY.md (a) review every git-resolved subdep, (b) pin baileys to libsignal-free version when available, (c) switch to npm-published libsignal-client wrapper so the gate can be re-enabled.
- D-104-13-IDEMPOTENT-APPEND: helper greps for existing directive before appending — no double-write on re-run. Critical because install.sh is supposed to be re-runnable.
- Deviations: NONE (no Rule 1/2/3 fixes needed; the plan was specific about file path, directive literal, idempotency pattern, and call order).
- Carry-forward: **mainserver 154.53.56.75 re-deploy remains the orchestrator's NEXT step.** Re-run `bash install.sh --mode hybrid --domain test.livinity.live --cf-token X --cf-zone-id Y` on mainserver. Confirm: pnpm install succeeds (no more `[ERR_PNPM_EXOTIC_SUBDEP]`); all 4 systemd services active (`systemctl is-active livos liv-core liv-worker liv-memory` returns 4× `active`); `https://test.livinity.live` shows the LivOS login screen. THIS IS THE GO/NO-GO GATE FOR CLOSING PHASE 104.

## 104-12 Status (2026-05-12) — deploy-livinityd path-bug fix + liv-stack SHIPPED (66/66 host-side bash test PASS; closes 104-11's nested-path ENOENT failure + adds liv-core/liv-worker/liv-memory systemd units)

- **HOTFIX + SCOPE-EXTENSION** (12th plan added to phase after 104-11): 104-12 fixes the critical nested-`/opt/livos/livos/` rsync bug in 104-11's `deploy-livinityd.sh` that caused `pnpm install` to fail with `ENOENT: no such file or directory, scandir '/opt/livos/liv/packages/core'` on the mainserver 154.53.56.75 live test today, AND extends the deploy to also produce liv-core/liv-worker/liv-memory systemd units (closing the scope boundary 104-11 carried forward as "deferred to 104-12"). Root cause of the bug: livinityd's package.json declares `"@liv/core": "file:../../../liv/packages/core"` — that relative path resolves from `/opt/livos/packages/livinityd/`, three levels up = `/opt/liv/packages/core`. 104-11's rsync produced `/opt/livos/livos/packages/livinityd/` (nested) so `../../../liv` = `/liv` (does not exist). Three commits:
  1. `7a708430` `scripts/install/deploy-livinityd.sh` (299 insertions, 40 deletions). Constants: retire `_DLD_LIVOS_SRC`; add `_DLD_LIV_DIR=/opt/liv` + `_DLD_SYSTEMD_LIV_CORE_UNIT` + `_DLD_SYSTEMD_LIV_WORKER_UNIT` + `_DLD_SYSTEMD_LIV_MEMORY_UNIT`. Path fixes: schema.sql + WorkingDirectory + rsync dest + BUILD-FAIL guards + UI symlink all flat-rewired (no more `livos/livos/`). Pre-flight check: assert `/opt/liv/packages/core/` exists before `pnpm install` (catches ENOENT loudly). `_dld_clone_source` extended to ALSO rsync `repo/liv/` → `/opt/liv/` (sibling sync; excludes .git/, node_modules/, dist/, *.log). 3 NEW helpers: `_dld_build_liv_packages` (cd /opt/liv && npm install --omit=optional + per-package npm run build for core/worker/mcp-server/memory + BUILD-FAIL guard per dist; mirrors update.sh:493-562; closes update.sh's missing-memory-build bug per project memory), `_dld_sync_liv_dist_into_pnpm_store` (iterates ALL `@liv+<pkg>*` store dirs with rsync --delete — Phase 31 BUILD-02 multi-dir fix extended to all 4 packages; closes Mini PC pitfall where pnpm sharp-version drift causes stale-dist imports), `_dld_write_liv_systemd_units` (writes 3 unit files; each has After=postgresql+redis+network.target / Requires=postgresql+redis / EnvironmentFile=/opt/livos/.env / ExecStart=node dist/index.js / Restart=on-failure / RestartSec=5 / LimitNOFILE=65536; enable/start order memory → worker → core; mcp-server intentionally NO systemd unit per P77 on-demand spawn). `livos.service` After= clause adds liv-core for boot ordering. `deploy_livinityd` pipeline reordered: system pkgs → infra → clone-both-trees → build livos (pnpm) → build liv (npm) → sync liv dist → jwt + .env → liv systemd units FIRST → livos systemd unit → health check → caddy reload.
  2. `d00912eb` `scripts/install/__tests__/test-deploy-livinityd.sh` (149 insertions, 13 deletions): 44 → 66 assertions. TEST 3 extended with 3 new `_dld_*` helpers. TEST 10 INVERTED from negative-grep to positive (liv-core/worker/memory unit templates present + systemctl enable for liv-* + `@liv+${pkg}*` iteration pattern + rsync --delete pattern + rsync repo/liv/ → /opt/liv/ present + NEGATIVE no `liv-mcp-server.service`). TEST 12 NEW (path-bug fix: no LIVE /opt/livos/livos/ paths; _DLD_LIVOS_SRC retired; _DLD_LIV_DIR defined; pre-flight check present; flat WorkingDirectory; flat schema.sql). TEST 13 NEW (liv-stack build pipeline: npm install pattern, 4-pkg build loop, BUILD-FAIL guard, node dist/index.js ExecStart). TEST 14 NEW (deploy_livinityd call order: liv units BEFORE livos unit, liv build BEFORE liv units, dist sync AFTER liv build). 66/66 PASS.
  3. `(this commit)` `.planning/phases/104-local-install-and-docker-uat/104-12-PLAN.md` (new) + `104-12-SUMMARY.md` (new, ~330 lines) + STATE.md + ROADMAP.md updates.
- Test results: `bash scripts/install/__tests__/test-deploy-livinityd.sh` → 66 PASS, 0 FAIL. Plus 104-08 test-mode-hybrid-args.sh 18/18 still PASS + 104-09 test-mode-tunnel-args.sh 24/24 still PASS. **Combined: 18 + 24 + 66 = 108 PASS across 3 test files (up from 86 after 104-11).**
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 3 commits (verified via `git hash-object liv/packages/core/src/sdk-agent-runner.ts` post-each-commit).
- D-104-NO-PROD-IMPACT preserved: mode-cloud.sh untouched (TEST 6 negative-grep still PASS); 104-08/104-09 regression smoke still PASS (TEST 11).
- D-104-RELAY-ZERO-DATA-PLANE preserved: deploy-livinityd.sh has ZERO Server5 / livinity.io / nexus.livinity / relay.livinity references — only network calls are git clone (GitHub), apt-get (Ubuntu + NodeSource + Cloudsmith), and optional 104-10 heartbeat.
- D-104-12-COMBINED-TASK-1-2: path-bug fix (Task 1) and liv-stack extension (Task 2 per the prompt's framing) committed together as one logical change because they are INSEPARABLE — pre-flight check requires the /opt/liv/ rsync, build calls require /opt/liv/, systemd units require dist/index.js produced by the build. Splitting would leave an intermediate state where the path fix exists but pnpm install still fails (the original failure mode). The "Task 2 = test extensions" then follows naturally afterward (commit `d00912eb`). Net result: 3 commits as required by the success criteria.
- D-104-12-FLAT-LAYOUT: /opt/livos/ is FLAT — packages/{livinityd,ui,config}/ land directly under /opt/livos/, NOT nested as /opt/livos/livos/. This matches Mini PC at deployed SHA + Phase 65 rename memory.
- D-104-12-MCP-SERVER-NO-SYSTEMD: liv/packages/mcp-server is BUILT but does NOT get a systemd unit. Livinityd spawns it on-demand per P77 `additionalMcpServers` config.
- D-104-12-SYSTEMD-LOOSE-DEP: liv-* services use After= ordering but NOT hard Requires= between themselves (only postgresql+redis are Requires). Rationale: a crash-looping liv-memory shouldn't cascade-kill liv-core.
- Deviations: NONE (no Rule 1/2/3 fixes needed; the plan was explicit about path constants + helper names + test assertions). One STRUCTURAL DECISION (D-104-12-COMBINED-TASK-1-2 above) for commit atomicity — documented in SUMMARY but not a Rule deviation.
- Carry-forward: (a) **mainserver 154.53.56.75 re-deploy is the orchestrator's NEXT step.** Re-run `bash install.sh --mode hybrid --domain test.livinity.live --cf-token X --cf-zone-id Y` on mainserver. Confirm: `pnpm install` succeeds (no more ENOENT); all 4 systemd services active (`systemctl is-active livos liv-core liv-worker liv-memory` returns "active" 4 times); `https://test.livinity.live` loads the LivOS login screen (green padlock + LivOS UI). THIS IS THE GO/NO-GO GATE FOR CLOSING PHASE 104. (b) Plan 104-13 (if mainserver re-deploy surfaces more gaps) — likely candidates: liv-memory's `better-sqlite3` native build deps on Ubuntu 24.04, or liv-core's auth-token bootstrap.

## 104-11 Status (2026-05-12) — install.sh full livinityd deploy SHIPPED (44/44 host-side bash test PASS; closes "TLS green but UI absent" gap) — **path-bug discovered post-ship, fixed in 104-12 (2026-05-12)**

- **GAP-CLOSE** (11th plan added to phase after 104-10 v34 seed): 104-11 ships `scripts/install/deploy-livinityd.sh` (404 lines, 11 idempotent helpers) + `--skip-deploy` CLI flag (default = deploy) so the documented "single line install" UX (`curl -fsSL https://livinity.io/install.sh | sudo bash -s -- --mode hybrid --domain X --cf-token Y --cf-zone-id Z`) on a fresh Ubuntu 24.04 host actually delivers a working LivOS UI in the browser (green padlock + LivOS login screen) instead of just a Caddy placeholder. Discovered today via live test on mainserver `154.53.56.75`: 104-08 cert pipeline worked perfectly (green padlock at `https://test.livinity.live`) but the browser saw only Caddy's default placeholder because livinityd was never installed. Three commits:
  1. `78714614` `scripts/install/deploy-livinityd.sh` (NEW 404 lines, 11 idempotent helpers — apt Node 22 LTS via NodeSource + pnpm via npm -g + postgresql/postgresql-client + redis-server + build deps; Postgres setup with role/DB/schema.sql apply via `PGPASSWORD` env (T-104-11-1 — never on argv) + sudo -u postgres fallback for peer-auth; Redis setup with sed-remove-then-append requirepass for idempotency; git clone --depth 1 → /tmp/livos-install-stage + rsync to /opt/livos/livos/ excluding .git/.planning/docker/node_modules; pnpm install --frozen-lockfile + @livos/config tsc + ui vite build + BUILD-FAIL guards mirroring update.sh:287-295; JWT secret /opt/livos/data/secrets/jwt mode 0600 via openssl rand -base64 32; /opt/livos/.env mode 0600 with DATABASE_URL/REDIS_URL/JWT_SECRET_FILE/PORT/HOST/LIVOS_LOCAL_MODE/LIVOS_LOCAL_DOMAIN/LIVOS_HOST_IP + optional LIV_API_KEY from 104-09 + .env.bak backup before rewrite + reuse-on-rerun semantics reading existing passwords back from .env; livos.service systemd unit with After=postgresql+redis network.target + Requires=postgresql+redis + EnvironmentFile=/opt/livos/.env + ExecStart=pnpm --filter livinityd start + Restart=on-failure + LimitNOFILE=65536; 30s curl :8080 health check with WARN-not-FAIL semantics; /etc/caddy/Caddyfile rewrite to `reverse_proxy 127.0.0.1:8080` in per-mode shape (hybrid: LE DNS-01 + LIVOS_DOMAIN; tunnel: auto_https off + :80; local-lan: tls internal liv-local + *.${LIVINITY_LOCAL_TLD}; cloud: plain :80 bootstrap) + caddy validate before reload). Plus `.planning/phases/104-local-install-and-docker-uat/104-11-PLAN.md`.
  2. `efa83e11` `scripts/install.sh` (sources deploy-livinityd.sh + calls `deploy_livinityd` gated on `${SKIP_DEPLOY:-0}` != 1; positioned AFTER mode dispatch case + `set_livos_redis_key 'livos:domain:local_mode'` write so the deploy can read $MODE/$LIVOS_DOMAIN from already-populated env) + `scripts/install/parse-cli.sh` (new --skip-deploy case branch + SKIP_DEPLOY env-var fallback + --help block "Application deploy (Plan 104-11)" + export SKIP_DEPLOY) + `scripts/install/show-banner.sh` (branches on `${SKIP_DEPLOY:-0}`: deploy-ran → "UI: open https://${LIVOS_DOMAIN}/" with green-padlock promise; deploy-skipped → legacy "Next: open <URL>" wording; per-mode branches for cloud/local-lan/hybrid/tunnel — all four updated).
  3. `(this commit)` `scripts/install/__tests__/test-deploy-livinityd.sh` (NEW executable, 212 lines, 11 sub-tests, 44 assertions: TEST 1 --help mentions --skip-deploy + Plan 104-11 block; TEST 2 bash -n smoke on 11 install/*.sh files; TEST 3 deploy_livinityd + all 10 _dld_* helpers defined; TEST 4 install.sh wires + SKIP_DEPLOY gating; TEST 5 parse-cli.sh handles --skip-deploy + exports SKIP_DEPLOY; TEST 6 D-104-NO-PROD-IMPACT mode-cloud.sh negative-grep for deploy_livinityd; TEST 7 --skip-deploy propagation via sourced parse_cli probe; TEST 8 T-104-11-1/-2/-3 security negative-greps (PGPASSWORD env + chmod 0600 .env + chmod 0600 JWT); TEST 9 idempotency .env reuse + .env.bak backup; TEST 10 scope boundary liv-core/liv-worker/liv-memory NOT shipped + Plan 104-12 carry-forward documented; TEST 11 regression smoke 104-08 + 104-09 still PASS) + 104-11-SUMMARY.md + STATE.md + ROADMAP.md.
- Test results: `bash scripts/install/__tests__/test-deploy-livinityd.sh` → 44 PASS, 0 FAIL. Plus 104-08 test-mode-hybrid-args.sh 18/18 still PASS + 104-09 test-mode-tunnel-args.sh 24/24 still PASS (D-104-NO-PROD-IMPACT regression preserved). **Combined: 18 + 24 + 44 = 86 PASS across 3 test files.**
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 3 commits (pre-commit hook gated every commit).
- D-104-RELAY-ZERO-DATA-PLANE preserved: deploy-livinityd.sh has ZERO Server5 / livinity.io / nexus.livinity / relay.livinity references. Only network calls are git clone (GitHub), apt (Ubuntu archive + NodeSource + Cloudsmith for Caddy), and the optional 104-10 heartbeat (only when --api-key passed; explicitly-allowed control-plane traffic).
- Scope boundary: liv-core / liv-worker / liv-memory systemd units NOT shipped here. Documented as Plan 104-12 carry-forward both in helper file header AND in TEST 10 negative-grep assertion. Rationale: livinityd alone is enough for the UI + login screen — the core "single line install lands you at a green padlock + LivOS UI" goal. liv-core adds AI-agent capability which is separable.
- D-104-11-REUSE-NOT-ROTATE: re-running install.sh MUST NOT rotate existing PG/Redis passwords. Helpers read DATABASE_URL/REDIS_URL from /opt/livos/.env before generating new passwords. If .env is absent but PG role exists, defensive `ALTER USER livos WITH PASSWORD` aligns cluster with generated password. Rationale: operators running install.sh twice (e.g. to pick up a Caddy fix) shouldn't lose database access.
- D-104-11-HEALTH-NONFATAL: health check failure (livinityd not bound to :8080 within 30s) WARNs and continues — does NOT exit non-zero. Rationale: at health-check time, .env + systemd unit + Caddy reload are already done; failing now leaves the operator in a half-installed state with no easy recovery. Far better to print loud `journalctl -u livos.service -n 50` guidance and let operator debug from known-good install marker.
- Deviations: (1) Rule 1 — TEST 9 initial regex `DATABASE_URL=.*\.env` was too restrictive; actual source uses `grep -E '^DATABASE_URL=' "$_DLD_ENV_FILE"` with the var, not the literal `.env` token. Fixed inline in Task 3's same commit before commit landed: rewrote TEST 9 to match `grep.*DATABASE_URL=|sed.*DATABASE_URL=` patterns separately + added `.env.bak` backup sub-assertion. Broken interim form never landed in git.
- Carry-forward: (a) Plan 104-12 — deploy liv-core + liv-worker + liv-memory systemd units (same per-component idempotent helper pattern; new `deploy-liv-core.sh`). Also fix update.sh's missing-memory-build bug while we're at it. (b) 104-07 Task 2 Apple-device walk — now reachable end-to-end (install.sh after 104-11 produces working UI, so operator UAT can exercise actual LivOS login screen on iPhone Safari + iPad Safari + macOS Safari + macOS Chrome). (c) mainserver 154.53.56.75 re-test — re-run `bash install.sh --mode hybrid --domain test.livinity.live --cf-token X --cf-zone-id Y` and confirm UI loads end-to-end. This is GO/NO-GO gate for closing Phase 104.

## 104-10 Status (2026-05-12) — LivOS heartbeat client SHIPPED (43/43 vitest PASS in 3.34s; first client-side piece of v34)

- **v34 SEED** (10th plan added to phase after 104-09 hotfix): 104-10 ships the LivOS → livinity.io heartbeat client — the FIRST client-side piece of v34 (LivOS ↔ livinity.io account integration). When the operator runs `install.sh --mode tunnel --api-key liv_k_...` and the box boots, livinityd's start path arms a background heartbeat-sender. Every 60s it POSTs `{device_id, hostname, mode, version, ip, uptime, node_version}` to `https://livinity.io/api/devices/heartbeat` with `X-Api-Key: liv_k_...`. When Server5 ships the matching `/api/devices/heartbeat` route (separate v34.x repo work), Server5's `devices.last_seen` column updates and the "is your box online" dashboard widget lights up — with NO LivOS-side change needed (forward-compat). Three commits:
  1. `dc3d4044` `livos/packages/livinityd/source/modules/account/` (NEW directory, 9 files): api-key.ts (reads `/etc/livos/secrets/api-key` via Redis pointer key `livos:account:api_key_path` which 104-09 wrote; null on missing/empty/malformed; never throws; `redactedPreview()` helper produces `liv_k_XXXXXX***` for log lines — raw key NEVER on log surface), device-id.ts (stable per-box UUIDv4 via Node built-in `crypto.randomUUID()`, persists `/var/lib/livos/device-id` mode 0600; first call generates+persists, subsequent calls read; regenerates on malformed-file recovery), heartbeat-payload.ts (pure builder for ~200-byte JSON envelope), heartbeat-sender.ts (native fetch + 10s AbortController + self-rescheduling setTimeout chain so slow Server5 cannot cause tick pile-up + status matrix: 2xx verbose / 401 stop+error / 404 warn-once / 429 warn / 5xx warn / network err warn / returns stop() for graceful shutdown), index.ts (barrel export), + 4 vitest files (43 tests, 3.34s).
  2. `d5769318` `livos/packages/livinityd/source/index.ts` (Livinityd class wiring): new import `startHeartbeat, REDIS_KEY_API_KEY_PATH, type StopHandle as HeartbeatStopHandle`; new private field `stopHeartbeat?: HeartbeatStopHandle`; in `start()` AFTER `seedDefaultAliases()` block (Redis live, ai.start() done), guarded `await this.ai.redis.get(REDIS_KEY_API_KEY_PATH)` — armed only when 104-09 wrote the key, otherwise verbose-skip (no log spam for LAN-only installs); in `stop()` early `this.stopHeartbeat?.()` call before WebApp/Xvfb teardown so the setTimeout chain unwinds while redis+fetch are still healthy.
  3. `(this commit)` 104-10-SUMMARY.md + STATE.md + ROADMAP.md updates.
- Forward-compat with Server5 missing endpoint: until v34.x ships `/api/devices/heartbeat` route on Server5, POST returns 404. Sender logs a SINGLE warn line per livinityd restart (`warned404` flag) and downgrades subsequent 404s to verbose-level. When Server5 ships the route, the next POST lands and dashboards start working. NO LivOS-side code change required.
- D-104-RELAY-ZERO-DATA-PLANE compliance: heartbeat is CONTROL-PLANE traffic, explicitly allowed per the Phase 104 invariant. Envelope ~200 bytes, 60s interval → ~12KB/day. Three orders of magnitude smaller than the data-plane traffic the invariant actually targets. Documented in heartbeat-sender.ts top-of-file block + STATE comment. Data-plane (Master Chrome streams, agent payloads, file uploads, etc.) stays LAN-direct.
- Security: API key value NEVER logged in plaintext — only `redactedPreview()` form (`liv_k_<6-chars>***`); enforced by a dedicated test assertion that greps every captured log entry for the secret tail across the full happy-path POST flow. API key flows through HTTP `X-Api-Key` header only (never embedded in body); 10s `AbortController` timeout so a hung Server5 cannot leak fetch promises into livinityd.
- NO new npm deps: Node 18+ built-ins only — `fetch` (global), `AbortController` (global), `crypto.randomUUID` (`node:crypto`), `fs/promises`, `os`. `package.json` UNTOUCHED.
- Test coverage (43 tests): api-key.test.ts (12 — redactedPreview shape + safe-tail-length + happy path + all 5 null-return branches + Redis transient-error path + export-surface security guardrail), device-id.test.ts (8 — UUIDv4 shape + idempotent re-reads + malformed-file regeneration + recursive parent-dir mkdir + mode 0600 best-effort + statistical uniqueness + whitespace tolerance + chmod retry-path non-fatal), heartbeat-payload.test.ts (13 — full shape contract + every override + JSON serialization roundtrip + control-plane <1KB budget guard + IPv4 detection sanity), heartbeat-sender.test.ts (10 — happy path with header+body capture + 404 log-once + 401 stop+error + 5xx warn-retry + 429 warn-continue + network-err warn-continue + missing-api-key warn-once + stop() lifecycle + SECURITY raw-tail-never-logged + first-tick-after-interval).
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 3 commits (pre-commit hook gated every commit).
- Deviations: (1) Rule 1 — initial heartbeat-sender.test.ts used `vi.useFakeTimers()` with `vi.advanceTimersByTimeAsync()` + `Promise.resolve()` microtask flushes to drive the self-rescheduling `setTimeout` chain. 9/10 tests failed because the microtask flush count was insufficient for the production code's `sendOnce()` await chain to complete before assertions fired. Fixed inline by rewriting all 10 tests to use REAL timers with a 50ms interval (`intervalSec: 0.05`) + `sleep()` waits — production code was correct; the test-side timing mock was the bug. (2) Rule 1 — `RequestInfo` global type not available in livinityd's `@tsconfig/node22` setup; typed test helper as `string | URL` to match what production sender actually passes. Both fixes inside Task 1's commit boundary — no broken interim form landed in git.
- Carry-forward to v34: when Server5 ships `/api/devices/heartbeat` route (separate repo, v34.x phase), no LivOS-side change required — existing deployed installs running 104-10 will automatically start updating `devices.last_seen` on the next heartbeat tick after Server5's endpoint goes live.

## 104-09 Status (2026-05-12) — Cloudflare Tunnel install mode HOTFIX SHIPPED (24/24 host-side bash test PASS; 42/42 combined with 104-08)

- **HOTFIX** (4th install mode added to phase after 104-08): 104-09 ships `--mode tunnel` for Cloudflare-Tunnel-backed outbound-only connectivity. Bypasses public-IP / CGNAT / port-forward requirements ENTIRELY. CF edge terminates TLS; Caddy serves plain HTTP on :80 locally; cloudflared dials outbound to the CF edge. Also adds an orthogonal `--api-key liv_k_...` flag (works in all modes; tunnel persists to /etc/livos/secrets/api-key for future marketplace integration). Three commits:
  1. `55acaa5c` parse-cli.sh (extends MODE_WHITELIST with `tunnel`; adds `--cf-tunnel-token` + `--api-key` flags with LIVOS_* env-var bindings; tunnel-mode partner-flag gating requires both --domain AND --cf-tunnel-token; --cf-tunnel-token rejected in any other mode; --api-key shape-checked against Server5 schema `liv_k_*` prefix; --help rewritten to list 4 modes + tunnel-mode block + api-key block + concrete tunnel example) + install.sh (1-line dispatch case for `tunnel`) + show-banner.sh (NEW tunnel-mode banner branch + CGNAT advisory rewritten to point at `--mode tunnel` instead of "wait for v34"). 104-08's 18 tests still PASS 1:1 — D-104-NO-PROD-IMPACT preserved.
  2. `0955eb55` scripts/install/mode-tunnel.sh (NEW 241-line file). Public `install_mode_tunnel()` runs 6 idempotent helpers: (a) `_install_cloudflared_for_tunnel` via signed pkg.cloudflare.com apt repo (gpg dearmor + apt source list + apt install), (b) `_write_cf_tunnel_token_secret` via printf+redirection to /etc/livos/secrets/cf-tunnel-token (dir 0700, file 0600, NEVER on argv), (c) `_register_cloudflared_service` first-time `cloudflared service install <token>` (one unavoidable argv exposure documented + scoped + acceptable; re-runs short-circuit and restart for token rotation), (d) `_configure_caddy_for_tunnel` writes minimal Caddyfile with `auto_https off` + `:80 { reverse_proxy 127.0.0.1:8080 }` (NO pki, NO tls internal, NO tls dns cloudflare), (e) `_persist_tunnel_mode_redis` writes `livos:domain:local_mode=tunnel` + `livos:domain:tunnel_domain=$LIVOS_DOMAIN`, (f) `_write_api_key_secret_if_provided` optional /etc/livos/secrets/api-key (0600) + Redis path.
  3. `(this commit)` __tests__/test-mode-tunnel-args.sh (NEW executable, 24 assertions covering plan-09 ACs + D-104-RELAY-ZERO-DATA-PLANE negative-grep + argv-token security check + bash -n + env-var equivalence + 104-08 backward-compat regression smoke) + 104-09-SUMMARY.md + STATE.md + ROADMAP.md.
- Security: CF Tunnel token writes via `printf '%s\n' "$LIVOS_CF_TUNNEL_TOKEN" > file` + chmod 0600 + dir 0700. Token NEVER expanded into curl/cloudflared argv via env-var interpolation (verified by TEST 7 negative grep). API key (`LIVOS_API_KEY`) NEVER on any tool's argv. ONE unavoidable argv exposure at `cloudflared service install <token>` documented in source — scoped to one install-time call, system being installed as root.
- D-104-RELAY-ZERO-DATA-PLANE realized at install-time for a 3rd path: mode-tunnel.sh has ZERO references to Server5 IPs / livinity.io / nexus.livinity / relay.livinity (verified by TEST 6 grep). Combined with 104-04 (hybrid Server5-mint path) and 104-08 (user-owned-domain hybrid path), tunnel mode is now the THIRD way to install LivOS without any Server5 data-plane involvement.
- Backward compat: when `--mode` is anything other than `tunnel`, the new code path is dormant. All 18 of plan 104-08's host-side tests still PASS 1:1 (TEST 10 re-runs the canonical 104-08 failure case as a regression smoke). cloud / local-lan / hybrid behavior unchanged. D-104-DEFAULT-MODE preserved (`--mode hybrid` still defaults when `--mode` omitted).
- Test results: `bash scripts/install/__tests__/test-mode-tunnel-args.sh` → 24 PASS, 0 FAIL. Combined with 104-08 → 42 PASS, 0 FAIL across both test files.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 3 commits (pre-commit hook gated every commit).
- Deviations: (1) Rule 1 — TEST 5 root-check assertion too strict for non-Ubuntu dev hosts (Windows/Mac have no /etc/os-release → install.sh exits with `Unsupported OS` error BEFORE reaching the EUID-not-root check). Fixed inline by broadening the gate-matcher regex to accept either `must run as root|EUID` OR `Unsupported OS|requires Ubuntu` — either downstream gate firing proves parse_cli passed cleanly through, which is the actual invariant tested. (2) Rule 2 — TEST 10 added (backward-compat regression smoke for 104-08 inside the same test file). (3) Rule 2 — TEST 6 (D-104-RELAY-ZERO-DATA-PLANE) + TEST 7 (argv-token negative-grep) promoted to dedicated assertions instead of "happens to be true in current source".
- Carry-forward to 104-07 Task 2: hotfix is orthogonal to the operator Apple-device walk. UAT-CHECKLIST.md section A can now offer a 4th install path option (`--mode tunnel`) for operators behind CGNAT or without public IPs — the user's own Cloudflare account + a pre-created CF Tunnel + their own domain is all that's needed.

## 104-08 Status (2026-05-12) — user-owned-domain hybrid HOTFIX SHIPPED (18/18 host-side bash test PASS)

- **HOTFIX** (added to phase mid-flight after 104-07 Task 1): 104-08 adds `--domain` + `--cf-token` + `--cf-zone-id` flags + `LIVOS_*` env vars to install.sh. When supplied, `mode-hybrid.sh` skips the Server5 control-plane mint entirely and instead creates a Cloudflare DNS A-record on the user's own zone (idempotent list-first-then-create per T-104-04-R1). Realizes D-104-RELAY-ZERO-DATA-PLANE at install-time — for power users with their own domain, the entire Server5 touch is eliminated. Three commits:
  1. `3f8d20bc` parse-cli.sh (3 new CLI flags + 3 env-var bindings + partner-flag validation + --help rewrite with user-owned-domain bypass example + CGNAT limitation block) + detect-platform.sh (`detect_cgnat` advisory — RFC 6598 100.64.0.0/10 probe via ifconfig.me, WARN-not-FAIL semantics) + install.sh (1-line wire of `detect_cgnat`).
  2. `d9b2af27` mode-hybrid.sh (NEW `_provision_user_owned_domain` function + `LIVOS_DOMAIN`-non-empty early-exit in `_provision_hybrid_subdomain` + branch dispatch in `install_mode_hybrid` + `LIVOS_CF_TOKEN` fallback in `_write_cf_token_secret`) + show-banner.sh (user-owned-domain post-install URL + CGNAT advisory).
  3. `(Task-3 pending below)` __tests__/test-mode-hybrid-args.sh (NEW, executable, 18 assertions covering AC-104-08-{1..5} + bash -n syntax check + env-var equivalence) + 104-08-SUMMARY.md + STATE.md + ROADMAP.md.
- Security (AC-104-08-5): CF API token NEVER lands on curl argv. Uses `curl -K -` (config from stdin) for both GET (list-records) and POST (create-record) so `header = "Authorization: Bearer <token>"` flows via pipe, not argv. POST body is `mktemp` 0600 + `--data-binary @<file>` + `rm -f`. Body contains only DNS record payload, never the token. Verified by grep — `grep -E 'curl.*Authorization.*Bearer.*\$' mode-hybrid.sh` returns only the documenting comment.
- Backward compat (AC-104-08-2): when `--domain` is NOT supplied, the legacy 104-04 Server5 mint flow runs unchanged. Static grep confirms `_provision_hybrid_subdomain` + `livinity.io/api/hybrid/provision` endpoint + `LIVOS_DOMAIN`-empty branch are all preserved. `CLOUDFLARE_API_TOKEN=xyz bash install.sh --mode hybrid` continues to work identically to 104-04 behavior.
- Test results: `bash scripts/install/__tests__/test-mode-hybrid-args.sh` → 18 PASS, 0 FAIL. Covers all five plan-08 ACs + bash -n syntax check on 5 modified files + `LIVOS_DOMAIN` env-var equivalence to `--domain` CLI flag.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 3 commits.
- Deviations: (1) Rule 1 — initial grep loop in test script failed on `--cf-token` arg (interpreted as grep option); fixed inline with `grep -qF -- "$flag"` separator. (2) Rule 1 — first draft of `_provision_user_owned_domain` used `_CF_AUTH_TOKEN="$cf_token" curl -H "Authorization: Bearer ${_CF_AUTH_TOKEN}"` which still expanded token onto argv; caught during own AC-104-08-5 pre-commit verification; replaced with `curl -K -` pattern in same commit so broken interim form never landed in git. (3) Rule 2 — CGNAT detection promoted from "optional" to "shipped" because without it, behind-CGNAT operators silently debug hybrid mode for hours. WARN-not-FAIL so it doesn't block legitimate LAN-only Apple installs.
- Carry-forward to 104-07 Task 2: hotfix is orthogonal to the operator Apple-device walk. UAT-CHECKLIST.md section A can OPTIONALLY append `--domain $DOMAIN --cf-token $TOKEN --cf-zone-id $ZONE_ID` to the install.sh invocation when testing with an operator-owned Cloudflare-managed domain (one fewer external dependency in the UAT walk).

## 104-07 Status (2026-05-12) — Task 1 SHIPPED (walk.mjs full AC coverage + UAT-CHECKLIST.md); Task 2 (Apple-device verify) AWAITING USER WALK

- Wave 6 (104-07): 🟡 **TASK 1 COMPLETE** — `8c143b7b` (1 commit). Final plan of Phase 104. Two-task plan: Task 1 ships the Docker UAT walk driver; Task 2 is `checkpoint:human-verify` — the operator-walked Apple-device verification + Mini PC update.sh parity check.
  1. `8c143b7b` `docker/local-uat/uat-driver/walk.mjs` (EDIT — stub → 10-test full walk) + `docker/local-uat/uat-driver/lib/chrome-cdp.mjs` (new — Node 22 stdlib CDP + curl helpers; `probeCdpVersion` / `curlInContainer` / `navigateAndScreenshot` / `waitForServiceUp`) + `docker/local-uat/uat-driver/lib/tcpdump-check.mjs` (new — `countServer5PacketsDuring` runtime D-104-RELAY-ZERO-DATA-PLANE gate) + `.planning/phases/104-local-install-and-docker-uat/UAT-CHECKLIST.md` (new — Task 2 operator template) + `.planning/phases/104-local-install-and-docker-uat/UAT-EVIDENCE/.gitkeep` (new — output dir placeholder + operator guidance).
- Coverage: walk.mjs implements 10 `node:test` cases for AC-104-{1,2,4,5,6,7,9,10,11,13,14,15}. AC-104-10 marked USER-WALKED explicitly (cannot prove visual padlock in Linux container). Each test writes per-AC evidence to `UAT-EVIDENCE/walk-<timestamp>/`; `after` hook generates `PASS-FAIL.md` matrix.
- Validated locally: `node --check` PASS on all 3 .mjs files; `grep -E "^import .* from '[^./n]"` → zero hits (D-NO-NEW-DEPS honored — stdlib + local lib helpers only); no `puppeteer` / `chromedp` / `ws` / `@anthropic-ai/*` adds.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED (verified pre + post commit via `git hash-object liv/packages/core/src/sdk-agent-runner.ts`).
- Deviations: (1) Rule 1 — `docker compose restart` → `docker restart $CONTAINER` in AC-104-11 (compose CLI dep avoidance; same restart semantics). (2) Rule 1 — explicit `{timeout: <ms>}` added to all execAsync calls (avoid CI hangs). (3) Rule 1 — `sslResult` + `errMsg` default to `''` not `undefined` in `curlInContainer` return shape (type-stable evidence JSON).
- Decisions: (1) D-NO-NEW-DEPS strictly honored — chose `docker exec + curl + chrome --headless --screenshot` over WS-based CDP RPC (saves 200MB+ node_modules). (2) WARN-not-FAIL for AC-104-{2,4,5,6,7,9} when infra not yet wired at walk time (livinityd local.activate, mode-handler stubs filled by 104-03/-04/-06) — surfaces underlying issues without masking the hard gates (AC-104-{1,11,13,14,15}). (3) AC-104-15 has DUAL gates: static (104-04 vitest negative-grep on `generateHybridCaddyfile`) + runtime (this plan's tcpdump-check.mjs).

**Task 2 awaiting operator (checkpoint:human-verify):** `.planning/phases/104-local-install-and-docker-uat/UAT-CHECKLIST.md` is the binding gate. Operator walks: (a) iPhone Safari + iPad Safari + macOS Safari + macOS Chrome — green padlock on `bruce.<provisioned-subdomain>.home.livinity.io`, screenshots committed to `UAT-EVIDENCE/apple-walk-<timestamp>/`; (b) Mini PC `bash /opt/livos/update.sh` + `systemctl is-active livos liv-core liv-worker liv-memory` returns 4×active + Sacred SHA verified on Mini PC; (c) real `tcpdump -i any host 45.137.194.102` for 30s during real Apple browsing → 0 packets. Sign-off line completed → Phase 104 ships. Any FAIL → hot-fix plan 104-08 may be required.

**Phase 104 final disposition pending Task 2.** Once UAT-CHECKLIST.md is signed off PASS: create `PHASE-SUMMARY.md`, flip ROADMAP entry to `[x]`, run `/gsd-cleanup`. Until then, Phase 104 stays in EXECUTING with this `[/]` partial state.

## 104-06 Status (2026-05-12) — cloud-mode regression test SHIPPED (D-104-NO-PROD-IMPACT gate live; baseline capture pending operator)

- Wave 5 (104-06): ✅ COMPLETE — `1e6f1f01..e9e3c125` (3 commits) — D-104-NO-PROD-IMPACT regression gate shipped end-to-end. Three commits:
  1. `1e6f1f01` scripts/install/mode-cloud.sh (BODY filled — was stub from 104-02): three private helpers (`_install_cloudflared_for_cloud` direct .deb from GitHub releases per livos/install.sh:509; `_configure_caddy_for_cloud` minimal Caddyfile mirroring livos/install.sh:1271-1295; `_persist_cloud_mode_redis` writes `livos:domain:host_ip`) + public `install_mode_cloud()` entry point. Strict subset of livos/install.sh — every action source-mapped 1:1 to legacy line ranges. + docker/cloud-regression/scripts/capture-minipc-baseline.sh (one-time operator helper, single batched ssh per memory feedback_ssh_rate_limit.md, fail2ban-friendly; captures Caddyfile + systemd units + env KEY shape (no values per T-104-06-I1) + apt names + deployed-sha; verifies SHA matches dab261cc; gracefully exits if Mini PC unreachable).
  2. `35011ce7` chore: `git update-index --chmod=+x` on capture-minipc-baseline.sh (Windows filesystem doesn't carry exec bit; same pattern as 104-01/02 install.sh + idempotency harness).
  3. `e9e3c125` docker/cloud-regression/ UAT container: Dockerfile (trfore systemd base, no GUI), docker-compose.yml (ports 8090/8453 to coexist with local-uat 80/443), entrypoint.sh (runs install.sh --mode cloud + captures /tmp/regression-snapshot + always-on D-104-NO-PROD-IMPACT negative checks: no pki-global.conf, no dnsmasq config, no local-lan Caddyfile directives), scripts/test-cloud-byte-equivalence.sh (host-side CI gate; negative checks always; positive byte-equivalence diff if fixtures present; FAIL on negative-check violation or caddy.service not enabled — AC-104-12), fixtures/minipc-dab261cc/.gitkeep placeholder, README.md operator docs.
- Validated locally: `bash -n` clean on all .sh files; `--help` exits 0 on both scripts; `docker compose config` validates; `docker compose -f docker/cloud-regression/docker-compose.yml build` succeeds (image livos-cloud-regression:dev produced); `install_mode_cloud` declared (`declare -F`); required strings present (cloudflared, reverse_proxy localhost:8080, livos:domain:host_ip, caddy validate); no forbidden directives in non-comment lines (pki / tls internal / ca liv-local / dns cloudflare / dnsmasq absent from executable code).
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 3 commits (verified pre + post each commit via `git hash-object liv/packages/core/src/sdk-agent-runner.ts`).
- Deviations: Rule 1 auto-fix — cloudflared install path uses direct .deb from GitHub releases (livos/install.sh:509 idiom) instead of the plan's apt-repo path; otherwise a NEW source.list file would surface as drift in the byte-equivalence diff. Inline NOTE comment documents the rationale.
- Decisions: (1) Refactor-as-subset rule strictly applied — mode-cloud.sh body is a strict subset of livos/install.sh's cloud-mode flow with inline source-map comments. (2) Always-run negative checks + conditional positive diff — D-104-NO-PROD-IMPACT invariants (no pki-global.conf, no dnsmasq, no local-lan Caddyfile directives) ALWAYS run regardless of fixture availability; positive byte-equivalence diff only runs when fixtures present, falling back to NEGATIVE-CHECKS-ONLY mode with clear WARN. (3) WARN vs FAIL split: systemd unit drift is WARN (units come from update.sh rsync, not install.sh); negative-check violations + caddy validate errors + caddy.service-not-enabled are hard FAIL. (4) Port mapping 8090/8453 (NOT 80/443) so cloud-regression container coexists with docker/local-uat.

**Carry-forward to 104-07 (UAT end-to-end walk, Wave 6, user-walked):** D-104-NO-PROD-IMPACT regression gate is LIVE. The docker/cloud-regression/ container pattern (trfore systemd base + entrypoint.sh + ports-coexist-with-local-uat + test harness) provides a template 104-07 can mirror for its hybrid-mode UAT walk. `LIVOS_REGRESSION_MODE=cloud` env-var idiom + `livos-cloud-regression.service` systemd unit shape are reusable.

**Operator action items (one-time, can run any time before merge):**

1. `bash docker/cloud-regression/scripts/capture-minipc-baseline.sh` — requires Mini PC reachable via ZeroTier (10.69.31.68); pem/minipc key. Single batched ssh; captures fixtures to docker/cloud-regression/fixtures/minipc-dab261cc/.
2. `git add docker/cloud-regression/fixtures/minipc-dab261cc/ && git commit -m "baseline(104-06): capture Mini PC at deployed SHA dab261cc"`.
3. After fixtures committed, `bash docker/cloud-regression/scripts/test-cloud-byte-equivalence.sh` runs the FULL byte-equivalence regression (negative checks + positive diff). Until then, it runs in NEGATIVE-CHECKS-ONLY mode (still gates D-104-NO-PROD-IMPACT).

## 104-05 Status (2026-05-12) — enrollment wizard UI SHIPPED (17/17 vitest pass, runtime UAT deferred)

- Wave 4 (104-05): ✅ COMPLETE — `4c853ce0..18a097f3` (2 commits) — Settings → Local Access wizard UI shipped end-to-end. Two commits:
  1. `4c853ce0` types.ts (discriminated-union WizardStep with LOCAL_LAN_STEPS / HYBRID_STEPS / CLOUD_STEPS branches + initialWizardState) + LocalSetupWizard.tsx (root component owning state, inlining LocalLanConfigStep/HybridConfigStep/HybridVerifyStep/VerifyStep, wiring `trpcReact.local.{getStatus,activate,activateHybrid,getHybridStatus}`) + ModePickStep.tsx (3-mode picker with hybrid as 'Hybrid (recommended)' + 'default' badge per D-104-DEFAULT-MODE) + routes/settings/local-access.tsx (SettingsPageLayout wrapper) + routes/settings/index.tsx (Route registration — Rule 2 auto-fix, since plan didn't include the Route entry but AC-104-9 demands wizard reachable from Settings).
  2. `18a097f3` QrCodeStep.tsx (QR via `api.qrserver.com` public endpoint encoding `/api/local/ca.crt` URL — D-NO-NEW-DEPS surfaced) + PlatformInstructions.tsx (5-tab per-OS: linux/macos/ios/windows/android; macOS + iOS panels prominently warn `does NOT support .local TLDs`) + HybridDnsSetup.tsx (Cloudflare API token flow + 'Zero data-plane Server5 traffic' messaging — D-104-RELAY-ZERO-DATA-PLANE UI surface) + __tests__/LocalSetupWizard.test.tsx (17 source-text grep invariants over the 5 component files — pattern: `livos/packages/ui/src/modules/settings/master-chrome-login.test.tsx` — no `@testing-library/react` add).
- Tests: 17/17 PASSED (4 tRPC wiring + 3 mode-pick + 3 QR + 5 platform-coverage + 2 hybrid Cloudflare-flow). `npx vitest run src/features/local-setup` exits 0 in 4ms (998ms total wall time).
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across both commits (verified pre + post each commit via `git hash-object liv/packages/core/src/sdk-agent-runner.ts`).
- No new npm deps: `git diff HEAD~2 HEAD -- livos/packages/ui/package.json` returns empty. QR via public endpoint (NOT the `react-qr-code@2.0.12` already in deps, by plan choice — tested invariant: `expect(qrSrc).toMatch(/api\.qrserver\.com.*create-qr-code/)`). Tests via `readFileSync` + `expect.toMatch` (NOT `@testing-library/react`).
- Deviations: (1) Rule 2 — settings/index.tsx Route registration added (plan's read_first wrongly claimed route auto-discovery; actual codebase uses explicit `<Route>` per sibling page like chrome-master/domain-setup — without this edit AC-104-9 'wizard reachable from Settings' fails). Append-only: new lazy-import + new Route, no existing line touched. (2) Pre-existing `pnpm --filter ui build` failure logged for awareness (vite-plugin-pwa → workbox-build → terser → @jridgewell/source-map → can't resolve @jridgewell/gen-mapping); verified by stashing our changes — same error, no 104-05 file in stack — SCOPE BOUNDARY pre-existing infra problem.
- Decisions: (1) D-104-DEFAULT-MODE realized in ModePickStep — hybrid is first in MODES array with `recommended:true` flag rendering 'default' badge. (2) Cloud branch is a redirect (`cloud-redirect` step links to existing `/settings/domain-setup`) — no cloud-wizard reimplementation. (3) D-NO-NEW-DEPS via api.qrserver.com (decorative) + source-grep tests (no @testing-library/react). (4) D-104-RELAY-ZERO-DATA-PLANE messaging in 3 places: ModePickStep hybrid row, HybridConfigStep info-blue panel, HybridDnsSetup blue-50 alert.

**Carry-forward to 104-06 (`--mode cloud` regression test, Wave 5):** wizard UI shipped; cloud branch correctly redirects to legacy `/settings/domain-setup` without duplicating the cloud onboarding flow. 104-06 will run install.sh `--mode cloud` inside a second UAT container and assert Mini PC `dab261cc` services come up byte-for-byte (livinityd + liv-core + liv-worker + liv-memory + Caddy with Cloudflare DNS-01).

**Runtime verification deferred to 104-07:** AC-104-9 multi-tenant runtime UAT (subdomain entered in LocalLanConfigStep / HybridConfigStep flows through to per-user routing), AC-104-10 green-padlock-after-CA-install runtime assertion across the 5 platform tabs, AC-104-15 zero-Server5-data-plane tcpdump — all STAY IN 104-07. The 17 vitest assertions confirm the UI surfaces exist; 104-07 confirms they wire to live infra.

## 104-04 Status (2026-05-12) — hybrid backend SHIPPED (52/52 vitest pass, runtime UAT deferred)

- Wave 3 (104-04): ✅ COMPLETE — `9a9801c8..62a526b1` (3 commits) — full HYBRID backend wired end-to-end. Three commits:
  1. `9a9801c8` hybrid-provision.ts + .test.ts: Server5 control-plane subdomain mint helper (`POST https://livinity.io/api/hybrid/provision`); `ServerSideProvisionUnavailable` recoverable error class; strict response-shape validation (HYBRID_DOMAIN_RE forces `<label>.home.livinity.io` apex); token redaction in errors (T-104-04-I1); `writeCfTokenSecret` 0600-mode EnvironmentFile writer; `HYBRID_TOKEN_SECRET_PATH` constant.
  2. `edfc4a80` APPEND-only edits to 5 files (Wave 3 parallel-safety contract honored): caddy.ts gains `generateHybridCaddyfile` + `validateHybridDomain`; caddy.test.ts gains 13 new tests (5 validateHybridDomain + 5 generateHybridCaddyfile incl. 127.0.0.1-only reverse_proxy invariant + 1 cloud-mode regression + 2 D-104-RELAY-ZERO-DATA-PLANE negative-grep); routes.ts gains 2 procedures (`local.activateHybrid` mutation + `local.getHybridStatus` query) + `hybridActivateSchema` + 3 Redis-key constants; routes.test.ts gains 5 new tests + mock extension; common.ts gains 2 httpOnlyPaths entries.
  3. `62a526b1` mode-hybrid.sh real body: `_verify_caddy_cloudflare_plugin` (xcaddy build path with graceful exit on uninstallable xcaddy / build failure — never aborts install.sh); `_write_cf_token_secret` (umask 0077 + chmod 0600 + 0700 parent dir + systemd EnvironmentFile drop-in with `grep -qF` idempotency guard); `_provision_hybrid_subdomain` (curl --max-time 30 → interactive prompt or non-interactive skip on Server5 unreachable; jq fallback to grep+sed JSON parse). Token never echoed (verified via grep).
- Tests: 52/52 PASSED (5 dnsmasq + 4 pki + 10 hybrid-provision NEW + 25 caddy [12 existing + 13 new] + 8 routes [3 existing + 5 new]). Target was ≥19 new assertions; achieved 28 new. Negative-grep assertions for Server5 IP `45.137.194.102` AND Server4 IP `45.137.194.103` absent from `generateHybridCaddyfile` output PASS ×2.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 3 commits (verified pre + post each commit via `git hash-object liv/packages/core/src/sdk-agent-runner.ts`).
- Deviations: NONE — plan executed exactly as written. Note: plan's `<verify>` `pnpm --filter @livos/livinityd` filter doesn't match actual package name (`livinityd`, not `@livos/livinityd`); used `npx vitest run` from package dir — assertion semantics identical.
- Decisions: (1) D-104-RELAY-ZERO-DATA-PLANE realized at generator level — negative-grep test proves Server5/Server4 IPs CANNOT appear in generated Caddyfile (static unit complement to plan 104-07 runtime tcpdump). (2) D-104-NO-PROD-IMPACT preserved — generateFullCaddyfile UNTOUCHED + cloud-mode regression test re-asserts no `dns cloudflare {env...}` directive leak. (3) Append-only Wave 3 contract honored on all 5 shared files; existing test/procedure/export count unchanged.

**Carry-forward to 104-05 (Enrollment Wizard UI, Wave 4):** `trpcReact.local.activateHybrid.useMutation()` accepts `{subdomain, zoneId, hostIp, subdomains?}`. `trpcReact.local.getHybridStatus.useQuery()` returns `{subdomain, zoneId, hostIp, cfTokenAvailable}` — wizard's done-step blocks "Activate" if `cfTokenAvailable: false` with "set CLOUDFLARE_API_TOKEN" toast. ModePickStep should label hybrid as **Recommended** (per D-104-DEFAULT-MODE).

**Runtime verification deferred to 104-07:** AC-104-15 runtime tcpdump assertion (page load has zero Server5 traffic) STAYS IN 104-07. Negative-grep static check here PROVES the generator can't route data-plane via Server5; tcpdump confirms the running Caddy instance honors it at the kernel/syscall level.

## 104-03 Status (2026-05-12) — local-lan backend SHIPPED (24/24 vitest pass, runtime UAT deferred)

- Wave 3 (104-03): ✅ COMPLETE — `9bba50ba..8d8cec66` (3 commits) — full LOCAL-LAN backend wired end-to-end. Three commits:
  1. `9bba50ba` mode-local-lan.sh: dnsmasq install (idempotent, systemd-resolved port-53 fix via `DNSStubListener=no`) + atomic /etc/dnsmasq.d/livinity.conf write + /etc/caddy/pki-global.conf provision with `ca liv-local` named CA block
  2. `4c942de2` local-dns module (dnsmasq-config.ts + pki.ts + routes.ts) + 3 test files + caddy.ts gains generateLocalCaddyfile + validateLocalTld + LocalSubdomainConfig + caddy.test.ts (12 tests including cloud-mode regression)
  3. `8d8cec66` server/index.ts public `GET /api/local/ca.crt` mode-gated endpoint at line 1147 + tRPC `local.*` router registration + 3 httpOnlyPaths entries
- Tests: 24/24 PASSED (5 dnsmasq + 4 pki + 3 routes + 12 caddy). Target was ≥18. AC-104-8 (pki-global.conf is first non-blank line) PASS. D-104-NO-PROD-IMPACT regression test (generateFullCaddyfile output has NO pki/import/ca-liv-local) PASS ×2.
- TypeScript: ZERO new errors in our edits (verified by stash-diff: pre-edit and post-edit error counts in server/index.ts both `19` — all pre-existing unrelated).
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 3 commits (verified pre + post each commit).
- Deviations (Rule 1 + Rule 3):
  1. pki.test.ts `startsWith` assertion normalized for Windows path.join backslash (POSIX behavior unchanged).
  2. routes.test.ts used `dangerouslyBypassAuthentication: true` to skip isAuthenticated middleware (existing escape hatch in is-authenticated.ts:12).
  3. Plan referenced `SubdomainConfig` from caddy.ts but existing type is `{subdomain, appId, port, enabled}` (cloud-mode marketplace). Added new exported `LocalSubdomainConfig` interface `{name, port}` sibling — D-104-NO-PROD-IMPACT preserved.
- Decision: D-104-CADDY-PKI-IMPORT realized. pki block lives in /etc/caddy/pki-global.conf (one file), livinityd's generateLocalCaddyfile emits ONLY `import /etc/caddy/pki-global.conf` line — pki block NEVER inlined, survives Caddyfile regeneration (Pitfall 1).

**Carry-forward to 104-04 (parallel-planned):** caddy.ts has append-ready `generateHybridCaddyfile` slot next to `generateLocalCaddyfile`. caddy.test.ts can append hybrid describe block; cloud-mode regression test continues guarding generateFullCaddyfile. local-dns/routes.ts has 3 procedures — 104-04 can append `local.activateHybrid` or introduce sibling `hybrid-dns/routes.ts`. common.ts cluster has append slot after `local.getCaCert`. All exports named (no default-export collisions).

**Runtime verification deferred to 104-07:** AC-104-4 (dig @localhost bruce.livinity.local), AC-104-5 (survives systemctl restart), AC-104-6 (curl /api/local/ca.crt → PEM), AC-104-7 (curl --cacert https://bruce.livinity.local → 200) all require Docker UAT container live — verified inside 104-07's end-to-end UAT walk.

## 104-02 Status (2026-05-12) — install.sh `--mode` dispatch + sourced helpers SHIPPED (runtime verify pending)

- Wave 2 (104-02): ✅ COMPLETE — `2a1a274b..1361f483` (2 commits) — `scripts/install.sh` (mode 0755) + 5 sourced helpers (`scripts/install/{_logging,parse-cli,detect-platform,common-deps,show-banner}.sh`) + 3 mode stubs (`scripts/install/mode-{cloud,local-lan,hybrid}.sh`) + `docker/local-uat/scripts/test-install-idempotency.sh` (mode 0755). D-104-INSTALL-ENTRY (single install.sh + --mode flag) + D-104-DEFAULT-MODE (hybrid default) realized.
- Structural acceptance: install.sh `--help` exits 0 + lists all 3 modes with `Default` + `Apple devices NOT supported` substrings; `--mode foo` exits 64 with `invalid --mode 'foo'` stderr (AC-104-16 ✓); `--mode "; rm -rf /"` rejected before any side effect (Threat T-104-02-T1 mitigated by whitelist); all 3 stubs export `install_mode_<mode>` function name; install.sh contains `set -euo pipefail` + `trap 'on_error $LINENO' ERR` + writes `livos:domain:local_mode=$MODE` via `set_livos_redis_key`.
- Runtime acceptance (DEFERRED — Docker daemon unavailable on Windows host, same situation as 104-01): AC-104-1 scaffold-path + AC-104-2 idempotency require `docker compose exec` to run. Expected: container reaches READY; entrypoint dispatches to `/livinity-io/scripts/install.sh --mode local-lan`; `install_mode_local_lan` stub prints + writes 2 Redis keys; test-install-idempotency.sh exits 0 with empty diff across systemctl/file-sha256/Redis snapshots.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across both 104-02 task commits (verified pre + post each commit via `git hash-object liv/packages/core/src/sdk-agent-runner.ts`).
- Decisions: (1) EUID root-check positioned AFTER parse_cli + detect_* but BEFORE install_common_deps — --help and --mode validation must work for any user; (2) `dig` → `dnsutils` in common-deps.sh apt list, same correction as 104-01 (Ubuntu's `dig` binary ships in `dnsutils`); (3) git update-index --chmod=+x for install.sh + idempotency harness (Windows filesystem doesn't carry +x; same Windows-cross-platform pattern as 104-01).

**Carry-forward to 104-03/04/06:** `install_mode_<mode>` function-name contract is locked. Plans 104-03 (local-lan body — dnsmasq + Caddy PKI), 104-04 (hybrid body — Cloudflare DNS-01 + Server5 subdomain mint), 104-06 (cloud body — Mini PC parity regression) each replace ONE stub function body without touching install.sh or the 5 shared helpers. `livos/install.sh` UNTOUCHED — D-104-NO-PROD-IMPACT preserved; Mini PC `update.sh` flow unaffected.

## 104-01 Status (2026-05-12) — Docker UAT scaffolding SHIPPED (runtime verify pending)

- Wave 1 (104-01): ✅ COMPLETE — `e0c4fc6c..500b4912` (2 commits) — `docker/local-uat/{Dockerfile,docker-compose.yml,entrypoint.sh,README.md,uat-driver/walk.mjs,scripts/test-install-sh.sh}` all created. D-104-UAT-IMAGE (`trfore/docker-ubuntu2404-systemd:latest`) + D-104-UAT-CDP-BIND (`--remote-debugging-address=0.0.0.0` + port 9223) wired. Readiness sentinel `/tmp/livos-uat-ready` established as stable contract for downstream plans (104-02..104-07).
- Rule 1 auto-fix: plan apt list said `dig` (no such Ubuntu package); replaced with `dnsutils` so `docker compose build` apt step won't fail. Documented in 104-01-SUMMARY.md "Deviations".
- Tests: structural acceptance (file existence + content invariants + mode bits + `node --check walk.mjs`) ALL PASS. Runtime end-to-end (`bash docker/local-uat/scripts/test-install-sh.sh`) DEFERRED — Docker Desktop daemon was unavailable on Windows host at execution time (`docker info` failed: `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`). Recommended next action: developer starts Docker Desktop, runs the wrapper script, verifies AC-104-13 + AC-104-14 pass.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across both commits (verified pre + post each commit via `git hash-object liv/packages/core/src/sdk-agent-runner.ts`).

**Carry-forward to 104-02:** `docker/local-uat/` scaffolding is content-only and the compose file already mounts `../..:/livinity-io:ro`. As soon as 104-02 creates `scripts/install.sh`, the entrypoint's `if [[ -f "$INSTALL_SH" ]]` branch will auto-dispatch — no further Dockerfile/compose edits needed. The `test-install-sh.sh` wrapper provides the host-side build/up/poll/walk/down lifecycle every later plan can reuse.

## 103.1 Status (2026-05-11) — 5-LAYER FIX, fully live-verified on Mini PC

Bug 2 (list_windows aggregation) FULLY RESOLVED — user-walked verify 2026-05-11:
agent in global chat correctly enumerated 3 active displays (`:1`, `:11`, `:12`),
clicked into Dinkytown WebApp on `:12`, took screenshots and navigated
calculators end-to-end.

Bug 1 (master Chrome input) needed FIVE separate fixes (each surfaced by
re-running the live UAT). Layers A/B/C/D shipped in earlier 103.1-* commits.
Layer E (commit `3d9fe041`):

- **Symptom:** "klavyeye yaziyorum 'a' geç basıyor, delete çalışmıyor,
  mouse tıklamaları çalışmıyor".

- **Root cause:** Chrome detects `exited_cleanly:false` in Local State
  (legacy from prior livinityd restart) and pops a "Profile error occurred"
  modal. The modal is its own chrome-class top-level window with geometry
  ~400x213; fluxbox auto-focuses the last-opened window (the modal); the
  input dispatcher's `search --class chrome --limit 1 windowactivate` keeps
  re-picking the modal; every key/click lands on a non-input dialog and
  is dropped.

- **Fix:** post-spawn polling loop (`dismissProfileErrorAndActivateMain`)
  that (a) windowkills any "Profile error" window and (b) finds the
  largest-area chrome-class window and pre-activates it, so subsequent
  dispatch lands on the main Chrome browser. Awaited before startLogin
  returns so the wsUrl handed to the client points at a usable session.

Three-layer bug fix shipped and live-verified end-to-end via tRPC curl on
Mini PC at SHA `f3d471ac`:

- `startLogin` returned `{pid:1151469, display:":10", streamId:"bb999df0..."}`
- 10s post-spawn: `status.running:true` (daemonization filter survived
  the sudo wrapper code=0 exit)

- `hasCookies:true` (Chrome wrote to bruce-owned dir — chown succeeded)
- `ps -ef | grep google-chrome` → 2 processes alive
- Log shows `stream bb999df0 started` with NO subsequent `(stop requested)`
- `stopLogin` returns `{ok:true}` (clean shutdown)

Stale singleton locks were also verified cleaned (3 fake files I injected
earlier are gone after restartLogin).

---

## 103.1 Status (2026-05-11) — Hot-fix: stale singleton lock + chrome daemonization filter + list_windows cross-display aggregation

User-walked Phase 103 UAT on Mini PC (deployed SHA `c89f7139`) surfaced bugs not catchable by unit tests:

- **Bug 1A (stale singleton lock):** `clearStaleSingletonLocks()` removes `SingletonLock`/`SingletonCookie`/`SingletonSocket` before `chromeSpawnFn`. Commit `37f0bfb4`. Necessary but NOT sufficient.
- **Bug 1B (REAL WS 1006 cause — chrome daemonization):** `chromeMaster.startLogin` watched `chrome.child` (the `sudo google-chrome` wrapper). Chrome forks to background on startup; launcher exits with code=0. Pre-fix the exit handler treated ANY exit as a crash → `cleanupMaster` → `stopStream` → client WS 404 → browser code=1006. Fix: filter exit — `code=0+signal=null` → no-op (daemonization), only real crashes (`code!=0` or signal) trigger cleanup. Commit `e531b3c4`. Live-verified on Mini PC via tRPC curl: stream `e2462d48` got `(stop requested)` ms after start pre-1B-fix despite locks cleared. Bug 1 is a 2-cause stack (lock cleanup needed for refusal-to-start; daemonization filter needed for clean-spawn-survival).
- **Bug 2 (list_windows blind to other displays):** When neither display arg NOR defaultDisplay is set (global luse MCP, post-103-05 default-off model), aggregate across `/tmp/.X11-unix/X<N>` socket-scanned displays. Each result row carries its own `display` field. Commit `d634ffe4`.

Tests: 24/24 master-login (5 new including 15b daemonization + 15c signal-cleanup + 3 lock-cleanup) + 44/44 mcp tools (5 new). Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 4 commits (`37f0bfb4`, `d634ffe4`, `f8957fc0` docs, `e531b3c4`).

Pushed `c89f7139..e531b3c4` 2026-05-11. Mini PC re-deploy in flight.

Out of scope for 103.1 (deferred to a follow-on patch): duplicate x11vnc spawn cleanup in chromeMaster.startLogin (`vncSpawnFn` orphan, harmless but wasteful); active-WebApp roster prompt snippet (agent can discover via aggregation now); post-daemonization Chrome crash auto-detection via /proc PID polling (user recovers via "Close Master Chrome" button).

In parallel: research agent drafting `.planning/research/local-livinity-setup.md` for `<username>.livinity.local` domain-free local setup (next-phase 104+ scope).

## 103-05 Status (2026-05-11) — Sub-goal B closure: LIVOS_PER_APP_LUSE default-off + orphan sweep

- Wave 2 (103-05): ✅ COMPLETE — `f2e7f2a2..ca1b1f79` (4 commits, TDD RED+GREEN × 2 tasks) — `LIVOS_PER_APP_LUSE` gate in `WebAppWindowManager.spawn()` flipped from `!== '0'` (default ON) to `=== '1'` (default OFF, only literal '1' opts in). New `cleanupOrphanedPerWebAppLuseEntries({mcpConfigManager, logger?})` exported from `legacy-bytebot-cleanup.ts` and wired into `agent-runs.ts` boot block between `cleanupLegacyBytebotState` (line 203) and `registerLuseMcpServer` (line 238) at line 227. Idempotent + non-fatal at three levels (internal listServers catch, internal per-entry removeServer catch, outer `.catch()` in agent-runs.ts).
- Tests: window-manager.test.ts 40/40 pass (35 prior + 5 new under "Phase 103-05 — LIVOS_PER_APP_LUSE default-off env coverage"). legacy-bytebot-cleanup.test.ts 11/11 pass (5 existing + 6 new orphan-sweep tests under "Phase 103-05"). Broader webapps/ suite 232/254 + computer-use/ 227/244 (17 pre-existing platform-specific failures unchanged from baseline).
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 4 commits (verified pre + post each commit).
- Decisions: (1) strict-string opt-in (`=== '1'`) over loose match — mirrors Bytebot opt-in pattern; (2) defensive non-string-name filter added beyond plan spec (T-103-05-SWEEP-06) — Redis JSON blobs survive pathological entries silently rather than crashing boot; (3) removeServer-not-implemented guard mirrors `cleanupLegacyBytebotState` pattern (interface declares the method optional).

**Carry-forward to 103-06:** Sub-goal B code is complete. 103-06 is the user-walked Mini PC deploy + UAT — `bash /opt/livos/update.sh` then verify `journalctl -u livos --since today | grep "Phase 103-05 default-off\|orphan-sweep"` shows the SKIPPED logs + clean-state / removing-N log on first post-deploy boot. Token budget should reduce from ~85 → ~17 MCP tools with 5 WebApps open. Operator escape hatch: `LIVOS_PER_APP_LUSE=1` in `/opt/livos/.env` re-enables legacy per-app MCP registration for debug.

## 103-02 Status (2026-05-11) — Sub-goal A UI: Embedded noVNC viewer + input dispatch

- Wave 2 (103-02): ✅ COMPLETE — `c5eb9360` (1 commit, TDD RED+GREEN) — `MasterChromeLogin` Settings panel now renders inline noVNC viewer when `chromeMaster.status` returns `{running:true, wsUrl}`. DOM mouse/keyboard/wheel events on the viewer container forward via `chromeMaster.input.{click,key,type,scroll}` mutations. Close Master Chrome destructive button wires `chromeMaster.stopLogin`. Modifier chords (Ctrl+L) route via key not type (mirrors `webapp-stream-window.tsx`). Printable-char keydowns batched into 250ms debounced `inputTypeMut` flush.
- httpOnlyPaths: +5 entries (stopLogin + 4 input.*) — admin-mid-`systemctl restart livos` resilience parity with 102-07 cluster.
- Tests: master-chrome-login.test.tsx 41/41 pass (16 original + 25 new = 6 viewer-mount + 16 input-dispatch + 3 theme preservation under r14a). chrome-master suite 29/29 still pass (no router regression). Source-text-grep invariants pattern preserved (D-NO-NEW-DEPS — `@testing-library/react` not added).
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED.
- Decision: behavioral Tests 1-8 from plan encoded as wiring-pattern grep over handler body source (not @testing-library/react render-and-fire) — same convention as existing 102-07-04 test file (`683c9912`).

**Carry-forward to 103-05:** Sub-goal A UI complete. Settings → Chrome Profile panel is now functional on headless Mini PC (Open → embedded viewer renders → click/type Google login → Close). 103-05 can proceed with `LIVOS_PER_APP_LUSE='0'` flip (Sub-goal B closure) independent of Master Chrome UI.

## 103-04 Status (2026-05-11) — Sub-goal B prompt update: Prescriptive display-arg instruction

- Wave 1 (103-04): ✅ COMPLETE — `dc86a7c2..cab8b331` (2 commits, TDD RED+GREEN) — `buildActiveDisplaySnippet` flipped from descriptive "implicitly scoped via LUSE_TARGET_DISPLAY" to prescriptive "MUST pass display: \":N\" as a tool argument" form. Agent now has unambiguous instruction matching the 103-03 tool-schema contract. Failure-mode disclosure ("falls back to host display :1") added as self-correction signal.
- Tests: agent-prompt-builder.test.ts 26/26 pass (22 existing + 4 new under `Phase 102-06 Pillar C` — prescriptive form, env-name absence, "implicitly scoped" phrase absence, double-quoted interpolation).
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across both commits.
- Decision: env name `LUSE_TARGET_DISPLAY` intentionally removed from snippet OUTPUT (agent does not need to know about runtime fallbacks; mentioning it invites "I don't need the arg because env is set" reasoning). Still referenced in JSDoc comments (informational, not prompt-emitted). Belt-and-suspenders runtime fallback preserved in `agent-runner-factory` + `parseDisplayArg → options.defaultDisplay`.

**Carry-forward to 103-05:** Agent instruction now closes the loop on Sub-goal B. 103-05 can flip `LIVOS_PER_APP_LUSE` default to `'0'` — per-WebApp MCP registration becomes redundant because the agent reliably scopes per-call to single global luse MCP via `display: ":N"` arg.

## 103-03 Status (2026-05-11) — Sub-goal B: Single-MCP display-aware tool schema

- Wave 1 (103-03): ✅ COMPLETE — `d38af35f..2bd32a25` (3 commits) — luse-tools.ts schema gains optional `display:":N"` on 13 X11-touching tools (additive, verbatim-contract-extended); tools.ts adds `withScopedDisplay()` + `parseDisplayArg()` helpers; 12 buildHandlers + 1 list_windows thread per-call display through to native primitives via try/finally process.env.DISPLAY scope
- Tests: tools.test.ts 39/39 pass (24 existing + 15 new under `Phase 103-B`); broader computer-use suite 221/238 pass (17 pre-existing platform failures unchanged from baseline)
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 3 commits
- Decision: process.env.DISPLAY mutation v1 (relies on MCP stdio JSON-RPC serialization invariant) chosen over execFile env arg v2; documented in withScopedDisplay JSDoc as Pitfall 2 mitigation

**Carry-forward to 103-04/05:** `display:":N"` is now a valid input_schema property on 13 luse tools — 103-04's buildActiveDisplaySnippet should instruct the agent to ALWAYS pass it when scoping to active WebApp; 103-05 can then flip `LIVOS_PER_APP_LUSE` default to `'0'` (skip per-WebApp MCP registration). Invalid display strings ('foo', ':0', ':100', '') fall back to `LUSE_TARGET_DISPLAY` env via the regex guard, so belt-and-suspenders agent compliance is built in.

## 103-01 Status (2026-05-11) — Sub-goal A backend: Master Chrome Xvfb pipeline

- Wave 1 (103-01): ✅ COMPLETE — `978f7bae..f0f09922` (3 commits) — chrome-process-spawner USER_DATA_DIR_RE widened + master-login-routes refactored to factory-injected router with startLogin/stopLogin/input.{click,key,type,scroll} + production wire-up via setProductionAppRouter swap pattern
- Tests: chrome-master (29 pass) + webapps (191/213) + streaming (92/93) suites green; +10 new master-login-routes tests + 4 new chrome-process-spawner tests
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 3 commits

**Carry-forward to 103-02:** `chromeMaster.status` returns `{display, wsUrl, streamId}` when running. UI must gate `useWebAppVnc(wsUrl)` on `wsUrl !== null` (Pitfall 4). `input.*` mutations are admin-gated and derive `display` from currentMaster — UI sends only `{x, y, button, kind}` etc.

## 101-00 Wave Status (2026-05-11) — Wave 0 Scaffolding

- Wave 0: ✅ COMPLETE — `1cfafcfe..39297f8c` (3 commits) — chrome-remote-interface install + 10 vitest stub test files + test:run scripts + VALIDATION.md wave_0_complete: true
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 3 commits
- Wave 1 unblocked: 101-01 (CDP bootstrap) + 101-02 (port allocator) + 101-03 (native app spawner) ready for parallel dispatch (`workflow.use_worktrees: true`, file-disjoint)

**Key decision:** Stub-first TDD scaffold — each Wave 1+ TDD plan's RED-phase task opens a pre-existing stub file with `it.skip(...)` placeholders. Cheapest possible "file on disk" guarantee + describe-block names encode owning plan + task for executor agents.

**Out-of-scope deferred:** Pre-existing test infra failures (10 ui tests missing jsdom env, 3 livinityd integration tests requiring Linux dbus) logged to `.planning/phases/101-livos-universal-app-orchestration/deferred-items.md`. Not Wave 0 regressions.

## 100-08 Wave Status (2026-05-10)

- Wave 1: ✅ COMPLETE — `6e0e028e..a37fe4de` (5 commits) — Xvfb :1 + fluxbox lifecycle + apt deps
- Wave 2: ✅ COMPLETE — `e775eb00..30b053e1` (4 commits) — WEBAPPS_X11_ENV :0→:1 cutover + XAUTHORITY drop
- Wave 3: ✅ COMPLETE — `410187d0..13781de7` (4 commits) — PerWebAppMcpDescriptor.display field
- Wave 4: ✅ COMPLETE — `45922fd1..d90186d0` (4 commits) — per-WebApp bytebot MCP via mcpConfigManager Redis pub-sub
- Wave 5: ✅ COMPLETE — `0ff00a94..a1988508` (4 commits) — chat-surface webappId scope filter + lag fallback (api.scope-filter.test.ts NEW)
- Wave 6: ⏸ PENDING — 100-08-06 user-walked Mini PC deploy + 11-step UAT (autonomous: false)
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 21 commits

## 100-09 Wave Status (2026-05-10) — Bug Sweep + UX Refinement

User-feedback driven plan after 100-08 deploy. Multi-stream control verified working ✅. 6 sub-plans for 4 bugs + 2 UX rewrites:

- Wave 1 (09-01): ✅ COMPLETE — `35379252..0e77ce0f` (3 commits) — Bug 1: Screenshot 1920x1080 → window-bound. `maim -i 0x<hex>` argv fix.
- Wave 2 (09-02): ✅ COMPLETE — `2dc94f25..254024f3` (4 commits) — Bug 2: Scroll-down. ADDED missing user-canvas wheel listener + tRPC `webapp.input.scroll` + bytebot xdotool button 4/5 path.
- Wave 3 (09-03): ✅ COMPLETE — `d80439c9..a93db3b1` (3 commits) — Bug 3: Mouse smoothness. `smoothMove` interpolation (selfClaude pattern, 20 steps × 5ms sync).
- Wave 4 (09-04): ⏸ PENDING — 100-09-04 user-walked SSH probe (autonomous: false). Mouse latency probe + patch.
- Wave 5 (09-05): ✅ COMPLETE — `16a6140d..1b918cb1` (5 commits) — UX 1: Drop chat drawer. New `WebAppChatBottomBar` (inline at bottom). Chat icon toggles log expand/collapse.
- Wave 6 (09-06): ✅ COMPLETE — `1966fa1c..b85fcb83` (6 commits) — UX 2: Drop teach drawer. `TeachPopupHost` + `SaveSkillModal` + `SkillsPopover` (top-right). action_log v2 (per-event screenshot_b64 + viewport, session metadata). v1 lazy-upgrade.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 21 (09) commits

## 100-09 Hot-Fix Round (2026-05-10) — User Feedback After Deploy

Stream area inside WebApp window rendered `wmctrl -lG: Cannot get client list properties` instead of Chrome content. 3 new sub-plans dispatched same session:

- Wave 7 (09-07): ✅ COMPLETE — `18b75ce4..9c55635d` (3 commits) — fluxbox stderr capture (no more silent failures) + window-discovery xdotool fallback (works without EWMH). Defense in depth.
- Wave 8 (09-08): ✅ COMPLETE — `a33f2f4e..2c4f6a77` (3 commits) — Action bar 2-mode state machine. Click Message → bar TRANSFORMS to chat input (no more inline persistent bar inside window).
- Wave 9 (09-09): ✅ COMPLETE — `ba8df06c..b2156f5c` (3 commits) — Teach button itself turns red + numeric click-count badge. NO top-right widget. NO time counter.

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 9 hot-fix commits (+ 21 prior 09-01..06 commits).

**Pending user actions:**

1. Mini PC redeploy — pulls 09-07/08/09 fixes. `bash /opt/livos/update.sh` on `bruce@10.69.31.68`
2. Plan 100-08-06 — formal Mini PC deploy + 11-step UAT (multi-stream + per-WebApp control already informally validated)
3. Plan 100-09-04 — mouse latency probe + patch (user-walked SSH)
4. **Plan 100-10 — Luse rename + per-WebApp Xvfb + UI polish** — CONTEXT written 2026-05-10 (commit `dc4cfbc7`). 8 user-reported issues. After `/clear` next session, run `/gsd-plan-phase 100-10`.

## 100-10 Context (2026-05-10) — READY FOR PLANNING

`.planning/phases/100-multi-stream-window-redesign/100-10-CONTEXT.md` (committed `dc4cfbc7`) — comprehensive 8-issue + 10-decision + 7-plan-outline context. User said `/clear` next, then run `/gsd-plan-phase 100-10`.

Key decisions captured:

- D-100-10-A: Per-WebApp Xvfb (`:10+index`) — solves multi-stream overlap + Chrome direct capture
- D-100-10-B: Bytebot → Luse rename (project-wide, like Nexus→Liv P65)
- D-100-10-C: Luse new tools (list_windows, screenshot_window, focus, create_stream, etc.)
- D-100-10-D..G: UI cleanup (Skill button outside, Chat in-place, full-fit, remove Auto)
- D-100-10-H: Sacred SHA preserved throughout
- D-100-10-I: action_log backwards-compat shim (mcp__bytebot__* → mcp__luse__* lazy translate)

Wave 1: 10-01 (Xvfb allocator foundation)
Wave 2: 10-02 (Bytebot→Luse rename foundation)
Wave 3: 10-03 + 10-04 + 10-05 + 10-06 (parallel: Luse tools + UI cleanup + chat response mode)
Wave 4: 10-07 (user-walked deploy + 15-step UAT)

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` will stay UNTOUCHED throughout (sacred file has zero bytebot references; rename pass doesn't touch it).
Wave 1: ✅ COMPLETE — `759ef597` P80, `9a276a11` P85-schema, `628ed1ca` P87, `12aa473f` summaries
Wave 2: ✅ COMPLETE — `4379ea89` P81, `6f758067` P82, `0df7475b` P83, `49d79510` P86, `52944d16` P85-UI
Wave 3: ✅ COMPLETE — `d719a175` P84 (MCP SoT + Smithery secondary + legacy mcp-panel deprecated)
Wave 4: ✅ COMPLETE — `50156555` P89 (ThemeToggle + Cmd-key shortcuts + a11y), `464eba3b` P88 (WS→SSE + status_detail UI + AgentSelector)
Wave 5: ✅ COMPLETE — `af860aa9` P90 (cutover + redirects + dock + 2 legacy file deletes), `771b7712` P91 (WCAG fix + UAT-CHECKLIST + static smoke)
Lifecycle: ◆ Code-complete; awaiting user-walked Mini PC UAT signoff. After UAT: cleanup deferred to user invocation.

## Wave 1 Deliverables (shipped)

- **P80 Foundation** (`759ef597`) — OKLCH design tokens, Geist Sans/Mono fonts, ThemeProvider+useTheme, `/playground/v32-theme` preview route. UI build clean (35.86s, 422 precache entries).
- **P85-schema** (`9a276a11`) — `agents` table (`id` UUID PK + nullable `user_id`), agents-repo with full CRUD/clone/publish, 5 stable seed UUIDs (Liv Default `1111…`, Researcher `2222…`, Coder `3333…`, Computer Operator `4444…`, Data Analyst `5555…`), `agent_templates` backfilled readonly. 23/23 + 86/86 tests pass.
- **P87 Hermes runtime** (`628ed1ca`) — 5 Hermes patterns ported (status_detail chunk, IterationBudget=90, steer injection, batchId per turn, JSON repair chain). `lib/hermes-phrases.ts` with 15 THINKING_VERBS + 3 WAITING_VERBS. Sacred sdk-agent-runner.ts SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED.

## Sacred Constraints (v32-wide)

- `liv/packages/core/src/sdk-agent-runner.ts` SHA MUST equal `f3538e1d811992b782a9bb057d1b7f0a0189f95f` at all times. Verified before/after every wave.
- D-NO-BYOK: subscription-only path (`@anthropic-ai/claude-agent-sdk`). No raw `@anthropic-ai/sdk` fallback.
- D-NO-SERVER4: Server4 is NOT ours. Mini PC (`bruce@10.69.31.68`) is the only deploy target. (Live deploy is user's job — orchestrator only ships to GitHub.)
- D-LIV-STYLED: Hermes runtime patterns adopted, KAWAII emoticons + ASCII frames NOT adopted.

## Blockers / Concerns

- **2026-05-13 — Plan 111-01 BLOCKED on Server5 reachability.** Server5 (`45.137.194.102` / `livinity.io`) TCP SYN/ACK accepted on :22 :80 :443 but app layer unresponsive: `sshd` completes KEX then drops with `Connection reset by peer`; `curl https://livinity.io/install.sh` times out at 15s with no bytes received. Needs operator intervention (Contabo panel reboot, or check Caddy/sshd/load on Server5). Sacred SHA preserved (`f3538e1d...`), no local repo changes made. See `.planning/phases/111-server5-dashboard-install-wizard/111-01-PLAN.md`. Resume Plan 111-01 once `ssh root@45.137.194.102 'uptime'` works.

## Reference

- Milestone master plan: `.planning/v32-DRAFT.md`
- Roadmap: `.planning/ROADMAP.md` v32 section (lines 55-104)
- v31 archive note: see commit `37a82557` (which marked v31 complete in ROADMAP)
- Wave 1 SUMMARYs:
  - `.planning/phases/80-foundation-tokens-fonts-theme/80-SUMMARY.md`
  - `.planning/phases/85-agent-management/85-SCHEMA-SUMMARY.md`
  - `.planning/phases/87-hermes-background-runtime/87-SUMMARY.md`

**Planned Phase:** 115 (ui-component-inventory) — 3 plans — 2026-05-14T21:15:09.228Z

**Planned Phase:** 100 (Multi-Stream + Stream-Window Redesign) — 5 plans — 2026-05-08T16:05:00.000Z (waves 1→2→3→4→5; sacred SHA hook installed in 100-01; v33 ✅ Shipped flip in 100-05)

## Phase 99 — PARTIAL-PASS (2026-05-08)

- **Shipped:** all 5 plans (12 commits `9a61d78a..cd6f442a`); pushed to GitHub; deployed to Mini PC (deployed SHA recorded as `cd6f442` by update.sh; all 4 services `active`).
- **What works (PASS):** single WebApp click → stream window with live RFB handshake (no `Invalid server version ftypiso`); mouse + keyboard pass-through.
- **What does NOT work (deferred to Phase 100):** multi-stream (2nd WebApp click does not produce an independent stream); URL bar in stream window unwanted; stream should fill window; Chat/Teach/Watch/Auto must move out of inline pane into floating icon-button row.
- **Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 12 commits (verified pre + post deploy).

## Phase 100 — PARTIAL-PASS (2026-05-08)

- **Shipped:** all 5 plans (13 execution commits `a6c519fd..4954d9ba`, +8 prior planning iterations); pushed to GitHub master; deployed to Mini PC (`/opt/livos/.deployed-sha` = `4954d9ba`; all 4 services `active`, including liv-memory which was NOT in the carry-over restart loop on this deploy).
- **What works (PASS — 9/11 UAT):**
  - Multi-stream creation: 2 concurrent WebApps render distinct streams on independent x11vnc ports (R1, R2).
  - Visual rewire: no URL bar / stream fills window / 4-icon bottom action-bar / Chat + Teach drawers slide-in (R4-R8).
  - Sacred SHA preserved on Mini PC (R10).
- **What does NOT work (FAIL — 2/11 UAT, deferred to Plan 100-06):**
  - Row 3 — click input routing: clicks on stream window A always operate on the LAST-opened WebApp's Chrome wid (x11vnc `-id <wid>` binds capture only; input forwards via `XTestFakeKey/MotionEvent` to focused window).
  - Row 9 — chat → bytebot scope routing: typing in WebApp A's Chat drawer always operates on the LAST-opened WebApp's bytebot (per-WebApp MCP servers ARE registered, but agent loop tool routing doesn't enforce per-chat scope).
- **Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 13 execution commits + post-deploy verification (verified live on `/opt/liv/packages/core/src/sdk-agent-runner.ts`). Pre-commit hook (`.husky/pre-commit` + `scripts/check-sacred.sh`) installed by 100-01 fired and passed on every commit.
- **PHASE-SUMMARY:** `.planning/phases/100-multi-stream-window-redesign/PHASE-SUMMARY.md` (committed).
- **UAT detail:** `.planning/phases/98-uat-polish/UAT-CHECKLIST.md` "Phase 100 — Multi-Stream + Stream-Window Redesign (PARTIAL-PASS 2026-05-08)" section.

## Plan 100-06 — UI Revisions (SHIPPED 2026-05-08)

- **Shipped commit:** `f18c8973` (atomic, +277 / -140 across 8 files; sacred SHA `f3538e1d…` UNTOUCHED).
- **Deployed:** `bash /opt/livos/update.sh` 2026-05-08 19:41 PT — all 4 services `active`; deployed SHA `f18c897309299f44698f9a8aa79ab5836091d720`; sacred SHA `f3538e1d…` on Mini PC verified.
- **What landed (4 user-requested UI corrections):**
  1. Bottom action bar moved OUTSIDE the WebApp window (NEW `webapp-floating-action-bar.tsx` — fixed-positioned `motion.div` mirroring `window-chrome.tsx` close button; rendered in `windows-container.tsx` for any `WEBAPP_` window). 16px below the window's bottom edge, centered, with `<Magnetic>` wrapper.
  2. Round buttons (`rounded-full bg-white/90 backdrop-blur-xl border + soft shadow` — close-button parity).
  3. Watch mode dropped entirely (`webapp-watch-drawer.tsx` deleted; `WebAppMode` collapsed `chat | teach | watch | auto` → `chat | teach | auto`).
  4. WebApp windows ship at fixed `1280×720` base size (`window-manager.tsx openWindow` checks `WEBAPP_` prefix; falls through `getResponsiveSize()` for viewport clamping).
- **State coupling:** new `webapp-drawer-store.ts` (Zustand keyed by webappId). The floating action bar (outside the window) and the Sheet drawer host (inside webapp-stream-window.tsx) both subscribe.
- **Tests:** 21/21 stream-window invariants PASS (4 flipped + 5 new for `WebAppFloatingActionBar`); build clean (`vite build` 35.92s).
- **SUMMARY:** `.planning/phases/100-multi-stream-window-redesign/100-06-SUMMARY.md`.

## Plan 100-07 — Routing Fix (PARTIAL-SHIPPED, residual bugs)

**Hot-fixes shipped 2026-05-08** (deployed Mini PC `2f973413`):

- **100-07.1/.2** (`dbb48d32` / `1487bba4`): user canvas click bypass — RFB viewOnly + tRPC `webapp.input.{click, keypress, type}` + xdotool windowactivate-first pattern
- **100-07.3** (`6540c55b`): bytebot `tryXdotoolClick` activate-first pattern + chat UI object render fix
- **100-07.4** (`73739355`): bytebot host MCP auto-scope to single active WebApp via `/tmp/livos-active-webapp-wid` shared-file IPC
- **100-06.1/.2** (`5ed4b39f` / `2f973413`): Chrome `--window-size=1280,720 --window-position=0,0` + getResponsiveSize aspect-preserve

**RESIDUAL BUGS (user-reported persist):**

1. Stream still opens vertical despite 100-06.2 — likely cache OR Chrome IPC merge with --start-maximized host inheritance
2. Multi-stream control: when WebApp B opens, WebApp A bytebot stops working (single-active-wid file empty for 2 active webapps → host-display fallback)

**Detailed handoff:** `.planning/phases/100-multi-stream-window-redesign/CONTINUE.md`

**User reference (hackathon project that solves same use case):** https://github.com/utopusc/selfclaude

## Plan 100-08 — SelfClaude study + proper per-WebApp MCP wiring (QUEUED)

- Study https://github.com/utopusc/selfclaude — patterns user shipped today that work
- Bring patterns back into LivOS: per-WebApp MCP child spawn lifecycle, proper chat-surface tool-routing, kill-host-Chrome-before-spawn for window-size honor
- Likely path:
  ```
  /gsd-discuss-phase 100-08    # spec selfclaude study + adoption
  /gsd-plan-phase 100-08
  /gsd-execute-phase 100-08
  ```

**v33 milestone status:** Phases 92-100 CODE-COMPLETE; Phase 99 + Phase 100 PARTIAL-PASS. v33 does NOT flip to ✅ Shipped until 100-08 ships AND Phase 100 UAT re-walks all 11 rows PASS.
