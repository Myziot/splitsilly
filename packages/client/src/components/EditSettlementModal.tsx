import { useState } from 'react';
import type { GroupMember } from '../types/group';

export interface EditableSettlement {
  id: string;
  from_user_id: string;
  to_user_id: string;
  amount: string;
  description: string;
}

interface Props {
  members: GroupMember[];
  currency?: string;
  initial: EditableSettlement;
  onClose: () => void;
  /** Persists the edit; throws with a user-facing message on failure. */
  onSubmit: (values: EditableSettlement) => Promise<void>;
}

/**
 * Edit-payment modal (payment log). Owns its draft + error state; the parent
 * mounts it only while open and persists via onSubmit. Extracted from
 * GroupDetail 2026-09-23.
 */
export default function EditSettlementModal({ members, currency, initial, onClose, onSubmit }: Props) {
  const [draft, setDraft] = useState<EditableSettlement>(initial);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onSubmit(draft);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Edit Payment</h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">From</label>
              <select
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                value={draft.from_user_id}
                onChange={(e) => setDraft({ ...draft, from_user_id: e.target.value })}
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
                value={draft.to_user_id}
                onChange={(e) => setDraft({ ...draft, to_user_id: e.target.value })}
              >
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.user.name}</option>
                ))}
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
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Note</label>
              <input
                type="text"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="e.g. Dinner split"
              />
            </div>
            {error && <div className="text-red-600 text-sm">{error}</div>}
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
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
