'use client';

import Link from 'next/link';
import { TriangleAlert, ArrowLeft, RotateCcw } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[30rem] w-[52rem] -translate-x-1/2 rounded-full bg-accent/[0.07] blur-[120px]" />

      <div className="container-page relative flex min-h-[78vh] flex-col items-center justify-center py-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent-300">
          <TriangleAlert className="h-6 w-6" strokeWidth={1.6} />
        </span>

        <p className="eyebrow eyebrow-line mt-6">Playback interrupted</p>
        <h1 className="mt-4 max-w-xl text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Something went wrong on this screen.
        </h1>
        <p className="mt-3 max-w-md text-[0.82rem] leading-relaxed text-white/40">
          The page hit an unexpected error. Your library and playback progress are safe — try again, or return to
          the library.
        </p>
        {error.message && (
          <p className="mt-4 max-w-lg rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 font-mono text-[0.62rem] text-white/25">
            {error.message}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={reset} className="btn btn-primary">
            <RotateCcw className="h-4 w-4" />
            Try again
          </button>
          <Link href="/" className="btn btn-ghost">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
