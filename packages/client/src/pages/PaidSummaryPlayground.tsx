import { useState } from 'react';

/* ------------------------------------------------------------------ */
/* Paid-Cash Summary — Design Playground                              */
/* Shows, per member, how much CASH they paid out of the total group   */
/* expenses (regardless of who-owes-whom balances). Bundled with the   */
/* "Total group expense" concept. 4 distinct visualizations to pick.   */
/* Mock data mirrors the live shape (expenses[].paid_by / amount_master). */
/* ------------------------------------------------------------------ */

interface Member {
  id: string;
  name: string;
  // Pure cash paid out (sum of amount_master where paid_by === id).
  paid: number;
}

const PALETTE = ['#2563eb', '#16a34a', '#db2777', '#d97706', '#7c3aed', '#0891b2'];

const MEMBERS: Member[] = [
  { id: 'u1', name: 'Alex', paid: 142.5 },
  { id: 'u2', name: 'Bree', paid: 38.0 },
  { id: 'u3', name: 'Chen', paid: 71.25 },
  { id: 'u4', name: 'Dana', paid: 75.75 },
];
const GROUP_TOTAL = 327.5;
const CURRENCY = 'USD';

const colorFor = (id: string) => PALETTE[MEMBERS.findIndex((m) => m.id === id) % PALETTE.length];
const maxPaid = Math.max(...MEMBERS.map((m) => m.paid), 1);

// The "Total group expense" card (shared chrome for all variants).
function TotalCard({ children }: { children?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-indigo-600 px-5 py-4 text-white shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-indigo-200">Total group expense</p>
          <p className="text-sm text-indigo-100">Sum of all expenses (ignores balances)</p>
        </div>
        <p className="text-2xl font-bold tabular-nums">
          {GROUP_TOTAL.toFixed(2)} {CURRENCY}
        </p>
      </div>
      {children}
    </div>
  );
}

function PhoneFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-xs font-semibold text-gray-500 mb-1">{label}</div>
      <div className="w-[360px] min-h-[420px] bg-gray-50 border border-gray-200 rounded-2xl shadow-sm p-4 flex flex-col gap-3">
        {children}
      </div>
    </div>
  );
}

/* ---- Variant A: horizontal stacked bar (proportion of total) ------- */
function VariantA() {
  return (
    <TotalCard>
      <div className="mt-3">
        <p className="mb-1 text-xs text-indigo-200">Who paid (share of total)</p>
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-indigo-800">
          {MEMBERS.map((m) => (
            <div
              key={m.id}
              style={{ width: `${(m.paid / GROUP_TOTAL) * 100}%`, background: colorFor(m.id) }}
              title={`${m.name}: ${m.paid.toFixed(2)}`}
            />
          ))}
        </div>
        <div className="mt-2 space-y-0.5">
          {MEMBERS.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-xs text-indigo-100">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: colorFor(m.id) }} />
                {m.name}
              </span>
              <span className="tabular-nums">
                {m.paid.toFixed(2)} ({((m.paid / GROUP_TOTAL) * 100).toFixed(0)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </TotalCard>
  );
}

/* ---- Variant B: per-member progress bars (paid vs total) ----------- */
function VariantB() {
  return (
    <TotalCard>
      <div className="mt-3 space-y-2">
        <p className="text-xs text-indigo-200">Who paid cash</p>
        {MEMBERS.map((m) => (
          <div key={m.id}>
            <div className="mb-0.5 flex items-center justify-between text-xs text-indigo-100">
              <span>{m.name}</span>
              <span className="tabular-nums">{m.paid.toFixed(2)} {CURRENCY}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-indigo-800">
              <div
                className="h-2 rounded-full"
                style={{ width: `${(m.paid / maxPaid) * 100}%`, background: colorFor(m.id) }}
              />
            </div>
          </div>
        ))}
      </div>
    </TotalCard>
  );
}

/* ---- Variant C: donut + legend ------------------------------------ */
function VariantC() {
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const segs = MEMBERS.map((m) => {
    const frac = m.paid / GROUP_TOTAL;
    const len = frac * c;
    const seg = { m, len, off: offset };
    offset += len;
    return seg;
  });
  return (
    <TotalCard>
      <div className="mt-3 flex items-center gap-4">
        <svg width="96" height="96" viewBox="0 0 96 96" className="shrink-0">
          <g transform="rotate(-90 48 48)">
            <circle cx="48" cy="48" r={r} fill="none" stroke="#3730a3" strokeWidth="12" />
            {segs.map((s) => (
              <circle
                key={s.m.id}
                cx="48"
                cy="48"
                r={r}
                fill="none"
                stroke={colorFor(s.m.id)}
                strokeWidth="12"
                strokeDasharray={`${s.len} ${c - s.len}`}
                strokeDashoffset={-s.off}
              />
            ))}
          </g>
        </svg>
        <div className="space-y-0.5 text-xs text-indigo-100">
          {MEMBERS.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: colorFor(m.id) }} />
                {m.name}
              </span>
              <span className="tabular-nums">{m.paid.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </TotalCard>
  );
}

/* ---- Variant D: compact ranked list (1st payer → last) ------------ */
function VariantD() {
  const ranked = [...MEMBERS].sort((a, b) => b.paid - a.paid);
  return (
    <TotalCard>
      <div className="mt-3">
        <p className="mb-1 text-xs text-indigo-200">Top payers</p>
        <ol className="space-y-1">
          {ranked.map((m, i) => (
            <li key={m.id} className="flex items-center justify-between rounded-lg bg-indigo-700/60 px-2 py-1 text-xs text-white">
              <span className="flex items-center gap-2">
                <span className="font-bold text-indigo-200">{i + 1}.</span>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: colorFor(m.id) }} />
                {m.name}
              </span>
              <span className="tabular-nums font-semibold">{m.paid.toFixed(2)} {CURRENCY}</span>
            </li>
          ))}
        </ol>
      </div>
    </TotalCard>
  );
}

export default function PaidSummaryPlayground() {
  return (
    <div className="min-h-screen bg-white p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Paid-Cash Summary — 4 visualizations</h1>
      <p className="text-sm text-gray-500 mb-6">
        Per-member CASH paid out of the total group expense (ignores who-owes-whom).
        Bundled inside the "Total group expense" card. Pick one and we'll wire it in.
      </p>
      <div className="flex flex-wrap gap-8">
        <PhoneFrame label="A — stacked share-of-total bar">
          <VariantA />
        </PhoneFrame>
        <PhoneFrame label="B — per-member progress bars">
          <VariantB />
        </PhoneFrame>
        <PhoneFrame label="C — donut + legend">
          <VariantC />
        </PhoneFrame>
        <PhoneFrame label="D — ranked top-payers list">
          <VariantD />
        </PhoneFrame>
      </div>
    </div>
  );
}
