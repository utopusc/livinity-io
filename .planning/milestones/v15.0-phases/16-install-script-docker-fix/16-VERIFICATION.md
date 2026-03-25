---
phase: 16-install-script-docker-fix
verified: 2026-03-20T12:00:00Z
status: gaps_found
score: 4/5 must-haves verified
re_verification: false
gaps:
  - truth: "install.sh creates /opt/livos/data/tor/data directory with 1000:1000 ownership before services start"
    status: partial
    reason: "setup_docker_prerequisites creates tor/data with chown -R 1000:1000, but INST-03 per the ROADMAP Success Criteria says 'install.sh creates a valid torrc config file with SocksPort and HiddenService directives before starting containers'. install.sh does NOT create torrc -- the files are pulled from the repository (setup_repository does git clone). The torrc files exist in the repo (tor-proxy-torrc, tor-server-torrc) and are referenced at runtime by app-environment.ts, not created by the installer. The PLAN's interfaces section explicitly acknowledged this ('These torrc files ALREADY EXIST in the repo') but the ROADMAP Success Criterion and INST-03 requirement both say install.sh creates them."
    artifacts:
      - path: "livos/install.sh"
        issue: "No torrc creation logic exists in install.sh. torrc comes from git clone, not from installer."
      - path: "livos/packages/livinityd/source/modules/apps/legacy-compat/tor-proxy-torrc"
        issue: "File exists in repo with SocksPort directive but no HiddenService -- only tor-server-torrc has HiddenService directives."
    missing:
      - "Clarify INST-03: if torrc is satisfied by repo-sourced files (acceptable), mark explicitly in requirements. If install.sh must create it, add torrc creation to setup_docker_prerequisites."
      - "tor-proxy-torrc lacks HiddenService directives (only tor-server-torrc has them). If INST-03 requires HiddenService in the default config, tor-proxy-torrc is incomplete."
human_verification:
  - test: "Run install on fresh Ubuntu server and check docker ps"
    expected: "docker ps shows auth and tor_proxy containers running after install completes"
    why_human: "Cannot run full install script in this environment -- requires fresh Ubuntu server with Docker"
---

# Phase 16: Install Script Docker Fix Verification Report

**Phase Goal:** Running a single `curl | bash` command on a fresh server results in a fully working LivOS with auth-server, tor proxy, and tunnel connected -- no manual Docker steps
**Verified:** 2026-03-20T12:00:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | setup_docker_images() pulls getumbrel/auth-server:1.0.5 and tags as livos/auth-server:1.0.5, failing the install if pull fails | VERIFIED | Line 316: image entry exists; line 331-332: `fail "Failed to pull $src"` (not warn) |
| 2 | setup_docker_images() pulls getumbrel/tor:0.4.7.8 and tags as livos/tor:0.4.7.8, failing the install if pull fails | VERIFIED | Line 317: image entry exists; same fail-fast handler at line 331-332 |
| 3 | install.sh creates /opt/livos/data/tor/data directory with 1000:1000 ownership before services start | VERIFIED | Lines 348-363: setup_docker_prerequisites() function; line 354: mkdir -p tor/data; line 360: chown -R 1000:1000; called at line 1165 before create_systemd_service (1186)/start_services (1187) |
| 4 | After install.sh completes and livos.service starts, docker compose up succeeds because images exist and tor/data dir is ready | VERIFIED (programmatic) | All prerequisites met: images tagged, tor/data created with correct ownership, app-data created, torrc files in repo, env vars supplied by app-environment.ts at runtime. Needs human confirmation that docker ps shows running containers. |
| 5 | Kimi CLI section cannot crash the entire install even if kimi binary is missing or install-kimi.sh fails | VERIFIED | Lines 1167-1183: entire Kimi block wrapped in subshell `( ... ) \|\| warn "Kimi CLI setup skipped (non-critical)"`. Inner commands also use `\|\| true` defense-in-depth. |

