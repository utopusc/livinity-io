// Phase 92 — WebApp Metadata Extractor (v33.0 milestone Wave 1 leaf).
//
// Backend-only metadata extraction for the v33 "WebApp" desktop concept:
// the user pastes a URL and LivOS auto-extracts a title + favicon for the
// icon. P92 ships only the read-side metadata extractor + the `webapps`
// table schema. CRUD procedures (`webapps.create / list / delete / update`)
// are deferred to P94 with the desktop UI dialog.
//
// This barrel re-exports the public surface consumed by:
//   - server/trpc/index.ts (mounts `webapp` namespace)
//   - P93 window-discovery (consumes title for Chrome window matching)
//   - P94 desktop UI (consumes the full payload for the icon dialog)

export {extractMetadata, type MetadataResult} from './metadata-extractor.js'
export {default as webappRouter} from './trpc-router.js'
