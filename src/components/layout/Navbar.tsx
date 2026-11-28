'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Clock3,
  Film,
  Loader2,
  RefreshCw,
  Search,
  Star,
  Tv,
} from 'lucide-react';
import type { StatsResponse, SuggestResponse, TitleSummary } from '@/lib/media/types';
import { apiPost } from '@/lib/api';
import { useApi, useDebouncedValue } from '@/lib/use-api';
import { detailsHref, metaLine } from '@/lib/media-links';
import Logo from '@/components/ui/Logo';
import { buildNavGroups } from '@/components/layout/nav-groups';
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock';
import { cn } from '@/lib/utils';

const navigation = [
  { href: '/', label: 'Home' },
  { href: '/movies', label: 'Movies' },
  { href: '/series', label: 'TV Shows' },
];

const RECENT_KEY = 'localstream.searches.v1';

function saveRecent(query: string) {
  if (typeof window === 'undefined' || !query.trim()) return;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]') as unknown;
    const current = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
    const next = [query.trim(), ...current.filter((value) => value.toLowerCase() !== query.trim().toLowerCase())].slice(0, 8);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Search history is a convenience only.
  }
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [megaOpen, setMegaOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const wasScanning = useRef(false);
  const megaRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const desktopInput = useRef<HTMLInputElement>(null);
  const mobileInput = useRef<HTMLInputElement>(null);

  const { data, error, loading, refresh } = useApi<StatsResponse>('/api/stats');
  const scan = data?.scan;
  const reachable = data?.server?.reachable;
  const online = Boolean(data) && !error && reachable !== false;
  const statusPending = loading || (Boolean(data) && !error && reachable == null);
  const scanning = Boolean(scan?.running) || syncing;
  const groups = useMemo(() => buildNavGroups(data), [data]);

  const debounced = useDebouncedValue(search.trim(), 240);
  const suggestPath =
    debounced.length >= 2 ? `/api/suggest?q=${encodeURIComponent(debounced)}&limit=6` : null;
  const { data: suggestData, loading: suggestLoading } = useApi<SuggestResponse>(suggestPath, {
    listenForRefresh: false,
    keepPreviousData: true,
  });
  const suggestions = useMemo<TitleSummary[]>(
    () => (suggestData && suggestData.query === debounced ? suggestData.suggestions : []),
    [debounced, suggestData],
  );
  const dropdownOpen = searchFocused && debounced.length >= 2;

  useBodyScrollLock(mobileSearch);

  useEffect(() => {
    setMegaOpen(false);
    setMobileSearch(false);
    setSearchFocused(false);
  }, [pathname]);

  // Keep the library fresh while a scan is running.
  useEffect(() => {
    if (!scan?.running) {
      if (wasScanning.current) {
        wasScanning.current = false;
        window.dispatchEvent(new Event('localstream:refresh'));
      }
      return;
    }

    wasScanning.current = true;
    const timer = window.setInterval(() => void refresh(), 3500);
    return () => window.clearInterval(timer);
  }, [scan?.running, refresh]);

  // The first stats response can arrive before the reachability probe has
  // finished. Retry once so the header does not stay on "Connecting...".
  useEffect(() => {
    if (!data || data.server?.reachable != null) return;
    const timer = window.setTimeout(() => void refresh(), 2800);
    return () => window.clearTimeout(timer);
  }, [data, refresh]);

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (megaRef.current && !megaRef.current.contains(target)) setMegaOpen(false);
      if (searchRef.current && !searchRef.current.contains(target)) setSearchFocused(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMegaOpen(false);
        setSearchFocused(false);
        setMobileSearch(false);
        return;
      }

      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (window.matchMedia('(min-width: 640px)').matches) {
          desktopInput.current?.focus();
        } else {
          setMobileSearch(true);
          window.setTimeout(() => mobileInput.current?.focus(), 60);
        }
        return;
      }

      if (event.key === '/' && !typing) {
        event.preventDefault();
        if (window.matchMedia('(min-width: 640px)').matches) {
          desktopInput.current?.focus();
        }
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!mobileSearch) return;
    const timer = window.setTimeout(() => mobileInput.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [mobileSearch]);

  const showFeedback = useCallback((message: string) => {
    setFeedback(message);
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 4000);
  }, []);

  const syncLibrary = useCallback(async () => {
    if (scanning) return;
    setSyncing(true);
    try {
      const result = await apiPost<{ started: boolean; scan: StatsResponse['scan'] }>('/api/scan');
      showFeedback(
        result.started
          ? 'Library scan started. New titles will appear as they are indexed.'
          : 'A scan is already running. The library is still available.',
      );
      await refresh();
    } catch (cause) {
      showFeedback(cause instanceof Error ? cause.message : 'The scan could not be started.');
    } finally {
      window.setTimeout(() => setSyncing(false), 900);
    }
  }, [refresh, scanning, showFeedback]);

  const submitSearch = useCallback(
    (event?: React.FormEvent) => {
      event?.preventDefault();
      const value = search.trim();
      if (!value) return;
      saveRecent(value);
      setSearchFocused(false);
      setMobileSearch(false);
      router.push(`/search?q=${encodeURIComponent(value)}`);
    },
    [router, search],
  );

  const openSuggestion = useCallback(
    (item: TitleSummary) => {
      saveRecent(search);
      setSearchFocused(false);
      setMobileSearch(false);
      router.push(detailsHref(item));
    },
    [router, search],
  );

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#121213]/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1480px] items-center justify-between gap-2.5 px-3 sm:h-16 sm:gap-6 sm:px-8">
        {mobileSearch ? (
          <div className="flex w-full items-center gap-2.5 sm:hidden">
            <button
              type="button"
              onClick={() => {
                setMobileSearch(false);
                setSearchFocused(false);
                setSearch('');
              }}
              className="shrink-0 rounded-full bg-white/[0.08] p-1.5 text-neutral-300 transition hover:text-white active:scale-95"
              aria-label="Close search"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <form onSubmit={submitSearch} className="relative flex-1">
              <input
                ref={mobileInput}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onFocus={() => setSearchFocused(true)}
                placeholder="Search movies & series..."
                className="h-9 w-full rounded-full border border-white/20 bg-white/10 pl-9 pr-9 text-sm text-white outline-none transition placeholder:text-neutral-400 focus:border-[#e50914] focus:ring-1 focus:ring-[#e50914]/60"
                autoComplete="off"
                spellCheck={false}
                aria-label="Search movies and series"
              />
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              {suggestLoading ? (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#e50914]" />
              ) : null}
            </form>
          </div>
        ) : (
          <>
            <div className="flex min-w-0 shrink-0 items-center gap-3 sm:gap-7">
              <Logo compact />

              <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
                {navigation.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all sm:text-sm',
                      isActive(item.href)
                        ? 'bg-white/10 font-bold text-white shadow-sm'
                        : 'text-neutral-400 hover:bg-white/5 hover:text-white',
                    )}
                  >
                    {item.label}
                  </Link>
                ))}

                <div className="relative" ref={megaRef}>
                  <button
                    type="button"
                    onClick={() => setMegaOpen((open) => !open)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all sm:text-sm',
                      megaOpen
                        ? 'bg-[#e50914] text-white shadow-md shadow-red-950/40'
                        : 'border border-white/5 bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white',
                    )}
                    aria-expanded={megaOpen}
                    aria-haspopup="menu"
                  >
                    <span>Categories</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', megaOpen && 'rotate-180')} />
                  </button>

                  {megaOpen ? (
                    <div
                      className="animate-menu absolute left-0 top-11 z-50 w-[680px] rounded-2xl border border-white/10 bg-[#141416]/98 p-5 shadow-2xl backdrop-blur-xl lg:w-[760px]"
                      role="menu"
                    >
                      <div className="grid grid-cols-4 gap-5">
                        {groups.map((group) => (
                          <div key={group.name} className="min-w-0 space-y-2.5">
                            <h4 className="border-b border-white/5 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#e50914]">
                              {group.name}
                            </h4>
                            <div className="space-y-0.5">
                              {group.items.map((item) => {
                                const Icon = item.icon;
                                return (
                                  <Link
                                    key={`${group.name}-${item.href}-${item.label}`}
                                    href={item.href}
                                    onClick={() => setMegaOpen(false)}
                                    className="group flex items-center justify-between gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-neutral-300 transition hover:bg-white/10 hover:text-white"
                                    role="menuitem"
                                  >
                                    <span className="flex min-w-0 items-center gap-2">
                                      <Icon className="h-3.5 w-3.5 shrink-0 text-neutral-500 transition group-hover:text-red-400" />
                                      <span className="truncate">{item.label}</span>
                                    </span>
                                    {item.hint ? (
                                      <span className="shrink-0 font-mono text-[9px] text-neutral-500">{item.hint}</span>
                                    ) : null}
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-[11px] text-neutral-400">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'h-1.5 w-1.5 rounded-full',
                              online ? 'animate-pulse bg-emerald-400' : 'bg-amber-400',
                            )}
                          />
                          {online ? 'Local library online' : loading ? 'Connecting to library…' : 'Library offline'}
                        </span>
                        <Link
                          href="/genres"
                          onClick={() => setMegaOpen(false)}
                          className="flex items-center gap-1 font-semibold text-[#e50914] hover:underline"
                        >
                          Browse all collections
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  ) : null}
                </div>
              </nav>
            </div>

            <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => {
                  setMobileSearch(true);
                  setSearch('');
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-neutral-400 transition hover:border-white/20 hover:bg-white/[0.12] hover:text-white active:scale-95 sm:hidden"
                aria-label="Open search"
              >
                <Search className="h-4 w-4" />
              </button>

              <div ref={searchRef} className="relative hidden min-w-0 flex-1 justify-end sm:flex sm:max-w-xs lg:max-w-sm xl:max-w-md">
                <form onSubmit={submitSearch} className="group relative w-full">
                  <input
                    ref={desktopInput}
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    placeholder="Search movies, series…"
                    className="h-9 w-full rounded-full border border-white/10 bg-white/[0.06] pl-10 pr-10 text-sm text-white shadow-inner outline-none transition-all duration-200 placeholder:text-neutral-500 hover:border-white/20 hover:bg-white/[0.09] focus:border-[#e50914]/70 focus:bg-[#1a1a1e] focus:ring-2 focus:ring-[#e50914]/20"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Search movies and series"
                  />
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500 transition-colors group-focus-within:text-[#e50914]/70" />
                  <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    {suggestLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#e50914]" /> : null}
                    {search && !suggestLoading ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearch('');
                          setSearchFocused(true);
                          desktopInput.current?.focus();
                        }}
                        className="rounded-full p-0.5 text-neutral-400 transition hover:bg-white/10 hover:text-white"
                        title="Clear search"
                        aria-label="Clear search"
                      >
                        <span className="text-xs leading-none">✕</span>
                      </button>
                    ) : null}
                  </div>
                </form>

                {dropdownOpen ? (
                  <div className="animate-menu absolute left-0 right-0 top-11 z-50 max-h-[70vh] w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#161618]/98 shadow-2xl backdrop-blur-xl">
                    {suggestions.length === 0 ? (
                      <div className="p-4 text-center text-xs text-neutral-400">
                        {suggestLoading ? 'Searching your library…' : `No titles found for “${debounced}”`}
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1 p-2">
                          {suggestions.map((item) => (
                            <SearchSuggestion key={item.id} item={item} onSelect={openSuggestion} />
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => submitSearch()}
                          className="flex w-full items-center justify-center gap-1.5 bg-[#19191c] px-4 py-2.5 text-center text-xs font-semibold text-neutral-300 transition hover:bg-white/5 hover:text-white"
                        >
                          View all results for “{search.trim()}”
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="hidden shrink-0 items-center gap-2 text-xs text-neutral-400 lg:flex">
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    loading ? 'bg-white/40' : online ? 'animate-pulse bg-emerald-400' : 'bg-amber-400',
                  )}
                />
                <span className="font-semibold text-neutral-300">
                  {statusPending ? 'Connecting…' : online ? 'Server online' : 'Media server offline'}
                </span>
              </div>

              <Link
                href="/watchlist"
                className={cn(
                  'hidden h-9 w-9 items-center justify-center rounded-full border transition-all duration-200 hover:bg-white/[0.08] hover:text-white md:flex',
                  isActive('/watchlist')
                    ? 'border-[#e50914]/40 bg-[#e50914]/10 text-red-300'
                    : 'border-white/10 bg-white/[0.05] text-neutral-400',
                )}
                aria-label="My watchlist"
                title="My watchlist"
              >
                <Bookmark className="h-3.5 w-3.5" />
              </Link>

              <Link
                href="/history"
                className={cn(
                  'hidden h-9 w-9 items-center justify-center rounded-full border transition-all duration-200 hover:bg-white/[0.08] hover:text-white md:flex',
                  isActive('/history')
                    ? 'border-[#e50914]/40 bg-[#e50914]/10 text-red-300'
                    : 'border-white/10 bg-white/[0.05] text-neutral-400',
                )}
                aria-label="Watch history"
                title="Watch history"
              >
                <Clock3 className="h-3.5 w-3.5" />
              </Link>

              <button
                type="button"
                onClick={() => void syncLibrary()}
                className={cn(
                  'hidden h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-neutral-400 transition-all duration-200 hover:bg-white/[0.08] hover:text-white md:flex',
                  scanning && 'border-[#e50914]/30 text-red-300',
                )}
                aria-label={scanning ? 'Scanning library' : 'Scan library'}
                title={scanning ? 'Scanning library…' : 'Scan library'}
                disabled={scanning}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', scanning && 'animate-spin')} />
              </button>
            </div>
          </>
        )}
      </div>

      {feedback ? (
        <div className="mx-auto w-full max-w-[1480px] px-3 pb-2 sm:px-8">
          <p
            role="status"
            className="rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-[0.68rem] font-medium text-white/60 backdrop-blur-md"
          >
            {feedback}
          </p>
        </div>
      ) : null}

      {/* Mobile: full-screen suggestions below the sticky header */}
      {mobileSearch && dropdownOpen ? (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40 overflow-y-auto overscroll-contain bg-[#0e0e0f]/98 backdrop-blur-xl sm:hidden">
          {suggestions.length > 0 ? (
            <div className="space-y-1 p-3">
              {suggestions.map((item) => (
                <SearchSuggestion key={item.id} item={item} onSelect={openSuggestion} />
              ))}
              <button
                type="button"
                onClick={() => submitSearch()}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/5 px-4 py-2.5 text-xs font-semibold text-neutral-300 transition hover:bg-white/10 hover:text-white"
              >
                View all results for “{search.trim()}”
              </button>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-neutral-500">
              {suggestLoading ? 'Searching your library…' : `No titles found for “${debounced}”`}
            </div>
          )}
        </div>
      ) : null}
    </header>
  );
}

function SearchSuggestion({ item, onSelect }: { item: TitleSummary; onSelect: (item: TitleSummary) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="group flex w-full items-center justify-between gap-3 rounded-xl p-2 text-left transition hover:bg-white/5"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="relative h-[52px] w-9 shrink-0 overflow-hidden rounded-md border border-white/5 bg-neutral-800">
          {item.posterUrl ? (
            <img
              src={item.posterUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : item.kind === 'series' ? (
            <Tv className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-neutral-600" />
          ) : (
            <Film className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-neutral-600" />
          )}
        </span>

        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold text-white transition group-hover:text-[#e50914] sm:text-sm">
            {item.title}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-neutral-400">
            <span>{metaLine(item)}</span>
            {item.rating ? (
              <span className="flex items-center gap-0.5 text-amber-400">
                <Star className="h-3 w-3 fill-amber-400" />
                {item.rating.toFixed(1)}
              </span>
            ) : null}
          </span>
        </span>
      </span>

      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-600 transition group-hover:translate-x-0.5 group-hover:text-neutral-300" />
    </button>
  );
}
