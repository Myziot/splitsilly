import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { createMemberColorMap } from '../utils/memberColor';

/**
 * About / demo page.
 * Static, no live data. Shows what Splitsilly is, a pirate-flavored quote
 * (email style), how-it-works, a feature list, and mockup "screenshots"
 * built from static JSX so a first-time visitor sees the sharing flow.
 *
 * The mocks below are deliberately faithful to the real deck in GroupDetail:
 * the indigo "Total group expense" banner, the "Who paid cash" gradient rows,
 * the real expense table (Date / Paid-by / Amount / Split-type / Your-part),
 * and the "Who owes / is owed" centered bars plus "Who owes who" suggested
 * payments. So a visitor sees roughly what they'll get.
 */

// Stable member roster for the mocks — same as a real group.
// Sorted stabilises their golden-angle colors (see memberColor.ts).
const MEMBERS = [
  { id: 'u_you', name: 'You' },
  { id: 'u_sailor', name: 'Sailor' },
  { id: 'u_cap', name: 'Cap’n' },
  { id: 'u_parrot', name: 'Polly' },
  { id: 'u_kraken', name: 'Kraken' },
] as const;
const colorFor = createMemberColorMap(MEMBERS.map((m) => m.id));
const dot = (id: string) => colorFor(id)?.border || '#6b7280';

// Month -> DateBadge accent (mirrors DateBadge.tsx), July = teal.
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
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
};

