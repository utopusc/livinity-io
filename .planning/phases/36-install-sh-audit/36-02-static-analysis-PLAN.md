---
phase: 36-install-sh-audit
plan: 02
type: execute
wave: 2
depends_on:
  - 36-01-snapshot-provenance
files_modified:
  - .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md
autonomous: true
requirements:
  - FR-AUDIT-01
  - FR-AUDIT-02
  - FR-AUDIT-04
must_haves:
  truths:
    - "Every flag, env var, and stdin behavior install.sh honors is mapped with line:N references back into the snapshot"
    - "An idempotency verdict (IDEMPOTENT | PARTIALLY-IDEMPOTENT | NOT-IDEMPOTENT) is rendered, backed by per-command classifications"
    - "API key transport is named exactly — argv, stdin, --api-key-file, or env-var — with the line refs that prove it"
    - "If install.sh logs the API key in cleartext anywhere, that leak is flagged as a Tier-1 finding for Plan 03 to harden"
  artifacts:
    - path: ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md"
      provides: "Three populated sections: Argument Surface, Idempotency Verdict, API Key Transport"
      contains: "## Idempotency Verdict"
  key_links:
    - from: ".planning/phases/36-install-sh-audit/install.sh.snapshot"
      to: ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md"
      via: "Argument Surface table cites line:N references into snapshot"
      pattern: "line:[0-9]+|L[0-9]+"
    - from: ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md"
      to: "Plan 03"
      via: "API key transport finding feeds Hardening Proposals decision"
      pattern: "argv|stdin|--api-key-file|env-var"
---

<objective>
Read the frozen `install.sh.snapshot` from Plan 01, perform static analysis on it (no execution), and populate three sections of AUDIT-FINDINGS.md: Argument Surface, Idempotency Verdict, API Key Transport. These are the read-only static-analysis findings that Plan 03 builds on.

Purpose: Answer two of the four Phase 37 readiness questions (per D-10): "Is install.sh safe to run twice on the same host?" and "How does Phase 37 pass the API key without leaking it via `ps`?". Also produce the argument-surface map Phase 37 will use to construct its actual `bash install.sh ...` invocation.

Output:
- `AUDIT-FINDINGS.md` sections "Argument Surface", "Idempotency Verdict", "API Key Transport" fully populated with line:N references into the snapshot.
- If a Tier-1 leak (API key in logs/argv-only) is found, it is explicitly marked so Plan 03 produces a wrapper proposal.
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
@.planning/phases/36-install-sh-audit/36-01-snapshot-provenance-PLAN.md

<interfaces>
<!-- Inputs from Plan 01: -->
<!-- - install.sh.snapshot — frozen byte-exact copy. Read with `cat -n` to get line numbers. -->
<!-- - AUDIT-FINDINGS.md — has Provenance + Raw Fetch populated; sections 3, 4, 5 are stubs reading "*Populated by Plan 02.*" -->

<!-- Halt condition: If AUDIT-FINDINGS.md Provenance section says `Source provenance: unavailable`, this plan halts. -->
<!-- Per Plan 01's Tier-1 failure block, do not fabricate static-analysis findings against an empty snapshot. -->

<!-- Idempotency classification labels (per CONTEXT.md D-06) — use these EXACT strings in tables: -->
<!--   IDEMPOTENT_NATIVE       — e.g., `apt-get install -y` (apt is idempotent for already-installed packages) -->
<!--   IDEMPOTENT_WITH_GUARD   — e.g., `[ -d /opt/livos ] || git clone ...` -->
<!--   NOT_IDEMPOTENT          — e.g., bare `git clone /opt/livos` (fails on re-run) -->
<!--   UNKNOWN_NEEDS_VERIFICATION — could not classify by static analysis alone -->

