---
phase: 251-fresh-install-portability-audit
verified: 2026-05-29T00:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 251: Fresh-Install Portability Audit — Verification Report

**Phase Goal:** A definitive, evidence-backed answer to two questions — (1) Do the recent session's changes introduce hardcodes that break fresh-install portability? (2) Could a fresh `get.livinity.io` install bring up the full Luse + terminal stack seamlessly? Plus a severity-ranked remediation backlog.
**Verified:** 2026-05-29
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Eight per-dimension findings docs exist (251-01 through 251-08-FINDINGS.md) with evidence-backed content | ✓ VERIFIED | All 8 files present under `findings/`; line counts 76–160 lines each (total 1020 lines); 17 git commits across Wave 1 |
| 2 | PORTABILITY-AUDIT.md answers both operator questions with a per-dimension COVERED/GAP/RISK matrix | ✓ VERIFIED | 156-line file; Q1 answered (3 NEW hardcodes enumerated with file:line); Q2 answered (NO-GO verdict with 5 P0 blockers listed); 30-row dimension matrix present |
| 3 | REMEDIATION-BACKLOG.md is severity-ranked (P0/P1/P2) with concrete file:line + effort per item | ✓ VERIFIED | 153-line file; 16 items R1–R16; each item has file:line, change description, effort (S/M/L), kind (installer/code/both); copy-pasteable apt block included; Phase 252 wave sequencing plan included |
| 4 | Citations are grounded in real code (spot-checked) | ✓ VERIFIED | Spot-checked 6 key citations: `server.ts:124` fallback array matches exactly; `ws-handler.ts:466` `username:'bruce'` confirmed; `types.ts:31` literal type confirmed; `session.ts:77` guard + `:82` argv confirmed; `display-manager.ts:216` mode default `'xephyr'` confirmed; `feature-flag.ts:28-33` confirmed; `sudoers.d/livinityd:46-53` confirmed (no bash/login grant); `deploy-livinityd.sh:513-524` confirmed (no `xserver-xephyr`/`xterm`); `liv-assistant.service` confirmed (no `EnvironmentFile`, no `REDIS_URL`) |
| 5 | 251-SUMMARY.md exists and captures the headline verdict + cross-references | ✓ VERIFIED | 76-line file; Q1/Q2 verdicts present; links to both synthesis docs; deviations section (none); self-check section |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `findings/251-01-FINDINGS.md` | Luse Redis-URL resolution portability | ✓ VERIFIED | 160 lines; task 1 (runtime chain with line cites `server.ts:113-139`) + task 2 (install-side table) + per-path verdicts + fix recommendations |
| `findings/251-02-FINDINGS.md` | Display backend (Xephyr/Xvfb) portability | ✓ VERIFIED | 117 lines; 9-row findings table; explains silent false-positive with code walk of `display-manager.ts:224-253`; 4 fix options |
| `findings/251-03-FINDINGS.md` | External-binary dependency matrix | ✓ VERIFIED | 137 lines; 17-binary table with spawn site, error path, apt package; coverage diff against installer; definitive missing-package list |
| `findings/251-04-FINDINGS.md` | Identity hardcodes | ✓ VERIFIED | 126 lines; 11-literal table; three-layer `bruce` pin characterised; `LUSE_USER_ID` admin-vs-bruce divergence documented |
| `findings/251-05-FINDINGS.md` | Install-root & sandbox paths | ✓ VERIFIED | 138 lines; leaky-parameter verdict; 12-row assumption table; `/tmp` multi-user surface; install-root contract analysis |
| `findings/251-06-FINDINGS.md` | systemd env delivery | ✓ VERIFIED | 133 lines; per-service env table; explains why live box works but fresh box is fragile; confirms `redis-env.conf` is absent from all installers |
| `findings/251-07-FINDINGS.md` | Terminal hot-fix portability | ✓ VERIFIED | 76 lines; per-item table (5 items); 2 blockers identified (sudoers gap + feature-flag seed); confirms WS host derivation is fully relative |
| `findings/251-08-FINDINGS.md` | Installer-path divergence & MCP-seed integrity | ✓ VERIFIED | 133 lines; 4-entrypoint divergence table; resolves the "Phase 241 seed" mystery (runtime orchestrator, not shell); get.livinity.io mapping UNPROVABLE finding |
| `PORTABILITY-AUDIT.md` | Consolidated verdict + 30-row matrix + both Q verdicts | ✓ VERIFIED | 156 lines (≥60 min); all dimensions present; cross-dedup section; live corroboration noted as SKIPPED with justification |
| `REMEDIATION-BACKLOG.md` | Severity-ranked backlog ready to become Phase 252 | ✓ VERIFIED | 153 lines (≥40 min); R1–R16; P0/P1/P2 tiers; copy-pasteable apt block; 5-wave Phase 252 sequencing |
| `251-SUMMARY.md` | Phase summary | ✓ VERIFIED | 76 lines; headline verdict; deviations (none); self-check PASSED with commit SHAs |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| Per-dimension findings (251-01..08) | PORTABILITY-AUDIT.md | Cross-references | ✓ WIRED | Every PORTABILITY-AUDIT.md row cites the source findings doc (e.g. "251-02 → `display-manager.ts:216`") |
| PORTABILITY-AUDIT.md gaps | REMEDIATION-BACKLOG.md items | "From: 251-0X" field in each backlog item | ✓ WIRED | Every backlog item has a "From:" attribution to the findings doc that surfaced it |
| REMEDIATION-BACKLOG.md | Phase 252 (next phase) | "seed for Phase 252" designation | ✓ WIRED | PORTABILITY-AUDIT.md bottom line and SUMMARY both reference Phase 252 as the remediation target |
| Cross-cutting gaps (PTY bruce, Xauthority) | De-duplication section | PORTABILITY-AUDIT.md §"De-duplicated cross-referenced findings" | ✓ WIRED | 4 cross-cutting defects explicitly deduplicated with backlog item assignments |

