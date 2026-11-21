'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Clock3,
  History,
  Play,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { TitleSummary } from '@/lib/media/types';
import {
  clearProgress,
  getHistory,
  getContinueWatching,
  getProgressRatio,
  removeProgress,
  subscribeToProgress,
  type ProgressRecord,
} from '@/lib/watch-progress';
import { detailsHref, episodeCode, watchHref } from '@/lib/media-links';
import PageHeader from '@/components/ui/PageHeader';
import MediaCard from '@/components/media/MediaCard';
import EmptyState from '@/components/ui/EmptyState';
import Poster from '@/components/media/Poster';
import { formatCount, formatTime } from '@/lib/utils';
function toTitle(record: ProgressRecord): TitleSummary {
  return {
    id: record.titleId,
    kind: record.kind,
    title: record.title,
    year: record.year,
    rating: null,
    voteCount: null,
    runtime: null,
    genres: [],
    overview: null,
    posterUrl: record.posterUrl,
    localPoster: null,
    backdropUrl: record.backdropUrl,
    category: null,
    language: null,
    addedAt: record.updatedAt,
    totalSize: 0,
  };
}

function dayKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(timestamp: number) {
  const now = new Date();
  const date = new Date(timestamp);
  const today = dayKey(now.getTime());
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime());
  const key = dayKey(timestamp);
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

function timeAgo(timestamp: number) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function percentText(ratio: number) {
  const percent = Math.round(ratio * 100);
  if (percent < 1 && ratio > 0) return '<1%';
  return `${percent}%`;
}

