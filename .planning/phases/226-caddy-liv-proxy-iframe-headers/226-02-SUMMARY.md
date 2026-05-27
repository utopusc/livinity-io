---
phase: 226-caddy-liv-proxy-iframe-headers
plan: 02
subsystem: update-sh-caddy-wiring
tags: [v42, update-sh, caddy, idempotent, reload, mini-pc, repo-side]
requirements: [SC-01, SC-02, SC-05, SC-06]
status: SHIPPED
dependency_graph:
  requires:
    - "Plan 226-01 SHIPPED `870c5bdf` (caddy/conf.d/liv-assistant.caddy + scripts/install-liv-caddy-snippet.sh on disk)"
    - "Plan 225-01 pattern `7922b987` (Step 4.6 liv-assistant install block + Step 8 restart pattern — model copied verbatim)"
  provides:
    - "update.sh Step 4.7 — `bash scripts/install-liv-caddy-snippet.sh` invocation (TEMP_DIR primary + LIVOS_DIR fallback) with hard-fail on installer non-zero"
    - "update.sh Step 8 extension — `systemctl reload caddy` (guarded on /etc/caddy/conf.d/liv-assistant.caddy presence) + `curl --resolve` loopback smoke of https://bruce.livinity.io/liv/api/auth/status + diagnostics dump + `fail` halt on non-2xx"
    - "update.sh footer — operator-visible line `Caddy /liv reverse-proxy snippet (bruce.livinity.io/liv → :3020, iframe CSP override) [Phase 226]`"
  affects:
    - "Plan 226-03 — Mini PC live deploy via `bash /opt/livos/update.sh`; will exercise this wiring end-to-end + external relay smoke + WS upgrade + CSP/XFO header inspection + idempotency proof"
    - "Phase 227 (LivOS shell iframe mount) — depends on /liv path being live in production after 226-03"
tech-stack:
  added: []
  patterns:
    - "TEMP_DIR primary + LIVOS_DIR fallback installer-source lookup (mirrors Phase 225-01 Step 4.6 + Phase 208-03 openclaw CLI shim pattern)"
    - "Guarded systemctl reload (not restart) — preserves existing TLS connections on bruce.livinity.io and other co-located sites; falls back to `systemctl start caddy` on reload failure (covers caddy-not-yet-running edge case)"
    - "`--resolve` loopback smoke — `curl --resolve bruce.livinity.io:443:127.0.0.1 -k https://bruce.livinity.io/liv/api/auth/status` exercises ONLY the Mini PC local Caddy listener; bypasses public DNS + Server5 relay; -k accepts the public-hostname Caddy-managed cert against loopback IP"
    - "Diagnostic-then-fail pattern — non-2xx response triggers (a) re-curl with timing breakdown, (b) `ls -la /etc/caddy/conf.d/liv-assistant.caddy`, (c) `journalctl -u caddy -n 20`, THEN `fail` helper (exit 1 BEFORE LIVOS_UPDATE_COMPLETED=1 sentinel → phase33_finalize records status=failed in update-history JSON)"
key-files:
  created: []
  modified:
    - "update.sh (+66 lines, 0 deletions — 3 insertion sites: Step 4.7 install block, Step 8 reload+smoke block, footer line)"
decisions:
  - "tail -15 on installer output (vs Plan 225-01's tail -10) — installer emits up to 7 log lines (chown + dir + snippet + 2× import + caddy validate + summary) plus `caddy validate` can produce multi-line errors; tail -15 captures the full failure context"
  - "Reload fallback chain: try reload → on failure warn + try start → on failure warn (don't fail) — proceeding to smoke probe is more informative than aborting at the reload step (smoke probe will dump journal anyway if caddy isn't serving)"
  - "Smoke probe exits via `fail` (exit 1) BEFORE LIVOS_UPDATE_COMPLETED=1 — phase33_finalize EXIT trap records status=failed in update-history JSON, matching Phase 225-01 deploy-abort safety pattern"
  - "Footer line tagged `[Phase 226]` (vs Plan 225-01's untagged liv-assistant line) — disambiguates the new Caddy snippet from the pre-existing liv-assistant binary install in operator-visible deploy summary"
