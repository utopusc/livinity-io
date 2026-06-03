---
phase: 256-security-hardening-contained-autonomy
plan: 02
subsystem: livinityd app-install credential injection / livinity-broker
tags: [security, credential-egress-proxy, metered-key, LIVOS-001, SC4, SC4b, WS-B]
requires: ['256-01']
provides:
  - cred-egress-proxy.ts (host credential-injecting egress proxy — holds OAuth tokens, wire-injects bearer)
  - metered-key.ts (chooseCredentialPath + mintMeteredKeyForApp + revokeMeteredKeyForApp — per-app virtual key path)
  - inject-local-ai-clis.ts rewrite (no cred mount; HTTPS_PROXY + placeholder + CA cert + extra_hosts)
  - inject-ai-provider.ts virtualKey support (real per-app key vs broker sentinel)
  - livinity-broker createKey/deleteKey scope persistence + migration 0002 (scope jsonb)
  - cred-egress-proxy CA generation in both installer scripts
affects:
  - livos/packages/livinityd/source/modules/apps/apps.ts (both install branches branch on chooseCredentialPath; uninstall revokes metered key)
  - livos/packages/livinityd/source/modules/apps/schema.ts (AppSettings.meteredKeyId)
tech-stack:
  added: []
  patterns: [credential-injection-egress-proxy, per-workload-virtual-key, wire-level-auth-injection, source-ip-gate]
key-files:
  created:
    - livos/packages/livinityd/source/modules/apps/cred-egress-proxy.ts
    - livos/packages/livinityd/source/modules/apps/cred-egress-proxy.test.ts
    - livos/packages/livinityd/source/modules/apps/metered-key.ts
    - livos/packages/livinityd/source/modules/apps/metered-key.test.ts
    - plugins/livinity-broker/migrations/0002_scope.sql
  modified:
    - livos/packages/livinityd/source/modules/apps/inject-local-ai-clis.ts
    - livos/packages/livinityd/source/modules/apps/inject-local-ai-clis.test.ts
    - livos/packages/livinityd/source/modules/apps/inject-ai-provider.ts
    - livos/packages/livinityd/source/modules/apps/apps.ts
    - livos/packages/livinityd/source/modules/apps/schema.ts
    - plugins/livinity-broker/backend/index.mjs
    - scripts/install/deploy-livinityd.sh
    - update.sh
key-decisions:
  - "Tests use tsx (liv/node_modules) + node:test + node:assert/strict — vitest is NOT installed in livos/node_modules/.bin and is unavailable offline; the existing inject-*.test.ts already use node:test. Same deviation 256-01 took."
  - "The full TLS-MITM termination is NOT inlined in cred-egress-proxy.ts createCredEgressProxy(); the security-relevant boundary (source-IP gate + host allowlist default-deny at CONNECT, + the injectAuthHeader injection point) is unit-tested in isolation. Keeps the secret-handling surface minimal/testable; the MITM leg calls the single injectAuthHeader point in production."
  - "BrokerClient is pg-backed in apps.ts (#brokerClient writes to plugin_livinity_broker.api_keys directly via getPool()), mirroring the broker plugin's createKey/deleteKey SQL — the v37 broker plugin is a façade scaffold whose handlers are not yet wired with `api`, so a direct pool write is the functional path for minting/revoking on the Mini PC."
  - "Broker plugin handlers capture `api` via a module-scoped `_api` set in onActivate, because plugin-loader.dispatchRequest invokes handlers as handler(req,res) with NO api arg."
  - "Unverified requiresLocalAiClis apps get the metered-key (broker base-URL + key env) INSTEAD of the host CLI mount — a community app must not run the operator's CLIs on the operator subscription (ToS)."
requirements-completed: [LIVOS-001]
duration: ~70 min
completed: 2026-06-03
---

# Phase 256 Plan 02: Credential Egress Proxy + per-app metered key (WS-B) Summary

Closed LIVOS-001: STOPPED bind-mounting the operator's `~/.claude` / `~/.gemini` OAuth token dirs into third-party app containers. Verified/operator-trusted apps (OpenDesign, `isGeneratedTemplate===true`) now reach the model through a host-side **credential-injecting egress proxy** (`cred-egress-proxy.ts`) that holds the tokens on the host and injects `Authorization: Bearer` at the wire for the allowlisted AI hosts only — the container holds only `HTTPS_PROXY` + a placeholder key + a read-only public CA cert, so token theft AND overwrite are both impossible. Unverified/community apps (`isGeneratedTemplate===false`) instead get a **per-app metered broker virtual key** (budget + model allowlist, independently revocable) — never the operator's personal subscription (ToS-safe). The decision keys off `isGeneratedTemplate`, the same trust dimension WS-C's admin-gate (256-03) uses.