export default function HistoryView() {
  const [records, setRecords] = useState<ProgressRecord[]>([]);
  const [continueWatching, setContinueWatching] = useState<ProgressRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const read = () => {
      setRecords(getHistory());
      setContinueWatching(getContinueWatching());
      setReady(true);
    };
    read();
    return subscribeToProgress(read);
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, ProgressRecord[]>();
    for (const record of records) {
      const key = dayKey(record.updatedAt);
      const list = map.get(key) ?? [];
      list.push(record);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [records]);

  const completedCount = records.filter((record) => record.completed).length;

  return (
    <div>
      <PageHeader
        eyebrow="Your viewing trail"
        title="Watch history"
        description="Pick up where you left off or revisit something you finished. Playback progress is stored in this browser only — never on a server."
        statValue={records.length ? records.length.toLocaleString() : '0'}
        statLabel="Titles in history"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip !h-8">
            <Clock3 className="h-3 w-3 text-accent-300" />
            {formatCount(continueWatching.length, 'unfinished title')}
          </span>
          <span className="chip !h-8">{formatCount(completedCount, 'completed title')}</span>
          {records.length > 0 ? (
            confirmClear ? (
              <span className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    clearProgress();
                    setConfirmClear(false);
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 text-[0.64rem] font-semibold text-accent-200 transition-colors hover:bg-accent/20"
                >
                  <TriangleAlert className="h-3 w-3" />
                  Clear everything
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="text-[0.62rem] font-semibold text-white/30 transition-colors hover:text-white/70"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 text-[0.64rem] font-semibold text-white/35 transition-colors hover:border-white/20 hover:text-white"
              >
                <Trash2 className="h-3 w-3" />
                Clear history
              </button>
            )
          ) : null}
        </div>
      </PageHeader>

      <div className="container-page py-9 sm:py-11">
        {!ready ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="skeleton h-28 rounded-2xl" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <EmptyState
            icon={History}
            title="Nothing watched yet"
            description="When you start a film or episode, LocalStream remembers the exact position here. You can resume from any device using the same browser."
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
        ) : (
          <div className="space-y-12">
            {continueWatching.length > 0 ? (
              <section>
                <div className="mb-5 flex items-end justify-between gap-4">
                  <div>
                    <p className="eyebrow">Pick up where you left off</p>
                    <h2 className="section-heading mt-2">Continue watching</h2>
                  </div>
                  <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-white/20">
                    {formatCount(continueWatching.length, 'title')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3.5 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-5 xl:grid-cols-6">
                  {continueWatching.map((record, index) => {
                    const item = toTitle(record);
                    const episode = record.kind === 'series' ? episodeCode(record.season, record.episode) : undefined;
                    const ratio = getProgressRatio(record);
                    return (
                      <div
                        key={record.titleId}
                        className="animate-fade-up"
                        style={{ animationDelay: `${Math.min(index, 12) * 26}ms` }}
                      >
                        <MediaCard
                          item={item}
                          href={detailsHref(item)}
                          playHref={watchHref(record.titleId, { episode: record.episodeId })}
                          progress={getProgressRatio(record)}
                          metaOverride={
                            episode
                              ? `${episode} · ${formatTime(record.currentTime)} watched`
                              : `${formatTime(record.currentTime)} watched`
                          }
                          episodeLabel={episode}
                        />
                        <p className="mt-1.5 px-0.5 text-[0.6rem] font-medium tabular-nums text-white/25">
                          {percentText(ratio)} · {timeAgo(record.updatedAt)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section>
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <p className="eyebrow">Everything you have played</p>
                  <h2 className="section-heading mt-2">Recently watched</h2>
                </div>
                <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-white/20">
                  {formatCount(records.length, 'title')}
                </span>
              </div>

              <div className="space-y-7">
                {groups.map(([key, list]) => (
                  <div key={key}>
                    <p className="mb-2.5 px-1 text-[0.58rem] font-bold uppercase tracking-[0.18em] text-white/25">
                      {dayLabel(list[0].updatedAt)}
                    </p>
                    <div className="panel divide-y divide-white/[0.055] overflow-hidden">
                      {list.map((record) => {
                        const ratio = getProgressRatio(record);
                        const percent = Math.round(ratio * 100);
                        const episode = record.kind === 'series' ? episodeCode(record.season, record.episode) : null;
                        return (
                          <div
                            key={record.titleId}
                            className="group flex items-center gap-3 p-3 transition-colors hover:bg-white/[0.025] sm:gap-4 sm:p-3.5"
                          >
                            <Link
                              href={detailsHref(record.titleId)}
                              className="relative block h-[4.6rem] w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 sm:h-[5rem] sm:w-[3.3rem]"
                            >
                              <Poster
                                title={record.title}
                                kind={record.kind}
                                year={record.year}
                                posterUrl={record.posterUrl}
                                extension={record.extension.toUpperCase()}
                                episodeLabel={episode ?? undefined}
                              />
                            </Link>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  href={detailsHref(record.titleId)}
                                  className="truncate text-[0.84rem] font-semibold text-white/85 transition-colors hover:text-white"
                                >
                                  {record.title}
                                </Link>
                                {record.completed ? (
                                  <span className="rounded border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 text-[0.48rem] font-bold uppercase tracking-[0.12em] text-emerald-200/80">
                                    Completed
                                  </span>
                                ) : null}
                                {episode ? (
                                  <span className="rounded border border-white/[0.08] bg-white/[0.035] px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-[0.1em] text-white/35">
                                    {episode}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.62rem] text-white/30">
                                <span className="uppercase">{record.extension}</span>
                                <span className="h-1 w-1 rounded-full bg-white/15" />
                                <span className="tabular-nums">
                                  {formatTime(record.currentTime)}
                                  {record.duration ? ` / ${formatTime(record.duration)}` : ''}
                                </span>
                                {record.duration ? (
                                  <>
                                    <span className="h-1 w-1 rounded-full bg-white/15" />
                                    <span>{percentText(ratio)}</span>
                                  </>
                                ) : null}
                                <span className="h-1 w-1 rounded-full bg-white/15" />
                                <span>{timeAgo(record.updatedAt)}</span>
                              </p>
                              {record.duration ? (
                                <div className="progress-track mt-2 max-w-sm">
                                  <div className="progress-fill" style={{ width: `${Math.max(percent, 2)}%` }} />
                                </div>
                              ) : null}
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                              <Link
                                href={watchHref(record.titleId, { episode: record.episodeId })}
                                className="flex h-9 items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.045] px-3 text-[0.62rem] font-semibold text-white/55 transition-colors hover:bg-white hover:text-black"
                              >
                                <Play className="h-3 w-3 fill-current" />
                                <span className="hidden sm:inline">{record.completed ? 'Watch again' : 'Resume'}</span>
                              </Link>
                              <button
                                type="button"
                                onClick={() => removeProgress(record.titleId)}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-white/20 transition-colors hover:bg-white/[0.07] hover:text-white/70"
                                aria-label={`Remove ${record.title} from history`}
                                title="Remove from history"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
