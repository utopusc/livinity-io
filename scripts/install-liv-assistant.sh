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
    find "${REBRAND_TARGET}" \( -name '*.html' -o -name '*.js' -o -name '*.css' \) ! -name 'liv-240-*' \
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
# Helper: count files containing UNPREFIXED quoted API/WS forms whose content
# does NOT yet carry the prefixed form. Wrapped in a function so we can
# temporarily disable pipefail (grep -L exits 1 when zero files print; under
# `set -euo pipefail` that nonzero kills the parent shell at command-
# substitution time). The function locally `set +o pipefail` + always
# `echo` a numeric result + always `return 0`.
count_unprefixed_paths() {
  local target="$1"
  set +o pipefail
  local n
  n="$(grep -rEl '"/api/|`/api/|"/ws"|`/ws`' \
    "${target}" --include='*.html' --include='*.js' --include='*.css' \
    2>/dev/null \
    | xargs -r grep -LE '"/liv/api/|`/liv/api/|"/liv/ws"|`/liv/ws`' 2>/dev/null \
    | wc -l)"
  set -o pipefail
  echo "${n:-0}"
  return 0
}

if [[ -d "${REBRAND_TARGET}" ]]; then
  PATH_PRE_HITS="$(count_unprefixed_paths "${REBRAND_TARGET}")"
  if [[ "${PATH_PRE_HITS}" -gt 0 ]]; then
    log "Path rewrite: applying /api/ -> /liv/api/ and /ws -> /liv/ws sed pass on ${PATH_PRE_HITS} files"
    find "${REBRAND_TARGET}" \( -name '*.html' -o -name '*.js' -o -name '*.css' \) ! -name 'liv-240-*' \
         -exec sed -i \
           -e 's|"/api/|"/liv/api/|g' \
           -e "s|'/api/|'/liv/api/|g" \
           -e 's|`/api/|`/liv/api/|g' \
           -e 's|"/ws"|"/liv/ws"|g' \
           -e "s|'/ws'|'/liv/ws'|g" \
           -e 's|`/ws`|`/liv/ws`|g' \
           {} +
    POST_HITS="$(count_unprefixed_paths "${REBRAND_TARGET}")"
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
# Phase 240-02 — inject Local Agents install section
#
# Ships a standalone JS + CSS pair into the post-extract static/assets/ dir
# of the AionUi bundle, plus a <script> + <link> reference appended to
# static/index.html before </head>. The standalone module mounts an
# "Available to Install" subsection into the Local Agents tab via the
# MutationObserver strategy locked in 240-02-INVESTIGATION.md (option-a).
#
# The injected JS calls livinityd's cliInstaller.{detect,install,auth} tRPC
# procedures via the Phase 226 Caddy /liv proxy (browser-side fetch to
# /liv/trpc/cliInstaller.* gets strip-prefixed by Caddy and forwarded to
# livinityd :8080).
#
# Idempotency / freshness (G17 fix): the OLD logic skipped the ENTIRE block
# (including the asset copy) whenever the sentinel was already present in
# index.html — so an UPDATED patch JS (e.g. the G17 terminal-auth postMessage
# rewrite) NEVER overwrote the deployed copy on `update.sh` re-runs. Split the
# two concerns:
#   1. ALWAYS copy the JS/CSS into static/assets/ (idempotent — refreshes on
#      every deploy so a patch revision actually lands).
#   2. Cache-bust: stamp the <script>/<link> with `?v=<sha256-of-js>` so the
#      browser HTTP cache picks up a changed JS even with the same filename.
#      Insert the tags only when the sentinel is absent; otherwise rewrite the
#      existing `?v=` to the current sha (no duplicate tags).
#
# D-V42-APACHE-NOTICE: scoped under ${CURRENT_LINK}/static/ — LICENSE +
# NOTICE files at ${INSTALL_ROOT}/ are structurally excluded.
# ---------------------------------------------------------------------------
PATCH_SRC_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}/aionui-patches"
PATCH_TARGET_DIR="${REBRAND_TARGET}/assets"
PATCH_INDEX_HTML="${REBRAND_TARGET}/index.html"

