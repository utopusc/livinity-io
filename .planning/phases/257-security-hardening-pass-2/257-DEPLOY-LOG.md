# Phase 257 — Deploy Log (257-07)

**Date:** 2026-06-03
**Target:** Mini PC `bruce@10.69.31.68` (only)
**Deployed SHA:** `8da7140` (HEAD; single `update.sh` run — 256 already installed bubblewrap/tinyproxy/CA, 257 added no new apt deps)

## Pre-deploy gate — GREEN
- liv-core `tsc` build clean.
- livinityd vitest: is-authenticated + caddy + approvals = **122 passed**; cred-egress-proxy node:test **11/11** (after fixing a HEAD inconsistency — see below).
- Per-plan suites all green during execution (257-01..06).

## HEAD-consistency fix caught pre-deploy
The 256-02-tls TLS-MITM **test** was committed referencing `opts.forwardRequest`, but the matching **source** seam was left uncommitted in the working tree → HEAD's `cred-egress-proxy.test.ts` referenced a seam the committed source lacked (broken at HEAD; production unaffected — the default is a real `https.request`). Committed the seam (`fix(256-02-tls)`) so source+test are consistent and green at HEAD before deploying.

## Deploy
`sudo bash /opt/livos/update.sh` ×1 → pull HEAD, rebuild liv-core, restart services. Commit-pin guard (LIVOS-011) correctly **warned-and-proceeded** (no pin shipped → non-fatal). Pre-existing unrelated warnings only: VAAPI userspace, claw-client `next build` (liv-claw-gateway still active).

## Live verification (highest-value / highest-risk first)
- **SC-C (LIVOS-015) ✅ live** — `ss -tlnp` shows livinityd bound to **`127.0.0.1:8080`** (was `0.0.0.0`); off-host LAN reach removed. Loopback `curl http://127.0.0.1:8080/` → **HTTP 200**, so the Caddy public path + internal liv-core↔livinityd calls are preserved (no access breakage). UFW `deny 8080/tcp` applied (belt-and-suspenders; the `deploy-livinityd.sh` firewall step is fresh-install-only).
- All services active: livos · liv-core · liv-worker · liv-memory · liv-assistant · livos-egress.

## Deployed + code/unit-verified (live confirmation via operator walk where interactive)
- **WS-A (005/006/023/028)** — sessions/jti revocation, per-user file isolation, host-only session cookie, aud/iss + warm-migrated proxy secret. is-authenticated/jwt suites green; warm-migration means **no forced re-login** (live PTY cookies keep working). Live walk: change a password → old token rejected; confirm terminal session survives.
- **WS-B (011/012/026/040)** — update.sh commit-pin (opt-in-strict), marketplace-only skill-import gate (builtin still loads), installer integrity, apt-on-missing. Live walk: ship an `EXPECTED_RELEASE`/`LIVOS_EXPECTED_SHA` pin to flip 011 fail-closed.
- **WS-C (024/038)** — addRepository SSRF validator + MCP DNS-rebind guard (in addition to the live-proven 015).
- **WS-D (010)** — luse `computer_read_file` denies `~/.claude`/`.gemini`/`.ssh`/`.config` etc. **Apply gotcha:** luse MCP servers are per-session `tsx` processes — `systemctl restart liv-assistant` + `pkill -f "computer-use/mcp/server.ts"` to load the new tools.ts on the box.
- **WS-E (020/021/030/031/032/033/034)** — secret hygiene; `git grep` for default passwords is **zero source hits**; at-rest DEK now independent of the JWT secret (lazy re-key, existing vault creds keep decrypting). **OPERATOR OUT-OF-BAND ACTION:** `platform/web` + relay run on Server5 (off-limits) — the committed `LivPlatform2024` + relay Redis password were removed from source but **must be rotated live on Server5** (treat as compromised) + the new `DATABASE_URL`/`REDIS_URL` set there.
- **WS-F (027/035/036/039 + 029 verify)** — approvals admin-gate, Caddyfile bearer charset-validation, exact container-name match, share-password 0600; LIVOS-029 confirmed already closed by 256-04.

## Skipped (already closed)
- **LIVOS-029** — memory fail-open already closed by 256-04 (`requireApiKey` 503 on unset key). Verify-only, no code.

## Fast-follow noted (not in scope)
- Sibling cred stores still JWT-keyed (`git-credentials.ts`, `stack-secrets.ts`, `scheduler/backup-secrets.ts`) — sweep candidate for a later pass (same class as LIVOS-033).
- `sandbox.ts usable` runtime-probe (carried from 256 DEPLOY-LOG).

## Verdict
Phase 257 **DEPLOYED + live** (SHA `8da7140`). The network-exposure fix (LIVOS-015) is live-proven without breaking access; all other findings are deployed + code/unit-verified. Remaining audit findings after 256+257: only the operator-accepted items (docker.sock curated, Portainer builtin) + the fast-follow sweep. **Operator action: rotate Server5 platform/relay secrets out of band.**
