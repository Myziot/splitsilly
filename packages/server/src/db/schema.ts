import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  numeric,
  boolean,
  date,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
// Enums
export const splitModeEnum = pgEnum('split_mode', ['equal', 'percent', 'shares']);
export const memberRoleEnum = pgEnum('member_role', ['admin', 'member']);
export const expenseEditEnum = pgEnum('expense_edit', ['admin_only', 'creator_admin', 'creator_only', 'all_members']);
export const expenseTypeEnum = pgEnum('expense_type', ['trip', 'household', 'event', 'project', 'general']);
// Book (accounting period) status. Exactly one OPEN book per group at a time.
export const bookStatusEnum = pgEnum('book_status', ['open', 'closed']);
// Group-level status. 'closed' blocks member-adds + expense-adds.
export const groupStatusEnum = pgEnum('group_status', ['open', 'closed']);

// Users
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  // Operator back-office flag. True only for the seeded admin account, which
  // may use the /api/v1/admin/* endpoints (list users, mint password-reset
  // links). Session-gated; never self-service.
  isAdmin: boolean('is_admin').default(false).notNull(),
  // Set when an operator (admin) has been asked to issue a reset link for this
  // user. Purely cosmetic: surfaces a "reset requested" hint in the admin
  // panel and lets the login page message know outreach already happened.
  passwordResetRequested: boolean('password_reset_requested').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  authProviders: many(authProviders),
  groupsCreated: many(groups, { relationName: 'creator' }),
  groupMemberships: many(groupMembers),
  expensesPaid: many(expenses, { relationName: 'payer' }),
  expensesAdded: many(expenses, { relationName: 'adder' }),
  expenseSplits: many(expenseSplits),
  settlementsFrom: many(settlements, { relationName: 'fromUser' }),
  settlementsTo: many(settlements, { relationName: 'toUser' }),
}));

// Auth Providers (OAuth scaffolding)
export const authProviders = pgTable('auth_providers', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 50 }).notNull(), // 'google', 'github', etc.
  providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const authProvidersRelations = relations(authProviders, ({ one }) => ({
  user: one(users, {
    fields: [authProviders.userId],
    references: [users.id],
  }),
}));

// Sessions
export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 64 }).notNull(), // SHA-256 hash
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // Declared here (audit 2026-09-23) so drizzle-kit push cannot drop them.
  index('idx_sessions_token').on(table.token),
  index('idx_sessions_expires').on(table.expiresAt),
]);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

// Groups
export const groups = pgTable('groups', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(), // ISO 4217
  inviteCode: varchar('invite_code', { length: 20 }).notNull().unique(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  expenseEdit: expenseEditEnum('expense_edit').default('creator_admin').notNull(),
  expenseType: expenseTypeEnum('expense_type').default('general').notNull(),
  status: groupStatusEnum('status').default('open').notNull(), // group-level open/closed
  closedAt: timestamp('closed_at', { withTimezone: true }),
  // Lock-book toggle: when true, the suggested who-pays-whom list is FROZEN
  // (it is stored in balance_plans and struck as payments are made instead of
  // being recomputed live). Per-person balances + payment log stay live always.
  isBookLocked: boolean('is_book_locked').default(false).notNull(),
  // Divergence flag: set true when a recorded payment does NOT match the frozen
  // plan (off-plan direction, or over-payment beyond a leg's remaining). Tells
  // the client to show the "payments diverged — recalculate" banner. Reset to
  // false whenever the plan is (re)frozen — a fresh snapshot is the truth.
  planDiverged: boolean('plan_diverged').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const groupsRelations = relations(groups, ({ one, many }) => ({
  creator: one(users, {
    fields: [groups.createdBy],
    references: [users.id],
    relationName: 'creator',
  }),
  members: many(groupMembers),
  expenses: many(expenses),
  settlements: many(settlements),
  books: many(books),
}));

// Group Members
export const groupMembers = pgTable('group_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: memberRoleEnum('role').default('member').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_group_members_user').on(table.userId),
]);

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, {
    fields: [groupMembers.groupId],
    references: [groups.id],
  }),
  user: one(users, {
    fields: [groupMembers.userId],
    references: [users.id],
  }),
}));

// Categories
export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 50 }).notNull(),
  icon: varchar('icon', { length: 10 }).notNull(), // emoji
  color: varchar('color', { length: 7 }), // hex color, nullable
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const categoriesRelations = relations(categories, ({ many }) => ({
  expenses: many(expenses),
}));

// Books — accounting periods. Each group has exactly one OPEN book; locking
// closes the current book and opens a fresh one. Expenses/settlements belong to
// a book; closing a book snapshots its who-owes-who plan into balance_plans.
export const books = pgTable('books', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  status: bookStatusEnum('status').default('open').notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_books_group').on(table.groupId),
]);

export const booksRelations = relations(books, ({ one, many }) => ({
  group: one(groups, { fields: [books.groupId], references: [groups.id] }),
  expenses: many(expenses),
  settlements: many(settlements),
  plans: many(balancePlans),
}));

