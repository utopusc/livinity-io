# Phase 173: Vault Rename + Phase 168 Migration + Sacred Freeze

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** Master plan § Phase 173 + D-V38-A/Q/L
**Wave:** 1 (depends on 171)

<domain>
## Phase Boundary

Three intertwined tasks: (1) rename Mini PC vault `/root/livinity-vault/` → `/root/liv/` with compatibility symlink; (2) migrate Phase 168 flat `livos-cc-sessions.json` sessions into v38 ChatItems under Main Liv; (3) update Sacred SHA hook to lock new vault-items + cli module byte freezes.

**Critical constraint:** Phase 162-01 `vault-scaffolder.ts` MUST STAY byte-identical (sacred guard). Path migration uses an env-var resolver shim (Phase 171-01 `vault-root-resolver.ts`), NOT a modification to the scaffolder.

**Phase 173 sonu:**
- Deploy script (`scripts/migrate-v35-to-v38.sh`) — runs on Mini PC at deploy time
- Compatibility symlink `/root/livinity-vault → /root/liv` for any external readers
- `LIV_VAULT_ROOT=/root/liv` exported in livinityd service file
- All Phase 168 session entries in `livos-cc-sessions.json` translated to ChatItems under Main Liv with original `createdAt` preserved as title metadata
- Original `livos-cc-sessions.json` backed up to `<vault>/.backups/v35-cc-sessions.json`
- Pre-commit hook updated to lock vault-items source files (added to sacred SHA registry)
- Phase 168 `SessionSidebar` + `NewSessionButton` + cc-pty-router are NOT YET DELETED — that's Phase 175's job (graceful coexistence during transition)
</domain>

<decisions>

### Plan 173-01: Deploy-time migration script
- NEW `scripts/migrate-v35-to-v38.sh` — runs on Mini PC inside `/opt/livos/update.sh`
- Idempotent: detects `/root/liv/` already exists → skip mv
- Order: stop livinityd → `mv` atomic → `ln -s livinity-vault liv` (or vice versa for compat) → restart livinityd
- Acceptance: bash test on Mini PC — running twice produces same final state

### Plan 173-02: Session migration writer
- NEW `livinityd/source/modules/vault-items/migration-v35-to-v38.ts`
- Reads existing `livos-cc-sessions.json`
- For each session: creates ChatItem under Main Liv root, preserves `tmuxName` + `ccSessionId` + `createdAt`/`lastAttachedAt`/`lastMessageAt`
- Title generation: `Session {createdAt local-time format}` if no `title` field set
- Acceptance: 8 vitest assertions — N sessions in → N ChatItems out, parentId=null, original SessionStore preserved (renamed `.backups/`)

### Plan 173-03: Sacred SHA hook v38 freeze
- MOD pre-commit hook script — append vault-items module files + cli package src files to sacred guard registry
- NEW `scripts/sacred-shas-v38.json` — explicit list of v38 sacred file SHA pins (populated post-Phase 171 + 172 ship)
- Acceptance: pre-commit hook reads the JSON, computes git-hash-object for each entry, exits non-zero on mismatch

### Plan 173-04: livinityd service env update + boot test
- MOD `scripts/install/livos.service` (systemd unit) — `Environment=LIV_VAULT_ROOT=/root/liv` (with fallback comment)
- Acceptance: post-deploy boot log shows `[vault-graph] mounted /api/vault/graph (vaultRoot=/root/liv/)` (replaces previous `livinity-vault` path)
</decisions>

<canonical_refs>
- Master plan § D-V38-A (vault rename policy)
- `.planning/phases/166-cc-pty-backend/166-VERIFICATION.md` (current Phase 168 session storage shape)
- `scripts/install/livos.service` (systemd unit file)
- `scripts/install/deploy-livinityd.sh` (deploy entrypoint to wire migration script into)
- Sacred SHA pre-commit hook current source
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 173-01 | NEW scripts/migrate-v35-to-v38.sh; MOD scripts/install/deploy-livinityd.sh (additive call) |
| 173-02 | NEW vault-items/migration-v35-to-v38.ts + test |
| 173-03 | MOD pre-commit hook; NEW scripts/sacred-shas-v38.json |
| 173-04 | MOD scripts/install/livos.service (additive env line) |

**Sacred guards (must NOT touch):** vault-scaffolder.ts, sdk-agent-runner.ts, all Phase 162-167 prior guards + Phase 169 vault-graph backend. Phase 168 cc-pty-router stays (Phase 175 deletes it).

</specifics>

<deferred>
- Deletion of Phase 168 `SessionSidebar` + `NewSessionButton` → Phase 175
- Deletion of cc-pty-router → Phase 175
- Multi-user vault path support → v38.x or v39
</deferred>

---

*Phase: 173-vault-rename-migration*
*Wave: 1*
*Depends on: Phase 171*
*Estimated: ~1-2 days agent work*
