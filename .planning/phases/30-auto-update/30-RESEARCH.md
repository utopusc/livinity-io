# Phase 30: Auto-Update Notification (GitHub-Aware) - Research

**Researched:** 2026-04-26
**Domain:** OTA update mechanism replacement — Backend tRPC rewrite + child-process orchestration + frontend bottom-right toast/card with localStorage dismissal
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
*All implementation choices are at Claude's discretion — discuss phase was skipped per `workflow.skip_discuss: true` in `.planning/config.json`. Use ROADMAP phase goal, success criteria, codebase conventions, and the locked REQUIREMENTS.md (UPD-01..UPD-04) to drive every decision.*

The REQUIREMENTS.md scope is locked:
- **In scope:** rewrite `getLatestRelease` (GitHub commits API); rewrite `performUpdate` (spawn `bash /opt/livos/update.sh`); patch `update.sh` to write `/opt/livos/.deployed-sha`; new `<UpdateNotification />` desktop component; 1h polling on `useSoftwareUpdate`.
- **Out of scope:** auto-applying updates (must stay user-confirmed); update channels (`releaseChannel` ignored in v1, setting preserved); mobile rendering of the notification; backend reboot logic.

### Claude's Discretion
- All other implementation choices.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UPD-01 | Backend `system.checkUpdate` queries `https://api.github.com/repos/utopusc/livinity-io/commits/master`, compares response `sha` against `/opt/livos/.deployed-sha`. Returns `{available, sha, shortSha, message, author, committedAt}`. | GitHub commits API shape verified; existing `getLatestRelease()` in `update.ts:29-72` is the rewrite target. `fetch()` already imported (line 67). `livinityd.version` already used for User-Agent (line 68). |
| UPD-02 | Backend `system.update` mutation spawns `bash /opt/livos/update.sh`, captures stdout/stderr, exposes progress via existing `system.updateStatus` query. **Does NOT reboot.** | `performUpdate()` in `update.ts:74-141` is the rewrite target. `execa.$` already used and tested. Existing `updateStatus` (lines 9-27) and `setUpdateStatus()` API stay. `routes.ts:82-96` `update` mutation must be patched to remove `reboot()` call. |
| UPD-03 | `/opt/livos/update.sh` writes deployed git SHA to `/opt/livos/.deployed-sha` after successful build, before "LivOS updated successfully!" banner. | Mini PC live script already does `git clone` to `$TEMP_DIR` (worktree copy at `.claude/worktrees/.../update.sh:53`). Inject SHA-write between current step 8 (Restart services, line 237) and step 9 (Cleanup `rm -rf "$TEMP_DIR"`, line 242). **Patch path: SSH only** — `update.sh` is NOT in repo. |
| UPD-04 | `<UpdateNotification />` desktop card (`bottom-4 right-4 z-[80]`); `useSoftwareUpdate` polls every 1h; mounted in `router.tsx`; "Update" → `/settings/software-update/confirm`; "Later" → localStorage dismissal keyed on SHA. | `install-prompt-banner.tsx` is the canonical precedent (framer-motion + localStorage dismissal + conditional render + AnimatePresence). `useSoftwareUpdate.ts` already exposes `state === 'update-available'`. Confirm route already wired at `routes/settings/index.tsx:137`. |
</phase_requirements>

## Summary

Phase 30 swaps a Umbrel-vintage OTA flow (`api.livinity.io/latest-release` → download `updateScript` → reboot) for a GitHub-aware flow (poll commits API → spawn local `update.sh` → no reboot). The blast radius is small and localized:

- **One backend file rewrite:** `livos/packages/livinityd/source/modules/system/update.ts` (142 lines today).
- **Two backend routes adjusted:** `system.checkUpdate` return shape (`routes.ts:48-53`) and `system.update` mutation must drop the `reboot()` call (`routes.ts:82-96`).
- **One new frontend component:** `livos/packages/ui/src/components/update-notification.tsx`.
- **One frontend hook tweak:** `livos/packages/ui/src/hooks/use-software-update.ts` (add `refetchInterval: MS_PER_HOUR`).
- **One router mount:** `livos/packages/ui/src/router.tsx` (insert `<UpdateNotification />` next to `<InstallPromptBanner />`).
- **One SSH-only patch:** `/opt/livos/update.sh` on Mini PC — write `.deployed-sha` before final banner. Not in repo.

The codebase already has every primitive needed: `execa.$` for subprocess + stdout/stderr stream; `framer-motion` + `AnimatePresence` for the slide-up card; `useLocalStorage` from `react-use` (via `useLocalStorage2`) for SHA dismissal; existing `useSoftwareUpdate` hook returning `state === 'update-available'`; existing `/settings/software-update/confirm` confirm dialog + `useGlobalSystemState().update()` mutation that reaches `system.update`. The only net-new abstraction is the GitHub commits API call and SHA comparison.

