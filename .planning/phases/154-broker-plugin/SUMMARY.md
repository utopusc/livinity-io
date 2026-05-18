# Phase 154 — Livinity Broker Plugin — 🟡 WAVE A SHIPPED 2026-05-18

**Milestone:** v37.0
**Status:** Wave A (plugin catalog row) ✅; Wave B (package + ship as `.livpkg.tgz` + sign + register) deferred to follow-up alongside Phase 153 plugin runtime
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f`

## Wave A — Catalog row

Applied Supabase migration `phase_154_seed_broker_plugin`. 1 row with `section='plugin'`:

| Slug | Name | URL pattern after install |
|---|---|---|
| livinity-broker | Livinity Broker | `<user>.livinity.io/p/livinity-broker/v1/...` |

Manifest per SPEC §2.5:

```json
{
  "kind": "plugin",
  "bundleUrl": "https://github.com/utopusc/livinity-apps/releases/download/livinity-broker-1.0.0/livinity-broker.livpkg.tgz",
  "bundleSha256": "(placeholder — populated when bundle is built)",
  "signingTier": "operator",
  "minLivosVersion": "37.0.0",
  "summary": {
    "exposesRoutes": ["/p/livinity-broker/v1/messages", "/p/livinity-broker/v1/chat/completions"],
    "exposesWidgets": ["settings"],
    "declaresCommands": [],
    "declaresMcps": []
  }
}
```

Plugin tab now renders 1 card (Livinity Broker) instead of the "Coming in Phase 153" placeholder.

## Wave B (deferred, blocked on Phase 153 runtime)

- Package existing `livos/packages/livinityd/source/modules/livinity-broker/` as a `.livpkg.tgz` bundle
- Write `plugin-manifest.json` (SPEC §3.2 zod schema) with routes/widgets/capabilities
- Operator-sign with Ed25519 (key registry: `livinity-apps/.signing/pubkeys.json`)
- Publish to `utopusc/livinity-apps` releases
- Update Supabase `apps.livinity-broker.manifest.bundleSha256` to the real signed hash
- Plugin settings UI: api-key generation + Bolt/Cline/Cursor URL display
- Live install + UAT through Phase 153 runtime

## Why this row exists before the runtime is built

The plugin section needs at least one row to feel real (vs. empty placeholder). Shipping the broker as a catalog row early means: (a) operator sees the Plugins tab populated on localhost:3001, (b) when Phase 153 runtime lands, this is the smoke test target — install the broker plugin → verify routes mount under `/p/livinity-broker/`. The bundleSha256 placeholder gets replaced when the bundle is actually built.

See also: [[148-SPEC]] §3 + §5, [[153-plugin-runtime]].