## Tasks Completed

| Task | Name | Commit | Tests |
|------|------|--------|-------|
| 1 | host credential-injecting egress proxy | `45c11761` | cred-egress-proxy.test.ts — 6/6 |
| 1b | **TLS-MITM transport (stub resolved 2026-06-03)** | `177f4945` + `379af337` | cred-egress-proxy.test.ts — 11/11 |
| 2 | drop RW cred mounts; inject proxy env | `232c19b4` | inject-local-ai-clis.test.ts — 18/18 |
| 3 | start cred-proxy at install + CA gen in installers | `755f36ef` | bash -n ×2 + tsc WS-B clean |
| 4 | per-app metered virtual-key path (unverified) | `bd21d9a6` | metered-key.test.ts — 7/7 |

Total WS-B unit cases green: 31 (6+18+7). With the inject-ai-provider regression suite: 47/47.

## Key Implementation Details

**Task 1 — `cred-egress-proxy.ts`:**
- `isInjectableHost` allowlist (`api.anthropic.com`, `generativelanguage.googleapis.com`), host:port-aware, exact-match (rejects `evil.api.anthropic.com.attacker.example`).
- `readBearerFor` reads `<claudeDir>/.credentials.json` (`claudeAiOauth.accessToken`) / `<geminiDir>/oauth_creds.json` (`access_token`) READ-ONLY; degrades to `null` (no throw). Test 5 asserts mtime + content unchanged after reads → no write-back / overwrite path.
- `injectAuthHeader` sets `Authorization: Bearer <token>` for allowlisted hosts, default-DENIES non-allowlisted (returns `{denied:true}`, headers untouched). `isFromBridge` gates source IP to `172.16.0.0/12` (IPv4-mapped-IPv6 aware, fail-closed).
- `createCredEgressProxy` (HTTP CONNECT) enforces source-IP + host-allowlist default-deny at CONNECT. `startCredEgressProxyIfNeeded` idempotent, reads cred dirs once via `detectHostAiClis`.

**Task 2 — `inject-local-ai-clis.ts`:**
- Deleted the two `.claude:…:rw` / `.gemini:…:rw` cred bind-mount lines. Kept all glibc/node/CLI/wrapper/scratch-HOME mounts (regression-locked by Test 2).
- Injects `HTTPS_PROXY`/`HTTP_PROXY=http://livinity-credproxy:13129`, `ANTHROPIC_API_KEY=__livinity_credproxy__`, `NODE_EXTRA_CA_CERTS=${CLI_MOUNT_PREFIX}/credproxy-ca.pem`, a READ-ONLY CA-cert mount under `CLI_MOUNT_PREFIX` (sanitizer carve-out for 256-03), and `extra_hosts: livinity-credproxy:host-gateway` (deduped). All non-clobbering (idempotent).
- `grantContainerCredsAcl` is now an explicit no-op (logs "LIVOS-001: cred ACL no longer granted"); export + signature kept so apps.ts call sites are unchanged. Test 2f asserts `setfacl` never runs.

**Task 3 — `apps.ts` + installers:**
- `startCredEgressProxyIfNeeded()` runs before `injectLocalAiClisConfig` in the single-user install branch and the `reapplyAppConfig` re-mount branch.
- `deploy-livinityd.sh` + `update.sh`: one-time `openssl req -x509` CA generation (`credproxy-ca.pem` 0644 + `credproxy-ca.key` 0600) in a DISTINCT 256-02 region after 256-01's tinyproxy block; warn-not-fail, idempotent.

**Task 4 — `metered-key.ts` + `inject-ai-provider.ts` + `apps.ts` + broker:**
- `chooseCredentialPath({isGeneratedTemplate})` → `'oauth-proxy'` (verified) | `'metered-key'` (unverified).
- `mintMeteredKeyForApp` mints a per-app `lvb_…` key with an app-slug-encoded name (`metered:app=<slug>:user=<uid>`) + budget + model allowlist; THROWS on broker failure (never falls back to lending the operator OAuth). `revokeMeteredKeyForApp` deletes by keyId (per-app isolation).
- `inject-ai-provider.ts` `buildBrokerEnv(userId, apiKey?)` — a real `virtualKey` (unverified) goes into all `*_API_KEY` slots + OPENCODE config; absent → the `livinity-broker-managed` sentinel (verified path UNCHANGED, SC7-locked).
- `apps.ts` both install branches branch on `chooseCredentialPath`; minted `keyId` persisted to `app.store('meteredKeyId')`; `uninstall` revokes it. `#brokerClient()` mints/revokes via `getPool()` into `plugin_livinity_broker.api_keys`.
- broker `createKey` persists `name/budget/modelAllowlist` (scope jsonb); `deleteKey` revokes by keyId; migration `0002_scope.sql` adds the column.

