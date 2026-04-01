# Phase 2: Settings Mobile - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Make Settings fully usable on mobile: single-column layout, proper scrolling, touch-friendly controls, full-width modals. Desktop unchanged.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — responsive CSS/layout phase.

Key guidance:
- On mobile, replace side nav + content split with single-column stacked layout (navigation at top or as tabs)
- All form controls need min 44px touch targets (Apple HIG)
- Modal dialogs should be full-width on mobile (max-w-full or use vaul Drawer)
- All sections must scroll vertically without horizontal overflow
- Use Tailwind responsive classes where possible

</decisions>

<code_context>
## Existing Code Insights

### Key Files
- `livos/packages/ui/src/routes/settings/` — settings routes and components
- `livos/packages/ui/src/routes/settings/_components/settings-content.tsx` — main layout
- Settings uses side navigation + content panel layout

</code_context>

<specifics>
No specific requirements.
</specifics>

<deferred>
None.
</deferred>
