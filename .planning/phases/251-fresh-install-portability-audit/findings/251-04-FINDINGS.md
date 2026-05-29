# 251-04 Findings — Identity Hardcodes (user / uid / Xauthority / display)

**Dimension:** Linux username, uid, `Xauthority` path, X display number, and the `LUSE_USER_ID` default.
**Mode:** Read-only audit (D-251-READONLY). Evidence = repo file:line + installer script:line.
**Produced:** 2026-05-29.

---

## Task 1 — Identity assumption table

Every identity literal in the change-set + immediate neighbourhood, with its lookup status and the exact
failure mode when the box's desktop user isn't `bruce` / uid isn't 1000 / there is no GDM.

| # | Literal | File:line | Lookup status | NEW / PRE-EXISTING | Failure mode off-`bruce` / off-1000 / no-GDM |
|---|---------|-----------|---------------|--------------------|-----------------------------------------------|
| 1 | `username: 'bruce'` (PTY spawn opts) | `pty-sessions/ws-handler.ts:466` | **HARD LITERAL — no lookup** | NEW (`a1cb55ef`) | On a non-`bruce` box the PTY spawns `sudo --user bruce` for a user that does not exist → `sudo` fails → terminal feature dead. Unlike Chrome, **there is no `livos:desktop:user` lookup**. |
| 2 | `username: 'bruce'` (compile-time literal **type**) | `pty-sessions/types.ts:31` (`username: 'bruce'`) | **HARD LITERAL — typed** | NEW (`a1cb55ef`) | `PtySpawnOptions.username` is the *string-literal type* `'bruce'`. Even adding a runtime lookup would be a type error unless the type is widened to `string`. Defense-in-depth that doubles as a portability lock. |
| 3 | `if (this.#opts.username !== 'bruce') throw` + hardcoded `argv = ['--user','bruce','--login',...]` | `pty-sessions/session.ts:77` (guard) + `:82-89` (`--user bruce`) | **HARD LITERAL — runtime guard + literal argv** | NEW (`a1cb55ef`) | The runtime guard (D-243-NO-ROOT) THROWS for any username other than `bruce`, and the `sudo` argv hardcodes `--user bruce` **independently of `#opts.username`**. So even if #1 + #2 were parameterized, this third layer would still force `bruce`. **Three independent layers all pin `bruce`.** |
| 4 | `'bruce'` Chrome desktop-user fallback | `server/index.ts:1774` (`redis.get('livos:desktop:user') ... \|\| 'bruce'`) | **RESOLVED-AT-RUNTIME** (Redis `livos:desktop:user`, falls back to literal) | PRE-EXISTING | Reads `livos:desktop:user` from Redis first; only uses `'bruce'` if the key is unset. Off-`bruce` box still works **if** the install seeded the Redis key (else falls to `bruce` → wrong user). This is the *correct* pattern the PTY path should copy. |
| 5 | uid fallback `'1000'` | `server/index.ts:1776` (`uid = uidStr.trim() \|\| '1000'`) | **RESOLVED-AT-RUNTIME** (`id -u ${desktopUser}`, falls back to literal `1000`) | PRE-EXISTING | uid is derived via `id -u`; `'1000'` only used if `id -u` returns empty (user missing). On a box where the desktop user got an auto-assigned uid (see Task 2, installer line 299-302) `id -u` still returns the *real* uid, so this fallback rarely bites. |
| 6 | `/run/user/${uid}/gdm/Xauthority` | `server/index.ts:1777` (`find /run/user/${uid}/gdm -name 'Xauthority'`) → fallback `/home/${desktopUser}/.Xauthority` (`:1778`) | **RESOLVED-AT-RUNTIME** (find under `gdm`, falls back to home `.Xauthority`) | PRE-EXISTING | The `gdm` subdir only exists on a GDM session. Fresh box runs Xvfb `:1` via fluxbox (NO GDM) → `find` returns empty → falls back to `/home/${desktopUser}/.Xauthority`. Tolerable because of the home fallback, but the `gdm` constraint is a GDM assumption. |
| 7 | `DISPLAY: ":1"` (seed) | `scripts/install/seeds/mcp-servers.json:175` | **HARD LITERAL** (seed value) | PRE-EXISTING (seed) | luse MCP child is told `DISPLAY=:1`. Correct only if the host LivOS canvas is on `:1` (it is, by `WEBAPPS_X11_ENV` convention). A box whose canvas display differs → luse targets a dead display. |
| 8 | `XAUTHORITY: "/run/user/1000/gdm/Xauthority"` (seed) | `scripts/install/seeds/mcp-servers.json:176` | **HARD LITERAL — uid 1000 AND gdm** | PRE-EXISTING (seed) | Double assumption: uid **1000** and a **GDM** session. Fresh fluxbox/Xvfb box has neither this uid path nor a `gdm` dir → `XAUTHORITY` points at a nonexistent file → luse X auth fails. **NOT substituted by any installer placeholder** (the seed only substitutes `__LIVOS_REDIS_URL__` / `__LIVOS_LIV_API_KEY__` / `__LIVOS_USER_SLUG__` / `__LIVOS_DOMAIN_ROOT__`; DISPLAY + XAUTHORITY are baked). |
| 9 | `LUSE_USER_ID ?? 'admin'` | `computer-use/mcp/server.ts:315` | **RESOLVED-AT-RUNTIME** (env), **fallback `'admin'`** | PRE-EXISTING | Used as the luse `userId` for the per-user sandbox/uploads scoping. |
| 10 | `LUSE_USER_ID ?? 'bruce'` (×2: userSlug + userId) | `computer-use/mcp/tools.ts:915-916` | **RESOLVED-AT-RUNTIME** (env), **fallback `'bruce'`** | PRE-EXISTING | Same env var as #9 but a **different fallback default**. |
| 11 | `defaultDisplay ?? ':0'` (screen_elements / xdotool) | `computer-use/mcp/tools.ts:1612` | **RESOLVED-AT-RUNTIME** (`defaultDisplay` from `LUSE_TARGET_DISPLAY`/`LUSE_DISPLAY`), fallback literal `:0` | PRE-EXISTING | `:0` is the wrong fallback for a headless Mini PC (host canvas is `:1`, `:0` excluded by design — see `tools.ts:359-362`). Only bites when no display env is threaded. |

