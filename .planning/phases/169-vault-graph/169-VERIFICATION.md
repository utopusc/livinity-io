---
phase: 169
title: Vault Memory Graph View
status: passed
date-completed: 2026-05-19
plans-shipped: 5
commits:
  - d81b7ba6 — feat(169-01) vault walker + parser
  - 7ecc98dc — feat(169-02) graph builder + Express routes
  - c51dd919 — feat(169-03) VaultGraph React feature + react-force-graph-2d
  - 151111af — feat(169-04) AI Chat tab nav (Terminal | Vault Graph)
  - 8e766344 — feat(169-05) boot wire-up + integration test
vitest-cumulative: "76 assertions pass (44 backend + 32 frontend)"
new-deps: ["react-force-graph-2d@^1.29.1 (D-NEW-DEPS-v35 EXCEPTION authorized)"]
sacred-sha-pre: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred-sha-post: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred-sha-status: preserved (byte-identical)
human-verification-needed: true
human-verification-notes:
  - "Real vault scan on Mini PC (Phase 170 UAT)"
  - "Force-graph canvas render with > 100 nodes (visual)"
  - "Click node → drawer fetch + content render"
  - "Tab switch Terminal ↔ Vault Graph in dock window"
---

# Phase 169: Vault Memory Graph — Verification

## Must-haves

- [x] `/api/vault/graph` returns valid JSON `{nodes, edges, truncated, totalFiles}` — wireup.test.ts proves it
- [x] Walker handles 2000-file cap (synthetic 2500-file test passes; `truncated:true` set)
- [x] Path traversal blocked (`..` substring + `path.isAbsolute` both reject — routes.test.ts + wireup.test.ts cover this)
- [x] Tab nav switches between Terminal and VaultGraph (ai-chat.test.tsx Phase 169-04 block)
- [x] JWT auth gate fires before handler (wireup.test.ts deny-stub returns 401)
- [x] File size cap at 1 MiB returns 413 (routes.test.ts seeded 1.1 MiB file → 413)
- [x] `react-force-graph-2d` is the ONLY new top-level dep (1 line in package.json diff)
- [x] CORE_SCHEMA YAML safety (custom-tag rejection — parser.test.ts test #4)
- [x] `.deleted-*` tombstone exclusion (Phase 163-01 contract — walker.test.ts + wireup.test.ts)
- [x] `node_modules` and `.git` defensive directory skip (walker.test.ts)

## Sacred guards (post-phase)

| Guard | Status |
|-------|--------|
| Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (`liv/packages/core/src/sdk-agent-runner.ts`) | preserved (byte-identical blob SHA, pre-commit hook verified on each commit) |
| D-09 luse-system-prompt.ts | NOT touched (file-disjoint from vault-graph) |
| Phase 161-02 agent-prompt-builder.ts | NOT touched |
| Phase 162-01 vault-scaffolder.ts | NOT touched |
| Phase 162-02 agent-session.ts | NOT touched |
| Phase 163 ws-agent.ts | NOT touched |
| Phase 164 autonomous-scheduler | NOT touched |
| Phase 165-01 claude-runner/idle-reaper.ts | NOT touched |
| Phase 166 cc-pty/* server files | NOT touched (vault-graph is a separate sibling module) |
| Phase 167 features/cc-terminal/* client files | NOT touched |
| `/ws/cc-pty` Express mount in server/index.ts | NOT touched (verified by `git diff --numstat` 17/0 additive) |

## Acceptance Evidence

- **76/76 vitest assertions pass** cumulative for Phase 169:
  - 22 parser + walker (169-01)
  - 18 builder + routes (169-02)
  - 14 VaultGraph + GraphNodeDetail (169-03)
  - 18 ai-chat.test.tsx (11 Phase 167 + 7 Phase 169-04)
  - 4 wireup integration (169-05)
- **livinityd tsc**: 0 new errors introduced (baseline pre-existing in unrelated files only)
- **UI vite build**: succeeded in 56.51 s (react-force-graph-2d resolves cleanly)
- **D-NEW-DEPS-v35**: only `react-force-graph-2d` added to `livos/packages/ui/package.json` (1 line `git diff`)
- **Additive changes only**: `git diff --numstat` shows zero deletions for source/index.ts (7/0) and server/index.ts (17/0); ai-chat/index.tsx has 43/8 (8 deletions are JSX restructuring to add tab strip; all preserved behaviors covered by tests)

## Human Verification (Phase 170 UAT)

Plan acceptance criterion `curl http://localhost:8080/api/vault/graph` against a real Mini PC vault is a live-test gate. Targets:

1. **Real vault scan**: Mini PC vault under `/home/bruce/livinity-vault/` should walk in <2 s, return <2000 nodes (real-world vault is currently ~few hundred .md files).
2. **Canvas render**: Open `https://bruce.livinity.io/ai-chat`, click "Vault Graph" tab. ForceGraph2D canvas must render with visible force-directed layout, nodes colored by type (cyan=memory, purple=session, etc.), edges visible.
3. **Node click → drawer**: Click any node. Right-anchored 400px drawer slides in, fetches `/api/vault/file?path=<id>`, renders content as plain `<pre>`. Close button (×) closes drawer.
4. **Refresh button**: Click "Refresh" top-right. Network tab shows a second `GET /api/vault/graph` and graph re-renders.
5. **Truncated banner**: If vault grows beyond 2000 files, top-left amber banner reads "Vault exceeds 2000 files. Showing first 2000."
6. **Path traversal probe**: `curl https://bruce.livinity.io/api/vault/file?path=../etc/passwd -b LIVINITY_SESSION=<token>` → 400.
7. **Auth probe**: `curl https://bruce.livinity.io/api/vault/graph` (no cookie) → 401.
8. **Tab nav round-trip**: Click "Terminal" tab → CcTerminal/EmptyState renders (Phase 167-04 unchanged). Click back to "Vault Graph" → graph re-renders (remount, query re-fires).

## What's deferred to v35.1+

- Live `fs.watch` graph updates (current: manual Refresh button only)
- System-state nodes (RBAC, devices, agents from livinityd DB)
- Rich markdown rendering in the side drawer (current: plain `<pre>` block)
- Graph layout persistence (zoom/pan position) across tab switches — currently remount-on-switch
- Multi-user vault graph scoping → v36 (when multi-tenant ships)
- Directory edges (parent-dir representational edges in addition to wikilink edges)

## Summary

Phase 169 ships the Vault Memory Graph end-to-end in 5 atomic commits, ≈ 1,400 lines of new code (excluding pnpm-lock expansion), 76 new vitest assertions, one authorized new npm dep, zero edits to any sacred file, zero deletions in livinityd/source files. Ready for Phase 170 (Mini PC UAT) when scheduled.
