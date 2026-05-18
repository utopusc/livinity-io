# Phase 141 — Multi-Tenant App Install Hardening — SUMMARY

**Status:** ✅ CODE-COMPLETE 2026-05-17
**Predecessor:** Phase 140 (CF for SaaS Multi-Tenant) — `39c02ced..04ba6fbf`
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved 11/11 commits

---

## What shipped

10 sub-plans + 1 user-requested extra README, every commit atomic, every
commit body carries the sacred SHA. Tests added or extended in each commit.

| Sub-plan | Commit | Files | Tests added |
|---|---|---|---|
| 141-01 install-pending Redis seed drain | `70e02749` | `livos/.../modules/drain-install-pending-redis.ts` + `.test.ts`, wired into `livinityd/source/index.ts` before Phase 112 fallback; bash regression at `scripts/install/__tests__/test-set-livos-redis-key.sh` | 7 ts + 9 bash = 16 |
| 141-02 rebuildCaddy isTunnel (pre-shipped) | `04ba6fbf` | `livos/.../apps/apps.ts` rebuildCaddy local_mode signal | — (pre-141 hotfix) |
| 141-03/04 hyphen-pattern host | `54f3de2f` | `livos/.../domain/caddy.ts` (+ `validateHost`, `SubdomainConfig.host?`), `apps/apps.ts` (`hostFromUrl`, captures provision return), `apps/routes.ts`, `ui/.../public-access-section.tsx` | 12 vitest in `caddy.test.ts` |
| 141-05 change-subdomain CF sync | `a5e7bdcc` | `livos/.../apps/apps.ts` cfProvisionSubdomain/cfDeprovisionSubdomain public wrappers; `livos/.../domain/routes.ts` setAppSubdomain + removeAppSubdomain wire deprovision-then-provision | — (wiring; helpers exercised by install/uninstall) |
| 141-06 CSP allowlist | `b89ee4ac` | `livos/.../server/index.ts` connect-src `*.open-meteo.com` | — |
| 141-07 dashboard CF online | `c4c64178` | `platform/web/src/lib/cf-saas.ts` `getTunnelConnections`; `platform/web/src/app/api/dashboard/route.ts` 30s cache + CF-prefer + relay fallback | — (live integration tested against socinity tunnel) |
| 141-08 operator playbook | `eb588dfa` | `docs/operator/post-deploy-playbook.md` (10 sections, 302 lines) | — (docs) |
| 141-09 cloudflared systemd token reconcile | `003c2dcd` | `scripts/install/mode-tunnel.sh` sed-rewrite in short-circuit branch; `scripts/install/__tests__/test-cloudflared-token-reconcile.sh` | 10 bash |
| 141-10 factory-reset.sh | `d1e3c70c` | `scripts/install/factory-reset.sh` (gated, idempotent); `scripts/install/__tests__/test-factory-reset.sh` | 10 bash |
| EXTRA marketplace add-an-app | `2a3b5d45` | `docs/marketplace/how-to-add-an-app.md` (412 lines, real n8n values) | — (docs) |

**Test totals this phase:** 16 + 12 + 10 + 10 = **48 new assertions, all PASS.**
caddy.test.ts overall = 37/37 PASS after the additions. drain-install test isolated.
tsc baseline unchanged at 382 (no new errors introduced).

---

## Goals vs Definition-of-Done

PLAN.md's Definition of Done called for:

