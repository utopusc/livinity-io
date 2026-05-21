# Phase 192 Audit — Root-Required Operations in livinityd

Generated: 2026-05-21
Phase: 192-01
Source greps executed against `livos/packages/livinityd/source/` (production code; excludes `__tests__/` and `*.test.ts`).

## Summary

| Category | Count | NEEDS_SUDOERS | CODE_CHANGE | DROPS_TO_NO_SUDO | COSMETIC | DEFER |
|----------|-------|---------------|-------------|------------------|----------|-------|
| FS_OWNERSHIP        | 5  | 0 | 0 | 5 | 0 | 0 |
| UID_CHECK           | 2  | 0 | 2 | 0 | 0 | 0 |
| HARDCODED_ROOT_PATH | 9  | 0 | 7 | 0 | 2 | 0 |
| SYSTEMCTL           | 0  | 0 | 0 | 0 | 0 | 0 |
| USER_MGMT           | 0  | 0 | 0 | 0 | 0 | 0 |
| SUDO_WRAPPER        | 4  | 4 | 0 | 0 | 0 | 0 |
| **Total**           | **20** | **4** | **9** | **5** | **2** | **0** |

Top-line:
- 4 sudo wrapper invocations already in the code rely on `bruce ALL=(ALL) NOPASSWD:ALL` from Phase 106-10 (`_dld_create_desktop_user`). Phase 192-01 NARROWS that to a Cmnd_Alias list.
- 5 `fs.chown` calls (via `chownSystemPath`) become no-sudo no-ops once bruce owns `/opt/livos/data/` (192-02 migration handles this).
- 9 hardcoded `/root/...` / `HOME=/root` literals need source edits in 192-03.
- 0 raw `execSync("systemctl ...")` or `execSync("useradd ...")` calls — livinityd does NOT manage its own systemd unit at runtime.

## FS_OWNERSHIP

### 1. files.ts:303 — `chownSystemPath()` calls fse.chown
- File: `livos/packages/livinityd/source/modules/files/files.ts:303`
- Category: FS_OWNERSHIP
- Disposition: **DROPS_TO_NO_SUDO**
- Code: `await fse.chown(systemPath, this.fileOwner.userId, this.fileOwner.groupId)`
- Rationale: After 192-02 migration, `/opt/livos/data/` is owned by bruce. `fileOwner` is initialized to `{userId: 1000, groupId: 1000}` (files.ts:117), which IS bruce. Node's `fs.chown` succeeds when the caller owns the file AND is setting uid/gid to its own uid (no privilege change required). No sudoers entry needed.

### 2. files.ts:218 — chownSystemPath(trashMetaDirectory)
- File: `livos/packages/livinityd/source/modules/files/files.ts:218`
- Category: FS_OWNERSHIP
- Disposition: **DROPS_TO_NO_SUDO**
- Rationale: Trash dir is under `/opt/livos/data/`. Post-migration, both file + caller are bruce-owned, so chown(1000,1000) is a no-op.

### 3. files.ts:296 — chownSystemPath(path) inside mkdir
- File: `livos/packages/livinityd/source/modules/files/files.ts:296`
- Category: FS_OWNERSHIP
- Disposition: **DROPS_TO_NO_SUDO**
- Note: already wrapped in `.catch(() => {})` so even if it failed it's not blocking. After migration it succeeds silently as a no-op.

### 4. external-storage.ts:202 — chownSystemPath(systemMountpoint)
- File: `livos/packages/livinityd/source/modules/files/external-storage.ts:202`
- Category: FS_OWNERSHIP
- Disposition: **DROPS_TO_NO_SUDO**
- Rationale: External storage mountpoints live under `/opt/livos/data/external/` (created by livinityd during mount). With bruce ownership of the parent dir, mountpoint creation + chown all happen as bruce → uid match → no privilege required.

### 5. backups.ts:260 — chownSystemPath(systemPath) in backup module
- File: `livos/packages/livinityd/source/modules/backups/backups.ts:260`
- Category: FS_OWNERSHIP
- Disposition: **DROPS_TO_NO_SUDO**
- Note: already wrapped in `.catch(() => {})`. Same story as the other chowns.

## UID_CHECK

