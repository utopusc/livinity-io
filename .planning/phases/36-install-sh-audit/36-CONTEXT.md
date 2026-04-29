# Phase 36: install.sh Audit & Hardening — Context

**Gathered:** 2026-04-28
**Status:** Ready for planning
**Source:** ROADMAP.md success criteria + REQUIREMENTS.md (FR-AUDIT-01..05) — synthesized as locked decisions (skip-discuss config + audit-phase express path)
**Milestone:** v29.2 Factory Reset (mini-milestone)

<domain>
## Phase Boundary

This phase is **audit-only — no production wipes**. Its sole deliverable is `phases/36-install-sh-audit/AUDIT-FINDINGS.md`, a document that:

1. Records the actual fetched contents of `https://livinity.io/install.sh`
2. Maps its argument surface (does it accept `--api-key`, `--api-key-file`, stdin, etc.)
3. Documents idempotency behavior on a host that already has `/opt/livos/` populated
4. Specifies the half-deleted-state recovery story
5. Analyzes the Server5 single-point-of-failure for the install.sh fetch

The audit's findings GATE Phase 37's wipe/reinstall design — Phase 37's backend planner must be able to read AUDIT-FINDINGS.md alone and design the wipe+reinstall bash without re-running the audit. So the document needs to be self-contained and decisive (not "we should investigate further").

**Out of scope for this phase:** writing `system.factoryReset` tRPC route (Phase 37), the UI button (Phase 38), any actual wipe of any host. If install.sh hardening is needed, this phase produces a **patch proposal** (a diff or a wrapper script spec) — the patch is APPLIED by Phase 37 if at all.

**Target hosts:** the audit verifies behavior against the Mini PC (`bruce@10.69.31.68`) — the only LivOS deployment that matters. Server4 and Server5 are NOT audit targets per project memory; Server5 is examined only as the upstream relay that hosts the install.sh URL.
</domain>

<decisions>
## Implementation Decisions (LOCKED)

### Deliverable format

**D-01 (LOCKED):** The single output of this phase is `.planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md`. No tRPC routes, no shell scripts checked into the production codebase (livos/, nexus/), no UI changes.

