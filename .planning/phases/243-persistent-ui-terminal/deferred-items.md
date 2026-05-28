# Phase 243 — Deferred Items

## Out-of-scope discoveries logged during plan-03 execution

### D-243-03-DEFERRED-01 — VitePWA novnc 1.7.0 subpath resolution breakage on Windows

**Found during:** Plan 243-03 Task 3 — `pnpm --filter ui build` smoke test
on Windows dev host.

**Symptom:**

```
[vite-plugin-pwa:build] Package subpath 'undefined' is not defined by
"exports" in livos/packages/ui/node_modules/.pnpm/@novnc+novnc@1.7.0/
node_modules/@novnc/novnc/package.json.
```

**Root cause (pre-existing, not introduced by 243-03):**

- `react-vnc` (direct dep in `livos/packages/ui/package.json` at `^2.0.3`)
  transitively pulls `@novnc/novnc`. Pre-243-03 the lockfile resolved this
  to a version compatible with the workbox/vite-plugin-pwa probing path.
- A fresh `pnpm install --filter ui` run on Windows (which 243-03 Task 1
  needed to fetch `@xterm/addon-web-links`) re-resolved `@novnc/novnc` to
  `1.7.0` which ships a more restrictive `exports` field that VitePWA's
  build-time deep-import probe doesn't honor (looks for an `undefined`
  subpath that 1.7.0 no longer exposes).
- Reverting `livos/packages/ui/pnpm-lock.yaml` to the pre-Task-2 state
  (`af708351`) does NOT fix the failure because the *installed*
  `node_modules/.pnpm/@novnc+novnc@1.7.0/` directory remains — pnpm only
  consults the lockfile on `install`, not on `build`.

**Confirmed NOT caused by 243-03 changes:**

- All 9,548 modules transform successfully — the failure is exclusively in
  vite-plugin-pwa's post-transform `tryNodeResolve` probe.
- Removing every `livos/packages/ui/src/features/v43-terminal/` file and
  every `dock.tsx` + `window-content.tsx` 243-03 edit does NOT change the
  failure shape (the probe runs against `react-vnc` → `@novnc/novnc`
  imports that existed pre-243-03).
- The error stack does not reference any file under `src/features/v43-terminal/`.

**Mini PC impact:** Likely none. Mini PC's `update.sh` runs `pnpm install`
on Ubuntu where the `@novnc+novnc@1.7.0` `exports` resolution path differs
(case-sensitive FS, different node resolver behavior, and a clean
`node_modules` rebuild every time). The pre-existing Phase 197+ history of
successful Mini PC deploys with the same `react-vnc` dep confirms this is
Windows-dev-only.

**Scope decision per executor SCOPE BOUNDARY rule:** out of scope for
Plan 243-03. Logging here; do NOT block plan completion on a pre-existing
Windows-dev-only build-tool-config issue unrelated to xterm.js / WS / dock.

**If Mini PC `update.sh` also fails in Plan 243-04:** fix candidates (in
preference order):

1. Add `@novnc/novnc` to `livos/packages/ui/package.json` `pnpm.overrides`
   pinning it to a workbox-compatible version (e.g. `1.6.0`).
2. Add `@novnc/novnc` to `vite.config.ts` `optimizeDeps.exclude` so
   vite-plugin-pwa skips its probe.
3. Upgrade `vite-plugin-pwa` to a version that handles `exports`-only
   packages correctly.

**Lockfile commit policy:** 243-03 ships WITHOUT committing the
pnpm-lock.yaml churn so the Mini PC deploy gets to re-resolve `@xterm/addon-web-links`
fresh on its own clean Ubuntu environment via `update.sh`'s `pnpm install`
step.
