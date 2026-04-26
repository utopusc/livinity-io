# Phase 31: update.sh Build Pipeline Integrity - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning
**Mode:** Auto-generated (smart_discuss infrastructure-skip — pure backend/host script work, no user-facing UX)

<domain>
## Phase Boundary

Kill the recurring "[OK] @livos/config built" silent-success lie:
- Every package's build output is verified non-empty before update.sh proceeds
- pnpm-store dist-copy is idempotent across all `@nexus+core*` resolution dirs
- Root cause behind the original silent fail is identified and either fixed or replaced with a fail-loud guard

**In-scope:** `/opt/livos/update.sh` itself (via patch-script artifact applied by SSH), build-step verification logic, pnpm-store dist-copy loop, root-cause investigation.

**Out-of-scope:** UI surface (Phase 33), GitHub Actions CI (Phase 35), auto-rollback (Phase 32), pre-update sanity checks (Phase 32).

</domain>

<decisions>
## Implementation Decisions

### Patch Delivery Pattern (locked from Phase 30 precedent)
- update.sh lives outside the repo on each host; the repo houses a patch script: `.planning/phases/31-update-sh-build-pipeline-integrity/artifacts/phase31-update-sh-patch.sh`
- The patch script is **idempotent** — re-runs detect already-patched markers and exit 0 (Phase 30 used `grep -n` for stable text anchors; same approach here)
- The patch script applies to BOTH hosts: Mini PC (`bruce@10.69.31.68`) and Server4 (`root@45.137.194.103`)
- Patch script is committed to the repo as a deterministic source of truth — next agent can re-run on a new host

### Build Verification Strategy (BUILD-01)
- After EACH `pnpm --filter <pkg> build` (livos/config, ui) and `npm run build --workspace=...` (nexus core, worker, mcp-server, memory), check that the package's expected output dir exists and contains files (`find <dir> -type f | head -1` non-empty)
- Failure messaging: `BUILD-FAIL: <package> produced empty <output-dir>` to stderr, then `exit 1`
- The current `[OK] <package> built` log line gets gated behind the verification — no longer printed on silent skip

### pnpm-store dist-copy Loop (BUILD-02)
- Replace `find <node_modules>/.pnpm -maxdepth 1 -name '@nexus+core*' | head -1` (current single-target) with a `for dir in <node_modules>/.pnpm/@nexus+core*/; do cp -r ...; done` loop
- After EACH copy, verify the target `node_modules/@nexus/core/dist/` symlinked path resolves to non-empty contents — else fail-loud with `DIST-COPY-FAIL: <pnpm-store-dir>` and exit
- Same loop pattern can be extended to other `@livos+config*` / `@nexus+worker*` etc. dirs if they exhibit the same multi-version drift in the future

### Root-Cause Investigation (BUILD-03)
- Investigation is a one-time exercise during this phase — examine update.sh runtime env vs interactive shell env, pnpm-lock.yaml drift, cwd mismatch, possibly `tsc --noEmit` in scripts
- Findings go in `.planning/phases/31-update-sh-build-pipeline-integrity/31-ROOT-CAUSE.md` (separate doc — keeps SUMMARY.md clean)
- If a root cause IS found, fix it directly in the patch script (e.g., add `cd /opt/livos` explicitly, regenerate pnpm-lock.yaml on the host)
- If NOT conclusively found, BUILD-01's fail-loud guard becomes the safety net — root-cause hunt can recur in a future phase if guard ever fires unexpectedly

### Claude's Discretion
- Exact bash idioms for the build verification function (early-exit `set -e`, trap, etc.) — pick whatever fits update.sh's existing style
- Whether to introduce a `verify_build()` helper function or inline the checks — depends on how many call sites
- Order of operations in patch script (build verify hook insertion vs dist-copy loop replacement) — patch script can do them in any order as long as anchors are stable
- Naming of verification log lines — `[VERIFY]` prefix or extended `[OK]`/`[FAIL]` — match update.sh's tone

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 30 patch script (`.planning/phases/30-auto-update/artifacts/phase30-update-sh-patch.sh`) — same idempotency / SSH-apply pattern; can be templated/copied for Phase 31
- update.sh anchors: stable section markers like `# ── Step N: <Name> ───` (Phase 30 anchored to `# ── Step 9: Cleanup ───`); for build, the anchor will be the existing `[OK] <pkg> built` lines or the surrounding `pnpm --filter ... build` invocations

### Established Patterns
- update.sh structure: numbered steps (Step 1: prep, Step 2: clone, ..., Step 9: cleanup); patch insertions use `awk` to splice between anchor lines
- Mini PC + Server4 dual-host deployment: SSH key at `C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master`; for Mini PC use `ssh -i ~/.../minipc bruce@10.69.31.68 sudo bash -s` per memory `reference_minipc_ssh.md`
- Atomic-commit convention from Phase 30: each task = 1 commit (e.g., "feat(31): add build verify guard", "feat(31): idempotent pnpm-store dist-copy loop")

### Integration Points
- update.sh runs as part of `system.update` mutation (Phase 30 wired in `livos/packages/livinityd/source/modules/system/routes.ts`) — Phase 31 doesn't change that contract, only the script's internal robustness
- Logs from update.sh feed Phase 33's Past Deploys UI — Phase 31's stderr/exit conventions establish the format Phase 33 will parse
- BUILD-04 (Phase 35) GH Actions workflow exercises the patched update.sh — Phase 31 is the prerequisite

</code_context>

<specifics>
## Specific Ideas

- The patch script MUST verify both deployments end-to-end after applying — `ssh <host> 'sudo /opt/livos/update.sh'` followed by `systemctl status livos liv-core liv-worker liv-memory` and a `curl -fsS http://localhost:8080/health` smoke check, on BOTH hosts
- BUILD-03's root-cause findings go in a dedicated `31-ROOT-CAUSE.md` doc (not SUMMARY.md) so investigation prose stays separate from delivery notes
- If the root cause turns out to be `tsc` silently emitting to a different output location, the fix may need `tsconfig.json` adjustment in the affected package — out of update.sh, into repo source code; that's allowed within this phase

</specifics>

<deferred>
## Deferred Ideas

- Extending the multi-version dist-copy loop to other `@livos+*` packages — defer until/unless a similar drift is observed (YAGNI)
- Replacing update.sh entirely with a TypeScript-orchestrated update flow — out of scope (Phase 999.x material)
- Cross-platform update.sh (macOS/Windows) — explicitly out-of-scope per REQUIREMENTS.md
- Fully automated patch-script CI test — Phase 35 covers PR-time smoke test, separate from this phase

</deferred>
