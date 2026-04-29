---
phase: 36-install-sh-audit
plan: 03
type: execute
wave: 3
depends_on:
  - 36-01-snapshot-provenance
  - 36-02-static-analysis
files_modified:
  - .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md
autonomous: true
requirements:
  - FR-AUDIT-03
  - FR-AUDIT-05
must_haves:
  truths:
    - "The half-deleted-state recovery model is decided and documented as a concrete bash command Phase 37 can run"
    - "Server5 dependency chain is documented (Cloudflare-DNS-only → Server5 relay → install.sh origin) with at least one named fallback per CONTEXT.md D-09"
    - "If Plan 02 flagged any FR-AUDIT-04 FAIL or NOT-IDEMPOTENT command, Hardening Proposals contains a concrete patch (wrapper spec or unified diff)"
    - "Phase 37 Readiness section answers all four D-10 questions with literal bash commands or PASS/FAIL booleans — no TBDs"
  artifacts:
    - path: ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md"
      provides: "Final four populated sections: Recovery Model, Server5 Dependency Analysis, Hardening Proposals, Phase 37 Readiness"
      contains: "## Phase 37 Readiness"
  key_links:
    - from: ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md ## Phase 37 Readiness"
      to: "Phase 37 backend planner"
      via: "Four named questions with literal bash answers per D-10"
      pattern: "Q1|Q2|Q3|Q4"
    - from: ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md ## Hardening Proposals"
      to: ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md ## API Key Transport"
      via: "If FR-AUDIT-04 FAIL, wrapper spec answers the leak"
      pattern: "livos-install-wrap.sh|--api-key-file"
---

<objective>
Close the audit. Populate the final four sections of AUDIT-FINDINGS.md — Recovery Model, Server5 Dependency Analysis, Hardening Proposals, Phase 37 Readiness — by reading the snapshot, the project memory's routing topology, and the Plan 02 findings. Render the Phase 37 Readiness section as a hard gate: four questions, four literal answers, no TBDs.

Purpose: The audit only adds value if Phase 37 can act on it. This plan is the final consumer-readiness pass.

Output:
- `AUDIT-FINDINGS.md` Recovery Model, Server5 Dependency Analysis, Hardening Proposals, Phase 37 Readiness all populated.
- Phase 37 Readiness section answers Q1-Q4 from CONTEXT.md D-10 with concrete bash and booleans.
- If Plan 02 flagged a wrapper need, the wrapper spec is fully written here (not deferred).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/36-install-sh-audit/36-CONTEXT.md
@.planning/phases/36-install-sh-audit/install.sh.snapshot
@.planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md

<interfaces>
<!-- Inputs: -->
<!-- - install.sh.snapshot — frozen byte-exact copy. -->
<!-- - AUDIT-FINDINGS.md — Provenance, Raw Fetch (Plan 01), Argument Surface, Idempotency Verdict, API Key Transport (Plan 02) populated. -->
<!--   Sections still stubbed: Recovery Model, Server5 Dependency Analysis, Hardening Proposals, Phase 37 Readiness. -->

<!-- Inputs from Plan 02 to read explicitly: -->
<!--   1. Idempotency Verdict — drives whether Phase 37 must wipe before reinstall. -->
<!--   2. API Key Transport verdict — drives whether the wrapper proposal is needed. -->
<!--   3. NOT_IDEMPOTENT command list — feeds Hardening Proposals if applicable. -->

<!-- D-09 fallback options (the audit must pick one as the chosen primary): -->
<!--   (a) Cache install.sh on Mini PC at /opt/livos/data/cache/install.sh.cached during update.sh runs — Phase 37 falls back to cache if Server5 down. -->
<!--   (b) Publish backup URL on a non-Server5 origin — deferred to v29.2.1 if (a) suffices. -->

<!-- D-07 recovery options: -->
<!--   (i) install.sh has native --resume → document and use it. -->
<!--   (ii) Pre-wipe snapshot: tar -cf /tmp/livos-pre-reset-<ts>.tar.gz /opt/livos before unlinking; restore via tar -xzf <file> -C / + systemctl restart. -->

