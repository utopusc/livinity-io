---
phase: 111-server5-dashboard-install-wizard
plan: 05
subsystem: ui
tags: [server5, next-app-router, react, accordion, docs, wizard, install, cross-repo]

# Dependency graph
requires:
  - phase: 111-server5-dashboard-install-wizard
    plan: 04
    provides: "/onboarding/install wizard route with mode-cards.tsx + page.tsx (accordion docs panel embeds below the cards)"
provides:
  - "Server5 mode reference docs panel — accordion with 4 sections (Local + Hybrid full content; Own-Cloud + Cloud Coming Soon stubs)"
  - "Updated mode-cards.tsx — each card has 'Learn more' link that scrollIntoView's to the matching docs accordion section"
  - "page.tsx now renders <ModeDocs /> below <ModeCards />"
  - "Rollback artifacts: mode-cards.tsx.pre-111-05.bak + page.tsx.pre-111-05.bak on Server5"
affects: []  # Final plan in Phase 111 — no downstream plans depend on this

# Tech tracking
tech-stack:
  added: []  # Reuses React 18 + Tailwind 4 + Next.js 16.1.7; pure presentational
  patterns:
    - "Accordion with single-active state — useState<WizardMode | null> tracks which doc is open; click-toggle pattern"
    - "Cross-component scroll-jump — mode-cards 'Learn more' button calls document.getElementById(`mode-doc-${id}`).scrollIntoView({behavior:'smooth', block:'center'})"
    - "Anchor-link header — 'See full reference below' <a href='#mode-docs-section'> in mode-cards intro for keyboard/non-mouse navigation"
    - "Rollback-friendly source patch — backup .pre-111-05.bak file written BEFORE every edit (parallel to Plan 111-04 .pre-111-04.bak pattern)"
    - "Plan 111-04's SSH-stdin-pipe pattern reused — local .tmp-111-05-task1.sh + ssh root@host 'bash -s' < script.sh; avoids heredoc-quote-escape storms with embedded JSX/template-literals"

key-files:
  created:
    - ".planning/phases/111-server5-dashboard-install-wizard/111-05-SUMMARY.md"
    - "server5:/opt/platform/web/src/app/onboarding/install/components/mode-docs.tsx (9454 bytes, sha256 32750c52bd7197e6fae448584c427f9e8a59b0d3c1e35e1693288b874873e81a)"
    - "server5:/opt/platform/web/src/app/onboarding/install/components/mode-cards.tsx.pre-111-05.bak (3325 bytes — rollback artifact)"
    - "server5:/opt/platform/web/src/app/onboarding/install/page.tsx.pre-111-05.bak (6577 bytes — rollback artifact)"
  modified:
    - "server5:/opt/platform/web/src/app/onboarding/install/components/mode-cards.tsx (3325 → 4059 bytes; sha256 01194d6da30814de449eaffc1391a0bea9b378231339db83d7bf077816452cfc; full rewrite — added 'Learn more' button + scrollToDoc helper + 'See full reference below' anchor)"
    - "server5:/opt/platform/web/src/app/onboarding/install/page.tsx (6577 → 6634 bytes; sha256 e959a37fa92422d630c8902ee64e405a89207e0f98fc183ca9b45b272c14eb4d; sed-injected `import ModeDocs` + `<ModeDocs />` after `<ModeCards .../>`)"

key-decisions:
  - "D-NO-LIVOS-CHANGE upheld: zero edits to livos/ or liv/ source trees; Server5-only deploy (`git diff master -- livos/ liv/ | wc -l` = 0)"
  - "D-NO-PROD-IMPACT upheld: no Mini PC scripts touched"
  - "D-111-RELAY-DATA-PLANE-DOC upheld: Hybrid section's securityTradeoffs[1] explicitly states 'Zero relay data plane — your traffic does NOT flow through Server5. The legacy {username}.livinity.io alias does (DO NOT use that — prefer your own domain).'"
  - "D-111-NO-REGRESSION upheld: existing 111-04 wizard UAT still passes — 'Choose your install mode' heading, 2 mode-cards Coming Soon badges, 4-card grid all preserved (regression-safe full rewrite of mode-cards.tsx kept all original visual behavior intact)"
  - "Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved (`git hash-object liv/packages/core/src/sdk-agent-runner.ts` pre-execution and at-commit-time)"

patterns-established:
  - "Cross-component scroll-jump via stable DOM ID convention (`mode-doc-<wizard-mode-id>`) — keeps coupling shallow without prop drilling"
  - "Accordion docs UX with comingSoon-aware short-circuit — Coming Soon entries render only the shortDescription (no preReqs/whatItDoes/securityTradeoffs sections), so users see clearly that no actionable content exists yet"
  - "Backup-before-edit invariant for in-place Server5 source edits (`.pre-<plan-id>.bak`) — chain established: 111-04 → 111-05; future Server5 plans should follow"

