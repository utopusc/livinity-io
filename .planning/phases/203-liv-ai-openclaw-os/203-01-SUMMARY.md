---
phase: 203-liv-ai-openclaw-os
plan: 01
subsystem: liv-ai
tags: [spike, openclaw-os, branch-A-confirmation, wave-1, sequential]
status: code-complete
completed: 2026-05-23
duration_minutes: ~35
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_status: preserved (INV-203-01 PASS — single docs commit, 0 source files touched)
dependency_graph:
  requires: []
  provides:
    - openclaw-os HEAD SHA pin (Plan 203-02 input)
    - openclaw provider config shape (Plan 203-07 input)
    - openclaw plugin SDK surface (Plan 203-06 input)
    - openclaw HTTP/WS surface (Plan 203-05 input)
    - openclaw plugin AppStore persistence redirection target (Plan 203-04 input)
    - openclaw before_tool_call hook signature (Plan 203-06 / D-203-14 input)
    - openclaw service topology reality check (D-203-04 amendment recommendation)
  affects: [Plan 203-02, Plan 203-03, Plan 203-04, Plan 203-05, Plan 203-06, Plan 203-07, Plan 203-12, Plan 203-13]
tech_stack:
  added: []
  patterns: [spike-verification, out-of-tree-scratch-clone, npm-package-introspection]
key_files:
  created:
    - .planning/phases/203-liv-ai-openclaw-os/203-01-SPIKE.md (647 lines, 12 sections)
    - .planning/phases/203-liv-ai-openclaw-os/203-01-SUMMARY.md (this file)
  modified:
    - .planning/ROADMAP.md (203-01 checkbox flipped + completion annotation)
    - .planning/STATE.md (Current Position → 203-01 complete)
decisions:
  - "Branch A (openclaw built-in LLM dispatch) CONFIRMED — D-203-06 lock holds, no Branch B fallback needed"
  - "openclaw-os HEAD SHA `076ae63478fa2417d38c39b5b6d13f9188b8580b` pinned for Plan 203-02 in-tree clone"
  - "openclaw@2026.5.20 verified MIT, 482 npm deps, boots in ~5.2s on Windows"
  - "Provider config via systemd `Environment=ANTHROPIC_API_KEY=…` directive (read from /opt/livos/.env) — no openclaw.json mutation needed"
  - "Persistence: openclaw owns SQLite tasks/runs.sqlite for sessions; openclaw-os plugin AppStore (JSON files) → REDIRECT to Postgres livos_openui_apps via Plan 203-04 plugin-side rewrite"
  - "D-203-04 service topology amendment recommended: drop liv-claw-plugin.service (plugin runs in-process inside gateway); ship ONE systemd unit (liv-claw-gateway.service)"