<!-- The four D-10 readiness questions (these become section sub-headings): -->
<!--   Q1: What command does Phase 37 execute to reinstall LivOS after wipe? -->
<!--   Q2: What recovery action runs if reinstall exits non-zero? -->
<!--   Q3: Is install.sh safe to run twice on the same host? -->
<!--   Q4: How does Phase 37 pass the API key without leaking it via `ps`? -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Populate Recovery Model + Server5 Dependency Analysis</name>
  <files>
    .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md
  </files>
  <read_first>
    .planning/phases/36-install-sh-audit/36-CONTEXT.md
    .planning/phases/36-install-sh-audit/install.sh.snapshot
    .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md
  </read_first>
  <action>
    HALT GUARD: If AUDIT-FINDINGS.md Provenance reports `Source provenance: unavailable`, replace each remaining stub (`## Recovery Model`, `## Server5 Dependency Analysis`, `## Hardening Proposals`, `## Phase 37 Readiness`) with a halt block and exit ALL tasks of this plan. Do not fabricate findings.

    NORMAL PATH:

    Step A — Recovery Model (per D-07):

    Read the snapshot and grep for `--resume`, `resume`, "partial install", "detect", "rollback", or any branch in argument parsing that would handle re-entering after a partial run. Use `grep -niE '(--resume|resume|partial|detect|rollback|restore)' install.sh.snapshot`.

    Decide one path:
    - If install.sh has a native `--resume` branch: document it (cite line:N), describe what state it detects, and that becomes Phase 37's recovery story.
    - If install.sh has NO native `--resume` (the expected case per CONTEXT.md): the recovery model is the pre-wipe-snapshot path per D-07. The literal bash for Phase 37 is:
      - Pre-wipe (Phase 37 wipe step does this): `tar -cf /tmp/livos-pre-reset-$(date +%s).tar.gz /opt/livos /opt/nexus /etc/systemd/system/livos.service /etc/systemd/system/liv-core.service /etc/systemd/system/liv-worker.service /etc/systemd/system/liv-memory.service 2>/dev/null || true`
      - Restore on reinstall failure: `tar -xzf /tmp/livos-pre-reset-<ts>.tar.gz -C / && systemctl daemon-reload && systemctl restart livos liv-core liv-worker liv-memory`
      - Note: tar paths are absolute, so `-C /` restores in place.

    Replace the `## Recovery Model` stub with:
    ```
    ## Recovery Model

    Method per CONTEXT.md D-07: inspect install.sh for native `--resume`; if absent, propose pre-wipe-snapshot fallback for Phase 37 to implement.

    ### Native --resume support

    <Either: "install.sh has a native --resume branch at line:N — Phase 37 may invoke it on partial-install detection. <describe behavior>." OR "install.sh has NO native --resume support. Confirmed by grep for `--resume`, `resume`, `partial`, `detect`, `rollback`, `restore` against the snapshot — zero matches in argument-parsing context.">

    ### Chosen recovery path

    **Pre-wipe snapshot (D-07 fallback)** — Phase 37 wipe step takes a tar archive of LivOS state BEFORE unlinking; if reinstall exits non-zero, the archive is restored.

    **Pre-wipe command (Phase 37 wipe step runs this BEFORE rm -rf):**
    ```bash
    SNAPSHOT_PATH="/tmp/livos-pre-reset-$(date +%s).tar.gz"
    tar -cf "$SNAPSHOT_PATH" /opt/livos /opt/nexus \
      /etc/systemd/system/livos.service \
      /etc/systemd/system/liv-core.service \
      /etc/systemd/system/liv-worker.service \
      /etc/systemd/system/liv-memory.service \
      2>/dev/null || true
    echo "$SNAPSHOT_PATH" > /tmp/livos-pre-reset.path
    ```

    **Restore command (Phase 37 runs this on reinstall failure):**
    ```bash
    SNAPSHOT_PATH=$(cat /tmp/livos-pre-reset.path 2>/dev/null)
    if [ -f "$SNAPSHOT_PATH" ]; then
      tar -xzf "$SNAPSHOT_PATH" -C /
      systemctl daemon-reload
      systemctl restart livos liv-core liv-worker liv-memory
    fi
    ```

    ### Cleanup

    Once reinstall completes successfully and the new livinityd boots, Phase 37 deletes `$SNAPSHOT_PATH` and `/tmp/livos-pre-reset.path` to avoid leaking previous-deployment data on disk.

    ### Phase 37 implication

    Phase 37 owns: capturing the snapshot, recording its path, restoring on failure, cleaning up on success. This audit specifies WHAT — Phase 37 specifies WHEN within its idempotent wipe bash.
    ```

    (If install.sh DID have native --resume, replace the "Chosen recovery path" subsection with the native invocation. The structure of the section stays the same.)

    Step B — Server5 Dependency Analysis (per D-09):

    The routing topology is fixed by project memory: Cloudflare DNS-only → Server5 relay → install.sh origin. We document this as audit evidence (no live `dig` needed for the document — the topology is established). However, do attempt a quick non-blocking DNS resolution to confirm the chain is sane: `nslookup livinity.io` (or `dig livinity.io` if available) — record the result. If the resolution fails, that itself is a finding.

    Replace the `## Server5 Dependency Analysis` stub with:
    ```
    ## Server5 Dependency Analysis

    Method per CONTEXT.md D-09: trace the routing chain via project-memory facts + light DNS confirmation.

    ### Routing chain

    1. Client requests `https://livinity.io/install.sh`.
    2. Cloudflare resolves DNS (DNS-only, NOT proxy/tunnel — `cloudflared` is not in the stack).
    3. Resolved A record points to **Server5 (45.137.194.102)** acting as relay.
    4. Server5 serves install.sh from its origin filesystem.

    Cloudflare is not a load balancer or tunnel here. If Server5's HTTP service is down, the request fails at the relay.

    ### DNS resolution evidence

    `nslookup livinity.io` (or equivalent) at audit time:
    ```
    <paste output, redact private IPs>
    ```

    ### Single-point-of-failure surface

    | Failure mode | Impact on factory reset | Severity |
    |--------------|-------------------------|----------|
    | Server5 HTTP down | Phase 37 reinstall cannot fetch install.sh | CRITICAL |
    | Server5 host down | Same as above + livinity.io tunnel down (Mini PC unreachable from public) | CRITICAL |
    | Cloudflare DNS misconfig | Same — name resolution fails | HIGH |
    | install.sh content corruption on Server5 | Reinstall runs corrupted script | HIGH |

    ### Chosen primary fallback (per D-09)

    **(a) Cached copy on Mini PC at `/opt/livos/data/cache/install.sh.cached`.**

    Mechanism:
    - During every `update.sh` run, copy the freshly-fetched install.sh into `/opt/livos/data/cache/install.sh.cached` (chmod 0755).
    - Phase 37 reinstall step tries live URL first; on failure (curl exit non-zero or HTTP non-2xx within retry budget), falls back to the cache.
    - Cache age is recorded in factory-reset event JSON for observability.

    Phase 37 invocation pattern:
    ```bash
    if curl -sSL --max-time 30 https://livinity.io/install.sh -o /tmp/install.sh.live; then
      INSTALL_SH=/tmp/install.sh.live
    elif [ -f /opt/livos/data/cache/install.sh.cached ]; then
      INSTALL_SH=/opt/livos/data/cache/install.sh.cached
      echo "Server5 unreachable — using cached install.sh from $(stat -c %y "$INSTALL_SH")"
    else
      echo "FATAL: no install.sh available — aborting reset"
      exit 1
    fi
    bash "$INSTALL_SH" --api-key-file /tmp/livos-reset-apikey
    ```

    ### Deferred fallback

    **(b) Backup URL on non-Server5 origin** — deferred to v29.2.1 if needed. The cached fallback (a) covers the common case (user has done at least one successful update on Mini PC). Edge case is a never-updated host failing reset — out of scope for v29.2.

    ### Phase 37 implication

    Phase 37 backend code MUST implement the live-then-cache fallback above. update.sh ALSO needs a one-line addition to populate the cache — that's a tiny dependency on Phase 37's planning to either include the update.sh patch or split it to a Phase 37.x.

    ### NOT referenced

    Server4 is not referenced in this dependency analysis — per project memory hard rule (2026-04-27), Server4 is off-limits.
    ```

    Write both sections back to AUDIT-FINDINGS.md, leaving Provenance, Raw Fetch, Argument Surface, Idempotency Verdict, API Key Transport (all populated) unchanged. The `## Hardening Proposals` and `## Phase 37 Readiness` stubs remain for Tasks 2 and 3.
  </action>
  <verify>
    <automated>grep -E "^### Chosen recovery path|^### Chosen primary fallback" ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - Section "## Recovery Model" no longer contains stub `*Populated by Plan 03.*`.
    - Section "## Server5 Dependency Analysis" no longer contains stub `*Populated by Plan 03.*`.
    - Recovery Model section contains the literal text `### Chosen recovery path` AND a fenced bash block.
    - Recovery Model contains a literal `tar` command (either pre-wipe or restore) — verifiable by grep `tar -[cx][zf]`.
    - Server5 Dependency Analysis contains the literal phrase `### Chosen primary fallback` AND a fenced bash block.
    - Server5 section contains the literal phrase "Cloudflare DNS-only" or "DNS-only" (per project memory).
    - Server5 section contains zero references to "Server4" except inside the explicit "NOT referenced" disclaimer (verifiable: `grep -c "Server4" AUDIT-FINDINGS.md` returns the same count as before plus exactly 1).
    - Server5 section contains zero references to `cloudflared` (verifiable: grep returns 0).
    - Total `^## ` headings still 9.
    - Both sections name a chosen path — no "TBD" or "to be decided" anywhere in the new content.
  </acceptance_criteria>
  <done>
    Recovery Model and Server5 Dependency Analysis sections populated with concrete bash commands Phase 37 can copy-paste, fallback decided, no Server4/cloudflared references.
  </done>
