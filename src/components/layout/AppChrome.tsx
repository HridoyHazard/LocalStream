'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import RouteProgress from '@/components/layout/RouteProgress';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import MobileNav from '@/components/layout/MobileNav';
import BackToTop from '@/components/layout/BackToTop';
import { cn } from '@/lib/utils';

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const immersive = pathname.startsWith('/watch');

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-black"
      >
        Skip to content
      </a>
      <Suspense fallback={null}>
        <RouteProgress />
      </Suspense>
      {!immersive && <Navbar />}
      <main id="main-content" className={cn('flex min-h-screen flex-col', immersive && 'min-h-screen')}>
        <div key={pathname} className={immersive ? 'flex-1' : 'page-enter flex-1'}>
          {children}
        </div>
      </main>
      {!immersive && <Footer />}
      {!immersive && <MobileNav />}
      {!immersive && <BackToTop />}
    </>
  );
}
