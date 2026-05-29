# Install-Entrypoint Resolution (R11)

**Plan:** 252-03 (Wave 3, `autonomous: false`)
**Resolved:** 2026-05-29 via live curl + DNS probes (read-only) + **operator correction**
**Status:** RESOLVED — operator identified the real user-facing entrypoint
**Feeds:** R9 part (1) — Plan 252-04

---

## VERDICT (corrected after operator input)

There are **TWO distinct public install URLs**, serving **different scripts**:

| URL | Server | Serves | Path | Seeds `liv:mcp:config`? |
|-----|--------|--------|------|--------------------------|
| **`https://livinity.io/install.sh`** ← **the REAL user-facing command** (shown in admin panel) | **Vercel** | `route.ts` shim → GitHub-raw `scripts/install.sh` | **Path A** (via `deploy-livinityd.sh`) | **YES** (primary) |
| `https://get.livinity.io/install` ← legacy / operator says "wasn't working" | **Caddy** (`154.12.245.35`) | 301 → GitHub-raw `livos/install.sh` | **Path C** | **NO** |

**Canonical verdict:** `livinity.io/install.sh → route.ts (Path D shim) → scripts/install.sh (Path A) → deploy-livinityd.sh → seeds MCP: YES`

The admin panel issues:
```
curl -fsSL https://livinity.io/install.sh | sudo bash -s <liv_k_API_KEY>
```
This is **Path A** and (after 252-01) seeds `liv:mcp:config` correctly. The earlier `get.livinity.io → Path C` verdict was for the **wrong URL** — a separate legacy Caddy host the operator confirms is not the install path in use.

---

## The ONE real remaining gap → R9 / Plan 252-04

`route.ts` (`platform/web/src/app/install.sh/route.ts`) serves Path A on the **happy path**, but its **fallback** (when the GitHub-raw fetch of `scripts/install.sh` fails) clones the repo and runs **`livos/install.sh` (Path C)** — which seeds NO MCP config:

```ts
// route.ts:30-36 — fallback when GitHub raw fetch fails
const fallback = `#!/bin/bash
...
git clone --depth 1 https://github.com/utopusc/livinity-io.git "$TMPDIR/livinity-io"
exec bash "$TMPDIR/livinity-io/livos/install.sh" "$@"   # ← Path C, NO MCP seed
`;
```

So a transient GitHub-raw outage silently downgrades a fresh install to the no-MCP-seed path, with no operator-visible error. The same applies to anyone who used the legacy `get.livinity.io` URL (Path C).

**R9 (Plan 252-04) closure — recommended:** port the `_dld_seed_mcp_servers` step into `livos/install.sh` so BOTH the route.ts fallback AND the legacy `get.livinity.io`/Path C entrypoint seed `liv:mcp:config`. This is repo-only and makes every entrypoint safe regardless of which script ends up running. (Optionally also keep route.ts pinned to `scripts/install.sh` on the happy path — already the case.)

---

## Evidence

### A. Primary entrypoint — `https://livinity.io/install.sh` (operator-identified)

```
$ curl -sSL -D - https://livinity.io/install.sh
HTTP/1.1 200 OK
Server: Vercel
X-Matched-Path: /install.sh
X-Vercel-Cache: MISS
Content-Type: text/plain; charset=utf-8

#!/usr/bin/env bash
# scripts/install.sh
# LivOS one-shot installer. Dispatches to mode-tunnel.sh (portal mode ...)
# Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f
... (self-bootstrap helpers from scripts/install/, incl. deploy-livinityd.sh)
```

- `Server: Vercel` + `X-Matched-Path: /install.sh` → served by `platform/web/src/app/install.sh/route.ts` (Path D shim).
- Body header `# scripts/install.sh` + Sacred SHA `f3538e1d…` → confirms it serves **Path A** (`scripts/install.sh`), which self-bootstraps `scripts/install/` helpers including `deploy-livinityd.sh` (the file that, after 252-01, seeds the MCP catalog).
- `route.ts:11-12` fetches `raw.githubusercontent.com/utopusc/livinity-io/master/scripts/install.sh` → Path A. Fallback (`route.ts:30-36`) runs `livos/install.sh` → Path C (the gap above).

### B. Legacy entrypoint — `https://get.livinity.io/install` (NOT the install path in use)

```
$ nslookup get.livinity.io        → 154.12.245.35   (single A record; self-hosted Caddy, not Vercel/CF)
$ curl -sSL -D - https://get.livinity.io
  HTTP/1.1 200  Server: Caddy   body: "LivOS Installer - Use: curl -sSL get.livinity.io/install | sudo bash"
$ curl -sSL -D - https://get.livinity.io/install
  HTTP/1.1 301  Location: https://raw.githubusercontent.com/utopusc/livinity-io/master/livos/install.sh
```

- `get.livinity.io` is a separate **Caddy** host (`154.12.245.35`) that 301-redirects `/install` to GitHub-raw **`livos/install.sh`** (Path C).
- Served body is **byte-identical** to repo `livos/install.sh` (1725 lines, `diff` exit 0); contains **0** `liv:mcp:config` / `_dld_seed_mcp` references; uses `openssl rand` secrets with `redis://:${SECRET_REDIS}@` (password-only) shape — the Path C signature from 251-08.
- Operator confirms this URL "wasn't working" and is not the panel-issued install command. Recorded here only to document that it bypasses the MCP seed (a second motivation for porting the seed into `livos/install.sh`).

---

## Path classification cross-check (vs 251-08 four-entrypoint table)

| Path | File | Secrets | MCP seed | Which live URL serves it |
|------|------|---------|----------|---------------------------|
| **A** | `scripts/install.sh` → `deploy-livinityd.sh` | real, `redis://default:<rand>@` | **YES** | **`livinity.io/install.sh`** (happy path) |
| B | `/install.sh` (repo root) | `CHANGEME` | NO | (none live; R9(3) hardens it) |
| C | `livos/install.sh` | real, `redis://:<rand>@` | NO | `get.livinity.io/install` (legacy) + `route.ts` fallback |
| D | `platform/web/.../install.sh/route.ts` (Vercel shim) | proxies A (fallback C) | A:yes / C:no | the shim BEHIND `livinity.io/install.sh` |

**Resolved canonical entrypoint: `livinity.io/install.sh` → Path D shim → Path A (MCP seed YES). Remaining gap: route.ts fallback + legacy Path C seed no MCP → R9/252-04.**

---

## Operator confirmation (Task 2 checkpoint)

- Operator supplied the real install command (`curl -fsSL https://livinity.io/install.sh | sudo bash -s <key>`) and flagged that `get.livinity.io` is not the path in use.
- Live `curl https://livinity.io/install.sh` confirms Vercel `route.ts` → `scripts/install.sh` (Path A).
- Verdict above reflects this correction.
