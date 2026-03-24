# Phase 4: Download Page - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a /download page on livinity.io that detects the user's platform and shows the appropriate download button prominently, with all platform options visible below. Includes brief setup instructions. This is a single Next.js page — no backend changes needed.

</domain>

<decisions>
## Implementation Decisions

### Page Route
- Next.js App Router page at `platform/web/src/app/download/page.tsx`
- Public page (no auth required)
- SSR-rendered for SEO

### Platform Detection
- Use `navigator.userAgent` client-side to detect Windows/macOS/Linux
- Show detected platform's download button as primary (large, prominent)
- Show other platforms in a secondary row below
- Fallback: show all 3 equally if platform can't be detected

### Design
- Apple-style download page (clean, minimal, premium)
- Hero section: "Download Livinity Agent" heading, subtitle: "Control your PC from anywhere with AI"
- Primary download button: large, blue/brand color, platform icon + "Download for Windows" (or detected OS)
- Secondary buttons: smaller, outlined, for other platforms
- Platform icons: Windows logo, Apple logo, Linux (Tux) — use SVG inline or @tabler/icons
- File size indication: "~60 MB" next to each download button

### Setup Instructions Section
- 3-step visual guide below the downloads:
  1. "Download & Install" — icon of installer wizard
  2. "Connect Your Account" — icon of browser with code entry
  3. "Control with AI" — icon of chat bubble
- Keep it minimal — 1 sentence per step

### Download URLs
- Point to static file hosting or release URLs (placeholder for now):
  - `/downloads/livinity-agent-setup-win-x64.exe`
  - `/downloads/Livinity-Agent.dmg`
  - `/downloads/livinity-agent_1.0_amd64.deb`
- Files will be uploaded to livinity.io/public/downloads/ or a CDN later

### Claude's Discretion
- Exact colors and spacing
- Animation on page load
- Whether to add a "System Requirements" section

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `platform/web/src/app/` — Existing Next.js App Router pages
- livinity.io has Tailwind CSS 4 for styling
- Existing pages follow Apple-style premium design

### Established Patterns
- Next.js App Router with `page.tsx` files
- Tailwind for styling, no CSS modules
- Client components use `'use client'` directive

### Integration Points
- New: `platform/web/src/app/download/page.tsx`
- Navigation: may need a link from the homepage or header

</code_context>

<specifics>
## Specific Ideas

- The page should make downloading feel effortless and premium
- Platform detection should feel "smart" — user sees their OS highlighted instantly
- The 3-step guide should make it clear that setup takes under a minute

</specifics>

<deferred>
## Deferred Ideas

- Version detection / update notifications on the page
- Changelog section
- Actual file hosting (CDN/S3) — placeholder URLs for now

</deferred>
