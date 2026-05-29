# Phase 251 — Fresh-Install Portability Audit (Synthesis)

**Date:** 2026-05-29
**Mode:** READ-ONLY synthesis of eight Wave-1 findings docs (251-01 … 251-08). No source edits.
**Scope:** the v44 Luse display-lifecycle + 246/243 terminal + 250-hotfix change neighbourhood, audited
against the repo + every installer script. Every claim below traces to a findings doc (which in turn cites
`file:line`).

---

## The two operator questions — headline answers

### Q1 — "Is there any hardcoded value in THIS session's changes that breaks portability?"

**YES — three NEW-this-session hardcodes, one is an active blocker on every fresh box:**

| # | NEW hardcode | File:line | Severity | Breaks |
|---|--------------|-----------|----------|--------|
| 1 | PTY `username:'bruce'` pinned in **three independent layers** (literal arg + string-literal *type* + runtime guard/argv) with **no `livos:desktop:user` lookup** (unlike Chrome) | `pty-sessions/ws-handler.ts:466`, `types.ts:31`, `session.ts:77,82-89` | **P1** (LATENT today, REAL-GAP the instant `_DLD_DESKTOP_USER` is overridden) | terminal panel — `sudo --user bruce` against a non-existent user fails → no shell (251-04, 251-07) |
| 2 | `xterm` is the new `launch_app_in_display(terminal)` target (250-hotfix `b774c20b`) but `xterm` is installed by **no** apt list, and the ENOENT is **silently swallowed** | `mcp/tools.ts:1174,1198` ⇄ apt lists | **P0** | `computer_launch_app_in_display({app:'terminal'})` silently launches nothing on every fresh install (251-03) |
| 3 | `resolveLuseRedisUrl` `/opt/livos/.env` fallback array is a **literal** (`b4f2a345`), not derived from `$LIVOS_ROOT`/config | `computer-use/mcp/server.ts:124` | **P2 (RISK)** | latent — works only because every installer hardwires `/opt/livos`; silently fails-closed on any relocated root (251-01, 251-05) |

Plus the session **created two live-only artifacts that exist in no installer** — the
`liv-assistant.service.d/redis-env.conf` Redis-env drop-in and the hand `apt install xterm imagemagick
xserver-xephyr` on the Mini PC. These mask gaps on the live box that a fresh box does not have (251-06, 251-03).
`imagemagick`/`import` was confirmed **NOT a code dependency** — pure operator debug convenience (251-03).

### Q2 — "Would a brand-new Mini PC / VPS install come up seamlessly with terminal + Luse working?"

## VERDICT: **NO-GO for a seamless fresh install** of the terminal + Luse-display features.

The core LivOS daemon, screenshot stack, xvfb path, WS routes, Caddy matchers, and cookie-auth **are
portable and come up clean**. But the two headline session features are **dead on a fresh Path-A box** until
remediation, and on non-Path-A installs the Luse MCP chain silently evaporates entirely.

**P0 blockers (a fresh Path-A install will NOT have working terminal + Luse-display until these are fixed):**

1. **`xserver-xephyr` not installed** → `computer_create_display` DEFAULT mode (`xephyr`) fails. Worse, the
   failure is a **false-positive success** (no `child.on('error')` in `display-manager.ts` create()) — the AI
   is told the display exists, a Redis key is written, but no X server runs. (251-02, 251-03)
2. **`xterm` not installed** → `computer_launch_app_in_display({app:'terminal'})` silently launches nothing
   (ENOENT swallowed). (251-03)
3. **Terminal PTY sudoers gap** → `livos.service` runs as `bruce`, the PTY does a `bruce→bruce`
   `sudo --user bruce --login bash`, and `sudoers.d/livinityd` grants **no** Cmnd_Alias for that → password
   prompt it can never answer → PTY spawn throws → no shell. (251-07)
4. **`livos:v43:terminal_panel` flag never seeded** → terminal dock entry hidden + WS `4403` until an operator
   sets the Redis key by hand. (251-07)
