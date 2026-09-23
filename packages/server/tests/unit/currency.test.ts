import { describe, it, expect } from 'vitest';
import { convertAmount } from '../../src/services/currency';

describe('convertAmount (FX to master currency)', () => {
  it('passes through when no rate is needed (same currency)', () => {
    expect(convertAmount(42.5, null)).toBe(42.5);
  });

  it('converts and rounds to exact cents', () => {
    // 100 USD * 4.05 PLN = 405.00
    expect(convertAmount(100, 4.05)).toBe(405);
    // 10 * 3.987 = 39.87
    expect(convertAmount(10, 3.987)).toBe(39.87);
  });

  it('rounds half-up style to the nearest cent (no float tails)', () => {
    // 33.33 * 1.234 = 41.12922 -> 41.13
    expect(convertAmount(33.33, 1.234)).toBe(41.13);
    // 0.1 * 0.1 = 0.010000000000000002 float landmine -> 0.01
    expect(convertAmount(0.1, 0.1)).toBe(0.01);
  });

  it('keeps sub-cent products from leaking dust into balances', () => {
    const result = convertAmount(1, 0.004); // 0.004 -> rounds to 0.00
    expect(result).toBe(0);
  });
});
