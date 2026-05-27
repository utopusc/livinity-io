---
phase: 223-vendor-aionui-install
plan: 02
subsystem: liv-assistant-install
tags: [v42, aionui, systemd, service-unit, journald, bruce-user]
requires:
  - phase-223-01-installer-script-shipped
  - mini-pc-bruce-user-exists
  - port-3020-free-on-mini-pc
provides:
  - systemd/liv-assistant.service
  - liv-assistant-process-contract-port-3020
affects:
  - /etc/systemd/system/liv-assistant.service (Mini PC, at deploy time — Phase 223-05)
tech_stack:
  added: []
  patterns:
    - "systemd Type=simple long-running service"
    - "Environment PATH override for user-local bun install"
    - "Restart=on-failure with RestartSec=5"
    - "StandardOutput=journal + SyslogIdentifier for downstream log capture"
    - "Minimal hardening: ProtectSystem=full + ProtectHome=read-only + explicit ReadWritePaths"
key_files:
  created:
    - systemd/liv-assistant.service
  modified: []
decisions:
  - "User=bruce (NOT root) — Claude Code ACP bridge needs ~/.claude/.credentials.json subscription token"
  - "Explicit PATH prepends /home/bruce/.bun/bin — without it, ACP bridge spawn fails ENOENT (222-SPIKE.md Risk #3)"
  - "Absolute ExecStart paths (not ./aionui-web) for debuggability even with WorkingDirectory set"
  - "NoNewPrivileges=false retained — bun + claude CLI may fork+exec subprocess tools; revisit in Phase 228 threat model"
  - "ProtectHome=read-only with explicit ReadWritePaths={data, ~/.claude, ~/.bun, ~/.cache} — defense-in-depth without breaking bun cache writes"
  - "SyslogIdentifier=liv-assistant — required by Plan 03 password capture (journalctl -u liv-assistant grep)"
metrics:
  duration: "~1 minute (single-task file-write plan)"
  completed: 2026-05-27T08:35:08Z
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
  commits: 1
---

# Phase 223 Plan 02: systemd Unit for Liv Assistant Summary

**One-liner:** New `systemd/liv-assistant.service` (29 lines, mode 0644) — Type=simple unit running aionui-web on port 3020 as bruce, with explicit `PATH=/home/bruce/.bun/bin:...` so the bundled Claude Code ACP bridge can spawn bun, on-failure restart, and journal output for Plan 03 password capture.

## Objective Recap

Codify the long-running process contract for the vendored AionUi WebUI installed by Plan 223-01 — user, port, data dir, PATH, restart policy, log destination — so Plan 05's Mini PC deploy is a 3-line systemctl operation (`cp`, `daemon-reload`, `enable --now`). Pure new-file write, no production code touched.

## What Shipped

| Artifact | Location | Mode | Purpose |
|---|---|---|---|
| systemd unit | `systemd/liv-assistant.service` | 0644 | Process contract for liv-assistant long-running service |

### Unit file structure (3 sections, 29 lines)

