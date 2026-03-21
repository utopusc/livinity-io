---
phase: 24-app-store-expansion
verified: 2026-03-21T13:00:00Z
status: human_needed
score: 6/7 must-haves verified
re_verification: false
human_verification:
  - test: "Visit apps.livinity.io/store and confirm all 10 new apps appear"
    expected: "AdGuard Home, WireGuard Easy, Navidrome, Calibre-web, Homarr, Wiki.js, Linkwarden, Element Web, Hoppscotch, Stirling PDF visible in store catalog"
    why_human: "Requires live Server5 platform DB access — cannot verify SQL was actually applied from local codebase alone"
  - test: "Install at least one new app from the App Store on Server4 (e.g., Stirling PDF or Element Web)"
    expected: "App installs successfully, container starts, web UI loads at its subdomain"
    why_human: "End-to-end Docker install + Caddy routing requires a live Server4 environment"
---

# Phase 24: App Store Expansion Verification Report

**Phase Goal:** Research, add, and test 10 new single-container web UI apps to the store. Categories: Privacy (AdGuard Home, WireGuard Easy), Media (Navidrome, Calibre-web), Productivity (Homarr dashboard, Wiki.js, Linkwarden bookmarks), Communication (Element/Matrix), Dev Tools (Hoppscotch API, Stirling PDF). Each app tested end-to-end on Server4.
**Verified:** 2026-03-21T13:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | All 10 new apps exist in BUILTIN_APPS array in builtin-apps.ts | VERIFIED | `grep -c "id: '"` returns 28 (18 original + 10 new). All 10 IDs confirmed: adguard-home, wireguard-easy, navidrome, calibre-web, homarr, wikijs, linkwarden, element-web, hoppscotch, stirling-pdf |
| 2 | Each new app has a complete compose definition with mainService, healthcheck, restart policy, and volume mappings | VERIFIED | All 10 new apps have healthcheck blocks (lines 828, 875, 921, 971, 1006, 1052, 1102, 1137, 1172, 1217). All have `restart: 'unless-stopped'` and `mainService: 'server'`. All use `${APP_DATA_DIR}` volume pattern (except element-web and hoppscotch which have no persistent state). |
| 3 | No port conflicts among the 10 new apps or with the Phase 24 ports | VERIFIED | All 10 new ports are unique: 3003, 51821, 4533, 8083, 7575, 3006, 3004, 8087, 3005, 8085. No conflicts among new apps. (Note: pre-existing conflict between gitea and chromium both using 3000 — pre-dates Phase 24.) |
| 4 | SQL migration exists with 10 INSERT statements for all new apps, with idempotency and slug column | VERIFIED | `platform/web/src/db/migrations/0003_seed_expansion_apps.sql` exists. `grep -c "INSERT INTO apps"` returns 10. File has BEGIN/COMMIT, DELETE-before-INSERT, slug column in all INSERTs, jsonb manifest casts for all 10 apps. |
| 5 | builtin-apps.ts is wired into the install flow via getBuiltinApp() | VERIFIED | `getBuiltinApp()` imported in compose-generator.ts (line 6) and apps.ts (line 17). Called at apps.ts:395, 432 and compose-generator.ts:14. The function itself is defined at builtin-apps.ts:1230. |
| 6 | All 4 task commits exist in git history | VERIFIED | b9540ba (Plan 01 batch 1), 8ce6e51 (Plan 02 SQL seed), 2ca5e69 (Plan 03 batch 2), 6cde5ae (Plan 04 slug fix) — all confirmed in git log. |
| 7 | 10 new apps live in apps.livinity.io store catalog and at least 1 installs end-to-end on Server4 | NEEDS HUMAN | Cannot verify server-side DB state or live Docker installs from local codebase. Plan 04 SUMMARY claims user approved deployment, but this was a human-gate checkpoint. |

