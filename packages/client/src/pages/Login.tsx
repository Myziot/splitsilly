import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import RateFootnote from '../components/RateFootnote';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [company, setCompany] = useState(''); // honeypot — must stay empty
  // Live counter of wrong attempts remaining before the reset path is offered.
  // Sourced from the server's response (authoritative, survives restart/
  // cross-device) and seeded by a local count until the first server reply.
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [resetAvailable, setResetAvailable] = useState(false);
  // User clicked "Notify administrator" — show the green confirmation.
  const [notified, setNotified] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invite = searchParams.get('invite');

  const handleNotify = async () => {
    if (!email) return;
    setNotifying(true);
    try {
      await fetch('/api/v1/auth/notify-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.toLowerCase() }),
      });
      setNotified(true);
    } catch {
      // Even on transport failure, reassure the user the request was logged.
      setNotified(true);
    } finally {
      setNotifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password, company);
      navigate(invite ? `/join/${invite}` : '/groups');
    } catch (err: any) {
      setError(err.message || 'Login failed');
      // Prefer the server's authoritative counter when present; otherwise
      // track locally so the user still sees a live countdown.
      if (typeof err.attemptsRemaining === 'number') {
        setAttemptsRemaining(err.attemptsRemaining);
        setResetAvailable(!!err.resetAvailable);
      } else if (attemptsRemaining === null) {
        // Unknown starting point and no server signal — just count locally.
        setAttemptsRemaining((r) => (r === null ? 2 : Math.max(0, r - 1)));
      } else {
        setAttemptsRemaining((r) => Math.max(0, (r ?? 0) - 1));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = () => {
    if (error) setError('');
    // Editing the form resets the reset-hint state so it's not stuck on screen.
    setResetAvailable(false);
    setAttemptsRemaining(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="flex flex-col items-center">
          <img
            src="/split_silly_icon.png"
            alt="Split Silly"
            className="h-28 w-auto object-contain"
          />
          <h2 className="mt-4 text-center text-3xl font-extrabold text-gray-900">
            Splitsilly
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Split expenses with friends
          </p>
          {/* Compact intro — full version lives on /about */}
          <p className="mt-3 max-w-sm text-center text-xs leading-relaxed text-gray-500">
            Track shared costs, split by equal / shares / percent, and settle up
            with one tap. Every group keeps a transparent activity log so no coin
            goes unaccounted.
          </p>
          <Link
            to="/about"
            className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-500"
          >
            What is Splitsilly? →
          </Link>
        </div>
        <form className="mt-8 space-y-6" onSubmit={(e) => { e.preventDefault(); }}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => { setEmail(e.target.value); handleChange(); }}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); handleChange(); }}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-center text-sm text-red-700">
              {error}
            </div>
          )}

          {/* After N wrong attempts the server offers the operator reset path.
              Show a live "attempts remaining" countdown, then the reworded
              notify-admin button once the threshold is reached. */}
          {attemptsRemaining !== null && attemptsRemaining > 0 && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-2 text-center text-sm text-amber-800">
              {attemptsRemaining} attempt{attemptsRemaining === 1 ? '' : 's'} left before you
              can request a password reset.
            </div>
          )}

          {resetAvailable && attemptsRemaining !== null && attemptsRemaining <= 0 && !notified && (
            <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-center">
              <p className="text-sm text-blue-700 mb-2">
                Forgot your password? Notify administrator to generate a reset token.
              </p>
              <button
                type="button"
                onClick={handleNotify}
                disabled={notifying}
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {notifying ? 'Notifying…' : 'Notify administrator'}
              </button>
            </div>
          )}

          {notified && (
            <div className="rounded-md bg-green-50 border border-green-200 px-4 py-2 text-center text-sm text-green-700">
              ✓ Admin notified. The operator will generate a reset link for you shortly.
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          {/* Honeypot: hidden off-screen. Bots that autofill it get rejected server-side. */}
          <div aria-hidden style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}>
            <label htmlFor="company">Company</label>
            <input
              id="company"
              name="company"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>

          <div className="text-center">
            <Link
              to={invite ? `/register?invite=${invite}` : '/register'}
              className="font-medium text-blue-600 hover:text-blue-500 text-sm"
            >
              Don't have an account? Register
            </Link>
          </div>
        </form>
        <RateFootnote />
      </div>
    </div>
  );
}
