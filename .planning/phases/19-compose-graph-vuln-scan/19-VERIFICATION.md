---
phase: 19-compose-graph-vuln-scan
verified: 2026-04-24T23:30:00Z
status: passed
score: 10/10 must-haves verified
re_verification: false
human_verification:
  - test: "Render graph for a real 5-service stack on Server4"
    expected: "Nodes render with image, port pills, depends_on arrows, network pills. Completes in ~1s."
    why_human: "React Flow rendering can only be confirmed visually in a browser."
  - test: "Click Scan on nginx:1.21 on Server4 (first run)"
    expected: "Loading spinner appears, then severity badges show non-zero CRITICAL/HIGH counts; click CRITICAL expands CVE list with id/package/installed/fixed/cvss/title."
    why_human: "Trivy actually pulling and running requires live Docker host; can't verify without network access."
  - test: "Second click of Scan on same image"
    expected: "Returns near-instantly with 'cached' badge visible."
    why_human: "Cache hit timing requires live Redis and Docker daemon."
---

# Phase 19: Compose Graph + Vuln Scan — Verification Report

**Phase Goal:** Visual compose topology (CGV-01) and on-demand Trivy vulnerability scanning with SHA256-keyed Redis cache (CGV-02, CGV-03, CGV-04).
**Verified:** 2026-04-24T23:30:00Z
**Status:** PASSED (automated checks) — 3 human items remaining for live-deploy smoke
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | StacksTab expanded row exposes Tabs with Containers + Graph tabs | VERIFIED | `index.tsx` line 3153: `<Tabs defaultValue='containers'>` with both TabsTriggers; ComposeGraphViewer imported at line 60 |
| 2 | Graph tab fetches compose YAML via `trpcReact.docker.getStackCompose` and renders ReactFlow canvas | VERIFIED | `compose-graph-viewer.tsx:255` calls `trpcReact.docker.getStackCompose.useQuery({name: stackName})`; `<ReactFlow nodes= edges= nodeTypes= fitView>` at line 321 |
| 3 | Each service appears as a node showing name, image, and port-mapping badges | VERIFIED | `ComposeServiceNode` component (lines 37-72) renders `data.label`, `data.image`, and port pills via `data.ports.map` |
| 4 | `depends_on` renders as directed edges with arrow markers | VERIFIED | `parseCompose` builds edges with `markerEnd: {type: MarkerType.ArrowClosed}` and `label: 'depends_on'` (lines 234-246) |
| 5 | Services on shared networks get purple network pills | VERIFIED | `ComposeServiceNode` renders `data.networks.map` with `bg-purple-500/15` class (lines 57-68); network legend strip below canvas |
| 6 | Invalid YAML / missing services key shows inline error without page crash | VERIFIED | `parseCompose` returns `{error: ...}` on bad YAML (line 155) or missing services (line 164); component renders amber error banner with collapsible raw YAML (lines 289-307) |
| 7 | Scan button on image row triggers Trivy run, returns severity badge counts | VERIFIED | `ActionButton` with `IconShieldCheck` at line 2058 calls `scanImage(ref)`; `ScanResultPanel` renders four severity badges (lines 1806-1822) |
| 8 | Second Scan on same image returns from Redis cache keyed by SHA256 | VERIFIED | `scanImage()` in `vuln-scan.ts` calls `resolveDigest` → cache key `nexus:vuln:<sha256>` (line 47); cache read at line 272; `cached: true` flipped on read |
| 9 | Cache expires after 7 days; Rescan button bypasses with force=true | VERIFIED | `CACHE_TTL_SECONDS = 60*60*24*7` (line 22); `scanImage(imageRef, true)` skips cache check; Rescan button in `ScanResultPanel` line 1796 passes `force=true` |
| 10 | Scanning is on-demand only — no background scans, no polling | VERIFIED | No `setInterval`/`cron`/`schedule` in `vuln-scan.ts` or UI; comment on line 7-9 of `vuln-scan.ts` confirms; `ensureTrivyImage` only called from `scanImage` |

**Score:** 10/10 truths verified

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `livos/packages/ui/src/routes/server-control/compose-graph-viewer.tsx` | VERIFIED | 350 lines (plan: ≥180). Exports `ComposeGraphViewer`. Imports ReactFlow, js-yaml, tRPC. `nodeTypes` hoisted at module scope (line 74). |
| `livos/packages/ui/package.json` | VERIFIED | `"reactflow": "^11.11.4"` at line 103, `"js-yaml": "^4.1.1"` at line 79, `"@types/js-yaml": "^4.0.9"` in devDeps at line 128. |
| `livos/packages/livinityd/source/modules/docker/vuln-scan.ts` | VERIFIED | 318 lines (plan: ≥200). Exports `scanImage`, `getCachedScan`. Imports Dockerode, ioredis, execa. |
| `livos/packages/livinityd/source/modules/docker/routes.ts` | VERIFIED | `scanImage` mutation (line 642) and `getCachedScan` query (line 676) registered as `adminProcedure`; import from `./vuln-scan.js` at line 48. |
| `livos/packages/livinityd/source/modules/docker/types.ts` | VERIFIED | `Severity`, `CveEntry`, `VulnScanResult` added at lines 229-251. |
| `livos/packages/livinityd/source/modules/server/trpc/common.ts` | VERIFIED | `'docker.scanImage'` present in `httpOnlyPaths` array at line 72. |
| `livos/packages/ui/src/hooks/use-images.ts` | VERIFIED | `scanMutation` (line 72), `scanImage` function (line 109), and `isScanning`, `scanResult`, `scanError` all returned from hook (lines 133-136). |
| `livos/packages/ui/src/routes/server-control/index.tsx` (ImagesTab) | VERIFIED | `ScanResultPanel` component at line 1731; `IconShieldCheck` import at line 38; Scan `ActionButton` at line 2058; `ImageHistoryPanel` refactor at line 1269; Tabs(Layer history / Vulnerabilities) layout at lines 2090-2104. |

