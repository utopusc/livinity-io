# Phase 31 Root-Cause Investigation: update.sh Build Silent-Fail

**Investigated:** 2026-04-26
**Investigator:** GSD Plan 31-01
**Symptom (BACKLOG 999.5):** `update.sh` logs `[OK] @livos/config built` and `[OK] Nexus core built` but the underlying `dist/` directories are empty afterward, causing livinityd to crash with `Cannot find module @livos/config/dist/index.js` or `@nexus/core/dist/lib.js`.

## Live Snapshot

| Host                          | Path                | Lines | sha256                                                             |
| ----------------------------- | ------------------- | ----- | ------------------------------------------------------------------ |
| Mini PC (bruce@10.69.31.68)   | /opt/livos/update.sh | 289   | `02614bf23d7704e59a478f65de515b29ca7c965e22f33d5fcc7822e7df2c5de2` |
| Server4 (root@45.137.194.103) | /opt/livos/update.sh | 277   | `b30e7c7cd75dbe3ce795fc148bc35ff45f2bdb684db9c1235c8f8cbff69d5db7` |

**Drift between hosts:** YES — the two hosts are running different revisions of `update.sh`.

The Mini PC is **one revision ahead** of Server4 in three ways:
1. **UI public-asset sync** (Mini PC lines 88-90): an `rsync -a "$TEMP_DIR/livos/packages/ui/public/" "$LIVOS_DIR/packages/ui/public/"` block that is missing entirely on Server4.
2. **Nexus memory build** (Mini PC lines 168-174): a dedicated `if [[ -d "$NEXUS_DIR/packages/memory" ]]; then cd ... && npm run build ... fi` block; Server4 never builds memory at all (matches MEMORY.md note that `liv-memory.service` build is missing on Server4).
3. **Extra TS-config copies** (Mini PC line 83 `for f in ... tailwind.config.ts tailwind.config.js postcss.config.ts postcss.config.js ...`): Server4's loop omits the `.ts` variants.

Implication: any patch script Plan 02 produces MUST be idempotent against BOTH versions and target the same anchor lines. The Phase 30 patch precedent (`grep -q 'Recording deployed SHA'` short-circuit) handles this — Plan 02 should follow the same pattern.

Snapshots dropped to (gitignored) `.claude/tmp/phase31-investigation/`:
- `update.sh.minipc` (289 lines)
- `update.sh.server4` (277 lines)
- `update.sh.diff` (34 lines, unified diff)

## Build Steps As Currently Written

Citing the **Mini PC** snapshot (`update.sh.minipc`) since it is the user's primary deployment target and the host where BACKLOG 999.5 was observed.

### Step 4 — Install dependencies (lines 126-139)

```bash
# Line 131
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
# Line 137
npm install --production=false 2>/dev/null || npm install
```

Both lines silently swallow stderr from the first attempt and fall back to the unlocked variant. **No verification that install actually populated `node_modules` before builds run.**

### Step 5 — Build packages (lines 141-188)

| # | Package          | Lines   | Invocation                                                                | Output guard? |
| - | ---------------- | ------- | ------------------------------------------------------------------------- | ------------- |
| 1 | @livos/config    | 145-149 | `cd "$LIVOS_DIR/packages/config"; npx tsc; cd "$LIVOS_DIR"; ok "..."`     | NONE          |
| 2 | UI (vite)        | 152-159 | `cd .../packages/ui; npm run build 2>&1 \| tail -5; cd ...; ok "..."`     | NONE          |
| 3 | Nexus core       | 163-165 | `cd "$NEXUS_DIR/packages/core" && npx tsc && cd "$NEXUS_DIR"; ok "..."`   | NONE          |
| 4 | Nexus memory     | 168-174 | `cd .../packages/memory; npm run build 2>&1 \| tail -3; cd ...; ok "..."` | NONE          |
| 5 | Nexus worker     | 176-177 | `cd ... && npx tsc 2>/dev/null && cd ... \|\| cd ...`                     | NONE (silent) |
| 6 | Nexus mcp-server | 179-180 | `cd ... && npx tsc 2>/dev/null && cd ... \|\| cd ...`                     | NONE (silent) |

After the builds, lines 183-187 perform the pnpm-store dist-copy (the BUILD-02 target):

```bash
local_pnpm_nexus=$(find "$LIVOS_DIR/node_modules/.pnpm" -maxdepth 1 -name '@nexus+core*' -type d 2>/dev/null | head -1)
if [[ -n "$local_pnpm_nexus" ]] && [[ -d "$NEXUS_DIR/packages/core/dist" ]]; then
    cp -r "$NEXUS_DIR/packages/core/dist" "$local_pnpm_nexus/node_modules/@nexus/core/"
    ok "Nexus dist linked to pnpm store"
fi
```

