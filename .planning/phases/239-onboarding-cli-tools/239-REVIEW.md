---
phase: 239-onboarding-cli-tools
reviewed: 2026-05-27T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - livos/packages/livinityd/source/modules/cli-installer/types.ts
  - livos/packages/livinityd/source/modules/cli-installer/install-scripts.ts
  - livos/packages/livinityd/source/modules/cli-installer/installer.ts
  - livos/packages/livinityd/source/modules/cli-installer/detector.ts
  - livos/packages/livinityd/source/modules/cli-installer/index.ts
  - livos/packages/livinityd/source/modules/cli-installer/__tests__/installer.test.ts
  - livos/packages/livinityd/source/modules/cli-installer/__tests__/detector.test.ts
  - livos/packages/livinityd/source/modules/server/trpc/cli-installer-router.ts
  - livos/packages/livinityd/source/modules/server/trpc/__tests__/cli-installer-router.test.ts
  - livos/packages/livinityd/source/modules/server/trpc/index.ts
  - livos/packages/livinityd/source/modules/server/trpc/common.ts
  - livos/packages/livinityd/source/index.ts
  - scripts/install/cli/claude-code.sh
  - scripts/install/cli/opencode.sh
  - scripts/install/cli/gemini.sh
  - scripts/install/cli/openclaw.sh
  - scripts/install/cli/aion-cli.sh
  - livos/packages/ui/src/features/onboarding-flow/steps/cli-tools-step.tsx
  - livos/packages/ui/src/features/onboarding-flow/steps/cli-tools-step.test.tsx
  - livos/packages/ui/src/features/onboarding-flow/constants.ts
  - livos/packages/ui/src/routes/onboarding/setup-wizard-v2.tsx
  - livos/packages/ui/src/features/onboarding-flow/steps/done-step.tsx
findings:
  critical: 0
  warning: 4
  info: 6
  total: 10
status: issues_found
---

# Phase 239: Code Review Report

**Reviewed:** 2026-05-27
**Depth:** standard
**Files Reviewed:** 21 (+ 1 done-step.tsx not in the changed set but loaded for context)
**Status:** issues_found

## Summary

Phase 239 ships an onboarding CLI-installer surface (5 supported CLIs) plus a tRPC `cliInstaller.{install,detect}` namespace and a React `CliToolsStep`. The RCE boundary (D-239-07) is **correctly enforced**: every install/detect path passes through `SUPPORTED_CLIS_SET.has(name)` before any `spawn` fires, the guard fires in BOTH the tRPC router AND the spawn-wrapper layers (defense in depth), and `spawn('bash', [scriptPath])` uses argv-array form with the script path computed from the enum-constrained CLI name — there is no `bash -c userString` path anywhere in the production flow. The `bash -c "command -v ${bin}"` form in `detector.ts` is safe because `${bin}` is read from the `CLI_BIN_NAMES` constant map keyed by the validated enum, never user input. Tests explicitly assert the whitelist guard blocks RCE-shaped names like `"claude-code; rm -rf /"` BEFORE any spawn call (`installer.test.ts:63-70`, `cli-installer-router.test.ts:90-97`).

Strong points worth highlighting:
- adminProcedure gate verified in router test T8 (line 165-171).
- Whitelist contract drift-locked by `SUPPORTED_CLIS_SET.size === 5` assertions in two test files.
- Output capped at 32KB tail to prevent OOM from runaway install scripts.
- 5-minute SIGKILL timeout on installer + 5-second timeout on detector probes.
- React state machine uses a reducer with atomic `{type:'set', id, state}` actions; the `detect → installed` sync only promotes `not-installed` cards (line 128) so in-flight or recently-failed installs are not clobbered.
- Tail-truncation of failure output (3 lines, 400 chars) in the UI (line 149) protects against accidental secret-bleed.