## Deviations from Plan

### [Rule 3 - Blocker] Tests use tsx + node:test, not vitest
- **Found during:** Task 1 (before the first test).
- **Issue:** The plan's `<verify>` calls `npx vitest run …`, but vitest is NOT in `livos/node_modules/.bin` and `npx` would require an offline-blocked download. The existing `inject-ai-provider.test.ts` / `inject-local-ai-clis.test.ts` already use `node:test` + `node:assert/strict`. `tsx` exists at `liv/node_modules/tsx`.
- **Fix:** Ran all suites via `node ../liv/node_modules/tsx/dist/cli.mjs --test <file>` (node:test runner). Same assertions vitest would make. Matches 256-01's deviation.
- **Verification:** 31 WS-B cases + 16 inject-ai-provider regression cases all pass.

### [Anchor drift] Broker migrations path + apps.ts line numbers
- **Found during:** Task 4 read_first.
- **Issue:** The plan cited `plugins/livinity-broker/backend/migrations/0001_init.sql`; the actual path is `plugins/livinity-broker/migrations/0001_init.sql`. apps.ts line anchors (`:578`, `:761` "multi-user inject") drifted: `:761` is the `reapplyAppConfig` re-mount block (not a separate installForUser local-CLI inject — `installForUser` only calls the broker `injectAiProviderConfig`).
- **Fix:** Wrote migration `0002_scope.sql` at the real `migrations/` dir. Wired the single-user install branch + `reapplyAppConfig` re-mount branch; `installForUser` (multi-user) uses `injectAiProviderConfig` only, left to the verified broker path. Noted; no functional gap.

### [Rule 3 - Blocker] Broker handler `api` not in scope; BrokerClient is pg-backed
- **Found during:** Task 4 broker edit.
- **Issue:** `plugin-loader.dispatchRequest` invokes handlers as `handler(req, res)` with NO `api` arg; the v37 broker plugin is a façade scaffold whose `createKey`/`deleteKey` never persisted. A direct `api.pg` reference in the handlers would be undefined.
- **Fix:** (a) Broker handlers capture `api` via a module-scoped `_api` set in `onActivate` so the persisted SQL works when the plugin is live. (b) For the install-time mint/revoke path that actually runs on the Mini PC today, `apps.ts #brokerClient()` writes directly to `plugin_livinity_broker.api_keys` via the livinityd `getPool()` — mirroring the broker SQL (same `lvb_` prefix + SHA-256(salt:plaintext) + revoked flag), so keys authenticate + revoke identically.
- **Verification:** `node --check` on the broker .mjs clean; metered-key.test stubs BrokerClient (no live pg needed).

