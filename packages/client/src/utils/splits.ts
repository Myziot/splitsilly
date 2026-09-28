/**
 * Share math for expense splits (moved out of GroupDetail 2026-09-23).
 * Shares are always expressed in the group's MASTER currency.
 *
 * MUST mirror the server's roundSharesToCents + payer-absorbs rule
 * (packages/server/src/services/balances.ts): equal-mode expenses where the
 * payer participates route ALL leftover cents to the payer, so non-payer
 * members see equal-to-the-cent shares. Weighted modes keep the
 * largest-remainder distribution.
 */

/** Snap raw shares to exact cents summing to `total` (server mirror). */
export function roundSharesToCents(shares: number[], total: number, absorbIdx = -1): number[] {
  const floored = shares.map((s) => Math.floor(s * 100) / 100);
  const used = floored.reduce((sum, s) => sum + s, 0);
  let remainderCents = Math.round((total - used) * 100);
  if (remainderCents < 0) remainderCents = 0;
  if (absorbIdx >= 0 && absorbIdx < shares.length) {
    const result = [...floored];
    result[absorbIdx] = Math.round((result[absorbIdx] + remainderCents / 100) * 100) / 100;
    return result;
  }
  const order = shares
    .map((s, idx) => ({ idx, frac: s - Math.floor(s * 100) / 100 }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floored];
  let k = 0;
  while (remainderCents > 0 && k < order.length) {
    result[order[k].idx] = Math.round((result[order[k].idx] + 0.01) * 100) / 100;
    remainderCents -= 1;
    k += 1;
  }
  return result;
}

/**
 * The penny-exact share of `expense` owed by the owner of `split`, using the
 * same cent-snapping the balance engine uses. Falls back to the raw share if
 * the expense shape is unexpected (defensive — old callers).
 */
export function snappedShare(expense: any, split: any): number {
  const total: number = expense.amount_master;
  const splits: any[] = expense.splits || [];
  const idx = splits.findIndex((s) => s.user_id === split.user_id);
  if (idx === -1 || !Array.isArray(expense.splits) || expense.splits.length === 0) {
    return computeShare(expense, split);
  }
  const raw = splits.map((s) => {
    if (s.split_mode === 'equal') return total / splits.length;
    if (s.split_mode === 'percent') return (total * (s.value || 0)) / 100;
    if (s.split_mode === 'shares') {
      const totalShares = splits.reduce((acc, x) => acc + (x.value || 0), 0) || 1;
      return (total * (s.value || 0)) / totalShares;
    }
    return 0;
  });
  const allEqual = splits.every((s) => s.split_mode === 'equal');
  const payerIdx = allEqual && expense.paid_by ? splits.findIndex((s) => s.user_id === expense.paid_by) : -1;
  return roundSharesToCents(raw, total, payerIdx)[idx];
}

export function computeShare(expense: any, split: any): number {
  const total = expense.amount_master;
  if (split.split_mode === 'equal') {
    const count = expense.splits.length || 1;
    return total / count;
  }
  if (split.split_mode === 'percent') {
    return total * (split.value || 0) / 100;
  }
  if (split.split_mode === 'shares') {
    const totalShares = expense.splits.reduce(
      (s: number, x: any) => s + (x.value || 0),
      0
    ) || 1;
    return total * (split.value || 0) / totalShares;
  }
  return 0;
}