5. **`get.livinity.io` → install-script mapping is UNPROVABLE from the repo** → the entire GO/NO-GO is
   conditional on which of FOUR entrypoints it resolves to. Only Path A seeds `liv:mcp:config`; Path B writes
   `CHANGEME` secrets; Path C (route.ts fallback) seeds no MCP config. If it is anything but Path A, the Luse
   MCP chain is silently absent. (251-08)

**P1 (feature degrades / latent break):** PTY `username:'bruce'` no-lookup; `liv-assistant.service` has no
`EnvironmentFile` so the Luse Redis URL survives only via the single `/opt/livos/.env` file-read fallback;
seed `XAUTHORITY=/run/user/1000/gdm/Xauthority` assumes uid-1000 + GDM on a GDM-less fluxbox box;
`gnome-terminal` missing for `computer_application(terminal)`.

**P2 (hygiene / latent):** `LUSE_USER_ID` default disagreement (`'admin'` vs `'bruce'` in the same process);
hardcoded `/opt/livos` install root (leaky-parameter); `/tmp/livos-active-webapp-wid` shared-marker
collision/symlink risk under multi-user; missing `x11-utils` (xdpyinfo) / `xclip` / `wmctrl`; empty-catalog
boot orchestrator no-ops silently.

---

## Per-dimension matrix (the consolidated answer, backed by the eight findings)

Legend — **New/Pre:** NEW-this-session vs PRE-EXISTING · **Status:** COVERED / GAP / RISK · **Sev:** P0 blocks
fresh install / P1 degrades feature / P2 hygiene.

