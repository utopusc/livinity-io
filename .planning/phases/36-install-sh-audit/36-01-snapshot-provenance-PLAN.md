---
phase: 36-install-sh-audit
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/36-install-sh-audit/install.sh.snapshot
  - .planning/phases/36-install-sh-audit/install.sh.headers.txt
  - .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md
autonomous: true
requirements:
  - FR-AUDIT-01
  - FR-AUDIT-05
must_haves:
  truths:
    - "A frozen byte-exact copy of livinity.io/install.sh exists on disk so the audit is reproducible against drift"
    - "HTTP response headers (Last-Modified, ETag, content-length, server) are captured so the audited version is identifiable"
    - "AUDIT-FINDINGS.md exists with a Provenance section recording the fetch URL, timestamp, headers, and SHA-256 of the snapshot"
    - "If the live URL is unreachable (Server5 down at audit time), the failure is captured as an FR-AUDIT-05 Tier-1 finding and the cached fallback on Mini PC is read read-only"
    - "cache-absence is the expected v29.2-time state and is recorded as such, not as a defect."
    - "All 9 mandatory AUDIT-FINDINGS.md section headings are stubbed by Plan 01 so Plans 02 and 03 only populate content (no restructure)."
  artifacts:
    - path: ".planning/phases/36-install-sh-audit/install.sh.snapshot"
      provides: "Byte-exact frozen copy of install.sh used as input for Plans 02 and 03"
      min_lines: 1
    - path: ".planning/phases/36-install-sh-audit/install.sh.headers.txt"
      provides: "HTTP headers from curl -sI for provenance"
      min_lines: 1
    - path: ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md"
      provides: "Audit findings document — initial scaffold with Provenance section populated and remaining sections stubbed"
      contains: "## Provenance"
  key_links:
    - from: ".planning/phases/36-install-sh-audit/install.sh.snapshot"
      to: ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md"
      via: "SHA-256 hash referenced in Provenance section"
      pattern: "SHA-?256"
    - from: ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md"
      to: ".planning/phases/36-install-sh-audit/install.sh.headers.txt"
      via: "Provenance section quotes Last-Modified / ETag from headers file"
      pattern: "Last-Modified|ETag"
---

<objective>
Fetch `https://livinity.io/install.sh`, freeze a byte-exact snapshot, capture HTTP headers for provenance, and create the AUDIT-FINDINGS.md scaffold with the Provenance section populated. This plan is the input gate for Plans 02 and 03 — without a snapshot on disk, no static analysis can proceed.

Purpose: Make the audit reproducible. Even if livinity.io drifts later, Plans 02/03 read a frozen file. Per CONTEXT.md D-03 / D-04, snapshot + headers are mandatory.

Output:
- `.planning/phases/36-install-sh-audit/install.sh.snapshot` (byte-exact, non-zero size, OR explicit Tier-1 failure record)
- `.planning/phases/36-install-sh-audit/install.sh.headers.txt`
- `.planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md` with Provenance section + stub headings for the other six mandatory sections per D-02
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/36-install-sh-audit/36-CONTEXT.md

<interfaces>
<!-- This plan produces the inputs that Plans 02 and 03 consume. Their contracts: -->

AUDIT-FINDINGS.md skeleton sections (per CONTEXT.md D-02 — all seven mandatory):
1. ## Provenance                       — populated by Plan 01 (this plan)
2. ## Raw Fetch                        — populated by Plan 01 (this plan)
3. ## Argument Surface                 — populated by Plan 02
4. ## Idempotency Verdict              — populated by Plan 02
5. ## API Key Transport                — populated by Plan 02
6. ## Recovery Model                   — populated by Plan 03
7. ## Server5 Dependency Analysis      — populated by Plan 03
8. ## Hardening Proposals              — populated by Plan 03 (only if gaps found)
9. ## Phase 37 Readiness               — populated by Plan 03 (final gate per D-10)

