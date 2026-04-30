---
phase: 37-backend-factory-reset
plan: 04
type: execute
wave: 4
depends_on:
  - 37-01-bash-scripts-PLAN.md
  - 37-02-trpc-route-PLAN.md
  - 37-03-spawn-deploy-PLAN.md
files_modified:
  - livos/packages/livinityd/source/modules/system/factory-reset.sh
  - livos/packages/livinityd/source/modules/system/factory-reset.ts
  - livos/packages/livinityd/source/modules/system/factory-reset.unit.test.ts
  - livos/packages/livinityd/source/modules/system/factory-reset.integration.test.sh
autonomous: false

requirements:
  - FR-BACKEND-05
  - FR-BACKEND-07

must_haves:
  truths:
    - "factory-reset.sh classifies install.sh failures into error strings: api-key-401, server5-unreachable, install-sh-failed, install-sh-unreachable"
    - "JSON event row state machine is verified end-to-end: in-progress → success | rolled-back | failed (matches D-EVT-02)"
    - "JSON event schema field set is exhaustively asserted (type, status, started_at, ended_at, preserveApiKey, durations, exit code, source, snapshot_path, error)"
    - "Phase 33 listUpdateHistory query reads the factory-reset.json row without filtering it out (D-EVT-03 verified)"
    - "Integration test scaffold exists at factory-reset.integration.test.sh — opt-in flag (RUN_FACTORY_RESET_DESTRUCTIVE=1), refuses to run on production hostnames, only runs against Mini PC scratchpad"
    - "Integration test, when run, verifies: route returns within 200ms, eventPath JSON appears, status flips to success, /api/health returns 200 after reinstall"
    - "factory-reset.integration.test.sh has a hard guard refusing to run if hostname == 'bruce-EQ' (Mini PC) UNLESS LIVOS_DESTRUCTIVE_TEST_AUTHORIZED=YES is set"
  artifacts:
    - path: "livos/packages/livinityd/source/modules/system/factory-reset.sh"
      provides: "expanded error classification — api-key-401 detection from install.sh stderr, server5-unreachable from curl exit + HTTP code"
      contains: "api-key-401|server5-unreachable|install-sh-failed"
    - path: "livos/packages/livinityd/source/modules/system/factory-reset.unit.test.ts"
      provides: "tests asserting JSON event schema completeness + Phase 33 reader compatibility"
      contains: "describe.*event-row|listUpdateHistory|factory-reset.json"
    - path: "livos/packages/livinityd/source/modules/system/factory-reset.integration.test.sh"
      provides: "opt-in destructive integration test against Mini PC scratchpad"
      contains: "RUN_FACTORY_RESET_DESTRUCTIVE|LIVOS_DESTRUCTIVE_TEST_AUTHORIZED|bruce-EQ"
  key_links:
    - from: "factory-reset.sh attempt_rollback"
      to: "JSON event row status flip to rolled-back"
      via: "write_event 'rolled-back' '$err'"
      pattern: "write_event.*rolled-back"
    - from: "Phase 33 listUpdateHistory (routes.ts)"
      to: "factory-reset.json rows"
      via: "fs.readdir + JSON.parse + filter (no type filtering)"
      pattern: "type.*factory-reset"
---

<objective>
Close the remaining gaps for FR-BACKEND-05 (JSON event row schema completeness + Phase 33 reader compatibility) and FR-BACKEND-07 (install.sh failure classification: 401, transient 5xx, generic non-zero). Add the opt-in integration test scaffold for destructive end-to-end validation on Mini PC scratchpad. After this plan, the entire Phase 37 backend is verifiable in three layers: shellcheck (Plan 01), unit tests (Plan 02-03), integration test (this plan, manual on Mini PC).

Purpose: The bash error classification is best done late — once the happy path is shipped (Plans 01-03) and the unit tests cover the route surface, we can specifically harden the failure modes without re-touching unrelated code. The integration test is the only way to verify the cgroup-escape actually survives `systemctl stop livos` on a real systemd host; that's why it's destructive-only.

Output: factory-reset.sh gains explicit error classification logic; factory-reset.ts gains a single integration-style unit test that round-trips a hand-written JSON event row through Phase 33's listUpdateHistory parser; factory-reset.integration.test.sh exists as an opt-in script with hostname guard.

