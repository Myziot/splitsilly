import { useEffect, useState } from 'react';
import { createMemberColorMap, type MemberColor } from '../utils/memberColor';
import { roundSharesToCents } from '../utils/splits';

/* ------------------------------------------------------------------ */
/* PaidCashSummary — "Who paid cash" block.                           */
/* Shows, per member, the pure CASH they paid out of the total group  */
/* expenses (sum of amount_master where paid_by === member), ignoring  */
/* who-owes-whom balances. Variant D3: gradient rows with a left-fill */
/* bar proportional to amount. Title per D4. Monospace to match the   */
/* rate footline. Reused by both the Expenses and Balances tabs.      */
/* Footer (Variant D "hero chips", crew-chosen 2026-09-27 at          */
/* /penny-hero-playground): per-member cents absorbed from indivisible */
/* splits as caped chips (bold cent count), plus a rotating italic     */
/* quip/haiku line that cross-fades every 10s. Tally computed with     */
/* the SAME roundSharesToCents the server uses — always matches        */
/* live balances.                                                      */
/* ------------------------------------------------------------------ */

/* The rotating quip roster ({hero} = biggest penny absorber). */
const PENNY_LINES = [
  '{hero} took one for the team.',
  '{hero} ate the pennies so you don’t have to.',
  'One small cent for humankind.',
  'No capes, just cents.',
  'With great rounding comes great responsibility.',
  '{hero}: math’s bodyguard.',
  '{hero} absorbed the chaos so everyone owes clean.',
  'All that glitters is not gold — but the leftover cents are.',
  'pennies must land / {hero} quietly gathers them / the ledger stays whole',
  'odd cents had to go / {hero} swallowed them without fuss / balances rest',
];
const LINE_INTERVAL_MS = 10_000;
const FADE_MS = 500;

/** Inline SVG cape glyph (stroke icon, inherits currentColor). */
function CapeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3c-4 3-7 4-8 5 1 6 3 10 4 13l4-4 4 4c1-3 3-7 4-13-1-1-4-2-8-5z" />
    </svg>
  );
}

/**
 * Rotating italic quip under the hero chips. Cycles the roster in shuffled
 * order (no repeats until exhausted), cross-fading every LINE_INTERVAL_MS.
 * The {hero} name is a strict round-robin over `heroNames` (one step per
 * fade-in), so every penny absorber gets equal stage time regardless of how
 * the lines shuffle. Owns its timer so the parent's early-returns never
 * break hook rules.
 */
function PennyQuip({ heroNames }: { heroNames: string[] }) {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * PENNY_LINES.length));
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(true);
  // Shuffled play order, recomputed whenever the roster length changes.
  const orderRef = useState(() => {
    const a = PENNY_LINES.map((_, i) => i);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  })[0];

  useEffect(() => {
    let inner: ReturnType<typeof setTimeout> | undefined;
    const timer = setInterval(() => {
      setVisible(false); // fade out
      inner = setTimeout(() => {
        setIdx((cur) => orderRef[(orderRef.indexOf(cur) + 1) % orderRef.length]);
        setStep((s) => s + 1); // spotlight tours the heroes
        setVisible(true); // fade the new line in
      }, FADE_MS);
    }, LINE_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      if (inner) clearTimeout(inner);
    };
  }, [orderRef]);

  const heroName = heroNames[step % Math.max(heroNames.length, 1)] || 'Someone';
  const line = PENNY_LINES[idx].replaceAll('{hero}', heroName);
  return (
    <p
      aria-live="polite"
      className="mt-1.5 text-center text-[11px] italic text-gray-400 transition-opacity duration-500"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {line}
    </p>
  );
}

interface ExpenseLike {
  paid_by: string;
  payer?: { name?: string };
  amount_master: number | string;
  splits?: Array<{
    user_id: string;
    split_mode: string;
    value: number | null;
    user?: { name?: string };
  }>;
}

