---
phase: 235
plan: 01
title: Liv AI hot-fix — absolute API path rewrite + icon visibility
type: feat
autonomous: true
wave: 1
depends_on: [234]
sacred-sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
requirements: []
---

# Phase 235 Plan 01 — Liv AI hot-fix — absolute API path rewrite + icon visibility

## Objective

Operator reported live in browser (2026-05-27 post-Phase 234 deploy):

1. **CRITICAL: AionUi iframe makes absolute-path API/WS requests**. Browser console shows
   `GET https://bruce.livinity.io/api/settings/client 404`, `GET .../api/auth/user 404`,
   `GET .../api/agents 404`, `wss://bruce.livinity.io/ws` failed. The Caddy
   `LIV_ASSISTANT_HANDLE` reverse-proxies `/liv/*` to AionUi `:3020` with
   `uri strip_prefix /liv`, but the vendored AionUi JS bundle issues requests to the
   ROOT-relative paths (`/api/...`, `/ws`) — those bypass the `/liv` matcher and
   hit the LivOS shell at root, returning 404. AionUi's bootstrap can't load
   `/api/settings/client` → it falls back to the login UI → operator sees the AionUi
   login form even though Plan 234-04 set the `aionui-session` cookie correctly.

   **Fix:** Extend the Phase 234-03 idempotent sed block in
   `scripts/install-liv-assistant.sh` to ALSO rewrite absolute API/WS paths
   inside HTML/JS/CSS under `${CURRENT_LINK}/static/`. Pattern adds `/liv` prefix
   to absolute paths in quoted form (`"/api/`, `'/api/`, `` `/api/ ``, `"/ws"`,
   `'/ws'`, `` `/ws` ``). Idempotent guard via pre-grep counting unprefixed vs.
   already-prefixed occurrences — if no unprefixed paths remain, skip.

2. **Dock icon empty (operator sees blank tile)**. Icon file
   `livos/packages/ui/public/figma-exports/dock-ai-chat.svg` exists in repo
   (691 bytes, valid). Most likely the file IS present on Mini PC dist (vite copies
   `public/` to `dist/` by default) and the empty tile is browser cache from a
   prior render before the SVG was added (Plan 234-02 added the icon ref). Confirm
   via SSH; if file is missing on Mini PC dist, document the build/deploy quirk; if
   present, apply a cache-bust query-string to the icon path so operator's browser
   refetches.

## Context

@CLAUDE.md
@.planning/STATE.md
@.planning/phases/234-liv-ai-polish-ux/234-03-DEPLOY-LOG.md
@.planning/phases/234-liv-ai-polish-ux/234-04-DEPLOY-LOG.md
@scripts/install-liv-assistant.sh
@livos/packages/ui/src/providers/apps.tsx
@livos/packages/livinityd/source/modules/domain/caddy.ts

## Locked invariants

- D-V42-SACRED — sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED.
  No edits under `liv/packages/core/`.
- D-V42-APACHE-NOTICE — LICENSE + NOTICE byte-identical PRE/POST. Sed scope is
  `${CURRENT_LINK}/static/` only — LICENSE+NOTICE live at `${INSTALL_ROOT}/`
  outside the find walk.
- D-V42-IDEMPOTENT — RUN 2 of update.sh produces zero new sed edits.
- HARD-RULE — Mini PC ONLY. NO Server4. NO Server5 (only relay, not a deploy
  target).
- Phase 233 UAT subset (SC-01..SC-05) must remain GREEN post-fix (Liv Assistant
  unregressed).

## Tasks

### Task 1 — Extend install-liv-assistant.sh sed block with absolute-path rewrite

<task id="01" type="auto">

**Files modified:**
- `scripts/install-liv-assistant.sh` — insert a new idempotent sed block
  IMMEDIATELY AFTER the existing Phase 234-03 AionUi → Liv AI rebrand block
  (after line ~229, before the LICENSE/NOTICE defensive grep loop at ~235).

**Implementation:**

```bash
# ---------------------------------------------------------------------------
# Phase 235 — absolute API/WS path rewrite (AionUi JS bundle hot-fix)
#
# AionUi's vendored JS bundle issues requests to ROOT-relative paths
# (/api/..., /ws). When iframe-mounted at https://bruce.livinity.io/liv/, the
# browser resolves those against the iframe's ORIGIN, NOT its path — so they
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
# Idempotency guard: pre-grep counts UNPREFIXED occurrences (matching
# `"/api/` but NOT `"/liv/api/`). Zero matches => no-op.
# ---------------------------------------------------------------------------
if [[ -d "${REBRAND_TARGET}" ]]; then
  PATH_PRE_HITS="$(grep -rEl '"/api/|'"'"'/api/|`/api/|"/ws"|'"'"'/ws'"'"'|`/ws`' \
    "${REBRAND_TARGET}" --include='*.html' --include='*.js' --include='*.css' \
    2>/dev/null | xargs -r grep -lE '(^|[^v])/api/|(^|[^v])/ws([^a-z]|$)' 2>/dev/null | wc -l)"
  # Simpler + more reliable check: count files containing the unprefixed
  # quoted forms; the grep above is an over-broad first pass.
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
```

**Why this pattern:**

- The double-quoted/`xargs grep -L` filter is the canonical "files that
  contain UNPREFIXED form AND do NOT contain PREFIXED form" — i.e. files
  needing rewrite. After one sed pass that yields zero such files, RUN 2
  reports `PATH_PRE_HITS=0` and short-circuits.
- The `find ... -exec sed -i {} +` shape matches the existing 234-03 idiom.
- Scope `${REBRAND_TARGET}=${CURRENT_LINK}/static/` excludes LICENSE+NOTICE
  structurally (they live at `${INSTALL_ROOT}/`, outside the static/ subtree).
- Pattern ordering immaterial since the 6 patterns are mutually exclusive
  (different quote forms / different paths).

**Verification (in this task):**

```bash
# Static syntax check
bash -n scripts/install-liv-assistant.sh && echo "OK: bash -n passes"
```

**Done criteria:**

- `scripts/install-liv-assistant.sh` contains the Phase 235 block.
- `bash -n` passes.
- Block is positioned AFTER the 234-03 rebrand section and BEFORE the
  LICENSE/NOTICE defensive grep loop.

**Commit:** `feat(235): install-liv-assistant.sh idempotent absolute API/WS path rewrite (/api/ -> /liv/api/, /ws -> /liv/ws)`

</task>

### Task 2 — Investigate icon visibility on Mini PC, apply cache-bust if needed

<task id="02" type="auto">

**Investigation:** Batched SSH (fail2ban discipline) to Mini PC:

```bash
ssh -i pem/minipc bruce@10.69.31.68 -T 'bash -s' <<'EOF'
echo "--- icon presence on Mini PC dist ---"
ls -la /opt/livos/livos/packages/ui/dist/figma-exports/dock-ai-chat.svg 2>&1 || true
ls -la /opt/livos/livos/packages/ui/dist/figma-exports/ 2>&1 | head -10
echo "--- last build marker ---"
stat -c '%y' /opt/livos/livos/packages/ui/dist/index.html 2>&1 || true
EOF
```

**Decision tree:**

- **If `dock-ai-chat.svg` IS present on Mini PC dist:** It's browser cache.
  Apply cache-bust: change `'/figma-exports/dock-ai-chat.svg'` to
  `'/figma-exports/dock-ai-chat.svg?v=235'` in
  `livos/packages/ui/src/providers/apps.tsx` line 132.
- **If `dock-ai-chat.svg` IS MISSING on Mini PC dist:** Document the deploy
  quirk in DEPLOY-LOG. Vite SHOULD copy `public/` → `dist/` automatically; if
  it didn't, the operator can force a full rebuild via update.sh which already
  runs `pnpm --filter ui build`. In that case the cache-bust is also still a
  win (forces refetch once the file is there). Apply the cache-bust anyway as
  a belt-and-suspenders fix.

**Files potentially modified:**
- `livos/packages/ui/src/providers/apps.tsx` (cache-bust query-string)

**Done criteria:**

- SSH investigation captured in this DEPLOY-LOG.
- Icon ref carries cache-bust `?v=235` (if Task 2 decision says to apply).
- If applied, change is a 1-character delta on apps.tsx line 132 — sacred SHA
  unaffected (apps.tsx is in `livos/packages/ui/`, NOT `liv/packages/core/`).

**Commit:** `feat(235): cache-bust dock-ai-chat icon (?v=235) for operator browser refetch` (only if cache-bust applied)

</task>

### Task 3 — Push origin + Mini PC deploy + external verification

<task id="03" type="auto">

**Steps:**

1. `git push origin master` (push Task 1 + optional Task 2 commits).
2. Single batched SSH to Mini PC running `sudo bash /opt/livos/update.sh`.
   Verify EXIT 0 + `Deployed SHA recorded: <hash>`.
3. POST-deploy verification (all from orchestrator shell, external curl
   probes through Cloudflare→Server5→Mini PC relay):

   - **SC-01 — `/liv/api/settings/client` reachable through `/liv` prefix:**
     ```bash
     curl -sS -i --max-time 15 https://bruce.livinity.io/liv/api/settings/client \
       | head -5
     ```
     Expect HTTP 200 OR HTTP 401 OR HTTP 204. **HTTP 404 is FAIL** (means the
     `/liv/api/*` matcher still isn't reaching AionUi backend).

   - **SC-02 — HTML body of `/liv/` references `/liv/api/` (not bare `/api/`):**
     ```bash
     curl -sS https://bruce.livinity.io/liv/ -o /tmp/livhtml.html
     # The HTML index itself likely has few API references, but any inline
     # script init data should now carry the prefix.
     grep -c '"/liv/api/' /tmp/livhtml.html  # expect >= 0 (HTML may be lean)
     grep -c '"/api/' /tmp/livhtml.html      # expect 0 unprefixed (or 0 total)
     ```
     The richer probe is to fetch one of the bundle JS files known to contain
     API refs (e.g. `AcpChat-*.js` or `index-*.js` per A.2 of 234-03 deploy
     log) and grep there:
     ```bash
     curl -sS https://bruce.livinity.io/liv/assets/ 2>/dev/null | head -20 || true
     # Or: SSH to Mini PC and confirm sed delta:
     ssh ... 'grep -rcE "\"/liv/api/" /opt/liv-assistant/current/static/assets/ | head -5'
     ssh ... 'grep -rcE "\"/api/[a-z]" /opt/liv-assistant/current/static/assets/ \
       | grep -v ":0$" | head -5'
     ```

   - **SC-03 — Icon file present on Mini PC dist OR cache-bust applied:**
     SSH `ls -la /opt/livos/livos/packages/ui/dist/figma-exports/dock-ai-chat.svg`
     returns non-empty file, OR `grep "dock-ai-chat.svg?v=" /opt/livos/livos/packages/ui/dist/assets/*.js`
     finds the cache-busted reference in the bundled JS.

   - **SC-04 — Sacred SHA UNCHANGED:**
     ```bash
     git hash-object liv/packages/core/src/sdk-agent-runner.ts
     # expect f3538e1d811992b782a9bb057d1b7f0a0189f95f
     ssh ... 'sha256sum /opt/liv/packages/core/src/sdk-agent-runner.ts'
     # expect 62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe
     ```

   - **SC-05 — Phase 233 UAT subset still GREEN (non-regression):**
     ```bash
     curl -sS https://bruce.livinity.io/liv/ -o /tmp/livhtml.html
     grep -c 'Liv AI' /tmp/livhtml.html      # expect >= 3
     grep -c 'AionUi' /tmp/livhtml.html      # expect 0
     curl -sS -i https://bruce.livinity.io/liv/api/auth/status | head -3
     # expect HTTP 200
     curl -sS -i -b /tmp/jar -c /tmp/jar https://bruce.livinity.io/liv-login \
       | head -5  # expect HTTP 302 + Set-Cookie
     ```

   - **SC-06 — Idempotency proof (RUN 2 of update.sh is no-op for the new sed):**
     Run `sudo bash /opt/livos/update.sh` a second time, confirm log contains
     `Path rewrite: absolute API/WS paths already prefixed (or absent); skipping sed pass`.

4. Write `235-DEPLOY-LOG.md` capturing all evidence (PRE state, update.sh
   tail, POST state, external verification, sacred SHA, RUN 2 idempotency
   proof).

**Done criteria:**

- `git push origin master` succeeds with Task 1 + optional Task 2 commits in
  range.
- Mini PC update.sh EXIT 0, deployed SHA matches our push.
- External `https://bruce.livinity.io/liv/api/settings/client` returns
  NON-404 status (200 / 401 / 204 acceptable).
- HTML body or bundle grep confirms `/liv/api/` prefix present, unprefixed
  `/api/` absent.
- Icon file present on Mini PC dist (or cache-bust live).
- Sacred SHA byte-identical across repo + Mini PC.
- Phase 233 UAT subset 5/5 GREEN.
- RUN 2 idempotency proven.
- DEPLOY-LOG committed.

**Commit:** `docs(235): DEPLOY-LOG + SUMMARY + STATE/ROADMAP — Phase 235 SHIPPED (path rewrite live, icon visible, sacred SHA unchanged)`

</task>

## Success Criteria (Phase-level)

- SC-01: External `https://bruce.livinity.io/liv/api/settings/client` returns
  non-404 (200/401/204 acceptable) — proves `/liv/api/*` reaches AionUi backend.
- SC-02: Mini PC dist `dock-ai-chat.svg` present OR cache-bust applied to
  iframe-source bundle reference.
- SC-03: Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED.
- SC-04: Phase 233 UAT subset 5/5 GREEN post-fix (`/liv/` 200 with `<title>Liv AI</title>`,
  AionUi count = 0, /liv/api/auth/status 200, /liv-login 302+Set-Cookie).
- SC-05: RUN 2 of update.sh is a no-op for the new sed (`Path rewrite: ... skipping`).

## Reversibility

Path-rewrite sed is purely cosmetic-on-disk + idempotent. Full revert:
1. `git revert <235-feat-commit>` in repo
2. Push, deploy via `bash /opt/livos/update.sh` — the revert removes the
   Phase 235 sed block, but the EXISTING extracted tree still carries the
   `/liv/api/` rewrites until next tarball re-extract.
3. For full visual revert: `sudo rm -rf /opt/liv-assistant/aionui-web-2.1.4/`
   + re-run install-liv-assistant.sh from the reverted commit (re-extracts
   from pinned-SHA tarball, no Phase 235 rewrite).

Sacred SHA + Apache-2.0 LICENSE/NOTICE unaffected by revert.

## Output

- `scripts/install-liv-assistant.sh` extended with Phase 235 sed block
- `livos/packages/ui/src/providers/apps.tsx` line 132 cache-bust (only if Task 2
  decision says to)
- `.planning/phases/235-liv-ai-hotfix-paths/235-DEPLOY-LOG.md` (deploy evidence)
- `.planning/phases/235-liv-ai-hotfix-paths/235-SUMMARY.md` (closure summary)
- `.planning/STATE.md` advance to Phase 235 SHIPPED
- `.planning/ROADMAP.md` Phase 235 row added above Phase 227 (next to Phase 234)
