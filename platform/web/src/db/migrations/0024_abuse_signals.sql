-- Phase 280/283 (v46.0 Trust/Safety): per-tenant abuse/risk signals.
--
-- One row per user, upserted by the daily /api/cron/abuse-scan sweep. Holds the
-- signals that need a cron to compute (24h CF egress for CFC-03 bandwidth
-- anomaly; external-reputation verdict). The admin "abuse" panel JOINs this with
-- LIVE signals it can compute cheaply on read (subdomain count, suspended_at,
-- access_revoked_at), so those are NOT duplicated here.
--
-- Server-only (pg.Pool / service role). RLS on, no policy — same posture as
-- rate_limits / docs: no public Supabase client can read it.

CREATE TABLE IF NOT EXISTS abuse_signals (
  user_id           uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username          text,
  -- CFC-03: bytes the CF edge returned for {username}.livinity.io in the last
  -- 24h (egress). NULL ⇒ CF Analytics was unavailable that scan (not zero).
  egress_24h_bytes  bigint,
  egress_flagged    boolean NOT NULL DEFAULT false,
  -- External reputation verdict: 'clean' | 'flagged' | 'unknown' ('unknown' when
  -- no reputation provider is configured or the lookup failed).
  reputation        text NOT NULL DEFAULT 'unknown',
  reputation_detail text,
  scanned_at        timestamptz NOT NULL DEFAULT now()
);

-- The panel sorts flagged tenants to the top.
CREATE INDEX IF NOT EXISTS idx_abuse_signals_flagged
  ON abuse_signals (egress_flagged, reputation) WHERE egress_flagged OR reputation = 'flagged';

ALTER TABLE abuse_signals ENABLE ROW LEVEL SECURITY;
