-- Migration 0003: password-reset stop-gap + operator back-office.
--
-- Adds:
--   * users.is_admin               boolean (operator/back-office flag)
--   * users.password_reset_requested  boolean (operator asked to issue a link)
--   * password_reset_tokens table  one-time, short-lived reset links
--
-- The SAME reset-token machinery backs the future self-service "forgot
-- password" email flow once Resend is wired up — no rework needed later.
-- All ALTERs are idempotent (IF NOT EXISTS / guard blocks) so re-running is safe.

BEGIN;

-- 1) users.is_admin
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) users.password_reset_requested
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_requested BOOLEAN NOT NULL DEFAULT FALSE;

-- 3) password_reset_tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(64) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast token lookup + per-user invalidation.
CREATE INDEX IF NOT EXISTS idx_pwreset_user ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_pwreset_expires ON password_reset_tokens (expires_at);

COMMIT;
