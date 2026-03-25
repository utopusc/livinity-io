# Phase 21: Install History & Profile - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire install event reporting from LivOS to apps.livinity.io API, and build the /store/profile page showing installed apps and history timeline. Completes the full store integration loop.

</domain>

<decisions>
## Implementation Decisions

### LivOS → API Event Reporting
- After successful install/uninstall in use-app-store-bridge.ts, POST to /api/install-event
- Include: appId (app name/slug), action ('install'|'uninstall'), instance_name (hostname)
- Auth: X-Api-Key header with LIVINITY_API_KEY
- Fire-and-forget (don't block UI on API response)

### Profile Page (/store/profile)
- Shows user email/username from /api/user/profile
- "My Instances" section: list of instance names with app counts
- "Installed Apps" grid: all apps installed across instances, grouped by instance
- "History" timeline: chronological list of install/uninstall events
- Sidebar "My Apps" link navigates to /store/profile

### Claude's Discretion
- Visual design of profile page (match store aesthetic)
- Loading states
- Empty states for new users

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `platform/web/src/app/api/install-event/route.ts` — POST endpoint (Phase 17)
- `platform/web/src/app/api/user/apps/route.ts` — GET user apps (Phase 17)
- `platform/web/src/app/api/user/profile/route.ts` — GET profile (Phase 17)
- `platform/web/src/app/store/components/` — store UI components
- `platform/web/src/app/store/store-provider.tsx` — auth context
- `livos/packages/ui/src/hooks/use-app-store-bridge.ts` — postMessage bridge (Phase 20)

### Integration Points
- use-app-store-bridge.ts: add fetch to /api/install-event after install/uninstall
- Store sidebar: "My Apps" links to /store/profile
- Profile page consumes /api/user/apps and /api/user/profile

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond what's described.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