The **`| head -1`** is exactly the multi-resolution-dir bug MEMORY.md describes and BACKLOG 999.5b tracks.

## Anchor Lines Available For Patching

Plan 02's idempotent patch script can splice against these stable markers (verified present on Mini PC; Plan 02 must guard for absence on Server4 where applicable):

| Anchor                                              | Line (Mini PC) | Use                                                                       |
| --------------------------------------------------- | -------------- | ------------------------------------------------------------------------- |
| `# ── Step 5: Build packages ──`                    | 141            | Insert `verify_build()` helper definition just AFTER this header          |
| `ok "@livos/config built"`                          | 149            | Replace with `verify_build "$LIVOS_DIR/packages/config/dist" ...`         |
| `ok "UI built and linked"`                          | 159            | Replace with `verify_build "$LIVOS_DIR/packages/ui/dist" ...`             |
| `ok "Nexus core built"`                             | 165            | Replace with `verify_build "$NEXUS_DIR/packages/core/dist" ...`           |
| `ok "Nexus memory built"`                           | 173            | Replace with `verify_build "$NEXUS_DIR/packages/memory/dist" ...` (Mini PC only — guard) |
| `info "Building Nexus worker..."` + next line       | 176-177        | Replace whole `2>/dev/null && cd ... \|\| cd ...` with verified call      |
| `info "Building Nexus mcp-server..."` + next line   | 179-180        | Same as worker                                                            |
| `local_pnpm_nexus=$(find ... \| head -1)` block     | 183-187        | Replace with `for dir in .../@nexus+core*/; do cp -r + verify; done` loop |
| `# ── Phase 30 UPD-03: Record deployed SHA ──`      | 251            | Anchor for upper bound of Step-5 modifications (don't touch below this)   |
| `# ── Step 9: Cleanup ───`                          | 264            | Same as Phase 30 — safe lower bound                                       |

Helper functions already defined (lines 23-27) and reusable: `info`, `ok`, `warn`, `fail`, `step`. Plan 02's `verify_build` helper should call `fail "BUILD-FAIL: <pkg> produced empty <dir>"` to match the existing tone.

## Hypotheses

| #  | Hypothesis                                                                                       | Evidence For                                                                                                                                                                                                                                                                                                                            | Evidence Against                                                                                                                                                                                            | Verdict        |
| -- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| H1 | `tsc --noEmit` somewhere in build chain                                                          | Symptom is "tsc reports success but emits nothing" — exactly what `--noEmit` does                                                                                                                                                                                                                                                       | `packages/config/package.json` `build` is `"tsc"` (not `"tsc --noEmit"`); `tsconfig.json` has no `"noEmit"` key; `tsconfig.base.json` has no `"noEmit"`; the `typecheck` script uses `--noEmit` separately | **ruled-out**  |
| H2 | cwd drift between update.sh shell and interactive shell                                          | None — script uses absolute `cd "$LIVOS_DIR/packages/config"` etc.; bash subshell isolation is consistent                                                                                                                                                                                                                               | All build invocations explicitly `cd` to absolute paths immediately before `npx tsc`; `set -e` would catch a failed `cd`                                                                                    | **ruled-out**  |
| H3 | env var loss (PATH, NODE_OPTIONS, NODE_ENV)                                                      | Script doesn't `source ~/.profile` or `nvm use` — runs whatever PATH systemd/sudo gives it                                                                                                                                                                                                                                              | `npx tsc` would fail loud (`tsc: not found`) if PATH lacked node_modules/.bin; the `[OK]` line strictly only prints if `npx tsc` exit-0'd, which means tsc DID run                                          | **ruled-out**  |
| H4 | pnpm-lock.yaml drift causing dependencies-not-resolved silent skip                               | Line 131: `pnpm install --frozen-lockfile 2>/dev/null \|\| pnpm install` — first attempt silenced; fallback runs unlocked install which can leave workspace symlinks half-built; if `node_modules/typescript` is missing, `npx tsc` could resolve to a globally installed `tsc` whose `--rootDir`/`include` resolution differs slightly | tsc with mismatched include patterns would still emit something (or print errors); we'd expect partial dist, not empty dist                                                                                 | **inconclusive** (contributing factor — likely raises crash probability but probably not the sole cause) |
| H5 | Race / stale lock from previous still-running update.sh                                          | pnpm holds `.pnpm` store locks; if a previous update.sh is still mid-install (e.g., systemd timer kicked it off again), the second invocation's `pnpm install --frozen-lockfile 2>/dev/null \|\| pnpm install` swallows the lock error and falls through; both processes then race writing `node_modules`                              | No evidence of a competing scheduler — update.sh is only invoked manually via `system.update` mutation; user reports symptom on first invocation, not concurrent ones                                       | **inconclusive** (low probability but cannot be definitively ruled out without correlated logs) |
| H6 | `set -e` missing — failing build commands continue                                               | Pipe-to-tail patterns at lines 154, 171 (`npm run build 2>&1 \| tail -5`); `2>/dev/null \|\|` patterns at lines 177, 180 (worker, mcp-server) explicitly mask exit codes                                                                                                                                                                | Line 8 has `set -euo pipefail` — `pipefail` propagates the leftmost non-zero status through pipes; the explicit `\|\| cd ...` masking only affects worker/mcp-server (not the @livos/config + nexus core symptoms in BACKLOG 999.5) | **ruled-out** for the headline symptom (`set -euo pipefail` IS present), but the worker/mcp-server `2>/dev/null \|\|` masking is a real BUG even if not the BACKLOG 999.5 trigger — Plan 02 must remove it |

### Additional finding (no hypothesis row — separate failure mode)

The pnpm-store dist-copy at lines 183-187 uses `find ... | head -1`, which selects ONE of potentially MANY `@nexus+core*` resolution dirs. When pnpm has multiple resolution dirs (e.g., from `sharp` version drift between updates), the copy lands in the wrong store dir while livinityd's symlinked `@nexus/core` resolves to a DIFFERENT store dir whose `dist/` is still stale or empty. **This matches BACKLOG 999.5b verbatim** and is independent of the build itself — it can fail-silent even when builds succeed.

## Verdict

**Inconclusive on the precise root-cause for the headline `[OK] @livos/config built` lie**, but the investigation produced a very high-confidence **partial verdict** on _why update.sh cannot reliably DETECT the failure_:

1. **No build-output verification exists anywhere** in the script — every `[OK] X built` line prints unconditionally after the build command exits, with no `test -s "$DIST/index.js"` or equivalent check. So even if the underlying cause (whatever it is — H4/H5 contributing, or a transient disk/inode issue, or pnpm store partial-write) recurs, the script will continue to lie.

2. **The pnpm-store dist-copy `| head -1` bug (BACKLOG 999.5b) IS confirmed by code reading** — Plan 02's loop fix is necessary regardless of the BUILD-03 verdict.

3. **The worker/mcp-server `2>/dev/null && cd || cd` exit-code masking IS a confirmed bug** by code reading — even though it doesn't match the headline symptom, Plan 02 should remove it as cleanup.

4. The two confirmed contributing factors (H4 lockfile-fallback + H5 race) cannot be definitively ruled in or out without instrumenting a controlled re-run of `update.sh` on a fresh clone — out of scope here. Per the Phase 31 CONTEXT decision: BUILD-01's fail-loud guard becomes the safety net. If guard ever fires post-deploy, the `update-history/*.log` from Phase 33 (OBS-01) will pin down which contributing factor was active that run.

So: **the trigger cause cannot be removed in this phase** (no single-fault root cause was confirmed), but the symptom can be eliminated by making silent-fail impossible. BUILD-01 + BUILD-02 are sufficient to satisfy the user's actual need ("never silently ship a broken deploy again").

## Recommended Remediation For Plan 02

Plan 02's patch script MUST do the following based on this investigation:

1. **`set -euo pipefail` is already present (line 8) — no action needed.** Verify presence in the patch script idempotency check; if a future host's update.sh ever lacks it, Plan 02 should inject it as the first non-comment, non-shebang line.

2. **`cd /opt/livos` before each pnpm invocation is unnecessary** — script already uses absolute `cd "$LIVOS_DIR/..."` everywhere. **Skip.** (H2 ruled-out.)

3. **Insert `verify_build()` helper after the `# ── Step 5: Build packages ──` header (line 141 anchor)** — REQUIRED per BUILD-01. Helper signature:
   ```bash
   verify_build() {
       local dir="$1"
       local pkg="$2"
       if [[ ! -d "$dir" ]] || [[ -z "$(find "$dir" -type f -print -quit 2>/dev/null)" ]]; then
           fail "BUILD-FAIL: $pkg produced empty $dir"
       fi
   }
   ```
   Then replace each of the 6 `ok "<pkg> built"` lines with `verify_build "<expected dist path>" "<pkg name>" && ok "<pkg> built"`. The Nexus memory replacement must be guarded (`if [[ -d "$NEXUS_DIR/packages/memory" ]]; then ...`) since Server4 doesn't have that build step yet.

4. **Replace the `find ... | head -1` dist-copy block (lines 183-187) with a loop over ALL `@nexus+core*` dirs, with per-copy verification** — REQUIRED per BUILD-02:
   ```bash
   for store_dir in "$LIVOS_DIR/node_modules/.pnpm/"@nexus+core*/; do
       [[ -d "$store_dir" ]] || continue
       target="$store_dir/node_modules/@nexus/core"
       cp -rf "$NEXUS_DIR/packages/core/dist" "$target/" || fail "DIST-COPY-FAIL: copy to $store_dir failed"
       [[ -n "$(find "$target/dist" -type f -print -quit 2>/dev/null)" ]] || fail "DIST-COPY-FAIL: $store_dir/node_modules/@nexus/core/dist is empty after copy"
   done
   ok "Nexus dist linked to all pnpm-store resolution dirs"
   ```

5. **Remove the `2>/dev/null && cd ... || cd ...` exit-code masking on worker (line 177) and mcp-server (line 180)** — these aren't the BACKLOG 999.5 trigger but they are confirmed bugs and would mask a future BUILD-03 root cause from being diagnosed. Replace with proper `cd && npx tsc && cd && verify_build && ok` chains. This is BUILD-01 by extension (apply the verify guard uniformly to all 6 builds, not just the three named in the symptom).

6. **Add memory-package build to Server4's update.sh** if the patch detects its absence — incidental finding from the host diff (Mini PC has it, Server4 does not). Plan 02 patch should detect via `grep -q 'Building Nexus memory' "$UPDATE_SH"` and inject the missing block. Independent of BUILD-01/02/03 — just a consistency fix.

7. **Do NOT touch `pnpm install --frozen-lockfile 2>/dev/null || pnpm install` in this phase** — H4 is inconclusive; rewriting it could introduce its own regressions. If BUILD-01 guard fires on a future deploy AND `update-history/*.log` (OBS-01) shows it correlates with frozen-lockfile fallback, revisit in a later phase. Document this as a watch-item.

## Confidence

**Medium.** A single deterministic root-cause was NOT pinned down — the investigation was code-reading-only with no live reproduction (a controlled re-run of update.sh on a fresh clone with strace/inotify is what would confirm H4 vs H5 vs unknown-7). However, the remediation list is **high-confidence sufficient** to make silent-fail impossible going forward, regardless of which contributing factor recurs.

**What would raise confidence to high:**
- Reproduce the silent fail in a controlled env (Phase 35's GH Actions container is the right home for this — out of scope here).
- Add `pnpm install --reporter=ndjson` log capture to OBS-01's update-history so post-mortem can prove H4.
- Strace `npx tsc` invocation during a known-failed update to capture syscalls (extreme — only if BUILD-01 guard fires and root-cause hunt resumes).

## Notes For Future Phases

1. **Memory-package build missing from Server4** (lines 168-174 on Mini PC absent on Server4). Already partially tracked in MEMORY.md ("update.sh builds core/worker/mcp-server but NOT memory"). Plan 02 patch addresses for new patches. **No new BACKLOG entry needed** — Plan 02 closes it as part of remediation item #6 above.

2. **Two hosts running different update.sh revisions.** This is expected (update.sh is patched in-place by patch scripts, so hosts drift between patches), but confirms that Plan 02's idempotency check must handle both code paths. Phase 35's CI smoke test (BUILD-04) should snapshot the canonical post-patch update.sh and assert it matches across hosts.

3. **`pnpm install --frozen-lockfile 2>/dev/null || pnpm install` silent fallback** is a watch-item — not patched in Phase 31 (H4 inconclusive), but if BUILD-01 guard ever fires post-Phase-31 deploy, this is the first thing to instrument. Worth adding `[INFO] frozen-lockfile install failed, retrying without lockfile` warning before the `||` so the fallback is at least visible in logs.

4. **The `[OK]` log lines are misleading at the line level** — they print after the `cd` back to project root, not after the actual build command. Consider renaming the helper from `ok` to `built_ok` or putting the build-and-verify into a single helper invocation so future maintainers can't re-introduce the "ok prints unconditionally" pattern by accident. Optional polish, not required.
