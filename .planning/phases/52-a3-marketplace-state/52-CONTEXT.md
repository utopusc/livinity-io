# Phase 52: A3 — Marketplace State Correction (Server5) — Context

**Gathered:** 2026-05-02
**Status:** EXECUTED INLINE — schema rediscovered, MiroFish DELETEd, migration 0010 captured
**Mode:** Auto-generated (workflow.skip_discuss=true) + post-investigation

<domain>
## Phase Boundary (revised after Phase 49 + rediscovery SSH)

**Original Phase 49 hypothesis (WRONG):** `platform_apps` table on Server5 holds marketplace state; Bolt.diy missing + MiroFish present.

**Reality discovered via Phase 52 SSH rediscovery (2026-05-02):**
- Table is `apps` (NOT `platform_apps`) in DB `platform` on Server5
- Bolt.diy IS PRESENT with `featured=true, verified=true` — DB state correct
- MiroFish IS PRESENT with `featured=false, verified=true` — needs removal per v29.3 close decision
- Schema: `id` is UUID, `slug` is unique key (`bolt-diy`, `mirofish`), `manifest` is JSONB, NO `status` column (no soft-delete pattern)
- 26 total apps before this phase (27 after MiroFish removal → 26)

**Goal (revised):** DELETE MiroFish from `apps` (and cascade `install_history` FK rows). For Bolt.diy, no DB action needed — the row is correct. The user's "Bolt tamamen silinmis" complaint is most likely a stale platform UI bundle issue (ANALOGOUS to A2/A4 root cause: stale browser bundle), not a DB state issue.

**In scope (this phase):**
- Server5 SQL: DELETE 14 install_history FK rows + DELETE 1 apps row for MiroFish
- Repo: capture as migration `platform/web/src/db/migrations/0010_drop_mirofish.sql` for reproducibility (survives fresh DB redeploys)
- Document: actual DB state findings + revised root-cause hypothesis for Bolt.diy non-rendering

