---
phase: 252-fresh-install-portability-remediation
verified: 2026-05-29T10:20:00Z
status: human_needed
score: 16/16 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run a fresh install via `curl -fsSL https://livinity.io/install.sh | sudo bash -s <key>` on a clean Ubuntu 24.04 VPS and confirm: (1) Xephyr, xterm, gnome-terminal, x11-utils, xclip, wmctrl are installed, (2) computer_create_display returns isError:true on a missing X binary (simulate by temporarily renaming Xephyr), (3) terminal dock entry appears (terminal_panel=true seeded), (4) PTY opens bash shell as the desktop user without password prompt, (5) liv:mcp:config is populated (not empty) after install, (6) luse DISPLAY/XAUTHORITY in the seeded MCP entry are real values not placeholder strings."
    expected: "All six sub-checks pass — the full Luse + terminal stack comes up with no manual steps on a clean install."
    why_human: "Fresh-install behavior requires live apt mirrors, real Redis, actual systemd unit loading, and a running X session — none of these are testable programmatically from the repo. The operator note in the phase (repo-side remediation, not yet deployed) explicitly gates live behavior as operator UAT."
  - test: "On the Mini PC after the next update.sh run, verify the luse active-webapp-wid marker is now written to $XDG_RUNTIME_DIR/livos/active-webapp-wid (not /tmp/livos-active-webapp-wid) — e.g. `ls /run/user/$(id -u bruce)/livos/` while a webapp is active."
    expected: "The file exists under /run/user/<uid>/livos/ and the /tmp path is absent."
    why_human: "This is a cross-process runtime file contract (writer: livinityd window-manager.ts; reader: luse MCP child tools.ts) that only exists when the desktop session is live — not checkable from the repo."
---

# Phase 252: Fresh-Install Portability Remediation Verification Report

**Phase Goal:** Close the fresh-install portability gaps found by the Phase 251 audit so a clean install brings up the full Luse + terminal stack with no manual steps. Scope = REMEDIATION-BACKLOG.md items R1–R16 (P0 blockers R1,R2,R3,R4,R8,R9 gate go/no-go; then P1 R5–R7,R10–R12; P2 R13–R16).
**Verified:** 2026-05-29T10:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

All 16 backlog items (R1–R16) were verified against the actual codebase. The repo-side remediation is complete. Live install behavior is the remaining human gate.

