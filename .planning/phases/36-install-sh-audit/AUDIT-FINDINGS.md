# install.sh Audit Findings — Phase 36

**Phase:** 36-install-sh-audit
**Milestone:** v29.2 Factory Reset
**Audit method:** Static analysis + curl fetch (read-only). No live execution per CONTEXT.md D-11.
**Audit date:** 2026-04-29
**Snapshot:** `.planning/phases/36-install-sh-audit/install.sh.snapshot`
**Primary consumer:** Phase 37 backend planner (per D-10)

> This document MUST be self-contained. Phase 37 should not need to consult external sources to design wipe + reinstall.

## Provenance

| Field | Value |
|-------|-------|
| Fetch URL | https://livinity.io/install.sh |
| Fetch timestamp (UTC) | 2026-04-29T04:12:32Z |
| HTTP status | 200 |
| Final URL after redirects | https://livinity.io/install.sh |
| Last-Modified | absent |
| ETag | absent |
| Content-Length | absent (Caddy + Next.js streamed body, no fixed-length header) |
| Server | absent (no `Server:` header; `Via: 1.1 Caddy` present, indicating Caddy-based relay) |
| Snapshot SHA-256 | `c00be0bf7e246878b3af2e470b138b2370ab498fc7aa80379945103273136437` |
| Snapshot byte size | 56494 |
| Snapshot line count | 1604 |
| Source provenance | live |

**Routing topology context:** `livinity.io` is DNS-only via Cloudflare; traffic resolves to the relay host (45.137.194.102) which forwards to the LivOS deployment. The relay sits between Cloudflare and the install.sh origin. If the relay is offline, the live URL fails and the audit must fall back to a cached copy on Mini PC. Cloudflare is **not** an HTTP tunnel — there is no Cloudflare tunneling daemon in this stack; Cloudflare's role is purely authoritative DNS for `*.livinity.io`.

**Caching note (FIX 2 reference, D-09):** At v29.2 audit time, the Mini PC cache at `/opt/livos/data/cache/install.sh.cached` is expected to be **absent** — the cache is populated by a future Phase 37 update.sh enhancement. `CACHE=missing` is the **expected** state for this audit run, not a defect. See `## Server5 Dependency Analysis` (Plan 03) for the complete fallback chain.

**Off-limits hosts (project memory hard rule, 2026-04-27):** Server4 (45.137.194.103) is not part of LivOS operations and is not referenced in this audit beyond this disclaimer. The audit's only operational target is the Mini PC (`bruce@10.69.31.68`). The relay host is examined only as the upstream of the install.sh URL.

**Source HTTP headers (verbatim, captured at audit time):**

```
HTTP/1.1 200 OK
Alt-Svc: h3=":443"; ma=2592000
Cache-Control: public, max-age=300
Content-Disposition: inline
Content-Type: text/plain; charset=utf-8
Date: Wed, 29 Apr 2026 04:12:32 GMT
Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch
Via: 1.1 Caddy
```

The full headers + provenance metadata are preserved at `install.sh.headers.txt` (sibling file). Note: `Last-Modified` and `ETag` are **not** emitted by the upstream Caddy + Next.js handler — version identity for this audit is therefore anchored on the SHA-256 hash above (not on HTTP cache validators).

## Raw Fetch

The fetched script is preserved verbatim at `install.sh.snapshot` (sibling file in this phase directory). It is referenced rather than embedded inline because the script is **1604 lines / 56494 bytes** — well above the ~200-line inlining threshold. Plans 02 and 03 will cite line ranges from `install.sh.snapshot` directly when filling in the static-analysis sections below.

To reproduce the exact bytes audited:

```
curl -sSL https://livinity.io/install.sh -o install.sh.snapshot
sha256sum install.sh.snapshot
# expected: c00be0bf7e246878b3af2e470b138b2370ab498fc7aa80379945103273136437
```

If the SHA-256 differs at re-fetch time, `livinity.io/install.sh` has drifted since this audit and Plans 02/03 findings must be re-validated against the new bytes.

## Argument Surface

*Populated by Plan 02.*

## Idempotency Verdict

*Populated by Plan 02. Final verdict will be one of: `IDEMPOTENT`, `PARTIALLY-IDEMPOTENT`, `NOT-IDEMPOTENT` (per D-06).*

## API Key Transport

*Populated by Plan 02. Will name a specific transport: `argv | stdin | --api-key-file | env-var` (per D-08).*

## Recovery Model

*Populated by Plan 03. Will document either install.sh's native `--resume` or the pre-wipe-snapshot fallback per D-07.*

## Server5 Dependency Analysis

*Populated by Plan 03. Will document Cloudflare-DNS → relay → install.sh-origin chain and fallback options per D-09.*

## Hardening Proposals

*Populated by Plan 03 (only if static analysis surfaces gaps; otherwise this section will state "No hardening required — install.sh meets v29.2 requirements as-is").*

## Phase 37 Readiness

*Populated by Plan 03 (final gate per D-10). Will record four answers — reinstall command, recovery action, idempotency yes/no, API key transport — so Phase 37's backend planner can proceed without re-running this audit.*