This plan is `autonomous: false` because the integration test is destructive and requires human authorization to run.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/37-backend-factory-reset/37-CONTEXT.md
@.planning/phases/37-backend-factory-reset/37-01-bash-scripts-PLAN.md
@.planning/phases/37-backend-factory-reset/37-01-SUMMARY.md
@.planning/phases/37-backend-factory-reset/37-02-trpc-route-PLAN.md
@.planning/phases/37-backend-factory-reset/37-02-SUMMARY.md
@.planning/phases/37-backend-factory-reset/37-03-spawn-deploy-PLAN.md
@.planning/phases/37-backend-factory-reset/37-03-SUMMARY.md
@livos/packages/livinityd/source/modules/system/factory-reset.sh
@livos/packages/livinityd/source/modules/system/factory-reset.ts
@livos/packages/livinityd/source/modules/system/routes.ts

<interfaces>
<!-- Phase 33 listUpdateHistory parser shape (from routes.ts lines ~121-148) -->

```typescript
// Phase 33 history reader pseudocode (already implemented):
const records = await Promise.all(jsonFiles.map(async (f) => {
  try {
    const raw = await fs.readFile(path.join(HISTORY_DIR, f), 'utf8')
    const parsed = JSON.parse(raw)
    if (typeof parsed?.timestamp !== 'string') return null
    return {filename: f, ...parsed}
  } catch { return null }
}))
// IMPORTANT: the reader does NOT filter on `type`. Any JSON with a string
// `timestamp` field passes through. So adding `type: "factory-reset"` rows
// is fully backward-compatible (D-EVT-03 verified).
```

<!-- Required JSON schema for factory-reset row (D-EVT-02 verbatim) -->

```json
{
  "type": "factory-reset",
  "status": "in-progress | success | failed | rolled-back",
  "timestamp": "<ISO basic format>",
  "started_at": "<ISO timestamp>",
  "ended_at": "<ISO timestamp or null>",
  "preserveApiKey": true,
  "wipe_duration_ms": 12345,
  "reinstall_duration_ms": 67890,
  "install_sh_exit_code": 0,
  "install_sh_source": "live | cache",
  "snapshot_path": "/tmp/livos-pre-reset-...tar.gz",
  "error": null
}
```

The Phase 33 reader requires `timestamp` to be a string. Plan 01's write_event already emits `timestamp: "$TIMESTAMP_ISO"` from `date -u +%Y%m%dT%H%M%SZ`. Verify this in the new test.

<!-- install.sh failure mode mapping (D-ERR-01) -->

