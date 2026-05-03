---
phase: 60-public-endpoint-rate-limit
plan: 02
subsystem: infra
tags: [server5, caddy, xcaddy, caddy-ratelimit, caddy-dns-cloudflare, binary-swap, docker-build, production-adjacent]

requires:
  - phase: 60-public-endpoint-rate-limit
    provides: "60-01 Wave 0 verdict Q5 → 'NEITHER xcaddy nor Go on Server5' → build location decision = local dev box (Path L). Wave 0 also corrected memory drift: existing /usr/bin/caddy DOES NOT have caddy-dns/cloudflare module loaded (despite reference_minipc.md saying it does), so Wave 1 must include it in the build."
provides:
  - "Server5 /usr/bin/caddy replaced with custom-built v2.11.2 binary (47227042 bytes, md5 1acb51e83065e220be74cf49e2378bc8) carrying http.handlers.rate_limit (mholt/caddy-ratelimit) AND dns.providers.cloudflare (caddy-dns/cloudflare) modules"
  - "Pre-swap binary preserved at /usr/bin/caddy.bak.20260503-070012 (47493282 bytes, md5 f08247f4080ae66214a987b9bac886aa) — single-command rollback target"
  - "Module diff proof: ZERO deletions; only ADDITIONS = `dns.providers.cloudflare` + `http.handlers.rate_limit` + 'Non-standard modules: 2' header (5 added lines total at line 132 of list-modules output)"
  - "Caddyfile validation against new binary: PASS (`Valid configuration`); 6 production blocks parsed including api-less Wave 0 baseline"
  - "Smoke regression: livinity.io HTTP/2 200 (pre) → HTTP/2 200 (post — UNCHANGED); relay.livinity.io HTTP/2 503 (pre) → HTTP/2 503 (post — UNCHANGED, pre-existing issue per Wave 0 §Notes 3)"
  - "Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at task start AND end"
  - "Documented rollback runbook for Wave 4 / future incident"
affects: [60-03 (Wave 2 — relay api.livinity.io routing), 60-04 (Wave 3 — Caddyfile rate_limit directive add — REQUIRES this binary), 60-05 (Wave 4 — smoke battery), Phase 60 final deploy runbook]

tech-stack:
  added:
    - "Custom Caddy v2.11.2 binary (out-of-tree on Server5 only) with mholt/caddy-ratelimit + caddy-dns/cloudflare modules"
  patterns:
    - "Local-Docker-build → scp → single-batched-ssh swap+verify pattern: 1 docker run + 1 scp + 1 ssh = 3 remote actions total (fail2ban-conservative for Server5)"
    - "Binary swap discipline: cp current → /usr/bin/caddy.bak.<TS> BEFORE install; md5 verify swap matches built binary; validate Caddyfile against new binary BEFORE systemctl restart"
    - "Module-diff abort gate: ANY deletions in `diff before.txt after.txt | grep '^<'` aborts swap (rebuild dropping a module = rollback target lost)"

key-files:
  created:
    - .planning/phases/60-public-endpoint-rate-limit/60-02-SUMMARY.md
    - "/usr/bin/caddy.bak.20260503-070012 (Server5 — out-of-tree)"
    - "/tmp/caddy-build/caddy-custom (local dev box build artifact, 47227042 bytes)"
    - "/tmp/server5-build.txt (local; 100-line verbatim ssh batch transcript)"
  modified:
    - "/usr/bin/caddy (Server5 — out-of-tree, REPLACED with custom build)"

