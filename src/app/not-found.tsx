import Link from 'next/link';
import { ArrowLeft, Compass, Film } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[34rem] w-[60rem] -translate-x-1/2 rounded-full bg-accent/[0.06] blur-[120px]" />
      <div className="hero-grid !opacity-[0.035]" />

      <div className="container-page relative flex min-h-[78vh] flex-col items-center justify-center py-24 text-center">
        <div className="relative">
          <p className="display-title select-none text-[clamp(8rem,24vw,18rem)] leading-[0.75] text-white/[0.045]">404</p>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent-300">
              <Compass className="h-6 w-6" strokeWidth={1.6} />
            </span>
          </div>
        </div>

        <p className="eyebrow eyebrow-line mt-6">Scene not found</p>
        <h1 className="mt-4 max-w-xl text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl">
          This page isn&apos;t in your library.
        </h1>
        <p className="mt-3 max-w-md text-[0.82rem] leading-relaxed text-white/40">
          The link may be old or the title may have been removed from your media server. Head back to the library
          and pick something else to watch.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="btn btn-primary">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
          <Link href="/movies" className="btn btn-ghost">
            <Film className="h-4 w-4" />
            Browse movies
          </Link>
        </div>
      </div>
    </div>
  );
}
