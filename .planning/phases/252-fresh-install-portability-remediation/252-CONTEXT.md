# Phase 252: Fresh-Install Portability Remediation - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning
**Source:** Phase 251 audit REMEDIATION-BACKLOG.md (locked spec — all items pre-decided with file:line + change + effort)

<domain>
## Phase Boundary

Close the fresh-install portability gaps surfaced by the Phase 251 audit so that a clean
`get.livinity.io` install brings up the **full Luse computer-use + desktop terminal stack
with zero manual steps**. Scope is the 16-item backlog at
`.planning/phases/251-fresh-install-portability-audit/REMEDIATION-BACKLOG.md` — every item
already carries file:line, exact change, effort (S/M/L) and kind (installer/code/both).
This phase does NOT re-audit or re-discover; it executes the decided fixes.

**In scope:** all 16 items R1–R16 across the backlog's 5 recommended waves.
**Out of scope:** any fix not in the backlog; net-new features; live Mini PC deploy
(this phase is source/installer changes — deploy is a separate operator step, see D-251 / R11).

## Sacred constraints (MUST hold)

- **D-V44-SACRED** — sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (the liv/core blob)
  must remain unchanged; the pre-commit `[sacred-sha]` hook verifies it. None of these fixes
  touch that blob, but verify hook PASS on every commit.
- **D-243-NO-ROOT** — the desktop/PTY user must never be `root`/uid-0. R4's guard relaxation
  must reject root/uid-0 while allowing any non-root user.
- **Server 4 / Server 5 off-limits** — no deploy targets here; this is repo-source work only.
- **`.planning/` is gitignored but force-tracked** — commit docs with `git add -f`.
</domain>

<decisions>
## Implementation Decisions (LOCKED — from REMEDIATION-BACKLOG.md)

Every item below is a locked decision. The backlog is authoritative for file:line and the
exact change. Where the backlog gives a "pick one" or "recommended" path, the recommended
path is the locked choice (noted inline).

### Wave 1 — P0 apt + display error-handling (R1, R2, R3, R7, R16)
- **R1** [P0·S·installer] Add `xserver-xephyr` to `_dld_install_streaming_packages`
  (`scripts/install/deploy-livinityd.sh:513-524`) AND the mirror block in `update.sh:359-372`;
  add `Xephyr` to the verify loops (`deploy-livinityd.sh:534`, `update.sh:380`).
- **R2** [P0·S·installer] Add `xterm` to the same streaming apt blocks.
- **R3** [P0·S·code] In `display-manager.ts` `create()` (`:224-253`) attach a `child.on('error')`
  listener → return `isError:true`, do NOT write the `luse:display:<id>` Redis key, do NOT report
  a pid. Closes the false-positive-success class independent of which X binary is present.
- **R7** [P1·S·installer] Add `gnome-terminal` to the streaming apt blocks (grouped into Wave 1
  apt block since it shares the same edit site).
- **R16** [P2·S·installer] Add `x11-utils xclip wmctrl` to the streaming apt blocks (same site).
- **Canonical apt block** (covers R1, R2, R7, R16) — add to `_dld_install_streaming_packages`
  alongside `:513-524` AND the `update.sh:359-372` mirror:
  ```sh
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
      xserver-xephyr xterm gnome-terminal x11-utils xclip wmctrl \
      2>&1 | tail -5 || warn "Some luse display/terminal packages failed (non-fatal)"
  ```
  Extend the verify loop (`deploy-livinityd.sh:534` / `update.sh:380`) with `Xephyr xterm`.

### Wave 2 — P0 terminal user/sudo (R8 then R4, + R10)
- **R8** [P0·both] **LOCKED to option (b): DROP the self-`sudo`.** `livos.service` already runs
  as the desktop user, so spawn `bash --login` directly instead of `sudo --user bruce --login bash`
  at `session.ts:103`. This also collapses R4's argv layer. (Backlog recommends (b).)
- **R4** [P0·M·code] PTY user runtime lookup: in `ws-handler.ts:466` resolve the user from Redis
  `livos:desktop:user` with a `'bruce'` fallback (mirror `server/index.ts:1774`); widen
  `PtySpawnOptions.username` from literal `'bruce'` to `string` (`types.ts:31`); relax the
  `session.ts:77` guard to reject only `root`/uid-0 (preserve D-243-NO-ROOT). With R8(b)
  removing the `sudo --user bruce` argv, the resolved username drives the (now sudo-less) spawn.
