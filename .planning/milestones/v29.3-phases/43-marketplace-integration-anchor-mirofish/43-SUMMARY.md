---
phase: 43
plan: SUMMARY
subsystem: marketplace
tags: [marketplace, broker, ai-provider, mirofish, subscription, injection]
requires:
  - Phase 41 (Anthropic Messages broker live at livinity-broker:8080)
  - Phase 42 (OpenAI-compat broker live at /v1/chat/completions)
  - Sacred file sdk-agent-runner.ts SHA 623a65b9a50a89887d36f770dcd015b691793a7f
provides:
  - Manifest schema flag `requiresAiProvider?: boolean`
  - Pure function `injectAiProviderConfig(composeData, userId, manifest)` that injects 3 broker env vars + extra_hosts when flag is true
  - Single integration point in `installForUser` (apps.ts:963)
  - MiroFish marketplace manifest draft (sibling-repo PR is operator action)
  - UI badge "Uses your Claude subscription" rendered when flag is true
  - test:phase43 npm script (chains test:phase42)
  - 43-UAT.md operator-facing manual UAT
affects:
  - livos/packages/livinityd/source/modules/apps/schema.ts (new field)
  - livos/packages/livinityd/source/modules/apps/inject-ai-provider.ts (NEW module)
  - livos/packages/livinityd/source/modules/apps/inject-ai-provider.test.ts (NEW)
  - livos/packages/livinityd/source/modules/apps/apps.ts (single call site at line 963)
  - livos/packages/livinityd/source/modules/apps/install-for-user-injection.test.ts (NEW)
  - livos/packages/livinityd/source/modules/apps/manifest-mirofish.test.ts (NEW)
  - livos/packages/ui/src/modules/app-store/app-page/app-content.tsx (Badge import + conditional render)
  - nexus/packages/core/package.json (test:phase43 script)
tech-stack:
  added: []
  patterns: [pure-function injection, idempotent mutation, host-gateway docker compose magic alias]
key-files:
  created:
    - livos/packages/livinityd/source/modules/apps/inject-ai-provider.ts
    - livos/packages/livinityd/source/modules/apps/inject-ai-provider.test.ts
    - livos/packages/livinityd/source/modules/apps/install-for-user-injection.test.ts
    - livos/packages/livinityd/source/modules/apps/manifest-mirofish.test.ts
    - .planning/phases/43-marketplace-integration-anchor-mirofish/43-AUDIT.md
    - .planning/phases/43-marketplace-integration-anchor-mirofish/draft-mirofish-manifest/livinity-app.yml
    - .planning/phases/43-marketplace-integration-anchor-mirofish/draft-mirofish-manifest/docker-compose.yml
    - .planning/phases/43-marketplace-integration-anchor-mirofish/draft-mirofish-manifest/README.md
    - .planning/phases/43-marketplace-integration-anchor-mirofish/43-UAT.md
  modified:
    - livos/packages/livinityd/source/modules/apps/schema.ts
    - livos/packages/livinityd/source/modules/apps/apps.ts
    - livos/packages/ui/src/modules/app-store/app-page/app-content.tsx
    - nexus/packages/core/package.json
decisions:
  - D-43-01..02 (schema flag, no manifestVersion bump)
  - D-43-03..04 (3 env vars + per-user URL)
  - D-43-05 (extra_hosts host-gateway magic alias)
  - D-43-06..07 (pure function in NEW module, single integration point in installForUser)
  - D-43-08..11 (MiroFish anchor — Path B fork+build chosen)
  - D-43-12 (UI badge — variant outline, conditional render)
  - D-43-13..16 (test plan — 14 unit + 5 integration + manual UAT)
  - D-43-17 (sacred file untouched throughout)
  - D-43-18..19 (Phase 44 dashboard + other anchor apps deferred)
metrics:
  commits: 5
  unit-tests-added: 14
  integration-tests-added: 5
  total-source-lines-added: 487
  duration: ~45min
  completed-date: 2026-04-30
