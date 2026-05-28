# Phase 243 Plan 04 — Mini PC Deploy Log

**Started:** 2026-05-28 (autonomous mode `/gsd-autonomous --from 240`)
**Operator:** Claude autonomous executor (Opus 4.7), `soru sorma` policy
**Target:** Mini PC `bruce@10.69.31.68` (ONLY LivOS deployment that matters)
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (git blob) / `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` (file SHA-256)

---

## Pre-Deploy State

**Developer machine:**
- `git status` clean (modulo STATE.md + ROADMAP.md unstaged edits — finalized in Task 4)
- 23 unpushed commits → pushed to `origin/master` in one `git push` (no force)
- `PRE_DEPLOY_SHA` = `774755c3af06b7b2c1676f62574d70dc6303fc41`
- Sacred git blob SHA verify: `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✅ MATCH
- File SHA-256 (dev disk): `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` ✅ MATCH

**Mini PC (pre-`update.sh`):**

| Service | Status |
|---|---|
| livos | active |
| liv-core | active |
| liv-worker | active |
| liv-memory | active |
| caddy | active |

- Sacred SHA on disk (pre): `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` ✅ MATCH
- `@livos_terminal_ws` count in `/etc/caddy/Caddyfile`: **0** (expected — new matcher not yet deployed)
- `@liv_ws` count: **2** (Phase 237 baseline preserved)

---

## Deploy Run (`sudo bash /opt/livos/update.sh`)

**Exit code:** 0 (`update.sh` reported `LivOS updated successfully!`)
**Deployed SHA recorded by `update.sh`:** `774755c` (matches dev HEAD `774755c3af06b7b2c1676f62574d70dc6303fc41`)

**Build/install observations:**
- `pnpm install` completed in ~10s with pre-existing peer-dep warnings (react-leaflet/vitest/@react-three/etc. — all unrelated to Phase 243).
- Ignored-build-scripts warning for `@google/genai`, `koffi`, `openclaw`, `tree-sitter-bash`, `workerd` — pre-existing, unrelated.
- All 4 services restarted cleanly (livos, liv-core, liv-worker, liv-memory) + liv-assistant probe at `127.0.0.1:3020/api/auth/status` returned 200/204.
- `livos-app-liv-ai`, `liv-claw-gateway`, `liv-assistant` systemd units reported "already byte-identical" (no churn).

**L-243-A node-pty resolution:** **PRE-EXISTING (no escape hatch fired).**
- `pnpm install` on Ubuntu picked up `node-pty@1.1.0` without any native-build failure. Mini PC has prebuilt linux-x64 binaries available; no need to swap to `node-pty-prebuilt-multiarch`.
- pnpm store also resolved `@lydell+node-pty@1.2.0-beta.12` + `@lydell+node-pty-linux-x64@1.2.0-beta.12` as transitive (different from livinityd's direct dep; harmless coexistence).

**L-243-A documented fallback: NOT EXERCISED** — keep noted for v44+ in case Mini PC's build chain regresses.

---

## Post-Deploy State

| Service | Status |
|---|---|
| livos | active |
| liv-core | active |
| liv-worker | active |
| liv-memory | active |
| caddy | active |
| liv-assistant | active |

**Caddy delta:**

| Matcher | Pre | Post | Note |
|---|---|---|---|
| `@livos_terminal_ws` | 0 | **2** | matcher + handle line in active site block (`http://bruce.livinity.io`); multi-user wildcard / apex `:80` fallback NOT active on this single-user Mini PC, so only one emit site materializes — expected behavior |
| `@liv_ws` | 2 | **2** | Phase 237 baseline preserved (no regression) |

**Caddyfile body verification (sed `48,75p` from Caddyfile):**
```caddy
@livos_terminal_ws path /livos/terminal/ws
handle @livos_terminal_ws {
    reverse_proxy 127.0.0.1:8080 {
        header_down -X-Frame-Options
        header_down -Content-Security-Policy
    flush_interval -1
    transport http {
        versions 1.1
    }
    }
}
```

Checks:
- Path matcher exact: `/livos/terminal/ws` ✅
- Backend `127.0.0.1:8080` (livinityd, NOT `:3020` AionUi) ✅ L-243-C
- `flush_interval -1` + `transport http versions 1.1` (RFC 6455 WS upgrade) ✅
- `-X-Frame-Options` + `-Content-Security-Policy` header strip ✅
- NO `header_regexp Referer` (L-243-C unconditional matcher) ✅
- Block ordered BEFORE `@liv` and BEFORE catch-all `handle { }` ✅

**Sacred SHA on disk (post):** `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` ✅ MATCH (unchanged through deploy)

**pnpm store new deps:**
- `node-pty@1.1.0` ✅
- `@xterm+addon-web-links@0.11.0_@xterm+xterm@5.5.0` ✅

**journalctl `livos.service` (last 30 lines around restart):**
- All Phase 196 / 199 / 201-207 / 234 / 239 / 240 routers wired
- Phase 207 R6 periodic bridge refresher armed (intervalMs=1800000)
- `[scheduler] Scheduler started — 3 job(s) registered`
- No fatal errors in the new `pty-terminal` logger scope (no errors at all in the boot section)

**Single noted oddity (NOT a 243 issue, pre-existing):**
- `[presence] tunnel_connections insert HTTP 500` — pre-existing Supabase realtime presence churn (per `feedback_minipc_is_owncloud_primary.md` UNIQUE constraint; mainserver/test boxes 503 by design when Mini PC owns the tunnel). Unrelated to Phase 243.

**Commit:** `docs(243-04): Mini PC deploy log — Task 1` (see end of this log for hash)

---

## Flag Flip + WS Reach Smoke (Task 2)

(filled in by Task 2)

---

## UAT Outcomes (Task 3)

(filled in by Task 3)

---