<!-- API key transport labels (per CONTEXT.md D-08) — use one of: -->
<!--   argv                    — read from $1, $2, ... or `getopts` from positional args (LEAKS via `ps`) -->
<!--   stdin                   — read via `read -r API_KEY` from stdin (does not leak via ps) -->
<!--   --api-key-file <path>   — flag points at a file; key never on argv (does not leak via ps) -->
<!--   env-var                 — pulled from $LIV_API_KEY (does not leak via ps for the install.sh invocation but env can leak via /proc/PID/environ) -->
<!--   none                    — install.sh does not consume an API key -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Map argument surface — every flag, env var, and stdin path with line refs</name>
  <files>
    .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md
  </files>
  <read_first>
    .planning/phases/36-install-sh-audit/36-CONTEXT.md
    .planning/phases/36-install-sh-audit/install.sh.snapshot
    .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md
  </read_first>
  <action>
    HALT GUARD: First, read the Provenance section of AUDIT-FINDINGS.md. If it contains the literal text `Source provenance: unavailable` or the Tier-1 failure block "install.sh unavailable at audit time", this task does NOT modify the document. Instead, replace the "## Argument Surface" stub with:
    ```
    ## Argument Surface

    **HALTED.** Plan 01 recorded that install.sh was not available at audit time. Re-run Plan 01 with a reachable origin or cached copy before proceeding. No static analysis performed.
    ```
    Then exit Task 1. Tasks 2 and 3 will follow the same pattern. Plan 03 will also halt.

    NORMAL PATH (snapshot is non-empty):

    Read `.planning/phases/36-install-sh-audit/install.sh.snapshot` in full with line numbers. Use Grep with `-n` against the snapshot to locate:
    - Argument parsing constructs: `case "$1"`, `case "${1:-}"`, `case "$arg"`, `getopts`, `while [[ $# -gt 0 ]]`, `shift`
    - Specific flag patterns: `--api-key`, `--api-key-file`, `--resume`, `--help`, `--version`, `--force`, `--no-build`, etc. (anything `--*`)
    - Positional argument reads: `$1`, `$2`, `${1:-}`, `${2:-}`
    - Env var reads: `${LIV_API_KEY}`, `${API_KEY}`, `${LIVOS_*}`, `${INSTALL_*}`, `${NEXUS_*}` and any other `${VAR_NAME}` that is consumed (not just exported by install.sh)
    - Stdin patterns: `read -r`, `read -s`, redirections from `/dev/stdin`, `cat -` patterns

    For each finding, record:
    - Flag/var/stdin name
    - Line number in snapshot (cite as `line:N` referring to the snapshot file)
    - Default value if any
    - Whether it is required vs optional
    - One-sentence description of what the flag does

    Open AUDIT-FINDINGS.md, locate the `## Argument Surface` heading and the stub `*Populated by Plan 02.*` line beneath it. Replace the stub with the populated section using this exact structure:
    ```
    ## Argument Surface

    Static analysis of `install.sh.snapshot` (line refs are to that file). install.sh was NOT executed.

    ### Flags

    | Flag | line:N | Required | Default | Description |
    |------|--------|----------|---------|-------------|
    | --api-key | line:NN | optional | (none) | Reads API key from argv (LEAKS via ps — see API Key Transport section) |
    | --api-key-file | line:NN | optional | (none) | Reads API key from file path (does not leak via ps) |
    | (continue for every flag found) | | | | |

    If install.sh does NOT define a given flag, omit it from the table. Do not fabricate flags.

    ### Environment variables consumed

    | Variable | line:N | Required | Default | Description |
    |----------|--------|----------|---------|-------------|
    | LIV_API_KEY | line:NN | optional | (unset) | Falls back to this if --api-key not given |
    | (continue for every env var found) | | | | |

    ### Stdin behavior

    <Either describe how stdin is read (with line:N), or write "install.sh does not read from stdin." if no stdin pattern was found.>

    ### Positional arguments

    <Either describe positional usage with line:N, or write "install.sh accepts no positional arguments." if none found.>

    ### Findings summary

    - Total flags discovered: N
    - Total env vars consumed: N
    - Stdin support: yes | no
    - Positional args: yes | no
    ```

    Write the populated section back to AUDIT-FINDINGS.md, preserving the rest of the document unchanged (Provenance, Raw Fetch, and the still-stubbed sections 4-9).

    Do NOT execute install.sh anywhere. Do NOT pass it to bash, sh, or shellcheck-with-execution. Static analyzers like shellcheck against the snapshot file are acceptable. Do NOT invoke bash on the snapshot file at all — even bash -n imports lib paths and could exec via shebang under some shells.

    If install.sh contains references to Server4 or `cloudflared`, record them in this section with line refs and flag them as anomalies — but do not edit them out of the snapshot. (The audit reports what is, not what should be.)
  </action>
  <verify>
    <automated>grep -n "^## Argument Surface" ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md" &amp;&amp; ! sed -n '/^## Argument Surface/,/^## /p' ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md" | grep -q "\*Populated by Plan 02\.\*"</automated>
  </verify>
  <acceptance_criteria>
    - `## Argument Surface` heading still exists in AUDIT-FINDINGS.md (count of `^## ` headings unchanged at 9).
    - The stub text `*Populated by Plan 02.*` no longer appears under `## Argument Surface`.
    - The section contains EITHER a halt block (if Plan 01 reported unavailable) OR all five sub-headings: `### Flags`, `### Environment variables consumed`, `### Stdin behavior`, `### Positional arguments`, `### Findings summary`.
    - Every entry in the Flags and Env vars tables has a `line:N` reference (verified by grep `line:[0-9]+` returning at least N matches where N = total flags + env vars).
    - The Findings summary numbers match the table row counts (numerical consistency).
    - No claim is made about a flag that is not actually present in the snapshot — verified by spot-checking each flag name against `grep -n "<flag>" install.sh.snapshot`.
  </acceptance_criteria>
  <done>
    Argument Surface section populated with line-cited tables for flags, env vars, stdin, and positional args. All citations refer back to install.sh.snapshot.
  </done>
