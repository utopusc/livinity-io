---
phase: 71-computer-use-foundation
plan: 01
subsystem: catalog/builtin-apps + server5-platform-apps
tags: [bytebot, catalog, infra, app-store, builtin-apps, server5, computer-use]
dependency_graph:
  requires:
    - "livos/packages/livinityd/source/modules/apps/builtin-apps.ts (BuiltinAppManifest type + BUILTIN_APPS array)"
    - "scripts/suna-insert.sql (structural reference for Server5 apps INSERT pattern)"
  provides:
    - "Catalog entry id='bytebot-desktop' — consumed by 71-04 container manager + general installForUser"
    - "Server5 platform.apps SQL upsert — surfaces bytebot-desktop in apps.livinity.io public catalog"
    - "Lockstep contract: builtin-apps.ts manifest <-> bytebot-insert.sql compose block must stay in sync"
  affects:
    - "71-04 (container manager reads bytebot-desktop manifest)"
    - "71-06 (deploy walk applies SQL on Server5 + manual smoke)"
    - "Future Phase 72 (agent loop targets the bytebot-desktop slug)"
tech_stack:
  added: []
  patterns:
    - "BuiltinAppManifest array-append pattern (matches Suna entry shape)"
    - "Idempotent INSERT ... ON CONFLICT (slug) DO UPDATE SET (matches Suna SQL)"
    - "Dollar-quoted heredoc \\$compose\\$...\\$compose\\$ for embedding YAML compose in SQL VALUES"
    - "manifest jsonb literal cast (::jsonb) for marketplace UI envelope"
key_files:
  created:
    - "scripts/bytebot-insert.sql (56 lines)"
  modified:
    - "livos/packages/livinityd/source/modules/apps/builtin-apps.ts (+59 lines, append-only)"
decisions:
  - "image=ghcr.io/bytebot-ai/bytebot-desktop:edge — Bytebot's only stable channel (v31-DRAFT line 52). Pinning to specific digest deferred (no ops re-pull workflow yet). T-71-01-04 accepted."
  - "privileged=true + shm_size=2g — XFCE+chromium runtime requirement. Mini PC single-user constraint accepts privileged exposure (STATE.md line 71). NO docker.sock mount per D-20 T-CONTAINER-ESCAPE."
  - "subdomain='desktop' (NOT 'bytebot') per D-05 lock — matches P72 expectations + REQUIREMENTS.md CU-FOUND-01."
  - "requiresAiProvider=false — P71 ships infra ONLY; LLM proxy wiring is P72. Setting true here would prematurely trigger Phase 43.2 broker injection at install time."
  - "environmentOverrides=[] — empty array. P72 may runtime-inject via agent loop, but install dialog stays clean."
  - "ports='127.0.0.1:9990:9990' (host-side placeholder; installForUser:1066 rewrites at install time per allocated port per D-02)."
  - "version='0.1.0' as LivOS-side display version — Bytebot's :edge tag has no semver."
  - "scripts/bytebot-insert.sql is NOT auto-executed against Server5 — written for 71-06 ops walk (`ssh root@45.137.194.102 'sudo -u postgres psql platform' < scripts/bytebot-insert.sql`). D-NO-SERVER4 honored: write only, execute deferred."
  - "Lockstep contract: any future change to the bytebot manifest in builtin-apps.ts MUST be reflected in scripts/bytebot-insert.sql in the same commit. Drift = traceable bug. Same risk pattern that bit Suna in 64-04."
metrics:
  duration: "~2 minutes 30 seconds"
  completed: "2026-05-05T03:12:34Z"
  tasks: 2
  files: 2
  commits: 2
---

# Phase 71 Plan 01: Bytebot Desktop Catalog Entry Summary

Bytebot Desktop image entry shipped into both LivOS catalog systems — `BuiltinAppManifest` (Mini PC installForUser path) and Server5 `platform.apps` SQL (apps.livinity.io public store) — in lockstep on slug, version, and compose service block.

## Final Manifest Shape (builtin-apps.ts)

Appended to `BUILTIN_APPS` array as last entry (file: `livos/packages/livinityd/source/modules/apps/builtin-apps.ts`, lines ~1485-1543):

