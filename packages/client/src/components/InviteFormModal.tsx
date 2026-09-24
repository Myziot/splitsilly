interface Props {
  inviteCode?: string;
  name: string;
  email: string;
  error: string;
  loading: boolean;
  onName: (v: string) => void;
  onEmail: (v: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

/**
 * Invite-a-member modal (members tab). Controlled by the parent because the
 * success banner renders outside the modal. Extracted from GroupDetail 2026-09-23.
 */
export default function InviteFormModal({ inviteCode, name, email, error, loading, onName, onEmail, onClose, onSubmit }: Props) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Invite a member</h3>
        <form onSubmit={onSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                value={name}
                onChange={(e) => onName(e.target.value)}
                placeholder="e.g., Alex"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                value={email}
                onChange={(e) => onEmail(e.target.value)}
                placeholder="alex@example.com"
              />
            </div>
            {error && (
              <div className="text-red-600 text-sm">{error}</div>
            )}
            <p className="text-xs text-gray-500">
              Sends an email with the group invite link
              {inviteCode ? ` (code ${inviteCode})` : ''}.
            </p>
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
              {loading ? 'Sending...' : 'Send invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
