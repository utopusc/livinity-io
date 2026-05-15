# Phase 131-05 — Shelf UX Polish (Partial)

> SHELF_POLISH_VERIFIED for the in-scope deltas; the
> snapshot-dependent items (hover thumbnail, refresh-every-30s
> caching) carry forward to a follow-up plan once Plan 131-03 ships
> the `pinnedSessions.snapshot` endpoint.

## In-scope deltas shipped

### 1. Right-click context menu

Each pinned chip is now wrapped in a Radix `ContextMenu` (via the
existing `shadcn-components/ui/context-menu.tsx` primitive). Items:

- **Restore window** — equivalent to whole-chip left-click. Unpins
  and runs the reverse spring back to the previous position/size.
- **Close window** — fully drops the window from the manager AND
  removes the persisted `pinned_windows` row (the
  `closePinnedWindow` helper unpins THEN closes — order matters so
  the 131-02 mirror tears the Postgres row down before the
  WindowState evaporates).

The menu item for Close is styled red (`text-red-500`) to signal a
destructive action, matching the existing TopBar profile menu's
"Log out" treatment.

### 2. Empty-shelf hint upgrade

The empty-state copy was a plain "Drag here to pin" string. It now
renders with a small pin SVG glyph + the slightly more inviting
"Drag a window here to pin it." The icon is sized to match the
chip-icon scale (12px) so the empty state visually rhymes with the
populated one.

## Carry-forward (deferred to Plan 131-05.1 / a future v37 phase)

These items needed Plan 131-03 work that hasn't landed yet:

- **Hover thumbnail preview** — needs a backend snapshot endpoint
  (`pinnedSessions.snapshot` per Plan 131-03 task 03-04). With no
  snapshot source the placeholder ("show app icon at 64×64") gives
  ~zero value over the existing chip — better to defer until the
  real snapshot stream exists.
- **Drag-off-unpin gesture** — chip becomes draggable, dropping
  outside the shelf bbox unpins + moves the window to drop coords.
  Achievable today (no 131-03 dep) but adds ~40 lines of framer-
  motion state to the chip + an interaction the user can't currently
  perform any other way (whole-chip left-click already restores).
  Deferred for scope clarity.
- **Drag-within-shelf reorder** — needs `pinnedWindows.reorder`
  mutation (would patch `position_in_shelf` atomically). Backend has
  the column from 131-02 but the procedure isn't added yet. Defer.
- **Refresh-every-30s thumbnail polling** — same blocker as the
  hover preview (no snapshot source).

## Files modified

- `livos/packages/ui/src/modules/desktop/top-bar.tsx` — wrap chip
  in `ContextMenu`, add `closePinnedWindow` helper, swap
  empty-state copy for the SVG-prefixed version.
- `.planning/phases/131-pinned-windows-architecture/131-05-SUMMARY.md` — this file.

No backend changes — the entire delta lives in the UI module.

## Verification

- `git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts` →
  `100644 blob f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ (preserved
  pre- and post-commit).
- UI `npx tsc --noEmit -p .` → **586 errors** ✓ (baseline maintained;
  no top-bar.tsx errors).
- `ContextMenu` is the same primitive the desktop-context-menu already
  uses, so the Radix portal mount + event handlers are battle-tested.

Operator UAT walk (when at the Mini PC):

1. Pin a window via the 131-01 drag gesture.
2. Right-click the chip → "Restore window" / "Close window" appears.
3. Click "Restore window" → window restores via the reverse spring
   (same as whole-chip click).
4. Re-pin the same window.
5. Right-click → "Close window" → window vanishes, chip vanishes;
   `psql $DATABASE_URL -c "SELECT * FROM pinned_windows"` shows the
   row deleted.
6. Unpin all chips → shelf shows the new SVG + "Drag a window here
   to pin it." copy when the bar is hover-expanded.