- **R10** [P1·S·installer] Seed `livos:v43:terminal_panel='true'` in `env-seed.sh` /
  `deploy-livinityd.sh` (mirror the MCP-seed mechanism) so the dock entry shows + WS does not
  `4403` on a fresh box.

### Wave 3 — P0/P1 install-path (R11 → R9)
- **R11** [P1·S·ops] Resolve the live `get.livinity.io` → script mapping (DNS/Vercel-alias question,
  not answerable in-repo or by Mini PC SSH). Inspect live Cloudflare DNS + Vercel alias, record the
  resolved entrypoint in `.planning/` (or README), confirm it is Path A. **This is an operator/ops
  task — plan it as `autonomous: false` (needs live DNS/Vercel access).** Feeds R9.
- **R9** [P0·L·both] Pin `get.livinity.io` to install Path A:
  (1) pin the alias in-repo — Vercel rewrite/redirect mapping `get.livinity.io` → the `install.sh`
  shim, OR document the DNS alias in README so the canonical body is auditable;
  (2) make `platform/web/src/app/install.sh/route.ts:35` fall back to **`scripts/install.sh`
  (Path A)** instead of `livos/install.sh`;
  (3) if Path B (`/install.sh`) is publicly reachable, replace `env-seed.sh:64-71` `CHANGEME`
  with `openssl rand` + add an MCP-seed step, else mark Path B internal-only.

### Wave 4 — P1 env + seed hardening (R5, R6, R12)
- **R5** [P1·S·installer] Add `EnvironmentFile=-/opt/livos/.env` to the committed
  `systemd/liv-assistant.service` unit (the `-` prefix tolerates a missing file) so
  aioncore→claude→luse inherit `REDIS_URL`. **Do NOT productize the literal `redis-env.conf`**
  (it bakes a per-install secret into a unit).
- **R6** [P1·M·installer] Replace seed literals `XAUTHORITY=/run/user/1000/gdm/Xauthority` +
  `DISPLAY=:1` with `__LIVOS_XAUTHORITY__` / `__LIVOS_DISPLAY__` placeholders in the substitution
  set (`deploy-livinityd.sh:1138-1141`), resolved at seed time via `id -u "$user"` + the actual
  session Xauthority — OR drop the `gdm` path and rely on the `-ac` the displays already spawn with.
- **R12** [P1·S·code] Upgrade `seed.ts:101-104` from a `warn` log to an operator-visible health
  signal (surface empty `liv:mcp:config` catalog in `/api/health` or onboarding).

### Wave 5 — P2 hygiene / multi-user-future (R13, R14, R15)
- **R13** [P2·S·both] Unify `LUSE_USER_ID` default: pick ONE (LOCKED to `'bruce'` — it drives the
  allowlist) via a shared const replacing the `server.ts:315` `'admin'` vs `tools.ts:915-916`
  `'bruce'` split; seed `LUSE_USER_ID` explicitly in `seeds/mcp-servers.json`.
- **R14** [P2·L·both] Single `$LIVOS_ROOT` source of truth: derive the install root from
  `$LIVOS_ROOT` (default `/opt/livos`) in `@livos/config`; make
  `_DLD_LIVOS_DIR="${_DLD_LIVOS_DIR:-/opt/livos}"` overridable (`deploy-livinityd.sh:61`);
  replace the `server.ts:124` fallback array + `tools.ts:454` uploads prefix with the derived
  root; reconcile the dangling `<LIV_DATA_ROOT>` comment (`server/index.ts:1823`).
- **R15** [P2·M·code] Namespace `/tmp` markers under `$XDG_RUNTIME_DIR`: move the active-wid marker
  to `${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/livos/active-webapp-wid` (per-user 0700 tmpfs);
  scope the `/tmp/luse-` allowlist (`tools.ts:453`) under `$XDG_RUNTIME_DIR/luse-*`.

### Claude's Discretion
- Exact plan/wave file decomposition (how many PLAN.md files, which R-items group into one plan).
  Suggested mapping: one plan per backlog wave (5 plans), but the planner may split a wave if a
  single plan would modify too many files or mix installer + code unsafely.
- Whether R3/R12 (display-manager + seed health) get unit tests vs. manual verification.
- Test/verification commands per item (grep for the apt entries, tsc build for the .ts edits, etc.).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The locked spec (authoritative)
- `.planning/phases/251-fresh-install-portability-audit/REMEDIATION-BACKLOG.md` — the 16-item
  decided scope with file:line + change + effort + 5-wave sequencing. THIS IS THE PLAN INPUT.
