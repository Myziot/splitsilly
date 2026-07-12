import type { MemberColor } from '../utils/memberColor';

interface PayerBadgeProps {
  name: string;
  /** precomputed color for this member, from createMemberColorMap */
  color?: MemberColor;
  className?: string;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Fallback palette (amber) if no color is supplied — keeps the old look intact.
const FALLBACK = {
  bg: '#fffbeb',
  border: '#fcd34d',
  text: '#92400e',
};

/**
 * A prominent badge for the member who paid. Uses the same outlined methodology
 * as CurrencyBadge, but with the member's distinct (golden-angle) color so the
 * payer stands out in the expense row. Color is passed in so it stays stable per
 * member across renders.
 */
export default function PayerBadge({ name, color, className = '' }: PayerBadgeProps) {
  const c = color || FALLBACK;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-0.5 ${className}`}
      style={{ borderColor: c.border, backgroundColor: c.bg, color: c.text }}
    >
      <span
        className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold leading-none text-white"
        style={{ backgroundColor: c.border }}
      >
        {initialsOf(name)}
      </span>
      <span className="text-sm font-bold">{name}</span>
    </span>
  );
}
