---
phase: 239-onboarding-cli-tools
verified: 2026-05-27T00:00:00Z
status: human_needed
score: 18/18 must-haves verified (backend); 2/2 browser-walk truths pending operator visual confirmation
re_verification:
  is_re_verification: false
human_verification:
  - test: "Onboarding wizard renders new CliToolsStep when feature flag is ON"
    expected: "Open https://bruce.livinity.io/onboarding with localStorage.setItem('livos.v43.onboarding_cli_section','true'); hard-reload; navigate to step 5; verify step header '05 · CLI Tools' + 'Pick your CLI agents'; verify 5 cards in fixed order (Claude Code, OpenCode, Gemini, OpenClaw, Aion CLI); claude-code + opencode show 'Installed ✓' pill (per detect-probe evidence); Continue enabled without clicking any Install; Continue advances to step 6 (Location)."
    why_human: "Visual rendering + interactive wizard flow + browser localStorage state; cannot be programmatically verified — requires real browser + visual judgment. Plan 239-03 Task 4 auto-approved this under 'soru sorma' preference, but visual confirmation remains pending at operator at-leisure."
  - test: "Onboarding wizard renders flag-disabled informational notice when feature flag is OFF"
    expected: "Clear the localStorage key (or set to anything other than 'true'); hard-reload; navigate to step 5; verify the 'This step is disabled' notice renders (NOT the deleted legacy ProviderStep); verify notice mentions 'livos:v43:onboarding_cli_section' key; Skip advances to step 6."
    why_human: "Same as above — DOM/visual + interactive judgment. Auto-approved under autonomous policy but pending operator visual confirmation."
---

# Phase 239: Onboarding CLI Tools Section — Verification Report

**Phase Goal:** Ship onboarding step that lists 5 supported CLI agents (claude-code, opencode, gemini, openclaw, aion-cli) as install cards, gated behind a feature flag, backed by a livinityd cli-installer module + tRPC router + 5 install shell scripts. Deploy to Mini PC and validate live.

