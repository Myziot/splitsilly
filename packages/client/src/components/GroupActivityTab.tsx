import { useMemo, useState } from 'react';
import { formatDateTime } from '../utils/format';
import { ACTIVITY_META, ACTIVITY_CATEGORY, type ActivityAction, type ActivityCategory } from '../store/activity';

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

/** Human labels for the expenseEdit setting values (mirrors GroupSettingsModal). */
const EDIT_LABELS: Record<string, string> = {
  admin_only: 'Admin only',
  creator_admin: 'Expense creator and admin',
  creator_only: 'Creator only',
  all_members: 'All members',
};

/**
 * Group activity log tab (transparent to all members). Pure render over the
 * activity store, plus a Variant-D filter (crew-chosen at /log-filter-playground):
 * category pills (All/People/Expenses/Payments/Book), then type chips scoped
 * to the selected category. Filtering is client-side over the fetched feed.
 */
export default function GroupActivityTab({ activities, loading }: Props) {
  const [category, setCategory] = useState<'All' | ActivityCategory>('All');
  const [type, setType] = useState<ActivityAction | null>(null);

  const CATEGORY_ORDER: Array<'All' | ActivityCategory> = ['All', 'People', 'Expenses', 'Payments', 'Book'];

  const inCategory = useMemo(() => {
    if (category === 'All') return activities;
    return activities.filter(
      (a) => ACTIVITY_CATEGORY[a.action as ActivityAction] === category
    );
  }, [activities, category]);

  // Type chips offered: only types actually present in the current category.
  const typesInCategory = useMemo(() => {
    const seen: ActivityAction[] = [];
    for (const a of inCategory) {
      const act = a.action as ActivityAction;
      if (ACTIVITY_META[act] && !seen.includes(act)) seen.push(act);
    }
    return seen;
  }, [inCategory]);

  const rows = type ? inCategory.filter((a) => a.action === type) : inCategory;

  const pickCategory = (c: 'All' | ActivityCategory) => {
    setCategory(c);
    setType(null);
  };

  const summaryFor = (a: ActivityRow): string => {
    const d = a.details || {};
    const actor = d.actorName || d.memberName || 'Someone';
    switch (a.action) {
      case 'group_created':
        return `${actor} created the group${d.groupName ? ` “${d.groupName}”` : ''}`;
      case 'member_joined':
        return `${actor} joined the group`;
      case 'member_removed':
        return `${actor} removed ${d.memberName || 'a member'} from the group${d.neverJoined ? ' (never joined)' : ''}`;
      case 'member_added_pending':
        return d.promoted
          ? `${actor} added invited ${d.memberName || 'a friend'} to the group — they count in the math now`
          : `${actor} added ${d.memberName || 'a friend'} to the calculations${d.invitedEmail ? ` (invited ${d.invitedEmail}, not joined yet)` : ''}`;
      case 'invite_sent':
        return `${actor} emailed an invite to ${d.inviteeName || 'a friend'}`;
      case 'invite_link_shared':
        return `${actor} shared the invite link`;
      case 'settings_changed': {
        const from = EDIT_LABELS[d.oldValue] || d.oldValue || '?';
        const to = EDIT_LABELS[d.newValue] || d.newValue || '?';
        return `${actor} changed “who can edit expenses” from “${from}” to “${to}”`;
      }
      case 'expense_created':
        return `${actor} added an expense ${d.expenseDesc ? `“${d.expenseDesc}”` : ''}${d.amount ? ` (${d.amount} ${d.currency})` : ''}`;
      case 'expense_updated':
        return `${actor} edited an expense ${d.expenseDesc ? `“${d.expenseDesc}”` : ''}`;
      case 'expense_deleted':
        return `${actor} deleted an expense ${d.expenseDesc ? `“${d.expenseDesc}”` : ''}`;
      case 'settlement_recorded':
        return `${d.payer} settled with ${d.payee}${d.amount ? ` (${d.amount} ${d.currency})` : ''}`;
      case 'settlement_reverted':
        return `${actor} reverted ${d.payer}'s payment to ${d.payee}${d.amount ? ` (${d.amount})` : ''}`;
      case 'settlement_edited': {
        const dirChanged = d.oldPayer !== d.newPayer || d.oldPayee !== d.newPayee;
        const amtChanged = d.oldAmount !== d.newAmount;
        let change = '';
        if (dirChanged && amtChanged) {
          change = ` from ${d.oldPayer}→${d.oldPayee} (${d.oldAmount}) to ${d.newPayer}→${d.newPayee} (${d.newAmount})`;
        } else if (dirChanged) {
          change = ` direction ${d.oldPayer}→${d.oldPayee} → ${d.newPayer}→${d.newPayee}`;
        } else if (amtChanged) {
          change = ` amount ${d.oldAmount} → ${d.newAmount}`;
        }
        return `${actor} edited a payment${change}`;
      }
      case 'book_locked':
        return `${actor} locked the book`;
      case 'book_unlocked':
        return `${actor} unlocked the book`;
      case 'book_recalculated':
        return `${actor} recalculated the book`;
      case 'reset_settlements':
        return `${actor} reset all balances${typeof d.count === 'number' ? ` (${d.count} payment${d.count === 1 ? '' : 's'} cleared)` : ''}`;
      default:
        return `${actor}`;
    }
  };

  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900 mb-4">Group activity</h2>

      {/* Filter row 1: category pills (single row, mobile-friendly) */}
      <div className="mb-2 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
        {CATEGORY_ORDER.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => pickCategory(c)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              category === c ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Filter row 2: type chips within the chosen category (drill-down) */}
      {typesInCategory.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {typesInCategory.map((act) => {
            const on = type === act;
            const m = ACTIVITY_META[act];
            return (
              <button
                key={act}
                type="button"
                onClick={() => setType(on ? null : act)}
                className={`rounded-full border px-2 py-0.5 text-xs transition ${
                  on ? `${m.badge} border-transparent` : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span aria-hidden="true">{m.icon}</span> {m.label}
              </button>
            );
          })}
        </div>
      )}
      {typesInCategory.length <= 1 && <div className="mb-4" />}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">
          {activities.length === 0 ? 'No activity yet.' : 'No activity matches this filter.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => {
            const meta = ACTIVITY_META[a.action as ActivityAction] || {
              icon: '•',
              label: a.action,
              badge: 'bg-gray-100 text-gray-700',
              text: 'text-gray-700',
            };
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
                  <p className="text-sm text-gray-800">{summaryFor(a)}</p>
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
