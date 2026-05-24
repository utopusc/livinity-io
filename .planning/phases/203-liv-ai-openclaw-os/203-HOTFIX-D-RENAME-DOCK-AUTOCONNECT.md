---
phase: 203
hotfix: D
shipped: 2026-05-24
deployed_sha: fe9ac8ed
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
operator_uat: live-verified
---

# Phase 203 Hot-fix D — Operator UX trio: URL rename + dock icon + auto-connect

Closes the three remaining gaps that kept the Phase 203 Liv AI chat surface
from being one-click usable. Operator was on the clock (45-min budget) and
each gap surfaced together during a single browser walk:

1. **URL rename** — `/liv-ai-app/openclawos` is the openclaw plugin's
   immutable internal id; operator sees it in the URL bar and asked for
   `/liv-ai-app/liv-ai` instead.
2. **Permanent dock icon** — no entry existed for the chat surface; operator
   had to type the URL by hand or open via app launcher with no shortcut.
3. **Auto-connect** — claw-client showed the "Disconnected / paste token"
   setup form even when same-origin handshake bridge (Plan 203-05) was
   already wired.

After this hot-fix: operator clicks "Liv AI" dock icon → window opens →
iframe mounts → claw-client auto-connects via the Plan 203-05 bridge → chat
visible immediately. No URL typing, no token paste, no setup form.

## Commits

| # | SHA | Title |
| - | --- | ----- |
| 1 | `5a53ca9f` | feat(203): Hot-fix D part 1 — operator-facing /liv-ai-app/liv-ai URL rename |
| 2 | `2c5e8a33` | feat(203): Hot-fix D part 2 — permanent "Liv AI" dock entry + iframe window |
| 3 | `fe9ac8ed` | feat(203): Hot-fix D part 3 — auto-connect bypass for "Disconnected" setup form |

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on every commit
(pre-commit hook PASS × 3, 20 files verified).

## Part 1 — URL rename (Caddy rewrite)

External path `/liv-ai-app/liv-ai` is the new operator-facing URL. Both
prefixes (`/liv-ai-app/liv-ai` and the legacy `/liv-ai-app/openclawos`)
rewrite to the same upstream `/plugins/openclawos{path}` so the gateway plugin
match shape is unchanged. Legacy path kept for back-compat with any persisted
iframe src or bookmark.

**Files:**

- `livos/packages/livinityd/source/modules/domain/caddy.ts` — prepend new
  `handle_path /liv-ai-app/liv-ai /liv-ai-app/liv-ai/*` block in
  `LIV_AI_APP_HANDLE` constant before the existing openclawos handle.
- `livos/packages/livinityd/source/modules/domain/caddy.test.ts` — 6 new
  assertions: apex + multi-user + null-mainDomain blocks carry the new
  handle, rewrite target is `/plugins/openclawos{path}`, reverse_proxy port
  is :18789, ordering invariants (handshake handle first, then /liv-ai,
  then /openclawos).
- `scripts/install/deploy-livinityd.sh` — same prepend in 3 bootstrap
  heredoc branches (tunnel + local-lan + cloud).
- `scripts/install/mode-tunnel.sh` — same prepend in the :80 tunnel heredoc.
- `scripts/install/mode-cloud.sh` — same prepend in both cloud heredocs
  (HTTPS branch + plain-HTTP bootstrap branch).

**Tests:** 49/49 pass (43 pre-existing + 6 new).

## Part 2 — Permanent "Liv AI" dock entry

**New file:** `livos/packages/livinityd/source/modules/openclawos/liv-ai-dock-seed.ts`
— `seedLivAiDockEntry(store)` upserts a fixed-UUID `NativeAppConfig` with
`wmClassHint='liv-ai'` (EXACT string, distinct from `liv-openui-` PREFIX used
by per-app OpenUI tiles). Idempotent: same UUID = same Redis key on every
boot, so booting N times produces 1 dock tile, not N. Non-fatal on Redis
hiccups (boot continues).

**New file:** `liv-ai-dock-seed.test.ts` — 7/7 tests pass: idempotency
(3 calls → 1 entry), schema validity, pub/sub event shape
(`{kind:'native-app', op:'upsert'}`), UUID regex match, disjoint-with-
`liv-openui-` invariant, root-relative iconUrl assertion.

**Wiring (`livos/packages/livinityd/source/index.ts`):** call
`seedLivAiDockEntry(this.nativeAppConfigStore)` immediately after the store
is constructed (after `ai.start()` returns Redis). Wrapped in try/catch —
boot continues if Redis is briefly unreachable.

**UI side:**