**Primary recommendation:** Mirror `install-prompt-banner.tsx` for the notification card (same framer-motion springs, same dismissal pattern, just SHA-keyed instead of binary), keep `execa.$` for subprocess (consistent with `factory-reset.ts` and rest of `system/`), and drop the legacy `releaseChannel`/`device`/`platform`/`api.livinity.io` plumbing entirely from `getLatestRelease()` rather than maintaining backward compat.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| GitHub commits API call | livinityd (Node backend) | — | CORS, rate-limit accounting, and SHA-file read all live server-side. UI must NEVER call GitHub directly. |
| `.deployed-sha` read | livinityd (Node backend) | — | File system read inside `/opt/livos/`; livinityd is the only process with consistent fs access. |
| `.deployed-sha` write | `update.sh` (bash, runs as root) | — | Only `update.sh` knows the post-build SHA; livinityd writing it would be racy (build vs write order). |
| Subprocess spawn (`bash update.sh`) | livinityd (Node backend) | — | `execa.$` already in use throughout `modules/system/`; subprocess IPC stays in-process. |
| Progress streaming | livinityd → in-memory `updateStatus` → `system.updateStatus` query (polled every 500ms by `UpdatingCover` already) | — | Existing pattern. No SSE, no WS — UI polls. |
| Notification card render | Browser (UI, react-router child of `EnsureLoggedIn`) | — | Pure client-side conditional render driven by `useSoftwareUpdate()` query data. |
| Dismissal persistence | Browser (`localStorage`) | — | Per-device, per-browser. No server state needed (deliberate: server doesn't track who has dismissed which SHA). |
| 1h polling cadence | Browser (React Query `refetchInterval`) | — | React Query already orchestrates all polling in this codebase (no setInterval bespoke loops in feature hooks). |

## Standard Stack

### Core (already in deps — DO NOT add new packages)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `execa` | 9.x (livinityd) | Subprocess spawn with stdout/stderr stream | Used by all `modules/system/*.ts` files (factory-reset, system, routes, update). Has `process.stdout?.on('data', ...)` pattern proven in update.ts:117-118. |
| `framer-motion` | 10.16.4 (UI) | Card slide-up/fade-in animation | Already in deps; `install-prompt-banner.tsx:50-58` is the verbatim pattern (`AnimatePresence` + `motion.div` with `initial`/`animate`/`exit`/`transition` spring). |
| `react-use` (`useLocalStorage`) | (transitively via `useLocalStorage2.ts`) | localStorage hook with SSR safety | Project wraps `useLocalStorage` in `useLocalStorage2` with `LIVINITY_` prefix (`hooks/use-local-storage2.ts:11`). **However** `install-prompt-banner.tsx` uses raw `localStorage.getItem`/`setItem` directly — both patterns are valid in-tree. Pick raw for parity with install-prompt-banner; use `useLocalStorage2` if cross-tab sync matters. |
| `@tanstack/react-query` | 5.74.4 (via tRPC) | `refetchInterval` polling | Codebase precedent dense: `use-monitoring.ts:25`, `use-environments.ts:20`, `use-ai-alerts.ts:12`, `use-pm2.ts:10`. Use `MS_PER_HOUR` from `utils/date-time.ts:9`. |
| `react-icons/tb` (Tabler) OR `@tabler/icons-react` | 4.11.0 / 3.36.1 | `TbDownload` icon | **Both are present** — `install-prompt-banner.tsx` imports from `react-icons/tb` (`TbShare`, `TbX` — line 3). REQUIREMENTS says `@tabler/icons-react`. Match install-prompt-banner for cleanest precedent: `import {TbDownload, TbX} from 'react-icons/tb'`. [VERIFIED: package.json:69-92] |
| `date-fns` | ^3.0.6 (UI) | Optional: `formatDistanceToNow(parseISO(committedAt))` for "2 hours ago" | Already in deps. UI already imports from `date-fns/locale` in `utils/date-time.ts`. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | 2.1.9 (UI) / via livinityd | Unit testing | UI: `pnpm --filter ui test path/to/file` (no `test` script in UI package.json — vitest auto-detects). livinityd: `npm run test:unit` from `packages/livinityd`. |
| `vi.mock('execa')` | (vitest builtin) | Mock subprocess in tests | `system.unit.test.ts:9` shows the precedent: `vi.mocked(execa.$).mockResolvedValue(...)`. |
| `node:fs/promises` | (Node built-in) | Read `.deployed-sha` | Prefer over `fs-extra` for one-line reads — keeps update.ts dep surface small. `routes.ts:7` already imports `fs-extra` if you want consistency. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `execa.$` (current) | `node:child_process.spawn` | REQUIREMENTS UPD-02 says `child_process.spawn`. **Use `execa.$` instead** — entire `system/` module standardizes on it; mocks already wired in `system.unit.test.ts`; subprocess + stdout streaming behavior is identical. Document this minor deviation in the plan. |
| `useLocalStorage2` (LIVINITY_ prefix, SSR-safe) | Raw `localStorage.getItem`/`setItem` | Raw matches `install-prompt-banner.tsx` exactly — fewer indirections. `useLocalStorage2` is overkill for a single-key SHA cache that only needs SSR-safety inside `EnsureLoggedIn` (which is already client-only). Pick raw. |
| Polling every hour | Server-Sent Events / WS push | Server-pushed updates would require livinityd to poll GitHub itself + push events — strictly worse for 60-req/hr quota and adds machinery. Hourly client poll = 1 req/hr/user, well under unauth quota. |
| `commit.committer.date` | `commit.author.date` | REQUIREMENTS line 41 specifies `commit.author.date`. They differ for rebases/cherry-picks; for a master branch where all commits are pushed via PR merge, they're typically identical. Stick with REQUIREMENTS choice. |

**Installation:** No new deps required — verified all imports resolve from existing package.json entries. [VERIFIED: livos/packages/livinityd/package.json + livos/packages/ui/package.json]

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────── BROWSER ────────────────────────────────┐
│                                                                        │
│   router.tsx                                                           │
│      │                                                                 │
│      ▼                                                                 │
│   <EnsureLoggedIn>                                                     │
│      └── ... (existing)                                                │
│      └── <UpdateNotification />  ◄─── NEW (sibling of                  │
│             │                          <InstallPromptBanner />)        │
│             ▼                                                          │
│         useSoftwareUpdate()  ◄─── PATCHED (refetchInterval: 1h)        │
│             │                                                          │
│             ▼                                                          │
│         trpcReact.system.checkUpdate.useQuery({refetchInterval: 1h})   │
│             │                                                          │
│             │  state === 'update-available' && sha !== dismissedSha    │
│             ▼                                                          │
│         render <motion.div className='fixed bottom-4 right-4 z-[80]'/> │
│             │                                                          │
│             ├── click "Update" → useNavigate('/settings/...../confirm')│
│             └── click "Later"  → localStorage.setItem(KEY, sha)        │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ HTTP (httpOnlyPaths) or WS
                                       ▼
┌────────────────────────────── livinityd ──────────────────────────────┐
│                                                                        │
│   modules/system/routes.ts                                             │
│      ├── system.checkUpdate (query)  ◄─── PATCHED return shape         │
│      │      └── getLatestRelease() ◄─── REWRITTEN                      │
│      │             ├── fetch('api.github.com/.../commits/master')      │
│      │             ├── readFile('/opt/livos/.deployed-sha')            │
│      │             └── return {available, sha, shortSha, message,...}  │
│      │                                                                 │
│      ├── system.updateStatus (query, untouched)                        │
│      │                                                                 │
│      └── system.update (mutation)  ◄─── PATCHED (drop reboot)          │
│             └── performUpdate() ◄─── REWRITTEN                         │
│                    ├── execa.$('bash /opt/livos/update.sh')            │
│                    ├── stream stdout → setUpdateStatus({progress})     │
│                    └── on exit code 0 → progress: 100, no reboot       │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ subprocess (bash)
                                       ▼
┌─────────────────────────── /opt/livos/update.sh ──────────────────────┐
│   Step 1: clone https://github.com/utopusc/livinity-io.git             │
│            → /tmp/livinity-update-$$/livos/                            │
│   Steps 2-8: rsync, install, build, restart services                   │
│   ◄─── INJECT here, before Step 9 cleanup, after Step 8 restart ───►   │
│   git -C "$TEMP_DIR/livos" rev-parse HEAD > /opt/livos/.deployed-sha   │
│   Step 9: rm -rf "$TEMP_DIR"                                           │
│   Final: echo "LivOS updated successfully!" banner                     │
└────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| File | Responsibility | Action |
|------|----------------|--------|
| `livos/packages/livinityd/source/modules/system/update.ts` | `getLatestRelease`, `performUpdate`, `getUpdateStatus`, `setUpdateStatus` | **REWRITE** `getLatestRelease` + `performUpdate`; keep status helpers untouched. |
| `livos/packages/livinityd/source/modules/system/routes.ts` | tRPC routes `checkUpdate`, `update`, `updateStatus` | **PATCH** `checkUpdate` return-shape destructuring (line 49-52); **PATCH** `update` mutation to drop `await reboot()` (line 90). Keep `await ctx.livinityd.stop()` removal too — services restart themselves via update.sh. |
| `livos/packages/livinityd/source/modules/system/system.unit.test.ts` | Existing system unit tests | **EXTEND** with mocks for `fetch` (GitHub) and `fs.readFile` (`.deployed-sha`); test SHA comparison and return shape. Use `vi.mock('execa')` for subprocess (already mocked). |
| `livos/packages/livinityd/source/modules/system/factory-reset.ts:10,164` | Calls `performUpdate(livinityd)` — assumed it returns a boolean | **REGRESSION-CHECK**: contract is `Promise<boolean>`; new implementation MUST preserve. `relayUpdateProgress()` reads `getUpdateStatus().progress` — keep that interface. |
| `livos/packages/ui/src/hooks/use-software-update.ts` | `useSoftwareUpdate` hook returning `{state, currentVersion, latestVersion, checkLatest}` | **PATCH** to add `refetchInterval: MS_PER_HOUR` to `system.checkUpdate.useQuery`. **DO NOT** change `state` enum — `'update-available'` already exists. Consider adding `dismissed` state? — see Pitfall #2. |
| `livos/packages/ui/src/components/update-notification.tsx` | NEW: bottom-right card | **CREATE**. Pattern from `install-prompt-banner.tsx`. |
| `livos/packages/ui/src/router.tsx:83` | Mounts top-level desktop chrome (`<InstallPromptBanner />` is at line 83) | **PATCH** — add `<UpdateNotification />` adjacent to `<InstallPromptBanner />`. Inside `EnsureLoggedIn` so auth-gated automatically. |
| `livos/packages/ui/src/providers/global-system-state/update.tsx` | `useUpdate` hook + `UpdatingCover` component | **NO CHANGE.** `update()` already calls `system.update.useMutation()` — that's exactly what the confirm dialog calls today. |
| `livos/packages/ui/src/routes/settings/software-update-confirm.tsx` | Existing confirm dialog at `/settings/software-update/confirm` | **NO CHANGE.** `latestVersionQ.data?.name` and `?.releaseNotes` will become undefined under the new shape — see Pitfall #1. **MUST be addressed in plan 30-02.** |
| `livos/packages/ui/src/routes/settings/_components/software-update-list-row.tsx:23` | Settings list row showing current version vs latest | **NO CHANGE if `latestVersion?.name` removal is acceptable** — uses `latestVersion?.name`. With new shape, the row currently displays the channel name; will need `latestVersion?.shortSha` or similar fallback. Plan 30-02 must verify visually. |
| `livos/packages/ui/src/routes/settings/mobile/software-update.tsx` | Mobile equivalent of the list row | Same caveat as above. |
| `livos/packages/ui/src/hooks/use-settings-notification-count.ts:84-91` | Counts available updates for the settings badge | Reads `checkUpdateResult.value.name` (line 89). Will become `undefined` under new shape; the toast text will lose the version name. Plan 30-02 must accept and document this. |
| `/opt/livos/update.sh` (Mini PC, NOT in repo) | Standalone update script | **PATCH via SSH:** insert SHA-write between line 237 (services restarted) and line 242 (`rm -rf "$TEMP_DIR"`). Cannot commit since file is not in repo. |

### Pattern 1: framer-motion Bottom-Right Card with Dismissal
**What:** Conditional render via `<AnimatePresence>` so exit animation runs on dismiss; localStorage-keyed dismissal persistence; spring physics.
**When to use:** Anytime you want a non-blocking, dismissible toast-like card.
**Source pattern:** `livos/packages/ui/src/components/install-prompt-banner.tsx:50-100`

```tsx
// VERIFIED: livos/packages/ui/src/components/install-prompt-banner.tsx (line 8, 50-100)
const DISMISSED_KEY = 'liv:install-prompt-dismissed'

const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1')
const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
}

return (
    <AnimatePresence>
        {visible && (
            <motion.div
                initial={{y: 100, opacity: 0}}
                animate={{y: 0, opacity: 1}}
                exit={{y: 100, opacity: 0}}
                transition={{type: 'spring', stiffness: 300, damping: 30}}
                className='fixed bottom-[72px] left-4 right-4 z-[70] ...'
            >
                {/* card content */}
            </motion.div>
        )}
    </AnimatePresence>
)
```

For UPD-04, swap:
- `DISMISSED_KEY = 'livos:update-notification:dismissed-sha'` (per REQUIREMENTS)
- Value stored is the SHA string, not `'1'`
- Visibility: `state === 'update-available' && latestVersion?.sha && latestVersion.sha !== dismissedSha && !isMobile`
- Position: `fixed bottom-4 right-4 z-[80]` (per REQUIREMENTS — `z-[80]` chosen above install-prompt's `z-[70]` and below sonner toasts at `z-[100]`)

### Pattern 2: execa subprocess with stdout/stderr stream
**What:** Spawn a long-running shell command, attach `data` listeners, await final exit.
**Source pattern:** Existing `update.ts:90-121` already does this — keep the exact event-binding pattern, just swap the command:

```ts
// VERIFIED: livos/packages/livinityd/source/modules/system/update.ts:90-121
const process = $`bash -c ${updateScriptContents}`
process.stdout?.on('data', (chunk) => handleUpdateScriptOutput(chunk))
process.stderr?.on('data', (chunk) => handleUpdateScriptOutput(chunk))
await process
```

For UPD-02, swap to:
```ts
const process = $({cwd: '/opt/livos'})`bash /opt/livos/update.sh`
process.stdout?.on('data', (chunk) => handleSectionMarker(chunk))
process.stderr?.on('data', (chunk) => handleSectionMarker(chunk))
await process
```

The output parser `handleSectionMarker` looks for `━━━ <step name> ━━━` lines (update.sh `step()` function at line 27 emits these in cyan ANSI) and `[OK]` lines (`ok()` at line 24). Map step names to progress percentages per REQUIREMENTS UPD-02 ladder (10/30/50/65/85/95/100).

**WARNING:** update.sh emits ANSI color codes; either strip them with `strip-ansi` (already imported in `routes.ts:8`) or match on the underlying text only.

### Pattern 3: tRPC return-shape change without breaking the union
**What:** Changing a query's return shape silently breaks every caller that destructures fields. Must mass-search for usages.
**Source files affected by `system.checkUpdate` shape change:**

```
livos/packages/ui/src/hooks/use-software-update.ts:11           latestVersionQ.data?.available    (kept)
livos/packages/ui/src/routes/settings/software-update-confirm.tsx:23  latestVersionQ.data?.name   (REMOVED — needs fallback)
livos/packages/ui/src/routes/settings/software-update-confirm.tsx:26  latestVersionQ.data?.releaseNotes (REMOVED — needs fallback or hide block)
livos/packages/ui/src/routes/settings/_components/software-update-list-row.tsx:23  currentVersion?.name  (currentVersion is system.version, NOT checkUpdate — UNAFFECTED)
livos/packages/ui/src/routes/settings/_components/software-update-list-row.tsx:27  latestVersion?.name (REMOVED — needs fallback to shortSha or message slice)
livos/packages/ui/src/routes/settings/mobile/software-update.tsx          latestVersion?.name (REMOVED — same fallback)
livos/packages/ui/src/hooks/use-settings-notification-count.ts:85          checkUpdateResult.value.name → checkUpdateResult.value.shortSha or message
```

The plan must explicitly enumerate each of these. Plan 30-02 must include a grep verification step:
```bash
grep -rn "checkUpdate\|latestVersion" livos/packages/ui/src/ --include="*.ts" --include="*.tsx"
```

### Anti-Patterns to Avoid
- **Calling GitHub API from the browser.** Bypasses 60-req/hr accounting (each user's IP gets its own quota, but CORS preflight + token leakage become risks). Always proxy through livinityd.
- **Polling `system.update` mutation status from a custom hook.** The codebase already has `system.updateStatus` query polled at 500ms by `UpdatingCover` (`update.tsx:20`). Don't add a parallel polling loop in `useSoftwareUpdate`.
- **Storing dismissed SHA in livinityd / Redis.** Per-user, per-device persistence is the goal. Server-side dismissal would re-show on every other browser/device the same user uses. Stick with `localStorage`.
- **Reusing `setInterval` in the component.** React Query's `refetchInterval` already handles polling. Adding `setInterval(refetch, 3600000)` inside `<UpdateNotification />` would double-poll.
- **Calling `await ctx.livinityd.stop()` and `reboot()` after `performUpdate`.** The current `routes.ts:88-91` does this; the new flow MUST drop both. update.sh restarts services itself, and stopping livinityd mid-mutation will sever the response stream and surface as an error to the UI.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polling at intervals | `setInterval` in `useEffect` | React Query `refetchInterval: MS_PER_HOUR` | Codebase pattern (every hook in `hooks/use-*.ts` uses it). React Query handles tab-visibility pause, retry backoff, dedup. |
| Subprocess spawning | `import {spawn} from 'node:child_process'` | `import {$} from 'execa'` | Whole `modules/system/*.ts` standardizes on execa; tests already mock it. |
| ANSI strip | Custom regex | `import stripAnsi from 'strip-ansi'` | Already imported in `routes.ts:8`. |
| localStorage SSR safety | Custom mount-effect | Mirror `install-prompt-banner.tsx`'s lazy `useState(() => localStorage.getItem(...) === '1')` | Same component runs in PWA standalone — pattern is proven. |
| GitHub API headers | Custom auth/rate logic | Plain `fetch()` with `User-Agent: LivOS-{version}` and `Accept: application/vnd.github+json` | Public unauth = 60 req/hr/IP. With 1h polling per session, you have ~60 sessions before exhaust — ample. No auth complexity. |
| Relative time formatting | Custom math | `formatDistanceToNow(parseISO(committedAt), {addSuffix: true})` from `date-fns` | Already in deps. `routes/docker/format.ts:7-8` notes date-fns shapes are unsuitable for *uptime*-style displays, but for "2 hours ago" `formatDistanceToNow` is the right primitive. |

**Key insight:** Every primitive Phase 30 needs is already in the tree. The only "new" code is glue — composing existing patterns. Resist the urge to add new deps or new abstractions.

## Common Pitfalls

### Pitfall 1: New `checkUpdate` shape breaks the existing confirm dialog
**What goes wrong:** `software-update-confirm.tsx:23` displays `latestVersionQ.data?.name` and `:26` renders `<Markdown>{latestVersionQ.data?.releaseNotes}</Markdown>`. New shape has neither.
**Why it happens:** Locked REQUIREMENTS shape has no `name` or `releaseNotes`. Old shape was `{version, name, releaseNotes, updateScript?}`.
**How to avoid:** Plan 30-02 must explicitly patch the confirm dialog. Recommended replacement:
- Title: `"Update to ${latestVersionQ.data?.shortSha}"` (or fallback `"Software Update"`)
- Body: render `latestVersionQ.data?.message` (commit message, full not sliced) inside the existing `<Markdown>` block — commit messages with newlines render reasonably as markdown.
- Author/date row: `By ${author}, ${formatDistanceToNow(parseISO(committedAt))}`
**Warning signs:** TypeScript errors after the rewrite — `Property 'name' does not exist on type ...`. Don't suppress; treat them as the canonical change-list.

### Pitfall 2: "Later" dismissal persists across SHAs unless carefully gated
**What goes wrong:** User clicks "Later" on SHA `abc123`. Tomorrow `def456` lands. If logic is `dismissed === true` (boolean), notification stays hidden forever.
**Why it happens:** REQUIREMENTS UPD-04 stores `latestVersion.sha` (not `'1'`) — SHA-keyed dismissal is the correct design.
**How to avoid:** Visibility predicate is `latestVersion.sha !== dismissedSha`. Re-read localStorage on each render OR re-read on `latestVersionQ.data` change. **Don't** cache `dismissedSha` in `useState` initialized once at mount — that's fine for dismissal but you also need to re-render when `latestVersion.sha` changes after a poll. React Query's data update will trigger re-render; your `dismissedSha` state is stale only if you skip reading localStorage on dismiss action — and that's the action handler, not render.
**Warning signs:** Tester scenario from REQUIREMENTS line 138: "delete localStorage → push new SHA → notification appears → click 'Later' → push same SHA again → no notification → push NEWER SHA → notification reappears." If any leg fails, the predicate is wrong.

### Pitfall 3: livinityd subprocess permission denied
**What goes wrong:** `bash /opt/livos/update.sh` requires root. livinityd runs as root on Server4 (memory says systemd `livos.service`), but on Mini PC it may run under `bruce`. Subprocess fails with EACCES.
**Why it happens:** update.sh has `if [[ $EUID -ne 0 ]]; then fail "Must run as root"; fi` at line 32.
**How to avoid:**
- Plan 30-01 must include verification step: `ssh root@minipc "systemctl cat livos.service | grep -E 'User='"`. If `User=root`, no sudoers config needed.
- Else, add explicit error-path documentation: when `execa.$` rejects with non-zero exit, parse stderr for `Must run as root` or `permission denied`, and `setUpdateStatus({error: 'livinityd needs sudo NOPASSWD for /opt/livos/update.sh — see deployment docs'})`.
- DO NOT silently `sudo -n bash /opt/livos/update.sh` — better to fail loudly with a fixable error message.
**Warning signs:** First execution returns instantly with non-zero exit and no progress.

### Pitfall 4: Update mutation hangs because route is on WebSocket and WS disconnects mid-update
**What goes wrong:** `system.update` runs ~60-90s. If the WS disconnects (network blip, tab focus change in some setups), the mutation never resolves on the client even though the server completed. Memory note explicitly flags this: "tRPC mutations hang if routed to disconnected WebSocket."
**Why it happens:** `httpOnlyPaths` in `common.ts:8-166` does NOT currently list `system.update`, `system.updateStatus`, or `system.checkUpdate`. They route over WS.
**How to avoid:** Add to `httpOnlyPaths` in `common.ts`:
- `'system.checkUpdate'` — query is fine over WS, but for symmetry and rate-limit error surfacing, HTTP is safer (errors propagate immediately, no silent retry).
- `'system.update'` — **REQUIRED.** Long-running mutation; must be HTTP per established codebase pattern (see `common.ts:71-72` precedent for `docker.scanImage`: "mutation can take 30-90s; HTTP avoids WS-hang on disconnect").
- `'system.updateStatus'` — debatable. It's a query polled every 500ms during an active update. WS is fine for high-frequency polling normally, but during the update the WS may briefly disconnect when livinityd restarts (it doesn't here, but conservatively HTTP it).

**Recommended:** Add **`'system.update'` and `'system.updateStatus'`** at minimum. Leave `system.checkUpdate` on WS unless rate-limit error visibility is poor. Plan 30-01 acceptance criteria should grep:
```bash
grep -E "'system\.(update|updateStatus|checkUpdate)'" livos/packages/livinityd/source/modules/server/trpc/common.ts
```

### Pitfall 5: `await ctx.livinityd.stop()` in the existing `update` mutation
**What goes wrong:** `routes.ts:89-90` calls `await ctx.livinityd.stop()` followed by `await reboot()`. Both must be removed for Phase 30. If only `reboot()` is removed but `livinityd.stop()` remains, livinityd shuts down mid-update and the user sees a hang.
**Why it happens:** Legacy flow assumed reboot ⇒ no need for graceful return.
**How to avoid:** Plan 30-01 acceptance criterion:
```bash
grep -E "ctx\.livinityd\.stop|reboot\(\)" livos/packages/livinityd/source/modules/system/routes.ts | grep -v factoryReset
```
Should return ONLY references inside `shutdown:` and `restart:` mutations (not in `update:`).

### Pitfall 6: `.deployed-sha` first-run case
**What goes wrong:** First time the new code runs after deploy, `.deployed-sha` does not exist yet (update.sh hasn't been patched + run). `fs.readFile` rejects with ENOENT.
**Why it happens:** Cold-start ordering — UI calls checkUpdate before any update.sh run has occurred under the new logic.
**How to avoid:** Catch ENOENT, treat as empty string, set `available: true` (REQUIREMENTS line 42 explicitly says this: "yoksa boş string → her zaman update available göster, ki kullanıcı ilk update'i alabilsin"). Use:
```ts
let localSha = ''
try {
    localSha = (await fs.readFile('/opt/livos/.deployed-sha', 'utf8')).trim()
} catch (err: any) {
    if (err.code !== 'ENOENT') throw err
}
```
**Warning signs:** UI shows notification on every login forever (because localSha is always empty). Means the SHA write step in update.sh is failing silently.

### Pitfall 7: GitHub User-Agent header is required
**What goes wrong:** GitHub API rejects requests without a `User-Agent` with HTTP 403 + JSON body `{message: "Request forbidden by administrative rules. Please make sure your request has a User-Agent header"}`. **NOT** rate-limit related.
**Why it happens:** GitHub policy. [CITED: docs.github.com/en/rest/overview/resources-in-the-rest-api#user-agent-required]
**How to avoid:** Always send `User-Agent: LivOS-${livinityd.version}` header. Existing `update.ts:68` already does this — preserve in rewrite. Also set `Accept: application/vnd.github+json` (recommended, not required, but pins API version).
**Warning signs:** All checkUpdate calls fail with 403; misread as rate-limit but isn't.

### Pitfall 8: Concurrent `system.update` invocations
**What goes wrong:** User clicks "Update" twice (network slow, button not disabled fast enough). Two `bash update.sh` subprocesses race on the same `$TEMP_DIR/$$` (different PIDs so different dirs, but the rsyncs to `/opt/livos/` will conflict catastrophically).
**Why it happens:** Mutations are not implicitly serialized server-side.
**How to avoid:** REQUIREMENTS notes: "`systemStatus === 'updating'` ise mutation early-return throw etsin." In `routes.ts:82-96`, before setting `systemStatus = 'updating'`, check:
```ts
if (systemStatus === 'updating') throw new TRPCError({code: 'CONFLICT', message: 'Update already in progress'})
```
**Warning signs:** Second click silently no-ops or two parallel update logs interleave.

### Pitfall 9: update.sh deploy timing
**What goes wrong:** UPD-03 patches update.sh on Mini PC via SSH, BUT the very next deploy via `update.sh` will rsync source from the freshly-cloned repo... where update.sh ISN'T included (memory: "update.sh repo'da YOK"). So the patched update.sh on disk won't be overwritten — good. But this also means the patch is permanent and survives subsequent deploys.
**How to avoid:** No action required, just be aware: the `.deployed-sha` write line is safe to add via SSH and stays put.
**Warning signs:** None expected.

## Code Examples

### checkUpdate rewrite — getLatestRelease()
```ts
// Source: REQUIREMENTS UPD-01 + Pitfall #6/#7 hardening
// Replaces livos/packages/livinityd/source/modules/system/update.ts:29-72

import fs from 'node:fs/promises'

const GITHUB_COMMITS_URL = 'https://api.github.com/repos/utopusc/livinity-io/commits/master'
const DEPLOYED_SHA_PATH = '/opt/livos/.deployed-sha'

export async function getLatestRelease(livinityd: Livinityd) {
    // 1. Read locally deployed SHA (empty on first run)
    let localSha = ''
    try {
        localSha = (await fs.readFile(DEPLOYED_SHA_PATH, 'utf8')).trim()
    } catch (err: any) {
        if (err.code !== 'ENOENT') throw err
    }

    // 2. Fetch latest commit on master
    const response = await fetch(GITHUB_COMMITS_URL, {
        headers: {
            'User-Agent': `LivOS-${livinityd.version}`,
            'Accept': 'application/vnd.github+json',
        },
    })
    if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}: ${await response.text()}`)
    }
    const data = await response.json() as {
        sha: string
        commit: {
            message: string
            author: {name: string; email: string; date: string}
        }
    }

    return {
        available: data.sha !== localSha,
        sha: data.sha,
        shortSha: data.sha.slice(0, 7),
        message: data.commit.message,
        author: data.commit.author.name,
        committedAt: data.commit.author.date,
    }
}
```

### performUpdate rewrite — execa + section-marker parsing
```ts
// Source: REQUIREMENTS UPD-02 + Pattern 2 + update.ts:90-121
// Replaces livos/packages/livinityd/source/modules/system/update.ts:74-141

import {$} from 'execa'
import stripAnsi from 'strip-ansi'

const SECTION_PROGRESS: Record<string, number> = {
    'Pulling latest code': 10,
    'Updating LivOS source files': 20,
    'Updating Nexus source files': 30,
    'Installing dependencies': 50,
    'Building packages': 65,
    'Updating gallery cache': 85,
    'Fixing permissions': 90,
    'Restarting services': 95,
    'Cleanup': 98,
}

export async function performUpdate(livinityd: Livinityd) {
    setUpdateStatus({running: true, progress: 5, description: 'Starting update...', error: false})

    try {
        const proc = $({cwd: '/opt/livos'})`bash /opt/livos/update.sh`

        const handleOutput = (chunk: Buffer) => {
            const text = stripAnsi(chunk.toString())
            for (const line of text.split('\n')) {
                // section marker: "━━━ Pulling latest code ━━━"
                const sectionMatch = line.match(/━━━\s+(.+?)\s+━━━/)
                if (sectionMatch && SECTION_PROGRESS[sectionMatch[1]]) {
                    setUpdateStatus({
                        progress: SECTION_PROGRESS[sectionMatch[1]],
                        description: sectionMatch[1],
                    })
                }
                // [OK] line — increment a small amount within the current section if desired
            }
        }

        proc.stdout?.on('data', handleOutput)
        proc.stderr?.on('data', handleOutput)
        await proc
    } catch (error) {
        const errMessage = (error as Error).message ?? 'Update failed'
        if (!updateStatus.error) setUpdateStatus({error: errMessage})
        const errorStatus = updateStatus.error
        resetUpdateStatus()
        setUpdateStatus({error: errorStatus})
        livinityd.logger.error('update.sh failed', error)
        return false
    }

    setUpdateStatus({running: false, progress: 100, description: 'Updated', error: false})
    return true
}
```

### update.sh patch (SSH inject between line 237 and line 242)
```bash
# Source: REQUIREMENTS UPD-03 — inject after "Restarting services" verification block,
# BEFORE "rm -rf $TEMP_DIR" cleanup.

# ── Write deployed SHA ────────────────────────────────────
step "Recording deployed SHA"
if [[ -d "$TEMP_DIR/.git" ]]; then
    git -C "$TEMP_DIR" rev-parse HEAD > /opt/livos/.deployed-sha 2>/dev/null && \
        ok "Deployed SHA recorded: $(cat /opt/livos/.deployed-sha | cut -c1-7)" || \
        warn "Could not record deployed SHA (livinityd update notifications may be inaccurate)"
fi
```

Note: `$TEMP_DIR` (line 49 of current update.sh) is the clone root — `git -C "$TEMP_DIR" rev-parse HEAD` works. REQUIREMENTS line 73 had `$TEMP_DIR/livos/.git` — current update.sh clones the repo root to `$TEMP_DIR` (no `livos/` subdir at the clone root since repo IS `livinity-io`, with `livos/` and `nexus/` as siblings inside). **Verify first**: `ssh root@minipc "ls /tmp/livinity-update-* 2>/dev/null | head -5"` after a deploy to confirm structure.

### UpdateNotification component
```tsx
// Source: install-prompt-banner.tsx pattern + REQUIREMENTS UPD-04
// NEW FILE: livos/packages/ui/src/components/update-notification.tsx

import {useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {TbDownload} from 'react-icons/tb'
import {useNavigate} from 'react-router-dom'
import {formatDistanceToNow, parseISO} from 'date-fns'

import {useIsMobile} from '@/hooks/use-is-mobile'
import {useSoftwareUpdate} from '@/hooks/use-software-update'

const DISMISSED_KEY = 'livos:update-notification:dismissed-sha'

export function UpdateNotification() {
    const isMobile = useIsMobile()
    const {state, latestVersion} = useSoftwareUpdate()
    const navigate = useNavigate()
    const [dismissedSha, setDismissedSha] = useState<string | null>(
        () => localStorage.getItem(DISMISSED_KEY)
    )

    const visible =
        !isMobile &&
        state === 'update-available' &&
        !!latestVersion?.sha &&
        latestVersion.sha !== dismissedSha

    const handleLater = () => {
        if (!latestVersion?.sha) return
        localStorage.setItem(DISMISSED_KEY, latestVersion.sha)
        setDismissedSha(latestVersion.sha)
    }

    const handleUpdate = () => navigate('/settings/software-update/confirm')

    return (
        <AnimatePresence>
            {visible && latestVersion && (
                <motion.div
                    initial={{opacity: 0, y: 20}}
                    animate={{opacity: 1, y: 0}}
                    exit={{opacity: 0, y: 20}}
                    transition={{type: 'spring', stiffness: 300, damping: 30}}
                    className='fixed bottom-4 right-4 z-[80] flex w-80 flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg'
                >
                    <div className='flex items-center gap-2'>
                        <TbDownload className='h-5 w-5 text-blue-600' />
                        <span className='font-semibold text-zinc-900'>New update available</span>
                    </div>
                    <div className='flex flex-col gap-1'>
                        <p className='text-sm text-zinc-600'>
                            <span className='font-mono'>{latestVersion.shortSha}</span>
                            {' — '}
                            {latestVersion.message.split('\n')[0].slice(0, 80)}
                        </p>
                        <p className='text-xs text-zinc-400'>
                            {latestVersion.author},{' '}
                            {formatDistanceToNow(parseISO(latestVersion.committedAt), {addSuffix: true})}
                        </p>
                    </div>
                    <div className='flex items-center gap-2'>
                        <button
                            onClick={handleUpdate}
                            className='flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 active:scale-95'
                        >
                            Update
                        </button>
                        <button
                            onClick={handleLater}
                            className='rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 active:scale-95'
                        >
                            Later
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
```

### Hook polling patch
```ts
// PATCH: livos/packages/ui/src/hooks/use-software-update.ts:11-15

import {MS_PER_HOUR} from '@/utils/date-time'

const latestVersionQ = trpcReact.system.checkUpdate.useQuery(undefined, {
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    refetchInterval: MS_PER_HOUR, // 1 hour polling — Phase 30 UPD-04
})
```

### Router mount
```tsx
// PATCH: livos/packages/ui/src/router.tsx:5 (import) + :83 (render)

import {InstallPromptBanner} from '@/components/install-prompt-banner'
import {UpdateNotification} from '@/components/update-notification' // ADD

// inside <EnsureLoggedIn> tree, sibling of InstallPromptBanner (line 83):
<InstallPromptBanner />
<UpdateNotification />
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `api.livinity.io/latest-release` JSON endpoint with `version`/`name`/`releaseNotes`/`updateScript` | Public `api.github.com/repos/.../commits/master` | Phase 30 (this phase) | Removes external infra dependency; no Umbrel mothership needed. |
| Download remote `updateScript` and `bash -c` it | Local `bash /opt/livos/update.sh` | Phase 30 | Removes RCE surface (no remote-code-fetch); update.sh is auditable on disk. |
| Reboot after update | systemd `restart` of livos/liv-core/liv-worker/liv-memory inside update.sh | Phase 30 (Server4 already does this — UI catching up) | User session preserved; mid-update UI hang risk eliminated. |
| Single boolean dismissal (install-prompt-banner pattern) | SHA-keyed dismissal | Phase 30 (NEW pattern in repo) | "Later" doesn't suppress future updates. First instance of this pattern; could be extracted into a `useDismissibleByKey(localStorageKey, currentKey)` hook later. |

**Deprecated/outdated:**
- `releaseChannel` setting (`stable`/`beta`) — REQUIREMENTS says "settings store değişmez, ama bu turda kullanılmıyor." Leave the `getReleaseChannel`/`setReleaseChannel` routes (`routes.ts:54-65`) untouched; consume zero in `getLatestRelease()`.
- `livinityd.version` comparison via `version.replace('v', '')` (`routes.ts:51`) — gone. Comparison is now SHA-based.
- `device`/`platform` URL params — gone (no longer relevant; we're not asking a server "what's the latest for this device").

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | livinityd runs as root on Mini PC and Server4 (sudoers config not needed for `bash /opt/livos/update.sh`) | Pitfall #3 | If livinityd runs as non-root, mutation fails on first invocation; user sees "permission denied" error. **Mitigation**: plan 30-01 must verify with `ssh root@minipc "ps -ef | grep livinityd"` and document. [ASSUMED — based on memory note "Server4 ... uses systemd" + service file likely `User=root`] |
| A2 | `$TEMP_DIR` in update.sh is the clone root, NOT `$TEMP_DIR/livos` | Code Examples (update.sh patch) | If REQUIREMENTS' original `$TEMP_DIR/livos/.git` path is correct, my patch writes nothing (silent `\|\| true`). **Mitigation**: plan 30-01 first task = `ssh root@minipc "ls -la /tmp/livinity-update-*"` after a no-op deploy to confirm. [VERIFIED via worktree update.sh:53 — `git clone "$REPO_URL" "$TEMP_DIR"` clones to `$TEMP_DIR` directly] |
| A3 | `httpOnlyPaths` should include `system.update` (mutation, long-running) and `system.updateStatus` (polled during update) | Pitfall #4 | If we don't add them, `system.update` may hang on transient WS disconnect mid-update. **Mitigation**: cite `docker.scanImage` precedent (`common.ts:71-72`) when patching common.ts. [VERIFIED: codebase pattern exists] |
| A4 | UI vitest auto-discovers `*.unit.test.ts` files via `pnpm --filter ui test path/to/file` even though `package.json` has no `test` script | Standard Stack > Supporting | If `pnpm --filter ui test` errors, tests can't run in CI/local. **Mitigation**: plan 30-02 falls back to `pnpm --filter ui exec vitest run path/to/file` (vitest CLI directly). [VERIFIED: existing tests like `format.unit.test.ts` exist + pattern documented in 24-01-PLAN.md] |
| A5 | Confirm dialog (`software-update-confirm.tsx`) refactor to use `message`/`shortSha`/`author`/`committedAt` is acceptable UX | Pitfall #1 | If user explicitly wants release-notes Markdown rendering preserved, and commit messages don't suffice as "release notes," UX regresses. **Mitigation**: render full `message` inside the existing `<Markdown>` block — multi-line commit messages with `# heading` syntax render fine. [ASSUMED — REQUIREMENTS doesn't address the confirm dialog directly] |
| A6 | `commit.author.date` (per REQUIREMENTS UPD-01 line 41) is the right semantic for "committedAt" rather than `commit.committer.date` | Standard Stack > Alternatives | For master branch with PR-merge workflow, both dates are typically identical. For force-pushes / rebases they differ. **Mitigation**: stick with REQUIREMENTS choice; document if user later objects. [CITED: REQUIREMENTS.md:41] |

## Project Constraints (from MEMORY.md)

These directives carry locked-decision authority for this phase:

| Directive | Source | Phase 30 Compliance |
|-----------|--------|---------------------|
| livinityd runs TypeScript directly via tsx — no compilation | MEMORY.md "Key Technical Notes" | `update.ts` rewrite is hot-reloaded on `systemctl restart livos`. No build step. |
| nexus-core runs compiled JS — must `npm run build --workspace=packages/core` after source changes | MEMORY.md "Key Technical Notes" | N/A — Phase 30 doesn't touch nexus. |
| New tRPC routes that are mutations must be added to `httpOnlyPaths` in `common.ts` to avoid WS-disconnect hangs | MEMORY.md "Key Technical Notes" | **APPLIES**: `system.update` MUST be added to `httpOnlyPaths`. See Pitfall #4. |
| Server4 production deploy = `bash /opt/livos/update.sh`, NOT `git pull + pm2 restart` | MEMORY.md "Server Setup" | Phase 30 EXTENDS this script — patch must be SSH-deployed to `/opt/livos/update.sh` directly. |
| `pnpm install --ignore-scripts` flag required on Windows | MEMORY.md indirectly via 24-01 plan | Already applied in tooling; not directly impacted by Phase 30. |
| update.sh has known pnpm-store quirk: copies nexus dist to FIRST `@nexus+core*` dir | MEMORY.md "Server Setup" | NOT triggered by Phase 30 (no nexus changes). |
| Mini PC bruce user has sudo NOPASSWD; Server4 livinityd runs as root via systemd | MEMORY.md | See Assumption A1 — drives subprocess success. |

## Runtime State Inventory

> **Phase classification:** This is a feature-add phase, not a rename/refactor. However, REQUIREMENTS UPD-03 introduces a new runtime artifact (`/opt/livos/.deployed-sha`), so the inventory is meaningful.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `/opt/livos/.deployed-sha` (new flat file, 41 bytes — full SHA + newline) on production hosts. Contents written by update.sh after each successful build. | **NEW** — created at first post-deploy update.sh run; absent until then. Code (Pitfall #6) handles ENOENT gracefully. |
| **Live service config** | None — Phase 30 doesn't touch n8n/Datadog/Cloudflare/etc. | None |
| **OS-registered state** | systemd `livos.service` already running and configured to auto-restart; update.sh `systemctl restart livos` will pick up new code on next deploy. | None — Phase 30 ships within livinityd source tree, deploys via update.sh as usual. |
| **Secrets and env vars** | None new. GitHub commits API is unauthenticated. No PAT, no GITHUB_TOKEN required. | None |
| **Build artifacts** | UI bundle changes: `update-notification.tsx` is a new chunk consumer; vite build will pick it up automatically when update.sh runs `pnpm --filter ui build`. | None — standard rebuild. |
| **Browser localStorage** | New key: `livos:update-notification:dismissed-sha`. Per-device, per-browser. | **NEW** — created on first "Later" click; absent before. No migration needed. |

**The canonical question:** *After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?*
**Answer for Phase 30:** Nothing relevant. The legacy `api.livinity.io/latest-release` URL was a runtime fetch target (no caching), and the new code doesn't reference it. The only persistent runtime state introduced is `.deployed-sha`, which has a clear lifecycle (created by update.sh, read by livinityd).

## Open Questions

1. **Does `system.checkUpdate` need to move to `httpOnlyPaths`?**
   - What we know: Memory says queries CAN stay on WS; mutations MUST move when long-running. checkUpdate is a sub-second query.
   - What's unclear: Whether the rate-limit-error toast surfaces well over WS (WS errors can be opaque vs. HTTP's clear status codes).
   - Recommendation: Leave on WS unless plan 30-02 testing shows opaque errors. Re-evaluate post-deploy.

2. **Should the confirm dialog be retired in favor of a simpler in-card confirm?**
   - What we know: REQUIREMENTS line 26 says "Existing UX preserved: clicking 'Update' routes to existing `/settings/software-update/confirm` dialog (no behavior change there)." Locked.
   - What's unclear: Whether the dialog still makes sense without `name`/`releaseNotes` — it just becomes "Update to {shortSha}? [Install] [Cancel]."
   - Recommendation: Keep it (REQUIREMENTS lock). Plan 30-02 patches the dialog content to use new fields, no structural change.

3. **Does the notification need to suppress itself during an in-progress update?**
   - What we know: When `systemStatus === 'updating'`, `<UpdatingCover />` covers the entire UI (full-screen via `BarePage`).
   - What's unclear: Whether `<UpdateNotification />` is rendered at all during the cover state.
   - Recommendation: It's behind `<EnsureLoggedIn>` which renders inside the `running` case of the `statusToShow` switch (`global-system-state/index.tsx:218-227`). When status is `'updating'`, the switch hits case `'updating'` (line 261-268) which returns `<UpdatingCover />` only — `children` (router) does NOT render. So `<UpdateNotification />` is automatically suppressed during the update cover. No extra work needed. **VERIFIED via global-system-state/index.tsx tree.**

4. **What happens if GitHub API returns a non-fast-forward state (force-push moved master backward)?**
   - What we know: `available = remoteSha !== localSha` — strictly equality check. After a force-push, this still triggers an "available" notification.
   - What's unclear: Whether running update.sh on a backward-moved SHA is safe (rsync overwrites).
   - Recommendation: rsync `--delete` flag in update.sh handles this. No special handling needed. Document as out-of-scope edge case.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js fetch (built-in) | UPD-01 GitHub call | ✓ | Node 20+ (per UI engines field, livinityd presumed similar) | — |
| `execa` | UPD-02 subprocess | ✓ | Already imported in `system/*.ts` | — |
| `git` (in `update.sh` patch) | UPD-03 `git rev-parse HEAD` | ✓ | Already used at update.sh:53 (`git clone`) | — |
| GitHub API public access | UPD-01 | ✓ | 60 req/hr unauth — well under 1 req/hr/session need | If rate-limited: error toast + retry next hour |
| livinityd permission to spawn `bash /opt/livos/update.sh` | UPD-02 | ⚠ Assumed (A1) | — | If denied: surface error message to UI instructing sysadmin sudoers fix |
| Mini PC SSH access for update.sh patch | UPD-03 | ✓ | Per MEMORY.md SSH commands documented | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** GitHub rate-limit (60/hr unauth) — unlikely but possible. UI shows toast; query retries on next 1h tick.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Backend framework | vitest 2.x via livinityd `npm run test:unit` (`packages/livinityd/package.json:21`) |
| Frontend framework | vitest 2.1.9 via `pnpm --filter ui exec vitest run <path>` |
| Backend config | `packages/livinityd/vitest.config.ts` (presumed; existing tests run successfully) |
| Frontend config | None at package.json level — vitest auto-discovers `*.unit.test.ts` files |
| Quick run command (backend) | `cd livos/packages/livinityd && npm run test -- system/update` |
| Quick run command (frontend) | `cd livos/packages/ui && pnpm exec vitest run src/components/update-notification` |
| Full suite command | `cd livos && pnpm -r test` (or per-package) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UPD-01 | `getLatestRelease` returns correct shape when GitHub responds | unit (mocked fetch) | `cd livos/packages/livinityd && npm run test -- system/update` | ❌ Wave 0 — create `update.unit.test.ts` |
| UPD-01 | `getLatestRelease` reads `.deployed-sha`, returns `available: true` when SHAs differ | unit (mocked fs + fetch) | (same) | ❌ Wave 0 |
| UPD-01 | `getLatestRelease` handles ENOENT for `.deployed-sha` (first-run case) | unit (mocked fs throws ENOENT) | (same) | ❌ Wave 0 |
| UPD-01 | `getLatestRelease` throws on non-2xx GitHub response | unit (mocked fetch returns 403) | (same) | ❌ Wave 0 |
| UPD-02 | `performUpdate` spawns `bash /opt/livos/update.sh` | unit (mocked execa) | (same) | ❌ Wave 0 |
| UPD-02 | `performUpdate` parses `━━━ Section ━━━` markers and updates progress | unit (mock execa stdout stream) | (same) | ❌ Wave 0 |
| UPD-02 | `performUpdate` returns false on non-zero exit and sets error | unit (mocked execa rejects) | (same) | ❌ Wave 0 |
| UPD-02 | `system.update` mutation throws CONFLICT if `systemStatus === 'updating'` | integration (TRPC caller) | `cd livos/packages/livinityd && npm run test:integration -- system` | ⚠ Extends `system.integration.test.ts` |
| UPD-03 | `update.sh` writes `/opt/livos/.deployed-sha` after restart, before cleanup | manual SSH (cannot unit-test bash on Windows) | `ssh root@minipc "bash /opt/livos/update.sh && cat /opt/livos/.deployed-sha"` | manual-only |
| UPD-04 | `<UpdateNotification />` renders when `state === 'update-available'` and SHA not dismissed | unit (vitest + jsdom + react-testing-library OR snapshot) | `cd livos/packages/ui && pnpm exec vitest run src/components/update-notification` | ❌ Wave 0 |
| UPD-04 | "Later" writes SHA to localStorage and hides card | unit | (same) | ❌ Wave 0 |
| UPD-04 | Card re-shows when `latestVersion.sha` changes after dismissal | unit (re-render with new SHA) | (same) | ❌ Wave 0 |
| UPD-04 | `useSoftwareUpdate` returns `latestVersion.sha` (regression test on shape) | unit | `cd livos/packages/ui && pnpm exec vitest run src/hooks/use-software-update` | ❌ Wave 0 (optional — TS will catch shape drift) |
| UPD-04 | Mobile (`useIsMobile() === true`) hides the notification | unit (mock `useIsMobile`) | (same as UPD-04 first row) | ❌ Wave 0 |
| Integration | Full flow: GitHub mock → fetch → checkUpdate → notification renders → click "Update" → confirm dialog opens | manual browser | (chrome devtools MCP) | manual-only |
| Integration | Full update.sh subprocess actually runs and `.deployed-sha` updates | manual SSH | (same as UPD-03) | manual-only |

### Sampling Rate

- **Per task commit:** Run the specific unit test file touched (e.g., `vitest run src/components/update-notification`).
- **Per wave merge:** Full backend suite + full UI suite for the affected packages (`npm run test` in livinityd, `pnpm exec vitest run` in UI).
- **Phase gate:** Manual SSH validation of UPD-03 + manual browser validation of full E2E flow (described in REQUIREMENTS exit-criteria line 138).

### Wave 0 Gaps

- [ ] `livos/packages/livinityd/source/modules/system/update.unit.test.ts` — covers UPD-01 + UPD-02. Use `vi.mock('node:fs/promises')`, `vi.mock('execa')`, and `globalThis.fetch = vi.fn()` for stubbing.
- [ ] `livos/packages/ui/src/components/update-notification.unit.test.ts` — covers UPD-04 render + dismiss + re-show logic.
- [ ] (Optional) `livos/packages/ui/src/hooks/use-software-update.unit.test.ts` — only if planner wants explicit shape lock; otherwise rely on TypeScript compile.
- [ ] Extend `livos/packages/livinityd/source/modules/system/system.integration.test.ts` with one or two `system.update` mutation cases (CONFLICT, success).

*If livinityd's existing `vitest.config.ts` already covers `*.unit.test.ts` discovery (it does — `system.unit.test.ts` ran in current CI per Plan 22-01 evidence), no config changes are needed.*

## Sources

### Primary (HIGH confidence)
- **Codebase grep + read**: `livos/packages/livinityd/source/modules/system/update.ts` (existing OTA flow), `routes.ts` (tRPC routes + `httpOnlyPaths` adjacency), `factory-reset.ts` (subprocess pattern reuse), `system.unit.test.ts` (test mock patterns)
- **Codebase grep + read**: `livos/packages/ui/src/components/install-prompt-banner.tsx` (canonical framer-motion+localStorage pattern), `hooks/use-software-update.ts` (hook to patch), `router.tsx` (mount point), `routes/settings/software-update-confirm.tsx` (existing target dialog), `providers/global-system-state/{index,update}.tsx` (mutation flow + status cover behavior)
- **Codebase grep**: `httpOnlyPaths` list in `common.ts:8-166` — confirmed `system.update` and `system.updateStatus` are NOT currently HTTP-routed
- **`/opt/livos/update.sh` worktree copy** at `.claude/worktrees/agent-a917d3b94afb505cc/update.sh` — full 264-line script content
- **Project memory** (`MEMORY.md`) — Server4 deployment model, livinityd vs nexus build differences, tRPC WS-hang gotcha
- **Project planning artifacts** — `STATE.md`, `ROADMAP.md` (Phase 30 success criteria), `30-CONTEXT.md`, `REQUIREMENTS.md`

### Secondary (MEDIUM confidence)
- **WebFetch of `api.github.com/repos/utopusc/livinity-io/commits/master`** — confirmed top-level shape (`sha`, `commit.{message,author,committer,tree}`, `html_url`)
- **GitHub REST API docs** — User-Agent header requirement [CITED: docs.github.com/en/rest/overview/resources-in-the-rest-api]
- **Plan 24-01 reference** (in `.planning/milestones/v28.0-phases/`) — UI vitest invocation idiom

### Tertiary (LOW confidence)
- **Assumption A1** (livinityd runs as root) — based on memory note about systemd, not directly verified via `systemctl cat`. Plan 30-01 first task should confirm.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dep verified in package.json, every pattern verified via grep
- Architecture: HIGH — flow mirrors existing OTA, just swaps endpoints; tier mapping straightforward
- Pitfalls: HIGH — pitfalls #1 (shape change), #4 (httpOnlyPaths), #5 (drop reboot), #6 (ENOENT), #7 (User-Agent) all verified directly against code or GitHub docs. Pitfall #3 (sudo) is the only MEDIUM-confidence one — see Assumption A1.
- Code examples: HIGH for backend (mirrors update.ts:90-121 verbatim), HIGH for frontend (mirrors install-prompt-banner.tsx verbatim).
- Tests: MEDIUM — UI vitest invocation idiom proven via Plan 24-01 but `pnpm --filter ui test` script doesn't exist; falls back to `pnpm exec vitest run`.

**Research date:** 2026-04-26
**Valid until:** 2026-05-26 (30 days — stable codebase, no fast-moving deps; GitHub API shape stable for years)
