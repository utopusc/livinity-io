---
phase: 226-caddy-liv-proxy-iframe-headers
plan: 01
subsystem: caddy-reverse-proxy
tags: [v42, caddy, reverse-proxy, iframe, csp, websocket, idempotent, mini-pc, repo-side]
requirements: [SC-01, SC-03, SC-04, SC-05, SC-06]
status: SHIPPED
dependency_graph:
  requires:
    - "Phase 223 liv-assistant.service on 127.0.0.1:3020 (DEPLOYED — Plan 223-05 `12279e70`)"
  provides:
    - "caddy/conf.d/liv-assistant.caddy — Caddy v2 named snippet (`liv_assistant`) routing /liv → 127.0.0.1:3020 with iframe-friendly CSP override + X-Frame-Options strip + WS auto-handle"
    - "scripts/install-liv-caddy-snippet.sh — root-required idempotent installer (defensive Caddyfile chown + cmp -s snippet write + awk insertion of `import liv_assistant` + `caddy validate` hard gate)"
  affects:
    - "Plan 226-02 — wires installer into update.sh (after liv-assistant install block, before systemctl reload caddy)"
    - "Plan 226-03 — Mini PC live deploy + curl smoke through relay (SC-02 + operator browser UAT)"
    - "Plan 227 — LivOS shell iframe mount consumes the CSP frame-ancestors override authored here"
tech-stack:
  added: []
  patterns:
    - "Caddy v2 named snippet `(liv_assistant) { ... }` imported into existing `bruce.livinity.io` site block via single `import liv_assistant` line (avoids duplicate site-block conflict with livinityd-managed config — Phase 86 / Phase 218 invariant)"
    - "Multi-path strip idiom: `@liv path /liv /liv/*` + `handle @liv { uri strip_prefix /liv; ... }` (NOT `handle_path /liv*` — Caddy v2 `handle_path` accepts ONE matcher only, per feedback_caddyfile_must_be_bruce_owned)"
    - "CSP override: `header_down -Content-Security-Policy` strips upstream + `header Content-Security-Policy \"frame-ancestors 'self' https://bruce.livinity.io\"` at `handle` level sets new"
    - "Idempotent installer triad: stat-then-chown for ownership, cmp -s for snippet writes, grep -q gates for both `import conf.d/*.caddy` (top-level) and `import liv_assistant` (inside site block); awk inserts the latter on the line after the `bruce.livinity.io {` opening brace"
key-files:
  created:
    - "caddy/conf.d/liv-assistant.caddy (38 lines)"
    - "scripts/install-liv-caddy-snippet.sh (139 lines)"
  modified: []
decisions:
  - "Named snippet over standalone site block — `(liv_assistant)` is imported into the existing `bruce.livinity.io { ... }` block instead of dropping a second `bruce.livinity.io` block (Caddy refuses two TLS-managed blocks for the same hostname)"
  - "TAB indentation inside snippet braces — matches `platform/relay/Caddyfile` style; verified 12 tab-leading lines in the final byte-stream"
  - "`flush_interval -1` retained on reverse_proxy — disables periodic flushes for streaming; harmless if AionUi doesn't stream; matches relay pattern"
  - "Minimal CSP (frame-ancestors only) — avoids breaking AionUi's own loading; Phase 227 may need to widen this for additional sources"
  - "Sacred-SHA pre-commit hook PASS at commit time (`[sacred-sha] PASS: 20 files verified`) confirms `liv/packages/core/` untouched"
metrics:
  duration: "~2 min wall-clock (file authoring + grep verify + commit)"
  completed: "2026-05-27T11:29Z"
  files_changed: 2
  lines_added: 177
  lines_removed: 0
  commits: 1
---

# Phase 226 Plan 01: Vendor Caddy `/liv` Snippet + Idempotent Installer Summary

