---
phase: 223-vendor-aionui-install
plan: 05
subsystem: v42-liv-assistant
tags: [deploy, mini-pc, smoke-test, vendor-aionui, sha-pinned, cleanup-222]
requires:
  - 223-01: installer scaffold (`scripts/install-liv-assistant.sh`, SHA-pinned, idempotent)
  - 223-02: systemd unit (`systemd/liv-assistant.service`, port 3020)
  - 223-03: password capture helper (`scripts/capture-liv-assistant-password.sh`)
  - 223-04: operator runbook (`docs/liv-assistant-install.md`)
  - 222: spike feasibility (PID 129244 on port 9099 — cleaned up here)
provides:
  - Mini PC `liv-assistant.service` active on 127.0.0.1:3020
  - `/etc/livos/liv-assistant-credentials` (admin / `<16-char password>`, 0600 bruce:bruce)
  - Live audit transcript at `.planning/phases/223-vendor-aionui-install/223-05-DEPLOY-LOG.md`
  - Unlock for Wave B (224 store tab hides, 225 dashboard widget, 232 Caddy brand sub)
affects:
  - Mini PC `/opt/liv-assistant/` (created)
  - Mini PC `/etc/systemd/system/liv-assistant.service` (installed, enabled)
  - Mini PC `/etc/livos/liv-assistant-credentials` (created)
  - Mini PC `/tmp/v42-spike/` (Phase 222 spike — removed)
  - Mini PC port 9099 (freed — Phase 222 spike PID 129244 killed)
tech-stack:
  added: []   # zero new dependencies — pure deploy of prior plans' artifacts
  patterns:
    - "scp via Windows bundled OpenSSH (C:/Windows/System32/OpenSSH/scp.exe) for artifact transfer"
    - "batched single-SSH-session deploy steps to respect fail2ban rate-limit (MEMORY: feedback_ssh_rate_limit)"
    - "SHA hard-gate test via patched EXPECTED_SHA256 constant (variant 2) — proves die path, distinct from self-healing cache-corruption path (variant 1)"
key-files:
  created:
    - path: .planning/phases/223-vendor-aionui-install/223-05-DEPLOY-LOG.md
      purpose: 333-line audit transcript (preflight + install + smoke + SHA negative + cleanup + sacred SHA check + SC-01..SC-08 checklist + residual state table)
  modified: []   # zero source files modified (sacred SHA invariant honored)
decisions:
  - "SC-02 implemented as TWO test variants: (1) corrupt cached tarball → exercises self-healing re-download path; (2) patched EXPECTED_SHA256 → exercises hard-gate `die`. Plan as-written only spec'd variant 1, which doesn't actually fire the hard-gate (cache corruption is self-healed by re-download). Variant 2 added to prove the hard-gate's `die` path is wired correctly. Both variants logged."
  - "Task 2 (checkpoint:human-verify) auto-approved per --auto chain mode workflow rule — operator UAT walk (browser login + Claude Code agent visibility) deferred to next operator Mini PC session. All 8 automated SCs GREEN, so manual walk is expected to confirm cleanly."
  - "Live Claude Code agent chat-turn E2E (sending an actual prompt through subscription auth) deliberately deferred to Phase 233 UAT to avoid burning subscription tokens during deploy verification."
metrics:
  duration_minutes: 6
  completed_date: "2026-05-27"
  ssh_sessions: 6
  mini_pc_state_changes: 7  # install, systemd unit, enable, credentials capture, idempotency re-run, sha-test corruption, phase 222 cleanup
  bytes_downloaded: 93700000  # ~93.7 MB AionUi v2.1.4 tarball + 10.9 KB Apache LICENSE
deviations:
  - rule: "Rule 3 — auto-fix blocking issue"
    description: "SC-02 hard-gate test (variant 1, corrupt cached tarball) did not fire the `die SHA256 mismatch` path because the installer self-heals via re-download. Added variant 2 (patched EXPECTED_SHA256) which DOES fire the hard-gate. This is documented as a design clarification, not an installer bug — the self-healing path is correct behavior, and the hard-gate fires only when upstream itself drifts (impossible from pinned upstream URL). Both variants logged in DEPLOY-LOG.md for full audit."
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
---

# Phase 223 Plan 05: Mini PC live deploy + UAT (auto-approved checkpoint) Summary