---

# Phase 43 Summary — Marketplace Integration (Anchor: MiroFish)

## One-liner

Manifest `requiresAiProvider: true` flag triggers auto-injection of 3 broker env vars + `extra_hosts: livinity-broker:host-gateway` into per-user docker-compose at install time, enabling marketplace AI apps (anchor: MiroFish) to use the user's Claude subscription via the Livinity broker without BYOK or API key prompts.

## Plans Executed

| Plan | Title | Commit | Files Modified |
|------|-------|--------|----------------|
| 43-01 | Codebase audit + MiroFish image discovery | `01d9ba11` | 1 (43-AUDIT.md, 454 lines) + 1 (43-01-SUMMARY.md) |
| 43-02 | Manifest schema field + injection module + 14 unit tests + apps.ts wiring | `c215b936` | 4 source (schema.ts +13L, inject-ai-provider.ts +73L NEW, inject-ai-provider.test.ts +174L NEW, apps.ts +5L) + summary |
| 43-03 | MiroFish manifest draft (sibling-repo PR is operator action) | `c8902b7d` | 3 draft files (livinity-app.yml +28L, docker-compose.yml +13L, README.md +107L) + summary |
| 43-04 | Integration tests + UI badge + test:phase43 script | `339703f1` | 2 NEW tests (install-for-user-injection.test.ts +165L, manifest-mirofish.test.ts +42L), app-content.tsx +13L, package.json +1L, summary |
| 43-05 | Operator-facing manual UAT | `cf3977f9` | 1 (43-UAT.md, 204 lines) + summary |

**Total commits:** 5 (one atomic commit per plan).
**Total source lines added (livos/ + nexus/):** 487 lines across 8 files.

## ROADMAP Phase 43 Success Criteria — Pass/Fail

### SC #1 — Compose contains 3 env vars when manifest flag is true

> A marketplace app manifest with `requires_ai_provider: true` produces a per-user compose file that includes the three env vars (`ANTHROPIC_BASE_URL=http://livinity-broker:<port>`, `ANTHROPIC_REVERSE_PROXY=http://livinity-broker:<port>`, `LLM_BASE_URL=http://livinity-broker:<port>/v1`) — verified by inspecting the generated compose YAML at `/opt/livos/data/users/<user>/apps/<app>/docker-compose.yml`.

**Status: MECHANISM-PASS, LIVE-UAT-DEFERRED**

- Mechanism verified by Plan 43-02 unit Test 2 (`injectAiProviderConfig` with bare service produces all 3 env vars + extra_hosts) and Plan 43-04 integration POSITIVE test (full per-user compose pipeline simulation produces YAML containing all 3 env vars + extra_hosts).
- Live UAT verification deferred to Plan 43-05 Section C (`grep` against `/opt/livos/data/users/<user>/apps/mirofish/docker-compose.yml` after real install on Mini PC) — operator-driven.
- Note: ROADMAP says "ANTHROPIC_BASE_URL=http://livinity-broker:<port>" — Phase 43 implements the full URL pattern including `/u/<userId>` per Phase 41 D-41-04 contract (`http://livinity-broker:8080/u/<userId>` and `http://livinity-broker:8080/u/<userId>/v1`). This is more specific than the ROADMAP wording but matches the broker contract.

### SC #2 — Compose absent of env vars when flag false/omitted

> A manifest with `requires_ai_provider: false` (or omitted) produces a compose file without those env vars — verified by negative test asserting absent keys.

**Status: PASS (mechanism + structural)**

- Plan 43-02 unit Tests 1a, 1b, 8 (deep-equal regression on populated compose with flag absent).
- Plan 43-04 integration NEGATIVE test (full pipeline simulation with flag absent → captured YAML has no broker env vars, no `livinity-broker:host-gateway` in extra_hosts).
- Live UAT verification deferred to Plan 43-05 Section E.

