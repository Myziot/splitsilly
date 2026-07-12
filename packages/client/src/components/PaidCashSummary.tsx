import { useState } from 'react';
import { createMemberColorMap, type MemberColor } from '../utils/memberColor';

/* ------------------------------------------------------------------ */
/* PaidCashSummary — "Who paid cash" block.                           */
/* Shows, per member, the pure CASH they paid out of the total group  */
/* expenses (sum of amount_master where paid_by === member), ignoring  */
/* who-owes-whom balances. Variant D3: gradient rows with a left-fill */
/* bar proportional to amount. Title per D4. Monospace to match the   */
/* rate footline. Reused by both the Expenses and Balances tabs.      */
/* ------------------------------------------------------------------ */

interface ExpenseLike {
  paid_by: string;
  payer?: { name?: string };
  amount_master: number | string;
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
    </div>
  );
}
