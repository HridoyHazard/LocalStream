import { cn } from '@/lib/utils';

interface StatusPillProps {
  online: boolean;
  loading?: boolean;
  label?: string;
  className?: string;
  compact?: boolean;
}

export default function StatusPill({ online, loading, label, className, compact }: StatusPillProps) {
  const text = loading ? 'Syncing' : label ?? (online ? 'Server online' : 'Library offline');

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] font-semibold text-white/55',
        compact ? 'h-7 px-2.5 text-[0.6rem]' : 'h-8 px-3 text-[0.64rem]',
        className,
      )}
      title={
        online
          ? 'Connected to the local media server'
          : 'The media server is unreachable — the indexed library is still available'
      }
    >
      <span className="relative flex h-1.5 w-1.5">
        {!loading && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-70',
              online ? 'animate-ping bg-emerald-400' : 'bg-amber-400',
            )}
          />
        )}
        <span
          className={cn(
            'relative inline-flex h-1.5 w-1.5 rounded-full',
            loading ? 'bg-white/40' : online ? 'bg-emerald-400' : 'bg-amber-400',
          )}
        />
      </span>
      {text}
    </span>
  );
}
