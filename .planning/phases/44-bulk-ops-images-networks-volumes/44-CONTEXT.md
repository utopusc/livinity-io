# Phase 44: Bulk Ops + Enhanced Images + Networks + Volumes - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Add bulk container operations (multi-select → start/stop/restart/remove), kill/pause/resume actions, image pull with progress + tag + layer history, network create/remove/disconnect, volume create + usage info.

</domain>

<decisions>
## Implementation Decisions

### Backend — New Container Actions
- Extend `docker.manageContainer` to support `kill`, `pause`, `unpause` operations (add to enum)
- New `docker.bulkManageContainers` mutation: takes {names: string[], operation} → runs in parallel, returns results per container

### Backend — Image Pull
- New `docker.pullImage` mutation: takes {image: string, tag?: string} → uses dockerode.pull() with progress streaming
- Since tRPC mutations can't stream, use polling pattern: mutation starts pull, returns pullId, frontend polls status
- OR simpler: mutation blocks until pull completes, returns success/failure (pulls typically < 60s)
- New `docker.tagImage` mutation: takes {id, repo, tag}
- New `docker.imageHistory` query: takes {id} → returns array of {id, created, createdBy, size, comment}

### Backend — Network Create/Remove/Disconnect
- New `docker.createNetwork` mutation: takes {name, driver, subnet?, gateway?, internal?, labels?}
- Extend existing `docker.removeNetwork` or add if not exists (check Phase 37)
- New `docker.disconnectNetwork` mutation: takes {networkId, containerId}

### Backend — Volume Create + Usage
- New `docker.createVolume` mutation: takes {name, driver?, driverOpts?}
- New `docker.volumeUsage` query: takes {name} → returns containers using this volume

### Frontend — Bulk Operations
- Add checkbox column to container table
- "Select All" checkbox in header
- When any selected: show floating action bar with Start/Stop/Restart/Remove buttons
- Protected containers can't be selected for stop/remove
- Confirmation for bulk remove

### Frontend — Container Actions
- Add Kill and Pause/Resume buttons to container table actions
- Pause shown for running, Resume shown for paused state

### Frontend — Images Tab Enhancements
- Add "Pull Image" button → dialog with image:tag input
- Pull shows loading spinner until complete
- Add "Tag" button on each image → dialog with new repo:tag
- Image detail expandable: show layer history

### Frontend — Networks Tab Enhancements
- Add "Create Network" button → form dialog (name, driver dropdown, subnet, gateway)
- Add "Disconnect" action in network inspect view
- Confirm before remove

### Frontend — Volumes Tab Enhancements
- Add "Create Volume" button → form dialog (name, driver, driver options)
- Volume detail shows containers using it

### Claude's Discretion
- Floating action bar styling
- Pull image progress display
- Layer history table columns

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 35: docker/routes.ts with manageContainer (extend enum)
- Phase 37: existing ImagesTab, VolumesTab, NetworksTab components
- Phase 37: existing hooks (useImages, useVolumes, useNetworks)
- Phase 37: existing backend routes for images/volumes/networks

### Integration Points
- Extend docker/routes.ts with new mutations and queries
- Extend docker/docker.ts with new domain functions
- Extend docker/types.ts with new types
- Modify server-control/index.tsx ContainersTab for bulk selection + kill/pause
- Modify ImagesTab, VolumesTab, NetworksTab for new features
- Add new mutations to httpOnlyPaths

</code_context>

<specifics>
No specific requirements beyond standard Docker operations.
</specifics>

<deferred>
- Image build from Dockerfile — v14.0
- Network advanced options (IPv6, macvlan config) — v14.0
</deferred>
