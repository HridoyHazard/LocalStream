'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Film,
  HardDrive,
  Layers,
  RefreshCw,
  ServerOff,
  Tv,
  WifiOff,
  Zap,
} from 'lucide-react';
import type { HomeResponse } from '@/lib/media/types';
import { useApi } from '@/lib/use-api';
import { apiPost } from '@/lib/api';
import { formatBytes } from '@/lib/media-links';
import {
  clearProgress,
  getContinueWatching,
  removeProgress,
  subscribeToProgress,
  type ProgressRecord,
} from '@/lib/watch-progress';
import Hero from '@/components/home/Hero';
import MediaRow from '@/components/media/MediaRow';
import ContinueWatchingRail from '@/components/home/ContinueWatchingRail';
import { MediaRowSkeleton } from '@/components/media/Skeletons';
import EmptyState from '@/components/ui/EmptyState';
import StatusPill from '@/components/ui/StatusPill';
import { cn } from '@/lib/utils';

const features = [
  {
    icon: Zap,
    title: 'Instant seeking',
    description: 'HTTP range requests scrub straight to any point in the film.',
  },
  {
    icon: HardDrive,
    title: 'Original quality',
    description: 'Files stream directly from disk with no transcoding.',
  },
];

function scanMessage(data: HomeResponse) {
  const scan = data.scan;
  if (scan.running) {
    return `Indexing ${scan.scannedDirs.toLocaleString()} folders · ${scan.discoveredFiles.toLocaleString()} files found`;
  }
  if (scan.phase === 'error') return scan.message ?? 'The media server could not be reached.';
  return null;
}

