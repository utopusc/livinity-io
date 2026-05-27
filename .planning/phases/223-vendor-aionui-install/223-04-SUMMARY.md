---
phase: 223-vendor-aionui-install
plan: 04
subsystem: liv-assistant-install
tags: [v42, aionui, docs, runbook, operator, apache-2.0]
requires:
  - phase-223-01-installer-script-shipped
  - phase-223-02-systemd-unit-shipped
  - phase-223-03-password-capture-shipped
provides:
  - docs/liv-assistant-install.md
  - operator-runbook-liv-assistant
affects:
  - "(none — pure docs write, no runtime)"
tech_stack:
  added: []
  patterns:
    - "Markdown operator runbook colocated with the install scaffold it documents"
    - "Pinned-fact tables (provenance, runtime context) — copy-paste safe values"
    - "Troubleshooting matrix indexed by symptom → cause → fix"
    - "Locked-invariant section names every D-V42-* constraint so future maintainers can't trip silently"
key_files:
  created:
    - docs/liv-assistant-install.md
  modified: []
decisions:
  - "Doc lives in repo at docs/liv-assistant-install.md (NOT .planning/) — version-pins with the install script, ships in clones for fresh-VPS reads"
  - "Section order locked: Overview → Provenance → Layout → Install → Idempotency → Upgrade → Rotation → Invariants → Limits → Troubleshooting → Related phases (operator-task order, not implementation order)"
  - "Provenance table includes SHA256 verbatim — anti-supply-chain audit trail readable without grepping the script"
  - "Password rotation deliberately split from first-boot capture (resetpass is a different code path; capture-helper is intentionally first-occurrence-only)"
  - "Locked invariants listed by D-V42-* canonical IDs from PROJECT.md — no paraphrase drift"
  - "Troubleshooting matrix covers the three actual failure modes seen during 222 spike: bun ENOENT (code=127), port collision, journald empty"
metrics:
  duration: "~4 minutes (single-task file-write plan)"
  completed: 2026-05-27T00:00:00Z
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
  commits: 1
---

# Phase 223 Plan 04: Liv Assistant Operator Runbook Summary

**One-liner:** New `docs/liv-assistant-install.md` (147 lines) — operator-facing runbook tying together 223-01 installer + 223-02 systemd unit + 223-03 password capture into a single "fresh Mini PC → liv-assistant active + creds captured" procedure, with pinned provenance (v2.1.4 + SHA256 `0bb02d00...6778` + Apache-2.0), idempotent re-install notes, upgrade + rollback steps, password rotation, locked-invariant section naming every D-V42-* constraint, troubleshooting matrix, and cross-references to Phases 222/226/227/228/231/232.

## Objective Recap

Land the persistent operator reference for every future Liv Assistant install / re-install / debug session. Plan 223-05 is one Mini PC deploy event; this doc is the documentation the operator (and every future maintainer / fresh-VPS bring-up) reads. Doc colocates with the install scaffold (`scripts/install-liv-assistant.sh`, `systemd/liv-assistant.service`, `scripts/capture-liv-assistant-password.sh`) so version-pin and provenance drift are caught by `git log -- docs/liv-assistant-install.md scripts/install-liv-assistant.sh`.

Pure new-file write under `docs/`. Zero production code touched. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` untouched.

## What Shipped

| Artifact | Location | Mode | Purpose |
|---|---|---|---|
| Operator runbook | `docs/liv-assistant-install.md` | 0644 | Persistent reference for install + lifecycle of Liv Assistant |

### Section inventory (12 sections, all present)

1. **Title + What-this-is callout** — sets the "vendored, no source fork" framing up front so maintainers don't go looking for a fork to patch.
2. **Upstream provenance table** — repo, release, tarball, URL, pinned SHA256, license, spike verdict file pointer.
3. **File layout (Mini PC)** — tree of `/opt/liv-assistant/` with per-path purpose comments.
4. **Credentials path block** — `/etc/livos/liv-assistant-credentials` (0600 / bruce:bruce) with on-disk format.
5. **Runtime context table** — unit name, run-as user, port, data dir, bun path, log destination.
6. **Install (fresh Mini PC)** — copy-pasteable 4-line install + 9-line capture-with-retry loop + 3-line verify block.
7. **Re-install / idempotency** — explicit list of what re-running the installer skips vs. updates (zero-diff contract).
8. **Upgrade (future versions)** — 4 steps with rollback recipe.
9. **Password rotation** — `resetpass` invocation with explicit note that the capture script is intentionally first-occurrence-only.
10. **Locked invariants** — D-V42-SACRED, D-V42-APACHE-NOTICE, D-V42-NO-PHONE-HOME, D-V42-NO-DATA-LOSS each named with the path/constraint they protect.
11. **Known limitations** — single-tenant, random first-boot password, bun requirement, ~10s cold start on first agent spawn.
12. **Troubleshooting matrix** — 5-row table covering bun-missing (code=127), port 3020 collision, capture-script "not yet ready", curl connection-refused, Claude Code agent `available: false`.
13. **Related phases** — 222 (spike), 226 (Caddy), 227 (UI), 228 (auth bridge), 231 (cleanup), 232 (brand overlay).

## Verification

All 10 plan acceptance criteria passed:

| Check | Result |
|---|---|
| File `docs/liv-assistant-install.md` exists | OK |
| Contains pinned SHA256 `0bb02d00...6778` | OK |
| Documents install root `/opt/liv-assistant` | OK |
| Documents credentials path `/etc/livos/liv-assistant-credentials` | OK |
| References `scripts/install-liv-assistant.sh` | OK |
| References `systemd/liv-assistant.service` | OK |
| References `scripts/capture-liv-assistant-password.sh` | OK |
| Mentions upstream version `v2.1.4` | OK |
| Mentions `Apache-2.0` license | OK |
| Calls out `D-V42-SACRED` locked invariant | OK |
| No emojis (perl unicode-range scan) | OK (empty scan output) |
| Sacred SHA invariant | OK (`[sacred-sha] PASS: 20 files verified`) |

The plan's full `<verify>` automated command was run verbatim and returned `OK`.

Sacred SHA invariant (D-V42-SACRED): pre-commit hook `[sacred-sha] PASS: 20 files verified` confirms no path under `liv/packages/core/` was modified. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` untouched.

