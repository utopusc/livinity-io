# Phase 3: Server Control Mobile - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Make Server Control fully usable on mobile: stackable dashboard cards, compact container list, touch-friendly actions, responsive charts. Desktop unchanged.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — responsive CSS/layout phase.

Key guidance:
- Dashboard stat cards should stack vertically (grid-cols-1 on mobile instead of grid-cols-2/3)
- Docker container list needs compact rows (key info only: name, status, actions)
- Container action buttons need min 44px touch targets
- Charts/stats should resize to mobile width via responsive container
- Use Tailwind responsive grid classes

</decisions>

<code_context>
## Existing Code Insights

### Key Files
- `livos/packages/ui/src/routes/server-control/` — server control routes
- May include dashboard cards, container lists, action buttons, stats/charts

</code_context>

<specifics>
No specific requirements.
</specifics>

<deferred>
None.
</deferred>
