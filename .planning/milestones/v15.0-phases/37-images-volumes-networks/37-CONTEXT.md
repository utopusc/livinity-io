# Phase 37: Images, Volumes, Networks - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Add Docker image, volume, and network management tabs to the Server Management dashboard. Backend: list/remove/prune for images, list/remove for volumes, list/inspect for networks. Frontend: three new tab contents with tables and action buttons.

</domain>

<decisions>
## Implementation Decisions

### Backend — Images
- `docker.listImages` query: returns array of {id, repoTags, size, created}
- `docker.removeImage` mutation: remove by image ID, with force option
- `docker.pruneImages` mutation: remove all dangling images, return {spaceReclaimed: number}
- All mutations admin-only

### Backend — Volumes
- `docker.listVolumes` query: returns array of {name, driver, mountpoint, createdAt}
- `docker.removeVolume` mutation: remove by name, requires confirmation
- Admin-only mutations

### Backend — Networks
- `docker.listNetworks` query: returns array of {id, name, driver, scope, containerCount}
- `docker.inspectNetwork` query: returns {id, name, driver, containers: [{name, ipv4, macAddress}]}
- Read-only for v12.0 (no create/remove network)

### Frontend — Images Tab
- Table: Repository:Tag, Size (human-readable), Created (relative date), Actions (Remove)
- Prune button at top: "Prune Unused Images" with confirmation dialog showing potential space savings
- Remove individual image with confirmation
- Show total image count and total size at top

### Frontend — Volumes Tab
- Table: Name, Driver, Mount Point, Actions (Remove)
- Remove with confirmation dialog
- Show total volume count

### Frontend — Networks Tab
- Table: Name, Driver, Scope, Containers (count), Actions (Inspect)
- Inspect opens inline expandable row or small sheet showing connected containers with IPs

### Claude's Discretion
- Table column widths and sorting
- Human-readable size formatting approach
- Network inspect: inline expand vs sheet

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 35 docker module: singleton, routes pattern, adminProcedure
- Phase 35 types.ts: extend with ImageInfo, VolumeInfo, NetworkInfo
- Phase 35 frontend: tab shell already has placeholder tabs for Images, Volumes, Networks
- Existing confirmation dialog pattern from container remove

### Integration Points
- Extend docker/routes.ts with image/volume/network queries and mutations
- Extend docker/types.ts with new types
- Add image/volume/network mutations to httpOnlyPaths in common.ts
- Fill in placeholder tab contents in server-control/index.tsx

</code_context>

<specifics>
No specific requirements beyond standard Docker resource management.
</specifics>

<deferred>
## Deferred Ideas
- Image pull from UI — v13.0
- Volume creation — v13.0
- Network creation/deletion — v13.0
</deferred>
