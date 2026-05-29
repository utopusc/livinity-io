# 251-06 Findings — Systemd Unit & Environment Delivery Portability

**Dimension:** How a fresh install delivers `REDIS_URL` / `LUSE_REDIS_URL` to every service in the
luse path (`liv-assistant.service` → aioncore → claude → luse MCP), and whether that is sufficient
WITHOUT the hand-made `redis-env.conf` drop-in we added on the live Mini PC.

**Method:** Repo + installer-script trace only (D-251-READONLY, D-251-EVIDENCE). No source edits. No
live-box commands required — every claim cites a repo/script `file:line`.

---

## TL;DR verdict

**Without the hand-made `/etc/systemd/system/liv-assistant.service.d/redis-env.conf`, does a fresh
`liv-assistant` give the luse process a Redis URL?**

> **Conditionally YES, but ONLY through a single fragile path — the in-repo `resolveLuseRedisUrl`
> `/opt/livos/.env` file fallback (`server.ts:124`).** Neither systemd inheritance nor the per-MCP
> `env` block delivers it on a clean box:
> - `liv-assistant.service` has **NO** `EnvironmentFile` and **NO** `Environment=REDIS_URL/LUSE_REDIS_URL`
>   → children (aioncore→claude→luse) inherit **no** Redis env. (`systemd/liv-assistant.service:8-31`)
> - The per-MCP `env` block that DOES carry `LUSE_REDIS_URL` is written by `update.sh:737` **only inside
>   `if [[ -n "$_ID" ]]`** (`update.sh:725`) — i.e. only if the AionUi luse MCP entry **already exists**.
>   The first-create/seed of that entry ("Phase 241 seed", referenced at `update.sh:718`) **exists in NO
>   shell script** → on a clean box the loop is a **no-op**, so `LUSE_REDIS_URL` is never seeded into the
>   AionUi config.
> - Therefore the luse process boots with `LUSE_REDIS_URL` and `REDIS_URL` both **absent** and survives
>   ONLY because `resolveLuseRedisUrl()` reads `/opt/livos/.env` directly (`server.ts:124,133`). On
>   **Path A** that file holds a real per-install `REDIS_URL` (`deploy-livinityd.sh:988`) → fallback works.
>   On **Path B** it holds `CHANGEME` (per 251 RESEARCH `env-seed.sh:64-71`) → fallback reads a dead value.

So the `.env` fallback is the **only** thing saving luse on a fresh box. The `redis-env.conf` drop-in is
a pure **live-only artifact** that exists **nowhere** in the repo or any installer script — confirmed by
`grep -rni "redis-env|service\.d"` across `scripts/ systemd/ update.sh install.sh` returning **zero matches**.

Classification: **NEW-THIS-SESSION** (the drop-in + the fallback both originate in the 250-hotfix
session). The luse env-delivery gap itself is a **GAP / RISK** (single point of failure, Path-B-breaking).

---

## Per-service environment-delivery table

| Service | Unit source | `REDIS_URL` delivery | `LUSE_REDIS_URL`? | Children inherit Redis? | Status |
|---|---|---|---|---|---|
| `livos.service` (livinityd :8080) | `deploy-livinityd.sh:1465-1492` (inline `cat >`) | `EnvironmentFile=/opt/livos/.env` (`:1480`) | no (not needed) | n/a (spawns luse with per-descriptor env elsewhere) | **COVERED** — has real `REDIS_URL` via EnvironmentFile |
| `liv-core.service` | `deploy-livinityd.sh:1560-1582` | `EnvironmentFile=/opt/livos/.env` (`:1572`) | no | n/a | **COVERED** |
| `liv-worker.service` | same template (`:1546-1582`) | `EnvironmentFile=/opt/livos/.env` (`:1572`) | no | n/a | **COVERED** |
| `liv-memory.service` | same template (`:1546-1582`) | `EnvironmentFile=/opt/livos/.env` (`:1572`) | no | n/a | **COVERED** |
| **`liv-assistant.service`** (AionUi :3020 — **the luse path**) | `systemd/liv-assistant.service` | **NONE** — only `PATH`, `HOME`, `MCP_TIMEOUT` (`:13,17,19`) | **NONE** | **NO** | **GAP** — aioncore→claude→luse inherit no Redis env |
| `luse` MCP (child of claude under liv-assistant) | wrapper `update.sh:704` (`node tsx server.ts`, no `--env`) | (a) inherited: NONE; (b) per-MCP `env` block: only if entry pre-exists (`update.sh:725,731,737`); (c) `/opt/livos/.env` file read (`server.ts:124`) | (b) `update.sh:731` IF entry exists; else NONE | n/a | **GAP** — relies entirely on (c) on a fresh box |

### Evidence detail

- **`liv-assistant.service` has no Redis env.** The unit declares only
  `Environment="PATH=…"` (`:13`), `Environment="HOME=/home/bruce"` (`:17`), `Environment="MCP_TIMEOUT=30000"`
  (`:19`). No `EnvironmentFile=`, no `Environment=REDIS_URL`, no `Environment=LUSE_REDIS_URL`. With
  `ProtectHome=read-only` (`:30`) it cannot even write back. So everything aioncore spawns (claude →
  luse) starts from this Redis-less environment.
- **Path A core services get Redis correctly.** `_dld_write_systemd_unit` (`deploy-livinityd.sh:1465`) and
  `_dld_write_liv_systemd_units` (`:1537`) both bake `EnvironmentFile=${_DLD_ENV_FILE}` (=`/opt/livos/.env`)
  into the unit body. `_dld_write_env_file` writes a real per-install
  `REDIS_URL=redis://default:${pass}@127.0.0.1:6379` (`:988`) with the random pass generated at `:239`.
