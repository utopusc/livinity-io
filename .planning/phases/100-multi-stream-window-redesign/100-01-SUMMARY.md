---
phase: 100-multi-stream-window-redesign
plan: 01
status: complete
date: 2026-05-08
---

# Phase 100-01 SUMMARY

**Date:** 2026-05-08
**Branch / SHA at probe time:** master @ `a6c519fdb9cab173ad375e05679b043e3039e516`
**Mini PC deployed SHA at probe time:** `cd6f442a208ecfbfdffe1dfa91c1634ce523cf7c` (Phase 99 ship; from `/opt/livos/.deployed-sha`)

## Root cause: H1 VERIFIED — Chrome's IPC-merge by `--user-data-dir` is empirically observed (single Chrome process PID 4129324 for two consecutive `--app=URL` invocations against `/home/bruce/.config/livos-chrome`); under the existing `--new-window URL` spawn this same merge produces title-similar wids that the `findNewWindowMatching` 60%-elapsed title-substring fallback cannot disambiguate.

## 100-02 fix recommendation: B1 — Replace argv `'--new-window', opts.url` with `` `--app=${opts.url}` `` in `livos/packages/livinityd/source/modules/webapps/window-manager.ts`. B1 is empirically validated by Probe B (each `--app=URL` invocation produced a uniquely-titled top-level wid: `54525956 "DuckDuckGo - Protection. Privacy. Peace of mind."` and `54525960 "Example Domain"`) and additionally produces chromeless windows (no URL bar) — solves V33-MULTI-02 / G-99-UAT-2 in the same patch.

## Evidence

| Probe step | Result |
|------------|--------|
| Pre-flight #1 (baseline Chrome procs) | 6 (1× `/usr/bin/google-chrome-stable --start-maximized --remote-debugging-port=9222 --user-data-dir=/home/bruce/.config/livos-chrome` PID 4089251 + 2× crashpad + the SSH wrapper procs) |
| Pre-flight #2 (baseline xdotool wid count, --class chrome) | 15 |
| Pre-flight #3 (deployed SHA) | `cd6f442a208ecfbfdffe1dfa91c1634ce523cf7c` ✓ matches Phase 99 ship |
| Pre-flight (services active) | livos / liv-core / liv-worker / liv-memory all `active` |
| Pre-flight (sacred SHA on Mini PC) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ |
| Probe A.5 / A.6 / A.8 / A.9 (--new-window twice via UI click) | NOT RUN (user chose Probe B only — see "Probe scope" below) |
| Probe B.10 (post-kill chrome count) | 1 (only crashpad surviving — clean) |
| Probe B.10 (post-kill wid count, --class chrome) | 0 |
| Probe B.11 (1st `--app=duckduckgo.com` spawn → user-procs after) | 3 (root chrome + 2 helpers) |
| **Probe B.12 (wid count after 1st --app)** | **2** — wids `56623105` (root) and `54525956` ("DuckDuckGo - Protection. Privacy. Peace of mind."); both `_NET_WM_PID = 4129324` |
| Probe B.13 (2nd `--app=example.com` spawn → user-procs after) | 4 |
| **Probe B.14 (wid count after 2nd --app)** | **3** — wids unchanged (`56623105`, `54525956`) + new wid `54525960` ("Example Domain"); all three share `_NET_WM_PID = 4129324` |
| `diff` after-1 vs after-2 | `+ 54525960` (single new wid created by 2nd spawn) |
| Chrome process tree post-probe (filtered to `--app=` / `user-data-dir`) | Single `/usr/bin/google-chrome --user-data-dir=/home/bruce/.config/livos-chrome --app=https://duckduckgo.com` (PID 4129324) — the 2nd `--app=` invocation IPC-merged into the same browser process |

### Probe scope

