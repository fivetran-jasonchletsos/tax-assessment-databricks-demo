import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatCurrency } from '../api/queries';
import * as watchlist from '../watchlist';
import type { ParcelSearchResult } from '../types';

export default function WatchlistPage() {
  const [ids, setIds] = useState<string[]>([]);
  const [parcels, setParcels] = useState<Record<string, ParcelSearchResult>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = watchlist.subscribe(setIds);
    return unsub;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .searchParcels({ limit: 5000 })
      .then((r) => {
        if (cancelled) return;
        const byId: Record<string, ParcelSearchResult> = {};
        for (const p of r.results) byId[p.parcel_id] = p;
        setParcels(byId);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const items = ids.map((id) => ({ id, parcel: parcels[id] })).filter((x) => x.parcel);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-3 py-1 text-xs font-medium uppercase tracking-wider mb-3">
          ★ Watchlist
        </div>
        <h1 className="text-3xl font-bold text-slate-900">Saved properties</h1>
        <p className="text-sm text-slate-500 mt-1">
          {ids.length === 0
            ? "You haven't saved any parcels yet."
            : `${ids.length} ${ids.length === 1 ? 'parcel' : 'parcels'} saved in this browser. Watchlist is local — clearing site data removes it.`}
        </p>
      </header>

      {ids.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <div className="text-slate-700 font-medium">Nothing here yet.</div>
          <p className="text-sm text-slate-500 mt-1">
            Open a parcel and click <strong>"Add to watchlist"</strong> in the header to save it.
          </p>
          <Link
            to="/search"
            className="mt-4 inline-block rounded-md bg-primary-700 hover:bg-primary-800 text-white text-sm font-medium px-4 py-2"
          >
            Browse properties
          </Link>
        </div>
      ) : loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          Your saved parcels aren't in the current snapshot. They may have been removed when the dataset
          was refreshed. <button onClick={() => ids.forEach(watchlist.remove)} className="font-medium underline">Clear watchlist</button>.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(({ id, parcel }) => (
            <Link
              key={id}
              to={`/parcels/${encodeURIComponent(id)}`}
              className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-primary-300 transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="text-xs font-mono text-slate-500 truncate">{parcel.parcel_id}</div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    watchlist.remove(id);
                  }}
                  className="text-xs text-slate-400 hover:text-rose-600"
                  title="Remove from watchlist"
                  aria-label="Remove from watchlist"
                >
                  ✕
                </button>
              </div>
              <div className="font-semibold text-slate-900">{parcel.address}</div>
              <div className="text-sm text-slate-500">
                {parcel.city}, PA {parcel.zip_code}
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-lg font-bold text-primary-700">
                  {formatCurrency(parcel.assessed_value)}
                </span>
                <ChangeChip pct={parcel.assessed_value_change_pct} />
              </div>
              <div className="mt-1 text-xs text-slate-400 truncate">{parcel.land_use_description}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ChangeChip({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) return null;
  const up = pct >= 0;
  return (
    <span
      className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
        up ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
      }`}
    >
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}
