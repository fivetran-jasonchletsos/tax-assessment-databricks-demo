import { useEffect, useState } from 'react';
import * as watchlist from '../watchlist';

export default function WatchlistButton({
  parcelId,
  variant = 'pill',
}: {
  parcelId: string;
  variant?: 'pill' | 'icon';
}) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const unsub = watchlist.subscribe((ids) => setSaved(ids.includes(parcelId)));
    return unsub;
  }, [parcelId]);

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    watchlist.toggle(parcelId);
  };

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={saved ? 'Remove from watchlist' : 'Add to watchlist'}
        title={saved ? 'Saved' : 'Save to watchlist'}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
          saved ? 'text-amber-400 hover:text-amber-300' : 'text-white/60 hover:text-white'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill={saved ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        >
          <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        saved
          ? 'bg-amber-500/20 text-amber-100 hover:bg-amber-500/30'
          : 'bg-white/10 hover:bg-white/20 text-white'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill={saved ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      >
        <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
      </svg>
      {saved ? 'On watchlist' : 'Add to watchlist'}
    </button>
  );
}
