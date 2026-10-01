import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

/**
 * /verify?token=... — lands the emailed "Confirm my email" click (D1/D2).
 * Public page: the link must work from a fresh browser with no session.
 * Calls the public POST /auth/verify (marks the TOKEN'S OWNER verified);
 * if a session happens to exist, refreshMe() drops the nag banner live.
 */
export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const [status, setStatus] = useState<'working' | 'ok' | 'fail'>('working');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setStatus('ok');
          if (isAuthenticated) await refreshMe();
        } else {
          setStatus('fail');
          setMessage(data.error || 'Link expired or already used');
        }
      } catch {
        if (!cancelled) {
          setStatus('fail');
          setMessage('Network error — try again');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-6 p-8 text-center">
        <img src="/split_silly_icon.png" alt="Split Silly" className="h-24 w-auto object-contain mx-auto" />
        {status === 'working' && (
          <p className="text-gray-600">Confirming your email…</p>
        )}
        {status === 'ok' && (
          <>
            <h1 className="text-2xl font-bold text-green-700">Email confirmed ✓</h1>
            <p className="text-gray-600 text-sm">
              Invites and settlement reminders will find you now. Fair winds!
            </p>
            <Link
              to={isAuthenticated ? '/groups' : '/login'}
              className="inline-block rounded-md bg-indigo-600 px-5 py-2 text-white font-medium"
            >
              {isAuthenticated ? 'Back to your groups' : 'Sign in'}
            </Link>
          </>
        )}
        {status === 'fail' && (
          <>
            <h1 className="text-2xl font-bold text-amber-700">That link didn't work</h1>
            <p className="text-gray-600 text-sm">{message}</p>
            <p className="text-gray-500 text-xs">
              Links expire after 48 hours and work once. Sign in and use
              "Resend link" in the banner for a fresh one.
            </p>
            <Link
              to={isAuthenticated ? '/groups' : '/login'}
              className="inline-block rounded-md bg-indigo-600 px-5 py-2 text-white font-medium"
            >
              Continue
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
