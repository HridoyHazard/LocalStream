'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Film,
  HardDrive,
  Info,
  Languages,
  ListVideo,
  LoaderCircle,
  MonitorPlay,
  Play,
  Radio,
  RotateCcw,
  ShieldCheck,
  Star,
  Captions,
  Tv,
  Users,
  Zap,
} from 'lucide-react';
import type { Episode, TitleDetail, TitleDetailResponse, TitleSummary } from '@/lib/media/types';
import { apiGet } from '@/lib/api';
import {
  detailsHref,
  episodeCode,
  formatBytes,
  formatRuntime,
  streamUrl,
  subtitleUrl,
  vlcUrl,
  watchHref,
} from '@/lib/media-links';
import { getPosterPalette, paletteStyle } from '@/lib/design/palette';
import {
  getProgress,
  getProgressRatio,
  removeProgress,
  subscribeToProgress,
  type ProgressRecord,
} from '@/lib/watch-progress';
import { isInWatchlist, subscribeToWatchlist, toggleWatchlist } from '@/lib/watchlist';
import Poster from '@/components/media/Poster';
import MediaRow from '@/components/media/MediaRow';
import EmptyState from '@/components/ui/EmptyState';
import { cn, formatCount, formatTime } from '@/lib/utils';

interface DetailsViewProps {
  titleId: string;
}

