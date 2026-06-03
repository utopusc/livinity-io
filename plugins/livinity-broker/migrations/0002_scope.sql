-- Phase 256-02 (WS-B / SC4b): per-app metered virtual-key scope.
-- Adds a `scope` jsonb column carrying the per-app budget + model allowlist so a
-- key minted by mintMeteredKeyForApp() is genuinely metered (budget-capped +
-- model-allowlisted) and not unscoped. Idempotent (IF NOT EXISTS).

ALTER TABLE plugin_livinity_broker.api_keys
  ADD COLUMN IF NOT EXISTS scope jsonb;
