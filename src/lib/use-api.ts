'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '@/lib/api';

interface UseApiOptions {
  enabled?: boolean;
  /** Refresh when the navbar triggers a library sync. */
  listenForRefresh?: boolean;
  /** Keep showing the previous result while a new path loads (search-as-you-type). */
  keepPreviousData?: boolean;
}

interface Slot<T> {
  path: string;
  data: T;
}

export function useApi<T>(path: string | null, options: UseApiOptions = {}) {
  const { enabled = true, listenForRefresh = true, keepPreviousData = false } = options;
  const [slot, setSlot] = useState<Slot<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(enabled && path));
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const requestId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal, background = false) => {
      if (!path || !enabled) {
        setLoading(false);
        return;
      }
      const id = ++requestId.current;
      if (background) setRefreshing(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const result = await apiGet<T>(path, signal, { force: background });
        if (!mounted.current || signal?.aborted || id !== requestId.current) return;
        setSlot({ path, data: result });
        setError(null);
      } catch (cause) {
        if (!mounted.current || signal?.aborted || id !== requestId.current) return;
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'Request failed');
      } finally {
        if (mounted.current && !signal?.aborted && id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [path, enabled],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!listenForRefresh) return;
    const onRefresh = () => void load(undefined, true);
    window.addEventListener('localstream:refresh', onRefresh);
    return () => window.removeEventListener('localstream:refresh', onRefresh);
  }, [load, listenForRefresh]);

  const refresh = useCallback(() => load(undefined, true), [load]);

  // Never hand a component data that belongs to a different path.
  const data = slot && (slot.path === path || keepPreviousData) ? slot.data : null;
  // Covers the render between a path change and the effect that starts the request.
  const waiting = Boolean(enabled && path) && slot?.path !== path && error === null;

  const setData = useCallback(
    (value: T | null) => {
      setSlot(value === null || !path ? null : { path, data: value });
    },
    [path],
  );

  return { data, error, loading: loading || waiting, refreshing, refresh, setData };
}

export function useDebouncedValue<T>(value: T, delay = 220) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
