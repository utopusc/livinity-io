# Phase 142 — Single-Mode UX (Portal + Cloud Coming Soon) — SUMMARY

**Status:** ✅ CODE-COMPLETE 2026-05-17
**Predecessor:** Phase 141 (Multi-Tenant App Install Hardening)
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on every commit
**Driver:** User direction mid-session after Phase 141 deploy landed green:

> "Local modu vs çıkarmak istiyorum tek mod olsun o da bu olsun. own cloud
> vs olmasın cloud olsun ama bunu ileride koyacağımız için bu suanlik
> coming soon olsun. hybridin de adını değiştirelim daha yaratıcı olsun."

User picked **Portal** as the new name for the (formerly `hybrid`) CF Tunnel
transport mode.

---

## What shipped

3 sub-plans across 2 atomic commits + 1 docs/ROADMAP/SUMMARY commit (this
file). Every commit body carries the sacred SHA.

| Sub-plan | Commit | Scope |
|---|---|---|
| 142-02 | `646e6daa` | rename hybrid → portal end-to-end (CLI + livinityd readers + UI types/labels) |
| 142-01 | `e3d58f4c` | retire local-lan end-to-end (delete mode-local-lan.sh + 2 UI files + caddy.ts helpers + tRPC procedures) |
| 142-03 | `e3d58f4c` (bundled) | Cloud Coming Soon UI badge + parse-cli CLI rejection |
| 142-04 | this commit | docs sweep + ROADMAP + SUMMARY |

---

## Surface area touched

### CLI (`scripts/install/`)
- `parse-cli.sh`: default `MODE=portal` (was hybrid); whitelist still accepts
  the union `{cloud, local-lan, hybrid, portal, tunnel}` so each gets routed
  to its own helpful branch — local-lan → "retired" pointer, cloud →
  "Coming Soon", hybrid/tunnel → silent normalization to portal with one
  info line, portal → execute.
- `install.sh`: dispatch table collapses to a single `portal)` arm + a
  defensive `hybrid|tunnel)` safety net (defense against parse-cli
  normalization regression).
- `show-banner.sh`: trimmed to one portal-shaped banner.
- `mode-local-lan.sh`: **deleted**.
- `mode-cloud.sh`: kept on disk for the future hosted-control-plane
  implementation (Phase 144+) but unreachable from the CLI.

### livinityd Redis-readers
- `apps/apps.ts:rebuildCaddy` `cfTunnelMode` accepts `portal` ∪ `hybrid` ∪
  `tunnel`. Already-deployed boxes (which store `hybrid` in
  `livos:domain:local_mode`) survive `update.sh` without state migration.
- `source/index.ts` Phase 112 fallback switch: new `portal` case (mirrors
  `tunnel` body); `hybrid` case retained with a defensive double-read
  (`hybrid_subdomain` → fallback `tunnel_domain`) so Phase 134-era state
  continues to resolve.
- `local-dns/routes.ts:local.activateHybrid` writes `local_mode='portal'`
  (was `'hybrid'`); return `mode: 'portal'`.

### livinityd tRPC routes
- `local.activate` (local-lan Caddyfile writer) — **dropped**.
- `local.getCaCert` (PEM reader) — **dropped**.
- `local.getStatus`: `caCertAvailable` field retained on return shape (for
  wizard back-compat) but always reports `false`.
- `local.activateHybrid` + `local.getHybridStatus` + `local.provisionHybrid`
  — kept (still used by the portal wizard's verify + DNS-setup steps;
  wire-level rename deferred to Phase 143).

### UI (`livos/packages/ui/src/features/local-setup/`)
- `types.ts`: `SelectedMode` collapses to `'cloud' | 'portal'`;
  `WizardState.portal` (was `.hybrid`); `PORTAL_STEPS` (was `HYBRID_STEPS`);
  `portal-config` / `portal-dns-records` / `portal-verify` step IDs;
  `LOCAL_LAN_STEPS` + `WizardState.localLan` + `local-lan-*` step IDs
  removed.
- `ModePickStep.tsx`: local-lan card removed; cloud card kept with
  `comingSoon: true` flag, `disabled` button, amber "Coming Soon" badge,
  tooltip-shaped copy.
- `LocalSetupWizard.tsx`: rewritten as a single portal flow + cloud
  informational pane. `LocalLanConfigStep` removed; `HybridConfigStep` /
  `HybridVerifyStep` inline components renamed → `PortalConfigStep` /
  `PortalVerifyStep`. Final-step copy updated to "Activate Portal".
