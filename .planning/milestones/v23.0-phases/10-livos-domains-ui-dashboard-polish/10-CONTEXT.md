# Phase 10: LivOS Domains UI + Dashboard Polish - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds the Domains tab to the LivOS Servers app and polishes the livinity.io dashboard domain management UI. LivOS shows synced domains with status badges, app mapping dropdowns, and remove actions. livinity.io gets SSL cert info, re-verify buttons, and better error states on the existing domain cards.

</domain>

<decisions>
## Implementation Decisions

### LivOS Domains Tab
- New "Domains" tab alongside existing Docker tabs in Servers app
- Card-based domain list: each card shows domain, status badge, mapped app, actions
- Status badges: colored (green=active, yellow=pending, red=error, orange=dns_changed)
- Domain-to-app mapping: dropdown selector next to each domain showing available Docker apps
- Remove domain action syncs back to platform via tunnel

### livinity.io Dashboard Polish
- Expand existing Phase 07 domain cards (already inline) — add SSL certificate info and re-verify button
- Error states: inline error message below domain card with retry button
- Domain limit display: keep existing "2/3 domains" badge from Phase 07
- No separate domain detail page — everything inline on dashboard

### Claude's Discretion
- Exact component structure and file organization
- Animation/transition choices for expanding/collapsing cards
- tRPC route names for domain operations on LivOS side
- Error message wording

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- LivOS Servers app at `livos/packages/ui/src/components/apps/` — existing Docker management UI
- tRPC router at `livos/packages/livinityd/source/modules/trpc/` — existing patterns
- Platform dashboard at `platform/web/src/app/dashboard/page.tsx` — Phase 07 domain UI
- Redis domain cache in LivOS (`livos:custom_domain:*` keys from Phase 09)

### Established Patterns
- LivOS UI: React 18 + Vite + Tailwind 3.4 + shadcn/ui + Framer Motion
- tRPC for LivOS API with httpOnlyPaths for mutations
- Tab-based UI in Servers app (existing Docker tabs)
- livinity.io: Next.js 15 + Tailwind v4 + Lucide React + Motion

### Integration Points
- LivOS Servers app — add Domains tab
- LivOS tRPC router — add domain listing + app mapping + remove routes
- Platform dashboard — extend existing domain cards from Phase 07

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard CRUD UI following existing patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
