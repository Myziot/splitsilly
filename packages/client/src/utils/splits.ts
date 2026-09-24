/**
 * Share math for expense splits (moved out of GroupDetail 2026-09-23).
 * Shares are always expressed in the group's MASTER currency.
 */
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
