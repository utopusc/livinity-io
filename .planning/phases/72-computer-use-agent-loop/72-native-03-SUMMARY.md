---
phase: 72-computer-use-agent-loop
plan: native-03
subsystem: computer-use / native X11 port
tags: [computer-use, bytebot, native-port, window, application, wmctrl, file-read]
requires:
  - 72-native-01 (native/index.ts barrel + screenshot.ts foundation)
provides:
  - native.openOrFocus(application) — launches or focuses Mini PC native apps
  - native.listWindows() — wmctrl -lx parser → window records
  - native.readFileBase64(path) — fs.readFile → base64 + MIME inference
  - barrel export from native/index.ts (consumed by 72-native-05 MCP server)
affects:
  - livos/packages/livinityd/source/modules/computer-use/native/window.ts (NEW, 298 LOC)
  - livos/packages/livinityd/source/modules/computer-use/native/window.test.ts (NEW, 243 LOC)
  - livos/packages/livinityd/source/modules/computer-use/native/index.ts (PATCH, +1 line)
tech-stack:
  added: []  # zero npm deps; uses node:child_process + node:fs/promises only
  patterns:
    - "spawn array-args form (no shell concat) — T-72N3-02 mitigation"
    - "detached:true + stdio:'ignore' + child.unref() — Node-native replacement for upstream nohup"
    - "exec(wmctrl -lx) JS-side string-search for class detection (no shell pipe)"
    - "inline MIME_MAP (no mime-types runtime dep) — D-NO-NEW-DEPS / D-NATIVE-12"
    - "process.platform stub via Object.defineProperty in test setup (linux-only D-NATIVE-14 guard)"
key-files:
  created:
    - livos/packages/livinityd/source/modules/computer-use/native/window.ts
    - livos/packages/livinityd/source/modules/computer-use/native/window.test.ts
  modified:
    - livos/packages/livinityd/source/modules/computer-use/native/index.ts
decisions:
  - "Inline MIME_MAP over mime-types dep — minimum-deps discipline; 20 entries cover the common case"
  - "spawn-with-detached + child.unref() replaces upstream nohup wrapper — Node-idiomatic"
  - "1password unsupported on Mini PC native — returns isError instead of map miss; explicit message"
  - "gnome-terminal + nautilus + firefox replace upstream xfce4-terminal/thunar/firefox-esr (D-NATIVE-07)"
  - "wmctrl class detection via exec then JS .includes — avoids shell injection surface vs grep pipe"
  - "platform guard scope: openOrFocus + listWindows linux-gated; readFileBase64 NOT gated (works in tests + on dev)"
metrics:
  duration: ~10 min
  completed: 2026-05-05T21:16Z
  tasks_completed: 3
  test_count: 11
  test_pass: 11
sacred_sha:
  pre: 4f868d318abff71f8c8bfbcf443b2393a553018b
  post: 4f868d318abff71f8c8bfbcf443b2393a553018b
  unchanged: true
---

# Phase 72 Plan native-03: Window Management + File Read Native Port — Summary

**One-liner:** Wave-1 sibling that ports Bytebot's `application` action + `read_file` action handlers to a NestJS-free, sudo-free, container-free Node module on the Mini PC's native X server. 3 pure async functions (`openOrFocus`, `listWindows`, `readFileBase64`), 11 vitest cases mocking `node:child_process` and `node:fs/promises`. Apache 2.0 attribution preserved. Sacred SHA `4f868d31...` unchanged.

## Files

| File | Status | Lines | Purpose |
|------|--------|-------|---------|
| `livos/packages/livinityd/source/modules/computer-use/native/window.ts` | NEW | 298 | 3 native primitives + APP_MAP + MIME_MAP + helpers |
| `livos/packages/livinityd/source/modules/computer-use/native/window.test.ts` | NEW | 243 | 11 vitest cases (T1..T9 + 2 mime fallbacks) |
| `livos/packages/livinityd/source/modules/computer-use/native/index.ts` | PATCH | 12 (1 line replaced) | Barrel: replaced placeholder with `export * from './window.js'` |

## Public API (final form)

