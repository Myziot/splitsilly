import PayerBadge from './PayerBadge';
import DateBadge from './DateBadge';
import { formatDateTime } from '../utils/format';
import { snappedShare } from '../utils/splits';
import type { MemberColor } from '../utils/memberColor';

interface Props {
  expense: any;
  masterCurrency?: string;
  /** Resolves a user_id to a display name (falls back to the raw id). */
  nameOf: (userId: string) => string;
  memberColor: (id: string) => MemberColor;
  onBack: () => void;
  onEdit: (expense: any) => void;
  onDelete: (expenseId: string) => void;
}

/**
 * Full expense detail (replaces the expense list when a row is clicked).
 * Extracted from GroupDetail 2026-09-23 (staged split, step 4).
 */
export default function ExpenseDetailView({ expense, masterCurrency, nameOf, memberColor, onBack, onEdit, onDelete }: Props) {
  return (
    <div className="bg-white shadow sm:rounded-md p-6">
      <button
        onClick={onBack}
        className="text-sm text-blue-600 hover:text-blue-800 mb-4 inline-flex items-center"
      >
        ← Back to expenses
      </button>

      <div className="flex items-center mb-2">
        {expense.category && (
          <span className="text-3xl mr-3">{expense.category.icon}</span>
        )}
        <div>
          <h3 className="text-xl font-bold text-gray-900">{expense.description}</h3>
          {expense.category && (
            <p className="text-sm text-gray-500">
              {expense.category.icon} {expense.category.name}
            </p>
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-400">Amount</dt>
          <dd className="text-sm font-medium text-gray-900">
            {expense.amount} {expense.currency}
            {expense.currency !== masterCurrency && (
              <span className="text-gray-500">
                {' '}≈ {expense.amount_master} {masterCurrency}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-400">Paid by</dt>
          <dd className="text-sm font-medium text-gray-900">
            <PayerBadge name={expense.payer.name} color={memberColor(expense.paid_by)} />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-400">Expense date</dt>
          <dd className="text-sm font-medium text-gray-900">
            <DateBadge date={expense.expense_date} />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-400">Added by</dt>
          <dd className="text-sm font-medium text-gray-900">
            {nameOf(expense.added_by)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-400">Exchange rate</dt>
          <dd className="text-sm font-medium text-gray-900">
            {expense.exchange_rate != null ? expense.exchange_rate : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-400">Created</dt>
          <dd className="text-sm font-medium text-gray-900">
            {formatDateTime(expense.created_at)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-400">Updated</dt>
          <dd className="text-sm font-medium text-gray-900">
            {formatDateTime(expense.updated_at)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-400">Receipt</dt>
          <dd className="text-sm font-medium text-gray-900">
            {expense.receipt_path ? (
              <a
                href={expense.receipt_path}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:text-blue-800"
              >
                View receipt
              </a>
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>

      <h4 className="mt-6 text-sm font-semibold text-gray-900 uppercase tracking-wide text-gray-400">
        Split breakdown
      </h4>
      <div className="mt-2 bg-gray-50 shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {expense.splits.map((split: any) => {
            const mc = memberColor(split.user_id);
            return (
              <li
                key={split.id}
                className="flex items-center justify-between px-4 py-3 sm:px-6"
                style={{ borderLeft: `4px solid ${mc.border}` }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold leading-none text-white"
                    style={{ backgroundColor: mc.border }}
                  >
                    {split.user.name.split(/\s+/).filter(Boolean).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {split.user.name}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">
                      {split.split_mode}
                      {split.split_mode !== 'equal' && split.value != null
                        ? ` (${split.value}${split.split_mode === 'percent' ? '%' : ' shares'})`
                        : ''}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {snappedShare(expense, split).toFixed(2)} {masterCurrency}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {expense.can_edit && (
        <div className="mt-6 flex gap-4">
          <button
            onClick={() => onEdit(expense)}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            Edit this expense
          </button>
          <button
            onClick={() => onDelete(expense.id)}
            className="text-red-500 hover:text-red-700 text-sm"
          >
            Delete this expense
          </button>
        </div>
      )}
    </div>
  );
}