| Dim | Dimension | New/Pre | Status | Sev | Evidence (findings → file:line) | One-line fix |
|-----|-----------|---------|--------|-----|----------------------------------|--------------|
| 1 | **Luse Redis-URL resolution** (`resolveLuseRedisUrl`) — Path A | PRE | **COVERED** | — | 251-01 → `mcp-servers.json:177` + `deploy-livinityd.sh:1138,1181` + `seed.ts:125` + `transform.ts:31`; `.env` fallback `server.ts:124` reads real URL `deploy-livinityd.sh:988` | none (Path A) |
| 1b | … fallback path array is a literal `/opt/livos` | **NEW** (`b4f2a345`) | **RISK** | P2 | 251-01/251-05 → `server.ts:124` | derive from `$LIVOS_ROOT` |
| 1c | … Path B writes `CHANGEME`, seeds no `liv:mcp:config` | PRE | **GAP** | P0* | 251-01/251-08 → `env-seed.sh:69` | real `openssl rand` + MCP seed (or retire Path B) |
| 2 | **Luse display backend** — `create_display` DEFAULT mode `xephyr` | **NEW** (P248) | **GAP** | **P0** | 251-02/251-03 → `display-manager.ts:216`; no `xserver-xephyr` in any apt list | install `xserver-xephyr` (+ xephyr→xvfb fallback) |
| 2b | … silent **false-positive success** (no `child.on('error')`) | **NEW** (P248) | **GAP/RISK** | **P0** | 251-02 → `display-manager.ts:224-253` | add `child.on('error')` → real error envelope, no Redis key |
| 2c | … xvfb opt-in mode | PRE | **COVERED** | — | 251-02/251-03 → `deploy-livinityd.sh:523` | none |
| 3 | **External binaries** — xterm for `launch_app_in_display(terminal)` | **NEW** (`b774c20b`) | **GAP** | **P0** | 251-03 → `tools.ts:1174,1198`; not in apt | install `xterm` |
| 3b | … gnome-terminal for `computer_application(terminal)` | PRE | **GAP** | P1 | 251-03 → `window.ts:60-63`; not in apt | install `gnome-terminal` |
| 3c | … x11-utils (xdpyinfo) / xclip / wmctrl | PRE | **GAP** | P2 | 251-03 → `display-size.ts:74`, `input.ts:965`, `window.ts:137`; not in apt | install the three (all degrade gracefully) |
| 3d | … Xvfb/xdotool/maim/scrot/x11vnc/websockify/fluxbox | PRE | **COVERED** | — | 251-03 → `deploy-livinityd.sh:513-524` | none |
| 3e | … `imagemagick`/`import` | n/a | **NON-DEP** | — | 251-03 → zero code spawns `import` | exclude — operator debug only |
| 4 | **Identity — PTY `username:'bruce'`** (3-layer pin, no lookup) | **NEW** (`a1cb55ef`) | **GAP** | P1 | 251-04/251-07 → `ws-handler.ts:466`, `types.ts:31`, `session.ts:77,82-89` | copy Chrome `livos:desktop:user` pattern; widen type; relax guard to non-root |
| 4b | … `LUSE_USER_ID` default `'admin'` vs `'bruce'` (same process) | PRE | **GAP** | P2 | 251-04 → `server.ts:315` vs `tools.ts:915-916`; unset on fresh box | unify to one default + seed `LUSE_USER_ID` |
| 4c | … seed `XAUTHORITY=/run/user/1000/gdm/Xauthority` (uid-1000 + GDM) | PRE | **RISK/GAP** | P1 | 251-02/251-04/251-08 → `mcp-servers.json:176` (not substituted) | resolve at seed time via `id -u`, drop `gdm` |
| 4d | … seed `DISPLAY=:1` | PRE | **COVERED** (LATENT-RISK) | P2 | 251-04 → `mcp-servers.json:175` | substitute / derive if canvas display differs |
| 4e | … Chrome user/uid/Xauthority runtime resolution | PRE | **COVERED** (reference) | — | 251-04 → `server/index.ts:1774-1778` | template for fixing 4/4c |
| 5 | **Install-root** `/opt/livos` (leaky parameter) | PRE | **GAP** | P2 | 251-05 → `deploy-livinityd.sh:61` (hard literal, no override); `tools.ts:454` re-hardcodes root | single `$LIVOS_ROOT` source of truth in `@livos/config` |
| 5b | … `dataDirectory`-derived JWT/store/backups | PRE | **COVERED** (model) | — | 251-05 → `server/index.ts:124` | template the luse paths should copy |
| 5c | … `/tmp/livos-active-webapp-wid` + `/tmp/luse-` shared markers | PRE | **RISK** | P2 | 251-05 → `tools.ts:278,453` | namespace under `$XDG_RUNTIME_DIR` |
| 6 | **systemd env delivery** — `liv-assistant.service` no `EnvironmentFile`/Redis env | **NEW** (session) | **GAP** | P1 | 251-06 → `liv-assistant.service:8-31`; live-only `redis-env.conf` exists nowhere in repo | add `EnvironmentFile=-/opt/livos/.env` to the committed unit |
| 6b | … core services (livos/liv-core/worker/memory) Redis env | PRE | **COVERED** | — | 251-06 → `deploy-livinityd.sh:1480,1572` | none |
| 7 | **Terminal panel** — build chain (WebGL pin + lockfile + node-pty) | **NEW** (243/246) | **COVERED** | — | 251-07 → `ui/package.json:75`, `pnpm-lock.yaml:821`, `livinityd/package.json:123` | none |
| 7b | … WS route + Caddy matcher + WS-host derivation + cookie auth | **NEW** | **COVERED** | — | 251-07 → `server/index.ts:1393`, `caddy.ts:453`, `use-terminal-ws.ts:61-74`, `ws-handler.ts:243-325` | none |
| 7c | … PTY self-`sudo` to bash has no sudoers grant | **NEW** (`a1cb55ef`) | **GAP/BLOCKER** | **P0** | 251-07 → `sudoers.d/livinityd:46-53` ⇄ `session.ts:103` | add Cmnd_Alias OR drop self-`sudo` (livinityd IS bruce) |
| 7d | … `livos:v43:terminal_panel` flag never seeded | **NEW** (243) | **GAP** | P1 | 251-07 → `feature-flag.ts:28-33`; no install seed | seed `'true'` at install (or document) |
| 8 | **Installer-path divergence** — `get.livinity.io` → which of 4 entrypoints? | PRE | **GAP** | **P0** | 251-08 → `README.md:93` (only ref); no Vercel route/rewrite in repo | pin the alias in-repo / document it |
| 8b | … Path A seeds real secrets + `liv:mcp:config` | PRE | **COVERED** | — | 251-08 → `deploy-livinityd.sh:1048,1138,1181` | the good path |
| 8c | … Path C (`livos/install.sh`, route.ts fallback) seeds no MCP config | PRE | **GAP** | P1 | 251-08 → `route.ts:35`; `livos/install.sh` (no seed) | route fallback to Path A, or port the MCP seed |
| 8d | … AionUi luse first-create (`seedAionUiMcpConfig`) is runtime, downstream of catalog | PRE | **COVERED on A / GAP on B,C** | P1 | 251-08 → `seed.ts:64,101-104`, wired `index.ts:670` | louder health signal when catalog empty |

