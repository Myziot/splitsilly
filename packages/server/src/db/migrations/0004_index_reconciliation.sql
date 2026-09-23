-- 0004: index reconciliation (audit 2026-09-23)
-- 1) Creates indexes on HOT lookup columns that had NONE (idempotent).
-- 2) All index names here (incl. the pre-existing migration-era ones) are now
--    ALSO declared in schema.ts so `drizzle-kit push` can no longer DROP them.
-- NOTE: idx_balance_plans_book is intentionally NOT dropped even though
-- book_id is unused post-redesign — cheap to keep, harmless.

CREATE INDEX IF NOT EXISTS idx_expense_splits_expense ON expense_splits (expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_user ON expense_splits (user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses (group_id);
CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements (group_id);
CREATE INDEX IF NOT EXISTS idx_balance_plans_group ON balance_plans (group_id);
