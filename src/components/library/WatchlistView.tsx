'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bookmark, LoaderCircle, RefreshCw } from 'lucide-react';
import type { TitleSummary } from '@/lib/media/types';
import { useApi } from '@/lib/use-api';
import { getWatchlist, removeFromWatchlist, subscribeToWatchlist, type WatchlistEntry } from '@/lib/watchlist';
import { getProgressRatio, subscribeToProgress, getProgress } from '@/lib/watch-progress';
import PageHeader from '@/components/ui/PageHeader';
import MediaCard from '@/components/media/MediaCard';
import { MediaGridSkeleton } from '@/components/media/Skeletons';
import EmptyState from '@/components/ui/EmptyState';
import { formatCount } from '@/lib/utils';

interface TitlesByIdResponse {
  items: TitleSummary[];
  total: number;
}

export default function WatchlistView() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [progressMap, setProgressMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const read = () => {
      setEntries(getWatchlist());
      setReady(true);
    };
    read();
    return subscribeToWatchlist(read);
  }, []);

  useEffect(() => {
    const read = () => {
      const map = new Map<string, number>();
      for (const entry of entries) {
        const record = getProgress(entry.id);
        if (record) map.set(entry.id, getProgressRatio(record));
      }
      setProgressMap(map);
    };
    read();
    return subscribeToProgress(read);
  }, [entries]);

  const ids = useMemo(() => entries.map((entry) => entry.id), [entries]);
  const path = ids.length
    ? `/api/titles?ids=${ids.map((id) => encodeURIComponent(id)).join(',')}`
    : null;
  const { data, loading, error, refresh } = useApi<TitlesByIdResponse>(path, { listenForRefresh: false });

  const items = data?.items ?? [];
  const missing = ids.length - items.length;

  return (
    <div>
      <PageHeader
        eyebrow="Your personal queue"
        title="My list"
        description="Everything you saved for later. Your list lives in this browser, so it stays private and works without an account."
        statValue={entries.length ? entries.length.toLocaleString() : '0'}
        statLabel="Saved titles"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip !h-8">
            <Bookmark className="h-3 w-3 text-accent-300" />
            {formatCount(entries.length, 'title')}
          </span>
          <span className="chip !h-8">Stored on this device</span>
        </div>
      </PageHeader>

      <div className="container-page py-9 sm:py-11">
        {!ready ? (
          <MediaGridSkeleton count={10} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title="Your list is empty"
            description="Save films and series with the bookmark button on any poster. They will appear here, ready whenever you are."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/movies" className="btn btn-primary">
                  Browse movies
                </Link>
                <Link href="/series" className="btn btn-ghost">
                  Browse series
                </Link>
              </div>
            }
          />
        ) : loading && items.length === 0 ? (
          <MediaGridSkeleton count={Math.min(Math.max(entries.length, 4), 12)} />
        ) : error ? (
          <EmptyState
            icon={RefreshCw}
            title="Your list could not be loaded"
            description={`LocalStream could not read title details from the library index (${error}). Your saved list is safe; retry when the server is available.`}
            action={
              <button type="button" onClick={() => void refresh()} className="btn btn-primary">
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title="Saved titles are no longer in the library"
            description="The titles on your list are not in the current index. A new scan may bring them back."
            action={
              <button type="button" onClick={() => void refresh()} className="btn btn-ghost">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            }
          />
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[0.7rem] font-medium text-white/35">
                {formatCount(items.length, 'title')} in your list
                {loading ? <span className="ml-2 text-white/20">refreshing…</span> : null}
              </p>
              {missing > 0 ? (
                <p className="text-[0.62rem] font-medium text-amber-200/60">
                  {missing} saved title{missing === 1 ? '' : 's'} missing from the current scan
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-x-3.5 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-5 lg:gap-y-9 xl:grid-cols-6">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="animate-fade-up"
                  style={{ animationDelay: `${Math.min(index, 12) * 26}ms` }}
                >
                  <MediaCard
                    item={item}
                    progress={progressMap.get(item.id)}
                    onRemove={() => removeFromWatchlist(item.id)}
                  />
                </div>
              ))}
            </div>

            <div className="mt-10 flex items-center justify-center gap-2 text-[0.62rem] font-medium text-white/25">
              <LoaderCircle className={loading ? 'h-3 w-3 animate-spin' : 'hidden'} />
              Saved locally · no account required
            </div>
          </>
        )}
      </div>
    </div>
  );
}
