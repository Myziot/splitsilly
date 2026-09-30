-- 0005: placeholder members (feature-placeholder-member.md, Decision 1 + 3)
-- 1) users.is_placeholder — marks "ghost" rows: people an admin added before
--    they registered. Real rows keep the flag false.
-- 2) Swap the FULL unique email constraint for a PARTIAL unique index:
--    at most one REAL account per email; ghosts may share an email with a
--    real account (claim/merge) or across groups (invitation inbox).
-- Idempotent: safe to re-run.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_placeholder boolean NOT NULL DEFAULT false;

-- Drop the legacy full-unique constraint (its name in this DB is
-- users_email_unique; users_email_key is the drizzle-kit-generate spelling —
-- drop whichever exists, ignore the rest).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique' AND conrelid = 'users'::regclass) THEN
    ALTER TABLE users DROP CONSTRAINT users_email_unique;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_key' AND conrelid = 'users'::regclass) THEN
    ALTER TABLE users DROP CONSTRAINT users_email_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_real_unique
  ON users (email)
  WHERE is_placeholder = false;
