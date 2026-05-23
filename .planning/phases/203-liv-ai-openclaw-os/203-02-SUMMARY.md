---
phase: 203-liv-ai-openclaw-os
plan: 02
subsystem: liv-ai
tags: [clone, rebrand, wave-1, sequential, openclaw-os, liv-claw-os]
status: code-complete
completed: 2026-05-23
duration_minutes: ~60
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_status: preserved (INV-203-01 PASS — 3 commits, 0 sacred files touched, hook PASS on every commit)
dependency_graph:
  requires:
    - Plan 203-01 (pinned upstream SHA + folder layout + DO/DON'T audit)
  provides:
    - In-tree fork of thesysdev/openclaw-os at livos/packages/liv-claw-os/
    - @livos/liv-claw-os workspace package (pnpm-discoverable, build PASS)
    - Liv AI-branded user-visible surface (title, manifest, sidebar logo, settings copy, READMEs, plugin manifest)
    - Wire-protocol-preserved fork (binary-compatible with upstream openclaw gateway)
    - Reproducible upgrade marker (UPSTREAM-COMMIT file pins 076ae63)
  affects: [Plan 203-03, Plan 203-04, Plan 203-05, Plan 203-06, Plan 203-09]
tech_stack:
  added:
    - openclaw npm package family (claw-client + claw-plugin transitive deps, ~340 packages)
    - Next.js 16.2.6 + React 19 (claw-client)
    - @openuidev/lang-core 0.2.2 (claw-plugin)
    - esbuild 0.27 (claw-plugin bundler)
  patterns:
    - in-tree fork with UPSTREAM-COMMIT pin (vs git submodule)
    - flat-merged inner workspace (outer pnpm-workspace.yaml registers inner packages/* directly)
    - wire-protocol-preserved rebrand (user-visible strings only, identifiers untouched)
    - upstream cross-reference comments retained for debuggability
key_files:
  created:
    - livos/packages/liv-claw-os/** (205 files; full upstream tree at SHA 076ae63)
    - livos/packages/liv-claw-os/UPSTREAM-COMMIT (pinned-SHA marker)
    - .planning/phases/203-liv-ai-openclaw-os/203-02-SUMMARY.md (this file)
  modified:
    - livos/pnpm-workspace.yaml (extended with packages/liv-claw-os + packages/liv-claw-os/packages/*)
    - livos/pnpm-lock.yaml (resolved new workspace members + transitive deps)
    - livos/packages/liv-claw-os/package.json (name -> @livos/liv-claw-os, description rewritten)
    - livos/packages/liv-claw-os/README.md (full rewrite: LivOS fork framing)
    - livos/packages/liv-claw-os/AGENTS.md (fork-note prefix; protocol body preserved)
    - livos/packages/liv-claw-os/SECURITY.md (LivOS internal disclosure flow)
    - livos/packages/liv-claw-os/CONTRIBUTING.md (fork-note prefix)
    - livos/packages/liv-claw-os/packages/claw-plugin/openclaw.plugin.json (name + description rebrand)
    - livos/packages/liv-claw-os/packages/claw-plugin/package.json (description rebrand)
    - livos/packages/liv-claw-os/packages/claw-plugin/README.md (Liv AI framing)
    - livos/packages/liv-claw-os/packages/claw-plugin/src/index.ts (plugin name/description + CLI group descriptions)
    - livos/packages/liv-claw-os/packages/claw-client/README.md (Liv AI framing)
    - livos/packages/liv-claw-os/packages/claw-client/src/app/layout.tsx (page title + metadata)
    - livos/packages/liv-claw-os/packages/claw-client/src/components/layout/AppSidebar.tsx (Logo Liv/AI)
    - livos/packages/liv-claw-os/packages/claw-client/src/components/layout/MobileShell.tsx (header Liv AI)
    - livos/packages/liv-claw-os/packages/claw-client/src/components/settings/SettingsDialog.tsx (settings copy)
    - livos/packages/liv-claw-os/packages/claw-client/src/components/mobile/MobileSettingsDialog.tsx (settings copy)
    - livos/packages/liv-claw-os/packages/claw-client/public/manifest.webmanifest (PWA install dialog)
    - livos/packages/liv-claw-os/packages/claw-client/public/favicon.svg (placeholder text SVG, dimensions preserved)
  deleted:
    - livos/packages/liv-claw-os/assets/openclaw-os-hero.png (orphaned after README rewrite no longer referenced it)
    - livos/packages/liv-claw-os/assets/ (now-empty directory removed)
decisions:
  - "Inner package folder names (claw-client/, claw-plugin/) preserved — D-203-02 explicit clause; wire-protocol cross-reference debuggability"
  - "TypeScript class/type/function names (OpenClawEngine, OpenClawPluginToolContext, createOpenClawAGUIMapper) NOT renamed — D-203-03 'NO functional code changes during rebrand pass'"
  - "Session-key suffix ':openclaw-os' + plugin id 'openclaw-os-plugin' + HTTP route '/plugins/openclawos' + 'openclawos.*' RPC namespace preserved — spike DO/DON'T 'wire-protocol constants intact'"
  - "npm package names (openclaw, @openuidev/openclaw-os-plugin, @openuidev/claw-client) preserved — required for upstream openclaw gateway binary compatibility"
  - "Outer livos/pnpm-workspace.yaml registers inner packages flatly (packages/liv-claw-os/packages/*) — pnpm doesn't natively support nested workspaces; flat registration avoids the second pnpm-workspace.yaml conflicting at install time"
  - "Favicon swapped with text-only 'Liv AI' SVG placeholder (Plan 203-12 will revisit with real logo)"
  - "scripts/setup-tunnel.mjs + scripts/open-ui.mjs log messages NOT rebranded — not invoked by LivOS Mini PC deploy (systemd unit takes over per D-203-04)"
metrics:
  completed: 2026-05-23
  duration: ~60 minutes
  tasks_completed: 5/5
  commits: 3 (ee05a9ef clone, 58c738de rebrand, af9f7ff5 lockfile)
  files_created: 205 (clone) + 2 (UPSTREAM-COMMIT, SUMMARY.md)
  files_modified: 17 (rebrand sweep) + 2 (pnpm-workspace.yaml, pnpm-lock.yaml)
  files_deleted: 1 (orphaned hero PNG)
  sacred_files_touched: 0 (INV-203-01 single-commit safe x3)
  build_pre_rebrand: not run (clone-only baseline; Task 2 verify deferred to post-rebrand combined check)
  build_post_rebrand: PASS (esbuild 169.2kb / 168ms; Next.js 16 4 static routes / ~12s)
  user_visible_openclaw_residue: 0 (all 46 remaining matches are type names, imports, upstream cross-ref comments, or fork-note attribution — none are user-visible product strings)
deviations:
  - "[Rule 3 - blocking] pnpm install at outer workspace fails with packages/ui postinstall 'mkdir -p' Windows shell incompat — pre-existing, unrelated to Phase 203. Documented in commit af9f7ff5; liv-claw-os deps DID install (visible in packages/liv-claw-os/packages/claw-plugin/node_modules) and pnpm --filter @livos/liv-claw-os build PASSES. SCOPE BOUNDARY: not auto-fixed."
auth_gates: 0
---

# Phase 203 Plan 02: openclaw-os Clone + Rebrand Summary

One-liner: **Cloned thesysdev/openclaw-os@076ae63 into livos/packages/liv-claw-os/ as a flat in-tree fork; executed the full user-visible-string rebrand to "Liv AI"; preserved every wire-protocol identifier (session-key suffix, plugin id, HTTP route, RPC namespace, npm names, class names); build PASSES post-rebrand (esbuild 169.2kb plugin bundle + Next.js 4-route static export); INV-203-01 sacred SHA preserved on all 3 commits.**

## What this plan delivered

### Clone (commit ee05a9ef)
- `git clone https://github.com/thesysdev/openclaw-os livos/packages/liv-claw-os` then `git checkout 076ae63478fa2417d38c39b5b6d13f9188b8580b` (SPIKE pin from Plan 203-01)
- `rm -rf .git .github` to flat-merge into the LivOS monorepo (upstream history not retained — LivOS commits are now the canonical history)
- Wrote `UPSTREAM-COMMIT` marker file recording the pinned SHA — enables future upstream-bump scripts to know the merge-base
- Renamed root `package.json` `name`: `claw-workspace` → `@livos/liv-claw-os` (workspace-discoverable)
- Extended `livos/pnpm-workspace.yaml` to register two glob patterns:
  - `packages/liv-claw-os` (the container with `name: @livos/liv-claw-os`)
  - `packages/liv-claw-os/packages/*` (inner claw-client + claw-plugin registered flatly; pnpm doesn't natively support nested workspaces)
- LICENSE file preserved (upstream MIT attribution)

### Rebrand (commit 58c738de)
17 files modified, 1 deleted (orphaned hero PNG). User-visible product strings switched to "Liv AI":

**Documentation:**
- `README.md` — full rewrite framed as a LivOS-internal fork; preserved upstream attribution + the `UPSTREAM-COMMIT` reference; rewrote the mermaid diagram to show the Caddy `/liv-ai-app/* → :18789` reverse-proxy
- `AGENTS.md` — added fork-note prefix; body preserved verbatim (protocol contract doc)
- `SECURITY.md` — rewrote to point LivOS issues at the internal disclosure flow; upstream security advisories still routed to thesysdev/openclaw-os
- `CONTRIBUTING.md` — fork-note prefix; gateway hint updated to mention `liv-claw-gateway.service`

**Plugin metadata (user-visible in plugin manager / `--help` / npm):**
- `packages/claw-plugin/openclaw.plugin.json` — `name`/`description` → "Liv AI — OpenUI workspace"
- `packages/claw-plugin/package.json` — `description` (npm registry visible) rebranded
- `packages/claw-plugin/src/index.ts` — `definePluginEntry({ name, description })` rebranded + the two `api.registerCli` `.description()` strings (Liv AI controls) rebranded

**Client UI surfaces (browser-visible):**
- `packages/claw-client/src/app/layout.tsx` — `metadata.title` = `"Liv AI"`, `metadata.description` = `"Liv AI — Generative UI workspace for LivOS"`, `appleWebApp.title`
- `packages/claw-client/public/manifest.webmanifest` — PWA install dialog `name` + `short_name` + `description`
- `packages/claw-client/public/favicon.svg` — replaced upstream claw-shaped icon with minimal text-only "Liv AI" placeholder SVG (Plan 203-12 will replace with real branding)
- `packages/claw-client/src/components/layout/AppSidebar.tsx` — `<Logo name="Liv" suffix="AI" .../>` (was "OpenClaw OS")
- `packages/claw-client/src/components/layout/MobileShell.tsx` — header `<h2>` rebranded
- `packages/claw-client/src/components/settings/SettingsDialog.tsx` + `MobileSettingsDialog.tsx` — "Connect Liv AI to your openclaw gateway" copy

### Build verification (commit af9f7ff5)
- `pnpm install` from `livos/` resolved all new workspace members + transitive deps successfully (visible in `packages/liv-claw-os/packages/claw-plugin/node_modules` containing `openclaw`, `@openuidev`, `esbuild`, `shx`). The OVERALL install exit-code was 1 due to a pre-existing Windows shell incompat in `packages/ui` postinstall (`mkdir -p` on cmd.exe) — unrelated to Phase 203 and out of scope per SCOPE BOUNDARY.
- `pnpm --filter @livos/liv-claw-os build` PASSES cleanly:
  - `claw-plugin` esbuild → `dist/index.js` 169.2kb in 168ms
  - `claw-client` Next.js 16 Turbopack → 4 static routes (`/`, `/_not-found`, `/setup`, 404) generated in ~12s
  - 0 TypeScript errors
- Build artifacts (`dist/`, `out/`, `node_modules/`) properly gitignored

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 203-02-D-01 | Flat clone (rm -rf .git), NOT git submodule | LivOS monorepo single-history model; sacred SHA pre-commit hook can't gate submodule contents; future-bump = update UPSTREAM-COMMIT + re-port diffs |
| 203-02-D-02 | Inner folder names (claw-client/, claw-plugin/) preserved verbatim | Spike DO/DON'T explicit: "preserves upstream cross-reference"; debuggability via `git diff` against upstream |
| 203-02-D-03 | Inner pnpm-workspace.yaml IGNORED at outer install; outer registers inner packages directly | pnpm doesn't natively support nested workspaces; flat registration avoids resolution conflicts at install time |
| 203-02-D-04 | TypeScript class/type/function names NOT renamed | D-203-03 explicit: "NO functional code changes during rebrand pass"; rename = different phase if ever wanted |
| 203-02-D-05 | scripts/setup-tunnel.mjs + scripts/open-ui.mjs log messages NOT rebranded | These are upstream installer scripts; LivOS Mini PC deploy uses systemd via update.sh (D-203-04). Scripts are effectively dead code for our deploy path. |
| 203-02-D-06 | Favicon replaced with text-only "Liv AI" placeholder SVG | Plan 203-12 will replace with real branding asset; preserves filename + dimensions so layout doesn't break |
| 203-02-D-07 | localStorage keys ("openclaw-os:pinned-apps", "openclaw-os-debug-events") NOT renamed | Same effect as wire identifiers — renaming would lose any pre-existing client state on upgrade |

## Wire-protocol identifiers preserved (verified)

Per the SPIKE DO/DON'T audit, these identifiers MUST NOT change without breaking the gateway↔plugin↔client handshake:

| Identifier | Where | Reason |
|------------|-------|--------|
| `openclaw` (npm) | claw-plugin peerDependencies + devDependencies | Real npm registry name |
| `@openuidev/openclaw-os-plugin` (npm) | claw-plugin package.json `name` | Published name — gateway loads it by this |
| `@openuidev/claw-client` (npm) | claw-client package.json `name` | Published name — plugin imports it by this |
| `:openclaw-os` (session-key suffix) | session-keys.ts CLAW_SUFFIX + every UI/lib reference | `before_prompt_build` hook filters by this suffix |
| `"openclaw-os-plugin"` (plugin id) | openclaw.plugin.json + src/index.ts `id` field | Gateway routes by this id |
| `/plugins/openclawos` (HTTP route) | src/index.ts ROUTE_PREFIX + next.config.ts basePath | Gateway HTTP dispatch + Next.js asset paths must agree |
| `openclawos.*` (gateway RPC namespace) | src/index.ts gateway-RPC registrations + claw-client _request calls | Plugin RPC method names registered in gateway protocol |
| `OpenClawEngine` / `OpenClawPluginToolContext` / `OpenClawEngineConfig` / `OpenClawEngineEvents` / `createOpenClawAGUIMapper` (TS identifiers) | All claw-client lib + claw-plugin src | Renaming = functional code change (forbidden by D-203-03) |
| `engines/openclaw/` (folder name) | Import paths throughout claw-client | Folder rename = mass import rewrite (forbidden) |
| `.openclaw-os-thread-container` etc. (CSS class names) | globals.css + selector references | CSS-to-JSX selector coupling |
| `"openclaw-os:pinned-apps"` / `"openclaw-os-debug-events"` (localStorage keys) | app-pins.ts + openclaw-agui-mapper.ts | Renaming would orphan user state |

## Rebrand surface compliance check

Plan Task 3 verify regex: `grep -rE "OpenClaw|Open Claw" --include="*.tsx" --include="*.ts" --include="*.md"` expected count = 0 modulo allowlist.

Actual: 46 matches across 19 files. **All 46 fall in the allowlist:**

| Match class | Examples | Count |
|-------------|----------|------:|
| TypeScript type/class/function names | `OpenClawEngine`, `OpenClawPluginToolContext`, `createOpenClawAGUIMapper`, `OpenClawEngineConfig`, `OpenClawEngineEvents` | ~25 |
| Import path strings | `from "@/lib/engines/openclaw/OpenClawEngine"` | ~10 |
| Upstream cross-reference code comments | `// Source of truth: OpenClaw AgentSummarySchema`, `// OpenClaw stores model as split fields`, `// Maps OpenClaw gateway events to AG-UI` | ~6 |
| Fork-note attribution in our own added text | README.md fork-attribution paragraph mentioning kept class names; AGENTS.md fork-note explaining why identifiers preserved | ~5 |

Zero are user-visible product strings.

## Threat Flags

None — Plan 203-02 is a docs/rebrand pass. No new network endpoints, no new auth surfaces, no new file-system access patterns introduced. The clone IS a large new attack surface (205 files of upstream code), but threat-model coverage is `T-203-01` (gateway crash), `T-203-02` (token reuse), `T-203-03` (OpenUI XSS) — all already in the Phase 203 CONTEXT threat register and applied by Wave 2 plans (203-04 through 203-06).

## Deviations from Plan

**[Rule 3 - blocking] Pre-existing Windows shell incompat in packages/ui postinstall**

- **Found during:** Task 2 (initial `pnpm install`)
- **Issue:** `packages/ui` postinstall script `npm run copy-tabler-icons` invokes `mkdir -p public/generated-tabler-icons && cp -r ./node_modules/@tabler/icons/icons/. ./public/generated-tabler-icons` — both `mkdir -p` and `cp -r .` are POSIX-shell idioms that fail on Windows cmd.exe (the script runs without git-bash on this dev box). Exit code 1, install marked failed.
- **Fix:** **Not fixed** — out of scope. SCOPE BOUNDARY: this is a pre-existing `packages/ui` bug unrelated to Phase 203 and unrelated to liv-claw-os. The Mini PC (Linux) deploy path is unaffected. Documented in commit `af9f7ff5` body.
- **Workaround:** liv-claw-os deps DID install correctly (visible in `packages/liv-claw-os/packages/claw-plugin/node_modules/`) and the filtered build `pnpm --filter @livos/liv-claw-os build` PASSES, proving the rebrand + workspace registration is healthy.
- **Files modified:** none (deferred)
- **Commit:** `af9f7ff5` (notes the deviation)

## Auth gates encountered

None — clone is from public GitHub; npm registry pulls are unauthenticated; no provider auth required.

## Known Stubs

- **Favicon SVG placeholder** — `livos/packages/liv-claw-os/packages/claw-client/public/favicon.svg` is a text-only "Liv AI" SVG. Plan 203-12 will replace with a real logo asset. Documented at commit `58c738de` body and at decision 203-02-D-06.

## Next steps

**Plan 203-03 (liv-claw-gateway.service systemd unit + update.sh patch + smoke)** is unblocked. It will:

1. Ship a single systemd unit `liv-claw-gateway.service` on Mini PC (D-203-04 amended: one unit, plugin runs in-process)
2. Patch `update.sh` to add `pnpm prepack` for `liv-claw-plugin` (which builds `liv-claw-client` first) + systemd install + `openclaw config set plugins.allow` preStart
3. Smoke-test: `curl http://127.0.0.1:18789/health` returns `{"ok":true,"status":"live"}`

Plan 203-03 will also pull in the runtime env (`Environment=ANTHROPIC_API_KEY=...` from `/opt/livos/.env`) per Plan 203-01 spike decision D-203-03.

## Self-Check: PASSED

- `.planning/phases/203-liv-ai-openclaw-os/203-02-SUMMARY.md` exists (this file) — VERIFIED via Write
- `livos/packages/liv-claw-os/` exists with upstream tree at SHA 076ae63 — VERIFIED via Bash ls (205 files + UPSTREAM-COMMIT + LICENSE present, no nested .git)
- `livos/packages/liv-claw-os/UPSTREAM-COMMIT` content matches pinned SHA — VERIFIED via Write
- `livos/packages/liv-claw-os/LICENSE` present (upstream MIT) — VERIFIED via Bash test -f
- 3 commits land cleanly with sacred SHA hook PASS:
  - `ee05a9ef chore(203-02): clone openclaw-os@076ae63 into packages/liv-claw-os` — VERIFIED [sacred-sha] PASS: 20 files verified
  - `58c738de chore(203-02): rebrand user-visible strings OpenClaw -> Liv AI` — VERIFIED [sacred-sha] PASS: 20 files verified
  - `af9f7ff5 chore(203-02): update pnpm-lock.yaml for liv-claw-os workspace members` — VERIFIED [sacred-sha] PASS: 20 files verified
- Build PASS post-rebrand — VERIFIED via `pnpm --filter @livos/liv-claw-os build` (claw-plugin esbuild 169.2kb + claw-client Next.js 4 routes)
- INV-203-05 PASS: 0 Turkish chars in .tsx/.ts files inside liv-claw-os
- Remaining `OpenClaw|Open Claw` matches (46 across 19 files) all in DO-NOT-REPLACE categories per spike audit
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on every commit