metrics:
  duration: "~3 min wall-clock (file edit + 7 grep verify + commit)"
  completed: "2026-05-27T11:35:04Z"
  files_changed: 1
  lines_added: 66
  lines_removed: 0
  commits: 1
---

# Phase 226 Plan 02: Wire Caddy /liv snippet install + reload + smoke into update.sh Summary

Patched the repo-root `update.sh` so every `bash /opt/livos/update.sh` run on Mini PC also (1) re-runs the Plan 226-01 Caddy snippet installer as new Step 4.7 (idempotent — cmp -s short-circuits on byte-identical re-runs), (2) guarded-reloads caddy in Step 8 (preserving existing TLS connections), and (3) smokes `https://bruce.livinity.io/liv/api/auth/status` via `--resolve` loopback (bypassing public DNS + Server5 relay) — aborting the deploy via the `fail` helper on non-2xx so phase33_finalize records `status=failed` in update-history JSON. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED; only `update.sh` at repo root modified.

## Commit

| Plan | Commit | Files | Lines |
| ---- | ------ | ----- | ----- |
| 226-02 | `bef03544` | `update.sh` | +66 / -0 |

Branch: `master`. Sacred-SHA hook output at commit time: `[sacred-sha] PASS: 20 files verified`.

## Verification Results

### bash -n syntax check

```
$ bash -n update.sh
$ echo $?
0
```

Exit 0 — no syntax errors.

### 6 grep-count thresholds (all satisfied, most exceeded margins)

| # | Assertion | Threshold | Actual | Status |
|---|-----------|-----------|--------|--------|
| 1 | `grep -c 'install-liv-caddy-snippet.sh' update.sh` | ≥ 2 | 4 | PASS (2×) |
| 2 | `grep -c 'systemctl reload caddy' update.sh` | ≥ 1 | 1 | PASS |
| 3 | `grep -c '/liv/api/auth/status' update.sh` | ≥ 2 | 5 | PASS (2.5×) |
| 4 | `grep -c 'Phase 226' update.sh` | ≥ 3 | 7 | PASS (2.3×) |
| 5 | `grep -c '/liv proxy smoke FAILED' update.sh` | ≥ 1 | 1 | PASS |
| 6 | `grep -c -- '--resolve bruce.livinity.io:443:127.0.0.1' update.sh` | ≥ 2 | 2 | PASS |

6/6 PASS, no thresholds missed.

### Sacred SHA verify

```
$ git ls-files -s liv/packages/core/src/sdk-agent-runner.ts
100644 f3538e1d811992b782a9bb057d1b7f0a0189f95f 0	liv/packages/core/src/sdk-agent-runner.ts

$ git diff HEAD~1 HEAD -- liv/packages/core/
(empty)
```

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED. Pre-commit hook reported `[sacred-sha] PASS: 20 files verified`. `git log -1 --name-only` shows ONLY `update.sh`.

## Inserted Block Line Ranges

### Step A — Step 4.7 Caddy snippet install block

Lines **635 – 654** of post-patch `update.sh` (20 lines including the 6-line header comment block + the 14-line install logic). Slotted immediately AFTER Phase 225 Step 4.6 (`liv-assistant install`, which closes at line 633) and BEFORE `# ── Step 5: Build packages ──` (line 657). Mirrors the Step 4.6 pattern verbatim — TEMP_DIR primary + LIVOS_DIR fallback + tail-15 of installer output + `ok`/`fail` branches + pre-Phase-226-01 deploy `info` skip.

### Step B — Phase 226 reload caddy + /liv proxy smoke block

