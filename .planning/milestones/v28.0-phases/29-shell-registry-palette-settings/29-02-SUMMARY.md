---
phase: 29-shell-registry-palette-settings
plan: 02
subsystem: docker-management-ui
tags: [docker-app, registry, credentials, aes-256-gcm, image-search, docker-hub, settings, theme, sidebar-density, deep-link, doc-16, doc-17, doc-19, doc-20]

# Dependency graph
requires:
  - phase: 21-stack-secrets-git-credentials
    provides: AES-256-GCM-with-JWT-key crypto pattern (git-credentials.ts) — lifted-and-shifted verbatim into registry-credentials.ts
  - phase: 22-multi-host-docker
    provides: EnvironmentsSection component (settings/_components/environments-section.tsx) — cross-imported into Docker > Settings > Environments tab; envIdField pullImage extension target
  - phase: 24-docker-app-skeleton
    provides: DockerApp window-app shell + section store + sidebar primitive + useDockerTheme (DOC-19 verification target) + sections/registry.tsx + sections/settings.tsx placeholders
  - phase: 26-resource-routes
    provides: Resource detail panel surfaces (container-detail-sheet, image-section, volume-section, network-section) + useDockerResource resource-store (programmatic deep-link state)
  - phase: 27-stacks-schedules-routes
    provides: stack-section detail panel
  - phase: 29-01
    provides: SectionId/SECTION_IDS allowlist consumed by deep-link helpers; Shell + cmd+k palette as live siblings to the new Registry/Settings sections