if [[ -d "${PATCH_TARGET_DIR}" && -f "${PATCH_INDEX_HTML}" ]]; then
  if [[ -f "${PATCH_SRC_DIR}/local-agents-install-section.js" && -f "${PATCH_SRC_DIR}/local-agents-install-section.css" ]]; then
    # 1. ALWAYS refresh the deployed assets (this is the G17 fix — previously
    #    gated behind the sentinel grep and so never re-copied on updates).
    install -m 0644 -o root -g root "${PATCH_SRC_DIR}/local-agents-install-section.js" "${PATCH_TARGET_DIR}/liv-240-install-section.js"
    install -m 0644 -o root -g root "${PATCH_SRC_DIR}/local-agents-install-section.css" "${PATCH_TARGET_DIR}/liv-240-install-section.css"

    # 2. Content-hash cache-bust token (first 12 hex of the JS sha256).
    PATCH_JS_VER="$(sha256sum "${PATCH_TARGET_DIR}/liv-240-install-section.js" | cut -c1-12)"

    if grep -q 'liv-240-install-section.js' "${PATCH_INDEX_HTML}" 2>/dev/null; then
      # Tags already present — just rewrite the ?v= token to the new hash so a
      # changed JS busts the browser cache (matches the file in place).
      sed -i -E "s#(liv-240-install-section\.(js|css))(\?v=[0-9a-f]+)?#\1?v=${PATCH_JS_VER}#g" "${PATCH_INDEX_HTML}"
      log "Phase 240-02 (G17): Local Agents assets refreshed; cache-bust ?v=${PATCH_JS_VER}"
    else
      # First-time inject — tags carry the ?v= token from the start.
      sed -i "/<\/head>/i \    <link rel=\"stylesheet\" href=\"./assets/liv-240-install-section.css?v=${PATCH_JS_VER}\" />\n    <script src=\"./assets/liv-240-install-section.js?v=${PATCH_JS_VER}\" defer></script>" "${PATCH_INDEX_HTML}"
      if grep -q 'liv-240-install-section.js' "${PATCH_INDEX_HTML}" 2>/dev/null; then
        log "Phase 240-02: Local Agents install section injected (JS + CSS + index.html refs, ?v=${PATCH_JS_VER})"
      else
        log "WARN: Phase 240-02: index.html injection sed pass did not register; investigate </head> anchor"
      fi
    fi
  else
    log "Phase 240-02: WARN patch sources missing at ${PATCH_SRC_DIR}; skipping injection"
  fi
else
  log "Phase 240-02: WARN ${PATCH_TARGET_DIR} or ${PATCH_INDEX_HTML} missing; skipping injection"
fi

# ---------------------------------------------------------------------------
# G13e — AionUi ships its OWN caching service worker (sw.js, precaches index.html
# + './'). Inside the always-online LivOS iframe it provides ZERO value and
# repeatedly served STALE assets after we patch the bundle: a browser holding the
# prior SW kept running old liv-240 JS (→ old tRPC {json} wire shape → 400
# invalid_type) or the old routing fallback (→ AionUi HTML → "Unexpected token
# '<'"), and a cache-version bump alone could not be picked up reliably. Replace
# it with a self-destroying stub (mirrors LivOS's own sw.js): on next load it
# unregisters itself + deletes ALL caches, so AionUi assets are ALWAYS served
# fresh by Caddy. Idempotent via the 'self-destruct stub' sentinel.
# ---------------------------------------------------------------------------
SW_FILE="${REBRAND_TARGET}/sw.js"
if [[ -f "${SW_FILE}" ]] && ! grep -q 'self-destruct stub' "${SW_FILE}" 2>/dev/null; then
  [[ -f "${SW_FILE}.caching-orig" ]] || cp "${SW_FILE}" "${SW_FILE}.caching-orig"
  cat > "${SW_FILE}" <<'LIVSW'
// LivOS — AionUi caching SW caused stale-asset bugs inside the always-online LivOS
// iframe. self-destruct stub: unregister + clear all caches on next load so assets
// are always fresh from Caddy. (Mirrors LivOS's own sw.js.)
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(
    self.registration.unregister()
      .then(function () { return self.caches.keys(); })
      .then(function (keys) { return Promise.all(keys.map(function (k) { return self.caches.delete(k); })); })
      .then(function () { return self.clients.matchAll(); })
      .then(function (clients) { clients.forEach(function (c) { if (c.navigate) { try { c.navigate(c.url); } catch (_) {} } }); })
  );
});
LIVSW
  log "Phase 240-02 (G13e): AionUi sw.js replaced with self-destruct stub — ends stale-cache asset bugs"
fi

