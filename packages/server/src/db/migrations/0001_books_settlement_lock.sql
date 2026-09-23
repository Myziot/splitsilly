-- Books & settlement-lock migration (Phase 1)
-- Adds accounting "books" so groups can close a period, freeze who-owes-who,
-- and open a fresh book. Existing groups get one OPEN book; their expenses and
-- settlements are reassigned to it. Group-level open/closed status added.

BEGIN;

-- Enums
DO $$ BEGIN
  CREATE TYPE book_status AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE group_status AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- books table
CREATE TABLE IF NOT EXISTS books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  status book_status NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_books_group ON books(group_id);

-- balance_plans (frozen who-owes-who snapshot at lock time)
CREATE TABLE IF NOT EXISTS balance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES users(id),
  to_user_id uuid NOT NULL REFERENCES users(id),
  amount numeric(12,2) NOT NULL,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_balance_plans_book ON balance_plans(book_id);

-- expenses.book_id + is_standing
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS book_id uuid REFERENCES books(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_standing boolean NOT NULL DEFAULT false;

-- settlements.book_id
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS book_id uuid REFERENCES books(id) ON DELETE SET NULL;

-- groups.status + closed_at
ALTER TABLE groups ADD COLUMN IF NOT EXISTS status group_status NOT NULL DEFAULT 'open';
ALTER TABLE groups ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- Backfill: one OPEN book per group; assign existing expenses + settlements to it.
DO $$
DECLARE
  g RECORD;
  b uuid;
BEGIN
  FOR g IN SELECT id FROM groups LOOP
    -- Skip if group already has a book (idempotent re-run safe).
    IF NOT EXISTS (SELECT 1 FROM books WHERE group_id = g.id) THEN
      INSERT INTO books (group_id, status) VALUES (g.id, 'open') RETURNING id INTO b;
      UPDATE expenses SET book_id = b WHERE group_id = g.id AND book_id IS NULL;
      UPDATE settlements SET book_id = b WHERE group_id = g.id AND book_id IS NULL;
    END IF;
  END LOOP;
END $$;

COMMIT;
