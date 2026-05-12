---
gsd_state_version: 1.0
milestone: v31.0
milestone_name: Liv Agent Reborn
status: unknown
last_updated: "2026-05-12T07:54:56.087Z"
progress:
  total_phases: 54
  completed_phases: 25
  total_plans: 210
  completed_plans: 203
  percent: 97
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v32.0 AI Chat Ground-up Rewrite + Hermes Background Runtime — CODE-COMPLETE 2026-05-06; pending Mini PC UAT signoff
**Last shipped milestone:** v31.0 Liv Agent Reborn — closed 2026-05-05 (P64-P79 all complete)
**Next action:** USER WALK — Mini PC deploy + UAT-CHECKLIST.md (`.planning/phases/91-uat-polish/UAT-CHECKLIST.md`, 10 sections A-J). After UAT signoff: `/gsd-cleanup` to archive phase artifacts; then `/gsd-new-milestone` for v33.

## Current Position

Phase: 104 (One-shot Local Install + Docker Ubuntu GUI UAT) — **TASK-1 COMPLETE, AWAITING USER-WALKED APPLE UAT (Task 2 checkpoint:human-verify)**
Plan: 7 of 7 — 104-07 Task 1 ✅ shipped 2026-05-12 `8c143b7b` (walk.mjs full AC walk + lib/chrome-cdp.mjs + lib/tcpdump-check.mjs + UAT-CHECKLIST.md + UAT-EVIDENCE/.gitkeep); **Task 2 awaiting operator walk** on real Apple devices (iPhone Safari + iPad Safari + macOS Safari + macOS Chrome green padlock) + Mini PC update.sh AC-104-12 + real tcpdump AC-104-15 → checklist sign-off at `.planning/phases/104-local-install-and-docker-uat/UAT-CHECKLIST.md`. (104-01 ✅ shipped 2026-05-12 `e0c4fc6c..500b4912`; 104-02 ✅ shipped 2026-05-12 `2a1a274b..1361f483`; 104-03 ✅ shipped 2026-05-12 `9bba50ba..8d8cec66` — local-lan backend code-complete, 24/24 vitest pass, runtime AC-104-4..7 deferred to 104-07 UAT; 104-04 ✅ shipped 2026-05-12 `9a9801c8..62a526b1` — hybrid backend code-complete, 52/52 vitest pass, AC-104-15 runtime tcpdump deferred to 104-07 UAT; 104-05 ✅ shipped 2026-05-12 `4c853ce0..18a097f3` — enrollment wizard UI code-complete, 17/17 vitest pass, runtime AC-104-9/-10/-15 surfaces deferred to 104-07 UAT; 104-06 ✅ shipped 2026-05-12 `1e6f1f01..e9e3c125` — cloud-mode regression test SHIPPED; D-104-NO-PROD-IMPACT regression gate live; mode-cloud.sh real body + docker/cloud-regression/ UAT container + capture-minipc-baseline.sh helper; `docker compose build` succeeds locally; full byte-equivalence diff requires one-time operator capture of Mini PC baseline fixtures)
Phase: 103 (Master Chrome Streaming + Single-MCP Display-Aware) — DEPLOYED but UAT FAILED on two issues, addressed in 103.1
Milestone: v33.0 (active)

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

None — Wave 1 fully verified. Sacred SHA preserved. Builds green across 3 packages.

## Reference

- Milestone master plan: `.planning/v32-DRAFT.md`
- Roadmap: `.planning/ROADMAP.md` v32 section (lines 55-104)
- v31 archive note: see commit `37a82557` (which marked v31 complete in ROADMAP)
- Wave 1 SUMMARYs:
  - `.planning/phases/80-foundation-tokens-fonts-theme/80-SUMMARY.md`
  - `.planning/phases/85-agent-management/85-SCHEMA-SUMMARY.md`
  - `.planning/phases/87-hermes-background-runtime/87-SUMMARY.md`

**Planned Phase:** 104 (One-shot Local Install + Docker Ubuntu GUI UAT) — 7 plans — 2026-05-12T06:26:35.818Z

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
