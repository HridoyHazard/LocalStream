'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Clock3, Film, Search, Sparkles, Tv, X } from 'lucide-react';
import type { BrowseResponse, SuggestResponse, TitleSummary } from '@/lib/media/types';
import { useApi, useDebouncedValue } from '@/lib/use-api';
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock';
import { detailsHref, metaLine, watchHref } from '@/lib/media-links';
import Poster from '@/components/media/Poster';
import { cn } from '@/lib/utils';

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

type Filter = 'all' | 'movie' | 'series';

const RECENT_KEY = 'localstream.searches.v1';

function readRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecent(query: string) {
  if (!query.trim()) return;
  try {
    const next = [query.trim(), ...readRecent().filter((value) => value.toLowerCase() !== query.trim().toLowerCase())].slice(0, 5);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage errors.
  }
}

export default function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const debouncedQuery = useDebouncedValue(query.trim(), 180);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setFilter('all');
    setActiveIndex(0);
    setRecent(readRecent());
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  const searchPath =
    open && debouncedQuery
      ? `/api/suggest?q=${encodeURIComponent(debouncedQuery)}&limit=12${filter === 'all' ? '' : `&kind=${filter}`}`
      : null;
  const popularPath =
    open && !debouncedQuery
      ? `/api/titles?sort=popular&pageSize=8&facets=false${filter === 'all' ? '' : `&kind=${filter}`}`
      : null;

  const { data: searchData, loading: searching } = useApi<SuggestResponse>(searchPath, {
    listenForRefresh: false,
    keepPreviousData: true,
  });
  const { data: popularData, loading: popularLoading } = useApi<BrowseResponse>(popularPath, {
    listenForRefresh: false,
  });

  const items = useMemo<TitleSummary[]>(() => {
    if (debouncedQuery) return searchData?.suggestions ?? [];
    return popularData?.items ?? [];
  }, [debouncedQuery, popularData?.items, searchData?.suggestions]);

  const loading = debouncedQuery ? searching && !searchData : popularLoading && !popularData;
  const didYouMean =
    searchData?.didYouMean && searchData.didYouMean.toLowerCase() !== debouncedQuery.toLowerCase()
      ? searchData.didYouMean
      : null;

  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery, filter, open]);

  useEffect(() => {
    if (activeIndex > Math.max(0, items.length - 1)) setActiveIndex(0);
  }, [activeIndex, items.length]);

  const submit = useCallback(
    (value?: string) => {
      const trimmed = (value ?? query).trim();
      if (!trimmed) return;
      saveRecent(trimmed);
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      onClose();
    },
    [onClose, query, router],
  );

  const openDetails = useCallback(
    (item: TitleSummary) => {
      saveRecent(query);
      router.push(detailsHref(item));
      onClose();
    },
    [onClose, query, router],
  );

  if (!open) return null;

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(items.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const active = items[activeIndex];
      if (active && query.trim()) openDetails(active);
      else submit();
    }
  };

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Search the library">
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-md"
        onClick={onClose}
        aria-label="Close search"
        tabIndex={-1}
      />

      <div className="relative mx-auto mt-[7vh] w-[min(94vw,49rem)] animate-scale-in sm:mt-[10vh]">
        <div className="menu-panel overflow-hidden rounded-[1.6rem]" onKeyDown={handleKeyDown}>
          <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3.5 transition-colors focus-within:border-white/[0.14] focus-within:bg-white/[0.015] sm:px-5">
            <Search className="h-[18px] w-[18px] shrink-0 text-accent-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search movies, series, actors, years…"
              className="min-w-0 flex-1 bg-transparent text-[0.95rem] font-medium text-white outline-none placeholder:text-white/30"
              aria-label="Search query"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.07] text-white/50 transition-colors hover:bg-white/[0.12] hover:text-white"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            <kbd className="hidden rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-1 text-[0.58rem] font-semibold tracking-wider text-white/35 sm:block">
              ESC
            </kbd>
          </div>

          <div className="flex items-center justify-between gap-2 border-b border-white/[0.05] px-3 py-2.5 sm:px-4">
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: 'all' as const, label: 'Everything', icon: Sparkles },
                  { id: 'movie' as const, label: 'Movies', icon: Film },
                  { id: 'series' as const, label: 'Series', icon: Tv },
                ]
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFilter(option.id)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[0.66rem] font-semibold transition-colors',
                    filter === option.id
                      ? 'bg-white text-black'
                      : 'text-white/45 hover:bg-white/[0.06] hover:text-white',
                  )}
                >
                  <option.icon className="h-3 w-3" />
                  {option.label}
                </button>
              ))}
            </div>
            <span className="hidden text-[0.58rem] font-medium text-white/25 sm:block">
              {debouncedQuery ? 'Smart search · typos welcome' : 'Popular in your library'}
            </span>
          </div>

          <div className="max-h-[58vh] overflow-y-auto p-2">
            {loading ? (
              <div className="space-y-1 p-1">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3 rounded-xl p-2.5">
                    <div className="skeleton h-14 w-10 rounded-md" />
                    <div className="flex-1">
                      <div className="skeleton h-3 w-1/2 rounded-full" />
                      <div className="skeleton mt-2 h-2.5 w-1/4 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : items.length > 0 ? (
              <>
                <div className="flex items-center justify-between px-3 pb-1 pt-2">
                  <p className="text-[0.58rem] font-bold uppercase tracking-[0.2em] text-white/25">
                    {debouncedQuery ? 'Best matches' : 'In your library'}
                  </p>
                  {debouncedQuery && searchData ? (
                    <span className="text-[0.58rem] font-medium tabular-nums text-white/20">
                      {searchData.suggestions.length} shown
                    </span>
                  ) : null}
                </div>

                {items.map((item, index) => (
                  <div
                    key={item.id}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      'group flex items-center gap-3 rounded-xl px-2.5 py-2.5 ring-1 ring-inset transition-colors',
                      activeIndex === index
                        ? 'bg-white/[0.085] ring-white/[0.07]'
                        : 'ring-transparent hover:bg-white/[0.045]',
                    )}
                  >
                    <Link
                      href={detailsHref(item)}
                      onClick={() => {
                        saveRecent(query);
                        onClose();
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3 outline-none"
                    >
                      <span className="relative block h-14 w-10 shrink-0 overflow-hidden rounded-md border border-white/10">
                        <Poster
                          title={item.title}
                          kind={item.kind}
                          year={item.year}
                          posterUrl={item.posterUrl}
                          extension={item.kind === 'series' ? 'SERIES' : 'FILM'}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[0.86rem] font-semibold text-white/90">{item.title}</span>
                          {item.kind === 'series' ? (
                            <span className="shrink-0 rounded border border-indigo-400/25 bg-indigo-400/10 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-[0.12em] text-indigo-200/80">
                              Series
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-[0.64rem] text-white/35">
                          <span>{metaLine(item)}</span>
                          {item.genres.length > 0 && (
                            <>
                              <span className="h-1 w-1 rounded-full bg-white/20" />
                              <span className="truncate">{item.genres.slice(0, 2).join(', ')}</span>
                            </>
                          )}
                        </span>
                      </span>
                    </Link>
                    <Link
                      href={watchHref(item)}
                      onClick={onClose}
                      className="hidden h-7 shrink-0 items-center rounded-full border border-white/10 bg-white/[0.05] px-2.5 text-[0.58rem] font-semibold text-white/50 transition-colors hover:bg-white hover:text-black sm:flex"
                    >
                      Play
                    </Link>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-white/20 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-white/60" />
                  </div>
                ))}

                {didYouMean && (
                  <button
                    type="button"
                    onClick={() => setQuery(didYouMean)}
                    className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[0.7rem] font-medium text-amber-200/70 transition-colors hover:bg-amber-400/[0.06] hover:text-amber-100"
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                    Did you mean <span className="font-bold text-amber-100">{didYouMean}</span>?
                  </button>
                )}

                {query.trim() && (
                  <button
                    type="button"
                    onClick={() => submit()}
                    className="mt-1 flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-[0.72rem] font-semibold text-accent-300 transition-colors hover:bg-accent/[0.08]"
                  >
                    <span>View all results for “{query.trim()}”</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/35">
                  <Search className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-white/80">
                  {debouncedQuery ? 'No titles found' : 'Your library is still empty'}
                </p>
                <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-white/35">
                  {debouncedQuery
                    ? `Nothing in your library matches “${debouncedQuery}”. Try a shorter title, a different spelling, or browse the collection.`
                    : 'Start a library scan to bring your movies and series into LocalStream.'}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {debouncedQuery && recent.length > 0 ? (
                    recent.slice(0, 3).map((term) => (
                      <button key={term} type="button" onClick={() => setQuery(term)} className="chip !h-7 text-[0.64rem]">
                        <Clock3 className="h-2.5 w-2.5" />
                        {term}
                      </button>
                    ))
                  ) : (
                    <Link href="/movies" onClick={onClose} className="btn btn-ghost btn-sm">
                      Browse movies
                    </Link>
                  )}
                </div>
              </div>
            )}

            {!debouncedQuery && recent.length > 0 && (
              <div className="mt-2 border-t border-white/[0.05] px-2 pb-1 pt-3">
                <p className="px-1 pb-2 text-[0.55rem] font-bold uppercase tracking-[0.18em] text-white/20">
                  Recent searches
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {recent.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => {
                        setQuery(term);
                        inputRef.current?.focus();
                      }}
                      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 text-[0.62rem] font-medium text-white/45 transition-colors hover:bg-white/[0.07] hover:text-white"
                    >
                      <Clock3 className="h-2.5 w-2.5" />
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.06] bg-white/[0.018] px-4 py-2.5">
            <div className="flex items-center gap-3 text-[0.6rem] font-medium text-white/28">
              <span className="hidden items-center gap-1.5 sm:flex">
                <kbd className="rounded border border-white/10 bg-white/[0.05] px-1 py-0.5">↑</kbd>
                <kbd className="rounded border border-white/10 bg-white/[0.05] px-1 py-0.5">↓</kbd>
                to navigate
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-0.5">↵</kbd>
                to open
              </span>
            </div>
            <Link
              href="/search"
              onClick={onClose}
              className="text-[0.62rem] font-semibold text-white/40 transition-colors hover:text-white"
            >
              Advanced search
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
