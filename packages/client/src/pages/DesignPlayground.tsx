import { useState } from 'react';
import DateWheelPicker from '../components/DateWheelPicker';

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEKDAYS = ['S','M','T','W','T','F','S']; // Sunday-start (US / Google style)

function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function pretty(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
}
function daysInMonth(y: number, m1: number) {
  return new Date(y, m1, 0).getDate();
}
function shiftDays(value: string, delta: number): string {
  const d = new Date(value + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  const p = (n: number) => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ------------------------------------------------------------------ */
/* Option B — Calendar grid (Google-Docs style)                        */
/* ------------------------------------------------------------------ */
function CalendarGrid({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const init = value || todayLocal();
  const [view, setView] = useState(() => {
    const [y, m] = init.split('-').map(Number);
    return { y, m };
  });

  const firstWeekday = new Date(view.y, view.m - 1, 1).getDay(); // 0=Sun
  const total = daysInMonth(view.y, view.m);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);

  const prev = () => setView((v) => (v.m === 1 ? { y: v.y - 1, m: 12 } : { y: v.y, m: v.m - 1 }));
  const next = () => setView((v) => (v.m === 12 ? { y: v.y + 1, m: 1 } : { y: v.y, m: v.m + 1 }));

  return (
    <div className="w-72 select-none rounded-lg border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button onClick={prev} className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100">‹</button>
        <div className="font-semibold text-gray-800">{MONTHS[view.m - 1]} {view.y}</div>
        <button onClick={next} className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100">›</button>
      </div>
      <div className="mb-1 grid grid-cols-7 text-center text-xs font-medium text-gray-400">
        {WEEKDAYS.map((w, i) => <div key={i}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const iso = `${view.y}-${String(view.m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const selected = iso === (value || todayLocal());
          return (
            <button
              key={i}
              onClick={() => onChange(iso)}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm tabular-nums transition ${
                selected ? 'bg-blue-600 font-bold text-white' : 'text-gray-700 hover:bg-blue-50'
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
function Card({
  id, title, blurb, bestFor, children, value,
}: {
  id: string; title: string; blurb: string; bestFor: string; children: React.ReactNode; value: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-blue-700">
          {id}
        </span>
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      </div>
      <p className="mb-1 text-sm text-gray-500">{blurb}</p>
      <p className="mb-3 text-xs font-medium text-emerald-600">Best for: {bestFor}</p>
      <div className="flex min-h-[12rem] items-center justify-center rounded-lg bg-gray-50 p-4">
        {children}
      </div>
      <p className="mt-3 text-center text-sm text-gray-600">
        Selected: <span className="font-semibold text-gray-900">{pretty(value)}</span>
        <span className="ml-2 font-mono text-xs text-gray-400">({value})</span>
      </p>
    </div>
  );
}

export default function DesignPlayground() {
  const [a, setA] = useState(todayLocal());
  const [b, setB] = useState(todayLocal());
  const [c, setC] = useState(todayLocal());
  const [d, setD] = useState(todayLocal());

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Expense Date Picker — Design Playground</h1>
          <p className="mt-1 text-gray-600">
            Four distinct approaches kept here for future recall. The crew chose <span className="font-semibold text-emerald-600">Option C (Native Input)</span>,
            now live in the Add/Edit Expense form. Try each prototype below — if we ever want to switch,
            the alternatives are ready to drop back in. Default for all is today (client local).
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* OPTION A — WHEEL */}
          <Card
            id="Option A"
            title="Scroll Wheel"
            blurb="Three snap-scroll columns (Day · Month · Year). Native feel on phones, custom-built so it looks identical everywhere."
            bestFor="Phone-first apps that want a consistent branded spinner"
            value={a}
          >
            <DateWheelPicker value={a} onChange={setA} />
          </Card>

          {/* OPTION B — CALENDAR */}
          <Card
            id="Option B"
            title="Calendar Grid"
            blurb="Month view with weekday headers; click any day, arrow through months. The familiar Google-Docs / native-calendar layout."
            bestFor="Desktop + touch; quick 'see the whole month' selection"
            value={b}
          >
            <CalendarGrid value={b} onChange={setB} />
          </Card>

          {/* OPTION C — NATIVE DESKTOP */}
          <Card
            id="Option C"
            title="Native Input (Industry Standard)"
            blurb="The browser's built-in native date input. Renders as a calendar popup on desktop, zero custom code, matches every other website."
            bestFor="Fastest to ship; least surprising for desktop users"
            value={c}
          >
            <input
              type="date"
              value={c}
              onChange={(e) => setC(e.target.value)}
              className="block rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </Card>

          {/* OPTION D — MOBILE NATIVE + QUICK TAPS */}
          <Card
            id="Option D"
            title="Mobile-Native + Quick Taps"
            blurb="Full-width native date control styled for big thumbs, plus one-tap chips (Today / Yesterday / −7d). On phones the OS shows its own wheel."
            bestFor="Easiest one-handed entry on phone"
            value={d}
          >
            <div className="flex w-72 flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {[['Today', 0], ['Yesterday', -1], ['−7d', -7]].map(([label, delta]) => (
                  <button
                    key={label as string}
                    onClick={() => setD(shiftDays(todayLocal(), delta as number))}
                    className="rounded-full bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                type="date"
                value={d}
                onChange={(e) => setD(e.target.value)}
                className="h-14 w-full rounded-lg border border-gray-300 px-4 text-lg shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </Card>
        </div>

        <footer className="mt-8 text-center text-sm text-gray-500">
          Current choice: <span className="font-semibold text-emerald-600">C — Native Input</span> (live in the form).
          Others (A wheel · B calendar · D mobile+taps) retained here for future recall.
        </footer>
      </div>
    </div>
  );
}
