# Phase 112 — Investigation Notes

**Date:** 2026-05-13T20:28:20Z (UTC, captured from mainserver shell during the probe)
**Mainserver:** `154.53.56.75` / `test.livinity.live`
**Sacred SHA verified:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (post-probe — `git hash-object /opt/liv/packages/core/src/sdk-agent-runner.ts`)
**Repo at investigation time:** `master` branch, `e6e57e7f` HEAD (appToUrl fix from previous session); no Phase 112 source-tree changes yet.

---

## Live Redis State

Captured from a single SSH session on `root@154.53.56.75`:

```
ssh -i .../contabo_master root@154.53.56.75 'redis-cli ... GET livos:domain:<key>'
```

| Key | Value (raw) | Notes |
|-----|-------------|-------|
| `livos:domain:config` | *(empty)* | **THE GATE.** Gateway middleware short-circuits at `server/index.ts:321-324` when this key is missing → every subdomain falls through to livinityd's Express routes. |
| `livos:domain:subdomains` | `[{"subdomain":"n8n","appId":"n8n","port":5678,"enabled":true}]` | Subdomain table is correctly populated by `apps.ts registerAppSubdomain`. **Never read** because the gate above never passes. |
| `livos:domain:local_mode` | `hybrid` | install.sh wrote this — proves hybrid-mode install actually ran. |
| `livos:domain:hybrid_subdomain` | `test.livinity.live` | The canonical domain — `mode-hybrid.sh:282` wrote it. This is what `_dld_seed_domain_config` will derive `livos:domain:config.domain` from. |
| `livos:domain:tunnel_domain` | *(empty)* | Tunnel mode disabled on mainserver — expected. |
| `livos:domain:local_tld` | *(empty)* | Not local-lan mode — expected. |

Full scan of `livos:domain:*` namespace (6 keys present, no `:config`):

```
livos:domain:hybrid_subdomain
livos:domain:hybrid_zone_id
livos:domain:cf_api_token_secret_ref
livos:domain:subdomains
livos:domain:host_ip
livos:domain:local_mode
```

---

## HTTP Probe Results

### BEFORE fix — n8n subdomain (the bug, reproduced)

```
$ curl -sIL -m 5 -H "Host: n8n.test.livinity.live" http://127.0.0.1:8080 | head -15
HTTP/1.1 200 OK
Content-Security-Policy: script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.tailwindcss.com https://cdn.jsdelivr.net;img-src * blob: data:;connect-src 'self' wss: ws: https://*.livinity.io https://*.supabase.co wss://*.supabase.co;frame-src 'self' https://livinity.io https://*.localhost;style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com;font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com https://fonts.googleapis.com;default-src 'self';base-uri 'self';form-action 'self';frame-ancestors 'self';object-src 'none';script-src-attr 'none'
Referrer-Policy: no-referrer
Accept-Ranges: bytes
Cache-Control: public, max-age=0
Last-Modified: Wed, 13 May 2026 19:59:12 GMT
ETag: W/"73f-19e22ec0193"
Content-Type: text/html; charset=UTF-8
Content-Length: 1855
Date: Wed, 13 May 2026 20:28:19 GMT
Connection: keep-alive
Keep-Alive: timeout=5
```

**Interpretation:** HTTP 200 + `Content-Security-Policy: ... default-src 'self' ... frame-ancestors 'self'` is livinityd's UI signature (the LivOS dashboard CSP, served by `helmet` middleware). `Content-Type: text/html` + `Content-Length: 1855` corresponds to livinityd's `index.html` shell — NOT n8n's container response (n8n would be `X-Powered-By: Express` / `Set-Cookie: n8n-auth=...` / much larger body).

**Expected AFTER fix:** HTTP 200 or 302 with `X-Powered-By: Express` and/or n8n cookie headers / setup-wizard HTML.

### Control — root domain (sanity check)

```
$ curl -sIL -m 5 -H "Host: test.livinity.live" http://127.0.0.1:8080 | head -5
HTTP/1.1 200 OK
Content-Security-Policy: script-src 'self' ... (livinityd CSP, same shape)
Referrer-Policy: no-referrer
Accept-Ranges: bytes
Cache-Control: public, max-age=0
```

