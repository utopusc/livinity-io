# Milestone v29.2 Requirements — Factory Reset (mini-milestone)

**Milestone:** v29.2 — Factory Reset
**Status:** Defined (pre-roadmap-execution)
**Last updated:** 2026-04-28
**Source documents:** PROJECT.md, BACKLOG 999.7 (promoted)

## v1 Requirements (this milestone)

Goal: Tek tıkla "fabrika ayarlarına dön" — kullanıcı UI'dan Settings > Advanced > Factory Reset'e bastığında kirli/bozuk bir Mini PC durumundan SSH'e gerek kalmadan temiz bir kuruluma geri dönebilsin.

Phase numbering: continues from v29.0 last phase 35 → v29.2 = **Phase 36, 37, 38**.

### Category: Audit & Hardening (FR-AUDIT) — Phase 36

- [x] **FR-AUDIT-01
**: `livinity.io/install.sh` existence + content audit. Verify it lives at the expected URL, that it accepts `--api-key <key>` (or equivalent) CLI argument, and that it idempotently survives running on a host that already has `/opt/livos/` populated. Document findings in `phases/36-install-sh-audit/AUDIT-FINDINGS.md`.
- [x] **FR-AUDIT-02
**: Idempotent re-execution behavior verified — re-running install.sh on a freshly-wiped host vs an already-installed host both end in a working LivOS state with no manual intervention. If install.sh is NOT idempotent, harden it (or author a wrapper).
- [x] **FR-AUDIT-03**: Half-deleted state recovery path identified — if reinstall fails mid-curl (network drop, disk full, install.sh exits non-zero), what's the recovery? Either install.sh supports `--resume`, OR the wipe step takes a pre-wipe snapshot of `/opt/livos` so a fallback exists. Document in audit findings. — Plan 36-03 (2026-04-29): install.sh has NO native `--resume`; chosen path is pre-wipe tar snapshot per D-07 with literal `tar -czf` / `tar -xzf` bash blocks specified for Phase 37; sidecar at `/tmp/livos-pre-reset.path`; cleanup contract specified.
- [x] **FR-AUDIT-04
**: API key passing via stdin or `--api-key-file <path>` flag verified — NOT via argv (visible in `ps`). If install.sh only supports argv, harden it.
- [x] **FR-AUDIT-05
**: Server5 dependency analysis — install.sh fetches code from livinity.io (which routes through Server5 relay). If Server5 is down at reset time, the reinstall path is broken. Document fallback (public bootstrap key? alternative URL? cached install.sh on Mini PC?).

### Category: Backend (FR-BACKEND) — Phase 37

- [ ] **FR-BACKEND-01**: `system.factoryReset({ preserveApiKey: boolean })` tRPC route in livinityd. Spawns a detached wipe+reinstall bash process and returns immediately so UI can show progress page. Mutation added to `httpOnlyPaths` in `common.ts` (mirror `system.update` pattern).
- [x] **FR-BACKEND-02
**: Wipe procedure (bash, runs as root, idempotent):
  - `systemctl stop livos liv-core liv-worker liv-memory livos-rollback caddy` (preserve sshd)
  - Stop & remove ALL Docker containers managed by LivOS (`docker ps -a` filtered by `user_app_instances` enumeration, NOT global `docker stop $(docker ps -aq)` which would kill non-LivOS containers)
  - `docker volume prune -f` scoped to LivOS-managed volume names (R6 mitigation — global prune is destructive)
  - `sudo -u postgres psql -c "DROP DATABASE livos; DROP USER livos;"` (fresh DB)
  - `rm -rf /opt/livos /opt/nexus /etc/systemd/system/{livos,liv-core,liv-worker,liv-memory,livos-rollback}.service /etc/systemd/system/livos.service.d/`
- [ ] **FR-BACKEND-03**: API key preservation — if `preserveApiKey: true`, stash current `LIV_API_KEY` to `/tmp/livos-reset-apikey` (mode 0600) BEFORE the rm step; pass via `--api-key-file` to install.sh; remove `/tmp/livos-reset-apikey` after install.sh completes successfully or fails.
- [x] **FR-BACKEND-04
**: install.sh re-execution — `curl -sSL https://livinity.io/install.sh | sudo bash -s -- --api-key-file /tmp/livos-reset-apikey` (or equivalent per audit findings). Wrap in try/catch with retry logic if Server5 transient.
- [x] **FR-BACKEND-05
**: JSON event row in `/opt/livos/data/update-history/<ts>-factory-reset.json` extending Phase 33 OBS-01 schema with `status: "factory-reset"`. Records: timestamp, preserveApiKey choice, wipe duration, reinstall duration, install.sh exit code, final status (success/failed/half-deleted).
- [ ] **FR-BACKEND-06**: Detached process spawn via `systemd-run --scope --collect` (v29.1 cgroup-escape pattern) — wipe survives `systemctl stop livos` mid-flight. Without this, the wipe kills its own livinityd parent and dies before reinstall starts.
- [ ] **FR-BACKEND-07**: 401 from install.sh handled gracefully — if user revoked the API key on livinity.io between modal-confirm and install.sh execution, the reinstall fails 401; surface as "API key invalid — log into livinity.io and re-issue" in the JSON event row + admin notification.

