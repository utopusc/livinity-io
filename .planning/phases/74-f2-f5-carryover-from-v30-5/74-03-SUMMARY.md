---
phase: 74
plan: 03
subsystem: server5-caddy-infra
tags: [server5, caddy, infra, sse, timeout, f4, audit-only, pre-checkpoint]
status: PARTIAL — checkpoint:human-verify pending; live edit deferred per user brief 2026-05-04
requires: []
provides: [audit-doc-74-03]
affects:
  - "Server5 /etc/caddy/Caddyfile (NOT yet — proposed diff documented; live apply gated)"
tech-stack:
  added: []
  patterns:
    - "Path-matched named matcher (@broker_paths) for scoping reverse_proxy timeout"
    - "transport http { read_timeout 30m write_timeout 30m dial_timeout 30s } block under reverse_proxy"
    - "Preserved-as-is: rate_limit, header_up, flush_interval -1, handle_errors 429, log directive"
key-files:
  created:
    - .planning/phases/74-f2-f5-carryover-from-v30-5/74-03-CADDY-DIFF.md
    - .planning/phases/74-f2-f5-carryover-from-v30-5/74-03-SUMMARY.md
  modified: []
decisions:
  - "Shape A encountered (single blanket reverse_proxy localhost:4000 on api.livinity.io). Proposed transformation introduces @broker_paths matcher + handle blocks (Shape B form) — minimal-risk path-scoped form preferred over blanket transport-block."
  - "flush_interval -1 already present pre-74-03 (carries from a prior change). F4 contributes only the transport http { ... } timeout block."
  - "Pre-existing systemctl reload caddy permission failure on /var/log/caddy/api.livinity.io.log noted as deferred item; direct caddy reload (root UID) is the apply path."
  - "Live edit deferred to post-checkpoint per user brief 2026-05-04 (audit-and-checkpoint shape, not full apply)."
metrics:
  duration: "~25 min"
  completed: 2026-05-04
---

# Phase 74 Plan 03: F4 Caddy Timeout (Audit Doc) Summary

**One-liner:** Server5 Caddyfile audited; F4 timeout diff proposed (path-matched `@broker_paths` + `transport http { read_timeout 30m write_timeout 30m dial_timeout 30s }`); live apply gated behind `checkpoint:human-verify`.

## What was done

1. Confirmed Server5 identity via SSH probe (`hostname -I` → `45.137.194.102`, NOT off-limits-server). D-NO-SERVER4 invariant preserved.
2. Captured pre-edit Caddyfile state in single batched read-only SSH session: contents (89 lines), sha256 `4c0a6e39cfdb0e6b4aec9f99392380a0f2aacd781b34dc4557385f09dcc509d0`, Caddy v2.11.2 service status, listening ports, existing backup precedent (`Caddyfile.bak.20260503-072328`).
3. Identified Caddyfile shape: **Shape A** (single blanket `reverse_proxy localhost:4000` for `api.livinity.io`), with `flush_interval -1` already present and three `header_up` directives.
4. Documented missing piece: `transport http { read_timeout ... }` not set on the broker block. Default Caddy timeouts apply, ~5min idle cuts long agentic streams.
5. Constructed minimal-risk proposed diff: introduce `@broker_paths` named matcher covering `/v1/messages`, `/v1/messages/*`, `/v1/chat/completions`, `/v1/chat/completions/*`, `/u/*/v1/messages`, `/u/*/v1/messages/*`, `/u/*/v1/chat/completions`, `/u/*/v1/chat/completions/*`. Apply timeout block to those paths only; preserve original blanket reverse_proxy as fallback `handle` for non-broker paths (`/internal/ask` etc.).
6. Wrote audit doc `74-03-CADDY-DIFF.md` (8 sections: pre-edit state, backup plan, proposed diff, validate/reload placeholder, external test plan, rollback procedure, threat model status, sacred-SHA + D-NO-SERVER4 attestations).
7. Stopped at human-verify checkpoint. Live edit (backup + edit + validate + reload + external test) is for the post-checkpoint resume.

## Caddyfile shape encountered

**Shape A (blanket).** The `api.livinity.io` site block used a single `reverse_proxy localhost:4000 { flush_interval -1 ; header_up ... }` for all paths. No path-scoping pre-74-03.

## Backup plan (post-checkpoint)

`/etc/caddy/Caddyfile.bak.<YYYYMMDD-HHMMSS>` per existing precedent (`Caddyfile.bak.20260503-072328`). sha256 must match pre-edit `4c0a6e39cfdb0e6b4aec9f99392380a0f2aacd781b34dc4557385f09dcc509d0`. Backup runs in same SSH session as edit + validate + reload.

## Diff (summary; full unified diff in 74-03-CADDY-DIFF.md Section 3)

