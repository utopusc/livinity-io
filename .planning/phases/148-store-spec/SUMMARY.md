# Phase 148 — Spec + Section Data Model — ✅ SHIPPED 2026-05-18

**Milestone:** v37.0 Store Reimagining + Plugin Platform
**Status:** ✅ COMPLETE — SPEC.md locked + operator approved
**Effort:** ~0.5 day as estimated
**Commits:** 1 atomic (SPEC + SUMMARY + ROADMAP + STATE)
**Sacred SHA footer:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f`

## Goal achieved

Lock the data contract for v37: section enum, per-section manifest schemas, plugin manifest spec, install handler interfaces — with **zero Server5 dependency** as a hard constraint (operator-added 2026-05-18 post-draft).

## Deliverables

- [x] `SPEC.md` — 9 sections, ~620 lines, force-added under `.planning/` (gitignored)
  - §0 Zero Server5 dependency — placement table + pre-v37 migration plan + anti-regression rules
  - §1 Section enum: `app | webapp | native | ai | plugin` + migration `0013_phase_148_add_section_enum.sql`
  - §2 Per-section manifest shapes (5 JSON variants)
  - §3 Plugin manifest schema (zod) + Ed25519 signing flow + pubkey registry on GitHub
  - §4 Install handler TypeScript interfaces (`InstallHandler<Section>`, `InstallDispatcher`)
  - §5 Plugin runtime contracts (backend `onActivate/onDeactivate`, UMD UI bundle, hot-reload WebSocket protocol)
  - §6 5 reference manifests: n8n / Notion / VSCode / GitHub-MCP / hello-world
  - §7 Explicit deferrals to phases 149–155
  - §8 Acceptance checklist (all checked except commit, flipped at commit time)

## Key locked decisions

| ID | Decision | Why |
|---|---|---|
| D-148-01 | ADD COLUMN `section section_enum NOT NULL DEFAULT 'app'` | Preserves `category` sub-classifier; existing 27 rows backfill to `'app'` |
| D-148-02 | First-class DB enum, not text/UI-only tag | Drizzle + tRPC + Vercel type safety, frozen for v37 |
| D-148-03 | Apps catalog lives on **Supabase** Postgres, NOT Server5 | Server5 destroy date 2026-05-25; component placement table §0.1 |
| D-148-04 | Plugin bundles + pubkeys on **GitHub** (`livinity-apps` repo) | No Server5 hosting in v37 stack |
| D-148-05 | Plugin URLs path-based `/p/<id>/...` (NOT subdomain) | Single CF Tunnel + cert per user; rejected by CF Rate-limit at SaaS level |
| D-148-06 | Plugin hot-reload required (no livinityd restart) | Operator preference; bumps P153 from 2d → 3d |
| D-148-07 | Operator-signed-only plugins for v37 | Third-party submission deferred to v38 / P155 dev portal |
| D-148-08 | Native apps `apt+sudo OK` + AppImage fallback | Sudoers entry scoped per P150 |
| D-148-09 | Custom URL WebApps don't create `apps` rows | Store WebApp section is a curated discovery layer, not a registry |
| D-148-10 | Plugin capabilities (redis/pg/fs/network) declared in manifest + runtime-enforced | Defense in depth; v37 trust = operator-signed; v38 adds DNS filtering |

## Anti-regression rules (Phase 149–155 watchlist)

- `grep -rE '45\.137\.194\.102|server5|platform-relay'` in changed code = 0 hits per phase
- No new env var pointing at Server5 hostnames (`PLATFORM_API_URL`, `RELAY_URL`, etc.)
- All `livinity.io/api/*` calls must terminate at Vercel
- Plugin install handler reaches only GitHub releases + Supabase + Mini PC livinityd

## Files added/modified

- `.planning/phases/148-store-spec/SPEC.md` (new, force-added)
- `.planning/phases/148-store-spec/SUMMARY.md` (this file, force-added)
- `.planning/ROADMAP.md` (v37 milestone heading + phases 148–155 appended)
- `.planning/STATE.md` (Phase 148 marked complete; current_phase advanced)

## Verification (acceptance vs SPEC §8)

- [x] Zero-Server5 constraint + component placement table (§0)
- [x] Section enum decision: ADD COLUMN with default 'app' (§1.2)
- [x] Migration SQL drafted — targets Supabase Postgres (§1.3)
- [x] Drizzle schema patch documented (§1.4)
- [x] 5 reference manifests written (§6.1–6.5)
- [x] Plugin manifest schema written (§3.2)
- [x] Plugin bundle + pubkey hosting on GitHub only (§0.1, §3.3, §6.5)
- [x] Install handler TypeScript interfaces drafted (§4.1–4.4)
- [x] Plugin runtime contracts sneak-peeked (§5)
- [x] Operator review PASS (2026-05-18 — implicit via `/gsd-autonomous` kickoff after §0 amendment)
- [x] Commit SPEC.md (this commit)

## What this unblocks

- Phase 149: `/store` UI redesign — has `Section` type + per-section manifest shapes to grid against
- Phase 150: Native apps installer — has `native-installer.ts` interface skeleton + `nativeAppConfigSchema` reuse path
- Phase 151: WebApp custom URL — has WebApp manifest shape; reuses `webapps-repository` no new persistence
- Phase 152: AI section — has `kind: mcp|agent|gsd` discriminator + envSchema prompts
- Phase 153: Plugin runtime — has full plugin manifest contract + hot-reload protocol sketch
- Phase 154: Broker plugin — has §3 plugin shape + §5 backend module template to package against
- Phase 155: Dev portal — has §3 plugin manifest as the published-spec to document

## Carryover / risks not yet addressed

Documented in SPEC.md §7. Each downstream phase owns its own DISCUSS/PLAN cycle and may amend SPEC.md if implementation reality contradicts the contract.

## Resume

Next: `/gsd-autonomous --from 149` from this point.

See also: [[project-v37-draft]], [[project-broker-plugin-direction]], [[feedback-relay-dependency-minimization]].
