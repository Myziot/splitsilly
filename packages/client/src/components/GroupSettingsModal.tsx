import { useEffect, useState } from 'react';

interface Props {
  groupId: string;
  onClose: () => void;
}

const EDIT_OPTIONS = [
  { value: 'admin_only', label: 'Admin only' },
  { value: 'creator_admin', label: 'Expense creator and admin' },
  { value: 'creator_only', label: 'Creator only' },
  { value: 'all_members', label: 'All members' },
];

/**
 * Group settings modal (admin only). Fetches settings on open and saves via
 * PUT; owns its own loading/saved/error state. Extracted from GroupDetail
 * 2026-09-23 — save failures now render INSIDE this modal (previously they
 * were written to invite-error state that only rendered in the invite modal,
 * so they were invisible).
 */
export default function GroupSettingsModal({ groupId, onClose }: Props) {
  const [expenseEdit, setExpenseEdit] = useState<string>('creator_admin');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/groups/${groupId}/settings`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setExpenseEdit(data.expense_edit || 'creator_admin');
      })
      .catch((err) => console.error('Failed to fetch settings:', err));
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const response = await fetch(`/api/v1/groups/${groupId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ expenseEdit }),
      });
      if (response.ok) {
        setSaved(true);
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || 'Failed to save settings');
      }
    } catch {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Group Settings</h3>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Who can edit expenses?
          </label>
          <div className="space-y-2">
            {EDIT_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="expenseEdit"
                  value={opt.value}
                  checked={expenseEdit === opt.value}
                  onChange={(e) => setExpenseEdit(e.target.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
        {saved && (
          <p className="text-green-600 text-sm mb-2">Settings saved.</p>
        )}
        {error && (
          <p className="text-red-600 text-sm mb-2">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