# ---------------------------------------------------------------------------
# Phase 238 Step A — Livinity logo asset overlay
#
# Copies the Livinity logo SVG(s) from the cloned repo's caddy/branding/ dir
# into AionUi bundle logo asset target paths inside ${CURRENT_LINK}/static/.
#
# Idempotent via cmp -s — only writes when content differs (file mtime is
# preserved on no-op, which keeps the rest of install-liv-assistant.sh's
# cmp-stable tarball pattern intact).
#
# Plan 238-02 Section C disposition table found ZERO on-disk AionUi-branded
# logo assets requiring overlay (the 3 PWA icons are out-of-scope; the Lark
# SVG is third-party trademark; theme covers + pet animations are cosmetic
# non-brand). Hence LOGO_TARGETS=() ships empty — the framework is FORWARD
# COMPATIBLE for any future operator-supplied target list. The WARN-skip
# path below is the EXPECTED steady-state.
#
# D-V43-APACHE-NOTICE: target paths are strictly inside
# ${CURRENT_LINK}/static/; LICENSE + NOTICE at ${INSTALL_ROOT}/ are
# structurally outside this scope.
# ---------------------------------------------------------------------------
# REPO_BRANDING_DIR points at the cloned repo's caddy/branding/ dir.
# update.sh runs this script from /tmp/livinity-update-<pid>/scripts/, so
# the sibling caddy/branding/ subtree is reachable via ../caddy/branding.
REPO_BRANDING_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/caddy/branding"
LOGO_SRC="${REPO_BRANDING_DIR}/liv-logo.svg"
LOGO_TARGETS=(
  # Empty per Plan 238-02 Section C disposition table — no AionUi-branded
  # logo asset found on disk in /opt/liv-assistant/current/static/. Reserved
  # for future use; operator can append target paths here if/when AionUi
  # upstream ships a logo asset, or if Livinity-branded PWA icons are
  # introduced. The WARN-no-targets log line below is expected steady-state.
)

if [[ -f "${LOGO_SRC}" ]] && [[ "${#LOGO_TARGETS[@]}" -gt 0 ]]; then
  for tgt in "${LOGO_TARGETS[@]}"; do
    if [[ -e "${tgt}" ]]; then
      if cmp -s "${LOGO_SRC}" "${tgt}"; then
        log "Logo overlay: ${tgt} already matches Livinity logo; skipping"
      else
        install -m 0644 -o root -g root "${LOGO_SRC}" "${tgt}"
        log "Logo overlay: ${tgt} overwritten with Livinity logo"
      fi
    else
      log "Logo overlay: WARN target ${tgt} missing (path drift from Plan 238-02); skipping"
    fi
  done
else
  log "Logo overlay: no targets configured (Plan 238-02 Section C found zero overlay candidates); skipping logo overlay step"
fi

# ---------------------------------------------------------------------------
# Phase 238 Step B — Case-insensitive word-boundary Aion -> Liv sed pass
#
# Phase 234-03's sed pass was case-sensitive and pattern-matched the
# compound AionUi / aionui-web / aionui literal strings. It MISSED orphan
# standalone tokens (no `Ui` suffix, no `-web` compound) such as inline
# CSS class selectors `.aion-url-viewer-toolbar` and `.aion-file-changes-
# panel` baked into the JS bundle (operator surfaced this gap during live
# UAT on 2026-05-27 night).
#
# Word-boundary regex `\b(Aion|AION|aion)\b` is REQUIRED to avoid
# catastrophically mangling 311+ dictionary-word occurrences inside the
# bundle (Plan 238-02 Section E.1: tension=108, version=90, application=
# 36, region=29, etc.). With `\b` the regex correctly matches ONLY
# standalone tokens — `tension` and `version` are safe; `.aion-url-...`
# is rewritten because the `.` and `-` are non-word boundaries.
#
# Plan 238-02 Section E.2 dry-run: 7 files in scope (PRE). Plan 238-03
# verifies PRE=7 -> POST=0 on Mini PC deploy.
#
# Idempotency: grep-pre-check skips entirely when no word-boundary
# matches remain; post-grep verify warns if any survive the sed pass.
#
# D-V43-APACHE-NOTICE: scope is ${REBRAND_TARGET}=${CURRENT_LINK}/static/,
# LICENSE + NOTICE structurally outside.
# ---------------------------------------------------------------------------
if [[ -d "${REBRAND_TARGET}" ]]; then
  # Wrap PRE/POST grep+wc pipelines: grep -E exits 1 when zero files match
  # (the desired POST state after a successful sed pass). Under `set -euo
  # pipefail` the pipeline propagates 1 → command substitution fails →
  # assignment fails → set -e exits the entire install-script before bun-
  # install / UPSTREAM.md / service-restart steps run. Disable pipefail
  # around the assignments so wc -l's 0-count return is honored.
  set +o pipefail
  WB_PRE_HITS="$(grep -rilE '\b(Aion|AION|aion)\b' "${REBRAND_TARGET}" \
    --include='*.html' --include='*.js' --include='*.css' 2>/dev/null | wc -l)"
  set -o pipefail
  if [[ "${WB_PRE_HITS}" -gt 0 ]]; then
    log "Word-boundary rebrand: applying \\b(Aion|AION|aion)\\b -> Liv sed pass on ${WB_PRE_HITS} files"
    find "${REBRAND_TARGET}" \( -name '*.html' -o -name '*.js' -o -name '*.css' \) ! -name 'liv-240-*' \
         -exec sed -E -i 's/\b(Aion|AION|aion)\b/Liv/g' {} +
    set +o pipefail
    WB_POST_HITS="$(grep -rilE '\b(Aion|AION|aion)\b' "${REBRAND_TARGET}" \
      --include='*.html' --include='*.js' --include='*.css' 2>/dev/null | wc -l)"
    set -o pipefail
    if [[ "${WB_POST_HITS}" -ne 0 ]]; then
      log "WARN: ${WB_POST_HITS} files still contain word-boundary Aion variants after sed pass (investigate)"
    else
      log "Word-boundary rebrand: all standalone Aion/AION/aion tokens replaced (verified by post-grep)"
    fi
  else
    log "Word-boundary rebrand: no standalone Aion/AION/aion tokens found; skipping"
  fi
