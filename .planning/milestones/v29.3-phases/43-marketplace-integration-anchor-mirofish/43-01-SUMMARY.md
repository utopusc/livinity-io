# Plan 43-01 Summary — Codebase Audit + MiroFish Image Discovery

**Plan:** 43-01
**Phase:** 43 — Marketplace Integration (Anchor: MiroFish)
**Status:** COMPLETE
**Commit:** `0bb60bb0`
**Duration:** ~10 min

## Deliverable

`.planning/phases/43-marketplace-integration-anchor-mirofish/43-AUDIT.md` — 454 lines, 8 sections.

## Section Summaries

1. **Sacred File + Broker Freeze Re-Verification** — sdk-agent-runner.ts SHA `623a65b9a50a89887d36f770dcd015b691793a7f` (Phase 40 baseline preserved). Broker module byte-frozen at Phase 42 final commit.
2. **Integration Point Decision** — `injectAiProviderConfig()` is a NEW pure function in `livos/packages/livinityd/source/modules/apps/inject-ai-provider.ts`. Called from `apps.ts:installForUser` between line 958 (per-service patches done) and line 961 (host port mapping). NOT in compose-generator.ts (which only handles built-in apps; would miss the marketplace path).
3. **Manifest Store Path** — sibling repo `https://github.com/utopusc/livinity-apps.git` (constants.ts:2). Plan 43-03 produces a draft in `.planning/.../draft-mirofish-manifest/`; operator commits + PRs to the sibling repo. Mini PC auto-pulls within 5 min (`updateInterval: '5m'`).
4. **MiroFish Image Publish State** — **Path B (fork+build).** GHCR returns 401-without-issuable-token; Docker Hub returns "object not found". Upstream repo HAS a Dockerfile (EXPOSE 3000 + 5001). Plan 43-03 manifest references future image `ghcr.io/utopusc/mirofish:v29.3` and the README documents the operator's fork+build+push commands. Web port: 3000.
5. **UI Badge Insertion Point** — `livos/packages/ui/src/modules/app-store/app-page/app-content.tsx`. RegistryApp type is INFERRED from tRPC procedure return; new field flows automatically. Add Badge import; insert `{app.requiresAiProvider && <Badge variant='secondary'>Uses your Claude subscription</Badge>}` near AboutSection.
6. **Test Infrastructure Pattern** — Pure unit tests (43-02): bare `tsx + node:test + node:assert/strict` (matches Phase 41/42 broker pattern). Integration tests (43-04): `vitest` with `vi.mock` (matches existing apps.integration.test.ts). npm script chain: `test:phase43 -> test:phase42`.
7. **Risks & Open Questions (R1-R6)** — listed below for downstream plans.
8. **Deferred to Plans 43-02..05** — explicit per-plan checklist.

## Verification Results

- Sacred file SHA: `623a65b9a50a89887d36f770dcd015b691793a7f` (MATCHES Phase 40 baseline)
- `git diff HEAD -- nexus/packages/core/src/sdk-agent-runner.ts | wc -l`: `0`
- `git diff HEAD -- livos/packages/livinityd/source/modules/livinity-broker/ | wc -l`: `0`
- 43-AUDIT.md: 454 lines, all 8 sections present, all required tokens present (`623a65b9...`, `injectAiProviderConfig`, `livinity-apps`, `MiroFish`)

## MiroFish Image Path Decision

**Path B chosen** — fork+build required. Operator must:
1. Fork `666ghj/MiroFish` to `utopusc/MiroFish`
2. Build image: `docker build -t ghcr.io/utopusc/mirofish:v29.3 .`
3. Push to GHCR: `docker push ghcr.io/utopusc/mirofish:v29.3`
4. THEN merge sibling-repo `livinity-apps` PR

## Risks for Downstream Plans (R1-R6)

| ID | Risk | Owner |
|----|------|-------|
| R1 | `validateManifest` currently bypasses Zod schema (TODO: enable) — new field passes through via permissive cast | Plan 43-02 verifies field survives the read path |
| R2 | Negative case (no env injection when flag absent) is mandatory | Plan 43-04 owns the negative integration test |
| R3 | js-yaml may give env as object OR array; extra_hosts may be absent | Plan 43-02 unit tests cover OBJECT-form env + ABSENT extra_hosts; ARRAY-form env not supported (assert OBJECT-form is the contract) |
| R4 | UI cannot truly verify rendered DOM in unit test | Plan 43-04 asserts file contents only; runtime verification = Plan 43-05 UAT |
| R5 | userId must be used VERBATIM in URL (not username) | Plan 43-02 tests assert |
| R6 | Byte-identical compose for legacy apps without flag | Plan 43-04 owns regression test (deep-equal) |

## Handoff to Plan 43-02

Plans 43-02..05 may proceed. Plan 43-02 is the next step — schema field + injection module + 14 unit tests + apps.ts wiring. Atomic commit.
