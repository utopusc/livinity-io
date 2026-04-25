// Phase 26 Plan 26-01 — replaces the Phase 24 placeholder.
//
// The full Images section lives in routes/docker/resources/image-section.tsx
// (DOC-08 + DOC-20 partial). Re-exported as `Images` so docker-app.tsx's
// SectionView switch case keeps working — zero changes to docker-app.tsx.
export {ImageSection as Images} from '../resources/image-section'
