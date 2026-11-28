'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronRight,
  Film,
  Home,
  LayoutGrid,
  Loader2,
  RefreshCw,
  Search,
  Tv,
  X,
} from 'lucide-react';
import type { StatsResponse } from '@/lib/media/types';
import { apiPost } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { buildNavGroups } from '@/components/layout/nav-groups';
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock';
import { cn } from '@/lib/utils';

export default function MobileNav() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { data, loading, refresh } = useApi<StatsResponse>('/api/stats');
  const groups = useMemo(() => buildNavGroups(data), [data]);
  const online = Boolean(data) && data?.server?.reachable !== false;
  const statusPending = loading || (Boolean(data) && data?.server?.reachable == null);
  const scanning = Boolean(data?.scan?.running) || syncing;
  const stats = data?.stats;

  useBodyScrollLock(sheetOpen);

  // Settle the status label if the first stats response raced the probe.
  useEffect(() => {
    if (!data || data.server?.reachable != null) return;
    const timer = window.setTimeout(() => void refresh(), 2800);
    return () => window.clearTimeout(timer);
  }, [data, refresh]);

  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSheetOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sheetOpen]);

  const scanLibrary = useCallback(async () => {
    if (scanning) return;
    setSyncing(true);
    try {
      const result = await apiPost<{ started: boolean }>('/api/scan');
      setNotice(result.started ? 'Library scan started.' : 'A scan is already running.');
      await refresh();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'The scan could not be started.');
    } finally {
      window.setTimeout(() => setSyncing(false), 800);
    }
  }, [refresh, scanning]);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const otherActive = !isActive('/') && !isActive('/movies') && !isActive('/series');

  return (
    <>
      <nav
        aria-label="Mobile bottom navigation"
        className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+12px)] z-40 mx-auto w-[calc(100%-2rem)] max-w-sm md:hidden"
      >
        <div className="flex items-center justify-around rounded-full border border-white/15 bg-[#141417]/80 p-1.5 shadow-nav ring-1 ring-black/40 backdrop-blur-2xl backdrop-saturate-150">
          <BottomTab href="/" label="Home" icon={Home} active={isActive('/')} />
          <BottomTab href="/movies" label="Movies" icon={Film} active={isActive('/movies')} />
          <BottomTab href="/series" label="Series" icon={Tv} active={isActive('/series')} />

          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className={cn(
              'relative flex flex-col items-center justify-center rounded-full px-3.5 py-1.5 transition-all duration-200 active:scale-90',
              sheetOpen || otherActive ? 'bg-white/[0.12] text-white shadow-sm' : 'text-neutral-400 hover:text-white',
            )}
            aria-expanded={sheetOpen}
            aria-label="Open all categories"
          >
            <LayoutGrid
              className={cn(
                'h-[18px] w-[18px] transition-transform',
                (sheetOpen || otherActive) && 'scale-110 text-[#e50914]',
              )}
            />
            <span
              className={cn(
                'mt-0.5 text-[10px] font-medium tracking-tight',
                (sheetOpen || otherActive) && 'font-bold text-white',
              )}
            >
              Categories
            </span>
            {sheetOpen || otherActive ? (
              <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#e50914] shadow-[0_0_6px_#e50914]" />
            ) : null}
          </button>
        </div>
      </nav>

      {sheetOpen ? (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end overscroll-contain md:hidden">
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            className="fixed inset-0 touch-none bg-black/80 backdrop-blur-sm"
            aria-label="Close categories"
          />
          <div className="animate-sheet relative z-10 flex max-h-[85vh] flex-col rounded-t-[32px] border-t border-white/15 bg-[#141417]/95 shadow-2xl backdrop-blur-2xl">
            <div className="shrink-0 border-b border-white/10 p-4 pb-2">
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20" />
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-bold text-white">
                    <LayoutGrid className="h-4 w-4 text-[#e50914]" />
                    Browse all categories
                  </h3>
                  <p className="mt-0.5 text-xs text-neutral-400">LocalStream media library</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="rounded-full bg-white/5 p-2 text-neutral-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="Close categories sheet"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-6 overflow-y-auto overscroll-contain p-4 pb-10">
              {groups.map((group) => (
                <div key={group.name} className="space-y-2.5">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#e50914]">
                    <span className="h-3 w-1 rounded-sm bg-[#e50914]" />
                    {group.name}
                  </h4>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href.split('?')[0]);
                      return (
                        <Link
                          key={`${group.name}-${item.href}-${item.label}`}
                          href={item.href}
                          onClick={() => setSheetOpen(false)}
                          className={cn(
                            'flex items-center justify-between rounded-2xl border p-3 text-left transition active:scale-[0.98]',
                            active
                              ? 'border-[#e50914] bg-[#e50914] text-white shadow-lg shadow-red-950/50'
                              : 'border-white/5 bg-[#1f1f23] text-neutral-200 hover:bg-[#25252b]',
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span
                              className={cn(
                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                                active ? 'bg-white/20 text-white' : 'bg-white/5 text-red-500',
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-bold">{item.label}</span>
                              <span
                                className={cn(
                                  'mt-0.5 block truncate font-mono text-[10px]',
                                  active ? 'text-white/80' : 'text-neutral-400',
                                )}
                              >
                                {item.hint ? `${item.hint} titles` : 'Local library'}
                              </span>
                            </span>
                          </span>
                          <ChevronRight className={cn('h-4 w-4 shrink-0', active ? 'text-white' : 'text-neutral-500')} />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 p-3">
                <span className="flex items-center gap-2 text-[11px] text-neutral-400">
                  <span className={cn('h-2 w-2 rounded-full', online ? 'bg-emerald-400' : 'bg-amber-400')} />
                  {statusPending ? 'Connecting…' : online ? 'Server online' : 'Media server offline'}
                  {stats?.titles ? <span className="text-neutral-500">· {stats.titles.toLocaleString()} titles</span> : null}
                </span>
                <button
                  type="button"
                  onClick={() => void scanLibrary()}
                  disabled={scanning}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  {scanning ? 'Scanning' : 'Scan'}
                </button>
              </div>

              {notice ? (
                <p className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-neutral-400">{notice}</p>
              ) : null}

              <Link
                href="/search"
                onClick={() => setSheetOpen(false)}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-semibold text-neutral-300 transition hover:bg-white/10 hover:text-white"
              >
                <Search className="h-3.5 w-3.5" />
                Search the whole library
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function BottomTab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'relative flex flex-col items-center justify-center rounded-full px-3.5 py-1.5 transition-all duration-200 active:scale-90',
        active ? 'bg-white/[0.12] text-white shadow-sm' : 'text-neutral-400 hover:text-white',
      )}
    >
      <Icon className={cn('h-[18px] w-[18px] transition-transform', active && 'scale-110 text-[#e50914]')} />
      <span className={cn('mt-0.5 text-[10px] font-medium tracking-tight', active && 'font-bold text-white')}>
        {label}
      </span>
      {active ? (
        <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#e50914] shadow-[0_0_6px_#e50914]" />
      ) : null}
    </Link>
  );
}