```typescript
{
  // Phase 71 (CU-FOUND-01) — Bytebot Desktop image for AI-driven computer use.
  // Container is typically NOT started by the user directly — the Liv Agent
  // spawns it on demand via the computer-use container manager
  // (livos/packages/livinityd/source/modules/computer-use/container-manager.ts,
  // wired in 71-04). Standalone /computer route exists for debugging
  // (71-06 / CU-FOUND-05).
  //
  // Privileged + shm 2g per v31-DRAFT line 577 — required for Bytebot to
  // operate XFCE + chromium. Mini PC single-user constraint accepts the
  // privileged exposure (STATE.md line 71). NO docker.sock mount.
  id: 'bytebot-desktop',
  name: 'Bytebot Desktop',
  tagline: 'AI-driven computer use desktop',
  version: '0.1.0',
  category: 'developer-tools',
  port: 9990,
  description: 'Bytebot Desktop is an XFCE-based Linux desktop image (1280x960) packaged for AI agent control. Apache 2.0 licensed. Designed to be driven programmatically by the Liv Agent — typically not started directly; the Liv Agent spawns this on demand. Includes Firefox, file manager, terminal, and a VNC server (websockify on port 9990) for live screen viewing.',
  website: 'https://github.com/bytebot-ai/bytebot',
  developer: 'Bytebot AI',
  icon: 'https://raw.githubusercontent.com/utopusc/livinity-apps-gallery/master/bytebot/icon.svg',
  repo: 'https://github.com/bytebot-ai/bytebot',
  docker: {
    image: 'ghcr.io/bytebot-ai/bytebot-desktop:edge',
    environment: {
      RESOLUTION: '1280x960',
      DISPLAY: ':0',
    },
    volumes: ['/data'],
  },
  installOptions: {
    subdomain: 'desktop',
    environmentOverrides: [],
  },
  compose: {
    mainService: 'bytebot',
    services: {
      bytebot: {
        image: 'ghcr.io/bytebot-ai/bytebot-desktop:edge',
        restart: 'unless-stopped',
        environment: {
          RESOLUTION: '1280x960',
          DISPLAY: ':0',
        },
        volumes: ['${APP_DATA_DIR}/data:/data'],
        ports: ['127.0.0.1:9990:9990'],
        privileged: true,
        shm_size: '2g',
        healthcheck: {
          test: ['CMD-SHELL', 'curl -f http://localhost:9990/health || exit 1'],
          interval: '30s',
          timeout: '10s',
          retries: 3,
          start_period: '60s',
        },
      },
    },
  },
},
```

## Final SQL Shape (scripts/bytebot-insert.sql)

```sql
-- Phase 71 (CU-FOUND-01) — Upsert Bytebot Desktop into Server5 apps table
-- (livinity.io/store catalog). Idempotent — safe to re-run.
-- Reference: scripts/suna-insert.sql (shipped 2026-05-04 in 64-04).
INSERT INTO apps (
  slug, name, tagline, description, category, version,
  docker_compose, manifest, icon_url, featured, verified, sort_order
) VALUES (
  'bytebot-desktop',
  'Bytebot Desktop',
  'AI-driven computer use desktop',
  E'Bytebot Desktop is an XFCE-based Linux desktop image (1280x960) packaged for AI agent control. Apache 2.0 licensed.\n\nDesigned to be driven programmatically by the Liv Agent — typically not started directly; the Liv Agent spawns this on demand. Includes Firefox, file manager, terminal, and a VNC server (websockify on port 9990) for live screen viewing.\n\nThis app pairs with the Liv Agent computer use loop (Phase 72) to enable browse + click + type tasks like "navigate to gmail.com and check unread".',
  'developer-tools',
  '0.1.0',
$compose$
services:
  bytebot:
    image: ghcr.io/bytebot-ai/bytebot-desktop:edge
    restart: unless-stopped
    environment:
      RESOLUTION: 1280x960
      DISPLAY: ":0"
    volumes:
      - ${APP_DATA_DIR}/data:/data
    ports:
      - 127.0.0.1:9990:9990
    privileged: true
    shm_size: 2g
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:9990/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
$compose$,
  '{"port":9990,"subdomain":"desktop","requiresAiProvider":false,"installOptions":{"environmentOverrides":[]}}'::jsonb,
  'https://raw.githubusercontent.com/utopusc/livinity-apps-gallery/master/bytebot/icon.svg',
  false,
  true,
  110
)
ON CONFLICT (slug) DO UPDATE SET
  name           = EXCLUDED.name,
  tagline        = EXCLUDED.tagline,
  description    = EXCLUDED.description,
  category       = EXCLUDED.category,
  version        = EXCLUDED.version,
  docker_compose = EXCLUDED.docker_compose,
  manifest       = EXCLUDED.manifest,
  icon_url       = EXCLUDED.icon_url,
  verified       = EXCLUDED.verified,
  sort_order     = EXCLUDED.sort_order,
  updated_at     = now();

-- Verify
SELECT id, slug, name, version, category, featured, verified
FROM apps WHERE slug = 'bytebot-desktop';
```