key-decisions:
  - "Build location = Path L (local Docker via `caddy:builder` image) — Wave 0 Q5 verdict. Docker Desktop on Windows dev box autostarted; build completed in ~16s after dependency download (~70s total wall)."
  - "Build command (verbatim): `xcaddy build v2.11.2 --with github.com/caddy-dns/cloudflare --with github.com/mholt/caddy-ratelimit --output /output/caddy-custom` inside `caddy:builder` container with `-v $(pwd -W):/output`. MSYS_NO_PATHCONV=1 + `//output` prefix needed to bypass git-bash path translation."
  - "Caddyfile validate gate added BEFORE swap (Step 6b — not in plan but RESEARCH.md Pitfall 2 implication). New binary parsed `/etc/caddy/Caddyfile` cleanly; would have aborted swap on any directive incompatibility."
  - "Both modules confirmed in AFTER list: `dns.providers.cloudflare` + `http.handlers.rate_limit`. AFTER has 136 lines vs BEFORE 131 (+5 = 1 blank + module name + module name + 1 blank + 'Non-standard modules: 2')."
  - "md5 round-trip verified: built `/tmp/caddy-build/caddy-custom` = uploaded `/tmp/caddy-custom` on Server5 = installed `/usr/bin/caddy` = `1acb51e83065e220be74cf49e2378bc8`. Backup at `/usr/bin/caddy.bak.20260503-070012` retains the prior `f08247f4080ae66214a987b9bac886aa` md5."
  - "Plan automated-verify expects `USING_XCADDY=` token (Path A only). Path L doesn't emit it. Functional gates (DELETION_COUNT=0, both module greps, BACKUP path, sacred SHA) all pass. Documented as Path-L variant — not a deviation, plan explicitly branches Path A vs Path L."

patterns-established:
  - "Pattern: caddy:builder Docker image as zero-install xcaddy — produces Linux ELF binary on a Windows dev box without WSL/Go/xcaddy local install. ~47MB output; cross-builds clean for Server5."
  - "Pattern: pre-swap Caddyfile validation against the new binary as last sanity gate before `systemctl restart` (Step 6b). Catches plugin-introduced directive parser changes early; rollback-cheaper than post-restart failure."
  - "Pattern: single-batch ssh transcript discipline — 1 ssh invocation captures 10 named steps (pre-flight smoke / verify upload / before modules / after modules / module diff / Caddyfile validate / backup+swap / restart / post-modules / post-flight smoke), output redirected to a local .txt for fixture-style review."

requirements-completed: [FR-BROKER-B2-02]

duration: ~12 min
completed: 2026-05-03
---

# Phase 60 Plan 02: Wave 1 — Caddy Custom Build + Binary Swap Summary

**Server5 `/usr/bin/caddy` replaced with locally-Docker-built Caddy v2.11.2 carrying `mholt/caddy-ratelimit` + `caddy-dns/cloudflare` modules (DELETION_COUNT=0); pre-swap binary preserved as one-command rollback at `/usr/bin/caddy.bak.20260503-070012`; livinity.io smoke regression PASS (200→200); sacred file SHA byte-identical.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-03T04:55:00Z (sacred SHA assertion + Docker startup)
- **Completed:** 2026-05-03T05:01:00Z (post-swap verification + SUMMARY write)
- **Tasks:** 2 (Task 1 checkpoint auto-approved per orchestrator yolo + "user has authorized full autonomous execution"; Task 2 executed Path L)
- **Files created:** 1 in-tree (this SUMMARY); 1 backup binary on Server5; 1 swapped binary on Server5; 1 local build artifact
- **SSH invocations to Server5:** 2 (1× scp upload + 1× batched ssh with 10 steps) — fail2ban-conservative

## Accomplishments

- **Custom Caddy v2.11.2 built via Docker `caddy:builder` image** with both required modules in a single `xcaddy build` invocation — no Go install needed on Windows dev box, no WSL, no chocolatey package add. Total wall time including image pull + Go module download + compile = ~70s.
- **Module diff gate satisfied: zero deletions, two additions** (`dns.providers.cloudflare` + `http.handlers.rate_limit`). Wave 0 Q5 memory-drift correction confirmed: existing `/usr/bin/caddy` had NEITHER module loaded; new binary has BOTH.
- **Pre-swap Caddyfile validation against new binary PASS** (`Valid configuration`) — added as a Step 6b gate beyond the plan, catching any directive parser regressions before `systemctl restart` would have caused user-visible downtime.
- **Backup-then-swap-then-restart sequence completed atomically in single ssh batch** with `~3s downtime window` (restart took 2-3s from `systemctl restart` to `Active: active (running)`); md5 verified swap; both pre-flight smoke targets returned same status post-swap (livinity.io 200→200; relay.livinity.io 503→503 — pre-existing per Wave 0 Notes 3).
- **Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at start AND end** — D-30-07 preserved.