```typescript
type ApplicationName =
  | 'firefox' | 'thunderbird' | 'vscode'
  | 'terminal' | 'directory' | 'desktop' | '1password';

export async function openOrFocus(application: ApplicationName):
  Promise<{ isError: boolean; message?: string }>;

export async function listWindows():
  Promise<Array<{ id: string; class: string; title: string }>>;

export async function readFileBase64(filePath: string): Promise<{
  base64: string;
  filename: string;
  size: number;
  mimeType: string;
}>;
```

## APP_MAP (final, locked for 72-native-05 MCP wiring)

| App key       | command          | wmctrl -lx class                          | Notes |
|---------------|------------------|-------------------------------------------|-------|
| firefox       | `firefox`        | `firefox.Firefox`                         | Mini PC ships firefox via apt, NOT firefox-esr (D-NATIVE-07) |
| thunderbird   | `thunderbird`    | `Mail.thunderbird`                        | Best-effort class; 72-native-07 UAT verifies on Mini PC |
| vscode        | `code`           | `code.Code`                               | Standard Microsoft package class |
| terminal      | `gnome-terminal` | `gnome-terminal-server.Gnome-terminal`    | Replaces upstream xfce4-terminal (Mini PC runs GNOME) |
| directory     | `nautilus`       | `nautilus.Nautilus`                       | Replaces upstream thunar |
| desktop       | (special)        | (none — runs `wmctrl -k on`)              | Show-desktop toggle, no class lookup |
| 1password     | (unsupported)    | (none)                                    | Returns `{isError:true, message:'application not installed: 1password'}` without spawning |

**Class names are best-effort** — 72-native-07 UAT will run real `wmctrl -lx` on Mini PC and patch the table if any classes diverge from upstream.

## Test Coverage

| ID  | Suite | Case |
|-----|-------|------|
| T1  | module shape | `openOrFocus`/`listWindows`/`readFileBase64` are functions |
| T2  | openOrFocus | firefox already-open → spawns `wmctrl -x -a firefox.Firefox`; no detached firefox launch |
| T3  | openOrFocus | firefox not-yet-open → spawns `firefox` detached, `stdio:'ignore'`, `env.DISPLAY=':0'`, `child.unref()` called |
| T4  | openOrFocus | `1password` unsupported → returns isError, NO spawn |
| T5  | openOrFocus | `desktop` → spawns `wmctrl -k on` |
| T9  | openOrFocus | invalid app name (cast to bypass TS) → runtime guard returns isError, no spawn |
| T6  | listWindows | parses 2 valid wmctrl -lx lines → 2 entries |
| T7  | listWindows | malformed line skipped + `console.warn` called |
| T8  | readFileBase64 | `.png` path → returns `{base64, filename:'foo.png', size, mimeType:'image/png'}` |
| T8b | readFileBase64 | unknown extension → fallback `application/octet-stream` |
| T8c | readFileBase64 | `.txt` path → mimeType matches `^text/plain` |

**Result:** 11/11 pass (`pnpm vitest run source/modules/computer-use/native/window.test.ts`, 16ms).

## Decision Log

### 1. Spawn-detached + child.unref() replaces upstream `nohup`

**Choice:** Node-native lifecycle decoupling via `{detached:true, stdio:'ignore'}` + `child.unref()`.

**Why:** Upstream Bytebot uses `spawn('sudo', ['-u', 'user', 'nohup', command])` to detach the child from the bytebotd parent. On the Mini PC native deployment, livinityd runs as root (D-NATIVE-09) — no `sudo -u user` wrapper needed. `nohup` is a shell-only construct; the Node-idiomatic equivalent (`detached:true` + `unref`) achieves the same goal (child outlives parent) without invoking a shell, which also eliminates the shell-injection attack surface (T-72N3-02 mitigation).

### 2. Inline MIME_MAP over `mime-types` dep

**Choice:** Hand-rolled 20-entry MIME table inside window.ts, fallback `application/octet-stream`.

**Why:** D-NO-NEW-DEPS / D-NATIVE-12 — phase 72-native-* is allowed exactly ONE new npm dep (`@nut-tree-fork/nut-js` from 72-native-01). Even though `mime-types` is already in livinityd's transitive tree (`@types/mime-types` is in devDependencies), importing it from this leaf module would couple us to a version we don't pin directly. The 20 entries cover every file type the agent is realistically going to base64-encode (images, text, archives, source code). Future hardening: extract to a shared utility if the map grows.

