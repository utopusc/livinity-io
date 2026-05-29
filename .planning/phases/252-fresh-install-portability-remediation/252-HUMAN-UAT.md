---
status: partial
phase: 252-fresh-install-portability-remediation
source: [252-VERIFICATION.md]
started: 2026-05-29
updated: 2026-05-29
---

## Current Test

[awaiting human testing]

## Tests

### 1. Fresh-install smoke test on a clean VPS
expected: Running `curl -fsSL https://livinity.io/install.sh | sudo bash -s <liv_k_key>` on a clean Ubuntu 24.04 server brings up the full stack with NO manual steps: apt packages (`xserver-xephyr`, `xterm`, `gnome-terminal`, `x11-utils`, `xclip`, `wmctrl`) installed; `livos:v43:terminal_panel` seeded; `liv:mcp:config` populated as a HASH with a REAL `DISPLAY` value (`:1`, NOT the literal `__LIVOS_DISPLAY__`); the UI terminal opens without a password prompt; no `REDIS_URL`/auth errors in the `liv-assistant` journal; Liv AI gets the luse computer-use MCP.
result: ISSUES — ran 2026-05-29 on a freshly-wiped Ubuntu 24.04.3 VPS (154.53.56.75 / vmi2892419), installer pulled the pushed 252 code from master (self-bootstrap got the updated helpers). The install ABORTED and the stack did NOT come up (livos=inactive, liv-core=inactive, caddy=failed). Root causes are all OUTSIDE Phase 252's R1–R16 scope (NEW fresh-install blockers — candidate for a follow-up remediation phase):
  1. **pnpm-lock.yaml drift** — root package.json `overrides: { zod: ^3.25.0 }` is not reflected in the committed lockfile → `pnpm install --frozen-lockfile` (install.sh default) fails with ERR_PNPM_LOCKFILE_CONFIG_MISMATCH, AND every subsequent `pnpm --filter <pkg> build` fails at pnpm 11's pre-run `runDepsStatusCheck` (not bypassable via --config.verifyDepsBeforeRun=false). The UI/stack cannot build → install aborts. PRIMARY blocker. Fix: regenerate pnpm-lock.yaml.
  2. **pnpm 11 ignored-builds** — `ERR_PNPM_IGNORED_BUILDS` (@google/genai, koffi, openclaw, tree-sitter-bash, workerd) makes `pnpm install` exit 1; install.sh treats the non-zero exit as fatal. Fix: add `pnpm.onlyBuiltDependencies` allowlist or make the installer tolerant.
  3. **Caddyfile `handle_path` two-matcher bug** — tunnel-mode Caddyfile generator emits `handle_path /liv-ai-app/liv-ai /liv-ai-app/liv-ai/* { ... }` (line 20); Caddy v2 `handle_path` takes exactly ONE matcher → `caddy validate` fails → caddy.service fails. (Confirms the documented memory: handle_path takes one matcher — use `@m path /a /b` + `handle` + `uri strip_prefix`.) Fix: split the matcher in the installer template.

  252 results that DID validate live: R10 `livos:v43:terminal_panel=true` seeded OK; the pushed 252 installer helpers were fetched from master. NOT validated (install died before reaching them): R1/R2 apt install, the deploy-livinityd `_dld_seed_mcp_servers` MCP seed (so `liv:mcp:config`=none — the WR-01 DISPLAY-substitution fix is UNVERIFIED live), PTY/terminal behavior.
  252-adjacent gap also surfaced: the install.sh INLINE Phase-109 MCP seed skips on curl|bash self-bootstrap because `scripts/install/seeds/mcp-servers.json` is NOT among the 9 bootstrapped helpers ("Seed file not found in any candidate path").

### 2. XDG_RUNTIME_DIR marker path after update.sh (Mini PC)
expected: After the next `update.sh` on the Mini PC, with a WebApp window active, the active-webapp-wid marker lives under `$XDG_RUNTIME_DIR/livos/` (e.g. `/run/user/<uid>/livos/`) — NOT under world-shared `/tmp/`. The luse temp workspace allowlist resolves under `$XDG_RUNTIME_DIR/luse-`.

result: [pending]

## Summary

total: 2
passed: 1
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

