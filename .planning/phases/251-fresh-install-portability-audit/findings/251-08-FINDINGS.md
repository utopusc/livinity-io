# 251-08 Findings — Installer-Path Divergence & MCP-Seed Integrity

**Dimension:** Which install entrypoint `get.livinity.io` actually runs, and whether that path
seeds real (non-`CHANGEME`) secrets + a correct `liv:mcp:config` luse entry — including the
liv-assistant (AionUi) agent's first-create MCP seed whose POST recon could not find in any shell script.

**Method:** Repo + installer-script trace only (D-251-READONLY, D-251-EVIDENCE). No source edits, no
live-box commands. Every claim cites a repo `file:line`. Classifications: COVERED / GAP / RISK,
PRE-EXISTING vs NEW-THIS-SESSION.

---

## TL;DR verdict

1. **The "Path A vs Path B" framing in the plan is incomplete — there are FOUR install entrypoints in
   the repo, not two.** And **which one `get.livinity.io` resolves to is NOT provable from the repo** —
   `get.livinity.io` appears ONLY as display text (`README.md:93`, `platform/.../sections.jsx:349`) with
   no Vercel route, rewrite, or DNS config in-repo. → **CRITICAL OPEN QUESTION (unresolved).**
2. The *adjacent* `livinity.io/install.sh` URL IS mapped in-repo and proves the **intended canonical**
   path: `platform/web/src/app/install.sh/route.ts:12` proxies
   `raw.githubusercontent.com/utopusc/livinity-io/master/**scripts/install.sh**` → **Path A**
   (`deploy_livinityd`, real secrets + `liv:mcp:config` seed). **But its hardcoded fallback** (`:35`)
   clones and runs `**livos/install.sh**` — a 4th, self-contained installer that **generates real
   secrets but seeds NO `liv:mcp:config` at all** → luse/AionUi MCP never registered on the fallback path.
3. **MCP-seed integrity (Path A only):** the livinityd registry `liv:mcp:config` luse entry **DOES** get
   a real, non-stale Redis URL via sed-substitution of `__LIVOS_REDIS_URL__`
   (`deploy-livinityd.sh:1138`, `seeds/mcp-servers.json:177`). **COVERED on Path A.**
4. **The "Phase 241 seed" the recon could not find in any shell script is NOT a shell script — it is a
   livinityd-boot runtime orchestrator** `seedAionUiMcpConfig` (`mcp-registrar/seed.ts:64`, wired at
   `index.ts:670`). It POSTs the luse entry into AionUi at boot. **BUT it is entirely downstream of
   `liv:mcp:config` being populated** (`seed.ts:101-104`: empty catalog → "install seed missing? skipping").
   So the AionUi luse first-create works **iff** the shell installer seeded `liv:mcp:config` first — i.e.
   **only on Path A**. On Path B and on the `livos/install.sh` fallback the catalog is empty → the boot
   orchestrator no-ops → AionUi never gets luse → Liv AI computer-use silently absent. **GAP.**

Classification: the divergence + the empty-`liv:mcp:config` failure modes are **PRE-EXISTING** (install
architecture predates this session). The luse env block (`LUSE_REDIS_URL` etc. in the seed) is the
245.1-era surface that the 250-hotfix session exercised.

---

## The four install entrypoints (path-divergence table)

| # | File | LOC | Entry | Secrets | `liv:mcp:config` seed? | AionUi luse reachable on clean box? |
|---|---|---|---|---|---|---|
| **A** | `scripts/install.sh` → sources `scripts/install/deploy-livinityd.sh`; calls `deploy_livinityd` (`scripts/install.sh:125-126`) | 134 + 2000 | `deploy_livinityd` (`deploy-livinityd.sh:1979`) | **REAL** — `_dld_write_env_file` writes random `REDIS_URL=redis://default:<rand>@…` (`:988`) | **YES** — `_dld_seed_mcp_servers` HSETs all entries, sed-substitutes `__LIVOS_REDIS_URL__` (`:1048,1138,1181`) | **YES** (catalog populated → boot orchestrator POSTs luse) — **COVERED** |
| **B** | `/install.sh` (repo root, Phase 196-02) | 268 | own phase scripts: `preflight→system-deps→…→env-seed.sh→service-up` (`install.sh:116-246`) | **`CHANGEME`** — `env-seed.sh:64-71` writes literal `REDIS_URL=redis://:CHANGEME@…` | **NO** — never calls `_dld_seed_mcp_servers`; no `liv:mcp:config` write anywhere in its chain | **NO** — empty catalog → boot orchestrator skips (`seed.ts:101-104`) — **GAP** |
| **C** | `livos/install.sh` (route.ts fallback target) | 1725 | `main()` self-contained | **REAL** — `openssl rand` for JWT/API/Redis/PG (`livos/install.sh:982-985`), `REDIS_URL=redis://:<rand>@…` (`:1033`) | **NO** — zero `liv:mcp:config` / `_dld_seed_mcp` references (grep = 0 MCP-seed hits) | **NO** — empty catalog → boot orchestrator skips — **GAP** |
| **D** | `platform/web/src/app/install.sh/route.ts` (the `livinity.io/install.sh` HTTP shim) | 45 | proxies GitHub raw `scripts/install.sh` (**=A**); fallback clones + runs `livos/install.sh` (**=C**) (`route.ts:12,35`) | inherits A or C | A: yes / C: no | A: yes / C: no |

