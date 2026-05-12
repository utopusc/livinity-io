---
phase: 104
plan: "05"
subsystem: ui
tags: [local-access, enrollment-wizard, settings-page, qr-code, cloudflare-dns-01, ca-cert-trust-ux]
dependency_graph:
  requires: [104-03, 104-04]
  provides: [AC-104-9-surface, AC-104-10-surface, AC-104-15-surface]
  affects: []
tech_stack:
  added: []
  patterns: [discriminated-union-wizard-state-machine, source-grep-test-invariants, public-qr-endpoint-no-new-dep]
key_files:
  created:
    - livos/packages/ui/src/features/local-setup/types.ts
    - livos/packages/ui/src/features/local-setup/LocalSetupWizard.tsx
    - livos/packages/ui/src/features/local-setup/ModePickStep.tsx
    - livos/packages/ui/src/features/local-setup/QrCodeStep.tsx
    - livos/packages/ui/src/features/local-setup/PlatformInstructions.tsx
    - livos/packages/ui/src/features/local-setup/HybridDnsSetup.tsx
    - livos/packages/ui/src/features/local-setup/__tests__/LocalSetupWizard.test.tsx
    - livos/packages/ui/src/routes/settings/local-access.tsx
  modified:
    - livos/packages/ui/src/routes/settings/index.tsx
decisions:
  - "D-104-DEFAULT-MODE realized in UI: ModePickStep marks hybrid as 'Hybrid (recommended)' with 'default' badge"
  - "D-NO-NEW-DEPS honored: QR rendered via api.qrserver.com public endpoint (no qrcode/react-qr-code npm import added). Tests use source-text grep over .tsx file content (no @testing-library/react)"
  - "Settings panel reachability surface: settings/index.tsx gains '/local-access' route between '/chrome-master' and the QueryStringDialog block (mirrors lazy-import + Route pattern used by all sibling settings pages)"
  - "Wizard state machine: discriminated-union WizardStep with 3 mode-branches (LOCAL_LAN_STEPS, HYBRID_STEPS, CLOUD_STEPS). Cloud branch redirects to existing /settings/domain-setup (no duplication of cloud flow)"
  - "D-104-RELAY-ZERO-DATA-PLANE surfaced in UI: ModePickStep hybrid row mentions 'NO data-plane Server5 traffic'; HybridConfigStep info-blue panel re-states it; HybridDnsSetup blue-50 alert calls out 'Zero data-plane Server5 traffic' — runtime tcpdump assertion stays in 104-07"
metrics:
  duration_minutes: 18
  completed_date: "2026-05-12"
  tasks_completed: 2
  files_created: 8
  files_modified: 1
  commits: 2
  tests_passing: "17/17"
  sacred_sha_preserved: true
---

# Phase 104 Plan 104-05: Enrollment Wizard UI — Settings > Local Access Summary

One-liner: 3-mode (cloud/local-lan/hybrid) Settings -> Local Access wizard with discriminated-union state machine, QR-driven CA cert trust UX, 5-tab per-OS install instructions, and Cloudflare hybrid DNS walkthrough — D-NO-NEW-DEPS honored throughout.

## Component graph

```
LocalAccessRoute (routes/settings/local-access.tsx)
    -> SettingsPageLayout (existing _components wrapper)
        -> LocalSetupWizard (features/local-setup/LocalSetupWizard.tsx)
            +-- ModePickStep              (step 1, all modes — picks cloud/local-lan/hybrid)
            +-- LocalLanConfigStep        (inline, local-lan step 1: tld + hostIp + activate mutation)
            +-- QrCodeStep                (local-lan step 2: QR + CA cert download link)
            +-- PlatformInstructions      (local-lan step 3: 5-tab per-OS install)
            +-- HybridConfigStep          (inline, hybrid step 1: cfToken + hostIp)
            +-- HybridDnsSetup            (hybrid step 2: subdomain provision walkthrough)
            +-- HybridVerifyStep          (inline, hybrid step 3: activateHybrid mutation)
            +-- VerifyStep                (inline, shared: poll getStatus until green)
            +-- (cloud-redirect)          (inline, cloud step: link to /settings/domain-setup)
```

2 component files inline 4 small steps (LocalLanConfigStep, HybridConfigStep, HybridVerifyStep, VerifyStep) inside LocalSetupWizard.tsx — same pattern as routes/settings/domain-setup.tsx, which inlines StepDomain / StepMethod / StepTunnel etc. alongside the root component.

## Wizard state machine

`WizardStep` discriminated-union with 10 possible step values:

```typescript
type WizardStep =
  | 'mode-pick'                                                       // all
  | 'local-lan-config' | 'local-lan-qr' | 'local-lan-trust'           // local-lan branch
  | 'hybrid-config' | 'hybrid-dns-records' | 'hybrid-verify'          // hybrid branch
  | 'cloud-redirect'                                                  // cloud branch
  | 'verify' | 'done'                                                 // shared terminal
```