requirements-completed: []  # Phase 111 has no formal requirement IDs (phase_req_ids: null per init)

# Metrics
duration: ~2min  # Single SSH-stdin script: write 1 new file + rewrite 1 + sed 1 + npm install/build + reload + UAT
completed: 2026-05-13
---

# Phase 111 Plan 05: Mode Reference Docs Panel Summary

**Embedded a 4-section accordion docs panel below the wizard mode cards on `/onboarding/install` step 1.** Local + Hybrid modes get full pre-reqs / what-it-does / security tradeoffs / troubleshooting content; Own-Cloud + Cloud get short "Coming Soon" stubs. Each mode card now has a "Learn more about <Mode> →" link that smooth-scrolls to the matching accordion section. **D-111-RELAY-DATA-PLANE-DOC** delivered: Hybrid security tradeoffs explicitly state "Zero relay data plane — your traffic does NOT flow through Server5".

## Performance

- **Duration:** ~2 min (single SSH-stdin script: 1 new file + 1 full rewrite + 1 sed-patch + npm install + npm build + pm2 reload + 6 UAT assertions)
- **Started:** 2026-05-13 (post-111-04 commit cc12cf33 base)
- **Completed:** 2026-05-13
- **Tasks:** 2 (Task 1 — deploy + Task 2 — SUMMARY/commit)
- **Files created on Server5:** 1 new (`mode-docs.tsx`) + 2 backups (`.pre-111-05.bak` for mode-cards.tsx + page.tsx)
- **Files modified on Server5:** 2 (`mode-cards.tsx` rewrite + `page.tsx` sed-patch)
- **UAT outcome:** 6/6 must-haves PASS first attempt; sacred SHA preserved; Plan 111-04 regression-safe

## Accomplishments

- **ModeDocs component shipped (9454 bytes):** Accordion with 4 sections — `local-lan`, `hybrid`, `tunnel`, `cloud`. Each section has stable `id="mode-doc-<id>"` for cross-component scroll-jump. Local + Hybrid render full preReqs + whatItDoes + securityTradeoffs + troubleshooting. Own-Cloud + Cloud render only the `shortDescription` (no preReqs etc.) plus a "Coming Soon" badge.
- **mode-cards.tsx full rewrite (3325 → 4059 bytes):** Each of the 4 cards now has two interactive elements — the original mode-select button (preserved exactly) PLUS a new "Learn more about <Mode> →" text-button that calls `scrollToDoc(m.id)` → `document.getElementById('mode-doc-<id>').scrollIntoView({behavior:'smooth', block:'center'})`. Added "See full reference below" anchor link in the intro paragraph for keyboard / non-mouse navigation. Plan 111-04 visual + behavioral contract preserved (Coming Soon disabling, badge rendering, hover states all unchanged).
- **page.tsx sed-patched:** `import ModeDocs from "./components/mode-docs";` added directly after the existing `import WizardStepper` line; `<ModeDocs />` render injected directly after the existing `<ModeCards value={mode} onChange={setMode} />` line inside the `step === 1` block. Step-2 + Step-3 unaffected.
- **6/6 live UAT must-haves PASS** — Mode reference heading present, "Learn more about" link present, 4 Coming Soon badges (2 in mode-cards + 2 in mode-docs), "Choose your install mode" still present (regression-safe), "Zero relay data plane" in source (D-111-RELAY-DATA-PLANE-DOC), pm2 web online no restart loop.
- **All 4 D-* invariants verified.**
- **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved** (`git hash-object liv/packages/core/src/sdk-agent-runner.ts` returned the expected hash pre-execution and at-commit-time; pre-commit hook will gate the SUMMARY commit).

