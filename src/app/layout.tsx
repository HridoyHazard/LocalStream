import type { Metadata, Viewport } from 'next';
import AppChrome from '@/components/layout/AppChrome';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
  title: {
    default: 'LocalStream — Your personal cinema',
    template: '%s · LocalStream',
  },
  description:
    'A private, cinematic streaming experience for your local ISP media library. Browse movies and series, resume instantly, and play in original quality — no internet required.',
  applicationName: 'LocalStream',
  keywords: ['local streaming', 'ISP media server', 'movies', 'TV series', 'personal cinema', 'local network'],
  openGraph: {
    title: 'LocalStream — Your personal cinema',
    description: 'Your entire media library, beautifully streamed from your local network.',
    type: 'website',
    siteName: 'LocalStream',
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#070709',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body id="top">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
