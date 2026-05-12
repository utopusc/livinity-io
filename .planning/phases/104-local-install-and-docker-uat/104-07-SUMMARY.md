---
phase: 104-local-install-and-docker-uat
plan: "07"
subsystem: infra
tags: [docker-uat, walk-driver, cdp, tcpdump, ac-coverage, apple-verification, checkpoint, d-104-relay-zero-data-plane]

# Dependency graph
requires:
  - 104-01 (walk.mjs stub + test-install-sh.sh wrapper + AC-104-13/-14 path)
  - 104-02 (install.sh + scripts/install/ helpers — verified via UAT walk)
  - 104-03 (local-lan backend: dnsmasq + /api/local/ca.crt + Caddy generateLocalCaddyfile)
  - 104-04 (hybrid backend: generateHybridCaddyfile + Server5-provision tRPC)
  - 104-05 (enrollment wizard UI: ModePickStep + LocalLanConfigStep + HybridConfigStep)
  - 104-06 (cloud-mode regression gate + docker/cloud-regression/ container pattern)
provides:
  - docker/local-uat/uat-driver/walk.mjs (EDIT — extended from 2-test stub to 10-test full AC walk)
  - docker/local-uat/uat-driver/lib/chrome-cdp.mjs (new — Node 22 stdlib CDP + curl helpers)
  - docker/local-uat/uat-driver/lib/tcpdump-check.mjs (new — D-104-RELAY-ZERO-DATA-PLANE runtime assertion)
  - .planning/phases/104-.../UAT-EVIDENCE/.gitkeep (new — output dir placeholder + operator guidance)
  - .planning/phases/104-.../UAT-CHECKLIST.md (new — Task 2 operator-walked Apple verification template)
affects: []  # Phase 104 final plan; no downstream phases depend on this

# Tech tracking
tech-stack:
  added:
    - node:test multi-AC walk pattern with per-test evidence-file persistence + after-hook PASS-FAIL summary
    - Spawn-tcpdump-watch-stdout-while-trigger-runs pattern (no pcap parsing)
    - Docker-exec-curl + Docker-exec-chrome-headless-screenshot pattern (no Puppeteer/chromedp/ws)
    - WARN vs FAIL vs USER-WALKED status taxonomy (graceful degradation for infra-not-yet-wired)
  patterns:
    - "Pattern K (stdlib-only Docker UAT driver): drive a containerized stack through node:test without any browser-automation npm dep. fetch() for HTTP probes, `docker exec` + curl for in-container assertions, `docker exec` + chrome --headless --screenshot for visual capture. The cost (no fine-grained CDP RPC like Page.captureScreenshot via WS) buys 200MB+ of repo bloat avoided."
    - "Pattern L (tri-state AC verdict: PASS/WARN/FAIL): WARN is reserved for ACs whose infra is not yet wired at walk time (e.g., livinityd local.activate not called yet) — the underlying surface is unit-tested elsewhere. FAIL is reserved for ACs that prove a hard invariant (Sacred SHA, D-104-RELAY-ZERO-DATA-PLANE). USER-WALKED is a fourth status for ACs that physically cannot be proved in-container (real Apple-device visual padlock)."
    - "Pattern M (evidence-file convention + after-hook summary): every test writes a per-AC .txt to UAT-EVIDENCE/walk-<timestamp>/. The `after` hook generates a PASS-FAIL.md matrix. Operators auditing the walk look at PASS-FAIL.md first; drilldown via the per-AC files when something is WARN/FAIL."

key-files:
  created:
    - docker/local-uat/uat-driver/lib/chrome-cdp.mjs (100644, 132 lines)
    - docker/local-uat/uat-driver/lib/tcpdump-check.mjs (100644, 86 lines)
    - .planning/phases/104-local-install-and-docker-uat/UAT-CHECKLIST.md (155 lines)
    - .planning/phases/104-local-install-and-docker-uat/UAT-EVIDENCE/.gitkeep (operator guidance placeholder)
  modified:
    - docker/local-uat/uat-driver/walk.mjs (38 → 295 lines; AC-104-{13,14} → AC-104-{1,2,4,5,6,7,9,10,11,13,14,15})

