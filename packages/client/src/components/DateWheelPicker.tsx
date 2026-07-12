import { useEffect, useRef, useState, useCallback } from 'react';

interface DateWheelPickerProps {
  /** current value YYYY-MM-DD */
  value: string;
  onChange: (value: string) => void;
  /** restrict year range; defaults to [currentYear-5, currentYear+1] */
  fromYear?: number;
  toYear?: number;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const ITEM_H = 44; // px per row — MUST match the snap math below
// Top & bottom padding that puts the FIRST and LAST selectable items exactly
// on the center band. Derived: center of item i (when snapped) must sit at
// 50% of the column height. With scrollTop = i*ITEM_H, item center lands at
// (padding + i*ITEM_H + ITEM_H/2) - scrollTop = padding + ITEM_H/2, which
// equals columnHeight/2  <=>  padding = columnHeight/2 - ITEM_H/2.
// Using CSS calc keeps it correct for any column height.
const EDGE_PAD = 'calc(50% - ' + ITEM_H / 2 + 'px)';

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function parseYMD(s: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  const now = new Date();
  const y = m ? +m[1] : now.getFullYear();
  const mo = m ? +m[2] : now.getMonth() + 1;
  const d = m ? +m[3] : now.getDate();
  return { y, m: mo, d };
}

function Column({
  items,
  selectedIndex,
  onSelect,
  ariaLabel,
  widthClass,
}: {
  items: { label: string; value: number }[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  ariaLabel: string;
  widthClass: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<number | null>(null);

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = ref.current;
      if (!el) return;
      el.scrollTo({ top: index * ITEM_H, behavior: 'smooth' });
    },
    []
  );

  // Center the selected item on mount / when value changes externally.
  useEffect(() => {
    scrollToIndex(selectedIndex);
  }, [selectedIndex, scrollToIndex]);

  const handleScroll = () => {
    if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / ITEM_H);
      if (idx !== selectedIndex && idx >= 0 && idx < items.length) {
        onSelect(idx);
      }
    }, 120);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      onSelect(Math.min(items.length - 1, selectedIndex + 1));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onSelect(Math.max(0, selectedIndex - 1));
    }
  };

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={handleScroll}
      onKeyDown={handleKey}
      className={`relative h-56 overflow-y-auto snap-y snap-mandatory scrollbar-thin ${widthClass}`}
      style={{ scrollbarWidth: 'thin', paddingTop: EDGE_PAD, paddingBottom: EDGE_PAD }}
    >
      {items.map((it, i) => {
        const selected = i === selectedIndex;
        return (
          <div
            key={it.value}
            role="option"
            aria-selected={selected}
            onClick={() => {
              onSelect(i);
              scrollToIndex(i);
            }}
            className={`flex h-11 snap-center cursor-pointer items-center justify-center tabular-nums transition-all duration-150 ${
              selected
                ? 'scale-110 text-2xl font-extrabold text-blue-700'
                : 'text-lg text-gray-400 hover:text-gray-500'
            }`}
          >
            {it.label}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A native-feeling scroll-wheel date picker: three snap-scroll columns
 * (Day | Month | Year). The selected row sits dead-center and is emphasized;
 * the rest is muted. Selection updates on scroll-end and on click.
 * Default value is controlled by the parent (today, per GroupDetail).
 */
export default function DateWheelPicker({
  value,
  onChange,
  fromYear,
  toYear,
}: DateWheelPickerProps) {
  const now = new Date();
  const minYear = fromYear ?? now.getFullYear() - 5;
  const maxYear = toYear ?? now.getFullYear() + 1;

  const { y, m, d } = parseYMD(value);

  // Clamp the displayed day to the days available in the chosen month/year.
  const maxDay = daysInMonth(y, m);
  const safeDay = Math.min(d, maxDay);

  const dayItems = Array.from({ length: maxDay }, (_, i) => ({
    label: String(i + 1),
    value: i + 1,
  }));
  const monthItems = MONTHS.map((name, i) => ({ label: name, value: i + 1 }));
  const yearItems = Array.from(
    { length: maxYear - minYear + 1 },
    (_, i) => ({ label: String(minYear + i), value: minYear + i })
  );

  const update = (ny: number, nm: number, nd: number) => {
    const dd = String(Math.min(nd, daysInMonth(ny, nm))).padStart(2, '0');
    const mm = String(nm).padStart(2, '0');
    onChange(`${ny}-${mm}-${dd}`);
  };

  const dayIdx = safeDay - 1;
  const monthIdx = m - 1;
  const yearIdx = Math.max(0, Math.min(yearItems.length - 1, y - minYear));

  return (
    <div className="flex justify-center rounded-lg border border-gray-300 bg-white p-2">
      {/* Continuous center selection band across all three columns.
          pointer-events-none so it never blocks scroll. */}
      <div className="relative flex gap-3">
        <div
          className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-md bg-blue-50 ring-1 ring-blue-200"
          style={{ height: ITEM_H }}
        />
        <Column
          items={dayItems}
          selectedIndex={dayIdx}
          onSelect={(i) => update(y, m, dayItems[i].value)}
          ariaLabel="Day"
          widthClass="w-14"
        />
        <Column
          items={monthItems}
          selectedIndex={monthIdx}
          onSelect={(i) => update(y, monthItems[i].value, safeDay)}
          ariaLabel="Month"
          widthClass="w-16"
        />
        <Column
          items={yearItems}
          selectedIndex={yearIdx}
          onSelect={(i) => update(yearItems[i].value, m, safeDay)}
          ariaLabel="Year"
          widthClass="w-20"
        />
      </div>
    </div>
  );
}
