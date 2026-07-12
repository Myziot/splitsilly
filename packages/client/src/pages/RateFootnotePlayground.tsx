import { useEffect, useState } from 'react';
import CurrencyBadge from '../components/CurrencyBadge';
import { fetchUsdRates, buildFootnoteCurrencies, formatRate, type UsdRates } from '../lib/rates';

/* ------------------------------------------------------------------ */
/* Rate Footnote — Design Playground                                   */
/* 4 distinct ways to show live USD exchange rates in a footline.      */
/* Live data from Frankfurter (same as the real footer). Selectable /  */
/* copy-able. Pick a variant, then we wire it into the real footer.    */
/* ------------------------------------------------------------------ */

const GROUP_CURRENCY = 'EUR'; // pretend group currency, to show the +group row

function useRates() {
  const [data, setData] = useState<UsdRates | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchUsdRates()
      .then((d) => !cancelled && setData(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}

// Phone frame so it reads like the real app on a phone.
function PhoneFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-xs font-semibold text-gray-500 mb-1">{label}</div>
      <div className="w-[360px] min-h-[520px] bg-gray-50 border border-gray-200 rounded-2xl shadow-sm flex flex-col">
        {/* Fake app body so the footer sits at the bottom like reality */}
        <div className="flex-1 p-4 flex flex-col justify-end">
          <div className="text-center text-gray-300 text-sm select-none">app content…</div>
        </div>
        <div className="border-t border-gray-100 bg-white">{children}</div>
      </div>
    </div>
  );
}

/* ---- Variant A: rate number leads, pill is the tag ---------------- */
function VariantA({ data }: { data: UsdRates }) {
  const pairs = buildFootnoteCurrencies(GROUP_CURRENCY).filter((c) => c !== 'USD');
  return (
    <div className="px-3 py-3 text-sm text-gray-600 select-text">
      <div className="font-medium text-gray-500 mb-1">1 USD =</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {pairs.map((c) => (
          <span key={c} className="inline-flex items-center gap-1">
            <span className="tabular-nums font-medium text-gray-800">{formatRate(data.rates[c] ?? NaN)}</span>
            <CurrencyBadge code={c} />
          </span>
        ))}
      </div>
      <div className="text-xs text-gray-400 mt-1">rates as of {data.date}</div>
    </div>
  );
}

/* ---- Variant B: pill leads, number follows ------------------------ */
function VariantB({ data }: { data: UsdRates }) {
  const pairs = buildFootnoteCurrencies(GROUP_CURRENCY).filter((c) => c !== 'USD');
  return (
    <div className="px-3 py-3 text-sm select-text">
      <div className="font-medium text-gray-500 mb-1">1 USD =</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
        {pairs.map((c) => (
          <span key={c} className="inline-flex items-center gap-1">
            <CurrencyBadge code={c} />
            <span className="tabular-nums font-medium text-gray-800">{formatRate(data.rates[c] ?? NaN)}</span>
          </span>
        ))}
      </div>
      <div className="text-xs text-gray-400 mt-1">rates as of {data.date}</div>
    </div>
  );
}

/* ---- Variant C: number inside the colored pill -------------- */
// (Chosen style.) Two aligned columns; EUR/GBP/JPY get a flag icon,
// CHF/CAD/PLN show ticker only.
const ICON_CURRENCIES = new Set(['EUR', 'GBP', 'JPY']);
function VariantC({ data }: { data: UsdRates }) {
  const pairs = buildFootnoteCurrencies(GROUP_CURRENCY).filter((c) => c !== 'USD');
  return (
    <div className="px-3 py-3 text-sm select-text">
      <div className="font-medium text-gray-500 mb-1">1 USD =</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-left">
        {pairs.map((c) => (
          <div key={c} className="flex items-center gap-2 tabular-nums">
            <span className="font-medium text-gray-800 w-14 text-right">
              {formatRate(data.rates[c] ?? NaN)}
            </span>
            <CurrencyBadge code={c} showSymbol={ICON_CURRENCIES.has(c)} />
          </div>
        ))}
      </div>
      <div className="text-xs text-gray-400 mt-1">rates as of {data.date}</div>
    </div>
  );
}

/* ---- Variant D: compact grid / table ------------------------------ */
function VariantD({ data }: { data: UsdRates }) {
  const pairs = buildFootnoteCurrencies(GROUP_CURRENCY).filter((c) => c !== 'USD');
  return (
    <div className="px-3 py-3 text-sm select-text">
      <div className="font-medium text-gray-500 mb-1">Live rates · 1 USD =</div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-1">
        {pairs.map((c) => (
          <div key={c} className="flex items-center justify-between gap-1">
            <CurrencyBadge code={c} />
            <span className="tabular-nums font-medium text-gray-800 text-right">{formatRate(data.rates[c] ?? NaN)}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-gray-400 mt-1">as of {data.date}</div>
    </div>
  );
}

export default function RateFootnotePlayground() {
  const data = useRates();

  return (
    <div className="min-h-screen bg-white p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Rate Footnote — 4 display variants</h1>
      <p className="text-sm text-gray-500 mb-6">
        Live data (Frankfurter). Group currency shown as EUR to demonstrate the +group row.
        All are selectable &amp; copy-able. Pick one and we'll wire it into the real footer.
      </p>

      {!data ? (
        <div className="text-gray-400">Loading live rates…</div>
      ) : (
        <div className="flex flex-wrap gap-8">
          <PhoneFrame label="A — rate leads, pill is tag">
            <VariantA data={data} />
          </PhoneFrame>
          <PhoneFrame label="B — pill leads, number follows">
            <VariantB data={data} />
          </PhoneFrame>
          <PhoneFrame label="C — number inside the pill">
            <VariantC data={data} />
          </PhoneFrame>
          <PhoneFrame label="D — compact grid">
            <VariantD data={data} />
          </PhoneFrame>
        </div>
      )}
    </div>
  );
}