// Frozen who-owes-who snapshot taken when a group is "book-locked". While
// locked, settlements strike these rows (paid_amount++) instead of re-running
// the optimizer, so the suggested list stays put as folks pay. Group-scoped:
// book_id is NULL (borrowed from the books era; kept for the enum's FK).
export const balancePlans = pgTable('balance_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  bookId: uuid('book_id').references(() => books.id, { onDelete: 'set null' }),
  fromUserId: uuid('from_user_id').notNull().references(() => users.id),
  toUserId: uuid('to_user_id').notNull().references(() => users.id),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(), // group master currency
  // Amount already paid toward this planned leg (partial settlements supported).
  paidAmount: numeric('paid_amount', { precision: 12, scale: 2 }).default('0').notNull(),
  // When an over-payment is struck against a leg, the excess is represented as a
  // NEW reverse leg (to->from). reverseOf points back to the original leg so a
  // revert can unwind both cleanly. Null for normal legs.
  reverseOf: uuid('reverse_of').references(() => balancePlans.id, { onDelete: 'cascade' }),
  // True once a leg's remaining hits 0 (fully struck by payments). Settled legs
  // stay visible above the line, greyed with a check, until a recalc absorbs them.
  settled: boolean('settled').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_balance_plans_book').on(table.bookId),
  index('idx_balance_plans_group').on(table.groupId),
]);

export const balancePlansRelations = relations(balancePlans, ({ one }) => ({
  book: one(books, { fields: [balancePlans.bookId], references: [books.id] }),
  fromUser: one(users, { fields: [balancePlans.fromUserId], references: [users.id] }),
  toUser: one(users, { fields: [balancePlans.toUserId], references: [users.id] }),
}));

// Expenses
export const expenses = pgTable('expenses', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  bookId: uuid('book_id').references(() => books.id, { onDelete: 'set null' }), // which accounting period; null only transiently
  description: varchar('description', { length: 255 }).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(), // original currency
  currency: varchar('currency', { length: 3 }).notNull(), // ISO 4217
  exchangeRate: numeric('exchange_rate', { precision: 10, scale: 6 }), // null if same as group currency
  amountMaster: numeric('amount_master', { precision: 12, scale: 2 }).notNull(), // group master currency
  paidBy: uuid('paid_by').notNull().references(() => users.id),
  addedBy: uuid('added_by').notNull().references(() => users.id),
  categoryId: uuid('category_id').references(() => categories.id),
  isStanding: boolean('is_standing').default(false).notNull(), // recurring/household — bypasses lock
  expenseDate: date('expense_date').notNull().defaultNow(),
  receiptPath: varchar('receipt_path', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_expenses_group').on(table.groupId),
]);

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  group: one(groups, {
    fields: [expenses.groupId],
    references: [groups.id],
  }),
  book: one(books, { fields: [expenses.bookId], references: [books.id] }),
  payer: one(users, {
    fields: [expenses.paidBy],
    references: [users.id],
    relationName: 'payer',
  }),
  adder: one(users, {
    fields: [expenses.addedBy],
    references: [users.id],
    relationName: 'adder',
  }),
  category: one(categories, {
    fields: [expenses.categoryId],
    references: [categories.id],
  }),
  splits: many(expenseSplits),
}));

