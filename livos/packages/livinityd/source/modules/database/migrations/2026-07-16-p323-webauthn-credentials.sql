-- Phase 323 (IDENT-03) — WebAuthn / passkey credentials.
--
-- Documentation mirror of the schema.sql additive block. There is no live
-- migration runner (see migrations/index.ts): schema.sql is applied
-- idempotently at boot by initDatabase() with CREATE TABLE IF NOT EXISTS.
-- This file is the discrete, reviewable, hand-runnable artifact for the same
-- change. Additive / expand-only per the operator-locked invariant
-- (migrations/index.ts:16-26): no destructive ALTER/DROP.
--
-- One row per enrolled authenticator. credential_id is the globally-unique
-- lookup key (the login path resolves the owning user from it). public_key is
-- stored PLAINTEXT/base64 and is NOT secret — the authenticator holds the
-- private key, so there is NO DEK (unlike TOTP's totp_secret_enc). counter is
-- the authenticator signature counter (replay defence, bumped on each auth).
-- Persisted from the @simplewebauthn/server v13 NESTED
-- registrationInfo.credential.{id, publicKey, counter, transports} shape.

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key    TEXT NOT NULL,
  counter       BIGINT NOT NULL DEFAULT 0,
  transports    JSONB,
  nickname      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, credential_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webauthn_credential_id ON webauthn_credentials (credential_id);
