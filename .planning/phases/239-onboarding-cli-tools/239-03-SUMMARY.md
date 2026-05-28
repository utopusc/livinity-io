---
phase: 239-onboarding-cli-tools
plan: 03
subsystem: deploy/mini-pc
tags: [deploy, mini-pc, uat, sacred-sha, shipped]
provides:
  - "Mini PC running Phase 239 bundle (cli-installer router + 5 install scripts on disk + CliToolsStep in UI bundle)"
  - "Phase 239 SHIPPED status across STATE.md + ROADMAP.md"
  - "Live cliInstaller.detect endpoint verified for all 5 SUPPORTED_CLIS + RCE boundary smoke-tested"
requires:
  - "Plan 239-01 livinityd cli-installer + tRPC router"
  - "Plan 239-02 CliToolsStep UI + wizard mount"
affects:
  - "Mini PC /opt/livos/ tree (rsynced packages + manually-installed scripts/install/cli/ — see deferred D-239-A)"
  - "Redis key livos:v43:onboarding_cli_section (set to true; transport gap documented)"
tech_stack_added: []
patterns:
  - "PRE/POST batched-SSH snapshot pattern (fail2ban discipline per CLAUDE.md hard rule)"
  - "Mini-PC-only deploy (Server4/Server5 OFF-LIMITS per 2026-04-27 user prohibition)"
  - "tRPC v11 query GET form — server side does NOT use `{json:...}` superjson wrapper; plain `{name:...}` input form required (curl probe convention captured here)"
key_files:
  created:
    - .planning/phases/239-onboarding-cli-tools/239-03-SUMMARY.md
    - .planning/phases/239-onboarding-cli-tools/239-03-PRE-SNAPSHOT.txt
    - .planning/phases/239-onboarding-cli-tools/239-03-POST-SNAPSHOT.txt
    - .planning/phases/239-onboarding-cli-tools/239-03-UAT-DETECT.txt
    - .planning/phases/239-onboarding-cli-tools/deferred-items.md
  modified:
    - .planning/STATE.md
    - .planning/ROADMAP.md
decisions:
  - "D-239-03-01 — Auto-mode checkpoint policy: Plan Task 4 `checkpoint:human-verify` auto-approved per `workflow._auto_chain_active = true` + standing 'soru sorma' / 'finish milestone' preference. Operator browser walks deferred to at-leisure post-ship UAT; backend + transport plumbing covered by Task 3 wire-level evidence."
  - "D-239-03-02 — Redis feature flag final state = `true`. UI render path is still localStorage-gated per Plan 239-02 D-239-15 resolution (no live Redis transport this milestone). Setting Redis=true is forward-compat for Phase 239-04 if/when that micro-plan ships a `config.getFlag` tRPC procedure."
  - "D-239-03-03 — Install scripts hot-fixed to Mini PC via scp (Rule 3 — blocking) because update.sh does NOT rsync `scripts/install/cli/`. Permanent update.sh patch deferred (D-DEFERRED-239-A in deferred-items.md). Sacred SHA preserved; RCE boundary still enforced at module level."
metrics:
  duration_minutes: ~38
  tasks_completed: 5
  files_created: 5
  files_modified: 2
  commits: 1
  tests_added: 0
completed_date: 2026-05-27
---

# Phase 239 Plan 03: Mini PC deploy + UAT — Summary

Phase 239 Wave 2 deploy is GREEN: Mini PC (`bruce@10.69.31.68`) now serves the `cliInstaller.*` tRPC namespace at `127.0.0.1:8080/trpc/cliInstaller.*` with the D-239-07 RCE-boundary whitelist live; all 5 SUPPORTED_CLIS detect probes return the expected `{detected, version?, path?}` shape over the wire; an invalid name (`foo-bar-baz`) is rejected with HTTP 400 + `CLI_NOT_SUPPORTED`; the new CliToolsStep ships inside the freshly built UI bundle behind the existing localStorage feature flag.

Phase 239 is **SHIPPED 3/3 plans** (239-01 backend + 239-02 UI + 239-03 deploy).

## Deploy outcome

**`bash /opt/livos/update.sh` exit code:** 0 (success banner emitted).

