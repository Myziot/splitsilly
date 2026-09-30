import { Request, Response } from 'express';
import { db } from '../db';
import { expenses, expenseSplits, groups, groupMembers, users, categories, expenseFlags } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getExchangeRate, convertAmount } from '../services/currency';
import { compressImage, validateImage, ensureUploadDir } from '../services/upload';
import { notifyGroupMembers, logGroupActivity } from './notifications';
import { broadcastGroupChanged } from '../sockets';
import { findInvitedSplitUser } from '../services/members';
import multer = require('multer');

// Multer config for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_UPLOAD_SIZE || '10485760', 10) },
});

// Format a Date as YYYY-MM-DD string. IMPORTANT: uses LOCAL date components,
// not UTC. Using toISOString() here (which is UTC) shifts the date by the
// server's offset — in PDT a 7pm entry would be stamped as the next day.
function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function formatDate(d: Date | string): string {
  if (typeof d === 'string') return d; // already YYYY-MM-DD (date input / DB date)
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${y}-${m}-${day}`;
}
/** Today's date as YYYY-MM-DD in the server's local timezone. */
function todayLocal(): string {
  return formatDate(new Date());
}

// Helper to format a Date object as ISO string
function formatISO(d: Date): string {
  return d.toISOString();
}

// Decide whether `userId` may edit/delete `expense`, based on the group's
// expense_edit setting. Returns the setting value too so callers can 403 with a reason.
export async function checkExpenseEditPermission(
  groupId: string,
  userId: string,
  expense: { addedBy: string }
): Promise<{ allowed: boolean; setting: string }> {
  const groupRows = await db
    .select({ expenseEdit: groups.expenseEdit })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  const setting = groupRows[0]?.expenseEdit || 'creator_admin';

  const mem = await db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);

  const isAdmin = mem[0]?.role === 'admin';
  const isCreator = expense.addedBy === userId;

  let allowed = false;
  switch (setting) {
    case 'admin_only':
      allowed = isAdmin;
      break;
    case 'creator_admin':
      allowed = isAdmin || isCreator;
      break;
    case 'creator_only':
      allowed = isCreator;
      break;
    case 'all_members':
      allowed = true;
      break;
    default:
      allowed = isAdmin || isCreator;
  }
  return { allowed, setting };
}

export const expensesHandler = {
  getExpenses: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId } = req.params;

      // Check membership
      const membership = await db
        .select()
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId)
        ))
        .limit(1);

      if (membership.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const groupResult = await db
        .select({ currency: groups.currency, expenseEdit: groups.expenseEdit })
        .from(groups)
        .where(eq(groups.id, groupId))
        .limit(1);

      const groupCurrency = groupResult[0]?.currency;
      const groupExpenseEdit = groupResult[0]?.expenseEdit || 'creator_admin';

      const expenseResults = await db
        .select()
        .from(expenses)
        .where(eq(expenses.groupId, groupId))
        .orderBy(expenses.expenseDate);

      const result = [];
      for (const expense of expenseResults) {
        const splits = await db
          .select({
            id: expenseSplits.id,
            userId: expenseSplits.userId,
            splitMode: expenseSplits.splitMode,
            value: expenseSplits.value,
            userName: users.name,
            userEmail: users.email,
            userCreatedAt: users.createdAt,
          })
          .from(expenseSplits)
          .innerJoin(users, eq(expenseSplits.userId, users.id))
          .where(eq(expenseSplits.expenseId, expense.id));

        const payer = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.id, expense.paidBy))
          .limit(1);

        let category = null;
        if (expense.categoryId) {
          const catResult = await db
            .select()
            .from(categories)
            .where(eq(categories.id, expense.categoryId))
            .limit(1);
          category = catResult[0];
        }

        result.push({
          id: expense.id,
          group_id: expense.groupId,
          description: expense.description,
          amount: parseFloat(expense.amount.toString()),
          currency: expense.currency,
          exchange_rate: expense.exchangeRate ? parseFloat(expense.exchangeRate.toString()) : null,
          amount_master: parseFloat(expense.amountMaster.toString()),
          paid_by: expense.paidBy,
          payer: {
            id: payer[0].id,
            name: payer[0].name,
            email: payer[0].email,
            created_at: formatISO(payer[0].createdAt),
          },
          added_by: expense.addedBy,
          can_edit: (() => {
            const isCreator = expense.addedBy === userId;
            const isAdmin = membership[0]?.role === 'admin';
            switch (groupExpenseEdit) {
              case 'admin_only': return isAdmin;
              case 'creator_admin': return isAdmin || isCreator;
              case 'creator_only': return isCreator;
              case 'all_members': return true;
              default: return isAdmin || isCreator;
            }
          })(),
          category_id: expense.categoryId,
          category: category ? {
            id: category.id,
            name: category.name,
            icon: category.icon,
            color: category.color,
            is_active: category.isActive,
          } : null,
          expense_date: formatDate(expense.expenseDate),
          receipt_path: expense.receiptPath,
          splits: splits.map(s => ({
            id: s.id,
            expense_id: expense.id,
            user_id: s.userId,
            split_mode: s.splitMode,
            value: s.value ? parseFloat(s.value.toString()) : null,
            user: {
              id: s.userId,
              name: s.userName,
              email: s.userEmail,
              created_at: formatISO(s.userCreatedAt),
            },
          })),
          created_at: formatISO(expense.createdAt),
          updated_at: formatISO(expense.updatedAt),
        });
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('Get expenses error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  createExpense: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId } = req.params;
      const { description, amount, currency, paid_by, category_id, expense_date, splits, is_standing } = req.body;

      // Check membership
      const membership = await db
        .select()
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId)
        ))
        .limit(1);

      if (membership.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }

      // Once the book is LOCKED, no new (non-standing) expenses may be added.
      // Standing/household recurring expenses bypass the lock so ongoing shared
      // costs can still be logged after the book is closed for settlement.
      const lockRows = await db
        .select({ isBookLocked: groups.isBookLocked })
        .from(groups)
        .where(eq(groups.id, groupId))
        .limit(1);
      if (lockRows[0]?.isBookLocked && !is_standing) {
        return res.status(423).json({
          error: 'This book is locked. New expenses cannot be added until the book is unlocked.',
        });
      }

      // Get group currency
      const groupResult = await db
        .select({ currency: groups.currency })
        .from(groups)
        .where(eq(groups.id, groupId))
        .limit(1);

      const groupCurrency = groupResult[0]?.currency;

      // Calculate exchange rate
      let exchangeRate: number | null = null;
      let amountMaster: number;

      if (currency === groupCurrency) {
        exchangeRate = null;
        amountMaster = amount;
      } else {
        exchangeRate = await getExchangeRate(currency, groupCurrency, expense_date || todayLocal());
        if (exchangeRate === null) {
          return res.status(400).json({ error: 'Failed to get exchange rate. Please try again.' });
        }
        amountMaster = convertAmount(amount, exchangeRate);
      }

      // Validate splits
      if (!Array.isArray(splits) || splits.length === 0) {
        return res.status(400).json({ error: 'At least one member must be included in the split' });
      }
      // D1 guard (feature-invite-vs-add-member): a passive `invited` ghost
      // must NEVER receive split rows — balances read splits, so this single
      // write chokepoint is what keeps invited seats mathematically inert.
      const invitedHit = await findInvitedSplitUser(groupId, splits);
      if (invitedHit) {
        return res.status(400).json({ error: `${invitedHit} is invited but has not joined yet — an admin must add them to the group first.` });
      }
      const splitMode = splits[0]?.split_mode;
      if (splitMode === 'percent') {
        const totalPercent = splits.reduce((sum: number, s: any) => sum + (s.value || 0), 0);
        if (Math.abs(totalPercent - 100) > 0.01) {
          return res.status(400).json({ error: 'Percent splits must add up to 100%' });
        }
      } else if (splitMode === 'shares') {
        const totalShares = splits.reduce((sum: number, s: any) => sum + (s.value || 0), 0);
        if (totalShares === 0) {
          return res.status(400).json({ error: 'Shares must be greater than 0' });
        }
      }

      // Create expense - expenseDate is a Drizzle date column (string type)
      const expenseDateStr = expense_date ? formatDate(expense_date) : todayLocal();
      const expenseValues: any = {
        groupId,
        description,
        amount: amount.toString(),
        currency,
        amountMaster: amountMaster.toString(),
        paidBy: paid_by,
        addedBy: userId,
        expenseDate: expenseDateStr,
      };
      if (exchangeRate !== null) {
        expenseValues.exchangeRate = exchangeRate.toString();
      }
      if (category_id) {
        expenseValues.categoryId = category_id;
      }
      if (is_standing !== undefined) {
        expenseValues.isStanding = !!is_standing;
      }

      // ATOMIC: the expense row and its split rows must land together — a
      // partial write would leave an expense with zero/partial splits, which
      // the balance engine would silently mis-split.
      const expense = await db.transaction(async (tx) => {
        const created = await tx
          .insert(expenses)
          .values(expenseValues)
          .returning();

        const splitRows = splits.map((split: any) => {
          const splitValues: any = {
            expenseId: created[0].id,
            userId: split.user_id,
            splitMode: split.split_mode,
          };
          if (split.value !== undefined && split.value !== null) {
            splitValues.value = split.value.toString();
          }
          return splitValues;
        });
        await tx.insert(expenseSplits).values(splitRows);
        return created[0];
      });

      // Return created expense
      const splitsResult = await db
        .select({
          id: expenseSplits.id,
          userId: expenseSplits.userId,
          splitMode: expenseSplits.splitMode,
          value: expenseSplits.value,
          userName: users.name,
          userEmail: users.email,
          userCreatedAt: users.createdAt,
        })
        .from(expenseSplits)
        .innerJoin(users, eq(expenseSplits.userId, users.id))
        .where(eq(expenseSplits.expenseId, expense.id));

      const payer = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, expense.paidBy))
        .limit(1);

      // Fetch the category so the created expense includes it (mirrors GET).
      let createdCategory = null;
      if (expense.categoryId) {
        const catResult = await db
          .select()
          .from(categories)
          .where(eq(categories.id, expense.categoryId))
          .limit(1);
        if (catResult.length > 0) {
          const c = catResult[0];
          createdCategory = {
            id: c.id,
            name: c.name,
            icon: c.icon,
            color: c.color,
            is_active: c.isActive,
          };
        }
      }

      // Notify every OTHER member that a new expense was added.
      try {
        const gName = await db
          .select({ name: groups.name })
          .from(groups)
          .where(eq(groups.id, groupId))
          .limit(1);
        await notifyGroupMembers(groupId, userId, 'expense_added', {
          memberName: (req as any).user?.user?.name || (req as any).user?.user?.email?.split('@')[0] || 'A member',
          memberId: userId,
          expenseDesc: description,
          groupName: gName[0]?.name || 'this group',
        });
        await logGroupActivity(groupId, userId, 'expense_created', {
          actorName: (req as any).user?.user?.name || (req as any).user?.user?.email?.split('@')[0] || 'A member',
          expenseDesc: description,
          amount: amountMaster,
          currency,
        });
      } catch (notifyErr) {
        console.error('Expense notification error (non-fatal):', notifyErr);
      }

      // Compute the creator's edit permission for THIS new expense so the
      // client can show Edit/Delete immediately (mirrors updateExpense / list).
      const createPerm = await checkExpenseEditPermission(groupId, userId, {
        addedBy: expense.addedBy,
      });

      broadcastGroupChanged(groupId);
      res.status(201).json({
        id: expense.id,
        group_id: expense.groupId,
        description: expense.description,
        amount: parseFloat(expense.amount.toString()),
        currency: expense.currency,
        exchange_rate: expense.exchangeRate ? parseFloat(expense.exchangeRate.toString()) : null,
        amount_master: parseFloat(expense.amountMaster.toString()),
        paid_by: expense.paidBy,
        payer: {
          id: payer[0].id,
          name: payer[0].name,
          email: payer[0].email,
          created_at: formatISO(payer[0].createdAt),
        },
        added_by: expense.addedBy,
        can_edit: createPerm.allowed,
        category_id: expense.categoryId,
        category: createdCategory,
        expense_date: formatDate(expense.expenseDate),
        receipt_path: expense.receiptPath,
        splits: splitsResult.map(s => ({
          id: s.id,
          expense_id: expense.id,
          user_id: s.userId,
          split_mode: s.splitMode,
          value: s.value ? parseFloat(s.value.toString()) : null,
          user: {
            id: s.userId,
            name: s.userName,
            email: s.userEmail,
            created_at: formatISO(s.userCreatedAt),
          },
        })),
        created_at: formatISO(expense.createdAt),
        updated_at: formatISO(expense.updatedAt),
      });
    } catch (error) {
      console.error('Create expense error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  updateExpense: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId, expenseId } = req.params;
      const { description, amount, currency, paid_by, category_id, expense_date, splits } = req.body;

      // Check if user is the creator
      const expenseResult = await db
        .select()
        .from(expenses)
        .where(eq(expenses.id, expenseId))
        .limit(1);

      if (expenseResult.length === 0) {
        return res.status(404).json({ error: 'Expense not found' });
      }

      const expense = expenseResult[0];

      // Enforce group's "who can edit expenses" setting (admin/creator/any).
      const perm = await checkExpenseEditPermission(groupId, userId, { addedBy: expense.addedBy });
      if (!perm.allowed) {
        return res.status(403).json({ error: 'You do not have permission to edit this expense' });
      }

      // Get group currency (needed to recompute amount_master correctly)
      const groupResult = await db
        .select({ currency: groups.currency })
        .from(groups)
        .where(eq(groups.id, groupId))
        .limit(1);
      const groupCurrency = groupResult[0]?.currency;

      // Recompute master amount. Rate stays LOCKED at creation (impl-plan
      // decision #8): when the currency is unchanged we reuse the expense's
      // ORIGINAL stored rate — re-fetching today's rate would silently
      // re-price a months-old expense just because someone fixed a typo.
      // Only a genuine currency change (or a legacy row with no stored rate)
      // fetches fresh from Frankfurter.
      let exchangeRate: number | null = null;
      let amountMaster: number;
      const amt = parseFloat(amount);
      if (currency === groupCurrency) {
        exchangeRate = null;
        amountMaster = amt;
      } else if (currency === expense.currency && expense.exchangeRate) {
        exchangeRate = parseFloat(expense.exchangeRate.toString());
        amountMaster = convertAmount(amt, exchangeRate);
      } else {
        exchangeRate = await getExchangeRate(currency, groupCurrency, expense_date || todayLocal());
        if (exchangeRate === null) {
          return res.status(400).json({ error: 'Failed to get exchange rate. Please try again.' });
        }
        amountMaster = convertAmount(amt, exchangeRate);
      }

      // Validate splits
      if (!Array.isArray(splits) || splits.length === 0) {
        return res.status(400).json({ error: 'At least one member must be included in the split' });
      }
      // D1 guard (feature-invite-vs-add-member): a passive `invited` ghost
      // must NEVER receive split rows — balances read splits, so this single
      // write chokepoint is what keeps invited seats mathematically inert.
      const invitedHit = await findInvitedSplitUser(groupId, splits);
      if (invitedHit) {
        return res.status(400).json({ error: `${invitedHit} is invited but has not joined yet — an admin must add them to the group first.` });
      }
      const splitMode = splits[0]?.split_mode;
      if (splitMode === 'percent') {
        const totalPercent = splits.reduce((sum: number, s: any) => sum + (s.value || 0), 0);
        if (Math.abs(totalPercent - 100) > 0.01) {
          return res.status(400).json({ error: 'Percent splits must add up to 100%' });
        }
      } else if (splitMode === 'shares') {
        const totalShares = splits.reduce((sum: number, s: any) => sum + (s.value || 0), 0);
        if (totalShares === 0) {
          return res.status(400).json({ error: 'Shares must be greater than 0' });
        }
      }

      // Update expense - build update object dynamically for nullable fields
      const updateValues: any = {
        description,
        amount: amt.toString(),
        currency,
        exchangeRate: exchangeRate !== null ? exchangeRate.toString() : null,
        amountMaster: amountMaster.toString(),
        paidBy: paid_by,
        updatedAt: new Date(),
      };
      if (expense_date) {
        updateValues.expenseDate = formatDate(expense_date);
      }
      if (category_id !== undefined) {
        updateValues.categoryId = category_id;
      }

      // ATOMIC: update + split swap in one transaction — a crash between the
      // DELETE and the re-inserts would leave the expense with zero splits.
      await db.transaction(async (tx) => {
        await tx
          .update(expenses)
          .set(updateValues)
          .where(eq(expenses.id, expenseId));

        await tx
          .delete(expenseSplits)
          .where(eq(expenseSplits.expenseId, expenseId));

        const splitRows = splits.map((split: any) => {
          const splitValues: any = {
            expenseId,
            userId: split.user_id,
            splitMode: split.split_mode,
          };
          if (split.value !== undefined && split.value !== null) {
            splitValues.value = split.value.toString();
          }
          return splitValues;
        });
        await tx.insert(expenseSplits).values(splitRows);
      });

      // Editing clears any "needs review" flags on this expense (Decision 6).
      try {
        await db.delete(expenseFlags).where(eq(expenseFlags.expenseId, expenseId));
      } catch (flagErr) {
        console.error('Clear expense flags error (non-fatal):', flagErr);
      }

      // Transparent group log: expense edited.
      try {
        const actorName =
          (req as any).user?.user?.name || (req as any).user?.user?.email?.split('@')[0] || 'A member';
        await logGroupActivity(groupId, userId, 'expense_updated', {
          actorName,
          expenseDesc: description,
          amount: amountMaster,
          currency,
        });
      } catch (logErr) {
        console.error('Expense update log error (non-fatal):', logErr);
      }

      // Return the full updated expense (mirror createExpense) so the client
      // can replace it in state without a refetch.
      const splitsResult = await db
        .select({
          id: expenseSplits.id,
          userId: expenseSplits.userId,
          splitMode: expenseSplits.splitMode,
          value: expenseSplits.value,
          userName: users.name,
          userEmail: users.email,
          userCreatedAt: users.createdAt,
        })
        .from(expenseSplits)
        .innerJoin(users, eq(expenseSplits.userId, users.id))
        .where(eq(expenseSplits.expenseId, expenseId));

      const payer = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, paid_by))
        .limit(1);

      let updatedCategory = null;
      if (category_id) {
        const catResult = await db
          .select()
          .from(categories)
          .where(eq(categories.id, category_id))
          .limit(1);
        if (catResult.length > 0) {
          const c = catResult[0];
          updatedCategory = {
            id: c.id,
            name: c.name,
            icon: c.icon,
            color: c.color,
            is_active: c.isActive,
          };
        }
      }

      const updated = await db
        .select()
        .from(expenses)
        .where(eq(expenses.id, expenseId))
        .limit(1);

      // Recompute the requester's edit permission for this expense so the
      // client can keep the Edit/Delete buttons visible after an inline edit
      // (the store replaces the item with this response, so it must include can_edit).
      const editPerm = await checkExpenseEditPermission(groupId, userId, { addedBy: updated[0].addedBy });

      broadcastGroupChanged(groupId);
      res.status(200).json({
        id: updated[0].id,
        group_id: updated[0].groupId,
        description: updated[0].description,
        amount: parseFloat(updated[0].amount.toString()),
        currency: updated[0].currency,
        exchange_rate: updated[0].exchangeRate ? parseFloat(updated[0].exchangeRate.toString()) : null,
        amount_master: parseFloat(updated[0].amountMaster.toString()),
        paid_by: updated[0].paidBy,
        payer: {
          id: payer[0].id,
          name: payer[0].name,
          email: payer[0].email,
          created_at: formatISO(payer[0].createdAt),
        },
        added_by: updated[0].addedBy,
        can_edit: editPerm.allowed,
        category_id: updated[0].categoryId,
        category: updatedCategory,
        expense_date: formatDate(updated[0].expenseDate),
        receipt_path: updated[0].receiptPath,
        splits: splitsResult.map(s => ({
          id: s.id,
          expense_id: expenseId,
          user_id: s.userId,
          split_mode: s.splitMode,
          value: s.value ? parseFloat(s.value.toString()) : null,
          user: {
            id: s.userId,
            name: s.userName,
            email: s.userEmail,
            created_at: formatISO(s.userCreatedAt),
          },
        })),
        created_at: formatISO(updated[0].createdAt),
        updated_at: formatISO(updated[0].updatedAt),
      });
    } catch (error) {
      console.error('Update expense error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  deleteExpense: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId, expenseId } = req.params;

      // Check if user is the creator
      const expenseResult = await db
        .select()
        .from(expenses)
        .where(eq(expenses.id, expenseId))
        .limit(1);

      if (expenseResult.length === 0) {
        return res.status(404).json({ error: 'Expense not found' });
      }

      const expense = expenseResult[0];

      // Enforce group's "who can edit expenses" setting (covers delete too).
      const perm = await checkExpenseEditPermission(groupId, userId, { addedBy: expense.addedBy });
      if (!perm.allowed) {
        return res.status(403).json({ error: 'You do not have permission to delete this expense' });
      }

      // Transparent group log: expense deleted (capture details BEFORE delete).
      try {
        const actorName =
          (req as any).user?.user?.name || (req as any).user?.user?.email?.split('@')[0] || 'A member';
        await logGroupActivity(groupId, userId, 'expense_deleted', {
          actorName,
          expenseDesc: expense.description,
          amount: parseFloat(expense.amountMaster?.toString() || '0'),
          currency: expense.currency,
        });
      } catch (logErr) {
        console.error('Expense delete log error (non-fatal):', logErr);
      }

      await db.delete(expenses).where(eq(expenses.id, expenseId));
      broadcastGroupChanged(groupId);
      res.status(204).send();
    } catch (error) {
      console.error('Delete expense error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  uploadReceipt: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { expenseId } = req.params;

      // Check if user is the creator
      const expenseResult = await db
        .select()
        .from(expenses)
        .where(eq(expenses.id, expenseId))
        .limit(1);

      if (expenseResult.length === 0) {
        return res.status(404).json({ error: 'Expense not found' });
      }

      const expense = expenseResult[0];

      if (expense.addedBy !== userId) {
        return res.status(403).json({ error: 'Only the creator can upload receipts' });
      }

      // Handle file upload
      const file = (req as any).file;
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const error = validateImage(file.buffer, file.originalname);
      if (error) {
        return res.status(400).json({ error });
      }

      ensureUploadDir();
      const receiptPath = await compressImage(file.buffer, file.originalname);

      // Update expense with receipt path
      await db
        .update(expenses)
        .set({ receiptPath })
        .where(eq(expenses.id, expenseId));

      res.status(200).json({ receipt_path: receiptPath });
    } catch (error) {
      console.error('Upload receipt error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getExpenseFlags: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { groupId } = req.params;
      const flags = await db
        .select({ expenseId: expenseFlags.expenseId })
        .from(expenseFlags)
        .where(and(eq(expenseFlags.userId, userId), eq(expenseFlags.groupId, groupId)));
      res.status(200).json(flags.map((f) => f.expenseId));
    } catch (error) {
      console.error('Get expense flags error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

export { upload };