### G1 — pnpm-lock.yaml drift blocks fresh-install build (NEW, out of 252 scope)
status: failed
detail: root package.json `overrides: { zod: ^3.25.0 }` absent from committed pnpm-lock.yaml → frozen-lockfile install + pnpm-11 deps-status-check both fail → UI/stack build impossible → install aborts. Fix: regenerate + commit pnpm-lock.yaml.

### G2 — pnpm 11 ignored-builds makes install.sh treat pnpm as failed (NEW)
status: failed
detail: ERR_PNPM_IGNORED_BUILDS (@google/genai, koffi, openclaw, tree-sitter-bash, workerd) → exit 1. Fix: `pnpm.onlyBuiltDependencies` allowlist in package.json or installer tolerance.

### G3 — tunnel-mode Caddyfile handle_path two-matcher bug (NEW)
status: failed
detail: install.sh emits `handle_path /liv-ai-app/liv-ai /liv-ai-app/liv-ai/* { }` (2 matchers); Caddy v2 handle_path takes 1 → caddy validate + caddy.service fail. Fix: `@m path /liv-ai-app/liv-ai /liv-ai-app/liv-ai/*` + `handle @m` + `uri strip_prefix`.

### G4 — install.sh inline MCP seed skips on self-bootstrap (252-adjacent)
status: failed
detail: Phase-109 inline seed can't find `scripts/install/seeds/mcp-servers.json` (not among the 9 self-bootstrapped helpers). deploy-livinityd's GitHub-raw seed is the backstop but runs post-build (never reached). Fix: bootstrap the seed file too, or rely solely on the deploy-livinityd GitHub-raw seed.

## Resolution (2026-05-29, same session — live fix + reinstall on 154.53.56.75)

Test 1 re-run after fixing the blockers. **The fresh `curl|bash` install now COMPLETES and the stack is live + publicly reachable** (`https://hello.livinity.io/` HTTP 200 via CF tunnel; livinityd `:8080` HTTP 200; all services active; 22 MCP servers; **luse `DISPLAY=:1` — WR-01 validated LIVE, not the placeholder**; terminal_panel=true; apt xephyr/xterm/wmctrl/xclip installed; caddy validates).

Fixed in-repo + pushed (master): G1 pnpm overrides→workspace.yaml + lockfile regen (`cfa2d945`), G2 allowBuilds 5 pkgs (`cfa2d945`), G3 12 handle_path blocks (`cfa2d945`), G4 seed GitHub-raw fetch fallback (`cfa2d945`), G5 `find|head` `set -e` guard (`d16d41f1`, a 252-05-introduced bug), G6 @liv/core exclude test files (`1035ad33`).

STILL requires 2 manual stopgaps for full seamlessness (NOT yet in-repo — follow-up phase):
- **G7**: `chown -R bruce:bruce /opt/livos /opt/liv` (installer chowns to root by default; units run as bruce → CHDIR crash). Fix: default deploy owner to the desktop user.
- **G8**: `mkdir -p /opt/nexus && chown bruce:bruce /opt/nexus` (liv/core still defaults runtime paths to legacy `/opt/nexus/*`). Fix: change `/opt/nexus`→`/opt/liv` defaults in liv/packages/core/src/{logger,index,daemon,shell,subagent-manager}.ts.
- Minor: chown `/var/lib/livos` to bruce (pending-redis-keys drain EACCES, non-fatal).

## FINAL (attempt 6, from-scratch, ZERO manual steps) — Test 1 PASS

After fixing all 9 blockers (G1-G9, pushed to master), a from-scratch wipe + `curl|bash` install came up SEAMLESSLY: 0 install failures; all 6 services active with 0 restarts (livos, liv-core, liv-worker, liv-memory, caddy, cloudflared); `/opt/{livos,liv}` auto-owned by bruce; no `/opt/nexus`; local `:8080` + public `https://hello.livinity.io/` both HTTP 200; `liv:mcp:config` = 22 servers with luse `DISPLAY=:1` (WR-01 live). Fixes beyond G1-G4: G5 `find|head` set-e guard (`d16d41f1`), G6 @liv/core test-exclude (`1035ad33`), G7 deploy-owner=bruce + /var/lib/livos chown (`5d3f7a78`), G8 liv/core /opt/nexus->/opt/liv (`5d3f7a78`), G9 liv worker/memory/cli/mcp-server /opt/nexus->/opt/liv (`41aa2e97`).