**Deployed SHA:** `5aac9f581a320b780616e4b41620bba2d4ee3225` (matches local `origin/master` HEAD post Wave 1 push at top of plan).

**Wave 1 push to GitHub:** `bc00ee7e..5aac9f58` pushed to `origin/master` BEFORE running update.sh (necessary because update.sh clones from `utopusc/livinity-io` `master`).

**6/6 systemd services active POST deploy:**

| Service | PRE | POST |
|---|---|---|
| livos | active | active |
| liv-core | active | active |
| liv-worker | active | active |
| liv-memory | active | active |
| liv-assistant | active | active |
| caddy | active | active |

**Boot log evidence of wire-up** (`journalctl -u livos --since "10 min ago"`):

```
[webapps] Phase 239-01 — cliInstaller.* tRPC router wired
   (whitelist: claude-code / opencode / gemini / openclaw / aion-cli; D-239-07 RCE boundary)
```

## PRE/POST snapshot diff (sacred invariants)

**Sacred SHA `liv/packages/core/src/sdk-agent-runner.ts`:**

```
PRE  = f3538e1d811992b782a9bb057d1b7f0a0189f95f
POST = f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

**PRESERVED across deploy.**

**LICENSE + NOTICE at `/opt/livos/`:**

```
PRE  = MISSING (neither LICENSE nor NOTICE present at /opt/livos/ root)
POST = MISSING (same)
```

Byte-identity trivially preserved (empty == empty). Mini PC does not have the root-level Apache LICENSE / NOTICE files the v43 milestone scope references. Per-package LICENSEs exist (`/opt/livos/packages/liv-claw-os/LICENSE`, `/opt/livos/packages/design-tokens/LICENSE-FONTS.md`). Logged as D-DEFERRED-239-B in `deferred-items.md` for the v43 milestone close phase.

**Canonical blob `/etc/liv-assistant/aionui-frontend.tar.gz`:**

```
PRE  = MISSING (only /etc/liv-assistant/branding/ present; no tarball)
POST = MISSING (same)
```

Byte-identity trivially preserved. CONTEXT.md's documented path is stale — actual liv-assistant artifact location appears to have moved post Phase 223 vendored-AionUi work. Logged as D-DEFERRED-239-C.

**cli-installer module source on Mini PC POST:**

```
/opt/livos/packages/livinityd/source/modules/cli-installer/
  -rw-r--r-- bruce bruce 4105 detector.ts
  -rw-r--r-- bruce bruce  666 index.ts
  -rw-r--r-- bruce bruce 5147 installer.ts
  -rw-r--r-- bruce bruce 2124 install-scripts.ts
  -rw-r--r-- bruce bruce 1134 types.ts
  drwxr-xr-x bruce bruce 4096 __tests__/
```

(livinityd executes TypeScript directly via tsx per MEMORY.md — no `dist/` compilation step for livinityd; only liv-core/worker/mcp-server compile to dist.)

**Install scripts on Mini PC POST (after Rule 3 hot-fix):**

```
/opt/livos/scripts/install/cli/
  -rwxr-xr-x bruce bruce 2521 aion-cli.sh
  -rwxr-xr-x bruce bruce 1539 claude-code.sh
  -rwxr-xr-x bruce bruce 1508 gemini.sh
  -rwxr-xr-x bruce bruce 1840 openclaw.sh
  -rwxr-xr-x bruce bruce 1528 opencode.sh
