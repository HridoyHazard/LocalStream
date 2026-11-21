import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  count?: string;
  actionLabel?: string;
  actionHref?: string;
  children?: ReactNode;
  className?: string;
}

export default function SectionHeading({
  eyebrow,
  title,
  count,
  actionLabel,
  actionHref,
  children,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn('mb-4 flex items-end justify-between gap-4 sm:mb-5', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 shrink-0 rounded-sm bg-[#e50914]" />
          <h2 className="truncate text-base font-bold tracking-tight text-white sm:text-lg">{title}</h2>
          {count && (
            <span className="hidden rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-300 sm:inline">
              {count}
            </span>
          )}
        </div>
      </div>

      {children}

      {!children && actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-neutral-400 transition hover:bg-white/5 hover:text-white"
        >
          {actionLabel}
          <ArrowRight className="h-3.5 w-3.5 text-[#e50914] transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