export default function PaidCashSummary({
  expenses,
  currency,
  colorFor,
}: {
  expenses: ExpenseLike[];
  currency?: string;
  // Optional color lookup (e.g. the group's memberColor map) so avatar dots
  // match the rest of the UI. Falls back to a per-expense derived map.
  colorFor?: (id: string) => MemberColor;
}) {
  const [expanded, setExpanded] = useState(true);

  if (!expenses || expenses.length === 0) return null;

  const groupTotal = expenses.reduce(
    (sum, e) => sum + (Number(e.amount_master) || 0),
    0
  );

  const paidMap = new Map<string, { name: string; paid: number }>();
  for (const e of expenses) {
    const id = e.paid_by;
    if (!id) continue;
    const cur = paidMap.get(id) || { name: e.payer?.name || 'Unknown', paid: 0 };
    cur.paid += Number(e.amount_master) || 0;
    paidMap.set(id, cur);
  }

  const ranked = Array.from(paidMap.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.paid - a.paid);
  if (ranked.length === 0) return null;

  const maxPaid = Math.max(...ranked.map((r) => r.paid), 1);

  // --- Rounding-absorbed tally -------------------------------------
  // For each expense, replicate the engine's cent-snapping and count how
  // many leftover cents each member absorbed (snapped share − floored raw
  // share). Matches the live balance engine penny-for-penny, including
  // legacy expenses where the pennies went to arbitrary members.
  const pennyMap = new Map<string, { name: string; cents: number }>();
  for (const e of expenses) {
    const splits = Array.isArray(e.splits) ? e.splits : [];
    if (splits.length < 2) continue;
    const total = Number(e.amount_master) || 0;
    const raw = splits.map((s) => {
      if (s.split_mode === 'equal') return total / splits.length;
      if (s.split_mode === 'percent') return (total * (s.value || 0)) / 100;
      if (s.split_mode === 'shares') {
        const totalShares = splits.reduce((acc, x) => acc + (x.value || 0), 0) || 1;
        return (total * (s.value || 0)) / totalShares;
      }
      return 0;
    });
    const floored = raw.map((s) => Math.floor(s * 100) / 100);
    const allEqual = splits.every((s) => s.split_mode === 'equal');
    const payerIdx = allEqual && e.paid_by ? splits.findIndex((s) => s.user_id === e.paid_by) : -1;
    const snapped = roundSharesToCents(raw, total, payerIdx);
    snapped.forEach((sh, i) => {
      const cents = Math.round((sh - floored[i]) * 100);
      if (cents > 0) {
        const id = splits[i].user_id;
        const cur = pennyMap.get(id) || { name: splits[i].user?.name || 'Someone', cents: 0 };
        cur.cents += cents;
        pennyMap.set(id, cur);
      }
    });
  }
  const pennyRanked = Array.from(pennyMap.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.cents - a.cents);
  const pennyTotal = pennyRanked.reduce((a, p) => a + p.cents, 0);
  // -----------------------------------------------------------------

  // Color lookup: use the passed-in group map if available, else derive one
  // from the payer IDs present here (keeps dots colored, stable per render).
  const fallbackMap =
    colorFor ?? createMemberColorMap(ranked.map((r) => r.id));
  const dotColor = (id: string) => fallbackMap(id)?.border || '#6b7280';

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm font-mono">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">Who paid cash</h3>
        <span className="text-xs text-gray-400">
          out of {groupTotal.toFixed(2)} {currency}
        </span>
      </div>

      {/* Collapse / expand toggle — centered at the top of the card. */}
      <div className="flex justify-center pt-1.5 pb-1">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse who paid cash' : 'Expand who paid cash'}
          className="flex h-6 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 transition-colors hover:bg-indigo-200"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${expanded ? '' : '-rotate-90'}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {expanded && (
        <ol className="space-y-1">
          {ranked.map((r, i) => {
            const pct = (r.paid / maxPaid) * 100;
            return (
              <li
                key={r.id}
                className="relative overflow-hidden rounded-lg px-3 py-2 bg-gradient-to-r from-indigo-500/70 to-indigo-700/30"
              >
                <div
                  className="absolute inset-y-0 left-0 bg-white/20"
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium text-white">
                    <span className="font-bold text-indigo-200">{i + 1}.</span>
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: dotColor(r.id) }}
                    />
                    {r.name}
                  </span>
                  <span
                    className="tabular-nums rounded-md px-2 py-0.5 text-xs font-bold text-white"
                    style={{ background: '#4f46e5' }}
                  >
                    {r.paid.toFixed(2)} {currency}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {expanded && pennyRanked.length > 0 && (
        <div
          title="Pennies left over when an amount doesn't divide evenly into cents. They are absorbed by the expense's payer, so this tally always matches your balances."
        >
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2">
            <span className="text-[10px] uppercase tracking-wide text-gray-400">
              rounding heroes ({pennyTotal}¢)
            </span>
            {pennyRanked.map((h) => (
              <span
                key={h.id}
                className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 py-0.5 pl-1 pr-2 text-[11px] text-amber-800"
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-white">
                  <CapeIcon />
                </span>
                <b>{h.name}</b>
                <b className="tabular-nums">{h.cents}¢</b>
              </span>
            ))}
          </div>
          <PennyQuip heroNames={pennyRanked.map((h) => h.name)} />
        </div>
      )}
    </div>
  );
}
