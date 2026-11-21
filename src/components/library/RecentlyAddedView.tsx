'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, Clock3, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react';
import type { BrowseResponse, TitleSummary } from '@/lib/media/types';
import { apiGet } from '@/lib/api';
import { getContinueWatching, getProgressRatio, subscribeToProgress } from '@/lib/watch-progress';
import PageHeader from '@/components/ui/PageHeader';
import MediaCard from '@/components/media/MediaCard';
import { MediaGridSkeleton } from '@/components/media/Skeletons';
import EmptyState from '@/components/ui/EmptyState';
import { cn, formatCount } from '@/lib/utils';

const PAGE_SIZE = 48;

function addedLabel(timestamp: number) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 3600) return 'Added just now';
  const hours = Math.round(seconds / 3600);
  if (hours < 24) return `Added ${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `Added ${days}d ago`;
  return `Added ${new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export default function RecentlyAddedView() {
  const [items, setItems] = useState<TitleSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [progressMap, setProgressMap] = useState<Map<string, number>>(new Map());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const read = () => {
      const map = new Map<string, number>();
      for (const record of getContinueWatching()) {
        map.set(record.titleId, getProgressRatio(record));
      }
      setProgressMap(map);
    };
    read();
    return subscribeToProgress(read);
  }, []);

  useEffect(() => {
    const onRefresh = () => setReloadKey((value) => value + 1);
    window.addEventListener('localstream:refresh', onRefresh);
    return () => window.removeEventListener('localstream:refresh', onRefresh);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const id = ++sequence.current;
    setLoading(true);
    setError(null);
    setItems([]);
    setPage(1);
    setHasMore(false);

    apiGet<BrowseResponse>(`/api/titles?sort=recent&pageSize=${PAGE_SIZE}&page=1&facets=false`, controller.signal)
      .then((response) => {
        if (sequence.current !== id) return;
        setItems(response.items);
        setTotal(response.total);
        setPage(response.page);
        setHasMore(response.hasMore);
      })
      .catch((cause) => {
        if (sequence.current !== id || (cause instanceof DOMException && cause.name === 'AbortError')) return;
        setError(cause instanceof Error ? cause.message : 'Could not load recently added titles');
      })
      .finally(() => {
        if (sequence.current === id) setLoading(false);
      });

    return () => controller.abort();
  }, [reloadKey]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const response = await apiGet<BrowseResponse>(
        `/api/titles?sort=recent&pageSize=${PAGE_SIZE}&page=${page + 1}&facets=false`,
      );
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...response.items.filter((item) => !seen.has(item.id))];
      });
      setPage(response.page);
      setHasMore(response.hasMore);
      setTotal(response.total);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loading, loadingMore, page]);

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '700px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loading]);

  return (
    <div>
      <PageHeader
        eyebrow="Fresh on the server"
        title="Recently added"
        description="The newest films and series indexed from your ISP media server, ordered by when they appeared in the library."
        statValue={total ? total.toLocaleString() : '—'}
        statLabel="Titles in the library"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip !h-8">
            <Sparkles className="h-3 w-3 text-accent-300" />
            Newest first
          </span>
          <span className="chip !h-8">
            <Clock3 className="h-3 w-3" />
            {formatCount(items.length, 'title')} loaded
          </span>
        </div>
      </PageHeader>

      <div className="container-page py-9 sm:py-11">
        {error ? (
          <EmptyState
            icon={RefreshCw}
            title="Recently added could not be loaded"
            description={`LocalStream could not read the library index (${error}). Check that the server is running and retry.`}
            action={
              <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="btn btn-primary">
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            }
          />
        ) : loading && items.length === 0 ? (
          <MediaGridSkeleton count={18} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Clock3}
            title="Nothing indexed yet"
            description="Run a library scan to bring titles in from your media server. New additions will appear here automatically."
            action={
              <Link href="/" className="btn btn-primary">
                Back to home
              </Link>
            }
          />
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[0.7rem] font-medium text-white/35">
                {formatCount(total, 'title')} sorted by the moment they were added
              </p>
              <span className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-white/20">
                Newest first
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-3.5 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-5 lg:gap-y-9 xl:grid-cols-6">
              {items.map((item, index) => (
                <div
                  key={`${item.id}-${index}`}
                  className="animate-fade-up"
                  style={{ animationDelay: `${Math.min(index, 12) * 24}ms` }}
                >
                  <MediaCard
                    item={item}
                    progress={progressMap.get(item.id)}
                    metaOverride={addedLabel(item.addedAt)}
                  />
                </div>
              ))}
            </div>

            <div ref={sentinelRef} className="h-px" aria-hidden="true" />

            <div className="mt-10 flex flex-col items-center gap-3">
              {loadingMore ? (
                <span className="inline-flex items-center gap-2 text-[0.72rem] font-semibold text-white/40">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Loading more titles…
                </span>
              ) : hasMore ? (
                <button type="button" onClick={() => void loadMore()} className="btn btn-ghost btn-sm">
                  <ArrowDown className="h-3.5 w-3.5" />
                  Load more
                </button>
              ) : (
                <p className={cn('text-[0.62rem] font-medium uppercase tracking-[0.16em] text-white/20')}>
                  {items.length.toLocaleString()} of {total.toLocaleString()} titles shown
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