| #   | Truth / R-item | Status | Evidence |
| --- | -------------- | ------ | -------- |
| 1   | R1: xserver-xephyr in BOTH installer apt blocks | VERIFIED | `grep -c` returns 1 each in deploy-livinityd.sh + update.sh; verify loop includes `Xephyr xterm` at deploy:540 + update:386 |
| 2   | R2: xterm in BOTH installer apt blocks | VERIFIED | Same apt block as R1 — `xserver-xephyr xterm gnome-terminal x11-utils xclip wmctrl` present in both files |
| 3   | R3: display-manager create() fails closed on spawn ENOENT | VERIFIED | `handle.on('error')` at display-manager.ts:237; `isError: true` return at :255; Redis HSET only reached after the error check; 17/17 tests pass including new Test 1 (zero luse:display keys on ENOENT) and Test 2 (happy-path drift-lock) |
| 4   | R4: PTY user resolved from Redis livos:desktop:user with bruce fallback | VERIFIED | ws-handler.ts:329-335 resolves `livos:desktop:user`; Test 4b (`alice`) and 4c (unset → `bruce`) both pass; 24/24 ws-handler tests green |
| 5   | R7: gnome-terminal in BOTH installer apt blocks | VERIFIED | Same apt block as R1 — `gnome-terminal` present in both installer scripts |
| 6   | R8: PTY spawns `bash --login` directly, no self-sudo | VERIFIED | session.ts:108 `ptyFactory('bash', argv, ...)` — zero `'sudo'` matches, zero `--user` matches; 12/12 session tests pass including sudo-less bash-spawn shape test |
| 7   | R9(2): route.ts clone-fallback runs scripts/install.sh (Path A) | VERIFIED | `grep -c 'livos/install.sh' route.ts` → 0; `exec bash "$TMPDIR/livinity-io/scripts/install.sh" "$@"` at line 35; GET export intact |
| 8   | R9(3): env-seed.sh writes openssl-rand secrets, no CHANGEME | VERIFIED | `grep -c CHANGEME env-seed.sh` → 0; `openssl rand -hex 24` at :66/:67; `unset _pg_pass _redis_pass` at :79; `bash -n` clean |
| 9   | R9(1): README documents the install entrypoint mapping | VERIFIED | `### Install entrypoint` section at README:100; `scripts/install.sh` and `get.livinity.io` both present |
| 10  | R9 ext: livos/install.sh (Path C) seeds liv:mcp:config | VERIFIED | `seed_mcp_servers()` defined at :1286 and called at :1804; `HSET liv:mcp:config` at :1391; `bash -n` clean |
| 11  | R10: livos:v43:terminal_panel seeded true at install | VERIFIED | `_dld_seed_terminal_panel_flag` fn at deploy-livinityd.sh:1407; called at :2057; 2 matches confirmed |
| 12  | R11: get.livinity.io mapping resolved and recorded | VERIFIED | GET-LIVINITY-IO-RESOLUTION.md exists (105 lines, >= 20); contains `livinity.io/install.sh →` verdict; dual-URL table with Path A / Path C classification |
| 13  | R5: liv-assistant.service has EnvironmentFile=-/opt/livos/.env | VERIFIED | Present at systemd/liv-assistant.service:24; `redis-env.conf` count = 0; in [Service] before [Install] |
| 14  | R6: luse seed DISPLAY/XAUTHORITY are resolved placeholders | VERIFIED | `__LIVOS_DISPLAY__` at mcp-servers.json:175, `__LIVOS_XAUTHORITY__` at :176; gdm literal count = 0; substitution sed lines at deploy-livinityd.sh:1162-1163; WR-01 post-review fix also adds substitution in livos/install.sh:1360-1361 |
| 15  | R12: empty liv:mcp:config catalog raises ERROR-level + emptyCatalog flag | VERIFIED | seed.ts:102 sets `result.emptyCatalog = true`; :109 logs ERROR `[mcp-seed] EMPTY liv:mcp:config catalog`; 13/13 seed tests pass including Scenario L (emptyCatalog:true + ERROR log) |
| 16  | R13: LUSE_USER_ID defaults to 'bruce' across luse child, seeded | VERIFIED | `DEFAULT_LUSE_USER_ID = 'bruce'` + `resolveLuseUserId()` exported from tools.ts:91-98; server.ts:319 uses `resolveLuseUserId()`; `"LUSE_USER_ID": "__LIVOS_USER_SLUG__"` at mcp-servers.json:181; zero `?? 'admin'` in server.ts; 20/20 tools tests pass |
| 17  | R14: luse install root derives from single $LIVOS_ROOT source | VERIFIED | `LIVOS_ROOT` exported from tools.ts:108-109 (`$LIVOS_ROOT ?? $LIVOS_BASE_DIR ?? '/opt/livos'`); imported by server.ts:51; old hardcoded array literal count in server.ts = 0; `/opt/livos/data/uploads/` literal in tools.ts = 0; `_DLD_LIVOS_DIR="${_DLD_LIVOS_DIR:-/opt/livos}"` at deploy-livinityd.sh:61 |
| 18  | R15: active-wid marker + luse- allowlist under $XDG_RUNTIME_DIR | VERIFIED | `XDG_RUNTIME_DIR` resolver at tools.ts:319-323; `ACTIVE_WID_MARKER` = `${LIVOS_RUNTIME_DIR}/active-webapp-wid`; `LUSE_TMP_PREFIX` = `${XDG_RUNTIME_DIR}/luse-`; `'/tmp/livos-active-webapp-wid'` literal count = 0; `'/tmp/luse-'` literal count = 0; O_NOFOLLOW at :361; `broadcastActiveWid` writer in window-manager.ts moved to same `$XDG_RUNTIME_DIR/livos/active-webapp-wid` path (deviation from plan — auto-fixed, correct) |
| 19  | R16: x11-utils + xclip + wmctrl in BOTH installer apt blocks | VERIFIED | Same apt block as R1 |

