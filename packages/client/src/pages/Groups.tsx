import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useGroupStore } from '../store/groups';
import { useInvitationStore } from '../store/invitations';
import InvitationCard from '../components/InvitationCard';
import TopBar from '../components/TopBar';
import CurrencyBadge from '../components/CurrencyBadge';
import RateFootnote from '../components/RateFootnote';
import { GROUP_EXPENSE_TYPE_OPTIONS } from '../utils/format';

export default function Groups() {
  const { groups, fetchGroups, createGroup } = useGroupStore();
  const { user } = useAuthStore();
  const { invitations, fetchInvitations } = useInvitationStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupCurrency, setNewGroupCurrency] = useState('USD');
  const [newGroupExpenseType, setNewGroupExpenseType] = useState('general');
  const [error, setError] = useState('');

  // Per-group balance for the logged-in user (sign mirrors GroupDetail:
  // balance > 0 => is owed, < 0 => owes). Populates the card pill.
  const [balanceById, setBalanceById] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchGroups();
    fetchInvitations();
  }, [fetchGroups, fetchInvitations]);

  // Once groups + user are known, pull the current user's balance for each group.
  useEffect(() => {
    if (!user || groups.length === 0) return;
    let cancelled = false;
    (async () => {
      await Promise.all(
        groups.map(async (g) => {
          try {
            const res = await fetch(`/api/v1/groups/${g.id}/balances`, {
              credentials: 'include',
            });
            if (!res.ok) return;
            const balances: { user_id: string; balance: number }[] = await res.json();
            if (cancelled) return;
            const mine = balances.find((b) => b.user_id === user.id);
            if (mine) {
              setBalanceById((prev) => ({ ...prev, [g.id]: mine.balance }));
            }
          } catch {
            // Non-fatal: card simply renders without the balance pill.
          }
        })
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [groups, user]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await createGroup(newGroupName, newGroupCurrency, newGroupExpenseType);
      setShowCreateModal(false);
      setNewGroupName('');
      setNewGroupCurrency('USD');
      setNewGroupExpenseType('general');
    } catch (err: any) {
      setError(err.message || 'Failed to create group');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar>
        <Link to="/groups" className="text-xl font-bold text-gray-900 hover:text-blue-600">
          Splitsilly
        </Link>
      </TopBar>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Your Groups</h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              New Group
            </button>
          </div>

          {/* Pending invitations addressed to this account (account-based
              inbox — feature-placeholder-member D2b; email is just delivery). */}
          {invitations.length > 0 && (
            <div className="mb-6 space-y-3">
              <h3 className="text-sm font-medium uppercase tracking-wide text-gray-500">
                Pending invitations ({invitations.length})
              </h3>
              {invitations.map((inv) => (
                <InvitationCard
                  key={inv.membership_id}
                  membershipId={inv.membership_id}
                  groupId={inv.group_id}
                  groupName={inv.group_name}
                  invitedBy={inv.invited_by}
                  invitedName={inv.invited_name}
                  invitedEmail={inv.invited_email}
                  balanceIfAccepted={inv.balance_if_accepted}
                  currency={inv.currency}
                  inviteCode={inv.invite_code}
                  seatStatus={inv.seat_status}
                  onAccepted={() => fetchGroups()}
                />
              ))}
            </div>
          )}

          {groups.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No groups yet. Create one to get started!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((group) => (
                <Link
                  key={group.id}
                  to={`/groups/${group.id}`}
                  className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
                >
                  <h3 className="text-lg font-medium text-gray-900">{group.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <CurrencyBadge code={group.currency} />
                    {balanceById[group.id] !== undefined && (() => {
                      const bal = balanceById[group.id];
                      const settled = Math.abs(bal) < 0.01;
                      if (settled) {
                        return (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                            Settled ✓
                          </span>
                        );
                      }
                      const owed = bal > 0;
                      return (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${owed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                          title={owed ? 'You are owed this' : 'You owe this'}
                        >
                          {owed ? 'You are owed ' : 'You owe '}
                          {Math.abs(bal).toFixed(2)} {group.currency}
                        </span>
                      );
                    })()}
                  </div>
                  <p className="mt-2 text-xs text-gray-400">
                    Invite: {group.invite_code}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Group</h3>
            <form onSubmit={handleCreateGroup}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Group Name</label>
                  <input
                    type="text"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="e.g., Sicily Trip 2026"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Currency</label>
                  <select
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    value={newGroupCurrency}
                    onChange={(e) => setNewGroupCurrency(e.target.value)}
                  >
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="GBP">GBP - British Pound</option>
                    <option value="PLN">PLN - Polish Zloty</option>
                    <option value="CAD">CAD - Canadian Dollar</option>
                    <option value="AUD">AUD - Australian Dollar</option>
                    <option value="JPY">JPY - Japanese Yen</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Expense type</label>
                  <select
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    value={newGroupExpenseType}
                    onChange={(e) => setNewGroupExpenseType(e.target.value)}
                  >
                    {GROUP_EXPENSE_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                {error && (
                  <div className="text-red-600 text-sm">{error}</div>
                )}
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <RateFootnote />
    </div>
  );
}
