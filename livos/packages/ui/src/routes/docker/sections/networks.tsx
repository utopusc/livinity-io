// Phase 26 Plan 26-02 — replaces the Phase 24 placeholder.
//
// The full Networks section lives in routes/docker/resources/network-section.tsx
// (DOC-10 + DOC-20 partial). Re-exported as `Networks` so docker-app.tsx's
// SectionView switch case keeps working — zero changes to docker-app.tsx.
export {NetworkSection as Networks} from '../resources/network-section'
