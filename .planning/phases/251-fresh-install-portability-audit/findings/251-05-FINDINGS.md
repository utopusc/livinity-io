# 251-05 Findings — Install-Root & Sandbox-Path Portability

**Dimension:** Absolute-path assumptions — install root (`/opt/livos`), data/uploads root, `/home/<user>`,
`/tmp/*` markers, `/usr/local/bin/*`, `/run/user/*` — whether each is parameterized (config/env/`dataDirectory`)
or a hard literal, and the break mode on a differently-rooted install.
**Mode:** Read-only audit (D-251-READONLY). Evidence = repo file:line + installer script:line.
**Produced:** 2026-05-29.

---

## Headline verdict

`/opt/livos` is a **leaky parameter**, not a clean contract. The mismatch is the whole story:

- The **core daemon path IS parameterized.** `dataDirectory` flows in as a CLI flag
  (`cli.ts:59` `--data-directory` → `index.ts:400` `path.resolve(dataDirectory)`), and the installer derives it
  from an **env-overridable** var (`deploy-livinityd.sh:1461`
  `livos_data_dir="${_DLD_LIVOS_DATA_DIR:-${_DLD_LIVOS_DIR}/data}"`). The JWT secret, store, backups, restore
  flag — all build off `this.dataDirectory`, so moving the data root works for those.
- **BUT the luse/sandbox paths under audit RE-HARDCODE the root independently of `dataDirectory`.** The
  `resolveLuseRedisUrl` fallback (`server.ts:124`) and the `computer_read_file` sandbox allowlist
  (`tools.ts:454`) both embed the literal string `/opt/livos/...` — they never consult `dataDirectory`,
  `@livos/config`, or any `LIVOS_ROOT`/`LIV_DATA_ROOT` env. So a non-`/opt/livos` install can move the daemon's
  data dir via the installer flag, and the luse Redis-fallback + file sandbox will silently point at the OLD root.
- **AND the installer itself half-pins it.** `_DLD_LIVOS_DIR="/opt/livos"` (`deploy-livinityd.sh:61`) is a
  **hard literal with no `${VAR:-default}` override** — unlike its neighbours `_DLD_LIVOS_USER` (`:79`) and
  `_DLD_DESKTOP_USER` (`:85`) which ARE overridable. So even the installer can't relocate the install root
  cleanly; only the *data sub-dir* under it (`_DLD_LIVOS_DATA_DIR`) is movable.

Net: `/opt/livos` is **a de-facto fixed contract that nobody declared as one.** The literals "work" only because
every install lands at `/opt/livos`. There is no documented override (README has zero `/opt/livos` /
`--data-directory` / install-root-override mention), and the source-vs-installer parameterization is
**inconsistent** — the daemon respects a movable data dir the luse code ignores.

---

## Task 1 — Absolute-path assumption table (change neighbourhood)

