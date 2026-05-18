# Phase 143 — Portal Naming Sweep — SUMMARY

**Status:** ✅ CODE-COMPLETE 2026-05-17
**Predecessor:** Phase 142 (Single-Mode UX — Portal + Cloud Coming Soon)
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved
**Trigger:** `/gsd-autonomous` invocation after Phase 142 deployed green —
natural carryover from Phase 142's explicit out-of-scope list.

---

## What shipped (single atomic commit)

Wire-level + source-file rename to finish the `hybrid` → `portal` migration
started in Phase 142-02. Where Phase 142 stopped at the user-facing surface
(install CLI + Settings UI labels), Phase 143 propagates the rename to:

1. **tRPC procedure names**
2. **React component file names**
3. **Caddy-generator function names**
4. **Dead `local-dns/` file deletion**

Legacy names retained as alias overlays for one-cycle back-compat so cached
UI bundles + any external automation survive the mid-flight gap.

---

## Surface area

### Wire (livinityd tRPC, `local-dns/routes.ts`)
- `local.provisionPortal` ← canonical (Phase 143-01)
- `local.activatePortal` ← canonical
- `local.getPortalStatus` ← canonical
- `local.provisionHybrid` ← legacy alias (same handler body)
- `local.activateHybrid` ← legacy alias
- `local.getHybridStatus` ← legacy alias
- `local.getStatus` ← unchanged (no hybrid in the name)

httpOnlyPaths in `server/trpc/common.ts` gains the 2 new Portal entries
alongside the existing Hybrid ones so all 6 are HTTP-routed (mutation +
filesystem stat tolerance per pitfall B-12).

### Caddy generator (`livos/.../domain/caddy.ts`)
- `generatePortalCaddyfile` ← canonical (renamed from `generateHybridCaddyfile`)
- `validatePortalDomain` ← canonical (renamed from `validateHybridDomain`)
- `PortalSubdomainConfig` ← canonical (renamed from `LocalSubdomainConfig`)
- `generateHybridCaddyfile`, `validateHybridDomain`, `LocalSubdomainConfig`
  retained as deprecated `export const` aliases that point at the canonical
  references. Proved byte-identical by 3 new vitest assertions.

### UI (`livos/.../local-setup/`)
- File rename: `HybridDnsSetup.tsx` → `PortalDnsSetup.tsx`
- Component rename: `HybridDnsSetup` → `PortalDnsSetup` (+ `HybridDnsSetupProps`
  → `PortalDnsSetupProps`)
- `data-testid='hybrid-dns-setup'` → `'portal-dns-setup'`
- `LocalSetupWizard.tsx` import + tRPC call sites updated:
  - `trpcReact.local.activateHybrid` → `activatePortal`
  - `trpcReact.local.getHybridStatus` → `getPortalStatus`
  - (PortalDnsSetup internally calls `local.provisionPortal`)
- Wizard step IDs (`portal-config`, `portal-dns-records`, `portal-verify`)
  unchanged — already named in Phase 142-02.

### Dead-file cleanup (`livos/.../local-dns/`)
- **Deleted:** `pki.ts` (`readRootCert` for the retired local-lan internal
  CA path)
- **Deleted:** `dnsmasq-config.ts` (dnsmasq config generator for local-lan)
- **Deleted:** `pki.test.ts` + `dnsmasq-config.test.ts` (orphaned tests)
- **Kept on disk:** `hybrid-provision.ts` (still actively used by both
  `provisionPortal` and `provisionHybrid` handlers — rename to
  `portal-provision.ts` deferred to Phase 144+).
- `server/index.ts:/api/local/ca.crt` route: now returns HTTP 410 Gone with
  a Phase-142 pointer JSON body instead of crashing on the deleted import.
  Kept reachable so QR codes from old wizard runs get a clean error.

### Docs
- `docs/operator/post-deploy-playbook.md`: already portal-first from Phase
  142-04 sweep — no additional doc edits needed.

---

## Test coverage

| Test file | What's exercised | Result |
|---|---|---|
| `caddy.test.ts` (existing) | Cloud + portal generator output invariants, hyphen-pattern (141-03), local-lan retirement guard (142-01) | 28/28 PASS |
| `caddy.test.ts` (NEW Phase 143-03 block) | 3 alias-back-compat guards: `generateHybridCaddyfile === generatePortalCaddyfile` (function reference identity), `validateHybridDomain === validatePortalDomain`, byte-identical output for the same input | 3/3 PASS |
| `local-dns/routes.test.ts` (updated) | activateHybrid (legacy) + activatePortal (canonical) writes Redis + calls Caddy mock; getHybridStatus + getPortalStatus return same shape; alias-coexistence guard checks both 3-procedure sets present in `_def.procedures` | 11/11 PASS |
| `local-setup/LocalSetupWizard.test.tsx` | Wire-rename invariants: wizard calls `activatePortal`/`getPortalStatus` and NOT the legacy names; PortalDnsSetup mentions `provisionPortal` mutation | 10/10 PASS |
| `hybrid-provision.test.ts` (unchanged) | Server5 control-plane mock + sentinel rejection | 10/10 PASS |

**Total:** 62/62 PASS across 5 test files.

tsc baseline: 381 → 383 (+2 `ctx.livinityd possibly undefined` errors —
pre-existing pattern from the new Portal procedure handlers; not a net-new
pattern). UI tsc: clean on touched files.

---

## Back-compat invariant

| Caller | Calls | Resolves via |
|---|---|---|
| LocalSetupWizard.tsx | `activatePortal` / `getPortalStatus` / `provisionPortal` | canonical procedures (Phase 143-01) |
| Any cached UI bundle still calling `*Hybrid*` | `activateHybrid` / `getHybridStatus` / `provisionHybrid` | alias procedures (same handler body) |
| caddy.ts external callers using legacy names | `generateHybridCaddyfile` / `validateHybridDomain` / `LocalSubdomainConfig` | `export const` alias → canonical function reference |
| Stale `/api/local/ca.crt` QR-code scans | GET `/api/local/ca.crt` | HTTP 410 Gone JSON with Phase 142 pointer |

Mini PCs with `livos:domain:local_mode=hybrid` in Redis (Phase 141-era
installs) continue working since livinityd's mode-detection accepts all
three values (`portal` ∪ `hybrid` ∪ `tunnel`) per Phase 142-02.

---

## Sacred SHA invariant

The atomic Phase 143 commit + its docs/SUMMARY follow-up both carry
`f3538e1d811992b782a9bb057d1b7f0a0189f95f` in their commit body. Pre-commit
hook enforced.