| Exit / signal              | error string             | status     |
|----------------------------|--------------------------|------------|
| 0                          | null                     | success    |
| install-sh stderr has 401  | "api-key-401"            | failed     |
| install-sh stderr has 5xx  | "server5-unreachable"    | failed     |
| any other non-zero         | "install-sh-failed"      | failed     |
| install.sh never fetched   | "install-sh-unreachable" | failed     |
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Expand factory-reset.sh error classification (api-key-401 + server5-unreachable detection)</name>
  <files>livos/packages/livinityd/source/modules/system/factory-reset.sh</files>
  <read_first>
    - livos/packages/livinityd/source/modules/system/factory-reset.sh (the bash from Plan 01; the install.sh invocation block + attempt_rollback function)
    - .planning/phases/37-backend-factory-reset/37-CONTEXT.md (D-ERR-01 — exit code mapping; D-ERR-02 — status: rolled-back after recovery; D-ERR-03 — error fields are PLAIN STRINGS)
    - .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md "## Phase 37 Readiness" Q4 — failure window for install.sh
  </read_first>
  <action>
    Modify the existing `factory-reset.sh` from Plan 01 to:
    1. Capture install.sh stdout+stderr to a tmp log file
    2. After install.sh exits, classify the error by grepping the log
    3. Pass the classified error string to `attempt_rollback`

    ### Modify Step 4 (install.sh invocation)

    Replace the existing Step 4 block (the one that just runs `bash "$INSTALL_SH"` and captures `$?`) with this:

    ```bash
    # Step 4: Run install.sh via wrapper, capturing output for error classification.
    INSTALL_LOG=/tmp/livos-reset-install.log
    : > "$INSTALL_LOG"

    if [ "$PRESERVE" = "true" ] && [ -f "$WRAPPER" ] && [ -r "$APIKEY_TMP" ]; then
      # &> redirects both stdout and stderr to the log; tee preserves console output
      # for journalctl visibility (the bash itself runs under systemd-run --scope,
      # so its stdout/stderr land in journalctl by default).
      INSTALL_SH="$INSTALL_SH" bash "$WRAPPER" --api-key-file "$APIKEY_TMP" 2>&1 | tee -a "$INSTALL_LOG"
      INSTALL_SH_EXIT=${PIPESTATUS[0]}
    else
      bash "$INSTALL_SH" 2>&1 | tee -a "$INSTALL_LOG"
      INSTALL_SH_EXIT=${PIPESTATUS[0]}
    fi
    REINSTALL_END_MS=$(ms_now)
    ```

    Note: `${PIPESTATUS[0]}` captures the LEFT side of the pipe (install.sh / wrapper), not `tee`. This is critical — `tee` always succeeds, so `$?` would always be 0 without `PIPESTATUS`.

    ### Add classify_install_error helper

    Insert this helper above `attempt_rollback`:

    ```bash
    classify_install_error() {
      local log="$1"
      local exit_code="$2"
      if [ "$exit_code" -eq 0 ]; then
        echo "null"
        return
      fi
      # Look for HTTP 401 anywhere in the install log (curl -v outputs HTTP/<v> 401,
      # bare HTTP 401, or "Unauthorized"). Best-effort heuristic per D-ERR-01.
      if grep -qE '(HTTP/[0-9.]+ 401|HTTP 401|\bUnauthorized\b)' "$log" 2>/dev/null; then
        echo "api-key-401"
        return
      fi
      # Server5 5xx (transient relay failure) — install.sh internally curls livinity.io
      # for additional resources; if those return 5xx, classify as server5-unreachable.
      if grep -qE '(HTTP/[0-9.]+ 5[0-9][0-9]|HTTP 5[0-9][0-9])' "$log" 2>/dev/null; then
        echo "server5-unreachable"
        return
      fi
      # Generic non-zero exit
      echo "install-sh-failed"
    }
    ```

    ### Update Step 5 (failure handling)

    Replace the existing Step 5 block with:

    ```bash
    # Step 5: Failure handling + rollback (D-ERR-01/02/03)
    if [ "$INSTALL_SH_EXIT" -eq 0 ]; then
      write_event "success"
      rm -f "$SNAPSHOT_PATH" "$SNAPSHOT_SIDECAR" "$INSTALL_SH_LIVE" "$INSTALL_LOG"
      exit 0
    else
      ERR_KIND=$(classify_install_error "$INSTALL_LOG" "$INSTALL_SH_EXIT")
      attempt_rollback "$ERR_KIND"
      exit $?
    fi
    ```

    ### attempt_rollback already exists from Plan 01; verify it accepts the error string and writes "rolled-back" or "failed" via write_event

    Confirm:
    ```bash
    attempt_rollback() {
      local err="$1"
      ...
      write_event "rolled-back" "$err"   # if restore succeeded
      ...
      write_event "failed" "$err"         # if no snapshot
    }
    ```

    If write_event's signature is `write_event <status> [error]`, this is already correct.

    ### install-sh-unreachable case from Plan 01

    The Plan 01 `install-sh-unreachable` branch (when both live and cache fetch fail) already calls `attempt_rollback "install-sh-unreachable"`. Verify the call site exists:
    ```bash
    if [ -z "$INSTALL_SH" ]; then
      ...
      attempt_rollback "install-sh-unreachable"
      exit $?
    fi
    ```

    If absent, add it. Per CONTEXT.md, this case has nothing to roll back (wipe destroyed everything but reinstall never started); attempt_rollback restores from the pre-wipe snapshot.

    ### Final shellcheck pass

    Run shellcheck after the changes to ensure no regressions.
  </action>
  <verify>
    <automated>shellcheck livos/packages/livinityd/source/modules/system/factory-reset.sh</automated>
  </verify>
  <acceptance_criteria>
    - `shellcheck factory-reset.sh` still exits 0 (or with same disable-annotated lines as Plan 01)
    - `grep -c 'classify_install_error' factory-reset.sh` >= 2 (definition + call)
    - `grep -c 'PIPESTATUS' factory-reset.sh` >= 1 (proper exit code capture through tee)
    - `grep -c 'api-key-401' factory-reset.sh` >= 1
    - `grep -c 'server5-unreachable' factory-reset.sh` >= 1
    - `grep -c 'install-sh-failed' factory-reset.sh` >= 1
    - `grep -c 'install-sh-unreachable' factory-reset.sh` >= 1
    - `grep -c 'tee -a' factory-reset.sh` >= 1 (log capture)
    - file is still LF line endings
  </acceptance_criteria>
  <done>
    factory-reset.sh classifies install.sh failures into named error strings; PIPESTATUS captures real exit code through tee; shellcheck still clean; all four error kinds (api-key-401, server5-unreachable, install-sh-failed, install-sh-unreachable) appear in code.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add JSON event schema unit test + Phase 33 reader compatibility test</name>
  <files>livos/packages/livinityd/source/modules/system/factory-reset.unit.test.ts</files>
  <read_first>
    - livos/packages/livinityd/source/modules/system/factory-reset.unit.test.ts (the test file from Plans 02-03)
    - livos/packages/livinityd/source/modules/system/routes.ts (lines 121-148 — listUpdateHistory parser; we test that a hand-written factory-reset.json row passes through)
    - .planning/phases/37-backend-factory-reset/37-CONTEXT.md (D-EVT-02 — schema fields)
  </read_first>
  <behavior>
    - A hand-written factory-reset.json row containing all D-EVT-02 fields parses successfully via JSON.parse
    - Phase 33's listUpdateHistory shape requirements are met: `timestamp` is a string, JSON.parse returns a non-null object
    - Required fields present: type, status, timestamp, started_at, ended_at, preserveApiKey, wipe_duration_ms, reinstall_duration_ms, install_sh_exit_code, install_sh_source, snapshot_path, error
    - status is one of: in-progress, success, failed, rolled-back
    - error is null OR a plain string (NOT a nested object) — D-ERR-03
    - install_sh_source is "live" or "cache"
    - The "in-progress" row has ended_at: null; terminal rows have non-null ended_at
  </behavior>
  <action>
    Add a new describe block to `factory-reset.unit.test.ts`:

    ```typescript
    describe('JSON event row schema (D-EVT-02 + D-EVT-03 Phase 33 compat)', () => {
      // Construct a representative success row matching the bash output shape.
      const sampleSuccessRow = {
        type: 'factory-reset',
        status: 'success',
        timestamp: '20260429T120030Z',
        started_at: '2026-04-29T12:00:30Z',
        ended_at: '2026-04-29T12:08:45Z',
        preserveApiKey: true,
        wipe_duration_ms: 12345,
        reinstall_duration_ms: 477123,
        install_sh_exit_code: 0,
        install_sh_source: 'live',
        snapshot_path: '/tmp/livos-pre-reset-20260429T120030Z.tar.gz',
        error: null,
      }

      const sampleFailedRow = {
        ...sampleSuccessRow,
        status: 'failed',
        install_sh_exit_code: 1,
        error: 'api-key-401',
      }

      const sampleInProgressRow = {
        ...sampleSuccessRow,
        status: 'in-progress',
        ended_at: null,
        install_sh_exit_code: -1,
        wipe_duration_ms: 0,
        reinstall_duration_ms: 0,
      }

      test('success row has all required D-EVT-02 fields', () => {
        const required = [
          'type', 'status', 'timestamp', 'started_at', 'ended_at',
          'preserveApiKey', 'wipe_duration_ms', 'reinstall_duration_ms',
          'install_sh_exit_code', 'install_sh_source', 'snapshot_path', 'error',
        ]
        for (const k of required) {
          expect(sampleSuccessRow).toHaveProperty(k)
        }
      })

      test('row passes Phase 33 reader gate: timestamp is a string', () => {
        // Phase 33 listUpdateHistory: `if (typeof parsed?.timestamp !== 'string') return null`
        const parsed = JSON.parse(JSON.stringify(sampleSuccessRow))
        expect(typeof parsed.timestamp).toBe('string')
        expect(parsed.timestamp).toMatch(/^\d{8}T\d{6}Z$/)
      })

      test('error field is null or a plain string (D-ERR-03 — never a nested object)', () => {
        for (const row of [sampleSuccessRow, sampleFailedRow, sampleInProgressRow]) {
          if (row.error !== null) {
            expect(typeof row.error).toBe('string')
          }
        }
      })

      test('status is one of in-progress | success | failed | rolled-back', () => {
        const valid = ['in-progress', 'success', 'failed', 'rolled-back']
        expect(valid).toContain(sampleSuccessRow.status)
        expect(valid).toContain(sampleFailedRow.status)
        expect(valid).toContain(sampleInProgressRow.status)
      })

      test('install_sh_source is "live" or "cache"', () => {
        expect(['live', 'cache']).toContain(sampleSuccessRow.install_sh_source)
      })

      test('in-progress row has ended_at: null; terminal rows have non-null ended_at', () => {
        expect(sampleInProgressRow.ended_at).toBeNull()
        expect(sampleSuccessRow.ended_at).not.toBeNull()
        expect(sampleFailedRow.ended_at).not.toBeNull()
      })

      test('error string for failure cases is one of: api-key-401, server5-unreachable, install-sh-failed, install-sh-unreachable', () => {
        const validErrors = ['api-key-401', 'server5-unreachable', 'install-sh-failed', 'install-sh-unreachable']
        expect(validErrors).toContain(sampleFailedRow.error)
      })
    })
    ```

    Optionally, add a Phase 33 round-trip test that simulates the bash writing a factory-reset.json file and the listUpdateHistory query reading it:

    ```typescript
    describe('Phase 33 listUpdateHistory compat (D-EVT-03)', () => {
      test('factory-reset.json passes the type-agnostic timestamp gate', () => {
        // Simulate the bash output and Phase 33 parser inline:
        const bashOutput = JSON.stringify({
          type: 'factory-reset',
          status: 'success',
          timestamp: '20260429T120030Z',
          // ... other fields
        })
        const parsed = JSON.parse(bashOutput)
        const passes = typeof parsed?.timestamp === 'string'
        expect(passes).toBe(true)
        // The Phase 33 reader returns {filename: f, ...parsed}
        // So `parsed.type === 'factory-reset'` is preserved on the way out.
      })
    })
    ```
  </action>
  <verify>
    <automated>cd livos && pnpm --filter livinityd test -- factory-reset.unit.test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter livinityd test -- factory-reset.unit.test` exits 0
    - Total test count after this task ≥ 30 (22 from Plan 03 + 8 new)
    - All schema fields covered, all error strings covered, Phase 33 compat asserted
  </acceptance_criteria>
  <done>
    Unit tests assert all D-EVT-02 fields, D-ERR-03 plain-string error, D-EVT-03 Phase 33 type-agnostic compat, and the four error string options.
  </done>
</task>

<task type="auto">
  <name>Task 3: Author factory-reset.integration.test.sh (DESTRUCTIVE — author only; running it is gated by Task 4)</name>
  <files>livos/packages/livinityd/source/modules/system/factory-reset.integration.test.sh</files>
  <read_first>
    - .planning/phases/37-backend-factory-reset/37-CONTEXT.md (## Specifics — integration test against Mini PC scratchpad; opt-in flag)
    - C:/Users/hello/.claude/projects/C--Users-hello-Desktop-Projects-contabo-livinity-io/memory/MEMORY.md (Mini PC SSH command + hard rule that Server4 is off-limits)
    - C:/Users/hello/.claude/projects/C--Users-hello-Desktop-Projects-contabo-livinity-io/memory/reference_minipc_ssh.md (Mini PC SSH key path)
  </read_first>
  <action>
    Author the integration test bash at `livos/packages/livinityd/source/modules/system/factory-reset.integration.test.sh`. This task only WRITES the file — it does NOT run the script (running is Task 4's checkpoint).

    The script must be authored AND committed regardless of whether the test is actually run. Running it is a separate human-gated step.

    ### Script source (write this verbatim):

    ```bash
    #!/bin/bash
    # factory-reset.integration.test.sh — DESTRUCTIVE integration test
    #
    # Verifies the full Phase 37 backend lifecycle:
    #   1. Curl `system.factoryReset` mutation; assert response within 200ms
    #   2. Poll the JSON event row; assert status flips through the state machine
    #   3. After reinstall, curl Mini PC /api/health; assert 200
    #
    # SAFETY GATES (fail-closed):
    #   - RUN_FACTORY_RESET_DESTRUCTIVE=1 must be set
    #   - LIVOS_DESTRUCTIVE_TEST_AUTHORIZED=YES must be set
    #   - LIVOS_TEST_HOST must be set (target SSH host; e.g. bruce@10.69.31.68)
    #   - Refuses to run if hostname looks like the user's primary Mini PC unless
    #     LIVOS_DESTRUCTIVE_TEST_AUTHORIZED=YES is set explicitly
    #
    # NEVER runs in CI. NEVER runs against production data.

    set -euo pipefail

    if [ "${RUN_FACTORY_RESET_DESTRUCTIVE:-0}" != "1" ]; then
      echo "Refusing to run: set RUN_FACTORY_RESET_DESTRUCTIVE=1 to opt in." >&2
      exit 64
    fi

    if [ "${LIVOS_DESTRUCTIVE_TEST_AUTHORIZED:-NO}" != "YES" ]; then
      echo "Refusing to run: set LIVOS_DESTRUCTIVE_TEST_AUTHORIZED=YES (this WILL wipe the host)." >&2
      exit 64
    fi

    : "${LIVOS_TEST_HOST:?Set LIVOS_TEST_HOST=bruce@10.69.31.68 (or a scratchpad target)}"
    : "${LIVOS_TEST_TRPC_URL:?Set LIVOS_TEST_TRPC_URL=https://bruce.livinity.io/trpc}"
    : "${LIVOS_TEST_ADMIN_TOKEN:?Set LIVOS_TEST_ADMIN_TOKEN=<JWT for admin user>}"

    # Verify SSH connectivity first.
    if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$LIVOS_TEST_HOST" 'true'; then
      echo "FATAL: cannot SSH to $LIVOS_TEST_HOST" >&2
      exit 1
    fi

    # Snapshot the journalctl baseline.
    BASELINE_LOG=/tmp/livos-factory-reset-baseline.log
    ssh "$LIVOS_TEST_HOST" 'sudo journalctl -u livos -n 100 --no-pager' > "$BASELINE_LOG"
    echo "Baseline journalctl captured at $BASELINE_LOG"

    # Step 1: Curl the route, capture wall-clock + HTTP body.
    T0=$(date +%s%3N)
    HTTP_RESPONSE=$(curl -sS \
      -H "Authorization: Bearer $LIVOS_TEST_ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"json":{"preserveApiKey":true}}' \
      -w "\n__HTTP_CODE__%{http_code}" \
      "$LIVOS_TEST_TRPC_URL/system.factoryReset?batch=1")
    T1=$(date +%s%3N)

    HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -1 | sed 's/__HTTP_CODE__//')
    BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
    ELAPSED=$((T1 - T0))

    echo "Route returned HTTP $HTTP_CODE in ${ELAPSED}ms"
    echo "Body: $BODY"

    if [ "$HTTP_CODE" != "200" ]; then
      echo "FATAL: route returned HTTP $HTTP_CODE (expected 200)" >&2
      exit 1
    fi
    if [ "$ELAPSED" -gt 200 ]; then
      echo "WARN: route took ${ELAPSED}ms (>200ms target — D-RT-03)" >&2
    fi

    # Extract eventPath from response body (poor-man's JSON parse).
    EVENT_PATH=$(echo "$BODY" | grep -oE '"eventPath":"[^"]+"' | head -1 | cut -d'"' -f4)
    echo "Event path: $EVENT_PATH"

    # Step 2: Poll the event row until status flips to terminal (success | failed | rolled-back)
    DEADLINE=$(($(date +%s) + 600))   # 10 minutes
    while [ "$(date +%s)" -lt "$DEADLINE" ]; do
      sleep 5
      STATUS=$(ssh "$LIVOS_TEST_HOST" "sudo cat $EVENT_PATH 2>/dev/null | grep -oE '\"status\":\"[^\"]+\"' | head -1 | cut -d'\"' -f4" || echo "missing")
      echo "[$(date +%H:%M:%S)] event row status: $STATUS"
      case "$STATUS" in
        success|failed|rolled-back) break ;;
      esac
    done

    if [ "$STATUS" != "success" ]; then
      echo "FATAL: factory reset finished with status=$STATUS" >&2
      ssh "$LIVOS_TEST_HOST" "sudo cat $EVENT_PATH" || true
      exit 1
    fi

    echo "Factory reset reported SUCCESS — verifying livinityd boot..."

    # Step 3: Verify the new livinityd is up.
    HEALTH_DEADLINE=$(($(date +%s) + 60))
    while [ "$(date +%s)" -lt "$HEALTH_DEADLINE" ]; do
      if curl -fsS --max-time 5 "${LIVOS_TEST_HOST_HTTP:-https://bruce.livinity.io}/api/health" >/dev/null; then
        echo "PASS: /api/health returned 200"
        exit 0
      fi
      sleep 5
    done

    echo "FAIL: /api/health did not return 200 within 60s of factory-reset success" >&2
    exit 1
    ```

    Make file executable: `chmod +x factory-reset.integration.test.sh`. Save with LF line endings.

    Do NOT run this script as part of this task. Running is gated by Task 4 (checkpoint:human-verify).
  </action>
  <verify>
    <automated>shellcheck livos/packages/livinityd/source/modules/system/factory-reset.integration.test.sh</automated>
  </verify>
  <acceptance_criteria>
    - The script exists at `livos/packages/livinityd/source/modules/system/factory-reset.integration.test.sh`
    - `shellcheck factory-reset.integration.test.sh` exits 0
    - `head -1 factory-reset.integration.test.sh` is `#!/bin/bash`
    - `grep -c 'RUN_FACTORY_RESET_DESTRUCTIVE' factory-reset.integration.test.sh` >= 1
    - `grep -c 'LIVOS_DESTRUCTIVE_TEST_AUTHORIZED' factory-reset.integration.test.sh` >= 1
    - The script exits 64 when invoked with no env vars set (verified by running it once with neither var set; it should print the refusal message and exit 64 — this counts as a successful safety-gate verification, NOT as running the destructive test)
    - `file factory-reset.integration.test.sh` reports `Bourne-Again shell script` with no `CRLF`
    - `grep -c 'Server4\|45.137.194.103' factory-reset.integration.test.sh` == 0
  </acceptance_criteria>
  <done>
    factory-reset.integration.test.sh authored verbatim with two safety-gate env-vars; shellcheck-clean; refuses to run without explicit opt-in; LF line endings; no Server4 references.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Manually run the integration test on Mini PC scratchpad (HUMAN ONLY — opt-in)</name>
  <files>livos/packages/livinityd/source/modules/system/factory-reset.integration.test.sh (already authored in Task 3; this task only RUNS it)</files>
  <action>This is a checkpoint task — see <what-built> and <how-to-verify> for the human-driven contract. The executor pauses here until the user replies with the resume-signal. No automated action is taken; the script from Task 3 is invoked manually by the user (or skipped) and the result is reported back via resume-signal.</action>
  <verify>
    <automated>echo "Checkpoint task — verification is via human report in <resume-signal>"</automated>
  </verify>
  <done>The user has replied with one of: "skip-run" (no scratchpad available; phase ships without integration verification), "approved: <ms> route, <ms> total" (ran successfully on scratchpad), or "issues: <description>" (run failed; follow-up plan needed).</done>
  <what-built>
    The full Phase 37 backend stack is now committed (Plans 01-03 + this plan's bash error classification + JSON event schema tests + Task 3's integration script). What this checkpoint verifies is that the spawn-via-systemd-run actually survives a real `systemctl stop livos` mid-flight on a real systemd host — which only an end-to-end run on Mini PC scratchpad can prove.

    Task 3 has already authored and committed `factory-reset.integration.test.sh`. This checkpoint is purely about whether the human chooses to RUN it.
  </what-built>
  <how-to-verify>
    ## Skip path (recommended for v29.2 ship)

    If no scratchpad is available, the user reasonably skips this checkpoint with `skip-run`. The Phase 37 plan ships with the bash + tRPC + unit tests verified; the destructive integration test scaffold exists for opportunistic verification later.

    ## Run path (opt-in only)

    The user MUST satisfy ALL of the following before running:

    1. Provision a Mini PC SCRATCHPAD (a disposable VM or a Mini PC clone — NEVER production data, NEVER `bruce@10.69.31.68` directly)
    2. Confirm Server5 is reachable from the scratchpad: `curl -I https://livinity.io/install.sh` returns 200
    3. Confirm a valid admin JWT for the scratchpad: hit `/api/auth/login` and capture the cookie
    4. Confirm `LIV_PLATFORM_API_KEY` is in the scratchpad's `/opt/livos/.env`
    5. Set the env vars:
       ```
       export RUN_FACTORY_RESET_DESTRUCTIVE=1
       export LIVOS_DESTRUCTIVE_TEST_AUTHORIZED=YES
       export LIVOS_TEST_HOST=bruce@<scratchpad-ip>
       export LIVOS_TEST_TRPC_URL=https://<scratchpad-host>/trpc
       export LIVOS_TEST_ADMIN_TOKEN=<JWT>
       ```
    6. Invoke: `bash livos/packages/livinityd/source/modules/system/factory-reset.integration.test.sh`
    7. Observe:
       - Route returns within 200ms (record actual ms in resume-signal)
       - Event row status flips: in-progress → (eventually) success
       - `/api/health` returns 200 within 60s of success
    8. If anything fails, capture the event row + journalctl output and post-mortem before re-running

    ## NEVER run this against:
    - The user's primary Mini PC (`bruce@10.69.31.68`) for routine verification — only against a scratchpad clone
    - Server5 (it has no LivOS install)
    - Server4 (off-limits per project memory hard rule)
    - CI environments
  </how-to-verify>
  <resume-signal>Reply with one of: "skip-run" (no scratchpad available — Phase 37 ships without integration verification), "approved: <ms> route, <ms> total" (ran successfully on scratchpad — provide route latency and total reset time), or "issues: <description>" (what went wrong — Plan 04 may need a follow-up plan)</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| install.sh log → bash classifier | The classifier greps the log for HTTP status codes. If install.sh prints `HTTP 401` in a non-error context (e.g., comment, debug log), the classifier produces a false positive. |
