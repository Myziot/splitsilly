import { useState } from 'react';
import { formatDate } from '../utils/format';

/* ------------------------------------------------------------------ */
/* Shared mock data — mirrors the live shape from the API so the       */
/* preview is faithful. In the real Balances tab these come from:      */
/*   balances  -> GET /api/v1/groups/:id/balances                      */
/*   payments  -> GET /api/v1/groups/:id/settlements                   */
/*   tripTotal -> sum of expenses.amount_master (client-side)          */
/* ------------------------------------------------------------------ */

interface Member {
  id: string;
  name: string;
  // Net balance in group master currency.
  //  > 0  => member is OWED money (surplus / expecting)  -> GREEN
  //  < 0  => member OWES money (deficit)                 -> RED
  //  ~ 0  => member is SETTLED (net zero)                -> GRAY + ✓
  balance: number;
}

interface Payment {
  id: string;
  from: string; // member id (payer)
  to: string; // member id (receiver)
  amount: number;
  note: string;
  at: string; // ISO date
}

// Golden-angle palette (mirrors utils/memberColor.ts) so avatars match the app.
const PALETTE = ['#2563eb', '#16a34a', '#db2777', '#d97706', '#7c3aed', '#0891b2'];

const MEMBERS: Member[] = [
  { id: 'u1', name: 'Alex', balance: 84.5 },
  { id: 'u2', name: 'Bree', balance: -42.0 },
  { id: 'u3', name: 'Chen', balance: 12.25 },
  { id: 'u4', name: 'Dana', balance: -55.75 },
  { id: 'u5', name: 'Eli', balance: 0.0 }, // <-- settled example
];

const PAYMENTS: Payment[] = [
  { id: 'p1', from: 'u2', to: 'u1', amount: 20.0, note: 'Dinner split', at: '2026-07-08' },
  { id: 'p2', from: 'u4', to: 'u1', amount: 35.0, note: 'Camping gear', at: '2026-07-09' },
  { id: 'p3', from: 'u2', to: 'u3', amount: 8.0, note: 'Gas', at: '2026-07-10' },
  { id: 'p4', from: 'u4', to: 'u3', amount: 4.25, note: 'Coffee', at: '2026-07-10' },
];

// Trip total = sum of ALL expenses (master currency), irrespective of balances.
// In the live tab this is computed from the expenses list, not hardcoded.
const TRIP_TOTAL = 327.5;
const CURRENCY = 'USD';

const memberById = (id: string) => MEMBERS.find((m) => m.id === id)!;
const colorFor = (id: string) => PALETTE[MEMBERS.findIndex((m) => m.id === id) % PALETTE.length];
const fmt = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)} ${CURRENCY}`;
const isSettled = (b: number) => Math.abs(b) < 0.01;
// Largest |balance| across members, for scaling bar widths.
const absMax = Math.max(...MEMBERS.map((m) => Math.abs(m.balance)), 1);

/* ------------------------------------------------------------------ */
/* Small shared building blocks                                        */
/* ------------------------------------------------------------------ */

function Avatar({ id, size = 28 }: { id: string; size?: number }) {
  const m = memberById(id);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold text-white shrink-0"
      style={{ background: colorFor(id), width: size, height: size, fontSize: size * 0.42 }}
    >
      {m.name.slice(0, 1)}
    </span>
  );
}

function SignPill({ balance }: { balance: number }) {
  if (isSettled(balance)) {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
        Settled ✓
      </span>
    );
  }
  const owed = balance > 0;
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-bold ${
        owed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {owed ? 'is owed' : 'owes'}
    </span>
  );
}

/* Payment log — Option A style: compact rows, avatar → avatar, amount, short date. */
function PaymentLog() {
  if (PAYMENTS.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">No payments recorded yet.</p>;
  }
  return (
    <ul className="divide-y divide-gray-100">
      {PAYMENTS.map((p) => (
        <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
          <Avatar id={p.from} size={24} />
          <span className="font-medium text-gray-800">{memberById(p.from).name}</span>
          <span className="text-gray-400">→</span>
          <Avatar id={p.to} size={24} />
          <span className="font-medium text-gray-800">{memberById(p.to).name}</span>
          <span className="ml-auto font-bold text-gray-900">{p.amount.toFixed(2)}</span>
          <span className="text-xs text-gray-400 w-24 text-right">{formatDate(p.at)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* FINAL DESIGN — Option B chart + Option A log + trip total + settled */
/* ------------------------------------------------------------------ */

export default function BalancePlayground() {
  // In the live tab this would be driven by the optimize button / new settlement.
  // Here we keep a local "optimized" toggle just to preview the settled state.
  const [note, setNote] = useState(
    'Selected design: Option B chart + Option A log. Tap a member row to preview the settled state.'
  );

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Balance Dashboard — Final Design</h1>
          <p className="mt-1 text-gray-600">
            Option B chart (avatar bullets, green = is owed / red = owes) with the Option A payment
            log, a trip total, and a “Settled ✓” state for members at net zero.
          </p>
        </header>

        {/* Trip total banner */}
        <div className="mb-4 flex items-center justify-between rounded-xl bg-indigo-600 px-5 py-4 text-white shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-indigo-200">Total trip cost</p>
            <p className="text-sm text-indigo-100">Sum of all expenses (ignores balances)</p>
          </div>
          <p className="text-2xl font-bold tabular-nums">
            {TRIP_TOTAL.toFixed(2)} {CURRENCY}
          </p>
        </div>

        {/* Member balance chart (Option B) */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-lg font-bold text-gray-900">Who owes / is owed</h2>
          <p className="mb-4 text-xs font-medium text-emerald-600">
            Green extends right (is owed) · Red extends left (owes) · Gray = settled
          </p>
          <div className="space-y-4">
            {MEMBERS.map((m) => {
              const settled = isSettled(m.balance);
              const owed = m.balance > 0;
              const pct = (Math.abs(m.balance) / absMax) * 50;
              return (
                <div key={m.id} className="flex items-center gap-3">
                  <Avatar id={m.id} size={36} />
                  <div className="flex-1">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-800">{m.name}</span>
                      <SignPill balance={m.balance} />
                    </div>
                    <div className="relative h-5 rounded bg-gray-100">
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300" />
                      {settled ? (
                        <div className="absolute left-1/2 top-0.5 bottom-0.5 w-0.5 -translate-x-1/2 rounded bg-gray-400" />
                      ) : (
                        <div
                          className={`absolute top-0.5 bottom-0.5 rounded ${
                            owed ? 'bg-green-500' : 'bg-red-500'
                          }`}
                          style={owed ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }}
                        />
                      )}
                    </div>
                  </div>
                  <div
                    className={`w-24 shrink-0 text-right text-sm font-bold ${
                      settled ? 'text-gray-400' : owed ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {settled ? '0.00' : fmt(m.balance)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment log (Option A) */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-lg font-bold text-gray-900">Payment log</h2>
          <p className="mb-3 text-xs font-medium text-emerald-600">
            Who actually paid whom — visible to everyone
          </p>
          <PaymentLog />
        </div>

        <footer className="mt-8 text-center text-sm text-gray-500">{note}</footer>
      </div>
    </div>
  );
}