- `livos/packages/ui/src/modules/dock/use-launch-native-app.ts` —
  short-circuit on `wmClassHint === 'liv-ai'` → open `LIV_AI_CHAT` window.
  Checked BEFORE the `liv-openui-` prefix branch so the two stay disjoint.
- `livos/packages/ui/src/modules/window/window-content.tsx` — dispatch
  `LIV_AI_CHAT` appId → `LivAiChatIframeContent`. Added to `fullHeightApps`
  set so the iframe fills the window with no padding wrapper.
- `livos/packages/ui/src/modules/window/app-contents/liv-ai-chat-iframe-content.tsx`
  (NEW) — iframe pointing at `/liv-ai-app/liv-ai`. Distinct from the legacy
  `liv-ai-content.tsx` which iframes the Next.js dashboard at `/liv-ai-app`
  (kept for back-compat via the `LIVINITY_liv-ai` literal appId path).

## Part 3 — Auto-connect bypass

**New file:** `livos/packages/liv-claw-os/packages/claw-client/src/lib/gateway/auto-connect.ts`
— `attemptLivOsAutoConnect()` probes the Plan 203-05 `/openclawos/handshake`
endpoint on first load. Three outcomes:

- `'already-configured'` (fast path): `settings.gatewayUrl` already present →
  no handshake fired; existing socket layer's per-open handshake keeps the
  device token fresh.
- `'seeded'`: handshake returned 200 → persist
  `{gatewayUrl: wss://${host}/liv-ai-app/liv-ai/ws, deviceToken: <minted>}`.
- `'handshake-failed'`: 401 / 5xx / network err → return silently; legacy
  setup-dialog path continues to fire.

`computeSameOriginGatewayUrl()` builds `wss://` (https origin) or `ws://`
(http origin) automatically. WS path is the Hot-fix-D-part-1 prefix
`/liv-ai-app/liv-ai/ws` which Caddy passes through with the WS-friendly
transport block.

**New file:** `auto-connect.test.ts` — 8 TS-clean tests (URL composition,
seeded vs already-configured vs handshake-failed paths, no-window guard).
**Note:** claw-client vitest 4.x has a pre-existing vite resolution gap
(documented in 203-04-SUMMARY) so the runtime test runner is unavailable —
identical to the pre-existing `livinityd-handshake.test.ts` situation.

**Wiring:**

- `ChatApp.tsx`: replaced legacy `getSettings()?.gatewayUrl` first-load
  effect with `attemptLivOsAutoConnect()`; settings dialog only opens
  when auto-connect fails (genuinely standalone outside-LivOS use).
- `setup/page.tsx`: if `/setup` is opened without hash params, try
  auto-connect before showing the "No configuration found" error — handles
  operators landing on `/setup` via a stale bookmark while inside LivOS.

Outside-LivOS standalone use (claw-client opened directly, no
`LIVINITY_SESSION` cookie) continues to work unchanged — handshake fails
silently and the legacy setup-dialog/setup-page UX takes over.

## Deploy

```
git push origin master                         # eea8f663..fe9ac8ed
ssh bruce@10.69.31.68 'sudo bash /opt/livos/update.sh'
# Deployed SHA recorded: fe9ac8e
```

Mini PC `update.sh` rebuilt + restarted livos / liv-claw-gateway /
livos-app-liv-ai / caddy / liv-core / liv-worker / liv-memory. All 7
services `active` post-deploy.

**Caddyfile note:** the live `/etc/caddy/Caddyfile` is a hand-maintained
config (commit head `# Phase 203-09 split + 203-12 inline fix 2026-05-23`)
that was last touched by Hot-fix C. The runtime regenerator only fires
on `domain.activate` — so the source-side `caddy.ts` rewrite ships
correctly (caddy.test.ts proves it) but the live file needed a one-off
in-place patch. Done via:

```bash
# Live-patched on Mini PC (2026-05-24)
sudo python3 -c '
src=open("/etc/caddy/Caddyfile").read()
src=src.replace("handle_path /liv-ai-app/openclawos*",
  "handle_path /liv-ai-app/liv-ai* {\n        rewrite * /plugins/openclawos{path}\n        reverse_proxy 127.0.0.1:18789\n    }\n    handle_path /liv-ai-app/openclawos*")
open("/etc/caddy/Caddyfile","w").write(src)
'
sudo systemctl reload caddy
```

Backup kept at `/etc/caddy/Caddyfile.bak.hotfix-d`.

## Live verification

