import { useState } from 'react';

/* ------------------------------------------------------------------ */
/* Notifications playground — 4 dropdown designs + bell/badge + a mini  */
/* Expenses-tab preview (⚠ marks, prominent Edit, "Your participation" */
/* column). Pure mock data; no backend. Mirrors the design-playground /  */
/* balance-playground pattern.                                          */
/* ------------------------------------------------------------------ */

const CURRENCY = 'USD';

// A logged-in viewer (the expense owner who gets the notification).
const VIEWER = { id: 'u_me', name: 'Captain', initials: 'M' };

interface Notification {
  id: string;
  groupName: string;
  groupInitial: string;
  memberName: string;
  memberInitial: string;
  count: number; // how many of the owner's share/% expenses need attention
  when: string; // relative time label
}

const NOTIFS: Notification[] = [
  {
    id: 'n1',
    groupName: 'Crow Reef camping',
    groupInitial: 'P',
    memberName: 'Sixpence',
    memberInitial: 'W',
    count: 3,
    when: '12m ago',
  },
  {
    id: 'n2',
    groupName: 'Gienia 2026',
    groupInitial: 'G',
    memberName: 'Bones',
    memberInitial: 'L',
    count: 1,
    when: '2h ago',
  },
];

// Mini expenses list — shows the ⚠ flag, prominent Edit, and the new
// "Your participation" column. `flagged` = a share/% expense predating a
// member who joined after it (owner must review/edit).
interface ExpenseRow {
  id: string;
  description: string;
  category: string;
  total: number;
  mode: 'equal' | 'percent' | 'shares';
  yourShare: number;
  flagged: boolean;
}

const EXPENSES: ExpenseRow[] = [
  { id: 'e1', description: 'Campsite fee', category: '🏕️', total: 120, mode: 'equal', yourShare: 40, flagged: false },
  { id: 'e2', description: 'Groceries - big shop', category: '🛒', total: 85.5, mode: 'percent', yourShare: 25.65, flagged: true },
  { id: 'e3', description: 'Fuel (shared car)', category: '⛽', total: 60, mode: 'shares', yourShare: 24, flagged: true },
  { id: 'e4', description: 'Dinner in town', category: '🍝', total: 72, mode: 'equal', yourShare: 24, flagged: false },
  { id: 'e5', description: 'Beer run', category: '🍺', total: 33, mode: 'percent', yourShare: 11, flagged: true },
];

const MODE_LABEL: Record<ExpenseRow['mode'], string> = {
  equal: 'equal',
  percent: '%',
  shares: 'shares',
};

const PALETTE = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

