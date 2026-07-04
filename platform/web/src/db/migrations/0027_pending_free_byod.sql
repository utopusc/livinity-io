-- Carry the free-BYOD signup intent through the email-verify-FIRST flow.
--
-- A user who signs up via /register?plan=free (the "Choose Free" card on
-- /pricing) must land as a public.users row with free_byod=TRUE. Because the
-- users row is created LATER (at verify-email, not at register), the intent has
-- to ride on the pending_registrations row between the two stages. This column
-- holds it: POST /api/auth/register writes it, POST /api/auth/verify-email reads
-- it and passes freeByod to createUser().
--
-- Additive + idempotent (matches 0026_free_byod.sql / 0016 ADD COLUMN IF NOT
-- EXISTS style). Default FALSE → a normal (paid/unset) signup is unchanged: the
-- pending row is free_byod=false and the promoted user is free_byod=false, i.e.
-- the exact pre-feature behavior. Safe to run before or after the code deploy:
-- register + verify-email both tolerate the column being absent (42703 fallback
-- → treated as free_byod=false, the safe direction).

ALTER TABLE public.pending_registrations ADD COLUMN IF NOT EXISTS free_byod BOOLEAN NOT NULL DEFAULT FALSE;