Plan 223-05 executed end-to-end on `bruce@10.69.31.68` (Mini PC, bruce-EQ, Ubuntu 24.04). All 8 success criteria GREEN. liv-assistant.service is `active (running)` on 127.0.0.1:3020 with main PID 201259 + aioncore subprocess 201286, first-boot admin password captured to `/etc/livos/liv-assistant-credentials` (0600 bruce:bruce, 16 chars) on the first poll attempt, Phase 222 spike scratch (`/tmp/v42-spike/` + PID 129244 on port 9099) cleaned up, sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged throughout. Task 2 checkpoint:human-verify auto-approved per `--auto` chain mode — operator UAT browser walk deferred to next Mini PC session.

## Tasks

### Task 1 (auto): Push artifacts + install + smoke + cleanup ✓
**Commit:** `12279e70`
**Steps executed (6 SSH sessions, batched per fail2ban rate-limit):**

1. **Preflight** (1 SSH session) — confirmed bruce sudo, port 3020 free, bun 1.3.14 + claude CLI + creds present, no prior liv-assistant unit, Phase 222 spike alive (PID 129244, port 9099)
2. **Transfer** (scp) — 4 files to `/tmp/liv-assistant-deploy/` (installer 12 KB, capture script 2.6 KB, systemd unit 977 B, runbook 7.5 KB)
3. **Install + enable + capture** (1 SSH session) — installer ran (download 93.7 MB in 13 s, SHA verified, extract, symlink, LICENSE fetch from upstream tag v2.1.4, NOTICE stub written, UPSTREAM.md written, bun detected skipped), systemd unit installed + `enable --now`, password captured on attempt 1
4. **Smoke test SC-01,03-07** (1 SSH session) — all green, idempotent re-run produced empty file-set diff
5. **SC-02 negative test** (2 SSH sessions) — variant 1 (corrupt cache) exercised self-healing re-download, variant 2 (patched EXPECTED_SHA256) confirmed hard-gate `die` path fires with clear error + tarball deletion
6. **Phase 222 cleanup** (1 SSH session) — PID 129244 killed, `/tmp/v42-spike/` removed, port 9099 freed, liv-assistant on 3020 unaffected

