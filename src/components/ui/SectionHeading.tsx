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

/** Title, a hairline that shows how wide the row is, then the row's action. */
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
    <div className={cn('mb-4 sm:mb-5', className)}>
      {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
      <div className="flex items-baseline gap-4">
        <h2 className="section-heading shrink-0">{title}</h2>
        {count && <span className="hidden shrink-0 text-[0.74rem] font-semibold text-white/35 sm:inline">{count}</span>}
        <span aria-hidden="true" className="h-px min-w-6 flex-1 self-center bg-white/[0.09]" />
        {children}
        {!children && actionLabel && actionHref && (
          <Link
            href={actionHref}
            className="group inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-neutral-400 transition-colors hover:text-white"
          >
            {actionLabel}
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