| # | Path literal | File:line | Hard-literal vs derived | NEW / PRE-EXISTING | Break mode on a differently-rooted / multi-user install |
|---|--------------|-----------|-------------------------|--------------------|----------------------------------------------------------|
| 1 | `['/opt/livos/.env','/opt/livos/livos/.env']` (Redis fallback) | `computer-use/mcp/server.ts:124` | **HARD LITERAL** — not derived from `dataDirectory`/config/env | NEW (`b4f2a345`) | Install rooted elsewhere → both paths miss → `resolveLuseRedisUrl` returns undefined → `redis === null` → `displayManager` + `create_stream` **fail-closed** even though Redis is up. Secret value itself is file-read (not literal) = good; only the *root* is wrong. |
| 2 | `/opt/livos/data/uploads/${userId}/` (sandbox allowlist) | `computer-use/mcp/tools.ts:454` (def) + `:926` (error text) | **HARD LITERAL** — `${userId}` interpolated, root hardcoded | PRE-EXISTING (P160-05) | Non-`/opt/livos` root → real uploads live under the new root → `isPathAllowed` rejects every legit upload-dir read → `computer_read_file` jailbreak-gate over-blocks (false-negative). Does NOT consult `dataDirectory`. |
| 3 | `/home/${userSlug}/` (sandbox allowlist) | `computer-use/mcp/tools.ts:452` | **DERIVED** from `LUSE_USER_ID` env (`tools.ts:915`), root `/home` is FHS-standard | PRE-EXISTING | `/home` is a Linux FHS constant — safe. Only the `<userSlug>` segment matters (covered by 251-04). No install-root coupling. |
| 4 | `/tmp/luse-` (sandbox allowlist prefix) | `computer-use/mcp/tools.ts:453` | **HARD LITERAL** — `/tmp` shared root | PRE-EXISTING | `/tmp` world-shared. Any prefix-match `/tmp/luse-<anything>` is allowed → **multi-user collision/symlink-race surface** (see Task 1b). On a single-user box it's fine; under v7.0 multi-user (deferred) a second user can pre-create `/tmp/luse-<x>` to stage a symlink read. |
| 5 | `/tmp/livos-active-webapp-wid` (active-wid marker) | `computer-use/mcp/tools.ts:278` | **HARD LITERAL** — single shared `/tmp` file | PRE-EXISTING (P100-07.4) | One global file, no per-uid/per-user namespacing. Two LivOS instances on one box (or two users) **race + clobber** the marker → luse targets the wrong WebApp wid. mtime-cached 250ms (`:280`) so a clobber is read stale for up to 250ms. See Task 1b. |
| 6 | `${this.livinityd.dataDirectory}/secrets/jwt` | `server/index.ts:124` | **DERIVED** from `dataDirectory` (CLI flag) | PRE-EXISTING | Correctly follows the movable data root. This is the *good* pattern the luse paths (#1, #2) should mirror. |
| 7 | `/run/user/${uid}/gdm/Xauthority` (Chrome launch) | `server/index.ts:1777` | **DERIVED** (`find` under `/run/user/${uid}`), fallback `/home/${desktopUser}/.Xauthority` (`:1778`) | PRE-EXISTING | uid resolved at runtime; `gdm` subdir is a GDM assumption (covered by 251-04). Root `/run/user` is FHS. |
| 8 | `/usr/local/bin/livos-launch-chrome` | `server/index.ts:1784` | **HARD LITERAL** — fixed install location of a helper script | PRE-EXISTING | The launcher script is installed at this fixed path by the installer; if a relocated install drops it elsewhere, the `sudo -u ${desktopUser} /usr/local/bin/livos-launch-chrome` exec ENOENTs. Tied to the same `/opt/livos`-era fixed-FS assumption. Not luse-critical but same class. |
| 9 | `<LIV_DATA_ROOT>/webapp-skills/<userId>/<sessionId>/<filename>` | `server/index.ts:1823` (comment) | **COMMENT ONLY** — references a `LIV_DATA_ROOT` token that **does not exist as an env read anywhere** | PRE-EXISTING | Pure inconsistency flag: the comment names a `LIV_DATA_ROOT` data-root variable as if it were the convention, but no code reads `LIV_DATA_ROOT`; the daemon uses `dataDirectory` and luse uses literal `/opt/livos`. Documents the *intended* parameterization that was never wired. |
| 10 | `LIV_VAULT_ROOT=/root/liv` (systemd env) | `deploy-livinityd.sh:1482` | **DERIVED** — read via `LIV_VAULT_ROOT` env (vault-root-resolver, P173) | PRE-EXISTING | Out of luse scope but shows the project *does* have a working env-parameterized-root pattern (`LIV_VAULT_ROOT`) it could have reused for the install root. |
| 11 | `_DLD_LIVOS_DIR="/opt/livos"` (installer root) | `scripts/install/deploy-livinityd.sh:61` | **HARD LITERAL** — NO `${VAR:-default}` override | PRE-EXISTING | The installer pins the entire tree at `/opt/livos`. Cannot relocate via env. Contrast `_DLD_LIVOS_USER` (`:79`) / `_DLD_DESKTOP_USER` (`:85`) which ARE overridable. **This is the root cause of "leaky parameter".** |
| 12 | `livos_data_dir="${_DLD_LIVOS_DATA_DIR:-${_DLD_LIVOS_DIR}/data}"` (→ `--data-directory`) | `deploy-livinityd.sh:1461` → unit `ExecStart` `:1483` | **DERIVED** — env-overridable data sub-dir, but rooted under the pinned `_DLD_LIVOS_DIR` | PRE-EXISTING | Only the *data* sub-dir is movable (`_DLD_LIVOS_DATA_DIR`); it still defaults under the hard-pinned root. So even the one movable knob can't escape `/opt/livos` unless the operator overrides BOTH vars, and even then the luse literals (#1, #2) won't follow. |

### Classification summary

- **Hard literals that re-hardcode the root (the real portability defects):** #1 `server.ts:124` (NEW),
  #2 `tools.ts:454` (PRE-EXISTING), #11 installer root (PRE-EXISTING). These are the gaps.
- **Shared-`/tmp` multi-user risks:** #4 `/tmp/luse-` prefix, #5 `/tmp/livos-active-webapp-wid` marker.
- **Correctly parameterized (the model to copy):** #6 `dataDirectory`-derived JWT, #10 `LIV_VAULT_ROOT`,
  #12 `_DLD_LIVOS_DATA_DIR`.
- **FHS constants (not defects):** #3 `/home`, #7 `/run/user`.
- **Inconsistency flags:** #9 `<LIV_DATA_ROOT>` comment names a convention never wired.

## Task 1b — `/tmp/livos-active-webapp-wid` shared-path multi-user surface

`ACTIVE_WID_MARKER = '/tmp/livos-active-webapp-wid'` (`tools.ts:278`) is a **single global file in world-writable
`/tmp`** with no per-uid or per-user namespacing:

- **Collision:** Two LivOS daemons on one host (or two v7.0 users, when multi-user is re-activated) both
  read/write this one path. livinityd's window-manager writes the sole-active WebApp wid (P100-07.4); a second
  writer clobbers it. The luse child reads whichever value won the last write → can target another user's
  WebApp window.
- **Symlink race:** Because `/tmp` is shared and the file is created by livinityd (likely root- or
  bruce-owned at a predictable path), a hostile local user can pre-create `/tmp/livos-active-webapp-wid` as a
  symlink before livinityd writes it, redirecting the write. The reader (`readSingleActiveWebappWidFromFile`,
  `tools.ts:282`) `statSync`s then `readFileSync`s with no `O_NOFOLLOW`/realpath guard — TOCTOU between the
  250ms-cached `statSync` (`:292`) and the later read.
- **Linux-only guard** (`:285` `process.platform !== 'linux'`) limits this to the deployment OS but does not
  mitigate the shared-path issue on the actual target.

**Portable fix:** namespace per-uid via `$XDG_RUNTIME_DIR` (e.g. `${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/livos/
active-webapp-wid`) — a per-user 0700 tmpfs dir that other users cannot read/clobber and that no symlink-race
can hijack. Same prescription applies to the `/tmp/luse-` allowlist prefix (#4): scope it under
`$XDG_RUNTIME_DIR/luse-*` so the sandbox can't be widened by another user staging files in shared `/tmp`.

## Task 2 — Install-root contract verdict & mismatches

**Is `/opt/livos` a hard contract (literals fine) or a leaky parameter (installer movable, source not)?**

It is the **worst of both**: a leaky, half-declared parameter.

1. **Installer can NOT relocate the root.** `_DLD_LIVOS_DIR="/opt/livos"` (`deploy-livinityd.sh:61`) is a bare
   literal — no `${_DLD_LIVOS_DIR:-/opt/livos}`. The only movable knob is the *data sub-dir*
   (`_DLD_LIVOS_DATA_DIR`, `:1461`), which still defaults under the pinned root.
2. **Source partially follows a movable data dir.** The daemon threads `dataDirectory` (CLI flag → `path.resolve`
   → JWT/store/backups). So *if* the operator overrode `_DLD_LIVOS_DATA_DIR`, the daemon's own data would move.
3. **But the luse/sandbox code ignores it and re-hardcodes `/opt/livos`.** `resolveLuseRedisUrl` fallback
   (`server.ts:124`) and `isPathAllowed` (`tools.ts:454`) hardcode `/opt/livos/...` with no reference to
   `dataDirectory`/config/env. **MISMATCH:** the installer can move the data dir, the daemon follows, the luse
   Redis-fallback + file sandbox do not → luse breaks (Redis fail-closed + sandbox over-block) on any moved root.
4. **The intent existed but was never wired.** `server/index.ts:1823` comments a `<LIV_DATA_ROOT>` convention,
   and the project already ships a working env-parameterized-root (`LIV_VAULT_ROOT`, `:1482`). The install root
   simply never got the same treatment.

**Recommendation (for the 252 remediation backlog, not applied here):**
- Introduce a single source of truth for the install root — derive from `$LIVOS_ROOT` (env, default
  `/opt/livos`) in `@livos/config`, and make `_DLD_LIVOS_DIR="${_DLD_LIVOS_DIR:-/opt/livos}"` overridable to
  match `_DLD_LIVOS_USER`/`_DLD_DESKTOP_USER`.
- Replace the `server.ts:124` fallback array with `[\`${LIVOS_ROOT}/.env\`, …]` and the `tools.ts:454`
  uploads prefix with `\`${LIVOS_DATA_ROOT}/uploads/${userId}/\`` (derive `LIVOS_DATA_ROOT` the same way the
  daemon derives `dataDirectory`). Then a non-`/opt/livos` install is supported end-to-end OR the contract is
  honestly fixed in one place.
- Reconcile the dangling `<LIV_DATA_ROOT>` comment (`server/index.ts:1823`) with whatever name is chosen.

**Severity:** MEDIUM for portability of a *relocated* install (no current install relocates, so the literals
"work" today), but the `server.ts:124` fallback is NEW-THIS-SESSION and is the load-bearing recovery path for
the env-less luse spawn — if a future install ever moves the root, luse silently fails-closed with no error
that points at the path mismatch. The `/tmp` shared-marker (Task 1b) is a LOW-today / MEDIUM-under-multi-user
collision+symlink risk.

---

## Evidence index

- `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts:90-139` — `resolveLuseRedisUrl`, fallback
  array `:124`.
- `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts:446-457` — `isPathAllowed` allowlist
  (`/home/<slug>/`, `/tmp/luse-`, `/opt/livos/data/uploads/<userId>/`); `:278` `ACTIVE_WID_MARKER`;
  `:282-298` reader + 250ms mtime cache; `:915-916` `LUSE_USER_ID ?? 'bruce'`; `:926` error-text root literal.
- `livos/packages/livinityd/source/index.ts:311,321,394,400` — `dataDirectory` option → `path.resolve`.
- `livos/packages/livinityd/source/cli.ts:44,59,72` — `--data-directory` flag → `new Livinityd(args)`.
- `livos/packages/livinityd/source/modules/server/index.ts:124` (JWT under dataDirectory), `:1777` Xauthority,
  `:1784` `/usr/local/bin/livos-launch-chrome`, `:1823` `<LIV_DATA_ROOT>` comment.
- `scripts/install/deploy-livinityd.sh:61` `_DLD_LIVOS_DIR="/opt/livos"` (hard), `:79`/`:85` overridable
  user vars, `:1461` `_DLD_LIVOS_DATA_DIR`, `:1483` `ExecStart … --data-directory ${livos_data_dir}`, `:1482`
  `LIV_VAULT_ROOT`.
- `README.md` — **no** `/opt/livos` / `--data-directory` / install-root-override mention (grep = 0 matches) →
  the contract is undocumented.
