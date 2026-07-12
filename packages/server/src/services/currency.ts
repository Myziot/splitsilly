const API_BASE = process.env.EXCHANGE_RATE_API_URL || 'https://api.frankfurter.dev/v1';

export async function fetchExchangeRate(from: string, to: string, date: string): Promise<number> {
  const dateStr = new Date(date).toISOString().split('T')[0];
  const url = `${API_BASE}/${dateStr}?from=${from}&to=${to}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Exchange rate API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const rate = data.rates[to];

  if (!rate) {
    throw new Error(`Rate not found for ${from}→${to} on ${dateStr}`);
  }

  return rate;
}

export async function getExchangeRate(from: string, to: string, date: string): Promise<number | null> {
  if (from === to) return null;

  try {
    return await fetchExchangeRate(from, to, date);
  } catch (error) {
    console.error(`Failed to fetch exchange rate ${from}→${to}:`, error);
    return null;
  }
}

export function convertAmount(amount: number, rate: number | null): number {
  if (rate === null) return amount;
  return Math.round(amount * rate * 100) / 100;
}