- **liv-assistant unit is installed by `update.sh`, not by a fresh-install seed.** `update.sh:1223-1256`
  copies `systemd/liv-assistant.service` verbatim into `/etc/systemd/system/` — it copies the **same**
  no-Redis-env file, so the gap is reproduced identically on install and on every update.
  (`systemd-units-install.sh:38` — the Path-B unit list — does **not** even include `liv-assistant.service`;
  it relies on `update.sh` for that unit entirely.)
- **The per-MCP `env` seed is gated on pre-existence.** `update.sh:722-741`: for each MCP name it first
  GETs the entry id (`_ID`, `:723`); the entire env-writing PUT (`:735-737`, which for `luse` injects
  `LUSE_REDIS_URL=$(grep REDIS_URL /opt/livos/.env)`, `:731`) sits inside `if [[ -n "$_ID" ]]` (`:725`).
  No `POST` to `/api/mcp/servers` (first-create) exists anywhere — `grep "api/mcp/servers"`/`"Phase 241"`
  across all `.sh` returns only the **comment** at `update.sh:718`. So on a clean AionUi data-dir the
  loop finds nothing and seeds nothing.
- **luse fallback chain** (`resolveLuseRedisUrl`, `server.ts:113-139`): (1) `LUSE_REDIS_URL` env →
  (2) `REDIS_URL` env → (3) first `REDIS_URL=` line in `['/opt/livos/.env','/opt/livos/livos/.env']`
  (`:124,133`). On a fresh box (1) and (2) are empty (no inheritance, no seed), so it lands on (3).
  When all three are empty the luse boot logs the fail-closed warning at `server.ts:201` and
  `displayManager`/`create_stream` deny on the privilege gate.
- **`redis-env.conf` / `*.service.d` absent.** Case-insensitive grep across `scripts/`, `systemd/`,
  `update.sh`, `install.sh` → **0 matches**. The drop-in is not created (nor, contrary to the RESEARCH
  lead, is `livos.service.d` even *deleted* by the current `factory-reset.sh`). Pure live-only artifact.

---

## Why the live box "works" but a fresh box is fragile

On the live Mini PC two things mask the gap simultaneously: (a) the hand-made
`liv-assistant.service.d/redis-env.conf` puts `LUSE_REDIS_URL`/`REDIS_URL` into liv-assistant's
environment so **every** child inherits it (path (a) above), and (b) the AionUi luse MCP entry already
exists, so `update.sh`'s PUT keeps re-seeding `LUSE_REDIS_URL` into the per-MCP `env` block (path (b)).
A fresh box has **neither** — it falls all the way through to the `/opt/livos/.env` file read (path (c)),
which only works on Path A and only as long as the install root is exactly `/opt/livos`.

---

## Recommendation — one coherent env-delivery mechanism for the installer

**Adopt systemd inheritance via `EnvironmentFile` on `liv-assistant.service`** as the single canonical
channel, matching what we did by hand and what the core services already do. Concretely:

1. **Add `EnvironmentFile=-/opt/livos/.env` to `systemd/liv-assistant.service`** (the `-` prefix makes it
   non-fatal if the file is absent at first boot). This makes `REDIS_URL` present in liv-assistant's
   environment, and because aioncore→claude→luse are plain child processes they inherit it; the luse
   `resolveLuseRedisUrl` step (2) (`REDIS_URL` env, `server.ts:118`) then resolves with **no** dependence
   on the per-MCP env seed and **no** dependence on luse re-reading `/opt/livos/.env` itself.
2. *(Optional belt-and-suspenders, NOT the primary channel)* additionally set
   `Environment=LUSE_REDIS_URL=` cannot be done statically (the value is per-install), so prefer
   `EnvironmentFile` over a literal `Environment=` — a literal would re-introduce exactly the hardcoded-
   secret shape of the hand-made drop-in. **Do NOT productize the literal `redis-env.conf` drop-in.**
3. **Encode the AionUi luse MCP first-create as an installer step** (the missing "Phase 241 seed"): a
   `POST /api/mcp/servers` that creates the luse entry with the wrapper command + the `LUSE_REDIS_URL`
   env block, so `update.sh:725`'s `if [[ -n "$_ID" ]]` patch path has something to patch. This is a
   secondary safety net; (1) alone is sufficient for the inheritance path.
4. **Treat the `.env` file read (`server.ts:124`) as a last-resort fallback only** — keep it, but stop
   *relying* on it as the sole delivery mechanism. It also fails on Path B (`CHANGEME`) and on any
   non-`/opt/livos` install root.

**The hand-artifact GAP to encode in the installer:** the `redis-env.conf` drop-in must be replaced by
`EnvironmentFile=-/opt/livos/.env` in the committed `liv-assistant.service` unit (Recommendation #1).
This is a one-line unit change that makes the drop-in permanently unnecessary while keeping the secret
file-resident (no literal in any unit) and per-install.

---

## Cross-references for the 251-09 synthesis

- Ties to **251-01** (luse Redis env / `resolveLuseRedisUrl` fallback) — this finding establishes the
  *delivery* gap that makes the fallback the load-bearing path.
- Ties to **251-08** (Path A vs B, CHANGEME, AionUi luse first-create gap) — the missing "Phase 241 seed"
  POST is the same gap viewed from the seed-integrity angle.
- Severity: **HIGH** (luse computer-use silently fail-closed on Path B and on any non-`/opt/livos` root;
  on Path A it survives only via the single `.env` file-read fallback). Effort to fix: **LOW**
  (one `EnvironmentFile=-` line in the committed unit; optional MCP first-create POST = MEDIUM).