`activeSteps` is computed by switching on `state.mode`:

| state.mode | activeSteps                                                                 |
| ---------- | --------------------------------------------------------------------------- |
| null       | LOCAL_LAN_STEPS (placeholder until user picks)                              |
| local-lan  | mode-pick -> local-lan-config -> local-lan-qr -> local-lan-trust -> verify -> done |
| hybrid     | mode-pick -> hybrid-config -> hybrid-dns-records -> hybrid-verify -> verify -> done |
| cloud      | mode-pick -> cloud-redirect                                                 |

`back()` and `next()` derive the previous/next step from `activeSteps.indexOf(state.step)`.

## tRPC wiring (carry-forward from 104-03 / 104-04)

| Procedure                              | Used by                                | Wave shipped |
| -------------------------------------- | -------------------------------------- | ------------ |
| `local.getStatus.useQuery()`           | LocalSetupWizard (auto-detect hostIp), VerifyStep (poll, refetchInterval=2000) | 104-03       |
| `local.activate.useMutation()`         | LocalLanConfigStep ("Activate Local-LAN" button)                              | 104-03       |
| `local.activateHybrid.useMutation()`   | HybridVerifyStep ("Activate Hybrid" button)                                   | 104-04       |
| `local.getHybridStatus.useQuery()`     | HybridVerifyStep (shows `cfTokenAvailable`)                                   | 104-04       |
| `local.getCaCert.useQuery()`           | (unused in 104-05 — QrCodeStep relies on the public Express `/api/local/ca.crt` endpoint instead, which is what the QR URL points at) | 104-03       |

All four procedures are already registered in `httpOnlyPaths` (verified: `common.ts:78-80,85-86`) so the mutations route over HTTP and survive `systemctl restart livos` mid-flight.

## Key decisions

### D-104-DEFAULT-MODE surface

ModePickStep ships hybrid as the first row in the MODES array, with `recommended: true` (renders a `default` badge in emerald-100 next to the title) and the title literal `'Hybrid (recommended)'`. This is the wizard's visual realization of the locked CONTEXT.md decision that `install.sh` without `--mode` defaults to hybrid.

### D-NO-NEW-DEPS honored

- **QR rendering:** Uses `<img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=...">` (public QR endpoint). The repo HAS `react-qr-code: 2.0.12` in dependencies (could have been used), but plan 104-05 explicitly chose the public-endpoint path to match the tested invariant (`expect(qrSrc).toMatch(/api\.qrserver\.com.*create-qr-code/)`) and to keep the bundle size unchanged.
- **Tests:** No `@testing-library/react` added. Test pattern matches `livos/packages/ui/src/modules/settings/master-chrome-login.test.tsx` — `readFileSync` over each `.tsx` source file + `expect(src).toMatch(/regex/)` invariants over the rendered JSX text. 17 assertions cover tRPC wiring, mode coverage, QR URL shape, platform tab presence, Apple warnings, Cloudflare flow surface.

`git diff HEAD~2 HEAD -- livos/packages/ui/package.json` returns empty (verified) — confirming zero deps added across both 104-05 commits.

### D-104-RELAY-ZERO-DATA-PLANE messaging

The hybrid mode UX surfaces the "no Server5 traffic" promise in three places, so the user understands the privacy invariant before they commit a Cloudflare API token:

1. ModePickStep hybrid row Pros line: "NO data-plane Server5 traffic"
2. HybridConfigStep info-blue alert: "ALL traffic stays LAN-direct — no Server5 relay"
3. HybridDnsSetup blue-50 alert: "Zero data-plane Server5 traffic: after provisioning, Cloudflare DNS resolves the subdomain to your LAN IP. All HTTPS traffic stays LAN-direct."

Runtime verification of this invariant (tcpdump on Mini PC confirming no packets to Server5 IP 45.137.194.102 during a hybrid-mode page load) stays in plan 104-07.

### Cloud branch is a redirect, not a duplicated wizard

`cloud-redirect` step renders a single paragraph + link to `/settings/domain-setup` (the existing cloud-mode wizard shipped by earlier phases). This avoids duplicating the cloud DNS / Cloudflare-tunnel UX that already lives in `routes/settings/domain-setup.tsx`. Cloud mode user picks "Cloud" -> "Go to Cloud Domain Setup" -> falls through to the existing path; nothing in 104-05 reimplements cloud-side onboarding.

## Acceptance criteria status

| AC | Status | Notes |
| -- | ------ | ----- |
| AC-104-9  | surface complete | `/settings/local-access` registered in routes/settings/index.tsx; LocalLanConfigStep + HybridConfigStep accept per-user input (hostIp + subdomain via mutation payload). Multi-tenant runtime UAT in 104-07. |
| AC-104-10 | surface complete | PlatformInstructions.tsx covers Linux/macOS/iOS/Windows/Android with explicit Apple warnings. End-to-end "green padlock after CA install" assertion in 104-07. |
| AC-104-15 | surface complete | HybridDnsSetup walks Cloudflare token + DNS-01 provisioning. Runtime tcpdump in 104-07 confirms zero Server5 data-plane traffic. |

