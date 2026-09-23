import { db } from '../db';
import { users, groupMembers, expenses, expenseSplits, settlements, books } from '../db/schema';
import { eq } from 'drizzle-orm';

export interface BalanceEntry {
  userId: string;
  balance: number;
}

export interface Transaction {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

/**
 * Calculate net balances for all group members.
 * Positive balance = person is owed money (creditor)
 * Negative balance = person owes money (debtor)
 */
/**
 * Snap a list of raw (float) shares to exact cents so they sum to `total`.
 * Uses the largest-remainder method: floor each to cents, then distribute the
 * leftover pennies to the entries with the biggest fractional parts. This keeps
 * per-expense math exact so no sub-cent "dust" (e.g. a -0.01 that never settles)
 * leaks into balances.
 */
export function roundSharesToCents(shares: number[], total: number): number[] {
  const floored = shares.map((s) => Math.floor(s * 100) / 100);
  const used = floored.reduce((sum, s) => sum + s, 0);
  let remainderCents = Math.round((total - used) * 100);
  // Guard against float underflow producing a negative remainder.
  if (remainderCents < 0) remainderCents = 0;
  const order = shares
    .map((s, idx) => ({ idx, frac: s - Math.floor(s * 100) / 100 }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floored];
  let k = 0;
  while (remainderCents > 0 && k < order.length) {
    result[order[k].idx] += 0.01;
    remainderCents -= 1;
    k += 1;
  }
  return result;
}

export async function calculateBalances(groupId: string, userIds: string[]): Promise<BalanceEntry[]> {
  // Calculate expense shares for each user
  const expenseTotals = await db
    .select({
      userId: expenseSplits.userId,
      totalShare: expenseSplits.value,
      splitMode: expenseSplits.splitMode,
      expenseId: expenseSplits.expenseId,
    })
    .from(expenseSplits)
    .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
    .where(eq(expenses.groupId, groupId));

  // Calculate per-user shares in master currency.
  // IMPORTANT: the payer's credit (amountMaster) must be applied ONCE per
  // expense, NOT once per split row — otherwise an expense with N splitters
  // would debit the payer N x amountMaster (a catastrophic over-count).
  const userExpenseMap = new Map<string, number>();

  // Group split rows by expense so we can process each expense once.
  const splitsByExpense = new Map<string, typeof expenseTotals>();
  for (const entry of expenseTotals) {
    if (!splitsByExpense.has(entry.expenseId)) splitsByExpense.set(entry.expenseId, []);
    splitsByExpense.get(entry.expenseId)!.push(entry);
  }

  for (const [expenseId, splits] of splitsByExpense) {
    const expenseDetails = await db
      .select({
        amountMaster: expenses.amountMaster,
        paidBy: expenses.paidBy,
      })
      .from(expenses)
      .where(eq(expenses.id, expenseId))
      .limit(1);

    if (expenseDetails.length === 0) continue;

    const amountMaster = parseFloat(expenseDetails[0].amountMaster.toString());
    const paidBy = expenseDetails[0].paidBy;

    // Compute each splitter's raw share, then snap to exact cents using the
    // largest-remainder method so the shares sum to amountMaster precisely.
    const rawShares = splits.map((entry) => {
      if (entry.splitMode === 'equal') {
        return amountMaster / splits.length;
      } else if (entry.splitMode === 'percent') {
        return (parseFloat((entry.totalShare || 0).toString()) / 100) * amountMaster;
      } else if (entry.splitMode === 'shares') {
        const totalShares = splits.reduce(
          (sum, s) => sum + parseFloat((s.totalShare || 0).toString()),
          0,
        );
        return (parseFloat((entry.totalShare || 0).toString()) / totalShares) * amountMaster;
      }
      return 0;
    });
    const roundedShares = roundSharesToCents(rawShares, amountMaster);
    splits.forEach((entry, idx) => {
      // They OWE this share (debtor = negative).
      userExpenseMap.set(entry.userId, (userExpenseMap.get(entry.userId) || 0) - roundedShares[idx]);
    });

    // Credit the payer ONCE for fronting the full expense (creditor = positive).
    if (paidBy) {
      userExpenseMap.set(paidBy, (userExpenseMap.get(paidBy) || 0) + amountMaster);
    }
  }

  // Calculate settlement offsets
  const settlementsData = await db
    .select({
      fromUserId: settlements.fromUserId,
      toUserId: settlements.toUserId,
      amount: settlements.amount,
    })
    .from(settlements)
    .where(eq(settlements.groupId, groupId));

  for (const settlement of settlementsData) {
    const amount = parseFloat(settlement.amount.toString());
    // A settlement means fromUser PAID toUser.
    //   fromUser discharged debt -> their net balance moves UP (toward 0 / positive).
    //   toUser was repaid -> their credit moves DOWN (toward 0 / negative).
    // balance = (what you paid) - (your share of expenses)
    userExpenseMap.set(settlement.fromUserId, (userExpenseMap.get(settlement.fromUserId) || 0) + amount);
    userExpenseMap.set(settlement.toUserId, (userExpenseMap.get(settlement.toUserId) || 0) - amount);
  }

  // Build final balance entries
  const balances: BalanceEntry[] = [];
  for (const userId of userIds) {
    const balance = Math.round((userExpenseMap.get(userId) || 0) * 100) / 100;
    balances.push({ userId, balance });
  }

  return balances;
}

/**
 * Greedy algorithm to minimize number of transactions.
 * Sorts by balance, matches biggest creditor with biggest debtor.
 */
export function optimizeBalances(balances: BalanceEntry[]): Transaction[] {
  // Separate creditors and debtors
  type Entry = { userId: string; balance: number };
  const entries: Entry[] = balances
    .map(b => ({ userId: b.userId, balance: Math.round(b.balance * 100) / 100 }))
    .filter(b => Math.abs(b.balance) > 0.01); // Skip near-zero balances

  const transactions: Transaction[] = [];

  // Sort: most negative (owes most) first, most positive (owed most) last
  entries.sort((a, b) => a.balance - b.balance);

  let i = 0; // debtor (negative balance)
  let j = entries.length - 1; // creditor (positive balance)

  while (i < j) {
    const debtor = entries[i];
    const creditor = entries[j];

    if (debtor.balance >= 0) {
      i++;
      continue;
    }
    if (creditor.balance <= 0) {
      j--;
      continue;
    }

    // Settlement amount is the minimum of what debtor owes and creditor is owed
    const amount = Math.min(Math.abs(debtor.balance), creditor.balance);
    const roundedAmount = Math.round(amount * 100) / 100;

    if (roundedAmount > 0.01) {
      transactions.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amount: roundedAmount,
      });
    }

    // Update balances
    debtor.balance = Math.round((debtor.balance + roundedAmount) * 100) / 100;
    creditor.balance = Math.round((creditor.balance - roundedAmount) * 100) / 100;

    // Move pointers if settled
    if (Math.abs(debtor.balance) < 0.01) i++;
    if (Math.abs(creditor.balance) < 0.01) j--;
  }

  return transactions;
}
