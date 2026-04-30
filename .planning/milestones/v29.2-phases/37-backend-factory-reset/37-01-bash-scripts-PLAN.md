---
phase: 37-backend-factory-reset
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - livos/packages/livinityd/source/modules/system/factory-reset.sh
  - livos/packages/livinityd/source/modules/system/livos-install-wrap.sh
autonomous: true
requirements:
  - FR-BACKEND-02
  - FR-BACKEND-04
  - FR-BACKEND-05

must_haves:
  truths:
    - "factory-reset.sh source exists in source tree (NOT yet at /opt) and passes shellcheck"
    - "livos-install-wrap.sh source exists in source tree (NOT yet at /opt) and passes shellcheck"
    - "factory-reset.sh argv is positional: $1=--preserve-api-key|--no-preserve-api-key, $2=event JSON path"
    - "factory-reset.sh writes a JSON event row at $2 in the in-progress→success/failed/rolled-back state machine"
    - "factory-reset.sh takes a pre-wipe tar snapshot at /tmp/livos-pre-reset-<ts>.tar.gz before any destructive op"
    - "factory-reset.sh wipe sequence is fully idempotent — every rm uses -rf, every DROP uses IF EXISTS, every systemctl stop tolerates already-stopped"
    - "factory-reset.sh fetches install.sh via live-then-cache fallback with 3-retry exponential backoff"
    - "livos-install-wrap.sh reads --api-key-file <path>, exports LIV_PLATFORM_API_KEY, exec's $INSTALL_SH (env-var-aware grep heuristic)"
  artifacts:
    - path: "livos/packages/livinityd/source/modules/system/factory-reset.sh"
      provides: "wipe + reinstall + recovery + JSON event lifecycle bash"
      contains: "set -euo pipefail|tar -czf|DROP DATABASE IF EXISTS|systemd-run|trap"
    - path: "livos/packages/livinityd/source/modules/system/livos-install-wrap.sh"
      provides: "API key wrapper: --api-key-file → LIV_PLATFORM_API_KEY env → exec install.sh"
      contains: "--api-key-file|LIV_PLATFORM_API_KEY|grep -q 'LIV_PLATFORM_API_KEY'|exec bash"
  key_links:
    - from: "factory-reset.sh"
      to: "livos-install-wrap.sh"
      via: "INSTALL_SH=... bash /opt/livos/data/wrapper/livos-install-wrap.sh --api-key-file ..."
      pattern: "livos-install-wrap.sh.*--api-key-file"
    - from: "factory-reset.sh"
      to: "JSON event row at $2"
      via: "write_event() helper appending status updates after each phase"
      pattern: "write_event|jq|>\\s*\"\\$EVENT_PATH\""
---

<objective>
Ship the two bash artifacts that are the heart of v29.2 factory reset: `factory-reset.sh` (the idempotent root-level wipe + install.sh re-execution + tar-snapshot recovery + JSON event lifecycle) and `livos-install-wrap.sh` (the API-key transport wrapper that closes the FR-AUDIT-04 argv-leak window). Both are committed as SOURCE files only — they are not yet copied to `/opt/livos/data/...` (that runtime deployment happens in Plan 03).

Purpose: The bash is the heart of the phase. It must be atomic, idempotent, and shellcheck-clean BEFORE any TS/tRPC code wires it up. Getting the wipe sequence wrong is a one-way trip to a bricked Mini PC, so this plan locks down the destructive primitive in isolation, with shellcheck as the verification gate.

Output: Two bash files in the source tree, both shellcheck-clean, both with explicit safety properties (no eval, no unscoped Docker prune, no rm -rf of variable paths, IF EXISTS on every drop, trap-based cleanup of /tmp/livos-reset-apikey).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/37-backend-factory-reset/37-CONTEXT.md
@.planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md