export default function HomeView() {
  const { data, error, loading, refresh, refreshing } = useApi<HomeResponse>('/api/home');
  const [continueWatching, setContinueWatching] = useState<ProgressRecord[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const read = () => setContinueWatching(getContinueWatching());
    read();
    return subscribeToProgress(read);
  }, []);

  const stats = data?.stats;
  const online = Boolean(stats && stats.titles > 0) && !error;

  const handleRemoveContinue = useCallback((titleId: string) => {
    removeProgress(titleId);
    setContinueWatching((records) => records.filter((record) => record.titleId !== titleId));
  }, []);

  const handleClearContinue = useCallback(() => {
    clearProgress();
    setContinueWatching([]);
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      await apiPost('/api/scan');
      window.setTimeout(() => window.dispatchEvent(new Event('localstream:refresh')), 1200);
    } catch {
      // The banner will show the scan error on the next refresh.
    } finally {
      window.setTimeout(() => setSyncing(false), 1600);
    }
  }, []);

  const message = data ? scanMessage(data) : error;
  const scanRunning = Boolean(data?.scan.running);

  const statCards = useMemo(
    () => [
      { label: 'Titles', value: stats?.titles.toLocaleString() ?? '—', icon: Layers, href: '/search' },
      { label: 'Movies', value: stats?.movies.toLocaleString() ?? '—', icon: Film, href: '/movies' },
      { label: 'Series', value: stats?.series.toLocaleString() ?? '—', icon: Tv, href: '/series' },
      { label: 'Library size', value: formatBytes(stats?.totalSize), icon: HardDrive, href: '/genres' },
    ],
    [stats],
  );

  return (
    <div className="container-page py-4 sm:py-6">
      <div className="space-y-7 sm:space-y-9">
        <Hero items={data?.hero ?? []} loading={loading && !data} online={online} />

        {!loading && !data && (
          <EmptyState
            icon={ServerOff}
            title="The library could not be loaded"
            description={
              error
                ? `LocalStream could not reach the media server (${error}). Check that the ISP server is online and MEDIA_SERVER_URL is correct.`
                : 'Start a scan to index movies and series from your local server.'
            }
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button type="button" onClick={() => void refresh()} disabled={refreshing} className="btn btn-primary">
                  <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                  Retry
                </button>
                <button type="button" onClick={() => void sync()} disabled={syncing} className="btn btn-ghost">
                  <Zap className="h-4 w-4" />
                  {syncing ? 'Starting scan…' : 'Scan library'}
                </button>
              </div>
            }
          />
        )}

        {data && message && (
          <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#e50914]/25 bg-[#e50914]/10 text-[#e50914]">
                {scanRunning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <WifiOff className="h-3.5 w-3.5" />}
              </span>
              <div>
                <p className="text-xs font-semibold text-white">
                  {scanRunning ? 'Library scan in progress' : 'Media server notice'}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-400">{message}</p>
                {scanRunning && (
                  <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[10px] font-medium text-neutral-500">
                    <span>{data.scan.scannedDirs.toLocaleString()} folders</span>
                    <span>{data.scan.discoveredFiles.toLocaleString()} videos</span>
                    <span>{data.scan.indexedTitles.toLocaleString()} titles</span>
                    {data.scan.errors > 0 && <span className="text-amber-300/80">{data.scan.errors} errors</span>}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="btn btn-ghost btn-sm shrink-0 self-start sm:self-auto"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              Refresh
            </button>
          </div>
        )}

        {loading && !data ? (
          <>
            <MediaRowSkeleton />
            <MediaRowSkeleton />
          </>
        ) : (
          <>
            {continueWatching.length > 0 && (
              <ContinueWatchingRail
                items={continueWatching}
                onRemove={handleRemoveContinue}
                onClear={handleClearContinue}
              />
            )}

            {data?.sections.map((section) => (
              <MediaRow
                key={section.key}
                eyebrow={section.eyebrow}
                title={section.title}
                items={section.items}
                actionHref={section.href}
              />
            ))}

            {stats ? (
              <section className="space-y-3 border-t border-white/10 pt-6">
                <div className="flex items-end justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-1 rounded-sm bg-[#e50914]" />
                    <h2 className="text-base font-bold tracking-tight text-white sm:text-lg">Your library</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill online={online} loading={loading} />
                    <button
                      type="button"
                      onClick={() => void sync()}
                      disabled={syncing || scanRunning}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-neutral-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                      aria-label="Scan library"
                      title="Scan library"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', (syncing || scanRunning) && 'animate-spin')} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                  {statCards.map((stat) => (
                    <Link
                      key={stat.label}
                      href={stat.href}
                      className="group flex items-center gap-3 rounded-xl border border-white/10 bg-[#151516] px-4 py-3 transition hover:border-[#e50914]/40 hover:bg-[#1a1a1c]"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-neutral-400 transition group-hover:text-[#e50914]">
                        <stat.icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-lg font-bold tabular-nums tracking-tight text-white">
                          {stat.value}
                        </span>
                        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                          {stat.label}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>

                {data.genres.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">Genres</span>
                    {data.genres.slice(0, 10).map((genre) => (
                      <Link key={genre} href={`/movies?genre=${encodeURIComponent(genre)}`} className="chip !h-7 !text-[11px]">
                        {genre}
                      </Link>
                    ))}
                    <Link href="/genres" className="chip !h-7 !text-[11px]">
                      All genres <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                )}

                {data.collections.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">
                      Collections
                    </span>
                    {data.collections.slice(0, 8).map((collection) => (
                      <Link
                        key={collection.name}
                        href={`/movies?category=${encodeURIComponent(collection.name)}`}
                        className="chip !h-7 !text-[11px]"
                      >
                        {collection.name}
                        <span className="text-white/25">{collection.count.toLocaleString()}</span>
                      </Link>
                    ))}
                  </div>
                )}

                <div className="grid gap-2.5 pt-2 sm:grid-cols-2">
                  {features.map((feature) => (
                    <div
                      key={feature.title}
                      className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-3.5"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.045] text-[#e50914]">
                        <feature.icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-white">{feature.title}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-400">{feature.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