### The SEVEREST finding — `username:'bruce'` has NO lookup (unlike Chrome)

The recon lead is **confirmed and deepened**: the PTY user is not merely "a literal with no lookup" — it is
pinned in **three independent layers**:

1. `ws-handler.ts:466` passes the literal `username: 'bruce'` into `sessionManager.create()` with no
   `livos:desktop:user` Redis read.
2. `types.ts:31` types the field as the *string-literal* `'bruce'`, so widening it requires a type change.
3. `session.ts:77` runtime-guards `!== 'bruce'` (throws) **and** `session.ts:82-89` hardcodes the spawn argv
   `sudo --user bruce --login bash …` regardless of `#opts.username`.

Contrast with the **Chrome** path (`server/index.ts:1774`) which does
`redis.get('livos:desktop:user') || 'bruce'` — a real runtime lookup with `bruce` only as last-resort
fallback. The terminal path was written without copying that pattern. **On any box whose desktop user is not
`bruce`, the terminal is dead** (`sudo --user bruce` fails), whereas Chrome would still find the real user.

### The `admin`-vs-`bruce` LUSE_USER_ID inconsistency

The **same** environment variable `LUSE_USER_ID` has **two different fallback defaults** in two modules that
run inside the **same luse MCP child process**:

- `computer-use/mcp/server.ts:315` → `process.env.LUSE_USER_ID ?? 'admin'`
- `computer-use/mcp/tools.ts:915` and `:916` → `process.env.LUSE_USER_ID ?? 'bruce'`