### 6. cc-pty/manager.ts:208 — isRoot check + skipPerms suppression
- File: `livos/packages/livinityd/source/modules/cc-pty/manager.ts:208-209`
- Category: UID_CHECK
- Disposition: **CODE_CHANGE**
- Code:
  ```
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0
  const skipPerms = skipPermsConfig && !isRoot
  ```
- Rationale: Phase 17 hotfix that suppressed `--dangerously-skip-permissions` when uid=0 to avoid Claude's root refusal. After 192-02 cutover, livinityd runs as bruce (uid 1000) so the `!isRoot` term is always `true` — making the entire `isRoot` line dead code. Remove in 192-03; simplify to `const skipPerms = skipPermsConfig`.

### 7. claude-runner/vault-scaffolder.ts:206 — `uid === 0` gate for chown
- File: `livos/packages/livinityd/source/modules/claude-runner/vault-scaffolder.ts:206`
- Category: UID_CHECK
- Disposition: **CODE_CHANGE** (deferred to v38.4 polish per CONTEXT.md `<sacred_guards>`)
- Rationale: vault-scaffolder.ts is in 162-01's protected set. In bruce-mode this branch becomes unreachable (uid is never 0), so the `execFileAsync('chown', ...)` call inside the `if (uid === 0)` block never fires. The dead-code is harmless. Leaving the file untouched in 192-03 because vault-scaffolder.ts is explicitly listed in 192-CONTEXT.md `<sacred_guards>` as UNCHANGED. Phase 193 deprecates this whole file when the vault concept is dropped per `feedback_v38_3_drop_vault_concept`.

## HARDCODED_ROOT_PATH

### 8. cc-pty/manager.ts:237 — inline comment "Anthropic SDK credentials live at /root/.claude/.credentials.json"
- File: `livos/packages/livinityd/source/modules/cc-pty/manager.ts:237`
- Category: HARDCODED_ROOT_PATH
- Disposition: **CODE_CHANGE** (cosmetic — comment text)
- Note: Update comment to reflect runtime homedir.

### 9. cc-pty/manager.ts:245 — `HOME=/root claude` in tmux new-session command (claude branch)
- File: `livos/packages/livinityd/source/modules/cc-pty/manager.ts:245`
- Category: HARDCODED_ROOT_PATH
- Disposition: **CODE_CHANGE**
- Code: `: \`tmux new-session -d -s ${nameEsc} -c ${cwdEsc} 'LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 HOME=/root claude${skipPermsFlag}${extraArgsStr}'\``
- Rationale: Interpolate `HOME=${HOME_DIR}` where `HOME_DIR = os.homedir()` is module-level.

### 10. cc-pty/manager.ts:246 — execSync env.HOME = '/root' (claude branch)
- File: `livos/packages/livinityd/source/modules/cc-pty/manager.ts:246`
- Category: HARDCODED_ROOT_PATH
- Disposition: **CODE_CHANGE**
- Code: `execSync(tmuxCmd, {env: {...process.env, HOME: '/root', ...}})`
- Rationale: Replace with `HOME: HOME_DIR`.

### 11. cc-pty/manager.ts:253 — execSync env.HOME = '/root' (set-option call)
- File: `livos/packages/livinityd/source/modules/cc-pty/manager.ts:253`
- Category: HARDCODED_ROOT_PATH
- Disposition: **CODE_CHANGE**
- Code: `execSync(\`tmux set-option -g status off -t ${nameEsc}\`, {env: {...process.env, HOME: '/root'}, ...})`

### 12. cc-pty/manager.ts:314 — `HOME=/root claude` in resurrection cmd
- File: `livos/packages/livinityd/source/modules/cc-pty/manager.ts:314`
- Category: HARDCODED_ROOT_PATH
- Disposition: **CODE_CHANGE**
- Code: `const cmd = \`tmux new-session -d -s ${nameEsc} ... HOME=/root claude ${resumeArg}'\``

### 13. cc-pty/manager.ts:315 — execSync env.HOME = '/root' (resurrection)
- File: `livos/packages/livinityd/source/modules/cc-pty/manager.ts:315`
- Category: HARDCODED_ROOT_PATH
- Disposition: **CODE_CHANGE**