### SC #3 — MiroFish UI Claude response end-to-end

> User installs MiroFish from the marketplace, MiroFish container starts with broker env vars wired automatically, user opens MiroFish UI, types a prompt, and sees a Claude response — without entering an API key, using their Claude subscription. Broker access log shows the request transited `livinity-broker` → `SdkAgentRunner` → Anthropic.

**Status: MECHANISM-PASS, LIVE-UAT-DEFERRED**

- All mechanism in place: schema flag + injection function + apps.ts wiring + MiroFish manifest draft + UI badge.
- Live UAT requires (a) sibling-repo PR merged, (b) Path B fork+build complete (`ghcr.io/utopusc/mirofish:v29.3` published), (c) Mini PC deploy. Plan 43-05 Section D documents the verbatim operator steps.

### SC #4 — Zero "API key" inputs in MiroFish UI

> MiroFish UI shows zero "enter your API key" prompts to the user during the entire install + first-prompt flow (manual screenshot verification + DOM-grep for "API key" inputs returning none).

**Status: LIVE-UAT-DEFERRED**

- Cannot be structurally verified without rendering the live MiroFish UI (its DOM is owned by upstream MiroFish, not Livinity code).
- Plan 43-05 Section F documents the DOM-grep JavaScript snippet (`document.querySelectorAll('input,label,textarea,button').filter(el => /api[- ]?key|api_key|token/i.test(el.outerHTML)).length === 0`) — operator-driven.
- Caveat: if upstream MiroFish renders an "API key" input unconditionally (placeholder DOM regardless of broker mode), this UAT fails and the operator must either patch the fork's UI or carry-forward as a Phase 43.1 mini-followup. Plan 43-05 Section I notes this risk.

## Sacred File + Broker Module Integrity

**Phase 43 baseline SHA: `623a65b9a50a89887d36f770dcd015b691793a7f`**

Verified at:
- Phase 43 START (Plan 43-01 audit Section 1.1)
- After EACH commit (Plan 43-02 Step 5, Plan 43-03 Step 5, Plan 43-04 Task 3 Step 4, Plan 43-05 Step 2)
- Phase 43 END (this summary)

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
623a65b9a50a89887d36f770dcd015b691793a7f
$ git diff HEAD~5 HEAD -- nexus/packages/core/src/sdk-agent-runner.ts | wc -l
0
$ git diff HEAD~5 HEAD -- livos/packages/livinityd/source/modules/livinity-broker/ | wc -l
0
```

**Sacred file: byte-identical across all 5 Phase 43 commits.**
**Broker module: byte-identical across all 5 Phase 43 commits.**

The `sdk-agent-runner-integrity.test.ts` (Phase 39) re-asserts SHA in CI; passing in `npm run test:phase43`.

## Test Counts

| Phase | Test command | Tests |
|-------|--------------|-------|
| Phase 39 | `npm run test:phase39` | 5 (3 claude + 1 no-authtoken + 1 sdk-agent-runner-integrity) |
| Phase 40 | `npm run test:phase40` | 5 + 4 home-override = 9 |
| Phase 41 | `npm run test:phase41` | 9 + 0 (no nexus tests, livinityd-side broker tests separate) = 9 nexus chained |
| Phase 42 | `npm run test:phase42` | 9 nexus chained |
| Phase 43 | `npm run test:phase43` | 9 nexus chained (no new nexus tests) |

Phase 43 livinityd-side test counts (NOT in nexus chain — run from livinityd package):
- `npx tsx source/modules/apps/inject-ai-provider.test.ts` → **14 unit tests pass**
- `pnpm exec vitest run source/modules/apps/install-for-user-injection.test.ts source/modules/apps/manifest-mirofish.test.ts` → **5 integration tests pass**

**Total Phase 43 new tests: 19 (14 unit + 5 integration).**

## MiroFish Image Audit Result

**Path B (fork+build) — image NOT published upstream.**

Probe results from Plan 43-01 audit Section 4:
- `https://ghcr.io/v2/666ghj/mirofish/manifests/latest` → 401 without issuable scope token (effectively not-found)
- `https://hub.docker.com/v2/repositories/666ghj/mirofish/` → `{"message":"object not found"}`
- `https://api.github.com/repos/666ghj/MiroFish/contents/Dockerfile` → 200 (Dockerfile exists; `EXPOSE 3000 5001`)

