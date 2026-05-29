# get.livinity.io → Install-Script Resolution (R11)

**Plan:** 252-03 (Wave 3, `autonomous: false`)
**Resolved:** 2026-05-29 via live curl + DNS probes (read-only, non-destructive)
**Status:** RESOLVED (live evidence) — awaiting operator confirmation at the Task-2 checkpoint
**Feeds:** R9 part (1) — Plan 252-04

---

## VERDICT

`get.livinity.io → /install (301) → raw.githubusercontent.com/utopusc/livinity-io/master/livos/install.sh → Path C → seeds MCP: NO`

**This is NOT Path A.** The plan's `key_links` hypothesis ("Path A `scripts/install.sh`→deploy-livinityd.sh seeds liv:mcp:config") is **disproven by live evidence.** `get.livinity.io` is served by a **Caddy** server (NOT Vercel, NOT the `platform/web/.../install.sh/route.ts` shim), and its documented install path redirects to **Path C** (`livos/install.sh`), the self-contained 1725-line installer that generates real secrets but seeds **no** `liv:mcp:config` at all.

**Consequence (per 251-08):** A fresh `get.livinity.io` install gets **real random secrets** (Redis/PG/JWT/API via `openssl rand`) so Redis-dependent services authenticate correctly — BUT because Path C never writes `liv:mcp:config`, the livinityd boot orchestrator `seedAionUiMcpConfig` (`mcp-registrar/seed.ts:101-104`) finds an empty catalog and **silently no-ops** → **AionUi/Liv AI never gets the luse computer-use MCP** on a clean box, with no operator-visible error. This is the **GAP** that R9 (Plan 252-04) must close: either repoint the public entrypoint to Path A, or port the `_dld_seed_mcp_servers` step into Path C.

---

## Evidence

### 1. DNS resolution (`get.livinity.io`)

`dig` is unavailable in this environment; used `nslookup` instead:

```
$ nslookup get.livinity.io
Name:    get.livinity.io
Address: 154.12.245.35
```

- Resolves to a single A record **`154.12.245.35`** — NOT a Vercel alias (`*.vercel-dns.com` / `cname.vercel-dns.com`) and NOT Cloudflare proxy IPs.
- This is a self-hosted Caddy host (see header evidence below), consistent with the Livinity relay/infra IP block (`154.x`), not the Vercel-hosted `platform/web` app.

### 2. Root probe (`https://get.livinity.io`)

```
$ curl -sSL -D - https://get.livinity.io
HTTP/1.1 200 OK
Server: Caddy
Content-Type: text/plain; charset=utf-8
Content-Length: 68
remote_ip: 154.12.245.35

LivOS Installer - Use: curl -sSL get.livinity.io/install | sudo bash
```

- **`Server: Caddy`** — definitively NOT Vercel. The repo's in-repo `install.sh/route.ts` shim (Path D) is therefore **not** what `get.livinity.io` serves. The 251-08 hypothesis that `get.livinity.io` might alias the Vercel `/install.sh` shim is **wrong** — it is a separate Caddy host.
- The root path is a 68-byte usage hint pointing at the real script path: **`get.livinity.io/install`**.

### 3. Install-path probe (`https://get.livinity.io/install`)

```
$ curl -sSL -D - https://get.livinity.io/install
HTTP/1.1 301 Moved Permanently
Location: https://raw.githubusercontent.com/utopusc/livinity-io/master/livos/install.sh
Server: Caddy

HTTP/1.1 200 OK   (GitHub raw)
Content-Length: 61408
ETag: "d55a707c6e7acde288377eea509bd57ff4a37fac7dab3e067a9667c6d87176b9"
X-Served-By: cache-pao-... (Fastly / GitHub raw)
```

- Caddy issues a **301 redirect** straight to GitHub-raw **`master/livos/install.sh`** — this is **Path C** (`livos/install.sh`), confirmed by the redirect `Location` header.

### 4. Body identity confirmation (served body == repo Path C)

```
$ wc -l /tmp/getliv-install.txt   →  1725
$ wc -l livos/install.sh          →  1725
$ diff <served> <livos/install.sh> → (no output, exit 0)   # byte-identical (CR-normalized)
```

