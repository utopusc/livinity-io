# Phase 258 — HOTFIX PLAN: public-access setting not reaching the Caddy emit

**Created:** 2026-06-03 (handoff to next session)
**Status:** OPEN — diagnosed, not yet fixed
**Severity:** Feature-broken (no security regression — apps stay GATED, fail-closed)

## Symptom (operator-reported)
Operator enabled "Public access" on n8n in the Share dialog. `https://n8n-bruce.livinity.io/` STILL redirects to `https://bruce.livinity.io/login?redirect=…` (gated). The carve-out never fires.

## Live state right now (Mini PC, deployed SHA fe10188)
- Redis `livos:apps:public-access:n8n` = `{"mode":"whole-app","paths":[]}` (I manually changed it from the UI-saved `{"mode":"paths","paths":[]}` to whole-app for testing).
- Even after `systemctl restart livos`, the emitted `/etc/caddy/Caddyfile` n8n block is STILL the gated form (`forward_auth /auth/verify` + redirect, no public `handle` blocks, no header-strip).
- n8n is therefore still gated — **no security regression** (fail-closed worked). Other apps + bruce.livinity.io all 200.

## Root cause — TWO layers

### Layer 1 — UX (lower priority)
The Share-dialog "make public" saved `mode:'paths'` with an **empty `paths` array** → zero public prefixes → the carve-out correctly emits nothing. For an app like n8n (own auth, want whole app public) the user needs **`whole-app`** mode. The UI should: default to/offer `whole-app` clearly when the manifest declares no `publicAccess.paths`, OR warn when enabling `paths` mode with an empty list ("no public paths set — nothing will be exposed").

### Layer 2 — WIRING BUG (the real fix)
With `whole-app` set in Redis + a livinityd restart, the Caddy emit STILL doesn't carve out. The deployed code HAS the wiring (`apps.ts`):
- `REDIS_PUBLIC_ACCESS_PREFIX = 'livos:apps:public-access:'` (apps.ts:66)
- `registerAppSubdomain(appId, …)` (apps.ts:1754) → calls `computeEffectivePublicAccess(appId, upstreamBearer)` (apps.ts:1782) → threads `...(publicAccess ? {publicAccess} : {})` onto SubdomainConfig (apps.ts:1793).

So the setting is read at `livos:apps:public-access:<appId>` — but it's NOT landing on the emitted block. Two hypotheses to confirm FIRST in the next session:

- **H1 — appId mismatch.** The key the UI/`setPublicAccess` wrote (`…:n8n`) may not equal the `appId` that `registerAppSubdomain` passes for the n8n subdomain (could be an install-instance id, a different slug, or `n8n-bruce`). If `computeEffectivePublicAccess` looks up `…:<differentId>`, it gets null → publicAccess undefined → gated. **Check:** what exact `appId` string flows into `registerAppSubdomain` for n8n (log it / inspect the `apps` Redis list + the install records) vs the key `setPublicAccess` writes. Align them (one canonical app identifier on BOTH write + read).
- **H2 — regen path doesn't re-derive.** `rebuildCaddyFromState` (apps.ts ~:1388) on a plain restart may read the CACHED `SubdomainConfig` from the `livos:domain:subdomains` hash (which was written WITHOUT publicAccess at last install) instead of calling `registerAppSubdomain`/`computeEffectivePublicAccess` to re-derive. If so, publicAccess only gets threaded on a fresh install/registerAppSubdomain call, never on restart or after a `setPublicAccess`. **Check:** does `setPublicAccess` (258-03, routes.ts) actually trigger a `registerAppSubdomain` re-run for that app after persisting (it should — the plan said "regen")? And does `rebuildCaddyFromState` re-derive or read cached?

## Fix steps (next session)
1. Reproduce + confirm H1 vs H2: read deployed `apps.ts` `registerAppSubdomain` call sites (apps.ts:481/786/895) + `rebuildCaddyFromState` + the `setPublicAccess` mutation in `routes.ts` (does it call registerAppSubdomain after persist?). Determine the canonical `appId`.
2. **If H1:** make `setPublicAccess` write — and `computeEffectivePublicAccess` read — the SAME canonical app identifier that `registerAppSubdomain` uses for the subdomain. Add a test pinning the key both sides use.
3. **If H2:** make `setPublicAccess` trigger `registerAppSubdomain` (re-derive + re-emit + Caddy reload) for that app immediately after persisting, AND make `rebuildCaddyFromState` re-derive `publicAccess` per app on every regen (not read a stale cached SubdomainConfig). Test: a restart re-threads publicAccess from the Redis setting.
4. Add a regression test: setting `whole-app` (and `paths:[…]`) for an app → the emitted block has the public form + header-strip; clearing it → byte-equivalent gated form returns.
5. UX (Layer 1): UI defaults/clarifies whole-app vs paths; warn on empty-paths.
6. Deploy to Mini PC (update.sh), then verify LIVE: n8n whole-app → `curl -L https://n8n-bruce.livinity.io/` returns 200 (n8n UI / its own login), NOT the LivOS /login redirect; a `neverPublic` app still rejected; bruce.livinity.io + other gated apps unchanged (byte-equivalent).

## Verification command (live)
```
curl -sS -o /dev/null -w "%{http_code} %{url_effective}\n" -L https://n8n-bruce.livinity.io/
# PASS = 200 (n8n), FAIL = redirected to bruce.livinity.io/login
```

## Touch points
`livos/packages/livinityd/source/modules/apps/apps.ts` (registerAppSubdomain :1754, computeEffectivePublicAccess :1739, rebuildCaddyFromState :~1388, REDIS_PUBLIC_ACCESS_PREFIX :66), `apps/routes.ts` (setPublicAccess), `domain/caddy.ts` (emit — likely correct, the bug is upstream in the data threading). Single-user emit only (multi-user is a separate documented follow-up — see 258-05).
