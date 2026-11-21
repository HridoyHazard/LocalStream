import Link from 'next/link';

const links = [
  { label: 'Home', href: '/' },
  { label: 'Movies', href: '/movies' },
  { label: 'TV Shows', href: '/series' },
  { label: 'Genres', href: '/genres' },
  { label: 'Recently added', href: '/recently-added' },
  { label: 'My list', href: '/watchlist' },
  { label: 'History', href: '/history' },
];

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-white/10 bg-[#121213] px-4 py-6 pb-28 text-center text-xs text-neutral-400 sm:px-8 sm:pb-6">
      <p className="font-semibold tracking-wide text-white">
        LOCAL<span className="text-[#e50914]">STREAM</span> • Local high-speed cinema
      </p>
      <p className="mt-1 text-[11px] text-neutral-400">
        Every film and episode streams directly from your own media server — no cloud, no accounts, no outside traffic.
      </p>

      <nav className="mx-auto mt-4 flex max-w-3xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[11px]">
        {links.map((link, index) => (
          <span key={link.href} className="inline-flex items-center gap-3">
            {index > 0 ? <span className="h-1 w-1 rounded-full bg-white/15" aria-hidden="true" /> : null}
            <Link href={link.href} className="font-medium text-neutral-400 transition-colors hover:text-white">
              {link.label}
            </Link>
          </span>
        ))}
      </nav>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[10px] text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Local network
        </span>
        <span className="text-white/15">•</span>
        <span>Original quality</span>
        <span className="text-white/15">•</span>
        <span>Private by design</span>
      </div>

      <p className="mt-3 text-[10px] text-neutral-600">
        © {new Date().getFullYear()} LocalStream. Personal cinema, privately streamed.
      </p>
    </footer>
  );
}
