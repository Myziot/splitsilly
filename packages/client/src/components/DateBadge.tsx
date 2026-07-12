import { formatDate, clientTimeZoneShort } from '../utils/format';

interface DateBadgeProps {
  /** ISO date string YYYY-MM-DD */
  date: string;
  className?: string;
}

// Subtle accent color per month, matching CurrencyBadge's palette so the chip
// color-rotates through the year. Border + light tint = outlined style.
const MONTH_ACCENT: Record<number, string> = {
  1: 'border-rose-200 bg-rose-50 text-rose-700',
  2: 'border-pink-200 bg-pink-50 text-pink-700',
  3: 'border-orange-200 bg-orange-50 text-orange-700',
  4: 'border-amber-200 bg-amber-50 text-amber-700',
  5: 'border-lime-200 bg-lime-50 text-lime-700',
  6: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  7: 'border-teal-200 bg-teal-50 text-teal-700',
  8: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  9: 'border-sky-200 bg-sky-50 text-sky-700',
  10: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  11: 'border-violet-200 bg-violet-50 text-violet-700',
  12: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
};

/**
 * A single-row, outlined "calendar chip" showing DD MMM YYYY plus the client's
 * timezone (e.g. "10 Jul 2026 · PDT"). The month drives the accent color so it
 * still matches CurrencyBadge's outlined methodology.
 */
export default function DateBadge({ date, className = '' }: DateBadgeProps) {
  const monthNum = parseInt((date || '').split('-')[1] || '1', 10) || 1;
  const accent = MONTH_ACCENT[monthNum];
  const tz = clientTimeZoneShort();

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 ${accent} ${className}`}
      title={date}
    >
      <span className="text-sm font-semibold tabular-nums leading-none">
        {formatDate(date)}
      </span>
      {tz && (
        <span className="text-[10px] font-bold uppercase tracking-wide opacity-70 border-l border-current pl-1.5 leading-none">
          {tz}
        </span>
      )}
    </span>
  );
}
