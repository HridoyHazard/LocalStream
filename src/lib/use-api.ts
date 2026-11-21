'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '@/lib/api';

interface UseApiOptions {
  enabled?: boolean;
  /** Refresh when the navbar triggers a library sync. */
  listenForRefresh?: boolean;
}

export function useApi<T>(path: string | null, options: UseApiOptions = {}) {
  const { enabled = true, listenForRefresh = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(enabled && path));
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

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
      if (background) setRefreshing(true);
      else setLoading(true);
      try {
        const result = await apiGet<T>(path, signal);
        if (!mounted.current || signal?.aborted) return;
        setData(result);
        setError(null);
      } catch (cause) {
        if (!mounted.current || signal?.aborted) return;
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'Request failed');
      } finally {
        if (mounted.current && !signal?.aborted) {
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

  return { data, error, loading, refreshing, refresh, setData };
}

export function useDebouncedValue<T>(value: T, delay = 220) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
