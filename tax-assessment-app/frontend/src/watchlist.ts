// ============================================================
// Watchlist — localStorage-backed favorites with a tiny pub/sub
// so any mounted component re-renders when the list changes.
// ============================================================

const KEY = 'tax-portal:watchlist';

const listeners = new Set<(ids: string[]) => void>();

export function getWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function save(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
  listeners.forEach((fn) => fn(ids));
}

export function add(parcelId: string) {
  const ids = getWatchlist();
  if (ids.includes(parcelId)) return;
  save([parcelId, ...ids]);
}

export function remove(parcelId: string) {
  save(getWatchlist().filter((id) => id !== parcelId));
}

export function toggle(parcelId: string) {
  const ids = getWatchlist();
  if (ids.includes(parcelId)) remove(parcelId);
  else add(parcelId);
}

export function has(parcelId: string): boolean {
  return getWatchlist().includes(parcelId);
}

export function subscribe(fn: (ids: string[]) => void): () => void {
  listeners.add(fn);
  fn(getWatchlist());
  return () => listeners.delete(fn);
}