Same headers — root domain ALSO serves livinityd UI. Correct (root domain is the dashboard, not an app). Control passes.

### Gateway journal logs

```
$ journalctl -u livos -n 200 --no-pager | grep -iE "gateway|subdomain|domain" | tail -30
(empty)
```

No gateway log lines in the last 200 livinityd log entries. Consistent with the gate short-circuiting BEFORE the `this.logger.verbose('App gateway: ${subdomain}...')` call at `server/index.ts:461` ever fires.

---

## Code-Path Walk

**File:** `livos/packages/livinityd/source/modules/server/index.ts`

| Line(s) | Code | Implication |
|---------|------|-------------|
| 315 | `this.app.use(async (request, response, next) => {` | Subdomain gateway middleware mount point. Runs on EVERY request. |
| 317-318 | `const host = request.hostname; if (!host) return next()` | Skip if no Host header. |
| **321-322** | **`const domainConfigRaw = await this.livinityd.ai.redis.get('livos:domain:config'); if (!domainConfigRaw) return next()`** | **★ THE GATE.** With `livos:domain:config` empty on mainserver, this returns `next()` → middleware bows out. Every subdomain request falls through to the standard Express stack (helmet + UI handler) → livinityd's UI HTML is served. |
| 323-324 | `const domainConfig = JSON.parse(domainConfigRaw); if (!domainConfig.active || !domainConfig.domain) return next()` | Secondary gate — also short-circuits if `active=false` or missing `domain`. Both fields are part of `DomainConfig` interface (routes.ts:27-31). |
| 326-336 | `const mainDomain = domainConfig.domain; if (host === mainDomain) return next(); if (!host.endsWith(...)) { /* custom-domain branch */ }` | Only reached if the gate passes. |
| 338-345 | `const subdomain = host.slice(...); const subdomainsRaw = await this.livinityd.ai.redis.get('livos:domain:subdomains'); const subConfig = subdomains.find(...)` | Subdomain lookup. Already works correctly (the n8n entry IS there) — but unreachable until the gate passes. |
| 389-440 | Auth gate (multi-user / single-user / public bypass) | **D-112-NO-LIVOS-AUTH-BYPASS — must NOT be touched in this phase.** |
| 442-462 | `let proxy = this.appGatewayProxyCache.get(targetPort); if (!proxy) { proxy = createProxyMiddleware({...}) }; return proxy(request, response, next)` | The actual proxy invocation. Cache keyed by port. |

### Smoking-gun snippet (verbatim from current `master`)

```ts
this.app.use(async (request, response, next) => {
    try {
        const host = request.hostname
        if (!host) return next()

        // Get main domain config from Redis
        const domainConfigRaw = await this.livinityd.ai.redis.get('livos:domain:config')
        if (!domainConfigRaw) return next()                          // ← FIRES ON MAINSERVER (key empty)
        const domainConfig = JSON.parse(domainConfigRaw)
        if (!domainConfig.active || !domainConfig.domain) return next()

        const mainDomain: string = domainConfig.domain
        ...
```

---

## Writers of `livos:domain:config` (grep evidence)