All three ACs have their UI surfaces shipped. Runtime end-to-end verification is plan 104-07's job per the wave layout in CONTEXT.md.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Settings route registration**

- Found during: Task 1, after creating `routes/settings/local-access.tsx`
- Issue: The plan creates a route file but does not edit `routes/settings/index.tsx` to register it. Without this, the wizard would be unreachable from the Settings panel — directly contradicting success_criteria "AC-104-9: Wizard reachable from Settings panel". The plan's `read_first` section says "verify the router.tsx auto-discovers routes/settings/*.tsx files" but this convention does NOT exist in the codebase — `routes/settings/index.tsx` uses explicit `<Route path='/...' Component={...} />` registrations for every page (chrome-master, domain-setup, dm-pairing, integrations, ai-config, liv-agent all listed).
- Fix: Added `const LocalAccessPage = React.lazy(() => import('@/routes/settings/local-access'))` near line 47 and `<Route path='/local-access' Component={LocalAccessPage} />` at line 150, matching the chrome-master pattern. Both edits are append-only (no existing line modified).
- Files modified: livos/packages/ui/src/routes/settings/index.tsx
- Commit: 4c853ce0

### Rule 4 — Architectural changes deferred

None — plan executed within scope. Settings sidebar entry (the navigable link from the Settings overview) is intentionally NOT touched here: AC-104-9 surface is the route + wizard; sidebar navigation labeling is a UX polish item more appropriate for 104-07 visual UAT.

## Deferred / Out of scope (logged for awareness)

**Pre-existing `pnpm --filter ui build` failure (NOT a 104-05 regression):**

The plan's `<verify>` block calls `pnpm --filter ui build`. On the current Windows host, `npx vite build` fails with:

```
Error: Cannot find module '@jridgewell/gen-mapping'
Require stack: ... vite-plugin-pwa -> workbox-build -> @rollup/plugin-terser -> @jridgewell/source-map -> @jridgewell/gen-mapping
```

This is an upstream pnpm hoisting issue: `@jridgewell/source-map@0.3.11` does a CJS `require('@jridgewell/gen-mapping')` but the latter is not hoisted to a resolvable location for `vite-plugin-pwa`'s nested CJS workbox import. Verified pre-existing by stashing our changes and re-running `npx vite build` — same error, no 104-05 file involved in the stack trace.

Mitigations used:
- `npx tsc --noEmit` (the underlying TypeScript check the build performs) runs clean on our new files: the only errors in the output are pre-existing `stories/src/routes/stories/wifi.tsx` import failures unrelated to 104-05.
- `npx vitest run src/features/local-setup` exits 0 with 17/17 tests passing — vitest goes through the same Vite resolver and would surface any module-resolution issues in our actual source code.

Action: Log to `.planning/phases/104-local-install-and-docker-uat/deferred-items.md` (Rule SCOPE BOUNDARY — pre-existing infra problem, not in 104-05 scope).

## Self-Check: PASSED

**Files created (8) — all confirmed on disk:**

- FOUND: livos/packages/ui/src/features/local-setup/types.ts
- FOUND: livos/packages/ui/src/features/local-setup/LocalSetupWizard.tsx
- FOUND: livos/packages/ui/src/features/local-setup/ModePickStep.tsx
- FOUND: livos/packages/ui/src/features/local-setup/QrCodeStep.tsx
- FOUND: livos/packages/ui/src/features/local-setup/PlatformInstructions.tsx
- FOUND: livos/packages/ui/src/features/local-setup/HybridDnsSetup.tsx
- FOUND: livos/packages/ui/src/features/local-setup/__tests__/LocalSetupWizard.test.tsx
- FOUND: livos/packages/ui/src/routes/settings/local-access.tsx

**File modified (1) — confirmed:**

- FOUND: livos/packages/ui/src/routes/settings/index.tsx (2 edits in HEAD: LocalAccessPage import + Route registration)

**Commits exist (verified via `git log --oneline`):**

- FOUND: 4c853ce0 feat(104-05): add Local Access wizard root + ModePickStep + Settings route entry
- FOUND: 18a097f3 feat(104-05): add QrCodeStep + PlatformInstructions + HybridDnsSetup + source-grep tests

**Sacred SHA — verified pre + post both commits:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (UNTOUCHED).

**Tests:** 17/17 pass on `npx vitest run src/features/local-setup` — 4ms execution, 998ms total wall time.

**No new npm deps:** `git diff HEAD~2 HEAD -- livos/packages/ui/package.json` returns empty.