`*` Path-B severity is P0 *if* `get.livinity.io` resolves to Path B; otherwise N/A. The conditional is itself
the Dim-8 P0.

---

## De-duplicated cross-referenced findings

Several findings surface the **same** underlying defect from different angles — listed once, cross-referenced
so the backlog has no double-counting:

- **PTY `bruce` user** appears in **251-04** (identity dimension) and **251-07** (terminal dimension). It is
  ONE defect (three-layer pin, no `livos:desktop:user` lookup). Backlog item **R4** owns the fix; R8
  (sudoers) is a *separate, co-located* terminal blocker on the same spawn line.
- **Seed `XAUTHORITY=/run/user/1000/gdm/Xauthority` + `DISPLAY=:1`** appears in **251-02**, **251-04**, and
  **251-08** (display, identity, seed-integrity views). ONE defect — backlog item **R6**.
- **`liv-assistant.service` no Redis env / `redis-env.conf` live-only drop-in** appears in **251-01** (as the
  load-bearing fallback) and **251-06** (as the delivery gap). ONE fix — backlog item **R5**.
- **Empty-`liv:mcp:config` → AionUi luse never created** appears in **251-01**, **251-06** (`update.sh:725`
  patch-if-exists), and **251-08** (boot orchestrator is a pure consumer). ONE root cause: only Path A seeds
  the catalog. Backlog items **R9** (path divergence) + **R10** (loud health signal).

---

## Live corroboration (Task 3)

**SKIPPED.** Per D-251-LIVE-OPTIONAL the live Mini PC spot-check is optional and must never block synthesis.
The audit ran in an offline/Windows synthesis context with no Tailscale session established in this run, and
prior 251 sessions recorded the Mini PC SSH path as fail2ban-sensitive. The repo + installer-script evidence
is sufficient and self-consistent for the GO/NO-GO verdict; every P0/P1 claim is repo-traceable. The one
genuinely live-only question — **what `get.livinity.io` actually resolves to** (Dim 8, P0) — cannot be settled
by SSH to the Mini PC anyway (it is a DNS/Vercel-alias question, out of repo + box scope) and is captured as
backlog item **R11**. If an operator later wants corroboration, the single batched read-only command is:

```sh
ssh bruce@100.112.68.1 'command -v xterm Xephyr gnome-terminal import; \
  ls /etc/systemd/system/liv-assistant.service.d/redis-env.conf 2>/dev/null; \
  grep -c REDIS_URL /opt/livos/.env'
```

(Tailscale IP only, never the public/LAN IP; one invocation for fail2ban discipline.)

---

## Bottom line

A fresh **Path-A** install brings up the LivOS daemon, screenshot/xvfb/input stack, WS routes, Caddy, and
cookie-auth correctly — but the **v44 visible display-lifecycle** (Xephyr default) and the **250-hotfix
terminal-launch + 243/246 terminal panel** are **DEAD** until: (P0) `xserver-xephyr` + `xterm` are installed,
the `create_display` error handler is added, the PTY sudoers grant is added (or the self-`sudo` dropped), the
`terminal_panel` flag is seeded, AND `get.livinity.io`'s entrypoint is pinned to Path A. On any non-Path-A
entrypoint the Luse MCP chain silently evaporates. The session introduced no portability-breaking secret
literals, but it DID introduce the `xterm` hard-dependency, the `bruce` PTY triple-pin, and the `/opt/livos`
Redis-fallback literal, and it papered over the gaps on the live box with un-reproducible hand artifacts.

Every gap is now a concrete, severity-ranked item in **REMEDIATION-BACKLOG.md** — the seed for Phase 252.