</task>

<task type="auto">
  <name>Task 2: Populate Hardening Proposals — wrapper spec or no-op</name>
  <files>
    .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md
  </files>
  <read_first>
    .planning/phases/36-install-sh-audit/36-CONTEXT.md
    .planning/phases/36-install-sh-audit/install.sh.snapshot
    .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md
  </read_first>
  <action>
    HALT GUARD: Same as Task 1.

    NORMAL PATH:

    Read AUDIT-FINDINGS.md sections "## Idempotency Verdict" and "## API Key Transport" — these are now populated by Plan 02. Determine which (if any) hardening proposals are required:

    Trigger A — FR-AUDIT-04 FAIL (API key transport is `argv` only OR has a leak):
    Per CONTEXT.md D-08, produce a wrapper spec named `livos-install-wrap.sh` that:
    - Accepts `--api-key-file <path>` flag
    - Reads the key from that file
    - Sets it as env var (e.g., `LIV_API_KEY`)
    - Execs install.sh with the env var pre-set, NOT passing the key on argv
    - Cleans up: never echoes the key, never writes it to a log

    Trigger B — Idempotency verdict NOT-IDEMPOTENT (or PARTIALLY-IDEMPOTENT with hard failures):
    Produce a unified-diff proposal against `install.sh.snapshot` adding guards (`[ -d ... ] || ...`) around the NOT_IDEMPOTENT commands. Diff should be a real git-style unified diff with `---`/`+++` headers and `@@ ... @@` hunks.

    Trigger C — Both pass:
    Section reads "No hardening required — install.sh meets v29.2 requirements as-is."

    Replace the `## Hardening Proposals` stub with the appropriate content:

    If TRIGGER A is active, include this block:
    ```
    ## Hardening Proposals

    ### Wrapper script: `livos-install-wrap.sh` (FR-AUDIT-04 hardening)

    **Why:** Plan 02 found install.sh's API key transport is `argv`. argv is visible to any user who can run `ps`. Phase 37 cannot use install.sh directly without leaking the key.

    **Where it lives:** Phase 37 ships this wrapper in livinityd's wipe-and-reinstall bash. The wrapper is a one-shot file written to `/tmp/livos-install-wrap.sh` mode 0700, removed after install.sh exits.

    **Wrapper content (full source):**
    ```bash
    #!/bin/bash
    # livos-install-wrap.sh
    # Hardens install.sh by passing the API key via env var instead of argv.
    set -euo pipefail

    API_KEY_FILE=""
    EXTRA_ARGS=()
    while [ $# -gt 0 ]; do
      case "$1" in
        --api-key-file)
          API_KEY_FILE="$2"
          shift 2
          ;;
        *)
          EXTRA_ARGS+=("$1")
          shift
          ;;
      esac
    done

    if [ -z "$API_KEY_FILE" ] || [ ! -f "$API_KEY_FILE" ]; then
      echo "livos-install-wrap.sh: --api-key-file <path> is required and must exist" >&2
      exit 2
    fi

    # Read key into env var; never log, never echo.
    LIV_API_KEY=$(cat "$API_KEY_FILE")
    export LIV_API_KEY

    # Locate install.sh (live or cached) — caller must place at $INSTALL_SH or pass as first EXTRA_ARG.
    INSTALL_SH="${INSTALL_SH:-/tmp/install.sh.live}"
    if [ ! -f "$INSTALL_SH" ]; then
      echo "livos-install-wrap.sh: \$INSTALL_SH ($INSTALL_SH) does not exist" >&2
      exit 3
    fi

    # Exec install.sh — env var is in scope; argv contains no key.
    exec bash "$INSTALL_SH" "${EXTRA_ARGS[@]}"
    ```

    **Phase 37 invocation pattern:**
    ```bash
    INSTALL_SH=/tmp/install.sh.live bash /tmp/livos-install-wrap.sh --api-key-file /tmp/livos-reset-apikey
    ```

    **What this hardens:** install.sh now reads `${LIV_API_KEY}` from env (assuming install.sh's env-var path exists per Plan 02 Argument Surface — if env-var is also not supported, the wrapper must instead pipe the key on stdin and install.sh's stdin path becomes the entry. Plan 02 Argument Surface determines which.).

    **Cleanup contract:** Phase 37 wipe bash deletes `/tmp/livos-install-wrap.sh` AND `/tmp/livos-reset-apikey` after install.sh exits (success or failure).
    ```

    If TRIGGER B is active (NOT-IDEMPOTENT), include a sibling block:
    ```
    ### Idempotency patch (FR-AUDIT-02 hardening)

    The following commands in install.sh.snapshot are NOT_IDEMPOTENT per Plan 02 (cited line:N). Proposal: wrap with guards. Unified diff:

    ```diff
    --- install.sh.snapshot
    +++ install.sh.snapshot.hardened
    @@ -<line>,<count> +<line>,<count> @@
    -<original line>
    +<guarded version>
    ```

    Phase 37 has two options:
    - (i) Always run the wipe step BEFORE install.sh — wipe brings the host to a known-clean state, so install.sh's NOT_IDEMPOTENT commands run cleanly. This is the recommended path because the wipe is part of factory reset by definition.
    - (ii) Apply the diff above to install.sh in the upstream repo. Out of scope for Phase 36 (would touch the deployment toolchain) — flagged for v29.2.1 if needed.
    ```

    If TRIGGER C (no hardening needed), the section reads:
    ```
    ## Hardening Proposals

    No hardening required.

    - FR-AUDIT-02 (idempotency): verdict is `IDEMPOTENT` per Plan 02 — install.sh re-runs cleanly.
    - FR-AUDIT-04 (API key transport): verdict is `PASS` per Plan 02 — transport is `<stdin|--api-key-file|env-var>` and no leak surface found.

    install.sh meets v29.2 factory-reset requirements as-is. Phase 37 may invoke install.sh directly with the transport identified in Plan 02 (see "Phase 37 invocation hint" in the API Key Transport section).
    ```

    Choose the appropriate block(s) based on Plan 02's actual findings. If both Trigger A and Trigger B fire, write BOTH blocks.

    Write the populated section back. Leave Phase 37 Readiness still stubbed for Task 3.
  </action>
  <verify>
    <automated>! grep -A1 "^## Hardening Proposals" ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md" | grep -q "Populated by Plan 03"</automated>
  </verify>
  <acceptance_criteria>
    - Section "## Hardening Proposals" no longer contains stub `*Populated by Plan 03.*`.
    - Section content matches one of three legal shapes:
      - Trigger A only: contains the literal `livos-install-wrap.sh` AND a fenced bash block AND a `--api-key-file` flag definition.
      - Trigger B only: contains a unified diff with `--- install.sh.snapshot` AND `+++ install.sh.snapshot.hardened` headers AND at least one `@@` hunk.
      - Trigger C: contains the literal phrase "No hardening required" AND cites both FR-AUDIT-02 and FR-AUDIT-04 verdicts.
      - Triggers A+B: contains both Trigger A's wrapper block AND Trigger B's diff block.
    - Whichever block is written, it does NOT contain "TBD", "to be decided", or "future work" — it is implementable as-written.
    - Total `^## ` heading count still 9.
    - If a wrapper is written, the bash content does NOT contain `echo "$LIV_API_KEY"` or any pattern that would log the key (verifiable: `grep -E '(echo|printf|tee).*LIV_API_KEY' AUDIT-FINDINGS.md` returns 0).
  </acceptance_criteria>
  <done>
    Hardening Proposals section populated with the appropriate content shape — wrapper, diff, no-op, or both. All proposals are concrete (full file contents or full unified diff), no deferrals.
  </done>
