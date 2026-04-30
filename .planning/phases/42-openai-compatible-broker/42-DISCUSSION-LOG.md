# Phase 42: OpenAI-Compatible Broker - Discussion Log

> **Audit trail only.** Decisions in 42-CONTEXT.md.

**Date:** 2026-04-30
**Phase:** 42-openai-compatible-broker
**Mode:** `--chain` (Claude presented 7-decision batch summary, user accepted all)

## Batch Decision Summary

| # | Decision | Recommended | Selected |
|---|----------|-------------|----------|
| 1 | Translation strategy | In-process TS (NO LiteLLM container) | ✓ |
| 2 | Mount location | Same broker module, new files `openai-translator.ts` + `openai-router.ts` | ✓ |
| 3 | Call chain | OpenAI → Anthropic format → reuse Phase 41 → Anthropic response → OpenAI format | ✓ |
| 4 | Model aliasing | Hardcoded (gpt-* / claude-* → claude-sonnet-4-6 default) | ✓ |
| 5 | Tool calls | IGNORE with warn log (carries D-41-14 forward) | ✓ |
| 6 | SSE format | OpenAI Chat Completions streaming spec | ✓ |
| 7 | Smoke test | Manual UAT with official `openai` Python SDK + automated SSE-format unit test | ✓ |

**User's choice:** "Hepsini onayla, devam et"

## Claude's Discretion
- OpenAI spec field validation strictness
- UUID generation helper sharing
- Logging verbosity

## Deferred Ideas
- LiteLLM sidecar (future format coverage gaps)
- Tool / function calling support (out of v29.3)
- Configurable model aliasing via Redis
- Vision / multimodal pass-through
- Embeddings endpoint