function PersonAvatar({ name, image }: { name: string; image?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (image && !failed) {
    return (
      <img
        src={image}
        alt=""
        loading="lazy"
        className="h-10 w-10 rounded-full border border-white/10 object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[0.72rem] font-bold text-white/55">
      {name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('')}
    </span>
  );
}

function DetailsSkeleton() {
  return (
    <div>
      <section className="relative overflow-hidden border-b border-white/[0.05]">
        <div className="absolute inset-0 bg-[radial-gradient(90%_120%_at_78%_8%,#241318_0%,transparent_56%),linear-gradient(152deg,#12090b_0%,#070709_65%)]" />
        <div className="hero-veil" />
        <div className="container-page relative z-10 py-8 sm:py-10">
          <div
            role="status"
            aria-live="polite"
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-white/45"
          >
            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-accent-300" />
            Loading title…
          </div>
          <div className="skeleton h-3 w-56 rounded-full" />
          <div className="mt-9 grid gap-10 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)]">
            <div className="skeleton mx-auto aspect-[2/3] w-full max-w-[17rem] rounded-[20px] lg:mx-0 lg:max-w-none" />
            <div className="space-y-4 self-center">
              <div className="skeleton h-4 w-40 rounded-full" />
              <div className="skeleton h-16 w-[75%] rounded-xl" />
              <div className="skeleton h-3 w-1/2 rounded-full" />
              <div className="skeleton h-3 w-[60%] rounded-full" />
              <div className="skeleton h-3 w-[48%] rounded-full" />
              <div className="mt-7 flex gap-3">
                <div className="skeleton h-11 w-36 rounded-full" />
                <div className="skeleton h-11 w-32 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="container-page py-12">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="skeleton h-64 rounded-2xl" />
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export default function DetailsView({ titleId }: DetailsViewProps) {
  const [response, setResponse] = useState<TitleDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [progress, setProgress] = useState<ProgressRecord | null>(null);
  const [saved, setSaved] = useState(false);
  const [season, setSeason] = useState<number | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [copyKey, setCopyKey] = useState<string>('path');
  const [vlcDirect, setVlcDirect] = useState(false);
  const copyTimer = useRef<number | null>(null);
  const lastTitleId = useRef(titleId);

  useEffect(() => {
    try {
      setVlcDirect(window.localStorage.getItem('localstream.vlcDirect') === '1');
    } catch {
      // Storage can be blocked; default stays on.
    }
  }, []);

  const chooseVlcDirect = (value: boolean) => {
    setVlcDirect(value);
    try {
      window.localStorage.setItem('localstream.vlcDirect', value ? '1' : '0');
    } catch {
      // Ignore blocked storage.
    }
  };

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const titleChanged = lastTitleId.current !== titleId;
    lastTitleId.current = titleId;
    if (titleChanged) {
      // Never show the previous title while the new one is loading.
      setResponse(null);
      setSeason(null);
    }
    setError(null);
    apiGet<TitleDetailResponse>(`/api/titles/${encodeURIComponent(titleId)}`, controller.signal, {
      force: reloadKey > 0,
    })
      .then((data) => {
        if (!active) return;
        setResponse(data);
        setSeason((current) => current ?? data.title.seasons[0] ?? null);
      })
      .catch((cause) => {
        if (!active) return;
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'The title could not be loaded');
      });
    return () => {
      // A superseded/aborted request must not write state.
      active = false;
      controller.abort();
    };
  }, [titleId, reloadKey]);

  useEffect(() => {
    const read = () => {
      const record = getProgress(titleId) ?? null;
      setProgress(record);
      if (record?.season && season === null) setSeason(record.season);
    };
    read();
    return subscribeToProgress(read);
  }, [season, titleId]);

  useEffect(() => {
    const read = () => setSaved(isInWatchlist(titleId));
    read();
    return subscribeToWatchlist(read);
  }, [titleId]);

  useEffect(() => {
    const onRefresh = () => setReloadKey((value) => value + 1);
    window.addEventListener('localstream:refresh', onRefresh);
    return () => window.removeEventListener('localstream:refresh', onRefresh);
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    };
  }, []);

  const title = response?.title;
  const palette = useMemo(() => (title ? getPosterPalette(`${title.title}-${title.year ?? ''}`) : null), [title]);
  const isSeries = title?.kind === 'series';
  const progressTarget = progress?.episodeId ?? title?.episodes[0]?.id ?? null;

  const seasons = useMemo(() => {
    if (!title) return [];
    const map = new Map<number, Episode[]>();
    for (const episode of title.episodes) {
      const list = map.get(episode.season) ?? [];
      list.push(episode);
      map.set(episode.season, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [title]);

  const activeSeason = season ?? seasons[0]?.[0] ?? null;
  const activeEpisodes = seasons.find(([value]) => value === activeSeason)?.[1] ?? [];
  const resumePercent = progress?.duration
    ? Math.round(getProgressRatio(progress) * 100)
    : 0;

  const copy = async (value: string, key = 'path') => {
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      let field: HTMLTextAreaElement | null = null;
      try {
        field = document.createElement('textarea');
        field.value = value;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.top = '-9999px';
        document.body.appendChild(field);
        field.select();
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      } finally {
        field?.remove();
      }
    }
    setCopyKey(key);
    setCopyState(copied ? 'copied' : 'failed');
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopyState('idle'), 2400);
  };

  const copyDirectLink = () => {
    if (!title) return;
    const path = isSeries ? progress?.path ?? title.episodes[0]?.path : title.filePath;
    if (!path) return;
    void copy(`${window.location.origin}${streamUrl(path)}`, 'stream');
  };

  const stateFor = (key: string) => (copyKey === key ? copyState : 'idle');

  const copyM3uLink = (scope?: 'season' | 'series') => {
    if (!title) return;
    const episode = isSeries
      ? title.episodes.find((item) => item.id === progress?.episodeId) ??
        title.episodes.find((item) => item.season === activeSeason) ??
        title.episodes[0]
      : null;
    const link = vlcUrl({
      titleId: title.id,
      ...(!scope && episode ? { episodeId: episode.id } : {}),
      ...(scope ? { scope } : {}),
      ...(scope === 'season' && activeSeason !== null ? { season: activeSeason } : {}),
      direct: vlcDirect,
    });
    void copy(`${window.location.origin}${link}`, scope ? `m3u-${scope}` : 'm3u');
  };

  const errorScreen = (
    <div className="container-page page-shell">
      <EmptyState
        icon={Film}
        title="This title could not be found"
        description={
          error
            ? `LocalStream could not load this title (${error}). It may have been removed from the library, or the scan may still be running.`
            : 'This title is not in the library index. Run a scan or return to the collection.'
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="btn btn-primary">
              Retry
            </button>
            <Link href="/movies" className="btn btn-ghost">
              Browse movies
            </Link>
          </div>
        }
      />
    </div>
  );

  if (!response) {
    // Before the first payload there is nothing to call "not found" — show the
    // loader until the real response (or a real error) arrives.
    return error ? errorScreen : <DetailsSkeleton />;
  }

  if (!title) {
    return errorScreen;
  }

  const related = response?.related ?? [];
  const recommendations = response?.recommendations ?? [];
  const offline = title.availability === 'offline';
  const hasStream = isSeries ? title.episodes.length > 0 : Boolean(title.filePath);
  const playable = hasStream && !offline;
  const resumeHref = watchHref(title, {
    episode: isSeries ? progressTarget : null,
  });
  const restartHref = watchHref(title, {
    episode: isSeries ? progressTarget : null,
    restart: true,
  });
  const currentEpisode = isSeries
    ? title.episodes.find((episode) => episode.id === progress?.episodeId) ??
      title.episodes.find((episode) => episode.season === activeSeason) ??
      title.episodes[0]
    : null;
  const directPath = isSeries ? currentEpisode?.path ?? '' : title.filePath;
  const mediaMeta = [
    title.year ? String(title.year) : null,
    title.kind === 'series'
      ? `${formatCount(title.episodes.length, 'episode')} · ${formatCount(title.seasons.length, 'season')}`
      : title.runtime
        ? formatRuntime(title.runtime)
        : title.extension.toUpperCase(),
    title.rating ? `${title.rating.toFixed(1)} / 10` : null,
    title.language,
  ].filter(Boolean) as string[];

  return (
    <div>
      <section className="relative isolate overflow-hidden border-b border-white/[0.055]" style={palette ? paletteStyle(palette) : undefined}>
        {title.backdropUrl ? (
          <>
            <img src={title.backdropUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-center opacity-55" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,#0d0d0e_0%,rgba(13,13,14,0.88)_32%,rgba(13,13,14,0.35)_72%,rgba(13,13,14,0.55)_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(0deg,#0d0d0e_2%,transparent_48%)]" />
          </>
        ) : (
          <>
            <div className="hero-art" />
            <div className="hero-orb !left-[78%] !top-[10%] !opacity-25" />
            <div className="hero-grid" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0d0d0e]/25 via-transparent to-[#0d0d0e]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0d0d0e]/75 via-[#0d0d0e]/25 to-transparent" />
          </>
        )}

        <div className="container-page relative z-10 py-8 sm:py-10">
          <nav className="flex items-center gap-1.5 text-[0.66rem] font-medium text-white/35" aria-label="Breadcrumb">
            <Link href="/" className="transition-colors hover:text-white">
              Home
            </Link>
            <ChevronRight className="h-3 w-3 text-white/20" />
            <Link href={isSeries ? '/series' : '/movies'} className="transition-colors hover:text-white">
              {isSeries ? 'TV Series' : 'Movies'}
            </Link>
            <ChevronRight className="h-3 w-3 text-white/20" />
            <span className="max-w-[16rem] truncate text-white/60">{title.title}</span>
          </nav>

          {offline || !hasStream ? (
            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/80" />
                <p className="text-[0.74rem] leading-relaxed text-amber-100/70">
                  {offline
                    ? 'The media server for this title is offline. The catalogue details are available, but playback and episode lists return as soon as you reconnect to the ISP network.'
                    : 'The media file for this title could not be located. Playback is unavailable until the server lists it again.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReloadKey((value) => value + 1)}
                className="inline-flex shrink-0 items-center gap-1.5 text-[0.68rem] font-semibold text-amber-200 transition-colors hover:text-amber-100"
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </button>
            </div>
          ) : null}

          <div className="mt-8 grid gap-10 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-14 xl:grid-cols-[20rem_minmax(0,1fr)]">
            <div className="mx-auto w-full max-w-[17rem] lg:mx-0 lg:max-w-none">
              <div className="relative">
                <div className="absolute -inset-6 rounded-[2rem] bg-[radial-gradient(circle,var(--p-glow),transparent_68%)] opacity-20 blur-2xl" />
                <div className="relative aspect-[2/3] overflow-hidden rounded-[20px] border border-white/[0.15] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)]">
                  <Poster
                    title={title.title}
                    kind={title.kind}
                    year={title.year}
                    posterUrl={title.posterUrl}
                    extension={title.extension || (isSeries ? 'SERIES' : 'FILM')}
                    priority
                  />
                </div>
              </div>

              <div className="panel mt-5 hidden overflow-hidden lg:block">
                <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                  <span className="text-[0.58rem] font-bold uppercase tracking-[0.18em] text-white/30">Quick facts</span>
                  <span className="text-[0.58rem] font-semibold tabular-nums text-white/20">
                    {title.tmdbId ? 'TMDB enriched' : title.metadataStatus === 'live' ? 'Live catalogue' : 'Local index'}
                  </span>
                </div>
                <dl className="divide-y divide-white/[0.05] text-[0.7rem]">
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <dt className="text-white/35">Format</dt>
                    <dd className="font-semibold uppercase text-white/70">{title.extension || '—'}</dd>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <dt className="text-white/35">Collection</dt>
                    <dd className="max-w-[11rem] truncate text-right font-semibold text-white/70">
                      {title.category ?? (isSeries ? 'TV Series' : 'Movies')}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <dt className="text-white/35">Released</dt>
                    <dd className="font-semibold tabular-nums text-white/70">{title.year ?? '—'}</dd>
                  </div>
                  {title.runtime ? (
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <dt className="text-white/35">Runtime</dt>
                      <dd className="font-semibold text-white/70">{formatRuntime(title.runtime)}</dd>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <dt className="text-white/35">Library size</dt>
                    <dd className="font-semibold tabular-nums text-white/70">{formatBytes(title.totalSize)}</dd>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <dt className="text-white/35">Source</dt>
                    <dd className="flex items-center gap-1.5 font-semibold text-white/70">
                      <span className={cn('h-1 w-1 rounded-full', offline ? 'bg-amber-400' : 'bg-emerald-400')} />
                      {offline ? 'Server offline' : 'Local network'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="min-w-0 self-center">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="badge badge-accent">{isSeries ? 'TV Series' : 'Feature film'}</span>
                {title.genres.slice(0, 3).map((genre) => (
                  <Link
                    key={genre}
                    href={`/${isSeries ? 'series' : 'movies'}?genre=${encodeURIComponent(genre)}`}
                    className="badge transition-colors hover:border-white/25 hover:bg-white/[0.1]"
                  >
                    {genre}
                  </Link>
                ))}
                {title.metadataStatus === 'matched' ? <span className="badge">TMDB matched</span> : null}
              </div>

              <h1 className="hero-title mt-4 max-w-[18ch] text-white">{title.title}</h1>

              {title.tagline ? (
                <p className="mt-3 max-w-2xl text-[0.92rem] italic text-white/45">{title.tagline}</p>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.72rem] font-semibold text-white/55">
                {title.rating ? (
                  <span className="inline-flex items-center gap-1.5 text-amber-300">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    {title.rating.toFixed(1)}
                    {title.voteCount ? <span className="text-white/25">({title.voteCount.toLocaleString()})</span> : null}
                  </span>
                ) : null}
                {mediaMeta.map((value, index) => (
                  <span key={`${value}-${index}`} className="inline-flex items-center gap-3">
                    {index > 0 || title.rating ? <span className="h-1 w-1 rounded-full bg-white/25" /> : null}
                    {value}
                  </span>
                ))}
              </div>

              <p className="mt-5 max-w-[64ch] text-pretty text-[0.9rem] leading-relaxed text-white/55">
                {title.overview ||
                  (isSeries
                    ? `${title.title} is a series from your local media server. Every episode streams directly in original quality with instant seeking — no cloud service in between.`
                    : `${title.title} is a feature presentation hosted on your local network. LocalStream plays the original file directly from your media server with instant range seeking.`)}
              </p>

              {progress && (
                <div className="mt-6 max-w-md rounded-2xl border border-white/[0.07] bg-black/25 p-4 backdrop-blur-md">
                  <div className="flex items-center justify-between text-[0.62rem] font-semibold">
                    <span className="inline-flex items-center gap-1.5 text-white/45">
                      <Clock3 className="h-3 w-3" />
                      {progress.kind === 'series' && progress.season
                        ? `Resume ${episodeCode(progress.season, progress.episode)}`
                        : 'Resume where you left off'}
                    </span>
                    <span className="tabular-nums text-accent-300">
                      {formatTime(progress.currentTime)}
                      {progress.duration ? ` / ${formatTime(progress.duration)}` : ''}
                    </span>
                  </div>
                  <div className="progress-track mt-3">
                    <div className="progress-fill" style={{ width: `${Math.max(resumePercent, 2)}%` }} />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      removeProgress(title.id);
                      setProgress(null);
                    }}
                    className="mt-2.5 text-[0.6rem] font-medium text-white/25 transition-colors hover:text-white/60"
                  >
                    Clear playback progress
                  </button>
                </div>
              )}

              <div className="mt-7 flex flex-wrap items-center gap-3">
                {playable ? (
                  <Link href={resumeHref} className="btn btn-primary h-12 px-6 text-[0.86rem]">
                    <Play className="h-4 w-4 fill-current" />
                    {progress ? 'Resume playback' : isSeries ? 'Play first episode' : 'Play now'}
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="btn btn-primary h-12 cursor-not-allowed px-6 text-[0.86rem] opacity-45"
                    title={offline ? 'The media server is offline' : 'No playable video was found for this title'}
                  >
                    <Play className="h-4 w-4 fill-current" />
                    {offline ? 'Server offline' : 'Not available'}
                  </button>
                )}
                {progress && playable ? (
                  <Link href={restartHref} className="btn btn-ghost h-12 px-5 text-[0.82rem]">
                    <RotateCcw className="h-4 w-4" />
                    Start over
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSaved(toggleWatchlist(title))}
                  className={cn(
                    'btn h-12 px-5 text-[0.82rem]',
                    saved
                      ? 'border border-accent/30 bg-accent/[0.12] text-accent-200'
                      : 'btn-ghost',
                  )}
                >
                  {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                  {saved ? 'In my list' : 'Add to my list'}
                </button>
                {directPath && !offline ? (
                  <a
                    href={vlcUrl({ titleId: title.id, ...(isSeries && currentEpisode ? { episodeId: currentEpisode.id } : {}) })}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-quiet h-12 px-4 text-[0.8rem]"
                    title="Open the stream in VLC. Best for MKV/HEVC/AC3 files that browsers cannot decode."
                  >
                    <MonitorPlay className="h-4 w-4" />
                    Open in VLC
                  </a>
                ) : null}
              </div>

              <div className="mt-9 grid gap-2.5 sm:grid-cols-3">
                {[
                  { icon: Zap, label: 'Direct stream', value: 'No middleman' },
                  { icon: HardDrive, label: 'Range seeking', value: 'Instant scrubbing' },
                  { icon: ShieldCheck, label: 'Private', value: 'Stays on your LAN' },
                ].map((fact) => (
                  <div
                    key={fact.label}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-3 backdrop-blur-sm"
                  >
                    <fact.icon className="h-4 w-4 shrink-0 text-accent-300/80" />
                    <div>
                      <p className="text-[0.64rem] font-semibold text-white/65">{fact.label}</p>
                      <p className="text-[0.58rem] text-white/30">{fact.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container-page space-y-10 pb-16 pt-8">
        {isSeries && seasons.length > 0 ? (
          <section>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Episodes</p>
                <h2 className="section-heading mt-2">
                  {formatCount(title.episodes.length, 'episode')} across {formatCount(seasons.length, 'season')}
                </h2>
              </div>
              {seasons.length > 1 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {seasons.map(([number, episodes]) => (
                    <button
                      key={number}
                      type="button"
                      onClick={() => setSeason(number)}
                      className={cn('chip !h-8 text-[0.68rem]', activeSeason === number && 'chip-active')}
                    >
                      Season {number}
                      <span className="text-[0.6rem] opacity-50">{episodes.length}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 text-[0.6rem] font-bold uppercase tracking-[0.16em] text-white/30 sm:px-5">
                <span>Season {activeSeason}</span>
                <span>{activeEpisodes.length} episodes</span>
              </div>
              <ol className="divide-y divide-white/[0.05]">
                {activeEpisodes.map((episode) => {
                  const active = progress?.episodeId === episode.id;
                  const ratio = active && progress?.duration ? getProgressRatio(progress) : 0;
                  return (
                    <li key={episode.id} className="group relative">
                      <Link
                        href={watchHref(title, { episode: episode.id })}
                        className={cn(
                          'flex items-center gap-3.5 px-4 py-3.5 transition-colors sm:gap-5 sm:px-5',
                          active ? 'bg-accent/[0.055]' : 'hover:bg-white/[0.03]',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[0.72rem] font-bold tabular-nums',
                            active
                              ? 'border-accent/30 bg-accent/15 text-accent-200'
                              : 'border-white/[0.08] bg-white/[0.035] text-white/45',
                          )}
                        >
                          {String(episode.episode).padStart(2, '0')}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-[0.84rem] font-semibold text-white/85">
                              {episode.name || `Episode ${episode.episode}`}
                            </span>
                            {active ? (
                              <span className="rounded border border-accent/25 bg-accent/10 px-1.5 py-0.5 text-[0.48rem] font-bold uppercase tracking-[0.12em] text-accent-200">
                                Continue
                              </span>
                            ) : null}
                            {episode.subtitles.length > 0 ? (
                              <span className="inline-flex items-center gap-1 text-[0.55rem] font-semibold text-white/25">
                                <Captions className="h-2.5 w-2.5" />
                                {episode.subtitles.length}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-[0.62rem] text-white/30">
                            <span className="uppercase">{episode.extension}</span>
                            <span className="h-1 w-1 rounded-full bg-white/15" />
                            <span>{formatBytes(episode.size)}</span>
                            {active && progress ? (
                              <>
                                <span className="h-1 w-1 rounded-full bg-white/15" />
                                <span className="text-accent-300/80">
                                  {formatTime(progress.currentTime)} watched
                                </span>
                              </>
                            ) : null}
                          </span>
                          {active && ratio > 0 ? (
                            <span className="progress-track mt-2 block max-w-xs">
                              <span className="progress-fill block" style={{ width: `${Math.round(ratio * 100)}%` }} />
                            </span>
                          ) : null}
                        </span>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/45 transition-all duration-300 group-hover:scale-105 group-hover:border-white/25 group-hover:bg-white group-hover:text-black">
                          <Play className="h-3 w-3 translate-x-[1px] fill-current" />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </div>

            {currentEpisode ? (
              <p className="mt-3 text-[0.62rem] text-white/25">
                Episodes stream from the same local server. Use VLC for files with codecs your browser cannot decode.
              </p>
            ) : null}
          </section>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="panel p-6 sm:p-7">
            <p className="eyebrow">About this presentation</p>
            <h2 className="mt-3 text-xl font-bold tracking-tight text-white">
              {isSeries ? 'Episodes from your local library' : 'A film from your local library'}
            </h2>
            <div className="mt-4 space-y-3 text-[0.82rem] leading-relaxed text-white/45">
              {title.overview ? (
                <p>{title.overview}</p>
              ) : (
                <p>
                  This title lives on your ISP media server and is streamed directly to the player — no cloud service,
                  no uploads and no third-party platform in between. Everything stays on your local network.
                </p>
              )}
              <p>
                Playback uses HTTP range requests, so you can seek anywhere in the file and start watching immediately.
                The original file is delivered in its native format and quality.
              </p>
            </div>

            {title.directors.length > 0 || title.cast.length > 0 ? (
              <div className="mt-6 border-t border-white/[0.06] pt-5">
                {title.directors.length > 0 ? (
                  <div>
                    <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-white/25">Directed by</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {title.directors.map((name) => (
                        <Link
                          key={name}
                          href={`/search?q=${encodeURIComponent(name)}&director=${encodeURIComponent(name)}`}
                          className="chip !h-7 text-[0.64rem]"
                        >
                          {name}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}

                {title.cast.length > 0 ? (
                  <div className="mt-5">
                    <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-white/25">Cast</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {title.cast.slice(0, 8).map((person) => (
                        <Link
                          key={`${person.name}-${person.character ?? ''}`}
                          href={`/search?q=${encodeURIComponent(person.name)}&actor=${encodeURIComponent(person.name)}`}
                          className="flex items-center gap-2.5 rounded-xl border border-white/[0.055] bg-white/[0.02] p-2 transition-colors hover:border-white/15 hover:bg-white/[0.045]"
                        >
                          <PersonAvatar name={person.name} image={person.profileUrl} />
                          <span className="min-w-0">
                            <span className="block truncate text-[0.72rem] font-semibold text-white/75">{person.name}</span>
                            {person.character ? (
                              <span className="block truncate text-[0.6rem] text-white/30">{person.character}</span>
                            ) : null}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 grid gap-3 border-t border-white/[0.06] pt-5 text-[0.7rem] sm:grid-cols-2">
              <div className="flex items-start gap-2.5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/25" />
                <div>
                  <p className="font-semibold text-white/65">Media identifier</p>
                  <p className="mt-0.5 break-all font-medium text-white/30">{title.id}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Radio className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/25" />
                <div>
                  <p className="font-semibold text-white/65">Streaming protocol</p>
                  <p className="mt-0.5 font-medium text-white/30">HTTP range request proxy</p>
                </div>
              </div>
              {title.tmdbUrl ? (
                <div className="flex items-start gap-2.5">
                  <Film className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/25" />
                  <div>
                    <p className="font-semibold text-white/65">Metadata source</p>
                    <a
                      href={title.tmdbUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 font-medium text-accent-300/75 transition-colors hover:text-accent-200"
                    >
                      View on TMDB
                      <ChevronRight className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ) : null}
              {title.trailerUrl ? (
                <div className="flex items-start gap-2.5">
                  <Play className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/25" />
                  <div>
                    <p className="font-semibold text-white/65">Trailer</p>
                    <a
                      href={title.trailerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 font-medium text-accent-300/75 transition-colors hover:text-accent-200"
                    >
                      Watch trailer
                      <ChevronRight className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="panel flex flex-col p-6 sm:p-7">
            <div className="flex items-center justify-between">
              <p className="eyebrow">File details</p>
              <span className="badge badge-accent">
                {isSeries ? currentEpisode?.extension?.toUpperCase() || 'SERIES' : title.extension.toUpperCase() || 'FILE'}
              </span>
            </div>
            <div className="mt-4 rounded-xl border border-white/[0.055] bg-black/25 p-3.5">
              <p className="text-[0.55rem] font-bold uppercase tracking-[0.18em] text-white/25">Source path</p>
              <p className="mt-2 break-all font-mono text-[0.68rem] leading-relaxed text-white/55">
                {directPath || title.folderPath || '—'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void copy(directPath || title.folderPath)}
              className={cn(
                'btn btn-ghost btn-sm mt-3 w-full',
                stateFor('path') === 'copied' && 'border-emerald-400/25 text-emerald-300',
                stateFor('path') === 'failed' && 'border-accent/25 text-accent-200',
              )}
              disabled={!directPath && !title.folderPath}
              title={stateFor('path') === 'failed' ? 'Clipboard access was blocked. Select the path above to copy it manually.' : 'Copy the source path'}
            >
              {stateFor('path') === 'copied' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span aria-live="polite">
                {stateFor('path') === 'copied' ? 'Path copied' : stateFor('path') === 'failed' ? 'Copy failed' : 'Copy file path'}
              </span>
            </button>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={copyDirectLink} className="btn btn-quiet btn-sm" title="Copy a direct stream link for VLC, mpv or another player" disabled={!directPath || offline}>
                {stateFor('stream') === 'copied' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {stateFor('stream') === 'copied' ? 'Link copied' : stateFor('stream') === 'failed' ? 'Copy failed' : 'Copy stream link'}
              </button>
              {directPath && !offline ? (
                <a
                  href={vlcUrl({ titleId: title.id, ...(isSeries && currentEpisode ? { episodeId: currentEpisode.id } : {}), download: true })}
                  className="btn btn-quiet btn-sm"
                  title="Download an M3U playlist to open in VLC"
                >
                  <ListVideo className="h-3.5 w-3.5" />
                  VLC playlist
                </a>
              ) : (
                <span className="btn btn-quiet btn-sm cursor-not-allowed opacity-45" title={offline ? 'The media server is offline' : 'No direct stream path is available'}>
                  <ListVideo className="h-3.5 w-3.5" />
                  VLC playlist
                </span>
              )}
            </div>

            <div className="mt-5 rounded-xl border border-white/[0.055] bg-white/[0.02] p-3">
              <p className="flex items-center gap-1.5 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-white/30">
                <ListVideo className="h-3 w-3" />
                VLC M3U link
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-1 rounded-lg border border-white/[0.06] bg-black/25 p-1 text-[0.62rem] font-semibold">
                <button
                  type="button"
                  onClick={() => chooseVlcDirect(false)}
                  className={cn('rounded-md px-2 py-1.5 transition-colors', !vlcDirect ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60')}
                >
                  Through LocalStream
                </button>
                <button
                  type="button"
                  onClick={() => chooseVlcDirect(true)}
                  className={cn('rounded-md px-2 py-1.5 transition-colors', vlcDirect ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60')}
                >
                  Direct from server
                </button>
              </div>
              <div className="mt-2 grid gap-2">
                <button
                  type="button"
                  onClick={() => copyM3uLink()}
                  disabled={!directPath || offline}
                  className={cn('btn btn-quiet btn-sm w-full', stateFor('m3u') === 'copied' && 'border-emerald-400/25 text-emerald-300')}
                >
                  {stateFor('m3u') === 'copied' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span aria-live="polite">
                    {stateFor('m3u') === 'copied' ? 'M3U link copied' : stateFor('m3u') === 'failed' ? 'Copy failed' : isSeries ? 'Copy M3U link (this episode)' : 'Copy M3U link'}
                  </span>
                </button>
                {isSeries ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => copyM3uLink('season')}
                      disabled={offline}
                      className={cn('btn btn-quiet btn-sm', stateFor('m3u-season') === 'copied' && 'border-emerald-400/25 text-emerald-300')}
                    >
                      {stateFor('m3u-season') === 'copied' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {stateFor('m3u-season') === 'copied' ? 'Copied' : `Season ${activeSeason ?? ''}`.trim()}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyM3uLink('series')}
                      disabled={offline}
                      className={cn('btn btn-quiet btn-sm', stateFor('m3u-series') === 'copied' && 'border-emerald-400/25 text-emerald-300')}
                    >
                      {stateFor('m3u-series') === 'copied' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {stateFor('m3u-series') === 'copied' ? 'Copied' : 'All episodes'}
                    </button>
                  </div>
                ) : null}
              </div>
              <p className="mt-2.5 text-[0.62rem] leading-relaxed text-white/30">
                In VLC: Media → Open Network Stream (Ctrl+N), paste the link, press Play.{' '}
                {vlcDirect
                  ? 'Direct links need VLC to reach the media server itself.'
                  : 'Proxy links need LocalStream to keep running and be reachable from VLC.'}
              </p>
            </div>

            <div className="mt-3 rounded-xl border border-white/[0.055] bg-white/[0.02] p-3">
              <p className="flex items-center gap-1.5 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-white/30">
                <MonitorPlay className="h-3 w-3" />
                Better in VLC?
              </p>
              <p className="mt-2 text-[0.66rem] leading-relaxed text-white/35">
                Browsers cannot decode every MKV, HEVC or AC3 track. Open the playlist in VLC, or copy the stream link
                into any player on your network. No download is required — VLC seeks directly from the server.
              </p>
            </div>

            <div className="mt-auto pt-5">
              <div className="surface-rule flex items-center justify-between py-2.5 text-[0.68rem]">
                <span className="text-white/30">Collection</span>
                <span className="max-w-[10rem] truncate font-semibold text-white/60">{title.category ?? (isSeries ? 'TV Series' : 'Movies')}</span>
              </div>
              {isSeries ? (
                <div className="surface-rule flex items-center justify-between py-2.5 text-[0.68rem]">
                  <span className="text-white/30">Episodes</span>
                  <span className="font-semibold tabular-nums text-white/60">{title.episodes.length}</span>
                </div>
              ) : null}
              {title.runtime ? (
                <div className="surface-rule flex items-center justify-between py-2.5 text-[0.68rem]">
                  <span className="text-white/30">Runtime</span>
                  <span className="font-semibold text-white/60">{formatRuntime(title.runtime)}</span>
                </div>
              ) : null}
              <div className="surface-rule flex items-center justify-between py-2.5 text-[0.68rem]">
                <span className="text-white/30">Size</span>
                <span className="font-semibold tabular-nums text-white/60">{formatBytes(title.totalSize)}</span>
              </div>
              <div className="surface-rule flex items-center justify-between py-2.5 text-[0.68rem]">
                <span className="text-white/30">Availability</span>
                {offline ? (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-amber-300/90">
                    <span className="h-1 w-1 rounded-full bg-amber-400" />
                    Server offline
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300/80">
                    <span className="h-1 w-1 rounded-full bg-emerald-400" />
                    On your server
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {related.length > 0 ? (
          <MediaRow
            eyebrow={isSeries ? 'Keep watching' : 'Keep exploring'}
            title={isSeries ? 'More series on your server' : 'More films on your server'}
            items={related}
            actionHref={isSeries ? '/series' : '/movies'}
          />
        ) : null}

        {recommendations.length > 0 ? (
          <MediaRow
            eyebrow="Picked for you"
            title="You might also like"
            items={recommendations}
            actionHref={isSeries ? '/series' : '/movies'}
          />
        ) : null}

        {title.subtitles.length > 0 || title.episodes.some((episode) => episode.subtitles.length > 0) ? (
          <section className="panel p-5 sm:p-6">
            <p className="eyebrow">Subtitles</p>
            <h2 className="mt-2 text-lg font-bold tracking-tight text-white">Available subtitle tracks</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {title.subtitles.map((track) => (
                <a
                  key={`title-${track.path}`}
                  href={subtitleUrl(track.path)}
                  target="_blank"
                  rel="noreferrer"
                  className="chip !h-7 text-[0.62rem]"
                  title={track.path}
                >
                  <Captions className="h-2.5 w-2.5" />
                  {track.label}
                </a>
              ))}
              {title.episodes.flatMap((episode) =>
                episode.subtitles.map((track) => (
                  <a
                    key={`${episode.id}-${track.path}`}
                    href={subtitleUrl(track.path)}
                    target="_blank"
                    rel="noreferrer"
                    className="chip !h-7 text-[0.62rem]"
                    title={track.path}
                  >
                    <Captions className="h-2.5 w-2.5" />
                    {episodeCode(episode.season, episode.episode)} · {track.label}
                  </a>
                )),
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