// Expense Splits
export const expenseSplits = pgTable('expense_splits', {
  id: uuid('id').defaultRandom().primaryKey(),
  expenseId: uuid('expense_id').notNull().references(() => expenses.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  splitMode: splitModeEnum('split_mode').notNull(),
  value: numeric('value', { precision: 10, scale: 4 }), // NULL for equal, 0-100 for percent, positive int for shares
}, (table) => [
  index('idx_expense_splits_expense').on(table.expenseId),
  index('idx_expense_splits_user').on(table.userId),
]);

export const expenseSplitsRelations = relations(expenseSplits, ({ one }) => ({
  expense: one(expenses, {
    fields: [expenseSplits.expenseId],
    references: [expenses.id],
  }),
  user: one(users, {
    fields: [expenseSplits.userId],
    references: [users.id],
  }),
}));

// Settlements
export const settlements = pgTable('settlements', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  bookId: uuid('book_id').references(() => books.id, { onDelete: 'set null' }), // book this payment settled
  fromUserId: uuid('from_user_id').notNull().references(() => users.id),
  toUserId: uuid('to_user_id').notNull().references(() => users.id),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(), // group master currency
  description: varchar('description', { length: 255 }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_settlements_group').on(table.groupId),
]);

export const settlementsRelations = relations(settlements, ({ one }) => ({
  group: one(groups, {
    fields: [settlements.groupId],
    references: [groups.id],
  }),
  book: one(books, { fields: [settlements.bookId], references: [books.id] }),
  fromUser: one(users, {
    fields: [settlements.fromUserId],
    references: [users.id],
    relationName: 'fromUser',
  }),
  toUser: one(users, {
    fields: [settlements.toUserId],
    references: [users.id],
    relationName: 'toUser',
  }),
  creator: one(users, {
    fields: [settlements.createdBy],
    references: [users.id],
  }),
}));

// Email send log — records every outbound transactional email (invites,
// settlement reminders, etc.) so the admin can audit volume and per-recipient
// frequency. Used to enforce "once per day per owing member" for reminders.
export const emailLogs = pgTable('email_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: varchar('type', { length: 40 }).notNull(), // 'invite' | 'reminder' | ...
  fromUserId: uuid('from_user_id').references(() => users.id), // sender/creditor (nullable for system sends)
  toUserId: uuid('to_user_id').references(() => users.id), // recipient/debtor
  toEmail: varchar('to_email', { length: 255 }).notNull(),
  groupId: uuid('group_id').references(() => groups.id),
  subject: varchar('subject', { length: 255 }).notNull(),
  resendId: varchar('resend_id', { length: 120 }), // Resend message id (if sent)
  status: varchar('status', { length: 20 }).notNull().default('sent'), // 'sent' | 'failed'
  errorMessage: varchar('error_message', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('email_logs_type_idx').on(table.type),
  index('email_logs_group_idx').on(table.groupId),
  index('email_logs_created_at_idx').on(table.createdAt),
]);

export const emailLogsRelations = relations(emailLogs, ({ one }) => ({
  group: one(groups, {
    fields: [emailLogs.groupId],
    references: [groups.id],
  }),
  fromUser: one(users, {
    fields: [emailLogs.fromUserId],
    references: [users.id],
  }),
  toUser: one(users, {
    fields: [emailLogs.toUserId],
    references: [users.id],
  }),
}));

// Notifications — in-app activity feed (join events, new expenses, settlements).
// One row per recipient; client builds the display text from `payload`.
export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 32 }).notNull(), // 'member_joined_review' | 'expense_added' | 'settlement_recorded'
  payload: jsonb('payload').notNull(), // { memberName, memberId, expenseCount?, expenseDesc?, payer?, payee?, amount?, currency?, groupName }
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_notifications_user_read').on(table.userId, table.isRead),
]);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  group: one(groups, {
    fields: [notifications.groupId],
    references: [groups.id],
  }),
}));

// Expense flags — marks a weighted (percent/shares) expense that needs the owner's
// attention after a member joined after it was created. Cleared when the owner edits it.
export const expenseFlags = pgTable('expense_flags', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  expenseId: uuid('expense_id').notNull().references(() => expenses.id, { onDelete: 'cascade' }),
  reason: varchar('reason', { length: 32 }).notNull(), // 'member_joined_after'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_expense_flags_expense').on(table.expenseId),
]);

export const expenseFlagsRelations = relations(expenseFlags, ({ one }) => ({
  user: one(users, {
    fields: [expenseFlags.userId],
    references: [users.id],
  }),
  group: one(groups, {
    fields: [expenseFlags.groupId],
    references: [groups.id],
  }),
  expense: one(expenses, {
    fields: [expenseFlags.expenseId],
    references: [expenses.id],
  }),
}));

// Group activity log — a single, transparent, group-wide feed of everything that
// happens in a group (joins, expenses created/edited/deleted, settlements). Visible
// to ALL members, including those who joined later (they see the full history). One
// row per event (not per recipient, unlike `notifications`). `details` is a jsonb the
// client renders per `action`; `createdAt` is timestamptz for exact date+time display.
export const groupActivity = pgTable('group_activity', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 32 }).notNull(), // 'member_joined' | 'expense_created' | 'expense_updated' | 'expense_deleted' | 'settlement_recorded'
  details: jsonb('details').notNull(), // { actorName, expenseDesc?, amount?, currency?, payer?, payee?, ... }
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_group_activity_group').on(table.groupId),
  index('idx_group_activity_created').on(table.createdAt),
]);

export const groupActivityRelations = relations(groupActivity, ({ one }) => ({
  group: one(groups, {
    fields: [groupActivity.groupId],
    references: [groups.id],
  }),
  actor: one(users, {
    fields: [groupActivity.actorId],
    references: [users.id],
  }),
}));

// Password-reset tokens — one-time, short-lived links handed to a user out of
// band (currently operator -> Telegram/Discord, since Resend email is down).
// The SAME machinery will back the future self-service "forgot password" email
// flow once Resend is wired up, so no rework is needed later.
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // SHA-256 of the random token sent in the link (we store the hash, never the
  // raw token — so a DB leak can't yield usable reset links).
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  // Raw token, retained so the operator admin panel can display the SAME active
  // link a user received by email (operator-only visibility, by product choice).
  // Nulled out when the token is consumed (see consumeResetToken).
  rawToken: varchar('raw_token', { length: 64 }),
  // How the active link was last delivered: 'admin' (shown in panel / copied) or
  // 'email' (sent via Resend). Cosmetic — surfaced in the admin panel.
  lastSentVia: varchar('last_sent_via', { length: 16 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_pwreset_user').on(table.userId),
  index('idx_pwreset_expires').on(table.expiresAt),
]);

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));
