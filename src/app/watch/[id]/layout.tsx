import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Now playing',
  description: 'Streaming directly from your local media server.',
};

export default function WatchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
