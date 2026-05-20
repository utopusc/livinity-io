// Phase 166 — Claude Code PTY backend.
// Sacred SHA f3538e1d... + D-09 + Phase 161-02 helper + Phase 162-01
// vault-scaffolder + Phase 162-02 agent-session.ts + Phase 163 ws-agent.ts
// surface routing all UNCHANGED. tmux apt install is deferred to Phase 170.

export type {CcPtySession, CcPtyManagerOptions, CcPtyLogger} from './types.js'
export {SessionStore} from './session-store.js'
export type {SessionStoreOptions} from './session-store.js'
export {CcPtyManager} from './manager.js'
export {createCcPtyWsHandler} from './ws-handler.js'
export type {CcPtyWsHandlerOptions, CcPtyWsHandlerLogger} from './ws-handler.js'
// 166-05 will add: export {CcPtyIdleReaper} from './idle-reaper.js'
