import { fetchExchangeRate } from '../services/currency';

export async function getExchangeRate(from: string, to: string, date: string): Promise<number | null> {
  if (from === to) return null;

  try {
    const rate = await fetchExchangeRate(from, to, date);
    return rate;
  } catch (error) {
    console.error(`Failed to fetch exchange rate ${from}→${to}:`, error);
    return null;
  }
}

export function convertAmount(amount: number, rate: number | null): number {
  if (rate === null) return amount;
  return Math.round(amount * rate * 100) / 100;
}

export function calculateSharesWithRounding(
  totalMaster: number,
  splits: Array<{ userId: string; splitMode: 'equal' | 'percent' | 'shares'; value: number | null }>
): Array<{ userId: string; share: number }> {
  const result: Array<{ userId: string; share: number; remainder: number }> = [];
  let distributed = 0;

  // Calculate raw shares
  if (splits[0]?.splitMode === 'equal') {
    const count = splits.length;
    const rawShare = totalMaster / count;
    for (const split of splits) {
      const share = Math.floor(rawShare * 100) / 100;
      result.push({ userId: split.userId, share, remainder: rawShare - share });
      distributed += share;
    }
  } else if (splits[0]?.splitMode === 'percent') {
    for (const split of splits) {
      const rawShare = (split.value! / 100) * totalMaster;
      const share = Math.floor(rawShare * 100) / 100;
      result.push({ userId: split.userId, share, remainder: rawShare - share });
      distributed += share;
    }
  } else if (splits[0]?.splitMode === 'shares') {
    const totalShares = splits.reduce((sum, s) => sum + (s.value || 0), 0);
    for (const split of splits) {
      const rawShare = ((split.value || 0) / totalShares) * totalMaster;
      const share = Math.floor(rawShare * 100) / 100;
      result.push({ userId: split.userId, share, remainder: rawShare - share });
      distributed += share;
    }
  }

  // Distribute remainder (rounding differences) — sort by largest remainder first
  const remainder = Math.round((totalMaster - distributed) * 100) / 100;
  result.sort((a, b) => b.remainder - a.remainder);

  let remainingCents = Math.round(remainder * 100);
  for (const item of result) {
    if (remainingCents <= 0) break;
    const addCents = Math.min(1, remainingCents); // add at most 1 cent per person
    item.share = Math.round((item.share + addCents / 100) * 100) / 100;
    remainingCents -= addCents;
  }

  return result.map(r => ({ userId: r.userId, share: r.share }));
}
