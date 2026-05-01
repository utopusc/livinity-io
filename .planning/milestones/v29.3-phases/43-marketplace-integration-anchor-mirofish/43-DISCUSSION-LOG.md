# Phase 43: Marketplace Integration (Anchor: MiroFish) - Discussion Log

> **Audit trail only.** Decisions in 43-CONTEXT.md.

**Date:** 2026-04-30
**Phase:** 43-marketplace-integration-anchor-mirofish
**Mode:** `--chain` (Claude presented 8-decision batch summary, user accepted all)

## Batch Decision Summary

| # | Decision | Recommended | Selected |
|---|----------|-------------|----------|
| 1 | Manifest flag | `requiresAiProvider?: boolean` (Zod, camelCase) | ✓ |
| 2 | Env vars | 3 at once: ANTHROPIC_BASE_URL + ANTHROPIC_REVERSE_PROXY + LLM_BASE_URL | ✓ |
| 3 | Network | `extra_hosts: ["livinity-broker:host-gateway"]` per-user compose injection | ✓ |
| 4 | Inject location | apps.ts installForUser → compose-generator.ts (new injectAiProviderConfig fn) | ✓ |
| 5 | MiroFish image | Try `ghcr.io/666ghj/mirofish:latest` first; fork+build fallback | ✓ |
| 6 | MiroFish manifest | Author per Livinity store conventions (audit determines exact path) | ✓ |
| 7 | UI badge | "Uses your Claude subscription" pill on marketplace card | ✓ |
| 8 | Smoke test | Manual UAT — Mini PC install + UI prompt + Claude response screenshot | ✓ |

**User's choice:** "Hepsini onayla, devam et"

## Claude's Discretion
- UI badge as separate plan or rolled in
- Schema test mount location
- injectAiProviderConfig logging verbosity
- Fork+build path landing in this phase or 43.1 followup

## Deferred Ideas
- Dify, RAGFlow, CrewAI templates (future v30+)
- BYOK toggle (D-NO-BYOK locked)
- Cost forecasting (Phase 44)
- Marketplace filter "Subscription-powered"