### Category: User Interface (FR-UI) — Phase 38

- [ ] **FR-UI-01**: Settings > Advanced section — entry point. New section "Danger Zone" (or similar) below existing settings. Red destructive button "Factory Reset" with shield/warning icon.
- [ ] **FR-UI-02**: Confirmation modal that explicitly enumerates what will be deleted: "All apps, all user accounts, all data, all settings, all sessions, all secrets (JWT, AI keys, schedules), all Docker volumes managed by LivOS." NOT a generic "are you sure?" — the explicit list IS the consent (R1 mitigation).
- [ ] **FR-UI-03**: Account preservation radio inside modal:
  - **(a) "Restore my account"** — Livinity API key preserved; reinstalled host comes back as the same logical instance; current login still works after reinstall completes
  - **(b) "Start fresh as new user"** — API key wiped; reinstalled host onboards as a new instance from the wizard
- [ ] **FR-UI-04**: Type-to-confirm input — user must type literal string `FACTORY RESET` (case-sensitive) to enable the final Confirm button. Modal cannot be dismissed accidentally.
- [ ] **FR-UI-05**: BarePage progress overlay during reinstall — same pattern as Phase 30 update overlay. Shows "Reinstalling..." + animated progress + estimated 5-10 min countdown. Polls JSON event row for status updates.
- [ ] **FR-UI-06**: Post-reset login redirect logic:
  - If preserveApiKey + reinstall succeeded → redirect to /login, existing JWT still valid (livinityd's first boot recognizes the persisted API key, regenerates session)
  - If !preserveApiKey + reinstall succeeded → redirect to /onboarding wizard (fresh-install flow)
  - If reinstall failed → show error page with diagnostic JSON link + "Try again" + "Manual SSH recovery instructions" link
- [ ] **FR-UI-07**: Pre-reset blocking checks in modal — disabled button (with reason tooltip) if:
  - A backup is currently running (BAK-SCHED-04 lock — but BAK-SCHED isn't shipped yet at v29.2 time, so just check the v29.1 update-in-progress flag)
  - An update is currently running
  - Network is unreachable to livinity.io (curl -s -o /dev/null -w "%{http_code}" pre-flight check)

## Future Requirements (deferred)

Deferred to a future iteration:

- Pre-reset auto-snapshot — once v30.0 Backup ships, factory reset could auto-trigger a final snapshot before wipe (option c: "Reset but back up everything first"). For v29.2, factory reset = irreversible by design.
- Granular reset options — wipe-apps-only, wipe-DB-only, wipe-secrets-only. Current scope is full nuclear; surgical reset is a v30.x+ enhancement.
- Reset history UI — the JSON event rows are written but no Settings panel surfaces them; users find via SSH or backup history. UI surface deferred.
- Cloud-side post-reset notification — livinity.io platform notified via webhook when a registered host resets. Not in MVP.

## Out of Scope

- **Resetting Server5 / livinity.io platform** — out of scope; this is host-side only (Mini PC `/opt/livos`)
- **Network-level reinstall recovery** — if reinstall mid-fails AND user has no SSH access AND livinity.io is down, recovery is "physically reseat hardware + manual install." We do not engineer for the triple-failure case.
- **Multi-user consent** — reset is a system-admin action; member/guest users cannot trigger reset. Admin's choice unilaterally wipes all data including other users' apps. (R1 explicit-list modal IS the consent surface.)
- **Backup integration** — until v30.0 Backup ships, reset is destructive. The relationship is intentional: reset = "I want to start fresh," backup = "I want to keep my data." Mixing them in v29.2 is scope creep.
- **Factory reset of remote agent / Computer Use device** — agent uninstall is a separate flow on the agent's host, not driven from LivOS Settings.

## Traceability

[Roadmap will populate this section — REQ-ID → Phase mapping after roadmap creation]

## Status

Defined. Ready for roadmap.