## Commit SHAs

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Append bytebot-desktop BuiltinAppManifest to builtin-apps.ts | `94bdcc1e` | `livos/packages/livinityd/source/modules/apps/builtin-apps.ts` (+59 lines) |
| 2 | Create scripts/bytebot-insert.sql for Server5 catalog | `43e51531` | `scripts/bytebot-insert.sql` (NEW, 56 lines) + parallel-race file (see Deviation #2) |

## Sacred SHA Verification Trail

| Checkpoint | Time (UTC) | `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` |
|------------|-----------|---------------------------------------------------------------|
| Plan start | 03:10:04 | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✓ |
| After Task 1 (post-commit) | 03:11:30 | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✓ |
| After Task 2 (post-commit) | 03:12:34 | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✓ |

D-71-SACRED satisfied — sacred SHA `4f868d31...` UNCHANGED across the entire plan.

## Greppability Sanity Check

```
$ git grep -n "id: 'bytebot-desktop'" livos/packages/livinityd/source/modules/apps/builtin-apps.ts
1496:    id: 'bytebot-desktop',                                          # 1 line ✓ (expected: 1)

$ git grep -n "ghcr.io/bytebot-ai/bytebot-desktop:edge" livos/packages/livinityd/source/modules/apps/builtin-apps.ts
1508:      image: 'ghcr.io/bytebot-ai/bytebot-desktop:edge',             # 2 lines ✓ (expected: 2)
1523:          image: 'ghcr.io/bytebot-ai/bytebot-desktop:edge',

$ git grep -n "shm_size: '2g'" livos/packages/livinityd/source/modules/apps/builtin-apps.ts
1532:          shm_size: '2g',                                           # 1 line ✓ (>= 1)

$ grep -c '\$compose\$' scripts/bytebot-insert.sql                       # 2 ✓
$ grep -c 'privileged: true' scripts/bytebot-insert.sql                  # 1 ✓
$ grep -c 'bytebot-desktop' scripts/bytebot-insert.sql                   # 3 ✓ (>= 3)
```

All 7 plan must-have truths greppable.

## Build & Verification

- **Sacred SHA** verified at start AND end of EACH task: `4f868d31...` unchanged ✓
- **`pnpm --filter livinityd typecheck`**: zero NEW errors on touched file (`builtin-apps.ts`). Pre-existing errors in `user/routes.ts`, `widgets/routes.ts`, `file-store.ts`, `apps/apps.ts`, and the Suna entry's `working_dir` (line 1433) predate this plan — confirmed via `git stash` baseline diff. Same typecheck-substitution precedent as 76-01 (memory line 136).
- **D-DESKTOP-ONLY** honored — only `bytebot-desktop` image; NO Bytebot agent code referenced or imported.
- **D-NO-BYOK** preserved — no Anthropic API key path, no LLM provider env vars in the manifest.
- **D-NO-SERVER4** honored — SQL written, NOT executed against Server5. Apply step deferred to 71-06 ops walk.
- **D-20 T-CONTAINER-ESCAPE** honored — `privileged: true` present, `/var/run/docker.sock` mount EXPLICITLY ABSENT (greppable: zero hits for `/var/run/docker.sock` in the bytebot service block).

## Deviations from Plan

### Deviation #1: Typecheck baseline substitution (Rule 3 — pre-existing failures)

`pnpm --filter livinityd typecheck` does not exit 0 in the current repo state (baseline failures in `user/routes.ts`, `widgets/routes.ts`, `file-store.ts`, `apps/apps.ts`, and pre-existing `working_dir` literal in the Suna manifest at line 1433). All errors predate this plan (verified via `git stash`-then-typecheck baseline diff). Per `<scope_boundary>` of execute-plan workflow, only auto-fix issues DIRECTLY caused by current task changes — these are out of scope.

The bytebot-desktop entry I added introduces ZERO new typecheck errors. Plan must-have ("`pnpm --filter livinityd typecheck` exits 0 with no TypeScript errors") substituted with: "no NEW errors introduced by this plan; touched file `builtin-apps.ts` baseline-clean except for pre-existing `working_dir` issue in unrelated Suna entry." Same pattern + precedent as 76-01 (memory line 136).

### Deviation #2: Parallel-worktree race included an unrelated file in Task 2 commit

When committing Task 2 (`git add scripts/bytebot-insert.sql && git commit ...`), a sibling agent's untracked file `livos/packages/livinityd/source/modules/computer-use/bytebot-tools.test.ts` (likely Phase 72-* test scaffold) was swept into commit `43e51531` between staging and finalize. Per `<destructive_git_prohibition>` rule (NEVER `git rm` files I didn't author, NEVER `git reset --hard` blanket), the file is left in place. The 71-01 deliverable (`scripts/bytebot-insert.sql`) is correctly committed with intended content; the orphan file belongs to a sibling agent's plan. Same race-condition class observed and documented in 68-05 / 68-06 / 70-06 SUMMARY decisions.