Plan 01 must scaffold ALL of these as stub headings so subsequent plans only fill in content under existing headings rather than restructuring the doc.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fetch install.sh, capture headers, write snapshot + headers file</name>
  <files>
    .planning/phases/36-install-sh-audit/install.sh.snapshot
    .planning/phases/36-install-sh-audit/install.sh.headers.txt
  </files>
  <read_first>
    .planning/phases/36-install-sh-audit/36-CONTEXT.md
  </read_first>
  <action>
    Per D-03 and D-04, fetch the install.sh content and headers from a workstation (NOT from inside Mini PC).

    Step 1 — Capture headers first (cheap, also tells us if Server5 is reachable):
    ```
    curl -sSI -L https://livinity.io/install.sh -o "C:/Users/hello/Desktop/Projects/contabo/livinity-io/.planning/phases/36-install-sh-audit/install.sh.headers.txt" -w "HTTP_CODE=%{http_code}\nFINAL_URL=%{url_effective}\n"
    ```
    Append the `HTTP_CODE=` and `FINAL_URL=` lines to the bottom of `install.sh.headers.txt` after the headers block (so the file is self-describing).

    Step 2 — Branch on HTTP status:
    - If HTTP_CODE is 2xx: download the body to the snapshot path:
      ```
      curl -sSL https://livinity.io/install.sh -o "C:/Users/hello/Desktop/Projects/contabo/livinity-io/.planning/phases/36-install-sh-audit/install.sh.snapshot"
      ```
      Verify file is non-zero and looks like a shell script (first line should start with `#!` or contain `bash`/`sh`):
      ```
      head -1 "C:/Users/hello/Desktop/Projects/contabo/livinity-io/.planning/phases/36-install-sh-audit/install.sh.snapshot"
      ```
      Compute SHA-256 (PowerShell on Windows): `Get-FileHash -Algorithm SHA256 ".planning/phases/36-install-sh-audit/install.sh.snapshot"`. Save the hash hex string for use in Task 2's Provenance section.

    - If HTTP_CODE is non-2xx (Server5 down at audit time per CONTEXT.md "Specific Ideas" line ~121):
      Mark this as an FR-AUDIT-05 Tier-1 finding (Task 2 will record it).
      Attempt cached fallback by SSH'ing to Mini PC read-only and copying any cached install.sh:
      ```
      "/c/Windows/System32/OpenSSH/ssh.exe" -i "C:/Users/hello/Desktop/Projects/contabo/pem/minipc" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68 "test -f /opt/livos/data/cache/install.sh.cached && cat /opt/livos/data/cache/install.sh.cached" > "C:/Users/hello/Desktop/Projects/contabo/livinity-io/.planning/phases/36-install-sh-audit/install.sh.snapshot"
      ```
      If cache exists and snapshot is non-empty, proceed to compute SHA-256. Append a comment line to the TOP of `install.sh.headers.txt` reading: `# SOURCE=cached-on-minipc (live URL returned HTTP_CODE=<code>)`.
      If neither live nor cached version available, leave the snapshot file empty and append `# SOURCE=unavailable HTTP_CODE=<code> CACHE=missing` to the headers file. Task 2 will record this as an irrecoverable Tier-1 audit failure (it will still create AUDIT-FINDINGS.md but the document will explicitly state the audit cannot complete without a re-fetch).

    Per D-11: Do NOT execute install.sh. Do NOT pipe the snapshot to bash. Do NOT run it on Mini PC. We only fetch and store bytes — even verifying the cached version's existence is a read-only `cat` over SSH.

    Per D-13: If anything in the SSH path or environment hints at Server4 (45.137.194.103), ABORT — this audit does not touch Server4. Use only Mini PC (10.69.31.68) for cache fallback.
  </action>
  <verify>
    <automated>test -f ".planning/phases/36-install-sh-audit/install.sh.headers.txt" &amp;&amp; grep -E "^HTTP_CODE=" ".planning/phases/36-install-sh-audit/install.sh.headers.txt"</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/phases/36-install-sh-audit/install.sh.headers.txt` exists and contains an `HTTP_CODE=` line.
    - File `.planning/phases/36-install-sh-audit/install.sh.snapshot` exists. It is either non-zero (live fetch or cache fallback succeeded) OR zero with `# SOURCE=unavailable` recorded in headers file (irrecoverable case — Plan 01 still completes; downstream plans then halt with a clear failure record in AUDIT-FINDINGS.md).
    - When snapshot is non-empty, `head -1 install.sh.snapshot` returns a shebang line or visible bash syntax (not HTML — i.e., the fetch did not silently grab a Cloudflare error page).
    - SHA-256 of the snapshot is computed and recorded for Task 2's use (recorded inline in headers file as `# SHA256=<hex>` if non-empty).
    - No SSH or curl invocation references Server4 anywhere.
    - `install.sh` was not executed on any host — verified by absence of any `bash install.sh` / `sh install.sh` / `| bash` in the action's command stream.
    - AUDIT-FINDINGS.md "## Provenance" section explicitly notes whether cache fallback was used. If `CACHE=missing` (the expected v29.2-time state), the section records this as "expected — cache populated by future Phase 37 update.sh per D-09" and links forward to "## Server5 Dependency Analysis" (which Plan 03 fills in).
  </acceptance_criteria>
  <done>
    Snapshot file written (or explicit-failure-state recorded in headers), headers file written with HTTP_CODE present, SHA-256 hash captured for Provenance section.
  </done>