### 14. cc-pty/manager.ts:347 — pty.spawn env.HOME = '/root' (attach handle)
- File: `livos/packages/livinityd/source/modules/cc-pty/manager.ts:347`
- Category: HARDCODED_ROOT_PATH
- Disposition: **CODE_CHANGE**
- Code: `env: {...process.env, HOME: '/root', TERM: 'xterm-256color', LANG: ..., LC_ALL: ...}`
- Rationale: The pty.spawn for `tmux attach` also forces HOME=/root, which means even the interactive attach process inherits the wrong HOME for sub-commands run from inside claude. Replace with HOME_DIR.

### 15. livinity-broker/auth.ts:128 — `'/root/.claude'` when BROKER_FORCE_ROOT_HOME=true
- File: `livos/packages/livinityd/source/modules/livinity-broker/auth.ts:128`
- Category: HARDCODED_ROOT_PATH
- Disposition: **CODE_CHANGE**
- Code: `process.env.BROKER_FORCE_ROOT_HOME === 'true' ? '/root/.claude' : ...`
- Rationale: Replace literal with `path.join(os.homedir(), '.claude')` so post-cutover the cached claudeDir resolves to `/home/bruce/.claude`.

### 16. vault-templates/CLAUDE.md:3 — docstring `/root/.claude/.credentials.json` + `HOME=/root`
- File: `livos/packages/livinityd/source/data/vault-templates/CLAUDE.md:3`
- Category: HARDCODED_ROOT_PATH
- Disposition: **CODE_CHANGE** (template content shipped to every agent vault)
- Rationale: Update to use `~/.claude/.credentials.json` and reference bruce-uid runtime.

### 17. apps/builtin-apps.ts:509 — `'/root/.ollama'` volume mount in Docker compose template
- File: `livos/packages/livinityd/source/modules/apps/builtin-apps.ts:509`
- Category: HARDCODED_ROOT_PATH
- Disposition: **COSMETIC** (deferred — out of scope for Phase 192)
- Rationale: This is an operator-facing Docker compose mount for the Ollama app. The Ollama daemon itself runs as root inside its container and persists models to `/root/.ollama` (Ollama upstream default). The host bind-mount target is moot — Docker creates whatever path is referenced. Changing this would risk breaking existing operators' Ollama state. Phase 192 leaves it; v38.4+ polish can revisit if needed.

### 18. claude-runner/auth-verifier.ts (lines 13, 131, 135) — `HOME=/root` in comments + subscription-path env contract
- File: `livos/packages/livinityd/source/modules/claude-runner/auth-verifier.ts:13,131,135`
- Category: HARDCODED_ROOT_PATH
- Disposition: **COSMETIC** (sacred subscription-path code per `feedback_subscription_only`)
- Rationale: auth-verifier.ts is part of the Subscription Agent SDK path that memory `feedback_subscription_only` flags as sacred ("never break working Agent SDK"). The actual `HOME=/root` in the spawn env (if any in the code body) is part of the BROKER_FORCE_ROOT_HOME contract; the comments document it. Phase 192 leaves auth-verifier.ts untouched. If subscription credentials live under `/home/bruce/.claude/` post-cutover, that's a separate (operator-managed) credential migration outside Phase 192 scope — documented in 192-04 rollback notes.

## SUDO_WRAPPER

These are existing `sudo` invocations already in the code that rely on `bruce ALL=(ALL) NOPASSWD:ALL` from `_dld_create_desktop_user` (Phase 106-10). Phase 192-01 NARROWS this broad grant to a Cmnd_Alias list.

### 19. apps/apps.ts:218 — `sudo chown -R 1000:1000 ${dataDirectory}/tor`
- File: `livos/packages/livinityd/source/modules/apps/apps.ts:218`
- Category: SUDO_WRAPPER
- Disposition: **NEEDS_SUDOERS**
- Cmnd: `/usr/bin/chown -R 1000\:1000 *`
- Rationale: Tor data dir needs uid 1000 (the per-tor-container uid) regardless of host filesystem ownership. Even with bruce-owned /opt/livos/data, this chown is required for the Docker volume to be writable by the tor container's internal uid. Bruce-as-root via sudo is required because the container uid (1000) is not always identical to bruce's host uid (can be 1001 on multi-user installs). Sudoers entry must allow `/usr/bin/chown -R 1000:1000 *` with the wildcard restricted to the trailing argument position only.

