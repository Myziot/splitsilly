-- 0007_email_verification.sql — feature-email-verification.md (D2/D3 + DB-backed limits)
-- 1) users.email_verified — soft-gate flag. Grandfather (D3): every EXISTING
--    account is verified; only new signups start false.
-- 2) email_verification_tokens — fork of password_reset_tokens (hashed token,
--    expiry, single active token per user). No raw_token column: unlike reset
--    links there is no operator-display requirement.
-- 3) rate_hits + auth_locks — DB-backed rate limiting / lockout so limits and
--    lockouts survive service restarts (they were in-memory Maps before).
-- Idempotent: safe to re-run.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;

-- Grandfather: all pre-existing accounts count as verified (D3).
UPDATE users SET email_verified = TRUE WHERE email_verified = FALSE;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- SHA-256 of the random token in the link; the raw token is never stored.
  token_hash varchar(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emailverif_user ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_emailverif_expires ON email_verification_tokens(expires_at);

-- Fixed-window rate hits: one row per request, keyed by limiter label + client
-- key (IP or user id). bucket_ts truncated to the window by the app.
CREATE TABLE IF NOT EXISTS rate_hits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket text NOT NULL,           -- 'login' | 'register' | 'resend-verify'
  key text NOT NULL,              -- ip or user id
  hit_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_hits_key ON rate_hits(bucket, key, hit_at);

-- Per-account lockout (survives restarts; was a Map).
CREATE TABLE IF NOT EXISTS auth_locks (
  key text PRIMARY KEY,           -- normalized email
  fails integer NOT NULL DEFAULT 0,
  locked_until timestamptz
);
