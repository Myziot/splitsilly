import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

// Shared schemas
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  created_at: z.string().datetime(),
});

export const SessionSchema = z.object({
  user: UserSchema,
});

export const GroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  currency: z.string().length(3),
  invite_code: z.string(),
  created_by: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const GroupMemberSchema = z.object({
  id: z.string(),
  group_id: z.string(),
  user_id: z.string(),
  user: UserSchema,
  role: z.enum(['admin', 'member']),
  joined_at: z.string().datetime(),
});

export const CategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  color: z.string().nullable(),
  is_active: z.boolean(),
});

export const ExpenseSplitSchema = z.object({
  id: z.string(),
  expense_id: z.string(),
  user_id: z.string(),
  user: UserSchema,
  split_mode: z.enum(['equal', 'percent', 'shares']),
  value: z.number().nullable(),
});

export const ExpenseSchema = z.object({
  id: z.string(),
  group_id: z.string(),
  description: z.string(),
  amount: z.number(),
  currency: z.string().length(3),
  exchange_rate: z.number().nullable(),
  amount_master: z.number(),
  paid_by: z.string(),
  payer: UserSchema,
  added_by: z.string(),
  category_id: z.string().nullable(),
  category: CategorySchema.nullable(),
  expense_date: z.string(),
  receipt_path: z.string().nullable(),
  splits: z.array(ExpenseSplitSchema),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const SettlementSchema = z.object({
  id: z.string(),
  group_id: z.string(),
  from_user_id: z.string(),
  from_user: UserSchema,
  to_user_id: z.string(),
  to_user: UserSchema,
  amount: z.number(),
  description: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string().datetime(),
});

export const BalanceSchema = z.object({
  user_id: z.string(),
  user: UserSchema,
  balance: z.number(),
});

export const BalanceOptimizationSchema = z.object({
  transactions: z.array(
    z.object({
      from_user_id: z.string(),
      from_user: UserSchema,
      to_user_id: z.string(),
      to_user: UserSchema,
      amount: z.number(),
    })
  ),
  total_transactions: z.number(),
});

// Request schemas
export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
});

export const CreateGroupRequestSchema = z.object({
  name: z.string().min(1),
  currency: z.string().length(3),
});

export const InviteMemberRequestSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

export const CreateExpenseRequestSchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3),
  paid_by: z.string(),
  category_id: z.string().nullable(),
  expense_date: z.string(),
  splits: z.array(
    z.object({
      user_id: z.string(),
      split_mode: z.enum(['equal', 'percent', 'shares']),
      value: z.number().nullable(),
    })
  ),
});

export const CreateSettlementRequestSchema = z.object({
  from_user_id: z.string(),
  to_user_id: z.string(),
  amount: z.number().positive(),
  description: z.string().nullable(),
});

export const CreateCategoryRequestSchema = z.object({
  name: z.string().min(1),
  icon: z.string(),
  color: z.string().nullable(),
});

