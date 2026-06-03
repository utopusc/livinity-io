# 257-07 — Integration / Deploy — SUMMARY

**Status:** DEPLOYED to Mini PC (SHA `8da7140`). SC-C (LIVOS-015) live-proven; all other findings deployed + code/unit-verified. Full transcript: `257-DEPLOY-LOG.md`.

## What happened
- Pushed Phase 257 (25 commits + a HEAD-consistency fix for the 256 TLS seam) to `origin/master`.
- Pre-deploy gate GREEN (liv-core build; 122 livinityd vitest; cred-egress 11/11).
- `update.sh` ×1 on the Mini PC (256 already installed the OS deps). Commit-pin warned-and-proceeded.

## Live-proven
- **SC-C / LIVOS-015** — livinityd now binds `127.0.0.1:8080` (LAN reach removed); loopback → HTTP 200 (Caddy/public path preserved); UFW deny 8080 applied. The riskiest change, confirmed non-breaking.

## Deployed + code/unit-verified (interactive/operator-walk for full live)
WS-A (005/006/023/028 — warm-migration = no forced re-login), WS-B (011/012/026/040), WS-C SSRF (024/038), WS-D luse (010 — needs `liv-assistant` restart + `pkill` of luse MCP procs to load), WS-E secret hygiene (020/021/030/031/032/033/034 — git-grep clean, DEK independent), WS-F (027/035/036/039 + 029 verify-closed).

## Operator out-of-band action (REQUIRED)
Rotate the **Server5** `platform` DB password + relay Redis password (the committed `LivPlatform2024` + relay secret were removed from source → treat as compromised). Server5 is off-limits for our deploy; only the operator can rotate them there.

## Fast-follow (later pass)
Sibling JWT-keyed cred stores (`git-credentials.ts`, `stack-secrets.ts`, `backup-secrets.ts`); `sandbox.ts usable` userns runtime-probe (from 256).

## Result
After Phase 256 + 257, every audit finding is **closed, accepted, or fast-follow-noted**. Services healthy; agent autonomy + curated apps preserved.
