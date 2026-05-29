# Phase 251 — Remediation Backlog (seed for Phase 252)

**Date:** 2026-05-29
**Source:** synthesized from PORTABILITY-AUDIT.md + the eight Wave-1 findings (251-01 … 251-08).
**Status:** READ-ONLY proposal. No fix applied here — this IS the Phase 252 scope.

**Severity:** **P0** = blocks a seamless fresh install (terminal/Luse dead) · **P1** = feature degrades or
latent break the moment a parameter changes · **P2** = hygiene / multi-user-future / graceful-degrade.
**Effort:** S = one line / one apt entry · M = small refactor / new seed step · L = cross-module redesign.
**Kind:** installer = shell/seed only · code = TS source · both.

---

## P0 — blocks a seamless fresh install (do these first in Phase 252)

### R1 — Install `xserver-xephyr` (+ verify) [P0 · S · installer]
`computer_create_display` DEFAULT mode is `xephyr` but no apt list installs `Xephyr`.
- **Change:** add `xserver-xephyr` to `_dld_install_streaming_packages` (`scripts/install/deploy-livinityd.sh:513-524`)
  **and** the mirror block in `update.sh:359-372`; add `Xephyr` to the verify loops (`deploy-livinityd.sh:534`, `update.sh:380`).
- **From:** 251-02 (#4), 251-03 (§3 HIGH). Keeps `D-V44-DISPLAY-XEPHYR-DEFAULT`.

### R2 — Install `xterm` [P0 · S · installer]
NEW-this-session dependency (`b774c20b`): `launch_app_in_display({app:'terminal'})` → `xterm`, installed nowhere; ENOENT is swallowed.
- **Change:** add `xterm` to the same streaming apt blocks as R1 (`deploy-livinityd.sh:513-524` + `update.sh:359-372`).
- **From:** 251-03 (§3 HIGH, NEW).

### R3 — Add `child.on('error')` to display-manager `create()` [P0 · S · code]
Missing-binary ENOENT currently returns a **false-positive success** (success envelope + Redis HSET, fake pid `-1`).
- **Change:** in `display-manager.ts` `create()` (`:224-253`) attach an `'error'` listener → return `isError:true`,
  do **not** write the `luse:display:<id>` Redis key, do **not** report a pid. Closes the false-success class regardless of which X binary is present.
- **From:** 251-02 (#7, recommendation C). Independent of R1.

### R4 — PTY user: copy the Chrome `livos:desktop:user` pattern [P0 · M · code]
Terminal PTY pins `bruce` in three layers with no runtime lookup → dead on any non-`bruce` box (and `_DLD_DESKTOP_USER` IS overridable).
- **Change:** in `ws-handler.ts:466` resolve the user from Redis `livos:desktop:user` with a `'bruce'` fallback
  (mirror `server/index.ts:1774`); widen `PtySpawnOptions.username` from the literal `'bruce'` to `string`
  (`types.ts:31`); relax the `session.ts:77` guard to reject only `root`/uid-0 (preserve D-243-NO-ROOT); make the
  `session.ts:82-89` argv use the resolved username instead of literal `--user bruce`.
- **From:** 251-04 (#1-3, severest), 251-07 (item d). Cross-ref R8 (same spawn line, separate sudoers fix).

### R8 — PTY self-`sudo` to bash has no sudoers grant [P0 · S or M · both]
`livos.service` runs as `bruce`; the PTY does `sudo --user bruce --login bash`, but `sudoers.d/livinityd` grants
no Cmnd_Alias for bash → password prompt → spawn fails. (Co-located with R4 on `session.ts:103`.)
- **Change (pick one):** (a) add `Cmnd_Alias LIVINITYD_PTY_BASH = /usr/bin/sudo --user <user> --login bash *`
  + Runas NOPASSWD line to `sudoers.d/livinityd:46-53` [S], OR (b) **drop the self-`sudo`** since livinityd already
  runs as the desktop user — spawn `bash --login` directly [M, cleaner, also resolves R4's argv layer].
- **From:** 251-07 (R-251-07-A, BLOCKER). **(b) is recommended** — it removes the whole self-sudo class.

### R9 — Pin `get.livinity.io` entrypoint to Path A [P0 · L (cross-system) · both]
Which of FOUR install entrypoints `get.livinity.io` runs is **unprovable from the repo**. Only Path A seeds
`liv:mcp:config` (→ AionUi luse). Path B writes `CHANGEME`; Path C (route.ts fallback `livos/install.sh`) seeds no MCP config.
- **Change:** (1) pin the alias in-repo — add a documented Vercel rewrite/redirect mapping `get.livinity.io` →
  the `install.sh` shim, OR document the DNS alias in README so the canonical body is auditable;
  (2) make `platform/web/src/app/install.sh/route.ts:35` fall back to **`scripts/install.sh` (Path A)** instead of `livos/install.sh`;
  (3) if Path B (`/install.sh`) is reachable from any public URL, replace `env-seed.sh:64-71` `CHANGEME` with `openssl rand`
  + add an MCP-seed step, else mark Path B internal-only.
- **From:** 251-08 (items 1-3, CRITICAL), 251-01 (Path-B GAP). Requires live DNS/Vercel inspection — see R11.

---

## P1 — feature degrades / latent break

### R5 — `liv-assistant.service` gets `EnvironmentFile=-/opt/livos/.env` [P1 · S · installer]
The Luse Redis URL currently survives on a fresh box ONLY via the single `resolveLuseRedisUrl` `.env` file-read
fallback. The hand `redis-env.conf` drop-in exists in no installer.
- **Change:** add `EnvironmentFile=-/opt/livos/.env` to the committed `systemd/liv-assistant.service` unit
  (the `-` prefix tolerates a missing file). aioncore→claude→luse then inherit `REDIS_URL` → `server.ts:118`
  resolves with no dependence on the per-MCP env seed or the file-read. **Do NOT productize the literal `redis-env.conf`** (it bakes a per-install secret into a unit).
- **From:** 251-06 (recommendation #1), 251-01 (defense-in-depth #3).

### R6 — Seed `XAUTHORITY`/`DISPLAY` resolved, not hardcoded GDM/uid-1000 [P1 · M · installer]
Seed bakes `XAUTHORITY=/run/user/1000/gdm/Xauthority` (uid-1000 + GDM) + `DISPLAY=:1` as bare literals; a fresh
Xvfb+fluxbox box has neither uid-1000-guaranteed nor a `gdm` dir.
- **Change:** add `__LIVOS_XAUTHORITY__`/`__LIVOS_DISPLAY__` placeholders to the substitution set
  (`deploy-livinityd.sh:1138-1141`) resolved at seed time via `id -u "$user"` + the actual session Xauthority,
  OR drop the `gdm` path and rely on the `-ac` (disable-access-control) the displays already spawn with.
- **From:** 251-02 (#8, rec D), 251-04 (#8, fix 3-4), 251-08 (item 5). De-duped across three findings.

### R7 — Install `gnome-terminal` [P1 · S · installer]
`computer_application({application:'terminal'})` on host `:1` targets `gnome-terminal`, installed nowhere (only `gnome-screenshot`).
- **Change:** add `gnome-terminal` to the streaming apt blocks (R1's blocks).
- **From:** 251-03 (§3 MED).

### R10 — Seed `livos:v43:terminal_panel='true'` (or document) [P1 · S · installer]
Flag defaults OFF; never seeded → dock entry hidden + WS `4403` on a fresh box until the operator sets it by hand.
- **Change:** seed `'true'` in `env-seed.sh`/`deploy-livinityd.sh` (mirror the MCP-seed mechanism), or document the operator step in onboarding.
- **From:** 251-07 (R-251-07-B).

### R11 — Resolve + record the live `get.livinity.io` → script mapping [P1 · S · ops]
The Dim-8 P0 cannot be settled in-repo OR by Mini PC SSH (it is a DNS/Vercel-alias question).
- **Change:** inspect the live Cloudflare DNS + Vercel alias for `get.livinity.io`, record the resolved
  entrypoint in `.planning/` (or README), and confirm it is Path A. Feeds R9.
- **From:** 251-08 (§`get.livinity.io` resolution).

### R12 — Loud health signal when `liv:mcp:config` catalog is empty [P1 · S · code]
`seedAionUiMcpConfig` silently no-ops (`created=0 skipped=0` log) on an empty catalog → a missing MCP seed is invisible.
- **Change:** upgrade `seed.ts:101-104` from a `warn` log to an operator-visible health signal (surface in `/api/health` or onboarding).
- **From:** 251-08 (item 4).

---

## P2 — hygiene / multi-user-future / graceful-degrade

### R13 — Unify `LUSE_USER_ID` default + seed it [P2 · S · both]
Same env var defaults to `'admin'` (`server.ts:315`) vs `'bruce'` (`tools.ts:915-916`) in one process; unset on fresh box.
- **Change:** pick ONE default (recommend `'bruce'` — drives the allowlist) via a shared const; seed `LUSE_USER_ID` explicitly in `seeds/mcp-servers.json` (same substitution mechanism as `__LIVOS_USER_SLUG__`).
- **From:** 251-04 (#9/#10, fix 2).

### R14 — Single `$LIVOS_ROOT` source of truth [P2 · L · both]
`/opt/livos` is a leaky half-parameter: installer pins it (`deploy-livinityd.sh:61` no override) while luse code re-hardcodes it (`server.ts:124`, `tools.ts:454`) ignoring the movable `dataDirectory`.
- **Change:** derive the install root from `$LIVOS_ROOT` (default `/opt/livos`) in `@livos/config`; make
  `_DLD_LIVOS_DIR="${_DLD_LIVOS_DIR:-/opt/livos}"` overridable; replace the `server.ts:124` array + `tools.ts:454` uploads prefix with the derived root; reconcile the dangling `<LIV_DATA_ROOT>` comment (`server/index.ts:1823`).
- **From:** 251-05 (Task 2 recommendations). Subsumes R-from-251-01 fallback-array fix.

### R15 — Namespace `/tmp` markers under `$XDG_RUNTIME_DIR` [P2 · M · code]
`/tmp/livos-active-webapp-wid` + `/tmp/luse-` allowlist prefix are world-shared → multi-user collision + symlink-race (TOCTOU, no `O_NOFOLLOW`).
- **Change:** move the active-wid marker to `${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/livos/active-webapp-wid` (per-user 0700 tmpfs); scope the `/tmp/luse-` allowlist (`tools.ts:453`) under `$XDG_RUNTIME_DIR/luse-*`.
- **From:** 251-05 (Task 1b). LOW today / MEDIUM under v7.0 multi-user re-activation.

### R16 — Install `x11-utils` + `xclip` + `wmctrl` [P2 · S · installer]
All degrade gracefully today, but: xdpyinfo (dimension annotation) missing; xclip falsely commented "installed" (keyboard.type fallback); wmctrl may only arrive via a desktop meta-pkg.
- **Change:** add `x11-utils xclip wmctrl` to the streaming apt blocks (R1's blocks).
- **From:** 251-03 (§3 LOW × 3).

---

## Copy-pasteable apt remediation (covers R1, R2, R7, R16)

Add to `_dld_install_streaming_packages` (`scripts/install/deploy-livinityd.sh`, alongside `:513-524`) **and** the
mirror block in `update.sh:359-372`:

```sh
# Phase 252 portability — luse display-lifecycle + terminal binaries the
# v44/250-hotfix code now hard-requires but were never on the apt list.
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    xserver-xephyr xterm gnome-terminal x11-utils xclip wmctrl \
    2>&1 | tail -5 || warn "Some luse display/terminal packages failed (non-fatal)"
```

Extend the verify loop (`deploy-livinityd.sh:534` / `update.sh:380`) with `Xephyr xterm` so a missing critical
binary surfaces a warning at install time.

---

## Phase 252 sequencing recommendation

1. **Wave 1 — P0 apt + error-handling (R1, R2, R3, R7, R16):** one apt block + one `child.on('error')` — unblocks Luse display end-to-end on Path A. Cheapest, highest impact.
2. **Wave 2 — P0 terminal (R8 then R4):** drop the self-`sudo` (R8b), which also collapses R4's argv layer; then finish R4's Redis lookup + type widening + flag seed (R10).
3. **Wave 3 — P0/P1 install-path (R11 → R9):** resolve the live `get.livinity.io` alias, then pin route.ts to Path A and seed/secure the other paths.
4. **Wave 4 — P1 env + seed hardening (R5, R6, R12):** EnvironmentFile, resolved Xauthority/DISPLAY, loud empty-catalog signal.
5. **Wave 5 — P2 hygiene (R13, R14, R15):** unify LUSE_USER_ID, `$LIVOS_ROOT` source of truth, XDG_RUNTIME_DIR markers. Bigger refactors, no fresh-install blocker.

Every item above is concrete (file:line + change + effort) and traces to a findings doc — Phase 252 needs zero further analysis to start.
