# Phase 104 — Plan Set Coverage Audit

**Generated:** 2026-05-11 (post-planning)
**Plans:** 104-01 through 104-07 (7 plans, 6 waves)

## AC Coverage Matrix (from 104-VALIDATION.md)

Every requirement ID from VALIDATION.md (AC-104-1 through AC-104-16) MUST appear in at least one plan's `requirements` frontmatter field.

| AC ID | Plan(s) | Coverage |
|-------|---------|----------|
| AC-104-1  | 104-01, 104-02, 104-07 | TRIPLE — scaffold reachability + install dispatch + final user-walked install |
| AC-104-2  | 104-02, 104-07 | DOUBLE — idempotency harness creation + automated re-verify in walk |
| AC-104-3  | 104-06 | SINGLE — byte-equivalence regression test |
| AC-104-4  | 104-03, 104-07 | DOUBLE — dnsmasq install + final dig verify |
| AC-104-5  | 104-03, 104-07 | DOUBLE — config persists + walk re-asserts |
| AC-104-6  | 104-03, 104-07 | DOUBLE — /api/local/ca.crt route wired + walk verifies PEM serve |
| AC-104-7  | 104-03, 104-07 | DOUBLE — Caddy TLS chain wired + walk asserts via curl |
| AC-104-8  | 104-03 | SINGLE — pki-import preservation unit test (D-104-CADDY-PKI-IMPORT) |
| AC-104-9  | 104-05, 104-07 | DOUBLE — wizard subdomain input + walk multi-tenant routing assertion |
| AC-104-10 | 104-05, 104-07 | DOUBLE — platform-instructions UI + user-walked Apple device verification |
| AC-104-11 | 104-07 | SINGLE — reboot recovery test |
| AC-104-12 | 104-06, 104-07 | DOUBLE — automated cloud-regression caddy.service check + user-walked Mini PC update.sh |
| AC-104-13 | 104-01, 104-07 | DOUBLE — CDP bind verify on scaffold + walk |
| AC-104-14 | 104-01, 104-07 | DOUBLE — noVNC reachable on scaffold + walk |
| AC-104-15 | 104-04, 104-07 | DOUBLE — hybrid backend wired + tcpdump assertion in walk |
| AC-104-16 | 104-02 | SINGLE — install.sh --help + invalid-mode exit-code |

**Coverage:** 16/16 ACs covered. **NO MISSING ACs.**

## Source Decision Coverage (CONTEXT.md locked decisions)

| Decision | Implementing plan(s) |
|----------|----------------------|
| D-104-INSTALL-ENTRY (single install.sh + --mode flag) | 104-02 |
| D-104-INSTALL-MODES (cloud / local-lan / hybrid) | 104-02 (dispatch), 104-03 (local-lan), 104-04 (hybrid), 104-06 (cloud) |
| D-104-DEFAULT-MODE (hybrid default) | 104-02 (parse-cli.sh), 104-05 (ModePickStep "recommended" label) |
| D-104-LOCAL-DOMAIN (revised — per-mode TLDs) | 104-02 (env var LIVINITY_LOCAL_TLD), 104-03 (dnsmasq wildcard), 104-04 (hybrid HYBRID_DOMAIN_RE) |
| D-104-RELAY-ZERO-DATA-PLANE | 104-04 (architecture + static negative-grep test in caddy.test.ts), 104-05 (wizard messaging), 104-07 (runtime tcpdump assertion) |
| D-104-CADDY-PKI-IMPORT | 104-03 (mode-local-lan.sh writes pki-global.conf + caddy.ts emits import directive + test) |
| D-104-UAT-IMAGE (trfore/ubuntu2404-systemd) | 104-01 (Dockerfile FROM line) |
| D-104-UAT-CDP-BIND (Chrome --remote-debugging-address=0.0.0.0) | 104-01 (entrypoint.sh), 104-07 (walk.mjs AC-104-13 test) |
| D-104-NO-PROD-IMPACT | 104-03 (caddy.test.ts cloud-mode regression), 104-04 (hybrid is additive), 104-06 (full regression UAT), 104-07 (user-walked Mini PC verification) |