## Mode Reference Panel Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Wizard step 1                                                   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Choose your install mode                                    │ │
│  │ You can change this later by reinstalling. See full ref... │ │
│  │ ┌─────────────┐  ┌─────────────┐                           │ │
│  │ │ Local (LAN) │  │ Hybrid (Rec)│                           │ │
│  │ │ ✓ pros      │  │ ✓ pros      │                           │ │
│  │ │ Learn more →│  │ Learn more →│  (smooth-scrolls below)   │ │
│  │ └─────────────┘  └─────────────┘                           │ │
│  │ ┌─────────────┐  ┌─────────────┐                           │ │
│  │ │ CF Tunnel   │  │ Cloud       │                           │ │
│  │ │ Coming Soon │  │ Coming Soon │                           │ │
│  │ │ Learn more →│  │ Learn more →│                           │ │
│  │ └─────────────┘  └─────────────┘                           │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Mode reference                                              │ │
│  │ Click a mode to expand prerequisites, what-it-does, ...    │ │
│  │                                                             │ │
│  │ ▶ Local (LAN)                                  [closed]    │ │
│  │ ▼ Hybrid (Recommended)                         [open]      │ │
│  │   <shortDescription>                                        │ │
│  │   PREREQUISITES                                             │ │
│  │   • Ubuntu 24.04 VPS …                                      │ │
│  │   • Cloudflare API token Zone:DNS:Edit + Zone:Read …        │ │
│  │   WHAT THE INSTALLER DOES                                   │ │
│  │   • Installs Docker + Postgres + Redis + Caddy …            │ │
│  │   SECURITY TRADEOFFS                                        │ │
│  │   • Public HTTPS …                                          │ │
│  │   • **Zero relay data plane …**                             │ │
│  │   • Cloudflare token used ONCE …                            │ │
│  │   TROUBLESHOOTING                                           │ │
│  │   Q: DNS-01 challenge failed?                               │ │
│  │   A: Confirm token Zone:DNS:Edit scope …                    │ │
│  │ ▶ Own-Cloud (CF Tunnel)  [Coming Soon]   [closed]          │ │
│  │ ▶ Cloud                  [Coming Soon]   [closed]          │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## D-111-RELAY-DATA-PLANE-DOC Verbatim Proof

The Hybrid mode's `securityTradeoffs` array in `mode-docs.tsx` (verbatim from deployed source):

```typescript
securityTradeoffs: [
  "Public HTTPS — anyone with the URL can reach the login page. Strong passwords + 2FA recommended.",
  "Zero relay data plane — your traffic does NOT flow through Server5. The legacy {username}.livinity.io alias does (DO NOT use that — prefer your own domain).",
  "Cloudflare token is used ONCE during install to write the _acme-challenge TXT record. The token is NOT stored on Livinity servers (passed through during wizard, used by install.sh, cached only on the target VPS for future cert renewal).",
  "Cert renewal happens automatically on the target VPS — no Cloudflare API call leaves your machine after initial provisioning except every 60-90 days for renewal.",
],
```

The second bullet **explicitly delivers the D-111-RELAY-DATA-PLANE-DOC honesty disclosure**: users on the Hybrid path see — in the docs panel they pick a mode from — that the legacy `{username}.livinity.io` alias terminates TLS at Server5 (so Server5 sees their traffic in cleartext), and they should prefer their own domain (which is direct internet, no relay middleman).

This pairs with Plan 111-04's `install-command-display.tsx` step-3 advisory ("Prefer this URL over the legacy {username}.livinity.io alias — the legacy alias routes through our relay") to give the user the same warning at TWO touchpoints in the wizard flow:

1. **Pre-decision** (Plan 111-05, this plan) — in the mode-docs panel BEFORE the user picks Hybrid
2. **Post-decision** (Plan 111-04) — in the install-cmd-display step 3 AFTER the user has picked Hybrid

## Live UAT Outputs (Server5, 2026-05-13)

### UAT 1: ModeDocs accordion + Learn more link render

```
$ TOKEN=$(sudo -u postgres psql -d platform -tAc "SELECT token FROM sessions WHERE user_id = '3eae6ced-af48-4a39-ad82-1880b2f4bd0e' AND expires_at > NOW() ORDER BY expires_at DESC LIMIT 1;" | tr -d '[:space:]')
$ HTML=$(curl -sSf "https://livinity.io/onboarding/install" -H "Cookie: liv_session=$TOKEN")
$ echo "$HTML" | wc -c
17557

$ echo "$HTML" | grep -q "Mode reference" && echo PASS
PASS

$ echo "$HTML" | grep -q "Learn more about" && echo PASS
PASS

$ echo "$HTML" | grep -o "Coming Soon" | wc -l
4
```

PASS — Mode reference heading renders, "Learn more about <Mode>" link text appears, 4 Coming Soon badges (2 from mode-cards + 2 from mode-docs).

### UAT 2: Plan 111-04 regression-safe

```
$ echo "$HTML" | grep -q "Choose your install mode" && echo PASS
PASS
```

PASS — Plan 111-04 mode-cards heading still present after the full rewrite.

### UAT 3: D-111-RELAY-DATA-PLANE-DOC source-file proof

```
$ ssh root@45.137.194.102 "grep 'Zero relay data plane' /opt/platform/web/src/app/onboarding/install/components/mode-docs.tsx"
      "Zero relay data plane — your traffic does NOT flow through Server5. The legacy {username}.livinity.io alias does (DO NOT use that — prefer your own domain).",
```