else
  log "Word-boundary rebrand: WARN ${REBRAND_TARGET} missing; skipping"
fi

# ---------------------------------------------------------------------------
# Phase 238.1 Step C — Footer URL redirect (iOfficeAI/* -> livinity.io)
#
# Phase 234-03's case-sensitive sed `s/AionUi/Liv AI/g` literally rewrote
# vendored AionUi footer URLs from `https://github.com/iOfficeAI/AionUi/wiki`
# into `https://github.com/iOfficeAI/Liv AI/wiki` — with a literal SPACE
# breaking the URL AND still pointing at the upstream org. Operator surfaced
# this gap 2026-05-27 evening: 5 footer links (Yardım Dokümantasyonu /
# Güncelleme Günlüğü / Sorun Bildir / Bana Ulaşın / Resmi Web Sitesi) all
# need to redirect to Livinity.
#
# Blanket pattern: `https://github.com/iOfficeAI/<anything-non-quote>` ->
# `https://livinity.io`. Covers known variants:
#   - https://github.com/iOfficeAI/Liv AI/wiki   (helpDocumentation, broken)
#   - https://github.com/iOfficeAI/Liv AI        (officialWebsite, contactMe)
#   - https://github.com/iOfficeAI/AionHub       (index-BBQOKL1b, AionHub link)
# All 8+ affected files become a single Livinity homepage redirect.
#
# The charset [A-Za-z0-9 ._/-] intentionally INCLUDES a literal SPACE to
# catch the `Liv AI/wiki` variant from Phase 234-03's collateral. JS-minified
# bundles keep URLs inside quoted strings, so the next non-charset char
# (quote / backtick / less-than) terminates the match cleanly.
#
# Idempotency: grep pre-check skips when no iOfficeAI URLs remain; post-grep
# verify warns if any survive. Pipefail wrap per Phase 238 hot-fix precedent.
#
# D-V43-APACHE-NOTICE: scope is ${REBRAND_TARGET}=${CURRENT_LINK}/static/,
# LICENSE + NOTICE structurally outside.
#
# KNOWN LIMITATION (documented in docs/liv-assistant-install.md): built-in
# skill names + descriptions visible in Liv AI → Settings → Skills tab are
# baked into the 94MB Bun ELF binary (BuildID a9a0d18d...). Phase 234-03's
# design rule excludes the binary from sed-rebrand to prevent ELF corruption.
# This step does NOT address those — separate phase if operator demands.
# ---------------------------------------------------------------------------
if [[ -d "${REBRAND_TARGET}" ]]; then
  set +o pipefail
  IO_PRE_HITS="$(grep -rilE 'https?://github\.com/iOfficeAI/' "${REBRAND_TARGET}" \
    --include='*.html' --include='*.js' --include='*.css' 2>/dev/null | wc -l)"
  set -o pipefail
  if [[ "${IO_PRE_HITS}" -gt 0 ]]; then
    log "Footer redirect: applying iOfficeAI/* -> livinity.io sed pass on ${IO_PRE_HITS} files"
    find "${REBRAND_TARGET}" \( -name '*.html' -o -name '*.js' -o -name '*.css' \) ! -name 'liv-240-*' \
         -exec sed -E -i 's|https?://github\.com/iOfficeAI/[A-Za-z0-9 ._/-]+|https://livinity.io|g' {} +
    set +o pipefail
    IO_POST_HITS="$(grep -rilE 'https?://github\.com/iOfficeAI/' "${REBRAND_TARGET}" \
      --include='*.html' --include='*.js' --include='*.css' 2>/dev/null | wc -l)"
    set -o pipefail
    if [[ "${IO_POST_HITS}" -ne 0 ]]; then
      log "WARN: ${IO_POST_HITS} files still contain iOfficeAI/* URLs after redirect sed pass (investigate)"
    else
      log "Footer redirect: all iOfficeAI/* URLs rewritten to livinity.io (verified by post-grep)"
    fi
  else
    log "Footer redirect: no iOfficeAI/* URLs found (already redirected or absent); skipping"
  fi
