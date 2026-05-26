# Phase 219 — Context (post-/clear continuity)

## Operator's words verbatim (2026-05-26, post-Phase-218 ship)

> "Bazi mcp serverlari ekleyemiyorum! Sadece Filesystem ekli onuda sanirim sen ekledin lutfen fixle bu kisminda! sag tikla settings yapiyorum Settings File Browser is connected to these apps Public Access filebrowser-bruce.livinity.io Port 8070 DNS pending Change subdomain Remove DNS PENDING diyor surekli bu kismi duzelt. Change domain diyorum Public Access files .bruce.livinity.io boyle gosteriyor ama files.bruce.livinity.io da yayimda degil konumu normalde boyle https://filebrowser-bruce.livinity.io/login?redirect=/files/ {filebrowser}-bruce.livinity.io diye gostermesi lazim {} icindeki kismi degistirebilmeliyim sadece. Ayrica AI kisminda MCP leri guncelle a dan z ye ve bir kac tane yeni local mcp ekle! AI kisminda Skills bolumude olsun. OpenClaw icin yapilmis bir market varsa orayi kopyalayabilirsin gsd plan olustur arindan ben clear cekip baslatayim plani"

Translation summary:
- Some MCP servers can't be added — only filesystem works (the one I added during T6 inline migration). Fix the add flow.
- DNS PENDING status sticks forever on file-browser's Public Access toggle.
- Change subdomain dialog shows raw `files.bruce.livinity.io` (sub-of-sub legacy shape). Should be `[filebrowser]-bruce.livinity.io` template — only the slug part editable.
- MCP catalog out of date — refresh A-Z, add new local-to-LivOS MCPs.
- Add a Skills section to AI settings — claude-code-templates / aitmpl.com style. Copy from OpenClaw's market if there is one.

## Pre-existing state (Phase 218 ship snapshot)

- 15 commits in Phase 218 chain, sacred SHA preserved through every one.
- Master branch deployed to Mini PC. Caddyfile clean: 7 host blocks (apex + 5 apps + native pc).
- `user_app_instances` table: 4 rows (adguard-home, immich, n8n, open-webui). Linkwarden was just installed via the legacy single-user path; T1's regen unification fix landed in commit `a482d420` to prevent it from wiping other blocks.
- Per-app URLs work: `n8n-bruce.livinity.io`, `open-webui-bruce.livinity.io` → 200. `adguard-home-bruce.livinity.io` → AdGuard UI. `immich-bruce.livinity.io` + `linkwarden-bruce.livinity.io` → 502 (container-internal, NOT routing — `CARRY-V41-IMMICH-HEALTHCHECK` + new linkwarden env-var carry).
- Redis `liv:mcp:config` = HASH primitive (Phase 218 T6 unification). Only field: `filesystem` (operator's test from earlier UAT).
- Cloudflare Bot Fight Mode + Under Attack Mode disabled by operator during 218 UAT — `bruce.livinity.io` browser flow works.

## Why this isn't more 218 work

Phase 218 closed the **routing reliability** loop — install lands → Caddyfile updates → subdomain resolves. The operator's NEW complaints are **product-level UX gaps + missing features**:
- MCP add dialog is technically wired but UX-broken (T1).
- DNS pending shows because the status read or mint flow has a separate bug — not Caddyfile gap (T4).
- Subdomain dialog is a UI-only redesign (T5).
- MCP catalog + Skills are net-new feature surfaces (T2, T3, T6, T7).

Hence the new phase rather than a 218 amendment.

## Sacred SHA invariant

`liv/packages/core/src/sdk-agent-runner.ts` MUST stay at `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. Pre-commit hook enforces; verify after every commit.

## Mini PC access (for execute-phase)

- SSH: `/c/Windows/System32/OpenSSH/ssh.exe -i /c/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68`
- Redis password: read from `/opt/livos/.env` `REDIS_URL` (URL-decoded)
- DATABASE_URL: `sudo grep DATABASE_URL /opt/livos/.env`
- Deployed SHA file: `/opt/livos/.deployed-sha`
- Update flow: `sudo bash /opt/livos/update.sh`
- Current DB user: `bruce` (renamed from `bruce-oz` during 218 UAT)

## Tone-of-voice note for next session

Operator just sat through 5 rounds of UAT fixes (218 caught EACCES, handle_path syntax, cloudflared detection, double-suffix URL, divergent regen paths). Each task in 219 must ship a verifiable result, NOT "filed as carry". Reuse the 218 discipline: small commits, sacred SHA preserved, push, deploy, verify, next.

Avoid claiming "this fixes everything" when 219's surface is bigger. If T6 (skills) needs more time, ship T1-T5 first as the bug-fix half and reframe T6-T7 as a follow-on.

## What to read first on resume

1. This file (219-CONTEXT.md).
2. `.planning/phases/219-mcp-skills-subdomain-ux/219-PLAN.md` — task list + acceptance criteria.
3. `livos/packages/livinityd/source/modules/server/trpc/mcp-config-router.ts` — the canonical MCP CRUD surface; T1 starts here.
4. `scripts/install/seeds/mcp-servers.json` — current 2-entry seed; T2 expands this.
5. `livos/packages/livinityd/source/modules/domain/routes.ts:setAppSubdomain` — T4 + T5 start here.
