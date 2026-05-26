# Phase 216 / Plan 01 — SUMMARY

**Status:** 🟡 CODE-COMPLETE (audit doc + script) 2026-05-26. Live verification = operator walk in P217.
**Sacred SHA:** preserved.

## What shipped

- `.planning/phases/216-cloudflare-audit/CF-AUDIT.md` — full code-side audit:
  - Known topology (CF DNS-only apex via Vercel + proxied wildcard via CF for SaaS).
  - Expected DNS record table.
  - Code-side state findings (cf-saas.ts client, register flow, subdomain canonical).
  - Live audit checklist with pass/fail rubric.
  - Per-user wildcard cert verification recipe (openssl + curl).
  - Subdomain provisioning E2E trace.
  - Known unknowns for operator walk.
- `scripts/cf-audit.sh` — runnable bash + curl + jq audit script. Operator sets `CF_API_TOKEN` + `CF_ZONE_ID_LIVINITY_IO`, runs locally, produces:
  - Human-readable summary on stdout.
  - `cf-audit-<date>.json` archive for record.

## Success criteria

| # | Criterion | Status |
|---|---|---|
| CF-01 | DNS state documented | 🟢 GREEN (CF-AUDIT.md §1, §2) |
| CF-02 | Per-user wildcard cert verified live | 🟡 OPERATOR-PENDING (script + recipe ready; live run in P217) |
| CF-03 | Cert path fixed if broken | 🟡 GATED — only triggers if CF-02 finds failure (CARRY-P216-REPROVISION-ENDPOINT scaffolded) |
| CF-04 | Subdomain provisioning E2E with CF API | 🟡 OPERATOR-PENDING (code path documented in §6; live test in P217) |

## Carries filed (4)

- **CARRY-P216-LIVE-VERIFICATION** — operator runs cf-audit.sh and records results in P217 phase dir.
- **CARRY-P216-TERRAFORM** — declarative DNS config (operator decision, not selected today).
- **CARRY-P216-REPROVISION-ENDPOINT** — admin endpoint to re-run `provisionUserHostnames` for drift recovery.
- **CARRY-P216-APPS-CNAME-DECISION** — keep or remove `apps.livinity.io` post-v37 cutover.

## Next phase (P217)

E2E UAT walk — closes operator-pending criteria from P209-P216.