When `LUSE_USER_ID` is **unset** (which it is on a fresh install — see below), `server.ts` believes the user
is `admin` while `tools.ts` believes it is `bruce`. The `tools.ts` consumer drives the filesystem allowlist
(`isPathAllowed(resolved, userSlug, userId)` → `/opt/livos/data/uploads/<userId>/` + `/home/<user>/`), so the
practical default is `bruce`; the `server.ts` `admin` value is a latent divergence that surfaces if any
server-level userId consumer is added later. **Unify to a single shared default** (and seed `LUSE_USER_ID`
explicitly — see Task 2).

**Confirming `LUSE_USER_ID` is unset on a fresh install:** the seed luse entry
(`scripts/install/seeds/mcp-servers.json:174-182`) sets `DISPLAY`, `XAUTHORITY`, `LUSE_REDIS_URL`,
`LIVINITYD_API_URL`, `LIV_API_KEY`, `LUSE_USER_SLUG`, `LUSE_DOMAIN_ROOT` — but **NOT `LUSE_USER_ID`**.
`LUSE_USER_SLUG`/`LUSE_DOMAIN_ROOT` are read only by the resolver (`server.ts:263-264`), NOT by the
`LUSE_USER_ID` fallbacks. So both `?? 'admin'` and `?? 'bruce'` are live on every fresh install.

---

## Task 2 — Does the fragility ever bite? (installer evidence + risk rating)

### Installer always creates `bruce`/uid-1000 — but it is *parameterizable* and uid is *not guaranteed*

`scripts/install/deploy-livinityd.sh _dld_create_desktop_user()` (`:276-335`):

- The user is **parameterizable**: `local user="${_DLD_DESKTOP_USER:-bruce}"` (`:279`) and
  `local uid="${_DLD_DESKTOP_UID:-1000}"` (`:280`). Default `bruce`/`1000`, overridable by env.