### 20. server/index.ts:1894 — `sudo -u ${desktopUser} nohup /usr/local/bin/livos-launch-chrome ...`
- File: `livos/packages/livinityd/source/modules/server/index.ts:1894`
- Category: SUDO_WRAPPER
- Disposition: **NEEDS_SUDOERS** (transitional — drops to no-sudo in v38.4 polish)
- Cmnd: `/usr/bin/sudo -u bruce /usr/local/bin/livos-launch-chrome *`
- Rationale: Currently `livinityd` runs as root and uses `sudo -u bruce` to drop to bruce. After 192-02, livinityd IS bruce — so `sudo -u bruce` becomes a no-op self-reference. `sudo -u bruce <cmd>` from bruce typically still works without password (sudo allows self-targeted -u), but to be safe Phase 192-01 includes a narrow Cmnd_Alias. v38.4 polish should drop the `sudo -u bruce` prefix entirely from server/index.ts:1894.

### 21. streaming/xvfb-spawner.ts:4-58 + vnc-bridge.ts:137 + computer-use/native/window.ts (sudo -u user wrapper)
- Files:
  - `livos/packages/livinityd/source/modules/streaming/xvfb-spawner.ts:4,58`
  - `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts:137`
- Category: SUDO_WRAPPER
- Disposition: **NEEDS_SUDOERS** (transitional)
- Cmnd: `/usr/bin/sudo -n -u bruce /usr/bin/Xvfb *`, `/usr/bin/sudo -n -u bruce /usr/bin/x11vnc *`
- Rationale: Same pattern as #20. WebApp Launcher spawns Xvfb/x11vnc under `sudo -n -u bruce`. Post-bruce-cutover, these become no-ops. Narrow Cmnd_Alias bridges the transition without operator action.

### 22. chrome-master/master-login-routes.ts:223,495,762,860,883 — `sudo -u bruce google-chrome ...`
- File: `livos/packages/livinityd/source/modules/chrome-master/master-login-routes.ts` (multiple lines)
- Category: SUDO_WRAPPER
- Disposition: **NEEDS_SUDOERS** (transitional)
- Cmnd: `/usr/bin/sudo -u bruce /usr/bin/google-chrome *`, `/usr/bin/sudo -n -u bruce /usr/bin/google-chrome *`
- Rationale: Chrome-master spawns google-chrome as bruce. Same transitional pattern.

## SYSTEMCTL

**Result: 0 occurrences in production code.**

`grep -rn "execSync.*systemctl\|spawn.*systemctl" livos/packages/livinityd/source/ --include='*.ts' | grep -v test` returned EMPTY. livinityd does NOT control its own systemd units at runtime; the deploy script (scripts/install/deploy-livinityd.sh) does, and runs as root during install. No NEEDS_SUDOERS entries required for systemctl.

## USER_MGMT

**Result: 0 occurrences in production code.**

`grep -rn "execSync.*useradd\|execSync.*usermod"` returned EMPTY. User creation lives in `_dld_create_desktop_user` in the deploy script (runs as root during install), not in livinityd at runtime. No NEEDS_SUDOERS entries required.

---

## Sudoers Command List

Entries with disposition=NEEDS_SUDOERS, formatted for the sudoers fragment:

```
# Phase 192-01 — narrow NOPASSWD set for livinityd running as bruce.
# Each Cmnd_Alias targets ONE exact binary; globs only in argument-position.

Cmnd_Alias LIVINITYD_CHOWN_DOCKER_DATA = /usr/bin/chown -R 1000\:1000 *
Cmnd_Alias LIVINITYD_LAUNCH_CHROME    = /usr/local/bin/livos-launch-chrome *
Cmnd_Alias LIVINITYD_XVFB             = /usr/bin/Xvfb *
Cmnd_Alias LIVINITYD_X11VNC           = /usr/bin/x11vnc *
Cmnd_Alias LIVINITYD_GOOGLE_CHROME    = /usr/bin/google-chrome *
# WebApp Launcher (xdotool window control) — feature gate for v38.4 polish; safe to ship now
Cmnd_Alias LIVINITYD_XDOTOOL          = /usr/bin/xdotool *

bruce ALL=(root)  NOPASSWD: LIVINITYD_CHOWN_DOCKER_DATA, LIVINITYD_XVFB, LIVINITYD_X11VNC, LIVINITYD_XDOTOOL
bruce ALL=(bruce) NOPASSWD: LIVINITYD_LAUNCH_CHROME, LIVINITYD_GOOGLE_CHROME, LIVINITYD_XVFB, LIVINITYD_X11VNC, LIVINITYD_XDOTOOL
```