- `QrCodeStep.tsx` — **deleted**.
- `PlatformInstructions.tsx` — **deleted**.
- `HybridDnsSetup.tsx` — kept on disk (still imported by LocalSetupWizard's
  portal-dns-records step). File rename deferred to Phase 143.

### Caddy generator (`livos/.../domain/`)
- `caddy.ts`: dropped `generateLocalCaddyfile` + `validateLocalTld`.
  `LocalSubdomainConfig` retained as the helper type for
  `generateHybridCaddyfile` (rename to `PortalSubdomainConfig` is a Phase
  143 polish item).
- `caddy.test.ts`: dropped 2 describe blocks (`validateLocalTld` +
  5-test `generateLocalCaddyfile`). NEW Phase 142-01 retirement guard that
  asserts neither symbol is exported.

### Docs
- `docs/operator/post-deploy-playbook.md`: `livos:domain:local_mode`
  expected-value section updated to portal-first with back-compat note for
  legacy `hybrid`/`tunnel` values; recovery `redis-cli set` example uses
  `portal`.

---

## Test totals

- New `test-mode-portal-rename.sh`: **11 assertions PASS** — portal-DEFAULT
  in `--help`, alias normalization (hybrid + tunnel → portal), local-lan
  rejection, cloud Coming Soon rejection, default-mode-is-portal,
  whitelist-preserves-aliases defense, sacred SHA.
- Updated `test-mode-hybrid-args.sh`: **21/21 PASS** — AC-134-01-7 now
  asserts Coming-Soon shape; AC-134-01-8 covers both alias forms.
- Updated `LocalSetupWizard.test.tsx`: **9/9 PASS** — portal + cloud
  Coming-Soon surface invariants (QR + PlatformInstructions tests dropped
  alongside their deleted source files).
- Updated `caddy.test.ts`: **28/28 PASS** (was 37, dropped 9 local-lan
  assertions + 1 new retirement guard).
- Updated `local-dns/routes.test.ts`: **8/8 PASS** — `activate` +
  `getCaCert` router-definition guards; `activateHybrid` expects portal.
- Existing drain test (Phase 141-01): **7/7 PASS** (unchanged, runs via tsx).
- tsc baseline: **382 → 381 errors** (one fewer after dead-code drop).

---

## Back-compat invariant

Mini PCs already running with `livos:domain:local_mode=hybrid` or `=tunnel`
in Redis continue to work after `update.sh`:

- `apps.ts:rebuildCaddy` accepts all three (`portal`, `hybrid`, `tunnel`)
  as the CF-tunnel-mode signal → `http://` prefix emission unchanged.
- `source/index.ts` Phase 112 fallback switch handles legacy `hybrid` with a
  fallback Redis read so the subdomain resolves either way.
- install.sh re-run normalizes `--mode hybrid` / `--mode tunnel` → `portal`
  silently (with a one-line info log); writes `local_mode=portal` on next
  install. No operator action required for the rename to take effect.

---

## Out of scope (Phase 143+)

1. Wire-level rename of tRPC procedures: `local.activateHybrid` →
   `local.activatePortal`, `local.getHybridStatus` → `local.getPortalStatus`.
   Touches the wizard's two procedure calls + their test invariants + the
   tRPC client typed-call site. Mechanical but spans many files; held back
   for a focused Phase 143 sweep.
2. Component file renames: `HybridDnsSetup.tsx` → `PortalDnsSetup.tsx`;
   inline test-only `hybridSrc` variable rename.
3. Caddy helper type rename: `LocalSubdomainConfig` → `PortalSubdomainConfig`.
4. Delete `livos/.../local-dns/pki.ts` + `dnsmasq-config.ts` (dead-but-small
   after 142-01; safe to delete in 143 polish).
5. mode-cloud.sh stays on disk for the future hosted-control-plane work
   (Phase 144+); currently unreachable from the CLI thanks to parse-cli's
   Coming Soon rejection.
6. Live the cloud-mode story when the hosted control-plane is actually
   built — see also Phase 142-03's `cloud-redirect` informational pane copy.

---

## Sacred SHA invariant

`646e6daa`, `e3d58f4c`, and this 142-04 docs commit all carry
`f3538e1d811992b782a9bb057d1b7f0a0189f95f` in their commit body. Pre-commit
hook enforced.
