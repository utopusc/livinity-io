// Phase 92-01 stub — trpc-router.ts.
//
// Replaced in 92-09 with the full `webapp.extractMetadata` procedure +
// registration in the root tRPC router. The stub exists so 92-01's module
// scaffold typechecks before the orchestrator (92-08) lands.

import {router} from '../server/trpc/trpc.js'

const webappRouter = router({})

export default webappRouter
