import { useState } from 'react';

interface InviteLinkProps {
  inviteCode: string;
  /** Group currency code (e.g. USD) — drives the little coin glyph. */
  currency?: string;
  /** Optional className for the wrapper. */
  className?: string;
}

/** Map common ISO currency codes to a symbol; fall back to first letter. */
function currencySymbol(code?: string): string {
  const map: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥',
    CAD: 'C$', AUD: 'A$', CHF: 'Fr', INR: '₹', PLN: 'zł',
  };
  if (!code) return '$';
  return map[code.toUpperCase()] ?? code.slice(0, 1);
}

/**
 * Compact invite control (crew-chosen, final):
 *   [ 🪙 Share invite ]  <grey url text>
 * "Share invite" is a blue-outline pill button (with a small currency coin
 * glyph on the left) that copies the join link and shows "Copied!". The grey
 * URL is the read-only link, shown after the button. Single line — keeps the
 * group-name nav height normal.
 */
export default function InviteLink({ inviteCode, currency, className = '' }: InviteLinkProps) {
  const [copied, setCopied] = useState(false);

  if (!inviteCode) return null;

  const url = `${window.location.origin}/join/${inviteCode}`;
  const symbol = currencySymbol(currency);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for non-secure contexts
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Swallow — copy failed (e.g. denied), no crash
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Blue-outline "Share invite" pill with a small currency coin glyph */}
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? 'Copied!' : 'Copy invite link'}
        aria-label={copied ? 'Copied!' : 'Copy invite link'}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
      >
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold leading-none text-blue-700">
          {symbol}
        </span>
        {copied ? 'Copied!' : 'Share invite'}
      </button>

      {/* Grey URL text, shown after the button */}
      <span
        className="truncate font-mono text-xs text-gray-400"
        title={url}
      >
        {url}
      </span>
    </div>
  );
}
