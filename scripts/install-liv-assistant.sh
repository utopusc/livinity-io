#!/usr/bin/env bash
# install-liv-assistant.sh
#
# Idempotent installer for the vendored AionUi v2.1.4 binary distribution
# that powers Liv Assistant (v42 milestone, Phase 223).
#
# Strategy: vendor-and-wrap (no source fork). See:
#   - .planning/phases/222-aionui-spike/222-SPIKE.md  (feasibility evidence)
#   - .planning/milestones/v42/PROJECT.md              (locked invariants)
#
# Locked invariants enforced by this script:
#   - D-V42-NO-DATA-LOSS  : never wipes ${DATA_DIR}; only manages binary tree
#   - D-V42-APACHE-NOTICE : preserves Apache LICENSE alongside the binary tree
#   - D-V42-NO-PHONE-HOME : no telemetry; tarball SHA pinned, no live drift
#
# This script does NOT touch any path under liv/packages/core/ (sacred SHA
# f3538e1d811992b782a9bb057d1b7f0a0189f95f). It is repo-side only; it ships
# to the Mini PC under /opt/livos/scripts/ and is invoked by Phase 223-05.

set -euo pipefail
IFS=$'\n\t'

# ---------------------------------------------------------------------------
# Pinned constants (DO NOT EDIT without bumping Phase + re-running spike)
# ---------------------------------------------------------------------------
AIONUI_VERSION="2.1.4"
AIONUI_ARCH="linux-x86_64"
AIONUI_TARBALL="aionui-web-${AIONUI_VERSION}-${AIONUI_ARCH}.tar.gz"
AIONUI_URL="https://github.com/iOfficeAI/AionUi/releases/download/v${AIONUI_VERSION}/${AIONUI_TARBALL}"
EXPECTED_SHA256="0bb02d0028d932c2e65e676c63074bcee2079508aa954e088c16ece92ba36778"

INSTALL_ROOT="/opt/liv-assistant"
CACHE_DIR="${INSTALL_ROOT}/cache"
VERSION_DIR="${INSTALL_ROOT}/aionui-web-${AIONUI_VERSION}"
CURRENT_LINK="${INSTALL_ROOT}/current"
DATA_DIR="${INSTALL_ROOT}/data"

BRUCE_USER="bruce"
BRUCE_HOME="/home/bruce"
BUN_DIR="${BRUCE_HOME}/.bun"
BUN_BIN="${BUN_DIR}/bin/bun"

# Upstream LICENSE URL (Apache-2.0). Binary tarball historically omits LICENSE;
# we fetch from the source tree at the same pinned tag for legal preservation.
UPSTREAM_LICENSE_URL="https://raw.githubusercontent.com/iOfficeAI/AionUi/v${AIONUI_VERSION}/LICENSE"
UPSTREAM_NOTICE_URL="https://raw.githubusercontent.com/iOfficeAI/AionUi/v${AIONUI_VERSION}/NOTICE"

# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------
log() { echo "[install-liv-assistant] $*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
[[ $EUID -eq 0 ]] || die "Run as root (use sudo)"

for c in curl tar sha256sum install ln id chown chmod; do
  command -v "$c" >/dev/null 2>&1 || die "Missing dependency: $c"
done

id "${BRUCE_USER}" >/dev/null 2>&1 || die "User ${BRUCE_USER} does not exist"

log "Pre-flight OK — running as root, all deps present, ${BRUCE_USER} user exists"

# ---------------------------------------------------------------------------
# Directory bootstrap (idempotent)
# ---------------------------------------------------------------------------
install -d -m 0755 -o root -g root "${INSTALL_ROOT}"
install -d -m 0755 -o root -g root "${CACHE_DIR}"
install -d -m 0755 -o "${BRUCE_USER}" -g "${BRUCE_USER}" "${DATA_DIR}"

log "Directories ready: ${INSTALL_ROOT} ${CACHE_DIR} ${DATA_DIR}"

# ---------------------------------------------------------------------------
# Download tarball if missing OR sha mismatch
# ---------------------------------------------------------------------------
TARBALL_PATH="${CACHE_DIR}/${AIONUI_TARBALL}"

if [[ -f "${TARBALL_PATH}" ]]; then
  ACTUAL_SHA="$(sha256sum "${TARBALL_PATH}" | awk '{print $1}')"
  if [[ "${ACTUAL_SHA}" == "${EXPECTED_SHA256}" ]]; then
    log "Cached tarball SHA matches; skipping download"
  else
    log "Cached tarball SHA mismatch (got ${ACTUAL_SHA}); re-downloading"
    rm -f "${TARBALL_PATH}"
  fi
fi

if [[ ! -f "${TARBALL_PATH}" ]]; then
  log "Downloading ${AIONUI_URL}"
  curl -fSL --retry 3 --retry-delay 2 -o "${TARBALL_PATH}.partial" "${AIONUI_URL}"
  mv "${TARBALL_PATH}.partial" "${TARBALL_PATH}"
fi

# ---------------------------------------------------------------------------
# SHA256 verify (HARD GATE — abort before extract if mismatch)
# ---------------------------------------------------------------------------
ACTUAL_SHA="$(sha256sum "${TARBALL_PATH}" | awk '{print $1}')"
if [[ "${ACTUAL_SHA}" != "${EXPECTED_SHA256}" ]]; then
  rm -f "${TARBALL_PATH}"
  die "SHA256 mismatch: expected ${EXPECTED_SHA256}, got ${ACTUAL_SHA}. Tarball deleted. Aborting."
fi
log "SHA256 verified: ${EXPECTED_SHA256}"

# ---------------------------------------------------------------------------
# Extract (idempotent — only if version dir doesn't contain the binary)
# ---------------------------------------------------------------------------
if [[ -x "${VERSION_DIR}/aionui-web/aionui-web" ]]; then
  log "Already extracted at ${VERSION_DIR}; skipping extraction"
else
  log "Extracting to ${VERSION_DIR}"
  install -d -m 0755 -o root -g root "${VERSION_DIR}"
  tar -xzf "${TARBALL_PATH}" -C "${VERSION_DIR}"
  chown -R root:root "${VERSION_DIR}"
  chmod +x "${VERSION_DIR}/aionui-web/aionui-web"
  if [[ -f "${VERSION_DIR}/aionui-web/bundled-aioncore/linux-x64/aioncore" ]]; then
    chmod +x "${VERSION_DIR}/aionui-web/bundled-aioncore/linux-x64/aioncore"
  fi
fi

# ---------------------------------------------------------------------------
# `current` symlink (atomic update via ln -sfn)
# ---------------------------------------------------------------------------
ln -sfn "${VERSION_DIR}/aionui-web" "${CURRENT_LINK}"
log "Symlinked ${CURRENT_LINK} -> ${VERSION_DIR}/aionui-web"

# ---------------------------------------------------------------------------
# Preserve Apache LICENSE + NOTICE at install root (D-V42-APACHE-NOTICE)
# ---------------------------------------------------------------------------
# Prefer in-tarball copies if present (some upstream builds bundle them).
if [[ -f "${VERSION_DIR}/aionui-web/LICENSE" ]]; then
  install -m 0644 -o root -g root "${VERSION_DIR}/aionui-web/LICENSE" "${INSTALL_ROOT}/LICENSE"
  log "Copied LICENSE from tarball"
elif [[ ! -f "${INSTALL_ROOT}/LICENSE" ]]; then
  log "LICENSE not in tarball; fetching from ${UPSTREAM_LICENSE_URL}"
  if curl -fSL --retry 3 --retry-delay 2 -o "${INSTALL_ROOT}/LICENSE.partial" "${UPSTREAM_LICENSE_URL}"; then
    mv "${INSTALL_ROOT}/LICENSE.partial" "${INSTALL_ROOT}/LICENSE"
    chown root:root "${INSTALL_ROOT}/LICENSE"
    chmod 0644 "${INSTALL_ROOT}/LICENSE"
  else
    rm -f "${INSTALL_ROOT}/LICENSE.partial"
    log "WARN: upstream LICENSE fetch failed; writing Apache-2.0 reference stub"
    cat > "${INSTALL_ROOT}/LICENSE" <<'EOF'
Apache License 2.0 — upstream: https://github.com/iOfficeAI/AionUi/blob/main/LICENSE
The bundled binary aionui-web is distributed under Apache-2.0 by iOfficeAI.
Full license text: https://www.apache.org/licenses/LICENSE-2.0
EOF
    chown root:root "${INSTALL_ROOT}/LICENSE"
    chmod 0644 "${INSTALL_ROOT}/LICENSE"
  fi
else
  log "LICENSE already present at ${INSTALL_ROOT}/LICENSE; leaving untouched"
fi

if [[ -f "${VERSION_DIR}/aionui-web/NOTICE" ]]; then
  install -m 0644 -o root -g root "${VERSION_DIR}/aionui-web/NOTICE" "${INSTALL_ROOT}/NOTICE"
  log "Copied NOTICE from tarball"
elif [[ ! -f "${INSTALL_ROOT}/NOTICE" ]]; then
  if curl -fSL --retry 2 --retry-delay 2 -o "${INSTALL_ROOT}/NOTICE.partial" "${UPSTREAM_NOTICE_URL}" 2>/dev/null; then
    mv "${INSTALL_ROOT}/NOTICE.partial" "${INSTALL_ROOT}/NOTICE"
    chown root:root "${INSTALL_ROOT}/NOTICE"
    chmod 0644 "${INSTALL_ROOT}/NOTICE"
    log "Fetched upstream NOTICE"
  else
    rm -f "${INSTALL_ROOT}/NOTICE.partial"
    log "Upstream NOTICE not present (404 expected); writing minimal attribution"
    cat > "${INSTALL_ROOT}/NOTICE" <<EOF
Liv Assistant bundles the AionUi web binary (https://github.com/iOfficeAI/AionUi).
AionUi is Copyright (c) iOfficeAI and contributors, licensed under Apache-2.0.
This product includes software developed by the AionUi project.
Version: ${AIONUI_VERSION}
SHA256:  ${EXPECTED_SHA256}
EOF
    chown root:root "${INSTALL_ROOT}/NOTICE"
    chmod 0644 "${INSTALL_ROOT}/NOTICE"
  fi
fi

# ---------------------------------------------------------------------------
# Phase 234-03 — vendored-binary brand rebrand (AionUi -> Liv AI)
#
# Idempotent sed-replace targeting ONLY HTML/JS/CSS files under
# ${CURRENT_LINK}/static/. EXCLUDES LICENSE + NOTICE files by path-scoping
# (LICENSE/NOTICE live at ${INSTALL_ROOT} level, NOT inside the version dir's
# static/ subtree -- so D-V42-APACHE-NOTICE Apache-2.0 attribution preservation
# is enforced structurally by the find target, not by an exclude filter).
#
# Pre-check guard makes this a no-op on the second and later runs against a
# cmp-stable tarball: we grep for any remaining AionUi/aionui strings in the
# filtered file set; zero matches => skip the sed pass entirely.
#
# Why HTML/JS/CSS only: the upstream "AionUi" brand appears in the React SPA
# bundle text (HTML page titles, JS string literals, CSS comment blocks). It
# does NOT appear in LICENSE/NOTICE in a user-visible way (LICENSE/NOTICE
# files are operator-facing only; their AionUi references are legally
# required attribution and MUST survive).
#
# Why CURRENT_LINK/static and not the whole tree: scoping to static/ excludes
# package.json (whose "name": "aionui-web" is required by Bun's package
# resolution -- changing it breaks runtime), the 94MB aionui-web Bun binary
# (corrupt if sed-edited), and the bundled-aioncore Rust binary. See
# .planning/phases/234-liv-ai-polish-ux/234-01-INVESTIGATION.md Section F.5
# for the full file-disposition table.
#
# Sed pattern ordering matters: s/aionui-web/.../g MUST precede s/aionui/.../g
# to preserve the compound rewrite (aionui-web -> liv-ai-web, NOT liv-ai-web
# after a naive replace).
# ---------------------------------------------------------------------------
REBRAND_TARGET="$(readlink -f "${CURRENT_LINK}")/static"
if [[ -d "${REBRAND_TARGET}" ]]; then
  PRE_HITS="$(grep -ril 'AionUi\|aionui' "${REBRAND_TARGET}" --include='*.html' --include='*.js' --include='*.css' 2>/dev/null | wc -l)"
  if [[ "${PRE_HITS}" -gt 0 ]]; then
    log "Rebrand: applying AionUi -> Liv AI / aionui-web -> liv-ai-web / aionui -> liv-ai sed pass on ${PRE_HITS} files"
    find "${REBRAND_TARGET}" \( -name '*.html' -o -name '*.js' -o -name '*.css' \) \
         -exec sed -i 's/AionUi/Liv AI/g; s/aionui-web/liv-ai-web/g; s/aionui/liv-ai/g' {} +
    POST_HITS="$(grep -ril 'AionUi\|aionui' "${REBRAND_TARGET}" --include='*.html' --include='*.js' --include='*.css' 2>/dev/null | wc -l)"
    if [[ "${POST_HITS}" -ne 0 ]]; then
      log "WARN: ${POST_HITS} files still contain AionUi/aionui after sed pass (investigate non-replaceable variants)"
    else
      log "Rebrand: all AionUi/aionui strings replaced (verified by post-grep)"
    fi
  else
    log "Rebrand: AionUi/aionui strings already replaced (or absent); skipping sed pass"
  fi
else
  log "Rebrand: WARN ${REBRAND_TARGET} missing; skipping rebrand step"
fi

# ---------------------------------------------------------------------------
# Phase 235 — absolute API/WS path rewrite (AionUi JS bundle hot-fix)
#
# AionUi's vendored JS bundle issues requests to ROOT-relative paths
# (/api/..., /ws). When iframe-mounted at https://bruce.livinity.io/liv/, the
# browser resolves those against the iframe's ORIGIN, NOT its path -- so they
# hit https://bruce.livinity.io/api/... which the Caddy LIV_ASSISTANT_HANDLE
# (`@liv path /liv /liv/*` + `uri strip_prefix /liv`) does NOT match. Result:
# /api/* requests fall through to the LivOS shell (root domain), which 404s.
#
# Fix: rewrite the JS/HTML/CSS bundle in place so absolute paths carry the
# `/liv` prefix the matcher needs. Caddy then strips `/liv` and forwards
# `/api/...` to AionUi :3020 unchanged.
#
# Patterns covered (all quoted-string forms in JS sources):
#   "/api/  -> "/liv/api/
#   '/api/  -> '/liv/api/
#   `/api/  -> `/liv/api/
#   "/ws"   -> "/liv/ws"
#   '/ws'   -> '/liv/ws'
#   `/ws`   -> `/liv/ws`
#
# Idempotency guard: find files containing the UNPREFIXED quoted forms whose
# content does NOT yet carry the PREFIXED form. Zero such files => no-op.
# Scope is ${REBRAND_TARGET}=${CURRENT_LINK}/static/, so LICENSE+NOTICE at
# ${INSTALL_ROOT}/ remain outside the find walk (D-V42-APACHE-NOTICE).
# ---------------------------------------------------------------------------
if [[ -d "${REBRAND_TARGET}" ]]; then
  PATH_PRE_HITS="$(grep -rEl '"/api/|`/api/|"/ws"|`/ws`' \
    "${REBRAND_TARGET}" --include='*.html' --include='*.js' --include='*.css' \
    2>/dev/null \
    | xargs -r grep -LE '"/liv/api/|`/liv/api/|"/liv/ws"|`/liv/ws`' 2>/dev/null \
    | wc -l)"
  if [[ "${PATH_PRE_HITS}" -gt 0 ]]; then
    log "Path rewrite: applying /api/ -> /liv/api/ and /ws -> /liv/ws sed pass on ${PATH_PRE_HITS} files"
    find "${REBRAND_TARGET}" \( -name '*.html' -o -name '*.js' -o -name '*.css' \) \
         -exec sed -i \
           -e 's|"/api/|"/liv/api/|g' \
           -e "s|'/api/|'/liv/api/|g" \
           -e 's|`/api/|`/liv/api/|g' \
           -e 's|"/ws"|"/liv/ws"|g' \
           -e "s|'/ws'|'/liv/ws'|g" \
           -e 's|`/ws`|`/liv/ws`|g' \
           {} +
    POST_HITS="$(grep -rEl '"/api/|`/api/|"/ws"|`/ws`' \
      "${REBRAND_TARGET}" --include='*.html' --include='*.js' --include='*.css' \
      2>/dev/null \
      | xargs -r grep -LE '"/liv/api/|`/liv/api/|"/liv/ws"|`/liv/ws`' 2>/dev/null \
      | wc -l)"
    log "Path rewrite: post-pass unprefixed-only file count = ${POST_HITS}"
  else
    log "Path rewrite: absolute API/WS paths already prefixed (or absent); skipping sed pass"
  fi
else
  log "Path rewrite: WARN ${REBRAND_TARGET} missing; skipping path rewrite step"
fi

# LICENSE + NOTICE byte-identity check (defensive -- sed pass should never
# touch them because they live at ${INSTALL_ROOT}, not inside the static/
# subtree the find above traverses). If a future code change broadens the
# find target, this log line will surface the regression.
for guard in LICENSE NOTICE; do
  if [[ -f "${INSTALL_ROOT}/${guard}" ]]; then
    if grep -q 'AionUi' "${INSTALL_ROOT}/${guard}" 2>/dev/null; then
      log "OK: ${INSTALL_ROOT}/${guard} still contains AionUi attribution (Apache-2.0 preserved)"
    fi
  fi
done

# ---------------------------------------------------------------------------
# Install bun if missing (Claude Code ACP bridge requires it)
# See 222-SPIKE.md "Bun runtime dependency" — risk #3.
# ---------------------------------------------------------------------------
if [[ -x "${BUN_BIN}" ]] || command -v bun >/dev/null 2>&1; then
  log "bun already installed; skipping bun.sh/install"
else
  log "Installing bun to ${BUN_DIR} (as ${BRUCE_USER})"
  sudo -u "${BRUCE_USER}" -H bash -c 'curl -fsSL https://bun.sh/install | bash'
  [[ -x "${BUN_BIN}" ]] || die "bun install reported success but ${BUN_BIN} not executable"
  log "bun installed: $(${BUN_BIN} --version 2>/dev/null || echo unknown)"
fi

# ---------------------------------------------------------------------------
# Write UPSTREAM.md provenance (regenerated each run — idempotent because
# inputs are pinned constants; only the install-date line varies, which is
# acceptable for an idempotent run-tracker but DOES produce a `diff` on
# repeat runs. To keep the find/diff acceptance check clean, we only write
# UPSTREAM.md if it's missing OR its content (modulo timestamp) differs.)
# ---------------------------------------------------------------------------
UPSTREAM_MD="${INSTALL_ROOT}/UPSTREAM.md"

write_upstream_md() {
  cat > "${UPSTREAM_MD}.partial" <<EOF
# AionUi upstream provenance

This directory contains a vendored, unmodified copy of AionUi.

- **Upstream repo:** https://github.com/iOfficeAI/AionUi
- **Release URL:** ${AIONUI_URL}
- **Version:** ${AIONUI_VERSION}
- **Architecture:** ${AIONUI_ARCH}
- **SHA256 (pinned):** ${EXPECTED_SHA256}
- **License:** Apache-2.0 (see ./LICENSE)
- **Vendored on (first install):** $(date -u +%Y-%m-%dT%H:%M:%SZ)
- **Installer:** scripts/install-liv-assistant.sh (livinity-io repo)
- **Vendor strategy:** binary tarball, no source fork (per Phase 222 spike verdict)

Do NOT edit files under ${VERSION_DIR}/ in place — they are upstream-owned.
Brand overrides ship via Caddy 'sub' directive (Phase 232), not source patches.
EOF
  mv "${UPSTREAM_MD}.partial" "${UPSTREAM_MD}"
  chown root:root "${UPSTREAM_MD}"
  chmod 0644 "${UPSTREAM_MD}"
}

if [[ ! -f "${UPSTREAM_MD}" ]]; then
  log "Writing ${UPSTREAM_MD}"
  write_upstream_md
else
  # Compare ignoring the "Vendored on" timestamp line — if everything else
  # matches, leave the file alone to preserve the original install date and
  # keep `find | diff` zero-diff on repeat runs.
  EXISTING_FINGERPRINT="$(grep -v '^- \*\*Vendored on' "${UPSTREAM_MD}" 2>/dev/null || true)"
  NEW_FINGERPRINT="$(cat <<EOF
# AionUi upstream provenance

This directory contains a vendored, unmodified copy of AionUi.

- **Upstream repo:** https://github.com/iOfficeAI/AionUi
- **Release URL:** ${AIONUI_URL}
- **Version:** ${AIONUI_VERSION}
- **Architecture:** ${AIONUI_ARCH}
- **SHA256 (pinned):** ${EXPECTED_SHA256}
- **License:** Apache-2.0 (see ./LICENSE)
- **Installer:** scripts/install-liv-assistant.sh (livinity-io repo)
- **Vendor strategy:** binary tarball, no source fork (per Phase 222 spike verdict)

Do NOT edit files under ${VERSION_DIR}/ in place — they are upstream-owned.
Brand overrides ship via Caddy 'sub' directive (Phase 232), not source patches.
EOF
)"
  if [[ "${EXISTING_FINGERPRINT}" == "${NEW_FINGERPRINT}" ]]; then
    log "UPSTREAM.md unchanged (pinned inputs identical); preserving timestamp"
  else
    log "UPSTREAM.md fingerprint changed; rewriting"
    write_upstream_md
  fi
fi

# ---------------------------------------------------------------------------
# Phase 232: install branding assets to /etc/liv-assistant/branding/
# Repo source: caddy/branding/{livinity-overlay.css,favicon.svg,manifest.json}
# Destination: /etc/liv-assistant/branding/ (served by Caddy via livinityd-
# emitted /liv/branding/* handler — see livos/packages/livinityd/source/
# modules/domain/caddy.ts LIV_BRANDING_HANDLE constant).
# Idempotent via `cmp -s` — files only written when content differs.
# ---------------------------------------------------------------------------
BRANDING_DST="/etc/liv-assistant/branding"
install -d -m 0755 -o root -g root "${BRANDING_DST}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANDING_SRC="${SCRIPT_DIR}/../caddy/branding"

if [[ ! -d "${BRANDING_SRC}" ]]; then
  log "WARN: ${BRANDING_SRC} not found; skipping Phase 232 branding overlay install"
else
  for asset in livinity-overlay.css favicon.svg manifest.json; do
    SRC="${BRANDING_SRC}/${asset}"
    DST="${BRANDING_DST}/${asset}"
    if [[ ! -f "${SRC}" ]]; then
      log "WARN: source asset missing: ${SRC}; skipping ${asset}"
      continue
    fi
    if [[ -f "${DST}" ]] && cmp -s "${SRC}" "${DST}"; then
      log "Branding asset ${asset}: unchanged"
    else
      install -m 0644 -o root -g root "${SRC}" "${DST}"
      log "Branding asset ${asset}: copied"
    fi
  done
fi

# ---------------------------------------------------------------------------
# Final summary
# ---------------------------------------------------------------------------
log "Install complete:"
log "  Version: ${AIONUI_VERSION}"
log "  Binary:  ${CURRENT_LINK}/aionui-web"
log "  Backend: ${CURRENT_LINK}/bundled-aioncore/linux-x64/aioncore"
log "  Data:    ${DATA_DIR}    (owned by ${BRUCE_USER})"
log "  License: ${INSTALL_ROOT}/LICENSE"
log "  Notice:  ${INSTALL_ROOT}/NOTICE"
log "  Bun:     ${BUN_BIN}"
log "  Branding: ${BRANDING_DST} (Phase 232 — livinity-overlay.css + favicon.svg + manifest.json)"
log "Next: systemctl daemon-reload && systemctl enable --now liv-assistant"
