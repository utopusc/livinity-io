---
mode: quick
type: hot-patch
ordered: true
files_modified:
  - livos/packages/ui/src/routes/docker/resources/container-create-form.tsx
  - livos/packages/ui/src/routes/server-control/index.tsx
deploy_side:
  - /opt/livos/update.sh (Mini PC, via SSH — NOT in repo)
autonomous: true
---

<objective>
v28.0 hot-patch bundle: 5 ordered, atomic fixes (each = 1 commit, except deploy-side
SSH ops which produce no commit) plus a 6th integration verification task. The user
has already done root-cause analysis — every fix has a known file and known change.

Purpose: Restore visual fidelity (sidebar bg, opaque create form), surface a
container-detail row click, declutter the actions cell into a dropdown, and fix two
update.sh deploy-side bugs (tailwind config sync omits .ts extensions, memory
package never gets built).

Output: 5 fixes applied (3 in repo, 2 deploy-side), pushed to origin/master,
redeployed to Mini PC, browser-verified at https://bruce.livinity.io.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
Mini PC SSH:
```
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68
```

Browser verification: Chrome DevTools MCP at https://bruce.livinity.io

Tasks 1 and 5 modify `/opt/livos/update.sh` directly on the Mini PC via SSH +
`sudo sed -i` (or equivalent) — the repo has no copy of update.sh. These tasks
produce NO git commits.

Tasks 2, 3, 4 are repo file edits — each gets its own commit.

Task 6 is integration: local build, push, redeploy, browser verify.

Confirmed on disk:
- `bg-surface-base` appears at lines 175 and 361 of container-create-form.tsx
- `ContainerDetailSheet` is already imported in server-control/index.tsx (line 66)
- `DropdownMenu` is NOT yet imported in server-control/index.tsx — Fix 3 must add it

@livos/packages/ui/src/routes/docker/resources/container-create-form.tsx
@livos/packages/ui/src/routes/server-control/index.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix update.sh tailwind config sync (deploy-side, Mini PC)</name>
  <files>/opt/livos/update.sh (Mini PC only — NOT in repo)</files>
  <action>
    SSH into Mini PC:
    ```
    ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68
    ```

    Locate the offending line (~line 83):
    ```
    grep -n "tailwind.config" /opt/livos/update.sh
    ```

    Current line:
    ```
    for f in vite.config.ts tailwind.config.js postcss.config.js tsconfig.json tsconfig.app.json tsconfig.node.json index.html components.json; do
    ```

    Replace with:
    ```
    for f in vite.config.ts tailwind.config.ts tailwind.config.js postcss.config.ts postcss.config.js tsconfig.json tsconfig.app.json tsconfig.node.json index.html components.json; do
    ```

    Apply via sed (escape carefully — note the dots in filenames are matched literally
    by sed, but using `[.]` makes it explicit). Suggested command:
    ```
    sudo sed -i 's|tailwind\.config\.js postcss\.config\.js|tailwind.config.ts tailwind.config.js postcss.config.ts postcss.config.js|' /opt/livos/update.sh
    ```

    NO repo file change. NO git commit.
  </action>
  <verify>
    <automated>ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68 "grep -n 'tailwind.config' /opt/livos/update.sh"</automated>
    Expect output to show BOTH `tailwind.config.ts` AND `tailwind.config.js` on the
    matching for-loop line, AND BOTH `postcss.config.ts` AND `postcss.config.js`.
  </verify>
  <done>
    `/opt/livos/update.sh` for-loop includes all four extensions (.ts and .js for both
    tailwind and postcss configs). Next `update.sh` run will rsync all four into the
    deployed UI source tree.
  </done>
</task>

<task type="auto">
  <name>Task 2: bg-surface-base → bg-white in container-create-form.tsx</name>
  <files>livos/packages/ui/src/routes/docker/resources/container-create-form.tsx</files>
  <action>
    Edit `livos/packages/ui/src/routes/docker/resources/container-create-form.tsx`.

    Two occurrences to replace:
    - Line 175: `<div className='absolute inset-0 z-50 flex flex-col items-center justify-center bg-surface-base'>`
                → change `bg-surface-base` to `bg-white`
    - Line 361: `<div className='absolute inset-0 z-50 flex flex-col bg-surface-base'>`
                → change `bg-surface-base` to `bg-white`

    Reason: `bg-surface-base` resolves to `rgba(0,0,0,0.03)` — a tint, not a base
    color. As a full form background it makes the absolutely-positioned overlay
    transparent, leaking the underlying app behind the create form.

    Use Edit tool for each replacement (two separate Edit calls — the surrounding
    classNames at the two lines differ slightly, so each is uniquely identified).

    Commit (single):
    ```
    git add livos/packages/ui/src/routes/docker/resources/container-create-form.tsx
    git commit -m "$(cat <<'EOF'
fix(ui): make container-create-form opaque (bg-white) instead of bg-surface-base tint

bg-surface-base = rgba(0,0,0,0.03), a tint not a full background. Using it on the
absolute-positioned form overlay made the form transparent, leaking the app
content behind it. Switch both occurrences (loading state at line 175, form body
at line 361) to bg-white for an opaque surface.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
    ```
  </action>
  <verify>
    <automated>cd livos &amp;&amp; grep -n "bg-surface-base" packages/ui/src/routes/docker/resources/container-create-form.tsx</automated>
    Expect ZERO matches in this file. Browser-side verification deferred to Task 6.
  </verify>
  <done>
    File no longer contains `bg-surface-base`. Single commit landed with the
    standard project commit format.
  </done>
