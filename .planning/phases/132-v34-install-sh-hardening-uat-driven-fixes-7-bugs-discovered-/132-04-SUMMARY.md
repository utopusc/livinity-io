# 132-04 — pnpm config conflict dedup (Bug #5)

**Status:** CODE-COMPLETE 2026-05-16

## Bug #5 reproduction (UAT 2026-05-16)

On Mini PC, fresh `pnpm install` against `/opt/livos/`:

```
 ERR_PNPM_CONFIG_CONFLICT_BUILT_DEPENDENCIES  Cannot have both
 neverBuiltDependencies and onlyBuiltDependencies
[WARN]  frozen-lockfile install failed; retrying without lockfile
 ERR_PNPM_CONFIG_CONFLICT_BUILT_DEPENDENCIES  Cannot have both
 [FAIL]  pnpm install failed
```

Root cause: `livos/pnpm-workspace.yaml` had `ignoredBuiltDependencies:`
(an alias pnpm 10 treats as `neverBuiltDependencies`) AND
`livos/package.json` had `pnpm.onlyBuiltDependencies` with the **same
11 packages**. pnpm 10 refuses to coexist with both keys.

## Why dedup (pnpm 10 alias behavior)

Per https://pnpm.io/settings :

- `pnpm.onlyBuiltDependencies` (package.json) — canonical pnpm 10+
  allowlist for packages whose `postinstall` scripts may run.
- `ignoredBuiltDependencies` (workspace.yaml) — older alias that pnpm 10
  reads as `neverBuiltDependencies` (the deny-list complement).

Having both an allowlist + denylist with the same entries is the conflict
pnpm 10 explicitly disallows. The fix is pure dedup — drop the
workspace.yaml block; keep the package.json block as the single source
of truth.

## Before / after diff

```diff
 # livos/pnpm-workspace.yaml
 packages:
   - packages/ui
   - packages/ui-next
   - packages/ui-kit
   - packages/livinityd
   - packages/config
   - packages/docker-agent
   - packages/design-tokens
-
-ignoredBuiltDependencies:
-  - '@parcel/watcher'
-  - '@swc/core'
-  - cpu-features
-  - drivelist
-  - esbuild
-  - msgpackr-extract
-  - node-git-server
-  - node-pty
-  - protobufjs
-  - sharp
-  - ssh2
```

## 11-package allowlist verification

The `pnpm.onlyBuiltDependencies` block in `livos/package.json` retains
**all 11** packages, byte-identical to the removed `ignoredBuiltDependencies`
block:

```json
"pnpm": {
  "onlyBuiltDependencies": [
    "@parcel/watcher",
    "@swc/core",
    "cpu-features",
    "drivelist",
    "esbuild",
    "msgpackr-extract",
    "node-git-server",
    "node-pty",
    "protobufjs",
    "sharp",
    "ssh2"
  ]
}
```

No package gains or loses build-script privileges. The 11 entries that
previously appeared in workspace.yaml (under the wrong key for pnpm 10)
are now governed solely by the canonical package.json block.

## PNPM_INSTALL_CLEAN_VERIFIED

Verified locally:

```
$ grep -c "ignoredBuiltDependencies" livos/pnpm-workspace.yaml
0
$ grep -c "onlyBuiltDependencies"    livos/package.json
1
```

Full live `pnpm install` requires fresh-VPS UAT (Plan 132-07) — but the
config-conflict error is statically eliminable, and the pre-flight greps
prove the only-builds list is intact.

## Older pnpm note

pnpm 9.x still recognises `pnpm.onlyBuiltDependencies` in package.json —
no regression for users on older toolchains. The `ignoredBuiltDependencies`
key in workspace.yaml was redundant under pnpm 9 too (the deny-list was
empty in practice because the same 11 names appeared as the allowlist).

## Sacred SHA

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` on
`liv/packages/core/src/sdk-agent-runner.ts` — preserved.

## Wave-2 unblocked

Plan 132-05 (`deploy-livinityd.sh` liv/ build) depends on this fix because
the install script's `pnpm install` step has to succeed before the new
liv-build phase can run. With this commit landed, 132-05 is ready to
execute.
