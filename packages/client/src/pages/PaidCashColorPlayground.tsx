import { useState } from 'react';

/* ------------------------------------------------------------------ */
/* PaidCash numbers — color / bubble playground                      */
/* 4 options for how the per-member paid amount reads against the      */
/* gradient row. Option 4 wraps the number in a solid colored "bubble" */
/* (like the CurrencyBadge / payer dot) so it pops off the gradient.   */
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
const ranked = [...MEMBERS].sort((a, b) => b.paid - a.paid);
const maxPaid = Math.max(...MEMBERS.map((m) => m.paid), 1);

function Row({
  member,
  rank,
  amountNode,
}: {
  member: Member;
  rank: number;
  amountNode: React.ReactNode;
}) {
  const pct = (member.paid / maxPaid) * 100;
  return (
    <li className="relative overflow-hidden rounded-lg px-3 py-2 bg-gradient-to-r from-indigo-500/70 to-indigo-700/30">
      <div className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${pct}%` }} />
      <div className="relative flex items-center justify-between">
        <span className="flex items-center gap-2 font-medium text-white">
          <span className="font-bold text-indigo-200">{rank}.</span>
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorFor(member.id) }} />
          {member.name}
        </span>
        {amountNode}
      </div>
    </li>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-xs font-semibold text-gray-500 mb-1 max-w-[360px] text-center">{title}</div>
      <div className="w-[360px] min-h-[300px] bg-gray-50 border border-gray-200 rounded-2xl shadow-sm p-4 flex flex-col gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm font-mono">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Who paid cash</h3>
            <span className="text-xs text-gray-400">out of {GROUP_TOTAL.toFixed(2)} {CURRENCY}</span>
          </div>
          <ol className="mt-2 space-y-1">{children}</ol>
        </div>
      </div>
    </div>
  );
}

/* ---- A2: gold text on iterated backgrounds/bars (find contrast) -- */
// Three sub-treatments: each pairs gold (#FFD700) text with a background
// that makes it pop. Row bg + bar vary; gold stays constant so we can judge
// which backdrop gives the best contrast to gold.
function GoldRow({
  member,
  rank,
  rowClass,
  barClass,
}: {
  member: Member;
  rank: number;
  rowClass: string;
  barClass: string;
}) {
  const pct = (member.paid / maxPaid) * 100;
  return (
    <li className={`relative overflow-hidden rounded-lg px-3 py-2 ${rowClass}`}>
      <div className={`absolute inset-y-0 left-0 ${barClass}`} style={{ width: `${pct}%` }} />
      <div className="relative flex items-center justify-between">
        <span className="flex items-center gap-2 font-medium text-white">
          <span className="font-bold text-indigo-200">{rank}.</span>
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorFor(member.id) }} />
          {member.name}
        </span>
        <span className="tabular-nums font-bold" style={{ color: '#FFD700', textShadow: '0 1px 1px rgba(0,0,0,0.45)' }}>
          {member.paid.toFixed(2)} {CURRENCY}
        </span>
      </div>
    </li>
  );
}

function A2a() {
  // Deep indigo solid rows, lighter indigo bar.
  return (
    <Card title="A2a — deep indigo rows">
      {ranked.map((m, i) => (
        <GoldRow key={m.id} member={m} rank={i + 1} rowClass="bg-indigo-900" barClass="bg-indigo-500/60" />
      ))}
    </Card>
  );
}

function A2b() {
  // Near-black slate rows, gold-tinted bar.
  return (
    <Card title="A2b — near-black slate rows">
      {ranked.map((m, i) => (
        <GoldRow key={m.id} member={m} rank={i + 1} rowClass="bg-slate-900" barClass="bg-amber-400/40" />
      ))}
    </Card>
  );
}

function A2c() {
  // Neutral gray rows, soft white bar — gold on neutral.
  return (
    <Card title="A2c — neutral gray rows">
      {ranked.map((m, i) => (
        <GoldRow key={m.id} member={m} rank={i + 1} rowClass="bg-gray-700" barClass="bg-white/30" />
      ))}
    </Card>
  );
}

/* ---- A: bright gold (#FFD700) on the gradient (reference) -------- */
function VariantA() {
  return (
    <Card title="A — gold on gradient (ref)">
      {ranked.map((m, i) => (
        <Row key={m.id} member={m} rank={i + 1} amountNode={
          <span className="tabular-nums font-bold" style={{ color: '#FFD700' }}>
            {m.paid.toFixed(2)} {CURRENCY}
          </span>
        } />
      ))}
    </Card>
  );
}

/* ---- B: white text + dark shadow (halo for contrast) ------------- */
function VariantB() {
  return (
    <Card title="B — white + drop shadow">
      {ranked.map((m, i) => (
        <Row key={m.id} member={m} rank={i + 1} amountNode={
          <span
            className="tabular-nums font-bold text-white"
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.65)' }}
          >
            {m.paid.toFixed(2)} {CURRENCY}
          </span>
        } />
      ))}
    </Card>
  );
}

/* ---- C: amber bubble with dark text ------------------------------ */
function VariantC() {
  return (
    <Card title="C — amber bubble, dark text">
      {ranked.map((m, i) => (
        <Row key={m.id} member={m} rank={i + 1} amountNode={
          <span className="tabular-nums rounded-md bg-amber-300 px-2 py-0.5 text-xs font-bold text-amber-950">
            {m.paid.toFixed(2)} {CURRENCY}
          </span>
        } />
      ))}
    </Card>
  );
}

/* ---- D: member-colored bubble (like avatar dot) ------------------ */
function VariantD() {
  return (
    <Card title="D — member-color bubble">
      {ranked.map((m, i) => (
        <Row key={m.id} member={m} rank={i + 1} amountNode={
          <span
            className="tabular-nums rounded-md px-2 py-0.5 text-xs font-bold text-white"
            style={{ background: colorFor(m.id) }}
          >
            {m.paid.toFixed(2)} {CURRENCY}
          </span>
        } />
      ))}
    </Card>
  );
}

/* ---- D2: SINGLE uniform outline color + white number+currency ---- */
// One outline color for every member (indigo = the Expenses-tab top bar,
// blue = alt). Transparent/light fill with a colored ring; white text.
function OutlineRow({
  member,
  rank,
  ring,
  bg,
}: {
  member: Member;
  rank: number;
  ring: string; // border color (hex)
  bg: string; // chip fill (rgba/hex)
}) {
  const pct = (member.paid / maxPaid) * 100;
  return (
    <li className="relative overflow-hidden rounded-lg px-3 py-2 bg-gradient-to-r from-indigo-500/70 to-indigo-700/30">
      <div className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${pct}%` }} />
      <div className="relative flex items-center justify-between">
        <span className="flex items-center gap-2 font-medium text-white">
          <span className="font-bold text-indigo-200">{rank}.</span>
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorFor(member.id) }} />
          {member.name}
        </span>
        <span
          className="tabular-nums rounded-md px-2 py-0.5 text-xs font-bold text-white"
          style={{ border: `1.5px solid ${ring}`, background: bg }}
        >
          {member.paid.toFixed(2)} {CURRENCY}
        </span>
      </div>
    </li>
  );
}

