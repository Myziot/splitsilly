import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

// Public password-reset page. Reached via the /reset?token=... link the
// operator hands to a user out-of-band (Resend email is down for now).
export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();

  const resetPassword = useAuthStore((s) => s.resetPassword);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Token must be present in the URL; otherwise this page is meaningless.
  useEffect(() => {
    if (!token) {
      setError('This reset link is missing its token. Ask the administrator to send you a fresh link.');
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setIsLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err: any) {
      setError(err.message || 'Password reset failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <img
            src="/split_silly_icon.png"
            alt="Split Silly"
            className="h-24 w-auto object-contain mx-auto"
          />
          <h2 className="mt-4 text-2xl font-extrabold text-gray-900">Set a new password</h2>
          <p className="mt-2 text-sm text-gray-600">
            Choose a fresh password for your Splitsilly account.
          </p>
        </div>

        {done ? (
          <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-center text-sm text-green-700">
            Password updated! Taking you to sign in…
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="password" className="sr-only">New password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="New password (min 8 chars)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="confirm" className="sr-only">Confirm password</label>
                <input
                  id="confirm"
                  name="confirm"
                  type="password"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="Confirm new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-center text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !token}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isLoading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}

        <div className="text-center">
          <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500 text-sm">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