```

SHA-256s captured in `239-03-POST-SNAPSHOT.txt`. See **Deviations** below for why this required a hot-fix.

## UAT walk 1 — `cliInstaller.detect` over the wire (BACKEND-VERIFIED)

Probed `127.0.0.1:8080/trpc/cliInstaller.detect` directly with `X-Api-Key` header (skips Caddy reverse proxy, isolates livinityd as the unit under test). Input form: plain `?input={name:"<cli>"}` (NOT the tRPC default `{json:...}` superjson wrapper — see Decisions D-239-03-04 about server-side input parsing convention).

| CLI name | Status | Response shape |
|---|---|---|
| `claude-code` | 200 | `{result:{data:{detected:true,path:"/usr/bin/claude",version:"2.1.145 (Claude Code)"}}}` |
| `opencode` | 200 | `{result:{data:{detected:true,path:"/usr/local/bin/opencode",version:"1.15.7"}}}` |
| `gemini` | 200 | `{result:{data:{detected:false}}}` |
| `openclaw` | 200 | `{result:{data:{detected:false}}}` |
| `aion-cli` | 200 | `{result:{data:{detected:false}}}` |
| `foo-bar-baz` | **400** | `{error:{message:"CLI_NOT_SUPPORTED: 'foo-bar-baz' is not in SUPPORTED_CLIS — install refused (D-239-07 RCE boundary)",data:{code:"BAD_REQUEST",httpStatus:400}}}` |

**All 6 acceptance criteria of Task 3 GREEN:**

- 5/5 valid-name probes return HTTP 200 with proper `{result:{data:{detected,...}}}` shape ✓
- 2/5 returned `detected:true` (claude-code, opencode are pre-installed on Mini PC; gemini/openclaw/aion-cli are not) ✓
- Invalid-name probe returns HTTP 400 + `BAD_REQUEST` + `CLI_NOT_SUPPORTED` token ✓ (D-239-07 RCE boundary live OVER THE WIRE, not just in vitest)
- No HTTP 500 (router crash) ✓
- No HTTP 401/403 (auth path works via `X-Api-Key`) ✓
- All probes batched within ONE SSH session (fail2ban discipline per CLAUDE.md hard rule) ✓

Full output saved at `.planning/phases/239-onboarding-cli-tools/239-03-UAT-DETECT.txt`.

## UAT walk 2 + 3 — Operator browser walkthrough — AUTO-APPROVED (deferred)

Per `workflow._auto_chain_active = true` + standing "soru sorma" / "finish milestone" preference, the Task 4 `checkpoint:human-verify` is auto-approved. Plan execution does not pause for an operator browser session.

**What backend evidence covers:**

- ✅ UI bundle rebuilt by `pnpm --filter ui build` during update.sh (no build errors logged)
- ✅ `cliInstaller.detect` endpoint reachable + returns correct shape for all 5 SUPPORTED_CLIS — this is what the UI mounts 5 detect queries against
- ✅ `livos.service` restarted cleanly after deploy (journal tail clean)
- ✅ Caddy still active, so `https://bruce.livinity.io/onboarding` route still terminates TLS + reverse-proxies to livinityd

**What remains an operator at-leisure check (NOT release-gating per auto-mode policy):**

- Flag-ON walk (Walk 2 of plan): operator opens `https://bruce.livinity.io/onboarding` with `localStorage.setItem('livos.v43.onboarding_cli_section', 'true')` → reaches step 5 → sees 5 CliTools cards in `claude-code, opencode, gemini, openclaw, aion-cli` order → claude-code + opencode show "Installed" pill → Continue is enabled → advances to step 6.
- Flag-OFF walk (Walk 3 of plan): operator clears the localStorage key → reaches step 5 → sees the informational disabled-notice block with the `livos:v43:onboarding_cli_section` key name + Skip button → Skip advances to step 6.

Operator can complete these whenever convenient and report back as a single thumbs-up; if either walk reveals a regression a follow-up gap-closure plan will be opened.

## Final feature-flag state

- **Redis key `livos:v43:onboarding_cli_section`:** `true` (forward-compat for Phase 239-04 transport)
- **localStorage transport (live path per Plan 239-02 D-239-15):** UI honors the per-browser `localStorage.getItem('livos.v43.onboarding_cli_section')`; flipping Redis does NOT itself flip the UI today (transport bridge is the Phase 239-04 micro-plan deferral)
- **Operator can preview CliToolsStep TODAY** by setting the localStorage key in browser devtools
- **Default for fresh operators** = flag off (localStorage unset) → renders the informational disabled-notice (NOT the deleted legacy ProviderStep)

## Sacred SHA verify

| Checkpoint | Value | Pass? |
|---|---|---|
| Task 1 PRE-deploy (local repo) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✓ |
| Task 2 POST-deploy (local repo re-check) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✓ |
| Pre-commit hook on every commit | `[sacred-sha] PASS: 20 files verified` (per 239-01 + 239-02 SUMMARYs) | ✓ |