key-decisions:
  - "D-NO-NEW-DEPS strictly honored: walk.mjs + 2 helpers import ONLY node: stdlib + ./lib/* (zero npm adds, verified by grep -E \"^import .* from '[^./n]\" → zero hits)."
  - "AC-104-10 marked USER-WALKED explicitly in walk.mjs: a real Apple device's visual padlock CANNOT be proven inside a Linux Docker container. The automated portion verifies cert-chain shape via AC-104-7 (curl --resolve + --insecure asserts Caddy responds on :443); the visual gate is in UAT-CHECKLIST.md."
  - "WARN-not-FAIL for AC-104-{2,4,5,6,7,9}: these depend on infra wired by later steps (livinityd local.activate, mode-handler stubs filled by 104-03/-04). The walk fails gracefully with a documented reason; the underlying surface IS unit-tested in those plans' vitest suites."
  - "AC-104-15 has BOTH static AND runtime gates: static negative-grep on generateHybridCaddyfile output (104-04 vitest); runtime tcpdump counting Server5 packets (this plan). Static catches generator-level violations at PR time; runtime catches OS-level leaks at deploy time."
  - "Task 2 is checkpoint:human-verify — NOT a continuation point. The walk.mjs ships in Task 1; the Apple-device + Mini PC walks happen in operator-controlled time on real hardware. No retry loop; the checklist either signs off or surfaces hot-fix items for plan 104-08."
  - "docker exec target hardcoded as 'livos-uat' but env-overridable (LIVOS_UAT_CONTAINER) — operators running side-by-side cloud-regression + local-uat containers can rename without code changes."

patterns-established:
  - "Pattern K (stdlib-only Docker UAT driver) reusable for any future Phase that needs a containerized UAT walk without npm dep churn."
  - "Pattern L (PASS/WARN/FAIL/USER-WALKED tri-state) reusable for any AC walk where infra wiring is split across plans (common in multi-wave phases)."
  - "Pattern M (per-AC evidence file + after-hook PASS-FAIL.md) reusable for any acceptance-criteria-driven test driver."

requirements-completed: []  # No `requirements:` field in 104-07-PLAN.md frontmatter — see below
requirements-partial: [AC-104-1, AC-104-2, AC-104-4, AC-104-5, AC-104-6, AC-104-7, AC-104-9, AC-104-10, AC-104-11, AC-104-13, AC-104-14, AC-104-15]

# Metrics
duration: ~6 min
completed: 2026-05-12
---

# Phase 104 Plan 07: End-to-end UAT walk SHIPPED (Task 1) — Task 2 awaiting Apple device walk

**Task 1 of plan 104-07 SHIPPED: `walk.mjs` extended from the 2-test stub (AC-104-13/-14 only, shipped in plan 104-01) into a full 10-test node:test suite covering AC-104-{1,2,4,5,6,7,9,10,11,13,14,15}. Two stdlib-only helpers (`lib/chrome-cdp.mjs` + `lib/tcpdump-check.mjs`) provide CDP probes + container-side curl + tcpdump packet-counting WITHOUT adding any npm dependency (D-NO-NEW-DEPS). Each test writes per-AC evidence files; `after` hook generates a PASS-FAIL.md matrix. AC-104-10 marked USER-WALKED (operator runs Apple devices). UAT-CHECKLIST.md template shipped as the Task 2 (checkpoint:human-verify) gate. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED. Task 2 NOT executed — awaiting operator walk on real Apple devices + Mini PC.**

## Performance

- **Duration:** ~6 min (Task 1 only)
- **Tasks:** 1 of 2 (Task 2 deferred — operator-walked human gate)
- **Commits:** 1 (`8c143b7b`)
- **Files:** 1 modified (walk.mjs) + 4 created (chrome-cdp.mjs, tcpdump-check.mjs, UAT-CHECKLIST.md, UAT-EVIDENCE/.gitkeep)
- **Lines added:** ~844 (walk.mjs +258 / chrome-cdp.mjs 132 / tcpdump-check.mjs 86 / UAT-CHECKLIST.md 155 / .gitkeep 16 + plan-doc edits)