**Score:** 16/16 R-items verified at code level. 4 additional post-review fixes (WR-01, WR-02, WR-04 fixed; WR-03 deferred with rationale).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `scripts/install/deploy-livinityd.sh` | Phase-252 apt block + Xephyr/xterm verify loop + terminal_panel seed + DISPLAY/XAUTHORITY substitution + overridable _DLD_LIVOS_DIR | VERIFIED | All changes present; `bash -n` clean |
| `update.sh` | Mirror apt block + verify loop | VERIFIED | Byte-identical to deploy-livinityd.sh changes; `bash -n` clean |
| `livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts` | `child.on('error')` fail-closed path | VERIFIED | Error latch at :237; isError:true return at :255; HSET guarded |
| `livos/packages/livinityd/source/modules/computer-use/displays/types.ts` | `isError?/error?` on CreateDisplayResult; `on?` on SpawnHandle | VERIFIED | Present per test contracts |
| `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts` | MCP wrapper branches on isError; XDG_RUNTIME_DIR markers; LIVOS_ROOT; resolveLuseUserId | VERIFIED | All present; 20/20 tests pass |
| `livos/packages/livinityd/source/modules/pty-sessions/session.ts` | sudo-less bash spawn; root-only guard | VERIFIED | ptyFactory('bash',...) at :108; `username === 'root'` guard at :84 |
| `livos/packages/livinityd/source/modules/pty-sessions/types.ts` | `username: string` | VERIFIED | Present at :36 |
| `livos/packages/livinityd/source/modules/pty-sessions/ws-handler.ts` | `livos:desktop:user` Redis lookup | VERIFIED | Lookup at :329-335 |
| `platform/web/src/app/install.sh/route.ts` | Path A fallback; no livos/install.sh reference | VERIFIED | `scripts/install.sh` fallback; 0 livos/install.sh references; GET export intact |
| `scripts/install/env-seed.sh` | openssl-rand secrets; no CHANGEME; no secret logged | VERIFIED | openssl rand -hex 24; CHANGEME count = 0; unset after heredoc |
| `README.md` | Install entrypoint section | VERIFIED | Section present at :100 with dual-URL mapping |
| `livos/install.sh` | seed_mcp_servers() including DISPLAY/XAUTHORITY substitution (WR-01 fix) | VERIFIED | Function at :1286; HSET at :1391; 6-placeholder sed at :1355-1361 |
| `systemd/liv-assistant.service` | EnvironmentFile=-/opt/livos/.env | VERIFIED | Present at :24; no redis-env.conf |
| `scripts/install/seeds/mcp-servers.json` | __LIVOS_DISPLAY__/__LIVOS_XAUTHORITY__ + LUSE_USER_ID placeholders | VERIFIED | All three placeholders present; gdm literal = 0 |
| `livos/packages/livinityd/source/modules/mcp-registrar/seed.ts` | emptyCatalog flag + ERROR log | VERIFIED | :102 + :109; 13/13 tests pass |
| `livos/packages/livinityd/source/modules/mcp-registrar/types.ts` | emptyCatalog?: boolean on SeedResult | VERIFIED | Optional field added (11 existing exact toEqual assertions stay green) |
| `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` | resolveLuseUserId(); LIVOS_ROOT imported; no hardcoded env array | VERIFIED | All present; old array literal count = 0 |
| `livos/packages/livinityd/source/modules/webapps/window-manager.ts` | broadcastActiveWid writes to $XDG_RUNTIME_DIR/livos/ | VERIFIED | :834-838 resolves XDG_RUNTIME_DIR; mkdirSync 0700 guard; old /tmp literal = 0 |
| `.planning/phases/252-fresh-install-portability-remediation/GET-LIVINITY-IO-RESOLUTION.md` | Resolved entrypoint mapping (>= 20 lines) | VERIFIED | 105 lines; VERDICT table present; operator-corrected |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| display-manager.ts create() | tools.ts computer_create_display | CreateDisplayResult.isError discriminant | WIRED | tools.ts:927 `if (result.isError)` branch; also :1113 |
| deploy-livinityd.sh _dld_install_streaming_packages | apt-get install xserver-xephyr xterm | second DEBIAN_FRONTEND apt block | WIRED | Present in both installer scripts |
| ws-handler.ts init branch | Redis livos:desktop:user | redis.get with 'bruce' fallback | WIRED | ws-handler.ts:329-335; test 4b/4c confirm resolve + fallback |
| session.ts start() | node-pty spawn of bash | ptyFactory('bash', ['--login','-c', MOTD], ...) | WIRED | :108; zero 'sudo' references |
| liv-assistant.service | /opt/livos/.env REDIS_URL | EnvironmentFile=- directive | WIRED | :24 in [Service] block |
| deploy-livinityd.sh sed block | mcp-servers.json luse env | __LIVOS_XAUTHORITY__ / __LIVOS_DISPLAY__ substitution | WIRED | :1162-1163 in sed block; also in livos/install.sh:1360-1361 (WR-01 fix) |
| server.ts LUSE_USER_ID default | tools.ts LUSE_USER_ID default | resolveLuseUserId() shared resolver | WIRED | tools.ts:91-98 exported; server.ts:51 imported + :319 called |
| tools.ts active-wid marker | $XDG_RUNTIME_DIR/livos/active-webapp-wid | per-uid 0700 tmpfs path | WIRED | tools.ts:323 ACTIVE_WID_MARKER; window-manager.ts:836-838 writer; cross-process contract coherent |
| route.ts fallback clone | scripts/install.sh (Path A) | exec bash on the cloned Path-A script | WIRED | route.ts:35 `scripts/install.sh` |
| livos/install.sh seed_mcp_servers | Redis liv:mcp:config | HSET via redis-cli | WIRED | :1391 `redis-cli ... HSET liv:mcp:config` |
| env-seed.sh .env writer | DATABASE_URL/REDIS_URL real secrets | openssl rand-generated passwords | WIRED | :66-67 `openssl rand -hex 24`; unquoted heredoc at :70 |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces installer scripts, systemd units, and TypeScript source changes. There are no new data-rendering React/Next.js components. Dynamic data flows were verified via unit tests rather than browser rendering.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Apt block present in deploy-livinityd.sh | `grep -c 'xserver-xephyr xterm gnome-terminal x11-utils xclip wmctrl' scripts/install/deploy-livinityd.sh` | 1 | PASS |
| Apt block present in update.sh | `grep -c 'xserver-xephyr xterm gnome-terminal x11-utils xclip wmctrl' update.sh` | 1 | PASS |
| deploy-livinityd.sh syntax valid | `bash -n scripts/install/deploy-livinityd.sh` | exit 0 | PASS |
| update.sh syntax valid | `bash -n update.sh` | exit 0 | PASS |
| livos/install.sh syntax valid | `bash -n livos/install.sh` | exit 0 | PASS |
| env-seed.sh syntax valid | `bash -n scripts/install/env-seed.sh` | exit 0 | PASS |
| display-manager tests (R3) | `npx vitest run display-manager.test.ts` | 17/17 passed | PASS |
| pty-sessions session tests (R4/R8) | `npx vitest run session.test.ts` | 12/12 passed | PASS |
| pty-sessions ws-handler tests (R4) | `npx vitest run ws-handler.test.ts` | 24/24 passed | PASS |
| mcp-registrar seed tests (R12) | `npx vitest run seed.test.ts` | 13/13 passed | PASS |
| computer-use mcp tools tests (R13/R15) | `npx vitest run tools.test.ts` | 20/20 passed | PASS |
| route.ts no livos/install.sh reference | `grep -c 'livos/install.sh' platform/web/src/app/install.sh/route.ts` | 0 | PASS |
| env-seed.sh no CHANGEME | `grep -c CHANGEME scripts/install/env-seed.sh` | 0 | PASS |
| No /tmp/livos-active-webapp-wid literal in tools.ts | `grep -c "'/tmp/livos-active-webapp-wid'" ...tools.ts` | 0 | PASS |
| No /tmp/luse- literal in tools.ts | `grep -c "'/tmp/luse-'" ...tools.ts` | 0 | PASS |
| LUSE_USER_ID defaults to 'bruce' in server.ts | `grep -c "LUSE_USER_ID ?? 'admin'" server.ts` | 0 | PASS |