// Currency pills (mirrors CurrencyBadge.tsx subset used here).
const CUR: Record<string, { sym: string; cls: string }> = {
  USD: { sym: '💵', cls: 'bg-green-100 text-green-800 border-green-200' },
  EUR: { sym: '💶', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
};

// ---- Mock data -------------------------------------------------------
const EXPENSES = [
  { id: 'e1', desc: 'Tent rental', cat: '⛺', date: '2026-07-04', paidBy: 'u_you', cur: 'USD', amount: 45.0, master: 45.0, split: 'equal', yourPart: 11.25, flagged: true },
  { id: 'e2', desc: 'Groceries', cat: '🛒', date: '2026-07-05', paidBy: 'u_sailor', cur: 'EUR', amount: 30.0, master: 32.4, split: 'shares', yourPart: 10.8, flagged: false },
  { id: 'e3', desc: 'Fuel', cat: '⛽', date: '2026-07-06', paidBy: 'u_cap', cur: 'USD', amount: 60.0, master: 60.0, split: 'percent', yourPart: 18.0, flagged: false },
];
// Who paid cash (pure cash out, ignores balances) — ordered by amount.
const PAID_CASH = [
  { id: 'u_cap', name: 'Cap’n', paid: 60.0 },
  { id: 'u_you', name: 'You', paid: 45.0 },
  { id: 'u_sailor', name: 'Sailor', paid: 32.4 },
];
const GROUP_TOTAL = PAID_CASH.reduce((s, m) => s + m.paid, 0);
const MAX_PAID = Math.max(...PAID_CASH.map((m) => m.paid), 1);

// Who owes / is owed (centered bars). Positive = is owed, negative = owes.
const BALANCES = [
  { id: 'u_you', name: 'You', balance: 18.45 },
  { id: 'u_sailor', name: 'Sailor', balance: -26.25 },
  { id: 'u_cap', name: 'Cap’n', balance: 7.8 },
  { id: 'u_parrot', name: 'Polly', balance: 0 },
];
const MAX_ABS = Math.max(...BALANCES.map((b) => Math.abs(b.balance)), 1);

// Who owes who — suggested minimal payments.
const OWES_WHO = [
  { from: 'u_sailor', to: 'u_you', amount: 26.25 },
  { from: 'u_sailor', to: 'u_cap', amount: 7.8 },
];

export default function About() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Minimal nav: no bell, no user "?" chip, no logout — just the logo + About link. */}
      <TopBar minimal />

      <main className="max-w-3xl mx-auto px-4 py-10 sm:px-6">
        {/* Hero */}
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Splitsilly
          </h1>
          <p className="mt-3 text-lg text-gray-600">
            Share expenses with friends — split fair, settle easy.
          </p>
        </div>

        {/* Quote (pirate, email-style) */}
        <blockquote className="mx-auto mt-8 max-w-xl rounded-lg border-l-4 border-blue-500 bg-blue-50 px-5 py-4">
          <p className="text-sm italic text-blue-900">
            “Fair winds an' honest splits — Splitsilly keeps every coin accounted
            for, so no mate's left holdin' the bag.”
          </p>
          <footer className="mt-2 text-xs not-italic text-blue-700">
            — Splitsilly, a local cost-sharing app
          </footer>
        </blockquote>

        {/* How it works */}
        <section className="mt-10">
          <h2 className="text-xl font-semibold text-gray-900">How it works</h2>
          <ol className="mt-4 space-y-3">
            {[
              ['Create a group', 'Give it a name and currency. An invite link is made for ye.'],
              ['Add expenses', 'Log what was paid and who paid it. Split by equal, shares, or percent.'],
              ['See who owes whom', 'Balances update live. Late joiners get folded in honest-like.'],
              ['Settle up', 'Record a payment in one tap. The log keeps the whole crew accountable.'],
            ].map(([t, d], i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{t}</p>
                  <p className="text-sm text-gray-500">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section className="mt-10">
          <h2 className="text-xl font-semibold text-gray-900">Features</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              'Equal / shares / percent splits',
              'Per-member participation (equal)',
              'Transparent group activity log',
              'One-tap settlements with From-lock',
              'Multi-currency with exchange rates',
              'Late-joiner review flags',
              'Invite by link or email',
              'Notifications for the whole crew',
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 rounded-md bg-white px-3 py-2 text-sm text-gray-700 shadow-sm">
                <span className="mt-0.5 text-blue-600">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </section>

        {/* Mockups — faithful to the real deck */}
        <section className="mt-10">
          <h2 className="text-xl font-semibold text-gray-900">A peek at the deck</h2>
          <p className="mt-1 text-sm text-gray-500">
            Static previews — the real thing fills in with your group's data.
          </p>

          <div className="mt-4 space-y-8">
            {/* ── Mock 1: Expenses tab ───────────────────────────────── */}
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500">
                Group · Crow Reef camping
              </div>

              {/* Total group expense banner (indigo, like the real app) */}
              <div className="flex items-center justify-between rounded-xl bg-indigo-600 px-5 py-4 text-white shadow-sm mx-4 mt-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-indigo-200">Total group expense</p>
                  <p className="text-sm text-indigo-100">Across 3 expenses</p>
                </div>
                <p className="text-2xl font-bold tabular-nums">{GROUP_TOTAL.toFixed(2)} USD</p>
              </div>

              {/* Who paid cash (gradient rows, mono — like PaidCashSummary) */}
              <div className="mb-4 mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm font-mono mx-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900">Who paid cash</h3>
                  <span className="text-xs text-gray-400">out of {GROUP_TOTAL.toFixed(2)} USD</span>
                </div>
                <ol className="mt-2 space-y-1">
                  {PAID_CASH.map((m, i) => {
                    const pct = (m.paid / MAX_PAID) * 100;
                    return (
                      <li
                        key={m.id}
                        className="relative overflow-hidden rounded-lg px-3 py-2 bg-gradient-to-r from-indigo-500/70 to-indigo-700/30"
                      >
                        <div className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${pct}%` }} />
                        <div className="relative flex items-center justify-between">
                          <span className="flex items-center gap-2 font-medium text-white">
                            <span className="font-bold text-indigo-200">{i + 1}.</span>
                            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: dot(m.id) }} />
                            {m.name}
                          </span>
                          <span className="tabular-nums rounded-md px-2 py-0.5 text-xs font-bold text-white" style={{ background: '#4f46e5' }}>
                            {m.paid.toFixed(2)} USD
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {/* Expense table — same columns as the real deck */}
              <div className="px-4 pb-4">
                <h2 className="text-lg font-medium text-gray-900 mb-2">Expenses</h2>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-left">
                    <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-3 py-2">Expense</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Paid by</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2">Split type</th>
                        <th className="px-3 py-2">Your part</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white text-sm">
                      {EXPENSES.map((e) => {
                        const splitMeta: Record<string, { label: string; icon: string; sub?: string }> = {
                          equal: { label: 'Equal', icon: '⚖️' },
                          shares: { label: 'Shares', icon: '🥧', sub: '3 shares' },
                          percent: { label: 'Percent', icon: '📊', sub: '30%' },
                        };
                        const sm = splitMeta[e.split];
                        const c = CUR[e.cur];
                        return (
                          <tr key={e.id} className="align-middle">
                            <td className="px-3 py-3">
                              <div className="flex items-center">
                                <span className="text-xl mr-2">{e.cat}</span>
                                <span className="font-medium text-gray-900">{e.desc}</span>
                                {e.flagged && (
                                  <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700" title="A member joined after this expense — review your split">
                                    ⚠
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${MONTH_ACCENT[Number(e.date.split('-')[1])]}`}>
                                <span className="font-semibold tabular-nums">{fmtDate(e.date)}</span>
                              </span>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span
                                className="inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-0.5"
                                style={{ borderColor: dot(e.paidBy), backgroundColor: colorFor(e.paidBy)?.bg, color: colorFor(e.paidBy)?.text }}
                              >
                                <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold leading-none text-white" style={{ backgroundColor: dot(e.paidBy) }}>
                                  {MEMBERS.find((m) => m.id === e.paidBy)?.name.slice(0, 1)}
                                </span>
                                <span className="text-sm font-bold">{MEMBERS.find((m) => m.id === e.paidBy)?.name}</span>
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${c.cls}`}>
                                  <span className="text-sm leading-none">{c.sym}</span>
                                  {e.cur}
                                </span>
                                <span className="text-sm font-semibold text-gray-900 tabular-nums">{e.amount.toFixed(2)}</span>
                              </div>
                              {e.cur !== 'USD' && (
                                <p className="text-xs text-gray-500 mt-0.5">≈ {e.master.toFixed(2)} USD</p>
                              )}
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                                <span aria-hidden="true">{sm.icon}</span>
                                {sm.label}
                                {sm.sub ? ` (${sm.sub})` : ''}
                              </span>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700">
                              <span className="capitalize font-medium">{e.split === 'equal' ? 'equal' : sm.sub}</span>
                              <span className="text-gray-500"> · {e.yourPart.toFixed(2)} USD</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ── Mock 2: Balances tab ───────────────────────────────── */}
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500">
                Balances
              </div>

              {/* Who owes / is owed — centered bars */}
              <div className="p-5">
                <h3 className="mb-1 text-lg font-bold text-gray-900">Who owes / is owed</h3>
                <p className="mb-4 text-xs font-medium text-emerald-600">
                  Green extends right (is owed) · Red extends left (owes) · Gray = settled
                </p>
                <div className="space-y-4">
                  {BALANCES.map((b) => {
                    const settled = Math.abs(b.balance) < 0.01;
                    const owed = b.balance > 0;
                    const pct = (Math.abs(b.balance) / MAX_ABS) * 50;
                    return (
                      <div key={b.id} className="flex items-center gap-3">
                        <span
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                          style={{ background: dot(b.id) }}
                        >
                          {b.name.slice(0, 1)}
                        </span>
                        <div className="flex-1">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-800">{b.name}</span>
                            {settled ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Settled ✓</span>
                            ) : (
                              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${owed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {owed ? 'is owed' : 'owes'}
                              </span>
                            )}
                          </div>
                          <div className="relative h-5 rounded bg-gray-100">
                            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300" />
                            {settled ? (
                              <div className="absolute left-1/2 top-0.5 bottom-0.5 w-0.5 -translate-x-1/2 rounded bg-gray-400" />
                            ) : (
                              <div
                                className={`absolute top-0.5 bottom-0.5 rounded ${owed ? 'bg-green-500' : 'bg-red-500'}`}
                                style={owed ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }}
                              />
                            )}
                          </div>
                        </div>
                        <div className={`w-24 shrink-0 text-right text-sm font-bold ${settled ? 'text-gray-400' : owed ? 'text-green-600' : 'text-red-600'}`}>
                          {settled ? '0.00' : `${owed ? '+' : ''}${b.balance.toFixed(2)}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Who owes who — suggested minimal payments */}
              <div className="px-5 pb-5">
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-1 text-lg font-bold text-gray-900">Who owes who</h3>
                  <p className="mb-3 text-xs font-medium text-emerald-600">
                    Suggested payments to settle everyone up (minimum transactions)
                  </p>
                  <ul className="divide-y divide-gray-100">
                    {OWES_WHO.map((tx, idx) => (
                      <li key={idx} className="flex items-center gap-2 py-2 text-sm">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: dot(tx.from) }}>
                          {MEMBERS.find((m) => m.id === tx.from)?.name.slice(0, 1)}
                        </span>
                        <span className="font-medium text-gray-800">{MEMBERS.find((m) => m.id === tx.from)?.name}</span>
                        <span className="text-gray-400">pays</span>
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: dot(tx.to) }}>
                          {MEMBERS.find((m) => m.id === tx.to)?.name.slice(0, 1)}
                        </span>
                        <span className="font-medium text-gray-800">{MEMBERS.find((m) => m.id === tx.to)?.name}</span>
                        <span className="ml-auto font-bold text-gray-900">{tx.amount.toFixed(2)} USD</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <div className="mt-10 text-center">
          <Link
            to="/login"
            className="inline-flex items-center rounded-md bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700"
          >
            Get started
          </Link>
          <p className="mt-3 text-xs text-gray-400">
            Already sailin'? <Link to="/login" className="text-blue-600 hover:text-blue-500">Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
