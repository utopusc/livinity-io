# 132-01 — Server5 dashboard HTML fixes (Bug #1+#2)

**Status:** CODE-COMPLETE 2026-05-16

## Repo decision: **Option C** — on-server is canonical

SSH probe results (2026-05-16, `root@45.137.194.102`):

```
$ git -C /opt/landing/livinity.io rev-parse --show-toplevel
fatal: not a git repository (or any of the parent directories): .git

$ git -C /opt/landing rev-parse --show-toplevel
fatal: not a git repository (or any of the parent directories): .git

$ find /opt -maxdepth 3 -name "dashboard-install.html"
/opt/landing/livinity.io/dashboard-install.html
```

`/opt/landing/livinity.io/` is **not a git repository** and there is no
parent git tree. No `dashboard-install.html` exists anywhere else under
`/opt/` either. The landing HTML files are **hand-maintained on
Server5**; no upstream source repo to back-port to.

**Implication:** every future Server5 reprovisioning or `/opt/landing/`
re-sync MUST preserve these fixes or they will silently regress. Tracked
as a follow-up risk in this SUMMARY's "Hardening follow-ups" section.

## Bug #1 — `dashboard-install.html` babel transform error

**Symptom:** Wizard stuck on "Loading…" forever. Browser console:

```
Uncaught t: .targets["esmodules"] must be a boolean, or undefined
    at SV (transform.ts:66:52)
    at FEe (index.ts:179:10)
    at transformScriptTags.ts:53:10
```

**Root cause:** The script tag was

```html
<script type="text/babel" data-type="module">
```

Babel-standalone parses `data-type="module"` as
`targets.esmodules = "module"` (a string), but Babel requires a boolean.
The transform fails silently → React component never mounts → user sees
"Loading…" forever.

**Fix (applied 2026-05-16 during UAT triage, verified still live):**

```diff
- <script type="text/babel" data-type="module">
+ <script type="text/babel">
```

Backup preserved at `/opt/landing/livinity.io/dashboard-install.html.bak-pre-babel-fix`.

**Verification:**
```
$ grep -c 'data-type="module"' /opt/landing/livinity.io/dashboard-install.html
0
```

## Bug #2 — `dashboard.html` missing Install nav link

**Symptom:** Returning users on `https://livinity.io/dashboard` cannot
reach the wizard. Only the first-run auto-redirect ever lands a user on
`/dashboard/install`.

**Root cause:** Nav block had Dashboard / Changelog / Store entries but
no Install entry.

**Fix (applied 2026-05-16 during UAT triage, verified still live):**

Inserted an `<a href="/dashboard/install">Install</a>` link after the
existing Dashboard nav entry. Backup preserved at
`/opt/landing/livinity.io/dashboard.html.bak-pre-install-link`.

**Verification:**
```
$ grep -c 'href="/dashboard/install"' /opt/landing/livinity.io/dashboard.html
1
```

## WIZARD_LOADS_CLEAN_VERIFIED

Static checks pass (above greps). Full browser-UAT (open
`https://livinity.io/dashboard/install` → wizard mounts within 5s, no
console errors, all 3 wizard steps render, form fillable) is part of
the operator-walked Plan 132-07 fresh-VPS UAT.

The fix is **already live on Server5** as of 2026-05-16 (applied
during UAT triage before this plan existed). This plan documents and
ratifies the on-server state.

## On-server-canonical handoff

Because Server5's `/opt/landing/livinity.io/` is hand-maintained (no
git tree), the following operational notes are mandatory:

1. **Backups are the only history.** The `.bak-pre-*` files in
   `/opt/landing/livinity.io/` are the only audit trail. Never `rm`
   them without recording the deleted state.
2. **Any future redeploy** of the landing tree MUST first diff against
   `dashboard-install.html.bak-pre-babel-fix` and
   `dashboard.html.bak-pre-install-link` and re-apply both edits if
   needed.
3. **`/opt/platform/web/src/app/dashboard/page.tsx`** (the Next.js
   dashboard source) was also edited during UAT triage to add a
   "Set up new server" button, but the live `/dashboard` route is
   shadowed by the static `dashboard.html` rewrite in Caddyfile
   lines 9-39. The Next.js edit is non-user-visible.
   **Decision (per plan-context):** revert the Next.js edit — the
   static HTML is the canonical surface. This is tracked as a
   carry-item for Plan 132-02 (which already touches the platform repo).

## Hardening follow-ups (deferred)

- **v35+:** Move `/opt/landing/livinity.io/` under git management (a
  lightweight `landing/` repo or sub-folder of `utopusc/livinity-io`).
  Wire a sync script + pre-commit hook so on-server hand-edits are
  caught before deploy.
- **v35+:** Document in PROJECT.md that the landing tree is operator-
  maintained until that migration ships.

## Sacred SHA

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` on
`liv/packages/core/src/sdk-agent-runner.ts` — preserved (no source-tree
edits in this plan; only documentation).
