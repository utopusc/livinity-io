-- =========================================================================
-- Migration 0007: Add FK constraint devices.user_id -> users(id) (v26.0 Phase 11 OWN-01)
-- =========================================================================

-- Step 1: Defensive backfill. schema.ts already declares user_id NOT NULL, but the
-- relay DB may have rows from before that constraint was added. Any NULL user_id
-- gets assigned to the oldest admin (fallback: oldest user by created_at if no admin
-- concept exists in platform/relay users schema).
UPDATE devices
SET user_id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
WHERE user_id IS NULL;

-- Step 2: Re-enforce NOT NULL (idempotent — no-op if already NOT NULL).
ALTER TABLE devices ALTER COLUMN user_id SET NOT NULL;

-- Step 3: Add FK constraint. Use ON DELETE RESTRICT so deleting a user with active
-- devices FAILS loudly rather than silently cascading — v26.0 demands explicit
-- device lifecycle management, not implicit delete propagation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'devices_user_id_fkey' AND conrelid = 'devices'::regclass
  ) THEN
    ALTER TABLE devices
      ADD CONSTRAINT devices_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Step 4: Ensure index exists (migration 0004 already creates this, but we add it
-- here for safety in case an environment ran the schema without the index).
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
