# Phase 218 — Context (post-/clear continuity)

## Operator's words verbatim (2026-05-26)

> "https://bolt-diy-bruce.livinity.io/ burasi saka gibi ama hala livos u aciyor saka gibi mk immich e tikliyorum https://immich-bruce.livinity.io/login?redirect=%2F burasida livos u aciyor??? MCP ler eklenmiyor files eklenmisti onu da kaldirdim ama WRONGTYPE Operation against a key holding the wrong kind of value simdi bunu diyor eklenmiyor immich i sildim geri yukledim masaustune tikliyorum hala ayni yere yonlendiriyor https://immich-bruce.livinity.io/login?redirect=%2F store dan open diyorum bu seferde buraya yonlendiriyor amk https://photos.bruce.livinity.io/ Her yer baska bir yere yonlendiriyor. Bir sikim yapmamissin acikcasi!!!"

Translation: nothing works end-to-end. Documentation is not a fix. Build the actual plumbing.

## Why the previous fixes weren't enough

Earlier in this session I shipped 7 fixes but they were all peripheral:
- ✅ MCP UI bug only fixed by one-time Redis migration — STRING re-creation path untouched, so deleting+re-adding regresses
- ✅ Subdomain dot→hyphen UI patched — but UI cache lingers, AND even with the right URL the Caddy gap means the subdomain doesn't resolve
- ✅ Tunnel persist + logout + drill-down + reprovision endpoint + install poller fix → cosmetic; the ACTUAL "install app and open it" flow has been broken the whole time

What actually broke the user-visible flow:

1. **`/etc/caddy/Caddyfile` is static.** install.sh wrote a 33-line template; livinityd was supposed to dynamically regenerate it, but no code path calls `writeCaddyfile()` from `installForUser()`. Result: app installs (docker container up) but Caddy doesn't proxy to it → request falls to catch-all `127.0.0.1:8080` (livinityd) → LivOS UI shows its login.
2. **`user_app_subdomains` doesn't exist on Mini PC.** Only on Supabase. So even if Caddyfile regen exists, it has no data to read.
3. **Orphan Docker containers.** `bolt-diy` and `immich` containers up but no `user_app_instances` row → invisible to admin UI AND to caddy state derivation.
4. **MCP STRING writer somewhere.** Re-creates the STRING after operator deletes/re-adds.

The plan in 218-PLAN.md addresses all 4 + the small cache-bust UI gap.

## Sacred SHA invariant

`liv/packages/core/src/sdk-agent-runner.ts` MUST stay at `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. Pre-commit hook enforces; verify after every commit.

## Mini PC access (for execute-phase)

- SSH: `/c/Windows/System32/OpenSSH/ssh.exe -i /c/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68`
- Redis password: `21GER9gzcSEkIXQYsnyXvntPdLJvQWTE`
- DATABASE_URL on Mini PC: `sudo grep DATABASE_URL /opt/livos/.env`
- API key: `liv_k_lF6WvENQcoYRTaoJhWWU` (admin/operator)
- Deployed SHA file: `/opt/livos/.deployed-sha`
- Update flow: `sudo bash /opt/livos/update.sh` (livinityd-spawned now also works since 2026-05-26 fix `bb3e7a20`).

## Pre-existing v41 state when 218 starts

- All v41 phases (209-217) shipped or CODE-COMPLETE.
- 7 carries closed this session (logout, tunnel-persist, MCP HASH migration (live-only), subdomain UI hyphen, install-poller user-resolver, P211-ADMIN-GATE+P212-LEGACY-ADMIN-UNIFY, P213-USERS-DRILLDOWN, P214-STORE-SEARCH, P216-REPROVISION-ENDPOINT, P210-BUG-D, P213-NON-ADMIN-REDIRECT-CLIENT, UI update sudo wrap).
- Sacred SHA preserved across all commits this session.
- Vercel Firewall: Bot Protection + Attack Mode both OFF (operator manually disabled per 2026-05-26 incident).

## Tone-of-voice note for next session

Operator is frustrated. Don't repeat the "I documented it" pattern. Each task in 218-PLAN.md must produce a verifiable ACTION (file changed, commit, deploy, curl proof). No "filed as carry" outputs for tasks T1–T8.
