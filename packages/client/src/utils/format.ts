// Date/time formatting helpers — all rendered in the CLIENT's local timezone,
// with the timezone abbreviation shown so the user can see exactly which
// timezone a displayed value was computed in.
//
// IMPORTANT: expense_date arrives as a bare "YYYY-MM-DD" string with no time
// and no timezone. We must parse its Y-M-D PARTS directly and never route it
// through `new Date("YYYY-MM-DD")` — that parses as UTC midnight and shifts the
// day in negative-offset timezones (the exact bug we fixed on the server).

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function parseYMD(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3] };
}

/** "2026-07-10" -> "10 Jul 2026" (timezone-independent; it's a calendar date). */
export function formatDate(dateStr: string): string {
  const p = parseYMD(dateStr);
  if (!p) return dateStr;
  const dd = String(p.d).padStart(2, '0');
  return `${dd} ${MONTHS_SHORT[p.m - 1]} ${p.y}`;
}

/** Client's local timezone short name, e.g. "PDT", "GMT+7", "CET". */
export function clientTimeZoneShort(): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZoneName: 'short',
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/**
 * Full timestamp -> "10 Jul 2026 · 19:49 PDT".
 * Interpreted in the client's local timezone (the Date is a real instant).
 */
export function formatDateTime(iso: string): string {
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return iso;
  const parts = new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).formatToParts(dt);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const tz = get('timeZoneName');
  return `${get('day')} ${get('month')} ${get('year')} · ${get('hour')}:${get('minute')}${tz ? ' ' + tz : ''}`.trim();
}

export type GroupExpenseType = 'trip' | 'household' | 'event' | 'project' | 'general';

const EXPENSE_TYPE_LABELS: Record<GroupExpenseType, { title: string; subtitle: string }> = {
  trip: { title: 'Total trip cost', subtitle: 'Sum of all trip expenses (ignores balances)' },
  household: { title: 'Total household expenses', subtitle: 'Sum of all household expenses (ignores balances)' },
  event: { title: 'Total event cost', subtitle: 'Sum of all event expenses (ignores balances)' },
  project: { title: 'Total project cost', subtitle: 'Sum of all project expenses (ignores balances)' },
  general: { title: 'Total group expenses', subtitle: 'Sum of all group expenses (ignores balances)' },
};

/** Resolve the total-cost banner wording from a group's expense type. */
export function groupExpenseLabel(type?: string): { title: string; subtitle: string } {
  return EXPENSE_TYPE_LABELS[(type as GroupExpenseType) || 'general'] || EXPENSE_TYPE_LABELS.general;
}

export const GROUP_EXPENSE_TYPE_OPTIONS: { value: GroupExpenseType; label: string }[] = [
  { value: 'trip', label: 'Trip' },
  { value: 'household', label: 'Household' },
  { value: 'event', label: 'Event' },
  { value: 'project', label: 'Project' },
  { value: 'general', label: 'General' },
];
