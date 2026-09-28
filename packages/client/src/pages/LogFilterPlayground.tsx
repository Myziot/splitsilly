import { useState } from 'react';
import { formatDateTime } from '../utils/format';

/* ============================================================
   LOG FILTER PLAYGROUND — design artifact (grill Q3, 2026-09-27)
   Four labeled filter treatments for the group "Log" tab, each
   FULLY INTERACTIVE over the same mock activity feed. Pick a
   variant (or combine parts) — the winner gets wired into
   GroupActivityTab.tsx. This page stays live as a reference.
   ============================================================ */

type Meta = { icon: string; label: string; badge: string; text: string };

// Existing ACTIVITY_META colors, PLUS the 5 roster additions from the grill
// (group_created, member_removed, invite_sent, invite_link_shared, settings_changed).
const META: Record<string, Meta> = {
  group_created:      { icon: '🏴‍☠️', label: 'Group created', badge: 'bg-indigo-100 text-indigo-700', text: 'text-indigo-700' },
  member_joined:      { icon: '🤝', label: 'Joined', badge: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-700' },
  member_removed:     { icon: '🚪', label: 'Removed', badge: 'bg-orange-100 text-orange-700', text: 'text-orange-700' },
  invite_sent:        { icon: '✉️', label: 'Invite emailed', badge: 'bg-sky-100 text-sky-700', text: 'text-sky-700' },
  invite_link_shared: { icon: '🔗', label: 'Link shared', badge: 'bg-teal-100 text-teal-700', text: 'text-teal-700' },
  settings_changed:   { icon: '⚙️', label: 'Settings', badge: 'bg-gray-200 text-gray-700', text: 'text-gray-700' },
  expense_created:    { icon: '➕', label: 'Expense added', badge: 'bg-blue-100 text-blue-700', text: 'text-blue-700' },
  expense_updated:    { icon: '✏️', label: 'Expense edited', badge: 'bg-amber-100 text-amber-700', text: 'text-amber-700' },
  expense_deleted:    { icon: '🗑️', label: 'Expense deleted', badge: 'bg-red-100 text-red-700', text: 'text-red-700' },
  settlement_recorded:{ icon: '💸', label: 'Settled', badge: 'bg-purple-100 text-purple-700', text: 'text-purple-700' },
  settlement_reverted:{ icon: '↩️', label: 'Payment reverted', badge: 'bg-fuchsia-100 text-fuchsia-700', text: 'text-fuchsia-700' },
  settlement_edited:  { icon: '✏️', label: 'Payment edited', badge: 'bg-fuchsia-100 text-fuchsia-700', text: 'text-fuchsia-700' },
  reset_settlements:  { icon: '♻️', label: 'Balances reset', badge: 'bg-red-100 text-red-700', text: 'text-red-700' },
  book_locked:        { icon: '🔒', label: 'Book locked', badge: 'bg-slate-100 text-slate-700', text: 'text-slate-700' },
  book_unlocked:      { icon: '🔓', label: 'Book unlocked', badge: 'bg-slate-100 text-slate-700', text: 'text-slate-700' },
  book_recalculated:  { icon: '🔄', label: 'Book recalculated', badge: 'bg-slate-100 text-slate-700', text: 'text-slate-700' },
};

// Category buckets (used by variants B + D).
const CATEGORY: Record<string, string> = {
  group_created: 'People', member_joined: 'People', member_removed: 'People',
  invite_sent: 'People', invite_link_shared: 'People', settings_changed: 'People',
  expense_created: 'Expenses', expense_updated: 'Expenses', expense_deleted: 'Expenses',
  settlement_recorded: 'Payments', settlement_reverted: 'Payments',
  settlement_edited: 'Payments', reset_settlements: 'Payments',
  book_locked: 'Book', book_unlocked: 'Book', book_recalculated: 'Book',
};

interface Row {
  id: string;
  action: string;
  created_at: string;
  summary: string;
}

const t = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

const MOCK: Row[] = [
  { id: '1',  action: 'group_created',       created_at: t(72), summary: 'Captain created the group “Skull Cove Camp 2026”' },
  { id: '2',  action: 'invite_link_shared',  created_at: t(71.5), summary: 'Captain shared the invite link' },
  { id: '3',  action: 'invite_sent',         created_at: t(71), summary: 'Captain emailed an invite to Sailor' },
  { id: '4',  action: 'member_joined',       created_at: t(70), summary: 'Sailor joined the group' },
  { id: '5',  action: 'settings_changed',    created_at: t(68), summary: 'Captain changed who can edit expenses to “All members”' },
  { id: '6',  action: 'expense_created',     created_at: t(48), summary: 'Captain added an expense “KOA campsite deposit” (118.00 USD)' },
  { id: '7',  action: 'expense_created',     created_at: t(46), summary: 'Sailor added an expense “Firewood bundle” (22.50 USD)' },
  { id: '8',  action: 'expense_updated',     created_at: t(44), summary: 'Sailor edited an expense “Firewood bundle”' },
  { id: '9',  action: 'member_removed',      created_at: t(40), summary: 'Captain removed StaleRandy from the group' },
  { id: '10', action: 'settlement_recorded', created_at: t(30), summary: 'Sailor settled with Captain (49.25 USD)' },
  { id: '11', action: 'expense_deleted',     created_at: t(26), summary: 'Captain deleted an expense “Spare ice run”' },
  { id: '12', action: 'settlement_reverted', created_at: t(24), summary: 'Captain reverted Sailor’s payment to Captain (49.25)' },
  { id: '13', action: 'book_locked',         created_at: t(12), summary: 'Captain locked the book' },
  { id: '14', action: 'settlement_edited',   created_at: t(10), summary: 'Captain edited a payment amount 20.00 → 24.00' },
  { id: '15', action: 'book_recalculated',   created_at: t(8), summary: 'Captain recalculated the book' },
  { id: '16', action: 'reset_settlements',   created_at: t(2), summary: 'Captain reset all balances (3 payments cleared)' },
];

function summaryOf(r: Row) { return r.summary; }

/** The real Log-tab card chrome that any filter must sit inside. */
function LogStage({ children, rows }: { children: React.ReactNode; rows: Row[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      {/* mini nav mock so layout impact is judgeable */}
      <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-2">
        <span className="text-sm font-semibold text-gray-900">Skull Cove Camp 2026</span>
        <span className="text-xs text-gray-400">Expenses · Balances · Members · <span className="font-medium text-gray-700">Log</span></span>
      </div>
      <h2 className="text-lg font-medium text-gray-900 mb-3">Group activity</h2>
      {children}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">No activity matches this filter.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => {
            const meta = META[a.action];
            return (
              <li key={a.id} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3">
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}>
                  <span aria-hidden="true">{meta.icon}</span>
                  {meta.label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800">{summaryOf(a)}</p>
                  <p className="mt-0.5 text-xs text-gray-400">{formatDateTime(a.created_at)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------- Variant A: multi-select chips, all 16 types, with counts ---------- */
function VariantA() {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const counts = MOCK.reduce<Record<string, number>>((acc, r) => ((acc[r.action] = (acc[r.action] || 0) + 1), acc), {});
  const toggle = (a: string) =>
    setSel((prev) => { const n = new Set(prev); n.has(a) ? n.delete(a) : n.add(a); return n; });
  const rows = sel.size === 0 ? MOCK : MOCK.filter((r) => sel.has(r.action));
  return (
    <LogStage rows={rows}>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {Object.keys(META).map((a) => {
          const on = sel.has(a);
          const m = META[a];
          return (
            <button key={a} onClick={() => toggle(a)}
              className={`rounded-full border px-2 py-0.5 text-xs font-medium transition ${
                on ? `${m.badge} border-transparent ring-2 ring-offset-1 ring-gray-300` : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}>
              {m.icon} {m.label} <span className="opacity-60">{counts[a] || 0}</span>
            </button>
          );
        })}
        {sel.size > 0 && (
          <button onClick={() => setSel(new Set())} className="ml-1 text-xs text-blue-600 hover:underline self-center">
            Clear
          </button>
        )}
      </div>
    </LogStage>
  );
}

/* ---------- Variant B: category pills (People/Expenses/Payments/Book) ---------- */
function VariantB() {
  const [cat, setCat] = useState<string>('All');
  const cats = ['All', 'People', 'Expenses', 'Payments', 'Book'];
  const rows = cat === 'All' ? MOCK : MOCK.filter((r) => CATEGORY[r.action] === cat);
  return (
    <LogStage rows={rows}>
      <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
        {cats.map((c) => (
          <button key={c} onClick={() => setCat(c)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              cat === c ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {c}
          </button>
        ))}
      </div>
    </LogStage>
  );
}

/* ---------- Variant C: native dropdown (single-select) ---------- */
function VariantC() {
  const [type, setType] = useState<string>('all');
  const rows = type === 'all' ? MOCK : MOCK.filter((r) => r.action === type);
  return (
    <LogStage rows={rows}>
      <div className="mb-4 flex items-center gap-2">
        <label className="text-xs text-gray-500">Show</label>
        <select value={type} onChange={(e) => setType(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200">
          <option value="all">All activity ({MOCK.length})</option>
          {Object.keys(META).map((a) => (
            <option key={a} value={a}>{META[a].label}</option>
          ))}
        </select>
      </div>
    </LogStage>
  );
}

/* ---------- Variant D: category pills + secondary type chips ---------- */
function VariantD() {
  const [cat, setCat] = useState<string>('All');
  const [type, setType] = useState<string | null>(null);
  const cats = ['All', 'People', 'Expenses', 'Payments', 'Book'];
  const pickCat = (c: string) => { setCat(c); setType(null); };
  const inCat = cat === 'All' ? MOCK : MOCK.filter((r) => CATEGORY[r.action] === cat);
  const typesInCat = [...new Set(inCat.map((r) => r.action))];
  const rows = type ? inCat.filter((r) => r.action === type) : inCat;
  return (
    <LogStage rows={rows}>
      <div className="mb-2 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
        {cats.map((c) => (
          <button key={c} onClick={() => pickCat(c)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              cat === c ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {c}
          </button>
        ))}
      </div>
      {typesInCat.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {typesInCat.map((a) => {
            const on = type === a;
            const m = META[a];
            return (
              <button key={a} onClick={() => setType(on ? null : a)}
                className={`rounded-full border px-2 py-0.5 text-xs transition ${
                  on ? `${m.badge} border-transparent` : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                }`}>
                {m.icon} {m.label}
              </button>
            );
          })}
        </div>
      )}
      {typesInCat.length <= 1 && <div className="mb-4" />}
    </LogStage>
  );
}

export default function LogFilterPlayground() {
  const variants: { key: string; title: string; blurb: string; el: React.ReactNode }[] = [
    { key: 'A', title: 'A — Type chips (multi-select, counts)', blurb: 'Every log type as a colored chip matching its badge; tap to toggle, combine several. Widest control, most horizontal space (wraps to ~3 rows on mobile).', el: <VariantA /> },
    { key: 'B', title: 'B — Category segmented control', blurb: 'One compact pill row: All / People / Expenses / Payments / Book. One tap, always one row, mobile-friendly. Coarser: can’t isolate “Settled” from “Payment edited”.', el: <VariantB /> },
    { key: 'C', title: 'C — Native dropdown', blurb: 'Tiny “Show ▾” select with all 16 types. Smallest footprint; single-select only; native styling varies by platform.', el: <VariantC /> },
    { key: 'D', title: 'D — Category pills + drill-down chips', blurb: 'B’s one-row category control, then a second row of type chips ONLY within the chosen category. Two-step drill keeps rows short and still reaches every type.', el: <VariantD /> },
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Log filter — pick your weapon</h1>
      <p className="mt-1 text-sm text-gray-500 select-text">
        Four treatments for filtering the group Log tab by event type. All fully interactive over the same 16-event mock
        (includes the 5 new roster types: Group created, Removed, Invite emailed, Link shared, Settings). Click to filter —
        each variant filters live. Combine parts freely (e.g. “B’s control with A’s chip colors”).
      </p>
      <div className="mt-6 space-y-10">
        {variants.map((v) => (
          <section key={v.key}>
            <h2 className="text-base font-semibold text-gray-900">{v.title}</h2>
            <p className="mb-3 mt-0.5 text-xs text-gray-500 select-text">{v.blurb}</p>
            {v.el}
          </section>
        ))}
      </div>
      <p className="mt-8 text-xs text-gray-400 select-text">
        Authority line: winner gets wired into GroupActivityTab.tsx (client-side filter over the already-fetched feed — no server change needed). This playground stays live at /log-filter-playground.
      </p>
    </div>
  );
}
