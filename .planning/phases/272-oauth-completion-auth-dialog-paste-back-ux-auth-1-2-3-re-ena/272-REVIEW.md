---
phase: 272-oauth-completion-auth-dialog-paste-back-ux-auth-1-2-3-re-ena
reviewed: 2026-06-15T00:00:00Z
depth: deep
files_reviewed: 2
files_reviewed_list:
  - livos/packages/ui/src/features/liv-ai/cli-auth-dialog.tsx
  - livos/packages/ui/src/hooks/use-cli-auth-bridge.ts
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: clean
---

# Phase 272: Code Review Report

**Reviewed:** 2026-06-15
**Depth:** deep (cross-file: bridge → dialog → shadcn Input API)
**Files Reviewed:** 2
**Status:** clean

## Summary

Phase 272 re-enables the no-terminal CliAuthDialog for `cli-auth` (reverting the v44.22 Terminal pivot) and ships the AUTH-1/2/3 paste-back UX fixes. The change is correct on every focus point. All claims in the focus list verified against source and against the real `Input`/`AnimatedInputError` API in `shadcn-components/ui/input.tsx`.

- **AUTH-1 (always-render paste field):** The code `<Input>` (cli-auth-dialog.tsx:724-737) is rendered OUTSIDE the `deviceCode` ternary — it always shows. The open-link block is correctly conditional (`deviceCode ?` link : helper text, :693-716). The old `deviceCode ? … : <Spinner>Waiting…` strand path is gone — there is no remaining code path that leaves the user on a spinner in the paste-back phase. The fire-once `pasteStarted` ref effect (:310-360) and `handleSubmitPasteCode` (:462-480) are untouched by the JSX restructure and still drive the long-running `authM` mutation to the `ready`/`auth-failed` resolution.

- **AUTH-3 (visible field + Enter):** The field is now a visible `<Input>` (:724), not the masked `PasswordInput`. Enter submits via `onKeyDown` (`e.key === 'Enter' && !e.shiftKey` → `preventDefault()` + `void handleSubmitPasteCode()`, :731-736). The bearer-token contract is intact: `handleSubmitPasteCode` clears `pasteCode` on BOTH success and failure (:472, :477) and the code is never logged or persisted. `variant={pasteError ? 'destructive' : undefined}` and `<AnimatedInputError>{pasteError}</AnimatedInputError>` match the component API exactly (`Input` spreads `placeholder`/`value`/`autoFocus`/`onKeyDown` onto the native `<input>`; `AnimatedInputError` renders nothing for a falsy child).

- **API-key onKeyDown wrappers:** Both submit correctly without double-firing. The `auth-apikey`/`authenticating` wrapper gates Enter on `phase.kind === 'auth-apikey'` (:770) — so Enter cannot re-fire `handleSubmitApiKey` once it has flipped the phase to `authenticating`. The browser-branch fallback wrapper (:821-827) gates only on Enter; that branch has no in-flight self-transition, so no double-fire there either. The `PasswordInput` eye-toggle is `tabIndex={-1}`, so Enter never lands on it.

- **AUTH-2 (API-key fallback):** The fallback is promoted from a gray link to a first-class `<Button>` (:745-760) but preserves the EXACT reset behavior: `pasteStarted.current = false`, `setPasteError(undefined)`, `setPasteCode('')`, `setPhase({kind: 'auth-apikey'})`.

- **Routing (use-cli-auth-bridge.ts):** `cli-auth` → `openCliAuthDialog({cli, mode: 'auth'})` (:189); `cli-install` still `runCliInTerminalFallback(...)` (:187); `cli-uninstall` still opens the dialog (:194). The NAME charset + allowlist RCE guard (`/^[a-z0-9-]+$/` + `INSTALLABLE_CLIS.has`, :180) is unchanged. `openCliAuthDialog` is imported (:33). `runCliInTerminalFallback` remains defined/exported (:119) and is still used by the `cli-install` path (:187) and by the dialog's "Advanced" affordance — no dead-import lint break.

- **React correctness:** No issues. The inline `onKeyDown` handlers close over `useCallback` submit handlers and are re-created each render, so no stale closure. The body is remounted per CLI via `key={state.cli}` so all refs/state reset cleanly. The paste-back fire-once effect still uses a functional `setPhase((p) => p.kind === 'auth-paste-back' ? … : p)` updater (:323-357) to avoid clobbering an api-key success if a stalled login resolves late — that guard survived the restructure.

No source files were modified during review (read-only).

## Info

### IN-01: Browser-branch Enter wrapper has no phase guard (defensive note only — not a bug)

**File:** `livos/packages/ui/src/features/liv-ai/cli-auth-dialog.tsx:821-827`
**Issue:** The `auth-apikey` Enter wrapper guards on `phase.kind === 'auth-apikey'` to avoid re-firing during the `authenticating` phase. The browser-branch fallback wrapper (`auth-browser`) intentionally omits that guard. This is correct today because `handleSubmitApiKey` transitions the phase to `authenticating`, which unmounts the entire `auth-browser` subtree (the `phase.kind === 'auth-browser'` block stops rendering) — so a second Enter cannot reach this handler. The behavior is sound; flagged only so a future refactor that keeps the browser subtree mounted during submit would know to add the same `phase.kind === 'auth-browser'` guard for symmetry.
**Fix:** Optional, for symmetry with the api-key wrapper:
```tsx
if (e.key === 'Enter' && !e.shiftKey && phase.kind === 'auth-browser') {
```

---

_Reviewed: 2026-06-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