PASS — D-111-RELAY-DATA-PLANE-DOC text in deployed source.

### UAT 4: pm2 web process state

```
$ pm2 status web
│ 14 │ web │ default │ N/A │ fork │ 2028791 │ 5s │ ↺ 10 │ online │ 0% │ 69.0mb │ root │ disabled │
```

PASS — `web` online, no restart loop. Restart count incremented from 9 (Plan 111-04 baseline) to 10 (this plan's reload).

### UAT 5: Next.js build clean

```
$ npm run build
…
├ ƒ /onboarding/install
…
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

PASS — `/onboarding/install` route still registered as ƒ (dynamic, server-rendered) post-rebuild. No build warnings or errors.

### UAT 6: page.tsx import + render injection

```
$ grep '^import ModeDocs ' /opt/platform/web/src/app/onboarding/install/page.tsx
import ModeDocs from "./components/mode-docs";

$ grep '<ModeDocs />' /opt/platform/web/src/app/onboarding/install/page.tsx
            <ModeDocs />
```

PASS — sed-injection landed on the right line; `<ModeDocs />` is rendered inside the `step === 1` block, immediately after `<ModeCards value={mode} onChange={setMode} />`.

## D-* Invariants Checklist (deployed-file proof)

| ID | Status | Evidence |
|----|--------|----------|
| D-NO-LIVOS-CHANGE | PASS | `git diff HEAD -- livos/ liv/ \| wc -l` = 0; commit only touches `.planning/` |
| D-NO-PROD-IMPACT | PASS | Zero Mini PC scripts touched (no `livos/update.sh` / `livos/install.sh` / `liv/` files in diff) |
| D-111-RELAY-DATA-PLANE-DOC | PASS | mode-docs.tsx Hybrid securityTradeoffs[1] = "Zero relay data plane — your traffic does NOT flow through Server5. …" |
| D-111-NO-REGRESSION | PASS | UAT 2 confirms "Choose your install mode" heading still renders; 2 Coming Soon badges still in mode-cards (additional 2 from mode-docs); mode-cards 4-card grid + visual contract preserved |
| Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | PASS | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` returned the expected hash pre-execution and at-commit-time |

## Server5 Files Created/Modified

| Path | Type | Bytes | sha256 |
|------|------|-------|--------|
| `server5:/opt/platform/web/src/app/onboarding/install/components/mode-docs.tsx` | NEW | 9454 | `32750c52bd7197e6fae448584c427f9e8a59b0d3c1e35e1693288b874873e81a` |
| `server5:/opt/platform/web/src/app/onboarding/install/components/mode-cards.tsx` | MODIFIED | 4059 (was 3325) | `01194d6da30814de449eaffc1391a0bea9b378231339db83d7bf077816452cfc` |
| `server5:/opt/platform/web/src/app/onboarding/install/page.tsx` | MODIFIED | 6634 (was 6577) | `e959a37fa92422d630c8902ee64e405a89207e0f98fc183ca9b45b272c14eb4d` |
| `server5:/opt/platform/web/src/app/onboarding/install/components/mode-cards.tsx.pre-111-05.bak` | BACKUP | 3325 | (Plan 111-04 ship state) |
| `server5:/opt/platform/web/src/app/onboarding/install/page.tsx.pre-111-05.bak` | BACKUP | 6577 | (Plan 111-04 ship state) |

No local source-tree files touched (D-NO-LIVOS-CHANGE; `git diff HEAD -- livos/ liv/ | wc -l → 0`). Only `.planning/phases/111-server5-dashboard-install-wizard/111-05-PLAN.md` and this SUMMARY are committed locally.

## Decisions Made

- **Single accordion (one open at a time)** instead of multi-accordion (open-multiple) — reduces visual noise on a wizard step where the primary action is still mode selection. Users open one doc, read, close, open another.
- **shortDescription always rendered (header text)** vs. always-hidden — even closed entries display title + Coming Soon badge in the accordion header so users can see all 4 modes at a glance without expanding any.
- **Coming Soon stubs render NO preReqs / whatItDoes / securityTradeoffs sections** — only the `shortDescription` paragraph. Conveys clearly that there's nothing actionable to configure for these modes; users won't waste time looking for hidden detail.
- **`scrollIntoView({behavior:'smooth', block:'center'})`** instead of jump-anchor `<a href>` — provides a clearly visible animation cue that the click had an effect, and `block: 'center'` ensures the panel header lands mid-viewport (not at the very top, which would be visually awkward).
- **`e.stopPropagation()` on Learn more button** — prevents the button click from also triggering the parent card's `onChange` (which would mis-select the mode when the user only intended to open the docs).
- **`sed`-injection for page.tsx** instead of full rewrite — preserves the existing 6577-byte page.tsx file's structure exactly and injects 2 lines (1 import + 1 JSX render). Plan 111-04's wizard logic, state machine, useEffects, and event handlers are NOT touched. Minimal blast radius for the regression-safe contract.
- **No PSL extraction in mode-docs** — the docs are static informational text; no domain parsing happens here. PSL concerns are scoped to Plan 111-03's `/api/cf/resolve-zone` route.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Plan body said `pnpm install && pnpm build`; Server5 actually uses `npm`**

- **Found during:** Pre-execution Server5 reconnaissance (Step 0 of Task 1 script: `test -f pnpm-lock.yaml && echo present || echo "no pnpm-lock"; test -f package-lock.json && echo present`)
- **Issue:** Plan's `<action>` block specified `pnpm install --frozen-lockfile 2>/dev/null || pnpm install; pnpm build`. Server5 `/opt/platform/web` has `package-lock.json` (not `pnpm-lock.yaml`). Although `pnpm install` would have worked (pnpm reads npm-lock as best-effort), it would have generated a `node_modules/.pnpm` tree alongside the existing npm-installed `node_modules/`, doubling disk footprint and risking subtle resolution differences.
- **Fix:** Used `npm install --no-audit --no-fund && npm run build` (matches the actual lockfile + the orchestrator's instruction `cd /opt/platform/web && npm run build && pm2 restart web`).
- **Files modified:** none beyond what plan prescribed; this is a tooling-correctness fix.
- **Verification:** `npm install` "up to date in 1s" (no new deps to add); `npm run build` clean (`/onboarding/install` registered as ƒ); `pm2 reload web` online with PID 2028791, uptime 5s, no restart loop. UAT 1 + 2 confirm runtime behavior correct.

**2. [Rule 2 — Defensive] Used SSH-stdin pipe pattern (per Plan 111-04 lessons) instead of inline ssh-quote-heredoc**

- **Found during:** Pre-execution planning (anticipated from Plan 111-04 SUMMARY's Deviation 2 + Plan 111-03 SUMMARY's documented heredoc fail)
- **Issue:** Plan body wraps the entire workflow in `ssh root@host '<huge multi-line block with embedded TSEOF heredocs containing JSX, template literals, escaped quotes>'`. Plan 111-03 documented this failed with `unexpected EOF` on a SQL line with `'\''…'\''` nested escapes. mode-docs.tsx contains backticks + `${...}` template literals + `<svg className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`}>` — high probability of escape-storm failure.
- **Fix:** Wrote `.tmp-111-05-task1.sh` in worktree root (8.5 KB shell script), executed via `ssh root@host 'bash -s' < .tmp-111-05-task1.sh`. Script body becomes plain bash on the remote with no nested-quote escaping needed. Tmp file is .gitignored-safe (lives in worktree only, deleted by parallel-executor cleanup post-merge).
- **Files modified:** none on Server5 beyond what the plan prescribed; this is a transport tweak.
- **Verification:** Script executed cleanly first-attempt, no quoting errors, 6/6 UAT PASS.
- **Pattern recorded:** Plan 111-03 SUMMARY → Plan 111-04 SUMMARY → Plan 111-05 SUMMARY chain; future Server5-deploy plans should default to this pattern.

### Defensive Additions Beyond Plan

**3. [Rule 2 — Defensive] sha256 baseline for all 3 deployed/modified files**

- **Found during:** Task 1 Step 8
- **Issue:** Without hash baselines, future Server5 audits would have to compare against the SUMMARY's literal source quote — error-prone.
- **Fix:** `sha256sum mode-docs.tsx mode-cards.tsx page.tsx` after the rebuild + reload + UAT.
- **Verification:** All 3 hashes captured in Files table above; immutable record.

**4. [Rule 2 — Defensive] Backup file written for page.tsx (not just mode-cards.tsx)**

- **Found during:** Task 1 Step 3
- **Issue:** Plan body explicitly created a `mode-cards.tsx.pre-111-05.bak` but did NOT pre-back-up page.tsx (which the `sed` patch modifies). Without a backup, a sed regex error or future revert would require manually reconstructing the original 2-line state.
- **Fix:** `cp page.tsx page.tsx.pre-111-05.bak` BEFORE the sed runs.
- **Verification:** `/opt/platform/web/src/app/onboarding/install/page.tsx.pre-111-05.bak` exists, 6577 bytes (matches Plan 111-04 SUMMARY's recorded byte count).

**5. [Rule 2 — Defensive] Live UAT verifies BOTH 'Mode reference' heading AND regression-safe 'Choose your install mode' heading + Coming Soon count**

- **Found during:** Task 1 Step 6
- **Issue:** Plan UAT only checked positive ("Mode reference present", "Learn more about present", "Coming Soon present"). It did NOT check that Plan 111-04's UI was preserved (heading still rendering, Coming Soon badge count not unexpectedly changed).
- **Fix:** Added (a) "Choose your install mode" grep (Plan 111-04 mode-cards heading still renders) and (b) explicit count of "Coming Soon" occurrences (expected 4 = 2 from mode-cards + 2 from mode-docs; would catch a state where mode-cards lost its Coming Soon rendering).
- **Verification:** UAT 1 + UAT 2 both PASS; D-111-NO-REGRESSION sealed.

---

**Total deviations:** 5 (1 tooling correctness + 1 transport pattern + 3 defensive additions). Zero scope expansion. All deviations strengthen verification surface or unblock execution without changing the shipped artifact.

## Operator-Pending UAT (Browser-Side)

The following must-haves require interactive browser steps and are deferred to operator walk:

1. **Click a "Learn more about Local (LAN) →" button** on the wizard step 1 → page should smooth-scroll down so the Local docs accordion entry lands centered in the viewport. Source-validated (`scrollIntoView({behavior:'smooth', block:'center'})`); only animation timing requires visual confirmation.
2. **Click an accordion header** (e.g., "Hybrid (Recommended)") → expand to reveal preReqs / whatItDoes / securityTradeoffs / troubleshooting; click again → collapse. Single-active behavior — opening Hybrid while Local is open closes Local. Source-validated (`useState<WizardMode | null>` + click toggle).
3. **Click a "Coming Soon" mode card's "Learn more about Cloud →" button** → page scrolls to Cloud docs entry; the entry header is visible (with Coming Soon badge); clicking the entry header expands a single-paragraph shortDescription only (no preReqs/whatItDoes/securityTradeoffs). Source-validated.
4. **Confirm Hybrid security tradeoffs visibly include "Zero relay data plane"** when the Hybrid accordion is expanded. Source-validated; only visual confirmation needed for honesty disclosure surfacing.
5. **End-to-end install on fresh VPS (Phase 111 binding gate)** — see Plan 111-04 SUMMARY's "Operator-Pending UAT" item 5. Unchanged by this plan.

All 5 are scoped as **operator UAT**, not pre-merge gates — the server-side wiring + DOM rendering + invariant adherence are complete and proven by the 6/6 automated UAT cases above.

## Issues Encountered

- **npm vs pnpm tooling mismatch** (described in Deviation 1) — caught at Server5 reconnaissance, resolved before any deploy attempt. Cost: zero rework.
- **No other issues.** Plan 111-04 had a Caddyfile reverse-proxy gap that Plan 111-05 inherits-fixed (Caddyfile `@authproxy path` matcher already includes `/onboarding/install/*` wildcard from 111-04's Rule 3 patch — covers any future sub-routes within the wizard). No additional Caddy work needed.

## Sacred SHA Preservation Check

| When | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` |
|------|------------------------------------------------------------|
| Pre-execution (post-`git reset --hard cc12cf33`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ |
| Pre-commit | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ (no `liv/` files touched) |

No `liv/` source-tree changes (Server5-only plan). Pre-commit hook will gate the SUMMARY commit.

## Cross-repo Caveat

Server5 (`45.137.194.102`) is NOT a git repo — `/opt/platform/web` is direct-edited via SSH (no `git pull` flow there). All 5 file changes (1 NEW + 2 MODIFIED + 2 BACKUP) exist ONLY on Server5's filesystem. To replicate on a fresh Server5 (or recover from disaster):

```bash
# 1. Re-run the SSH-stdin script from this plan's worktree (lives in
#    /.claude/worktrees/agent-<...>/.tmp-111-05-task1.sh; deleted after worktree
#    cleanup — paste from SUMMARY's Files table sha256 record to verify post-replication
#    file identity).
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master \
    -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    root@45.137.194.102 'bash -s' < .tmp-111-05-task1.sh

# 2. Verify hashes match
ssh root@45.137.194.102 'sha256sum /opt/platform/web/src/app/onboarding/install/components/mode-docs.tsx /opt/platform/web/src/app/onboarding/install/components/mode-cards.tsx /opt/platform/web/src/app/onboarding/install/page.tsx'
# Expected:
#   32750c52bd7197e6fae448584c427f9e8a59b0d3c1e35e1693288b874873e81a  …/mode-docs.tsx
#   01194d6da30814de449eaffc1391a0bea9b378231339db83d7bf077816452cfc  …/mode-cards.tsx
#   e959a37fa92422d630c8902ee64e405a89207e0f98fc183ca9b45b272c14eb4d  …/page.tsx
```

## Rollback Procedure

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master \
    -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    root@45.137.194.102 'bash -s' << 'SH'
set -euo pipefail

# 1. Remove ModeDocs component
rm /opt/platform/web/src/app/onboarding/install/components/mode-docs.tsx

# 2. Restore pre-edit backups
cp /opt/platform/web/src/app/onboarding/install/components/mode-cards.tsx.pre-111-05.bak \
   /opt/platform/web/src/app/onboarding/install/components/mode-cards.tsx
cp /opt/platform/web/src/app/onboarding/install/page.tsx.pre-111-05.bak \
   /opt/platform/web/src/app/onboarding/install/page.tsx

# 3. Rebuild + reload
cd /opt/platform/web && npm run build && pm2 reload web --update-env

# 4. Verify
TOKEN=$(sudo -u postgres psql -d platform -tAc "SELECT token FROM sessions WHERE user_id = '3eae6ced-af48-4a39-ad82-1880b2f4bd0e' AND expires_at > NOW() ORDER BY expires_at DESC LIMIT 1;" | tr -d '[:space:]')
HTML=$(curl -sSf "https://livinity.io/onboarding/install" -H "Cookie: liv_session=$TOKEN")
echo "$HTML" | grep -c "Mode reference"  # expect 0
echo "$HTML" | grep -c "Choose your install mode"  # expect 1 (Plan 111-04 still works)
SH
```

After rollback:
- `https://livinity.io/onboarding/install` → Plan 111-04 wizard (mode-cards + step-2/3 form, no mode-docs panel)
- No DB state to restore (this plan made zero DB schema or data changes)
- No log state to scrub
- Plan 111-01..111-04 wiring untouched and still functional

## PHASE 111 CLOSE NOTE

**This is the final plan in Phase 111-server5-dashboard-install-wizard.** All 5 plans now shipped:

| Plan | Subject | Status |
|------|---------|--------|
| 111-01 | install.sh URL fix (`scripts/install.sh` modular dispatcher) | SHIPPED (commit `8e9cfa3e`) |
| 111-02 | api_keys multi-per-user CRUD + DELETE [id] | SHIPPED (commit `52d2a4f9`) |
| 111-03 | POST /api/cf/resolve-zone (CF API proxy, token-no-persist) | SHIPPED (commit `448a9cd9`) |
| 111-04 | /onboarding/install 3-step wizard + Caddyfile patch | SHIPPED (commit `cc12cf33`) |
| 111-05 | Mode reference docs panel | SHIPPED (this commit) |

The phase-level SUMMARY (rollup of all 5 plans) should be created next via the standard end-of-phase doc-writer pass.

**Phase 111 binding UAT gate** (per memory `feedback_milestone_uat_gate`): operator-walked end-to-end install on a fresh Ubuntu 24.04 VPS with Hybrid mode + real Cloudflare API token. The wizard now generates a runnable single-line install command; Plan 111-01 ensures `https://livinity.io/install.sh` serves the modular installer; Plans 111-02 + 111-03 ensure the baked-in API key and CF zone-id are real and persist correctly. All plumbing converges in Plan 111-04 Task 4 checkpoint:

> "End-to-end install on fresh VPS (Phase 111 binding gate) — provision a fresh Ubuntu 24.04 VPS, paste the wizard-generated command, wait ~10-15 min for install, register a user at the configured URL, open App Store. This is the closing gate for Phase 111 as a whole; will be walked by the operator after this plan ships."

The operator should now perform that walk.

**Deferred to Phase 112+:** ROADMAP's P111-05 verification polling endpoint (marked "optional" in original ROADMAP). Justification per PLANNING-NOTES.md: the existing `/dashboard` already polls `relay /internal/user-status` every 10s and shows `server.online`, providing a workable post-install verify path. A dedicated polling endpoint can be added if user feedback indicates the existing dashboard polling is insufficient.

## Follow-ups / Carry-forward

- **Phase 111 binding UAT walk** (described in PHASE 111 CLOSE NOTE above). Operator action required.
- **Browser-side test automation (Playwright)** — same as Plan 111-04 follow-up. Future Phase 111+ work could add headless browser tests for the on-blur CF resolution + Copy button + Back-button state preservation + accordion expand/collapse + scroll-jump animation. Not blocking for v34.0 ship.
- **Static `dashboard.html` link to wizard** — Plan 111-04 noted this. The Caddyfile rewrites `/dashboard` to a static `dashboard.html`; users on the static dashboard cannot trivially "jump into" the wizard from a button there. Hand-edit a "Install on a server" link into `/opt/landing/dashboard.html` (or wherever the static file lives) once the operator confirms placement intent. Out of Phase 111 scope.
- **Apply the docs panel pattern to other wizards** — if v34.x adds more multi-step onboarding flows (CF Tunnel setup, Cloud signup, multi-server federation), reuse the ModeDocs accordion pattern with a domain-specific docs registry. The DOM-ID-jump pattern (`mode-doc-<id>` + `scrollIntoView`) is reusable and shallow-coupling.

## Threat Model Coverage

All 4 STRIDE entries from PLAN's `<threat_model>` covered and verified:

| Threat ID | Disposition | Evidence |
|-----------|-------------|----------|
| T-111-05-01 (Information Disclosure: internal hostnames/IPs in docs) | mitigate | content reviewed; only Server5 IP `45.137.194.102` (already public DNS for `livinity.io`) and intentional Hybrid-mode reference to `{username}.livinity.io` relay alias appear (the latter is the deliberate D-111-RELAY-DATA-PLANE-DOC honesty disclosure) |
| T-111-05-02 (Tampering: XSS via mode-doc field content) | mitigate | all content is statically authored TS constants rendered through React text nodes; zero `dangerouslySetInnerHTML` usage in mode-docs.tsx (live grep) |
| T-111-05-03 (Repudiation: doc panel views unaudited) | accept | informational only — no actions taken; logging not warranted |
| T-111-05-04 (DoS: scrollIntoView abuse) | accept | client-side only; no network or server cost; rate-limit not warranted |

ASVS L1: V14.2 ✓ (CSP unaffected; no inline scripts), V5.3 ✓ (output encoding via React).

## Self-Check: PASSED

- [x] `/opt/platform/web/src/app/onboarding/install/components/mode-docs.tsx` exists on Server5 (9454 bytes, sha256 `32750c52…73e81a`)
- [x] `/opt/platform/web/src/app/onboarding/install/components/mode-cards.tsx` modified (4059 bytes, sha256 `01194d6d…52cfc`); contains "Learn more"; contains scrollToDoc helper
- [x] `/opt/platform/web/src/app/onboarding/install/page.tsx` modified (6634 bytes, sha256 `e959a37f…14eb4d`); contains `import ModeDocs`; contains `<ModeDocs />`
- [x] `/opt/platform/web/src/app/onboarding/install/components/mode-cards.tsx.pre-111-05.bak` exists (3325 bytes — Plan 111-04 ship state)
- [x] `/opt/platform/web/src/app/onboarding/install/page.tsx.pre-111-05.bak` exists (6577 bytes — Plan 111-04 ship state)
- [x] mode-docs.tsx contains "Zero relay data plane" string (D-111-RELAY-DATA-PLANE-DOC) — live grep
- [x] mode-docs.tsx Hybrid `securityTradeoffs[1]` is the verbatim relay-data-plane disclosure
- [x] mode-docs.tsx tunnel + cloud entries are Coming Soon stubs (only shortDescription, no preReqs/whatItDoes/securityTradeoffs)
- [x] mode-cards.tsx "Learn more about <Mode> →" button per card (4 occurrences total)
- [x] mode-cards.tsx scrollToDoc(id) calls `document.getElementById('mode-doc-' + id).scrollIntoView({behavior:'smooth', block:'center'})`
- [x] mode-cards.tsx intro paragraph has `<a href="#mode-docs-section">See full reference below</a>` anchor for keyboard navigation
- [x] page.tsx imports ModeDocs immediately after WizardStepper import
- [x] page.tsx `<ModeDocs />` rendered immediately after `<ModeCards value={mode} onChange={setMode} />` inside step === 1 block
- [x] `npm run build` clean — `/onboarding/install` route still registered as ƒ post-rebuild
- [x] `pm2 status web` → `online`, PID 2028791, uptime 5s post-reload, no restart loop
- [x] UAT 1 ModeDocs HTML rendering — "Mode reference" + "Learn more about" + 4 "Coming Soon" badges ✓
- [x] UAT 2 Plan 111-04 regression-safe — "Choose your install mode" still renders ✓
- [x] UAT 3 D-111-RELAY-DATA-PLANE-DOC source-file proof ✓
- [x] UAT 4 pm2 web online post-reload ✓
- [x] UAT 5 Next.js build clean ✓
- [x] UAT 6 page.tsx import + render injection at correct positions ✓
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved pre- and at-commit-time
- [x] `git diff HEAD -- livos/ liv/ | wc -l → 0` (D-NO-LIVOS-CHANGE upheld)
- [x] PHASE 111 CLOSE NOTE documented (5/5 plans listed, binding UAT gate referenced, deferred work documented)
- [x] SUMMARY artifact created and ready for commit

---
*Phase: 111-server5-dashboard-install-wizard*
*Plan: 05*
*Completed: 2026-05-13*
