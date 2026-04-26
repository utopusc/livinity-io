# Phase 30: Auto-Update Notification (GitHub-Aware) - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Detect new commits on the `utopusc/livinity-io` master branch, surface a persistent bottom-right notification card on the desktop, and trigger `/opt/livos/update.sh` via livinityd when the user clicks "Update". Replaces the broken legacy Umbrel OTA infra (`api.livinity.io/latest-release`) which doesn't match this deployment model.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research.

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond ROADMAP phase description and success criteria. The success criteria already specify:
- `system.checkUpdate` tRPC query → GitHub API `/repos/utopusc/livinity-io/commits/master`, compare against `/opt/livos/.deployed-sha`
- `update.sh` writes deployed SHA after successful build
- `system.update` mutation spawns `bash /opt/livos/update.sh`, progress via existing `system.updateStatus`
- `<UpdateNotification />` component on desktop, fixed bottom-right (`bottom-4 right-4 z-[80]`), framer-motion fade-in/slide-up
- "Update" → existing `/settings/software-update/confirm` dialog; "Later" → localStorage `livos:update-notification:dismissed-sha`
- `useSoftwareUpdate` hook polls hourly, refetch on mount, graceful rate-limit handling

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
