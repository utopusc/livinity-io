# Phase 209 Summary — openclaw → Claude CLI reuse + Haiku 4.5 default

**Shipped:** 2026-05-26 (5-min Mini PC ops — no source code change)
**Status:** ✅ CODE-COMPLETE + DEPLOYED (operator UAT for AI-04/05/06 deferred to Phase 217)

## What shipped

Liv AI chat agent's default model swapped from `openrouter/nvidia/nemotron-nano-9b-v2:free` to `claude-cli/claude-haiku-4-5`. The gateway now uses openclaw's native `claude-cli` provider, which spawns `/usr/bin/claude` as a subprocess and reuses an existing Anthropic Max OAuth credential — preserving the sacred subscription-only rule.

## Live Mini PC mutations

```
+ /home/bruce/.claude/                       (new, mode 0700, bruce-owned)
+ /home/bruce/.claude/.credentials.json      (new, mode 0600, copy of /root/.claude/.credentials.json)
+ /opt/livos/data/openclaw/openclaw.json.bak.20260526   (rollback snapshot)
~ /opt/livos/data/openclaw/openclaw.json     (primary model + cliBackends patched)
```

## Spec corrections during execution

Two corrections to v41-DRAFT.md spec — sourced from openclaw 2026.5.20 runtime introspection (`dist/doctor-claude-cli-UgSJI9UJ.js`):
1. Model id is `claude-cli/claude-haiku-4-5` (NOT `anthropic/claude-haiku-4-5`).
2. The 5-step `openclaw models auth login --method cli --set-default` flow does not exist non-interactively. The claude-cli reuse path is purely file-level: ensure `$HOME/.claude/.credentials.json` is readable + `claude` binary is on PATH + config sets the right provider/model id. No `auth login` command needed.

## Ship-gate evidence

```
May 26 02:23:47 bruce-EQ env[2682196]: - claude-cli/claude-haiku-4-5 model configured, enabled automatically.
May 26 02:23:50 bruce-EQ env[2682196]: 2026-05-26T02:23:50.564-07:00 [gateway] agent model: claude-cli/claude-haiku-4-5 (thinking=medium, fast=off)
```

Service active, zero post-restart nemotron lines, JSON config round-trip valid.

## Carry-overs to Phase 217 (E2E UAT)

- AI-04: Liv AI chat coord-click success rate ≥80% (was ~30% with nemotron 9B) — needs 30-min live battery.
- AI-05: Per-call latency p50 ≤1.5s (was ~3-5s) — needs latency measurement during live use.
- AI-06: Zero subscription quota errors during 30-min UAT session — needs live use.

## Sacred SHA

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` — UNTOUCHED. Phase 209 makes zero source-code changes (pure config + filesystem ops on Mini PC).

## Effort

~10 min wall-clock total: ~5 min probing + spec correction + ~3 min execution + ~2 min docs.