function BellIcon({ hasUnread }: { hasUnread: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={hasUnread ? 'text-gray-900' : 'text-gray-500'}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function NotificationItem({ n, onOpen }: { n: Notification; onOpen?: (id: string) => void }) {
  return (
    <button
      onClick={() => onOpen?.(n.id)}
      className="flex w-full items-start gap-3 rounded-lg p-3 text-left hover:bg-gray-50"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
        {n.memberInitial}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-800">
          <span className="font-semibold">{n.memberName}</span> joined{' '}
          <span className="font-semibold">{n.groupName}</span>
        </p>
        <p className="text-xs text-gray-500">
          {n.count} of your {n.count === 1 ? 'expense needs' : 'expenses need'} review (share/%)
        </p>
        <p className="mt-0.5 text-[11px] text-gray-400">{n.when}</p>
      </div>
      <span className="mt-1 inline-flex items-center gap-0.5 rounded-md bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700">
        go →
      </span>
    </button>
  );
}

/* ======================= 4 DROPDOWN DESIGNS ======================= */

// Design A — Stacked list with dividers (classic, like GitHub/email).
function DesignA({ open, setOpen, markRead, unreadCount = NOTIFS.length }: any) {
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100">
        <BellIcon hasUnread={unreadCount > 0} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Notifications</div>
          <div className="max-h-80 overflow-y-auto">
            {NOTIFS.map((n) => (
              <div key={n.id} className="border-b border-gray-100 last:border-0">
                <NotificationItem n={n} onOpen={markRead} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Design B — Grouped by group (sections with group header).
function DesignB({ open, setOpen, markRead, unreadCount = NOTIFS.length, openedId }: any) {
  const byGroup = NOTIFS.reduce((acc, n) => {
    (acc[n.groupName] ||= []).push(n);
    return acc;
  }, {} as Record<string, Notification[]>);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100">
        <BellIcon hasUnread={unreadCount > 0} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Notifications</div>
          <div className="max-h-80 overflow-y-auto">
            {Object.entries(byGroup).map(([group, items]) => (
              <div key={group}>
                <div className="bg-gray-50 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{group}</div>
                {items.map((n) => (
                  <div key={n.id} className={n.id === openedId ? 'opacity-50' : ''}>
                    <NotificationItem n={n} onOpen={markRead} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Design C — Compact single-line rows (dense, good for many notifications).
function DesignC({ open, setOpen, markRead, unreadCount = NOTIFS.length }: any) {
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100">
        <BellIcon hasUnread={unreadCount > 0} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Notifications</div>
          <div className="max-h-80 overflow-y-auto">
            {NOTIFS.map((n) => (
              <button key={n.id} onClick={markRead} className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50 last:border-0">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">{n.memberInitial}</span>
                <span className="min-w-0 flex-1 truncate text-gray-700">
                  <span className="font-medium">{n.memberName}</span> joined {n.groupName} · {n.count} to review
                </span>
                <span className="text-[11px] text-gray-400">{n.when}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Design D — Card with action button ("Review expenses").
function DesignD({ open, setOpen, markRead, unreadCount = NOTIFS.length }: any) {
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100">
        <BellIcon hasUnread={unreadCount > 0} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Notifications</div>
          <div className="max-h-80 overflow-y-auto p-2">
            {NOTIFS.map((n) => (
              <div key={n.id} className="mb-2 rounded-lg border border-gray-200 p-3 last:mb-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">{n.memberInitial}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800">
                      <span className="font-semibold">{n.memberName}</span> joined {n.groupName}
                    </p>
                    <p className="text-xs text-gray-500">{n.when}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-600">
                  {n.count} of your share/% expenses need attention.
                </p>
                <button onClick={markRead} className="mt-2 w-full rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
                  Review expenses
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ======================= MINI EXPENSES PREVIEW ======================= */

function ParticipationChip({ mode, amount }: { mode: ExpenseRow['mode']; amount: number }) {
  const color = mode === 'equal' ? 'bg-gray-100 text-gray-700' : mode === 'percent' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {MODE_LABEL[mode]} · {amount.toFixed(2)} {CURRENCY}
    </span>
  );
}

function ExpensesPreview() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <h4 className="text-sm font-semibold text-gray-800">Expenses tab — owner's view (flagged rows need review)</h4>
        <p className="text-xs text-gray-400">New "Your participation" column + ⚠ + prominent Edit on share/% expenses predating a new member.</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
            <th className="px-4 py-2 font-medium">Expense</th>
            <th className="px-4 py-2 font-medium">Total</th>
            <th className="px-4 py-2 font-medium">Your participation</th>
            <th className="px-4 py-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {EXPENSES.map((e, i) => (
            <tr key={e.id} className={e.flagged ? 'border-b border-gray-100 bg-amber-50' : 'border-b border-gray-100'}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{e.category}</span>
                  <span className="font-medium text-gray-900">{e.description}</span>
                  {e.flagged && (
                    <span title="Needs review — a member joined after this expense" className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-white">!</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 tabular-nums text-gray-700">{e.total.toFixed(2)} {CURRENCY}</td>
              <td className="px-4 py-3"><ParticipationChip mode={e.mode} amount={e.yourShare} /></td>
              <td className="px-4 py-3">
                <button className={e.flagged ? 'rounded-md border border-amber-400 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-200' : 'rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50'}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ======================= PAGE ======================= */

const DESIGNS = [
  { key: 'A', title: 'A · Stacked list', desc: 'Classic divider-separated rows (GitHub/email style). One row per notification.' },
  { key: 'B', title: 'B · Grouped by group', desc: 'Notifications sectioned under each group header. Good when a member joins several groups.' },
  { key: 'C', title: 'C · Compact single-line', desc: 'Dense one-line rows — best when there are many notifications at once.' },
  { key: 'D', title: 'D · Card with action', desc: 'Each notification is a card with a "Review expenses" button that drives the user to the fix.' },
];

function BellStage({ title, desc, children }: { title: string; desc: string; children: (props: { open: boolean; setOpen: (v: boolean | ((p: boolean) => boolean)) => void; markRead: (id: string) => void; unreadCount: number; openedId: string | null }) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [openedId, setOpenedId] = useState<string | null>(null);
  // Per-notification counter: clicking a notification marks THAT one read
  // (badge drops by 1) and "navigates" to the Expenses tab (mocked hint).
  const markRead = (id: string) => {
    setReadIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setOpenedId(id);
    setOpen(false);
  };
  const unread = NOTIFS.length - readIds.length;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      <p className="mb-4 text-xs text-gray-400">{desc}</p>
      <div className="flex h-16 items-center justify-end gap-3 rounded-lg bg-gray-50 px-4">
        {/* fake nav: bell left of user */}
        <div onClick={(e) => e.stopPropagation()}>
          {children({ open, setOpen, markRead, unreadCount: unread, openedId })}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">{VIEWER.initials}</div>
          <div className="text-right leading-tight">
            <div className="text-sm font-medium text-gray-900">{VIEWER.name}</div>
            <div className="text-xs text-gray-500">betaone@example.invalid</div>
          </div>
        </div>
      </div>
      {openedId && (
        <p className="mt-2 text-[11px] text-indigo-600">→ Opening Expenses tab to show ⚠ on {NOTIFS.find((n) => n.id === openedId)?.groupName}… (badge: {unread} left)</p>
      )}
      <p className="mt-2 text-[11px] text-gray-400">Click the bell to open · click a notification (or its go →) to navigate + drop 1 from the badge.</p>
    </div>
  );
}

export default function NotificationsPlayground() {
  const designs: Record<string, (p: any) => JSX.Element> = {
    A: DesignA,
    B: DesignB,
    C: DesignC,
    D: DesignD,
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-900">Notifications — 4 dropdown designs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Bell sits left of the user details in the top nav, with a red badge showing the unread count.
          Clicking a notification (or its <span className="font-semibold text-indigo-600">go →</span> button) opens the
          Expenses tab (where the ⚠ marks live) AND removes just that one from the badge — so the counter is per-notification,
          not a clear-all. Design B (grouped) is the chosen layout; opened items dim. Below the bells, a mini Expenses-tab
          preview shows the new "Your participation" column + ⚠ + prominent Edit.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
          {DESIGNS.map((d) => {
            const Comp = designs[d.key];
            return (
              <BellStage key={d.key} title={d.title} desc={d.desc}>
                {(props: any) => <Comp {...props} />}
              </BellStage>
            );
          })}
        </div>

        <div className="mt-8">
          <ExpensesPreview />
        </div>

        <div className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
          <p className="font-semibold">Pick a design (A/B/C/D) and I'll implement:</p>
          <ul className="mt-1 list-disc pl-5 text-indigo-800">
            <li>A real <code>notifications</code> table + server endpoints (list, mark-read).</li>
            <li>Join flow: on a new member joining, insert one notification per owner of a share/% expense predating the join.</li>
            <li>Bell + badge in TopBar, dropdown panel using the chosen layout.</li>
            <li>An <code>expense_flag</code> concept: ⚠ on owner's share/% expenses until edited; prominent amber Edit.</li>
            <li>"Your participation" column in the Expenses tab.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
