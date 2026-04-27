# Phase 33: Update Observability Surface - Research

**Researched:** 2026-04-27
**Domain:** Filesystem-backed deploy log surfacing through tRPC + a React Settings UI section
**Confidence:** HIGH (every architectural decision is verified against real source files; Phase 32 schemas are already on disk and were read directly)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
*All implementation choices at Claude's discretion — discuss phase was skipped per `workflow.skip_discuss: true`.*

**Inherited from Phase 30/31/32 (locked):**
- tRPC routes added to `livos/packages/livinityd/source/modules/system/routes.ts` matching `update.ts` shape
- New routes added to `httpOnlyPaths` in `livos/packages/livinityd/source/modules/server/trpc/common.ts` (per MEMORY: long-running mutations + auth-sensitive routes must use HTTP, not WS)
- Admin-only access enforced via `adminProcedure` middleware
- UI component lives next to `software-update-list-row.tsx` under `livos/packages/ui/src/routes/settings/_components/` (Software Update has NO `software-update/page.tsx` — it's a section rendered by `settings-content.tsx`'s SectionContent switch)
- Sidebar badge hooks into `useSoftwareUpdate()` (already exists at `hooks/use-software-update.ts`)
- Path traversal guard: `path.basename(filename) === filename` + whitelist regex + verify-startswith

**Critical constraints (from CONTEXT success criteria):**
- **OBS-01 log file naming:** `update-<ISO-timestamp>-<7char-sha>.log` — exact format required
- **OBS-01 log content:** per-step lines + final exit code + total duration in seconds
- **OBS-02 table:** last 50 log files, sorted newest-first, columns SHA + ISO timestamp + status + duration
- **OBS-03 modal:** last 500 lines monospace + "Download full log" button (full file stream, not truncated)
- **UX-04 badge:** numeric badge on Settings sidebar "Software Update" row, disappears on click/install, both themes
- **Security:** `adminProcedure` RBAC + filename validation (no `..` traversal); read-only filesystem access, no DB writes

**Phase 32 schemas already on disk (Phase 33 INPUT, never write these formats):**
- `<ts>-rollback.json` — `status: "rolled-back"`, fields: `{timestamp, status, from_sha, to_sha, reason, duration_ms, log_path?}`
- `<ts>-precheck-fail.json` — `status: "precheck-failed"`, fields: `{timestamp, status, reason, duration_ms}`

Phase 33 ADDS:
- `<ts>-success.json` — `status: "success"`, fields: `{timestamp, status, from_sha, to_sha, duration_ms, log_path}`
- `<ts>-failed.json` — `status: "failed"`, fields: `{timestamp, status, reason, duration_ms, log_path?}` (reason = last 200 chars of stderr-lite — captured via trap)

