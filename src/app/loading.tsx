import Logo from '@/components/ui/Logo';

export default function Loading() {
  return (
    <div className="container-page page-shell">
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <Logo compact className="opacity-80" />
        <div className="relative mt-8 flex h-12 w-12 items-center justify-center">
          <span className="absolute inset-0 animate-spin rounded-full border border-white/10 border-t-accent" />
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_12px_rgba(255,59,78,0.8)]" />
        </div>
        <p className="mt-5 text-[0.62rem] font-bold uppercase tracking-[0.24em] text-white/30">Opening your library</p>
        <div className="mt-3 h-px w-24 overflow-hidden rounded-full bg-white/[0.06]">
          <span className="block h-full w-1/2 animate-pulse bg-accent/60" />
        </div>
      </div>
    </div>
  );
}
