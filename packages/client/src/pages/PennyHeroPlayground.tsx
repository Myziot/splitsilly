import { useState } from 'react';

/* ============================================================
   PENNY HERO PLAYGROUND — design artifact (2026-09-27)
   Four treatments for the "rounding absorbed" footer on the
   "Who paid cash" card. Each is fully interactive (Shuffle
   rotates the joke line). Winner gets wired into
   PaidCashSummary.tsx. Page stays live at /penny-hero-playground.
   ============================================================ */

interface Hero { name: string; cents: number; color: string }

// Mock: the multi-hero case so ranking treatments are judgeable.
// (Skull Cove's real case is a single hero: Captain 4¢.)
const HEROES: Hero[] = [
  { name: 'Captain', cents: 4, color: '#6366f1' },
  { name: 'Polly', cents: 3, color: '#10b981' },
  { name: 'Sailor', cents: 1, color: '#f59e0b' },
];
const TOTAL = HEROES.reduce((a, h) => a + h.cents, 0);

const JOKES = [
  'took one for the team.',
  'ate the pennies so you don’t have to.',
  'one small cent for humankind.',
  'no capes, just cents.',
  'absorbed the chaos so you owe clean.',
  'math’s bodyguard.',
  'selfless. heroic. slightly coppery.',
];

const jokeFor = (name: string, offset: number) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return JOKES[(h + offset) % JOKES.length];
};

/* --- shared mini mock of the "Who paid cash" card so the footer's
   surroundings are judgeable (title + one gradient row) --- */
function CardMock({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm font-mono">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">Who paid cash</h3>
        <span className="text-xs text-gray-400">out of 376.72 USD</span>
      </div>
      <ol className="mt-2 space-y-1">
        <li className="relative overflow-hidden rounded-lg px-3 py-2 bg-gradient-to-r from-indigo-500/70 to-indigo-700/30">
          <div className="absolute inset-y-0 left-0 bg-white/20" style={{ width: '100%' }} />
          <div className="relative flex items-center justify-between">
            <span className="flex items-center gap-2 font-medium text-white">
              <span className="font-bold text-indigo-200">1.</span>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#6366f1' }} />
              Captain
            </span>
            <span className="tabular-nums rounded-md px-2 py-0.5 text-xs font-bold text-white" style={{ background: '#4f46e5' }}>
              376.72 USD
            </span>
          </div>
        </li>
      </ol>
      {children}
    </div>
  );
}

/* --- inline SVGs (stroke icons, inherit color) --- */
const Shield = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" /><path d="M9 12l2 2 4-4" />
  </svg>
);
const Crown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 17l-1-9 6 5 4-8 4 8 6-5-1 9H3z" /><path d="M3 21h18" />
  </svg>
);
const Coin = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5c0-1 1-1.7 2.5-1.7s2.5.7 2.5 1.7c0 2.4-5 1.4-5 3.7 0 1 1 1.8 2.5 1.8s2.5-.8 2.5-1.8" />
  </svg>
);
const Cape = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3c-4 3-7 4-8 5 1 6 3 10 4 13l4-4 4 4c1-3 3-7 4-13-1-1-4-2-8-5z" />
  </svg>
);

function ShuffleBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="ml-2 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] text-gray-500 hover:bg-gray-50">
      shuffle jokes
    </button>
  );
}

/* ---------- A: Penny Patriot ribbon ---------- */
function VariantA({ offset }: { offset: number }) {
  return (
    <CardMock>
      <div className="mt-2 rounded-lg border border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className="inline-flex items-center gap-1 font-bold text-amber-600"><Shield /> PENNY PATRIOTS</span>
          {HEROES.map((h) => (
            <span key={h.name} className="text-gray-600">
              <b className="text-gray-900">{h.name}</b> absorbed <b className="tabular-nums text-amber-700">{h.cents}¢</b>
              <span className="italic text-gray-400"> — {jokeFor(h.name, offset)}</span>
              {'  '}
            </span>
          ))}
        </div>
      </div>
    </CardMock>
  );
}

