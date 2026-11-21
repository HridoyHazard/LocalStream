import type { MediaKind } from '@/lib/media/types';

/**
 * Playback progress is stored locally (per browser). It deliberately does not
 * require accounts: this is a single-household, privacy-first app.
 *
 * Records are keyed by title id. For series, the latest episode watched is
 * stored on the parent record so "Continue watching" stays a single card.
 */
export interface ProgressRecord {
  titleId: string;
  title: string;
  kind: MediaKind;
  year: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  path: string;
  extension: string;
  episodeId: string | null;
  season: number | null;
  episode: number | null;
  currentTime: number;
  duration: number;
  completed: boolean;
  updatedAt: number;
}

const STORAGE_KEY = 'localstream.progress.v2';
const MAX_RECORDS = 60;
const CHANGE_EVENT = 'localstream:progress';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readAll(): Record<string, ProgressRecord> {
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, ProgressRecord>;
  } catch {
    return {};
  }
}

function writeAll(records: Record<string, ProgressRecord>) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Storage can be unavailable in private windows or when the quota is full.
  }
}

export function getProgress(titleId: string): ProgressRecord | undefined {
  return readAll()[titleId];
}

export function saveProgress(record: Omit<ProgressRecord, 'completed' | 'updatedAt'> & { completed?: boolean }) {
  if (!canUseStorage()) return;
  if (!Number.isFinite(record.currentTime) || record.currentTime < 1) return;

  // Keep finished titles in history instead of deleting the record, but mark
  // them so "Continue watching" can skip anything already completed.
  const finished =
    record.completed === true ||
    (record.duration > 0 && record.currentTime > Math.max(record.duration - 8, record.duration * 0.995));

  const records = readAll();
  records[record.titleId] = {
    ...records[record.titleId],
    ...record,
    completed: finished,
    updatedAt: Date.now(),
  };
  const trimmed = Object.fromEntries(
    Object.entries(records)
      .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_RECORDS),
  );
  writeAll(trimmed);
}

export function removeProgress(titleId: string) {
  if (!canUseStorage()) return;
  const records = readAll();
  if (!records[titleId]) return;
  delete records[titleId];
  writeAll(records);
}

export function clearProgress() {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Ignore storage failures.
  }
}

export function getContinueWatching(): ProgressRecord[] {
  return Object.values(readAll())
    .filter((record) => {
      if (!record?.path || record.completed) return false;
      if (!Number.isFinite(record.currentTime) || record.currentTime < 10) return false;
      if (record.duration > 0) return record.currentTime < record.duration * 0.96;
      return true;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 20);
}

export function getHistory(): ProgressRecord[] {
  return Object.values(readAll())
    .filter((record) => record?.path && record.currentTime > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProgressRatio(record: Pick<ProgressRecord, 'currentTime' | 'duration'>) {
  if (!record.duration || !Number.isFinite(record.duration) || record.duration <= 0) return 0;
  return Math.max(0, Math.min(1, record.currentTime / record.duration));
}

export function subscribeToProgress(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}