## Task Commits

1. **Task 1: User confirms low-traffic window before binary swap (checkpoint)** — auto-approved per orchestrator prompt ("user has authorized full autonomous execution"); persisted `/tmp/phase-60-02-checkpoint.txt` with `BUILD_PATH=L SMOKE_TARGET_OK=yes`. No commit.
2. **Task 2: Build custom Caddy + backup + swap + restart + verify + smoke regression** — pending commit (`chore(60-02): wave 1 server5 caddy v2.11.2 + ratelimit + cloudflare modules`); SUMMARY-only since Wave 1 changes are out-of-tree (Server5 binary).

**Plan metadata:** pending after STATE.md/ROADMAP.md update (`docs(60-02): complete wave 1 plan`).

## Files Created/Modified

### In-tree
- `.planning/phases/60-public-endpoint-rate-limit/60-02-SUMMARY.md` (this file)

### Out-of-tree (Server5 — `/usr/bin/`)
- `/usr/bin/caddy` — REPLACED with custom build. md5 `1acb51e83065e220be74cf49e2378bc8`, 47227042 bytes, mode 0755.
- `/usr/bin/caddy.bak.20260503-070012` — NEW backup of pre-swap binary. md5 `f08247f4080ae66214a987b9bac886aa`, 47493282 bytes, mode 0755. **Rollback target.**

### Out-of-tree (local dev box — `/tmp/`)
- `/tmp/caddy-build/caddy-custom` — Linux ELF amd64 binary, 47227042 bytes
- `/tmp/server5-build.txt` — 100-line verbatim ssh batch transcript (fixture-style)
- `/tmp/phase-60-02-checkpoint.txt` — `BUILD_PATH=L SMOKE_TARGET_OK=yes` gate file

## New Caddy version + module list diff (cite `caddy list-modules`)

**Version:** `v2.11.2 h1:iOlpsSiSKqEW+SIXrcZsZ/NO74SzB/ycqqvAIEfIm64=` (unchanged from baseline; same point release)

**`caddy list-modules` line counts:**
- BEFORE (existing /usr/bin/caddy): **131 lines**
- AFTER (new /tmp/caddy-custom):    **136 lines**
- Delta: +5 lines (zero deletions)

**Verbatim `diff before.txt after.txt` output:**
```
131a132,136
>
> dns.providers.cloudflare
> http.handlers.rate_limit
>
>   Non-standard modules: 2
```

DELETIONS=0 (would-have-aborted gate; clean).

**Post-swap `caddy list-modules | grep -E "(rate_limit|cloudflare)"`:**
```
dns.providers.cloudflare
http.handlers.rate_limit
```

Both modules now active under `/usr/bin/caddy` (the swapped binary).

## Backup file path on Server5 (rollback target)

```
/usr/bin/caddy.bak.20260503-070012
```

Permissions: `-rwxr-xr-x 1 root root 47493282`. md5 `f08247f4080ae66214a987b9bac886aa`.

## Caddy restart success + livinity.io smoke test result

**Caddy systemd status post-restart:**
```
● caddy.service - Caddy
     Active: active (running) since Sun 2026-05-03 07:00:14 CEST; 3s ago
   Main PID: 91372 (caddy)
      Tasks: 13 (limit: 14307)
     Memory: 13.8M (peak: 14.2M)
```

Caddy auto-https loaded all 5 wildcard / explicit domains: `apps.livinity.io`, `livinity.io`, `*.*.livinity.io`, `*.livinity.io`, `changelog.livinity.io` — config preserved unchanged through swap.

**Smoke regression (pre-flight vs post-flight):**

| Target | Pre-swap | Post-swap | Verdict |
|--------|----------|-----------|---------|
| `https://livinity.io` | HTTP/2 200 | HTTP/2 200 | UNCHANGED — PASS |
| `https://relay.livinity.io` | HTTP/2 503 | HTTP/2 503 | UNCHANGED — PASS (pre-existing 503 per Wave 0 Notes 3, NOT introduced by swap) |