else
  log "Footer redirect: WARN ${REBRAND_TARGET} missing; skipping"
fi

# ---------------------------------------------------------------------------
# Phase 238.2 Step D — Built-in skill SKILL.md rebrand
#
# AionUi's built-in skills live as on-disk SKILL.md (+ references/) files
# under /opt/liv-assistant/data/builtin-skills/. The AionUi backend
# extracts them on first start (the dir is NOT shipped in the tarball;
# bruce-owned mtime locks to install time) and DOES NOT re-extract on
# subsequent restarts — so sed-replacements PERSIST across restarts.
# Verified by Phase 238.2 probe: mtime unchanged across multiple
# `systemctl restart liv-assistant` cycles.
#
# Scope: `.md` files only — scripts (.js / .py / .sh) and JSON config
# are deliberately EXCLUDED because the compound `s/AionUi/Liv AI/g`
# substitution inserts a SPACE which would corrupt code identifiers.
# Operator's visible-text concern is satisfied by markdown rebrand alone.
#
# Pattern chain mirrors Phase 234-03 + Phase 238 Step B + extended for
# `AionUI` case variant found in the skills (e.g. `AionUI Skills`):
#   1. AionUi   -> Liv AI
#   2. AionUI   -> Liv AI         (case variant — added in this phase)
#   3. aionui-web -> liv-ai-web
#   4. aionui   -> liv-ai
#   5. \b(Aion|AION|aion)\b -> Liv  (word-boundary catch-all)
#
# Order matters: longer patterns first so compound rewrites take
# precedence over the word-boundary catch-all.
#
# Idempotency: grep pre/post via pipefail-wrap (Phase 238 hot-fix pattern).
#
# D-V42-NO-DATA-LOSS: scope strictly inside data/builtin-skills/. Never
# touch data/skills/ (user import dir), data/sessions/, data/secrets/,
# or any other operator-state subdir.
# ---------------------------------------------------------------------------
SKILL_TARGET="${INSTALL_ROOT}/data/builtin-skills"
if [[ -d "${SKILL_TARGET}" ]]; then
  set +o pipefail
  SK_PRE_HITS="$(grep -rilE 'AionUi|AionUI|aionui|\b(Aion|AION|aion)\b' "${SKILL_TARGET}" \
    --include='*.md' 2>/dev/null | wc -l)"
  set -o pipefail
  if [[ "${SK_PRE_HITS}" -gt 0 ]]; then
    log "Skill rebrand: applying AionUi/AionUI/aionui-web/aionui/\\b(Aion|AION|aion)\\b -> Liv sed pass on ${SK_PRE_HITS} files"
    find "${SKILL_TARGET}" -name '*.md' \
         -exec sed -E -i \
           -e 's/AionUi/Liv AI/g' \
           -e 's/AionUI/Liv AI/g' \
           -e 's/aionui-web/liv-ai-web/g' \
           -e 's/aionui/liv-ai/g' \
           -e 's/\b(Aion|AION|aion)\b/Liv/g' \
           {} +
    set +o pipefail
    SK_POST_HITS="$(grep -rilE 'AionUi|AionUI|aionui|\b(Aion|AION|aion)\b' "${SKILL_TARGET}" \
      --include='*.md' 2>/dev/null | wc -l)"
    set -o pipefail
    if [[ "${SK_POST_HITS}" -ne 0 ]]; then
      log "WARN: ${SK_POST_HITS} SKILL.md files still contain Aion variants after sed pass (investigate)"
    else
      log "Skill rebrand: all Aion variants in builtin-skills/*.md replaced (verified by post-grep)"
    fi
  else
    log "Skill rebrand: no Aion variants found in builtin-skills/*.md; skipping"
  fi
else
  log "Skill rebrand: WARN ${SKILL_TARGET} missing (AionUi has not extracted built-in skills yet); skipping"
fi