</task>

<task type="auto">
  <name>Task 2: Classify side-effecting commands and render idempotency verdict</name>
  <files>
    .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md
  </files>
  <read_first>
    .planning/phases/36-install-sh-audit/36-CONTEXT.md
    .planning/phases/36-install-sh-audit/install.sh.snapshot
    .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md
  </read_first>
  <action>
    HALT GUARD: Same as Task 1. If AUDIT-FINDINGS.md Provenance section indicates `Source provenance: unavailable`, replace the `## Idempotency Verdict` stub with a halted block matching Task 1's halt format and exit.

    NORMAL PATH:

    Read `install.sh.snapshot` in full with line numbers. Use Grep against the snapshot to enumerate side-effecting commands (per CONTEXT.md D-06):
    - Package installation: `apt`, `apt-get install`, `dpkg -i`, `snap install`
    - Service management: `systemctl enable`, `systemctl start`, `systemctl daemon-reload`
    - Filesystem creation: `mkdir`, `touch`, `tee`, redirection-to-file `> /etc/...`
    - Filesystem removal: `rm`, `rm -rf`, `unlink`
    - Filesystem move/copy: `cp`, `mv`, `rsync`
    - Source acquisition: `git clone`, `git pull`, `curl ... -o`, `wget`
    - Build steps: `pnpm install`, `npm install`, `npm run build`, `tsc`
    - Database mutations: `psql ... CREATE`, `psql ... DROP`, `createuser`, `createdb`, `sudo -u postgres ...`
    - Permissions: `chmod`, `chown`, `setcap`
    - Symlinks: `ln -s`, `ln -sf`

    For each occurrence (do not skip duplicates — annotate each line individually), classify it as one of (per D-06):
    - `IDEMPOTENT_NATIVE` — the command is naturally re-runnable (e.g., `apt-get install -y pkg`, `mkdir -p`, `systemctl enable` for an already-enabled unit, `chmod`, `ln -sf`)
    - `IDEMPOTENT_WITH_GUARD` — preceded by an explicit guard (e.g., `[ -d /opt/livos ] || git clone ...`, `if ! command -v node; then ... fi`, `[ -f /etc/systemd/system/livos.service ] || cp ...`)
    - `NOT_IDEMPOTENT` — bare command that fails or duplicates state on re-run (e.g., bare `git clone /opt/livos` when target exists, bare `useradd livos` if user exists, `ln -s` without `-f`, `psql -c "CREATE DATABASE livos"` if DB already exists)
    - `UNKNOWN_NEEDS_VERIFICATION` — static analysis cannot decide (e.g., a command that depends on a function defined elsewhere whose body is also unclear)

    Roll the classifications up into a single verdict per D-02 / D-06:
    - All commands `IDEMPOTENT_NATIVE` or `IDEMPOTENT_WITH_GUARD` → verdict `IDEMPOTENT`
    - Some `NOT_IDEMPOTENT` but the failures are tolerable (e.g., warnings only, no half-state) → verdict `PARTIALLY-IDEMPOTENT`
    - Any `NOT_IDEMPOTENT` that produces a hard error or half-state on re-run → verdict `NOT-IDEMPOTENT`
    - The verdict MUST be one of `IDEMPOTENT`, `PARTIALLY-IDEMPOTENT`, `NOT-IDEMPOTENT` — never "needs investigation" or "TBD". If `UNKNOWN_NEEDS_VERIFICATION` rows exist, fall back to `PARTIALLY-IDEMPOTENT` and call out the unknowns explicitly under "Unknowns" — Plan 03 will incorporate this into the Hardening Proposals if needed.

    Replace the `## Idempotency Verdict` stub with this exact structure:
    ```
    ## Idempotency Verdict

    **Verdict:** `IDEMPOTENT` | `PARTIALLY-IDEMPOTENT` | `NOT-IDEMPOTENT`

    Method per CONTEXT.md D-06: classify every side-effecting command in the snapshot.

    ### Side-effecting command classification

    | line:N | Command (excerpt) | Classification | Reason |
    |--------|-------------------|----------------|--------|
    | line:NN | `apt-get install -y nodejs` | IDEMPOTENT_NATIVE | apt-get install is naturally re-runnable |
    | line:NN | `git clone https://github.com/.../livos /opt/livos` | NOT_IDEMPOTENT | bare git clone fails if /opt/livos exists |
    | line:NN | `[ -d /opt/livos ] || git clone ...` | IDEMPOTENT_WITH_GUARD | guarded against existing target |
    | (continue for every side-effecting command) | | | |

    ### Roll-up

    - IDEMPOTENT_NATIVE count: N
    - IDEMPOTENT_WITH_GUARD count: N
    - NOT_IDEMPOTENT count: N
    - UNKNOWN_NEEDS_VERIFICATION count: N

    ### Failure modes on re-run

    <Either: "install.sh re-runs cleanly with no observable side-effect deltas." OR enumerate each NOT_IDEMPOTENT row's failure mode (e.g., "line:124 will fail with 'fatal: destination path /opt/livos already exists' on second run; install.sh exits non-zero before reaching the build step")>

    ### Unknowns

    <Either: "None — every command was statically classifiable." OR list each UNKNOWN_NEEDS_VERIFICATION row with rationale.>

    ### Phase 37 implication

    <One paragraph: given the verdict, what must Phase 37 do? E.g., "Verdict NOT-IDEMPOTENT — Phase 37's wipe MUST run BEFORE install.sh; we cannot rely on install.sh to clean its own previous state. The wipe step's `rm -rf /opt/livos` is therefore non-optional." OR "Verdict IDEMPOTENT — Phase 37 may safely re-run install.sh without prior wipe, but wipe is still required for `preserveApiKey: false` semantic correctness.">
    ```

    Write the populated section, leaving Provenance / Raw Fetch / Argument Surface (now populated by Task 1) / and remaining stubs untouched.
  </action>
  <verify>
    <automated>grep -E "^\*\*Verdict:\*\* \`(IDEMPOTENT|PARTIALLY-IDEMPOTENT|NOT-IDEMPOTENT)\`" ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md"</automated>
  </verify>
  <acceptance_criteria>
    - Section "## Idempotency Verdict" no longer contains the stub `*Populated by Plan 02.*`.
    - Either: contains a halt block, OR contains a `**Verdict:**` line whose value is exactly one of `IDEMPOTENT`, `PARTIALLY-IDEMPOTENT`, `NOT-IDEMPOTENT` (regex-checkable per the verify command).
    - Side-effecting command table has at least one row with a `line:N` reference (verified `grep -c "line:[0-9]\+" AUDIT-FINDINGS.md` strictly greater than count after Task 1).
    - Every classification cell uses one of the four exact labels: `IDEMPOTENT_NATIVE`, `IDEMPOTENT_WITH_GUARD`, `NOT_IDEMPOTENT`, `UNKNOWN_NEEDS_VERIFICATION`.
    - Roll-up counts sum to the total command rows in the table (numerical consistency).
    - Phase 37 implication paragraph is non-empty and does NOT contain "TBD" or "needs further investigation".
    - Verdict is decisive (per CONTEXT.md "Specific Ideas" — every open question must resolve into a chosen path).
  </acceptance_criteria>
  <done>
    Idempotency Verdict section populated with classification table, roll-up counts, failure-mode narrative, and one-paragraph Phase 37 implication. Verdict is one of the three legal values.
  </done>
</task>

<task type="auto">
  <name>Task 3: Audit API key transport — name the mechanism, flag any leaks</name>
  <files>
    .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md
  </files>
  <read_first>
    .planning/phases/36-install-sh-audit/36-CONTEXT.md
    .planning/phases/36-install-sh-audit/install.sh.snapshot
    .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md
  </read_first>
  <action>
    HALT GUARD: Same pattern. If Provenance reports `Source provenance: unavailable`, write a halt block under `## API Key Transport` and exit.

    NORMAL PATH:

    Cross-reference findings from Task 1's Argument Surface. Specifically per CONTEXT.md D-08, determine:

    1. Where install.sh consumes the API key. Possible locations (grep the snapshot):
       - Positional `$1` / `${1:-}` after script entry — implies argv-only
       - Flag `--api-key <key>` or `--api-key=<key>` — implies argv (still leaks via `ps`)
       - Flag `--api-key-file <path>` — reads from file (safe)
       - `read -r API_KEY` or `read -s API_KEY` — implies stdin (safe)
       - `${LIV_API_KEY}` / `${API_KEY}` / `${LIVOS_API_KEY}` env var read — implies env-var (mostly safe but visible via `/proc/PID/environ`)

    2. Where install.sh USES the API key after capturing it. Specifically grep for:
       - `echo "...${API_KEY}..."` — leaks to stdout / journal
       - `echo "Using key $API_KEY"` — explicit log leak
       - `curl ... -H "Authorization: Bearer ${API_KEY}"` — necessary use; not a leak unless paired with `set -x` upstream
       - `set -x` followed by API_KEY use — would leak via xtrace
       - Writing to a log file: `>> /var/log/...` near API_KEY — potential persistent leak
       - Passing to a sub-process via argv: `node script.js "$API_KEY"` — leaks via ps in the child process even if install.sh hides it

    3. Whether the chosen transport conforms to FR-AUDIT-04 ("via stdin or `--api-key-file <path>` flag — NOT via argv (visible in `ps`)"):
       - PASS if transport is `stdin`, `--api-key-file`, or `env-var` AND no log leaks found
       - FAIL if transport is `argv` only OR a log leak was found
       - On FAIL → record explicitly that Plan 03 must produce a wrapper proposal (per CONTEXT.md D-08: `livos-install-wrap.sh` reads from a file, sets env var, execs install.sh)

    Replace the `## API Key Transport` stub with this exact structure:
    ```
    ## API Key Transport

    Method per CONTEXT.md D-08: read install.sh for `$1` / `${API_KEY}` consumption + grep for log leaks.

    ### Transport mechanism

    **Primary transport:** `argv` | `stdin` | `--api-key-file` | `env-var` | `none`

    **Evidence:**
    - line:NN — `<excerpt>` — <one-sentence interpretation>
    - line:NN — `<excerpt>` — <one-sentence interpretation>

    ### Leak surface

    | Risk | Found at line:N | Severity | Notes |
    |------|-----------------|----------|-------|
    | argv exposure (visible to `ps`) | <line or "n/a"> | <high|medium|low|none> | <reason> |
    | echo / log statement leaking key | <line or "n/a"> | <severity> | <reason> |
    | set -x + API_KEY in scope | <line or "n/a"> | <severity> | <reason> |
    | sub-process argv pass-through | <line or "n/a"> | <severity> | <reason> |
    | env in `/proc/PID/environ` | <line or "n/a"> | <severity> | <reason> |

    ### FR-AUDIT-04 compliance

    **Verdict:** PASS | FAIL

    **Reasoning:** <one paragraph naming the transport and citing the leak-surface findings. If FAIL, explicitly write: "Plan 03 must produce a wrapper proposal per D-08.">

    ### Phase 37 invocation hint

    <One literal bash command that Phase 37 should use. E.g.,>
    - If PASS with `--api-key-file`: `bash /opt/livos/data/cache/install.sh.cached --api-key-file /tmp/livos-reset-apikey`
    - If PASS with stdin: `cat /tmp/livos-reset-apikey | bash /opt/livos/data/cache/install.sh.cached`
    - If FAIL (argv-only): `bash livos-install-wrap.sh --api-key-file /tmp/livos-reset-apikey` (wrapper to be spec'd in Plan 03's Hardening Proposals)
    ```

    Write the populated section, leaving the rest of the document unchanged. Do NOT modify the Hardening Proposals stub yet — that is Plan 03's deliverable. This task only flags whether Plan 03 owes a wrapper.
  </action>
  <verify>
    <automated>grep -E "^\*\*Primary transport:\*\* \`(argv|stdin|--api-key-file|env-var|none)\`" ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md" &amp;&amp; grep -E "^\*\*Verdict:\*\* (PASS|FAIL)" ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md"</automated>
  </verify>
  <acceptance_criteria>
    - Section "## API Key Transport" no longer contains the stub `*Populated by Plan 02.*`.
    - Either: contains a halt block, OR contains a `**Primary transport:**` line whose value is exactly one of `argv`, `stdin`, `--api-key-file`, `env-var`, `none`.
    - Contains a `**Verdict:**` line under "FR-AUDIT-04 compliance" valued exactly `PASS` or `FAIL`.
    - Leak surface table has 5 rows (argv exposure, echo/log, set -x, sub-process pass-through, env-in-proc) — every row has a value (not blank).
    - "Phase 37 invocation hint" is a literal bash command, not "TBD".
    - Total `^## ` heading count in the document is still 9 (unchanged structure).
    - If verdict is FAIL, the reasoning paragraph contains the literal phrase "Plan 03 must produce a wrapper proposal" (verifiable by grep).
  </acceptance_criteria>
  <done>
    API Key Transport section populated, primary transport named, leak surface table filled, FR-AUDIT-04 verdict rendered as PASS or FAIL, Phase 37 invocation hint provided as literal bash, Plan 03 owe-list updated if applicable.
  </done>