Both probes returned the same HTTP status class as pre-flight; neither showed TCP failure / 502 / TLS error. Wave 1 swap is non-regressive.

**Note:** Caddy journal showed one `bruce.livinity.io` 502 (Mini PC tunnel EOF) ~1s after restart — pre-existing, unrelated to Wave 1; tracked under Mini PC `liv-memory.service` restart-loop in project memory. NOT a Wave 1 regression.

## Rollback path documented

If any future Wave 4 smoke battery (60-05) or live verification (Phase 63) reveals an issue traceable to the new Caddy binary, run THIS single ssh batch on Server5 to restore the prior binary:

```bash
/c/Windows/System32/OpenSSH/ssh.exe \
  -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  root@45.137.194.102 'bash -s' <<'REMOTE_EOF'
set -e
LATEST_BAK=$(ls -1t /usr/bin/caddy.bak.* | head -1)
echo "ROLLBACK_FROM=$LATEST_BAK"
install -m 0755 "$LATEST_BAK" /usr/bin/caddy
systemctl restart caddy
sleep 2
systemctl status caddy --no-pager | head -5
caddy version
caddy list-modules | grep -E "(rate_limit|cloudflare)" || echo "post-rollback: rate_limit absent (expected after rollback to original binary)"
curl -sI --max-time 5 https://livinity.io | head -3
REMOTE_EOF
```

Recovery time: ≤30s. After rollback, `caddy list-modules` will NOT show `rate_limit` or `cloudflare` (back to original 131-line module list) — that confirms the rollback succeeded; Wave 3 Caddyfile addition would then need to be reverted as well or it would fail validation.

**Specific backup pinned for THIS swap:** `/usr/bin/caddy.bak.20260503-070012` (timestamp encoded in filename so future swaps create new `.bak.<ts>` entries without overwriting; `ls -1t` always picks the most recent).

## Sacred SHA at end (paste hash + match status)

```
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

**MATCH** — byte-identical to D-30-07 baseline; UNCHANGED across Wave 1.

| Probe Point | SHA | Match? |
|-------------|-----|--------|
| Start of Task 2 (sacred-file assertion) | `4f868d318abff71f8c8bfbcf443b2393a553018b` | baseline |
| End of Task 2 (sacred-file reassertion) | `4f868d318abff71f8c8bfbcf443b2393a553018b` | byte-identical |

## Decisions Made

1. **Auto-approved Task 1 checkpoint** under orchestrator yolo + "user has authorized full autonomous execution including Server5 production infrastructure changes" directive. Persisted `BUILD_PATH=L SMOKE_TARGET_OK=yes` to gate file. No human keystroke required.
2. **Build via Docker `caddy:builder` image** rather than installing xcaddy + Go on the Windows dev box. Single `docker run --rm -v $(pwd -W):/output ... caddy:builder xcaddy build ...` — clean, reproducible, no host pollution, produces Linux ELF directly. Docker Desktop autostart took ~5s; first-time `caddy:builder` image pull ~30s; build itself ~16s after Go modules cached.
3. **MSYS_NO_PATHCONV=1 + `//output` double-slash** to bypass git-bash POSIX-path → Windows-path translation that turned `/output` into `C:/Program Files/Git/output` on the first attempt.
4. **Step 6b Caddyfile validation gate added beyond plan** — runs `/tmp/caddy-custom validate --config /etc/caddy/Caddyfile --adapter caddyfile` on Server5 BEFORE the binary swap. RESEARCH.md Pitfall 2 noted that `rate_limit` directive without the module fails config validation; the symmetric concern is that a NEW binary might parse an existing Caddyfile differently. Validation passed cleanly (`Valid configuration`); no swap risk.
5. **Path L automated-verify divergence accepted** — plan's `<verify><automated>` block expects a `USING_XCADDY=` token that only Path A (build on Server5) emits. Path L (Docker on dev box) doesn't run xcaddy on Server5 at all. The functional gates (DELETION_COUNT=0, both module greps, BACKUP path, sacred SHA) all pass. Plan explicitly supports Path L as a branch, so this is plan-aligned divergence not a deviation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Docker daemon was not running when build started**

