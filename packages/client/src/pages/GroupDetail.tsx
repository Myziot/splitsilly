import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useGroupStore } from '../store/groups';
import { useExpenseStore } from '../store/expenses';
import { useBalanceStore } from '../store/balances';
import { useLockPlanStore } from '../store/books';
import TopBar from '../components/TopBar';
import InviteLink from '../components/InviteLink';
import CurrencyBadge from '../components/CurrencyBadge';
import DateBadge from '../components/DateBadge';
import PayerBadge from '../components/PayerBadge';
import RateFootnote from '../components/RateFootnote';
import PaidCashSummary from '../components/PaidCashSummary';
import SettlementFormModal from '../components/SettlementFormModal';
import EditSettlementModal, { type EditableSettlement } from '../components/EditSettlementModal';
import SettleConfirmModal, { type SettleConfirmPayload } from '../components/SettleConfirmModal';
import InviteFormModal from '../components/InviteFormModal';
import GroupSettingsModal from '../components/GroupSettingsModal';
import ExpenseFormModal from '../components/ExpenseFormModal';
import type { GroupMember } from '../types/group';
import { createMemberColorMap } from '../utils/memberColor';
import { formatDateTime, formatDate, groupExpenseLabel } from '../utils/format';
import { useActivityStore, ACTIVITY_META } from '../store/activity';
import { getSocket } from '../lib/socket';