Authored the repo-side Caddy v2 snippet that reverse-proxies `bruce.livinity.io/liv` to the Phase 223 `liv-assistant.service` on `127.0.0.1:3020` with iframe-embeddable CSP headers and an idempotent root-required installer that wires it into the existing Mini PC Caddyfile via a named-snippet import (NOT a second site block — that would conflict with livinityd's Phase 86 / Phase 218 managed config).

## Commit

| Plan | Commit | Files | Lines |
| ---- | ------ | ----- | ----- |
| 226-01 | `870c5bdf` | `caddy/conf.d/liv-assistant.caddy`, `scripts/install-liv-caddy-snippet.sh` | +177 / -0 |

Branch: `master`. Sacred-SHA hook output at commit time: `[sacred-sha] PASS: 20 files verified`.

## Verification Results

### Verify Command (14 assertions — single chained `&&` chain from plan)

Command: see `<verify><automated>` block in `226-01-PLAN.md`.

Result: **PASS** (single stdout line `PASS` after the chain).

### Individual Assertions

| # | Assertion | Expected | Actual | Status |
|---|-----------|----------|--------|--------|
| 1 | `bash -n scripts/install-liv-caddy-snippet.sh` | exit 0 | exit 0 | PASS |
| 2 | `test -f caddy/conf.d/liv-assistant.caddy` | exists | exists | PASS |
| 3 | `grep '@liv path /liv /liv/\*' caddy/conf.d/liv-assistant.caddy` | ≥1 | 1 | PASS |
| 4 | `grep 'reverse_proxy 127\.0\.0\.1:3020' caddy/conf.d/liv-assistant.caddy` | ≥1 | 1 | PASS |
| 5 | `grep 'uri strip_prefix /liv' caddy/conf.d/liv-assistant.caddy` | ≥1 | 1 | PASS |
| 6 | `grep 'header_down -X-Frame-Options' caddy/conf.d/liv-assistant.caddy` | ≥1 | 1 | PASS |
| 7 | `grep 'header_down -Content-Security-Policy' caddy/conf.d/liv-assistant.caddy` | ≥1 | 1 | PASS |
| 8 | `grep "frame-ancestors 'self' https://bruce.livinity.io" caddy/conf.d/liv-assistant.caddy` | ≥1 | 1 | PASS |
| 9 | `grep 'chown bruce:bruce' scripts/install-liv-caddy-snippet.sh` | ≥1 | 5 | PASS |
| 10 | `grep 'cmp -s' scripts/install-liv-caddy-snippet.sh` | ≥1 | 1 | PASS |
| 11 | `grep 'caddy validate' scripts/install-liv-caddy-snippet.sh` | ≥1 | 4 | PASS |
| 12 | `grep 'import liv_assistant' scripts/install-liv-caddy-snippet.sh` | ≥1 | 9 | PASS |
| 13 | `grep 'EUID' scripts/install-liv-caddy-snippet.sh` | ≥1 | 1 | PASS |
| 14 | `git log -1 --name-only` matches BOTH new files AND none under `liv/packages/core/` | match | match | PASS |

14/14 PASS. No deviations.

### Sacred SHA Verify

```
$ git ls-files -s liv/packages/core/src/sdk-agent-runner.ts
100644 f3538e1d811992b782a9bb057d1b7f0a0189f95f 0	liv/packages/core/src/sdk-agent-runner.ts
```

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED. Pre-commit hook reported `PASS: 20 files verified`. No paths under `liv/packages/core/` touched (`git log -1 --name-only` shows ONLY `caddy/conf.d/liv-assistant.caddy` + `scripts/install-liv-caddy-snippet.sh`).

## Verbatim: `caddy/conf.d/liv-assistant.caddy`

```caddy
# liv-assistant: AionUi WebUI on 127.0.0.1:3020 — Phase 226
#
# Named snippet (parens). Imported from the existing `bruce.livinity.io { ... }`
# site block in /etc/caddy/Caddyfile via a single `import liv_assistant` line.
# DO NOT convert this into a standalone `bruce.livinity.io { ... }` site block
# — that would conflict with the existing livinityd-managed site config
# (Phase 86 / Phase 218 — feedback_caddyfile_must_be_bruce_owned).
#
# Path strategy (Caddy v2 multi-path pitfall — `handle_path` takes only ONE
# matcher; use `@liv path` + `handle` + `uri strip_prefix` for `/liv` AND
# `/liv/*` together — per feedback_caddyfile_must_be_bruce_owned):
#   /liv         → 127.0.0.1:3020/    (root)
#   /liv/foo     → 127.0.0.1:3020/foo (sub-path)
#
# WebSocket: reverse_proxy auto-handles Upgrade/Connection in Caddy v2. We
# do NOT set any `header_up Connection` / `header_up Upgrade` directives that
# would strip WS headers. AionUi uses WS for chat streaming (Phase 222 spike
# confirmed).
#
# Iframe / CSP override: AionUi upstream may emit X-Frame-Options DENY and
# its own CSP. We strip both on the way out and replace with a CSP that
# allows ONLY `https://bruce.livinity.io` (the LivOS shell origin — Phase 227
# iframe mount) plus `'self'` (so the embedded page itself can navigate).

(liv_assistant) {
	@liv path /liv /liv/*
	handle @liv {
		uri strip_prefix /liv
		reverse_proxy 127.0.0.1:3020 {
			header_down -X-Frame-Options
			header_down -Content-Security-Policy
			header_up Host {host}
			header_up X-Real-IP {remote_host}
			flush_interval -1
		}
		header Content-Security-Policy "frame-ancestors 'self' https://bruce.livinity.io"
	}
}
```

Tab-indented inside the brace bodies (12 tab-leading lines verified via `awk '/^\t/{c++} END{print c}'`).

## Success Criteria Coverage

| SC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| SC-01 | `caddy validate` will exit 0 after install | DEFERRED-PASS | Repo-side authoring complete; live `caddy validate` runs in Plan 226-03 against Mini PC `/etc/caddy/Caddyfile`. Snippet syntax matches Caddy v2 named-snippet form + valid reverse_proxy + valid `@liv path` + valid `handle` + valid `header` and `header_down` directives. |
| SC-02 | curl smoke through relay returns 200 | NOT-EXERCISED-HERE | Plan 226-03 (Mini PC live deploy) exercises this. |
| SC-03 | CSP `frame-ancestors 'self' https://bruce.livinity.io` set + X-Frame-Options stripped | PASS | Snippet contains literal substring (grep #8) + `header_down -X-Frame-Options` (grep #6) + `header_down -Content-Security-Policy` (grep #7). |
| SC-04 | WebSocket upgrade preserved | PASS-by-design | No `header_up Connection` and no `header_up Upgrade` directives in the snippet (verified by inspection — those are the ONLY directives that would strip WS in Caddy v2; absence = auto-handle preserved). Pattern matches `platform/relay/Caddyfile`. |
| SC-05 | Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED | PASS | `git ls-files -s liv/packages/core/src/sdk-agent-runner.ts` returns the canonical SHA. Pre-commit hook `[sacred-sha] PASS: 20 files verified`. `git log -1 --name-only` shows no paths under `liv/packages/core/`. |
| SC-06 | Installer defensively chowns Caddyfile to `bruce:bruce` | PASS | grep #9 — `chown bruce:bruce` occurs 5 times across the installer (Caddyfile + temp files + post-mv re-chown), defensive per `feedback_caddyfile_must_be_bruce_owned`. |

## Decisions Made

1. **Named snippet over standalone site block.** The existing Mini PC `/etc/caddy/Caddyfile` already has a `bruce.livinity.io { ... }` site block managed by livinityd (Phase 86 / Phase 218). Caddy v2 refuses two TLS-managed blocks for the same hostname, so we use `(liv_assistant) { ... }` and import it into the existing block via a single `import liv_assistant` line. The installer's awk surgery inserts that import on the line immediately after the opening brace.
2. **Multi-path strip via `@liv path /liv /liv/*` + `handle` + `uri strip_prefix`.** Caddy v2's `handle_path` accepts ONE matcher only — using it with `/liv*` to cover both bare `/liv` and `/liv/foo` is the documented pitfall in `feedback_caddyfile_must_be_bruce_owned`. The chosen idiom expresses both paths in a single matcher and strips the prefix once inside the handle scope.
3. **TAB indentation inside the snippet body.** Matches `platform/relay/Caddyfile` project convention. Verified 12 tab-leading lines via `awk '/^\t/{c++} END{print c}' caddy/conf.d/liv-assistant.caddy` after write.
4. **Minimal CSP — frame-ancestors only.** Avoids over-constraining AionUi's own asset/font/connect-src loading. Phase 227 (iframe mount) may need to widen this if the embedded page fails to load specific sources.
5. **Installer is root-required and exits non-zero on `caddy validate` failure.** Update.sh (Plan 226-02) will invoke it as root (update.sh runs as root). Non-zero exit cascades to update.sh's `fail` helper which aborts the deploy before `LIVOS_UPDATE_COMPLETED=1` sentinel — mirrors the Phase 225 deploy-abort safety pattern.

## Deviations from Plan

**None — plan executed exactly as written.** Byte-for-byte match to the `<action>` block content; all 14 grep assertions PASS on the first commit; sacred SHA hook PASS on the first commit.

## Carry-over to Plan 226-02

Plan 226-02 (`update.sh` wiring) needs to invoke `bash scripts/install-liv-caddy-snippet.sh` from update.sh:

- **AFTER** the Phase 225 liv-assistant install block (`scripts/install-liv-assistant.sh`) — the Caddy snippet wires the routing layer, but only matters if the upstream service is already installed.
- **BEFORE** `systemctl reload caddy` (or whatever Phase 226-02 chooses to invoke for Caddy reload) — installer's `caddy validate` is a hard gate; reload must come after the install AND after validate passes.
- **AFTER** any defensive chown of `/etc/caddy/Caddyfile` (which the installer itself performs, but if update.sh has an earlier chown step, run order matters for `bruce:bruce` invariant per `feedback_caddyfile_must_be_bruce_owned`).
- Pass arguments? None — installer derives `SNIPPET_SRC` from its own `BASH_SOURCE[0]` location and finds the repo via `${SCRIPT_DIR}/..`, which works both from `/opt/livos/scripts/` (post-rsync) AND from `/tmp/livinity-update-*/scripts/` (during rsync) — same pattern Phase 225 used.
- Idempotency: re-running with no source changes should produce all three `_CHANGED=0` flags (snippet byte-identical + top-level import present + site-block import present) and `caddy validate` exit 0 → installer exits 0 with `[install-liv-caddy-snippet] no-op: all artifacts already in place (idempotent re-run)` log line.

## Carry-over to Plan 226-03 (Mini PC live deploy)

- Push `870c5bdf` (and any predecessors) to `origin/master` before running update.sh on Mini PC.
- After update.sh completes successfully (`LIVOS_UPDATE_COMPLETED=1`), verify:
  - `stat -c '%U:%G' /etc/caddy/Caddyfile` → `bruce:bruce` (SC-06)
  - `cat /etc/caddy/conf.d/liv-assistant.caddy` → byte-identical to repo (cmp -s)
  - `grep 'import conf.d/\*\.caddy' /etc/caddy/Caddyfile` → 1 occurrence
  - `grep 'import liv_assistant' /etc/caddy/Caddyfile` → 1 occurrence (inside the `bruce.livinity.io { ... }` block)
  - `sudo -u caddy caddy validate --config /etc/caddy/Caddyfile` → exit 0 (SC-01)
  - `curl -fsSI https://bruce.livinity.io/liv/api/auth/status` → HTTP 200 (SC-02 — through relay, exercises end-to-end routing)
  - `curl -fsSI https://bruce.livinity.io/liv/` headers contain `Content-Security-Policy: frame-ancestors 'self' https://bruce.livinity.io` AND do NOT contain `X-Frame-Options:` (SC-03)
  - Optional: WebSocket smoke via `curl -fsSI -H 'Upgrade: websocket' -H 'Connection: upgrade' https://bruce.livinity.io/liv/...` returns HTTP 101 or 426 (SC-04 — exact response depends on AionUi endpoint).
- Sacred SHA byte-identical Mini PC vs repo at end (SC-05 — `git hash-object /opt/liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f`).

## Self-Check: PASSED

- `caddy/conf.d/liv-assistant.caddy` exists: FOUND
- `scripts/install-liv-caddy-snippet.sh` exists: FOUND
- Commit `870c5bdf` exists: FOUND in `git log --oneline`
- Sacred SHA unchanged: FOUND `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts`
- All 14 verify-command grep assertions: PASS
- `bash -n scripts/install-liv-caddy-snippet.sh`: exit 0
