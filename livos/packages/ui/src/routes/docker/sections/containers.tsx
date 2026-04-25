// Phase 26 Plan 26-01 — replaces the Phase 24 placeholder.
//
// The full Containers section lives in routes/docker/resources/container-section.tsx
// (DOC-07 + DOC-20 partial). Re-exported as `Containers` so docker-app.tsx's
// SectionView switch case keeps working — zero changes to docker-app.tsx.
export {ContainerSection as Containers} from '../resources/container-section'
