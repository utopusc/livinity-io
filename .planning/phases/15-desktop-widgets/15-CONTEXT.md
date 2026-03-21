# Phase 15: Desktop Widgets - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a desktop widget system to LivOS. Users can add, drag, and remove widgets on the desktop grid alongside existing app icons and folders. Widgets display real-time information (clock, system stats) or interactive content (notes). Right-click context menu triggers a widget picker dialog.

</domain>

<decisions>
## Implementation Decisions

### Widget Sizes & Grid
- **iOS/iPadOS-style sizes:** Small (2x2), Medium (4x2), Large (4x4) measured in grid cells
- **Same CSS grid** as app icons — widgets use `gridColumn: span N` / `gridRow: span N`
- **Each widget type has a fixed size** — no user-resizable widgets (Clock is always 2x2, etc.)
- **Only empty cells** — widgets can only be placed where all required cells are unoccupied; no auto-push of existing icons
- **Swap not applicable** for multi-cell widgets — drop is rejected if any target cell is occupied
- **DnD uses same system** — `@dnd-kit/core` with `useDraggable`, cell-from-point calculation accounts for span

### Widget Catalog (V1)
- **Clock & Date (2x2):** Digital or analog mode, switchable via context menu. Digital: large time + date below. Analog: round face with hands animation.
- **System Info Compact (2x2):** CPU + RAM + Disk as horizontal progress bars with percentages. 1s polling via existing `useSystemMemory`/`useCpu` hooks.
- **System Info Detailed (4x2):** CPU + RAM + Disk as circular progress indicators + temperature. Same polling hooks.
- **Quick Notes (4x4):** Editable text area, auto-saves to `trpcReact.preferences.set` with key `widget-notes-{id}`. Markdown or plain text.
- **No weather widget in V1** — requires external API key setup, deferred.

### Widget Visual Style
- **Glassmorphism:** `backdrop-blur-xl` + `bg-white/10` + `border border-white/20` + `rounded-2xl`
- **Big radius:** 16px corner radius (`rounded-2xl`)
- **Thin white border:** 1px `border-white/20`
- **White text:** Primary text `text-white/90`, secondary `text-white/60`
- **Drop shadow:** Subtle `shadow-lg` for depth
- **Theme-aware:** Inherits wallpaper visibility through glass effect, brand color not forced on widgets

### Widget Ekleme UX
- **Right-click desktop → "Widget Ekle"** menu item in existing `desktop-context-menu.tsx`
- **Dialog opens** with widget cards showing preview + name + size label
- **Click card to add** — widget placed at first available free cells (column-major)
- **Multiple instances allowed** — user can add 2 clocks, 3 note widgets, etc.

### Widget Removal
- **Right-click on widget → "Widget'ı Kaldır"** context menu item
- Same pattern as folder deletion
- No hover X button

### Widget Storage
- **Preference key:** `desktop-widgets` → `WidgetMeta[]` (id, type, config)
- **Layout:** Existing `desktop-layout` already supports widget IDs (prefix `widget-{type}-{uuid}`)
- **Server sync:** Same `trpcReact.preferences.set/get` pattern as folders
- **localStorage fallback** for offline

### Claude's Discretion
- Exact glassmorphism opacity values (tuning for different wallpapers)
- Clock animation implementation (CSS vs canvas for analog)
- Note widget auto-save debounce timing
- Widget picker dialog layout and animation
- System info circular progress component implementation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Desktop Grid System
- `livos/packages/ui/src/modules/desktop/app-grid/app-grid.tsx` — Grid layout, DnD, DesktopLayout type, cell positioning, clamp/ensureAllPositioned helpers
- `livos/packages/ui/src/modules/desktop/desktop-content.tsx` — Item rendering, layout state, folder/preference storage pattern

### Context Menu
- `livos/packages/ui/src/modules/desktop/desktop-context-menu.tsx` — Right-click menu, folder creation dialog pattern

### System Data APIs
- `livos/packages/livinityd/source/modules/system/routes.ts` — tRPC endpoints: cpuUsage, systemMemoryUsage, systemDiskUsage, cpuTemperature
- `livos/packages/livinityd/source/modules/system/system-widgets.ts` — Pre-built widget data structures (text-with-progress, three-stats types)

### Hooks
- `livos/packages/ui/src/hooks/use-memory.ts` — useSystemMemory hook with polling support
- `livos/packages/ui/src/hooks/use-cpu.ts` — useCpu hook pattern

### UI Components
- `livos/packages/ui/src/modules/desktop/desktop-folder.tsx` — Reference for widget context menu, color picker, dialog patterns
- `livos/packages/ui/src/shadcn-components/ui/dialog.tsx` — Dialog component for widget picker
- `livos/packages/ui/src/shadcn-components/ui/context-menu.tsx` — Context menu component

### Theme
- `livos/packages/ui/src/providers/wallpaper.tsx` — Brand color CSS variables, wallpaper settings

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AppGrid` + `DraggableItem`: Already supports grid placement — needs extension for multi-cell span
- `useGridDimensions()`: Returns cols, rows, cell sizes — reusable for widget placement validation
- `ensureAllPositioned()` / `clampLayout()`: Need extension for multi-cell items
- `useSystemMemory({poll: true})` / `useCpu()`: Ready-made hooks for system widgets
- `system-widgets.ts`: Backend already computes widget-ready data structures
- shadcn `Dialog`, `ContextMenu`: Ready for widget picker and widget context menu

### Established Patterns
- **Preferences sync:** localStorage + `trpcReact.preferences.set/get` with `serverSynced` ref — copy from folders
- **Animation:** Framer Motion spring `stiffness: 400, damping: 25` for pop-in
- **Context menu:** shadcn ContextMenu with Dialog/Popover composition
- **Responsive:** `createBreakpoint({S: 0, M: 640})` for mobile vs desktop sizing

### Integration Points
- `desktop-content.tsx` `gridItems` array: Add widget items alongside apps and folders
- `desktop-context-menu.tsx`: Add "Widget Ekle" menu item
- `app-grid.tsx` `DraggableItem`: Extend to support `colSpan`/`rowSpan`
- `app-grid.tsx` helpers: Update `firstFreeCell`, `occupiedSet`, `ensureAllPositioned` for multi-cell items
- `desktop-layout` preference: Widget IDs stored in same layout object

</code_context>

<specifics>
## Specific Ideas

- iOS/iPadOS widget size system: Small (2x2), Medium (4x2), Large (4x4)
- Glassmorphism style: frosted glass effect that lets wallpaper show through
- Clock widget supports both digital and analog modes (context menu switch)
- System info comes in two flavors: compact bars (2x2) and circular gauges (4x2)
- Widget picker shows preview cards with actual widget appearance

</specifics>

<deferred>
## Deferred Ideas

- **Weather widget** — requires external API key (OpenWeather), user setup flow. Future phase.
- **Calendar widget** — needs calendar data source integration. Future phase.
- **Widget resize handles** — drag-to-resize at edges. Currently fixed sizes per type.
- **Widget settings panel** — per-widget configuration beyond context menu. Could be a future enhancement.

</deferred>

---

*Phase: 15-desktop-widgets*
*Context gathered: 2026-03-18*
