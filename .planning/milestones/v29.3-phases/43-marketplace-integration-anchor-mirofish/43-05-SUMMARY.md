# Plan 43-05 Summary — Manual UAT for MiroFish Anchor

**Plan:** 43-05
**Phase:** 43 — Marketplace Integration (Anchor: MiroFish)
**Status:** COMPLETE
**Requirement:** FR-MARKET-02 (acceptance gate)

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `.planning/phases/43-marketplace-integration-anchor-mirofish/43-UAT.md` | 204 | Operator-facing manual UAT for MiroFish anchor verification |

## UAT Section Map

| Section | Title | Coverage |
|---------|-------|----------|
| A | Prerequisites | Phase 41+42 prereqs + Phase 43 deploy + sibling-repo PR + Path B image publish |
| B | Pre-flight: MiroFish appears in marketplace | UI visibility + badge rendering |
| C | POSITIVE — install + inspect compose | FR-MARKET-01 SC #1 live verification (env vars + extra_hosts in generated compose) |
| D | POSITIVE — open UI + prompt + Claude response | FR-MARKET-02 SC #3 (subscription end-to-end) |
| E | NEGATIVE — install app WITHOUT flag | FR-MARKET-01 SC #2 live verification |
| F | DOM-grep — zero "API key" inputs | FR-MARKET-02 SC #4 (no BYOK prompt) |
| G | Broker access log evidence | Confirms broker-routed subscription request transit |
| H | Screenshot evidence checklist | 4 mandatory screenshots |
| I | Notes & deferred items | Multi-user concurrent + rate-limit + Path B caveats |

## Sacred File + Source Tree Verification

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
623a65b9a50a89887d36f770dcd015b691793a7f
$ git diff HEAD -- nexus/packages/core/src/sdk-agent-runner.ts | wc -l
0
$ git diff HEAD -- livos/packages/livinityd/source/modules/livinity-broker/ | wc -l
0
$ git diff HEAD -- livos/ | wc -l
0
$ git diff HEAD -- nexus/ | wc -l
0
```

This plan is `.planning/`-only — touches NO LivOS source and NO Nexus source. Sacred file + broker module untouched.

## Handoff

**Phase 43 is COMPLETE locally.** Operator must:

1. **Push commits to origin/master** (DEFERRED per `<scope_boundaries>` — Claude executor does NOT push)
2. **Build + push MiroFish image:** `ghcr.io/utopusc/mirofish:v29.3` (Path B fork+build per Plan 43-01 audit Section 4)
3. **Open + merge sibling-repo PR** to `utopusc/livinity-apps` (using draft files from `draft-mirofish-manifest/`)
4. **Deploy to Mini PC via `bash /opt/livos/update.sh`** (DEFERRED per `<scope_boundaries>`)
5. **Run 43-UAT.md** end-to-end on Mini PC to validate FR-MARKET-02 acceptance gate

Once UAT passes, Phase 43 is ready to ship. Phase 44 (per-user usage dashboard) can begin.
