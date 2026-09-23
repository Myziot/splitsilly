import { useState } from 'react';

/* ------------------------------------------------------------------ */
/* TopBar (portrait phone) — Design Playground                        */
/* Direction chosen: B = two-row stacked. These 4 variants are all    */
/* two-row flavors so you can pick the exact arrangement on a phone.  */
/* Pure mock; no backend. Each is shown inside a 360px phone frame.    */
/* ------------------------------------------------------------------ */

const GROUP = 'Crow Reef camping';
const CURRENCY = 'USD';
const INVITE = 'https://home-port.local/join/PINNACLE2026';

function useCopy(url: string) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* swallow */
    }
  };
  return { copied, copy };
}

/* Small shared bits ------------------------------------------------- */
function Bell() {
  return (
    <button className="relative p-2 rounded-full hover:bg-gray-100" aria-label="Notifications">
      <span className="text-xl">🔔</span>
      <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold text-white bg-red-500 rounded-full">
        2
      </span>
    </button>
  );
}
function Logout({ small }: { small?: boolean }) {
  return (
    <button
      className={`inline-flex items-center border border-gray-300 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 ${
        small ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'
      }`}
    >
      Logout
    </button>
  );
}
function CurrencyPill() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-semibold">
      {CURRENCY}
    </span>
  );
}
function Back() {
  return <span className="text-sm text-gray-600">← Back</span>;
}
function Logo() {
  return (
    <div className="flex items-center justify-center h-9 w-9 rounded-full bg-yellow-400 text-blue-900 text-[10px] font-black">
      $
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variant A — Classic two-row: back+bell+logout on top, group meta   */
/* (name • currency • Share invite) on its own second row.            */
/* ------------------------------------------------------------------ */
function VariantA() {
  const { copied, copy } = useCopy(INVITE);
  return (
    <nav className="bg-white shadow-sm">
      <div className="px-3">
        {/* Row 1 — chrome */}
        <div className="flex items-center justify-between h-12">
          <Back />
          <Logo />
          <div className="flex items-center gap-1">
            <Bell />
            <Logout small />
          </div>
        </div>
        {/* Row 2 — group meta (centered) */}
        <div className="flex items-center justify-center gap-2 pb-2 -mt-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 truncate">{GROUP}</h1>
          <CurrencyPill />
        </div>
        <div className="pb-2">
          <button
            onClick={copy}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100"
          >
            {copied ? '✓ Copied!' : '🔗 Share invite'}
          </button>
        </div>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Variant B — Title-first: big group name + currency on row 1 (with  */
/* back arrow), chrome (bell/logout) tucked right; Share invite pill   */
/* full-width on row 2. Name gets the most prominence.                */
/* ------------------------------------------------------------------ */
function VariantB() {
  const { copied, copy } = useCopy(INVITE);
  return (
    <nav className="bg-white shadow-sm">
      <div className="px-3">
        <div className="flex items-center justify-between h-14 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Back />
            <h1 className="text-lg font-bold text-gray-900 truncate">{GROUP}</h1>
            <CurrencyPill />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Bell />
            <Logout small />
          </div>
        </div>
        <div className="pb-2 -mt-1">
          <button
            onClick={copy}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100"
          >
            {copied ? '✓ Copied!' : '🔗 Share invite link'}
          </button>
        </div>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Variant C — Three tidy rows, max breathing room. Row1: back+logo+  */
/* chrome. Row2: group name + currency (centered emphasis). Row3:     */
/* Share invite with the actual URL shown (grey) + copy.              */
/* ------------------------------------------------------------------ */
function VariantC() {
  const { copied, copy } = useCopy(INVITE);
  return (
    <nav className="bg-white shadow-sm">
      <div className="px-3">
        <div className="flex items-center justify-between h-11">
          <Back />
          <Logo />
          <div className="flex items-center gap-1">
            <Bell />
            <Logout small />
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 pb-1">
          <h1 className="text-lg font-bold text-gray-900 truncate">{GROUP}</h1>
          <CurrencyPill />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <button
            onClick={copy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shrink-0"
          >
            {copied ? '✓' : '🔗 Share'}
          </button>
          <span className="text-xs text-gray-500 truncate">{INVITE}</span>
        </div>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Variant D — Compact two-row, right-aligned chrome kept tiny so     */
/* the name row can be tall/bold. Share invite is a subtle text link  */
/* + copy icon on row 2 next to currency (densest, least vertical).   */
/* ------------------------------------------------------------------ */
function VariantD() {
  const { copied, copy } = useCopy(INVITE);
  return (
    <nav className="bg-white shadow-sm">
      <div className="px-3">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-2 min-w-0">
            <Back />
            <h1 className="text-xl font-bold text-gray-900 truncate">{GROUP}</h1>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Bell />
            <Logout small />
          </div>
        </div>
        <div className="flex items-center justify-between pb-2 -mt-1">
          <CurrencyPill />
          <button
            onClick={copy}
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            {copied ? '✓ Copied!' : '🔗 Share invite'}
          </button>
        </div>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
function PhoneFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-gray-700">{label}</div>
      <div className="mx-auto w-[360px] rounded-[2rem] border-8 border-gray-800 bg-gray-50 overflow-hidden shadow-lg">
        {/* fake status bar */}
        <div className="flex items-center justify-between px-4 py-1 bg-gray-800 text-white text-[10px]">
          <span>4:04</span>
          <span>📶 📡 🔋70%</span>
        </div>
        {children}
        {/* hint of page body so you see how much vertical space the bar eats */}
        <div className="p-3">
          <div className="rounded-lg bg-blue-600 text-white p-4">
            <div className="text-[10px] uppercase tracking-wide opacity-80">Total group expenses</div>
            <div className="text-2xl font-bold">923.39 {CURRENCY}</div>
          </div>
          <div className="mt-3 flex gap-4 text-sm">
            <span className="font-semibold text-blue-600 border-b-2 border-blue-600 pb-1">Expenses</span>
            <span className="text-gray-500">Balances</span>
            <span className="text-gray-500">Members</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TopbarPlayground() {
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Top Navbar (portrait phone) — Design Playground</h1>
          <p className="mt-1 text-gray-600">
            Direction: <b>two-row stacked</b> so the group name, currency, and Share invite stop
            fighting for one 64px row. Four flavors below, each in a 360px phone frame. Open this on
            your phone, tap through, tell me the letter. Share invite buttons really copy.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <PhoneFrame label="A ⭐ CHOSEN — chrome on top, CENTERED name + currency, full-width Share invite below">
            <VariantA />
          </PhoneFrame>
          <PhoneFrame label="B — Name+currency lead row, full-width Share invite below (RECOMMENDED)">
            <VariantB />
          </PhoneFrame>
          <PhoneFrame label="C — Three tidy rows, Share shows the real URL">
            <VariantC />
          </PhoneFrame>
          <PhoneFrame label="D — Densest: big name row, currency + text Share link below">
            <VariantD />
          </PhoneFrame>
        </div>

        <footer className="mt-8 text-center text-sm text-gray-500">
          Pick a letter → A (chrome-first) · B (name-first, RECOMMENDED) · C (3-row + URL) · D (dense).
          Desktop keeps the current single-row layout; these only kick in on narrow screens.
        </footer>
      </div>
    </div>
  );
}