### Task 2 (checkpoint:human-verify): Operator eyeball — AUTO-APPROVED ⚡
Per `--auto` chain mode workflow rule, `human-verify` checkpoints auto-approve. Operator UAT (browser → http://10.69.31.68:3020/ → login admin / `<captured 16-char password>` → confirm Claude Code agent appears) deferred to next Mini PC session per runbook `docs/liv-assistant-install.md`. All 8 automated SCs are green so manual walk is expected to be a no-op confirmation.

**Get the captured password later:** `ssh -i .../minipc bruce@10.69.31.68 'sudo cat /etc/livos/liv-assistant-credentials'`

## Files Created

- `.planning/phases/223-vendor-aionui-install/223-05-DEPLOY-LOG.md` — full audit transcript with the 6 SSH-session outputs, sacred SHA verification, SC checklist (plain-text + detailed), residual state table, operator UAT walk reference

## Files Modified

**None.** Zero source files touched. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` invariant honored.

## Verification

| Check | Method | Result |
|---|---|---|
| SC-01 idempotent installer | `find /opt/liv-assistant -maxdepth 3 -type f -printf '%p %s\n' \| sort` before/after re-run → diff | GREEN (empty diff) |
| SC-02 SHA hard-gate | Patched `EXPECTED_SHA256` to `deadbeef…`, ran installer | GREEN (`ERROR: SHA256 mismatch... Aborting.` + tarball deleted) |
| SC-03 systemctl active | `systemctl is-active liv-assistant` | GREEN (`active`, PID 201259 + 201286) |
| SC-04 HTTP 200, no XFO, no CSP | `curl -sSI http://127.0.0.1:3020/` | GREEN (200 OK, headers: Date / Content-Length / Content-Disposition / Accept-Ranges / Last-Modified / Content-Type — no XFO, no CSP) |
| SC-04b API responding | `curl http://127.0.0.1:3020/api/auth/status` | GREEN (`{"success":true,"needs_setup":false,"user_count":1,"is_authenticated":false}`) |
| SC-05 creds file | `stat -c '%a %U:%G' /etc/livos/liv-assistant-credentials` | GREEN (`600 bruce:bruce`, 16-char password) |
| SC-06 LICENSE | `head -3 /opt/liv-assistant/LICENSE` | GREEN (Apache License 2.0 header) |
| SC-07 UPSTREAM.md | `cat /opt/liv-assistant/UPSTREAM.md` | GREEN (URL + version 2.1.4 + SHA + Apache-2.0 all present) |
| SC-08 sacred SHA | `git ls-files -s liv/packages/core/src/sdk-agent-runner.ts` | GREEN (`f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged) |
| Plan automated verify grep | `test -f ... && grep SC-01 && grep SC-08 && grep systemctl is-active && grep f3538e1d... && grep '\[x\] SC-0[1-8]'` | GREEN (after adding plain-text checklist block alongside detailed entries) |
| Sacred SHA hook | Pre-commit `sacred-sha` on `12279e70` | PASS (20 files verified) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] SC-02 variant 1 (corrupt cached tarball) does NOT fire the hard-gate `die`**
- **Found during:** Step 5 (first SHA negative test)
- **Issue:** Corrupting `/opt/liv-assistant/cache/aionui-web-2.1.4-linux-x86_64.tar.gz` triggers the installer's self-healing path: it detects cached SHA mismatch, deletes the bad tarball, re-downloads from upstream, and verifies. No `die "SHA256 mismatch"` fires because the re-download produces a clean tarball that matches the pinned SHA. The plan as-written assumed corruption would fire the hard-gate, which is incorrect.
- **Fix:** Added a second test variant (variant 2): patched `EXPECTED_SHA256` to `deadbeef…` in a script copy, ran installer. This forces the post-download SHA verify to fail and DOES fire the `die "SHA256 mismatch"` path with proper error message + tarball deletion + non-zero exit. SC-02 is GREEN via variant 2.
- **Files modified:** None on Mini PC (test script copy in `/tmp/install-badsha.sh` was cleaned up). On repo side, DEPLOY-LOG.md documents both variants.
- **Why this isn't an installer bug:** The self-healing-on-corruption behavior is correct and desirable — operators with a corrupted cache shouldn't have to manually re-download. The hard-gate only fires when upstream itself drifts (impossible from a pinned URL, but defensive against MITM / DNS-poison / GitHub release re-roll). Both behaviors are now documented in the runbook context.
- **Commit:** `12279e70` (DEPLOY-LOG.md captures both variants)

**2. [Plan verify grep mismatch] Initial checklist used `[x] **SC-0N:**` (markdown bold) but plan's verify grep is `\[x\] SC-0[1-8]` (no bold)**
- **Found during:** Step 8 (verify grep dry-run after writing DEPLOY-LOG.md)
- **Issue:** All 8 checkboxes were written as `- [x] **SC-01:** …` (markdown-rendered as bold), which doesn't match `\[x\] SC-0[1-8]` literally.
- **Fix:** Added a plain-text fenced checklist block above the detailed entries, with format `[x] SC-01 — installer idempotent …`. Both forms now present. Verify grep returns OK.
- **Commit:** `12279e70`

### Auth gates

None. SSH key auth via bundled Windows OpenSSH worked first try. No subscription token spend (Claude Code agent E2E deferred to Phase 233 UAT).

## Known Stubs

None. Zero source files modified; this plan only produced an audit transcript + summary.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what Plan 223-02 (systemd unit) already declared. liv-assistant.service binds to `127.0.0.1:3020` (loopback-only); future Caddy reverse-proxy + brand-sub (Phase 232) will gate external exposure.

## Operator UAT walk (deferred)

When operator next sits at a browser:

1. Visit `http://10.69.31.68:3020/` — should load AionUi login page (white bg, AionUi logo, login form)
2. Fetch password: `ssh -i .../minipc bruce@10.69.31.68 'sudo cat /etc/livos/liv-assistant-credentials'`
3. Login as `admin` / `<password>` → dashboard should appear
4. Open agent picker → "Claude Code" should show as `available`
5. (Optional, defer to Phase 233 UAT) Send "say hi" turn — costs subscription tokens

If any step fails, paste the failure and a follow-up plan can diagnose. All 8 automated SCs are green so this is expected to be a clean confirmation.

## Self-Check: PASSED

- `.planning/phases/223-vendor-aionui-install/223-05-DEPLOY-LOG.md` — FOUND
- `.planning/phases/223-vendor-aionui-install/223-05-SUMMARY.md` (this file) — being written
- Commit `12279e70` — FOUND in `git log --oneline -5`
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — verified unchanged in pre-commit hook (`[sacred-sha] PASS: 20 files verified`)
- Plan verify grep — PASS (all 5 grep predicates GREEN)