### Claude's Discretion
- Exact log filename: include `<7char-sha>` only when SHA is known at log-open time (it isn't — sha is known AFTER `git clone --depth 1` succeeds). Solution locked below: rename log file at SHA-known point.
- Whether to use a Dialog vs Sheet vs ImmersiveDialog for the log viewer (decision: shadcn Dialog — see Pattern 3)
- Whether to add a separate Express download endpoint or stream from tRPC (decision: tRPC + Blob — see Risks R-04)
- Badge styling — small dot vs numeric (decision: small brand-color dot, no number — single update available is binary, "1 update" is misleading when there is no concept of "2 updates")

### Deferred Ideas (OUT OF SCOPE)
- SSE / WebSocket streaming of in-progress logs
- Search/filter UI for Past Deploys
- Log retention/rotation policy (defer to v30+)
- Per-deploy diff link to GitHub commit page
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OBS-01 | `update.sh` writes structured per-deploy log to `/opt/livos/data/update-history/update-<ISO-ts>-<sha>.log` with per-step lines + exit code + duration in seconds | Phase 32 already established the dir and JSON-emission idiom (`livos-rollback.sh` lines 39-46 show the `tee` + ISO-timestamp pattern). The patch script `phase32-systemd-rollback-patch.sh` is the architectural template for this phase's `phase33-update-sh-logging-patch.sh`. |
| OBS-02 | Past Deploys table in Settings > Software Update reads last 50 `*.json` files, sorted newest-first, columns: SHA + ISO timestamp + status + duration | New tRPC route `system.listUpdateHistory` reads `/opt/livos/data/update-history/`, filters `.json`, parses, sorts, slices. Backend pattern mirrors `system.logs` (existing in `routes.ts` line 142) — `privateProcedure.input(z.object({...})).query(...)`. |
| OBS-03 | Click row → log viewer modal with last 500 lines monospace + "Download full log" button | New tRPC route `system.readUpdateLog` validates basename + reads file. Frontend opens shadcn `Dialog` (already used everywhere — software-update-confirm.tsx is the canonical example). Download = browser `Blob` from a separate full-content fetch. |
| UX-04 | Settings sidebar shows badge on "Software Update" row when an update is available; disappears on click/install; works in both themes | `useSoftwareUpdate().state === 'update-available'` is the data source. Sidebar lives in `settings-content.tsx` line 286-308 (the `MENU_ITEMS.map` block). Badge styling uses `bg-brand` (already used in `software-update-list-row.tsx` line 27 `text-brand`) — automatically themes via tailwind tokens. |
</phase_requirements>

## Summary

Phase 33 is a **read-mostly, additive UI layer over the filesystem state Phase 32 already produces**. The dataflow is one-direction: `update.sh` (root, bash) writes JSON + .log into `/opt/livos/data/update-history/` → livinityd (root user) reads via two new tRPC routes → React UI renders a table + modal.

The risk profile is dominated by **path traversal** (a single `system.readUpdateLog({filename: '../etc/shadow'})` would be catastrophic) and **transport routing** (long-running queries hung on a broken WebSocket would silently fail per BACKLOG 999.6). Both are addressable with established patterns: `path.basename` + regex whitelist + resolved-path startswith for traversal; `httpOnlyPaths` array entry for transport.

The non-obvious finding is **the SHA isn't known when the log file opens** — `git clone --depth 1` happens at line 53 of `update.sh`, but the `tee` exec must be set up at the very top of the script (otherwise we lose precheck output). Solution: open the log file with a placeholder name (`update-<ts>-pending.log`), `tee` to it, then `mv` to `update-<ts>-<sha>.log` once SHA is known. The JSON write is similarly post-SHA. If the script dies BEFORE SHA-resolution, the file stays as `update-<ts>-pending.log` and a `<ts>-failed.json` row references it.

The other non-obvious finding is **Software Update is NOT a route** — `livos/packages/ui/src/routes/settings/software-update/page.tsx` does not exist, and `software-update-confirm.tsx` is just the install confirmation Dialog. The actual "Software Update" section is rendered by `SoftwareUpdateSection()` (`settings-content.tsx` line 1832) which only renders `<SoftwareUpdateListRow>`. Phase 33's Past Deploys table is a sibling component injected into the same `SoftwareUpdateSection`, NOT a new route.

**Primary recommendation:** Three plans, additive to Phase 32:
1. **Plan 33-01** — backend tRPC routes + httpOnlyPaths + filename guards + unit tests
2. **Plan 33-02** — `phase33-update-sh-logging-patch.sh` artifact + Mini PC SSH apply (HUMAN-VERIFY)
3. **Plan 33-03** — frontend (Past Deploys table + log viewer Dialog + sidebar badge) + integration tests

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-deploy log file emission | `update.sh` (bash, root) | — | Same tier as the work being logged. tee is the lowest-friction capture mechanism. |
| Per-deploy success/failed JSON write | `update.sh` (bash, root) | — | Atomic with the log file. Phase 32 established the JSON-write idiom in bash; Phase 33 mirrors it for `success` + `failed` statuses. |
| Read update-history JSON list | livinityd (`system.listUpdateHistory`, Node fs) | UI consumes via tRPC query | Filesystem is owned by root (writes) but world-readable (per Phase 32 `chmod 644`). livinityd reads as root or livos user — either works. |
| Read individual log file (validated) | livinityd (`system.readUpdateLog`, Node fs) | UI consumes via tRPC query | Same as above. Filename validation is the SECURITY tier owner — must reject traversal. |
| Past Deploys table render | UI (`PastDeploysTable.tsx` in `_components/`) | livinityd via tRPC | UI owns presentation. New file slots into `SoftwareUpdateSection()` next to `SoftwareUpdateListRow`. |
| Log viewer modal | UI (`UpdateLogViewerDialog.tsx`) | livinityd via tRPC | shadcn Dialog (existing pattern from `software-update-confirm.tsx`). |
| Full-log download | UI (`Blob` from second tRPC fetch with `full: true`) | livinityd same route, `full` flag | NOT a separate Express endpoint — keep the security perimeter on tRPC's `adminProcedure`. Browser Blob avoids needing a new auth path. |
| Sidebar badge presence | UI (`settings-content.tsx` MENU_ITEMS render) | `useSoftwareUpdate()` hook | Pure React state derivation. No backend change. Tailwind `bg-brand` token themes automatically (verified — same token used in `software-update-list-row.tsx` and `mobile/software-update.tsx`). |

## Domain Background

### tRPC patterns in this repo

[VERIFIED: livos/packages/livinityd/source/modules/server/trpc/trpc.ts]

The tRPC server exports four procedure factories:
- `publicProcedure` — no auth
- `privateProcedure` — `isAuthenticated` middleware (Bearer token or `LIVINITY_SESSION` cookie)
- `publicProcedureWhenNoUserExists` — exists for onboarding only
- `adminProcedure` = `privateProcedure.use(requireRole('admin'))` — requires admin role; **legacy single-user mode (no `currentUser`) is treated as admin** (verified in `is-authenticated.ts` line 75-76)

The system router (`modules/system/routes.ts`) currently uses `privateProcedure` for everything except `online`/`version`/`status` (public) and `factoryReset` (private + manual password check). **Phase 33 should use `adminProcedure`** because deploy logs may contain secrets-adjacent strings (paths, SHA values, occasional bash debug output). Member/guest users have no business reading them. This matches the `audit.listDeviceEvents` precedent (`common.ts` line 142, comment: "admin-only query").

### `httpOnlyPaths` — the BACKLOG 999.6 trap

[VERIFIED: livos/packages/livinityd/source/modules/server/trpc/common.ts + livos/packages/ui/src/trpc/trpc.ts]

The UI's tRPC client uses `splitLink` to route operations to either WebSocket or HTTP. The decision condition (trpc.ts line 56-60):

```typescript
condition: (operation) => {
    const noToken = !getJwt()
    const isHttpOnlyPath = httpOnlyPaths.includes(operation.path as ...)
    return noToken || isHttpOnlyPath
}
```

A query NOT in `httpOnlyPaths` AND with a JWT goes over WebSocket. If the WS connection is in a half-broken state (post-restart, network blip, "Invalid token" from stale cookie), the query silently hangs. UX-03 (already shipped — `system.checkUpdate` was added to `httpOnlyPaths` in commit `11634c5a`) is the precedent.

**Phase 33 routes that MUST go in `httpOnlyPaths`:**
- `system.listUpdateHistory` — admin-only query the user pulls up to diagnose a JUST-failed update; if WS is hung post-update, the table never loads → silent fail
- `system.readUpdateLog` — same reason; the user may invoke this seconds after a deploy that may have killed their WS

**Phase 33 routes that DO NOT need `httpOnlyPaths`:**
- (None — both Phase 33 routes are admin-sensitive and post-update use cases.)

### Settings shell architecture

[VERIFIED: livos/packages/ui/src/routes/settings/index.tsx + _components/settings-content.tsx]

The Settings shell is a **two-pane master-detail**, not a routed app. There is no `software-update/page.tsx` and there is no React Router route for `/settings/software-update` on desktop (mobile has `/settings/software-update` → `SoftwareUpdateDrawer`). The desktop flow:

1. `Settings()` (index.tsx) renders `<SettingsContent>` which contains a `MENU_ITEMS` sidebar.
2. Click a menu item → `SettingsDetailView` swaps in via state (`activeSection`), NOT navigation.
3. The right pane renders `<SectionContent section={section} />` which is a giant `switch` (`settings-content.tsx` line 428-474).
4. For `case 'software-update'`, `<SoftwareUpdateSection />` returns `<SoftwareUpdateListRow isActive={false} />` wrapped in a div with a description paragraph.

**Implication for Phase 33:**
- The "Past Deploys" table goes INSIDE `SoftwareUpdateSection` (settings-content.tsx line 1832) — append it after the `SoftwareUpdateListRow`.
- The sidebar badge belongs in the `MENU_ITEMS.map` rendering — both occurrences (line 286-308 home view, and line 354-385 detail view), or factored into a shared `<MenuItemRow>` component.

### Phase 30 badge precedent

[VERIFIED: livos/packages/ui/src/components/update-notification.tsx]

Phase 30 already shipped a "new update available" UI cue: a desktop-only bottom-right card (`UpdateNotification`). Its data source is `useSoftwareUpdate()`, gating on `state === 'update-available'` AND `latestVersion.sha !== dismissedSha` (SHA-keyed localStorage dismissal). Per Phase 30 hot-patch round 8, defense-in-depth also checks that `currentVersion.sha !== latestVersion.sha` (avoids the brief window where checkUpdate cache hasn't refetched post-update).

**Phase 33 UX-04 should mirror the dismissal logic but NOT the position.** The badge IS the persistent indicator; the bottom-right card is the call-to-action. The badge should NOT have its own dismissal — it disappears naturally when:
1. The user installs the update → `currentVersion.sha === latestVersion.sha` → `state` becomes `at-latest`
2. There is no update → `state` is `at-latest` from the start

No localStorage gate. The badge is purely a function of `useSoftwareUpdate().state`.

### Phase 32 JSON write pattern (mirror exactly)

[VERIFIED: livos-rollback.sh lines 237-249]

```bash
cat > "${HISTORY_DIR}/${START_ISO_FS}-rollback.json" <<JSON
{
  "timestamp": "${START_ISO_JSON}",
  "status": "rolled-back",
  "from_sha": "${CURRENT_SHA}",
  "to_sha": "${PREV_SHA}",
  "reason": "3-crash-loop",
  "duration_ms": ${DURATION_MS},
  "log_path": "${LOG_FILE}"
}
JSON
chmod 644 "${HISTORY_DIR}/${START_ISO_FS}-rollback.json"
```

Two `date` formats are used:
- `START_ISO_FS=$(date -u +%Y-%m-%dT%H-%M-%SZ)` — colons replaced with hyphens, used in FILENAMES (filesystem-safe)
- `START_ISO_JSON=$(date -u +%Y-%m-%dT%H:%M:%SZ)` — RFC 3339 UTC, used INSIDE JSON (frontend can `new Date()` parse directly)

Phase 33's `update.sh` patch must follow this exact convention.

### Path traversal — the established repo pattern

[VERIFIED: code reading; no centralized helper exists]

The repo doesn't have a single `validateUserFilename(name)` helper. Each file-touching route does its own check. Phase 33 should adopt a defense-in-depth chain:

```typescript
import path from 'node:path'

const HISTORY_DIR = '/opt/livos/data/update-history'
const FILENAME_RE = /^[a-zA-Z0-9._-]+\.(log|json)$/

function safeResolveHistoryFile(filename: string): string {
    // Layer 1: basename equality — rejects any '/' or '\\'
    if (path.basename(filename) !== filename) {
        throw new TRPCError({code: 'BAD_REQUEST', message: 'Invalid filename'})
    }
    // Layer 2: regex whitelist — rejects '..', empty, weird chars
    if (!FILENAME_RE.test(filename)) {
        throw new TRPCError({code: 'BAD_REQUEST', message: 'Invalid filename'})
    }
    // Layer 3: resolved-path containment — defense-in-depth against symlink tricks
    const resolved = path.resolve(HISTORY_DIR, filename)
    if (!resolved.startsWith(HISTORY_DIR + path.sep) && resolved !== HISTORY_DIR) {
        throw new TRPCError({code: 'BAD_REQUEST', message: 'Invalid filename'})
    }
    return resolved
}
```

Three layers because each catches a different attack class:
- Layer 1 catches `'/etc/passwd'` and `'subdir/file.log'`
- Layer 2 catches `'..foo.log'` (basename equality passes, but `..` shouldn't be in a real filename) and weird shell injection chars
- Layer 3 catches symlink shenanigans (someone places a symlink at `/opt/livos/data/update-history/sneak.log` pointing to `/etc/shadow`; layers 1+2 pass; layer 3 catches because realpath escape... actually `path.resolve` doesn't deref symlinks, so this won't catch a planted symlink — would need `fs.realpath`. **Worth: NO. The dir is root-writable; if an attacker can plant a symlink there, they already have root.** Layer 3 is for typos and refactor-safety only.)

### shadcn Dialog vs Sheet vs ImmersiveDialog

[VERIFIED: file existence + grep usage]

Three viable modal/overlay primitives in this repo:
- `shadcn-components/ui/dialog.tsx` — used by `software-update-confirm.tsx`, `change-name.tsx`, `change-password.tsx`, etc. — the standard. Has `DialogScrollableContent` for tall content.
- `shadcn-components/ui/sheet.tsx` — slides from edge. Used for Settings shell itself (`SheetHeader`, `SheetTitle`).
- `components/ui/immersive-dialog.tsx` — full-screen takeover. Used by Troubleshoot logs viewer (which is the closest analogous use case to ours).

**Choice for Phase 33 log viewer: shadcn Dialog** — not ImmersiveDialog. Reasoning:
- The user is on the Settings page, and clicking a row to view a log shouldn't blow away the settings context. Dialog stays scoped.
- `DialogScrollableContent` already exists, and 500 lines of monospace text fits inside a max-h-[600px] scrollable area cleanly.
- Mobile drawer fallback can use shadcn `Drawer` (precedent: `mobile/software-update.tsx`).

### Sidebar badge — Tailwind theme tokens

[VERIFIED: software-update-list-row.tsx line 27, mobile/software-update.tsx line 62]

The brand color `bg-brand` and `text-brand` Tailwind classes resolve to a CSS variable that flips automatically between light/dark themes. Both pre-existing components use these tokens and visually adapt. The sidebar badge can be a single `<div className='absolute right-2 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-brand' />` overlay on the menu button — no theme handling required.

## Recommended Implementation Approach

### Backend — `livos/packages/livinityd/source/modules/system/routes.ts`

Add two routes to the existing `router({...})` block. Place them adjacent to `update`/`updateStatus`/`checkUpdate` (around line 91, before `hiddenService`):

```typescript
// Phase 33 OBS-02 — list last N deploy history entries (success/failed/rolled-back/precheck-failed)
listUpdateHistory: adminProcedure
    .input(z.object({limit: z.number().int().min(1).max(200).default(50)}))
    .query(async () => {
        const HISTORY_DIR = '/opt/livos/data/update-history'
        let entries: string[] = []
        try {
            entries = await fs.readdir(HISTORY_DIR)
        } catch (err: any) {
            if (err.code === 'ENOENT') return []  // dir doesn't exist (dev machine, fresh install)
            throw err
        }
        const jsonFiles = entries.filter(f => f.endsWith('.json'))
        const records = await Promise.all(jsonFiles.map(async (f) => {
            try {
                const raw = await fs.readFile(path.join(HISTORY_DIR, f), 'utf8')
                const parsed = JSON.parse(raw)
                return {filename: f, ...parsed}
            } catch {
                return null  // corrupt JSON: skip, don't crash the whole list
            }
        }))
        const valid = records.filter((r): r is NonNullable<typeof r> => r !== null && typeof r.timestamp === 'string')
        valid.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        return valid.slice(0, input.limit)
    }),

// Phase 33 OBS-03 — read tail of a single log file (or full content for download)
readUpdateLog: adminProcedure
    .input(z.object({
        filename: z.string().min(1).max(200),
        full: z.boolean().default(false),
    }))
    .query(async ({input}) => {
        const HISTORY_DIR = '/opt/livos/data/update-history'
        const FILENAME_RE = /^[a-zA-Z0-9._-]+\.(log|json)$/
        if (path.basename(input.filename) !== input.filename) {
            throw new TRPCError({code: 'BAD_REQUEST', message: 'Invalid filename'})
        }
        if (!FILENAME_RE.test(input.filename)) {
            throw new TRPCError({code: 'BAD_REQUEST', message: 'Invalid filename'})
        }
        const resolved = path.resolve(HISTORY_DIR, input.filename)
        if (!resolved.startsWith(HISTORY_DIR + path.sep)) {
            throw new TRPCError({code: 'BAD_REQUEST', message: 'Invalid filename'})
        }
        let content: string
        try {
            content = await fs.readFile(resolved, 'utf8')
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                throw new TRPCError({code: 'NOT_FOUND', message: 'Log file not found'})
            }
            throw err
        }
        if (input.full) return {filename: input.filename, content, truncated: false}
        const lines = content.split('\n')
        const TAIL = 500
        if (lines.length <= TAIL) return {filename: input.filename, content, truncated: false}
        const tail = lines.slice(-TAIL).join('\n')
        return {filename: input.filename, content: tail, truncated: true, totalLines: lines.length}
    }),
```

**New imports needed at top of `routes.ts`:**
```typescript
import path from 'node:path'
import fs from 'node:fs/promises'
import {adminProcedure, privateProcedure, publicProcedure, router} from '../server/trpc/trpc.js'
```

(The `adminProcedure` import is the only new import — `path`, `fs/promises`, and the others are either already imported via other names or are Node built-ins. Verify against the actual file's existing imports during plan-phase to avoid duplicates.)

### Backend — `livos/packages/livinityd/source/modules/server/trpc/common.ts`

Add to the `httpOnlyPaths` array, alphabetized near other `system.*` entries (around line 36 after `system.checkUpdate`):

```typescript
// Phase 33 OBS-02 / OBS-03 — admin-only file-system reads. Used in the
// "diagnose a just-failed update" flow, where the user's WS may be in a
// half-broken state from the deploy restart cycle. HTTP guarantees the
// query reaches livinityd and any error surfaces to the toast handler.
'system.listUpdateHistory',
'system.readUpdateLog',
```

### Frontend — `livos/packages/ui/src/routes/settings/_components/past-deploys-table.tsx` (NEW)

Component renders the table. Skeleton:

```tsx
import {useState} from 'react'
import {formatDistanceToNow, parseISO} from 'date-fns'

import {trpcReact} from '@/trpc/trpc'
import {Badge} from '@/shadcn-components/ui/badge'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/shadcn-components/ui/table'
import {UpdateLogViewerDialog} from '@/components/update-log-viewer-dialog'

type DeployStatus = 'success' | 'failed' | 'rolled-back' | 'precheck-failed'

const STATUS_VARIANT: Record<DeployStatus, 'default' | 'primary' | 'destructive' | 'outline'> = {
    success: 'primary',
    failed: 'destructive',
    'rolled-back': 'destructive',
    'precheck-failed': 'outline',
}

function formatDuration(ms: number): string {
    const s = Math.round(ms / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    const rem = s % 60
    return `${m}m ${rem}s`
}

export function PastDeploysTable() {
    const historyQ = trpcReact.system.listUpdateHistory.useQuery({limit: 50}, {
        refetchOnWindowFocus: true,
        staleTime: 30_000,
    })
    const [openLog, setOpenLog] = useState<string | null>(null)

    if (historyQ.isLoading) return <div className='py-4 text-text-tertiary text-body-sm'>Loading…</div>
    if (historyQ.isError) return <div className='py-4 text-destructive2 text-body-sm'>Error: {historyQ.error.message}</div>
    const rows = historyQ.data ?? []
    if (rows.length === 0) return <div className='py-4 text-text-tertiary text-body-sm'>No deploys yet.</div>

    return (
        <>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>SHA</TableHead>
                        <TableHead>When</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Duration</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map(row => {
                        const sha = row.to_sha?.slice(0, 7) ?? '—'
                        const logName = row.filename?.replace('.json', '.log') ?? null  // convention; see plan
                        return (
                            <TableRow
                                key={row.filename}
                                className='cursor-pointer hover:bg-surface-2'
                                onClick={() => logName && setOpenLog(logName)}
                            >
                                <TableCell className='font-mono'>{sha}</TableCell>
                                <TableCell title={row.timestamp}>{formatDistanceToNow(parseISO(row.timestamp), {addSuffix: true})}</TableCell>
                                <TableCell><Badge variant={STATUS_VARIANT[row.status as DeployStatus] ?? 'default'}>{row.status}</Badge></TableCell>
                                <TableCell>{formatDuration(row.duration_ms)}</TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
            {openLog && <UpdateLogViewerDialog filename={openLog} open={!!openLog} onOpenChange={(o) => !o && setOpenLog(null)} />}
        </>
    )
}
```

**Filename → log name convention:** The JSON filename is `<ISO-FS-ts>-<status>.json`. The log filename is `update-<ISO-FS-ts>-<sha>.log`. There is no perfect 1:1 derivation from the JSON filename alone — **the JSON's `log_path` field IS the source of truth.** Use `row.log_path ? path.basename(row.log_path) : null` for the lookup. Rows without `log_path` (e.g., precheck-failed before the SHA is known) get a row with NO clickable log link — the row is still informative (timestamp + reason).

### Frontend — `livos/packages/ui/src/components/update-log-viewer-dialog.tsx` (NEW)

```tsx
import {useState} from 'react'

import {Button} from '@/shadcn-components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogScrollableContent, DialogTitle} from '@/shadcn-components/ui/dialog'
import {trpcReact, trpcClient} from '@/trpc/trpc'

export function UpdateLogViewerDialog({filename, open, onOpenChange}: {filename: string; open: boolean; onOpenChange: (o: boolean) => void}) {
    const tailQ = trpcReact.system.readUpdateLog.useQuery({filename, full: false}, {enabled: open, staleTime: Infinity})
    const [downloading, setDownloading] = useState(false)

    const handleDownload = async () => {
        setDownloading(true)
        try {
            const full = await trpcClient.system.readUpdateLog.query({filename, full: true})
            const blob = new Blob([full.content], {type: 'text/plain'})
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = filename
            a.click()
            URL.revokeObjectURL(url)
        } finally {
            setDownloading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className='max-w-[900px]'>
                <DialogHeader>
                    <DialogTitle className='font-mono text-body-sm'>{filename}</DialogTitle>
                </DialogHeader>
                <DialogScrollableContent className='max-h-[60vh]'>
                    <pre className='whitespace-pre-wrap break-words bg-surface-1 p-3 text-caption font-mono leading-tight'>
                        {tailQ.isLoading ? 'Loading…' : tailQ.error ? `Error: ${tailQ.error.message}` : tailQ.data?.content}
                    </pre>
                    {tailQ.data?.truncated && (
                        <p className='mt-2 px-3 text-caption text-text-tertiary'>Showing last 500 of {tailQ.data.totalLines} lines.</p>
                    )}
                </DialogScrollableContent>
                <DialogFooter>
                    <Button onClick={handleDownload} disabled={downloading || tailQ.isLoading}>
                        {downloading ? 'Downloading…' : 'Download full log'}
                    </Button>
                    <Button variant='secondary' onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
```

### Frontend — `_components/settings-content.tsx` modifications

Two splice points:

**(A) `SoftwareUpdateSection()` — line 1832-1839** — append the table:

```tsx
function SoftwareUpdateSection() {
    return (
        <div className='space-y-4'>
            <p className='text-body-sm text-text-secondary'>Check for LivOS updates.</p>
            <SoftwareUpdateListRow isActive={false} />
            <h3 className='mt-6 text-body font-medium'>Past Deploys</h3>
            <PastDeploysTable />
        </div>
    )
}
```

Add import: `import {PastDeploysTable} from './past-deploys-table'`

**(B) `MENU_ITEMS.map` rendering — UX-04 badge** — both occurrences (home view line 286-308 + detail view line 354-385). Extract a `<MenuItemBadge item={item} />` component:

```tsx
function MenuItemBadge({item}: {item: MenuItem}) {
    const {state} = useSoftwareUpdate()
    if (item.id !== 'software-update') return null
    if (state !== 'update-available') return null
    return (
        <span
            className='absolute right-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-brand'
            aria-label='Update available'
        />
    )
}
```

Then wrap each menu button to add `relative` to its className (already present in the detail view via `relative flex w-full items-center`) and render `<MenuItemBadge item={item} />` as a child. The home view button needs the `relative` class added.

`useSoftwareUpdate()` is called in many places already and is a thin wrapper over `useQuery({staleTime: 0, refetchOnWindowFocus: true, refetchInterval: MS_PER_HOUR})` — calling it once per visible menu item is harmless; React Query dedupes.

### update.sh patch — splice points

Phase 32's patch script `phase32-systemd-rollback-patch.sh` is the architectural template. Phase 33's patch script `phase33-update-sh-logging-patch.sh` mirrors it exactly but applies a different set of splices.

**Splice 1 — log-tee + EXIT trap at script TOP (insert AFTER `set -euo pipefail` line 8, BEFORE the constants block):**

```bash
# ── Phase 33 OBS-01: log file emission ──
# Tee all stdout+stderr to a per-deploy log file. SHA is unknown until after
# `git clone` succeeds (line ~53), so we open with a placeholder name and
# rename later. EXIT trap writes the success/failed JSON row.
mkdir -p /opt/livos/data/update-history
LIVOS_UPDATE_START_TS=$(date -u +%s)
LIVOS_UPDATE_START_TS_MS=$(date -u +%s%3N 2>/dev/null || echo $((LIVOS_UPDATE_START_TS * 1000)))
LIVOS_UPDATE_START_ISO_FS=$(date -u +%Y-%m-%dT%H-%M-%SZ)
LIVOS_UPDATE_START_ISO_JSON=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LIVOS_UPDATE_LOG_FILE="/opt/livos/data/update-history/update-${LIVOS_UPDATE_START_ISO_FS}-pending.log"
LIVOS_UPDATE_FROM_SHA=$(cat /opt/livos/.deployed-sha 2>/dev/null | tr -d '[:space:]' || echo "unknown")
LIVOS_UPDATE_TO_SHA=""

# Open the log via a process substitution so the rest of the script's stdout/err
# is captured. Note: this MUST be done before the first `step` / `info` call.
exec > >(tee -a "$LIVOS_UPDATE_LOG_FILE") 2>&1

phase33_finalize() {
    local exit_code=$?
    local end_ts end_ts_ms duration_ms status reason_field log_field
    end_ts=$(date -u +%s)
    end_ts_ms=$(date -u +%s%3N 2>/dev/null || echo $((end_ts * 1000)))
    duration_ms=$((end_ts_ms - LIVOS_UPDATE_START_TS_MS))

    # If precheck wrote a precheck-fail.json already, this finalize is redundant
    # for the precheck-fail case. We detect by checking if a precheck-fail
    # row exists with our START_ISO_FS prefix.
    if ls /opt/livos/data/update-history/${LIVOS_UPDATE_START_ISO_FS}-precheck-fail.json 2>/dev/null | grep -q .; then
        # Rename the .pending log to match the precheck-fail timestamp for traceability
        if [[ -f "$LIVOS_UPDATE_LOG_FILE" ]]; then
            local pf_log="/opt/livos/data/update-history/${LIVOS_UPDATE_START_ISO_FS}-precheck-fail.log"
            mv "$LIVOS_UPDATE_LOG_FILE" "$pf_log" 2>/dev/null || true
        fi
        return
    fi

    if (( exit_code == 0 )); then
        status="success"
    else
        status="failed"
    fi

    # Rename the .pending log to include the SHA (or stay as -unknown if SHA never set)
    local final_log_file="$LIVOS_UPDATE_LOG_FILE"
    if [[ -n "$LIVOS_UPDATE_TO_SHA" ]]; then
        final_log_file="/opt/livos/data/update-history/update-${LIVOS_UPDATE_START_ISO_FS}-${LIVOS_UPDATE_TO_SHA:0:7}.log"
        mv "$LIVOS_UPDATE_LOG_FILE" "$final_log_file" 2>/dev/null || true
    fi

    # Append exit code + duration as the LAST lines of the log (after the tee
    # output is flushed). Done OUTSIDE the tee redirection — write directly.
    {
        echo ""
        echo "[PHASE33-SUMMARY] status=$status exit_code=$exit_code duration_seconds=$((duration_ms / 1000))"
    } >> "$final_log_file" 2>/dev/null || true

    # Build JSON. Reason for failed = last line of log (best-effort) trimmed to 200 chars.
    reason_field=""
    if [[ "$status" == "failed" ]]; then
        local last_err
        last_err=$(grep -E '\[FAIL\]|fail|Error|error' "$final_log_file" 2>/dev/null | tail -1 | tr -d '"' | cut -c1-200)
        reason_field=", \"reason\": \"${last_err:-unknown error (exit $exit_code)}\""
    fi
    local from_field=""
    [[ -n "$LIVOS_UPDATE_FROM_SHA" ]] && [[ "$LIVOS_UPDATE_FROM_SHA" != "unknown" ]] && from_field=", \"from_sha\": \"$LIVOS_UPDATE_FROM_SHA\""
    local to_field=""
    [[ -n "$LIVOS_UPDATE_TO_SHA" ]] && to_field=", \"to_sha\": \"$LIVOS_UPDATE_TO_SHA\""

    local json_path="/opt/livos/data/update-history/${LIVOS_UPDATE_START_ISO_FS}-${status}.json"
    cat > "$json_path" <<JSON
{
  "timestamp": "${LIVOS_UPDATE_START_ISO_JSON}",
  "status": "${status}"${from_field}${to_field},
  "duration_ms": ${duration_ms},
  "log_path": "${final_log_file}"${reason_field}
}
JSON
    chmod 644 "$json_path" 2>/dev/null || true
}
trap phase33_finalize EXIT
```

**Splice 2 — capture SHA after `git clone` succeeds** (insert AFTER line 53 `git clone --depth 1 ...`):

```bash
# ── Phase 33 OBS-01 prep: capture target SHA for log filename rename ──
LIVOS_UPDATE_TO_SHA=$(git -C "$TEMP_DIR" rev-parse HEAD 2>/dev/null || echo "")
```

**Splice ordering vs Phase 32:**

Phase 32's patch script applied:
- Splice 1: precheck() / record_previous_sha() helpers AFTER fail() (around line 28)
- Splice 2: `precheck || exit 1` call AFTER `ok "Pre-flight passed"` (line 44)
- Splice 3: `record_previous_sha` call BEFORE the SHA-write block (around line 254 of the Mini PC script)

Phase 33's splices INTERLEAVE with these:
- New Splice 1 (log-tee + trap) goes BEFORE Phase 32's Splice 1 — must be at the very top so precheck output is also captured.
- New Splice 2 (TO_SHA capture) goes AFTER `git clone --depth 1` — does NOT conflict with Phase 32.

Phase 33's patch script must use idempotent `grep -qF` markers like Phase 32. Suggested markers:
- `# ── Phase 33 OBS-01: log file emission ──`
- `# ── Phase 33 OBS-01 prep: capture target SHA for log filename rename ──`

Both Phase 32 and Phase 33 patch scripts safe to re-apply on already-patched hosts. The Phase 33 patch script ALSO writes `/opt/livos/update.sh.pre-phase33` backup before changes, runs `bash -n` post-patch, restores on syntax fail.

### Why the rename-on-SHA-known approach beats embedding SHA at the start

**Alternative considered, REJECTED:** open the log file with the SHA in the name from the start. Requires `git ls-remote` BEFORE `git clone` to know the SHA, doubles the GitHub API hit, and the SHA might not be reachable yet. Rename is cleaner.

**Alternative considered, REJECTED:** structured JSON-log emitter (`log_step "precheck" "passed"` style). Better data structure but requires modifying every `info`/`ok`/`step` invocation in update.sh — high blast radius. Plain `tee` capture is invisible to existing log calls, so they keep working unchanged. The Phase 33 success criterion ("per-step lines") is satisfied by the existing `step "Foo"` / `info "..."` / `ok "..."` calls, which are already structured-enough.

## File-by-File Plan

| File | Action | Owner | Rationale |
|------|--------|-------|-----------|
| `livos/packages/livinityd/source/modules/system/routes.ts` | **MODIFY** (add 2 routes) | Plan 33-01 | Insert `listUpdateHistory` + `readUpdateLog` adminProcedure handlers near the existing `update`/`updateStatus` pair. Add `path` + `fs` imports if not present. Add `adminProcedure` to import line. |
| `livos/packages/livinityd/source/modules/server/trpc/common.ts` | **MODIFY** (add 2 entries) | Plan 33-01 | Append `'system.listUpdateHistory'` + `'system.readUpdateLog'` to `httpOnlyPaths` array. Comment block explaining Phase 33 OBS-02/OBS-03 reasoning. |
| `livos/packages/livinityd/source/modules/system/routes.unit.test.ts` | **MODIFY** (extend) | Plan 33-01 | Add tests: (a) `system.readUpdateLog({filename: '../etc/passwd'})` → BAD_REQUEST; (b) `system.readUpdateLog({filename: 'evil/path.log'})` → BAD_REQUEST; (c) `system.readUpdateLog({filename: 'subdir.log'})` → BAD_REQUEST (not in regex); (d) `system.readUpdateLog({filename: 'update-2026-04-26T18-24-30Z-abc1234.log'})` → success; (e) `system.listUpdateHistory({})` returns sorted-newest-first with mocked fs; (f) corrupt JSON in dir → skipped, not crashed. |
| `livos/packages/ui/src/routes/settings/_components/past-deploys-table.tsx` | **CREATE** | Plan 33-03 | Past Deploys table component (~80 lines). Uses shadcn Table + Badge. Click row opens UpdateLogViewerDialog. Uses `formatDistanceToNow` from date-fns (already used by `update-notification.tsx`). |
| `livos/packages/ui/src/components/update-log-viewer-dialog.tsx` | **CREATE** | Plan 33-03 | Modal log viewer (~50 lines). Uses shadcn Dialog. Two queries: tail (auto on open) + full (on download click via `trpcClient.system.readUpdateLog.query({full: true})` → Blob → anchor click). |
| `livos/packages/ui/src/routes/settings/_components/settings-content.tsx` | **MODIFY** (3 edits) | Plan 33-03 | (A) Add `import {PastDeploysTable} from './past-deploys-table'`. (B) Append `<PastDeploysTable />` inside `SoftwareUpdateSection()` after `<SoftwareUpdateListRow>`. (C) Add `<MenuItemBadge item={item} />` overlay inside both `MENU_ITEMS.map` blocks (home + detail view); add `relative` class to home view's button. (D) Define `MenuItemBadge` helper component near `useVisibleMenuItems`. |
| `livos/packages/ui/src/routes/settings/mobile/software-update.tsx` | **CONSIDER MODIFY** | Plan 33-03 | Optional: append `<PastDeploysTable />` to the mobile drawer too so mobile users see the same history. NOT REQUIRED by success criteria (UX-04 specifically says "Settings sidebar"). Recommend YES for consistency; defer if any layout issue. |
| `.planning/phases/33-update-observability-surface/artifacts/phase33-update-sh-logging-patch.sh` | **CREATE** | Plan 33-02 | Idempotent SSH-applied patch. Mirrors Phase 32 architecture exactly. Two splices into `/opt/livos/update.sh`: log-tee + trap (top); TO_SHA capture (after git clone). Backup to `/opt/livos/update.sh.pre-phase33`, `bash -n` syntax check, restore on fail. Markers: `# ── Phase 33 OBS-01: log file emission ──`, `# ── Phase 33 OBS-01 prep: capture target SHA for log filename rename ──`. Idempotent `grep -qF` guards. |
| `.planning/phases/33-update-observability-surface/artifacts/tests/log-format.sh` | **CREATE** | Plan 33-02 | Bash test: invoke a stub update.sh containing the spliced trap-block, assert log file lands at expected path with `[PHASE33-SUMMARY]` line, JSON is parseable, status field correct on simulated exit codes 0 and 1. |
| `livos/packages/livinityd/source/modules/system/system.integration.test.ts` | **CONSIDER MODIFY** | Plan 33-01 (optional) | If feasible, add an integration test that creates a temp `update-history/` dir with sample JSON files, calls `listUpdateHistory`, asserts shape. Pure mocking via `vi.mock('node:fs/promises')` is simpler — see unit test row above. |

## Risks & Edge Cases

### R-01: Path traversal in `readUpdateLog`
**Scenario:** Malicious or buggy caller invokes `system.readUpdateLog({filename: '../../etc/shadow'})`.

**Mitigation (chosen):** Three-layer guard documented in Domain Background. The combination of `path.basename` + regex whitelist + resolved-startswith catches all known traversal vectors. `adminProcedure` is the perimeter; even an admin user shouldn't be able to read arbitrary host files via this route.

**Test (chained):** Vitest unit test per attack vector — `'../etc/passwd'`, `'/etc/passwd'`, `'../../foo.log'`, `'..foo.log'`, `'evil/path.log'`, `'subdir/file.log'`, `'.bash_history'` (no `.log`/`.json` extension). All MUST throw `BAD_REQUEST`. The single legitimate case (`'update-<ts>-<sha>.log'`, `'<ts>-success.json'`) passes.

### R-02: Large log files crash the readFile
**Scenario:** A degenerate update produces a 100MB log (e.g., a build error spinning a stack trace loop). `fs.readFile` loads it all into memory; for `tail-only` mode this is wasteful AND `JSON.stringify` of the response could OOM.

**Mitigation:**
- For `full: false` (default tail-500): use `fs.createReadStream` + `readline` interface to read line-by-line, keep a rolling buffer of last 500 lines. Stop at EOF or 50MB read, whichever first. Memory bounded.
- For `full: true` (download): cap at 50MB; if larger, return the first 50MB + a warning marker. (50MB is way more than any sane deploy log; 99th percentile is < 1MB based on Phase 32 deploys.)

**Plan-phase TODO:** decide if the simple `fs.readFile` is good enough for v29 (acceptable risk: Phase 33 ships, observe if any log ever exceeds 10MB; if so, swap to streaming in v30). **Recommend simple readFile for v29** — the streaming complexity isn't justified by current evidence.

### R-03: `/opt/livos/data/update-history/` doesn't exist on dev machines
**Scenario:** A developer runs livinityd locally; there's no `/opt/livos/data/`. `fs.readdir` throws ENOENT, list query crashes, table shows error toast, dev experience suffers.

**Mitigation:** `listUpdateHistory` catches ENOENT explicitly and returns `[]`. `readUpdateLog` catches ENOENT and throws TRPCError NOT_FOUND. Both handled gracefully in the UI (`No deploys yet.` empty state).

### R-04: Browser download via Blob — large files
**Scenario:** Full log is 30MB; `trpcClient.query({full: true})` returns 30MB string; `new Blob([content])` allocates 30MB; browser hangs briefly.

**Mitigation:** Same 50MB cap as R-02. Acceptable for a download use case — user explicitly clicked "Download". If they do this on a 30MB log, a 1-2 second hang is fine. Add a `setDownloading(true)` state to disable the button during the fetch.

**Alternative considered, REJECTED:** Separate Express endpoint at `/api/update-history/:filename/download` with `Content-Disposition: attachment` and stream-from-disk. Pro: no memory copy in livinityd. Con: requires duplicate auth (the Express endpoint can't reuse `adminProcedure`; would need to hand-write JWT/cookie verification). The /logs endpoint at `server/index.ts:1211` does exactly this (uses `verifyProxyToken`), so the precedent exists. **Rejected for v29 because** the security perimeter is doubled (two places to keep in sync) and the data volume doesn't justify it.

### R-05: Concurrent updates produce overlapping logs
**Scenario:** Phase 30 already has a concurrent-update guard (`if (systemStatus === 'updating') throw CONFLICT`, routes.ts line 94). But what if two `bash /opt/livos/update.sh` invocations happen via SSH manually? Both would write to `update-history/` with similar timestamps.

**Mitigation:** ISO timestamp format `YYYY-MM-DDTHH-MM-SSZ` has 1-second resolution. Two simultaneous invocations within the same second would collide. Phase 33 patch script could append `$$` (PID) to disambiguate: `update-${LIVOS_UPDATE_START_ISO_FS}-$$-pending.log`. **Recommend YES** — cheap, makes the script truly safe under all invocation paths.

### R-06: precheck-failed and finalize trap double-write
**Scenario:** Phase 32's `precheck()` writes its own `<ts>-precheck-fail.json` and `exit 1`. Phase 33's `phase33_finalize` EXIT trap then runs and would write a `<ts>-failed.json` too — TWO history rows for the same event.

**Mitigation:** The trap function checks for an existing precheck-fail row matching the start-ISO timestamp; if present, it skips the write and renames the log. Verified in Splice 1 above (the `if ls .../precheck-fail.json` check at top of `phase33_finalize`).

**Edge:** What if two precheck-fail rows have the same prefix? Cannot happen — only THIS update.sh invocation writes the precheck-fail with its `LIVOS_UPDATE_START_ISO_FS`. Different invocations have different timestamps.

### R-07: `useSoftwareUpdate()` mounted on every menu item — performance
**Scenario:** UX-04's `<MenuItemBadge>` calls `useSoftwareUpdate()` per menu item. With ~20 menu items, that's 20 hook invocations per render.

**Mitigation:** `useSoftwareUpdate()` returns a stable React Query result; React Query dedupes identical query keys across all callers in the same component tree. Net cost: 1 actual GitHub API call (or cache hit), 20 hook subscriptions. Acceptable. **However**, even cleaner: lift the hook ONCE in `SettingsContent` and pass the resulting state down via prop. Plan-phase decides ergonomics; both work.

### R-08: Sidebar badge in detail view (not just home view)
**Scenario:** The user clicks "Software Update" in the sidebar; they're now ON the page; the badge is still showing. Per UX-04, "disappears on click/install."

**Mitigation:** The badge is keyed off `useSoftwareUpdate().state` — clicking the menu item does NOT change that state (an update is still available, the user just opened the page). So per the literal data source, the badge SHOULD still appear in the detail-view sidebar. But the success criterion says "disappear on click."

**Lock decision (LOCK):** Treat "click" loosely. The badge is a NOTIFICATION; once the user is on the Software Update page, it's served its purpose. Hide the badge when `activeSection === 'software-update'`:

```tsx
function MenuItemBadge({item, activeSection}: {item: MenuItem; activeSection: SettingsSection}) {
    const {state} = useSoftwareUpdate()
    if (item.id !== 'software-update') return null
    if (activeSection === 'software-update') return null  // user is on the page
    if (state !== 'update-available') return null
    return <span ... />
}
```

The "disappears on install" path is handled automatically: post-install, `useSoftwareUpdate()` refetches (per round 7 hot patch — `refetchOnMount: 'always'`), state becomes `at-latest`, badge gone.

### R-09: Theme support — does `bg-brand` work in both?
**Verified:** YES. The existing `software-update-list-row.tsx` and `mobile/software-update.tsx` both use `bg-brand` / `text-brand` and visually adapt. Tailwind tokens in this repo wrap CSS variables. No special handling needed.

### R-10: Filename in JSON `log_path` field is an absolute path on the SERVER
**Scenario:** JSON's `log_path` is `/opt/livos/data/update-history/update-...log`. The frontend shouldn't pass this absolute path to `readUpdateLog` — the route expects a basename only.

**Mitigation:** PastDeploysTable derives the filename via `path.basename(row.log_path)`. Browser-side, `path.basename` requires the `path-browserify` polyfill, which Vite typically auto-shims. **Recommend** using a manual basename in the UI: `row.log_path?.split('/').pop()` — no dependency, works everywhere.

### R-11: Timezones in display
**Scenario:** Backend writes timestamps as UTC (e.g., `2026-04-26T18:24:30Z`). UI shows them via `formatDistanceToNow` (relative, no TZ issue) and a `title` attribute showing the raw ISO string (still UTC).

**Mitigation:** Add a tooltip showing ALSO the local time: `title={`${row.timestamp} (${new Date(row.timestamp).toLocaleString()})`}`. Cheap, helpful for users in non-UTC timezones.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Backend framework | vitest (livinityd) — already used for `update.unit.test.ts`, `routes.unit.test.ts` |
| Frontend framework | vitest (UI) — already used for `update-notification.unit.test.ts` |
| Backend config | `livos/packages/livinityd/package.json` (vitest inline) |
| Frontend config | `livos/packages/ui/vitest.config.ts` (verify in plan-phase) |
| Quick run command | `pnpm --filter livinityd test:unit -- --run system/` |
| Full suite command | `pnpm --filter livinityd test:unit -- --run && pnpm --filter ui test -- --run` |
| Bash artifact lint | `bash -n .planning/phases/33-update-observability-surface/artifacts/phase33-update-sh-logging-patch.sh` |
| End-to-end (manual) | SSH to Mini PC, apply patch, run `sudo bash /opt/livos/update.sh`, observe log file lands + JSON written + UI table shows new row |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OBS-01 | update.sh writes `update-<ts>-<sha>.log` containing per-step lines + `[PHASE33-SUMMARY]` line | unit (bash) | `bash .planning/phases/33-update-observability-surface/artifacts/tests/log-format.sh` | ❌ Wave 0 |
| OBS-01 | update.sh writes `<ts>-success.json` on exit 0 with `status: "success"` and required fields | unit (bash) | same script, exit-0 case | ❌ Wave 0 |
| OBS-01 | update.sh writes `<ts>-failed.json` on exit non-zero with `status: "failed"` and `reason` field | unit (bash) | same script, exit-1 case | ❌ Wave 0 |
| OBS-01 | Phase 32 precheck-fail does NOT cause Phase 33 trap to ALSO write a failed row | unit (bash) | same script, simulated precheck-fail case | ❌ Wave 0 |
| OBS-02 | `system.listUpdateHistory({limit: 50})` returns array sorted by timestamp desc | unit (vitest) | extends `system.unit.test.ts` with `vi.mock('node:fs/promises')` | ❌ Wave 0 (extend) |
| OBS-02 | listUpdateHistory returns `[]` when dir doesn't exist (ENOENT) | unit (vitest) | same file, ENOENT mock | ❌ Wave 0 |
| OBS-02 | listUpdateHistory skips corrupt JSON entries instead of crashing | unit (vitest) | same file, mocked fs.readFile returning 'invalid json{' | ❌ Wave 0 |
| OBS-02 | UI table renders 50 rows from a mocked listUpdateHistory query | unit (vitest+RTL) | new `past-deploys-table.unit.test.tsx` | ❌ Wave 0 |
| OBS-03 | `system.readUpdateLog({filename: '../etc/passwd'})` throws BAD_REQUEST | unit (vitest) | extends `system.unit.test.ts` | ❌ Wave 0 |
| OBS-03 | `system.readUpdateLog({filename: '/etc/passwd'})` throws BAD_REQUEST | unit (vitest) | same | ❌ Wave 0 |
| OBS-03 | `system.readUpdateLog({filename: 'evil/path.log'})` throws BAD_REQUEST | unit (vitest) | same | ❌ Wave 0 |
| OBS-03 | `system.readUpdateLog({filename: '..hidden.log'})` throws BAD_REQUEST | unit (vitest) | same | ❌ Wave 0 |
| OBS-03 | Valid filename returns tail of last 500 lines + truncated:true when file > 500 lines | unit (vitest) | same, mocked fs.readFile with 1000-line content | ❌ Wave 0 |
| OBS-03 | `full: true` returns entire content + truncated:false | unit (vitest) | same | ❌ Wave 0 |
| OBS-03 | UI Dialog opens, calls readUpdateLog, renders content; Download button calls full-fetch and triggers Blob | unit (vitest+RTL) | new `update-log-viewer-dialog.unit.test.tsx` | ❌ Wave 0 |
| UX-04 | Sidebar shows brand-color dot when `useSoftwareUpdate().state === 'update-available'` AND active section is NOT 'software-update' | unit (vitest+RTL) | extends `settings-content.unit.test.tsx` (or new file if doesn't exist) | ❌ Wave 0 |
| UX-04 | Badge disappears when state becomes `at-latest` | unit (vitest+RTL) | same | ❌ Wave 0 |
| UX-04 | Badge disappears when activeSection === 'software-update' | unit (vitest+RTL) | same | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter livinityd test:unit -- --run system/` (covers backend OBS-02/03 chains); `bash -n` on bash artifacts.
- **Per wave merge:** Full backend suite + UI suite + bash format test.
- **Phase gate:** Manual: SSH-apply phase33 patch on Mini PC + run `sudo bash /opt/livos/update.sh` + assert: (a) log file lands at expected path; (b) JSON row written; (c) UI table renders row in browser; (d) modal opens; (e) download triggers Blob; (f) badge appears when an update is staged + disappears post-install.

### Wave 0 Gaps

- [ ] `.planning/phases/33-update-observability-surface/artifacts/tests/log-format.sh` — bash test for OBS-01 trap output
- [ ] Extend `livos/packages/livinityd/source/modules/system/routes.unit.test.ts` (or `system.unit.test.ts`) with the OBS-02 + OBS-03 backend cases
- [ ] `livos/packages/ui/src/routes/settings/_components/past-deploys-table.unit.test.tsx` — table render + click → modal open assertions
- [ ] `livos/packages/ui/src/components/update-log-viewer-dialog.unit.test.tsx` — dialog open + tail-load + download click
- [ ] `livos/packages/ui/src/routes/settings/_components/menu-item-badge.unit.test.tsx` (or extend settings-content tests) — badge presence/absence per state

### Chains of Evidence

**OBS-01 chain (log file emission):**
```
INPUT:        operator runs `sudo bash /opt/livos/update.sh` on Mini PC
MIDDLEWARE:   Phase 33 trap-block (Splice 1) opens log file at /opt/livos/data/update-history/update-<ts>-pending.log
              tee captures all stdout/stderr from precheck + clone + rsync + install + build + restart
              after `git clone --depth 1` succeeds, LIVOS_UPDATE_TO_SHA captured (Splice 2)
              EXIT trap (phase33_finalize) fires
              renames .pending log → update-<ts>-<7sha>.log
              appends `[PHASE33-SUMMARY] status=success exit_code=0 duration_seconds=N`
              writes <ts>-success.json with status, from_sha, to_sha, duration_ms, log_path
ASSERTION:    file `update-2026-04-27T<HH-MM-SS>Z-<7char>.log` exists
              file last line matches `[PHASE33-SUMMARY] status=success exit_code=0 duration_seconds=\d+`
              file `2026-04-27T<HH-MM-SS>Z-success.json` exists
              JSON parses, has all required fields
              JSON.log_path equals the .log file path
```

**OBS-02 chain (Past Deploys table):**
```
INPUT:        user opens Settings > Software Update
MIDDLEWARE:   PastDeploysTable mounts → trpc.useQuery(listUpdateHistory, {limit: 50})
              tRPC routes via HTTP (httpOnlyPaths) → adminProcedure → fs.readdir on /opt/livos/data/update-history/
              filters .json files → reads each → parses → sorts desc by timestamp → slices to 50
              returns array → React Query caches → table renders
ASSERTION:    table shows up to 50 rows, sorted newest-first
              each row shows short SHA, relative time (with full-ISO tooltip), status badge with right variant, formatted duration
              row click sets openLog state → UpdateLogViewerDialog renders
              empty state ("No deploys yet.") shown when array is []
              error state shown when fetch fails (with error message)
```

**OBS-03 chain (log viewer modal + download + traversal block):**
```
PATH 1 (legitimate read):
INPUT:        user clicks a row with log_path "/opt/livos/data/update-history/update-2026-04-27T10-00-00Z-abc1234.log"
MIDDLEWARE:   PastDeploysTable derives filename via .split('/').pop() → "update-2026-04-27T10-00-00Z-abc1234.log"
              UpdateLogViewerDialog opens; trpc.useQuery(readUpdateLog, {filename, full: false})
              backend: basename check passes, regex passes, resolved-path check passes, fs.readFile reads file
              splits into lines; if > 500, returns last 500 + truncated:true
              UI renders <pre> with content, shows "Showing last 500 of N lines"
              Download click: trpcClient.query(readUpdateLog, {filename, full: true}) → Blob → anchor click → file saved
ASSERTION:    pre tag shows up to 500 lines of monospace log text
              "Showing last 500 of N lines" hint visible when truncated
              Download button click fetches full content and triggers download with the right filename

PATH 2 (traversal attempt — must REJECT):
INPUT:        attacker calls trpcClient.query(readUpdateLog, {filename: '../etc/passwd'})
MIDDLEWARE:   adminProcedure passes (attacker is admin)
              path.basename('../etc/passwd') === 'passwd', NOT === filename → throws BAD_REQUEST
ASSERTION:    response is BAD_REQUEST with message 'Invalid filename'
              fs.readFile is NEVER called (assert via vi.spyOn that fs.readFile is not invoked)
              repeat for: '/etc/passwd', '..foo.log', 'foo/bar.log', '.bashrc', 'log\\with\\backslash'
```

**UX-04 chain (sidebar badge):**
```
INPUT:        useSoftwareUpdate() returns state='update-available'
MIDDLEWARE:   MenuItemBadge mounted per menu item; for item.id === 'software-update' AND activeSection !== 'software-update', renders <span class='... bg-brand' />
ASSERTION:    DOM has <span aria-label='Update available' class='... bg-brand'> next to the Software Update menu item
              When state changes to 'at-latest' (post-install): re-render → badge gone
              When activeSection becomes 'software-update' (user clicks): re-render → badge gone
              In dark theme: bg-brand resolves to dark variant (verified visually — no JS test needed; Tailwind tokens are CSS-driven)
```

## Architectural Responsibility Map

(See dedicated section near top — included here for cross-reference per template requirement.)

| Capability | Tier | Rationale |
|------------|------|-----------|
| `update.sh` log + JSON emission | bash (root) | Same tier as the work being logged |
| Read-side fs queries | livinityd tRPC (`adminProcedure`) | Filesystem access + RBAC perimeter |
| HTTP routing for queries | httpOnlyPaths array | Avoids WS-hang post-update |
| Path traversal guard | livinityd (3-layer check) | Single chokepoint for all log access |
| Past Deploys table | UI / `_components/past-deploys-table.tsx` | Pure presentation, no backend logic |
| Log viewer modal | UI / `components/update-log-viewer-dialog.tsx` | shadcn Dialog reuse |
| Full-log download | UI Blob from second tRPC fetch | Avoid duplicate auth perimeter |
| Sidebar badge | UI / `MenuItemBadge` in settings-content.tsx | Pure derivation from `useSoftwareUpdate` state |

## Open Questions

### O-01 (LOCKED): JSON `log_path` is absolute server path; UI strips to basename
- **Decision:** UI uses `row.log_path?.split('/').pop()` to derive the filename for `readUpdateLog`. No new dependency. Backend's `log_path` stays absolute (matches Phase 32 schema).

### O-02 (LOCKED): Filename PID disambiguation
- **Decision:** Include `$$` (PID) in the .pending log filename to disambiguate same-second concurrent invocations: `update-${ISO_FS}-$$-pending.log`. The rename strips the PID once SHA is known: `update-${ISO_FS}-${SHA:0:7}.log`. JSON filename gets the SHA-form too: `${ISO_FS}-${status}.json` (no PID needed — JSON is keyed by status, but if BOTH a success.json and a failed.json could conflict, prepend a `-$$`). For Phase 33 the realistic concurrent case is one host = one update.sh; Phase 30's concurrent-update guard prevents this from the UI. The PID inclusion is belt-and-braces.

### O-03 (LOCKED): Log viewer modal — Dialog vs ImmersiveDialog
- **Decision:** shadcn Dialog (NOT ImmersiveDialog). Settings context preserved; max-w-[900px] + DialogScrollableContent fits the 500-line tail comfortably. Mobile uses shadcn Drawer (precedent: software-update Drawer pattern).

### O-04 (LOCKED): Pagination beyond 50 deploys
- **Decision:** Defer per CONTEXT. Stable shape: route accepts `{limit: number}` defaulting to 50, max 200. If pagination is added later, add `{cursor, limit}` and return `{rows, nextCursor}` — backwards-incompatible breaking change but the scope is narrow.

### O-05 (LOCKED): Sidebar badge dismissal logic
- **Decision:** Badge derives purely from `useSoftwareUpdate().state === 'update-available' && activeSection !== 'software-update'`. No localStorage dismissal (different from `UpdateNotification` which DOES persist). The badge serves a different role: it's a persistent surface marker, not a one-time toast. Dismissal would re-create the same "user forgot about update" problem.

### O-06 (LOCKED): Backend reads log via `fs.readFile` vs streaming
- **Decision:** `fs.readFile` for v29. Cap at 50MB by checking `fs.stat` first; reject if larger with TRPCError PAYLOAD_TOO_LARGE. Re-evaluate in v30 if any deploy exceeds 10MB.

### O-07 (LOCKED): Mobile drawer also gets PastDeploysTable?
- **Decision:** YES, append to `mobile/software-update.tsx` Drawer. Layout-wise, the Drawer is full-height and the table is scrollable inside DialogScrollableContent. Cheap to include; consistent UX. Add as a SUB-task in Plan 33-03; if any layout issue, drop the mobile addition (it's NOT in UX-04's success criteria).

### O-08: How to surface a precheck-failed log when the .pending log was renamed
- **What we know:** Phase 32 writes `<ts>-precheck-fail.json` WITHOUT a `log_path` field. Phase 33's trap detects this and renames the .pending log to `<ts>-precheck-fail.log`. But the existing JSON has no `log_path`.
- **What's unclear:** Should the trap also UPDATE the precheck-fail.json to add the `log_path`?
- **Recommendation (LOCK):** YES — read the precheck-fail.json, append `"log_path": "..."`, rewrite. Best-effort (`|| true`), so failing to update doesn't crash the trap. Improves OBS-03's reach over precheck-failed rows. Plan-phase implements this in `phase33_finalize`.

### O-09: Should we also make a small badge appear in the bottom UpdateNotification card OR remove the card entirely?
- **What we know:** Phase 30 already ships `UpdateNotification` (bottom-right). Now there's ALSO a sidebar badge.
- **What's unclear:** Is the bottom card redundant?
- **Recommendation:** KEEP both. They serve different purposes — badge is "noticed in periphery", card is "actionable". Coexistence is fine; the user can dismiss the card and still see the badge. Out of Phase 33 scope; mention only in passing.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node:fs/promises` | listUpdateHistory + readUpdateLog | ✓ Node built-in | per Node version | none — Node built-in |
| `node:path` | filename validation | ✓ Node built-in | per Node version | none |
| `date-fns` | UI relative-time formatting | ✓ already used in update-notification.tsx | latest | Manual `Date.now()` math |
| shadcn `Dialog`, `Table`, `Badge` | Log viewer + Past Deploys table | ✓ all present (verified via Glob) | per shadcn install | none — already used |
| `path-browserify` (or shim) | UI basename of log_path | ✗ NOT used | — | `.split('/').pop()` (chosen — no dep needed) |
| Mini PC SSH for patch apply | OBS-01 update.sh patch | ✓ verified by Phase 32 SSH-apply | OpenSSH | none |
| `bash -n` | patch script syntax check | ✓ POSIX standard | system bash | none |
| `tee` | log file writes | ✓ POSIX standard | system coreutils | none |
| `date -u +%s%3N` | millisecond resolution | ✓ verified used in Phase 32 (livos-rollback.sh line 40) | GNU date | echo (already-fallback in Phase 32 pattern) |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None blocking — `path-browserify` decision uses native `.split('/')` instead.

## Sources

### Primary (HIGH confidence — direct file reads)
- `livos/packages/livinityd/source/modules/system/routes.ts` — current system tRPC router; `system.update`, `system.checkUpdate`, `system.logs` patterns
- `livos/packages/livinityd/source/modules/system/update.ts` — `performUpdate` execa wrapper + `getLatestRelease` for `useSoftwareUpdate` data flow
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — `httpOnlyPaths` array (verified location, contents, comment style)
- `livos/packages/livinityd/source/modules/server/trpc/trpc.ts` — `adminProcedure` definition (line 31)
- `livos/packages/livinityd/source/modules/server/trpc/is-authenticated.ts` — legacy single-user-as-admin behavior (line 75-76)
- `livos/packages/ui/src/trpc/trpc.ts` — `splitLink` routing condition (line 56-60)
- `livos/packages/ui/src/hooks/use-software-update.ts` — Phase 30 hook with `state` enum; `at-latest` / `update-available` / `checking` / `initial`
- `livos/packages/ui/src/components/update-notification.tsx` — Phase 30 SHA-keyed dismissal precedent
- `livos/packages/ui/src/routes/settings/_components/software-update-list-row.tsx` — `bg-brand` / `text-brand` token use
- `livos/packages/ui/src/routes/settings/_components/settings-content.tsx` — Settings shell architecture; `MENU_ITEMS`, `SoftwareUpdateSection`, sidebar render blocks
- `livos/packages/ui/src/routes/settings/index.tsx` — confirms no `software-update/page.tsx` route
- `livos/packages/ui/src/routes/settings/software-update-confirm.tsx` — shadcn Dialog reuse precedent
- `livos/packages/ui/src/routes/settings/mobile/software-update.tsx` — Mobile Drawer pattern + `bg-brand` use
- `livos/packages/ui/src/routes/settings/troubleshoot/livos.tsx` — log-viewer-on-page precedent (uses `system.logs` + `useSystemLogs`)
- `livos/packages/ui/src/routes/settings/_components/list-row.tsx` — ListRow component used by SoftwareUpdateListRow
- `livos/packages/ui/src/shadcn-components/ui/badge.tsx` — Badge variants (`default`, `primary`, `destructive`, `outline`)
- `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/livos-rollback.sh` — JSON write pattern (lines 39-46, 237-249)
- `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/phase32-systemd-rollback-patch.sh` — patch-script architectural template
- `.planning/phases/32-pre-update-sanity-auto-rollback/32-RESEARCH.md` — Phase 32 schema + idempotency conventions
- `update.sh` (repo) and `.claude/tmp/phase31-investigation/update.sh.minipc` — current update.sh on Mini PC, splice anchor verification
- `livos/packages/livinityd/source/modules/server/index.ts` lines 1211-1228 — Express log download precedent (rejected as model — see R-04)
- `livos/packages/livinityd/source/modules/system/update.unit.test.ts` — vitest + execa-mock + fs-mock pattern to mirror
- `.planning/REQUIREMENTS.md` — OBS-01/02/03 + UX-04 success criteria
- `.planning/phases/33-update-observability-surface/33-CONTEXT.md` — phase boundary, locked decisions, deferred ideas

### Secondary (MEDIUM confidence — corroborated patterns)
- date-fns `formatDistanceToNow` + `parseISO` — used in `update-notification.tsx` (line 4, 23-29) — confirmed safe pattern
- React Query staleTime / refetchOnWindowFocus semantics — Phase 30 round 7 hot patch comments

### Tertiary (LOW confidence — none required, all critical claims verified above)

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` file present in the repo (verified via Glob). No project-level constraints to enforce beyond inherited Phase 30/31/32 conventions.

No `.claude/skills/` directory present (verified via Glob). No project skill rules to apply.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | shadcn `Table` component (`livos/packages/ui/src/shadcn-components/ui/table.tsx`) exposes the standard `Table`/`TableBody`/`TableCell`/`TableHead`/`TableHeader`/`TableRow` exports. Verified file exists; not opened. | PastDeploysTable | If exports differ, adjust import names in plan-phase. Cosmetic risk only. |
| A2 | The `Drawer` and `DialogScrollableContent` components used for the mobile fallback have the same shape as the desktop Dialog. Verified usage in `mobile/software-update.tsx`. | UpdateLogViewerDialog mobile path | If Drawer doesn't have a footer slot, adjust to use a fixed-position button. Low risk. |
| A3 | `trpcClient.system.readUpdateLog.query({...})` (vanilla client, NOT React Query) works with the same args as the React-query version. tRPC standard. | UpdateLogViewerDialog download | If signature differs, use the React Query result.refetch() pattern. Low risk. |
| A4 | `useSoftwareUpdate()` works the same when called multiple times in one render tree (React Query dedupes). Standard React Query behavior. | UX-04 MenuItemBadge | If duplicates cause perf issues, lift hook in SettingsContent and pass via prop. |
| A5 | Phase 32's precheck-fail JSON is the ONLY thing written before the trap fires; no other Phase 32 path writes a JSON. Verified by reading `phase32-systemd-rollback-patch.sh` — only precheck() writes precheck-fail.json. The rollback path is in `livos-rollback.sh`, NOT in `update.sh`. | R-06 / O-08 | If wrong, the trap could double-write a row. Mitigated by the existing `if ls .../precheck-fail.json` guard. |
| A6 | `path.basename` in Node.js correctly normalizes Windows paths (`evil\\path.log` → `path.log`). Standard Node behavior. | Path traversal layer 1 | If wrong, regex layer 2 catches the backslash. Defense-in-depth holds. |
| A7 | `/opt/livos/data/update-history/` files are world-readable (mode 644) per Phase 32. livinityd can read them as livos OR root user. Verified Phase 32 uses `chmod 644`. | Backend read | If livinityd runs as a user without read access, plan-phase needs `chmod` or `chgrp livos` adjustment. |
| A8 | The Mini PC's livinityd process has access to `/opt/livos/data/update-history/`. Verified MEMORY: livinityd runs from `/opt/livos/packages/livinityd/source` and `/opt/livos/.env` confirms working dir. | Backend read | If wrong, livinityd needs read perms via `chmod` / `chgrp livos`. |

**Eight assumptions, all LOW risk.** Each has a clear fallback if wrong; none would invalidate the architectural design.

## RESEARCH COMPLETE