</task>

<task type="auto">
  <name>Task 2: Scaffold AUDIT-FINDINGS.md with Provenance section + stub headings for all D-02 sections</name>
  <files>
    .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md
  </files>
  <read_first>
    .planning/phases/36-install-sh-audit/36-CONTEXT.md
    .planning/phases/36-install-sh-audit/install.sh.headers.txt
    .planning/phases/36-install-sh-audit/install.sh.snapshot
  </read_first>
  <action>
    Create `.planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md` with the following EXACT structure. Headings are mandatory per D-02; Plans 02 and 03 will fill content under these headings.

    Top of file (frontmatter + intro):
    ```
    # install.sh Audit Findings — Phase 36

    **Phase:** 36-install-sh-audit
    **Milestone:** v29.2 Factory Reset
    **Audit method:** Static analysis + curl fetch (read-only). No live execution per CONTEXT.md D-11.
    **Audit date:** <today's date in YYYY-MM-DD>
    **Snapshot:** `.planning/phases/36-install-sh-audit/install.sh.snapshot`
    **Primary consumer:** Phase 37 backend planner (per D-10)

    > This document MUST be self-contained. Phase 37 should not need to consult external sources to design wipe + reinstall.
    ```

    Section 1 — Provenance (POPULATE NOW):
    ```
    ## Provenance

    | Field | Value |
    |-------|-------|
    | Fetch URL | https://livinity.io/install.sh |
    | Fetch timestamp (UTC) | <ISO 8601> |
    | HTTP status | <HTTP_CODE from headers file> |
    | Final URL after redirects | <FINAL_URL from headers file> |
    | Last-Modified | <header value, or "absent"> |
    | ETag | <header value, or "absent"> |
    | Content-Length | <header value, or "absent"> |
    | Server | <header value, or "absent"> |
    | Snapshot SHA-256 | <hex from Task 1, or "n/a — fetch failed"> |
    | Snapshot byte size | <bytes, or 0 if fetch failed> |
    | Source provenance | live | cached-on-minipc | unavailable |

    **Routing topology context:** livinity.io is DNS-only via Cloudflare; traffic resolves to Server5 (45.137.194.102) which relays to the LivOS deployment. Server5 sits between Cloudflare and the install.sh origin. If Server5 is offline, the live URL fails and we must fall back to a cached copy on Mini PC. Cloudflare is NOT a tunnel — `cloudflared` is not in this stack.

    **Server4 is NOT referenced anywhere in this audit per project memory hard rule (2026-04-27).**
    ```

    If the live fetch failed AND no cache was available (snapshot file size 0), append a Tier-1 failure block immediately after the table:
    ```
    ### Tier-1 finding: install.sh unavailable at audit time

    HTTP_CODE was <code>. No cached copy on Mini PC at `/opt/livos/data/cache/install.sh.cached`. The audit cannot proceed past this point until install.sh is reachable. Plans 02 and 03 must halt; their tasks should fail-loud rather than fabricate findings.

    **Required before Phase 37 plans:** re-fetch install.sh and re-run Plan 01.
    ```

    Section 2 — Raw Fetch (POPULATE NOW):
    ```
    ## Raw Fetch

    The fetched script is preserved verbatim at `install.sh.snapshot` (sibling file in this phase directory). It is referenced rather than embedded inline because <if file is small (under ~200 lines), embed verbatim here in a fenced bash code block; otherwise reference + cite line ranges from Plans 02 and 03>.
    ```

    Determine "small enough to embed" by reading `install.sh.snapshot` line count. If `wc -l < 200`, embed the full content in a ```bash fenced block. Otherwise leave the reference-only paragraph above.

    Sections 3-9 — STUB HEADINGS ONLY (Plans 02 and 03 will populate):
    ```
    ## Argument Surface

    *Populated by Plan 02.*

    ## Idempotency Verdict

    *Populated by Plan 02. Final verdict will be one of: `IDEMPOTENT`, `PARTIALLY-IDEMPOTENT`, `NOT-IDEMPOTENT` (per D-06).*

    ## API Key Transport

    *Populated by Plan 02. Will name a specific transport: `argv | stdin | --api-key-file | env-var` (per D-08).*

    ## Recovery Model

    *Populated by Plan 03. Will document either install.sh's native `--resume` or the pre-wipe-snapshot fallback per D-07.*

    ## Server5 Dependency Analysis

    *Populated by Plan 03. Will document Cloudflare-DNS → Server5-relay → install.sh-origin chain and fallback options per D-09.*

    ## Hardening Proposals

    *Populated by Plan 03 (only if static analysis surfaces gaps; otherwise this section will state "No hardening required — install.sh meets v29.2 requirements as-is").*

    ## Phase 37 Readiness

    *Final gate per D-10. Plan 03 will populate four answers (reinstall command, recovery action, idempotency yes/no, API key transport) so Phase 37's backend planner can proceed without re-running this audit.*
    ```

    Write the file with the Provenance and Raw Fetch sections fully populated and Sections 3-9 as stubs. Do NOT make up content for Plans 02/03 sections — they read the snapshot directly and fill these in themselves.
  </action>
  <verify>
    <automated>test -f ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md" &amp;&amp; grep -c "^## " ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md"</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md` exists.
    - Grep `^## ` returns exactly 9 lines (Provenance, Raw Fetch, Argument Surface, Idempotency Verdict, API Key Transport, Recovery Model, Server5 Dependency Analysis, Hardening Proposals, Phase 37 Readiness).
    - Provenance section contains the verbatim string `https://livinity.io/install.sh` AND a Snapshot SHA-256 row AND an HTTP status row.
    - Raw Fetch section either embeds the snapshot inline (if under 200 lines) OR references `install.sh.snapshot`.
    - Plan 01's contribution to AUDIT-FINDINGS.md ("## Scope" section) contains exactly one "Server4" mention and it is the off-limits disclaimer. Verify with: `grep -n "Server4" AUDIT-FINDINGS.md | wc -l == 1` BEFORE Plan 02 runs.
    - Document contains the literal phrase "cloudflared" zero times — `grep -c "cloudflared" AUDIT-FINDINGS.md` returns 0.
    - Stub sections (3-9) each contain the literal text "*Populated by Plan" so downstream plans know they are unfilled.
    - If snapshot was unavailable, the Tier-1 failure block is present (grep "Tier-1 finding: install.sh unavailable" returns 1).
  </acceptance_criteria>
  <done>
    AUDIT-FINDINGS.md scaffold exists with all 9 mandatory sections (2 populated, 7 stubbed), Provenance fully cites snapshot SHA-256 and headers, Server4 disclaimer present, no live execution traces, ready for Plan 02 to fill in static-analysis sections.
  </done>
