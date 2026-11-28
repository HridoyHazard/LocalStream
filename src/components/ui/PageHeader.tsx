import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  statValue?: string | number;
  statLabel?: string;
  children?: ReactNode;
  className?: string;
}

/**
 * Page opener. The title is set as a theatrical title card; the count sits on
 * the title's baseline so it reads as part of the name ("Movies 1,284 films").
 */
export default function PageHeader({
  eyebrow,
  title,
  description,
  statValue,
  statLabel,
  children,
  className,
}: PageHeaderProps) {
  return (
    <section className={cn('border-b border-white/[0.08] bg-[#0d0d0e]', className)}>
      <div className="container-page py-8 sm:py-11">
        <p className="eyebrow">{eyebrow}</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <h1 className="font-display text-[clamp(3rem,8vw,5.5rem)] font-normal leading-[0.9] tracking-[0.015em] text-white">
            {title}
          </h1>
          {statValue !== undefined && (
            <p className="text-[0.82rem] font-semibold tabular-nums text-white/45">
              <span className="text-white/80">{statValue}</span> {(statLabel ?? 'Titles indexed').toLowerCase()}
            </p>
          )}
        </div>
        <p className="mt-4 max-w-[60ch] text-pretty text-[0.88rem] leading-relaxed text-neutral-400">{description}</p>
        {children && <div className="mt-5">{children}</div>}
      </div>
    </section>
  );
}