export const UpdateCategoryRequestSchema = z.object({
  name: z.string().min(1).optional(),
  icon: z.string().optional(),
  color: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

// Error response
export const ErrorResponse = z.object({ error: z.string() });

// API Contract
export const contract = c.router({
  // Auth
  login: {
    method: 'POST',
    path: '/api/v1/auth/login',
    body: LoginRequestSchema,
    responses: {
      200: SessionSchema,
      401: ErrorResponse,
    },
    summary: 'Login with email and password',
  },
  register: {
    method: 'POST',
    path: '/api/v1/auth/register',
    body: RegisterRequestSchema,
    responses: {
      201: SessionSchema,
      409: ErrorResponse,
    },
    summary: 'Register a new user',
  },
  logout: {
    method: 'POST',
    path: '/api/v1/auth/logout',
    body: c.noBody(),
    responses: {
      204: z.never(),
    },
    summary: 'Logout current user',
  },
  me: {
    method: 'GET',
    path: '/api/v1/auth/me',
    responses: {
      200: SessionSchema,
      401: ErrorResponse,
    },
    summary: 'Get current user',
  },

  // Groups
  getGroups: {
    method: 'GET',
    path: '/api/v1/groups',
    responses: {
      200: z.array(GroupSchema),
    },
    summary: 'Get all groups for current user',
  },
  createGroup: {
    method: 'POST',
    path: '/api/v1/groups',
    body: CreateGroupRequestSchema,
    responses: {
      201: GroupSchema,
    },
    summary: 'Create a new group',
  },
  getGroup: {
    method: 'GET',
    path: '/api/v1/groups/:groupId',
    responses: {
      200: GroupSchema,
      404: ErrorResponse,
    },
    summary: 'Get group details',
  },
  getGroupMembers: {
    method: 'GET',
    path: '/api/v1/groups/:groupId/members',
    responses: {
      200: z.array(GroupMemberSchema),
      404: ErrorResponse,
    },
    summary: 'Get group members',
  },
  kickMember: {
    method: 'DELETE',
    path: '/api/v1/groups/:groupId/members/:userId',
    responses: {
      204: z.never(),
      403: ErrorResponse,
      404: ErrorResponse,
    },
    summary: 'Kick a member from the group (admin only)',
  },
  deleteGroup: {
    method: 'DELETE',
    path: '/api/v1/groups/:groupId',
    responses: {
      204: z.never(),
      403: ErrorResponse,
      404: ErrorResponse,
    },
    summary: 'Delete a group (admin only)',
  },
  inviteMember: {
    method: 'POST',
    path: '/api/v1/groups/:groupId/invite',
    body: InviteMemberRequestSchema,
    responses: {
      200: z.object({
        ok: z.boolean(),
        invite_code: z.string(),
        invite_link: z.string(),
        sent_to: z.string(),
      }),
      400: ErrorResponse,
      404: ErrorResponse,
      503: ErrorResponse,
    },
    summary: 'Invite a member by email (Resend scaffolding)',
  },

  // Join
  joinGroup: {
    method: 'POST',
    path: '/api/v1/join/:inviteCode',
    body: c.noBody(),
    responses: {
      200: GroupSchema,
      404: ErrorResponse,
      410: ErrorResponse,
    },
    summary: 'Join a group with invite code',
  },

  // Expenses
  getExpenses: {
    method: 'GET',
    path: '/api/v1/groups/:groupId/expenses',
    responses: {
      200: z.array(ExpenseSchema),
      404: ErrorResponse,
    },
    summary: 'Get all expenses for a group',
  },
  createExpense: {
    method: 'POST',
    path: '/api/v1/groups/:groupId/expenses',
    body: CreateExpenseRequestSchema,
    responses: {
      201: ExpenseSchema,
      400: ErrorResponse,
      404: ErrorResponse,
    },
    summary: 'Create a new expense',
  },
  updateExpense: {
    method: 'PUT',
    path: '/api/v1/groups/:groupId/expenses/:expenseId',
    body: CreateExpenseRequestSchema,
    responses: {
      200: ExpenseSchema,
      403: ErrorResponse,
      404: ErrorResponse,
    },
    summary: 'Update an expense (creator only)',
  },
  deleteExpense: {
    method: 'DELETE',
    path: '/api/v1/groups/:groupId/expenses/:expenseId',
    responses: {
      204: z.never(),
      403: ErrorResponse,
      404: ErrorResponse,
    },
    summary: 'Delete an expense (creator only)',
  },
  uploadReceipt: {
    method: 'POST',
    path: '/api/v1/groups/:groupId/expenses/:expenseId/receipt',
    body: c.noBody(),
    responses: {
      200: z.object({ receipt_path: z.string() }),
      404: ErrorResponse,
    },
    summary: 'Upload a receipt image',
  },

  // Settlements
  getSettlements: {
    method: 'GET',
    path: '/api/v1/groups/:groupId/settlements',
    responses: {
      200: z.array(SettlementSchema),
      404: ErrorResponse,
    },
    summary: 'Get all settlements for a group',
  },
  createSettlement: {
    method: 'POST',
    path: '/api/v1/groups/:groupId/settlements',
    body: CreateSettlementRequestSchema,
    responses: {
      201: SettlementSchema,
      400: ErrorResponse,
      404: ErrorResponse,
    },
    summary: 'Create a new settlement',
  },

  // Balances
  getBalances: {
    method: 'GET',
    path: '/api/v1/groups/:groupId/balances',
    responses: {
      200: z.array(BalanceSchema),
      404: ErrorResponse,
    },
    summary: 'Get current balances for a group',
  },
  optimizeBalances: {
    method: 'GET',
    path: '/api/v1/groups/:groupId/balances/optimize',
    responses: {
      200: BalanceOptimizationSchema,
      404: ErrorResponse,
    },
    summary: 'Get optimized balance settlements',
  },

  // Categories
  getCategories: {
    method: 'GET',
    path: '/api/v1/categories',
    responses: {
      200: z.array(CategorySchema),
    },
    summary: 'Get all active categories',
  },
  createCategory: {
    method: 'POST',
    path: '/api/v1/categories',
    body: CreateCategoryRequestSchema,
    responses: {
      201: CategorySchema,
    },
    summary: 'Create a new category (admin only)',
  },
  updateCategory: {
    method: 'PUT',
    path: '/api/v1/categories/:categoryId',
    body: UpdateCategoryRequestSchema,
    responses: {
      200: CategorySchema,
      404: ErrorResponse,
    },
    summary: 'Update a category (admin only)',
  },
  deleteCategory: {
    method: 'DELETE',
    path: '/api/v1/categories/:categoryId',
    responses: {
      204: z.never(),
      404: ErrorResponse,
    },
    summary: 'Delete a category (admin only)',
  },
});

// Client
export const api = contract;