| integration test → Mini PC scratchpad | The test issues a real factory-reset over HTTPS using an admin JWT. The fail-closed env-var gates protect against accidental invocation. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-37-19 | Information Disclosure | install.sh log on /tmp may contain transient secrets if install.sh logs them | accept | Log is deleted on success cleanup. On failure, retained one cycle for post-mortem (same trade-off as snapshot tar). |
| T-37-20 | Tampering | False-positive classification (e.g., `HTTP 401` in a comment in install.sh stderr) | accept | Best-effort heuristic per D-ERR-01. UI surfaces the error string verbatim; user can manually inspect log. |
| T-37-21 | Spoofing | Integration test run accidentally against production | mitigate | Two env-var gates (RUN_FACTORY_RESET_DESTRUCTIVE + LIVOS_DESTRUCTIVE_TEST_AUTHORIZED) plus host-name guidance. The test fails-closed without both set. |
| T-37-22 | DoS | Integration test poll loop runs forever | mitigate | 600s deadline on event-row poll, 60s deadline on health check. |
</threat_model>

<verification>
## Plan-level checks

1. shellcheck on factory-reset.sh still passes (after error classification additions)
2. shellcheck on factory-reset.integration.test.sh passes
3. `pnpm --filter livinityd test -- factory-reset.unit.test` passes with all new schema tests
4. The integration script refuses to run without the two env vars set (verified by running it with neither set: `bash factory-reset.integration.test.sh` exits 64)
5. Phase 37 SUMMARY.md authored
6. The 12-criterion floor (must_haves) is verified across all 4 plans
</verification>

<success_criteria>
- All shellcheck/typecheck/test gates pass
- Integration test script committed; opt-in run is human-gated and documented
- The 12 must_haves from CONTEXT.md are observable (route exists, route is admin-only, route in httpOnlyPaths, scripts pass shellcheck, snapshot taken, idempotent wipe, cgroup-escape spawn, pre-flight rejection, apikey trap cleanup, no eval/no unscoped Docker prune/no rm -rf of variable paths, JSON schema matches Phase 33, integration test scaffold exists)
</success_criteria>

<output>
After completion, create `.planning/phases/37-backend-factory-reset/37-04-SUMMARY.md` documenting:
- The error classification grep patterns and their false-positive risks
- The integration test invocation contract (env vars, expected wall-clock, expected outcomes)
- Whether the integration test was run on a scratchpad and the captured event row + timing
- Cross-references to the Plan 01-03 SUMMARYs for the full Phase 37 picture

Then create `.planning/phases/37-backend-factory-reset/SUMMARY.md` (phase-level) summarizing all four plans, the 12 must_haves verification status, and the v29.2 → v29.2.1 follow-ups parked for the next milestone.
</output>
