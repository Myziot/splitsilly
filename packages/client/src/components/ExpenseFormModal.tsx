import { useEffect, useState } from 'react';
import { useExpenseStore } from '../store/expenses';
import type { GroupMember } from '../types/group';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string | null;
}

interface Props {
  groupId: string;
  members: GroupMember[];
  currentUserId?: string;
  /** Group currency — default for a NEW expense. */
  defaultCurrency?: string;
  /** Expense being edited; null/undefined = creating a new expense. */
  initialExpense?: any;
  onClose: () => void;
  /** Called after a successful create/update with the edited expense id (null for creates). */
  onSaved: (editedId: string | null) => void;
}

const todayLocal = () => {
  const d = new Date();
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Add/Edit expense modal. Owns description/amount/currency/payer/date/category/
 * split state; fetches categories on open. Extracted from GroupDetail
 * 2026-09-23 (staged split, step 3).
 */
export default function ExpenseFormModal({ groupId, members, currentUserId, defaultCurrency, initialExpense, onClose, onSaved }: Props) {
  const { createExpense, updateExpense } = useExpenseStore();
  const editingId: string | null = initialExpense?.id ?? null;

  const [categories, setCategories] = useState<Category[]>([]);
  const [description, setDescription] = useState(initialExpense?.description ?? '');
  const [amount, setAmount] = useState(initialExpense ? String(initialExpense.amount) : '');
  const [currency, setCurrency] = useState<string>(initialExpense?.currency ?? defaultCurrency ?? 'USD');
  const [paidBy, setPaidBy] = useState<string>(initialExpense?.paid_by ?? currentUserId ?? '');
  const [categoryId, setCategoryId] = useState<string>(initialExpense?.category_id ?? '');
  const [expenseDate, setExpenseDate] = useState<string>(initialExpense?.expense_date ?? todayLocal());
  const [splitMode, setSplitMode] = useState<'equal' | 'percent' | 'shares'>(() => {
    const m = initialExpense?.splits?.[0]?.split_mode;
    return m === 'percent' || m === 'shares' ? m : 'equal';
  });
  const [splitValues, setSplitValues] = useState<Record<string, number>>(() => {
    const vals: Record<string, number> = {};
    (initialExpense?.splits ?? []).forEach((s: any) => {
      vals[s.user_id] = s.value ?? 0;
    });
    return vals;
  });
  // Equal-split participation: the set of member user_ids that participated in an
  // equal expense. Only these get an expense_splits row (Decision 1: participation
  // = presence of a row). New expense defaults to all members; edit pre-checks
  // exactly the members who currently have a split row (Decision 2).
  const [equalParticipants, setEqualParticipants] = useState<Set<string>>(
    () =>
      initialExpense
        ? new Set((initialExpense.splits ?? []).map((s: any) => s.user_id as string))
        : new Set(members.map((m) => m.user_id))
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/categories', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .catch((err) => console.error('Failed to fetch categories:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Build splits array
      const splits: Array<{ user_id: string; split_mode: 'equal' | 'percent' | 'shares'; value: number | null }> = [];
      for (const m of members) {
        if (splitMode === 'equal') {
          // Only members whose checkbox is ticked get a split row. Absence of a
          // row = did not participate (Decision 1).
          if (equalParticipants.has(m.user_id)) {
            splits.push({
              user_id: m.user_id,
              split_mode: 'equal',
              value: null,
            });
          }
        } else {
          const val = splitValues[m.user_id] || 0;
          // Allow 0 so a member can be explicitly excluded (e.g. 0% / 0 shares).
          if (val >= 0) {
            splits.push({
              user_id: m.user_id,
              split_mode: splitMode,
              value: val,
            });
          }
        }
      }

      if (splits.length === 0) {
        throw new Error('At least one member must be included in the split');
      }

      // Validate percent splits sum to 100
      if (splitMode === 'percent') {
        const total = splits.reduce((sum: number, s: any) => sum + (s.value || 0), 0);
        if (Math.abs(total - 100) > 0.01) {
          throw new Error('Percent splits must add up to 100%');
        }
      }

      // Validate shares have at least one positive share
      if (splitMode === 'shares') {
        const total = splits.reduce((sum: number, s: any) => sum + (s.value || 0), 0);
        if (total === 0) {
          throw new Error('Shares must be greater than 0');
        }
      }

      const payload = {
        description,
        amount: parseFloat(amount),
        currency,
        paid_by: paidBy,
        category_id: categoryId || null,
        expense_date: expenseDate,
        splits,
      };

      if (editingId) {
        await updateExpense(groupId, editingId, payload);
      } else {
        await createExpense(groupId, payload);
      }

      onSaved(editingId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save expense');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full max-h-screen overflow-y-auto">
        <h3 className="text-lg font-medium text-gray-900 mb-4">{editingId ? 'Edit Expense' : 'Add Expense'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <input
                type="text"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Dinner at Mario's"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Amount</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="50.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Currency</label>
                <select
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="PLN">PLN</option>
                  <option value="CAD">CAD</option>
                  <option value="AUD">AUD</option>
                  <option value="JPY">JPY</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Paid By</label>
                <select
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={paidBy}
                  onChange={(e) => setPaidBy(e.target.value)}
                >
                  <option value="">Select...</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.user.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Expense date</label>
                <input
                  type="date"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Category</label>
              <select
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Split Mode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Split Mode</label>
              <div className="flex space-x-4">
                {(['equal', 'percent', 'shares'] as const).map((mode) => (
                  <label key={mode} className="flex items-center">
                    <input
                      type="radio"
                      name="splitMode"
                      value={mode}
                      checked={splitMode === mode}
                      onChange={(e) => setSplitMode(e.target.value as any)}
                      className="mr-2"
                    />
                    <span className="text-sm capitalize">{mode}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Equal participation checkboxes */}
            {splitMode === 'equal' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Who participated? (split equally among selected)
                </label>
                {members.map((m) => (
                  <label key={m.user_id} className="flex items-center space-x-2 mb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={equalParticipants.has(m.user_id)}
                      onChange={(e) =>
                        setEqualParticipants((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(m.user_id);
                          else next.delete(m.user_id);
                          return next;
                        })
                      }
                    />
                    <span className="text-sm">{m.user.name}</span>
                  </label>
                ))}
                <p className="text-xs text-gray-400">
                  {equalParticipants.size} of {members.length} selected
                  {equalParticipants.size === 0 && ' — select at least one'}
                </p>
              </div>
            )}

            {/* Split Values (for percent and shares) */}
            {splitMode !== 'equal' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {splitMode === 'percent' ? 'Percentages (must sum to 100%)' : 'Shares'}
                </label>
                {members.map((m) => (
                  <div key={m.user_id} className="flex items-center space-x-2 mb-2">
                    <span className="text-sm w-32">{m.user.name}</span>
                    <input
                      type="number"
                      min="0"
                      step={splitMode === 'percent' ? '0.1' : '1'}
                      className="block w-24 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      value={splitValues[m.user_id] ?? ''}
                      onChange={(e) =>
                        setSplitValues((prev) => ({
                          ...prev,
                          [m.user_id]: parseFloat(e.target.value) || 0,
                        }))
                      }
                      placeholder={splitMode === 'percent' ? '%' : '#'}
                    />
                    {splitMode === 'percent' && <span className="text-sm">%</span>}
                  </div>
                ))}
                {splitMode === 'percent' && (
                  (() => {
                    const total = Object.values(splitValues).reduce((a, b) => a + b, 0);
                    const ok = Math.abs(total - 100) < 0.01;
                    return (
                      <p className={`text-sm ${ok ? 'text-gray-500' : 'text-red-600'}`}>
                        Total: {total}%{ok ? '' : ' — must add up to 100%'}
                      </p>
                    );
                  })()
                )}
              </div>
            )}

            {error && (
              <div className="text-red-600 text-sm">{error}</div>
            )}
          </div>
          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (splitMode === 'percent' && Math.abs(Object.values(splitValues).reduce((a, b) => a + b, 0) - 100) >= 0.01)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
            >
              {loading ? (editingId ? 'Saving...' : 'Adding...') : (editingId ? 'Save Changes' : 'Add Expense')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