### Code Review Fix Verification

The 252-REVIEW.md identified 4 warnings (WR-01 through WR-04) and 5 info items. Committed post-review fix `dd9c1a0e` addressed WR-01, WR-02, WR-04:

| Finding | Status | Evidence |
| ------- | ------ | -------- |
| WR-01: Path C seed missing DISPLAY/XAUTHORITY substitution | FIXED | livos/install.sh:1337-1361 adds 6-placeholder sed including `__LIVOS_DISPLAY__`/`__LIVOS_XAUTHORITY__` |
| WR-02: REDIS_URL regex only matched `redis://default:` not `redis://:` | FIXED | All 4 `_dld_seed_*` helpers at deploy-livinityd.sh:1093,1249,1422,1482 now use `(default)?` tolerant regex |
| WR-03: LUSE_TMP_PREFIX string-prefix (not path-boundary) | DEFERRED | Bounded: 0700 same-uid dir; fix restructures workspace layout — tracked in deferred-items.md |
| WR-04: computer_read_file reads from original requestedPath after realpath | FIXED | tools.ts:1007 now reads `readFileBase64(resolved)` (the validated path, not requestedPath) |

### Requirements Coverage

All 16 R-items from the Phase 251 REMEDIATION-BACKLOG.md are accounted for:

| Requirement | Plan | Description | Status |
| ----------- | ---- | ----------- | ------ |
| R1 | 252-01 | Install xserver-xephyr in BOTH installers | SATISFIED |
| R2 | 252-01 | Install xterm in BOTH installers | SATISFIED |
| R3 | 252-01 | display-manager create() fails closed on ENOENT | SATISFIED |
| R4 | 252-02 | PTY user resolved from Redis livos:desktop:user | SATISFIED |
| R5 | 252-05 | liv-assistant.service EnvironmentFile=-/opt/livos/.env | SATISFIED |
| R6 | 252-05 | Seed DISPLAY/XAUTHORITY resolved at seed time | SATISFIED |
| R7 | 252-01 | Install gnome-terminal in BOTH installers | SATISFIED |
| R8 | 252-02 | PTY spawns bash --login directly, no self-sudo | SATISFIED |
| R9 | 252-04 | route.ts Path-A fallback + env-seed.sh secrets + README + livos/install.sh MCP seed | SATISFIED |
| R10 | 252-02 | Seed livos:v43:terminal_panel=true at install | SATISFIED |
| R11 | 252-03 | Resolve + record live get.livinity.io mapping | SATISFIED |
| R12 | 252-05 | Loud empty-catalog health signal | SATISFIED |
| R13 | 252-06 | Unified LUSE_USER_ID default ('bruce') + seed | SATISFIED |
| R14 | 252-06 | Single $LIVOS_ROOT source of truth | SATISFIED |
| R15 | 252-06 | XDG_RUNTIME_DIR markers; O_NOFOLLOW on read; writer moved | SATISFIED |
| R16 | 252-01 | Install x11-utils + xclip + wmctrl in BOTH installers | SATISFIED |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts:509` | `LUSE_TMP_PREFIX` string-prefix (not path-boundary) allows sibling dir `luse-<x>` under $XDG | Warning (WR-03, deferred) | Bounded: 0700 same-uid — no cross-user escalation. Tracked in deferred-items.md. |
| `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts:319-322` and `webapps/window-manager.ts:835-838` | `process.getuid?.() ?? 1000` fallback duplicated in two files (IN-03) | Info | Low: both reader+writer default to same value; same drift risk as before. Deferred. |
| `livos/install.sh:954-955,968,1052,1683-1684` | Kimi AI provider messaging in Path C installer banners (IN-02) | Info | UX inconsistency on a legacy non-primary path. Deferred per deferred-items.md. |

No blockers found. WR-03 is the most significant deferred item and is explicitly bounded (0700 same-uid tmpfs — only the user's own process can create `luse-<x>` siblings).

### Typecheck Baseline

The pre-existing typecheck baseline (~382-392 errors in unrelated `webapps/`, `widgets/`, `xai-auth/`, `computer-use/native/`, and `ChildProcess.on` patterns) was respected throughout. Each plan verified zero NEW errors via git-stash A/B comparison:
- After 252-06: baseline-without-changes = 392, with-changes = 389 (net -3, my edits removed two `?? 'admin'`/`?? 'bruce'` env-read lines)

### Pre-existing Test Failures (Out of Scope)

3 pre-existing `window-manager.test.ts` failures (Tests 16, 18, 23 — "Phase 100-08-04 per-WebApp Luse MCP lifecycle (Redis pub-sub)" — `spawn()` → `mcpConfigManager.installServer`/`updateServer`) were confirmed via git-stash A/B to be unrelated to the R15 marker-path move. 37 passed / 22 skipped / 3 pre-existing-fail, unchanged by 252-06.

### Human Verification Required

**1. Fresh-install end-to-end smoke test**

**Test:** Run `curl -fsSL https://livinity.io/install.sh | sudo bash -s <key>` on a clean Ubuntu 24.04 VPS (not the Mini PC — a genuinely fresh box). After install completes, verify: (1) `which Xephyr xterm gnome-terminal x11-utils xclip wmctrl` — all found; (2) `redis-cli get livos:v43:terminal_panel` → `"true"`; (3) `redis-cli hlen liv:mcp:config` > 0 (MCP catalog populated); (4) `redis-cli hget liv:mcp:config luse | python3 -m json.tool | grep DISPLAY` → real value like `:1`, not `__LIVOS_DISPLAY__`; (5) Terminal dock icon appears and opens a bash shell without a password prompt; (6) `journalctl -u liv-assistant | grep REDIS` — no missing REDIS_URL errors.
**Expected:** All six sub-checks pass — the full Luse + terminal stack comes up with no manual steps.
**Why human:** Live apt mirrors, real systemd unit loading, running X session, and Redis state cannot be simulated from the repo. The phase scope note explicitly marks this as operator UAT.