function D2a() {
  // Indigo outline — matches the "Total group expense" top bar (bg-indigo-600 = #4f46e5).
  return (
    <Card title="D2a — indigo outline + white">
      {ranked.map((m, i) => (
        <OutlineRow key={m.id} member={m} rank={i + 1} ring="#4f46e5" bg="rgba(79,70,229,0.18)" />
      ))}
    </Card>
  );
}

function D2b() {
  // Blue outline (alt uniform color).
  return (
    <Card title="D2b — blue outline + white">
      {ranked.map((m, i) => (
        <OutlineRow key={m.id} member={m} rank={i + 1} ring="#3b82f6" bg="rgba(59,130,246,0.18)" />
      ))}
    </Card>
  );
}

/* ---- D3: SOLID bubble in the exact "Total group expense" bar color - */
// bg-indigo-600 = #4f46e5 (same hue + intensity as the top bar). No outline,
// solid fill, white number + currency — uniform across all members.
function D3() {
  return (
    <Card title="D3 — solid #4f46e5 bubble + white">
      {ranked.map((m, i) => (
        <Row key={m.id} member={m} rank={i + 1} amountNode={
          <span
            className="tabular-nums rounded-md px-2 py-0.5 text-xs font-bold text-white"
            style={{ background: '#4f46e5' }}
          >
            {m.paid.toFixed(2)} {CURRENCY}
          </span>
        } />
      ))}
    </Card>
  );
}

export default function PaidCashColorPlayground() {
  return (
    <div className="min-h-screen bg-white p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Paid-cash numbers — 4 color / bubble options</h1>
      <p className="text-sm text-gray-500 mb-6">
        The amount now sits in its own chip so it pops off the indigo gradient. Pick the most
        readable one and we'll wire it into the live card.
      </p>
      <div className="flex flex-wrap gap-8">
        <VariantA />
        <VariantB />
        <VariantC />
        <VariantD />
        <A2a />
        <A2b />
        <A2c />
        <D2a />
        <D2b />
        <D3 />
      </div>
    </div>
  );
}