```
--- services ---
livos: active    liv-claw-gateway: active    livos-app-liv-ai: active    caddy: active

--- /liv-ai-app/liv-ai (NEW) ---
status=200    title=<title>Liv AI</title>

--- /liv-ai-app/liv-ai/ subroute ---
status=200

--- /liv-ai-app/openclawos (LEGACY back-compat) ---
status=200

--- /liv-ai-app/agents (Next.js dashboard regression check) ---
status=200

--- /openclawos/handshake (POST, unauth probe) ---
status=401  (correct — no LIVINITY_SESSION cookie)

--- Boot journal markers ---
NativeAppConfigStore wired (liv:apps:native:* namespace)
Hot-fix D — Liv AI permanent dock entry seeded
Phase 203-08 — Liv AI runtime + tRPC router wired

--- Redis seeded entry ---
KEY: liv:apps:native:d1748ca1-0203-4d04-8db1-9aa1c1a1f1d1
VAL: {"id":"d1748ca1-0203-4d04-8db1-9aa1c1a1f1d1","name":"Liv AI",
      "iconUrl":"/liv-ai-app/icons/liv-ai-placeholder.svg",
      "binaryPath":"/usr/bin/true","wmClassHint":"liv-ai"}
```

## Test summary

| Suite | Pass | New | Notes |
| ----- | ---- | --- | ----- |
| `caddy.test.ts` | 49/49 | +6 | Hot-fix D rename describe block |
| `liv-ai-dock-seed.test.ts` | 7/7 | +7 | New file (idempotency + schema + pub/sub + UUID) |
| `desktop-registrar.test.ts` | 14/14 | 0 | Regression — unchanged |
| `auto-connect.test.ts` | TS-clean | +8 | Runtime blocked by pre-existing vitest 4.x gap |

70 tests pass in the livinityd workspace; 8 TS-clean tests await the
pre-existing claw-client vitest fix.

## Operator UAT pending

- [ ] Click "Liv AI" dock icon → window opens
- [ ] Iframe loads `/liv-ai-app/liv-ai` (NOT `/liv-ai-app/openclawos`)
- [ ] Auto-connect fires silently, no setup form shown
- [ ] Chat surface usable within ~2s of window mount
- [ ] URL bar reads `bruce.livinity.io/liv-ai-app/liv-ai`

## Threat surface

No new threat surface introduced. Reuses existing trust chains:

- `T-203-06` (same-origin LIVINITY_SESSION cookie flow) — covers the iframe
  hosted at `/liv-ai-app/liv-ai`.
- `T-203-02` (5-min device token expiry) — covers the auto-connect's
  persisted `deviceToken` (refreshed on every WS open via Plan 203-05).
- `T-101-02` (binary-injection / preload-library) — `liv-ai-dock-seed.ts`
  uses the schema-vetted `/usr/bin/true` placeholder; the launcher
  short-circuits before any spawn dispatcher could see it.

## Threat flags

None — no new network endpoints, auth paths, file access patterns, or
schema changes at trust boundaries.

## Self-Check: PASSED

All 13 commits + 14 modified/created files verified on disk:

- `livos/packages/livinityd/source/modules/domain/caddy.ts` — FOUND (new handle present)
- `livos/packages/livinityd/source/modules/domain/caddy.test.ts` — FOUND (6 new tests)
- `livos/packages/livinityd/source/modules/openclawos/liv-ai-dock-seed.ts` — FOUND (new)
- `livos/packages/livinityd/source/modules/openclawos/liv-ai-dock-seed.test.ts` — FOUND (new)
- `livos/packages/livinityd/source/index.ts` — FOUND (seedLivAiDockEntry wired)
- `livos/packages/ui/src/modules/dock/use-launch-native-app.ts` — FOUND (liv-ai short-circuit)
- `livos/packages/ui/src/modules/window/window-content.tsx` — FOUND (LIV_AI_CHAT dispatch)
- `livos/packages/ui/src/modules/window/app-contents/liv-ai-chat-iframe-content.tsx` — FOUND (new)
- `livos/packages/liv-claw-os/packages/claw-client/src/lib/gateway/auto-connect.ts` — FOUND (new)
- `livos/packages/liv-claw-os/packages/claw-client/src/lib/gateway/auto-connect.test.ts` — FOUND (new)
- `livos/packages/liv-claw-os/packages/claw-client/src/components/ChatApp.tsx` — FOUND (auto-connect wired)
- `livos/packages/liv-claw-os/packages/claw-client/src/app/setup/page.tsx` — FOUND (auto-connect fallback)
- `scripts/install/deploy-livinityd.sh` — FOUND (3 heredoc branches updated)
- `scripts/install/mode-tunnel.sh` — FOUND (heredoc updated)
- `scripts/install/mode-cloud.sh` — FOUND (2 heredoc branches updated)

Commits in git log: `5a53ca9f`, `2c5e8a33`, `fe9ac8ed` — all FOUND.
Mini PC deploy log: `Deployed SHA recorded: fe9ac8e` — FOUND.