- Default-path creation: `useradd -m -u "$uid" -s /bin/bash "$user"` (`:295`) → `bruce`, uid 1000.
- **uid is NOT guaranteed 1000**: if uid 1000 is taken, the installer **retries with an auto-assigned uid**
  (`:299-302`: `useradd -m -s /bin/bash "$user"`). On a VPS where cloud-init already created `ubuntu` as uid
  1000, `bruce` lands on uid 1001+ → the hardcoded `1000` in the seed `XAUTHORITY` (#8) and the
  `server/index.ts:1776` fallback (#5) point at the wrong uid.
- Systemd units pin `User=bruce`/`Group=bruce`: `deploy-livinityd.sh:1477-1478` (livos.service),
  `:1569-1570` (liv-core/worker/memory), and `systemd/liv-assistant.service:10-11`. So the running services
  assume the `bruce` user exists.

So the literals **"work by construction" on a supported default install** (installer makes `bruce`, and on a
clean box uid is 1000), but they are fragile precisely where the installer itself is flexible.

### Risk rating

| Identity hardcode | Verdict | Justification (installer evidence) |
|-------------------|---------|------------------------------------|
| PTY `username:'bruce'` (3 layers: ws-handler:466, types:31, session:77/82) | **LATENT-RISK** (REAL-GAP if `_DLD_DESKTOP_USER` is ever overridden) | Default install makes `bruce`, so it works today. But (a) the installer explicitly supports `_DLD_DESKTOP_USER=other` (`:279`) and (b) the code has zero lookup — so the moment anyone parameterizes the user, the terminal silently dies. Highest design fragility; cheapest correctness gap to close vs the Chrome pattern that already exists 300 lines away. |
| uid fallback `'1000'` (`index.ts:1776`) | **LATENT-RISK** | Derived via `id -u`; fallback only used if user missing. Auto-uid path (`:299-302`) means real uid may be ≠1000, but `id -u` returns the *real* value, so the literal `1000` here rarely fires. |
| Seed `XAUTHORITY=/run/user/1000/gdm/Xauthority` (#8) | **REAL-GAP** | Hard literal `1000` **and** `gdm`. Fresh box runs Xvfb+fluxbox (NO GDM) and may have uid ≠1000 → file does not exist → luse X auth path broken on a clean install. Not substituted by any placeholder. |
| Seed `DISPLAY=:1` (#7) | **LATENT-RISK** | Correct under the `WEBAPPS_X11_ENV` `:1` convention; bites only if the host canvas display differs. |
| `LUSE_USER_ID ?? 'admin'` vs `?? 'bruce'` (#9/#10) | **REAL-GAP (correctness/consistency)** | `LUSE_USER_ID` is unset on every fresh install (not in the seed). The two modules disagree on the default in the same process. Practically `bruce` wins (it drives the allowlist), but the divergence is a latent bug and the value is never explicitly seeded. |
| Chrome `livos:desktop:user \|\| 'bruce'` (#4), uid via `id -u` (#5), Xauthority `find … \|\| ~/.Xauthority` (#6) | **COVERED (reference pattern)** | These already do the right thing — runtime resolution with sane fallbacks. They are the template for fixing the PTY + seed gaps. |

### Recommended portable fixes (for the future Phase 252 remediation backlog)

1. **PTY user — copy the Chrome pattern.** In `ws-handler.ts:466`, resolve the desktop user from Redis
   (`livos:desktop:user`) with a `'bruce'` fallback, exactly like `server/index.ts:1774`. **This requires
   widening `PtySpawnOptions.username` from the literal `'bruce'` to `string`** (`types.ts:31`), relaxing the
   `session.ts:77` guard to "reject only `root`/uid-0" instead of "must equal `bruce`", and making the
   `session.ts:82-89` argv use the resolved username instead of the literal `--user bruce`. Preserve
   D-243-NO-ROOT by guarding `username !== 'root' && resolved-uid !== 0` rather than `=== 'bruce'`.
2. **Unify `LUSE_USER_ID` default.** Pick ONE fallback (recommend `'bruce'` to match the allowlist consumer)
   and use it in both `server.ts:315` and `tools.ts:915-916` via a shared const. Additionally, **seed
   `LUSE_USER_ID` explicitly** into the luse MCP env in `scripts/install/seeds/mcp-servers.json` (same
   substitution mechanism as `__LIVOS_USER_SLUG__`) so the fallback is never relied on.
3. **Derive uid via `id -u`, drop the `1000` literals.** The seed `XAUTHORITY` should not hardcode
   `/run/user/1000/...`; substitute the real uid at install time (`id -u "$user"`) into a placeholder, OR have
   the luse process derive `XAUTHORITY` at runtime the way Chrome does (`find /run/user/$(id -u)/… || ~/.Xauthority`).
4. **Drop the `gdm` constraint from the Xauthority derivation.** A fresh fluxbox/Xvfb box has no `gdm` dir;
   the runtime fallback to `/home/${user}/.Xauthority` (already present at `index.ts:1778`) should be the
   primary path for non-GDM installs, and the seed should not bake a `gdm` path at all.

---

## Success-criteria check

- ✅ The `username:'bruce'` PTY finding is fully characterised — three-layer pin (ws-handler:466 / types:31 /
  session:77+82), no lookup unlike Chrome, severity LATENT-RISK→REAL-GAP-on-parameterize, fix = read
  `livos:desktop:user` + widen type + relax guard to non-root.
- ✅ The `admin`-vs-`bruce` `LUSE_USER_ID` inconsistency is documented with both line cites
  (`server.ts:315` = `'admin'`, `tools.ts:915-916` = `'bruce'`), confirmed unset on fresh install, with a
  unify-to-one-default + explicit-seed recommendation.
