# Phase 192: livinityd User=bruce Switch + sudoers + Migration

**Gathered:** 2026-05-21
**Status:** Ready for planning
**Source:** Operator question 2026-05-21 ("biz neden root da calistiriyoruz kullanicida degil") + Phase 188-191 root-user bug class
**Wave:** 1 (foundational — Phase 193/194 depend on this)

<domain>
## Phase Boundary

Switch `livos.service` from `User=root` to `User=bruce`. The current root execution is the root cause of multiple v38.2 bugs:
- Claude refuses `--dangerously-skip-permissions` when invoked as root → every agent click `[exited]`
- All vault files written as root → `/root/livinity-vault/` and `/home/bruce/livinity-vault/` ownership split
- Operator's actual files (under `/home/bruce/`) inaccessible without escalation
- WebApp Chrome historically died because `/home/bruce/` got root-owned (`feedback_bruce_home_ownership`)

**Phase 192 sonu:**
- `livos.service` has `User=bruce`, `Group=bruce`
- `/opt/livos/`, `/opt/livos/data/`, `/opt/livos/.env` all readable by bruce (group bruce or explicit ACL)
- Sudoers file `/etc/sudoers.d/livinityd` grants bruce ONLY the specific commands that must be root (e.g., `chown`, `systemctl reload caddy`, `systemctl restart` of self-managed units)
- Migration script in `scripts/migrate-to-bruce-user.sh` — runs once on deploy:
  - `chown -R bruce:bruce /opt/livos/data/`
  - `chown -R bruce:bruce /opt/livos/.env*` (if root-owned)
  - Verify Docker socket access (bruce in `docker` group) — add if missing
- livinityd starts as bruce, all subprocess spawns (claude, tmux, Chrome, fluxbox) inherit bruce identity
- `process.getuid()` returns 1000 (bruce uid)
- The hotfix in Phase 17 (manager.ts `isRoot` check to suppress `--dangerously-skip-permissions`) becomes a no-op (always false) — claude can use the flag again, autonomous agents work per D-V38-K
</domain>

<decisions>

### Plan 192-01: Audit current root-only operations + design sudoers
- INSPECT all livinityd code for `chown`, `chmod 0600`, `systemctl`, `useradd` calls
- For each, decide: (a) bruce can do it directly (drop sudo), (b) sudoers entry needed, (c) refactor to avoid (e.g., set umask at start so writes are 0644 by default)
- Write `scripts/install/sudoers-livinityd.template` — NOPASSWD entries for the narrow set of root commands
- Acceptance: documented list of all sudo escalations + sudoers template that grants ONLY those commands

### Plan 192-02: livos.service unit update + permission migration script
- MOD `scripts/install/livos.service` (or wherever the unit template lives) — add `User=bruce`, `Group=bruce`
- NEW `scripts/migrate-to-bruce-user.sh` — idempotent migration:
  - `chown -R bruce:bruce /opt/livos/data/` (only the data dir; package source stays root-owned-readable)
  - `chown bruce:bruce /opt/livos/.env*`
  - `usermod -aG docker bruce` (if docker installed and bruce not in group)
  - `install -m 0440 -o root scripts/install/sudoers-livinityd.template /etc/sudoers.d/livinityd`
  - Idempotent: detect already-applied state and exit 0 silently
- MOD `scripts/install/deploy-livinityd.sh` — call migration script once during install
- Acceptance: fresh VPS install completes with `livos.service` running as bruce; existing Mini PC migrates with `bash scripts/migrate-to-bruce-user.sh` then `systemctl daemon-reload && systemctl restart livos`