**Score:** 6/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `livos/packages/livinityd/source/modules/apps/builtin-apps.ts` | 28 app entries (18 original + 10 new) | VERIFIED | 1246 lines. 28 id entries confirmed. All 10 new apps have complete BuiltinAppManifest entries with compose definitions. |
| `platform/web/src/db/migrations/0003_seed_expansion_apps.sql` | 10 INSERT statements for expansion apps | VERIFIED | File exists. 10 INSERTs, BEGIN/COMMIT, idempotent DELETE, slug column added (production fix), dollar-quoted YAML, jsonb manifests. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| builtin-apps.ts | compose-generator.ts | `getBuiltinApp()` call at line 14 | WIRED | `import {getBuiltinApp} from './builtin-apps.js'` at compose-generator.ts:6, called at line 14 for template generation |
| builtin-apps.ts | apps.ts (install flow) | `getBuiltinApp()` called at lines 395, 432 | WIRED | `import {getBuiltinApp} from './builtin-apps.js'` at apps.ts:17, used in install flow and compose generation |
| 0003_seed_expansion_apps.sql | Server5 PostgreSQL apps table | psql migration execution | NEEDS HUMAN | File is well-formed SQL with correct schema (slug column added). Actual execution on Server5 not verifiable locally. |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| R-APPS-RESEARCH | 24-01, 24-03 | Research Docker configs for 10 new apps | SATISFIED | All 10 apps have real Docker images, version tags, correct port assignments, appropriate env vars and volume paths per app type. No invented or placeholder values found. |
| R-APPS-BUILTIN | 24-01, 24-03 | Add 10 apps to BUILTIN_APPS array in builtin-apps.ts | SATISFIED | 28 id entries in file. All 10 new apps present with full BuiltinAppManifest (compose, healthcheck, restart, volumes, ports, icon URLs). |
| R-APPS-DB | 24-02, 24-04 | SQL seed migration for all 10 apps in platform DB | SATISFIED (code) / NEEDS HUMAN (deployed) | Migration file 0003_seed_expansion_apps.sql exists with all 10 apps, correct schema, slug fix applied. Deployment to Server5 was human-gated and claimed complete by user. |
| R-APPS-TEST | 24-04 | Each app tested end-to-end on Server4 | NEEDS HUMAN | Plan 04 was `autonomous: false` with human-verify checkpoint. SUMMARY claims user approved, but this cannot be verified programmatically. |

**Note on requirement IDs:** R-APPS-RESEARCH, R-APPS-BUILTIN, R-APPS-DB, R-APPS-TEST are defined in ROADMAP.md Phase 24 entry only. They do not appear in REQUIREMENTS.md — the traceability table in REQUIREMENTS.md covers v10.0 requirements (INST/STORE/BRIDGE/EMBED/HIST/API groups) and does not reference Phase 24 or any R-APPS IDs. These requirements are ROADMAP-internal specifications for Phase 24 scope, not tracked in the formal requirements document. No orphaned requirements were found in REQUIREMENTS.md mapping to Phase 24.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| builtin-apps.ts | 380, 518 | Pre-existing: gitea and chromium both declare `port: 3000` at top-level | Warning (pre-existing) | Both share the same top-level port number — does not affect runtime since they are template definitions, not simultaneous bindings. Pre-dates Phase 24. |
| builtin-apps.ts | 116 (portainer), 728 (filebrowser) | Pre-existing: missing healthcheck in compose definition | Info (pre-existing) | These are original apps not touched by Phase 24. All 10 new Phase 24 apps have healthchecks. |

No anti-patterns found in the 10 new Phase 24 app entries.

### Human Verification Required

#### 1. Store Catalog Live Check

**Test:** Open https://apps.livinity.io/store and browse to Privacy, Media, Productivity, Communication, and Developer Tools categories.
**Expected:** All 10 new apps (AdGuard Home, WireGuard Easy, Navidrome, Calibre-web, Homarr, Wiki.js, Linkwarden, Element Web, Hoppscotch, Stirling PDF) appear in the store with correct icons, taglines, and category assignments.
**Why human:** Requires live Server5 PostgreSQL to have had the 0003_seed_expansion_apps.sql migration applied. Local codebase only proves the migration file is correct; actual DB state is unknown without server access.

#### 2. End-to-End App Install Test

**Test:** From the LivOS App Store window on Server4, install a lightweight app with no required env vars — Stirling PDF (port 8085) or Element Web (port 8087) are good candidates.
**Expected:** Install completes without error, Docker container starts, healthcheck passes, web UI loads at the configured subdomain.
**Why human:** End-to-end testing requires live Docker on Server4, Caddy subdomain routing, and network accessibility. Cannot be verified from static code analysis.

### Gaps Summary

No code gaps were found. All 10 apps are fully defined in builtin-apps.ts with complete compose definitions, healthchecks, restart policies, and proper volume mappings. The SQL migration is correctly structured with all required columns (including the production-critical slug column added in Plan 04). All key links (getBuiltinApp wiring) are verified. The two items flagged for human verification relate to live server state (DB migration applied, Docker install working) — these are deployment confirmation items, not code defects.

The phase goal is fully achieved at the code level. Human verification is needed only to confirm the deployment steps that were gated on user action in Plan 04 actually completed successfully.

---

_Verified: 2026-03-21T13:00:00Z_
_Verifier: Claude (gsd-verifier)_
