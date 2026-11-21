import type { TitleSummary } from '@/lib/media/types';

export interface WatchlistEntry {
  id: string;
  title: string;
  kind: TitleSummary['kind'];
  year: number | null;
  posterUrl: string | null;
  rating: number | null;
  addedAt: number;
}

const STORAGE_KEY = 'localstream.watchlist.v1';
const CHANGE_EVENT = 'localstream:watchlist';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readAll(): WatchlistEntry[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as WatchlistEntry[]) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: WatchlistEntry[]) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Ignore quota errors.
  }
}

export function getWatchlist(): WatchlistEntry[] {
  return readAll().sort((a, b) => b.addedAt - a.addedAt);
}

export function isInWatchlist(titleId: string) {
  return readAll().some((entry) => entry.id === titleId);
}

export function toggleWatchlist(title: TitleSummary): boolean {
  const entries = readAll();
  const existing = entries.findIndex((entry) => entry.id === title.id);
  if (existing >= 0) {
    entries.splice(existing, 1);
    writeAll(entries);
    return false;
  }
  entries.push({
    id: title.id,
    title: title.title,
    kind: title.kind,
    year: title.year,
    posterUrl: title.posterUrl,
    rating: title.rating,
    addedAt: Date.now(),
  });
  writeAll(entries);
  return true;
}

export function removeFromWatchlist(titleId: string) {
  writeAll(readAll().filter((entry) => entry.id !== titleId));
}

export function subscribeToWatchlist(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}
