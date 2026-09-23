import { useState } from 'react';

/* ------------------------------------------------------------------ */
/* Shared copy hook                                                    */
/* ------------------------------------------------------------------ */
function useCopy(url: string) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else {
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
      /* swallow */
    }
  };
  return { copied, copy };
}

const URL = 'https://home-port.local/join/PINNACLE2026';

/* ------------------------------------------------------------------ */
/* The 4 compact variants (each ~same footprint as the group name row) */
/* ------------------------------------------------------------------ */

// A — Inline link + quiet copy icon (the original subtle style)
function VariantA() {
  const { copied, copy } = useCopy(URL);
  return (
    <div className="flex items-center gap-1.5">
      <span className="truncate font-mono text-xs text-gray-400" title={URL}>{URL}</span>
      <button onClick={copy} title="Copy invite link"
        className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-blue-50 hover:text-blue-600">
        {copied ? <Check /> : <CopyIcon />}
      </button>
      {copied && <span className="text-xs text-green-600">Copied!</span>}
    </div>
  );
}

// B — Small "Share invite" pill button (compact, single line, subtle color)
function VariantB() {
  const { copied, copy } = useCopy(URL);
  return (
    <button onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-100">
      <ShareIcon />
      {copied ? 'Copied!' : 'Share invite'}
    </button>
  );
}

// C — Tiny icon-only round button + "Invite" text label (minimal height)
function VariantC() {
  const { copied, copy } = useCopy(URL);
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={copy} title="Copy invite link"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition hover:bg-blue-100 hover:text-blue-600">
        {copied ? <Check /> : <ShareIcon />}
      </button>
      <span className="text-xs font-medium text-gray-500">{copied ? 'Link copied' : 'Invite'}</span>
    </div>
  );
}

// E — Combo (crew pick): blue-outline "Share invite:" label + grey URL +
//     little blue copy button (A's text + D's button + outline label)
function VariantE() {
  const { copied, copy } = useCopy(URL);
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-600">
        Share invite:
      </span>
      <span className="truncate font-mono text-xs text-gray-400" title={URL}>{URL}</span>
      <button onClick={copy} title="Copy invite link"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-blue-600 transition hover:bg-blue-100">
        {copied ? <Check /> : <CopyIcon />}
      </button>
      {copied && <span className="text-xs text-green-600">Copied!</span>}
    </div>
  );
}

// F — FINAL combo (crew pick after revision): blue "Share invite" pill (B) +
//     grey URL after it, NO copy icon on the right; pill has a small coin glyph
function VariantF() {
  const { copied, copy } = useCopy(URL);
  return (
    <div className="flex items-center gap-2">
      <button onClick={copy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold leading-none text-blue-700">$</span>
        {copied ? 'Copied!' : 'Share invite'}
      </button>
      <span className="truncate font-mono text-xs text-gray-400" title={URL}>{URL}</span>
    </div>
  );
}
//     more visible than A/B/C but still a single short line, no gradient blast)
function VariantD() {
  const { copied, copy } = useCopy(URL);
  return (
    <button onClick={copy}
      className="inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50">
      <ShareIcon />
      {copied ? 'Copied!' : 'Share invite link'}
      <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded bg-indigo-100 text-indigo-700">
        {copied ? <Check /> : <CopyIcon />}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* The REAL nav bar mock — same structure as GroupDetail so you judge   */
/* whether the group name stays visible.                                */
/* ------------------------------------------------------------------ */
function NavMock({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </div>
      {/* TopBar mock */}
      <div className="flex items-start gap-4 bg-white px-4 py-3">
        <span className="text-sm text-gray-600 hover:text-gray-900">← Back</span>
        <div className="min-w-0">
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-bold text-gray-900">Crow Reef camping</h1>
            {/* CurrencyBadge mock */}
            <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              USD
            </span>
          </div>
          <div className="mt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */
function CopyIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 4h8a2 2 0 012 2v8a2 2 0 01-2 2h-8a2 2 0 01-2-2v-8a2 2 0 012-2z" />
    </svg>
  );
}
function Check() {
  return (
    <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}
function ShareIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M8.684 13.342C8.886 13.66 9 14.044 9 14.446V16a2 2 0 01-2 2H5a2 2 0 01-2-2v-3a2 2 0 012-2h1.554c.402 0 .786-.14 1.13-.458M8.684 13.342L15 7m-4 10h2a2 2 0 002-2v-3a2 2 0 00-2-2h-3a2 2 0 00-2 2v1" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function InvitePlayground() {
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Invite Link — Design Playground</h1>
          <p className="mt-1 text-gray-600">
            Compact variants that sit under the group name WITHOUT pushing it out of view. Each shows the
            real nav bar so you can see the group name stays visible. Click any to copy (real "Copied!" feedback).
          </p>
        </header>

        <div className="grid grid-cols-1 gap-5">
          <NavMock label="A — Inline link + quiet copy icon (subtle, original style)">
            <VariantA />
          </NavMock>
          <NavMock label="B — Small 'Share invite' pill (compact, subtle blue)">
            <VariantB />
          </NavMock>
          <NavMock label="C — Icon-only round button + 'Invite' label (most minimal height)">
            <VariantC />
          </NavMock>
          <NavMock label="D — Compact 'Share invite link' button w/ colored accent (a bit more visible, still one line)">
            <VariantD />
          </NavMock>
          <NavMock label="E — COMBO (crew pick): 'Share invite:' blue outline + grey URL + little blue copy button">
            <VariantE />
          </NavMock>
          <NavMock label="F — FINAL (crew pick): blue 'Share invite' pill + grey URL, no right icon">
            <VariantF />
          </NavMock>
        </div>

        <footer className="mt-8 text-center text-sm text-gray-500">
          Pick a letter → A (subtle) · B (pill) · C (icon+label) · D (accented) · E (COMBO) · F (FINAL: pill + grey URL).
          Tell me which and I'll wire it in.
        </footer>
      </div>
    </div>
  );
}