/* ---------- B: Hall of Fame banner ---------- */
function VariantB({ offset }: { offset: number }) {
  return (
    <CardMock>
      <div className="mt-2 overflow-hidden rounded-lg border border-indigo-300">
        <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-amber-500 px-3 py-1.5 text-[10px] font-bold tracking-widest text-white">
          ⛁ ROUNDING HALL OF FAME
        </div>
        <ul className="divide-y divide-gray-100 bg-white">
          {HEROES.map((h, i) => (
            <li key={h.name} className="flex items-center gap-2 px-3 py-1.5">
              <span className="text-amber-500"><Crown /></span>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: h.color }} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-900">
                  {h.name} <span className="font-normal italic text-gray-500">{jokeFor(h.name, offset)}</span>
                </p>
              </div>
              <span className="tabular-nums rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                {i === 0 ? 'MVP · ' : ''}{h.cents}¢
              </span>
            </li>
          ))}
        </ul>
        <div className="bg-gray-50 px-3 py-1 text-right text-[10px] text-gray-400">
          {TOTAL}¢ of rounding, heroically absorbed
        </div>
      </div>
    </CardMock>
  );
}

/* ---------- C: coin ticker one-liner ---------- */
function VariantC({ offset }: { offset: number }) {
  const top = HEROES[0];
  return (
    <CardMock>
      <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-gray-100 pt-2 text-[11px]">
        <span className="inline-flex items-center gap-1 text-gray-400"><span className="text-amber-500"><Coin /></span> rounding absorbed ({TOTAL}¢)</span>
        <span className="truncate text-gray-500">
          <b className="text-gray-700">{top.name}</b> {jokeFor(top.name, offset)}
          {HEROES.slice(1).map((h) => (
            <span key={h.name}> · {h.name} {h.cents}¢</span>
          ))}
        </span>
      </div>
    </CardMock>
  );
}

/* ---------- D: hero chips ---------- */
function VariantD({ offset }: { offset: number }) {
  return (
    <CardMock>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2">
        <span className="text-[10px] uppercase tracking-wide text-gray-400">rounding heroes</span>
        {HEROES.map((h) => (
          <span key={h.name} title={`${h.name} ${jokeFor(h.name, offset)}`}
            className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 py-0.5 pl-1 pr-2 text-[11px] text-amber-800">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-white"><Cape /></span>
            <b>{h.name}</b>
            <span className="tabular-nums">{h.cents}¢</span>
          </span>
        ))}
      </div>
    </CardMock>
  );
}

export default function PennyHeroPlayground() {
  const [offset, setOffset] = useState(0);
  const shuffle = () => setOffset((o) => o + 1);
  const variants = [
    { key: 'A', title: 'A — Penny Patriot ribbon', blurb: 'One warm amber ribbon, compact, joke inline. Louder than today, still one line.', el: <VariantA offset={offset} /> },
    { key: 'B', title: 'B — Hall of Fame banner', blurb: 'Full ceremonial treatment: gradient banner, crowns, MVP chip. Maximum fun, tallest.', el: <VariantB offset={offset} /> },
    { key: 'C', title: 'C — Coin ticker one-liner', blurb: 'Current position/size, but with a coin glyph and the top hero’s joke. Minimal footprint.', el: <VariantC offset={offset} /> },
    { key: 'D', title: 'D — Hero chips', blurb: 'Cape chips per hero, joke on hover/tap-hold. Compact and playful, no extra height.', el: <VariantD offset={offset} /> },
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Make the penny-eater a hero</h1>
      <p className="mt-1 text-sm text-gray-500 select-text">
        Four treatments for the “rounding absorbed” footer inside the real “Who paid cash” card chrome
        (mock: 3 heroes so you can judge ranking). <button type="button" onClick={shuffle}
        className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-100">
        shuffle jokes ⟳</button> rotates every joke line at once — all variants are live.
      </p>
      <div className="mt-6 space-y-10">
        {variants.map((v) => (
          <section key={v.key}>
            <h2 className="text-base font-semibold text-gray-900">
              {v.title}<ShuffleBtn onClick={shuffle} />
            </h2>
            <p className="mb-3 mt-0.5 text-xs text-gray-500 select-text">{v.blurb}</p>
            {v.el}
          </section>
        ))}
      </div>
      <p className="mt-8 text-xs text-gray-400 select-text">
        Authority line: winner gets wired into PaidCashSummary.tsx (both Expenses + Balances tabs — shared component).
        Combos welcome (e.g. “B’s banner, D’s chips”). Joke bank is 7 lines, picked per person by name hash so it’s stable
        between visits; shuffle is playground-only preview. This page stays live at /penny-hero-playground.
      </p>
    </div>
  );
}
