# Phase 42: Container Edit & Recreate - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable editing existing containers by pre-filling the creation form with current config, then recreating (stop old → remove → create new with same name). Also: duplicate container (clone config, empty name) and rename container.

</domain>

<decisions>
## Implementation Decisions

### Backend — Recreate Container
- New `docker.recreateContainer` mutation: takes name + ContainerCreateInput, stops old container, removes it, creates new with same name and new config, starts it
- New `docker.renameContainer` mutation: takes name + newName, uses dockerode container.rename()
- `docker.inspectContainer` already exists (Phase 36) — returns full config for pre-filling the form
- Add both mutations to httpOnlyPaths

### Frontend — Edit Mode
- ContainerCreateForm component (Phase 41) gets an `editMode` prop
- When editMode: form pre-filled with data from docker.inspectContainer
- Button text changes: "Create" → "Recreate Container"
- Warning banner: "This will stop and remove the existing container, then create a new one with the updated config"
- Triggered from container detail sheet or container table action menu: "Edit" button

### Frontend — Duplicate
- "Duplicate" button in container actions → opens creation form pre-filled with cloned config but empty name field
- Uses same ContainerCreateForm with `duplicateFrom` prop

### Frontend — Rename
- "Rename" button in container actions → small dialog with input field for new name
- Calls docker.renameContainer mutation
- Refreshes container list on success

### Claude's Discretion
- How to extract current container config from inspect data into ContainerCreateInput format
- UI for the recreate warning
- Rename dialog exact styling

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 41 ContainerCreateForm: reuse with editMode/duplicateFrom props
- Phase 36 docker.inspectContainer: returns full container detail for pre-filling
- Phase 35 docker.manageContainer: remove operation for cleanup
- Phase 35 useContainers hook: mutation pattern

### Integration Points
- Extend docker/routes.ts with recreateContainer and renameContainer mutations
- Extend docker/types.ts if needed
- Modify container-create-form.tsx to accept editMode and initialData props
- Add Edit/Duplicate/Rename to container actions in server-control/index.tsx and container-detail-sheet

</code_context>

<specifics>
- inspectContainer returns Docker-format data that needs mapping to ContainerCreateInput format (e.g., PortBindings → ports array)
</specifics>

<deferred>
None for this phase.
</deferred>