- ADD: `@broker_paths path /v1/messages /v1/messages/* /v1/chat/completions /v1/chat/completions/* /u/*/v1/messages /u/*/v1/messages/* /u/*/v1/chat/completions /u/*/v1/chat/completions/*`
- ADD: `handle @broker_paths { reverse_proxy localhost:4000 { flush_interval -1 ; header_up ... ; transport http { read_timeout 30m ; write_timeout 30m ; dial_timeout 30s } } }`
- ADD: `handle { reverse_proxy localhost:4000 { flush_interval -1 ; header_up ... } }` (fallback for non-broker paths)
- REMOVE: blanket `reverse_proxy localhost:4000 { flush_interval -1 ; header_up ... }` at site-block level (replaced by the two `handle` blocks above)
- PRESERVED: `tls on_demand`, `rate_limit { ... }`, `handle_errors 429 { ... }`, `log { ... }`

## Validate / Reload / External test

PENDING. To run post-checkpoint per audit doc Sections 4, 5, 6.

## apps.livinity.io sanity-check

PENDING. To run post-reload per audit doc human-verify Section 4 (visit `https://apps.livinity.io` in browser).

## off-limits-server / Mini PC Caddy

NOT touched. off-limits-server explicitly avoided per HARD RULE 2026-04-27. Mini PC Caddy not touched (per CONTEXT D-03; F4 is Server5-exclusive).

## Rollback (one-line)

`ssh root@45.137.194.102 'cp /etc/caddy/Caddyfile.bak.<TS> /etc/caddy/Caddyfile && caddy validate --config /etc/caddy/Caddyfile && caddy reload --config /etc/caddy/Caddyfile'`

Full procedure: audit doc Section 7.

## Sacred file SHA

`nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — verified at start; trivially preserved (no source modified across this plan).

## Deviations from Plan

**1. [Rule 4 / user-directive] Audit-only, live apply deferred to post-checkpoint**
- **Found during:** Plan setup (user brief)
- **Issue:** Plan 74-03 as written executes the full SSH-edit-validate-reload-test flow. User's brief (2026-05-04) explicitly inverted that: "do NOT live-edit Caddyfile in this plan unless instructed (per the plan's checkpoint design)". The plan's `checkpoint:human-verify` section is interpreted as a **pre-apply gate**, not a post-apply verification gate.
- **Adjustment:** This plan executes only the read-only audit + diff documentation, then stops at the checkpoint. The actual `cp` backup, `cat > /etc/caddy/Caddyfile.new` edit, `caddy validate`, `caddy reload`, and 90-sec curl test are deferred to a continuation run after the operator approves the diff.
- **Files modified:** none on Server5; only `74-03-CADDY-DIFF.md` and this `74-03-SUMMARY.md` in the repo.

**2. [Out-of-scope finding, deferred] systemd ExecReload permission issue**
- **Found during:** Pre-edit state capture (Section 1 of audit doc).
- **Issue:** `caddy.service` `ExecReload` previously failed with `open /var/log/caddy/api.livinity.io.log: permission denied`. Pre-existing (predates 74-03). Affects `systemctl reload caddy` but not the direct `caddy reload --config ...` path used by this plan.
- **Disposition:** Logged in audit doc Section 1; out-of-scope for 74-03. Documented as deferred item — fix is `chown caddy:caddy /var/log/caddy/api.livinity.io.log` or equivalent group-write permission. Should land in a future infra hygiene plan.
- **Files modified:** none. Deferred.

## Self-Check: PASSED (audit-only scope)

Files claimed as created — verified to exist:

- FOUND: `.planning/phases/74-f2-f5-carryover-from-v30-5/74-03-CADDY-DIFF.md` (19,276 chars)
- FOUND: `.planning/phases/74-f2-f5-carryover-from-v30-5/74-03-SUMMARY.md` (this file)

Plan automated gates run pre-commit:

- PASS: sacred SHA (`4f868d318abff71f8c8bfbcf443b2393a553018b`) on `nexus/packages/core/src/sdk-agent-runner.ts` — unchanged
- PASS: audit doc required tokens (`Caddyfile.bak`, `read_timeout`, `flush_interval`, `caddy validate`, `caddy reload`, `external`, `rollback`) all present
- PASS: audit doc length 19,276 > 2000 char threshold
- PASS: D-NO-SERVER4 grep gate — zero matches for forbidden tokens (`Server4`, `45.137.194.103`)
- PASS: plan scope — only `74-03-CADDY-DIFF.md` and `74-03-SUMMARY.md` introduced by this plan run

Live-edit gates (NOT YET RUN — deferred to post-checkpoint):

- DEFERRED: backup creation + sha256 match
- DEFERRED: `caddy validate` exits 0
- DEFERRED: `caddy reload` exits 0
- DEFERRED: external 90-sec curl streaming test from Mini PC

Plan does NOT claim "complete" — partial completion gated at `checkpoint:human-verify`. Continuation agent must run Sections 2 (backup), 4 (validate), 5 (reload), 6 (external test) of the audit doc and append outputs to it before marking the plan complete.