### 3. wmctrl class detection via JS-side `.includes`

**Choice:** `exec('wmctrl -lx')` then `stdout.includes(className)` in JS, NOT `exec('wmctrl -lx | grep <class>')`.

**Why:** Shell-pipe form would require concatenating `className` into the command string — even though `className` is an internal constant from APP_MAP (never user-controlled), using JS-side string search keeps the entire spawn surface free of shell metacharacter concerns. Defense in depth.

### 4. `1password` unsupported handling

**Choice:** Map entry `{unsupported: true}` returns explicit `{isError:true, message:'application not installed: 1password'}` without spawning.

**Why:** Mini PC native (Ubuntu 24.04 server-grade install) does not ship 1password by default — the user explicitly stated this in the D-NATIVE-07 spec. Upstream Bytebot's container DOES install 1password, but the native port has nothing to launch. Rather than letting the spawn fail with a noisy ENOENT-via-X-server error, we short-circuit at the map level. The MCP `application` tool handler in 72-native-05 forwards the message verbatim to the agent, which can then route around the unsupported app gracefully.

### 5. Platform guard scope: `openOrFocus`/`listWindows` linux-gated; `readFileBase64` NOT gated

**Choice:** D-NATIVE-14 platform guard only on the X-server-dependent functions.

**Why:** `readFileBase64` is pure fs read + base64 + path inference — it works on any OS. Gating it would block useful unit tests and the dev-workflow case where livinityd is exercised on Windows for non-X surfaces. The X-server-dependent surfaces (`openOrFocus` calls `wmctrl`/`firefox`/etc.; `listWindows` calls `wmctrl`) DO require linux + `DISPLAY=:0` and throw a clear cross-platform-incompatible error otherwise.

### 6. `process.platform` stub via `Object.defineProperty` in test setup

**Choice:** Top-of-file stub `Object.defineProperty(process, 'platform', {value:'linux', configurable:true})` + `afterAll` restore.

**Why:** Tests run on Windows dev env (`process.platform === 'win32'`). The D-NATIVE-14 guard would throw before reaching the spawn-mock assertions. Stubbing `process.platform` is the cleanest path — alternatives (mocking the guard helper, conditional skip on win32) either weaken the test or hide platform-divergence bugs. The `afterAll` restore prevents leaking the stub into adjacent test files in vitest's single-thread mode.

## Threat Model Compliance

| Threat ID | Disposition | Implementation |
|-----------|-------------|----------------|
| T-72N3-01 (info disclosure via readFileBase64) | accept | Privileged-by-design per D-NATIVE-09; future hardening = path allowlist (deferred) |
| T-72N3-02 (shell injection via wmctrl args) | mitigate | All spawn calls use array-args form; APP_MAP keys validated before lookup; class string is internal constant |
| T-72N3-03 (DoS via huge wmctrl output) | accept | wmctrl output bounded by # of open windows; lines < 256 bytes typical; malformed-tolerant parser |
| T-72N3-04 (env shell-interpolation) | mitigate | `env: {...process.env, DISPLAY:':0'}` is object literal — no shell expansion path |

## Deviations from Plan

### Auto-fixed

**1. [Rule 3 — Blocking] Race-tolerant barrel handling**

- **Found during:** Task 2 setup
- **Issue:** Plan task 2 assumed `native/index.ts` already existed with the placeholder `// 72-native-03 window.ts barrel append here`, but at the moment Task 1 RED commit was made the `native/` directory did not yet exist (sibling 72-native-01 had not yet shipped its GREEN commit). 72-native-01 then landed (commit `aeb2f90a`) between my RED and GREEN — the barrel placeholder was created exactly as the plan expected.
- **Fix:** No fix needed — race resolved naturally. Created `native/` directory ahead of test write so the test file could be authored. Window.ts authoring waited until barrel existed, then a clean `Edit` replaced the window-placeholder line. The `// 72-native-02 input.ts barrel append here` placeholder line was preserved (sibling plan 72-native-02 is still in RED — only `input.test.ts` is on disk, no `input.ts` yet).
- **Files modified:** None beyond plan.
- **Commit:** N/A (operational, not code).