```
$ grep -c "liv:mcp:config|_dld_seed_mcp|mcp-servers.json" <served>   →  0      # NO MCP seed
$ grep "openssl rand" <served>:
    982: SECRET_JWT=$(openssl rand -hex 32)
    983: SECRET_API_KEY=$(openssl rand -hex 32)
    984: SECRET_REDIS=$(openssl rand -hex 24)
    985: SECRET_PG_PASS=$(openssl rand -hex 16)               # REAL random secrets (not CHANGEME)
$ grep "REDIS_URL=" <served>:
    1033: REDIS_URL=redis://:${SECRET_REDIS}@localhost:6379    # password-only shape (Path C signature)
```

- Served body is **byte-identical** to the repo's `livos/install.sh` (the very file 251-08 classified as Path C, 1725 lines).
- **Zero** `liv:mcp:config` / `_dld_seed_mcp_servers` references → confirms **no MCP seed** on this path.
- `openssl rand` secrets + `redis://:${SECRET_REDIS}@` (password-only, NOT `redis://default:<pass>@`) match the Path C signature documented in 251-08 (`livos/install.sh:982-985, :1033`). This is **not** Path B (which writes literal `CHANGEME`) and **not** Path A (which uses `redis://default:<rand>@` + seeds MCP).

---

## Path classification cross-check (vs 251-08 four-entrypoint table)

| Path | File | Secrets | MCP seed | Matches served body? |
|------|------|---------|----------|----------------------|
| A | `scripts/install.sh` → `deploy-livinityd.sh` | real, `redis://default:<rand>@` | YES | NO (different shape + has MCP seed) |
| B | `/install.sh` (repo root) | `CHANGEME` | NO | NO (served body has openssl rand) |
| **C** | **`livos/install.sh`** | **real, `redis://:<rand>@`** | **NO** | **YES — byte-identical, 1725 LOC** |
| D | `platform/web/.../install.sh/route.ts` (Vercel shim) | inherits A or C | A:yes / C:no | NO (`get.livinity.io` is Caddy, not Vercel) |

**Resolved entrypoint: Path C.**

---

## Implication for R9 (Plan 252-04)

R9 part (1) is now answerable with a live fact rather than a guess:

1. **The live entrypoint is Path C, not Path A.** Pinning the in-repo `route.ts:35` fallback to Path A (R9(2)) is necessary but **insufficient** — `get.livinity.io` does not go through that route.ts shim at all; it is a Caddy 301 to GitHub-raw `livos/install.sh`. R9 must therefore ALSO address the Caddy redirect target (operator/infra change on the `154.12.245.35` Caddy host) OR port the `_dld_seed_mcp_servers` step into `livos/install.sh` so the live path seeds MCP regardless.
2. **The recommended R9 closure** (lowest-risk, repo-only) is to **port the MCP seed into `livos/install.sh`** (251-08 remediation item 2 option b), since the Caddy redirect on `154.12.245.35` is infra the repo cannot pin. Repointing the Caddy `/install` redirect to `scripts/install.sh` (Path A) is an alternative but requires an operator change on the relay/infra host, outside repo scope.
3. R9 parts (2)+(3) (route.ts Path-A fallback + Path-B `CHANGEME`→`openssl rand` hardening) remain independently shippable per CONTEXT D-Wave3 — this resolution does NOT block Plan 252-04.

---

## Operator confirmation requested (Task 2 checkpoint)

The verdict above is derived from live curl + DNS probes run from this environment. Operator should confirm by either:

1. Running `curl -sSL -D - https://get.livinity.io/install` from another network and confirming the `Location:` header still points at `master/livos/install.sh` (Path C), OR
2. Checking the Caddy config on the `get.livinity.io` host (`154.12.245.35`) for the `/install` redirect target, OR
3. Confirming the DNS `get` record for `livinity.io` points at `154.12.245.35` (the Caddy host), not at Vercel.

If the operator confirms, R9 (Plan 252-04) proceeds with the Path-C-aware closure above. If the operator says the Caddy redirect target has since changed (e.g. repointed to `scripts/install.sh`), record the new target here and re-classify.
