#!/usr/bin/env bash
# install-liv-caddy-snippet.sh — Phase 226-01
#
# Idempotent installer for the liv-assistant Caddy snippet.
#
# - Ensures /etc/caddy/Caddyfile is bruce-owned (feedback_caddyfile_must_be_bruce_owned)
# - Copies repo snippet to /etc/caddy/conf.d/liv-assistant.caddy iff content differs
# - Ensures /etc/caddy/Caddyfile has `import conf.d/*.caddy` at the top level
# - Ensures the existing `bruce.livinity.io { ... }` site block has `import liv_assistant`
# - Runs `caddy validate /etc/caddy/Caddyfile` and exits non-zero on validation failure
#
# Root-required (writes /etc/caddy/). Safe to re-run.

set -euo pipefail

readonly TAG="[install-liv-caddy-snippet]"

log()  { echo "${TAG} $*"; }
fail() { echo "${TAG} FAIL: $*" >&2; exit 1; }

# ── Root check ─────────────────────────────────────────────────────────────
if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    fail "must run as root (writes /etc/caddy/)"
fi

# ── Resolve repo root (script may be invoked from update.sh's TEMP_DIR or from /opt/livos) ─
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SNIPPET_SRC="${REPO_ROOT}/caddy/conf.d/liv-assistant.caddy"
SNIPPET_DST="/etc/caddy/conf.d/liv-assistant.caddy"
CADDYFILE="/etc/caddy/Caddyfile"

if [[ ! -f "${SNIPPET_SRC}" ]]; then
    fail "snippet source not found at ${SNIPPET_SRC}"
fi

if [[ ! -f "${CADDYFILE}" ]]; then
    fail "${CADDYFILE} not found — is Caddy installed?"
fi

# ── Step 1: Defensive chown of Caddyfile (feedback_caddyfile_must_be_bruce_owned) ─
CURRENT_OWNER="$(stat -c '%U:%G' "${CADDYFILE}")"
if [[ "${CURRENT_OWNER}" != "bruce:bruce" ]]; then
    chown bruce:bruce "${CADDYFILE}"
    log "chowned ${CADDYFILE} ${CURRENT_OWNER} → bruce:bruce"
else
    log "${CADDYFILE} already bruce:bruce"
fi

# ── Step 2: Ensure /etc/caddy/conf.d exists, bruce-owned ───────────────────
if [[ ! -d /etc/caddy/conf.d ]]; then
    install -d -m 0755 -o bruce -g bruce /etc/caddy/conf.d
    log "created /etc/caddy/conf.d"
fi

# ── Step 3: Copy snippet iff content differs ───────────────────────────────
if [[ -f "${SNIPPET_DST}" ]] && cmp -s "${SNIPPET_SRC}" "${SNIPPET_DST}"; then
    log "snippet byte-identical at ${SNIPPET_DST} — no write"
    SNIPPET_CHANGED=0
else
    install -m 0644 -o bruce -g bruce "${SNIPPET_SRC}" "${SNIPPET_DST}"
    log "installed snippet ${SNIPPET_SRC} → ${SNIPPET_DST}"
    SNIPPET_CHANGED=1
fi

# ── Step 4: Ensure top-level `import conf.d/*.caddy` in Caddyfile ──────────
# We require this line at the TOP (outside any site block) so the named snippet
# is loaded before the site block tries to `import liv_assistant`.
if grep -qE '^[[:space:]]*import[[:space:]]+conf\.d/\*\.caddy[[:space:]]*$' "${CADDYFILE}"; then
    log "Caddyfile already has top-level 'import conf.d/*.caddy'"
    TOP_IMPORT_CHANGED=0
else
    # Prepend the import line to the top of Caddyfile (before the global options block
    # at line 1, if any). Use a temp file to keep the write atomic.
    TMP_CADDYFILE="$(mktemp /etc/caddy/Caddyfile.tmp.XXXXXX)"
    chown bruce:bruce "${TMP_CADDYFILE}"
    chmod 0644 "${TMP_CADDYFILE}"
    {
        echo "import conf.d/*.caddy"
        echo
        cat "${CADDYFILE}"
    } > "${TMP_CADDYFILE}"
    mv "${TMP_CADDYFILE}" "${CADDYFILE}"
    chown bruce:bruce "${CADDYFILE}"
    log "prepended 'import conf.d/*.caddy' to ${CADDYFILE}"
    TOP_IMPORT_CHANGED=1
fi

# ── Step 5: Ensure `import liv_assistant` inside the bruce.livinity.io site block ─
# Detection: the existing block looks like `bruce.livinity.io {` (optionally with
# scheme prefixes). If a line containing `import liv_assistant` already exists,
# we assume it is correctly placed (inside the block) and skip. Else, we insert
# it on the line immediately after the opening `bruce.livinity.io {` brace.
if grep -qE '^[[:space:]]*import[[:space:]]+liv_assistant[[:space:]]*$' "${CADDYFILE}"; then
    log "Caddyfile already has 'import liv_assistant'"
    SITE_IMPORT_CHANGED=0
else
    if ! grep -qE '^[[:space:]]*bruce\.livinity\.io[[:space:]]*\{' "${CADDYFILE}"; then
        fail "no 'bruce.livinity.io {' site block found in ${CADDYFILE} — cannot wire snippet; check livinityd-managed config (feedback_caddyfile_must_be_bruce_owned)"
    fi
    TMP_CADDYFILE="$(mktemp /etc/caddy/Caddyfile.tmp.XXXXXX)"
    chown bruce:bruce "${TMP_CADDYFILE}"
    chmod 0644 "${TMP_CADDYFILE}"
    # Insert `import liv_assistant` on the line immediately after the opening brace
    # of the bruce.livinity.io block. Use awk for portability (no GNU-sed -i quirks).
    awk '
        /^[[:space:]]*bruce\.livinity\.io[[:space:]]*\{/ && !inserted {
            print
            print "\timport liv_assistant"
            inserted = 1
            next
        }
        { print }
    ' "${CADDYFILE}" > "${TMP_CADDYFILE}"
    if ! grep -qE '^[[:space:]]*import[[:space:]]+liv_assistant[[:space:]]*$' "${TMP_CADDYFILE}"; then
        rm -f "${TMP_CADDYFILE}"
        fail "awk insertion failed — 'import liv_assistant' not present in temp file"
    fi
    mv "${TMP_CADDYFILE}" "${CADDYFILE}"
    chown bruce:bruce "${CADDYFILE}"
    log "inserted 'import liv_assistant' inside bruce.livinity.io { ... } block"
    SITE_IMPORT_CHANGED=1
fi

# ── Step 6: Caddy validate (HARD GATE — non-zero exit aborts caller) ───────
if ! caddy validate --config "${CADDYFILE}" 2>&1 | tail -20; then
    fail "caddy validate failed — refusing to claim success. See output above."
fi
log "caddy validate ${CADDYFILE} = OK"

# ── Step 7: Summary ────────────────────────────────────────────────────────
log "summary: snippet_changed=${SNIPPET_CHANGED} top_import_changed=${TOP_IMPORT_CHANGED} site_import_changed=${SITE_IMPORT_CHANGED}"

# Re-run determinism: if all three CHANGED vars are 0, this was a pure no-op.
if [[ "${SNIPPET_CHANGED}" -eq 0 && "${TOP_IMPORT_CHANGED}" -eq 0 && "${SITE_IMPORT_CHANGED}" -eq 0 ]]; then
    log "no-op: all artifacts already in place (idempotent re-run)"
fi

exit 0
