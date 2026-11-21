import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden rounded-[1.5rem] border border-white/[0.07] bg-white/[0.018] px-6 py-16 text-center sm:py-20',
        className,
      )}
    >
      <div className="ambient-ring left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 opacity-60" />
      <div className="ambient-ring left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 opacity-40" />
      <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] text-white/60 shadow-inset">
        <Icon className="h-6 w-6" strokeWidth={1.6} />
        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_rgba(255,59,78,0.8)]" />
      </div>
      <h3 className="relative text-lg font-bold tracking-tight text-white">{title}</h3>
      <p className="relative mt-2 max-w-md text-sm leading-relaxed text-white/45">{description}</p>
      {action && <div className="relative mt-6">{action}</div>}
    </div>
  );
}