Action: none required from this plan. The future plan that authors `bytebot-tools.test.ts` will adopt-the-already-committed file rather than creating it fresh.

### Deviation #3: SQL file 56 lines vs `min_lines: 60` artifact spec

Plan must-have artifacts assertion says `scripts/bytebot-insert.sql` `min_lines: 60`. My file is 56 lines using the exact content the plan task step 2 provided verbatim. The discrepancy is a plan-author oversight between the front-matter `min_lines` and the task-body literal content (the literal would never reach 60 lines without padding). I followed the task body (authoritative) over the artifact metadata. Same SQL structure as `scripts/suna-insert.sql` (77 lines because Suna has more env_overrides + a longer description); bytebot's leaner shape produces 56.

No auto-fix attempted — would require either fabricating padding comments or expanding sections beyond what the task body specifies, both of which would violate scope.

## Drift-Detection Note (CRITICAL)

**Any future change to the bytebot-desktop manifest in `livos/packages/livinityd/source/modules/apps/builtin-apps.ts` MUST be reflected in `scripts/bytebot-insert.sql` in the SAME commit.**

Drift between these two files is the exact pattern that bit Suna in 64-04 (memory entry `reference_server5_app_store.md` documents the workflow + risk). The two files contain manually-synchronized copies of:

- slug (`bytebot-desktop`)
- version (`0.1.0`)
- category (`developer-tools`)
- compose service block (image, restart, environment, volumes, ports, privileged, shm_size, healthcheck)
- manifest jsonb (port, subdomain, requiresAiProvider, environmentOverrides)

There is NO automatic generator. A future PR that touches one without the other introduces a traceable bug.

## Threat Surface Recap

Per plan `<threat_model>`:
- **T-71-01-01** (privileged container) — accepted; Mini PC single-user.
- **T-71-01-02** (image pull) — accepted; ghcr.io public Apache 2.0.
- **T-71-01-03** (manual SQL apply) — mitigated; idempotent ON CONFLICT + verify SELECT at bottom.
- **T-71-01-04** (`:edge` tag mutability) — accepted; only stable Bytebot channel.
- **T-71-01-05** (privileged + 2g shm DoS) — accepted; deliberate budget; max-1-per-user enforced in 71-03.

No new threat surface introduced beyond what the plan registered.

## Self-Check: PASSED

- [x] `livos/packages/livinityd/source/modules/apps/builtin-apps.ts` — modified, +59 lines, contains `id: 'bytebot-desktop'` (verified)
- [x] `scripts/bytebot-insert.sql` — created, 56 lines, contains `bytebot-desktop` (verified 3 occurrences)
- [x] Commit `94bdcc1e` (Task 1) exists in `git log`
- [x] Commit `43e51531` (Task 2) exists in `git log`
- [x] Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged at plan start, post-Task-1, and post-Task-2
- [x] All 7 plan must-have truths greppable (id × 1, image × 2, shm_size, $compose$ × 2, privileged × 1, bytebot-desktop × 3, sacred SHA)
- [x] No `/var/run/docker.sock` mount in bytebot service block (D-20 T-CONTAINER-ESCAPE)
