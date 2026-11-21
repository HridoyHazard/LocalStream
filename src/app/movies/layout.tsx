import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Movies',
  description: 'Browse every film available on your local media server.',
};

export default function MoviesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