## Architecturally Sound: Cloud Mode Untouched

- `livos/install.sh` (existing back-compat shim referenced by `update.sh`) is NOT modified by ANY plan.
- `generateFullCaddyfile()` in `domain/caddy.ts` is NOT modified — only NEW functions `generateLocalCaddyfile` + `generateHybridCaddyfile` + `validateLocalTld` + `validateHybridDomain` are APPENDED.
- caddy.test.ts asserts `generateFullCaddyfile` cloud output contains NO `import`, NO `pki`, NO `ca liv-local`, NO `dns cloudflare` directives.
- docker/cloud-regression/ entrypoint runs negative checks: no `/etc/caddy/pki-global.conf`, no `/etc/dnsmasq.d/livinity.conf`, no local-lan directives in Caddyfile.
- 104-07 Task 2 user-walked checklist requires running `bash /opt/livos/update.sh` on the real Mini PC and confirming 4 services active + sacred SHA preserved.

## Sacred SHA Coverage

Every plan's success criteria includes "Sacred SHA UNTOUCHED on liv/packages/core/src/sdk-agent-runner.ts".

NO plan modifies any file under `liv/packages/core/src/`. Closest touch is `local-dns/routes.ts` reading from `domain/caddy.ts` — both under `livos/packages/livinityd/`, neither near the sacred file.

Pre-commit hook (Phase 100-01 installed `.husky/pre-commit` + `scripts/check-sacred.sh`) will enforce on every Phase 104 commit.

## File Ownership (Parallel Execution Safety)

**Wave 3 plans 104-03 + 104-04 share these files** (both append-only):
- `livos/packages/livinityd/source/modules/domain/caddy.ts` — both add NEW exports (104-03: generateLocalCaddyfile + validateLocalTld; 104-04: generateHybridCaddyfile + validateHybridDomain). No conflict — disjoint named exports.
- `livos/packages/livinityd/source/modules/domain/caddy.test.ts` — 104-03 creates; 104-04 appends new describe block.
- `livos/packages/livinityd/source/modules/local-dns/routes.ts` — 104-03 creates with 3 procedures (activate, getStatus, getCaCert); 104-04 adds 2 more (activateHybrid, getHybridStatus).
- `livos/packages/livinityd/source/modules/local-dns/routes.test.ts` — 104-03 creates; 104-04 appends.
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — 104-03 adds 3 httpOnlyPaths entries; 104-04 adds 2 more.

**Conflict resolution strategy:** 104-04 reads the post-104-03 state of these 5 files via `read_first` and appends to them. Both plans MUST be reviewed sequentially in code review even if executed in parallel — but the additions are line-disjoint.

**Alternative if executor concurrency is too risky:** Promote 104-04 from Wave 3 to Wave 4, making it sequential after 104-03. The plan-checker may flag this; the orchestrator can opt to sequentialize.

## Wave Dependency Graph

Explicit edges (post plan-checker revision, 2026-05-11):

```
Wave 1: 104-01 (UAT scaffold)
Wave 2: 104-02 (install.sh entry + dispatcher)         depends_on: 104-01
Wave 3: 104-03 (local-lan backend)                     depends_on: 104-02
Wave 3: 104-04 (hybrid backend)                        depends_on: 104-02
Wave 4: 104-05 (enrollment wizard UI)                  depends_on: 104-03, 104-04
Wave 5: 104-06 (cloud-mode regression UAT)             depends_on: 104-02
Wave 6: 104-07 (end-to-end UAT walk + checkpoint)      depends_on: 104-01, 104-03, 104-04, 104-05, 104-06
```

