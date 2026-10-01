import { useState } from 'react';
import { useAuthStore } from '../store/auth';

/**
 * Email-verification nag banner (feature-email-verification D1/D4).
 * Soft gate: nothing is blocked — this is a muted, persistent reminder on
 * every authed page with a "Resend link" button. It disappears the moment
 * email_verified flips true (refreshMe after a verify round-trip).
 * Styling follows the RateFootnote restraint: quiet amber, small text.
 */
export default function VerifyEmailBanner() {
  const user = useAuthStore((s) => s.user);
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');

  if (!user || user.email_verified !== false) return null;

  const resend = async () => {
    setState('sending');
    try {
      const res = await fetch('/api/v1/auth/resend-verification', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.status === 429) {
        setState('idle');
        return;
      }
      if (res.ok) {
        // alreadyVerified can mean the token link was clicked elsewhere —
        // re-pull /me so the banner drops out if the flag flipped.
        await refreshMe();
        setState('sent');
        setTimeout(() => setState('idle'), 60_000);
      } else {
        setState('idle');
      }
    } catch {
      setState('idle');
    }
  };

  return (
    <div className="w-full bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-center text-xs text-amber-800">
      <svg
        aria-hidden="true"
        className="inline-block h-3.5 w-3.5 -mt-0.5 mr-1.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </svg>
      <span className="font-mono">
        email not verified for {user.email} — invites &amp; reminders may miss you
      </span>{' '}
      <button
        onClick={() => void resend()}
        disabled={state !== 'idle'}
        className="underline font-medium disabled:no-underline disabled:opacity-60"
      >
        {state === 'idle' ? 'Resend link' : state === 'sending' ? 'sending…' : 'sent ✓'}
      </button>
    </div>
  );
}