**D-02 (LOCKED):** AUDIT-FINDINGS.md is structured for Phase 37's backend planner as a primary consumer. It must contain:
  1. **install.sh raw fetch** — full content (or content-addressed hash + path to a checked-in snapshot if it's > 200 lines)
  2. **Argument surface map** — table of every flag/env var/stdin behavior the script honors, with line refs
  3. **Idempotency verdict** — `IDEMPOTENT | PARTIALLY-IDEMPOTENT | NOT-IDEMPOTENT`, with the specific commands inside install.sh that fail/succeed on re-run
  4. **API key transport verdict** — how the API key is passed today (`argv | stdin | --api-key-file | env-var`) and whether it leaks via `ps`
  5. **Recovery model** — does install.sh have `--resume`, or do we need a pre-wipe snapshot? Decide one path.
  6. **Server5 dependency analysis** — fail modes and fallback options
  7. **Hardening proposals (if needed)** — concrete patch (unified diff against fetched install.sh, OR wrapper spec) for any gaps the audit found

### Audit method (how findings are gathered)

**D-03 (LOCKED):** Fetch `install.sh` via `curl -sSL https://livinity.io/install.sh` from a workstation (NOT from inside Mini PC). Save the raw bytes to `.planning/phases/36-install-sh-audit/install.sh.snapshot` so the audit is reproducible against a frozen version even if the URL content drifts later.

**D-04 (LOCKED):** Capture `curl -sI https://livinity.io/install.sh` headers (Last-Modified, ETag, content-length, server) so the audit notes which version of install.sh was reviewed.

**D-05 (LOCKED):** Argument surface is determined by **reading the snapshot's parsing logic** (grep for `case "$1"`, `getopts`, `--api-key`, `read -r` for stdin, `${1:-}`, etc.). Do NOT execute install.sh on any host as part of the audit. The audit is read-only static analysis + verbal reasoning, not live execution.

**D-06 (LOCKED):** Idempotency is determined by reading the snapshot's **side-effecting commands**: `apt install`, `systemctl enable`, `mkdir`, `git clone`, `pnpm install`, `psql ... CREATE`, `cp`, `mv`, `rm`. For each, classify it as: `IDEMPOTENT_NATIVE` (e.g., `apt install -y` is idempotent), `IDEMPOTENT_WITH_GUARD` (e.g., `[ -d /opt/livos ] || git clone ...`), `NOT_IDEMPOTENT` (e.g., bare `git clone /opt/livos` fails on re-run), or `UNKNOWN_NEEDS_VERIFICATION`. The audit's idempotency verdict comes from rolling these classifications up.

**D-07 (LOCKED):** Half-deleted-state recovery is decided by inspection. If install.sh has any explicit `--resume` or "detect partial install" branch in its parsing, document it. If not, the audit's recovery proposal is: **"Phase 37 wipe step takes a pre-wipe `tar -cf /tmp/livos-pre-reset-<ts>.tar.gz /opt/livos` snapshot before unlinking; if reinstall fails, restore is `tar -xzf /tmp/livos-pre-reset-<ts>.tar.gz -C /` + manual `systemctl restart`."** Phase 37 implements this; Phase 36 documents it as the chosen path.

**D-08 (LOCKED):** API key transport audit — read install.sh for `$1`/`${API_KEY}` use, then specifically grep for `echo "...${API_KEY}..."` and any unredacted log lines that could leak the key into a journal. If install.sh only accepts argv, the hardening proposal is a wrapper: **`livos-install-wrap.sh` that reads the key from a file via `--api-key-file`, sets it as env var, and execs install.sh** — the wrapper, not install.sh itself, becomes Phase 37's entry point. Document the wrapper spec in AUDIT-FINDINGS.md.

**D-09 (LOCKED):** Server5 dependency — confirm via `dig livinity.io`, `dig install.livinity.io` (if exists), and tracing the routing topology against the project memory ("Cloudflare DNS-only → Server5 relay → Mini PC"). The fallback proposal is: **(a)** cache install.sh on the Mini PC at `/opt/livos/data/cache/install.sh.cached` during update.sh runs (so factory reset can fall back to the cache if Server5 is down), **(b)** publish a backup URL on a non-Server5 origin (deferred to v29.2.1 if the cache covers it). Document the chosen primary; flag (b) as v29.2.1 if needed.

### Acceptance gate for Phase 37

**D-10 (LOCKED):** A Phase 37 backend planner reading AUDIT-FINDINGS.md must be able to answer, without external lookup, all of:
  - "What command does Phase 37 execute to reinstall?" → e.g., `bash /opt/livos/data/cache/install.sh.cached --api-key-file /tmp/livos-reset-apikey` OR `livos-install-wrap.sh --api-key-file …`
  - "What recovery action runs if reinstall exits non-zero?" → e.g., `tar -xzf /tmp/livos-pre-reset-<ts>.tar.gz -C / && systemctl restart livos liv-core liv-worker liv-memory`
  - "Is install.sh safe to run twice on the same host?" → boolean answer with cited reasoning
  - "How does Phase 37 pass the API key without leaking it via `ps`?" → exact mechanism

If any of these questions cannot be answered by AUDIT-FINDINGS.md alone, the audit is incomplete and the phase fails its own success criteria.

### Out-of-scope items

**D-11 (LOCKED):** No live execution of install.sh on Mini PC. No wipe, no reinstall, no Docker churn. The audit is read-only static analysis + curl fetch.

**D-12 (LOCKED):** No code changes to `livos/`, `nexus/`, or anything in the deployment toolchain in this phase. Hardening proposals are *proposals* — they're spec'd in AUDIT-FINDINGS.md and applied by Phase 37 if at all.

**D-13 (LOCKED):** Server4 is off-limits per project memory hard rule (2026-04-27). The audit does not even reference Server4 in its findings; if install.sh's behavior on Server4 came up historically, it is not relevant here.

### Claude's Discretion

- Exact section structure of AUDIT-FINDINGS.md beyond the 7 mandatory sections in D-02
- Whether the install.sh snapshot is a single file or split (e.g., snapshot + diff vs. an earlier version)
- Choice of static-analysis tools (`shellcheck`, `bash -n`, manual read) — but execution-on-host is forbidden per D-11
- Format of the unified-diff hardening proposal (inline in AUDIT-FINDINGS.md vs. separate `.patch` file)
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v29.2 Factory Reset milestone artifacts
- `.planning/ROADMAP.md` — Phase 36 success criteria (lines 33–44) and Phase 37/38 dependencies that consume this audit
- `.planning/REQUIREMENTS.md` — FR-AUDIT-01..05 verbatim (lines 14–20)
- `.planning/STATE.md` — confirms milestone v29.2, current_phase 36, status `roadmap-ready`

### Project memory (auto-loaded)
- `C:/Users/hello/.claude/projects/C--Users-hello-Desktop-Projects-contabo-livinity-io/memory/MEMORY.md` — Server topology hard rules:
  - Mini PC (`bruce@10.69.31.68`) is the only LivOS deployment
  - **Server4 is OFF-LIMITS** — no patches, no references in audit findings
  - Server5 (45.137.194.102) is the relay; `*.livinity.io` DNS routes through it; LivOS is NOT installed on Server5
  - Cloudflare is DNS-only, NOT a tunnel — there is no `cloudflared` in the stack
- Same memory: `bash /opt/livos/update.sh` is the canonical update flow; PM2 references are obsolete

### Source for prior-art patterns Phase 37 will reuse
- `.planning/milestones/v29.0-phases/31-update-sh-build-pipeline-integrity/` — update.sh hardening prior art
- `.planning/milestones/v29.0-phases/32-pre-update-sanity-auto-rollback/` — auto-rollback pattern (transient cgroup-escape scope) that Phase 37 mirrors
- `.planning/milestones/v29.0-phases/33-update-observability-surface/` — JSON event row schema in `update-history/` that Phase 37's factory-reset event extends

### External
- `https://livinity.io/install.sh` — the install.sh URL the audit fetches and analyzes (audit deliverable: snapshot saved to `.planning/phases/36-install-sh-audit/install.sh.snapshot`)
- `curl -sI https://livinity.io/install.sh` — header capture for snapshot provenance

### NOT canonical (do not consult for this phase)
- `.planning/milestones/v22.0-phases/36-learning-loop/` — archived legacy Phase 36 (different milestone, "learning-loop" feature, shipped 2026-03-29). Same number, different work. SDK init currently mis-resolves to this; ignore.
- Any reference to Server4 in past audits or roadmaps — off-limits per project memory hard rule
</canonical_refs>

<specifics>
## Specific Ideas

- The audit is **explicitly an audit + hardening proposal**, not "investigate and report back." If install.sh is missing a `--api-key-file` flag, the audit's deliverable includes the proposed wrapper, not "we should add one."
- The audit must be **decisive** — every open question Phase 37 will face must be answered with a concrete path. "It depends" findings must be resolved into a chosen-path before this phase passes verification.
- If the live `https://livinity.io/install.sh` is unreachable when the audit runs (Server5 already partly offline), that is itself a Tier-1 finding documented in the Server5 dependency section (FR-AUDIT-05). Document the failure mode and proceed with whatever cached/historical version is available — flag explicitly that a re-fetch is required before Phase 37 ships.
- Snapshot file naming: `.planning/phases/36-install-sh-audit/install.sh.snapshot` (single file; if the script is small enough, also embed verbatim in AUDIT-FINDINGS.md for offline readability).
</specifics>

<deferred>
## Deferred Ideas

- **Backup-aware reset** — running a pre-reset auto-snapshot before wipe. Deferred to v30.0 Backup milestone (BAK-SCHED-04 lock pattern). v29.2 reset is destructive by design.
- **Public bootstrap key fallback** — alternate non-Server5 URL for install.sh. Filed as v29.2.1 follow-up if the local cache (D-09) covers the common case.
- **Live execution of install.sh as part of audit** — explicitly out of scope per D-11. If a future audit pass needs to verify behavior on a real host, that is a separate phase (could become v29.2.1 or a v29.2 follow-up — explicitly NOT this phase).
</deferred>

---

*Phase: 36-install-sh-audit*
*Context gathered: 2026-04-28 via PRD-style express path (ROADMAP success criteria + REQUIREMENTS.md as locked decisions; skip_discuss=true)*
