-- Phase 215: install command queue for Vercel ↔ Mini PC bridge.
-- Vercel admin endpoint INSERTs queued; Mini PC livinityd poller (CARRY-
-- P215-MINIPC-POLLER) will pick up + UPDATE status=running → ready|failed.

CREATE TABLE IF NOT EXISTS public.install_commands (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  app_id          UUID NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  instance_name   TEXT,
  status          TEXT NOT NULL DEFAULT 'queued',
  params          JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  requested_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT install_commands_status_check
    CHECK (status IN ('queued','running','ready','failed','cancelled'))
);

CREATE INDEX IF NOT EXISTS install_commands_user_status_idx
  ON public.install_commands (user_id, status, created_at);

CREATE INDEX IF NOT EXISTS install_commands_queue_idx
  ON public.install_commands (status, created_at) WHERE status = 'queued';