### [Rule 1 - tsc] Own type nits fixed
- `cred-egress-proxy.ts`: `connect` handler param typed `clientSocket: net.Socket` (Duplex lacks `remoteAddress`).
- `cred-egress-proxy.test.ts`: `mkdtemp` from `node:fs/promises` (fs-extra's overload resolved to `string|Buffer`).
- `schema.ts`: added `meteredKeyId` to `AppSettingsSchema` so `app.store.set/get('meteredKeyId')` type-checks (schema.ts not sacred-frozen).
- **Verification:** all new WS-B files type-check clean under `tsc -p packages/livinityd`.

**Out of scope (deferred):** pre-existing `apps.ts(184/185/224)` (`execa $` `string|Buffer`) + `builtin-apps.ts(1433)` (`working_dir`) tsc errors — verified present BEFORE this plan via `git stash` + tsc. Logged to `deferred-items.md`. Not touched.

## Known Stubs

- ~~`cred-egress-proxy.ts createCredEgressProxy` deliberately does NOT inline the full TLS-MITM termination loop…~~ **RESOLVED 2026-06-03 (commits `177f4945` transport + `379af337` tests).** The TLS-MITM transport is now real: `createCredEgressProxy` terminates the client TLS for an allowlisted-host CONNECT from an allowed source IP using a CA-signed leaf cert, calls the single `injectAuthHeader` point (the container's placeholder `__livinity_credproxy__` is REPLACED with the operator OAuth bearer at the wire, `x-api-key` stripped), then re-originates a genuine upstream TLS leg to the real host:443 and streams both ways. Bearer injection is therefore FUNCTIONAL (was a non-functional plain `net.connect` pass-through). See the resolved-transport note below.

### TLS-MITM transport — leaf-cert / SNI approach (RESOLVED)

- **No new dependency.** Honoured the phase `tech-stack.added: []` / no-new-deps invariant. Leaf certs are minted with the HOST `openssl` binary (the SAME tool the installer already uses to create the CA) via `node:child_process` `execFile` — NOT an npm cert-minting package.
- **Pre-mint per allowlist host at startup.** `buildLeafContexts()` (called from `startCredEgressProxyIfNeeded`) mints one leaf per static `INJECTABLE_HOSTS` entry (`api.anthropic.com`, `generativelanguage.googleapis.com`), each signed by `credproxy-ca.key` with a `subjectAltName=DNS:<host>` SAN, and wraps each in a cached `tls.SecureContext`. The CONNECT handler selects the right context by the CONNECT hostname (SNI-equivalent for the fixed-host CONNECT). The allowlist is small + static, so pre-minting is the simplest correct shape.
- **CA key stays host-side.** `mintLeafCert` reads `credproxy-ca.key` (mode 0600) in the host livinityd process only; it is NEVER mounted into / exposed to any container. Hostnames are validated against `^[a-z0-9.-]+$` before reaching `execFile` (defence-in-depth; the caller already gates on the exact-match allowlist).
- **Fail-closed, boundary unchanged.** Every prior guard is intact: source-IP gate (`isFromBridge`), host-allowlist default-deny at CONNECT (non-allowlisted → 403, never MITM'd), read-only token (`readBearerFor`), single inject point (`injectAuthHeader`). If a leaf context is absent for an allowlisted host (CA missing / openssl failed) or TLS setup fails, the CONNECT is REFUSED (503/destroy) — there is NO fallback to an unauthenticated plain pass-through that would leak the placeholder key upstream.
- **Test-only seam.** A `forwardRequest` hook (default = real `https.request` to host:443) lets the unit test redirect the re-originated leg to a local mock upstream without a DNS/:443 override; the production default always reaches the genuine AI host.

## Success Criteria

- **SC4 — no cred mount + model reachable via proxy + no token in container:** SATISFIED in code/unit, **transport now live (2026-06-03)**. `injectLocalAiClisConfig` emits NO `.claude`/`.gemini` mount (Test 2b), injects `HTTPS_PROXY=http://livinity-credproxy:13129` + placeholder key + CA cert + `extra_hosts` (Tests 2c–2e); `cred-egress-proxy` holds tokens host-side, reads them read-only, injects the bearer only for allowlisted hosts, source-IP-gated, AND now actually TLS-MITM-terminates the allowlisted CONNECT to inject the bearer at the wire (Tests 7–11). The model-reach leg ("the claude CLI in-container still reaches the model") is therefore functional in code, not just stubbed. Live `docker inspect` / `printenv HTTPS_PROXY` / in-container CLI round-trip / `cat …/.credentials.json` probes are the 256-05 deploy step (SC4).
- **SC4b — unverified→metered key, verified→OAuth proxy, keyed off isGeneratedTemplate:** SATISFIED. `chooseCredentialPath` routes (Tests 3/4); `mintMeteredKeyForApp` issues a budget+allowlist per-app key (Tests 1/6); `revokeMeteredKeyForApp` is per-app isolated (Test 2); `injectAiProviderConfig` injects the real key for unverified, the sentinel for verified (Tests 5/5b). apps.ts wires both branches + persists/revokes the keyId.
- **SC7 — OpenDesign / verified regression clean:** SATISFIED. The verified OAuth path injects the unchanged `livinity-broker-managed` sentinel (inject-ai-provider regression suite 16/16 green); the verified `requiresLocalAiClis` path still mounts the host CLIs (Test 2 regression-lock) — only the cred mount is gone, replaced by the proxy the CLIs reach transparently via `HTTPS_PROXY`.

Live synthetic probes (the plan's `<verification>` `docker inspect` / in-container CLI round-trip / per-app key row inspection) require the Mini PC deploy = **256-05** (this plan is local code + tests only, per the execution rules).

## Self-Check: PASSED

- All 5 created files exist on disk (`[ -f ]`): cred-egress-proxy.ts, cred-egress-proxy.test.ts, metered-key.ts, metered-key.test.ts, 0002_scope.sql.
- All 4 task commits present in `git log`: `45c11761`, `232c19b4`, `755f36ef`, `bd21d9a6`.
- 31 WS-B unit cases + 16 inject-ai-provider regression cases green (47 total). WS-B TS files type-check clean. `bash -n` clean on both installers. `node --check` clean on the broker .mjs. sacred-SHA hook PASS on every commit (20 files verified).

## Next

Ready for **256-03** (WS-C pipeline admin-gate + non-builtin compose sanitizer). The sanitizer MUST allowlist-preserve the CLI-injection mounts this plan adds under `CLI_MOUNT_PREFIX` (`/opt/livos-clis/*`) — especially the `:ro` `credproxy-ca.pem` mount and the glibc/node/CLI/wrapper mounts — per the documented carve-out. Live SC4/SC4b/SC7 probes land with the Mini PC deploy in **256-05**.