NOTE on `(bruce)` Runas spec: when livinityd runs `sudo -u bruce <cmd>` from bruce, sudo treats Runas=bruce. The `ALL=(bruce)` rule covers this — bruce can run X as bruce without password.

## Code Change List

Entries with disposition=CODE_CHANGE — inputs for Phase 192-03:

| # | File:Line | Change |
|---|-----------|--------|
| 6 | cc-pty/manager.ts:208-209 | Drop `isRoot` const + `&& !isRoot` term. Simplify to `const skipPerms = skipPermsConfig`. |
| 8 | cc-pty/manager.ts:237 | Comment text: `/root/.claude/.credentials.json` → `${HOME_DIR}/.claude/.credentials.json` |
| 9 | cc-pty/manager.ts:245 | `HOME=/root` → `HOME=${HOME_DIR}` in tmux new-session claude branch |
| 10 | cc-pty/manager.ts:246 | execSync env: `HOME: '/root'` → `HOME: HOME_DIR` |
| 11 | cc-pty/manager.ts:253 | execSync env: `HOME: '/root'` → `HOME: HOME_DIR` (set-option) |
| 12 | cc-pty/manager.ts:314 | `HOME=/root` → `HOME=${HOME_DIR}` in resurrection tmux cmd |
| 13 | cc-pty/manager.ts:315 | execSync env: `HOME: '/root'` → `HOME: HOME_DIR` (resurrection) |
| 14 | cc-pty/manager.ts:347 | pty.spawn env: `HOME: '/root'` → `HOME: HOME_DIR` (attach handle) |
| 15 | livinity-broker/auth.ts:128 | `'/root/.claude'` → `path.join(os.homedir(), '.claude')` |
| 16 | vault-templates/CLAUDE.md:3 | Docstring update — `/root/.claude/.credentials.json` + `HOME=/root` → bruce-uid form |

Add module-level constant `const HOME_DIR = os.homedir()` near manager.ts imports (after line 33), and `import os from 'node:os'` + `import path from 'node:path'` to auth.ts if not already imported.

## Out-of-scope items (DEFER / COSMETIC)

| # | File:Line | Reason |
|---|-----------|--------|
| 7 | vault-scaffolder.ts:206 | Sacred (Phase 162-01); Phase 193 supersedes vault concept entirely |
| 17 | apps/builtin-apps.ts:509 | Ollama container's internal `/root/.ollama` — operator-facing breaking change risk |
| 18 | claude-runner/auth-verifier.ts:13,131,135 | Sacred subscription path per `feedback_subscription_only` |

These do NOT block Phase 192. They are documented for future polish phases.

## Hand-off to 192-02

The migration script (`scripts/migrate-to-bruce-user.sh`) needs to:
1. `chown -R bruce:bruce /opt/livos/data/` so all 5 FS_OWNERSHIP entries drop to no-sudo.
2. `chown bruce:bruce /opt/livos/.env*` so livinityd-as-bruce can read .env.
3. Install the sudoers fragment from this audit at `/etc/sudoers.d/livinityd` (mode 0440 root:root).
4. Add bruce to docker group if docker is installed.

## Hand-off to 192-03

10 source edits (the Code Change List above), all under `livos/packages/livinityd/source/` plus 1 markdown template. New vitest assertions cover the manager.ts changes.

## Hand-off to 192-04

Sacred SHA registry update: pin `scripts/install/sudoers.d/livinityd` (the new sudoers fragment is a security boundary; future widening must be deliberate). The Code Change List files (manager.ts, auth.ts) are NOT currently in `sacred-shas-v38.json` and remain unpinned (active iteration surface).