| Writer | File:line | Triggered by |
|--------|-----------|--------------|
| `setDomain` tRPC | `livos/packages/livinityd/source/modules/domain/routes.ts:~150` | User opens Settings → Domain wizard → enters domain → clicks "Save domain". `setConfig({domain, active:false, ...})`. |
| `activate` tRPC | `livos/packages/livinityd/source/modules/domain/routes.ts:~250` | User opens Settings → Domain wizard → clicks "Activate HTTPS" after DNS verification. `setConfig({..., active:true, activatedAt})`. |
| `tunnel.configure` tRPC | `livos/packages/livinityd/source/modules/domain/routes.ts:~342` | User toggles tunnel mode in Settings. Writes `{domain:<tunnel-domain>, active:true, activatedAt}`. |
| `tunnel-client.ts auto-bootstrap` | `livos/packages/livinityd/source/modules/platform/tunnel-client.ts:450-462` | Only fires when livinityd boots WITH a valid `LIV_API_KEY` AND the Livinity tunnel WS handshake completes. On a no-api-key install (mainserver's current shape), this branch never runs. |
| **install.sh / deploy-livinityd.sh** | **NONE** | **★ THE GAP.** No install codepath writes `livos:domain:config`. Confirmed by: `grep -RhE "livos:domain:config" scripts/install/ \| grep -v '#'` → no output. |

The writer enumeration above proves that on a fresh `bash install.sh --mode hybrid --domain <X> --cf-token Y --cf-zone-id Z` run, NO codepath writes `livos:domain:config`. The operator would have to manually walk the Settings wizard to populate it — which contradicts the v34 promise of "install once, all subdomains live".

---

## Root Cause (confirmed)

**Hypothesis A is correct.** Live Redis state shows `livos:domain:config` is empty while `livos:domain:subdomains` contains the n8n entry. The gateway middleware at `livos/packages/livinityd/source/modules/server/index.ts:321-322` short-circuits with `next()` because of the empty `livos:domain:config` value, so the subdomain lookup at line 342-345 (which would have found the n8n mapping) is never reached. Every `*.test.livinity.live` request therefore falls through to livinityd's standard Express stack and is served the LivOS UI HTML — which is what `curl -sIL -H "Host: n8n.test.livinity.live"` confirms with the livinityd `Content-Security-Policy` header signature. Hypothesis B (subdomain table not consulted by gateway code) is REFUTED: the code at lines 342-345 IS correct and would find the n8n entry — but it cannot be reached. The original handoff's "appMapping" hypothesis was based on a stale read of an older version of the gateway; the current `master` (`e6e57e7f`) code already consults `livos:domain:subdomains` directly.

---

## Recommended Fix Shape

**Option A + Option B together — defense in depth.**

| Option | What it adds | Why it's needed |
|--------|--------------|-----------------|
| **A — Install-time seed** (`_dld_seed_domain_config` in `scripts/install/deploy-livinityd.sh`) | A new helper that derives `livos:domain:config = {domain, active:true, activatedAt, source:"install-112"}` from `livos:domain:hybrid_subdomain` (mode=hybrid) / `livos:domain:tunnel_domain` (mode=tunnel) / `livos:domain:local_tld` (mode=local-lan), with EXISTS short-circuit and WARN-not-FAIL semantics. Wired into the `deploy_livinityd` pipeline AFTER `_dld_seed_mcp_servers` (same wave — non-essential seeds) and BEFORE `_dld_write_systemd_unit` (so livos.service starts with the key already populated). | Covers the "fresh install" path. Without this, EVERY new VPS install reproduces the n8n routing bug until the operator manually opens Settings. |
| **B — Boot-time fallback** (additional try/catch in `livos/packages/livinityd/source/index.ts start()` immediately after the `seedDefaultAliases` block) | At every livinityd boot, if `livos:domain:config` is missing AND `livos:domain:local_mode` is set to one of hybrid/tunnel/local-lan, the bootstrap derives the config from the same source keys (Option A's logic, ported to TypeScript inline). Writes `source:"boot-112"`. Wrapped in try/catch, non-fatal. Idempotent (existing config is preserved). | Survives accidental `redis-cli DEL livos:domain:config` (which IS exactly how this bug surfaced in v34 UAT 2026-05-13 — the key was deleted during 503 troubleshooting earlier in that session). Also covers any future "install ran but Redis was wiped" recovery scenarios. |

Recommendation: **A + B together** (defense in depth — install-time seed for fresh installs, boot-time seed for survival across `redis-cli DEL` accidents like the one that produced this bug). Task 2 implements both in three sequential commits (Option A → Option B → tests).

The plan locks Option C (gateway middleware defensive fallback inside the `app.use(...)` block) as a NO — it would introduce schema drift inside hot-path middleware that runs on EVERY request, and would have to be removed once Options A+B are in place. A+B together leave the gateway middleware byte-identical (D-112-NO-LIVOS-AUTH-BYPASS satisfied trivially because nothing in `server/index.ts` is touched).
