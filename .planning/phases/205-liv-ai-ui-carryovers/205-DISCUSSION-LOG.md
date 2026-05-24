# Phase 205: Liv AI UI Carry-Over Bundle — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-24
**Phase:** 205-liv-ai-ui-carryovers
**Areas discussed:** Entry-point + dialog shell, MCP Servers tab, MCP propagation strategy, Gateway tab CRUD, Self-lock guard mechanism, Token rotation behavior
**Modes used:** Initial SPEC.md Socratic interview (interactive, 3 rounds) → discuss-phase `--auto` consolidation pass

---

## Entry-point + dialog shell

> Source: SPEC.md Round 2 (Simplifier) — user explicitly re-scoped here.

| Option | Description | Selected |
|--------|-------------|----------|
| Per-chat provider scope only (single sub-feature) | Treat 205-01 as the headline; defer MCP + Gateway to later phases | |
| Three independent surfaces (sidebar MCP + dialog gateway + chat-strip provider) | Original Phase 205 framing — three parallel sub-features | |
| **Unified SettingsDialog with new tabs; bottom "Connected" tile → Settings button** | All three concerns route into one dialog accessed from a single entry button | ✓ |

**User's choice:** Unified SettingsDialog (user said in Turkish: "Settings butonu olustur ... Orada Claw in ayarlari vs olsun mcp olsun").
**Notes:** Re-scope dropped 205-01 entirely — operator confirmed the existing model dropdown in `SessionComposer.tsx` already handles per-chat provider scope via openclaw's session persistence.

---

## MCP Servers tab — content + interaction shape

| Option | Description | Selected |
|--------|-------------|----------|
| **Add/remove instant (livinityd McpBridge canlı reload)** | Mutation → bridge re-spawns; restart-free; operator never waits | ✓ |
| Add/remove + 5-state restart banner (Phase 204 pattern) | Safer; copy the Phase 204 ProvidersTab restart UX | |
| Read-only list + "Manage in Settings" link | Minimal scope; defers full CRUD to liv-ai-app | |

**User's choice:** Live propagation, no restart banner. Quote: "mcp eklediğimda OpenClaw da görsün ve bu mcpleri kullansin."
**Notes:** This is the hardest path technically (live bridge reload + Redis pub) but the right UX. Acceptance proof is journalctl absence of `systemctl restart`.

---

## MCP propagation mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| **livinityd McpBridge live reload + Redis `liv:mcp:updated` pub/sub** | Mirrors `liv:config:updated` pattern from `native-app-config.ts`. Bridge subscribes via ioredis duplicate connection | ✓ |
| Service-level restart on every mutation | Easier; bad UX (30s ban + journalctl noise) | |
| Manual "Reload OpenClaw" button | Two-step; operator-driven | |

**User's choice (auto-resolved during SPEC interview):** Redis pub/sub + live bridge reload.
**Notes:** Channel name `liv:mcp:updated` chosen to keep parallel with existing `liv:config:updated` rather than overload it. Bridge needs a second ioredis connection because subscribe-mode blocks the connection.

---

## Gateway tab — CRUD scope

| Option | Description | Selected |
|--------|-------------|----------|
| Read-only control panel | View-only paired devices + origins + plugins; mutations still SSH | |
| Medium: device revoke + origins; auth mode locked | Solves operator pain (device whitelist) but token rotation stays SSH | |
| **Full CRUD: devices revoke + origins ekle/sil + auth mode + token rotation** | Maximum self-service; user explicitly chose this | ✓ |

**User's choice:** Full CRUD.
**Notes:** Risk surface is wide; the self-lock guard (next area) is the critical safety mechanism that makes this acceptable. Token rotation does NOT auto-push to paired devices (out of scope per SPEC); operator gets one-time copyable token after rotation.

---

## Self-lock guard mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm modal on every destructive op | Standard pattern; operator can still misclick | |
| **JWT-based self-detection at backend (deviceId/jti compare → FORBIDDEN)** | Server enforces; UI cannot accidentally bypass | ✓ |
| GitHub-style "type DELETE" friction | Strongest gate; high UX friction | |
| Browser cookie + IP combo | Cookie spoofable; IP unreliable | |

**User's choice:** JWT deviceId/jti server-side guard.
**Notes:** Reuses existing handshake-route JWT verification surface. Error code is `CANNOT_REVOKE_SELF` over the wire; user-facing toast is plain English. Tests live in `openclawos-gateway-router.test.ts`.

---

## Token rotation behavior

| Option | Description | Selected |
|--------|-------------|----------|
| **Rotate generates new token; existing devices forced to re-pair; new token shown once with copy button** | Operator-driven; no per-device push channel needed | ✓ |
| Rotate generates new token AND pushes to all paired devices via WS | Smooth UX but requires bidirectional push channel; high complexity | |
| Rotate + show token in audit log | No copy affordance; harder to use | |

**User's choice (auto-resolved):** Manual rotation + one-time copy banner.
**Notes:** Auto-push deferred to a future phase per SPEC out-of-scope.

---

## Claude's Discretion

The following implementation details were not explicitly discussed but are deferred to planner/researcher judgment with the recommended default noted in CONTEXT.md:

- Tab order in SettingsDialog (recommended: Connection → MCP Servers → Gateway)
- Toast / error-display component choice (defer to existing claw-client lib)
- Collapsible vs always-open Gateway section cards
- `auth.setMode` soft-restart behavior on `master` ↔ `token` transitions
- Card / form styling specifics within each tab body

## Deferred Ideas (full list)

See CONTEXT.md `<deferred>` section. Summary:
- Per-chat MCP allow/deny lists
- Plugin enable/disable inside Gateway tab
- Mobile responsive pass
- Type-DELETE confirmation pattern (replaced by self-lock guard)
- Audit log of revoke events (gateway journal already covers)
- Auto-push rotated token to paired devices
- Per-chat provider picker (205-01, dropped during SPEC interview)
- Backward-compat shim for old `/settings → MCP` tab