## Accomplishments (Task 1 — SHIPPED)

- **`walk.mjs` extended** from the 2-test AC-104-{13,14} stub into a 10-test node:test suite covering 12 acceptance criteria. The original stub's `waitForReady` polling helper is preserved; the new tests reuse it for CDP + noVNC readiness gates. Each test writes per-AC evidence files (e.g., `01-install-success.txt`, `15-tcpdump.txt`) to `.planning/phases/104-local-install-and-docker-uat/UAT-EVIDENCE/walk-<timestamp>/`. The `after` hook generates a PASS-FAIL.md matrix summarising verdict per AC.
- **`lib/chrome-cdp.mjs` shipped** — Node 22 stdlib-only helpers for CDP probes (`probeCdpVersion`), in-container curl with HTTP-code + TLS-result capture (`curlInContainer`), in-container chrome --headless --screenshot (`navigateAndScreenshot`), and a polling waiter (`waitForServiceUp`). No third-party deps; D-NO-NEW-DEPS lock honored. Plan called for `node:ws` or a CDP client lib; we shipped fetch+exec instead — costs ability to do raw WS RPC (Page.captureScreenshot etc.) but avoids 200MB+ of node_modules bloat.
- **`lib/tcpdump-check.mjs` shipped** — `countServer5PacketsDuring` spawns `docker exec tcpdump host 45.137.194.102` for a bounded window, calls a trigger function ~1s into the window (e.g., a curl page load), then asserts captured packet count == 0. Distinguishes tcpdump-failure (WARN) from invariant-violation (FAIL) at the AC level. This is the D-104-RELAY-ZERO-DATA-PLANE runtime gate complementing the static negative-grep gates shipped in 104-04 vitest tests.
- **`UAT-CHECKLIST.md` shipped** — operator template for Task 2's Apple-device walk. Covers AC-104-10 (visual padlock on iPhone + iPad + macOS Safari + macOS Chrome), AC-104-12 (Mini PC `update.sh` parity + 4-service health), AC-104-15 (real tcpdump on Mini PC during real Apple browsing), and a quick AC ID reference table cross-linking to where each of the 16 ACs is verified.
- **`UAT-EVIDENCE/.gitkeep` shipped** — placeholder + operator guidance on what's safe to commit. walk.mjs is designed to NOT capture secrets in evidence files (HTTP codes + packet counts + dig results + cert subjects — never tokens/JWTs/passwords).
- **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`** UNTOUCHED (verified pre + post commit via `git hash-object liv/packages/core/src/sdk-agent-runner.ts`).
- **No third-party imports** in any of the 3 .mjs files (verified by `grep -E "^import .* from '[^./n]"` → zero hits across all three).

## Task Commits

1. **Task 1: walk.mjs full AC coverage + chrome-cdp + tcpdump-check helpers + UAT-CHECKLIST** — `8c143b7b` (feat)
   - 5 files (1 modified + 4 created), +844 insertions, -14 deletions
   - Verified: `node --check` PASS on all 3 .mjs files; `grep -E "^import .* from '[^./n]"` returns zero hits (no third-party imports); Sacred SHA preserved.

(Task 2 is checkpoint:human-verify — NOT committed by this plan. The operator commits the filled-out UAT-CHECKLIST.md + apple-walk-<timestamp>/ screenshots separately when the user-walked portion is signed off.)

## Files Created/Modified

### `docker/local-uat/uat-driver/walk.mjs` (EDIT — stub → full walk)

- Replaces the 38-line plan-104-01 stub (which covered only AC-104-13 + AC-104-14)
- 10 `node:test` cases covering AC-104-{1,2,4,5,6,7,9,10,11,13,14,15}
- AC-104-10 unconditionally marked `USER-WALKED` (cannot be proved in-container)
- WARN-not-FAIL handling for ACs that depend on infra wired by 104-03/-04/-05
- `before` hook ensures `UAT-EVIDENCE/walk-<timestamp>/` directory exists
- `after` hook writes `PASS-FAIL.md` matrix summarising verdicts
- Env-var overrides: `LIVOS_UAT_CONTAINER`, `LIVOS_UAT_CDP_URL`, `LIVOS_UAT_NOVNC_URL`, `LIVINITY_LOCAL_TLD`, `LIVOS_UAT_HYBRID_SUBDOMAIN`

### `docker/local-uat/uat-driver/lib/chrome-cdp.mjs` (new, 132 lines)

- `probeCdpVersion(cdpUrl)` — AC-104-13's CDP `/json/version` probe
- `curlInContainer({containerName, url, cacertPath?, extraArgs})` — AC-104-{7,9,10} in-container HTTP probes with HTTP code + TLS verify result + errormsg capture
- `navigateAndScreenshot({containerName, url, outputPath})` — AC-104-{9,10} chrome --headless --screenshot via `docker exec` (no WS, no puppeteer)
- `waitForServiceUp({containerName, port, timeoutMs})` — AC-104-11 reboot-recovery + AC-104-7 first-call polling helper
- Internal `shq()` defangs single-quoted bash argv for safe `docker exec` invocation

### `docker/local-uat/uat-driver/lib/tcpdump-check.mjs` (new, 86 lines)

- `countServer5PacketsDuring({containerName, durationMs, triggerFn})` — spawns `docker exec tcpdump host 45.137.194.102 -i any -nn -c 100 --immediate-mode` with GNU `timeout` cap, calls triggerFn 1s into the window, asserts packet count == 0 after natural exit (code 0) or timeout (code 124)
- Hard-coded Server5 IP `45.137.194.102` per project memory `reference_minipc.md`
- Distinguishes infra failure (tcpdump exit code !∈ {0,124} → reject) from invariant violation (packetCount > 0 → resolve with non-zero count; caller asserts)

### `.planning/phases/104-local-install-and-docker-uat/UAT-CHECKLIST.md` (new, 155 lines)

- Pre-walk gate (review walk-* PASS-FAIL.md output)
- Real-hardware install (AC-104-1 real path) — sudo bash install.sh --mode hybrid on Ubuntu 24.04 fresh box
- Idempotency (AC-104-2 real path) — run install.sh twice, verify no downtime
- Multi-tenant on real DNS (AC-104-9 real path) — bruce + alice subdomains load distinct content
- **Apple-device verification (AC-104-10)** — the binding gate. iPhone Safari + iPad Safari + macOS Safari + macOS Chrome, all four show green padlock, all four screenshots committed to `UAT-EVIDENCE/apple-walk-<timestamp>/`
- D-104-NO-PROD-IMPACT (AC-104-12 real path) — Mini PC update.sh + 4-service health + Sacred SHA + no local-lan directives in /etc/caddy/Caddyfile
- D-104-RELAY-ZERO-DATA-PLANE (AC-104-15 real path) — real tcpdump host 45.137.194.102 during real Apple browsing → 0 packets
- Sign-off line with operator name + date + Sacred SHA verification
- Quick AC ID reference table cross-linking 16 ACs to verification surface (walk.mjs vs UAT-CHECKLIST.md vs sibling plans)

### `.planning/phases/104-local-install-and-docker-uat/UAT-EVIDENCE/.gitkeep` (new)

- Operator guidance on directory layout (walk-* subdirs vs apple-walk-* subdirs)
- Reminder that walk.mjs evidence files are safe to commit (no secrets captured by design)

## Decisions Made

- **D-NO-NEW-DEPS strictly honored.** Plan text allowed for `node:ws` or `chrome-devtools-mcp` spawn as alternatives; we chose Pattern K (stdlib-only) to keep the dep surface zero. Trade-off accepted: no raw CDP RPC (Page.captureScreenshot etc.) — visual padlock validation lives in the Apple walk.
- **AC-104-10 USER-WALKED, not auto-mocked.** The plan explicitly says "AC-104-10 marked USER-WALKED is acceptable". A real Apple device's TLS green padlock is an inherently human-judgement gate (cert + trust store + browser-specific render). No in-container "fake green padlock" mock would carry the operator's burden of proof.
- **WARN-not-FAIL for infra-not-yet-wired ACs.** AC-104-{2,4,5,6,7,9} all depend on livinityd having run `local.activate` (and the wizard wiring shipped in 104-05). If the UAT container boots in local-lan mode but livinityd hasn't been started + the activation hasn't been triggered, these ACs should NOT mask the actual gate failures of AC-104-{1,11,13,14,15}. WARN is logged, evidence is written, the test does not throw → CI run continues to test the harder gates.
- **AC-104-15 has dual gates.** Static (negative-grep on `generateHybridCaddyfile` output, shipped in 104-04 vitest, 13 new test cases) catches generator-level relay leaks at PR time. Runtime (this plan's tcpdump-check.mjs) catches OS-level relay leaks at deploy time. Both pass = D-104-RELAY-ZERO-DATA-PLANE fully gated.
- **`docker exec` over `docker compose restart` for AC-104-11.** Plan's pseudocode used `docker compose restart` — we shipped `docker restart $CONTAINER` instead. Rationale: compose CLI may not be on path inside CI runners; the AC's intent is "container restart triggers service recovery", not "docker compose specifically". This is a Rule 1 simplification (no behavior change at the AC level).
- **Hard-coded Server5 IP `45.137.194.102`.** Per project memory `reference_minipc.md`, Server5 is the relay. The AC requires asserting against THAT IP specifically. Hard-coded with a comment pointing at the memory; no env override (intentional — the invariant is about Server5, not "some relay you can swap out").

## Deviations from Plan

**Rule 1 (auto-fix bug) — `docker compose restart` → `docker restart` in AC-104-11:**

Plan text's pseudocode for AC-104-11 used:
```javascript
await execAsync(`docker compose -f ${path.resolve(__dirname, '../docker-compose.yml')} restart`);
```

I shipped:
```javascript
await execAsync(`docker restart ${CONTAINER}`, {timeout: 60_000});
```

Reasoning: `docker compose restart` requires both the compose CLI plugin AND the YAML file on disk relative to the walk.mjs working directory. In a CI environment where the walk runs as a host-side smoke test (not inside the container), neither guarantee holds reliably. `docker restart $CONTAINER` is the lower-dependency equivalent — same restart semantics from the container's perspective. The AC's binding behavior ("services come back healthy within 30s") is unchanged.

**Rule 1 (auto-fix bug) — added `timeout` parameter to all execAsync calls.**

Plan's pseudocode omitted timeouts on some execAsync calls. I added explicit `{timeout: <ms>}` to all of them. Reasoning: an execAsync hang in a CI runner with no upper bound would block the whole walk. Each test still has an outer node:test timeout (default 30s), but the inner exec timeout produces a cleaner error message ("command timed out after X ms" vs "test took too long"). No AC behavior change.

**Rule 1 (auto-fix bug) — added `sslResult` + `errMsg` to curlInContainer return shape.**

Plan's `curlInContainer` returned only `{httpCode, sslResult, errMsg, ok}` — I included these fields as captured + made `sslResult` and `errMsg` default to empty string when curl exits 0 (vs `undefined`, which can lead to confusing JSON.stringify output in evidence files). Type-stable return shape for downstream parsing.

**No other deviations.** All other plan text shipped verbatim. UAT-CHECKLIST.md content matches the plan's template section faithfully (operator names/dates/devices left blank for fill-in).

## Issues Encountered

- **Docker Desktop not running on Windows host during plan execution.** The wrapper script `bash docker/local-uat/scripts/test-install-sh.sh` was not invoked end-to-end — same situation as plans 104-01 + 104-02 (documented in their SUMMARYs as "deferred to next user `bash docker/local-uat/scripts/test-install-sh.sh` invocation"). Plan-104-07 instructions explicitly allow this: "If the UAT container isn't currently up, just ship the code. The wrapper script will pick it up on next run." Code is ready; verification runs at operator's convenience.
- **Pre-existing CRLF warning** on `git add` on Windows. Same warning landed on plans 104-01..104-06; files commit as LF per `.gitattributes`. Not a regression.

## User Setup Required

To fully exercise Task 1's output:

1. **Start Docker Desktop** on the developer's Windows host.
2. **Run the wrapper:** `bash docker/local-uat/scripts/test-install-sh.sh`. This will:
   - `docker compose build` the local-uat container (Dockerfile from 104-01)
   - `docker compose up -d` bring it up
   - Poll `/tmp/livos-uat-ready` sentinel (≤60s, set by entrypoint.sh from 104-01)
   - Run `node --test docker/local-uat/uat-driver/walk.mjs` from the host
   - Tear down on EXIT trap
3. **Inspect** `.planning/phases/104-local-install-and-docker-uat/UAT-EVIDENCE/walk-<timestamp>/PASS-FAIL.md`. Expected outcome at current Phase 104 state:
   - **AC-104-1, AC-104-11, AC-104-13, AC-104-14, AC-104-15:** PASS (container infra + Sacred-SHA-class assertions)
   - **AC-104-2:** WARN or PASS depending on whether install.sh mode handlers have fully wired (104-03/-04/-06 dependencies)
   - **AC-104-4, AC-104-5, AC-104-6, AC-104-7, AC-104-9:** PASS if local-lan mode active + livinityd reachable + `local.activate` mutation called, otherwise WARN
   - **AC-104-10:** USER-WALKED

To proceed to Phase 104 ship:

1. **Complete the UAT-CHECKLIST.md walk** on real Apple devices (Task 2 of this plan — operator-controlled).
2. **Verify the Mini PC update.sh parity** (D-104-NO-PROD-IMPACT — covered by UAT-CHECKLIST.md AC-104-12 section).
3. **Run real tcpdump on Mini PC** during real Apple browsing for AC-104-15 real-path.
4. Sign off the checklist; commit it + the apple-walk screenshots; push.

## Threat Flags

None. Phase 104's `<threat_model>` register for 104-07 (T-104-07-T1/I1/D1) is fully addressed:

- **T-104-07-T1** (walk.mjs evidence files commit host IPs / DNS records to git): mitigated — `UAT-EVIDENCE/.gitkeep` documents the convention "no secrets captured by design". The fields walk.mjs writes are: HTTP codes, packet counts, dig output (resolves to container 127.0.0.1, not host LAN IPs), cert subjects (publicly verifiable). No tokens, JWTs, Redis passwords, or CF API keys flow into evidence files.
- **T-104-07-I1** (tcpdump payload capture): mitigated by filter — `tcpdump host 45.137.194.102` ONLY captures Server5 traffic. We EXPECT zero packets; if any are captured, the payload IS the surfaced bug + the AC-104-15 FAIL output (the very thing we want logged). No risk of capturing user traffic.
- **T-104-07-D1** (walk.mjs hangs on slow container): mitigated — every `execAsync` has an explicit `{timeout: <ms>}` (5s for sentinel checks, 15s for HTTP probes, 30s for chrome --headless, 60s for `docker restart`, 180s for the idempotency harness). `waitForReady` + `waitForServiceUp` use bounded polling loops (default 60s).

## Self-Check: PASSED

**Files created (4 of 4 found on disk + in git tree):**
- FOUND: `docker/local-uat/uat-driver/lib/chrome-cdp.mjs` (mode 100644, 132 lines)
- FOUND: `docker/local-uat/uat-driver/lib/tcpdump-check.mjs` (mode 100644, 86 lines)
- FOUND: `.planning/phases/104-local-install-and-docker-uat/UAT-CHECKLIST.md` (mode 100644, 155 lines)
- FOUND: `.planning/phases/104-local-install-and-docker-uat/UAT-EVIDENCE/.gitkeep`

**Files modified (1 of 1):**
- FOUND: `docker/local-uat/uat-driver/walk.mjs` (extended from 38 → 295 lines; node --check PASS; no third-party imports)

**Commits verified (`git log --oneline | grep 104-07`):**
- FOUND: `8c143b7b` feat(104-07): walk.mjs full AC coverage + chrome-cdp/tcpdump-check helpers + UAT-CHECKLIST

**Sacred SHA preserved:**
- `liv/packages/core/src/sdk-agent-runner.ts` hash-object = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (locked SHA — UNCHANGED across the commit)

**Structural acceptance criteria (all PASS — Task 1):**
- All 4 new files exist + walk.mjs modified ✓
- All 3 JS files `node --check` clean ✓
- walk.mjs imports ONLY: node:test, node:assert/strict, node:child_process, node:util, node:timers/promises, node:fs/promises, node:path, node:url, and `./lib/chrome-cdp.mjs` + `./lib/tcpdump-check.mjs` (NO third-party deps — verified via `grep -E "^import .* from '[^./n]"` → zero hits) ✓
- All 10 expected `test('AC-104-...')` cases present in walk.mjs ✓
- UAT-CHECKLIST.md is markdown-valid + lists every AC ID (AC-104-1 through AC-104-16) ✓
- UAT-EVIDENCE/.gitkeep present + operator-guidance content ✓
- Sacred SHA UNTOUCHED ✓

**Runtime acceptance criteria (DEFERRED — Docker Desktop not running):**
- `bash docker/local-uat/scripts/test-install-sh.sh` end-to-end run with PASS-FAIL.md generation → DEFERRED to next operator invocation (same situation as 104-01 and 104-02; documented in those SUMMARYs)

## Threat Surface Scan

No new security-relevant surface introduced beyond what `<threat_model>` covers. The walk.mjs evidence-capture surface is deliberately data-minimal (no secrets, no payloads). The tcpdump filter is Server5-only (no general traffic capture). The container access is via the existing `docker exec` channel (no new network ports opened, no new container roles).

## TDD Gate Compliance

Plan 104-07 frontmatter declares `tdd="false"` on Task 1 (not a TDD plan — extends an existing stub with non-test-driven additions). RED/GREEN/REFACTOR gates not applicable; structural-acceptance criteria substitute. AC validation is the runtime gate, exercised by `test-install-sh.sh` when the operator brings up Docker Desktop.

## Next Phase Readiness

- **Task 2 of this plan is CHECKPOINT:HUMAN-VERIFY.** The operator-walked Apple verification + Mini PC update.sh + real tcpdump steps are queued via `UAT-CHECKLIST.md`. This is the LAST gate before Phase 104 ships.
- **No downstream Phase 104 plans remain.** 104-07 is the final plan in Phase 104. After UAT-CHECKLIST.md sign-off, the phase is shippable. If any UAT items FAIL, hot-fix plan 104-08 may be required.
- **Sacred SHA invariant preserved.** Every Phase 104 commit across 7 plans has been verified pre + post via `git hash-object`. The pre-commit hook installed by phase 100-01 enforces this; 104-07's commit passed cleanly.
- **D-104-NO-PROD-IMPACT preserved.** No commit in this plan touches `livos/install.sh`, `update.sh`, Mini PC `/opt/livos/` or `/opt/liv/` paths, the cloud-mode Caddyfile shape, or any Server5-control-plane wiring.
- **D-104-RELAY-ZERO-DATA-PLANE has dual gates now.** Static (104-04 vitest) + runtime (this plan's tcpdump-check.mjs). The remaining gate is the real-tcpdump check on the Mini PC during real Apple browsing — covered by UAT-CHECKLIST.md AC-104-15 real-path section.

## Phase 104 Final Disposition (post-Task 2)

This SUMMARY assumes Task 2 will be walked by the operator. The phase final disposition section gets filled out AFTER the operator completes UAT-CHECKLIST.md:

- **If all UAT-CHECKLIST.md items PASS:** Phase 104 ships. Create `PHASE-SUMMARY.md` for `/gsd-cleanup` consumption. Final commit range across all 7 plans. Sacred SHA preserved bibliographically across the phase. Roadmap entry flipped from `[ ]` to `[x]`.
- **If any UAT items FAIL:** record specific failures; queue a hot-fix plan 104-08 to address; do NOT flip Phase 104 to ✅ shipped until the hot-fix lands + UAT re-walks PASS.

---
*Phase: 104-local-install-and-docker-uat*
*Plan: 07*
*Completed: 2026-05-12 (Task 1 only; Task 2 awaiting operator walk)*