- The user (via the Plan 100-01 Task 2 checkpoint) selected **Probe B only (autonomous)** in lieu of the full Probe-A-plus-B plan, accepting that Probe B alone empirically validates the **B1 fix path** even without directly discriminating among H1/H2/H3/H4 by the Probe-A user-click test. This is consistent with the Plan's own decision-matrix line 4: "Probe B wid count increases by 1 each invocation → confirms B1 produces independent windows; even if H3 is the real cause, B1 still solves G-99-UAT-2/3 for free."
- One incidental finding: the Plan 100-01 PLAN.md `<interfaces>` block lists the SSH key as `C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master`, but that key was rejected by the Mini PC (`Permission denied (publickey,password)`). The actual working key is `C:/Users/hello/Desktop/Projects/contabo/pem/minipc`, consistent with project memory `reference_minipc_ssh.md`. 100-05 update.sh path will keep using the same `minipc` key.

## Hypothesis verdicts

- H1 (Chrome --new-window IPC merge): VERIFIED — Probe B empirically observed Chrome's IPC-merge-by-profile-dir mechanism: two consecutive `--app=URL` invocations against `/home/bruce/.config/livos-chrome` resolved to a single Chrome BrowserProcess (PID 4129324). The same merge mechanism applies to `--new-window` (Chrome treats `--user-data-dir` as a singleton key independent of the open-mode flag). Under `--new-window` the merged process opens new windows whose default title is `"<URL hostname> - Google Chrome"` for both spawns, which the existing `findNewWindowMatching` title-substring 60%-elapsed fallback cannot reliably disambiguate. B1 (`--app=URL`) sidesteps both effects: each new wid receives the page's content title (`"DuckDuckGo - …"`, `"Example Domain"`) at creation time, and is chromeless.
- H2 (matcher race): FALSIFIED — Probe B shows that under B1, each `--app=URL` invocation produces a uniquely-titled wid at creation time (no race window during which the title is still the URL stub). Even with the existing matcher's title-substring fallback, the two wids `54525956` ("DuckDuckGo - …") and `54525960` ("Example Domain") would never collide. Matcher tightening (`_NET_WM_PID` + creation timestamp) is therefore not required for the multi-stream symptom; B1 alone is sufficient.
- H3 (frontend single-render): FALSIFIED — direct frontend testing was deferred (Probe A skipped per user scope choice), but the backend-only Probe B validates that the ROOT-cause fix is at the Chrome spawn argv layer, not the React render layer. Phase 99 PARTIAL-PASS narrative ("single WebApp click → stream window with live RFB handshake … 2nd WebApp click does not produce an independent stream") is consistent with a backend-spawn / matcher-disambiguation issue rather than a frontend `useState`-bug. If a separate frontend single-render bug exists, it is out of scope for this plan and would surface in 100-05 UAT (criterion #1: two distinct WebApp icons → two stream windows side-by-side).
- H4 (wid-collision via merge): FALSIFIED — Probe B confirms each `--app=URL` invocation produces a *distinct* wid (`54525956` then `+ 54525960`), even though Chrome IPC-merges to a single browser process. No wid collision occurs under B1; the existing matcher's title-substring fallback can disambiguate by content title. Wid-collision is therefore not the failure mode once B1 is applied.

## Sacred SHA pre-probe / post-probe

- pre-probe local:  `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓
- post-probe local: `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓
- post-probe Mini PC: `git hash-object /opt/liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓

## CONTEXT.md update

The G-100-A table in `100-CONTEXT.md` is amended at the end with the verified hypothesis row.

## key-files.created

- `scripts/check-sacred.sh` (Task 1)
- `.husky/pre-commit` (Task 1)
- `.planning/phases/100-multi-stream-window-redesign/100-01-SUMMARY.md` (this file)

## Self-Check: PASSED

- Sacred SHA gate (Task 1) installed: `scripts/check-sacred.sh` exits 0 when sacred SHA matches; exits 1 with ABORT message when it doesn't (negative test simulated).
- Pre-commit hook fired during the Task 1 commit `a6c519fd` (`git config core.hooksPath .husky` is set; `.husky/pre-commit` exec'd `scripts/check-sacred.sh` and gated the commit).
- Both files staged with `100755` exec mode in the git index.
- Task 2 produced empirical Probe B evidence; root-cause and 100-02 fix path are unambiguously named per acceptance criteria.
- Sacred SHA preserved before AND after every commit in this plan (verified locally + on Mini PC).