- **Found during:** Task 2 Step 4 (xcaddy build via Docker)
- **Issue:** First `docker run` invocation returned `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`. Docker Desktop installed at `C:\Program Files\Docker\Docker\Docker Desktop.exe` but not running.
- **Fix:** Started Docker Desktop via `powershell -Command "Start-Process ..."` then polled `docker info` every 5s until success (came up after 5s — Docker was warm-startable). Then re-ran build successfully.
- **Files modified:** None — runtime only.
- **Verification:** `docker info` returned client+daemon details; subsequent build completed in ~70s wall.
- **Committed in:** N/A (runtime issue)

**2. [Rule 3 - Blocking] Git-bash path translation broke first Docker invocation**

- **Found during:** Task 2 Step 4 (xcaddy build, second attempt after Docker started)
- **Issue:** `docker run --rm -v "$(pwd):/output" ...` translated `/output` to `C:/Program Files/Git/output`, which Docker rejected as `working directory ... is invalid, it needs to be an absolute path`. Git-bash MSYS aggressively rewrites POSIX paths starting with `/` when passing them to Windows-native binaries.
- **Fix:** Set `MSYS_NO_PATHCONV=1` + used `$(pwd -W)` (Windows-style cwd) for the volume bind + double-slash `//output` for the in-container path. Build then ran cleanly.
- **Files modified:** None — runtime only.
- **Verification:** Build emitted `Build complete: //output/caddy-custom`; ELF binary appeared in `/tmp/caddy-build/caddy-custom`.
- **Committed in:** N/A (runtime issue)

**3. [Rule 2 - Missing Critical] Added Caddyfile-validate-against-new-binary gate (Step 6b)**