---

### Data-Flow Trace (Level 4)

Not applicable — this is a read-only audit phase. Deliverables are markdown documents, not runnable components rendering dynamic data.

---

### Behavioral Spot-Checks

Step 7b SKIPPED — read-only audit phase. No runnable code was modified; no entry points to invoke.

---

### Requirements Coverage

Phase 251 has no REQUIREMENTS.md rows by design (noted in verification instructions). The two plan-declared requirements (`PORT-251-LUSE-REDIS` in Plan 01 and `PORT-251-SYNTHESIS` in Plan 09) are satisfied by the findings docs and synthesis outputs respectively.

---

### Anti-Patterns Found

None applicable. Phase 251 is read-only; it creates only `.planning/phases/251-*/` markdown documents. No source code was modified. The D-251-READONLY invariant is confirmed by: (1) all git commits for phase 251 are prefixed `docs(251-...)`, and (2) `git diff` of all 251 commits touches only `.planning/` paths.

---

### Human Verification Required

None. All must-haves are verifiable programmatically:

- File existence and substantive content: confirmed by file reads and line counts
- Citation accuracy: confirmed by spot-checking 6+ key code references against actual source
- Cross-consistency: confirmed by tracing citations across all findings into the synthesis documents

The audit itself flags one item requiring human/operational verification (the `get.livinity.io` DNS/Vercel mapping, Dim 8), but that is a **finding** captured in the backlog (R11), not a gap in the audit deliverables themselves. The audit correctly acknowledges this is outside repo scope.

---

### Gaps Summary

No gaps. The phase achieved its goal: both operator questions are answered definitively with evidence, the 30-row dimension matrix is internally consistent across all eight findings docs, and the remediation backlog (R1–R16) is concrete and actionable. The audit correctly identifies the one item that cannot be settled from the repo alone (`get.livinity.io` alias mapping) and captures it as a tracked backlog item rather than leaving it as an open question.

**Citation spot-check results (grounded in real code, not hallucinated):**

| Citation | Claimed | Actual | Match |
|----------|---------|--------|-------|
| `server.ts:124` | `['/opt/livos/.env', '/opt/livos/livos/.env']` literal | Confirmed — exact text present at line 124 | ✓ |
| `ws-handler.ts:466` | `username: 'bruce'` literal | Confirmed — `username: 'bruce',` at line 466 | ✓ |
| `types.ts:31` | `username: 'bruce'` string-literal type | Confirmed — `username: 'bruce'` at line 31 | ✓ |
| `session.ts:77` | `!== 'bruce'` guard throws | Confirmed — `if (this.#opts.username !== 'bruce')` at line 77 | ✓ |
| `display-manager.ts:216` | `input.mode ?? 'xephyr'` default | Confirmed — `const mode: DisplayMode = input.mode ?? 'xephyr'` at line 216 | ✓ |
| `feature-flag.ts:28-33` | `=== 'true'` only | Confirmed — `return value === 'true'` at line 32 | ✓ |
| `deploy-livinityd.sh:513-524` | No `xserver-xephyr` or `xterm` | Confirmed — block contains `x11vnc xdotool x11-xserver-utils ydotool maim scrot gnome-screenshot websockify vncsnapshot ffmpeg gstreamer... xvfb fluxbox`; no xephyr/xterm | ✓ |
| `deploy-livinityd.sh:61` | Hard literal `_DLD_LIVOS_DIR="/opt/livos"` | Confirmed — bare literal with no `${VAR:-default}` | ✓ |
| `deploy-livinityd.sh:988` | `REDIS_URL=redis://default:${_DLD_REDIS_PASS}@127.0.0.1:6379` | Confirmed — exact line present | ✓ |
| `liv-assistant.service` | No `EnvironmentFile`, no `REDIS_URL` | Confirmed — only `PATH`, `HOME`, `MCP_TIMEOUT` env vars; no EnvironmentFile | ✓ |
| `sudoers.d/livinityd:46-53` | No bash/login-shell Cmnd_Alias | Confirmed — only LIVINITYD_LAUNCH_CHROME, LIVINITYD_GOOGLE_CHROME, LIVINITYD_XVFB, LIVINITYD_X11VNC, LIVINITYD_XDOTOOL | ✓ |

---

_Verified: 2026-05-29_
_Verifier: Claude (gsd-verifier)_