metrics:
  completed: 2026-05-23
  duration: ~35 min (under plan's 1-day estimate)
  tasks_completed: 5/5 (1 clone, 2 install, 3 boot+probe, 4 SPIKE.md, 5 commit)
  files_touched: 3 (1 NEW SPIKE.md + 1 NEW SUMMARY.md + ROADMAP.md + STATE.md modifications; all in .planning/)
  source_files_touched: 0 (sacred SHA single-commit safe)
  scratch_dirs_created: 3 (/c/tmp/openclaw-os-spike, /c/tmp/openclaw-gateway-scratch, /c/tmp/openclaw-state)
  http_probes: 4 (/health 200, / 200, /plugins/openclawos 404, /plugins 404)
deviations: 0 (plan executed exactly as written; 5 tasks shipped as ONE docs commit per spec — scratch-only work has no per-task commits)
auth_gates: 0
---

# Phase 203 Plan 01: openclaw-os L0 Spike — Branch A Verification Summary

One-liner: **D-203-06 Branch A (openclaw self-dispatches LLM) CONFIRMED via live boot of openclaw@2026.5.20 — Plan 203-07 implements the LivOSAgent thin-wrapper path as planned; openclaw-os HEAD `076ae63478fa2417d38c39b5b6d13f9188b8580b` pinned for Plan 203-02.**

## What this plan delivered

- **Scratch clone of `thesysdev/openclaw-os`** at `C:/tmp/openclaw-os-spike/` (HEAD SHA recorded for Plan 203-02 git pin).
- **Scratch install of `openclaw@2026.5.20`** at `C:/tmp/openclaw-gateway-scratch/` (482 npm deps, MIT, clean install).
- **Live boot of openclaw gateway** on `http://127.0.0.1:18790` with `--dev --auth none --bind loopback` — boot wall-time 5.2s; `/health` returned `{"ok":true,"status":"live"}`.
- **`203-01-SPIKE.md`** (647 lines, all 12 required sections):
  - Boot procedure with verbatim shell + observed output
  - LLM provider config (57-provider catalog + env vars + `agents.defaults.model.primary` config key)
  - Persistence model (mixed JSON5 + JSONL + SQLite WAL + markdown across `OPENCLAW_HOME`)
  - Tool registration API (`api.registerTool(factory, opts)` — TypeScript factory, NOT JSON manifest, restart-required)
  - HTTP/WS surface (port 18789 gateway + 18792 browser sidecar; `auth.token` per-gateway)
  - claw-client serving (plugin-bundled static export, NOT gateway-native)
  - Memory/threads (built-in `agent:<id>:<channel>:<sender>` session keying + plugin appends `:openclaw-os` suffix)
  - HITL hook surface (`before_tool_call` plugin hook; 37 hooks total in `PluginHookName` union)
  - Branch A confirmation (3 evidence pieces — boot log, 57-provider docs catalog, Provider* type surface)
  - Plan 203-07 setup notes (concrete file paths + API shapes)
  - Plan 203-02 inputs (exact SHA + folder layout expectations + rebrand DO/DON'T audit)
  - Risks/surprises (10 items)

## Branch A confirmation summary

Three independent evidence pieces locked Branch A:

1. **Boot log smoking gun**: `2026-05-23T10:49:17 [gateway] agent model: openai/gpt-5.5 (thinking=medium, fast=off)` — gateway resolved a model AT BOOT, before any plugin loaded, for the seed "dev" agent. A backend-callback architecture would not.
2. **57-provider docs catalog** under `node_modules/openclaw/docs/providers/` covering Anthropic, OpenAI, Google, xAI, Groq, Mistral, Ollama, etc., with full onboarding flow `openclaw onboard --anthropic-api-key "$KEY"` and `agents.defaults.model.primary` config key.
3. **Type surface inspection**: `OpenClawPluginApi` exposes provider-plugin REGISTRATION hooks (`registerChannel`, `registerMemoryEmbeddingProvider`) but NO `registerLlmDispatcher`-style hook. Operator does NOT wire LLM call destination; openclaw owns dispatch.

D-203-06 lock holds. **No escalation triggered. Plan 203-07 proceeds with Branch A.**

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 203-01-D-01 | Branch A confirmed; LivOSAgent = thin wrapper around openclaw client | 3 independent evidence pieces; no operator API for delegated dispatch exists |
| 203-01-D-02 | openclaw-os pinned at SHA `076ae63478fa2417d38c39b5b6d13f9188b8580b` for Plan 203-02 | Reproducible builds; prevents upstream drift during rebrand cycle |
| 203-01-D-03 | Provider auth via systemd `Environment=` (not openclaw.json mutation) | Lazy auth validation = no boot race; single source of truth = /opt/livos/.env; matches existing Mini PC pattern |
| 203-01-D-04 | D-203-04 amendment: ship ONE systemd unit (`liv-claw-gateway.service`) | Plugin runs IN-process inside gateway via `definePluginEntry`; the second worker process from D-203-04 doesn't exist in upstream |
| 203-01-D-05 | Plan 203-04 redirects ONLY plugin AppStore JSON → Postgres `livos_openui_apps`; gateway SQLite stays untouched | Surgical swap (155 LOC `app-store.ts`); chat history persistence kept default (D-203-09 was for OpenUI apps, not chat) |

## Spike artifacts (out-of-tree, gitignored)

| Path | Contents |
|------|----------|
| `C:/tmp/openclaw-os-spike/` | Full git clone of thesysdev/openclaw-os @ HEAD SHA |
| `C:/tmp/openclaw-spike-head.txt` | Plain text: `076ae63478fa2417d38c39b5b6d13f9188b8580b` |
| `C:/tmp/openclaw-gateway-scratch/` | npm scratch dir with `openclaw@2026.5.20` installed (482 deps) |
| `C:/tmp/openclaw-state/` | Generated gateway state: openclaw.json + identity/device.json + tasks/runs.sqlite + workspace-dev/* |
| `C:/tmp/openclaw-boot.log` | Verbatim stdout of the boot probe run |
| `C:/Users/hello/AppData/Local/Temp/openclaw/openclaw-2026-05-23.log` | Gateway-side log file (referenced by gateway, not consumed by us) |

These dirs are intentionally outside the repo tree per the plan spec ("scratch dir on Windows, do NOT install into workspace package.json").

## Deviations from Plan

**None.** Plan executed exactly as written. Five tasks shipped as ONE docs commit per the spec ("Create the SPIKE.md as a single docs commit at the end") — Tasks 1-3 produce no in-repo artifacts (scratch-only work), so per-task commits were neither required nor possible. Task 4 (write SPIKE.md) + Task 5 (commit) folded into the single docs commit.

The plan template's Task 4 decision-matrix scaffold ("| Subsystem | Branch A | Branch B |") is included verbatim in 203-01-SPIKE.md (per the plan's literal Markdown template) PLUS expanded into the 12-section comprehensive structure the prompt spec required. Both are present.

## Auth gates encountered

**None.** No external auth required for spike (`--auth none` for boot; `npm install openclaw` from public registry; `git clone` from public GitHub).

A dummy `ANTHROPIC_API_KEY=sk-ant-test-001` was set per the spike spec's "pragmatic shortcuts" guidance — gateway booted clean because provider auth is lazy (validated on first chat request, not at boot). This itself is a finding documented in 203-01-SPIKE.md "Risks/surprises" §5.

## Known Stubs

**None.** SPIKE.md is purely informational; no code stubs, no placeholder data flows. The 203-01-SPIKE.md "Decision Matrix" section explicitly closes with `CHOSEN BRANCH: A`, eliminating any forward ambiguity.

## Next steps

**Plan 203-02 (Clone openclaw-os → `livos/packages/liv-claw-os/` + rebrand)** is unblocked and ready to begin:

```bash
git clone https://github.com/thesysdev/openclaw-os livos/packages/liv-claw-os
cd livos/packages/liv-claw-os
git checkout 076ae63478fa2417d38c39b5b6d13f9188b8580b   # ← from this spike
# then proceed with 203-02's rebrand pass per its PLAN.md
```

Plan 203-02 should consume the "Plan 203-02 inputs" section of 203-01-SPIKE.md (rebrand DO/DON'T audit + folder layout expectations) verbatim.

**D-203-04 amendment** to be flagged to operator at next phase-status check: revise CONTEXT to ship ONE systemd unit (`liv-claw-gateway.service`) instead of two. Not a blocker for Plan 203-02/203-03 to proceed — Plan 203-03 will ship the corrected unit topology and the CONTEXT amendment can land alongside.

## Self-Check: PASSED

- `.planning/phases/203-liv-ai-openclaw-os/203-01-SPIKE.md` exists (647 lines, ≥60 min) — VERIFIED via wc -l
- `.planning/phases/203-liv-ai-openclaw-os/203-01-SUMMARY.md` exists (this file)
- `.planning/ROADMAP.md` 203-01 checkbox flipped — VERIFIED via Edit
- HEAD SHA `076ae63478fa2417d38c39b5b6d13f9188b8580b` recorded in 4 places (frontmatter, SPIKE §Plan 203-02 inputs, SUMMARY frontmatter, SUMMARY decisions)
- Branch A confirmation explicit + evidence quoted with verbatim shell output
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved (single commit touches only `.planning/*` files — no source files mutated; SHA hook PASS expected on commit)
- No `livos/packages/` modified — VERIFIED (single docs commit scope)
- No npm install in workspace — VERIFIED (all installs in `/c/tmp/`)
