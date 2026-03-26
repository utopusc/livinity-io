-- =========================================================================
-- Custom Domains (user-registered domains for custom domain management, v19.0)
-- =========================================================================
CREATE TABLE IF NOT EXISTS custom_domains (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL,
  domain              TEXT NOT NULL UNIQUE,
  verification_token  TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending_dns',
  dns_a_verified      BOOLEAN NOT NULL DEFAULT false,
  dns_txt_verified    BOOLEAN NOT NULL DEFAULT false,
  error_message       TEXT,
  last_dns_check      TIMESTAMPTZ,
  verified_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================================
-- Indexes
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_custom_domains_user_id ON custom_domains(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_domains_domain ON custom_domains(domain);
CREATE INDEX IF NOT EXISTS idx_custom_domains_status ON custom_domains(status);