provides:
  - Registry section live (Credentials CRUD + Docker Hub & private registry image search + per-result Pull button)
  - Docker Settings section live (Environments cross-import + Theme + Sidebar density)
  - registry_credentials PG table (idempotent CREATE TABLE with user_id FK, AES-encrypted password column)
  - 4 new tRPC routes (listRegistryCredentials query + createRegistryCredential, deleteRegistryCredential mutations + searchImages query)
  - pullImage backwards-compat extension with optional registryId → dockerode authconfig
  - useSidebarDensity zustand store + density-conditional sidebar padding
  - buildDeepLink/parseDeepLink helpers (URI: livinity://docker/<section>[/<id>])
  - Copy Deep Link button on all 5 detail panels (containers, images, volumes, networks, stacks)
affects: [v28.0 milestone close, future url-bar deep-linking (v29.0+), audit-log expansion (v29.0+ may add registry-credential CRUD entries)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Credential vault lift-and-shift — git-credentials.ts → registry-credentials.ts: same JWT-derived 32-byte key, same iv12+tag16+ct base64 layout, same SELECT_COLS-exclusion 'never return encrypted_data via API' rule. Payload shape is the only delta ({password} JSON because username + registry_url are non-secret columns)."
    - "Docker Hub anonymous search via /v2/search/repositories — no rate-limit headers consulted (tolerated by Docker Hub's free anonymous endpoint)."
    - "Private registry search via /v2/_catalog with Basic auth — substring-filtered client-side (Docker Registry v2 catalog endpoint is not searchable)."
    - "AbortController-based fetch timeout (30s) for all registry HTTP calls — bounds T-29-13 DoS surface."
    - "Cross-import precedent — settings/_components/environments-section.tsx mounted in BOTH /settings (legacy) AND /docker/settings (new) during the v28-final overlap window. Same component instance, no duplication."
    - "Sidebar density preference via zustand persist + defensive merge — corrupted localStorage values fall back to default rather than throw."
    - "buildDeepLink validates section against SECTION_IDS allowlist at runtime; parseDeepLink fails closed (returns null) on every malformed URI shape (T-29-19)."

key-files:
  created:
    - livos/packages/livinityd/source/modules/docker/registry-credentials.ts (AES-256-GCM credential vault — 6 exported functions; encrypted_data NEVER returned via API)
    - livos/packages/livinityd/source/modules/docker/registry-credentials.unit.test.ts (7 cases)
    - livos/packages/livinityd/source/modules/docker/registry-search.ts (Docker Hub + private registry search; 30s AbortController timeout; 200-char query cap)
    - livos/packages/livinityd/source/modules/docker/registry-search.unit.test.ts (5 cases)
    - livos/packages/ui/src/routes/docker/registry/registry-section.tsx (Tabs primitive — Credentials | Image Search)
    - livos/packages/ui/src/routes/docker/registry/credentials-tab.tsx (list + delete + Add button)
    - livos/packages/ui/src/routes/docker/registry/add-credential-dialog.tsx (Name + URL + Username + Password)
    - livos/packages/ui/src/routes/docker/registry/image-search-tab.tsx (search + registry picker + Pull button + target-env selector)
    - livos/packages/ui/src/routes/docker/settings/settings-section.tsx (Tabs primitive — Environments | Appearance)
    - livos/packages/ui/src/routes/docker/settings/environments-tab.tsx (cross-imports EnvironmentsSection from Phase 22)
    - livos/packages/ui/src/routes/docker/settings/appearance-tab.tsx (ThemeToggle + SidebarDensity radio)
    - livos/packages/ui/src/routes/docker/sidebar-density.ts (useSidebarDensity zustand store; livos:docker:sidebar-density localStorage key)
    - livos/packages/ui/src/routes/docker/sidebar-density.unit.test.ts (4 cases)
    - livos/packages/ui/src/routes/docker/deep-link.ts (buildDeepLink + parseDeepLink + copyDeepLinkToClipboard)
    - livos/packages/ui/src/routes/docker/deep-link.unit.test.ts (12 cases including round-trip)
  modified:
    - livos/packages/livinityd/source/modules/database/schema.sql (idempotent CREATE TABLE registry_credentials + index, immediately after git_credentials)
    - livos/packages/livinityd/source/modules/docker/docker.ts (pullImage signature extended with optional registryId → dockerode authconfig when present)
    - livos/packages/livinityd/source/modules/docker/routes.ts (4 new routes + pullImage zod input extended)
    - livos/packages/livinityd/source/modules/server/trpc/common.ts (httpOnlyPaths +3 entries — createRegistryCredential, deleteRegistryCredential, searchImages)
    - livos/packages/ui/src/routes/docker/sidebar.tsx (reads useSidebarDensity → density-conditional py-1/py-2 nav-item padding)
    - livos/packages/ui/src/routes/docker/sections/registry.tsx (1-line re-export — placeholder gone)
    - livos/packages/ui/src/routes/docker/sections/settings.tsx (1-line re-export — placeholder gone)
    - livos/packages/ui/src/routes/docker/resources/container-detail-sheet.tsx (IconLink button in SheetHeader)
    - livos/packages/ui/src/routes/docker/resources/image-section.tsx (IconLink ActionButton per row)
    - livos/packages/ui/src/routes/docker/resources/volume-section.tsx (IconLink ActionButton per row)
    - livos/packages/ui/src/routes/docker/resources/network-section.tsx (IconLink ActionButton per row)
    - livos/packages/ui/src/routes/docker/stacks/stack-section.tsx (IconLink ActionButton per row, wrapped in stopPropagation)

key-decisions:
  - "registry-credentials.ts is a near-verbatim lift-and-shift of git-credentials.ts. The encryption primitives, JWT key derivation, and 'encrypted_data NEVER returned via API' guarantee are identical; only the table name, payload shape ({password}), and the addition of registry_url + username as non-secret columns differ. Same trust model, same audit boundary, zero new crypto."
  - "username + registry_url are stored as plain (non-encrypted) PG columns so the UI can render the credentials list without round-tripping every row through decrypt. Only the password is in the encrypted blob. This matches the user-mental-model of 'username = label, password = secret'."
  - "Docker Hub public search uses /v2/search/repositories anonymously — no auth header. T-29-12 disposition is 'accept' because public search reveals only public repositories (no LivOS-side info disclosed) and Docker Hub already rate-limits at the IP layer. Trying to add auth would be cargo-culted and complicate the public path."
  - "Private registry search uses /v2/_catalog with Basic auth + client-side substring filter. The v2 catalog endpoint is not searchable; this is the same approach `docker search` uses for private registries. Filter is case-insensitive."
  - "EnvironmentsSection is cross-imported (NOT duplicated) from settings/_components/. Both /settings > Environments and /docker/settings > Environments render the SAME component instance during the v28-final overlap window. Phase 30+ may relocate it under routes/docker/_components/ and slim the legacy entry to a redirect; out of scope for v28.0."
  - "Sidebar density preference uses defensive merge in the zustand persist config — corrupted localStorage values (e.g. user manually edits to 'banana') fall back to 'comfortable' instead of crashing the UI. Same pattern can be re-used for any future preference store."
  - "DOC-20 final closure articulation: programmatic API (Plan 26-01 setSelectedContainer/Image, 26-02 setSelectedVolume/Network, 27-01 setSelectedStack) + Copy Deep Link button (this plan) = v28.0 closure. URL-bar form (e.g. typing /docker/containers/n8n in the address bar) is intentionally deferred to v29.0+ because the window-app pattern (single Livinity SPA hosting a Docker WINDOW) is incompatible with React Router routes inside a window. parseDeepLink is exported and ready when v29.0 picks up the URL parser."
  - "All Copy Deep Link buttons go on the leftmost ActionButton position in each row (or in the SheetHeader for container-detail-sheet). Consistent placement across 5 panels makes the affordance discoverable."

patterns-established:
  - "Pattern: AES-256-GCM credential vault module — getKey() (SHA-256 of JWT secret, cached) + encrypt/decrypt helpers + listX/getX/createX/deleteX/decryptXData CRUD where decrypt is INTERNAL ONLY. The same shape can host any future {username/password}-style secret vault (e.g. SMTP credentials, S3 backup destinations)."
  - "Pattern: Docker tRPC route + httpOnlyPaths registration — every new mutation OR long-running query (>5s expected) gets registered in common.ts httpOnlyPaths to avoid the WS-mutation hang issue documented in CLAUDE.md."
  - "Pattern: Tabs-based section layout — Registry + Settings both follow the {section header → Tabs primitive → flex-col tab content} layout. Future sections that need sub-views can copy this shape (e.g. Schedules > Backup vs Cron split)."
  - "Pattern: Copy Deep Link affordance — IconLink button + copyDeepLinkToClipboard({section, id}) helper + sonner toast on success/failure. Trivially extensible to any future detail panel."

requirements-completed: [DOC-16, DOC-17, DOC-19, DOC-20]

# Metrics
duration: 16min
completed: 2026-04-25
---

# Phase 29 Plan 02: Registry + Docker Settings + DOC-19/20 Closure Summary

**Registry section live with AES-256-GCM credential vault and Docker Hub + private registry search; Docker Settings section live with cross-imported Environments + Theme + Sidebar density; Copy Deep Link buttons on all 5 detail panels closing DOC-20 within the window-app constraint**

## Performance

- **Duration:** 16 min
- **Started:** 2026-04-25T23:34:57Z
- **Completed:** 2026-04-25T23:51:17Z
- **Tasks:** 3 (8 atomic commits — 3× test, 5× feat)
- **Files created:** 15
- **Files modified:** 12 (registry section + 5 detail panels + sidebar + schema + routes + common + docker + sections re-exports)

## Accomplishments

- **DOC-16 (Registry):** Closed end-to-end. New PG table `registry_credentials` (idempotent CREATE TABLE) + `registry-credentials.ts` AES-256-GCM vault (lift-and-shift from git-credentials) + `registry-search.ts` Docker Hub & private-registry search + 4 new tRPC routes + Registry section with Credentials & Image Search tabs + per-result Pull button bound to the extended `pullImage` route.
- **DOC-17 (Docker Settings):** Closed end-to-end. New `/docker/settings` section with Environments tab (cross-imported from Phase 22 EnvironmentsSection — no duplication) + Appearance tab (theme toggle + sidebar density radio).
- **DOC-19 (Theme persistence):** Verified. Phase 24-02 useDockerTheme persistence works in BOTH StatusBar AND the new Appearance tab thanks to the cross-instance sync mechanism (storage event + custom 'livos:docker:theme-changed' window event). No new theme infra.
- **DOC-20 (Deep-linking final):** Closed within the window-app constraint. New `deep-link.ts` (buildDeepLink + parseDeepLink + copyDeepLinkToClipboard) helpers + Copy Deep Link icon buttons on every detail panel (container, image, volume, network, stack). URL-bar parsing is intentionally deferred to v29.0+ (parseDeepLink stays ready, no consumer in v28.0).
- **Sidebar density preference:** New `useSidebarDensity` zustand store + density-conditional padding in the Docker sidebar (compact → py-1, comfortable → py-2). Selection persists per-browser and applies live without reload.

## Task Commits

Each task was committed atomically (TDD pattern — RED + GREEN per task):

1. **Task 1: Backend — registry_credentials table + AES vault + 4 tRPC routes + pullImage extension**
   - `23ce7dfd` test(29-02): add failing tests for registry-credentials + registry-search
   - `ee724a14` feat(29-02): registry credentials vault + image search backend (DOC-16)

2. **Task 2: Live Registry section (DOC-16) + Docker Settings section (DOC-17) + sidebar density + DOC-19 verify**
   - `b16efdad` test(29-02): add failing tests for sidebar-density store
   - `78599da0` feat(29-02): useSidebarDensity store
   - `985c53f6` feat(29-02): live Registry + Settings sections + sidebar density (DOC-16, DOC-17, DOC-19)

3. **Task 3: DOC-20 final closure — buildDeepLink helper + Copy Deep Link buttons on 5 detail panels**
   - `e1db78da` test(29-02): add failing tests for deep-link helpers
   - `2f087d85` feat(29-02): deep-link helpers (buildDeepLink + parseDeepLink)
   - `c62f137a` feat(29-02): Copy Deep Link buttons across all 5 detail panels (DOC-20 final)

**Plan metadata:** _(this commit, after SUMMARY + STATE updates)_

## Files Created/Modified

### Backend (livos/packages/livinityd/)
- **CREATED** `source/modules/docker/registry-credentials.ts` — AES-256-GCM vault (6 functions: encrypt/decrypt + listCredentials/getCredential/createCredential/deleteCredential/decryptCredentialData). 182 lines.
- **CREATED** `source/modules/docker/registry-credentials.unit.test.ts` — 7 cases A-G (encrypt round-trip + tamper + no-leak + CRUD).
- **CREATED** `source/modules/docker/registry-search.ts` — Docker Hub anonymous + private registry Basic-auth search; 30s AbortController; 200-char query cap. 142 lines.
- **CREATED** `source/modules/docker/registry-search.unit.test.ts` — 5 cases A-E (Docker Hub URL + Basic auth header + length cap + fetch failure + 401).
- **MODIFIED** `source/modules/database/schema.sql` — Idempotent `CREATE TABLE registry_credentials` (id, user_id FK ON DELETE SET NULL, name, registry_url, username, encrypted_data, created_at) + `UNIQUE(user_id, name)` + `idx_registry_credentials_user`. Added immediately after the git_credentials block.
- **MODIFIED** `source/modules/docker/docker.ts` — `pullImage(image, environmentId?, registryId?)` signature extended; when registryId is present, decrypts credential and passes `{authconfig: {username, password, serveraddress}}` to dockerode `.pull()`.
- **MODIFIED** `source/modules/docker/routes.ts` — 4 new tRPC routes (`listRegistryCredentials` query + `createRegistryCredential`/`deleteRegistryCredential` mutations + `searchImages` query); `pullImage` zod input extended with optional `registryId`.
- **MODIFIED** `source/modules/server/trpc/common.ts` — `httpOnlyPaths` array extended with `docker.createRegistryCredential`, `docker.deleteRegistryCredential`, `docker.searchImages`.

### UI (livos/packages/ui/src/routes/docker/)
- **CREATED** `registry/registry-section.tsx` — top-level Tabs (Credentials | Image Search). 38 lines.
- **CREATED** `registry/credentials-tab.tsx` — list + Add button + per-row Delete with confirm. 117 lines.
- **CREATED** `registry/add-credential-dialog.tsx` — shadcn Dialog form (Name + URL + Username + Password). 150 lines.
- **CREATED** `registry/image-search-tab.tsx` — search input + registry picker + target-env selector + per-row Pull button. 209 lines.
- **CREATED** `settings/settings-section.tsx` — top-level Tabs (Environments | Appearance). 41 lines.
- **CREATED** `settings/environments-tab.tsx` — cross-imports `EnvironmentsSection` from Phase 22. 18 lines.
- **CREATED** `settings/appearance-tab.tsx` — ThemeToggle + SidebarDensity RadioGroup. 86 lines.
- **CREATED** `sidebar-density.ts` — `useSidebarDensity` zustand store with defensive merge. 41 lines.
- **CREATED** `sidebar-density.unit.test.ts` — 4 cases (default + set + persist + corrupted-fallback).
- **CREATED** `deep-link.ts` — buildDeepLink + parseDeepLink + copyDeepLinkToClipboard. 69 lines.
- **CREATED** `deep-link.unit.test.ts` — 12 cases (4 build + 7 parse + 1 round-trip).
- **MODIFIED** `sections/registry.tsx` — placeholder replaced with 1-line re-export.
- **MODIFIED** `sections/settings.tsx` — placeholder replaced with 1-line re-export.
- **MODIFIED** `sidebar.tsx` — reads `useSidebarDensity`; nav-item padding becomes `density === 'compact' ? 'py-1' : 'py-2'`.
- **MODIFIED** `resources/container-detail-sheet.tsx` — IconLink button in SheetHeader (left of Edit/Duplicate/Close).
- **MODIFIED** `resources/image-section.tsx` — IconLink ActionButton as leftmost in row actions.
- **MODIFIED** `resources/volume-section.tsx` — IconLink ActionButton as leftmost in row actions.
- **MODIFIED** `resources/network-section.tsx` — IconLink ActionButton as leftmost in row actions.
- **MODIFIED** `stacks/stack-section.tsx` — IconLink ActionButton as leftmost (wrapped in `<span onClick={(e) => e.stopPropagation()}>` to keep row-expand behaviour).

## Decisions Made

See `key-decisions` in frontmatter (8 decisions). Highlights:
- registry-credentials.ts is a deliberate near-verbatim lift-and-shift of git-credentials.ts (proven Phase 21 pattern, zero new crypto, same trust model).
- username + registry_url are non-secret PG columns; only password is encrypted. UI list view doesn't decrypt anything.
- EnvironmentsSection is cross-imported (NOT duplicated) into the new Docker > Settings > Environments tab.
- DOC-20 closure is the **programmatic API + Copy Deep Link button** combo. URL-bar parsing is deferred to v29.0+ because the window-app pattern doesn't support React Router routes inside windows.

## Deviations from Plan

None — plan executed exactly as written. Three notes:

1. **Filename clarification:** Plan referenced `networks-section.tsx` (plural) but the actual file is `network-section.tsx` (singular, from Phase 26-02). Used the actual filename. No change in behavior.
2. **TDD case count for deep-link tests:** Plan specified 11 cases; the test file has 12 (4 buildDeepLink + 7 parseDeepLink + 1 round-trip). The round-trip test was added during RED authoring as a defensive integration check. All 12 pass.
3. **Image-search registry picker default:** Used `__hub__` as the sentinel value for "Docker Hub (public)" in the Select (instead of a separate boolean flag) so the Select primitive could emit the choice as a single string. The picker's value is converted to `null` when `__hub__` before being passed to the tRPC route.

**Total deviations:** 0 functional, 3 cosmetic clarifications.
**Impact on plan:** None — all closures shipped as specified.

## Issues Encountered

None. Vitest dynamic-import-after-resetModules pattern (used in sidebar-density.unit.test.ts) worked first try; the Phase 24-02 useDockerTheme cross-instance sync mechanism made DOC-19 verification a one-line check (mounted ThemeToggle in two surfaces, observed flipping one updates the other instantly).

## TDD Gate Compliance

All 3 tasks followed RED → GREEN cycle with separate test commits before implementation commits:
- Task 1: `23ce7dfd` (test, RED) → `ee724a14` (feat, GREEN)
- Task 2 sidebar-density: `b16efdad` (test, RED) → `78599da0` (feat, GREEN); then UI section work
- Task 3: `e1db78da` (test, RED) → `2f087d85` (feat, GREEN); then panel buttons

No REFACTOR commits — initial implementations were clean enough not to warrant cleanup passes.

## Test Coverage

- **Backend:** 12 new tests pass (registry-credentials 7 + registry-search 5).
- **Frontend:** 16 new tests pass (sidebar-density 4 + deep-link 12).
- **Total new:** 28 tests added.
- **Regression check:** All 170 existing UI docker tests pass.
- **Build:** `pnpm --filter @livos/config build` clean; `pnpm --filter ui build` clean (31s); livinityd typecheck clean for plan-touched files.

## v28.0 Phase 29 Final Closure

With Plan 29-02 shipped, all 6 v28.0 Phase 29 requirements are closed:

| Req    | Status                              | Closure plan |
|--------|-------------------------------------|--------------|
| DOC-15 | Complete (Cross-container Shell)    | 29-01        |
| DOC-16 | Complete (Registry creds + search)  | 29-02        |
| DOC-17 | Complete (Docker-app Settings)      | 29-02        |
| DOC-18 | Complete (cmd+k palette)            | 29-01        |
| DOC-19 | Verified (Theme persistence)        | 29-02 (verify of 24-02) |
| DOC-20 | Complete (Deep-linking final)       | 29-02 (Copy buttons + helpers; URL-bar deferred) |

v28.0 (Docker Management UI) is **feature-complete pending verifier**. Only milestone audit + complete + cleanup remain.

## DEFERRED to v29.0+

- **Browser-level URL bar deep-linking** — typing `/docker/containers/n8n` in the address bar should auto-open the panel. Window-app pattern doesn't support React Router routes inside a window; needs a window-app routing rev. parseDeepLink is exported and ready, no consumer in v28.0.
- **Back/forward navigation buttons** in StatusBar (CONTEXT.md speculative — out of scope for v28.0).
- **Saved query presets** in palette (CONTEXT.md deferred-ideas).
- **Image SBOM / license scanning** in registry (REQUIREMENTS.md out-of-scope).
- **Audit log entries** for registry-credential CRUD (Plan 21-01 precedent — same deferral; v29.0+ audit pass could add).
- **Dynamic registry quota / rate-limit display** — Docker Hub rate-limit headers visible but not surfaced.
- **Schedule-section Copy Deep Link** — only the 5 primary resource types got the button. Schedules don't have a "shareable id" notion (schedule UUID is internal); deferred until they have a user-facing identity.
- **Per-user theme/density preferences** — current persistence is per-browser. Storing in `user_preferences` PG table would survive cross-device.
- **Multi-shell Shell-section selector** (Plan 29-01 noted; bash-only v1).
- **Cross-env tab management UI** (Plan 29-01 noted; tabs survive env-switch by design).
- **Real Docker Hub category facets** (official badge surfaced; categories/topics are not).

## Next Phase Readiness

- v28.0 Phase 29 is feature-complete. Verifier can audit immediately.
- All 6 Phase 29 requirements closed (or verified for DOC-19).
- Recommended next step after verifier passes: milestone audit (`/gsd:audit-milestone`) → milestone complete (`/gsd:complete-milestone`) → milestone cleanup.

## Self-Check: PASSED

- All 15 created files present on disk (verified via implicit Write tool success).
- All 8 task commits present in git log (`23ce7dfd`, `ee724a14`, `b16efdad`, `78599da0`, `985c53f6`, `e1db78da`, `2f087d85`, `c62f137a`).
- 12 backend tests pass (registry-credentials 7 + registry-search 5).
- 16 UI tests pass (sidebar-density 4 + deep-link 12); 170 total docker UI tests pass (no regressions).
- UI build green; livinityd typecheck clean for plan-touched files.
- Both Phase 24 placeholder strings ("Coming in Phase 29 — Docker Hub", "Coming in Phase 29 — Environments…") grep-empty.

---
*Phase: 29-shell-registry-palette-settings*
*Plan: 02*
*Completed: 2026-04-25*