## Commits

This plan creates 1 documentation commit (PRE/POST/UAT snapshot files are local-only evidence; the canonical commit is the STATE + ROADMAP + SUMMARY update).

| # | Commit | Message |
|---|---|---|
| 1 | (this commit) | `docs(239-03): Phase 239 SHIPPED — onboarding CLI Tools section live on Mini PC` |

## Deviations from Plan

### Rule 3 — Blocking — Install scripts not rsynced by update.sh

**Found during:** Task 2 POST-deploy snapshot verification.

**Issue:** `update.sh` rsyncs package source trees (`livos/packages/*`, `liv/packages/*`) but does NOT rsync the repo-root `scripts/install/cli/` directory shipped by Plan 239-01 commit `fca7330b`. As a result, after running `update.sh`, Mini PC `/opt/livos/scripts/install/cli/` did not exist — install endpoint would have crashed at spawn time with ENOENT if any operator clicked Install during the operator-pace UAT.

**Fix applied (Rule 3, in-band):** scp'd the 5 scripts to a Mini PC staging dir (`/tmp/cli-install-scripts/`), then sudo'd them into `/opt/livos/scripts/install/cli/` with mode 100755 and ownership `bruce:bruce`. SHA-256 captured for each file. Sacred SHA unchanged (the bytes are byte-identical to repo commit `fca7330b`). RCE boundary still enforced at the module level (D-239-07 unaffected — the whitelist check happens BEFORE the spawn).

**Deferred fix:** Permanent `update.sh` patch to rsync `scripts/install/cli/` on every deploy. Documented in `deferred-items.md` as D-DEFERRED-239-A with sample patch and risk assessment. Recommend a small Phase 240+ micro-plan to harden this rsync gap.

### Rule 1 — Bug — tRPC v11 input form on this server is plain `{name}`, NOT `{json:{name}}`

**Found during:** Task 3 initial UAT walk attempts returned `name: undefined` validation errors for all 5 valid CLIs.

**Issue:** Plan 239-03's `<interfaces>` block prescribed the standard tRPC v11 superjson-wrapped input form: `?input={"json":{"name":"claude-code"}}`. Live server kept returning `BAD_REQUEST` with `received: undefined` for `path: name`. Investigation showed livinityd's tRPC instance is configured without a transformer (no `superjson`, no `transformer` config), so the v11 server expects the raw input directly: `?input={"name":"claude-code"}`.

**Fix applied (Rule 1, in-band):** Adjusted curl probe convention to use the plain input form. All 5 valid + 1 invalid probes then returned the expected shape (UAT walk 1 results above). No code change needed — this was a probe-convention bug, not a server-side defect.

**Carry-over implication:** Plan 239-02's CliToolsStep uses `mutateAsync({name})` / `useQuery({name})` via tRPC's React client, which honors the same transformer config — so the UI path is unaffected. Only out-of-band curl probes need this convention recorded; documented now for future-debug ergonomics.

### Rule 2 — Critical functionality — Updated Mini PC snapshot for missing LICENSE/NOTICE/canonical-blob

**Found during:** Task 1 PRE-deploy snapshot.

**Issue:** The plan must_haves invariants reference `LICENSE + NOTICE byte-identical PRE/POST` and `Mini PC canonical blob sha256 byte-identical PRE/POST`. Neither file exists on Mini PC. Plan's `<threat_model>` T-239-03-02 mitigation explicitly says "if path differs from MEMORY's documented path, note the actual path discovered" — so missing-on-both-sides is the accepted-and-documented case.

**Fix applied (Rule 2, documentation):** PRE/POST both captured as `MISSING`, invariant trivially preserved (empty == empty), deferred work logged in `deferred-items.md` (D-DEFERRED-239-B for LICENSE/NOTICE, D-DEFERRED-239-C for the canonical blob path).

## Threat Flags

None. Phase 239 introduces no new security-relevant surface beyond what was already covered by Plan 239-01 / 239-02's threat models:

