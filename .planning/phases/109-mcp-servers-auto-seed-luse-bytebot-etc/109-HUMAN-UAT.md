---
status: passed
phase: 109-mcp-servers-auto-seed
source: [109-01-PLAN.md, 109-01-SUMMARY.md]
started: 2026-05-13
updated: 2026-05-13
---

## Current Test

[completed — mainserver 154.53.56.75 fresh-install UAT PASSED 2026-05-13T19:35Z]

## Tests

### 1. MCP auto-seed on fresh-VPS install (mainserver 154.53.56.75)

expected:
- `liv:mcp:config` Redis key set with 2 servers (sequential-thinking + luse) after install
- `LUSE_REDIS_URL` substituted with mainserver password (not Mini PC password leaked)
- AI Chat → MCP panel shows both servers reachable (no "spawn ENOENT" errors)
- Idempotency: re-running install does not overwrite user customizations

procedure (executed 2026-05-13T19:02–19:35Z, 2 hotfix iterations):
1. ✅ Pre-flight: push Phase 109 commits (`863c2125..22679068`) to GitHub master.
2. ✅ Triggered re-install via `systemd-run --unit=livos-fresh-install ... /tmp/livos-install-v2.sh` (3rd-run idempotent — most steps skip).
3. ⚠️ FIRST RUN INCOMPLETE: helper's hard-coded `${_DLD_LIVOS_DIR}/scripts/install/seeds/mcp-servers.json` path didn't exist on disk because `_dld_clone_source` only rsyncs `livos/` subtree to `/opt/livos/`, not the repo-root `scripts/` directory. Helper skip-softed with `info "Seed file not found"` — Redis stayed empty.
4. ✅ **109-02 hotfix `0d428c58`**: changed helper to multi-candidate seed lookup — `$(dirname "${BASH_SOURCE[0]}")/seeds/mcp-servers.json` FIRST (resolves to `/tmp/livos-fresh/scripts/install/seeds/`), then `${_DLD_LIVOS_DIR}/...` fallback. +1 regression assertion (TEST_PHASE_109 Assertion 4). Combined tests 195 → 196 PASS.
5. ✅ Triggered 2nd re-install — helper found seed via BASH_SOURCE path, substituted `__LIVOS_REDIS_URL__` with mainserver REDIS_URL (`HHTeKlXh...`), SET liv:mcp:config. Verification: `KEYS liv:mcp:*` returned `liv:mcp:config`; `GET liv:mcp:config | jq` showed both servers with substituted env.
6. ⚠️ SECOND RUN: luse spawned with `command: "tsx"` (Mini PC convention — tsx in shell PATH), but mainserver systemd-service context has no global tsx → user-reported "spawn tsx ENOENT" + luse stuck at "Connecting...".
7. ✅ **109-03 hotfix `891ab77c`**: seed file `luse.command` changed from `"tsx"` → `"/usr/bin/npx"`, args prepended `["tsx", ...]`. Mirrors livinityd's own `ExecStart=/usr/bin/npx tsx ...` pattern. Also fixed `_meta._note` cosmetic — text included literal `__LIVOS_REDIS_URL__` which was caught by sed substitution, rewrote to reference placeholder by name without literal underscores.
8. ✅ Manual Redis update on mainserver: pulled hot-fixed seed file via curl + raw GitHub URL, ran the same sed substitution as the helper, `redis-cli -x SET liv:mcp:config "$NEW_JSON"`, restarted `livos.service`.
9. ✅ User-confirmed: refreshed browser → AI Chat → MCP panel → luse status changed from "Connecting..." to ready (spawn tsx ENOENT resolved). sequential-thinking also reachable.

result: ✓ PASSED end-to-end 2026-05-13T19:35Z, luse MCP confirmed working by user

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None. Phase 109 is fully shipped + live-validated after 2 hotfix iterations (109-02 BASH_SOURCE fallback + 109-03 npx tsx command).

## Carry-forward notes

- **Phase 108 (App Store Local Mode) still required:** App Store UI still shows "Connect to Livinity Platform" — gate at `app-store-content.tsx:52` (`if (!apiKey) return <NoApiKeyMessage />`). API key save mutation calls `tunnelClient.connect()` which fails when Server5 platform pairing isn't set up. Phase 108 design: bypass API key entirely with local-mode catalog from `/opt/livos/data/app-stores/utopusc-livinity-apps-github-*` cache. Plan + ship next.
- **Mini PC seed compatibility concern (deferred):** Mini PC's own `liv:mcp:config` has `command: "tsx"` (works there because shell PATH has tsx). If we ever auto-update Mini PC's MCP config from this repo seed, it would change Mini PC's working command to `/usr/bin/npx tsx`. Currently Mini PC's MCP config is NOT auto-updated (the EXISTS gate protects it). If a future phase adds force-update semantics, Mini PC seed should be left untouched OR a version field added to distinguish seeds.
- **Sacred SHA invariant maintained:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved through all 6 Phase 109 commits (`4a9b2050..891ab77c`) including 109-02 + 109-03 hotfixes. Verified via `git hash-object` after each commit.