</task>

<task type="auto">
  <name>Task 3: Populate Phase 37 Readiness — answer all four D-10 questions with literal bash</name>
  <files>
    .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md
  </files>
  <read_first>
    .planning/phases/36-install-sh-audit/36-CONTEXT.md
    .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md
  </read_first>
  <action>
    HALT GUARD: Same as Tasks 1 and 2.

    NORMAL PATH:

    This task is the final acceptance gate per CONTEXT.md D-10. It composes prior section findings into four answers, each addressed to Phase 37's backend planner. The answers MUST be self-contained — Phase 37 should be able to read this section ALONE and proceed.

    Read all preceding sections of AUDIT-FINDINGS.md in their populated state. Compose four answers by extracting the relevant facts:

    Q1: "What command does Phase 37 execute to reinstall LivOS after wipe?"
    - Pull from the API Key Transport "Phase 37 invocation hint" line AND the Server5 Dependency Analysis fallback bash AND (if applicable) Hardening Proposals wrapper invocation.
    - Compose into a single literal bash command (or short bash block).

    Q2: "What recovery action runs if reinstall exits non-zero?"
    - Pull from Recovery Model "Restore command" bash block.
    - Cite the literal `tar -xzf ... && systemctl ...` line.

    Q3: "Is install.sh safe to run twice on the same host?"
    - Pull from Idempotency Verdict.
    - Answer: `true` (verdict IDEMPOTENT) | `false` (verdict NOT-IDEMPOTENT) | `partial` (PARTIALLY-IDEMPOTENT — conditionally safe; cite the conditions).
    - One paragraph of cited reasoning referencing specific NOT_IDEMPOTENT lines if applicable.

    Q4: "How does Phase 37 pass the API key without leaking it via `ps`?"
    - Pull from API Key Transport verdict + Hardening Proposals (if a wrapper was specified).
    - Name the exact mechanism: `--api-key-file via wrapper`, `--api-key-file native`, `stdin native`, `env-var native`.

    Replace the `## Phase 37 Readiness` stub with this exact structure:
    ```
    ## Phase 37 Readiness

    This section is the audit's acceptance gate (CONTEXT.md D-10). Phase 37's backend planner must be able to read this section alone and proceed without re-running the audit.

    ### Q1: What command does Phase 37 execute to reinstall LivOS after wipe?

    ```bash
    # Live-then-cache fallback (Server5 outage handling — see Server5 Dependency Analysis):
    if curl -sSL --max-time 30 https://livinity.io/install.sh -o /tmp/install.sh.live; then
      INSTALL_SH=/tmp/install.sh.live
    elif [ -f /opt/livos/data/cache/install.sh.cached ]; then
      INSTALL_SH=/opt/livos/data/cache/install.sh.cached
    else
      echo "FATAL: no install.sh available" >&2
      exit 1
    fi

    # Reinstall invocation (per API Key Transport verdict):
    <ONE OF THE FOLLOWING — pick based on Plan 02 verdict + Plan 03 hardening:>
    # If --api-key-file native:    bash "$INSTALL_SH" --api-key-file /tmp/livos-reset-apikey
    # If stdin native:             cat /tmp/livos-reset-apikey | bash "$INSTALL_SH"
    # If env-var native:           LIV_API_KEY=$(cat /tmp/livos-reset-apikey) bash "$INSTALL_SH"
    # If argv-only (with wrapper): INSTALL_SH="$INSTALL_SH" bash /tmp/livos-install-wrap.sh --api-key-file /tmp/livos-reset-apikey
    ```

    Compose the bash above with the SPECIFIC active line uncommented based on this audit's verdicts. The other three options are deleted, not left as comments.

    ### Q2: What recovery action runs if reinstall exits non-zero?

    ```bash
    SNAPSHOT_PATH=$(cat /tmp/livos-pre-reset.path 2>/dev/null)
    if [ -f "$SNAPSHOT_PATH" ]; then
      tar -xzf "$SNAPSHOT_PATH" -C /
      systemctl daemon-reload
      systemctl restart livos liv-core liv-worker liv-memory
    else
      echo "FATAL: no pre-wipe snapshot — host is in half-deleted state. Manual SSH recovery required." >&2
      exit 2
    fi
    ```

    The snapshot is taken by Phase 37's wipe step BEFORE the rm -rf — see Recovery Model section.

    ### Q3: Is install.sh safe to run twice on the same host?

    **Answer:** `true` | `false` | `partial`

    **Reasoning (one paragraph citing specific lines):**
    <One paragraph. If `false`, name the NOT_IDEMPOTENT commands by line:N and explain why. If `partial`, name the conditions under which it is safe. If `true`, explain that all side-effecting commands are IDEMPOTENT_NATIVE or IDEMPOTENT_WITH_GUARD per Plan 02's classification.>

    **Phase 37 takeaway:** <One sentence. E.g., "Phase 37's wipe step is mandatory because install.sh's bare `git clone` would fail on re-run." OR "Phase 37 may safely re-run install.sh without prior wipe, but wipe is still required for `preserveApiKey: false` semantic correctness.">

    ### Q4: How does Phase 37 pass the API key without leaking it via `ps`?

    **Mechanism:** `--api-key-file via wrapper` | `--api-key-file native` | `stdin native` | `env-var native`

    **Concrete approach:**
    1. Phase 37 wipe step writes the preserved API key to `/tmp/livos-reset-apikey` (mode 0600) BEFORE the rm step.
    2. Reinstall is invoked using the mechanism named above (see Q1's bash for the exact form).
    3. After reinstall (success OR failure), Phase 37 deletes `/tmp/livos-reset-apikey` (and `/tmp/livos-install-wrap.sh` if a wrapper was used).
    4. The key is never on argv of any process, never echoed, never logged.

    **Verification:** A reviewer running `ps auxww | grep -i api` during reinstall should see ZERO occurrences of the key value. Plan 02's API Key Transport leak-surface table classified each potential leak vector and they are all marked `none` or mitigated by the wrapper.

    ---

    ### Audit verdict

    All four D-10 questions are answered with literal bash + boolean answers. No TBDs. Phase 37 may proceed.

    **Audit complete:** <YYYY-MM-DD>
    ```

    Compose the section by replacing the placeholder `<...>` markers with values pulled from the audit's prior sections. Once written, the section should be entirely free of `<TBD>`, `<...>`, or "fill in here" markers — every parameter must be a concrete value.

    Final pass before exiting Task 3: re-read AUDIT-FINDINGS.md top-to-bottom and verify:
    - All 9 `^## ` sections are populated (no stubs left).
    - Every "Server4" mention in AUDIT-FINDINGS.md is purpose-correct (off-limits disclaimer or flagged install.sh anomaly quotation) — see acceptance criteria for the exact rule.
    - The literal phrase "cloudflared" appears 0 times.
    - The string "TBD" appears 0 times.
  </action>
  <verify>
    <automated>grep -E "^### Q[1-4]:" ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - Section "## Phase 37 Readiness" no longer contains stub `*Populated by Plan 03.*`.
    - Section contains exactly four sub-headings starting with `### Q1:`, `### Q2:`, `### Q3:`, `### Q4:` (verifiable: `grep -cE "^### Q[1-4]:" AUDIT-FINDINGS.md` returns 4).
    - Q1 contains a fenced bash block with at least one literal `bash` invocation that includes the API key file path or the wrapper invocation.
    - Q2 contains a fenced bash block with the literal `tar -xzf` command AND a `systemctl restart` line.
    - Q3 contains a literal answer of one of `true`, `false`, `partial` followed by a reasoning paragraph that is at least 50 characters long (not just the word).
    - Q4 names a mechanism from the legal set `--api-key-file via wrapper | --api-key-file native | stdin native | env-var native` (verifiable by grep).
    - Document-wide check: `grep -c "TBD" AUDIT-FINDINGS.md` returns 0.
    - Document-wide check: `grep -c "<TBD>\|<...>\|fill in here" AUDIT-FINDINGS.md` returns 0.
    - Document-wide check (purpose-based, NOT count-based): All "Server4" mentions in AUDIT-FINDINGS.md are either: (a) "off-limits" disclaimers in the Scope/Server5 sections, OR (b) line-cited quotations from install.sh.snapshot flagged as anomalies. NO mention treats Server4 as a target host or operational dependency. Verify with: `grep -n "Server4" AUDIT-FINDINGS.md` — every line must match one of: `^.*off-limits.*Server4.*$`, `^.*not relevant.*Server4.*$`, `^.*install.sh:[0-9]+ — Server4.*anomaly.*$`, or be inside a fenced code block quoting install.sh.
    - Document-wide check: `grep -c "cloudflared" AUDIT-FINDINGS.md` returns 0.
    - Document-wide check: `grep -c "*Populated by Plan" AUDIT-FINDINGS.md` returns 0 (all stubs filled).
    - Document-wide check: `grep -c "^## " AUDIT-FINDINGS.md` returns 9 (structure preserved).
  </acceptance_criteria>
  <done>
    Phase 37 Readiness section populated with four concrete answers, audit verdict line written, all stubs removed across the document, all Server4/cloudflared/TBD invariants hold. Audit complete.
  </done>