Lines **1216 – 1258** of post-patch `update.sh` (43 lines including the 5-line header comment block + the 38-line reload + smoke + diagnostic + fail logic). Slotted INSIDE the Step 8 `Restarting services` environment, immediately AFTER the Phase 225 liv-assistant restart block (which closes at line 1214) and BEFORE the `# Verify services` comment (line 1260). The smoke probe captures HTTP code via curl `-w '%{http_code}'`, branches on regex `^(200|204)$`, dumps re-curl + `ls -la` snippet path + `journalctl -u caddy -n 20` on failure, then calls `fail "/liv proxy smoke FAILED ..."` (exit 1 BEFORE `LIVOS_UPDATE_COMPLETED=1` at line 1308 → phase33_finalize records `status=failed`).

### Step C — Footer "What was updated" line

Line **1320** of post-patch `update.sh` (single-line insertion). Slotted immediately AFTER the existing Phase 225 liv-assistant footer line (line 1319) and BEFORE the Gallery app cache line (line 1321). Wording: `echo -e "    - Caddy /liv reverse-proxy snippet (bruce.livinity.io/liv → :3020, iframe CSP override) [Phase 226]"`. Tagged `[Phase 226]` for operator-visible disambiguation from the pre-existing liv-assistant binary install line.

## Success Criteria Coverage

| SC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| SC-01 | `caddy validate` will exit 0 after install | WIRED | update.sh Step 4.7 invokes `bash install-liv-caddy-snippet.sh` whose Step 6 is the HARD GATE `caddy validate --config /etc/caddy/Caddyfile` (per Plan 226-01); non-zero exit cascades to update.sh's `fail` helper (line 174 in patched section). Live `caddy validate` invocation against Mini PC `/etc/caddy/Caddyfile` happens in Plan 226-03. |
| SC-02 | curl `/liv/api/auth/status` returns 200 | WIRED (loopback) | update.sh Step 8 extension runs `curl -sS --max-time 5 --resolve bruce.livinity.io:443:127.0.0.1 -k https://bruce.livinity.io/liv/api/auth/status` and `fail`s on non-2xx. This proves the Mini PC's LOCAL Caddy listener routes /liv to :3020. The full external relay path (Server5 → Mini PC tunnel) is exercised by Plan 226-03 deploy. |
| SC-03 | CSP `frame-ancestors 'self' https://bruce.livinity.io` set + X-Frame-Options stripped | NOT-EXERCISED-HERE | Header inspection is Plan 226-03's responsibility (verify section in plan `<notes>` deliberately scopes update.sh smoke to HTTP-code-only). |
| SC-04 | WebSocket upgrade preserved | NOT-EXERCISED-HERE | WS smoke is Plan 226-03's responsibility (separate `curl -fsSI -H 'Upgrade: websocket' ...` invocation). |
| SC-05 | Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED | PASS | `git ls-files -s liv/packages/core/src/sdk-agent-runner.ts` returns the canonical SHA. Pre-commit hook `[sacred-sha] PASS: 20 files verified`. `git log -1 --name-only` shows only `update.sh`. `git diff HEAD~1 HEAD -- liv/packages/core/` returns empty. |
| SC-06 | Installer defensively chowns Caddyfile to `bruce:bruce` | WIRED | update.sh Step 4.7 invokes the installer which Step 1 stats `/etc/caddy/Caddyfile`'s owner and chowns to `bruce:bruce` if not already (per Plan 226-01). Live chown observation happens in Plan 226-03. |

## Decisions Made