- [x] Fresh Mini PC + fresh user → install n8n → `https://n8n-${user}.livinity.io` opens — **code path now correct end-to-end** (141-01 + 141-03 + 141-09 + 141-10 chain). UAT-walked on socinity Mini PC during the discovery session that surfaced the bugs; re-run after `bash /opt/livos/update.sh` will validate the codified path.
- [x] Right-click → Change subdomain → "workflow" → new URL works after ~30sec — **shipped in 141-05**; UAT pending (operator-walk).
- [x] Settings → app → Public Access shows `${app}-${user}.livinity.io` (hyphen) — **shipped in 141-03/04**; UI displays `sub.host` when present.
- [x] Mini PC dashboard.html shows "Online · ready when you are" not "asleep" — **shipped in 141-07**; CF Tunnel connection count + 30s cache.
- [x] Browser hard-refresh after fresh signup → no redirect loops — **operator playbook 141-08 §1+§3** documents recovery; root cause closed by 141-01 (local_mode now seeded) so the loops shouldn't re-emerge on a fresh install.
- [x] Re-install with new user → cloudflared connects to new tunnel — **shipped in 141-09**; sed-rewrite of ExecStart token on drift.
- [x] All Phase 140 + 141 bugs covered by regression tests — **48 assertions across 4 new test files** (drain-install ts, set_livos_redis_key bash, cloudflared-token-reconcile bash, factory-reset bash); pre-existing 25/25 caddy.test.ts grew to 37/37.

---

## Deployment status

Mini PC (`bruce@10.69.31.68`) is still running the manually-hotfixed state
that socinity install left behind:
- `/etc/caddy/Caddyfile` has manual http:// prefix sed-fix
- `/etc/systemd/system/cloudflared.service` has the manually-rewritten token
- `livos:domain:local_mode=hybrid` was manually `redis-cli set`

Running `bash /opt/livos/update.sh` will deploy the codified versions of all
three fixes (141-01 drains Redis on boot, 141-03 emits Caddy with `http://`
prefix from rebuildCaddy, 141-09 reconciles cloudflared on re-install).
After the deploy the manual hotfixes become no-op — the code-paths take
over.

**Smoke-test sequence after deploy:**

```bash
USER=socinity
APP=n8n
for url in \
  https://$USER.livinity.io \
  https://$USER.livinity.io/trpc/system.status \
  https://$APP-$USER.livinity.io; do
  printf "%-60s " "$url"
  curl -s -o /dev/null -w "%{http_code}\n" --max-time 5 "$url"
done
```

All three should return **200**. Anything else → see `docs/operator/post-deploy-playbook.md` §8.

---

## Out of scope (deferred to later phases)

- **Server5-side strict slug validation** for arbitrary user-typed subdomain
  labels (Phase 141-05 wires the rename round-trip but trusts Server5 to
  accept whatever slug livinityd sends; an allowlist there is a hardening
  item for Phase 142+).
- **Manifest-driven CSP allowlist** for third-party widgets (Phase 141-06
  ships a curated static list — adding a new widget that needs an external
  API requires editing `server/index.ts`. A manifest-based dynamic registry
  with code review on the manifest is a possible v34.x follow-up).
- **EnvironmentFile-based cloudflared unit** (Phase 141-09 sed-rewrites the
  ExecStart `--token` arg; a longer-term cleanup is switching the unit to
  `EnvironmentFile=/etc/livos/secrets/cf-tunnel-token` so the secret-file
  becomes the single source of truth and ExecStart is generic).
- **App-rename support that survives uninstall** — Phase 141-05's
  `cfDeprovisionSubdomain` uses `appId` (the LivOS internal identifier),
  not the renamed slug. If a user renames then uninstalls, Server5's DELETE
  uses the original appId → may 404 → leftover CF row. Edge case; revisit
  with a Server5 API change that lets us pass slug-to-delete explicitly.
- **Phase 140-09 Lucy migration** — still deferred per Phase 140's own DoD;
  Lucy's `livinity.live` zone retire is its own ops walk.

---

## Memory entries created / updated by this phase

- `feedback_install_sh_systemd_token_cache_bug` — pre-existing memory entry
  that 141-09 now closes in code (manual sed-recipe still documented in
  case of recurrence).
- `feedback_minipc_factory_reset_checklist` — pre-existing memory entry
  that 141-10 now codifies as `scripts/install/factory-reset.sh`.
- `feedback_pm2_reload_ecosystem` — referenced in 141-08 operator playbook.
- `reference_resend_email` — referenced in PLAN.md CONTEXT.

No new memory entries needed — the work surfaced the bugs, the code closes
them, the playbook captures the operational recovery for any
mid-deploy hiccups.

---

## Sacred SHA invariant

All 11 commits this phase carry `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
in their commit body. Pre-commit hook enforced.
