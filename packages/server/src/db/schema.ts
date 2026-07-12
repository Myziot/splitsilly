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
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
// Enums
export const splitModeEnum = pgEnum('split_mode', ['equal', 'percent', 'shares']);
export const memberRoleEnum = pgEnum('member_role', ['admin', 'member']);
export const expenseEditEnum = pgEnum('expense_edit', ['admin_only', 'creator_admin', 'creator_only', 'all_members']);
export const expenseTypeEnum = pgEnum('expense_type', ['trip', 'household', 'event', 'project', 'general']);

// Users
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
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
});

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
}));

// Group Members
export const groupMembers = pgTable('group_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: memberRoleEnum('role').default('member').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
});

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

// Expenses
export const expenses = pgTable('expenses', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  description: varchar('description', { length: 255 }).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(), // original currency
  currency: varchar('currency', { length: 3 }).notNull(), // ISO 4217
  exchangeRate: numeric('exchange_rate', { precision: 10, scale: 6 }), // null if same as group currency
  amountMaster: numeric('amount_master', { precision: 12, scale: 2 }).notNull(), // group master currency
  paidBy: uuid('paid_by').notNull().references(() => users.id),
  addedBy: uuid('added_by').notNull().references(() => users.id),
  categoryId: uuid('category_id').references(() => categories.id),
  expenseDate: date('expense_date').notNull().defaultNow(),
  receiptPath: varchar('receipt_path', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  group: one(groups, {
    fields: [expenses.groupId],
    references: [groups.id],
  }),
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
});

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
  fromUserId: uuid('from_user_id').notNull().references(() => users.id),
  toUserId: uuid('to_user_id').notNull().references(() => users.id),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(), // group master currency
  description: varchar('description', { length: 255 }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const settlementsRelations = relations(settlements, ({ one }) => ({
  group: one(groups, {
    fields: [settlements.groupId],
    references: [groups.id],
  }),
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
});

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
});

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
});

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
});

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