</task>

<task type="auto">
  <name>Task 3: Container actions overflow → DropdownMenu in server-control</name>
  <files>livos/packages/ui/src/routes/server-control/index.tsx</files>
  <action>
    Edit `livos/packages/ui/src/routes/server-control/index.tsx`, ContainersTab
    section.

    Currently the container row Actions cell renders 8 inline icon buttons.
    Refactor:
    - KEEP inline (these are the high-frequency actions): Stop, Restart, Remove
    - MOVE into a `…` overflow dropdown: Edit, Duplicate, Rename, Pause, Kill

    Implementation steps:

    1. Add imports near existing UI imports:
       ```ts
       import {IconDotsVertical} from '@tabler/icons-react'
       import {
         DropdownMenu,
         DropdownMenuTrigger,
         DropdownMenuContent,
         DropdownMenuItem,
       } from '@/shadcn-components/ui/dropdown-menu'
       ```
       (Verify the path matches the project's shadcn alias by `grep -n "shadcn-components/ui" livos/packages/ui/src/routes/server-control/index.tsx` first; align if the file already uses a different alias like `@/components/ui`.)

    2. In the Actions cell of each container row, replace the 5 less-frequent
       inline IconButtons with a single trigger + dropdown:
       ```tsx
       <DropdownMenu>
         <DropdownMenuTrigger asChild>
           <button
             type='button'
             className='inline-flex h-8 w-8 items-center justify-center rounded hover:bg-muted'
             onClick={(e) => e.stopPropagation()}
             aria-label='More actions'
           >
             <IconDotsVertical className='h-4 w-4' />
           </button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align='end' onClick={(e) => e.stopPropagation()}>
           <DropdownMenuItem onSelect={() => handleEdit(container)}>Edit</DropdownMenuItem>
           <DropdownMenuItem onSelect={() => handleDuplicate(container)}>Duplicate</DropdownMenuItem>
           <DropdownMenuItem onSelect={() => handleRename(container)}>Rename</DropdownMenuItem>
           <DropdownMenuItem onSelect={() => handlePause(container)}>Pause</DropdownMenuItem>
           <DropdownMenuItem onSelect={() => handleKill(container)}>Kill</DropdownMenuItem>
         </DropdownMenuContent>
       </DropdownMenu>
       ```
       (Use the actual handler names already in the file — locate them by reading
       the existing button onClick props near the Actions cell and reusing them
       verbatim.)

    3. The 3 inline buttons (Stop / Restart / Remove) stay as-is, but each one
       MUST gain `onClick={(e) => { e.stopPropagation(); existingHandler() }}` so
       they don't bubble up and trigger the row click that Task 4 will add.
       (Even though Task 4 hasn't run yet, doing this now keeps the commit clean
       and avoids touching the same lines twice.)

    Commit (single):
    ```
    git add livos/packages/ui/src/routes/server-control/index.tsx
    git commit -m "$(cat <<'EOF'
fix(ui): collapse container row actions into overflow dropdown

ContainersTab rendered 8 inline icon buttons per row, dominating horizontal
space. Keep the 3 high-frequency actions inline (Stop, Restart, Remove); move
Edit, Duplicate, Rename, Pause, Kill into a … (IconDotsVertical) shadcn
DropdownMenu. All button onClicks now stopPropagation() to keep row-level
handlers (Task 4) from firing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
    ```
  </action>
  <verify>
    <automated>cd livos &amp;&amp; grep -n "DropdownMenu\|IconDotsVertical" packages/ui/src/routes/server-control/index.tsx | head -10</automated>
    Expect imports for `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`,
    `DropdownMenuItem`, and `IconDotsVertical` to be present, plus at least one
    `<DropdownMenuTrigger>` usage in the JSX.
  </verify>
  <done>
    Server Management container rows render 3 inline action buttons + a `…`
    dropdown containing Edit/Duplicate/Rename/Pause/Kill. All buttons (inline +
    dropdown trigger + DropdownMenuContent) call `e.stopPropagation()`. Commit
    landed.
  </done>
</task>

<task type="auto">
  <name>Task 4: Container row click → ContainerDetailSheet</name>
  <files>livos/packages/ui/src/routes/server-control/index.tsx</files>
  <action>
    Same file as Task 3, ContainersTab section. `ContainerDetailSheet` is already
    imported (line 66) and already used near line 4779 — confirm it's wired to
    open via a state setter (search for the state variable controlling it; likely
    something like `selectedContainer`/`setSelectedContainer` or a dedicated
    `containerDetailOpen` flag).

    Steps:

    1. Locate the TableRow (or equivalent row element) for each container in
       ContainersTab. Add:
       ```tsx
       <TableRow
         key={container.id}
         className='cursor-pointer hover:bg-muted/50'
         onClick={() => setSelectedContainer(container)}  // or equivalent state setter
       >
       ```
       (Use the actual state setter name found in the file — read the existing
       ContainerDetailSheet props at ~line 4779 to identify it.)

    2. The checkbox cell (the row's selection checkbox, if present) MUST gain
       `onClick={(e) => e.stopPropagation()}` on its wrapping `<TableCell>` (or
       on the checkbox itself) to prevent toggling selection from also firing
       the row click.

    3. Verify Task 3's stopPropagation is in place on all action buttons. If any
       button was missed, fix it now.

    4. Confirm ContainerDetailSheet's `open` / `onOpenChange` props (or
       equivalent) correctly read from / clear the same state variable being
       set by row click.

    Commit (single):
    ```
    git add livos/packages/ui/src/routes/server-control/index.tsx
    git commit -m "$(cat <<'EOF'
feat(ui): open ContainerDetailSheet on container row click

Container rows in Server Management Containers tab are now clickable surfaces
(cursor-pointer + onClick) that open the existing ContainerDetailSheet.
Selection checkbox and all action buttons stopPropagation() so they don't
trigger the row click.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
    ```
  </action>
  <verify>
    <automated>cd livos &amp;&amp; grep -n "cursor-pointer\|setSelectedContainer\|onClick" packages/ui/src/routes/server-control/index.tsx | grep -i "TableRow\|container" | head -10</automated>
    Expect at least one TableRow (or equivalent) with `cursor-pointer` and a
    container-state-setting onClick. Browser-side click test deferred to Task 6.
  </verify>
  <done>
    Container row is clickable, opens ContainerDetailSheet, and inner controls
    don't bubble. Commit landed.
  </done>
</task>

<task type="auto">
  <name>Task 5: Add memory build step to update.sh (deploy-side, Mini PC)</name>
  <files>/opt/livos/update.sh (Mini PC only — NOT in repo)</files>
  <action>
    SSH into Mini PC:
    ```
    ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68
    ```

    Inspect the current build sequence to understand the pattern:
    ```
    grep -n -A2 "Building Nexus\|nexus.*build\|packages/core\|packages/worker\|packages/mcp-server" /opt/livos/update.sh
    ```

    Identify the existing core/worker/mcp-server build invocations. They likely
    follow a pattern such as:
    ```
    cd /opt/nexus/packages/core && npm run build
    cd /opt/nexus/packages/worker && npm run build
    cd /opt/nexus/packages/mcp-server && npm run build
    ```

    Add an analogous line for memory directly after `mcp-server` (or at the end
    of the nexus build block — preserve whatever pattern is already in use:
    if the file uses `tsc -p` directly, mirror that; if it uses `npm run build`,
    use that):
    ```
    cd /opt/nexus/packages/memory && npm run build
    ```

    Apply via `sudo` editor (vi/nano) OR a `sudo sed`/`awk` insertion if the
    surrounding context is uniquely identifiable. Recommended (safer): SSH and
    use `sudo nano /opt/livos/update.sh` to add the line in the correct spot.

    NO repo file change. NO git commit.
  </action>
  <verify>
    <automated>ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68 "grep -n 'packages/memory' /opt/livos/update.sh"</automated>
    Expect a line referencing `/opt/nexus/packages/memory` and `npm run build`
    (or whatever build invocation pattern matches the existing core/worker
    lines). Real validation comes in Task 6 after running update.sh.
  </verify>
  <done>
    `/opt/livos/update.sh` includes a memory build step. Next `update.sh` run
    will compile `/opt/nexus/packages/memory/dist/index.js`, allowing
    `liv-memory.service` to start cleanly.
  </done>
</task>

<task type="auto">
  <name>Task 6: Integration — local build, push, redeploy, browser verify</name>
  <files>(verification only — no files modified)</files>
  <action>
    1. Local build verification (catches type errors / class name typos before
       push):
       ```
       cd livos
       pnpm --filter @livos/config build
       pnpm --filter ui build
       ```
       Both must exit 0. If either fails, fix the underlying issue, amend the
       relevant commit (Task 2/3/4), and re-run.

    2. Push commits from Tasks 2, 3, 4:
       ```
       git push origin master
       ```
       (Tasks 1 and 5 produce no commits — they are deploy-side SSH ops.)

    3. Redeploy on Mini PC:
       ```
       ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68 "sudo bash /opt/livos/update.sh"
       ```
       Watch output for errors. The new tailwind/postcss `.ts` configs should
       now rsync (Fix 1), and the memory package should build (Fix 5).

    4. Verify liv-memory.service comes up:
       ```
       ssh ... "systemctl is-active liv-memory"
       ```
       Expect: `active`

    5. Browser verification via Chrome DevTools MCP at https://bruce.livinity.io
       (browserUrl http://127.0.0.1:9223 if using local Chrome with remote
       debugging; otherwise navigate via the MCP):
       - Reload page with `ignoreCache: true`
       - Open Docker app → inspect sidebar `<aside>` computed background-color.
         All three of R, G, B must be > 200 (light gray, not transparent
         leak-through).
       - Open Server Management → Containers tab → click Edit on a row → form
         must be opaque white (`rgb(255, 255, 255)`); no underlying app content
         visible behind it.
       - In Containers tab, click a row OUTSIDE any button/checkbox →
         ContainerDetailSheet must open.
       - Click an action button (e.g. Stop) → it must trigger the action WITHOUT
         opening the detail sheet (stopPropagation working).
       - Click the `…` overflow → dropdown opens with Edit/Duplicate/Rename/
         Pause/Kill; clicking an item triggers its handler without opening the
         detail sheet.

    6. Final docs commit summarising the hot-patch (single commit at the end):
       ```
       git add .planning/quick/260425-sfg-v28-0-hot-patch-bundle-tailwind-sync-bg-/
       git commit -m "$(cat <<'EOF'
docs(quick): record v28.0 hot-patch bundle plan and verification

Five-fix bundle: update.sh tailwind .ts sync (Mini PC), container-create-form
opaque bg-white, container row actions dropdown, container row click opens
detail sheet, update.sh memory build step. All deploy-side fixes applied via
SSH; repo fixes pushed to origin/master and redeployed. Browser-verified at
https://bruce.livinity.io. liv-memory.service now active.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
       git push origin master
       ```
  </action>
  <verify>
    <automated>cd livos &amp;&amp; pnpm --filter ui build &gt; /dev/null 2&gt;&amp;1 &amp;&amp; echo BUILD_OK</automated>
    Expect `BUILD_OK`. Then manual checklist above (browser + systemctl) all
    green.
  </verify>
  <done>
    - `pnpm --filter ui build` exits 0 locally
    - `git push` succeeds
    - `sudo bash /opt/livos/update.sh` completes without errors on Mini PC
    - `systemctl is-active liv-memory` returns `active`
    - Browser: sidebar bg light gray, create-form opaque, row click opens detail
      sheet, action buttons don't bubble, dropdown works
    - Final docs commit pushed
  </done>
</task>

</tasks>

<verification>
After Task 6:
- 4 commits on origin/master (Tasks 2, 3, 4 + docs from Task 6)
- 0 repo changes from Tasks 1 and 5 (they are deploy-side only)
- Mini PC `/opt/livos/update.sh` contains both `.ts` and `.js` tailwind/postcss
  filenames AND a memory build step
- `liv-memory.service` is `active` on Mini PC
- All 5 user-facing behaviors confirmed in browser at https://bruce.livinity.io
</verification>

<success_criteria>
- All 6 tasks pass their automated verify command
- Browser checklist in Task 6 fully green
- `liv-memory.service` running clean (no restart loop)
- Container Management UX: 3 inline buttons + overflow dropdown, row click
  opens detail sheet, action clicks don't bubble
- Container create form is fully opaque (no leak-through)
- Docker sidebar background renders correctly (proves tailwind .ts config now
  rsyncs to deployment)
</success_criteria>

<output>
On completion, this plan file plus the 4 commits constitute the record.
No SUMMARY.md required (mode: quick).
</output>