- `.planning/phases/251-fresh-install-portability-audit/PORTABILITY-AUDIT.md` — the COVERED/GAP/RISK
  matrix + both operator verdicts (why each fix matters).

### Per-dimension evidence (read the relevant one when planning each R-item)
- `.planning/phases/251-fresh-install-portability-audit/findings/251-01-FINDINGS.md` — Redis-URL resolution (R5, R14)
- `.../findings/251-02-FINDINGS.md` — display backend xephyr/xvfb (R1, R3, R6)
- `.../findings/251-03-FINDINGS.md` — binary dependency matrix (R1, R2, R7, R16)
- `.../findings/251-04-FINDINGS.md` — identity hardcodes / PTY user (R4, R6, R13)
- `.../findings/251-05-FINDINGS.md` — install-root & sandbox paths (R14, R15)
- `.../findings/251-06-FINDINGS.md` — systemd & env delivery (R5)
- `.../findings/251-07-FINDINGS.md` — terminal hot-fix portability (R8, R10)
- `.../findings/251-08-FINDINGS.md` — installer-path divergence & MCP seed (R9, R11, R12)

### Source files to be modified (read current state before editing)
- `scripts/install/deploy-livinityd.sh` (apt blocks ~513-524, verify ~534, seed subst ~1138-1141, root literal :61)
- `update.sh` (apt mirror ~359-372, verify ~380, MCP-seed loop ~718-737)
- `systemd/liv-assistant.service` (EnvironmentFile — R5)
- Luse `display-manager.ts` `create()` (~212-253 — R3)
- Luse `server.ts` (resolveLuseRedisUrl ~113-139/:124, LUSE_USER_ID default :315 — R13/R14)
- Luse `tools.ts` (terminal launch ENOENT ~1198, LUSE_USER_ID :915-916, /tmp luse- :453-454 — R13/R15)
- Terminal `ws-handler.ts:466`, `types.ts:31`, `session.ts:77,82-89,103` (R4, R8)
- `mcp-registrar/seed.ts:64,101-104` + wiring `index.ts:670` (R12)
- `server/index.ts:1774` (Chrome `livos:desktop:user` lookup pattern to mirror for R4), `:1823` (R14 comment)
- `seeds/mcp-servers.json:176` (XAUTHORITY/DISPLAY/LUSE_USER_ID seed — R6, R13)
- `platform/web/src/app/install.sh/route.ts:35` (Path-A fallback — R9)
- `scripts/install/env-seed.sh:64-71` (CHANGEME → openssl rand — R9; terminal_panel seed — R10)
- `scripts/install/sudoers.d/livinityd` (R8 — confirm self-sudo removed, no grant needed once R8(b) lands)
</canonical_refs>

<specifics>
## Specific Ideas

- **Sequencing locked to the backlog's 5 waves** (cheapest/highest-impact first):
  W1 apt+error-handling → W2 terminal user/sudo → W3 install-path → W4 env/seed → W5 hygiene.
- R8 collapses into R4: do R8(b) first (drop self-sudo), then R4 finishes the Redis lookup +
  type widening; they touch the same `session.ts` spawn so plan them in one wave, R8 before R4.
- R11 is the only `autonomous: false` item (needs live DNS/Vercel inspection) and gates R9 part (1).
  If R11 cannot be completed in-session, R9 parts (2)+(3) (the route.ts fallback + Path-B hardening)
  are still independently shippable — do not block the whole phase on the DNS question.
- Most items are grep-verifiable (apt package names present in both blocks; `EnvironmentFile=` line
  present; `child.on('error')` present; no literal `--user bruce` / `sudo` in session spawn).
- TypeScript edits (`display-manager.ts`, `server.ts`, `tools.ts`, `ws-handler.ts`, `types.ts`,
  `session.ts`, `seed.ts`) require a build check — the liv/core package compiles to dist
  (`npm run build --workspace=packages/core`).
</specifics>

<deferred>
## Deferred Ideas

None — user selected the full 16-item / 5-wave scope. The backlog explicitly contains no items
beyond R1–R16.
</deferred>

---

*Phase: 252-fresh-install-portability-remediation*
*Context gathered: 2026-05-29 — derived from Phase 251 REMEDIATION-BACKLOG.md (locked spec)*