**Out of scope:**
- Re-seeding Bolt.diy (already correct in DB — featured=true, verified=true)
- Server5 platform Next.js UI deploy (separate concern; user-side build pipeline outside this repo's scope)
- Hardening seed flow against future out-of-band manual inserts (per REQUIREMENTS Out-of-Scope)
- Modifying livinity-io/store rendering logic
</domain>

<decisions>
## Implementation Decisions

### D-52-01 (LOCKED): MiroFish removal via DELETE (not soft-delete)

The `apps` table has NO `status` or `archived_at` columns. Soft-delete is not the convention. Existing migrations use hard DELETE inside transactions for cleanup (see `0009_seed_bolt_diy.sql:17` — `DELETE FROM apps WHERE slug = 'bolt-diy';` followed by INSERT). Phase 52 follows the same pattern: hard DELETE inside BEGIN/COMMIT.

### D-52-02 (LOCKED): FK cascade handled explicitly in migration

`install_history.app_id REFERENCES apps(id)`. PG enforces this — naked `DELETE FROM apps WHERE slug='mirofish'` would fail with FK violation. Migration 0010 deletes 14 install_history rows first, then the apps row. The same order was used in the live SSH execution.

### D-52-03 (Claude's discretion): Bolt.diy non-rendering is OUT OF SCOPE

The user's "Bolt tamamen silinmis Store uzerinden" complaint is real — Bolt.diy doesn't appear in their browser. But the DB state IS correct. The issue must be one of:

1. **Server5 platform Next.js UI is stale** — same root cause as A2/A4 (stale bundle from incomplete deploy). Phase 51's update.sh fix addresses LIVOS UI, NOT the platform website at livinity.io. The platform has its own deploy pipeline (Server5).
2. **Browser PWA cache for livinity.io** — separate from LivOS PWA cache.
3. **Marketplace UI rendering bug** — code in `platform/web/src/...` may have a filter that excludes Bolt.diy for some non-obvious reason (e.g., manifest schema check expecting fields Bolt.diy's minimal manifest lacks).

For v29.5, this phase confirms the DB is correct. Diagnosing the platform UI rendering issue is a SEPARATE concern that requires browsing to livinity.io/store with devtools open OR auditing the platform Next.js code. Defer to follow-up phase if Phase 55 live-verifies Bolt.diy still missing post-deploy.

### D-52-04 (LOCKED): Versioned migration for forensic trail

Even though the DELETE was applied live to Server5 PG via inline SSH, a numbered migration file at `platform/web/src/db/migrations/0010_drop_mirofish.sql` is committed to the repo. This:
- Documents the change reproducibly
- Captures forensic data (the original MiroFish row contents)
- Applies cleanly to any fresh-DB platform redeploy
- Aligns with the existing migration numbering convention

</decisions>

<code_context>
## Existing Code Insights (verified)

- **`platform/web/src/db/migrations/`** — Drizzle-style numbered SQL migrations. Latest pre-Phase-52: `0009_seed_bolt_diy.sql` (Phase 43.11).
- **`apps` schema** (verified via `\d apps`):
  - id: uuid (gen_random_uuid)
  - slug: text not null, unique
  - name: text not null
  - tagline / description / category: text not null
  - manifest: jsonb not null
  - icon_url: text not null
  - featured / verified: boolean not null
  - sort_order: integer (default 100)
  - NO `status` column — hard DELETE is the convention
- **`install_history` FK** — references apps(id), enforced. Cascade must be handled in app code (PG doesn't auto-cascade on this constraint).
- **Pre-Phase-52 state on Server5 PG:**
  - 27 total apps
  - Bolt.diy: featured=true, verified=true (correct state)
  - MiroFish: featured=false, verified=true (out-of-band manual insert from before v29.3 close)
- **Post-Phase-52 state on Server5 PG (live applied 2026-05-02):**
  - 26 total apps
  - Bolt.diy unchanged
  - MiroFish gone (1 apps row + 14 install_history rows DELETE'd)

## Files in this phase

- `platform/web/src/db/migrations/0010_drop_mirofish.sql` (CREATED — 28 lines, BEGIN/DELETE/DELETE/COMMIT pattern)

## Files NOT modified

- All Bolt.diy-related files (DB row already correct, manifest fix-up out of scope)
- Server5 platform Next.js UI code (separate deploy concern)
- LivOS code (this phase is purely platform-side)

</code_context>

<specifics>
## Specific Requirements

- **FR-A3-01** (Bolt.diy re-INSERT) — N/A. DB state was already correct; the original Phase 49 hypothesis (Bolt.diy missing) was WRONG. No INSERT needed.
- **FR-A3-02** (MiroFish removal) — DONE via Server5 SSH DELETE + repo migration 0010
- **FR-A3-04** (Bolt.diy wipe root cause) — DOCUMENTED here: there was no "wipe". Bolt.diy was never missing from DB. The user's observation reflects a UI rendering issue (likely stale platform UI bundle), NOT a DB state corruption.

</specifics>

<deferred>
## Deferred Ideas

- Diagnosing why Bolt.diy doesn't render in the user's browser despite featured=true — requires platform UI deploy pipeline access OR live devtools session at livinity.io/store. Schedule a follow-up phase if Phase 55 confirms the issue persists post-Phase-51 deploy.
- Adding a CI/CD constraint that prevents out-of-band SQL inserts to the `apps` table — out of scope per REQUIREMENTS.md (hardening the seed flow itself was explicitly excluded).
- Renaming the `apps` table to `platform_apps` to match REGRESSIONS.md's misnomer — definitely out of scope (rename = breaking change for drizzle types, JOINs, FKs).
- Recreating MiroFish under any other guise — explicitly REJECTED per user direction at v29.3 close.

</deferred>

## Live SSH Execution Log (2026-05-02)

```
=== BEFORE_DELETE ===
   slug   |   name   | featured 
----------+----------+----------
 mirofish | MiroFish | f
 bolt-diy | Bolt.diy | t
(2 rows)

=== CHECK_INSTALL_HISTORY_FK ===
 count = 14

=== DELETE_MIROFISH ===
DELETE 14    -- install_history rows
DELETE 1     -- apps row

=== AFTER_DELETE ===
   slug   |   name   | featured 
----------+----------+----------
 bolt-diy | Bolt.diy | t
(1 row)

apps total = 26
```