**Plan-checker ISS-01 (BLOCKER) fix applied:** 104-05 now declares `depends_on: ["104-03", "104-04"]` (previously listed 104-03 only). The wizard's LocalSetupWizard.tsx consumes `trpcReact.local.activateHybrid` and `trpcReact.local.getHybridStatus` — both added by 104-04 — so the build would fail if 104-04 had not landed before 104-05 executes. Wave stays at 4 (max(3, 3) + 1 = 4).

## Threat Model Aggregate Coverage

| Threat Category | Plans implementing mitigations |
|-----------------|--------------------------------|
| Tampering (input validation) | 104-02 (--mode whitelist), 104-03 (validateLocalTld + IPV4_RE), 104-04 (validateHybridDomain + HYBRID_DOMAIN_RE) |
| Information disclosure (secrets) | 104-02 (no env log), 104-04 (cf-token 0600 + redacted errors), 104-06 (env.shape no values) |
| Denial of service (idempotency) | 104-02 (idempotency harness), 104-03 (mv -f atomic write + grep-guard), 104-04 (Redis key reuse) |
| Spoofing (DNS / cert) | 104-03 (named CA — accepts LAN spoofing risk), 104-04 (public DNS + DNSSEC — recommended), 104-07 (tcpdump enforces no Server5 leak) |
| Elevation of privilege | 104-01 (--privileged isolation; no registry push), 104-04 (xcaddy as root accepted) |

## Granularity Check

Per `<scope_estimation>`: target 2-3 tasks per plan, ~50% context.

| Plan | Tasks | Notes |
|------|-------|-------|
| 104-01 | 2 | Dockerfile + helpers (~25%), walk.mjs stub + test wrapper (~20%) |
| 104-02 | 2 | Helpers (~25%), install.sh + stubs + idempotency harness (~30%) |
| 104-03 | 3 | mode-local-lan.sh (~15%), local-dns module + caddy.ts edit + tests (~35%), server/index.ts + tRPC wiring (~15%) |
| 104-04 | 3 | hybrid-provision module + tests (~25%), caddy.ts + routes hybrid (~25%), mode-hybrid.sh (~20%) |
| 104-05 | 2 | types + wizard root + ModePick + route entry (~30%), QR + platform + hybrid setup + tests (~30%) |
| 104-06 | 2 | mode-cloud.sh + capture-minipc-baseline.sh (~15%), docker/cloud-regression/ + test-cloud-byte-equivalence.sh (~30%) |
| 104-07 | 2 | walk.mjs full + helpers (~35%), checkpoint:human-verify (UAT-CHECKLIST.md) (~10%) |

All within budget. 104-03 + 104-04 + 104-05 + 104-07 are slightly larger; if executor agent reports >50% context, those plans are candidates to split into 104-03a/b etc. in execution. None warrant pre-split.

## Final Audit Outcome

✅ All 16 AC IDs covered.
✅ All locked decisions implemented in at least one plan with explicit reference.
✅ Sacred SHA preservation enforced in every plan's success criteria.
✅ D-104-NO-PROD-IMPACT enforced at 3 levels: unit test (104-03 caddy.test.ts), regression UAT (104-06), user-walked Mini PC verification (104-07).
✅ D-104-RELAY-ZERO-DATA-PLANE enforced architecturally (no Caddyfile directive routes through Server5), STATICALLY (new negative-grep test in 104-04 caddy.test.ts asserts Server5/Server4 IP absent from `generateHybridCaddyfile` output — plan-checker ISS-02 fix), AND at runtime (tcpdump in 104-07).
✅ Wave structure maximizes parallelism: Wave 1 → Wave 2 → Wave 3 (104-03 + 104-04 parallel with file-disjoint append-only edits) → Wave 4 (UI, 104-05 depends_on 104-03 + 104-04) → Wave 5 (cloud regression) → Wave 6 (UAT walk).
✅ Plan count: 7 (matches CONTEXT.md "Suggested wave layout (revised)" exactly).
✅ Plan-checker revisions applied (2026-05-11): ISS-01 (104-05 depends_on updated) + ISS-02 (104-04 negative-grep test added).
</content>