Open concerns: per-card race in `setData(cliInstalled)` when two installs land near-simultaneously; `gemini.sh` runs `npm install -g` without sudo (will likely fail under livinityd's bruce uid on Mini PC unless npm prefix is user-local); detector queries fire eagerly even when the feature flag is OFF (negligible cost, but worth a guard); `aion-cli.sh` ships with unverified package names by design (acknowledged in script comments).

No critical security issues. No hardcoded secrets. No SQL/path-traversal vectors.

## Warnings

### WR-01: Race condition on `data.cliInstalled` when two cards install concurrently

**File:** `livos/packages/ui/src/features/onboarding-flow/steps/cli-tools-step.tsx:135-165`
**Issue:** `handleInstall` is a `useCallback` that closes over `data` (line 164 deps). If the operator clicks Install on card A and immediately on card B before A's `mutateAsync` resolves, both callbacks capture the SAME `data` snapshot. When A resolves first it calls `setData({...data, cliInstalled: [...data.cliInstalled, 'A']})`. When B resolves it calls `setData({...data, cliInstalled: [...data.cliInstalled, 'B']})` — but `data` here is the pre-A snapshot, so B's update OVERWRITES A's contribution, leaving `cliInstalled: ['B']`. The card UI is unaffected (per-card reducer is correct), but the persisted onboarding data loses A's row, which downstream consumers (settings sync, telemetry) will miss.
**Fix:** Switch to functional updater so React always reduces against the latest committed `data`:
```tsx
// Replace lines 142-144 with:
setData((prev: OnboardingData) => {
  const next = new Set(prev.cliInstalled ?? [])
  next.add(id)
  return {...prev, cliInstalled: Array.from(next)}
})
```
This requires lifting the `setData` prop signature in `Props` to accept either a value or an updater (i.e. `(d: OnboardingData | ((prev: OnboardingData) => OnboardingData)) => void`). If the parent wizard's `setData` is the React `useState` setter (it is — `setup-wizard-v2.tsx:55`), this works without changes upstream.

### WR-02: `gemini.sh` runs `npm install -g` without sudo — likely fails under livinityd's bruce uid

**File:** `scripts/install/cli/gemini.sh:38`
**Issue:** `npm install -g @google/gemini-cli` writes to the global npm prefix (typically `/usr/local/lib/node_modules` on Linux). livinityd on Mini PC runs as `bruce` (per Phase 86 ownership and `feedback_caddyfile_must_be_bruce_owned`), and `/usr/local/lib/node_modules` is root-owned by default. The mutation will exit non-zero with EACCES and the UI will surface "Failed" even on a perfectly healthy system. The script doesn't probe npm's effective prefix or fall back to `npm config set prefix ~/.npm-global` + PATH adjustment.
**Fix:** Either (a) configure npm's prefix to a bruce-writable location before the install, or (b) use sudo with a narrow sudoers Cmnd_Alias (matches the timedatectl precedent in Phase 196-05). Recommended (a):
```bash
# In gemini.sh, before `npm install -g`:
if [[ ! -w "$(npm config get prefix 2>/dev/null || echo /usr/local)" ]]; then
    info "npm global prefix not writable — configuring ~/.npm-global"
    mkdir -p "${HOME}/.npm-global"
    npm config set prefix "${HOME}/.npm-global"
    export PATH="${HOME}/.npm-global/bin:${PATH}"
fi
```
Same concern applies to `aion-cli.sh:51-53` (also `npm install -g`).

### WR-03: detect queries fire unconditionally — even when feature flag is OFF

**File:** `livos/packages/ui/src/features/onboarding-flow/steps/cli-tools-step.tsx:95-114` (combined with `setup-wizard-v2.tsx:236-277`)
**Issue:** The 5 `useQuery` calls in `CliToolsStep` have no `enabled` guard. When `setup-wizard-v2.tsx` lazy-renders the step inside `<Step stepIndex={4}>`, React still mounts the component for transitions (the Step wrapper at `Step` likely keeps both prev and current step in the DOM during animation). When the feature flag is `false`, the flag-disabled fallback is rendered INSIDE `<Step stepIndex={4}>` at lines 248-276 — `CliToolsStep` itself is not rendered. Good — no leak today. BUT: should anyone refactor `setup-wizard-v2.tsx` to always-mount `CliToolsStep` (and gate only the rendered grid), 5 admin-only detect probes would fire on every wizard load.
**Fix:** Defense in depth — add `enabled` guards inside `CliToolsStep` so it remains correct even if remounted under a flag-disabled tree:
```tsx
const detectClaude = trpcReact.cliInstaller.detect.useQuery(
  {name: 'claude-code'},
  {staleTime: 30_000, retry: false, enabled: typeof window !== 'undefined'},
)
```
Or better: lift the flag check to a prop and pass through to `enabled`. Current code is not broken; this is a defense-in-depth recommendation.

### WR-04: `joinTail` interleaves stdout+stderr by full concatenation, not chronological order

**File:** `livos/packages/livinityd/source/modules/cli-installer/installer.ts:37-41` (and lines 105, 130)
**Issue:** `Buffer.concat([...stdoutChunks, ...stderrChunks])` glues ALL stdout in front of ALL stderr regardless of arrival order. When an install script interleaves `info "fetching"` (stdout via `_logging.sh`) with `curl: (6) Could not resolve host` (stderr), the captured `result.output` will misleadingly show all info lines first and all errors last. The 32KB tail then drops the EARLIER stderr lines (likely the actual error cause) and keeps later stdout lines (likely just trailing `set -e` exit). This can produce a UI "Failed" message with output that doesn't contain the actual failure reason.
Note: `_logging.sh` writes to `>&2` so most diagnostic lines go to stderr anyway, mitigating the worst case — but install-script `curl | bash` chains write to both streams.
**Fix:** Capture chunks into a single chronologically-ordered buffer with a timestamp or a single shared array:
```ts
const allChunks: Buffer[] = []
child.stdout?.on('data', (c) => allChunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))))
child.stderr?.on('data', (c) => allChunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))))
// Then joinTail(allChunks) for both stdout+stderr in arrival order.
```
This is the standard pattern for capturing subprocess output and preserves the interleaving that operator debugging needs.

## Info

### IN-01: `aion-cli.sh` ships best-effort installer (acknowledged)

**File:** `scripts/install/cli/aion-cli.sh:44-55`
**Issue:** Script tries `npm install -g @aion-ai/cli`, falls back to `npm install -g aion-cli`, both possibly nonexistent. Comments acknowledge canonical source was unverified at planning time and Phase 240 is the intended supersede. Acceptable for v1 onboarding ship.
**Fix:** Phase 240 should verify the canonical npm package name before promoting this script to "verified." Until then, the visible `warn "aion-cli: install command is best-effort"` line is the right user-facing communication.

### IN-02: `assert {type: 'json'}` import in `livinityd/source/index.ts:6` is deprecated syntax

**File:** `livos/packages/livinityd/source/index.ts:6`
**Issue:** `await import('../package.json', {assert: {type: 'json'}})` uses the deprecated `assert` keyword. Modern Node 22+ uses `with: {type: 'json'}`. Not in this phase's diff (pre-existing), but flagged for awareness — future TypeScript/Node upgrades may surface a deprecation warning here.
**Fix:** No action required in this phase. Track in a separate cleanup ticket.

### IN-03: Feature flag readable via plain localStorage is trivially bypassable client-side

**File:** `livos/packages/ui/src/routes/onboarding/setup-wizard-v2.tsx:182-186`
**Issue:** `window.localStorage.getItem('livos.v43.onboarding_cli_section') === 'true'` is set by the operator from DevTools or by Plan 239-03 deploy seed (per the comment at 174-181). A malicious tab with same-origin access could flip the flag without admin consent. However, the **security boundary is the backend whitelist** (D-239-07), not the UI flag — even if a user flips the flag client-side, every install hits the tRPC `cliInstaller.install` mutation which independently enforces `SUPPORTED_CLIS_SET` + adminProcedure. The flag is only UI gating for the unfinished "polished onboarding" experience, not a security control. Plan comment correctly identifies this at line 13-23 of `cli-tools-step.tsx`.
**Fix:** No action required. Worth a one-line comment near `setup-wizard-v2.tsx:182` explicitly stating "UI gate only; backend whitelist is the security boundary."

### IN-04: `Set` constructor in `handleInstall` could be hoisted

**File:** `livos/packages/ui/src/features/onboarding-flow/steps/cli-tools-step.tsx:142-144`
**Issue:** `new Set(data.cliInstalled ?? [])` recreates a Set on every install. Micro-optimization only — fix this concurrent with WR-01 above and the code becomes both correct (functional updater) and equally efficient.
**Fix:** Subsumed by WR-01 fix.

### IN-05: `eval`-shaped pattern false positive — none of the install scripts use eval

**File:** `scripts/install/cli/*.sh`
**Issue:** Quick grep for `eval\|exec\|source` shows only `source "${SCRIPT_DIR}/../_logging.sh"` which is a sourced library file from a static repo path (not user input). No `eval` or dynamic command construction. Defense-in-depth note: should _logging.sh ever accept user input, this pattern would need re-review.
**Fix:** None — informational.

### IN-06: `process.env.LIVOS_ROOT ?? '/opt/livos'` fallback is correct but undocumented at type level

**File:** `livos/packages/livinityd/source/modules/cli-installer/install-scripts.ts:37-40`
**Issue:** `resolveInstallScript` silently falls back to `/opt/livos` when `LIVOS_ROOT` is unset. This is the right Mini PC behavior (livos.service exports it; vitest does not), and tests cover script-path matching via regex (`installer.test.ts:93`). No bug, but a misconfigured non-Mini-PC deploy that runs livinityd outside `/opt/livos` AND fails to set `LIVOS_ROOT` will produce a confusing `ENOENT: scripts/install/cli/<name>.sh` from the spawn. The current `===SPAWN-FAILED===` marker surfaces the error path correctly.
**Fix:** Optional — log the resolved root once at module-load time so operator can audit. Or leave as-is — the spawn-failed output already carries the path.

---

_Reviewed: 2026-05-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
