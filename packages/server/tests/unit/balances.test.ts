import { describe, it, expect } from 'vitest';
import { optimizeBalances, roundSharesToCents } from '../../src/services/balances';

describe('roundSharesToCents (largest-remainder cent snapping)', () => {
  it('sums to the exact total for the classic 10/3 case', () => {
    const shares = roundSharesToCents([10 / 3, 10 / 3, 10 / 3], 10);
    const sum = shares.reduce((a, b) => a + b, 0);
    expect(Math.round(sum * 100)).toBe(1000); // exactly 10.00, no dust
    expect(shares.every((s) => Math.round(s * 100) === s * 100)).toBe(true); // all whole cents
  });

  it('never leaves the historical -0.01 float dust', () => {
    // 100 split 3 ways then re-summed must hit 100.00 exactly
    const shares = roundSharesToCents([100 / 3, 100 / 3, 100 / 3], 100);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
  });

  it('distributes the remainder to the largest fractional parts', () => {
    // 0.10 total over shares 0.033/0.033/0.034 → floors 0.03*3=0.09, one cent left
    const shares = roundSharesToCents([0.033, 0.033, 0.034], 0.1);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(0.1, 10);
    expect(shares[2]).toBe(0.04); // biggest frac got the extra cent
  });

  it('handles a single splitter (payer-only expense)', () => {
    expect(roundSharesToCents([7.77], 7.77)).toEqual([7.77]);
  });

  it('guards a negative remainder from float underflow', () => {
    // floors already sum to total; remainder must clamp to 0, not go negative
    const shares = roundSharesToCents([5, 5], 10);
    expect(shares).toEqual([5, 5]);
  });

  it('is deterministic for equal inputs (no randomness between renders)', () => {
    const a = roundSharesToCents([1 / 3, 1 / 3, 1 / 3], 1);
    const b = roundSharesToCents([1 / 3, 1 / 3, 1 / 3], 1);
    expect(a).toEqual(b);
  });
});

describe('optimizeBalances (greedy who-pays-whom)', () => {
  const sum = (txns: { amount: number }[]) => txns.reduce((a, t) => a + t.amount, 0);

  it('returns no transactions when everyone is settled', () => {
    expect(optimizeBalances([
      { userId: 'a', balance: 0 },
      { userId: 'b', balance: 0 },
    ])).toEqual([]);
  });

  it('matches a single debtor to a single creditor exactly', () => {
    const txns = optimizeBalances([
      { userId: 'a', balance: -50 },
      { userId: 'b', balance: 50 },
    ]);
    expect(txns).toEqual([{ fromUserId: 'a', toUserId: 'b', amount: 50 }]);
  });

  it('direction is debtor pays creditor (sign convention)', () => {
    const txns = optimizeBalances([
      { userId: 'debtor', balance: -20 },
      { userId: 'creditor', balance: 20 },
    ]);
    expect(txns[0].fromUserId).toBe('debtor');
    expect(txns[0].toUserId).toBe('creditor');
  });

  it('minimizes transaction count for the classic 3-person case', () => {
    // a owes 30, b owes 10, c is owed 40 → greedy: a→c 30, b→c 10 (2 txns)
    const txns = optimizeBalances([
      { userId: 'a', balance: -30 },
      { userId: 'b', balance: -10 },
      { userId: 'c', balance: 40 },
    ]);
    expect(txns.length).toBe(2);
    expect(Math.round(sum(txns) * 100)).toBe(4000);
  });

  it('nets to zero: total paid equals total received', () => {
    const txns = optimizeBalances([
      { userId: 'a', balance: -12.34 },
      { userId: 'b', balance: -56.78 },
      { userId: 'c', balance: 33.12 },
      { userId: 'd', balance: 36 },
    ]);
    const paidBy = new Map<string, number>();
    for (const t of txns) {
      paidBy.set(t.fromUserId, (paidBy.get(t.fromUserId) || 0) - t.amount);
      paidBy.set(t.toUserId, (paidBy.get(t.toUserId) || 0) + t.amount);
    }
    for (const [uid, net] of paidBy) {
      const input = [
        { userId: 'a', balance: -12.34 },
        { userId: 'b', balance: -56.78 },
        { userId: 'c', balance: 33.12 },
        { userId: 'd', balance: 36 },
      ].find((b) => b.userId === uid)!;
      // after all suggested txns, everyone lands at ~0.
      // net = (received − paid) across txns; paying off a debt moves the
      // balance by −net, so final = balance − net ≈ 0.
      expect(Math.abs(input.balance - net)).toBeLessThan(0.011);
    }
  });

  it('skips all-positive balances (nobody owes anything)', () => {
    expect(optimizeBalances([
      { userId: 'a', balance: 5 },
      { userId: 'b', balance: 10 },
    ])).toEqual([]);
  });

  it('skips all-negative balances (nobody is owed anything)', () => {
    expect(optimizeBalances([
      { userId: 'a', balance: -5 },
      { userId: 'b', balance: -10 },
    ])).toEqual([]);
  });

  it('ignores sub-cent dust balances', () => {
    expect(optimizeBalances([
      { userId: 'a', balance: -0.005 },
      { userId: 'b', balance: 0.005 },
    ])).toEqual([]);
  });

  it('handles partial overlaps (debtor owes more than one creditor is owed)', () => {
    const txns = optimizeBalances([
      { userId: 'big', balance: -100 },
      { userId: 'c1', balance: 40 },
      { userId: 'c2', balance: 60 },
    ]);
    expect(txns.length).toBe(2);
    expect(Math.round(sum(txns) * 100)).toBe(10000);
    expect(txns.every((t) => t.fromUserId === 'big')).toBe(true);
  });
});