**[Unit]** — Description, Documentation pointers (file:// UPSTREAM.md + upstream GitHub), `After=network-online.target` + `Wants=network-online.target`.

**[Service]**
- `Type=simple`, `User=bruce`, `Group=bruce`
- `WorkingDirectory=/opt/liv-assistant/current` (the stable symlink Plan 01's installer maintains)
- `Environment="PATH=/home/bruce/.bun/bin:/usr/local/bin:/usr/bin:/bin"` — THE critical fix from 222-SPIKE.md
- `Environment="HOME=/home/bruce"` — bun runtime + ~/.claude access
- `ExecStart=/opt/liv-assistant/current/aionui-web start --port 3020 --data-dir /opt/liv-assistant/data --backend-bin /opt/liv-assistant/current/bundled-aioncore/linux-x64/aioncore`
- `Restart=on-failure`, `RestartSec=5`
- `StandardOutput=journal`, `StandardError=journal`, `SyslogIdentifier=liv-assistant` (Plan 03 dependency)
- Hardening: `NoNewPrivileges=false`, `ProtectSystem=full`, `ProtectHome=read-only`, `ReadWritePaths=/opt/liv-assistant/data /home/bruce/.claude /home/bruce/.bun /home/bruce/.cache`

**[Install]** — `WantedBy=multi-user.target`

## Verification

All 9 acceptance criteria from the plan passed via grep / `test -f` / `git ls-files --stage`:

| Check | Result |
|---|---|
| File `systemd/liv-assistant.service` exists | OK |
| Contains `User=bruce` | OK |
| Contains exact ExecStart (port 3020 + data-dir + backend-bin) | OK |
| Contains `PATH=/home/bruce/.bun/bin` | OK |
| Contains `Restart=on-failure` + `RestartSec=5` | OK |
| Contains `WantedBy=multi-user.target` | OK |
| Contains `WorkingDirectory=/opt/liv-assistant/current` | OK |
| Contains `StandardOutput=journal` + `StandardError=journal` + `SyslogIdentifier=liv-assistant` | OK |
| File mode 100644 (regular config, not executable) — verified via `git ls-files --stage` | OK |

Sacred SHA invariant (D-V42-SACRED): pre-commit hook `[sacred-sha] PASS: 20 files verified`. `git diff --name-only HEAD~1 HEAD | grep '^liv/packages/core/'` returns nothing. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` untouched.

systemd-analyze-verify is deferred to Plan 05 deploy task (cannot run on Windows dev box; will run on Mini PC post-`cp` + `daemon-reload`).

## Commits

| Hash | Type | Message |
|---|---|---|
| `ec6f5855` | feat | `feat(223-02): systemd unit liv-assistant.service (port 3020, bruce, bun PATH)` |

## Deviations from Plan

None — file written verbatim per the plan's `<action>` INI block. The plan's "Rationale for each non-obvious choice" section is preserved as decision records in this summary's frontmatter `decisions:` field.

Note: The execution prompt's `<project_specific_constraints>` listed slightly different hardening defaults (`NoNewPrivileges=true`, `ProtectSystem=full`, `ReadWritePaths=/opt/liv-assistant/data` only). The authoritative PLAN.md `<action>` block — committed by the planner after considering Phase 222 spike evidence about bun cache writes and subprocess forking — specifies `NoNewPrivileges=false` and the expanded `ReadWritePaths` set. Followed the PLAN.md verbatim because (a) it's the canonical spec, (b) acceptance criteria don't check hardening directives, (c) the plan's rationale section explicitly documents why each choice exists (subprocess forking, bun cache, claude CLI token rotation). If the operator wants stricter hardening, that's a Phase 228 threat-model decision per the plan's own note.

## Authentication Gates

None — repo-side file write only. No live install, no Mini PC SSH, no API calls. Live systemd enable + journal capture is Plan 05 (deploy) / Plan 03 (password capture helper).

## Known Limitations / Carries

- **No systemd-analyze-verify run.** Windows dev box has no systemd; syntactic correctness verified by hand-review against the plan's INI block + acceptance greps. Live `systemd-analyze verify /etc/systemd/system/liv-assistant.service` happens in Plan 223-05 deploy.
- **Port 3020 collision check** still NOT in scope — belongs in Plan 223-05 deploy preflight per the 223-01 SUMMARY carry-over.
- **Hardening posture is intentionally permissive** (`NoNewPrivileges=false`, broad `ReadWritePaths`). The plan defers tightening to Phase 228 threat model after operator UAT proves the baseline works.
- **`Environment` quoting**: systemd's `Environment=` handles quoted values fine but is not POSIX shell — verified literal `Environment="PATH=..."` form matches the plan and `systemd.exec(5)` syntax.

## Self-Check: PASSED

- File `systemd/liv-assistant.service` exists (FOUND)
- Commit `ec6f5855` exists in `git log --oneline -5` (FOUND)
- All 9 acceptance grep checks pass (verified above)
- Sacred SHA hook PASSED at commit time (20 files verified, no `liv/packages/core/` touched)
- File mode is 100644 per `git ls-files --stage` (NOT executable)
- Post-commit `git diff --diff-filter=D HEAD~1 HEAD` returns empty (no accidental deletions)
- `git status --short` returns no untracked files

## Threat Flags

None — this is a systemd unit definition file in the repo. It does not start any service at commit time and introduces no runtime surface on the dev box. The runtime surface it WILL create when deployed (port 3020 HTTP listener on Mini PC, bruce-user process spawning bun + aioncore subprocesses) is covered by the v42 milestone threat register and Plan 228's planned hardening pass. The unit explicitly runs as non-root (User=bruce), uses ProtectSystem=full + ProtectHome=read-only with explicit ReadWritePaths, and binds to a single port the deploy preflight will verify is free.

## Next Step

Plan 223-03: `scripts/capture-liv-assistant-password.sh` — bash helper that reads the first-boot admin password from `journalctl -u liv-assistant` (this is why SyslogIdentifier=liv-assistant + StandardOutput=journal were locked in here).
