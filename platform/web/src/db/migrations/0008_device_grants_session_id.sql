-- Phase 14 SESS-01: bind device grants to the approving user's session.
-- session_id is nullable until the grant is approved (INSERT happens before user approval).
-- After approval, the token endpoint will reject any grant with NULL session_id.
ALTER TABLE device_grants
  ADD COLUMN IF NOT EXISTS session_id UUID;

-- No FK to sessions(id) because:
--   (1) device_grants is ephemeral and pruned on consume (DELETE FROM device_grants WHERE device_code = $1)
--   (2) a user session may be deleted (logout) before the device completes its token poll;
--       the session_id becomes dangling but that is harmless — /api/device/token will simply
--       see the grant was consumed or the session no longer exists when it runs the handshake
--   (3) adding an FK would force us to ON DELETE CASCADE grants when sessions are deleted,
--       which is behaviourally identical to the current grant-expiry mechanism
CREATE INDEX IF NOT EXISTS idx_device_grants_session_id
  ON device_grants(session_id)
  WHERE session_id IS NOT NULL;