export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user: currentUser } = useAuthStore();
  const { currentGroup, setCurrentGroup } = useGroupStore();
  const { expenses, fetchExpenses, createExpense, updateExpense, deleteExpense } = useExpenseStore();
  const { balances, optimizedTransactions, settlements, fetchBalances, fetchSettlements, deleteSettlement, resetSettlements, updateSettlement, sendReminder, removeMember } = useBalanceStore();
  const { isBookLocked, plan: lockedPlan, planDiverged, fetchLock, lockPlan, unlockPlan, recalculate, settleAgainstPlan } = useLockPlanStore();
  // The ONLY ground truth for "everyone is settled" is the live "Who owes /
  // is owed" balances: every member at ~0. Never derive it from frozen plan
  // legs or optimize output — a member with a real +/- balance (even with an
  // empty payment log) must never see a settled banner or celebratory haiku.
  const everyoneSettled = useMemo(
    () => balances.length > 0 && balances.every((b: any) => Math.abs(b.balance) < 0.01),
    [balances]
  );
  const nameOfMember = (id?: string): string => {
    const m = members.find((x) => x.user_id === id);
    return m ? m.user.name : 'Someone';
  };
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [groupAccessError, setGroupAccessError] = useState<string | null>(null);
  const isAdmin = !!currentUser && members.find((m) => m.user_id === currentUser.id)?.role === 'admin';
  const memberColor = useMemo(
    () => createMemberColorMap(members.map((m) => m.user_id)),
    [members]
  );
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'members' | 'log'>('expenses');
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);

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

  // Expense / settings modal open state (form state lives inside the modals)
  const [expenseForm, setExpenseForm] = useState<{ expense?: any } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Settlement form state
  const [showSettlementForm, setShowSettlementForm] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  // Settlement edit modal state
  const [editSettlement, setEditSettlement] = useState<EditableSettlement | null>(null);
  // Settle-leg confirmation modal state (prevents mis-tapping a frozen leg)
  const [settleConfirm, setSettleConfirm] = useState<SettleConfirmPayload | null>(null);

  const [flaggedIds, setFlaggedIds] = useState<string[]>([]);

  useEffect(() => {
    if (groupId) {
      fetchExpenses(groupId);
      fetchBalances(groupId);
      fetchSettlements(groupId);
      fetchMembers();
      fetchLock(groupId);
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

  // Real-time settlement sync: when ANY member records or reverts a payment in
  // this group, the server broadcasts to the room. Refetch balances + payment
  // log + lock legs so the "who owes / is owed" card stays live for everyone
  // (a friend settling on their device now updates YOUR view without a manual
  // refresh).
  useEffect(() => {
    if (!groupId) return;
    const socket = getSocket();
    // Ensure we're subscribed to this group's room (server also auto-joins on
    // connect, but this covers post-connect navigation).
    socket.emit('join-group', groupId);
    const refresh = () =>
      Promise.all([
        fetchBalances(groupId),
        fetchSettlements(groupId),
        fetchLock(groupId),
      ]);
    const onRecorded = (data: { groupId: string }) => {
      if (data?.groupId === groupId) refresh();
    };
    const onRemoved = (data: { groupId: string }) => {
      if (data?.groupId === groupId) refresh();
    };
    socket.on('settlement:recorded', onRecorded);
    socket.on('settlement:removed', onRemoved);
    return () => {
      socket.off('settlement:recorded', onRecorded);
      socket.off('settlement:removed', onRemoved);
    };
  }, [groupId, fetchBalances, fetchSettlements, fetchLock]);

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

  const fetchMembers = async () => {
    if (!groupId) return;
    try {
      const response = await fetch(`/api/v1/groups/${groupId}/members`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setMembers(data);
      }
    } catch (error) {
      console.error('Failed to fetch members:', error);
    }
  };


  // After a successful create/update from the modal: mirror the server-side
  // "needs review" flag clear (Decision 6) locally and refresh balances.
  const handleExpenseSaved = (editedId: string | null) => {
    if (editedId) setFlaggedIds((ids) => ids.filter((id) => id !== editedId));
    fetchBalances(groupId!);
  };


  const handleResetAll = async () => {
    if (!groupId) return;
    if (!confirm('Reset ALL settlements? This removes every recorded payment for this group and restores the original balances.')) return;
    setResettingAll(true);
    try {
      await resetSettlements(groupId);
      await Promise.all([
        fetchBalances(groupId),
        fetchSettlements(groupId),
        fetchLock(groupId),
      ]);
    } catch (err: any) {
      alert(err.message || 'Failed to reset settlements');
    } finally {
      setResettingAll(false);
    }
  };

  const handleRevertSettlement = async (settlementId: string) => {
    if (!groupId) return;
    if (!confirm('Revert this payment? It will be removed from the log.')) return;
    try {
      await deleteSettlement(groupId, settlementId);
      // Re-fetch balances + payment log + lock state so the frozen "who owes
      // who" plan un-strikes the reverted leg.
      await Promise.all([
        fetchBalances(groupId),
        fetchSettlements(groupId),
        fetchLock(groupId),
      ]);
    } catch (err: any) {
      alert(err.message || 'Failed to revert payment');
    }
  };

  // Send a friendly settlement reminder email to a debtor (from_user of a
  // suggested transaction). The creditor (current user) is the sender.
  const [remindLoading, setRemindLoading] = useState<string | null>(null);
  const [remindMsg, setRemindMsg] = useState<string | null>(null);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [celebrated, setCelebrated] = useState(false);
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

  // Settle a frozen plan leg: records a settlement (strikes the leg server-side
  // when locked) and refetches balances + payment log + lock state so the
  // per-person "Who owes / is owed" card and the frozen legs both update live.
  const handleBookSettle = async (fromUserId: string, toUserId: string, amount: number) => {
    if (!groupId) return;
    try {
      await settleAgainstPlan(groupId, fromUserId, toUserId, amount);
      // Refetch everything: the per-person card reads `balances`, the payment
      // log reads `settlements`, and the frozen legs read the lock `plan`.
      await Promise.all([
        fetchBalances(groupId),
        fetchSettlements(groupId),
        fetchLock(groupId),
      ]);
    } catch (err: any) {
      setRemindMsg(err.message || 'Failed to record settlement');
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

  const submitEditSettlement = async (values: EditableSettlement) => {
    if (!groupId) return;
    await updateSettlement(groupId, values.id, {
      from_user_id: values.from_user_id,
      to_user_id: values.to_user_id,
      amount: parseFloat(values.amount),
      description: values.description,
    });
    // Re-fetch so the frozen plan re-strikes to the edited direction/amount.
    await Promise.all([
      fetchBalances(groupId),
      fetchSettlements(groupId),
      fetchLock(groupId),
    ]);
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
                    onClick={() => setExpenseForm({})}
                    disabled={isBookLocked}
                    className={
                      isBookLocked
                        ? 'inline-flex cursor-not-allowed items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gray-400'
                        : 'inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700'
                    }
                  >
                    {isBookLocked ? '🔒 Add Expense' : 'Add Expense'}
                  </button>
                </div>
              </div>

              {/* Book-locked notice: no new expenses may be added while the book
                  is frozen for settlement. Replaces the empty/normal list state. */}
              {isBookLocked && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-gray-300 bg-gray-100 px-5 py-4 shadow-sm">
                  <span className="text-2xl leading-none" aria-hidden="true">🔒</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-700">
                      Book is locked — no new expenses can be added
                    </p>
                    <p className="text-xs text-gray-500">
                      This book is frozen for settlement. Unlock it in the balances tab to add new expenses again.
                    </p>
                  </div>
                </div>
              )}

              {/* Expense Form Modal */}
              {expenseForm && (
                <ExpenseFormModal
                  groupId={groupId!}
                  members={members}
                  currentUserId={currentUser?.id}
                  defaultCurrency={currentGroup?.currency}
                  initialExpense={expenseForm.expense}
                  onClose={() => setExpenseForm(null)}
                  onSaved={handleExpenseSaved}
                />
              )}

              {/* Group Settings Modal (admin only) */}
              {showSettings && (
                <GroupSettingsModal groupId={groupId!} onClose={() => setShowSettings(false)} />
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
                            onClick={() => setExpenseForm({ expense })}
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
                <div className={`bg-white shadow overflow-hidden sm:rounded-md ${isBookLocked ? 'opacity-60 pointer-events-none' : ''}`}>
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
                          {expenses.some((e) => e.can_edit) && !isBookLocked && (
                            <th className="px-4 py-3 sm:px-6 text-right">Actions</th>
                          )}
                          {isBookLocked && (
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
                            {isBookLocked ? (
                              <td className="px-4 py-4 sm:px-6 text-right whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
                                  <span aria-hidden="true">🔒</span> Book locked
                                </span>
                              </td>
                            ) : (
                              expenses.some((e) => e.can_edit) && (
                              <td className="px-4 py-4 sm:px-6 text-right whitespace-nowrap">
                                {expense.can_edit && (
                                  <span className="flex items-center justify-end gap-3">
                                    <span
                                      role="button"
                                      tabIndex={0}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpenseForm({ expense });
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.stopPropagation();
                                          setExpenseForm({ expense });
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
                            ))}
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
                    onClick={() => setShowSettlementForm(true)}
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
                <EditSettlementModal
                  members={members}
                  currency={currentGroup?.currency}
                  initial={editSettlement}
                  onClose={() => setEditSettlement(null)}
                  onSubmit={submitEditSettlement}
                />
              )}

              {/* Settlement Form Modal */}
              {showSettlementForm && (
                <SettlementFormModal
                  groupId={groupId!}
                  members={members}
                  currentUserId={currentUser?.id}
                  fallbackName={currentUser?.name}
                  currency={currentGroup?.currency}
                  onClose={() => setShowSettlementForm(false)}
                  onSaved={() => {
                    fetchBalances(groupId!);
                    fetchSettlements(groupId!);
                  }}
                />
              )}

          {/* Settle-leg confirmation dialog */}
          {settleConfirm && (
            <SettleConfirmModal
              confirm={settleConfirm}
              currency={currentGroup?.currency}
              onCancel={() => setSettleConfirm(null)}
              onConfirm={(c) => handleBookSettle(c.fromUserId, c.toUserId, c.amount)}
            />
          )}

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

                  {/* Who owes who — suggested minimal payments (optimize algorithm).
                      The Book-lock toggle lives in this card's header. UNLOCKED: the
                      list is live/dynamic and shows no action buttons. LOCKED: the
                      list is FROZEN, the card dims to light-grey, and each leg offers
                      BOTH "Remind" and "Settle" (Settle strikes the frozen leg). The
                      per-person "Who is owed / owes" card above stays live always. */}
                  <div className={`rounded-xl border p-5 shadow-sm ${isBookLocked ? 'border-gray-300 bg-gray-100' : 'border-gray-200 bg-white'}`}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                        <span aria-hidden>{isBookLocked ? '🔒' : '🔓'}</span>
                        Who owes who
                      </h3>
                      {isAdmin && (
                        <button
                          onClick={async () => {
                            try {
                              if (isBookLocked) await unlockPlan(groupId || '');
                              else await lockPlan(groupId || '');
                            } catch (e: any) {
                              setRemindMsg(e.message || 'Action failed');
                            }
                          }}
                          className={
                            isBookLocked
                              ? 'rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700'
                              : 'rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700'
                          }
                        >
                          {isBookLocked ? 'Unlock book' : 'Lock book'}
                        </button>
                      )}
                    </div>
                    <p className={`mb-3 text-xs font-medium ${isBookLocked ? 'text-gray-500' : 'text-emerald-600'}`}>
                      {isBookLocked
                        ? 'Book locked — suggested payments are frozen. Record a payment to strike each leg.'
                        : 'Suggested payments to settle everyone up (minimum transactions)'}
                    </p>

                    {isBookLocked ? (
                      // LOCKED: frozen plan legs, split into the original snapshot
                      // (above a red line) and anything that diverged from it
                      // (reverse legs spawned by over/opposite/bogus payments, below).
                      (() => {
                        const above = (lockedPlan || []).filter((p: any) => !p.reverseOf);
                        const below = (lockedPlan || []).filter((p: any) => !!p.reverseOf);
                        const LegRow = ({ leg, dim }: { leg: any; dim?: boolean }) => (
                          <li key={leg.id} className={`flex items-center gap-2 whitespace-nowrap py-2 text-sm ${dim ? 'opacity-60' : ''}`}>
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                              style={{ background: memberColor(leg.fromUserId)?.border || '#6b7280' }}>
                              {nameOfMember(leg.fromUserId).slice(0, 1)}
                            </span>
                            <span className="font-medium text-gray-800">{nameOfMember(leg.fromUserId)}</span>
                            <span className="text-gray-400">pays</span>
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                              style={{ background: memberColor(leg.toUserId)?.border || '#6b7280' }}>
                              {nameOfMember(leg.toUserId).slice(0, 1)}
                            </span>
                            <span className="font-medium text-gray-800">{nameOfMember(leg.toUserId)}</span>
                            {leg.remaining > 0.001 && (
                              <span className="ml-2 text-xs text-gray-400">
                                {(leg.amount - leg.paidAmount).toFixed(2)} {currentGroup?.currency} · {leg.paidAmount.toFixed(2)} covered
                              </span>
                            )}
                            {leg.remaining <= 0.001 && (
                              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-700">
                                <span aria-hidden="true">✓</span> Settled
                              </span>
                            )}
                            <span className="ml-auto font-bold text-gray-900">
                              {leg.remaining.toFixed(2)} {currentGroup?.currency}
                            </span>
                            {leg.remaining > 0.001 && (
                              <>
                                <button
                                  onClick={() => handleRemind(leg.fromUserId, leg.remaining)}
                                  disabled={remindLoading === leg.fromUserId}
                                  title={`Nudge ${nameOfMember(leg.fromUserId)} to settle`}
                                  className="ml-1 rounded px-2 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100 disabled:opacity-50"
                                >
                                  {remindLoading === leg.fromUserId ? 'Sending…' : 'Remind'}
                                </button>
                                <button
                                  onClick={() =>
                                    setSettleConfirm({
                                      fromUserId: leg.fromUserId,
                                      toUserId: leg.toUserId,
                                      amount: leg.remaining,
                                      fromName: nameOfMember(leg.fromUserId),
                                      toName: nameOfMember(leg.toUserId),
                                    })
                                  }
                                  className="rounded px-2 py-0.5 text-xs font-medium text-green-600 hover:bg-green-100"
                                >Settle</button>
                              </>
                            )}
                          </li>
                        );
                        return (
                          <>
                            {above.length > 0 ? (
                              <ul className="divide-y divide-gray-200 overflow-x-auto">
                                {above.map((leg: any) => <LegRow key={leg.id} leg={leg} />)}
                              </ul>
                            ) : (
                              everyoneSettled && (
                                <p className="text-sm text-gray-400 text-center py-4">Everyone is settled up in this book! 🎉</p>
                              )
                            )}
                            {(() => {
                              const unsettledBelow = below.filter((l: any) => !l.settled);
                              // Show the divergence UI whenever the BOOK is flagged
                              // diverged — not only when below-line reverse legs exist. A
                              // book can be diverged WITH no reverse legs (e.g. a settlement
                              // reverted after its reverse leg was already consumed, leaving
                              // the frozen plan silently drifted from live balances). In that
                              // case the frozen legs above the line are stale, so we still
                              // must surface "Recalculate to resync" rather than let the stale
                              // "✓ Settled / 0.00" legs pretend everything is fine.
                              if (unsettledBelow.length === 0 && !planDiverged) return null;
                              return (
                                <>
                                  <hr className="my-3 border-t-2 border-red-300" />
                                  <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-red-300 bg-red-50 px-4 py-3">
                                    <span className="text-lg leading-none" aria-hidden="true">⚠️</span>
                                    <p className="flex-1 text-sm font-medium text-red-700">
                                      Payments have diverged from the frozen plan — recalculate to resync.
                                    </p>
                                    {isAdmin && (
                                      <button
                                        onClick={async () => {
                                          try {
                                            setRecalcBusy(true);
                                            await recalculate(groupId || '');
                                            await fetchBalances(groupId || '');
                                            await fetchSettlements(groupId || '');
                                          } catch (e: any) {
                                            setRemindMsg(e.message || 'Recalculate failed');
                                          } finally {
                                            setRecalcBusy(false);
                                          }
                                        }}
                                        disabled={recalcBusy}
                                        className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                      >
                                        {recalcBusy ? 'Recalculating…' : 'Recalculate'}
                                      </button>
                                    )}
                                  </div>
                                  {unsettledBelow.length > 0 && (
                                    <ul className="divide-y divide-gray-100 overflow-x-auto">
                                      {below.map((leg: any) => <LegRow key={leg.id} leg={leg} dim />)}
                                    </ul>
                                  )}
                                </>
                              );
                            })()}
                            {(() => {
                              // Celebrate only when the LIVE balances are truly all
                              // zero — never when a frozen leg or optimize output is
                              // empty but a member still carries a +/- balance.
                              const allSettled = everyoneSettled && !celebrated;
                              if (!allSettled) return null;
                              const haikus = [
                                'No coin left to owe -\nThe book lies calm and still -\nWe drink, debt is naught.',
                                'Every leg struck true -\nThe ledger breathes in peace -\nToss the abacus.',
                                'Debts settled like dust -\nThe ship sails free of weight -\nAnchors up, my friends.',
                                'Zero owed, zero due -\nThe parrot squawks "all square!" -\nRum for the whole crew.',
                              ];
                              const haiku = haikus[Math.floor(Math.random() * haikus.length)];
                              return (
                                <div className="my-4 flex flex-col items-center gap-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-6 py-6 text-center shadow-sm">
                                  <div className="text-5xl" aria-hidden="true">🎉⚓🎊</div>
                                  <h4 className="text-xl font-extrabold text-emerald-800">All settled, cap'n!</h4>
                                  <p className="whitespace-pre-line text-sm font-medium text-emerald-700">{haiku}</p>
                                  <p className="text-xs text-emerald-600">The book stays locked — nothing left to tally. Relax the rigging. ☕</p>
                                  {isAdmin && (
                                    <button
                                      onClick={() => setCelebrated(false)}
                                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                                    >
                                      Dismiss 🧹
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
                          </>
                        );
                      })()
                    ) : (
                      // UNLOCKED: live suggested payments. Same Remind/Settle actions as
                      // the locked view — a debt still needs nudging/settling whether the
                      // book is frozen or not. Only show "everyone settled" when the live
                      // balances are truly all zero — not merely when the optimizer has
                      // no suggestions.
                      everyoneSettled ? (
                        <p className="text-sm text-gray-400 text-center py-4">
                          Everyone is settled up! 🎉
                        </p>
                      ) : (
                        <ul className="divide-y divide-gray-100 overflow-x-auto">
                          {optimizedTransactions.map((tx, idx) => (
                            <li key={idx} className="flex items-center gap-2 whitespace-nowrap py-2 text-sm">
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
                                className="ml-1 rounded px-2 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100 disabled:opacity-50"
                              >
                                {remindLoading === tx.from_user_id ? 'Sending…' : 'Remind'}
                              </button>
                              <button
                                onClick={() =>
                                  setSettleConfirm({
                                    fromUserId: tx.from_user_id,
                                    toUserId: tx.to_user_id,
                                    amount: tx.amount,
                                    fromName: tx.from_user.name,
                                    toName: tx.to_user.name,
                                  })
                                }
                                className="rounded px-2 py-0.5 text-xs font-medium text-green-600 hover:bg-green-100"
                              >Settle</button>
                            </li>
                          ))}
                        </ul>
                      )
                    )}
                  </div>

                  {/* Payment log (Option A) — who actually paid whom */}
                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="mb-1 text-lg font-bold text-gray-900">Payment log</h3>
                    <p className="mb-3 text-xs font-medium text-emerald-600">
                      Who actually paid whom — visible to everyone
                    </p>
                    <p className="mb-3 text-xs text-gray-500">
                      If payments diverge from the optimized "Who owes who", unlock the book to recalculate, then lock it again.
                    </p>
                    {settlements.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">
                        No payments recorded yet.
                      </p>
                    ) : (
                      <ul className="divide-y divide-gray-100 overflow-x-auto">
                        {settlements.map((s) => (
                          <li key={s.id} className="flex items-center gap-2 whitespace-nowrap py-2 text-sm">
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

              {/* Full invite URL — always shown here (the navbar hides it on
                  mobile/landscape, so this is the reliable place to copy it). */}
              {currentGroup?.invite_code && (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-gray-50 border border-gray-200 px-3 py-2">
                  <InviteLink
                    inviteCode={currentGroup.invite_code}
                    currency={currentGroup.currency}
                    showUrl
                  />
                </div>
              )}

              {inviteResult && (
                <div className="mb-4 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                  {inviteResult}
                </div>
              )}

              {/* Invite form modal */}
              {showInviteForm && (
                <InviteFormModal
                  inviteCode={currentGroup?.invite_code}
                  name={inviteName}
                  email={inviteEmail}
                  error={inviteError}
                  loading={inviteLoading}
                  onName={setInviteName}
                  onEmail={setInviteEmail}
                  onClose={() => setShowInviteForm(false)}
                  onSubmit={handleInvite}
                />
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
          )}
        </div>
      </main>

      <RateFootnote groupCurrency={currentGroup?.currency} />
    </div>
  );
}
