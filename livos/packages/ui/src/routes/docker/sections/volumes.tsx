// Phase 26 Plan 26-02 — replaces the Phase 24 placeholder.
//
// The full Volumes section lives in routes/docker/resources/volume-section.tsx
// (DOC-09 + DOC-20 partial). Re-exported as `Volumes` so docker-app.tsx's
// SectionView switch case keeps working — zero changes to docker-app.tsx.
export {VolumeSection as Volumes} from '../resources/volume-section'
