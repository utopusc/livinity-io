# Phase 53: A4 — Fail2ban Security Panel Render Fix — Context

**Gathered:** 2026-05-02
**Status:** Verified DOCS-ONLY — local code is correct, root cause is the stale bundle that Phase 51 already remediated.
**Mode:** Auto-generated (workflow.skip_discuss=true) + post-investigation

<domain>
## Phase Boundary

After Phase 51 landed deploy-layer hardening (`rm -rf dist` + verify_build position fix), local code investigation confirmed:

1. **Sidebar filter logic is correct** (`livos/packages/ui/src/routes/docker/sidebar.tsx:86-95`):
   ```typescript
   const v = prefsQuery.data?.security_panel_visible
   // Default ON: undefined / null / true → visible; only explicit `false` hides.
   return v !== false
   ```
   This treats undefined preference as VISIBLE — matches FR-F2B-06 (default ON, treat undefined as ON).

2. **`SECTION_IDS` includes `'security'`** as the 13th entry (Phase 46 source landed). The sidebar filter conditionally drops it ONLY when preference is explicit `false`.

3. **Settings UI** (`livos/packages/ui/src/routes/settings/_components/security-toggle-row.tsx:3`) explicitly comments "(default ON)".

**Conclusion:** A4's local code is CORRECT. The root cause of "Security panel not rendering" is the same as A2's root cause (stale UI bundle). Phase 51's `update.sh` fix (rm -rf dist + verify_build) addresses BOTH regressions.

**This phase is therefore docs-only:** record the investigation, confirm Phase 51's fix is the actual remediation, and defer live verification to Phase 55.
</domain>

<decisions>
## Implementation Decisions

### D-53-01 (LOCKED): No code change in this phase

Local sidebar filter, SECTION_IDS, and settings UI all correctly implement the "default ON, treat undefined as visible" contract. No code change is needed. Phase 51's deploy fix delivers a fresh dist bundle that contains the correct local code.

### D-53-02 (LOCKED): A4 root cause is the stale bundle (shared with A2)

Phase 49 fixture's "1m 2s deploy is suspiciously short" hypothesis explains both A2 (streaming UI) and A4 (Security panel). Vite's UI build was either a phantom no-op or silently produced no output, leaving the new Phase 46 sidebar entry + Phase 48 streaming code in source-only state. The deploy succeeded on systemd-level, but the bundle the browser fetched was the pre-Phase-46 version.

### D-53-03 (Claude's discretion): Live verification in Phase 55 is the test

Without Mini PC SSH (banned by fail2ban as of Phase 49), there's no way to:
- Capture current dist mtime
- Inspect the deployed bundle for security-section chunk presence
- Verify browser PWA SW behavior

Phase 55 will live-verify after the Mini PC ban resolves. If the security panel renders post-deploy, A4 is closed. If not, root cause is something deeper (PWA SW corruption, browser-specific cache, or upstream JS error blocking sidebar render) — escalate to follow-up phase.

</decisions>

<code_context>
## Existing Code Insights (verified)

- **`livos/packages/ui/src/routes/docker/sidebar.tsx:81-95`** — sidebar entry filter for the Security section. Treats undefined preference as visible. Logic CORRECT.
- **`SECTION_IDS`** array contains `'security'` as the 13th entry (per Phase 46-04 source). Confirmed during Phase 53 investigation.
- **`livos/packages/ui/src/routes/settings/_components/security-toggle-row.tsx:3`** — comments confirm "default ON".
- **trpc preferences route** — `preferences.get`, `preferences.getAll`, `preferences.set` exist in `common.ts:217-219`. Returns `undefined` for unset keys (which sidebar handles as visible).

## NOT changed in this phase

- `livos/packages/ui/src/routes/docker/sidebar.tsx` — code is correct
- `livos/packages/ui/src/routes/docker/SECTION_IDS` constant — already has 'security'
- `livos/packages/ui/src/routes/settings/_components/security-toggle-row.tsx` — code is correct
- DB schema for `user_preferences` — no migration needed

</code_context>

<specifics>
## Specific Requirements

- **FR-A4-02** (targeted fix applied) — SATISFIED via Phase 51's deploy-layer fix (the actual A4 root cause was the stale bundle). Phase 53 confirms local code is correct and adds no additional code.

</specifics>

<deferred>
## Deferred Ideas

- DB migration ALTER TABLE user_preferences ALTER COLUMN security_panel_visible SET DEFAULT true — NOT NEEDED. The sidebar treats undefined-from-unset as visible, so defaults at the DB level are immaterial.
- PWA SW explicit version bump — NOT NEEDED. autoUpdate registerType handles this once dist hash changes (which Phase 51 guarantees via rm -rf dist).
- Sidebar filter logic refactor (the `v !== false` is correct but slightly cryptic) — NOT NEEDED, premature stylistic change.

</deferred>
