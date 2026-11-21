import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TV Series',
  description: 'Browse every series and episode available on your local media server.',
};

export default function SeriesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
