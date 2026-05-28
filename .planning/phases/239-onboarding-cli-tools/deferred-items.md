# Phase 239 — Deferred Items

Discovered during Plan 239-03 deploy (2026-05-27).

## D-DEFERRED-239-A — update.sh missing rsync for `scripts/install/cli/`

**Found during:** Task 2 (Mini PC deploy via `bash /opt/livos/update.sh`).

**Issue:** `update.sh` rsyncs package source trees (`livos/packages/*`, `liv/packages/*`) but does NOT rsync the repo-root `scripts/install/cli/` directory. As a result, the 5 install scripts shipped by Plan 239-01 (commit `fca7330b`) never reach Mini PC `/opt/livos/scripts/install/cli/`. Without these scripts on-disk, `cliInstaller.install` mutation would fail at spawn time (`ENOENT: no such file or directory, /opt/livos/scripts/install/cli/{name}.sh`).

**Hot-fix applied in Plan 239-03 Task 2 (Rule 3 — blocking):** Manually `scp`'d the 5 scripts from local repo to Mini PC and placed them at `/opt/livos/scripts/install/cli/` with mode 100755 and ownership `bruce:bruce`. SHA-256 of each script recorded in `239-03-POST-SNAPSHOT.txt`. Sacred SHA preserved.

**Deferred fix (architectural — Phase 240+ or dedicated micro-plan):** Patch `/opt/livos/update.sh` to add a rsync block for `scripts/install/cli/` (and possibly the entire `scripts/install/` tree where Phase 239+ install scripts live). Sample patch shape:

```bash
# After existing rsync blocks, before service restart:
if [ -d "$TEMP_DIR/scripts/install/cli" ]; then
  rsync -a --delete "$TEMP_DIR/scripts/install/cli/" "$LIVOS_DIR/scripts/install/cli/"
  chmod +x "$LIVOS_DIR/scripts/install/cli/"*.sh 2>/dev/null || true
  chown -R bruce:bruce "$LIVOS_DIR/scripts/install/cli" 2>/dev/null || true
  ok "scripts/install/cli/ rsynced (Phase 239 install scripts)"
else
  info "scripts/install/cli/ not in TEMP_DIR — skipping (pre-Phase 239 deploy)"
fi
```

This carries the same conditional pattern used for `install-openclaw-cli.sh`, `install-liv-assistant.sh`, `install-liv-caddy-snippet.sh` etc., so the fix is shape-consistent with existing Phase 208/223/226 carry-overs.

**Risk if NOT fixed:** Next `update.sh` run does NOT delete `/opt/livos/scripts/install/cli/` (no `--delete` on its parent), so the hot-fixed scripts persist across deploys until manually altered. New CLI scripts added in Phase 240+ would also need manual scp. RCE boundary (D-239-07 whitelist) is independent — still enforced at module level — so missing scripts only cause `cliInstaller.install` to return `{ok: false, output: "ENOENT..."}`, NOT a security regression.

**Status:** OPEN — log carries to next phase planning.

## D-DEFERRED-239-B — Mini PC `/opt/livos/LICENSE` + `/opt/livos/NOTICE` not present

**Found during:** Task 1 PRE-deploy snapshot.

**Issue:** Plan 239-03's must_haves invariants reference `LICENSE + NOTICE files byte-identical PRE/POST (D-V43-APACHE-NOTICE)`. Mini PC does not have these files at `/opt/livos/` root (PRE and POST both return `MISSING`). Sub-package LICENSEs exist (`/opt/livos/packages/liv-claw-os/LICENSE`, `/opt/livos/packages/design-tokens/LICENSE-FONTS.md`) but the top-level Apache NOTICE / LICENSE files referenced in the v43 milestone scope are absent.

**Trivial invariant satisfaction:** empty PRE = empty POST = byte-identical (no drift). Phase 239 introduces no LICENSE/NOTICE changes, so the no-regression criterion holds in spirit.

**Deferred fix:** A v43 housekeeping phase should add `/opt/livos/LICENSE` + `/opt/livos/NOTICE` at the root of the deployment (and ensure update.sh rsyncs them from repo root). D-V43-APACHE-NOTICE traceability requires both files on disk to actually satisfy the invariant.

**Status:** OPEN — log for v43 milestone close planning.

## D-DEFERRED-239-C — Canonical blob `/etc/liv-assistant/aionui-frontend.tar.gz` not present

**Found during:** Task 1 PRE-deploy snapshot.

**Issue:** CONTEXT.md `canonical_refs` references `Mini PC sha256 62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` for `/etc/liv-assistant/aionui-frontend.tar.gz`. The path `/etc/liv-assistant/` exists on Mini PC but contains only `branding/` (no tarball). MEMORY.md's "Mini PC documented path" for this blob is therefore stale — likely supplanted by a different artifact path post Phase 223 (vendored AionUi tarball).

**Trivial invariant satisfaction:** empty PRE = empty POST (no drift). Phase 239 does not touch liv-assistant artifacts, so byte-identity holds.

**Deferred fix:** Update CONTEXT.md / MEMORY.md to reflect the actual canonical blob path (or remove the reference if Phase 223+ retired the tarball pattern). Cross-check with `/opt/livos/packages/liv-assistant/` or `/opt/livos/vendor/aionui/` for the new location.

**Status:** OPEN — log for next phase that touches AionUi artifacts.
