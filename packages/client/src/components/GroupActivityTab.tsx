import { formatDateTime } from '../utils/format';
import { ACTIVITY_META } from '../store/activity';

interface ActivityRow {
  id: string;
  action: string;
  details: any;
  created_at: string;
}

interface Props {
  activities: ActivityRow[];
  loading: boolean;
}

/**
 * Group activity log tab (transparent to all members). Pure render over the
 * activity store. Extracted from GroupDetail 2026-09-23 (staged split, step 5).
 */
export default function GroupActivityTab({ activities, loading }: Props) {
  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900 mb-4">Group activity</h2>
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : activities.length === 0 ? (
        <p className="text-sm text-gray-400">No activity yet.</p>
      ) : (
        <ul className="space-y-3">
          {activities.map((a) => {
            const meta = ACTIVITY_META[a.action as keyof typeof ACTIVITY_META] || {
              icon: '•',
              label: a.action,
              badge: 'bg-gray-100 text-gray-700',
              text: 'text-gray-700',
            };
            const d = a.details || {};
            const actor = d.actorName || d.memberName || 'Someone';
            let summary = '';
            if (a.action === 'member_joined') {
              summary = `${actor} joined the group`;
            } else if (a.action === 'expense_created') {
              summary = `${actor} added an expense ${d.expenseDesc ? `“${d.expenseDesc}”` : ''}${d.amount ? ` (${d.amount} ${d.currency})` : ''}`;
            } else if (a.action === 'expense_updated') {
              summary = `${actor} edited an expense ${d.expenseDesc ? `“${d.expenseDesc}”` : ''}`;
            } else if (a.action === 'expense_deleted') {
              summary = `${actor} deleted an expense ${d.expenseDesc ? `“${d.expenseDesc}”` : ''}`;
            } else if (a.action === 'settlement_recorded') {
              summary = `${d.payer} settled with ${d.payee}${d.amount ? ` (${d.amount} ${d.currency})` : ''}`;
            } else if (a.action === 'settlement_reverted') {
              summary = `${actor} reverted ${d.payer}'s payment to ${d.payee}${d.amount ? ` (${d.amount})` : ''}`;
            } else if (a.action === 'settlement_edited') {
              const dirChanged = d.oldPayer !== d.newPayer || d.oldPayee !== d.newPayee;
              const amtChanged = d.oldAmount !== d.newAmount;
              let change = '';
              if (dirChanged && amtChanged) {
                change = ` from ${d.oldPayer}→${d.oldPayee} (${d.oldAmount}) to ${d.newPayer}→${d.newPayee} (${d.newAmount})`;
              } else if (dirChanged) {
                change = ` direction ${d.oldPayer}→${d.oldPayee} → ${d.newPayer}→${d.newPayee}`;
              } else if (amtChanged) {
                change = ` amount ${d.oldAmount} → ${d.newAmount}`;
              } else {
                change = '';
              }
              summary = `${actor} edited a payment${change}`;
            } else if (a.action === 'book_locked') {
              summary = `${actor} locked the book`;
            } else if (a.action === 'book_unlocked') {
              summary = `${actor} unlocked the book`;
            } else if (a.action === 'book_recalculated') {
              summary = `${actor} recalculated the book`;
            } else if (a.action === 'reset_settlements') {
              summary = `${actor} reset all balances${typeof d.count === 'number' ? ` (${d.count} payment${d.count === 1 ? '' : 's'} cleared)` : ''}`;
            }
            return (
              <li
                key={a.id}
                className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3"
              >
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}
                >
                  <span aria-hidden="true">{meta.icon}</span>
                  {meta.label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800">{summary}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {formatDateTime(a.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
