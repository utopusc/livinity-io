# Mini PC Zero State — captured 2026-05-17 before Phase 144 UAT

This document records the **verified-clean** baseline of the Mini PC
(`bruce@10.69.31.68`) immediately after the full wipe ran on 2026-05-17. If
the wipe ever needs to be re-run (e.g., a UAT run goes sideways and you want
to start over), use `/tmp/mini-pc-full-wipe.sh` (still on the box, or
regenerate from the commands logged below).

## What was wiped

| Layer | Action |
|---|---|
| Services | Stopped livos, liv-core, liv-worker, liv-memory, cloudflared, caddy |
| Docker | `docker compose down -v` on every `/opt/livos/data/app-data/*/` project; removed n8n, code-server, auth, tor_proxy containers; pruned livos-tagged volumes |
| PostgreSQL | `DROP DATABASE livos; CREATE DATABASE livos OWNER livos;` |
| Redis | `EVAL` script deleted every `livos:*` + `liv:*` key |
| systemd | Removed `/etc/systemd/system/{livos,liv-core,liv-worker,liv-memory,cloudflared}.service` + the `.pre-140-fix` backup + `cloudflared-update.{service,timer}` |
| Caddy | `rm /etc/caddy/Caddyfile` |
| Source/data dirs | `rm -rf /opt/livos /opt/liv /opt/nexus /etc/livos /var/lib/livos` |
| Install cache | `rm -rf /tmp/livos-install-stage /tmp/livinity-update-* /tmp/livos-update-*.log` |
| Claude Code state | `rm -rf /root/.claude` + `find /home/bruce /root -name .credentials.json -delete` |
| Chrome profiles | Removed `/home/bruce/.config/{google-chrome,livos-chrome,chrome-master,master-chrome}` + matching `.cache/` dirs |
| WebApp launcher state | Removed `/home/bruce/.fluxbox`, `/home/bruce/.fehbg`, `/tmp/.X*-lock`, `/tmp/.X11-unix/X*` |

## What was preserved (the test surface)

| Layer | State |
|---|---|
| **Server5 (`45.137.194.102`)** | Untouched — socinity user row + CF tunnel `633ab1f5-3f10-4d62-a3a7-50d8eace247c` + `liv_k_phase140socinityRESET12` api key all still valid |
| **Cloudflare DNS for `*.livinity.io`** | Untouched — `socinity.livinity.io` CNAME still points at cfargotunnel.com |
| **System packages** | apt-installed packages preserved — `postgresql`, `redis-server`, `docker`, `caddy` (binaries) all still on disk; only LivOS-managed config + data were wiped |
| **`bruce` user account** | Account + home directory preserved (only `~/.config/{chrome,livos-chrome}` + `~/.cache/{chrome}` + `~/.fluxbox` subdirs removed) |
| **ZeroTier networking** | Untouched — Mini PC still reachable at `10.69.31.68` |

## Verification (snapshot taken immediately after wipe)

```
===SERVICES (all should be not-found / inactive)===
  livos: inactive / not-found
  liv-core: inactive / not-found
  liv-worker: inactive / not-found
  liv-memory: inactive / not-found
  cloudflared: inactive / not-found
===DIRS (all should fail)===
  /opt/livos: No such file or directory
  /opt/liv: No such file or directory
  /opt/nexus: No such file or directory
  /etc/livos: No such file or directory
  /var/lib/livos: No such file or directory
===PG livos schema (should be empty)===
Did not find any relations.
===Chrome profiles (should be gone)===
ls: cannot access /home/bruce/.config/google-chrome: No such file or directory
ls: cannot access /home/bruce/.config/livos-chrome: No such file or directory
===Claude state (should be gone)===
ls: cannot access /root/.claude: No such file or directory
===Docker containers (should be 0 livos apps)===
(empty)
===Pre-existing-baseline (system pkgs untouched)===
caddy: inactive          ← stopped because Caddyfile is gone; binary still present
postgresql: active       ← system pkg
redis-server: active     ← system pkg
docker: active           ← system pkg
```

## Repo HEAD at the time of wipe

```
7b0d11e7 feat(143/portal-rename): wire-level Hybrid → Portal sweep + dead-file cleanup
```

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across every
commit up to this point.