</task>

</tasks>

<verification>
End-of-plan checks (run as a final sanity sweep):
```
grep -c "^## " .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md          # expect 9
grep -c "*Populated by Plan" .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md   # expect 0
grep -c "TBD" .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md             # expect 0
grep -n "Server4" .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md         # every line must be an off-limits disclaimer or a flagged install.sh anomaly quotation; no operational/target-host usage
grep -c "cloudflared" .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md     # expect 0
grep -cE "^### Q[1-4]:" .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md   # expect 4
```

Files modified by this plan: ONLY `.planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md`. No source-tree touches.
No live execution of install.sh anywhere.
</verification>

<success_criteria>
1. Recovery Model documents the chosen path (native --resume OR pre-wipe-snapshot) with literal bash — FR-AUDIT-03 satisfied.
2. Server5 Dependency Analysis names the routing chain and chosen primary fallback (cached on Mini PC) with literal bash — FR-AUDIT-05 satisfied.
3. Hardening Proposals are concrete — wrapper script (full source), unified diff (real hunks), or explicit no-op — never deferred.
4. Phase 37 Readiness answers all four D-10 questions with literal bash + booleans, no TBDs.
5. Document is internally consistent: Q1 bash matches API Key Transport verdict, Q2 bash matches Recovery Model, Q3 answer matches Idempotency Verdict, Q4 mechanism matches API Key Transport.
6. Server4 is referenced ONLY in the explicit disclaimers; cloudflared is not referenced.
7. No source-code modifications. No live execution.
</success_criteria>

<output>
After completion, create `.planning/phases/36-install-sh-audit/36-03-SUMMARY.md` documenting:
- Recovery model chosen (native or pre-wipe-snapshot)
- Server5 fallback chosen (cached-on-minipc or alternate)
- Hardening proposals shape (wrapper / diff / both / no-op)
- Q3 answer (idempotency boolean)
- Q4 mechanism name
- Audit verdict — ready for Phase 37: yes/no
</output>
</content>
</invoke>