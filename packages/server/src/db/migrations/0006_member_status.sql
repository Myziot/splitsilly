-- 0006_member_status.sql — three-state seats (feature-invite-vs-add-member D1/D7)
-- active = joined real member; added = admin placeholder in the math;
-- invited = passive ghost (roster only, mathematically inert).
-- Idempotent; backfill maps existing placeholder seats to 'added'.

DO $$ BEGIN
  CREATE TYPE member_status AS ENUM ('active', 'added', 'invited');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE group_members
  ADD COLUMN IF NOT EXISTS status member_status NOT NULL DEFAULT 'active';

-- Backfill: admin placeholder ghosts become 'added' (behavior-identical).
UPDATE group_members gm
SET status = 'added'
FROM users u
WHERE u.id = gm.user_id
  AND u.is_placeholder = TRUE
  AND gm.status = 'active';
