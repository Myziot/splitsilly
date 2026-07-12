interface CurrencyMeta {
  symbol: string;
  /** tailwind classes for the pill (bg + text + border) */
  className: string;
}

// Symbol/emoji + color per currency. Unknown codes fall back to neutral gray.
const CURRENCY_MAP: Record<string, CurrencyMeta> = {
  USD: { symbol: '💵', className: 'bg-green-100 text-green-800 border-green-200' },
  EUR: { symbol: '💶', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  GBP: { symbol: '💷', className: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  JPY: { symbol: '💴', className: 'bg-red-100 text-red-800 border-red-200' },
  PLN: { symbol: 'zł', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  CAD: { symbol: 'C$', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  AUD: { symbol: 'A$', className: 'bg-teal-100 text-teal-800 border-teal-200' },
  CHF: { symbol: 'Fr', className: 'bg-rose-100 text-rose-800 border-rose-200' },
  CNY: { symbol: '¥', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  INR: { symbol: '₹', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  MXN: { symbol: '$', className: 'bg-lime-100 text-lime-800 border-lime-200' },
  BRL: { symbol: 'R$', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  SEK: { symbol: 'kr', className: 'bg-sky-100 text-sky-800 border-sky-200' },
  NOK: { symbol: 'kr', className: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  NZD: { symbol: 'NZ$', className: 'bg-teal-100 text-teal-800 border-teal-200' },
};

const FALLBACK: CurrencyMeta = { symbol: '', className: 'bg-gray-100 text-gray-700 border-gray-200' };

interface CurrencyBadgeProps {
  code: string;
  className?: string;
  /** When false, hide the symbol/emoji and show only the 3-letter code. */
  showSymbol?: boolean;
}

/**
 * A small colored pill showing the currency symbol/emoji + 3-letter code.
 * e.g. "💶 EUR". Color is keyed to the currency; unknown codes use neutral gray.
 */
export default function CurrencyBadge({
  code,
  className = '',
  showSymbol = true,
}: CurrencyBadgeProps) {
  const meta = (code && CURRENCY_MAP[code.toUpperCase()]) || FALLBACK;
  const displayCode = (code || '').toUpperCase();

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${meta.className} ${className}`}
      title={displayCode}
    >
      {showSymbol && (
        <span aria-hidden="true" className="text-sm leading-none">
          {meta.symbol}
        </span>
      )}
      <span>{displayCode}</span>
    </span>
  );
}