## Commits

| Hash | Type | Message |
|---|---|---|
| `e6230661` | docs | `docs(223-04): liv-assistant install runbook — operator-facing reference` |

## Deviations from Plan

None — runbook written verbatim per the plan's `<action>` markdown block. The plan supplied the doc text in full; this execution copied it byte-for-byte (modulo final newline) into `docs/liv-assistant-install.md`. No section additions, no section reorderings, no rewording, no emojis. All 12 sections present in the planner-locked order.

## Authentication Gates

None — repo-side file write only. No live install, no Mini PC SSH, no API calls. The doc describes commands the operator will run during Plan 223-05 deploy, but executing those commands is out of scope here.

## Known Limitations / Carries

- **Doc is forward-looking on Phase 226/227/228/231/232.** Sections "Related phases" and the "Caddy adds public routing in Phase 226" / "LivOS UI in Phase 227+" references cite plans that haven't shipped yet. When those phases land, the runbook should be revisited (e.g. once Phase 227 ships the rotate-password UI, the password-rotation section can shorten to "click rotate password in Settings"). Tracked as carry-over: doc-refresh task for Phase 227 close.
- **No live install procedure validation.** The `Install (fresh Mini PC)` block has not been operator-walked end-to-end yet — that happens in Plan 223-05. If any command needs adjustment after live Mini PC walk, this doc must be updated in the same commit as the deploy fix.
- **Troubleshooting matrix is 222-spike-derived.** Covers the failure modes observed in the spike (bun ENOENT, port collision, journald empty). Phase 223-05 UAT may surface additional rows — append in-place when found.
- **No CHANGELOG entry.** This repo doesn't have a CHANGELOG.md; if one is introduced later, backfill v42 entries from phase summaries.

## Self-Check: PASSED

- File `docs/liv-assistant-install.md` exists (FOUND, 147 lines)
- Commit `e6230661` exists in `git log --oneline -3` (FOUND — `e6230661 docs(223-04): liv-assistant install runbook — operator-facing reference`)
- All 10 acceptance grep + emoji-scan + sacred-SHA-hook checks pass (verified above)
- Sacred SHA pre-commit hook PASSED at commit time (20 files verified, zero touches to `liv/packages/core/`)
- Post-commit `git diff --diff-filter=D HEAD~1 HEAD` returns empty (no accidental deletions)
- Post-commit `git status --short` returns empty (no untracked artifacts)
- Single-commit plan (one task, one commit) — atomic per GSD contract

## Threat Flags

None — this is a Markdown doc file in the repo. No runtime surface, no network endpoints, no auth paths, no schema changes. The doc describes existing pinned facts (SHA256, port 3020, paths) already shipped in 223-01/02/03 commits; documenting those facts in-repo does not change the threat surface.

## Self-Check: PASSED (post-write verification)

- `docs/liv-assistant-install.md` exists on disk (FOUND)
- `.planning/phases/223-vendor-aionui-install/223-04-SUMMARY.md` exists on disk (FOUND, this file)
- Commit `e6230661` exists in `git log --oneline -3` (FOUND)

## Next Step

Plan 223-05: Mini PC deploy + UAT — rsync the installer + systemd unit + capture script to `bruce@10.69.31.68`, run the install procedure documented in this runbook, verify `systemctl is-active liv-assistant` + `curl http://127.0.0.1:3020/` + `/etc/livos/liv-assistant-credentials` populated, and close out Phase 223. If any deploy-time gap is found, this runbook gets a same-commit update.