**2. [Rule 2 — Critical functionality] `process.platform` stub in test file**

- **Found during:** Task 1 GREEN initial test run
- **Issue:** Plan must-have line "Functions throw clear platform-guard error if `process.platform !== 'linux'`" + tests were authored assuming the guard is bypassed. On Windows dev env (this machine), the first test exposed that the guard would throw before reaching the spawn mocks. Plan didn't explicitly call out the stub pattern.
- **Fix:** Added `Object.defineProperty(process, 'platform', {value:'linux', configurable:true})` at top of test file + `afterAll` restore. 72-native-01's screenshot.test.ts uses an equivalent guard-tolerance pattern — symmetric handling.
- **Files modified:** `window.test.ts` (added 1 import + ~10 lines of stub/restore).
- **Commit:** `72182613` (folded into GREEN commit; the test file already contained the stub by the time GREEN was committed).

### Out-of-scope discoveries (NOT fixed — added to deferred items)

- Pre-existing typecheck errors in `livos/packages/livinityd/source/modules/user/routes.ts`, `user/user.ts`, `utilities/file-store.ts`, `widgets/routes.ts` — TS18048 / TS2345 / TS2322. None of these are touched by this plan; they predate Phase 72 and are tracked elsewhere.
- Sibling plan 72-native-02 has shipped only its RED phase (`input.test.ts` exists, `input.ts` does not). Its GREEN commit will resolve the typecheck errors in `input.test.ts(196,26): Cannot find module './input.js'` etc. NOT my responsibility.

## Sacred SHA

```
pre  = 4f868d318abff71f8c8bfbcf443b2393a553018b
post = 4f868d318abff71f8c8bfbcf443b2393a553018b
diff = unchanged ✓
```

Verified at task 1 start, task 1 end (after GREEN), task 2 end (after barrel append), task 3 final.

## Verification

- ✅ All 11 vitest cases pass (`pnpm --filter livinityd vitest run source/modules/computer-use/native/window.test.ts`, 16ms).
- ✅ `pnpm --filter livinityd typecheck` baseline preserved (zero new errors in `computer-use/native/window.ts` or `window.test.ts`).
- ✅ Barrel grep verify passes: `export * from './window'` line present; screenshot import line present.
- ✅ Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged.
- ✅ Apache 2.0 attribution header on `window.ts` references upstream `bytebotd/src/computer-use/computer-use.service.ts` + `.planning/licenses/bytebot-LICENSE.txt`.
- ✅ Spawn args use array form exclusively — no shell injection surface (T-72N3-02 mitigation).
- ✅ Zero new npm deps added (D-NATIVE-12 / D-NO-NEW-DEPS honored).

## Note for 72-native-07 (UAT)

The wmctrl class names in APP_MAP are best-effort (taken from upstream Bytebot's container which runs xfce, NOT GNOME). When the UAT plan runs on Mini PC, it must:

1. Open each app manually (`firefox`, `thunderbird`, `code`, `gnome-terminal`, `nautilus`).
2. Run `wmctrl -lx` and capture the actual `<class>` column for each.
3. Patch the APP_MAP table in `window.ts` if any class string diverges from the binding above.
4. Re-run `window.test.ts` after each patch to make sure mocks still match.

`thunderbird`'s `Mail.thunderbird` and `gnome-terminal`'s `gnome-terminal-server.Gnome-terminal` are the most likely candidates to diverge.

## Self-Check: PASSED

Verified against the staged diff:

- ✅ `livos/packages/livinityd/source/modules/computer-use/native/window.ts` exists (`git ls-files --error-unmatch` succeeds; 298 LOC).
- ✅ `livos/packages/livinityd/source/modules/computer-use/native/window.test.ts` exists (243 LOC).
- ✅ `livos/packages/livinityd/source/modules/computer-use/native/index.ts` modified (window export added on line 12).
- ✅ Commit `13acd7c1` (RED, test) reachable via `git log --oneline | grep 13acd7c1`.
- ✅ Commit `72182613` (GREEN, implementation + barrel) reachable via `git log --oneline | grep 72182613`.
- ✅ Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged at SUMMARY-write time.