**Score:** 4/5 truths verified with full confidence (Truth 4 partially verified programmatically; Truth 3/INST-03 contains a definition mismatch described below)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `livos/install.sh` | Complete one-command installer with Docker image setup, tor data prep, and resilient Kimi handling | VERIFIED | File exists, 1236 lines, `bash -n` syntax check passes. Contains setup_docker_images (line 311), setup_docker_prerequisites (line 348), Kimi subshell wrapper (line 1167-1183), dependency chain comment (lines 1100-1107). |
| `livos/packages/livinityd/source/modules/apps/legacy-compat/tor-proxy-torrc` | torrc with SocksPort directive | PARTIAL | File exists with SocksPort directive. No HiddenService directives -- INST-03 requirement mentions HiddenService but only tor-server-torrc contains them. |
| `livos/packages/livinityd/source/modules/apps/legacy-compat/tor-server-torrc` | torrc with SocksPort and HiddenService directives | VERIFIED | File exists with SocksPort, ControlPort, HashedControlPassword, HiddenServiceDir (/data/web, /data/auth), HiddenServicePort directives. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| install.sh (setup_docker_images) | docker pull getumbrel/auth-server:1.0.5 | docker pull + docker tag commands | WIRED | Line 316 defines entry; line 330-336 executes pull+tag; line 331-332 uses fail() on error |
| install.sh (setup_docker_images) | docker pull getumbrel/tor:0.4.7.8 | docker pull + docker tag commands | WIRED | Line 317 defines entry; same execution path as above |
| install.sh (setup_docker_prerequisites) | /opt/livos/data/tor/data directory | mkdir -p + chown 1000:1000 | WIRED | Line 354: mkdir -p "$data_dir/tor/data"; line 360: chown -R 1000:1000 "$data_dir/tor" |
| install.sh (setup_docker_prerequisites) | docker-compose.yml tor/data mount | tor/data dir created before start_services | WIRED | Call at line 1165 precedes create_systemd_service (1186) and start_services (1187) |
| install.sh (kimi section) | install completion | subshell + \|\| warn prevents abort | WIRED | Line 1183: `) \|\| warn "Kimi CLI setup skipped (non-critical)"` |
| install.sh (setup_repository) | tor-proxy-torrc, tor-server-torrc | git clone pulls these repo files | WIRED | Lines 660-680: git clone copies entire repo including legacy-compat files to /opt/livos |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| INST-01 | 16-01-PLAN.md | install.sh pulls getumbrel/auth-server:1.0.5 and tags as livos/auth-server:1.0.5 | SATISFIED | Line 316 + lines 330-342 in setup_docker_images |
| INST-02 | 16-01-PLAN.md | install.sh pulls getumbrel/tor:0.4.7.8 and tags as livos/tor:0.4.7.8 | SATISFIED | Line 317 + lines 330-342 in setup_docker_images |
| INST-03 | 16-01-PLAN.md | install.sh creates torrc config file with SocksPort and HiddenService directives | DEFINITION MISMATCH | The PLAN treats torrc as pre-existing repo files (acknowledged in interfaces section: "These torrc files ALREADY EXIST in the repo"). install.sh does not create torrc -- it clones the repo which contains tor-proxy-torrc and tor-server-torrc. The files contain SocksPort and (in tor-server-torrc) HiddenService directives. Whether this satisfies "install.sh creates torrc" depends on interpretation: git clone is part of install, but setup_docker_prerequisites does not write torrc. Additionally tor-proxy-torrc (the default non-tor mode) lacks HiddenService directives. |
| INST-04 | 16-01-PLAN.md | install.sh starts auth + tor containers via docker compose automatically | SATISFIED (programmatic) | setup_docker_prerequisites ensures prerequisites; create_systemd_service + start_services trigger livinityd which calls docker compose up. Human test needed to confirm containers run. |
| INST-05 | 16-01-PLAN.md | Single curl \| bash --api-key KEY results in fully working LivOS with auth + tor + tunnel | SATISFIED (programmatic) | All install flow prerequisites verified in code. Human test needed for end-to-end confirmation. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| livos/install.sh | 657 | `git pull --ff-only 2>/dev/null \|\| warn "Git pull failed, continuing with existing code"` | Info | Git pull failure is non-blocking for update path (existing install). Safe for first install since it only runs when repo already exists. Not a blocker. |

No TODO/FIXME/placeholder patterns found in install.sh modifications. No empty implementations or hardcoded stub data found in the affected functions.

### Human Verification Required

#### 1. End-to-End Install Test

**Test:** Run `curl -sSL https://livinity.io/install.sh | bash -s -- --api-key TEST_KEY` on a fresh Ubuntu 22.04/24.04 server
**Expected:** Install completes without error; `docker ps` shows `auth` and `tor_proxy` containers in running state; livos.service is active
**Why human:** Cannot run full install script in this verification environment -- requires fresh Ubuntu server with internet access, Docker socket, and valid network conditions

#### 2. Kimi CLI Failure Resilience

**Test:** On a server where `install-kimi.sh` is missing or broken, run install.sh
**Expected:** Install proceeds past the Kimi section with a warning "Kimi CLI setup skipped (non-critical)" and completes successfully
**Why human:** Requires intentionally broken Kimi setup to confirm the subshell isolation works end-to-end

### Gaps Summary

**One definition mismatch gap: INST-03 torrc interpretation**

The ROADMAP Success Criterion 2 states: "install.sh creates a valid torrc config file with SocksPort and HiddenService directives before starting containers."

The implementation delivers: torrc files are present in the repository source tree (`tor-proxy-torrc`, `tor-server-torrc` in `packages/livinityd/source/modules/apps/legacy-compat/`) and are copied to the server during `setup_repository` (git clone). The `setup_docker_prerequisites` function does not create torrc -- it only creates `tor/data` and `app-data` directories.

The PLAN explicitly acknowledged this approach: "These torrc files ALREADY EXIST in the repo at packages/livinityd/source/modules/apps/legacy-compat/" and listed torrc as a prerequisite already covered by the repo, not by install.sh. This design is architecturally sound -- keeping torrc in source control is correct practice. However:

1. The INST-03 requirement text says "install.sh creates" which may mean "the install process provides" (met) or specifically "install.sh writes the file" (not met literally)
2. `tor-proxy-torrc` (the default non-tor mode file) contains SocksPort but NOT HiddenService directives. Only `tor-server-torrc` has HiddenService. If INST-03 requires both in the default config, this is a real gap.

**Recommended resolution:** Either (a) update INST-03 to say "install process makes torrc available" reflecting the actual correct design, or (b) add explicit torrc creation in `setup_docker_prerequisites` that generates the file from scratch for clarity. The current implementation is functionally correct for the install goal but technically mismatches the literal INST-03 wording.

All other must-haves are fully satisfied with direct code evidence. The four core bugs described in the phase objective are fixed: fail-fast on image pull failure, tor/data directory creation with correct ownership, app-data directory creation, and Kimi CLI isolation.

---

_Verified: 2026-03-20T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
