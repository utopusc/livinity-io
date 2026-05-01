# Phase 41: Anthropic Messages Broker - Discussion Log

> **Audit trail only.** Decisions in 41-CONTEXT.md.

**Date:** 2026-04-30
**Phase:** 41-anthropic-messages-broker
**Mode:** `--chain` (interactive: Claude presented 8-recommendation batch, user accepted all; chain triggers auto plan+execute after)

---

## Batch Decision Summary (presented to user, all accepted)

| # | Decision | Recommended | Selected |
|---|----------|-------------|----------|
| 1 | Where broker lives | livinityd Express mount, port 8080 | ✓ |
| 2 | user_id resolution | URL path: `/u/<user_id>/v1/messages` | ✓ |
| 3 | Container ↔ broker network | `extra_hosts: ["livinity-broker:host-gateway"]` (Phase 43 implements injection) | ✓ |
| 4 | SdkAgentRunner reuse | Single shared instance + `homeOverride` per-call | ✓ |
| 5 | SSE translation | SdkAgentRunner emitEvent → Anthropic SSE chunks adapter | ✓ |
| 6 | Tool definitions | Client-provided tools IGNORED; LivOS MCP tools only | ✓ |
| 7 | AI Chat HOME wiring (Phase 40 carry-forward) | INCLUDED in Phase 41 scope | ✓ |
| 8 | Auth on broker | Loopback bind + Docker bridge IP guard; no signed headers (defense-in-depth deferred) | ✓ |

**User's choice:** "Hepsini onayla, devam et" (Approve all, continue).

---

## Codebase Scout Findings

- `livos/packages/livinityd/source/modules/server/index.ts` — Express app initialization at line 239; route mounts at lines 437 / 951 / 978 / 996 / 1126 / 1208. Broker route mounts here.
- `nexus/packages/core/src/sdk-agent-runner.ts` — `emitEvent` at line 175; events emitted: `thinking` (284), `chunk` (358), `tool_use` (377), `final_answer` (401), `error` (430). These map to Anthropic SSE chunks.
- Phase 40's `homeOverride` plumbing (sdk-agent-runner.ts line 266) is the key reuse point.

## Claude's Discretion

- Module file structure (split or single)
- Streaming buffer size
- Logging verbosity

## Deferred Ideas

- OpenAI-compat endpoint (Phase 42)
- Manifest injection (Phase 43)
- Dashboard (Phase 44)
- HMAC headers (future hardening)
- Per-user rate limiting (Anthropic already enforces)
- Token observability (Phase 44)
- WebSocket transport (not in spec)
- Multi-account broker (out of v29.3)
