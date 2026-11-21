import Link from 'next/link';
import { cn } from '@/lib/utils';

interface LogoProps {
  href?: string;
  className?: string;
  compact?: boolean;
  showTagline?: boolean;
}

export default function Logo({ href = '/', className, compact = false, showTagline = false }: LogoProps) {
  return (
    <Link
      href={href}
      aria-label="LocalStream home"
      className={cn('group flex shrink-0 items-center gap-2', className)}
    >
      <span className={cn('flex flex-col', compact && 'gap-0.5')}>
        <span
          className={cn(
            'font-sans font-black leading-none tracking-[-0.04em] text-white transition-colors group-hover:text-neutral-200',
            compact ? 'text-[1.15rem] sm:text-[1.35rem]' : 'text-xl sm:text-2xl',
          )}
        >
          LOCAL<span className="text-[#e50914]">STREAM</span>
        </span>
        {showTagline && (
          <span className="text-[0.4rem] font-bold uppercase tracking-[0.24em] text-white/35">
            Personal cinema
          </span>
        )}
      </span>
      {!compact && (
        <span className="hidden rounded border border-red-500/30 bg-red-600/20 px-1.5 py-0.5 font-mono text-[0.55rem] font-bold uppercase tracking-wider text-red-400 xl:inline-block">
          LAN
        </span>
      )}
    </Link>
  );
}
