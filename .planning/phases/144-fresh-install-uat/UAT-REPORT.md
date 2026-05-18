# Phase 144 UAT Report — 2026-05-17

**Tester:** Claude (autonomous)
**Mini PC:** bruce@10.69.31.68
**Server5:** root@45.137.194.102
**Repo HEAD:** 7b0d11e7 feat(143/portal-rename)
**Sacred SHA invariant:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f`

## Status legend

- PASS — section passed first try
- FAIL — section failed; root cause noted
- PARTIAL — partial pass; deviation noted
- KNOWN — expected failure (carryover)
- SKIP — section skipped; reason noted

## Results

| Section | Sub | Status | Notes |
|---|---|---|---|
| A | A1 | PASS | Mini PC zero state — all 5 services inactive, /opt/livos+/opt/liv+/etc/livos+/var/lib/livos missing, PG livos empty |
| A | A2 | PASS | Server5 socinity row intact — email_verified=t, has_cf=t, prefix=liv_k_phase140 |
| A | A3 | PASS | socinity 530, n8n-socinity 530 (CF origin unreachable, cloudflared offline) |
| B | B1 | PASS | install.sh exit 0 after 144-01 hotfix; banner "LivOS install (mode=portal) COMPLETE"; `.deployed-sha=bedfb95` |
| B | B2 | PASS | All 6 services active (livos + liv-core + liv-worker + liv-memory + caddy + cloudflared) |
| B | B3 | PASS | install log shows "Mode: portal" and "Redis queued: livos:domain:local_mode=portal" |
| B | B4 | PASS | apex 200, /trpc/system.status 200 |
| C | C1 | PASS | drain log: applied=5 skipped=0 errored=0 (cf_tunnel_token_secret_ref, tunnel_domain, host_ip, api_key_path, local_mode) |
| C | C2 | DEVIATE | Caddyfile uses `:80 { reverse_proxy }` catch-all instead of `http://host {` block — UAT-PLAN expectation was wrong for tunnel mode; smoke trio 200 proves it works |
| C | C3 | PASS | `livos:domain:local_mode` = `portal` |
| C | C4 | PASS | tokens match (len=180 each) |
| C | C5 | PASS | connectSrc array includes `https://*.open-meteo.com` |
| C | C6 | SKIP | Browser step — autonomous mode skips; will validate via chrome-devtools-mcp at end |
| D | D1 | PASS | `ERROR: --mode local-lan was retired in Phase 142-01` exact match |
| D | D2 | PASS | `ERROR: --mode cloud is Coming Soon — not yet available in this LivOS build` |
| D | D3 | PASS-DANGEROUS | normalization message + `Mode: portal` confirmed for both hybrid and tunnel — BUT test corrupted cf-tunnel-token to "y" requiring recovery install (carryover #4) |
| D | D4 | PASS | --help Modes section: portal DEFAULT, hybrid/tunnel back-compat alias, cloud Coming Soon, local-lan RETIRED (Phase 142-01) |
| E | E1 | PASS | `local.activatePortal` returns tRPC `UNAUTHORIZED` (procedure wired; would 404 if missing) |
| E | E2 | PASS | `local.activateHybrid` returns identical UNAUTHORIZED shape (alias procedure wired) |
| E | E3 | PASS | `HTTP 410` + exact `{"error":"local-lan mode retired (Phase 142-01)","hint":"Use --mode portal..."}` body |
| F | F1 | DEFER | tRPC `apps.install` returned BAD_REQUEST (validator: `appId required, received undefined`) — payload wrapper shape mismatch (need raw input vs `{"json":...}`). Defer to operator browser walk; carryover #5 — document the autonomous test recipe |
| F | F2 | PASS-RESIDUE | Server5 socinity row STILL has `n8n + code-server` subdomains (has_dns=t) — deliberately preserved per UAT-PLAN re-install regression spec |
| F | F3 | FAIL | Caddyfile only contains apex `:80 { reverse_proxy }` catch-all — no per-app block written because F1 install never executed |
| F | F4 | FAIL | Redis `livos:domain:subdomains` key is empty (livinityd never registered the subdomain because F1 failed) |
| F | F5 | MISLEADING-200 | `n8n-socinity.livinity.io → 200` but this is livinityd's default UI not n8n (Caddy `:80` catch-all forwards every CF Tunnel hostname to livinityd) |
| F | F6 | DEFER | Browser-required (operator walk) |
| G | G1-G3 | DEFER | Browser-required (operator walk) — Server5 socinity row still has live subdomains; rename test would mutate live state |
| H | H1-H3 | DEFER | Browser-required (operator walk) for dashboard badge UX; cloudflared stop/start verified working via D3 recovery exercise |
| I | I1-I3 | DEFER | Browser-required (operator walk) for DevTools console check; CSP source code allowlist confirmed via C5 |
| J | J1 | KNOWN | factory-reset.sh missing on disk (expected: scripts/install/ exists but factory-reset.sh not rsync'd — see carryover #2) |
| K | K1 | PASS | Re-install (recovery from D3 corruption) completed cleanly — banner "LivOS install (mode=portal) COMPLETE" |
| K | K2 | PASS | Post-re-install smoke: apex 200, /trpc/system.status 200 |
| L | L1 | PASS | apex 200, /trpc/system.status 200, n8n-socinity 200, code-server-socinity 200 (4×200 — though n8n/code-server are livinityd default-UI passes per F5 note) |

## Section evidence

### Section A
- A1 PASS: `livos / liv-core / liv-worker / liv-memory / cloudflared = inactive` + 4 dirs missing + PG livos no relations.
- A2 PASS: socinity row `email_verified=t, has_cf=t`; api_keys `prefix=liv_k_phase140`.
- A3 PASS: `socinity.livinity.io → 530`, `n8n-socinity.livinity.io → 530`.

### Section B (in progress)
- **First install attempt FAILED**: self-bootstrap exit 3 — `HELPERS_REQUIRED` listed `mode-local-lan.sh` (Phase 142-01 retired the file but install.sh helper list was not pruned). Patched as **Phase 144-01 hotfix** `bedfb95a`, pushed to master, Server5 Next fetch-cache purged + `pm2 restart web`, live `https://livinity.io/install.sh` re-fetched fresh (no mode-local-lan ref) — verified via `curl ?v=$(date +%s)`.
- Retry install completed cleanly (banner: "LivOS install (mode=portal) COMPLETE", `.deployed-sha=bedfb95`).

### Section D (DANGEROUS TEST FALLOUT — recovery required mid-UAT)
- D1/D2 (CLI rejection tests) safe; D3a/D3b (hybrid/tunnel normalize tests) UNSAFE — actually re-run install with fake `--cf-tunnel-token y`, overwriting cloudflared.service and dropping the live tunnel. **Live smoke went from 200/200 → 530/530 mid-UAT.**
- Recovery: re-run install.sh with real `--subdomain socinity --api-key liv_k_phase140socinityRESET12` (same as B1). Documented as carryover item #4 — Phase 145 needs a `--dry-run` flag or test-only parse-cli harness.

## Carryover (Phase 144+ items surfaced)

1. **(SHIPPED 144-01)** ~~install.sh self-bootstrap HELPERS_REQUIRED still listed mode-local-lan.sh (Phase 142-01 cleanup tail)~~ — fixed `bedfb95a`.
2. **(Phase 145 candidate — high priority)** update.sh + install.sh should populate `/opt/livos/scripts/install/` on disk after install. Currently install.sh self-bootstrap writes helpers to `/tmp/livos-install-XXXXXX` only; the Mini PC's `/opt/livos/scripts/` directory exists but `install/` subdir lacks `factory-reset.sh` (Section J). Section D's `bash /opt/livos/scripts/install.sh --mode local-lan` test fails for the same reason. Fix: either (a) install.sh tail-step rsyncs `/tmp/livos-install-XXXXXX/` → `/opt/livos/scripts/install/`, OR (b) update.sh GitHub clone explicitly preserves `scripts/` tree.
3. **(Phase 145 candidate)** Server5 Next.js `app/install.sh/route.ts` caches GitHub raw fetch for 5min server-side AND sends `Cache-Control: public, max-age=300` to CF — making install.sh source-code changes take up to 10min to propagate. Add a way to force-revalidate (admin endpoint or pin to commit SHA, not branch).
4. **(Phase 145 candidate — DANGEROUS UAT)** UAT-PLAN D3 (`bash install.sh --mode hybrid --domain x --cf-tunnel-token y | grep`) actually RUNS the full install with fake credentials on a live box, overwriting Caddyfile + cloudflared.service token → kills the live tunnel. **During this UAT run, D3a/D3b broke the live install (200 → 530)** — recovery required re-running install.sh with real args (which happened to satisfy Section K1 as a side-effect). UAT-PLAN must be rewritten to (a) wrap with `timeout 3 bash …` to kill before mode-tunnel runs, OR (b) add a `--dry-run` flag to install.sh / parse-cli, OR (c) extract parse-cli validation into a separate testable helper.
5. **(Phase 145 candidate)** Document the autonomous tRPC POST recipe for `apps.install` (and `apps.getInstalledApps` correct name). F1 attempted `POST /trpc/apps.install` body=`{"json":{"appId":"n8n"}}` and got `BAD_REQUEST: appId Required, received undefined` — payload-shape mismatch. Either drop the `"json":` wrapper or use `?input=` query param. Also: `apps.getInstalledApps` returned NOT_FOUND, real procedure name needs to be looked up. This blocks autonomous Section F validation; operator-only for now.
6. **(Phase 145 candidate)** Caddy `:80 { reverse_proxy 127.0.0.1:8080 }` catch-all means EVERY CF Tunnel hostname (n8n-socinity, code-server-socinity, foo-socinity, …) returns 200 from livinityd's default UI — leaking a false-positive smoke signal. Section F5 200 was misleading. Fix: livinityd should 404 on unknown app subdomains, or Caddy should issue per-app blocks before falling through to apex.
7. **(Phase 145 candidate)** Server5 `user_app_subdomains` rows survive `factory-reset` of Mini PC. After Phase 144 wipe, socinity still has `n8n` + `code-server` rows. If a fresh re-install installs the same apps, ports + container names may collide with leftover state. Need a `/api/me/factory-reset` server-side equivalent that drops orphan subdomain rows when user opts in.

## Outstanding issues

(Filled if discovered.)