### `get.livinity.io` resolution — UNPROVABLE from repo (CRITICAL)

- `get.livinity.io` appears **only** as documentation/marketing text: `README.md:93`
  (`curl -fsSL https://get.livinity.io | bash`) and the landing pages
  `platform/landing/sections.jsx:349` + `platform/web/public/sections.jsx:349`.
- There is **no** Vercel route, no `next.config.ts` rewrite (`platform/web/next.config.ts` has none for
  `get`), no `vercel.json` (none exists at repo root or `platform/web/`), and no DNS/redirect manifest in
  the repo that maps `get.livinity.io` to a script body. It is a host/CDN-level alias resolved **outside
  this repository**.
- The **sibling, provable** URL is `livinity.io/install.sh` → route.ts shim (entry **D**), which is what
  every other doc/script uses (`parse-cli.sh:147-158`, `factory-reset.sh:258`,
  `platform/web/src/app/api/dashboard/route.ts:186`, `changelog/2026-03-17.mdx:23`,
  `platform/web/src/app/page.tsx:163`). If `get.livinity.io` is an alias of that shim (most likely,
  given README pairs them), the canonical body is **Path A** with a **Path C fallback**.

**Consequence per path (why this matters even though our session didn't touch installers):**
- If `get.livinity.io` → Path A: fresh box gets real secrets **and** a seeded `liv:mcp:config` →
  AionUi luse registered at boot → computer-use works. **The good path.**
- If it → Path B: `CHANGEME` Redis password → **every** Redis-dependent service fails auth (luse
  `resolveLuseRedisUrl` reads a dead URL per 251-06), AND no MCP seed → **double-broken fresh install**.
- If it falls through route.ts to Path C (`livos/install.sh`): real secrets (Redis works) **but no MCP
  seed** → `liv:mcp:config` empty → boot orchestrator skips → **Liv AI has no luse/computer-use tools**
  with no error surfaced to the operator.

→ **Resolving the `get.livinity.io` → script mapping is a CRITICAL pre-remediation action for 251-09.**
It cannot be settled inside the repo; it requires inspecting the live DNS/Vercel alias (out of this
audit's read-only repo scope) OR pinning it in-repo (e.g. a documented Vercel rewrite).

---

## MCP-seed integrity table

| Aspect | Mechanism | Evidence | Status |
|---|---|---|---|
| (a) livinityd registry `liv:mcp:config` luse entry gets **real, non-stale** Redis URL | sed-substitute `__LIVOS_REDIS_URL__` ← `REDIS_URL` from `/opt/livos/.env` (written by `_dld_write_env_file` earlier in pipeline), then HSET per server | `deploy-livinityd.sh:1076,1138,1181`; seed placeholder `seeds/mcp-servers.json:177`; `_meta._note` documents the 4 substitutions | **COVERED (Path A only)** — non-stale; reads the per-install random URL |
| (a′) Redis-password extraction for the seed `redis-cli` auth | regex `redis://default:<pass>@` | `deploy-livinityd.sh:1087` | **COVERED** — matches `_dld_write_env_file`'s `redis://default:…` shape (`:988`). NOTE: would silently `return 0` (skip seed) if the URL ever changes to the password-only `redis://:pass@` shape that `env-seed.sh:69` / `livos/install.sh:1033` use → another reason B/C don't seed even if forced |
| (b) liv-assistant (AionUi) luse MCP entry **ever CREATED** on a clean box | **runtime, not shell** — `seedAionUiMcpConfig` at livinityd boot reads `liv:mcp:config`, POSTs missing entries to AionUi `http://127.0.0.1:3020/api/mcp/servers`, toggles `enabled:true` ones | `mcp-registrar/seed.ts:64,106-146`; wired `index.ts:668-686` (`aionUiBaseUrl ?? 'http://127.0.0.1:3020'`); sentinel `livos:v43:mcp_seeded:v1` (`seed.ts:32`) | **The missing "Phase 241 seed" POST = THIS runtime orchestrator** (recon looked in shell scripts; it's TS). **COVERED on Path A; GAP on B/C** because it requires a populated `liv:mcp:config` |
| (b′) AionUi first-create when catalog is empty | `targets.length === 0 → "no system MCPs in liv:mcp:config — install seed missing? skipping"` (returns, sentinel left unset) | `seed.ts:101-104` | **GAP** — silent no-op on B/C; operator sees only `created=0 skipped=0` log, no error |
| (b″) Cross-check with 251-06's `update.sh:725` patch | `update.sh` per-MCP `env` PUT is gated `if [[ -n "$_ID" ]]` — **patch-if-exists only**; relies on (b) having created the entry first | `update.sh:718` comment + 251-06 finding | **Consistent GAP** — confirms the create is the boot orchestrator's job; update.sh only top-ups env on an already-created entry |
| (c) seed luse `DISPLAY=:1` + `XAUTHORITY=/run/user/1000/gdm/Xauthority` vs GDM-less fresh box | **literal, NOT substituted** (only 4 `__…__` placeholders are subbed; DISPLAY/XAUTHORITY are bare literals) | `seeds/mcp-servers.json:175-176`; substitution set `deploy-livinityd.sh:1138-1141` (no DISPLAY/XAUTHORITY) | **GAP / RISK** — `/run/user/1000/gdm/Xauthority` assumes uid-1000 + GDM; a fresh Xvfb+fluxbox box (no GDM) has neither. Same finding as 251-02/251-04 viewed from the seed angle |

---

## What the recon "couldn't find" — resolved

The 251 RESEARCH lead said the AionUi luse MCP first-create ("Phase 241 seed", referenced at
`update.sh:718`) **exists in no shell script**. **That is correct and expected** — the first-create was
deliberately implemented as a **livinityd boot-time runtime step** (`seedAionUiMcpConfig`), not a shell
step, precisely so it re-runs idempotently on every boot (sentinel-gated) and can wait for AionUi
readiness (`waitForAionUiReady`, `seed.ts:84`). The `update.sh:718` comment is a breadcrumb pointing at
that runtime mechanism, not a missing shell POST.

**The real gap is one layer up:** that runtime orchestrator is a pure *consumer* of `liv:mcp:config`. The
only producer is the shell `_dld_seed_mcp_servers`, which exists **only on Path A**. So on any non-Path-A
fresh install the entire AionUi-luse chain silently evaporates — not because the POST is missing, but
because its input catalog was never seeded.

---

## Remediation items for the 251-09 backlog

| # | Item | File:line | Severity | Effort | Fix sketch |
|---|---|---|---|---|---|
| 1 | **`get.livinity.io` → script mapping is unprovable in-repo** | `README.md:93` (only ref) | **CRITICAL** | LOW | Pin it in-repo: add a documented Vercel rewrite/redirect mapping `get.livinity.io` → the `install.sh` shim, OR document the DNS alias in README so the canonical body is auditable. Until then a fresh install's outcome is undefined. |
| 2 | **Path C (`livos/install.sh`) seeds no `liv:mcp:config`** → AionUi luse never registered | `livos/install.sh` (no seed); `route.ts:35` (fallback runs it) | **HIGH** | MEDIUM | Either (a) make route.ts fallback clone + run `scripts/install.sh` (Path A) instead of `livos/install.sh`, or (b) port `_dld_seed_mcp_servers` into `livos/install.sh`. |
| 3 | **Path B (`/install.sh`) writes `CHANGEME` secrets + no MCP seed** | `env-seed.sh:64-71`; no `_dld_seed_mcp` call in `install.sh` chain | **HIGH** | MEDIUM | If Path B is reachable from any public entry, replace `env-seed.sh` CHANGEME with `openssl rand` (as C does) and add an MCP-seed step; otherwise mark Path B internal-only and remove it from any operator-facing URL. |
| 4 | **boot orchestrator silently no-ops on empty catalog** | `seed.ts:101-104` | **MEDIUM** | LOW | Upgrade the "install seed missing? skipping" log from `warn` to a louder operator-visible health signal (e.g. surface in `/api/health` or onboarding), so a missing MCP seed is detectable, not silent. |
| 5 | **seed luse `XAUTHORITY=/run/user/1000/gdm/Xauthority` + `DISPLAY=:1` are bare literals** (not substituted) | `seeds/mcp-servers.json:175-176` | **MEDIUM** | LOW | Resolve XAUTHORITY/DISPLAY at seed time for a GDM-less box, or add `__LIVOS_XAUTHORITY__`/`__LIVOS_DISPLAY__` placeholders to the substitution set (`deploy-livinityd.sh:1138`). Dup of 251-02/04 — coordinate. |

---

## Cross-references for the 251-09 synthesis

- **251-01** (luse Redis URL resolution): establishes that on Path A the `.env` `REDIS_URL` is real; this
  finding shows the *same* URL is what flows into the `liv:mcp:config` luse entry via sed-substitution.
- **251-06** (systemd env delivery): its `update.sh:725` patch-if-exists analysis is the day-2 mirror of
  this finding's boot-time first-create (b″ row) — together they prove the entry's lifecycle: created at
  boot by `seedAionUiMcpConfig`, env-topped-up at day-2 by `update.sh`, both downstream of the Path-A seed.
- **251-02 / 251-04** (display backend + identity): own the `DISPLAY=:1` / `XAUTHORITY=…gdm…` literals;
  row (c)/item 5 here is the seed-file view of the same hardcodes — dedupe in the backlog.
- **Severity for the synthesis verdict:** the install-path divergence is **CRITICAL** for the GO/NO-GO
  question "would a brand-new install come up seamlessly?" — the answer is **only if `get.livinity.io`
  routes through Path A**, and that routing is currently **unverifiable from the repo**.
