import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  passwordResetRequested: boolean;
  created_at: string;
}

// Operator back-office (admin-only). Lists users, supports live filtering by
// name/email, and lets the operator mint a reset link per-row OR via the box
// up top. The link is shown in the top box so the operator can forward it over
// Telegram.
export default function AdminPanel() {
  const { user, isAuthenticated } = useAuthStore();
  const isOperator = !!(user && (user.isAdmin || user.is_admin));

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [link, setLink] = useState('');
  const [linkFor, setLinkFor] = useState('');
  const [busy, setBusy] = useState(false);

  // Live filter + per-row generate state.
  const [query, setQuery] = useState('');
  const [generatingId, setGeneratingId] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/admin/users', { credentials: 'include' });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Failed to load users');
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOperator) loadUsers();
  }, [isOperator, loadUsers]);

  // Mint a reset link for a given email. Used by BOTH the top box and the
  // per-row buttons. Keeps the generated link in the top box (linkFor shows who
  // it was for).
  const generateFor = useCallback(async (targetEmail: string, rowId?: string) => {
    setError('');
    if (rowId) setGeneratingId(rowId);
    else setBusy(true);
    try {
      const res = await fetch('/api/v1/admin/reset-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: targetEmail.toLowerCase() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to generate link');
      setLink(data.link);
      setLinkFor(data.email);
    } catch (err: any) {
      setError(err.message || 'Failed to generate link');
    } finally {
      if (rowId) setGeneratingId('');
      else setBusy(false);
    }
  }, []);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    generateFor(email);
  };

  // Live narrowing: match against name OR email (case-insensitive). Empty query
  // shows everyone.
  const visibleUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, query]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-600">Please sign in to view the admin panel.</div>
      </div>
    );
  }

  if (!isOperator) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-red-700 font-medium">Access denied</div>
          <p className="mt-2 text-sm text-gray-600">This page is for operators only.</p>
          <Link to="/groups" className="mt-4 inline-block font-medium text-blue-600 hover:text-blue-500">
            Back to groups
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Operator admin</h1>
          <Link to="/groups" className="text-sm font-medium text-blue-600 hover:text-blue-500">
            ← Back to groups
          </Link>
        </div>

        {/* Generate reset link */}
        <div className="bg-white shadow rounded-lg p-5 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-1">Generate a password-reset link</h2>
          <p className="text-sm text-gray-500 mb-4">
            Enter the user's email. The one-time link (valid 30 min) appears below — copy it and
            send it to them directly (Telegram/Discord). Resend email is currently offline.
          </p>
          <form onSubmit={handleGenerate} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              required
              placeholder="user@example.com"
              className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? 'Generating…' : 'Generate link'}
            </button>
          </form>

          {link && (
            <div className="mt-4 rounded-md bg-green-50 border border-green-200 p-3">
              <div className="text-sm text-green-800 font-medium">Reset link for {linkFor}:</div>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 break-all text-xs text-gray-800 bg-white border border-gray-200 rounded px-2 py-1">
                  {link}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(link)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-500"
                >
                  Copy
                </button>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Send this link to the user. It expires in 30 minutes and can be used once.
              </div>
            </div>
          )}
        </div>

        {/* User list */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-medium text-gray-900">
              Users ({visibleUsers.length}
              {visibleUsers.length !== users.length ? ` of ${users.length}` : ''})
            </h2>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by name or email…"
                className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-1.5 border w-56"
              />
              <button
                type="button"
                onClick={loadUsers}
                className="text-xs font-medium text-blue-600 hover:text-blue-500"
              >
                Refresh
              </button>
            </div>
          </div>
          {error && <div className="px-5 py-3 text-sm text-red-700">{error}</div>}
          {loading ? (
            <div className="px-5 py-6 text-center text-sm text-gray-500">Loading…</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Operator</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reset requested</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Reset link</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {visibleUsers.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-900">{u.name}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-600">{u.email}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-sm">
                      {u.isAdmin ? (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">operator</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-sm">
                      {u.passwordResetRequested ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">requested</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-500">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-sm text-right">
                      <button
                        type="button"
                        onClick={() => generateFor(u.email, u.id)}
                        disabled={generatingId === u.id}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                      >
                        {generatingId === u.id ? 'Generating…' : 'Generate link'}
                      </button>
                    </td>
                  </tr>
                ))}
                {visibleUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-6 text-center text-sm text-gray-500">
                      {users.length === 0 ? 'No users found.' : 'No users match that filter.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
