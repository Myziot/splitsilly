-- Migration 0002: re-purpose the "books" machinery into a single Lock-book toggle.
--
-- We keep the books / balance_plans tables (per project decision) but stop
-- splitting expenses into open/closed periods. The frozen "who-pays-whom" list
-- is now group-scoped:
--   * groups.is_book_locked  (boolean toggle)
--   * balance_plans.group_id (NOT NULL) + balance_plans.book_id made nullable
--
-- Stale per-book plan rows from the old model are cleared (they were computed
-- with a book-scoping bug anyway) and any group left in status='closed' is
-- reset to 'open' (closing a group is no longer a feature).

BEGIN;

-- 1) Add groups.is_book_locked (idempotent).
ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_book_locked BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) Drop the old non-null constraint on balance_plans.book_id and add group_id.
--    On Postgres you cannot make a NOT NULL column nullable with IF EXISTS, so
--    we use a DO block that only alters when the column is currently NOT NULL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'balance_plans' AND column_name = 'book_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE balance_plans ALTER COLUMN book_id DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE balance_plans ADD COLUMN IF NOT EXISTS group_id UUID;

-- 3) Backfill group_id for any surviving rows (point them at their book's group)
--    so the NOT NULL add below succeeds, then clear them — the old per-book plans
--    are obsolete.
UPDATE balance_plans bp
SET group_id = b.group_id
FROM books b
WHERE bp.book_id = b.id AND bp.group_id IS NULL;

-- Clear stale per-book plan rows (frozen list is now computed fresh on lock).
DELETE FROM balance_plans;

-- 4) Make group_id NOT NULL now that the table is empty.
ALTER TABLE balance_plans ALTER COLUMN group_id SET NOT NULL;

-- 5) Reset any group left in status='closed' back to 'open' (closing a group is
--    no longer a feature; the only meaningful toggle is is_book_locked).
UPDATE groups SET status = 'open', closed_at = NULL WHERE status = 'closed';

COMMIT;