<interfaces>
<!-- factory-reset.sh contract (consumed by Plan 03's spawn helper) -->
<!-- Invocation: bash /opt/livos/data/factory-reset/reset.sh <preserve-flag> <event-json-path> -->
<!-- where <preserve-flag> ∈ {--preserve-api-key, --no-preserve-api-key} -->

Argv contract:
  $1 = "--preserve-api-key" | "--no-preserve-api-key"
  $2 = absolute path to JSON event file (e.g. /opt/livos/data/update-history/20260429T120000Z-factory-reset.json)

Exit codes:
  0 = success (status:success in event row)
  1 = wipe-or-reinstall failed AND rollback succeeded (status:rolled-back)
  2 = wipe-or-reinstall failed AND rollback also failed (status:failed, half-deleted)

Side effects (in order):
  - writes /tmp/livos-pre-reset-<ts>.tar.gz (snapshot)
  - writes /tmp/livos-pre-reset.path (sidecar pointing at snapshot)
  - writes /tmp/livos-reset-apikey (mode 0600) ONLY if --preserve-api-key
  - writes $2 (JSON event row, multiple incremental updates)
  - on success: deletes snapshot + sidecar + apikey + /tmp/install.sh.live
  - on failure: tar-restores snapshot, retains snapshot + sidecar (one-cycle retention)

<!-- livos-install-wrap.sh contract (consumed by factory-reset.sh internally) -->
Argv contract:
  --api-key-file <path>   (required; file must exist and be readable)

Env contract:
  INSTALL_SH=<path>       (required; absolute path to install.sh to exec)

Behavior:
  - reads $(cat <path>) into LIV_PLATFORM_API_KEY env var
  - greps $INSTALL_SH for literal 'LIV_PLATFORM_API_KEY' token
    - if found: exec bash $INSTALL_SH (env-var-only path)
    - if not found: exec bash $INSTALL_SH --api-key "$LIV_PLATFORM_API_KEY" (degraded mode for v29.2)

Exit codes:
  2 = --api-key-file missing or unreadable
  3 = $INSTALL_SH does not exist
  (otherwise inherits install.sh's exit code via exec)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author livos-install-wrap.sh (API key transport wrapper)</name>
  <files>livos/packages/livinityd/source/modules/system/livos-install-wrap.sh</files>
  <read_first>
    - .planning/phases/37-backend-factory-reset/37-CONTEXT.md (D-AUD-02, D-INST-02 — wrapper is mandatory v29.2 deliverable; D-INST-03 — wrapper degrades to argv when install.sh has no env-var fallback)
    - .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md, "## Hardening Proposals" → "Wrapper script: livos-install-wrap.sh" (lines 486-588) — the FULL SOURCE is in this section. Copy verbatim.
    - livos/packages/livinityd/source/modules/system/update.ts (lines 192-237) — reference for how detached spawns invoke bash in this codebase
  </read_first>
  <action>
    Create `livos/packages/livinityd/source/modules/system/livos-install-wrap.sh` with the FULL SOURCE from AUDIT-FINDINGS.md "## Hardening Proposals" → "Wrapper content (full source)" lines 494-558. Per D-INST-02, this content is checked-in verbatim — Phase 37 ships it as a real production artifact at `/opt/livos/data/wrapper/livos-install-wrap.sh` (deployment happens in Plan 03; this plan only authors the source).

    File contents (copy this block exactly into the file):

    ```bash
    #!/bin/bash
    # livos-install-wrap.sh
    # Hardens install.sh by reading the API key from a file and exporting it
    # as an env var BEFORE invoking install.sh. The key is never on argv.
    #
    # Usage:
    #   INSTALL_SH=/path/to/install.sh bash livos-install-wrap.sh --api-key-file /path/to/key
    #
    # Contract:
    #   - Reads --api-key-file <path> from argv
    #   - Reads the key contents from that file
    #   - exports LIV_PLATFORM_API_KEY in the shell environment
    #   - execs install.sh inheriting the env (no --api-key flag passed)
    #   - Requires install.sh to honor ${LIV_PLATFORM_API_KEY:-} as fallback
    #     (v29.2.1 deliverable). If install.sh has not been patched, the
    #     wrapper falls back to passing --api-key on argv internally —
    #     same leak window as direct invocation, but at least the entry
    #     point is auditable.

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
    LIV_PLATFORM_API_KEY=$(cat "$API_KEY_FILE")
    export LIV_PLATFORM_API_KEY

    # Locate install.sh — caller MUST set $INSTALL_SH (live or cached path).
    INSTALL_SH="${INSTALL_SH:-/tmp/install.sh.live}"
    if [ ! -f "$INSTALL_SH" ]; then
      echo "livos-install-wrap.sh: \$INSTALL_SH ($INSTALL_SH) does not exist" >&2
      exit 3
    fi

    # Detect whether install.sh has the env-var fallback patch (v29.2.1).
    # Heuristic: grep for the literal LIV_PLATFORM_API_KEY token. If present,
    # exec install.sh WITHOUT --api-key (env-only path, no argv leak). If
    # absent, fall back to passing --api-key on argv — accepts the leak
    # window but preserves the wrapper as the single auditable entry point.
    if grep -q 'LIV_PLATFORM_API_KEY' "$INSTALL_SH"; then
      exec bash "$INSTALL_SH" "${EXTRA_ARGS[@]}"
    else
      exec bash "$INSTALL_SH" --api-key "$LIV_PLATFORM_API_KEY" "${EXTRA_ARGS[@]}"
    fi
    ```

    Make sure the shebang is on line 1 (no BOM, no leading blank line). Save as LF-only line endings (no CRLF). The file is meant to be deployed at runtime to `/opt/livos/data/wrapper/livos-install-wrap.sh` mode 0755 (Plan 03 handles deployment).

    Do NOT add any extra commands, do NOT echo or log $LIV_PLATFORM_API_KEY anywhere, do NOT remove `set -euo pipefail`.
  </action>
  <verify>
    <automated>shellcheck livos/packages/livinityd/source/modules/system/livos-install-wrap.sh</automated>
  </verify>
  <acceptance_criteria>
    - `shellcheck livos/packages/livinityd/source/modules/system/livos-install-wrap.sh` exits 0 with no warnings (or only SC2207 on `EXTRA_ARGS+=("$1")` if shellcheck flags it; that's an array append and is correct as written)
    - `head -1 livos-install-wrap.sh` is exactly `#!/bin/bash`
    - `grep -c 'LIV_PLATFORM_API_KEY' livos-install-wrap.sh` ≥ 4 (referenced in heuristic + export + comment + degraded path)
    - `grep -E '(echo|printf|tee).*LIV_PLATFORM_API_KEY' livos-install-wrap.sh` returns 0 matches (no logging of the key)
    - `grep -c 'exec bash' livos-install-wrap.sh` == 2 (two exec branches: env-only and degraded)
    - `grep 'set -euo pipefail' livos-install-wrap.sh` returns 1 match
    - File line endings are LF: `file livos-install-wrap.sh` reports `Bourne-Again shell script, ASCII text executable` (no `with CRLF line terminators`)
  </acceptance_criteria>
  <done>
    livos-install-wrap.sh source file exists with verbatim wrapper content, passes shellcheck, never logs the API key, has both env-only and degraded-argv exec branches.
  </done>
</task>

<task type="auto">
  <name>Task 2: Author factory-reset.sh — pre-wipe snapshot + idempotent wipe + install.sh fetch + reinstall + JSON event lifecycle + recovery</name>
  <files>livos/packages/livinityd/source/modules/system/factory-reset.sh</files>
  <read_first>
    - .planning/phases/37-backend-factory-reset/37-CONTEXT.md (full file — every D-AUD-*, D-WIPE-*, D-KEY-*, D-INST-*, D-EVT-*, D-ERR-* decision)
    - .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md, "## Phase 37 Readiness" Q1-Q4 (lines 681-755) — the literal bash this script must implement
    - .planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md, "## Recovery Model" → "Pre-wipe command" + "Restore command" (lines 328-365) — verbatim tar invocations
    - C:/Users/hello/.claude/projects/C--Users-hello-Desktop-Projects-contabo-livinity-io/memory/MEMORY.md (Mini PC layout — services to stop, /opt/livos/.env path, postgres user named "livos", wipe targets are LITERAL paths only)
    - livos/packages/livinityd/source/modules/system/factory-reset.ts (existing OLD implementation — DO NOT modify; this is the legacy OTA-style reset that the v29.2 design replaces logically. Keep the file untouched in this plan; Plan 02 handles the route swap.)
  </read_first>
  <action>
    Create `livos/packages/livinityd/source/modules/system/factory-reset.sh` as a single-file bash script implementing the full v29.2 wipe-and-reinstall lifecycle. The script runs as root (caller is `systemd-run --scope --collect` from Plan 03; this plan does NOT need to verify EUID since the systemd-run scope guarantees root).

    ## Header (top of file, exact contents)

    ```bash
    #!/bin/bash
    # factory-reset.sh — LivOS v29.2 backend factory reset
    #
    # Argv:
    #   $1 = --preserve-api-key | --no-preserve-api-key
    #   $2 = absolute path to JSON event file
    #
    # Exit codes:
    #   0 = success
    #   1 = reinstall failed AND rollback succeeded (status:rolled-back)
    #   2 = reinstall failed AND rollback also failed (half-deleted state)
    #
    # Per CONTEXT.md D-AUD-* / D-WIPE-* / D-KEY-* / D-INST-* / D-EVT-* / D-ERR-*.
    # Per AUDIT-FINDINGS.md "## Phase 37 Readiness" Q1-Q4 (literal contract).

    set -uo pipefail
    # NOTE: NOT using `set -e` because the wipe sequence intentionally tolerates
    # already-stopped services and missing files. We use explicit `|| true` on
    # graceful-failure commands and explicit error checks on critical commands.
    ```

    ## Argv parsing + globals (immediately after header)

    ```bash
    PRESERVE_FLAG="${1:-}"
    EVENT_PATH="${2:-}"

    if [ -z "$EVENT_PATH" ] || [ -z "$PRESERVE_FLAG" ]; then
      echo "Usage: $0 --preserve-api-key|--no-preserve-api-key <event-json-path>" >&2
      exit 64
    fi

    case "$PRESERVE_FLAG" in
      --preserve-api-key) PRESERVE=true ;;
      --no-preserve-api-key) PRESERVE=false ;;
      *) echo "First arg must be --preserve-api-key or --no-preserve-api-key" >&2; exit 64 ;;
    esac

    # Hardcoded paths — NEVER use variables in rm -rf / DROP / docker volume rm targets.
    # Per CONTEXT.md "no rm -rf of variable-derived paths".
    readonly ENV_FILE=/opt/livos/.env
    readonly APIKEY_TMP=/tmp/livos-reset-apikey
    readonly INSTALL_SH_LIVE=/tmp/install.sh.live
    readonly INSTALL_SH_CACHED=/opt/livos/data/cache/install.sh.cached
    readonly WRAPPER=/opt/livos/data/wrapper/livos-install-wrap.sh
    readonly SNAPSHOT_SIDECAR=/tmp/livos-pre-reset.path

    TIMESTAMP_ISO=$(date -u +%Y%m%dT%H%M%SZ)
    SNAPSHOT_PATH=/tmp/livos-pre-reset-${TIMESTAMP_ISO}.tar.gz
    WIPE_START_MS=0
    WIPE_END_MS=0
    REINSTALL_START_MS=0
    REINSTALL_END_MS=0
    INSTALL_SH_EXIT=-1
    INSTALL_SH_SOURCE=""    # "live" or "cache"

    # D-KEY-03: cleanup trap — ALWAYS removes the apikey temp file, even on failure.
    trap 'rm -f "$APIKEY_TMP" 2>/dev/null || true' EXIT
    ```

    ## Helper: write_event (JSON event row writer)

    Emit JSON via `cat <<EOF >"$EVENT_PATH"`. Schema per CONTEXT.md D-EVT-02.

    ```bash
    write_event() {
      local status="$1"
      local error="${2:-null}"
      local error_json
      if [ "$error" = "null" ]; then
        error_json="null"
      else
        # JSON-escape: replace " with \" and wrap in quotes
        error_json="\"$(echo -n "$error" | sed 's/"/\\"/g')\""
      fi
      local ended_at="null"
      if [ "$status" = "success" ] || [ "$status" = "failed" ] || [ "$status" = "rolled-back" ]; then
        ended_at="\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
      fi
      cat > "$EVENT_PATH" <<EOF
    {
      "type": "factory-reset",
      "status": "$status",
      "timestamp": "$TIMESTAMP_ISO",
      "started_at": "$STARTED_AT",
      "ended_at": $ended_at,
      "preserveApiKey": $PRESERVE,
      "wipe_duration_ms": $((WIPE_END_MS - WIPE_START_MS)),
      "reinstall_duration_ms": $((REINSTALL_END_MS - REINSTALL_START_MS)),
      "install_sh_exit_code": $INSTALL_SH_EXIT,
      "install_sh_source": "$INSTALL_SH_SOURCE",
      "snapshot_path": "$SNAPSHOT_PATH",
      "error": $error_json
    }
    EOF
    }

    ms_now() { date +%s%3N; }

    STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    mkdir -p "$(dirname "$EVENT_PATH")"
    write_event "in-progress"
    ```

    ## Pre-flight: stash API key (D-KEY-01) — BEFORE the snapshot

    ```bash
    if [ "$PRESERVE" = "true" ]; then
      if [ -r "$ENV_FILE" ]; then
        LIV_API_KEY=$(grep '^LIV_PLATFORM_API_KEY=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'") || LIV_API_KEY=""
        if [ -n "$LIV_API_KEY" ]; then
          (umask 077 && echo -n "$LIV_API_KEY" > "$APIKEY_TMP")
          chmod 0600 "$APIKEY_TMP"
        else
          echo "preserveApiKey=true but no LIV_PLATFORM_API_KEY found in $ENV_FILE" >&2
          write_event "failed" "no-api-key-in-env"
          exit 1
        fi
      fi
    fi
    ```

    ## Step 1: Pre-wipe tar snapshot (D-AUD-03 / Recovery Model)

    Use the LITERAL command from AUDIT-FINDINGS.md lines 330-342:

    ```bash
    tar -czf "$SNAPSHOT_PATH" \
      /opt/livos \
      /opt/nexus \
      /etc/systemd/system/livos.service \
      /etc/systemd/system/liv-core.service \
      /etc/systemd/system/liv-worker.service \
      /etc/systemd/system/liv-memory.service \
      /etc/systemd/system/livos-rollback.service \
      /etc/systemd/system/livos.service.d \
      2>/dev/null || true
    echo "$SNAPSHOT_PATH" > "$SNAPSHOT_SIDECAR"
    chmod 600 "$SNAPSHOT_PATH" "$SNAPSHOT_SIDECAR" 2>/dev/null || true
    ```

    ## Step 2: Idempotent wipe (D-WIPE-01 through D-WIPE-06)

    ```bash
    WIPE_START_MS=$(ms_now)

    # 2a. Enumerate Docker containers BEFORE stopping PG (D-WIPE-02)
    LIVOS_CONTAINERS=""
    if command -v psql >/dev/null && sudo -u postgres psql -d livos -tAc "SELECT 1" >/dev/null 2>&1; then
      LIVOS_CONTAINERS=$(sudo -u postgres psql -d livos -tAc "SELECT container_name FROM user_app_instances" 2>/dev/null | tr '\n' ' ')
    fi

    # 2b. Stop services (D-WIPE-01) — preserve sshd, do not block
    systemctl stop --no-block livos liv-core liv-worker liv-memory livos-rollback caddy 2>/dev/null || true

    # 2c. Stop and remove LivOS-managed Docker containers (D-WIPE-02)
    if [ -n "$LIVOS_CONTAINERS" ]; then
      # shellcheck disable=SC2086
      docker stop $LIVOS_CONTAINERS 2>/dev/null || true
      # shellcheck disable=SC2086
      docker rm -f $LIVOS_CONTAINERS 2>/dev/null || true
    fi

    # 2d. Remove LivOS Docker volumes by naming convention (D-WIPE-03) — NEVER global prune
    docker volume ls --format '{{.Name}}' 2>/dev/null \
      | grep '^livos-' \
      | xargs -r docker volume rm 2>/dev/null \
      || true

    # 2e. Drop database (D-WIPE-04) — IF EXISTS for idempotency
    sudo -u postgres psql -c "DROP DATABASE IF EXISTS livos;" 2>/dev/null || true
    sudo -u postgres psql -c "DROP USER IF EXISTS livos;" 2>/dev/null || true

    # 2f. Filesystem wipe (D-WIPE-05) — LITERAL paths only, all -rf/-f for idempotency
    rm -rf /opt/livos
    rm -rf /opt/nexus
    rm -f /etc/systemd/system/livos.service
    rm -f /etc/systemd/system/liv-core.service
    rm -f /etc/systemd/system/liv-worker.service
    rm -f /etc/systemd/system/liv-memory.service
    rm -f /etc/systemd/system/livos-rollback.service
    rm -rf /etc/systemd/system/livos.service.d
    systemctl daemon-reload || true

    WIPE_END_MS=$(ms_now)
    write_event "in-progress"
    ```

    ## Step 3: Fetch install.sh (live-then-cache fallback per AUDIT-FINDINGS.md Q1)

    ```bash
    REINSTALL_START_MS=$(ms_now)

    INSTALL_SH=""
    RETRIES=0
    while [ $RETRIES -lt 3 ]; do
      if curl -sSL --max-time 30 https://livinity.io/install.sh -o "$INSTALL_SH_LIVE"; then
        INSTALL_SH="$INSTALL_SH_LIVE"
        INSTALL_SH_SOURCE="live"
        break
      fi
      RETRIES=$((RETRIES + 1))
      sleep $((2 ** RETRIES))   # 2, 4, 8 seconds
    done

    if [ -z "$INSTALL_SH" ] && [ -f "$INSTALL_SH_CACHED" ]; then
      cp "$INSTALL_SH_CACHED" "$INSTALL_SH_LIVE"
      INSTALL_SH="$INSTALL_SH_LIVE"
      INSTALL_SH_SOURCE="cache"
    fi

    if [ -z "$INSTALL_SH" ]; then
      REINSTALL_END_MS=$(ms_now)
      INSTALL_SH_EXIT=-2
      write_event "failed" "install-sh-unreachable"
      # No rollback needed — wipe destroyed /opt but reinstall hasn't run.
      # Operator must manually re-run reset OR restore from snapshot.
      attempt_rollback "install-sh-unreachable"
      exit $?
    fi
    ```

    ## Step 4: Run install.sh via wrapper (D-INST-01)

    ```bash
    if [ "$PRESERVE" = "true" ] && [ -f "$WRAPPER" ] && [ -r "$APIKEY_TMP" ]; then
      INSTALL_SH="$INSTALL_SH" bash "$WRAPPER" --api-key-file "$APIKEY_TMP"
    else
      # No-preserve path: run install.sh directly, no key. Still via wrapper if it exists,
      # but the wrapper requires --api-key-file so direct invocation is correct here.
      bash "$INSTALL_SH"
    fi
    INSTALL_SH_EXIT=$?
    REINSTALL_END_MS=$(ms_now)
    ```

    ## Step 5: Failure handling + rollback (D-AUD-03 restore + D-ERR-01/02)

    ```bash
    attempt_rollback() {
      local err="$1"
      local snap
      snap=$(cat "$SNAPSHOT_SIDECAR" 2>/dev/null || true)
      if [ -n "$snap" ] && [ -f "$snap" ]; then
        if tar -xzf "$snap" -C / 2>/dev/null; then
          systemctl daemon-reload || true
          systemctl restart livos liv-core liv-worker liv-memory 2>/dev/null || true
          write_event "rolled-back" "$err"
          rm -f "$INSTALL_SH_LIVE"
          # Retain snapshot one cycle for post-mortem (per Recovery Model).
          return 1
        fi
      fi
      write_event "failed" "$err"
      return 2
    }

    if [ "$INSTALL_SH_EXIT" -eq 0 ]; then
      write_event "success"
      # D-AUD-03 success cleanup
      rm -f "$SNAPSHOT_PATH" "$SNAPSHOT_SIDECAR" "$INSTALL_SH_LIVE"
      exit 0
    else
      # Map exit code to error string (D-ERR-01)
      ERR_KIND="install-sh-failed"
      # Detection of 401 / Server5 5xx is best-effort (D-ERR-01 says "if not detectable, fall back to generic").
      attempt_rollback "$ERR_KIND"
      exit $?
    fi
    ```

    ## Final notes

    - Place `attempt_rollback()` definition BEFORE Step 3 (since Step 3 calls it on install-sh-unreachable). Function declaration ordering matters in bash.
    - All `rm -rf` targets are LITERAL paths from the readonly constants section. Search the file: `grep -n 'rm -rf' factory-reset.sh` should return only `/opt/livos`, `/opt/nexus`, and `/etc/systemd/system/livos.service.d`.
    - There is NO `eval` anywhere. There is NO `docker volume prune` (only the scoped grep+xargs). There is NO `docker stop $(docker ps -aq)` — only the user_app_instances enumeration.
    - The script does NOT need to chmod 0755 itself (Plan 03's deployment step does that when copying to /opt).

    Save with LF line endings.
  </action>
  <verify>
    <automated>shellcheck livos/packages/livinityd/source/modules/system/factory-reset.sh</automated>
  </verify>
  <acceptance_criteria>
    - `shellcheck livos/packages/livinityd/source/modules/system/factory-reset.sh` exits 0 (warnings on `SC2086` for the deliberate word-splitting of $LIVOS_CONTAINERS are acceptable IF they have a `# shellcheck disable=SC2086` directive directly above)
    - `head -1 factory-reset.sh` is exactly `#!/bin/bash`
    - `grep -c 'set -uo pipefail' factory-reset.sh` >= 1 (note: deliberately NOT using `set -e`)
    - `grep -c 'eval ' factory-reset.sh` == 0 (zero usages of eval)
    - `grep -c 'docker volume prune' factory-reset.sh` == 0 (NEVER unscoped prune)
    - `grep -c 'docker ps -aq' factory-reset.sh` == 0 (NEVER global container stop)
    - `grep -E 'rm -rf' factory-reset.sh` only matches LITERAL path lines containing `/opt/livos`, `/opt/nexus`, `/etc/systemd/system/livos.service.d` (no `rm -rf $VAR`)
    - `grep -c 'IF EXISTS' factory-reset.sh` >= 2 (one for DROP DATABASE, one for DROP USER)
    - `grep -c 'trap.*EXIT' factory-reset.sh` >= 1 (the apikey cleanup trap is present)
    - `grep -c 'tar -czf' factory-reset.sh` >= 1 (pre-wipe snapshot)
    - `grep -c 'tar -xzf' factory-reset.sh` >= 1 (rollback restore)
    - `grep -c 'write_event' factory-reset.sh` >= 4 (initial in-progress + post-wipe + success + failed/rolled-back)
    - `grep -c '"type": "factory-reset"' factory-reset.sh` == 1 (the schema root in write_event)
    - `grep -c 'curl.*livinity.io/install.sh' factory-reset.sh` >= 1 (live URL fetch)
    - `grep -c 'install.sh.cached' factory-reset.sh` >= 1 (cache fallback)
    - `grep -c 'livos-install-wrap.sh' factory-reset.sh` >= 1 (wrapper invocation)
    - `grep -c 'systemctl stop --no-block livos liv-core liv-worker liv-memory livos-rollback caddy' factory-reset.sh` == 1 (D-WIPE-01 verbatim, sshd NOT in the list)
    - `grep -c 'sshd' factory-reset.sh` == 0 (sshd is preserved by omission, not by exclusion logic)
    - `file factory-reset.sh` reports `Bourne-Again shell script` with no `CRLF`
  </acceptance_criteria>
  <done>
    factory-reset.sh source committed; shellcheck-clean; idempotent wipe verified by grep checks; tar snapshot before wipe; live-then-cache install.sh fetch with retry; rollback path on install.sh failure; JSON event row state machine (in-progress → success | rolled-back | failed); apikey cleanup trap; no eval, no unscoped Docker prune, no rm -rf of variable paths.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| livinityd → factory-reset.sh (root) | The TS process invokes the bash via systemd-run (Plan 03). The bash runs as root. Anything it does is privileged. |
| factory-reset.sh → /tmp filesystem | The script writes the API key to /tmp/livos-reset-apikey. /tmp on Linux is mode 1777 (world-writable, sticky). The 0600 mode + root ownership are the only protections. |
| factory-reset.sh → install.sh (downloaded) | The script execs install.sh fetched over HTTPS (or from cache). Trust depends on TLS to livinity.io and on the cache file's prior provenance. No local validation. |
| livos-install-wrap.sh → install.sh | The wrapper exports LIV_PLATFORM_API_KEY into install.sh's env. install.sh inherits the env automatically. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-37-01 | Information Disclosure | API key on argv (FR-AUDIT-04) | mitigate | Wrapper script reads --api-key-file and exports as env var. In v29.2 the wrapper still degrades to argv internally if install.sh has no env-var fallback patch — documented residual leak window. |
| T-37-02 | Information Disclosure | API key file on /tmp world-readable directory | mitigate | umask 077 + chmod 0600 + EXIT trap removes file. File ownership is root (only root processes can read it). |
| T-37-03 | Information Disclosure | tar snapshot at /tmp contains .env with DB password + API key | mitigate | chmod 600 on snapshot file + sidecar. Cleanup on success. One-cycle retention on rollback for post-mortem (accepted risk). |
| T-37-04 | Tampering | Install.sh from livinity.io is content-corrupted | accept | No SHA-256 validation per AUDIT-FINDINGS.md "Server5 Dependency Analysis" (cache is best-effort). HTTPS provides transport integrity; relay-side corruption is out of scope for v29.2. |
| T-37-05 | Denial of Service | Wipe destroys host but reinstall fails to fetch install.sh | mitigate | Tar snapshot pre-wipe + automatic rollback in attempt_rollback(). If snapshot itself was missing, half-deleted state is documented as "manual SSH recovery required". |
| T-37-06 | Elevation of Privilege | Bash variable injection into rm -rf / DROP TABLE | mitigate | All rm targets are LITERAL hardcoded paths in `readonly` consts. All DROP statements use IF EXISTS on literal table/user names. No user input flows into destructive commands. |
| T-37-07 | Repudiation | Reset action not auditable | mitigate | JSON event row at /opt/livos/data/update-history/ records timestamp, choice, durations, outcome. Phase 33's listUpdateHistory surfaces it in UI. |
| T-37-08 | Spoofing | Non-root process invokes factory-reset.sh | accept | Caller is the systemd-run --scope --collect spawn from Plan 03. The bash itself doesn't verify EUID; the trust boundary is the route handler's adminProcedure RBAC (Plan 02). |
</threat_model>

<verification>
## Plan-level checks

1. Both files exist in source tree at the declared paths
2. Both files pass shellcheck with no errors (warnings only on shellcheck-disable-annotated lines)
3. Neither file is yet copied to `/opt/livos/data/...` — that's Plan 03
4. Both files have LF line endings (no CRLF)
5. `grep -nrI 'Server4\|45.137.194.103' livos/packages/livinityd/source/modules/system/factory-reset.sh livos/packages/livinityd/source/modules/system/livos-install-wrap.sh` returns 0 matches (Server4 hard rule)
</verification>

<success_criteria>
- shellcheck on both files: exit 0
- All acceptance_criteria grep counts match
- factory-reset.sh argv contract documented and parseable
- livos-install-wrap.sh has both env-only and degraded-argv exec branches
- No Server4 references anywhere
- TypeScript code untouched (Plan 02's job)
</success_criteria>

<output>
After completion, create `.planning/phases/37-backend-factory-reset/37-01-SUMMARY.md` documenting:
- Final byte counts and shellcheck output for both files
- Confirmed idempotency by grep audit (rm -rf paths are literal, every DROP has IF EXISTS, every systemctl stop tolerates already-stopped)
- The exact wipe order Plan 02's tRPC route handler should expect
- Any deviations from AUDIT-FINDINGS.md Q1-Q4 (there should be NONE; if there are, justify in SUMMARY)
</output>
