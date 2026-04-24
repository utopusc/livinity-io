# Phase 5: Terminal Mobile - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Make Terminal usable on mobile: proper xterm.js sizing, readable font, landscape mode support. Desktop unchanged.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — responsive CSS/layout phase.

Key guidance:
- xterm.js should fill the mobile viewport width (use fit addon to recalculate cols)
- Font size minimum 12px on mobile for readability
- Support landscape mode: listen for resize/orientation change and call fit()
- Terminal container needs proper height (account for MobileNavBar + MobileTabBar)
- Consider adding a toolbar with common keys (Tab, Ctrl+C, arrows) for mobile soft keyboard limitations

</decisions>

<code_context>
## Existing Code Insights

### Key Files
- `livos/packages/ui/src/modules/window/app-contents/terminal-content.tsx` — terminal window wrapper
- Terminal uses xterm.js with fit addon
- Already in window system, rendered via MobileAppRenderer on mobile

</code_context>

<specifics>
No specific requirements.
</specifics>

<deferred>
None.
</deferred>