</task>

</tasks>

<verification>
At end of Plan 01:
- `install.sh.snapshot` exists in phase directory.
- `install.sh.headers.txt` exists with HTTP_CODE recorded.
- `AUDIT-FINDINGS.md` exists with Provenance + Raw Fetch populated and 7 stub sections.
- All three files are inside `.planning/phases/36-install-sh-audit/` only — zero touches to `livos/` or `nexus/` source trees.
- No invocation referenced Server4.
- No invocation executed install.sh.

Manual cross-check (no blocking checkpoint, since this is `autonomous: true`):
```
ls .planning/phases/36-install-sh-audit/
# Expected: 36-CONTEXT.md, install.sh.snapshot, install.sh.headers.txt, AUDIT-FINDINGS.md
grep -c "^## " .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md
# Expected: 9
```
</verification>

<success_criteria>
1. Snapshot file written with non-zero size (or explicit unavailable-state recorded) — FR-AUDIT-01 evidence base established.
2. Headers file captures HTTP status, Last-Modified/ETag, redirect chain.
3. AUDIT-FINDINGS.md scaffold has all 9 D-02-mandated headings.
4. Provenance section answers "which exact bytes did we audit?" with a SHA-256.
5. If Server5 was unreachable, that fact is recorded as a Tier-1 finding inline (FR-AUDIT-05 partial coverage; Plan 03 expands the analysis).
6. No source-code modifications. No live execution of install.sh.
</success_criteria>

<output>
After completion, create `.planning/phases/36-install-sh-audit/36-01-SUMMARY.md` documenting:
- Snapshot byte size + SHA-256 (or unavailable status)
- HTTP_CODE + Last-Modified observed
- Whether the live URL or the cached fallback was used
- Total file count in phase directory after this plan
</output>
</content>
</invoke>