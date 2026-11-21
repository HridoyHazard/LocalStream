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
    <section className={cn('relative overflow-hidden border-b border-white/10 bg-[#0e0e0f]', className)}>
      <div className="pointer-events-none absolute -left-32 -top-40 h-80 w-80 rounded-full bg-[#e50914]/[0.08] blur-[100px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_85%_0%,rgba(255,255,255,0.035),transparent_60%)]" />

      <div className="container-page relative py-7 sm:py-9">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow eyebrow-line">{eyebrow}</p>
            <h1 className="mt-2.5 text-[1.9rem] font-bold leading-[1.05] tracking-[-0.03em] text-white sm:text-[2.5rem]">
              {title}
            </h1>
            <p className="mt-2 max-w-xl text-pretty text-[0.82rem] leading-relaxed text-neutral-400 sm:text-[0.88rem]">
              {description}
            </p>
            {children && <div className="mt-5">{children}</div>}
          </div>

          {statValue !== undefined && (
            <div className="hidden shrink-0 items-end gap-3 pb-1 lg:flex">
              <span className="h-px w-10 bg-gradient-to-r from-transparent to-white/25" />
              <div className="text-right">
                <p className="text-[3.2rem] font-bold leading-[0.85] tabular-nums tracking-[-0.04em] text-white/20">
                  {statValue}
                </p>
                <p className="mt-1.5 text-[0.58rem] font-bold uppercase tracking-[0.2em] text-neutral-500">
                  {statLabel ?? 'Titles indexed'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
