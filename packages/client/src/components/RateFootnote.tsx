import { useEffect, useState } from 'react';
import {
  fetchUsdRates,
  buildFootnoteCurrencies,
  formatRate,
  RATE_BASKET,
  type UsdRates,
} from '../lib/rates';
import CurrencyBadge from './CurrencyBadge';

interface RateFootnoteProps {
  // Group's master currency; included in the basket when present.
  groupCurrency?: string;
  // Optional className for layout tweaks.
  className?: string;
}

// Currencies that have a real flag/icon glyph in CurrencyBadge.
// For these we show the icon; for everything else (CHF, CAD, PLN, MXN, …)
// we show just the 3-letter ticker.
const ICON_CURRENCIES = new Set(['EUR', 'GBP', 'JPY']);

// Quiet, copy-able "live rates" authority line (Variant C, 4-column ledger).
// Sits at the bottom of a page's content (scrolls away — not sticky).
// Header: "1 💵 USD =" then a thin rule. Below: a single 4-column grid
// [currency | value | currency | value] where currencies are LEFT-aligned
// and values are RIGHT-aligned, so every column lines up. Monospace terminal
// font. EUR/GBP/JPY get their flag icon; CHF/CAD/PLN etc. show ticker only.
export default function RateFootnote({ groupCurrency, className = '' }: RateFootnoteProps) {
  const [data, setData] = useState<UsdRates | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchUsdRates()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Build the currency set (basket + group currency, de-duped), then drop USD
  // since it's the base we're quoting FROM.
  const currencies = buildFootnoteCurrencies(groupCurrency).filter((c) => c !== 'USD');

  // Split into two halves → columns 1-2 (left) and 3-4 (right).
  const mid = Math.ceil(currencies.length / 2);
  const left = currencies.slice(0, mid);
  const right = currencies.slice(mid);

  // Single 4-column grid, filled column-by-column:
  //   [leftCur | leftVal | rightCur | rightVal]
  // so currencies sit in col 1 & 3 (left-aligned) and values in col 2 & 4
  // (right-aligned). Rows = max side length so a 7th currency still fits.
  const rowCount = Math.max(left.length, right.length);
  const cells: Array<{ kind: 'c' | 'v'; code: string }> = [
    ...left.map((c) => ({ kind: 'c' as const, code: c })),
    ...left.map((c) => ({ kind: 'v' as const, code: c })),
    ...right.map((c) => ({ kind: 'c' as const, code: c })),
    ...right.map((c) => ({ kind: 'v' as const, code: c })),
  ];

  return (
    <footer
      // NOTE: select-text (not select-none) so the line can be highlighted/copied.
      // font-mono gives the terminal/CLI look (ui-monospace stack).
      className={`py-3 text-center text-xs text-gray-500 select-text font-mono ${className}`}
      aria-label="Live exchange rates"
    >
      {failed ? (
        <span>Live exchange rates temporarily unavailable.</span>
      ) : !data ? (
        <span>Rates as of — loading…</span>
      ) : (
        <div className="inline-flex flex-col items-center">
          {/* Header: "1 💵 USD =" */}
          <div className="flex items-center justify-center gap-1.5 font-semibold text-gray-600">
            <span>1</span>
            <CurrencyBadge code="USD" />
            <span>=</span>
          </div>
          {/* Thin horizontal rule below the header. */}
          <hr className="my-2 w-64 border-0 border-t border-gray-300" />
          {/* 4-column ledger grid. */}
          <div
            style={{
              display: 'grid',
              gridAutoFlow: 'column',
              gridTemplateRows: `repeat(${rowCount}, auto)`,
              gridTemplateColumns: 'repeat(4, auto)',
              columnGap: '1rem',
              rowGap: '0.125rem',
            }}
          >
            {cells.map((cell, i) =>
              cell.kind === 'c' ? (
                <span key={i} className="text-left">
                  <CurrencyBadge code={cell.code} showSymbol={ICON_CURRENCIES.has(cell.code)} />
                </span>
              ) : (
                <span key={i} className="text-right tabular-nums font-medium text-gray-800">
                  {formatRate(data.rates[cell.code] ?? NaN)}
                </span>
              )
            )}
          </div>
          <div className="text-gray-400 mt-1.5">rates as of {data.date}</div>
          {/* Credit: data source + API, with a link. */}
          <div className="text-gray-400 mt-0.5">
            Rates by{' '}
            <a
              href="https://www.frankfurter.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-600"
            >
              Frankfurter
            </a>{' '}
            · data from the European Central Bank
          </div>
        </div>
      )}
    </footer>
  );
}

export { RATE_BASKET };