### Plan 192-03: Code-path adjustments (remove root assumptions)
- MOD `livos/packages/livinityd/source/modules/cc-pty/manager.ts` — drop the `isRoot` check (becomes unreachable code; clean removal)
- MOD any code that hardcodes `HOME=/root` in spawn commands → use `os.homedir()` (now resolves to `/home/bruce`)
- MOD any code reading `/root/.claude/.credentials.json` → use `os.homedir() + '/.claude/.credentials.json'`
- MOD `cc-pty/manager.ts` tmux spawn — remove `HOME=/root` injection, let inherit
- MOD `scripts/check-sacred.sh` deploy path (if `scripts/` deploy gap from earlier UAT still open — bundle scripts dir into rsync)
- Acceptance: grep for `'/root/'` and `HOME=/root` in livinityd source returns 0 hardcoded matches; tests pass

### Plan 192-04: Sacred SHA registry update + verification
- MOD `scripts/sacred-shas-v38.json` — re-pin SHAs for any file the bruce-switch touched (manager.ts will change → update its SHA pin)
- Run `node scripts/check-sacred.sh` — should PASS after re-pin
- Mini PC dry-run: SSH, run migration script, verify livos restarts as bruce, claude flag works
- Acceptance: sacred check passes; on Mini PC `systemctl show livos | grep User` returns `User=bruce`; `ps -u bruce | grep tsx` shows livinityd
</decisions>

<canonical_refs>
- Operator question 2026-05-21 (this CONTEXT triggering source)
- Phase 188-191 cascading bug class (claude root refusal, vault path split, chdir failures)
- `/opt/livos/scripts/install/` (deploy + service unit templates)
- `feedback_bruce_home_ownership` (prior memory — bruce-owned `/home/bruce/` mandatory)
- `livos/packages/livinityd/source/modules/cc-pty/manager.ts` (drop isRoot hack)
- `livos/packages/livinityd/source/modules/files/files.ts` (chownSystemPath — needs sudoers)
- `livos/packages/livinityd/source/modules/webapps/{chrome,xvfb,fluxbox}*.ts` (already use `sudo` — become no-ops since bruce IS bruce)
- Hermes Agent `~/.hermes/` pattern (state in user home, not root)
- OpenClaw OS `<state-dir>/plugins/...` pattern (similar)
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 192-01 | NEW scripts/install/sudoers-livinityd.template; AUDIT docs at .planning/phases/192-livinityd-bruce-user-switch/192-AUDIT.md |
| 192-02 | NEW scripts/migrate-to-bruce-user.sh; MOD scripts/install/livos.service (User=bruce); MOD scripts/install/deploy-livinityd.sh |
| 192-03 | MOD cc-pty/manager.ts (drop isRoot, drop HOME=/root); MOD any hardcoded /root paths; MOD check-sacred.sh deploy |
| 192-04 | MOD scripts/sacred-shas-v38.json (re-pin); manual Mini PC verify |

**Sacred guards:**
- sdk-agent-runner.ts (SHA f3538e1d...) UNCHANGED
- Phase 162-01 vault-scaffolder.ts UNCHANGED in code (but Phase 193 stops calling it)
- Existing sacred SHAs need re-pinning AFTER manager.ts edits — sacred-shas-v38.json updated in 192-04

**Risks + rollback:**
- If migration breaks Mini PC, rollback = `User=root` in unit + `systemctl daemon-reload && systemctl restart`. Migration is idempotent so can be re-run.
- Existing /root-owned files in `/opt/livos/data/` need ownership flip — script handles this.
- `feedback_minipc_redis` Redis password URL stays in .env, ownership flip respects file mode.
</specifics>

<deferred>
- Multi-user spawn isolation (each LivOS user → own Linux uid) → v39+ (multi-tenant)
- Drop `sudo` from WebApp Chrome spawn (becomes no-op since livinityd IS bruce) → polish v38.4
- Lock down sudoers further with command-specific argument matching → security pass v38.x
</deferred>

---

*Phase: 192-livinityd-bruce-user-switch*
*Wave: 1 (FOUNDATIONAL — 193/194 depend on this)*
*Depends on: nothing (clean slate)*
*Estimated: ~0.5-1 day (mostly testing, code change is small)*
