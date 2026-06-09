---
phase: 262-security-hardening-pass-3
plan: 262-03
subsystem: security
tags: [sudoers, sudo, fail2ban, deploy-script, least-privilege, sacred-sha, bash-tests]

# Dependency graph
requires:
  - phase: 192-livinityd-bruce-user-switch
    provides: the scoped sudoers.d/livinityd Cmnd_Alias fragment this plan extends and makes load-bearing
  - phase: 261-security-research-pass
    provides: SECURITY-RESEARCH-PASS-3.md LIVOS-043 finding (file:line, exploit sketch, recommended alias shape)
provides:
  - deploy-livinityd.sh _dld_create_desktop_user WITHOUT the blanket NOPASSWD sudoers write; rm -f cleanup of legacy 99-<user> drop-ins on re-provision
  - LIVINITYD_FAIL2BAN Cmnd_Alias in sudoers.d/livinityd (exactly the five fail2ban-client argv shapes client.ts builds)
  - fail2ban-admin/client.ts spawning via /usr/bin/sudo -n (works pre- AND post-WS6)
  - inverted deploy/sudoers bash test suites that REGRESSION-LOCK the absence of the blanket grant
affects: [262-05 deploy walk, WS6 operator checklist, future sudoers widenings (sacred re-pin contract)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sudoers widening = new numbered Cmnd_Alias section + own bruce ALL=(root) NOPASSWD: line + sacred-shas-v38.json re-pin in the SAME commit"
    - "privileged-binary client spawns wrap argv as execFile('/usr/bin/sudo', ['-n', BINARY, ...args]) with pre-spawn zod/regex validation intact"
    - "test inversion: assert ABSENCE of a removed security liability + a positive cleanup assertion, labeled with the finding ID"

key-files:
  created: []
  modified:
    - scripts/install/deploy-livinityd.sh
    - scripts/install/sudoers.d/livinityd
    - scripts/sacred-shas-v38.json
    - livos/packages/livinityd/source/modules/fail2ban-admin/client.ts
    - livos/packages/livinityd/source/modules/fail2ban-admin/client.test.ts
    - livos/packages/livinityd/source/modules/fail2ban-admin/integration.test.ts
    - scripts/install/__tests__/test-deploy-livinityd.sh
    - scripts/install/__tests__/test-sudoers-livinityd.sh

key-decisions:
  - "LIVINITYD_FAIL2BAN grants EXACTLY the five shapes client.ts builds (status, status *, set * banip/unbanip/addignoreip *) — the report's suggested `get *` shape was DROPPED because no procedure spawns it"
  - "Fragment edit re-pins the sacred blob SHA (aea64b87 -> e01ec0e6) in the same commit, per the registry's own reviewed-widening contract"
  - "sudo prefix lives in makeFail2banClient.spawn (not the realExec wrapper) so DI tests assert the real production argv"
  - "stderr 'command not found' -> binary-missing mapping added: the sudo wrap hides spawn ENOENT for a missing fail2ban-client"

patterns-established:
  - "Scoped-grant continuity: every blanket-grant removal ships the narrow replacement alias + sudo -n client change + shape-locked tests in the same plan"

requirements-completed: [LIVOS-043]

# Metrics
duration: ~25min
completed: 2026-06-09
---

# Phase 262 Plan 03: Remove the blanket bruce sudoers grant Summary

**Deploy script no longer provisions `bruce ALL=(ALL) NOPASSWD:ALL` (and actively removes legacy 99-bruce drop-ins on re-provision); fail2ban panel continuity via a new exact-shape LIVINITYD_FAIL2BAN Cmnd_Alias + `sudo -n` client; deploy/sudoers test suites inverted to regression-lock the absence**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-09T21:34:26Z
- **Completed:** 2026-06-09T21:59:00Z (approx)
- **Tasks:** 3/3
- **Files modified:** 8

## Accomplishments

- **LIVOS-043 (High) closed at the provisioning layer:** `_dld_create_desktop_user()` no longer writes the blanket drop-in that silently subsumed the Phase-192 least-privilege fragment; the literal `NOPASSWD:ALL` appears ZERO times in deploy-livinityd.sh (including comments). Re-provision runs `rm -f "/etc/sudoers.d/99-${user}"` so older installs get cleaned on the next deploy.
- **fail2ban panel keeps working without the blanket grant:** new `Cmnd_Alias LIVINITYD_FAIL2BAN` grants exactly the five `fail2ban-client` argv shapes `client.ts` builds — `status`, `status <jail>`, `set <jail> banip <ip>`, `set <jail> unbanip <ip>`, `set <jail> addignoreip <ip>` — wired to its own `bruce ALL=(root) NOPASSWD:` user-spec line (timedatectl idiom). Fragment validated with REAL `visudo -cf` (via WSL): `parsed OK`.
- **client.ts now spawns `execFile('/usr/bin/sudo', ['-n', '/usr/bin/fail2ban-client', ...args])`** — zod/regex pre-spawn validation, hardcoded BINARY_PATH, and the 10s timeout untouched. Works TODAY under the live blanket grant and post-WS6 under the scoped grant.
- **Test suites regression-lock the new posture:** the three Bug #10-era assertions REQUIRING the blanket drop-in were inverted/replaced (labeled `LIVOS-043`); test-sudoers-livinityd.sh gained 4 assertions including an exact-member whitelist over the alias (any unexpected member FAILs). Inversion proven in BOTH directions: old assertions fail against the new script, new assertions fail against the pre-262-03 script (`HEAD~2`).

## Task Commits

1. **Task 1: deploy-livinityd.sh — delete blanket NOPASSWD write + active cleanup** — `9cab3386` (fix)
2. **Task 2: scoped LIVINITYD_FAIL2BAN + sudo -n client (+ sacred re-pin)** — `12d0f225` (feat)
3. **Task 3: invert deploy-test assertions + extend sudoers fragment test** — `d674c099` (test)

## Files Created/Modified

- `scripts/install/deploy-livinityd.sh` — `_dld_create_desktop_user` keeps useradd/groups/home-chown; sudoers tmp+visudo+mv plumbing deleted; `rm -f "/etc/sudoers.d/99-${user}"`; comments at :78, section 3b header, step text, call site reworded
- `scripts/install/sudoers.d/livinityd` — new section 24 `LIVINITYD_FAIL2BAN` + `bruce ALL=(root) NOPASSWD:` line; header "No NOPASSWD: ALL" doc line reworded (literal now appears zero times)
- `scripts/sacred-shas-v38.json` — fragment blob SHA re-pinned `aea64b87...` → `e01ec0e6...`, frozen_in_phase + rationale updated
- `livos/.../fail2ban-admin/client.ts` — `SUDO_PATH` const; `spawn()` sudo -n wrap; stderr `command not found` → `binary-missing` mapping
- `livos/.../fail2ban-admin/client.test.ts` — argv assertions updated for the sudo -n prefix (Tests 1–5) + new Test 6b; 14/14 green via tsx
- `livos/.../fail2ban-admin/integration.test.ts` — fake-exec dispatch strips the sudo prefix; 4 argv deep-equals updated
- `scripts/install/__tests__/test-deploy-livinityd.sh` — Bug #10 blanket assertions inverted (no `> .*sudoers` write, file-wide zero `NOPASSWD:ALL`) + positive `rm -f` cleanup assertion
- `scripts/install/__tests__/test-sudoers-livinityd.sh` — 4 new LIVOS-043 assertions incl. exact-member whitelist of the alias

## Decisions Made

- **Dropped the report's suggested `/usr/bin/fail2ban-client get *` alias member** — enumeration of client.ts shows NO procedure spawns `get` (the "events/ignoreip reads" are an auth.log file read and `set <jail> addignoreip`); the plan instructed granting only shapes actually used.
- **Sudo prefix placed inside `makeFail2banClient.spawn`** (not the production `realExec` wrapper) so the DI tests assert the true production argv — required by the plan's key_link pattern.
- **Sacred SHA re-pin in the same commit as the fragment edit** — the pre-commit hook (`check-sacred.sh`) hard-blocks otherwise; the registry rationale explicitly defines this as the reviewed-widening path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Sacred SHA re-pin for sudoers.d/livinityd**
- **Found during:** Task 2
- **Issue:** The fragment is pinned in `scripts/sacred-shas-v38.json` and enforced by the `.husky/pre-commit` → `check-sacred.sh` gate; editing it without a re-pin blocks the commit.
- **Fix:** Updated `expected_sha` (`aea64b87...` → `e01ec0e6...`), `frozen_in_phase`, and rationale documenting the LIVOS-043 widening. `check-sacred.sh` PASS 20/20.
- **Files modified:** scripts/sacred-shas-v38.json
- **Committed in:** 12d0f225

**2. [Rule 2 - Missing Critical] stderr "command not found" → binary-missing mapping in wrapExecError**
- **Found during:** Task 2
- **Issue:** With the sudo wrap, a missing fail2ban-client no longer surfaces as spawn ENOENT (sudo spawns fine, exits non-zero with "command not found" on stderr) — the documented `binary-missing` error contract (UI service-state banner / routes.ts kind discrimination) would silently degrade to `transient`.
- **Fix:** Added the stderr match; new Test 6b locks it.
- **Files modified:** client.ts, client.test.ts
- **Committed in:** 12d0f225

**3. [Rule 1 - Bug] integration.test.ts argv assertions + fake dispatch updated (file outside `files_modified`)**
- **Found during:** Task 2
- **Issue:** `integration.test.ts` deep-equals raw fail2ban argv and dispatches its fake on `args[0]` — both wrong after the sudo prefix. The Task 2 action text sanctions this ("Update any client test asserting the spawned binary/argv").
- **Fix:** Fake strips the `['-n', BINARY]` prefix before dispatch; four deep-equals updated. NOTE: this suite fails at its FIRST step (pre-existing `initDatabase` pg-mock failure on this host, identical at baseline) so the argv tests are unreachable here — shapes are fully covered by client.test.ts (14/14).
- **Committed in:** 12d0f225

**4. [Rule 1 - Bug] Fragment header "No NOPASSWD: ALL." doc line reworded**
- **Found during:** Task 2 verification
- **Issue:** The plan's automated verify (`! grep -qE "NOPASSWD: ?ALL"`) greps the whole file; the PRE-EXISTING header comment contained the literal. Consistent with Task 1's "including comments — reword them" rule.
- **Fix:** Reworded to "No passwordless-everything (blanket) grant — every entry is a scoped Cmnd_Alias." (Also why the Task 1 replacement comment avoids the literal that the plan's own suggested snippet contained — the acceptance criterion demands ZERO occurrences.)
- **Committed in:** 12d0f225

---

**Total deviations:** 4 auto-fixed (1 blocking, 1 missing-critical, 2 bug)
**Impact on plan:** All necessary for commit-gate passage, error-contract correctness, and verify-gate consistency. No scope creep; no live box touched.

## TDD Gate Compliance

Task 3 carried `tdd="true"`. Gate sequence adapted to the plan's own task order (implementation
Tasks 1–2 precede the test task): **RED** was captured by running the unmodified suite against the
post-Task-1 script — the stale Bug #10 assertions FAILED (155 PASS / 9 FAIL run output) — and the
inversion-lock was additionally proven against the pre-262-03 script (`git show HEAD~2`: all three
new assertions would FAIL). **GREEN** = `d674c099` (`test(262-03)`); suites re-run green
(deploy 157/7-pre-existing, sudoers 11/0). git log gate commits: `test(...)` present (`d674c099`)
after `fix(...)`/`feat(...)` (`9cab3386`, `12d0f225`) — order inverted vs canonical RED→GREEN
because the plan structured implementation before test inversion; RED evidence preserved above.

## Deferred Issues

See `deferred-items.md` (262-03 section) — highlights:

- **test-deploy-livinityd.sh has 7 PRE-EXISTING baseline failures** (unrelated suite drift:
  SKIP_DEPLOY probe, tunnel-args sibling, pnpm flags, mender-client4, `_DLD_LIVOS_USER` default,
  Phase 219 seed). Baseline 157 PASS / 7 FAIL → post-262-03 157 PASS / 7 FAIL (IDENTICAL fail set,
  zero new). The plan's "0 FAIL" criterion is met for everything attributable to this plan; fixing
  the unrelated drift was out of scope per the deviation boundary.
- **`system/update.ts` "Update LivOS" button rides the blanket grant** (`sudo -n bash
  /opt/livos/update.sh`, comment :209 says so explicitly) — it will BREAK after the operator
  removes 99-bruce. Must NOT be fixed with a naive Cmnd_Alias (update.sh is bruce-writable →
  blanket-root in disguise); needs a root-owned wrapper design in a follow-up plan.
- **fluxbox-wm.ts / restart-hook.ts / terminal-socket.ts sudo spawns** have no scoped alias —
  enumerate on the WS6 `sudo -n -l` walk.

## Known Stubs

None — no stubbed data paths or placeholder UI introduced.

## Operator Sequencing Note (WS6 — live walk, NOT done by this plan)

Order matters on the Mini PC:
1. Deploy via `update.sh` (gets the new client.ts + fragment source). The fail2ban panel keeps
   working immediately — `sudo -n` succeeds under the still-present blanket grant.
2. Install the UPDATED fragment: `sudo install -m 0440 -o root -g root
   /opt/livos/scripts/install/sudoers.d/livinityd /etc/sudoers.d/livinityd && sudo visudo -c`
   (or re-run `bruce-user-bootstrap.sh` / `migrate-to-bruce-user.sh` which do the same + visudo).
3. ONLY THEN: `sudo rm /etc/sudoers.d/99-bruce`.
4. Verify: `sudo -n -l` as bruce lists ONLY scoped Cmnd_Aliases (incl. LIVINITYD_FAIL2BAN); the
   Settings fail2ban panel still lists jails / bans / unbans.
5. EXPECT the in-app "Update LivOS" button to fail post-removal (deferred item 3) — run
   `update.sh` manually until the wrapper follow-up ships.

## Issues Encountered

- The plan's Task 1 suggested replacement comment itself contained the literal `NOPASSWD:ALL`,
  contradicting the plan's own ZERO-occurrences acceptance criterion — resolved in favor of the
  acceptance criterion (comment written without the literal).
- No `visudo` on the Windows dev host — validated the fragment with the real parser via WSL
  (`visudo -cf` → `parsed OK`) instead of guessing at sudoers syntax.

## Next Phase Readiness

- WS3 code-side complete; 262-04/262-05 unblocked (no shared-file contention: this plan's files
  are disjoint from WS4/WS5 surfaces).
- The WS6 operator checklist (262-05 / deploy walk) must include the sequencing note above plus
  deferred items 3–4.

## Self-Check: PASSED

- scripts/install/deploy-livinityd.sh — FOUND; `grep -c NOPASSWD:ALL` = 0; `bash -n` exit 0
- scripts/install/sudoers.d/livinityd — FOUND; contains LIVINITYD_FAIL2BAN; visudo parsed OK
- fail2ban-admin/client.ts — FOUND; spawns /usr/bin/sudo with ['-n', BINARY_PATH, ...]
- Commits 9cab3386, 12d0f225, d674c099 — FOUND in git log
- client.test.ts 14/14 via tsx; sudoers suite 11 PASS / 0 FAIL; deploy suite 157 PASS / 7 FAIL (= pre-existing baseline set, zero new)
- livinityd tsc: 398 errors = exact post-262-02 baseline, none in fail2ban-admin

---
*Phase: 262-security-hardening-pass-3*
*Completed: 2026-06-09*