---

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `compose-graph-viewer.tsx` | `trpc.docker.getStackCompose` | `trpcReact.docker.getStackCompose.useQuery({name})` line 255 | WIRED |
| `index.tsx` StacksTab expanded row | `ComposeGraphViewer` | `<TabsContent value='graph'><ComposeGraphViewer stackName={stack.name} /></TabsContent>` line 3197-3199 | WIRED |
| `ComposeGraphViewer` | `reactflow` ReactFlow | `import {ReactFlow, Background, Controls, ...} from 'reactflow'` lines 3-13; `import 'reactflow/dist/style.css'` line 14; `<ReactFlow ...>` line 321 | WIRED |
| `vuln-scan.ts:scanImage` | Trivy via `execa` | `execa('docker', ['run','--rm','-v','/var/run/docker.sock:...', TRIVY_IMAGE, 'image', imageRef, '--format','json',...]` lines 104-131 | WIRED |
| `vuln-scan.ts:scanImage` | Redis cache `nexus:vuln:<sha256>` | `getRedis().set(key, ..., 'EX', CACHE_TTL_SECONDS)` line 307; `getRedis().get(key)` line 241 | WIRED |
| `index.tsx` ImagesTab | `trpc.docker.scanImage` / `getCachedScan` | `useImages()` hook exposes `scanImage` from `scanMutation = trpcReact.docker.scanImage.useMutation`; `ScanResultPanel` calls `trpcReact.docker.getCachedScan.useQuery` | WIRED |

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| CGV-01 | Stack detail panel has "View Graph" tab rendering services with React Flow, depends_on, networks, port mappings | SATISFIED | `compose-graph-viewer.tsx` + `index.tsx` Tabs wiring |
| CGV-02 | Image list has "Scan" action running Trivy with CVE severity badges CRITICAL/HIGH/MEDIUM/LOW | SATISFIED | `vuln-scan.ts` + `ScanResultPanel` four severity badges |
| CGV-03 | Scan results cached in Redis keyed by image SHA256 | SATISFIED | `nexus:vuln:<sha256>`, EX=604800, cross-tag sharing via `resolveDigest` |
| CGV-04 | Vulnerability scan on-demand only — user clicks Scan button | SATISFIED | No scheduler/polling; `ensureTrivyImage` lazy; no auto-trigger in UI |

---

## Commit Verification

All four task commits are present and substantive:

| Commit | Task | Files Changed |
|--------|------|---------------|
| `f2a725c0` | Add ComposeGraphViewer + install deps | 3 files, 501 insertions |
| `4a094607` | Wire Graph tab into StacksTab | 1 file, 50 insertions / 39 deletions |
| `9aed1992` | Backend vuln-scan.ts + tRPC routes | 4 files, 400 insertions |
| `8b667d60` | Scan button + ScanResultPanel UI | 2 files, 308 insertions / 40 deletions |

---

## Anti-Patterns Found

No blockers found.

| File | Pattern | Severity | Assessment |
|------|---------|----------|------------|
| `vuln-scan.ts` line 8 | Comment-only `auto-scan` mention | Info | The comment explicitly states scanning is NOT automatic — it is documentation, not a stub. |
| `compose-graph-viewer.tsx` line 310 | `return null` when `!parsed` | Info | Not a stub — this is the correct guard for the race between `isLoading: false` and `data` being undefined (e.g., disabled query). Returns null correctly before any data arrives. |

---

## Human Verification Required

### 1. Compose Graph Rendering on Live Stack

**Test:** Open Server4 (livinity.cloud) → Server Control → Stacks → expand any deployed stack → click "Graph" tab.
**Expected:** Within ~1s, React Flow canvas renders nodes (service name, image, port pills, purple network pills) and directed edges labeled "depends_on". Canvas allows drag, zoom, fit-view.
**Why human:** React Flow canvas rendering, node layout correctness, and visual polish can only be confirmed in a browser against a real deployed stack.

### 2. First Trivy Scan Run (cold cache)

**Test:** On Server4, ensure `nginx:1.21` is pulled (`docker pull nginx:1.21`). Open Images tab → click amber shield-check Scan button on nginx:1.21 row.
**Expected:** Row expands, Vulnerabilities tab auto-opens, loading spinner shows "Running Trivy — first scan may take 60-90s…". After scan completes, four severity badges appear with non-zero CRITICAL and HIGH counts. Clicking CRITICAL expands CVE table with id (linked), package, installed/fixed versions, CVSS score, title.
**Why human:** Requires live Docker daemon, Trivy image pull from Docker Hub, and Redis write on the production server.

### 3. Redis Cache Hit (second scan)

**Test:** Immediately after Test 2 succeeds, click Scan on nginx:1.21 again.
**Expected:** Result returns near-instantly (< 1s) with a small "cached" badge visible in the scan panel header.
**Why human:** Requires measuring actual response time against live Redis on Server4.

---

## Gaps Summary

None. All 10 observable truths verified, all 8 required artifacts exist and are substantive, all 6 key links are wired, all 4 requirements (CGV-01..04) are satisfied.

Three human verification items remain — these are smoke tests on the production server requiring live Docker/Redis. They are not blockers to phase closure; they are deployment-validation steps deferred per the plan's own `<verify>` blocks which state "Manual smoke (after deploy to Server4)".

---

_Verified: 2026-04-24T23:30:00Z_
_Verifier: Claude (gsd-verifier)_