- **Found during:** Task 2 Step 6 (between module diff and binary swap)
- **Issue:** Plan provides Steps 6 (module diff) and 7 (backup + swap), but no validation that the NEW binary can actually parse the EXISTING Caddyfile before the swap. RESEARCH.md Pitfall 2 calls out the symmetric direction (existing binary failing on rate_limit directive after Wave 3); the inverse (new binary failing on existing Caddyfile) is also a swap-risk worth gating on.
- **Fix:** Inserted Step 6b: `/tmp/caddy-custom validate --config /etc/caddy/Caddyfile --adapter caddyfile`. Returns `Valid configuration` ⇒ proceed; non-zero exit ⇒ ABORT swap. Validation passed cleanly here (no Caddyfile changes on Server5; new binary is a strict superset of the old one's modules).
- **Files modified:** None — added a remote shell step inside the same single ssh batch.
- **Verification:** `VALIDATE_EXIT=0` + `Valid configuration` printed in transcript.
- **Committed in:** N/A (remote ops only)

---

**Total deviations:** 3 auto-fixed (2 blocking — runtime tooling; 1 missing critical — defense-in-depth gate). All deviations were ENVIRONMENT or DEFENSIVE, not plan-substance changes. Path L was the plan-blessed branch per Wave 0 Q5 verdict; Docker startup + git-bash path quirks were tooling friction; Caddyfile-validate gate was a strictly additive safety check that passed. Zero scope creep.

## Issues Encountered

- **Docker daemon not running** — resolved by starting Docker Desktop programmatically (≤5s warm-start)
- **MSYS path translation** — resolved with `MSYS_NO_PATHCONV=1` + `pwd -W` + `//output` doubling
- **Pre-existing `relay.livinity.io` 503** — was 503 pre-swap and remains 503 post-swap; Wave 0 Notes 3 already flagged this as a separate-track issue (likely SNI / on_demand_tls/ask), NOT introduced by Wave 1
- **Pre-existing `bruce.livinity.io` 502 EOF** — Mini PC tunnel hiccup visible in Caddy journal during the smoke window; Wave 0 / project memory both flag the Mini PC tunnel as flaky (`liv-memory.service` restart-loop). NOT a Wave 1 regression

## D-NO-NEW-DEPS Audit

**No `package.json` or `pnpm-lock.yaml` modifications.** Wave 1 is binary-swap on Server5 — out-of-tree only. The new Caddy binary itself bundles two Go modules (`mholt/caddy-ratelimit` + `caddy-dns/cloudflare`) which is the explicitly D-30-08-budgeted YELLOW non-npm infrastructure delta for Phase 60 only. GREEN on the npm side.

## D-NO-SERVER4 Audit

Server4 NOT touched. All Wave 1 ops targeted Server5 (`45.137.194.102`). GREEN.

## User Setup Required

None — no external service configuration required.

## Threat Flags

None new. T-60-10 (xcaddy supply chain) is mitigated by Go module checksum DB; the build was reproducible via the pinned `caddy:builder` image and `xcaddy build v2.11.2 --with github.com/caddy-dns/cloudflare --with github.com/mholt/caddy-ratelimit` invocation. T-60-11 (1-2s downtime) materialized as ~3s actual restart window — within budget. T-60-12 (silent module drop) gate confirmed clean (DELETION_COUNT=0). T-60-13 (scp corruption) gate confirmed clean (md5 round-trip matches across local build → /tmp/caddy-custom → /usr/bin/caddy). T-60-14 (LE rate limit on cert reissue) didn't trigger — restart preserved cert state on disk, no NEW domain issued. T-60-15 (sacred file mid-task) confirmed clean (SHA bracket).

## Next Phase Readiness

- **Wave 2 (60-03 — relay api.livinity.io routing):** UNBLOCKED. New Caddy binary is in place; relay can extend to handle `api.livinity.io` host header without Caddyfile change yet. Plan must include `findAdminTunnel(registry, pool)` helper per Wave 0 Q3 + 503 fallback.
- **Wave 3 (60-04 — Caddyfile patch + DNS A record + broker IP-guard removal):** UNBLOCKED. Caddyfile `rate_limit` directive will now pass validation. Wave 0 Q1 verdict (manual CF dashboard click) and Wave 0 Caddyfile-drift verdict (RECOMMENDED option (a) pull-then-patch) carry forward.
- **Wave 4 (60-05 — smoke battery):** Awaiting Wave 3 completion. Smoke battery should re-confirm livinity.io + relay.livinity.io still healthy AND `api.livinity.io` 429s when over-rate-limit.
- **Rollback runbook:** Documented above; pinned to `/usr/bin/caddy.bak.20260503-070012`. Recovery ≤30s.

---

## Self-Check: PASSED

- [x] `.planning/phases/60-public-endpoint-rate-limit/60-02-SUMMARY.md` exists (this file)
- [x] Server5 `/usr/bin/caddy.bak.20260503-070012` created (verified in transcript: `BACKUP=/usr/bin/caddy.bak.20260503-070012` line)
- [x] Server5 `/usr/bin/caddy` swapped (verified: md5 matches `/tmp/caddy-custom` `1acb51e83065e220be74cf49e2378bc8`)
- [x] `caddy list-modules` shows BOTH `http.handlers.rate_limit` AND `dns.providers.cloudflare` post-swap (verified: Step 9 grep output)
- [x] Module diff DELETION_COUNT = 0 (verified: Step 6 transcript)
- [x] Caddyfile validates against new binary (verified: Step 6b `Valid configuration`)
- [x] Caddy systemd status `Active: active (running)` post-restart (verified: Step 8 transcript)
- [x] Smoke regression PASS for both `livinity.io` (200→200) and `relay.livinity.io` (503→503 — pre-existing, not introduced)
- [x] Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` UNCHANGED at start AND end (verified: `git hash-object` bracket)
- [x] D-NO-NEW-DEPS preserved (zero npm dep changes)
- [x] D-NO-SERVER4 preserved (Server5 only)
- [x] Single batched ssh for swap+verify (1 scp + 1 ssh — fail2ban-conservative)
- [x] Rollback runbook documented verbatim with pinned `.bak.20260503-070012` path
- [x] FR-BROKER-B2-02 satisfied: caddy-ratelimit module installed; Wave 3 can now add `rate_limit` directive without parse-fail

---
*Phase: 60-public-endpoint-rate-limit*
*Completed: 2026-05-03*
