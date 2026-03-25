# Phase 18: Store UI - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the apps.livinity.io/store UI as a standalone Next.js page set. Featured hero, categories, search, app detail pages. Apple App Store aesthetic — white, clean, premium. Must work both standalone in browser and embedded in iframe.

</domain>

<decisions>
## Implementation Decisions

### Layout & Navigation
- Left sidebar: Discover, Categories, My Apps (collapsible on small screens)
- Top bar: Search input + user profile avatar (from API key auth)
- Main area: Scrollable content with sections
- All under `/store` route group in Next.js App Router

### Discover Page (/store)
- Featured hero section: 3 large cards with app icon, name, tagline, gradient background
- Featured apps: n8n, Jellyfin, Immich (featured=true from API)
- Below hero: Category sections showing 4 apps per row
- "See All" link per category → category filter view

### Category View (/store?category=X)
- Same page, filtered by category
- Grid of app cards (icon, name, tagline, Install button)
- Horizontal category pills at top for switching

### App Detail (/store/[id])
- Large app icon (128px) + name + tagline
- Description (full text)
- Metadata: version, category, verified badge
- Install button (sends postMessage to parent — Phase 19)
- No screenshots for v10.0

### Search
- Real-time filter on client side (apps already loaded from API)
- Filters by name, tagline, category, description
- Results shown as compact card list

### Visual Style
- Background: white (#ffffff)
- Cards: subtle gray (#f8f9fa) with rounded corners (12px), subtle shadow
- Primary color: teal (#14b8a6) for Install buttons and active states
- Font: Inter or system font stack
- Icons: App icons from API (icon_url field)
- No dark mode — light only
- Responsive: sidebar collapses to hamburger on narrow width

### Auth
- Token passed as URL query param: /store?token=API_KEY&instance=HOSTNAME
- Token stored in React state (not localStorage — iframe security)
- Passed to API calls via X-Api-Key header
- If no token: show "Connect your LivOS instance" message

### Claude's Discretion
- Exact component structure and file organization
- Animation/transition details
- Loading states and empty states
- Error handling UI

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `platform/web/src/lib/db.ts` — pg Pool
- `platform/web/src/lib/api-auth.ts` — X-Api-Key validation
- `platform/web/src/app/api/apps/route.ts` — GET /api/apps (data source)
- `platform/web/src/app/globals.css` — Tailwind CSS setup
- `platform/web/src/lib/utils.ts` — cn() utility

### Established Patterns
- Next.js 16 App Router with server/client components
- Tailwind CSS for styling
- API routes at `/api/apps/*`

### Integration Points
- /store pages consume /api/apps and /api/user/* endpoints
- iframe embedding (Phase 20) will load /store?token=X
- postMessage bridge (Phase 19) will add install button behavior

</code_context>

<specifics>
## Specific Ideas

- Apple App Store look — big visuals, lots of whitespace, premium feel
- Install button in detail page will initially just show "Install" text — actual postMessage wiring comes in Phase 19
- The /store pages are server-rendered but the search/filter is client-side
- Responsive iframe-friendly: no fixed positioning, scrollable content

</specifics>

<deferred>
## Deferred Ideas

- Screenshots/preview images
- App ratings/reviews
- Dark mode
- App update notifications

</deferred>
