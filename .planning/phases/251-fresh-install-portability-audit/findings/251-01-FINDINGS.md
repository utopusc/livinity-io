# 251-01 Findings — Luse Redis-URL Resolution & `resolveLuseRedisUrl` Fallback Portability

**Dimension:** Does the luse MCP process obtain a valid Redis URL on a brand-new install by EVERY
path it tries, so that `displayManager` (`computer_create_display` etc.) + `create_stream` wire?

**Method:** Read-only repo audit (D-251-READONLY). Traced the runtime resolution chain in
`computer-use/mcp/server.ts` + `tools.ts`, then cross-checked against where each install path writes
`/opt/livos/.env`, seeds `liv:mcp:config`, first-creates the AionUi luse entry, and threads env into the
luse process. No source modified. No live-box check (D-251-LIVE-OPTIONAL — corroboration only). Every
claim below cites repo `file:line` or installer `script:line`.

---

## Task 1 — Runtime resolution chain (verified against code)

`resolveLuseRedisUrl()` is defined at `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts:113-139`.
Precedence (DI'd + pure, so testable without I/O):

1. **`env.LUSE_REDIS_URL`** (canonical) — `server.ts:115-117`. Returned if a non-empty string.
2. **`env.REDIS_URL`** (generic, in case a spawner forwards that name) — `server.ts:118-120`.
3. **Env-file fallback** — `server.ts:121-137`. Reads each path in the literal fallback array, greps the
   first `REDIS_URL=` line, returns the trimmed value.

**Literal fallback path array** (`server.ts:124`):

```ts
const paths = deps.envFilePaths ?? ['/opt/livos/.env', '/opt/livos/livos/.env']
```

**Regex used to extract the URL** (`server.ts:133`):

```ts
const m = contents.match(/^REDIS_URL=(.+)$/m)
```

(multiline `m` flag; takes `m[1].trim()` if non-empty — `server.ts:134-136`.)

**Overridability:** The path list IS overridable via `deps.envFilePaths`, and the reader via
`deps.readEnvFile` (`server.ts:108-111`). **Production passes NO override** — `main()` calls
`resolveLuseRedisUrl()` with zero args (`server.ts:178`), so the hardcoded `['/opt/livos/.env',
'/opt/livos/livos/.env']` default is what runs on every real boot. The DI exists solely for `server.test.ts`.

**All-three-empty / fail-closed behaviour** (`server.ts:181-203`):
- If `resolveLuseRedisUrl()` returns a non-empty string → `new Redis(url, {lazyConnect, maxRetriesPerRequest:1})`
  is constructed (`server.ts:184`). If the canonical env var was absent, a stderr note records the fallback
  rescued the spawn (`server.ts:188-192`).
- If it returns `undefined`/empty → `redis = null` and a stderr warning is emitted (`server.ts:199-203`).
- `redis === null` → `displayManager` is NOT constructed (`server.ts:218-226`), so the 4 display tools
  return `"Error: displayManager not wired (no Redis client at MCP boot)"`
  (`tools.ts:1022-1025, 1046-1049, 1060-1063, 1099-1102`), and `create_stream` denies because its gate read
  of `liv:config:luse_can_create_streams` is gated on `if (redis)` (`tools.ts:1657, 1687-1689`).
- A separate, now-fixed bug compounded this: the `registerLuseTools` handler-build gate
  (`tools.ts:1343-1352`) was extended in 250-hotfix to rebuild handlers when `displayManager`/`redis`/etc.
  are present — previously it fell back to empty-option `HANDLERS` whenever `LUSE_TARGET_WINDOW_ID` was unset
  (the normal aioncore case), so even a wired `displayManager` never reached the handler map. Both must be
  correct for the display tools to work; this finding covers only the Redis-URL half.

So: **a valid Redis URL by ANY of the 3 paths is necessary AND sufficient (given the gate fix) for
`displayManager` + `create_stream` to wire.**

---

## Task 2 — Install-side coverage per path

### Where each install path writes `/opt/livos/.env` REDIS_URL

| Path | What it writes | Evidence | Real or placeholder? |
| --- | --- | --- | --- |
| **A (canonical, `deploy-livinityd.sh`)** | `REDIS_URL=redis://default:${_DLD_REDIS_PASS}@127.0.0.1:6379` | `deploy-livinityd.sh:988` (in `_dld_write_env_file`, mode 0600 `:982,1013`); password is a per-install `openssl rand` (`:239`) | **REAL** |
| **B (thin orchestrator, `env-seed.sh`)** | `REDIS_URL=redis://:CHANGEME@localhost:6379` | `env-seed.sh:69` (+ warn `:74`) | **CHANGEME placeholder** (and wrong user form — `:` not `default:`) |

### Where `liv:mcp:config` luse entry gets a real `LUSE_REDIS_URL`

The seed JSON luse entry ships `"LUSE_REDIS_URL": "__LIVOS_REDIS_URL__"`
(`scripts/install/seeds/mcp-servers.json:177`). Path A's `_dld_seed_mcp_servers` reads the real `REDIS_URL`
back from `/opt/livos/.env` (`deploy-livinityd.sh:1076-1077`), sed-substitutes the placeholder
(`deploy-livinityd.sh:1138`), and `HSET liv:mcp:config luse <json>` (`deploy-livinityd.sh:1181`). Path B's
`env-seed.sh` does NOT seed `liv:mcp:config` at all.

### Does `LUSE_REDIS_URL` reach the luse process the AI actually uses?

The luse process the AI uses is the one **aioncore→claude→luse** spawns under `liv-assistant.service`. Two
delivery mechanisms exist; the process-env it inherits comes from the AionUi MCP-server entry's `env` block,
NOT from the systemd unit:

- `systemd/liv-assistant.service` has **NO `REDIS_URL` / `LUSE_REDIS_URL` and NO `EnvironmentFile`**
  (`liv-assistant.service:8-31`). So the luse child does NOT inherit a Redis URL from the service env.
- The hand-added `/etc/systemd/system/liv-assistant.service.d/redis-env.conf` drop-in (live Mini PC only)
  exists **NOWHERE in the repo or any installer script** — confirmed by the RESEARCH grep/find and by this
  audit (no `*.service.d` / `redis-env.conf` creation in `scripts/` or `systemd/`). It is a pure live-only
  artifact, NOT reproduced by any install.
- The AionUi luse entry IS first-created on a fresh boot by livinityd's **Phase 241 seed**
  (`mcp-registrar/seed.ts:64-196`), invoked from `livinityd/source/index.ts`. `seed.ts` reads
  `liv:mcp:config` (Stage 2, `:95`), and for each system MCP not already present in AionUi
  (`:118-123`) it `POST`s via `transformRedisToAionUi(target.name, target.cfg)` (`:125-126`).
  **`transform.ts:31` copies the FULL `env` block through verbatim** (`...(redisEntry.env !== undefined ?
  {env: redisEntry.env} : {})`). On Path A that env block already has the substituted real `LUSE_REDIS_URL`.
  So the AionUi luse entry is created WITH a working Redis URL — and aioncore passes that entry's env to the
  spawned luse child. **This corrects the RESEARCH preliminary "GAP for liv-assistant first-create": the
  seed.ts first-create path DOES exist and DOES thread `LUSE_REDIS_URL` on Path A.**
- `update.sh:720-746` is a SEPARATE day-2 PATCH that rewrites the entry's `command` to the wrapper
  `/usr/local/bin/liv-mcp-luse` and rebuilds the env (incl. `LUSE_REDIS_URL`) from `/opt/livos/.env`
  (`update.sh:731`). It only runs `if [[ -n "$_ID" ]]` (`:725`) — i.e. when the entry already exists.
  The wrapper itself (`update.sh:704`) sets NO env; it relies on the entry's env block. So the env-thread
  still ultimately comes from `liv:mcp:config` (seed) → AionUi entry → spawned child.
- The `resolveLuseRedisUrl` `/opt/livos/.env` fallback (`server.ts:121-137`) is the catch-all for any spawn
  path that drops the env block (e.g. a direct ACP `node tsx server.ts` with no env) — on Path A that file
  holds the real URL, so the fallback succeeds even when env-threading fails.

### Resolution-source × install-path coverage table

| Resolution source (server.ts) | Path A (canonical) | Path B (thin) | Evidence | Fail-closed consequence if GAP |
| --- | --- | --- | --- | --- |
| 1. `LUSE_REDIS_URL` env (via AionUi entry env block, seeded from `liv:mcp:config`) | **COVERED** | **GAP** | A: `mcp-servers.json:177` + `deploy-livinityd.sh:1138,1181` + `seed.ts:125` + `transform.ts:31`. B: `env-seed.sh` never seeds `liv:mcp:config` | luse child has no env Redis URL → falls to source 3 |
| 2. `REDIS_URL` env | **COVERED-incidental** (only if a spawner forwards it; not relied upon) | **GAP** | `server.ts:118-120` — no installer sets `REDIS_URL` in the luse child env specifically | falls to source 3 |
| 3. `/opt/livos/.env` REDIS_URL file fallback | **COVERED** | **GAP (reads CHANGEME)** | A: `deploy-livinityd.sh:988` writes real URL at the exact path `server.ts:124` reads. B: `env-seed.sh:69` writes `redis://:CHANGEME@localhost:6379` at `/opt/livos/.env` | A: succeeds. B: constructs a Redis client against a dead placeholder password → auth fails at first command → handlers fail-closed |
| Path-root portability of fallback array | **COVERED** | **COVERED** (path matches) but **RISK** | `server.ts:124` hardwires `/opt/livos/.env` (+ `/opt/livos/livos/.env`). Both installers DO use `/opt/livos` as root | NEW-THIS-SESSION hardcode: any install rooted elsewhere (`LIVOS_ROOT≠/opt/livos`) → fallback reads nothing → fail-closed |

**Classification of the fallback path array itself:** `server.ts:124` is **NEW-THIS-SESSION** (commit
`b4f2a345`), **RISK** (not GAP today): it works because every current installer hardwires `/opt/livos`, but
the array is a literal — it does not derive from `$LIVOS_ROOT` or any env, so it silently breaks the moment
the install root changes. Severity **medium** (latent, not active on the shipped installers).

---

## Per-path verdicts

**Path A (canonical `get.livinity.io` → `scripts/install.sh` → `deploy-livinityd.sh`):**
On a fresh Path-A install the luse MCP gets a working Redis URL by TWO independent paths with **zero manual
steps** — (1) the AionUi luse entry is first-created by `seed.ts` carrying the substituted real
`LUSE_REDIS_URL` (`mcp-servers.json:177` → `deploy-livinityd.sh:1138,1181` → `seed.ts:125` →
`transform.ts:31`), and (2) the `/opt/livos/.env` fallback holds the real `REDIS_URL`
(`deploy-livinityd.sh:988` at the literal path `server.ts:124` reads). The hand-added `redis-env.conf`
drop-in is NOT needed on Path A and is correctly absent from the installer. **VERDICT: COVERED.** The only
caveat is the latent hardcoded-root RISK on `server.ts:124` (see below).

**Path B (thin orchestrator `/install.sh` → `env-seed.sh` → `update.sh`):**
A fresh Path-B install is **broken for luse Redis** regardless of this session's changes: `env-seed.sh:69`
writes a `CHANGEME` placeholder to `/opt/livos/.env` and never seeds `liv:mcp:config`. So source 1 (env) is
empty, source 2 (env) is empty, and source 3 (file fallback) reads a dead `CHANGEME` password → the Redis
client constructs but every command fails auth → `displayManager` + `create_stream` fail-closed. **VERDICT:
GAP — pre-existing Path-B brokenness, surfaced (not caused) by the Luse feature. Whether this matters depends
on 251-08's determination of which path `get.livinity.io` actually resolves to.**

---

## Portable fix recommendations (for the 251-09 backlog)

1. **[RISK, medium] Derive the fallback path from `$LIVOS_ROOT`** instead of the literal
   `['/opt/livos/.env', '/opt/livos/livos/.env']` (`server.ts:124`). E.g.
   `const root = process.env.LIVOS_ROOT ?? '/opt/livos'; const paths = deps.envFilePaths ?? [`${root}/.env`, `${root}/livos/.env`]`.
   Makes the env-less-spawn fallback portable to non-`/opt/livos` roots. (Future Phase 252 — read-only here.)
2. **[GAP, high — Path B] Make `env-seed.sh` write a real Redis password** (or have Path B route through
   `_dld_setup_redis` / `_dld_write_env_file`), and seed `liv:mcp:config`. Without this, Path-B installs have
   no working luse Redis even before the env-thread question. (Owned by 251-08 / 251-06; cross-referenced.)
3. **[Defense-in-depth] Add `EnvironmentFile=-/opt/livos/.env` to `liv-assistant.service`**
   (`liv-assistant.service:8-31`) so the luse child inherits `REDIS_URL` from the service env even if the
   AionUi entry's env block is ever dropped — this would make the hand-added `redis-env.conf` drop-in
   reproducible-by-install and remove the live-only artifact. Low risk (the `-` prefix tolerates a missing
   file), and it backstops source 2 (`server.ts:118-120`) for every spawn path.