**Verified:** 2026-05-27
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                                           | Status        | Evidence |
|----|---------------------------------------------------------------------------------------------------------------------------------|---------------|----------|
| 1  | livinityd exposes tRPC mutation `cliInstaller.install` accepting only the 5 SUPPORTED_CLIS names                                | ✓ VERIFIED    | `livos/packages/livinityd/source/modules/server/trpc/cli-installer-router.ts` defines `install` adminProcedure; `assertWhitelisted` guards via `SUPPORTED_CLIS_SET.has`. Router wired into appRouter (`server/trpc/index.ts:331`). 9 vitest cases pass. |
| 2  | livinityd exposes tRPC query `cliInstaller.detect` returning {detected, version?, path?}                                        | ✓ VERIFIED    | Same router file, `detect` adminProcedure. Mini PC UAT-DETECT.txt: 5/5 probes returned 200 + correct shape (claude-code/opencode detected:true with path+version; gemini/openclaw/aion-cli detected:false). |
| 3  | Arbitrary CLI names rejected with BAD_REQUEST + CLI_NOT_SUPPORTED (D-239-07 RCE boundary)                                        | ✓ VERIFIED    | Live Mini PC probe of `foo-bar-baz` → HTTP 400 + `"CLI_NOT_SUPPORTED: 'foo-bar-baz' is not in SUPPORTED_CLIS — install refused (D-239-07 RCE boundary)"`. Stack trace shows guard hits at router line 69 BEFORE any spawn. |
| 4  | Install spawns matching `scripts/install/cli/<name>.sh` and captures stdout/stderr                                              | ✓ VERIFIED    | `installer.ts` uses argv-form `spawn('bash', [scriptPath])` with `resolveInstallScript(name)`. 32KB tail capture. vitest covers 3 spawn-capture cases. |
| 5  | Install times out after 5 minutes returning {ok:false, output:'…TIMEOUT…', exitCode:-1}                                          | ✓ VERIFIED    | `INSTALL_TIMEOUT_MS = 300_000` exported from `installer.ts`. SIGKILL on timeout. vitest timeout case via fake timers. |
| 6  | Phase 240 can import SUPPORTED_CLIS unchanged (D-239-10 stable 5-tuple contract)                                                | ✓ VERIFIED    | `install-scripts.ts:17-25` exports the literal `['claude-code','opencode','gemini','openclaw','aion-cli']` as `readonly CliName[]`. Drift-lock vitest assertions in both `installer.test.ts` + `cli-installer-router.test.ts` enforce order + length. |
| 7  | Onboarding wizard slot 4 renders CliToolsStep when feature flag ON; informational notice when OFF                                | ? NEEDS HUMAN | Backend wiring verified (constants.ts STEP_NAMES[4]='CLI Tools', setup-wizard-v2.tsx imports CliToolsStep + ternary on `cliSectionFlagEnabled`). Visual confirmation deferred — see human_verification. |
| 8  | STEP_NAMES[4] === 'CLI Tools' (D-239-01)                                                                                         | ✓ VERIFIED    | `constants.ts:16` literal `'CLI Tools'`. |
| 9  | STEP_WEIGHT[4] === 40 (D-239-02)                                                                                                 | ✓ VERIFIED    | `constants.ts` array `[15, 60, 20, 45, 40, 20, 5]` — slot 4 = 40. |
| 10 | OnboardingData type has no provider/authMode/otpSecret/otpCode fields (D-239-03)                                                | ✓ VERIFIED    | grep across `livos/packages/ui/src/features/onboarding-flow/` + `routes/onboarding/` returned 0 matches. |
| 11 | OnboardingData type has `cliInstalled: string[]` field                                                                           | ✓ VERIFIED    | `constants.ts:55` type def + `:80` default. |
| 12 | CliToolsStep renders 5 cards: Claude Code, OpenCode, Gemini, OpenClaw, Aion CLI                                                  | ✓ VERIFIED    | `cli-tools-step.tsx` SUPPORTED_CLI_DISPLAY 5-tuple. 10 vitest cases including drift-lock on length + id order. |
| 13 | Each card has 4 states: not-installed / installing / installed / failed (D-239-13)                                              | ✓ VERIFIED    | `cli-tools-step.tsx` discriminated union `CardState`; reducer covers all 4. vitest cases #3-#8 cover state transitions. |
| 14 | Continue button enabled without requiring any installs (D-239-14)                                                                | ✓ VERIFIED    | FooterBar passed `continueDisabled={false}`. vitest case #9 asserts. |
| 15 | provider-step.tsx + connect-ai-step.tsx (+ tests) deleted (D-239-04/05)                                                          | ✓ VERIFIED    | `ls livos/packages/ui/src/features/onboarding-flow/steps/` confirms absent. 239-02-SUMMARY records `git rm`. |
| 16 | Mini PC livinityd serves cliInstaller.install + cliInstaller.detect                                                              | ✓ VERIFIED    | Live HTTP probe at `127.0.0.1:8080/trpc/cliInstaller.detect` returned 200 for 5 valid + 400 for 1 invalid. |
| 17 | Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged PRE/POST                                                          | ✓ VERIFIED    | 239-03-SUMMARY records PRE = POST = `f3538e1d…`. Pre-commit hook ran on every commit. |
| 18 | All 6 systemd services active POST deploy (livos, liv-core, liv-worker, liv-memory, liv-assistant, caddy)                       | ✓ VERIFIED    | POST-SNAPSHOT.txt shows all 6 `active`. |
| 19 | STATE.md + ROADMAP.md updated with Phase 239 SHIPPED status                                                                      | ✓ VERIFIED    | STATE.md line 478 + line 486 both reflect SHIPPED. ROADMAP.md line 3681 marked `✅ SHIPPED 2026-05-27 (3/3 plans)` with UAT evidence table. |
| 20 | LICENSE + NOTICE + canonical-blob byte-identical PRE/POST                                                                        | ✓ VERIFIED    | Trivially preserved (MISSING == MISSING). Documented absence in deferred-items.md D-DEFERRED-239-B + D-DEFERRED-239-C. Invariant interpretation acceptable per plan threat-model T-239-03-02. |