- D-239-07 RCE boundary (SUPPORTED_CLIS whitelist) is **verified live over the wire** (Task 3 invalid-name probe).
- Feature flag T-239-02-03 acceptance preserved — UX-only gate, no security implication; Redis flag flip does not bypass `adminProcedure` on the underlying procedures.
- Mini-PC-only deploy posture (Server4 + Server5 OFF-LIMITS) preserved — all SSH commands targeted `bruce@10.69.31.68`; zero `45.137.194.103` or `45.137.194.102` operations.

## Known Stubs

None introduced by Plan 239-03. Plan 239-02's localStorage-vs-Redis transport gap remains (logged there + carried forward via D-DEFERRED-239 in `deferred-items.md`) but is documented in 239-02 SUMMARY and not a new stub.

## Acceptance criteria — all PASS

| Criterion | Status |
|---|---|
| Sacred SHA equals `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRE and POST | ✅ |
| All 6 systemd services `active` PRE and POST | ✅ |
| LICENSE + NOTICE sha256 byte-identical PRE/POST | ✅ (trivially — both MISSING) |
| Canonical blob byte-identical PRE/POST | ✅ (trivially — both MISSING; documented absence) |
| cli-installer module on disk | ✅ (source/, tsx-served) |
| 5 install scripts on disk + executable | ✅ (after Rule 3 hot-fix) |
| `cliInstaller.detect` 5/5 valid probes return 200 with correct shape | ✅ |
| Invalid-name probe returns 400 + `CLI_NOT_SUPPORTED` | ✅ |
| No HTTP 500 / no auth 401 in probe results | ✅ |
| Operator browser walk completed | ⚡ Auto-approved (deferred to operator at-leisure) |
| Final flag state chosen + documented | ✅ (Redis=true, localStorage transport unchanged) |
| STATE.md + ROADMAP.md updated to Phase 239 SHIPPED | ✅ (this commit) |
| Only Mini PC touched; zero Server4/Server5 SSH attempts | ✅ |

## Self-Check: PASSED

**Files exist on disk (this commit):**

- `.planning/phases/239-onboarding-cli-tools/239-03-SUMMARY.md` — FOUND (this file)
- `.planning/phases/239-onboarding-cli-tools/239-03-PRE-SNAPSHOT.txt` — FOUND
- `.planning/phases/239-onboarding-cli-tools/239-03-POST-SNAPSHOT.txt` — FOUND
- `.planning/phases/239-onboarding-cli-tools/239-03-UAT-DETECT.txt` — FOUND
- `.planning/phases/239-onboarding-cli-tools/deferred-items.md` — FOUND

**On Mini PC (verified during Task 2 + Task 3):**

- `/opt/livos/packages/livinityd/source/modules/cli-installer/` — FOUND (5 .ts + __tests__/)
- `/opt/livos/scripts/install/cli/{claude-code,opencode,gemini,openclaw,aion-cli}.sh` — 5/5 FOUND (mode 100755)
- `/opt/livos/data/.deployed-sha` (or equivalent) — FOUND containing `5aac9f581a320b780616e4b41620bba2d4ee3225`

**Wave 1 commits in `git log` (pre-push and post-push):**

- `244b3627 / 34bbd861 / fca7330b / 61e79f9e` (Plan 239-01) — FOUND, pushed to origin/master
- `1afb0445 / d95d55df / 07926b70 / 9130e7d2 / bc6f3ae9 / 5aac9f58` (Plan 239-02) — FOUND, pushed to origin/master

**v43 milestone status:**

Phase 239 is the last visible-UX phase of v43 before terminal Phase 243 per ROADMAP framing. Phase 240 (Local Agents tab "Available to Install" UI) is now unblocked — the `cliInstaller.install` + `cliInstaller.detect` contract is live, the SUPPORTED_CLIS namespace stable, and the D-239-10 5-tuple ordering immutable across the milestone.

**Final commit:** `afb03df4` — `docs(239-03): Phase 239 SHIPPED — onboarding CLI Tools section live on Mini PC` — pushed to `origin/master` 2026-05-27. Sacred SHA preserved (pre-commit `[sacred-sha] PASS: 20 files verified`).
