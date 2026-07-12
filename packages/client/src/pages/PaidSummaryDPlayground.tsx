import { useState } from 'react';

/* ------------------------------------------------------------------ */
/* Paid-Cash Summary — Variant D iteration                            */
/* Ranked "who paid cash" list, each row showing a bar overlay.       */
/* 3 background treatments + 1 disconnected (separate row/cell).      */
/* Mock data mirrors live shape (expenses[].paid_by / amount_master). */
/* ------------------------------------------------------------------ */

interface Member {
  id: string;
  name: string;
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
const n = MEMBERS.length;
const ranked = [...MEMBERS].sort((a, b) => b.paid - a.paid);
const maxPaid = Math.max(...MEMBERS.map((m) => m.paid), 1);

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
      <div className="text-xs font-semibold text-gray-500 mb-1 max-w-[360px] text-center">{label}</div>
      <div className="w-[360px] min-h-[400px] bg-gray-50 border border-gray-200 rounded-2xl shadow-sm p-4 flex flex-col gap-3">
        {children}
      </div>
    </div>
  );
}

// A single ranked row: rank #, name, amount, and an in-row bar overlay.
// `bg` controls the row background; `barBg` the in-row bar fill.
function RankRow({
  member,
  rank,
  bgClass,
  barBg,
  barColor,
  barStyle,
}: {
  member: Member;
  rank: number;
  bgClass: string;
  barBg: string;
  barColor: string;
  barStyle?: React.CSSProperties;
}) {
  const pct = (member.paid / maxPaid) * 100;
  return (
    <li className={`relative overflow-hidden rounded-lg px-3 py-2 ${bgClass}`}>
      {/* In-row bar overlay (sits behind the text). */}
      <div
        className={`absolute inset-y-0 left-0 ${barBg}`}
        style={{ width: `${pct}%`, ...barStyle }}
      />
      <div className="relative flex items-center justify-between">
        <span className="flex items-center gap-2 font-medium text-gray-900">
          <span className="font-bold text-gray-400">{rank}.</span>
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: barColor }} />
          {member.name}
        </span>
        <span className="tabular-nums font-semibold text-gray-900">{member.paid.toFixed(2)} {CURRENCY}</span>
      </div>
    </li>
  );
}

/* ---- D1: neutral striped rows + soft gray bar overlay ------------- */
function VariantD1() {
  return (
    <TotalCard>
      <div className="mt-3">
        <p className="mb-1 text-xs text-indigo-200">Top payers</p>
        <ol className="space-y-1">
          {ranked.map((m, i) => (
            <RankRow
              key={m.id}
              member={m}
              rank={i + 1}
              bgClass={i % 2 === 0 ? 'bg-indigo-700/40' : 'bg-indigo-700/20'}
              barBg="bg-white/30"
              barColor={colorFor(m.id)}
            />
          ))}
        </ol>
      </div>
    </TotalCard>
  );
}

/* ---- D2: member-tinted row backgrounds + solid color bar ---------- */
function VariantD2() {
  return (
    <TotalCard>
      <div className="mt-3">
        <p className="mb-1 text-xs text-indigo-200">Top payers</p>
        <ol className="space-y-1">
          {ranked.map((m, i) => (
            <RankRow
              key={m.id}
              member={m}
              rank={i + 1}
              bgClass="bg-white/10"
              barBg=""
              barColor={colorFor(m.id)}
              barStyle={{ background: colorFor(m.id), opacity: 0.35 }}
            />
          ))}
        </ol>
      </div>
    </TotalCard>
  );
}

/* ---- D3: gradient indigo rows + full-width bar as the row bg ----- */
function VariantD3() {
  return (
    <TotalCard>
      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Who paid cash</h3>
          <span className="text-xs text-indigo-200">
            out of {GROUP_TOTAL.toFixed(2)} {CURRENCY}
          </span>
        </div>
        <ol className="space-y-1 font-mono">
          {ranked.map((m, i) => {
            const pct = (m.paid / maxPaid) * 100;
            return (
              <li key={m.id} className="relative overflow-hidden rounded-lg px-3 py-2 bg-gradient-to-r from-indigo-500/70 to-indigo-700/30">
                <div className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${pct}%` }} />
                <div className="relative flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium text-white">
                    <span className="font-bold text-indigo-200">{i + 1}.</span>
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorFor(m.id) }} />
                    {m.name}
                  </span>
                  <span className="tabular-nums font-semibold text-white">{m.paid.toFixed(2)} {CURRENCY}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </TotalCard>
  );
}

/* ---- D4: DISCONNECTED — separate card/row below the total -------- */
function VariantD4() {
  return (
    <>
      <TotalCard />
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Who paid cash</h3>
          <span className="text-xs text-gray-400">out of {GROUP_TOTAL.toFixed(2)} {CURRENCY}</span>
        </div>
        <ol className="space-y-1">
          {ranked.map((m, i) => (
            <li key={m.id} className="relative overflow-hidden rounded-lg bg-gray-50 px-3 py-2">
              <div
                className="absolute inset-y-0 left-0 opacity-20"
                style={{ width: `${(m.paid / maxPaid) * 100}%`, background: colorFor(m.id) }}
              />
              <div className="relative flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                  <span className="font-bold text-gray-400">{i + 1}.</span>
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorFor(m.id) }} />
                  {m.name}
                </span>
                <span className="tabular-nums text-sm font-semibold text-gray-800">
                  {m.paid.toFixed(2)} {CURRENCY}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

export default function PaidSummaryDPlayground() {
  return (
    <div className="min-h-screen bg-white p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Variant D — iteration (3 bg + 1 disconnected)</h1>
      <p className="text-sm text-gray-500 mb-6">
        Ranked "who paid cash" list with an in-row bar overlay. D1/D2/D3 stay bundled in the
        Total card with different row backgrounds; D4 is a separate card/row below the total.
      </p>
      <div className="flex flex-wrap gap-8">
        <PhoneFrame label="D1 — striped rows + soft bar overlay">
          <VariantD1 />
        </PhoneFrame>
        <PhoneFrame label="D2 — member-tinted rows + color bar">
          <VariantD2 />
        </PhoneFrame>
        <PhoneFrame label="D3 — gradient rows + bar-as-bg">
          <VariantD3 />
        </PhoneFrame>
        <PhoneFrame label="D4 — DISCONNECTED separate card">
          <VariantD4 />
        </PhoneFrame>
      </div>
    </div>
  );
}
