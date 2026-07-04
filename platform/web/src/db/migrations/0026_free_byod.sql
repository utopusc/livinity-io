-- Free bring-your-own-domain (BYOD) tier.
--
-- A `free_byod` account creates a Livinity account and gets a liv_k_ install key
-- for MARKET/CATALOG access + the Liv token — but brings their OWN domain + OWN
-- Cloudflare, so the platform NEVER provisions a livinity.io tunnel/subdomain for
-- them (the box does its own DNS via cf-local.ts using the operator's token).
--
-- getSubscriptionStatus() treats free_byod=true like legacy_free for the ACCESS
-- boolean (so key issuance + catalog gates pass) but reports plan='free'. It is
-- distinct from legacy_free (grandfathered livinity.io accounts) and from a paid
-- subscription. Default FALSE → every existing account (paid, trial, legacy) is
-- unchanged: free_byod is opt-in and only ever true for accounts explicitly
-- created on the free BYOD tier.
--
-- Additive + idempotent (matches 0016_stripe_billing.sql ADD COLUMN IF NOT EXISTS
-- style). Safe to run before or after the code deploy: getSubscriptionStatus and
-- ensureProvisionedByCustomerId both tolerate the column being absent (treated as
-- free_byod=false → no free access + normal provisioning, the safe direction).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS free_byod BOOLEAN NOT NULL DEFAULT FALSE;