# ---------------------------------------------------------------------------
# Phase 238.4 Step E — index.html sed inject (Livinity CSS + favicon + theme)
#
# Phase 232's `livinity-overlay.css` was DESIGNED to be injected into the
# iframe HTML via a Caddy `replace` directive, but Mini PC's Caddy v2.11.3
# lacks the http.handlers.replace_response plugin (Phase 238.3 finding).
# Result: the CSS file IS served at /liv/branding/livinity-overlay.css (200
# OK) but the iframe HTML never references it, so font + accent overrides
# stay dead.
#
# Fix: sed-edit the on-disk index.html directly (same approach as Phase
# 234-03 rebrand sed). AionUi's Bun binary serves but does NOT regenerate
# index.html on restart, so edits PERSIST (verified by Phase 234-03 +
# 238.2 deploy history).
#
# Three substitutions, all idempotent via grep pre-check:
#   1. Inject `<link rel="stylesheet" href="/liv/branding/livinity-overlay.css">`
#      immediately before `</head>` (mirrors what the Caddy `replace`
#      directive would have done)
#   2. Replace browser favicon
#      `<link rel="icon" type="image/png" href="./pwa/icon-192.png" />`
#      → `<link rel="icon" type="image/svg+xml" href="/liv/branding/favicon.svg" />`
#   3. Replace apple-touch-icon
#      `<link rel="apple-touch-icon" href="./pwa/icon-180.png" />`
#      → `<link rel="apple-touch-icon" href="/liv/branding/favicon.svg" />`
#   4. Update theme-color from AionUi's grey #4E5969 to Livinity #1d1d1f
#
# All substitutions skip if marker is already present (idempotent on re-run).
#
# D-V43-APACHE-NOTICE: scope strictly inside ${CURRENT_LINK}/static/;
# LICENSE + NOTICE at ${INSTALL_ROOT}/ structurally outside.
# ---------------------------------------------------------------------------
INDEX_HTML="${REBRAND_TARGET}/index.html"
if [[ -f "${INDEX_HTML}" ]]; then
  # Substitution 1 — CSS link injection (with Phase 238.10 cache-bust query
  # to force browser/Cloudflare revalidation when CSS content changes).
  # Cache-bust marker: ?v=238_10. Bump on every CSS content change.
  if grep -q 'livinity-overlay.css?v=238_10' "${INDEX_HTML}"; then
    log "index.html overlay: CSS link with cache-bust v238_10 already injected; skipping"
  elif grep -q 'livinity-overlay.css' "${INDEX_HTML}"; then
    log "index.html overlay: bumping cache-bust on existing CSS link → v238_10"
    sed -E -i 's|livinity-overlay\.css(\?v=[A-Za-z0-9_-]+)?|livinity-overlay.css?v=238_10|g' "${INDEX_HTML}"
  else
    log "index.html overlay: injecting livinity-overlay.css <link> with cache-bust before </head>"
    sed -i 's|</head>|    <link rel="stylesheet" href="/liv/branding/livinity-overlay.css?v=238_10" />\n  </head>|' "${INDEX_HTML}"
    if grep -q 'livinity-overlay.css' "${INDEX_HTML}"; then
      log "index.html overlay: CSS link injection verified"
    else
      log "WARN: index.html overlay: CSS link injection failed (anchor </head> not matched?)"
    fi
  fi

  # Substitution 2 — favicon: PNG -> Livinity SVG (skip if already SVG)
  if grep -qE 'rel="icon"[^>]*href="/liv/branding/favicon\.svg"' "${INDEX_HTML}"; then
    log "index.html overlay: favicon already redirected to /liv/branding/favicon.svg; skipping"
  else
    log "index.html overlay: redirecting favicon PNG -> /liv/branding/favicon.svg"
    sed -E -i 's|<link rel="icon"[^>]*href="\./pwa/icon-192\.png"[^/]*/>|<link rel="icon" type="image/svg+xml" href="/liv/branding/favicon.svg" />|' "${INDEX_HTML}"
  fi

  # Substitution 3 — apple-touch-icon: PNG -> Livinity SVG
  if grep -qE 'rel="apple-touch-icon"[^>]*href="/liv/branding/favicon\.svg"' "${INDEX_HTML}"; then
    log "index.html overlay: apple-touch-icon already redirected; skipping"
  else
    log "index.html overlay: redirecting apple-touch-icon -> /liv/branding/favicon.svg"
    sed -E -i 's|<link rel="apple-touch-icon"[^>]*href="\./pwa/icon-180\.png"[^/]*/>|<link rel="apple-touch-icon" href="/liv/branding/favicon.svg" />|' "${INDEX_HTML}"
  fi

  # Substitution 4 — theme-color: AionUi grey #4E5969 -> Livinity accent #1d1d1f
  if grep -qE 'name="theme-color"[^>]*content="#1d1d1f"' "${INDEX_HTML}"; then
    log "index.html overlay: theme-color already #1d1d1f; skipping"
  else
    log "index.html overlay: updating theme-color -> #1d1d1f (Livinity accent)"
    sed -E -i 's|<meta name="theme-color" content="#4E5969"[^/]*/>|<meta name="theme-color" content="#1d1d1f" />|' "${INDEX_HTML}"
  fi