**2. Runtime marker path verification on Mini PC**

**Test:** After the next `update.sh` run on Mini PC (`bruce@10.69.31.68`), with the desktop session active, check: `ls /run/user/$(id -u bruce)/livos/` while a webapp is visible in the UI.
**Expected:** `active-webapp-wid` file exists under the per-uid runtime dir (not `/tmp/livos-active-webapp-wid`).
**Why human:** Cross-process runtime contract between livinityd window-manager.ts (writer) and luse MCP child tools.ts (reader) — only observable with a live X session and active webapp. The deployed Mini PC does not yet have this code (not deployed at phase end — changes take effect on next update.sh).

### Gaps Summary

No code-level gaps. All 16 R-items are implemented, tested, and traceable to commits. The two human verification items are live-deployment behavioral checks that cannot be automated from the repo:

1. Fresh-install smoke test (R1/R2/R7/R16 apt, R3 fail-closed, R4/R8 terminal, R9 MCP seed, R10 flag, R5/R6 env) — requires a genuinely clean VPS.
2. XDG_RUNTIME_DIR marker path (R15) — requires a live X session with an active webapp.

The deferred code-review findings (WR-03, IN-01 through IN-04) are hygiene items with explicit scope-boundary rationale in deferred-items.md. They do not block goal achievement.

---

_Verified: 2026-05-29T10:20:00Z_
_Verifier: Claude (gsd-verifier)_
