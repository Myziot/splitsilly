import { useState } from 'react';
import type { GroupMember } from '../types/group';

interface Props {
  groupId: string;
  members: GroupMember[];
  currentUserId?: string;
  fallbackName?: string;
  currency?: string;
  /**
   * Suggested payment per pair, keyed `"<fromUserId>><toUserId>"`, sourced from
   * the SAME list the "Who owes who" card renders (live optimized legs, or the
   * frozen leg remaining when the book is locked). Prefills the amount when a
   * receiver is picked; a pair with no entry leaves the field blank.
   */
  pairAmounts?: Record<string, number>;
  onClose: () => void;
  /** Refetch balances + payment log after a successful record. */
  onSaved: () => void;
}

/**
 * Record-a-settlement modal (balances tab). Owns its own form state; the
 * parent mounts it only while open. Extracted from GroupDetail 2026-09-23.
 */
export default function SettlementFormModal({ groupId, members, currentUserId, fallbackName, currency, pairAmounts, onClose, onSaved }: Props) {
  const isAdmin = !!currentUserId && members.find((m) => m.user_id === currentUserId)?.role === 'admin';
  const currentMember = members.find((m) => m.user_id === currentUserId);
  // Payer pre-seeded to the viewer (admins may switch to anyone).
  const [from, setFrom] = useState(currentUserId ?? '');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // The suggested figure for the currently-selected pair, straight from the
  // "Who owes who" list — no separate math, so the modal can never disagree
  // with the card. Undefined when no leg exists for this direction (payer owes
  // nothing to that person, or the optimizer routed them elsewhere): leave the
  // field blank rather than invent a number.
  const suggested =
    from && to ? pairAmounts?.[`${from}>${to}`] : undefined;
  const fmt = (v: number) => v.toFixed(2);

  // Prefill on receiver change: pick a person you owe and the exact figure
  // drops in (editable for a partial payment). Switching to someone you don't
  // owe clears it so a stale number can't ride along.
  const handleReceiverChange = (next: string) => {
    setTo(next);
    const amt = next && from ? pairAmounts?.[`${from}>${next}`] : undefined;
    setAmount(amt !== undefined && amt > 0.005 ? fmt(amt) : '');
  };

  // Same rule when an admin switches the payer: re-derive from the new pair.
  const handlePayerChange = (next: string) => {
    setFrom(next);
    if (next && next === to) {
      // Prevent a self-settlement: drop the receiver so the form can't submit
      // a same-person payment.
      setTo('');
      setAmount('');
      return;
    }
    const amt = next && to ? pairAmounts?.[`${next}>${to}`] : undefined;
    setAmount(amt !== undefined && amt > 0.005 ? fmt(amt) : '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Guard against an accidental same-person settlement (payer === receiver).
    if (from && to && from === to) {
      setError('A person cannot settle with themselves — pick a different receiver.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/v1/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          from_user_id: from,
          to_user_id: to,
          amount: parseFloat(amount),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to record settlement');
      }

      onClose();
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to record settlement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Record Settlement</h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">From</label>
              {isAdmin ? (
                <select
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={from}
                  onChange={(e) => handlePayerChange(e.target.value)}
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
                  <span>{currentMember?.user.name ?? fallbackName ?? 'You'}</span>
                  <span className="text-xs text-gray-400">locked to you</span>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">To</label>
              <select
                required
                className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm ${from && to === from ? 'border-red-300' : ''}`}
                value={to}
                onChange={(e) => handleReceiverChange(e.target.value)}
              >
                <option value="">Select receiver...</option>
                {members
                  .filter((m) => m.user_id !== from)
                  .map((m) => {
                    // Annotate with what the payer owes THIS person, straight
                    // from the "Who owes who" legs (same source as the prefill).
                    const owed = from ? pairAmounts?.[`${from}>${m.user_id}`] : undefined;
                    return (
                      <option key={m.user_id} value={m.user_id}>
                        {m.user.name}
                        {owed !== undefined && owed > 0.005
                          ? ` — ${
                              from === currentUserId
                                ? 'you owe'
                                : `${members.find((p) => p.user_id === from)?.user.name ?? 'they'} owes`
                            } ${fmt(owed)}`
                          : ''}
                      </option>
                    );
                  })}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Amount ({currency})</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
              {suggested !== undefined && suggested > 0.005 && (
                <p className="mt-1 text-xs text-gray-500">
                  {fmt(suggested)} {currency} is the full amount from the "Who owes who" list — edit for a partial payment.
                </p>
              )}
            </div>
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
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50"
            >
              {loading ? 'Recording...' : 'Record Settlement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
