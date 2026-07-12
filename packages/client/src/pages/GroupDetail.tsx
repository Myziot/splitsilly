import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useGroupStore } from '../store/groups';
import { useExpenseStore } from '../store/expenses';
import { useBalanceStore } from '../store/balances';
import TopBar from '../components/TopBar';
import InviteLink from '../components/InviteLink';
import CurrencyBadge from '../components/CurrencyBadge';
import DateBadge from '../components/DateBadge';
import PayerBadge from '../components/PayerBadge';
import RateFootnote from '../components/RateFootnote';
import PaidCashSummary from '../components/PaidCashSummary';
import { createMemberColorMap } from '../utils/memberColor';
import { formatDateTime, formatDate, groupExpenseLabel } from '../utils/format';
import { useActivityStore, ACTIVITY_META } from '../store/activity';

interface GroupMember {
  id: string;
  user_id: string;
  user: { id: string; name: string; email: string };
  role: 'admin' | 'member';
}

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string | null;
}

export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user: currentUser } = useAuthStore();
  const { currentGroup, setCurrentGroup } = useGroupStore();
  const { expenses, fetchExpenses, createExpense, updateExpense, deleteExpense } = useExpenseStore();
  const { balances, optimizedTransactions, settlements, isOptimized, fetchBalances, fetchSettlements, deleteSettlement, resetSettlements, updateSettlement, toggleOptimize, sendReminder, removeMember } = useBalanceStore();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [groupAccessError, setGroupAccessError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  // Stable per-member color lookup (golden-angle hue + lightness banding).
  const memberColor = useMemo(
    () => createMemberColorMap(members.map((m) => m.user_id)),
    [members]
  );
  const [expenseEditSetting, setExpenseEditSetting] = useState<string>('creator_admin');
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'members' | 'log'>('expenses');
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  // Activity log (group-wide, transparent to all members).
  const { activities, loading: activityLoading, fetchActivity } = useActivityStore();
  useEffect(() => {
    if (groupId) fetchActivity(groupId);
  }, [groupId, activeTab, fetchActivity]);

  // Invite form state (members tab)
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);

  // Expense form state
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCurrency, setNewCurrency] = useState('USD');
  const [newPaidBy, setNewPaidBy] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newExpenseDate, setNewExpenseDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const [splitMode, setSplitMode] = useState<'equal' | 'percent' | 'shares'>('equal');
  const [splitValues, setSplitValues] = useState<Record<string, number>>({});
  // Equal-split participation: the set of member user_ids that participated in an
  // equal expense. Only these get an expense_splits row (Decision 1: participation
  // = presence of a row). Defaults to all members for a new expense.
  const [equalParticipants, setEqualParticipants] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Settlement form state
  const [showSettlementForm, setShowSettlementForm] = useState(false);
  const [settleFrom, setSettleFrom] = useState('');
  const [settleTo, setSettleTo] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settleError, setSettleError] = useState('');
  const [settleLoading, setSettleLoading] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  // Settlement edit modal state
  const [editSettlement, setEditSettlement] = useState<{
    id: string;
    from_user_id: string;
    to_user_id: string;
    amount: string;
    description: string;
  } | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  const [flaggedIds, setFlaggedIds] = useState<string[]>([]);

  useEffect(() => {
    if (groupId) {
      fetchExpenses(groupId);
      fetchBalances(groupId);
      fetchSettlements(groupId);
      fetchMembers();
      fetchCategories();
      fetchSettings();
      // Notification deep-link: ?tab=expenses|balances switches the tab.
      const m = window.location.hash.match(/[?&]tab=(expenses|balances|members)/);
      if (m) setActiveTab(m[1] as any);
      // Flagged (needs-review) expenses for the current owner.
      fetch(`/api/v1/groups/${groupId}/expense-flags`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : []))
        .then((ids: string[]) => setFlaggedIds(ids))
        .catch(() => {});
    }
  }, [groupId]);

  useEffect(() => {
    // Set current group when we navigate to a group
    if (groupId && currentGroup?.id !== groupId) {
      fetchGroupDetail();
    }
  }, [groupId]);

  // Reset transient views when switching tabs
  const changeTab = (tab: 'expenses' | 'balances' | 'members' | 'log') => {
    setActiveTab(tab);
    setSelectedExpenseId(null);
  };

  const fetchGroupDetail = async () => {
    if (!groupId) return;
    setGroupAccessError(null);
    try {
      const response = await fetch(`/api/v1/groups/${groupId}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setCurrentGroup(data);
        setNewCurrency(data.currency);
      } else {
        // 404 = not a member (or group gone). Show a meaningful message, not "Loading...".
        const data = await response.json().catch(() => ({}));
        setGroupAccessError(data.error || 'You do not have access to this group.');
      }
    } catch (error) {
      console.error('Failed to fetch group:', error);
      setGroupAccessError('Unable to load this group. Please try again.');
    }
  };

  const fetchSettings = async () => {
    if (!groupId) return;
    try {
      const response = await fetch(`/api/v1/groups/${groupId}/settings`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setExpenseEditSetting(data.expense_edit || 'creator_admin');
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    }
  };

  const saveSettings = async () => {
    if (!groupId) return;
    setSettingsLoading(true);
    setSettingsSaved(false);
    try {
      const response = await fetch(`/api/v1/groups/${groupId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ expenseEdit: expenseEditSetting }),
      });
      if (response.ok) {
        setSettingsSaved(true);
      } else {
        const data = await response.json().catch(() => ({}));
        setInviteError(data.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      setInviteError('Failed to save settings');
    } finally {
      setSettingsLoading(false);
    }
  };

  const fetchMembers = async () => {
    if (!groupId) return;
    try {
      const response = await fetch(`/api/v1/groups/${groupId}/members`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setMembers(data);
        // Auto-select current user as payer
        if (currentUser && !newPaidBy) {
          setNewPaidBy(currentUser.id);
        }
        // Initialize split values for all members
        const initialSplits: Record<string, number> = {};
        data.forEach((m: GroupMember) => {
          initialSplits[m.user_id] = 0;
        });
        setSplitValues(initialSplits);
      }
    } catch (error) {
      console.error('Failed to fetch members:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/v1/categories', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const openEditExpense = (expense: any) => {
    setEditingExpenseId(expense.id);
    setShowExpenseForm(true);
    setNewDescription(expense.description);
    setNewAmount(String(expense.amount));
    setNewCurrency(expense.currency);
    setNewPaidBy(expense.paid_by);
    setNewCategoryId(expense.category_id || '');
    setNewExpenseDate(expense.expense_date);
    // Prefill splits
    const vals: Record<string, number> = {};
    let mode: 'equal' | 'percent' | 'shares' = 'equal';
    if (expense.splits && expense.splits.length > 0) {
      mode = expense.splits[0].split_mode;
      expense.splits.forEach((s: any) => {
        vals[s.user_id] = s.value ?? 0;
      });
    }
    // Equal participation: pre-check exactly the members who currently have a
    // split row (Decision 2). Members without a row show unchecked.
    setEqualParticipants(
      new Set((expense.splits || []).map((s: any) => s.user_id as string))
    );
    setSplitMode(mode);
    setSplitValues(vals);
    setFormError('');
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);

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
        description: newDescription,
        amount: parseFloat(newAmount),
        currency: newCurrency,
        paid_by: newPaidBy,
        category_id: newCategoryId || null,
        expense_date: newExpenseDate,
        splits,
      };

      if (editingExpenseId) {
        await updateExpense(groupId!, editingExpenseId, payload);
        // Editing clears the server-side "needs review" flag (Decision 6) —
        // mirror that locally so the ⚠ / amber Edit disappears immediately,
        // regardless of whether shares/% actually changed.
        setFlaggedIds((ids) => ids.filter((id) => id !== editingExpenseId));
      } else {
        await createExpense(groupId!, payload);
      }

      // Reset form
      setNewDescription('');
      setNewAmount('');
      setNewCategoryId('');
      setSplitValues({});
      setEditingExpenseId(null);
      setShowExpenseForm(false);
      fetchBalances(groupId!);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save expense');
    } finally {
      setFormLoading(false);
    }
  };

  const handleSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettleError('');
    setSettleLoading(true);

    try {
      const response = await fetch(`/api/v1/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          from_user_id: settleFrom,
          to_user_id: settleTo,
          amount: parseFloat(settleAmount),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to record settlement');
      }

      setSettleFrom('');
      setSettleTo('');
      setSettleAmount('');
      setShowSettlementForm(false);
      fetchBalances(groupId!);
      fetchSettlements(groupId!);
    } catch (err: any) {
      setSettleError(err.message || 'Failed to record settlement');
    } finally {
      setSettleLoading(false);
    }
  };

  const handleResetAll = async () => {
    if (!groupId) return;
    if (!confirm('Reset ALL settlements? This removes every recorded payment for this group and restores the original balances.')) return;
    setResettingAll(true);
    setSettleError('');
    try {
      await resetSettlements(groupId);
      fetchBalances(groupId);
      fetchSettlements(groupId);
    } catch (err: any) {
      setSettleError(err.message || 'Failed to reset settlements');
    } finally {
      setResettingAll(false);
    }
  };

  const handleRevertSettlement = async (settlementId: string) => {
    if (!groupId) return;
    if (!confirm('Revert this payment? It will be removed from the log.')) return;
    try {
      await deleteSettlement(groupId, settlementId);
      fetchBalances(groupId);
    } catch (err: any) {
      setSettleError(err.message || 'Failed to revert payment');
    }
  };

  // Send a friendly settlement reminder email to a debtor (from_user of a
  // suggested transaction). The creditor (current user) is the sender.
  const [remindLoading, setRemindLoading] = useState<string | null>(null);
  const [remindMsg, setRemindMsg] = useState<string | null>(null);
  const handleRemind = async (toUserId: string, amount: number) => {
    if (!groupId) return;
    setRemindLoading(toUserId);
    setRemindMsg(null);
    try {
      const res = await sendReminder(groupId, toUserId, amount);
      setRemindMsg(res.sent_to ? `Reminder sent to ${res.sent_to} 🏴‍☠️` : 'Reminder sent!');
    } catch (err: any) {
      setRemindMsg(err.message || 'Failed to send reminder');
    } finally {
      setRemindLoading(null);
    }
  };

  // Admin removes a member from the group.
  const handleRemoveMember = async (memberUserId: string, memberName: string) => {
    if (!groupId) return;
    if (!confirm(`Remove ${memberName} from this group? They will lose access to its expenses and balances.`)) return;
    try {
      await removeMember(groupId, memberUserId);
      setMembers((prev) => prev.filter((m) => m.user_id !== memberUserId));
      fetchBalances(groupId);
    } catch (err: any) {
      alert(err.message || 'Failed to remove member');
    }
  };

  const handleEditSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSettlement || !groupId) return;
    setEditLoading(true);
    setEditError('');
    try {
      await updateSettlement(groupId, editSettlement.id, {
        from_user_id: editSettlement.from_user_id,
        to_user_id: editSettlement.to_user_id,
        amount: parseFloat(editSettlement.amount),
        description: editSettlement.description,
      });
      setEditSettlement(null);
      fetchBalances(groupId);
    } catch (err: any) {
      setEditError(err.message || 'Failed to update payment');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm('Delete this expense?')) return;
    try {
      await deleteExpense(groupId!, expenseId);
      fetchBalances(groupId!);
    } catch (error) {
      console.error('Failed to delete expense:', error);
    }
  };

  // Compute a member's owed share of an expense in the group's master currency.
  const computeShare = (expense: any, split: any): number => {
    const total = expense.amount_master;
    if (split.split_mode === 'equal') {
      const count = expense.splits.length || 1;
      return total / count;
    }
    if (split.split_mode === 'percent') {
      return total * (split.value || 0) / 100;
    }
    if (split.split_mode === 'shares') {
      const totalShares = expense.splits.reduce(
        (s: number, x: any) => s + (x.value || 0),
        0
      ) || 1;
      return total * (split.value || 0) / totalShares;
    }
    return 0;
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    setInviteResult(null);
    setInviteLoading(true);
    try {
      const response = await fetch(`/api/v1/groups/${groupId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: inviteName, email: inviteEmail }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invitation');
      }
      setInviteResult(`Invitation to ${data.sent_to} sent.`);
      setInviteName('');
      setInviteEmail('');
      setShowInviteForm(false);
    } catch (err: any) {
      setInviteError(err.message || 'Failed to send invitation');
    } finally {
      setInviteLoading(false);
    }
  };

  if (!groupId) return null;

  if (groupAccessError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center bg-white shadow-sm rounded-lg p-8">
          <div className="text-4xl mb-3" aria-hidden="true">🚪</div>
          <h1 className="text-lg font-semibold text-gray-900 mb-1">
            You're not part of this group
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {groupAccessError} You may have been removed, or the group no longer exists.
          </p>
          <Link
            to="/groups"
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            Back to my groups
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar
        back={
          <Link to="/groups" className="text-sm text-gray-600 hover:text-gray-900">
            ← Back
          </Link>
        }
        title={
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">
              {currentGroup?.name || 'Loading...'}
            </h1>
            <CurrencyBadge code={currentGroup?.currency || ''} />
          </div>
        }
        subRow={
          currentGroup?.invite_code ? (
            <InviteLink
              inviteCode={currentGroup.invite_code}
              currency={currentGroup.currency}
              showUrl={false}
            />
          ) : undefined
        }
      />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              {(['expenses', 'balances', 'members', 'log'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => changeTab(tab)}
                  className={`${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize`}
                >
                  {tab}
                </button>
              ))}
            </nav>
          </div>

          {/* Expenses Tab */}
          {activeTab === 'expenses' && (
            <div>
              {/* Total group expense — sum of ALL expenses, irrespective of balances.
                  Wording adapts to the group's expense type (trip / household / event / project). */}
              <div className="mb-3 flex items-center justify-between rounded-xl bg-indigo-600 px-5 py-4 text-white shadow-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-indigo-200">{groupExpenseLabel(currentGroup?.expense_type).title}</p>
                  <p className="text-sm text-indigo-100">{groupExpenseLabel(currentGroup?.expense_type).subtitle}</p>
                </div>
                <p className="text-2xl font-bold tabular-nums">
                  {expenses
                    .reduce((sum: number, e: any) => sum + (Number(e.amount_master) || 0), 0)
                    .toFixed(2)}{' '}
                  {currentGroup?.currency}
                </p>
              </div>

              {/* Who paid cash — pure CASH paid out per member (ignores balances).
                  D3 gradient rows + D4 title + mono font. */}
              <PaidCashSummary
                expenses={expenses as any[]}
                currency={currentGroup?.currency}
                colorFor={memberColor}
              />

              {/* Compact participant list */}
              <div className="mb-4 rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-sm">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                  Participants ({members.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => (
                    <span
                      key={m.user_id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 py-1 pl-1 pr-3 text-sm text-gray-700"
                    >
                      <span
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ background: memberColor(m.user_id)?.border || '#6b7280' }}
                      >
                        {m.user.name.slice(0, 1)}
                      </span>
                      {m.user.name}
                      {m.role === 'admin' && (
                        <span className="ml-0.5 rounded bg-indigo-100 px-1 text-[10px] font-semibold text-indigo-700">
                          admin
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-gray-900">Expenses</h2>
                <div className="flex gap-2">
                  {currentUser && members.find((m) => m.user_id === currentUser.id)?.role === 'admin' && (
                    <button
                      onClick={() => setShowSettings(true)}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50"
                    >
                      Group Settings
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditingExpenseId(null);
                      // New equal expense defaults to ALL members participating.
                      setEqualParticipants(new Set(members.map((m) => m.user_id)));
                      setShowExpenseForm(true);
                    }}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                  >
                    Add Expense
                  </button>
                </div>
              </div>

              {/* Expense Form Modal */}
              {showExpenseForm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg p-6 max-w-lg w-full max-h-screen overflow-y-auto">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">{editingExpenseId ? 'Edit Expense' : 'Add Expense'}</h3>
                    <form onSubmit={handleCreateExpense}>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Description</label>
                          <input
                            type="text"
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            value={newDescription}
                            onChange={(e) => setNewDescription(e.target.value)}
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
                              value={newAmount}
                              onChange={(e) => setNewAmount(e.target.value)}
                              placeholder="50.00"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Currency</label>
                            <select
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                              value={newCurrency}
                              onChange={(e) => setNewCurrency(e.target.value)}
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
                              value={newPaidBy}
                              onChange={(e) => setNewPaidBy(e.target.value)}
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
                              value={newExpenseDate}
                              onChange={(e) => setNewExpenseDate(e.target.value)}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Category</label>
                          <select
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            value={newCategoryId}
                            onChange={(e) => setNewCategoryId(e.target.value)}
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

                        {formError && (
                          <div className="text-red-600 text-sm">{formError}</div>
                        )}
                      </div>
                      <div className="mt-6 flex justify-end space-x-3">
                        <button
                          type="button"
                          onClick={() => setShowExpenseForm(false)}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={formLoading || (splitMode === 'percent' && Math.abs(Object.values(splitValues).reduce((a, b) => a + b, 0) - 100) >= 0.01)}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                        >
                          {formLoading ? (editingExpenseId ? 'Saving...' : 'Adding...') : (editingExpenseId ? 'Save Changes' : 'Add Expense')}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Group Settings Modal (admin only) */}
              {showSettings && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg p-6 max-w-lg w-full">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Group Settings</h3>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Who can edit expenses?
                      </label>
                      <div className="space-y-2">
                        {[
                          { value: 'admin_only', label: 'Admin only' },
                          { value: 'creator_admin', label: 'Expense creator and admin' },
                          { value: 'creator_only', label: 'Creator only' },
                          { value: 'all_members', label: 'All members' },
                        ].map((opt) => (
                          <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="radio"
                              name="expenseEdit"
                              value={opt.value}
                              checked={expenseEditSetting === opt.value}
                              onChange={(e) => setExpenseEditSetting(e.target.value)}
                            />
                            {opt.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    {settingsSaved && (
                      <p className="text-green-600 text-sm mb-2">Settings saved.</p>
                    )}
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setShowSettings(false)}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                      >
                        Close
                      </button>
                      <button
                        onClick={saveSettings}
                        disabled={settingsLoading}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                      >
                        {settingsLoading ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {selectedExpenseId ? (
                (() => {
                  const expense = expenses.find((e) => e.id === selectedExpenseId);
                  if (!expense) {
                    return (
                      <div className="text-center py-12">
                        <p className="text-gray-500">Expense not found.</p>
                        <button
                          onClick={() => setSelectedExpenseId(null)}
                          className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                        >
                          ← Back to expenses
                        </button>
                      </div>
                    );
                  }
                  const masterCurrency = currentGroup?.currency;
                  return (
                    <div className="bg-white shadow sm:rounded-md p-6">
                      <button
                        onClick={() => setSelectedExpenseId(null)}
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
                            {members.find((m) => m.user_id === expense.added_by)?.user.name ||
                              expense.added_by}
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
                          {expense.splits.map((split) => {
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
                                    {split.user.name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
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
                                  {computeShare(expense, split).toFixed(2)} {masterCurrency}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>

                      {expense.can_edit && (
                        <div className="mt-6 flex gap-4">
                          <button
                            onClick={() => openEditExpense(expense)}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            Edit this expense
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(expense.id)}
                            className="text-red-500 hover:text-red-700 text-sm"
                          >
                            Delete this expense
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : expenses.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No expenses yet.</p>
                </div>
              ) : (
                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          <th className="px-4 py-3 sm:px-6">Expense</th>
                          <th className="px-4 py-3 sm:px-6">Date</th>
                          <th className="px-4 py-3 sm:px-6">Paid by</th>
                          <th className="px-4 py-3 sm:px-6 text-right">Amount</th>
                          <th className="px-4 py-3 sm:px-6">Split type</th>
                          <th className="px-4 py-3 sm:px-6">Your part</th>
                          {expenses.some((e) => e.can_edit) && (
                            <th className="px-4 py-3 sm:px-6 text-right">Actions</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {expenses.map((expense) => (
                          <tr
                            key={expense.id}
                            onClick={() => setSelectedExpenseId(expense.id)}
                            className="cursor-pointer hover:bg-gray-50 focus:bg-gray-50"
                          >
                            <td className="px-4 py-4 sm:px-6">
                              <div className="flex items-center">
                                {expense.category && (
                                  <span className="text-2xl mr-3">{expense.category.icon}</span>
                                )}
                                <span className="text-sm font-medium text-gray-900">
                                  {expense.description}
                                </span>
                                {flaggedIds.includes(expense.id) && (
                                  <span
                                    title="A member joined after this weighted expense — review your split"
                                    className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700"
                                  >
                                    ⚠
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4 sm:px-6 whitespace-nowrap">
                              <DateBadge date={expense.expense_date} />
                            </td>
                            <td className="px-4 py-4 sm:px-6 whitespace-nowrap">
                              <PayerBadge name={expense.payer.name} color={memberColor(expense.paid_by)} />
                            </td>
                            <td className="px-4 py-4 sm:px-6 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <CurrencyBadge code={expense.currency} />
                                <span className="text-sm font-semibold text-gray-900 tabular-nums">
                                  {expense.amount.toFixed(2)}
                                </span>
                              </div>
                              {expense.currency !== currentGroup?.currency && (
                                <p className="text-xs text-gray-500 mt-0.5">
                                  ≈ {expense.amount_master} {currentGroup?.currency}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-4 sm:px-6 whitespace-nowrap">
                              {(() => {
                                const mode = expense.splits[0]?.split_mode;
                                const map = {
                                  equal: { label: 'Equal', icon: '⚖️' },
                                  shares: { label: 'Shares', icon: '🥧' },
                                  percent: { label: 'Percent', icon: '📊' },
                                } as const;
                                const info = map[(mode as keyof typeof map) || 'equal'];
                                return (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 capitalize">
                                    <span aria-hidden="true">{info.icon}</span>
                                    {info.label}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-4 sm:px-6 whitespace-nowrap">
                              {(() => {
                                const mySplit = expense.splits.find(
                                  (s: any) => s.user_id === currentUser?.id
                                );
                                if (!mySplit) return <span className="text-sm text-gray-400">—</span>;
                                const mode = mySplit.split_mode;
                                const share = computeShare(expense, mySplit);
                                const label =
                                  mode === 'equal'
                                    ? 'equal'
                                    : mode === 'percent'
                                    ? `% (${mySplit.value}%)`
                                    : `shares (${mySplit.value})`;
                                return (
                                  <span className="text-sm text-gray-700">
                                    <span className="capitalize font-medium">{label}</span>
                                    <span className="text-gray-500"> · {share.toFixed(2)} {currentGroup?.currency}</span>
                                  </span>
                                );
                              })()}
                            </td>
                            {expenses.some((e) => e.can_edit) && (
                              <td className="px-4 py-4 sm:px-6 text-right whitespace-nowrap">
                                {expense.can_edit && (
                                  <span className="flex items-center justify-end gap-3">
                                    <span
                                      role="button"
                                      tabIndex={0}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openEditExpense(expense);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.stopPropagation();
                                          openEditExpense(expense);
                                        }
                                      }}
                                      className={
                                        flaggedIds.includes(expense.id)
                                          ? 'inline-flex items-center rounded-md bg-amber-500 px-2.5 py-1 text-sm font-semibold text-white hover:bg-amber-600 cursor-pointer'
                                          : 'text-blue-600 hover:text-blue-800 text-sm cursor-pointer'
                                      }
                                    >
                                      Edit
                                    </span>
                                    <span
                                      role="button"
                                      tabIndex={0}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteExpense(expense.id);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.stopPropagation();
                                          handleDeleteExpense(expense.id);
                                        }
                                      }}
                                      className="text-red-500 hover:text-red-700 text-sm cursor-pointer"
                                    >
                                      Delete
                                    </span>
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Balances Tab */}
          {activeTab === 'balances' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-gray-900">Balances</h2>
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      if (currentUser) setSettleFrom(currentUser.id);
                      setShowSettlementForm(true);
                    }}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700"
                  >
                    Record Settlement
                  </button>
                </div>
              </div>

              {/* Big red admin reset — only for group admins, only when settlements exist */}
              {currentUser && members.find((m) => m.user_id === currentUser.id)?.role === 'admin' && settlements.length > 0 && (
                <div className="mb-4 flex items-center justify-between rounded-md border border-red-300 bg-red-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-red-800">Reset all settlements</p>
                    <p className="text-xs text-red-600">Removes every recorded payment for this group and restores original balances.</p>
                  </div>
                  <button
                    onClick={handleResetAll}
                    disabled={resettingAll}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                  >
                    {resettingAll ? 'Resetting...' : 'Reset All Settlements'}
                  </button>
                </div>
              )}

              {/* Edit Settlement Modal */}
              {editSettlement && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg p-6 max-w-md w-full">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Edit Payment</h3>
                    <form onSubmit={handleEditSettlement}>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">From</label>
                          <select
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            value={editSettlement.from_user_id}
                            onChange={(e) => setEditSettlement({ ...editSettlement, from_user_id: e.target.value })}
                          >
                            {members.map((m) => (
                              <option key={m.user_id} value={m.user_id}>{m.user.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">To</label>
                          <select
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            value={editSettlement.to_user_id}
                            onChange={(e) => setEditSettlement({ ...editSettlement, to_user_id: e.target.value })}
                          >
                            {members.map((m) => (
                              <option key={m.user_id} value={m.user_id}>{m.user.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Amount ({currentGroup?.currency})</label>
                          <input
                            type="number"
                            required
                            min="0.01"
                            step="0.01"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            value={editSettlement.amount}
                            onChange={(e) => setEditSettlement({ ...editSettlement, amount: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Note</label>
                          <input
                            type="text"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            value={editSettlement.description}
                            onChange={(e) => setEditSettlement({ ...editSettlement, description: e.target.value })}
                            placeholder="e.g. Dinner split"
                          />
                        </div>
                        {editError && <div className="text-red-600 text-sm">{editError}</div>}
                      </div>
                      <div className="mt-6 flex justify-end space-x-3">
                        <button
                          type="button"
                          onClick={() => setEditSettlement(null)}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={editLoading}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                        >
                          {editLoading ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Settlement Form Modal */}
              {showSettlementForm && (() => {
                const isAdmin = !!currentUser && members.find((m) => m.user_id === currentUser.id)?.role === 'admin';
                const currentMember = members.find((m) => m.user_id === currentUser?.id);
                return (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg p-6 max-w-md w-full">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Record Settlement</h3>
                    <form onSubmit={handleSettlement}>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">From</label>
                          {isAdmin ? (
                            <select
                              required
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                              value={settleFrom}
                              onChange={(e) => setSettleFrom(e.target.value)}
                            >
                              <option value="">Select payer...</option>
                              {members.map((m) => (
                                <option key={m.user_id} value={m.user_id}>
                                  {m.user.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="mt-1 flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                              <span>{currentMember?.user.name ?? currentUser?.name ?? 'You'}</span>
                              <span className="text-xs text-gray-400">locked to you</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">To</label>
                          <select
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            value={settleTo}
                            onChange={(e) => setSettleTo(e.target.value)}
                          >
                            <option value="">Select receiver...</option>
                            {members.map((m) => (
                              <option key={m.user_id} value={m.user_id}>
                                {m.user.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Amount ({currentGroup?.currency})</label>
                          <input
                            type="number"
                            required
                            min="0.01"
                            step="0.01"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            value={settleAmount}
                            onChange={(e) => setSettleAmount(e.target.value)}
                            placeholder="10.00"
                          />
                        </div>
                        {settleError && (
                          <div className="text-red-600 text-sm">{settleError}</div>
                        )}
                      </div>
                      <div className="mt-6 flex justify-end space-x-3">
                        <button
                          type="button"
                          onClick={() => setShowSettlementForm(false)}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={settleLoading}
                          className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50"
                        >
                          {settleLoading ? 'Recording...' : 'Record Settlement'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
                );
              })()}

              <div className="space-y-4">
                  {/* Total group expense — sum of ALL expenses, irrespective of balances.
                      Wording adapts to the group's expense type. */}
                  <div className="flex items-center justify-between rounded-xl bg-indigo-600 px-5 py-4 text-white shadow-sm">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-indigo-200">{groupExpenseLabel(currentGroup?.expense_type).title}</p>
                      <p className="text-sm text-indigo-100">{groupExpenseLabel(currentGroup?.expense_type).subtitle}</p>
                    </div>
                    <p className="text-2xl font-bold tabular-nums">
                      {expenses
                        .reduce((sum: number, e: any) => sum + (Number(e.amount_master) || 0), 0)
                        .toFixed(2)}{' '}
                      {currentGroup?.currency}
                    </p>
                  </div>

                  {/* Who paid cash — same D3 block as the Expenses tab. */}
                  <PaidCashSummary
                    expenses={expenses as any[]}
                    currency={currentGroup?.currency}
                    colorFor={memberColor}
                  />

                  {/* Per-member balance chart (Option B) */}
                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="mb-1 text-lg font-bold text-gray-900">Who owes / is owed</h3>
                    <p className="mb-4 text-xs font-medium text-emerald-600">
                      Green extends right (is owed) · Red extends left (owes) · Gray = settled
                    </p>
                    {balances.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">
                        No balances yet — add an expense to get started.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {balances.map((b) => {
                          const settled = Math.abs(b.balance) < 0.01;
                          const owed = b.balance > 0;
                          const maxAbs = Math.max(
                            ...balances.map((x) => Math.abs(x.balance)),
                            1
                          );
                          const pct = (Math.abs(b.balance) / maxAbs) * 50;
                          return (
                            <div key={b.user_id} className="flex items-center gap-3">
                              <span
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                                style={{
                                  background:
                                    memberColor(b.user_id)?.border ||
                                    '#6b7280',
                                }}
                              >
                                {b.user.name.slice(0, 1)}
                              </span>
                              <div className="flex-1">
                                <div className="mb-1 flex items-center justify-between">
                                  <span className="text-sm font-semibold text-gray-800">
                                    {b.user.name}
                                  </span>
                                  {settled ? (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                                      Settled ✓
                                    </span>
                                  ) : (
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                        owed
                                          ? 'bg-green-100 text-green-700'
                                          : 'bg-red-100 text-red-700'
                                      }`}
                                    >
                                      {owed ? 'is owed' : 'owes'}
                                    </span>
                                  )}
                                </div>
                                <div className="relative h-5 rounded bg-gray-100">
                                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300" />
                                  {settled ? (
                                    <div className="absolute left-1/2 top-0.5 bottom-0.5 w-0.5 -translate-x-1/2 rounded bg-gray-400" />
                                  ) : (
                                    <div
                                      className={`absolute top-0.5 bottom-0.5 rounded ${
                                        owed ? 'bg-green-500' : 'bg-red-500'
                                      }`}
                                      style={
                                        owed
                                          ? { left: '50%', width: `${pct}%` }
                                          : { right: '50%', width: `${pct}%` }
                                      }
                                    />
                                  )}
                                </div>
                              </div>
                              <div
                                className={`w-24 shrink-0 text-right text-sm font-bold ${
                                  settled
                                    ? 'text-gray-400'
                                    : owed
                                    ? 'text-green-600'
                                    : 'text-red-600'
                                }`}
                              >
                                {settled ? '0.00' : `${owed ? '+' : ''}${b.balance.toFixed(2)}`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Who owes who — suggested minimal payments (optimize algorithm) */}
                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="mb-1 text-lg font-bold text-gray-900">Who owes who</h3>
                    <p className="mb-3 text-xs font-medium text-emerald-600">
                      Suggested payments to settle everyone up (minimum transactions)
                    </p>
                    {optimizedTransactions.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">
                        Everyone is settled up! 🎉
                      </p>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {optimizedTransactions.map((tx, idx) => (
                          <li key={idx} className="flex items-center gap-2 py-2 text-sm">
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                              style={{ background: memberColor(tx.from_user_id)?.border || '#6b7280' }}>
                              {tx.from_user.name.slice(0, 1)}
                            </span>
                            <span className="font-medium text-gray-800">{tx.from_user.name}</span>
                            <span className="text-gray-400">pays</span>
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                              style={{ background: memberColor(tx.to_user_id)?.border || '#6b7280' }}>
                              {tx.to_user.name.slice(0, 1)}
                            </span>
                            <span className="font-medium text-gray-800">{tx.to_user.name}</span>
                            <span className="ml-auto font-bold text-gray-900">
                              {tx.amount.toFixed(2)} {currentGroup?.currency}
                            </span>
                            <button
                              onClick={() => handleRemind(tx.from_user_id, tx.amount)}
                              disabled={remindLoading === tx.from_user_id}
                              title={`Nudge ${tx.from_user.name} to settle`}
                              className="ml-1 rounded px-2 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                            >
                              {remindLoading === tx.from_user_id ? 'Sending…' : 'Remind'}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {remindMsg && (
                    <div className="mb-2 rounded-md bg-indigo-50 border border-indigo-200 px-4 py-2 text-sm text-indigo-800">
                      {remindMsg}
                    </div>
                  )}

                  {/* Payment log (Option A) — who actually paid whom */}
                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="mb-1 text-lg font-bold text-gray-900">Payment log</h3>
                    <p className="mb-3 text-xs font-medium text-emerald-600">
                      Who actually paid whom — visible to everyone
                    </p>
                    {settlements.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">
                        No payments recorded yet.
                      </p>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {settlements.map((s) => (
                          <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                              style={{ background: memberColor(s.from_user_id)?.border || '#6b7280' }}>
                              {s.from_user.name.slice(0, 1)}
                            </span>
                            <span className="font-medium text-gray-800">{s.from_user.name}</span>
                            <span className="text-gray-400">→</span>
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                              style={{ background: memberColor(s.to_user_id)?.border || '#6b7280' }}>
                              {s.to_user.name.slice(0, 1)}
                            </span>
                            <span className="font-medium text-gray-800">{s.to_user.name}</span>
                            <span className="ml-auto font-bold text-gray-900">
                              {Number(s.amount).toFixed(2)}
                            </span>
                            <span className="w-20 text-right text-xs text-gray-400">
                              {formatDate(s.created_at.slice(0, 10))}
                            </span>
                            <button
                              onClick={() =>
                                setEditSettlement({
                                  id: s.id,
                                  from_user_id: s.from_user_id,
                                  to_user_id: s.to_user_id,
                                  amount: String(s.amount),
                                  description: s.description || '',
                                })
                              }
                              className="ml-1 rounded px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleRevertSettlement(s.id)}
                              className="rounded px-2 py-0.5 text-xs font-medium text-red-500 hover:bg-red-50"
                            >
                              Revert
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
            </div>
          )}

          {/* Members Tab */}
          {activeTab === 'members' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-gray-900">Members</h2>
                <button
                  onClick={() => { setShowInviteForm(true); setInviteResult(null); setInviteError(''); }}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                >
                  Invite
                </button>
              </div>

              {inviteResult && (
                <div className="mb-4 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                  {inviteResult}
                </div>
              )}

              {/* Invite form modal */}
              {showInviteForm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg p-6 max-w-md w-full">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Invite a member</h3>
                    <form onSubmit={handleInvite}>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Name</label>
                          <input
                            type="text"
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            value={inviteName}
                            onChange={(e) => setInviteName(e.target.value)}
                            placeholder="e.g., Alex"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Email</label>
                          <input
                            type="email"
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder="alex@example.com"
                          />
                        </div>
                        {inviteError && (
                          <div className="text-red-600 text-sm">{inviteError}</div>
                        )}
                        <p className="text-xs text-gray-500">
                          Sends an email with the group invite link
                          {currentGroup?.invite_code ? ` (code ${currentGroup.invite_code})` : ''}.
                        </p>
                      </div>
                      <div className="mt-6 flex justify-end space-x-3">
                        <button
                          type="button"
                          onClick={() => setShowInviteForm(false)}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={inviteLoading}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                        >
                          {inviteLoading ? 'Sending...' : 'Send invite'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              <div className="bg-white shadow overflow-hidden sm:rounded-md">
                <ul className="divide-y divide-gray-200">
                  {members.map((member) => {
                    const isAdmin = members.find((m) => m.user_id === currentUser?.id)?.role === 'admin';
                    const isSelf = member.user_id === currentUser?.id;
                    return (
                    <li key={member.id} className="px-4 py-4 sm:px-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {member.user.name}
                          </p>
                          <p className="text-sm text-gray-500">{member.user.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              member.role === 'admin'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-green-100 text-green-800'
                            }`}
                          >
                            {member.role}
                          </span>
                          {isAdmin && !isSelf && (
                            <button
                              onClick={() => handleRemoveMember(member.user_id, member.user.name)}
                              className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
          {activeTab === 'log' && (
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">Group activity</h2>
              {activityLoading ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : activities.length === 0 ? (
                <p className="text-sm text-gray-400">No activity yet.</p>
              ) : (
                <ul className="space-y-3">
                  {activities.map((a) => {
                    const meta = ACTIVITY_META[a.action] || {
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
          )}
        </div>
      </main>

      <RateFootnote groupCurrency={currentGroup?.currency} />
    </div>
  );
}