</task>

</tasks>

<verification>
End-of-plan checks:
- `## Argument Surface`, `## Idempotency Verdict`, `## API Key Transport` no longer contain `*Populated by Plan 02.*` stub text.
- Idempotency verdict matches `IDEMPOTENT|PARTIALLY-IDEMPOTENT|NOT-IDEMPOTENT`.
- API key transport named one of `argv|stdin|--api-key-file|env-var|none`.
- FR-AUDIT-04 verdict is `PASS` or `FAIL`.
- All findings cite `line:N` references back into `install.sh.snapshot`.
- AUDIT-FINDINGS.md still has 9 `^## ` headings (no structural drift).
- No file outside `.planning/phases/36-install-sh-audit/` was modified.
- install.sh was NOT executed at any point — verified by absence of `bash install.sh.snapshot`, `sh install.sh.snapshot`, `| bash` in the action stream.
</verification>

<success_criteria>
1. Argument Surface table maps every flag, env var, stdin path with line:N — FR-AUDIT-01 content audit complete.
2. Idempotency Verdict is decisive (one of three legal values) with command-by-command classification — FR-AUDIT-02 satisfied.
3. API Key Transport names the exact mechanism + flags any leak surface — FR-AUDIT-04 satisfied.
4. If install.sh is argv-only or leaks the key, Plan 03 is explicitly tasked with producing a wrapper proposal.
5. Phase 37 invocation hint is a concrete bash command (no "TBD").
6. No source-code edits, no live execution.
</success_criteria>

<output>
After completion, create `.planning/phases/36-install-sh-audit/36-02-SUMMARY.md` documenting:
- Idempotency verdict
- API key transport name + FR-AUDIT-04 PASS/FAIL
- Total flags / env vars / side-effecting commands counted
- Whether Plan 03 must produce a wrapper proposal
</output>
</content>
</invoke>