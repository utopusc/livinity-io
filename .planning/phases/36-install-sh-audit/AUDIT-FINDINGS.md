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

Static analysis of `install.sh.snapshot` (line refs are to that file). install.sh was NOT executed.

### Flags

| Flag | line:N | Required | Default | Description |
|------|--------|----------|---------|-------------|
| `--api-key <value>` | line:14 | optional | `""` (empty) | Sets `PLATFORM_API_KEY` from `$2`. Two-arg form only (`--api-key=VALUE` is NOT supported — splits on space). LEAKS via `ps` — see API Key Transport section. |

**Unrecognized-flag handling:** line:16 `*) shift ;;` — any non-`--api-key` token (including `--help`, `--api-key-file`, `--resume`, `--force`, `--no-build`, `--version`, `--debug`, etc.) is **silently shifted off without warning or error**. install.sh accepts no other flags. There is no `getopts`, no `--help` text, no `--version` reporter. (Static evidence: `grep -E "case \"\\\$1\"|getopts" install.sh.snapshot` returns one `case "$1"` at line:13 only; no `getopts`.)

### Environment variables consumed

install.sh consumes very few environment variables — most LIV-namespaced env vars are *generated and written* into `/opt/livos/.env`, not read from the caller's environment. Distinction below: **read** vs. **written**.

| Variable | line:N | Required | Default | Description |
|----------|--------|----------|---------|-------------|
| `EUID` | line:164 | yes (implicit) | (shell-provided) | Root check — script aborts via `fail()` if `EUID -ne 0`. |
| `DEBIAN_FRONTEND` | line:1474 | no | (script *exports* `noninteractive` for itself) | Suppresses apt prompts during install. Set BY install.sh, not consumed FROM caller. Listed for completeness. |
| `DISPLAY` | line:568, 656 | no | unset | Used inside the embedded `livos-launch-chrome` and `livos-set-resolution` scripts written to `/usr/local/bin/`. Not consumed by install.sh's main flow. |
| `XAUTHORITY` / `HOME` | line:570, 658 | no | derived | Same — used in embedded user-side scripts only. |
| `REDIS_URL` | line:724, 1338, 1563 | no | (sourced from `/opt/livos/.env` after generation) | Re-read post-`write_env_file` to extract the redis password for `redis-cli` calls. Not a caller-supplied input. |
| (no `LIV_API_KEY` consumed) | n/a | — | — | `LIV_API_KEY` is **generated** (line:909) into `.env` but never read from the caller's env. |
| (no `KIMI_API_KEY` consumed) | n/a | — | — | Written empty (line:905) into `.env` for later configuration via UI; not consumed. |
| (no `JWT_SECRET` consumed) | n/a | — | — | Generated (line:861, 908). |

**Key finding:** install.sh consumes **only one user-supplied input** — `--api-key <value>` via argv. There is **no** `LIV_API_KEY=... bash install.sh` env-var path, **no** stdin password prompt for the platform API key, and **no** `--api-key-file` flag. (Verified by `grep -nE "\\\$\\{LIV_API_KEY|\\\$\\{API_KEY\\}|\\\$\\{PLATFORM_API_KEY:-|read.*API_KEY|--api-key-file" install.sh.snapshot` returning only the lines listed in this section, with no env-var read of the platform key.)

### Stdin behavior

install.sh **does not read the platform API key from stdin**. The `read -r/-rsp/-rp` calls that exist (line:103, 206, 224, 249, 252, 269) are confined to:

- **line:103** — `read -r u` inside an `awk | while` pipeline parsing `loginctl list-sessions` output (desktop-user detection). Unrelated to user input.
- **line:206** — `read -rp "$prompt [$default]: " value` inside `wizard_input()` — interactive TTY path for non-API-key prompts (domain, etc.).
- **line:224** — `read -rsp "$prompt: " value` inside `wizard_password()` — silent password prompt, used for **interactive wizard** dialogs but **not invoked for the platform API key** (no caller in the script invokes `wizard_password` against `PLATFORM_API_KEY`; the platform key only flows in via argv at line:14).
- **line:249, 252** — `read -rp` in `wizard_yesno()` — yes/no confirmations.
- **line:269** — `read -rp "Press Enter to continue..."` — pause for `wizard_msgbox()`.

**Conclusion:** install.sh does not read the platform API key from stdin. The wizard's `wizard_password` helper is dead code with respect to the platform key — it is only used for hypothetical future prompts, not the current `--api-key` path. (Verified: no `wizard_password.*PLATFORM_API_KEY` or `read.*API_KEY` line exists in the snapshot.)

### Positional arguments

install.sh accepts no positional arguments. The `while [[ $# -gt 0 ]]; do case "$1" in ... esac done` loop at line:12-17 only matches `--api-key`; everything else falls through to `*) shift ;;` (line:16) and is discarded. The script is invoked as `bash install.sh [--api-key VALUE]` and ignores any other tokens.

### Findings summary

- Total flags discovered: **1** (`--api-key <value>`)
- Total env vars consumed (caller-supplied path): **1** (`EUID`, implicit; `DEBIAN_FRONTEND` is set by the script itself, not consumed)
- Total env vars *generated* into `.env` and consumed thereafter via sourcing: **1** (`REDIS_URL` post-`write_env_file`)
- Stdin support for API key: **no**
- Positional args: **no**
- Argument-surface anomalies: **2**
  1. **Unknown flags silently ignored** — `*) shift ;;` (line:16) makes typos like `--api-key-file` no-ops without warning. Phase 37's wrapper must validate flag spelling.
  2. **`install_cloudflared()` present but obsolete** (line:502-513, called at line:1488) — install.sh installs `cloudflared` even though the live LivOS stack does not use it (per project memory: Cloudflare is DNS-only, traffic flows through the Server5 relay, not via a Cloudflare tunneling daemon). This is dead infrastructure carried over from an earlier deployment model. Documented as anomaly; **NOT a blocker** for v29.2 reset (the package gets installed but never started/used). Plan 03's Hardening Proposals may flag for removal.

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
