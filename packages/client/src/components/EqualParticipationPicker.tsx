import { useState } from 'react';

export interface JoinableExpense {
  id: string;
  description: string;
  amount: string;
  currency: string;
  expense_date: string;
  paid_by_name: string;
  is_owner: boolean;
}

interface Props {
  expenses: JoinableExpense[];
  /** Whom the checklist is FOR (joiner themselves, or a placeholder they're proxying). */
  subjectName: string;
  /** Title override (admin-proxy vs self-join wording). */
  title?: string;
  onConfirm: (participate: string[], optOut: string[]) => Promise<void>;
  onCancel?: () => void;
}

/**
 * Equal-participation checklist (shared — feature-placeholder-member Phase 3):
 * the SAME list the join flow uses, reusable by an admin acting as proxy for a
 * placeholder. Checked = "was part of it"; unchecked flags the expense
 * creator for review. Extracted from JoinGroup.tsx so the two callers can
 * never drift.
 */
export default function EqualParticipationPicker({ expenses, subjectName, title, onConfirm, onCancel }: Props) {
  // Default: everything checked (participated).
  const [checked, setChecked] = useState<Set<string>>(new Set(expenses.map((e) => e.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setBusy(true); setError('');
    try {
      await onConfirm(
        expenses.filter((e) => checked.has(e.id)).map((e) => e.id),
        expenses.filter((e) => !checked.has(e.id)).map((e) => e.id),
      );
    } catch (e: any) {
      setError(e.message || 'Failed to save');
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium text-gray-900">
          {title || `Which expenses was ${subjectName} part of?`}
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          These shared (equal-split) expenses already exist. Leave an item checked if{' '}
          <span className="select-text">{subjectName}</span> took part — unchecked items notify
          their creator to review.
        </p>
      </div>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {expenses.map((e) => (
          <label
            key={e.id}
            className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 cursor-pointer hover:bg-gray-50"
          >
            <input
              type="checkbox"
              className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={checked.has(e.id)}
              onChange={(ev) =>
                setChecked((prev) => {
                  const next = new Set(prev);
                  if (ev.target.checked) next.add(e.id);
                  else next.delete(e.id);
                  return next;
                })
              }
            />
            <div className="flex-1">
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-900 select-text">{e.description}</span>
                <span className="text-sm text-gray-700 tabular-nums">
                  {e.currency} {parseFloat(e.amount).toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Paid by {e.paid_by_name} · {e.expense_date}
              </p>
            </div>
          </label>
        ))}
      </div>
      <p className="text-xs text-gray-400">
        {checked.size} of {expenses.length} selected.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={confirm}
          disabled={busy}
          className="px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 font-medium disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Confirm'}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
          >
            Later
          </button>
        )}
      </div>
    </div>
  );
}
