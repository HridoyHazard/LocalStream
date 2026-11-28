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
            'font-display font-normal leading-none tracking-[0.05em] text-white',
            compact ? 'text-[1.55rem] sm:text-[1.85rem]' : 'text-[2rem] sm:text-[2.3rem]',
          )}
        >
          LOCAL<span className="text-[#e50914]">STREAM</span>
        </span>
        {showTagline && <span className="text-[0.7rem] font-semibold text-white/40">Your own cinema</span>}
      </span>
      {!compact && (
        <span className="hidden rounded border border-white/15 px-1.5 py-0.5 text-[0.62rem] font-bold text-white/50 xl:inline-block">
          On your network
        </span>
      )}
    </Link>
  );
}
