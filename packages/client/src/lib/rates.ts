// Live exchange-rate helper for the "authority" footnote.
// Fetches directly from Frankfurter (ECB data). CORS is open (`*`), so the
// browser can call it with no backend involvement.

const FRANKFURTER = 'https://api.frankfurter.dev/v1';

// Fixed curated basket (most-traded majors) + always PLN (Polish owner).
export const RATE_BASKET = ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'PLN'] as const;

export interface UsdRates {
  date: string; // ECB "as of" date, YYYY-MM-DD
  rates: Record<string, number>; // rate relative to 1 USD
}

export async function fetchUsdRates(): Promise<UsdRates> {
  const res = await fetch(`${FRANKFURTER}/latest?from=USD`);
  if (!res.ok) throw new Error(`Rate fetch failed: ${res.status}`);
  const data = await res.json();
  if (!data?.rates || !data?.date) {
    throw new Error('Rate response malformed');
  }
  return { date: data.date as string, rates: data.rates as Record<string, number> };
}

// Build the unique set of currencies to show: USD (base, implicit) +
// basket + optional group currency. De-duped, uppercased, 3-letter.
export function buildFootnoteCurrencies(groupCurrency?: string): string[] {
  const set = new Set<string>(RATE_BASKET as readonly string[]);
  const gc = groupCurrency?.trim().toUpperCase();
  if (gc && /^[A-Z]{3}$/.test(gc)) set.add(gc);
  return Array.from(set);
}

// Pretty-print a rate with sensible precision.
export function formatRate(rate: number): string {
  if (!isFinite(rate)) return '—';
  if (rate >= 100) return rate.toFixed(2);
  if (rate >= 1) return rate.toFixed(3);
  return rate.toFixed(4);
}