else
  log "index.html overlay: WARN ${INDEX_HTML} missing; skipping all 4 substitutions"
fi

# ---------------------------------------------------------------------------
# Phase 238.6 Step F (Phase 238.7 evolution) — Inline brand mark sed:
# AionUi V-mountain (or Phase-238.6 'L') → canonical Livinity donut mark
#
# Operator 2026-05-27 evening (Phase 238.6): "Hala sol en ustde sidebarin
# en ust sol tarafinda <path d='M40 20 Q38 22 25 40 ...'> Duruyor amk!"
# Operator 2026-05-27 night (Phase 238.7): "Ben L yi istemedim ki Ben
# Livinity nin bire bir logosunu istedim web sitemizde kullandigimiz" —
# requesting the EXACT Livinity logo from platform/web/public/favicon.svg
# (outer + inner circle = donut/halo).
#
# AionUi's brand mark is an inline SVG hardcoded in the JS bundle
# (index-*.js). Appears EXACTLY ONCE. Wrapped in `<div class="bg-black
# shrink-0 size-32px relative rd-0.5rem">`. NOT tied to selected-agent.
#
# Sed strategy — keep wrapper geometry untouched, rewrite the 3 SVG
# child elements into a Livinity donut (white outer disk + black inner
# hole on the wrapper's black background):
#   1. First path (V-mountain OR Phase-238.6 'L') → outer circle as path:
#      `M40 5 A35 35 0 1 0 40 75 A35 35 0 1 0 40 5 Z` (white fill)
#   2. Circle (was dot at cy=46 r=3, or Phase-238.6 invisible at r=0)
#      → inner donut hole at cx=40 cy=40 r=12 fill=black (cuts the donut)
#   3. Smile-arc path d → empty (no smile)
#
# Both PRE-states detected idempotently: fresh AionUi (V-mountain) AND
# Phase-238.6-deployed (L polygon). All converge on the donut.
#
# Result: black 32px rounded square with a clean white donut/halo mark —
# matches platform/web/public/favicon.svg, Livinity's canonical logo.
#
# Idempotency: pre-check for ANY non-donut path/circle signature. If
# donut path already present AND circle already centered/sized correctly,
# skip the entire block.
#
# D-V43-APACHE-NOTICE: scope strictly inside ${REBRAND_TARGET}=${CURRENT_LINK}/static/;
# LICENSE+NOTICE at ${INSTALL_ROOT} structurally outside.
# ---------------------------------------------------------------------------
if [[ -d "${REBRAND_TARGET}" ]]; then
  set +o pipefail
  # Detect EITHER pre-state: V-mountain (fresh) OR L polygon (Phase 238.6) OR misaligned circle
  BM_VMOUNTAIN_HITS="$(grep -lE 'M40 20 Q38 22 25 40' "${REBRAND_TARGET}"/assets/*.js 2>/dev/null | wc -l)"
  BM_LSHAPE_HITS="$(grep -lE 'M30 15 L42 15 L42 53 L65 53 L65 65 L30 65 Z' "${REBRAND_TARGET}"/assets/*.js 2>/dev/null | wc -l)"
  BM_DONUT_HITS="$(grep -lE 'M40 5 A35 35 0 1 0 40 75 A35 35 0 1 0 40 5 Z' "${REBRAND_TARGET}"/assets/*.js 2>/dev/null | wc -l)"
  BM_MARKER_HITS="$(grep -lE 'liv-brand-donut' "${REBRAND_TARGET}"/assets/*.js 2>/dev/null | wc -l)"
  set -o pipefail
  BM_NEED_REWRITE=$(( BM_VMOUNTAIN_HITS + BM_LSHAPE_HITS ))
  BM_NEED_MARKER=$(( 1 - (BM_MARKER_HITS > 0 ? 1 : 0) ))
  if [[ "${BM_NEED_REWRITE}" -gt 0 ]] || [[ "${BM_DONUT_HITS}" -eq 0 ]] || [[ "${BM_MARKER_HITS}" -eq 0 ]]; then
    log "Brand-mark sed: converging inline SVG to Livinity donut + adding liv-brand-donut marker (V-mountain hits=${BM_VMOUNTAIN_HITS}, L-shape hits=${BM_LSHAPE_HITS}, donut hits=${BM_DONUT_HITS}, marker hits=${BM_MARKER_HITS})"
    # Atomic multi-pattern sed pass.
    # Pattern 1a: V-mountain path → donut outer circle
    # Pattern 1b: L polygon → donut outer circle (idempotent re-run from Phase 238.6 deploy)
    # Pattern 2a: dot at cy=46 r=3 (V-mountain era) → centered hole at r=12 fill=black
    # Pattern 2b: invisible dot at cy=46 r=0 (Phase 238.6 era) → centered hole at r=12 fill=black
    # Pattern 3: smile-arc → empty (already done in Phase 238.6; safe to re-apply)
    # Pattern 4 (Phase 238.8): add `liv-brand-donut` marker class to the
    #   wrapper className string, so livinity-overlay.css can target it and
    #   replace the inline SVG with the adaptive /liv/branding/favicon.svg
    #   bg-image. Idempotent (only matches the bare bg-black class string).
    sed -i \
      -e 's|M40 20 Q38 22 25 40 Q23 42 26 42 L30 42 Q32 40 40 30 Q48 40 50 42 L54 42 Q57 42 55 40 Q42 22 40 20|M40 5 A35 35 0 1 0 40 75 A35 35 0 1 0 40 5 Z|g' \
      -e 's|M30 15 L42 15 L42 53 L65 53 L65 65 L30 65 Z|M40 5 A35 35 0 1 0 40 75 A35 35 0 1 0 40 5 Z|g' \
      -e 's|key:"logo-circle",cx:"40",cy:"46",r:"3",fill:"white"|key:"logo-circle",cx:"40",cy:"40",r:"12",fill:"black"|g' \
      -e 's|key:"logo-circle",cx:"40",cy:"46",r:"0",fill:"white"|key:"logo-circle",cx:"40",cy:"40",r:"12",fill:"black"|g' \
      -e 's|d:"M18 50 Q40 70 62 50"|d:""|g' \
      -e 's|"bg-black shrink-0 size-32px relative rd-0.5rem"|"bg-black shrink-0 size-32px relative rd-0.5rem liv-brand-donut"|g' \
      "${REBRAND_TARGET}"/assets/*.js
    set +o pipefail
    BM_POST_DONUT="$(grep -lE 'M40 5 A35 35 0 1 0 40 75 A35 35 0 1 0 40 5 Z' "${REBRAND_TARGET}"/assets/*.js 2>/dev/null | wc -l)"
    BM_POST_HOLE="$(grep -lE 'key:"logo-circle",cx:"40",cy:"40",r:"12",fill:"black"' "${REBRAND_TARGET}"/assets/*.js 2>/dev/null | wc -l)"
    BM_POST_MARKER="$(grep -lE 'liv-brand-donut' "${REBRAND_TARGET}"/assets/*.js 2>/dev/null | wc -l)"
    set -o pipefail
    if [[ "${BM_POST_DONUT}" -gt 0 ]] && [[ "${BM_POST_HOLE}" -gt 0 ]] && [[ "${BM_POST_MARKER}" -gt 0 ]]; then
      log "Brand-mark sed: Livinity donut + marker applied (outer=${BM_POST_DONUT}, hole=${BM_POST_HOLE}, marker=${BM_POST_MARKER})"
    else
      log "WARN: Brand-mark sed end-state incomplete (donut=${BM_POST_DONUT}, hole=${BM_POST_HOLE}, marker=${BM_POST_MARKER}); investigate"
    fi
  else
    log "Brand-mark sed: Livinity donut + marker already present (donut=${BM_DONUT_HITS}, marker=${BM_MARKER_HITS}); skipping"
  fi
else
  log "Brand-mark sed: WARN ${REBRAND_TARGET} missing; skipping"
fi

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
# Repo source: caddy/branding/{livinity-overlay.css,favicon.svg,manifest.json,
#              favicon-light.svg,favicon-dark.svg}
# Phase 238.9 — added favicon-light.svg + favicon-dark.svg so the .liv-brand-
#   donut CSS rule can swap between them via @media (prefers-color-scheme).
#   CSS bg-image SVGs are loaded sandboxed, so @media-inside-SVG doesn't
#   work; we ship two separate files instead.
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
  for asset in livinity-overlay.css favicon.svg manifest.json favicon-light.svg favicon-dark.svg; do
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