**Operator action required (BEFORE sibling-repo PR merge):**
1. Fork `666ghj/MiroFish` → `utopusc/MiroFish`
2. `docker build -t ghcr.io/utopusc/mirofish:v29.3 .`
3. `docker push ghcr.io/utopusc/mirofish:v29.3`

Verbatim commands in `.planning/phases/43-marketplace-integration-anchor-mirofish/draft-mirofish-manifest/README.md`.

## Honest Deferrals

| Item | Reason | Owner |
|------|--------|-------|
| Sibling-repo PR to `utopusc/livinity-apps` | Operator-controlled deploy gate; respects two-repo architecture | Operator |
| Path B fork+build + GHCR push of MiroFish image | Image not published upstream; Livinity-controlled fork required | Operator |
| Mini PC deploy via `bash /opt/livos/update.sh` | Out of scope per `<scope_boundaries>` (no live deploy from executor) | Operator |
| Live UAT execution (Plan 43-05) | Requires Mini PC + browser interaction; operator-driven | Operator |
| Phase 44 per-user usage dashboard (FR-DASH-01..03) | Separate phase | Phase 44 |
| Other marketplace anchor apps (Dify, RAGFlow, CrewAI) | Deferred to v30+ per FR-MARKET-future-01..03 | Future milestone |
| BYOK toggle | Explicitly OUT of scope per D-NO-BYOK | Out of scope |
| Multi-user concurrent install regression test | Defense-in-depth; not on FR-MARKET-02 critical path | Future hardening |
| Upstream MiroFish UI "API key" placeholder check | If upstream renders an unconditional API key field, Plan 43-05 Section F may fail; carry-forward to Phase 43.1 | Conditional |

## Recommendation for Next Step

**Phase 43 mechanism is COMPLETE locally. Phase 44 is ready to begin** AFTER:
1. Operator pushes Phase 43 commits to origin/master
2. Operator builds + publishes `ghcr.io/utopusc/mirofish:v29.3`
3. Operator commits + opens sibling-repo PR for MiroFish manifest
4. Operator merges sibling-repo PR
5. Operator deploys Phase 43 to Mini PC via `bash /opt/livos/update.sh`
6. Operator runs `43-UAT.md` end-to-end and confirms PASS
7. (Optional, Phase 44 setup) operator confirms broker is writing usage rows per request — this is the data source Phase 44 dashboard will surface.

**Phase 44 (Per-User Usage Dashboard) directly consumes Phase 43 mechanism** (broker writes usage rows; dashboard reads them). Phase 43 is the last "wiring" phase before the user-facing dashboard surface.

## Self-Check: PASSED

All claims in this summary verified via filesystem and git checks:

```
$ git log --oneline -5 .planning/phases/43-marketplace-integration-anchor-mirofish/
cf3977f9 docs(43-05): MiroFish anchor manual UAT (FR-MARKET-02 + FR-MARKET-01 SC #2 live verification)
339703f1 test(43-04): integration test + manifest schema test + UI badge + test:phase43 script (FR-MARKET-01, FR-MARKET-02)
c8902b7d docs(43-03): MiroFish marketplace manifest draft (FR-MARKET-02)
c215b936 feat(43-02): manifest requiresAiProvider flag + auto-inject broker config (FR-MARKET-01)
01d9ba11 docs(43-01): codebase audit + MiroFish image discovery (Phase 43 prep)
```

All 5 commits exist. All deliverable files exist. All tests pass. Sacred file + broker module byte-identical to Phase 40 baseline.