1. **`tail -15` on installer output** (vs Plan 225-01's `tail -10`). Installer emits up to 7 log lines (chown + dir + snippet + 2× import + caddy validate + summary) plus `caddy validate` can produce multi-line errors; tail -15 captures the full failure context.
2. **Reload fallback chain: reload → start → don't fail.** If `systemctl reload caddy` fails, try `systemctl start caddy`. If that also fails, warn but proceed to smoke probe — the smoke probe will dump `journalctl -u caddy -n 20` anyway if caddy isn't serving, which is more informative than aborting at the reload step. The smoke probe itself uses `fail` for the hard halt.
3. **Smoke probe halt via `fail` (exit 1) BEFORE `LIVOS_UPDATE_COMPLETED=1` sentinel.** Matches Phase 225-01 deploy-abort safety pattern. `phase33_finalize` EXIT trap then records `status=failed` in update-history JSON.
4. **`--resolve` loopback smoke (not public DNS).** Deliberately bypasses public DNS by pinning `bruce.livinity.io:443` to `127.0.0.1` and accepts the public-hostname Caddy-managed cert via `-k`. This proves ONLY the Mini PC's local Caddy listener correctly routes /liv to :3020, independent of the Server5 relay path. Plan 226-03 will additionally curl the EXTERNAL URL through the full relay.
5. **Footer line tagged `[Phase 226]`.** Disambiguates the new Caddy snippet from the pre-existing liv-assistant binary install line in operator-visible deploy summary.

## Deviations from Plan

**None — plan executed exactly as written.** Byte-for-byte match to the plan's `<action>` Steps A/B/C content; all 6 grep thresholds PASS on the first commit; sacred SHA hook PASS on the first commit; `bash -n` exit 0 on the first commit.

## Carry-over to Plan 226-03 (Mini PC live deploy)

Plan 226-03 deploys this wiring to Mini PC `bruce@10.69.31.68` and proves all 6 SCs end-to-end:

- **Push `bef03544`** (and any unpushed predecessors) to `origin/master` before running update.sh on Mini PC.
- **First-run UAT:** `bash /opt/livos/update.sh` should now exercise Step 4.7 (installer chowns Caddyfile + writes snippet + adds imports + caddy validate exit 0) AND Step 8 extension (reload caddy + smoke probe HTTP 200) END-TO-END. `LIVOS_UPDATE_COMPLETED=1` reached → `<ts>-success.json` written.
- **Idempotency proof:** Re-run update.sh — installer should report `no-op: all artifacts already in place (idempotent re-run)`, caddy reload on byte-identical config is a no-op, smoke probe again HTTP 200. Second run also reaches `LIVOS_UPDATE_COMPLETED=1`.
- **External relay smoke (additional, beyond update.sh's loopback smoke):**
  - `curl -fsSI https://bruce.livinity.io/liv/api/auth/status` (no `--resolve`, real public DNS) → HTTP 200 (SC-02 end-to-end through Server5 relay).
- **CSP/XFO header inspection (SC-03):**
  - `curl -fsSI https://bruce.livinity.io/liv/` response headers contain literal substring `Content-Security-Policy: frame-ancestors 'self' https://bruce.livinity.io` AND DO NOT contain `X-Frame-Options:` (or contain `X-Frame-Options:` only with a header value that was set explicitly, not the AionUi default DENY).
- **WebSocket smoke (SC-04):**
  - `curl -fsSI -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: <base64>' https://bruce.livinity.io/liv/<ws-endpoint>` returns HTTP 101 (or 426 with WS upgrade headers — exact endpoint depends on AionUi WS path).
- **Sacred SHA byte-identical Mini PC vs repo at end (SC-05):**
  - `git hash-object /opt/liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.
- **Caddyfile bruce-owned (SC-06):**
  - `stat -c '%U:%G' /etc/caddy/Caddyfile` = `bruce:bruce`.
- **Operator browser UAT (deferred to next Mini PC session):** Visit `https://bruce.livinity.io/liv/` in a browser → AionUi WebUI loads (login screen, then chat surface).

## Self-Check: PASSED

- `update.sh` modified: FOUND (commit `bef03544`, single-file change, +66 / -0 lines)
- Commit `bef03544` exists: FOUND in `git log --oneline`
- Sacred SHA unchanged: FOUND `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts`
- `bash -n update.sh`: exit 0
- All 6 grep-count thresholds: PASS (4/1/5/7/1/2 vs ≥2/≥1/≥2/≥3/≥1/≥2)
- `git diff HEAD~1 HEAD -- liv/packages/core/`: empty (sacred file untouched)
- Pre-commit hook output: `[sacred-sha] PASS: 20 files verified`
