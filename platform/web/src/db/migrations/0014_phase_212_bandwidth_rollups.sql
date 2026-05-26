-- Phase 212: bandwidth_usage rollups for admin dashboard.
-- Synchronous trigger gives effectively-zero lag (well under ADM-12's 5min budget).

CREATE TABLE IF NOT EXISTS public.hourly_bandwidth (
  hour_start  TIMESTAMPTZ NOT NULL,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bytes_in    BIGINT NOT NULL DEFAULT 0,
  bytes_out   BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (hour_start, user_id)
);

CREATE TABLE IF NOT EXISTS public.daily_bandwidth (
  day_start  DATE NOT NULL,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bytes_in   BIGINT NOT NULL DEFAULT 0,
  bytes_out  BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day_start, user_id)
);

CREATE INDEX IF NOT EXISTS hourly_bandwidth_hour_idx ON public.hourly_bandwidth (hour_start DESC);
CREATE INDEX IF NOT EXISTS daily_bandwidth_day_idx ON public.daily_bandwidth (day_start DESC);

CREATE OR REPLACE FUNCTION public.bandwidth_rollup_upsert() RETURNS TRIGGER AS $$
DECLARE
  delta_in BIGINT;
  delta_out BIGINT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta_in := NEW.bytes_in;
    delta_out := NEW.bytes_out;
  ELSE
    delta_in := NEW.bytes_in - COALESCE(OLD.bytes_in, 0);
    delta_out := NEW.bytes_out - COALESCE(OLD.bytes_out, 0);
  END IF;

  INSERT INTO public.hourly_bandwidth (hour_start, user_id, bytes_in, bytes_out)
    VALUES (date_trunc('hour', NEW.updated_at), NEW.user_id, delta_in, delta_out)
    ON CONFLICT (hour_start, user_id)
    DO UPDATE SET
      bytes_in = public.hourly_bandwidth.bytes_in + EXCLUDED.bytes_in,
      bytes_out = public.hourly_bandwidth.bytes_out + EXCLUDED.bytes_out;

  INSERT INTO public.daily_bandwidth (day_start, user_id, bytes_in, bytes_out)
    VALUES (date_trunc('day', NEW.updated_at)::date, NEW.user_id, delta_in, delta_out)
    ON CONFLICT (day_start, user_id)
    DO UPDATE SET
      bytes_in = public.daily_bandwidth.bytes_in + EXCLUDED.bytes_in,
      bytes_out = public.daily_bandwidth.bytes_out + EXCLUDED.bytes_out;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bandwidth_rollup_trigger ON public.bandwidth_usage;
CREATE TRIGGER bandwidth_rollup_trigger
  AFTER INSERT OR UPDATE ON public.bandwidth_usage
  FOR EACH ROW EXECUTE FUNCTION public.bandwidth_rollup_upsert();
