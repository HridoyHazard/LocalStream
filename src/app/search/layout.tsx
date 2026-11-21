import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search every movie and series in your local media library.',
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