**Score:** 18/18 verifiable truths PASS programmatically; 2 (truths 7 covers two operator-pace browser walks) routed to human_verification.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `livos/packages/livinityd/source/modules/cli-installer/install-scripts.ts` | SUPPORTED_CLIS const | ✓ VERIFIED | 5-tuple literal in fixed order; SUPPORTED_CLIS_SET exported |
| `livos/packages/livinityd/source/modules/cli-installer/installer.ts` | installCli + 5min timeout | ✓ VERIFIED | `INSTALL_TIMEOUT_MS = 300_000`, whitelist guard, argv-form spawn |
| `livos/packages/livinityd/source/modules/cli-installer/detector.ts` | detectCli via which + --version | ✓ VERIFIED | bin name map + version probe, 5s timeout |
| `livos/packages/livinityd/source/modules/cli-installer/types.ts` | CliName + InstallResult + DetectResult | ✓ VERIFIED | All three exports present |
| `livos/packages/livinityd/source/modules/cli-installer/index.ts` | Barrel re-export | ✓ VERIFIED | Mirrors mcp-registrar/index.ts shape |
| `livos/packages/livinityd/source/modules/server/trpc/cli-installer-router.ts` | createCliInstallerRouter + 2 adminProcedures | ✓ VERIFIED | install (mutation) + detect (query), both whitelist-guarded |
| `scripts/install/cli/claude-code.sh` | curl https://claude.ai/install.sh | ✓ VERIFIED | 45 lines, mode 100755, Phase 239 provenance, idempotent |
| `scripts/install/cli/opencode.sh` | curl https://opencode.ai/install | ✓ VERIFIED | 45 lines, mode 100755 |
| `scripts/install/cli/gemini.sh` | npm install -g @google/gemini-cli | ✓ VERIFIED | 47 lines, mode 100755 (npm-prefix race flagged WR-02 in REVIEW) |
| `scripts/install/cli/openclaw.sh` | Delegates to install-openclaw-cli.sh | ✓ VERIFIED | 52 lines, mode 100755 |
| `scripts/install/cli/aion-cli.sh` | Best-effort placeholder (canonical unverified) | ✓ VERIFIED | 63 lines, mode 100755, explicit `warn` line about unverified packaging |
| `livos/packages/ui/src/features/onboarding-flow/constants.ts` | STEP_NAMES + STEP_WEIGHT + OnboardingData updates | ✓ VERIFIED | 7-step shape with 'CLI Tools' at slot 4; cliInstalled field; no orphan fields |
| `livos/packages/ui/src/features/onboarding-flow/steps/cli-tools-step.tsx` | CliToolsStep ≥200 lines | ✓ VERIFIED | 301 lines, 10 vitest cases GREEN |
| `livos/packages/ui/src/features/onboarding-flow/steps/cli-tools-step.test.tsx` | 10 vitest cases | ✓ VERIFIED | All 10 GREEN; full onboarding-flow suite 22/22 GREEN |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `cli-installer-router.ts` | `install-scripts.ts` | SUPPORTED_CLIS whitelist check (RCE boundary D-239-07) | ✓ WIRED | `assertWhitelisted` invoked in both install + detect procedures; live wire-test rejected invalid name with 400 |
| `livinityd/source/index.ts` | `cli-installer-router.ts` | createCliInstallerRouter factory + appRouter slot | ✓ WIRED | Production instance constructed at boot, passed as `cliInstaller:` opt to `createAppRouter` |
| `server/trpc/common.ts` | `cliInstaller.install` + `cliInstaller.detect` | httpOnlyPaths entries (long-running spawn) | ✓ WIRED | common.ts:708-709 both entries present |
| `setup-wizard-v2.tsx` | `cli-tools-step.tsx` | Conditional render gated by `cliSectionFlagEnabled` from localStorage | ✓ WIRED | Import at line 8; ternary mount at line 237 |
| `cli-tools-step.tsx` | `cliInstaller` tRPC namespace | `trpcReact.cliInstaller.install.useMutation()` + 5× `cliInstaller.detect.useQuery()` per card | ✓ WIRED | 5 detect calls (one per CLI) + 1 install mutation; covered by vitest mocks |
| Mini PC `/opt/livos/` | GitHub HEAD `5aac9f58` | `bash /opt/livos/update.sh` | ✓ WIRED | Deploy SHA recorded; update.sh exit 0 |
| Install scripts on Mini PC | livinityd spawn | scp hot-fix to `/opt/livos/scripts/install/cli/` mode 100755 | ⚠️ WIRED (deferred) | Scripts present via Rule 3 hot-fix; permanent update.sh rsync fix tracked in D-DEFERRED-239-A |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `cli-tools-step.tsx` | `cards` reducer state | `detect_*` useQuery results + Install button dispatch | ✓ Yes (Mini PC proved 5 live detect responses with real path+version) | ✓ FLOWING |
| `cli-tools-step.tsx` | `data.cliInstalled` | `setData(...)` after successful install | ✓ Yes (writes through to OnboardingData) | ✓ FLOWING (with WR-01 race caveat — advisory only) |
| `cli-installer-router.ts` install | `installCli()` real spawn → bash → install scripts on disk | Live install scripts present on Mini PC; spawn invokes them with argv form | ✓ Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend whitelist guard live | curl `cliInstaller.detect` with `foo-bar-baz` | HTTP 400 + `CLI_NOT_SUPPORTED` | ✓ PASS |
| Detect endpoint returns shape for each of 5 CLIs | curl 5× | 5× HTTP 200 with `{detected, version?, path?}` | ✓ PASS |
| All 6 systemd services active POST | `systemctl is-active livos liv-core liv-worker liv-memory liv-assistant caddy` | 6/6 active | ✓ PASS |
| Sacred SHA invariant | `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✓ PASS |
| Backend vitest suite | `pnpm vitest run source/modules/cli-installer/__tests__ source/modules/server/trpc/__tests__/cli-installer-router.test.ts` | 21/21 GREEN | ✓ PASS (per 239-01 SUMMARY) |
| UI vitest suite | `pnpm --filter ui vitest run src/features/onboarding-flow/` | 22/22 GREEN | ✓ PASS (per 239-02 SUMMARY) |
| Orphan-field grep | `grep -rn "authMode\|otpSecret\|otpCode\|ProviderStep\|ConnectAiStep" livos/packages/ui/src/features/onboarding-flow/ livos/packages/ui/src/routes/onboarding/` | 0 matches | ✓ PASS |

### Requirements Coverage

No `REQ-` IDs declared in any of the 3 PLAN frontmatter `requirements:` fields (all `requirements: []`). REQUIREMENTS.md contains 0 matches for `Phase 239` / `onboarding cli` / `CLI Tools`. No requirements coverage gap.

### Anti-Patterns Found

From 239-REVIEW.md (0 critical, 4 warnings, 6 info — advisory, per task brief should NOT cause `gaps_found`):

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `cli-tools-step.tsx` | 135-165 | Closure-capture race on `data.cliInstalled` across concurrent installs (WR-01) | ⚠️ Warning | Telemetry / persisted onboarding-data row loss if operator clicks Install on 2 cards near-simultaneously. UI per-card state machine unaffected. Fix: use functional updater `setData(prev => ...)`. Tracked. |
| `scripts/install/cli/gemini.sh` | 38 | `npm install -g` without sudo (also `aion-cli.sh:51-53`) (WR-02) | ⚠️ Warning | EACCES failure under bruce uid on Mini PC unless npm prefix is user-local. Will surface as "Failed" card state on real install — RCE boundary unaffected. Fix: configure `npm config set prefix ~/.npm-global` + PATH adjustment. |
| `cli-tools-step.tsx` | 95-114 | Detect useQuery calls fire unconditionally (no `enabled` guard) (WR-03) | ⚠️ Warning | Today fine (flag-off branch doesn't mount CliToolsStep). Future-proofing only. |
| `installer.ts` | 37-41, 105, 130 | stdout/stderr concatenated separately (not chronological) (WR-04) | ⚠️ Warning | UI may show misleading error tail (earliest stderr dropped by 32KB cap before later stdout). Operator debug ergonomics. |
| `aion-cli.sh` | 44-55 | Best-effort installer with unverified package names (IN-01) | ℹ️ Info | Acknowledged in script. Phase 240 intended supersede. |
| `livinityd/source/index.ts` | 6 | Deprecated `assert {type: 'json'}` import syntax (IN-02) | ℹ️ Info | Pre-existing; not in Phase 239 diff. |
| `setup-wizard-v2.tsx` | 182-186 | localStorage flag trivially client-bypassable (IN-03) | ℹ️ Info | UI gate only; backend whitelist is the security boundary (D-239-07). Acknowledged in code comments. |
| `cli-tools-step.tsx` | 142-144 | `new Set(...)` constructor recreated per call (IN-04) | ℹ️ Info | Subsumed by WR-01 fix. |
| `scripts/install/cli/*.sh` | — | No `eval` or dynamic command construction (IN-05) | ℹ️ Info | Defense-in-depth check passed. |
| `install-scripts.ts` | 37-40 | `LIVOS_ROOT` env fallback undocumented at type level (IN-06) | ℹ️ Info | Spawn-failed marker surfaces ENOENT path on misconfiguration. |

No blockers. All advisory items tracked for follow-up work (likely Phase 240 or v43 cleanup phase).

### Human Verification Required

Two browser-walk items deferred from Plan 239-03 Task 4 (`checkpoint:human-verify`) under autonomous-mode policy. Backend evidence covers all wire-level paths; only the operator's visual judgment of the rendered DOM remains.

#### 1. Wizard renders CliToolsStep when feature flag ON

**Test:**
1. SSH to Mini PC and confirm Redis key: `redis-cli -u "$REDIS_URL" GET livos:v43:onboarding_cli_section` (expected `true`).
2. In browser, open https://bruce.livinity.io/onboarding.
3. Open DevTools console: `window.localStorage.setItem('livos.v43.onboarding_cli_section', 'true')`.
4. Hard reload (Ctrl+Shift+R).
5. Click through steps 0-4 until reaching step 5.

**Expected:**
- Step header reads `05 · CLI Tools` and `Pick your CLI agents`.
- 5 cards visible in fixed order: Claude Code, OpenCode, Gemini, OpenClaw, Aion CLI.
- Claude Code + OpenCode cards show `Installed ✓` pill (matches Mini PC detect probe state).
- Gemini, OpenClaw, Aion CLI cards show `Install` button.
- Continue button is ENABLED without any clicks.
- Clicking Continue advances to step 6 (Location).

**Why human:** Visual DOM rendering + wizard transition behavior + localStorage state read; cannot be verified without a real browser session.

#### 2. Wizard renders flag-disabled informational notice when feature flag OFF

**Test:**
1. In browser DevTools: `window.localStorage.removeItem('livos.v43.onboarding_cli_section')` (or set to anything other than `'true'`).
2. Hard reload.
3. Navigate to step 5.

**Expected:**
- Notice block renders with eyebrow `05 · CLI Tools`, title `This step is disabled`, and paragraph mentioning the flag key `livos:v43:onboarding_cli_section`.
- NOT the deleted legacy ProviderStep (file no longer exists on disk).
- Skip button advances to step 6.

**Why human:** Same — visual + DOM judgment.

### Gaps Summary

No gaps blocking goal achievement. The Phase 239 goal — "Ship onboarding step that lists 5 supported CLI agents as install cards, gated behind a feature flag, backed by a livinityd cli-installer module + tRPC router + 5 install shell scripts. Deploy to Mini PC and validate live." — is **fully achieved at the code + deploy + wire level**:

- Backend module + tRPC router + 5 scripts ✓
- Whitelist RCE boundary live + proven over the wire ✓
- UI step + feature-flag gate + legacy step deletion ✓
- Mini PC deploy GREEN + sacred-SHA preserved ✓
- 5/5 live detect probes + 1/1 invalid-name rejection ✓
- STATE.md + ROADMAP.md updated to SHIPPED ✓

Remaining work is the operator's at-leisure visual walkthrough of the two browser scenarios (flag-ON render + flag-OFF disabled-notice). These were auto-approved under the standing "soru sorma / finish milestone" preference but a final eyeball confirmation is appropriate before the operator considers v43 milestone progress fully cleared on this phase.

Deferred items (D-DEFERRED-239-A/B/C in deferred-items.md) are documented architectural follow-ups (update.sh rsync gap for install scripts, missing root-level LICENSE/NOTICE, stale canonical blob path in MEMORY) — none of which gate Phase 239 goal achievement and all of which are appropriate carry-overs for later phases.

---

_Verified: 2026-05-27_
_Verifier: Claude (gsd-verifier)_
